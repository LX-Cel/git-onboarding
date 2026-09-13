"""Offline code-host workflows: real repos, explicit reviews and protected integration."""
import json

IDS = {'fork-pr', 'pr-conflict', 'pr-squash', 'pr-rebase', 'branch-protection'}
PROTECTION = '''#!/bin/sh
while read old new ref; do
  if [ "$ref" = refs/heads/main ] && [ "$GO_PR_MERGE" != 1 ]; then
    echo "Protected main: submit a PR and pass review and required checks." >&2
    exit 1
  fi
done
'''


def settings(record):
    """Fill additive fields when resuming a pre-preview PR, without resetting its repos."""
    host = record['hosting']
    lesson = record['lesson']
    defaults = {'requireChecks': lesson != 'fork-pr', 'canAdvance': lesson == 'pr-conflict',
                'upstreamAdvanced': False, 'protected': lesson == 'branch-protection',
                'requiredStrategy': {'pr-squash': 'squash', 'pr-rebase': 'rebase'}.get(lesson, 'merge')}
    for key, value in defaults.items():
        host.setdefault(key, value)
    return host


def setup(e, repo, base, lesson, mode, record):
    upstream = base / 'upstream.git'
    e.git(base, 'init', '--bare', '-b', 'main', str(upstream))
    e.git(repo, 'push', str(upstream), 'main')
    maintainer = base / 'maintainer'
    e.git(base, 'clone', str(upstream), str(maintainer))
    e.config(maintainer)
    (maintainer / 'upstream.txt').write_text('team-update\n')
    record['upstream'] = e.commit(maintainer, '维护者更新主线')
    e.git(maintainer, 'push', 'origin', 'main')
    record['hosting'] = {'forked': False, 'pr': None, 'requireChecks': lesson != 'fork-pr',
                         'canAdvance': lesson == 'pr-conflict', 'upstreamAdvanced': False,
                         'requiredStrategy': {'pr-squash': 'squash', 'pr-rebase': 'rebase'}.get(lesson, 'merge'),
                         'protected': lesson == 'branch-protection'}
    if lesson == 'branch-protection':
        hook = upstream / 'hooks/pre-receive'
        hook.write_text(PROTECTION)
        hook.chmod(0o755)


def assess(e, repo, base, record):
    origin, upstream = base / 'origin.git', base / 'upstream.git'
    host = settings(record)
    pr = host.get('pr') or {}
    upstream_tip = e.git(upstream, 'rev-parse', 'main')
    origin_tip = e.git(origin, 'rev-parse', 'main', check=False) if origin.exists() else ''
    def remote_is(name, path):
        raw = e.git(repo, 'remote', 'get-url', name, check=False)
        return bool(raw) and (repo / raw).resolve() == path.resolve()
    checks = [
        ('个人 origin 与上游 upstream 指向不同仓库', host['forked'] and remote_is('origin', origin) and remote_is('upstream', upstream)),
        ('功能分支的 PR 已通过评审并合并到上游', pr.get('status') == 'merged' and pr.get('review') == 'approved' and e.text_at(upstream, 'main', 'feature.txt') == record['value'] and e.text_at(upstream, 'main', 'tests.txt') == 'tests=pass'),
        ('保留上游原有提交', e.ancestor(upstream, record['upstream'], 'main')),
        ('个人与本地主线已同步合并结果', pr.get('status') == 'merged' and origin_tip == upstream_tip and e.git(repo, 'rev-parse', 'main') == upstream_tip and e.git(repo, 'branch', '--show-current') == 'main')]
    if host['requireChecks']:
        checks.append(('合并的版本已通过必需检查', pr.get('checks') == 'passed' and pr.get('checkedHead') == pr.get('mergedSource')))
    if record['lesson'] == 'pr-conflict':
        checks.append(('处理了上游更新并保留评审期间的队友工作', host['upstreamAdvanced'] and e.text_at(upstream, 'main', 'team-review.txt') == 'review=preserved'))
    if record['lesson'] in {'pr-squash', 'pr-rebase'}:
        strategy = host['requiredStrategy']
        base_head = pr.get('mergedBase')
        count = e.git(upstream, 'rev-list', '--count', f'{base_head}..main', check=False) if base_head else ''
        checks.append(('上游采用要求的合并方式且历史形状正确', pr.get('strategy') == strategy and base_head and count == str(1 if strategy == 'squash' else pr.get('sourceCount')) and not e.git(upstream, 'rev-list', '--merges', f'{base_head}..main', check=False)))
    if host['protected']:
        hook = upstream / 'hooks/pre-receive'
        checks.append(('上游 main 分支保护仍然有效', hook.is_file() and hook.read_text() == PROTECTION and bool(hook.stat().st_mode & 0o111)))
    return checks


def view(e, repo, base, record):
    if 'hosting' not in record:
        return None
    result = json.loads(json.dumps(settings(record)))
    result.update(origin=str(base / 'origin.git'), upstream=str(base / 'upstream.git'))
    pr = result.get('pr')
    if pr:
        origin = base / 'origin.git'
        head = e.git(origin, 'rev-parse', '--verify', 'refs/heads/' + pr['branch'], check=False)
        base_head = e.git(base / 'upstream.git', 'rev-parse', 'main')
        pr['currentHead'] = head
        pr['staleReview'] = head != pr.get('reviewedHead') or (pr.get('reviewedBase') is not None and base_head != pr.get('reviewedBase'))
        pr['staleChecks'] = head != pr.get('checkedHead') or base_head != pr.get('checkedBase')
        pr['diff'] = pr.get('mergedDiff') or (e.git(origin, 'diff', '--no-ext-diff', '--no-textconv', f'{pr.get("baseAtOpen", record["upstream"])}...{head}', check=False)[:16000] if head else '')
    return result


def prepare_merge(e, base, head):
    maintainer = base / 'maintainer'
    e.git(maintainer, 'fetch', 'origin')
    # This repository is the exercise's reserved hosting worker, never the learner's workspace.
    e.git(maintainer, 'switch', 'main')
    e.git(maintainer, 'reset', '--hard', 'origin/main')
    base_head = e.git(maintainer, 'rev-parse', 'HEAD')
    e.git(maintainer, 'fetch', str(base / 'origin.git'), head)
    merged = e.git(maintainer, 'merge-tree', '--write-tree', base_head, head, check=False).splitlines()
    return maintainer, base_head, merged[0] if len(merged) == 1 else None


def check(e, base, record, head):
    worker, base_head, tree = prepare_merge(e, base, head)
    passed = bool(tree) and e.text_at(worker, tree, 'feature.txt') == record['value'] and e.text_at(worker, tree, 'tests.txt') == 'tests=pass'
    record['hosting']['pr'].update(checks='passed' if passed else 'failed', checkedHead=head, checkedBase=base_head,
        checkMessage='合并结果的练习检查通过。' if passed else ('PR 与当前上游冲突，请先在本地同步并解决。' if not tree else '合并结果未满足功能和测试要求，请修正后推送。'))


def action(e, repo, base, record, request):
    if record['lesson'] not in IDS:
        raise ValueError('本课程没有托管平台操作')
    host = settings(record)
    origin, upstream = base / 'origin.git', base / 'upstream.git'
    operation = request.get('operation')
    if operation == 'fork':
        if not host['forked']:
            e.git(base, 'clone', '--bare', str(upstream), str(origin))
            host['forked'] = True
    elif operation == 'create':
        if not host['forked']:
            raise ValueError('请先 Fork 上游仓库')
        if host.get('pr'):
            raise ValueError('本练习已有 PR，请向同一功能分支追加提交')
        branch, title = request.get('branch', ''), request.get('title', '')
        if not isinstance(branch, str) or not branch.startswith('feature/') or len(branch) > 120:
            raise ValueError('请选择已推送的 feature/ 功能分支')
        e.git(origin, 'check-ref-format', 'refs/heads/' + branch)
        if not isinstance(title, str) or not title.strip() or len(title) > 160:
            raise ValueError('请填写 1–160 字的 PR 标题')
        head = e.git(origin, 'rev-parse', '--verify', 'refs/heads/' + branch)
        if not e.ancestor(origin, record['upstream'], head):
            raise ValueError('功能分支尚未整合 upstream/main，请先 fetch 并 rebase 或 merge')
        if not e.git(origin, 'diff', '--name-only', record['upstream'], head):
            raise ValueError('功能分支没有可提交的改动；请先提交并推送到 origin')
        host['pr'] = dict(number=1, title=title.strip(), branch=branch, base='main', status='open', review='pending',
                          createdHead=head, baseAtOpen=e.git(upstream, 'rev-parse', 'main'), reviewedHead=None,
                          checks='pending', message='PR 已创建。请请求评审。')
    elif operation == 'advance':
        if not host['canAdvance'] or host['upstreamAdvanced'] or not host.get('pr') or host['pr']['status'] != 'open':
            raise ValueError('当前场景不能再推进上游事件')
        worker = base / 'maintainer'
        e.git(worker, 'fetch', 'origin')
        e.git(worker, 'reset', '--hard', 'origin/main')
        (worker / 'feature.txt').write_text('team-draft\n')
        (worker / 'team-review.txt').write_text('review=preserved\n')
        record['upstream'] = e.commit(worker, 'PR 评审期间的上游更新')
        e.git(worker, 'push', 'origin', 'main')
        host['upstreamAdvanced'] = True
        host['pr']['message'] = '上游已更新。原来的评审与检查已过期，先运行必需检查查看原因，再同步本地分支。'
    elif operation in {'review', 'check', 'merge'}:
        pr = host.get('pr')
        if not pr or pr['status'] != 'open':
            raise ValueError('请先创建尚未合并的 PR')
        head = e.git(origin, 'rev-parse', '--verify', 'refs/heads/' + pr['branch'])
        base_head = e.git(upstream, 'rev-parse', 'main')
        if operation == 'review':
            approved = e.text_at(origin, head, 'feature.txt') == record['value'] and e.text_at(origin, head, 'tests.txt') == 'tests=pass'
            pr.update(review='approved' if approved else 'changes_requested', reviewedHead=head, reviewedBase=base_head,
                      message='评审通过。请确认必需检查和合并方式。' if approved else f'请求修改：feature.txt 应为 {record["value"]}，并新增 tests.txt 内容 tests=pass。修改后推送同一分支，再请求评审。')
            if not host['requireChecks']:
                check(e, base, record, head)
        elif operation == 'check':
            check(e, base, record, head)
        else:
            strategy = request.get('strategy', 'merge')
            if strategy != host['requiredStrategy']:
                raise ValueError('本关要求使用 ' + host['requiredStrategy'] + ' 合并方式')
            if host['canAdvance'] and not host['upstreamAdvanced']:
                raise ValueError('本关需要先模拟上游更新，再解决评审期间的冲突')
            if pr['review'] != 'approved' or pr['reviewedHead'] != head or pr.get('reviewedBase', base_head) != base_head:
                raise ValueError('当前提交或上游基线尚未通过评审，请重新评审')
            if host['requireChecks'] and (pr.get('checks') != 'passed' or pr.get('checkedHead') != head or pr.get('checkedBase') != base_head):
                raise ValueError('当前提交与上游基线必须通过最新必需检查')
            worker, current_base, tree = prepare_merge(e, base, head)
            if current_base != base_head or e.git(origin, 'rev-parse', 'refs/heads/' + pr['branch']) != head:
                raise ValueError('仓库在合并前发生变化，请重新检查')
            if not tree:
                raise ValueError('PR 与上游有冲突，请在本地解决后重新推送、评审和检查')
            source_count = int(e.git(worker, 'rev-list', '--count', f'{base_head}..{head}'))
            if strategy != 'merge' and source_count < 2:
                raise ValueError('本关需要至少两个功能提交来观察合并方式的差异')
            merged_diff = e.git(worker, 'diff', '--no-ext-diff', '--no-textconv', f'{base_head}...{head}')[:16000]
            if strategy == 'merge':
                e.git(worker, 'merge', '--no-ff', head, '-m', 'Merge PR #1: ' + pr['title'])
            elif strategy == 'squash':
                e.git(worker, 'merge', '--squash', head)
                e.git(worker, 'commit', '-m', 'Squash PR #1: ' + pr['title'])
            else:
                if e.git(worker, 'rev-list', '--merges', f'{base_head}..{head}'):
                    raise ValueError('本关请先整理来源分支为线性提交，再进行 rebase 合并')
                e.git(worker, 'switch', '-C', 'integration', head)
                try:
                    e.git(worker, 'rebase', '--force-rebase', base_head)
                except ValueError as error:
                    # Intermediate replay can conflict even when the final merge tree is clean.
                    # Recover our reserved worker so the learner can repair and retry the PR.
                    e.git(worker, 'rebase', '--abort', check=False)
                    e.git(worker, 'switch', 'main')
                    raise ValueError('逐条重放时发生冲突。请在本地同步上游并整理提交，再推送、评审和检查。' + str(error)) from error
                rebased = e.git(worker, 'rev-parse', 'HEAD')
                e.git(worker, 'switch', 'main')
                e.git(worker, 'merge', '--ff-only', rebased)
            e.git(worker, 'push', 'origin', 'main', extra_env={'GO_PR_MERGE': '1'})
            pr.update(status='merged', strategy=strategy, sourceCount=source_count, mergedBase=base_head,
                      mergedSource=head, mergedHead=e.git(worker, 'rev-parse', 'HEAD'), mergedDiff=merged_diff,
                      message='已合并到 upstream/main。回到终端同步本地 main，再推送 origin/main。')
    else:
        raise ValueError('未知托管操作')
    temporary = base / 'scenario.json.tmp'
    temporary.write_text(json.dumps(record, ensure_ascii=False))
    temporary.replace(base / 'scenario.json')
