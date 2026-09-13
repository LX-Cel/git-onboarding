"""Advanced scenarios and the offline code-host exercise, backed by real Git."""
import json

IDS = {'rebase', 'rebase-conflict', 'interactive-rebase', 'cherry-pick',
       'cherry-pick-conflict', 'stash', 'reflog', 'fork-pr'}


def setup(e, repo, base, lesson, mode, record):
    g = lambda *args: e.git(repo, *args)
    value = 'ready' if mode == 'guided' else 'released'
    record['value'] = value
    (repo / 'README.md').write_text('# 团队项目\n')
    (repo / 'feature.txt').write_text('draft\n')
    (repo / 'config.ini').write_text('safe_mode=on\n')
    record['initial'] = e.commit(repo, '建立团队项目')
    if lesson in {'rebase', 'rebase-conflict', 'interactive-rebase'}:
        g('switch', '-c', 'feature/topic')
        (repo / 'feature.txt').write_text(value + '\n')
        record['feature'] = e.commit(repo, '实现功能')
        if lesson == 'interactive-rebase':
            (repo / 'tests.txt').write_text('tests=pass\n')
            e.commit(repo, '补充测试')
            (repo / 'docs.txt').write_text('docs=ready\n')
            e.commit(repo, '补充文档')
        else:
            g('switch', 'main')
            if lesson == 'rebase-conflict':
                (repo / 'feature.txt').write_text('upstream-draft\n')
            (repo / 'upstream.txt').write_text('team-update\n')
            record['upstream'] = e.commit(repo, '队友更新主线')
            g('switch', 'feature/topic')
    elif lesson in {'cherry-pick', 'cherry-pick-conflict'}:
        g('switch', '-c', 'feature/source')
        (repo / 'unrelated.txt').write_text('不应进入发布分支的实验\n')
        record['unrelated'] = e.commit(repo, '实验功能')
        (repo / 'config.ini').write_text('safe_mode=strict\n')
        record['fix'] = e.commit(repo, '修复：启用严格模式')
        g('tag', 'fix-to-pick', record['fix'])
        g('switch', '-c', 'release', record['initial'])
        if lesson == 'cherry-pick-conflict':
            (repo / 'config.ini').write_text('safe_mode=legacy\n')
            record['release'] = e.commit(repo, '旧发布分支配置')
    elif lesson == 'stash':
        (repo / 'feature.txt').write_text(value + '\n')
        (repo / 'scratch.txt').write_text('保留未跟踪草稿\n')
        g('branch', 'hotfix')
    elif lesson == 'reflog':
        (repo / 'feature.txt').write_text(value + '\n')
        record['lost'] = e.commit(repo, '需要找回的工作')
        g('reset', '--hard', record['initial'])
    elif lesson == 'fork-pr':
        upstream = base / 'upstream.git'
        e.git(base, 'init', '--bare', '-b', 'main', str(upstream))
        g('push', str(upstream), 'main')
        # The learner configures both remotes. The code-host button creates the fork.
        teammate = base / 'maintainer'
        e.git(base, 'clone', str(upstream), str(teammate))
        e.config(teammate)
        (teammate / 'upstream.txt').write_text('team-update\n')
        record['upstream'] = e.commit(teammate, '维护者更新主线')
        e.git(teammate, 'push', 'origin', 'main')
        record['hosting'] = {'forked': False, 'pr': None}


def assess(e, repo, base, lesson, mode, record):
    g = lambda *args: e.git(repo, *args, check=False)
    at = lambda ref, name: e.text_at(repo, ref, name)
    tip = g('rev-parse', 'HEAD')
    value = record['value']
    checks = []
    if lesson in {'rebase', 'rebase-conflict'}:
        checks = [
            ('功能分支位于最新主线之后', g('branch', '--show-current') == 'feature/topic' and e.ancestor(repo, record['upstream'], tip)),
            ('原功能提交已被重放，历史保持线性', not e.ancestor(repo, record['feature'], tip) and g('rev-list', '--count', f'{record["upstream"]}..HEAD') == '1' and not g('rev-list', '--merges', f'{record["initial"]}..HEAD')),
            ('功能与队友内容均被保留', at('HEAD', 'feature.txt') == value and at('HEAD', 'upstream.txt') == 'team-update'),
        ]
    elif lesson == 'interactive-rebase':
        checks = [
            ('功能分支整理为一个新提交', g('branch', '--show-current') == 'feature/topic' and e.ancestor(repo, record['initial'], tip) and g('rev-list', '--count', f'{record["initial"]}..HEAD') == '1'),
            ('功能、测试和文档全部保留', at('HEAD', 'feature.txt') == value and at('HEAD', 'tests.txt') == 'tests=pass' and at('HEAD', 'docs.txt') == 'docs=ready'),
            ('主线没有被改写', g('rev-parse', 'main') == record['initial']),
        ]
    elif lesson.startswith('cherry-pick'):
        start = record.get('release', record['initial'])
        checks = [
            ('发布分支包含独立的修复提交', g('branch', '--show-current') == 'release' and e.ancestor(repo, start, tip) and g('rev-list', '--count', f'{start}..HEAD') == '1' and at('HEAD', 'config.ini') == 'safe_mode=strict'),
            ('没有带入实验功能或源分支历史', not at('HEAD', 'unrelated.txt') and not e.ancestor(repo, record['unrelated'], tip)),
            ('原开发分支保留', g('rev-parse', 'feature/source') == record['fix']),
        ]
    elif lesson == 'stash':
        checks = [
            ('hotfix 分支已提交严格模式修复', at('hotfix', 'config.ini') == 'safe_mode=strict' and e.ancestor(repo, record['initial'], 'hotfix')),
            ('返回 main 并保留未提交功能', g('branch', '--show-current') == 'main' and (repo / 'feature.txt').read_text().strip() == value and at('HEAD', 'feature.txt') == 'draft'),
            ('未跟踪草稿完整找回', (repo / 'scratch.txt').is_file() and (repo / 'scratch.txt').read_text().strip() == '保留未跟踪草稿' and 'scratch.txt' in g('ls-files', '--others', '--exclude-standard').splitlines()),
            ('stash 已取回且暂存区为空', not g('stash', 'list') and not g('diff', '--cached', '--name-only')),
        ]
    elif lesson == 'reflog':
        checks = [
            ('recovered 分支找回原来的提交', g('rev-parse', '--verify', 'refs/heads/recovered') == record['lost']),
            ('切换至找回的工作且内容完整', g('branch', '--show-current') == 'recovered' and tip == record['lost'] and at('HEAD', 'feature.txt') == value),
            ('main 保持原位置', g('rev-parse', 'main') == record['initial']),
        ]
    elif lesson == 'fork-pr':
        hosting = record['hosting']
        pr = hosting.get('pr') or {}
        upstream = base / 'upstream.git'
        origin = base / 'origin.git'
        upstream_tip = e.git(upstream, 'rev-parse', 'main')
        origin_tip = e.git(origin, 'rev-parse', 'main', check=False) if origin.exists() else ''
        def remote_is(name, path):
            from pathlib import Path
            raw = g('remote', 'get-url', name)
            return bool(raw) and (repo / Path(raw)).resolve() == path.resolve()
        checks = [
            ('个人 origin 与上游 upstream 指向不同仓库', hosting['forked'] and remote_is('origin', origin) and remote_is('upstream', upstream)),
            ('功能分支的 PR 已通过评审并合并到上游', pr.get('status') == 'merged' and pr.get('review') == 'approved' and e.text_at(upstream, 'main', 'feature.txt') == value and e.text_at(upstream, 'main', 'tests.txt') == 'tests=pass'),
            ('保留上游原有提交', e.ancestor(upstream, record['upstream'], 'main')),
            ('个人与本地主线已同步合并结果', pr.get('status') == 'merged' and origin_tip == upstream_tip and g('rev-parse', 'main') == upstream_tip and g('branch', '--show-current') == 'main'),
        ]
    if lesson != 'stash':
        checks.append(('工作区与暂存区干净', not g('status', '--porcelain')))
    checks.append(('没有遗留进行中的 Git 操作', not operation(e, repo)))
    return [{'label': label, 'done': bool(done)} for label, done in checks]


def operation(e, repo):
    for marker, name in [('rebase-merge', 'rebase'), ('rebase-apply', 'rebase/am'),
                         ('CHERRY_PICK_HEAD', 'cherry-pick'), ('REVERT_HEAD', 'revert'),
                         ('MERGE_HEAD', 'merge'), ('BISECT_START', 'bisect')]:
        from pathlib import Path
        location = e.git(repo, 'rev-parse', '--git-path', marker, check=False)
        if location and (repo / Path(location)).exists():
            return name
    return None


def hosting_view(e, repo, base, record):
    if 'hosting' not in record:
        return None
    view = json.loads(json.dumps(record['hosting']))
    view['origin'] = str(base / 'origin.git')
    view['upstream'] = str(base / 'upstream.git')
    pr = view.get('pr')
    if pr:
        origin = base / 'origin.git'
        head = e.git(origin, 'rev-parse', '--verify', 'refs/heads/' + pr['branch'], check=False)
        pr['currentHead'] = head
        pr['staleReview'] = head != pr.get('reviewedHead')
        pr['diff'] = e.git(origin, 'diff', '--no-ext-diff', '--no-textconv', f'{record["upstream"]}...{head}', check=False)[:16000] if head else ''
    return view


def host_action(e, repo, base, record, request):
    """All writes remain under the selected, validated exercise directory."""
    if record['lesson'] != 'fork-pr':
        raise ValueError('本课程没有托管平台操作')
    hosting = record['hosting']
    origin, upstream = base / 'origin.git', base / 'upstream.git'
    action = request.get('operation')
    if action == 'fork':
        if not hosting['forked']:
            e.git(base, 'clone', '--bare', str(upstream), str(origin))
            hosting['forked'] = True
    elif action == 'create':
        if not hosting['forked']:
            raise ValueError('请先 Fork 上游仓库')
        if hosting.get('pr'):
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
        hosting['pr'] = {'number': 1, 'title': title.strip(), 'branch': branch, 'base': 'main',
                         'status': 'open', 'review': 'pending', 'createdHead': head,
                         'reviewedHead': None, 'message': 'PR 已创建。请请求评审。'}
    elif action in {'review', 'merge'}:
        pr = hosting.get('pr')
        if not pr or pr['status'] != 'open':
            raise ValueError('请先创建尚未合并的 PR')
        head = e.git(origin, 'rev-parse', '--verify', 'refs/heads/' + pr['branch'])
        if action == 'review':
            approved = (e.text_at(origin, head, 'feature.txt') == record['value'] and
                        e.text_at(origin, head, 'tests.txt') == 'tests=pass')
            pr.update(review='approved' if approved else 'changes_requested', reviewedHead=head,
                      message='评审通过，可以合并。' if approved else f'请求修改：feature.txt 应为 {record["value"]}，并新增 tests.txt 内容 tests=pass。修改后推送同一分支，再请求评审。')
        else:
            if pr['review'] != 'approved' or pr['reviewedHead'] != head:
                raise ValueError('当前提交尚未通过评审；追加或重写提交后需要重新评审')
            maintainer = base / 'maintainer'
            e.git(maintainer, 'fetch', 'origin')
            e.git(maintainer, 'merge', '--ff-only', 'origin/main')
            e.git(maintainer, 'fetch', str(origin), 'refs/heads/' + pr['branch'])
            result = e.git(maintainer, 'merge-tree', '--write-tree', 'HEAD', 'FETCH_HEAD', check=False)
            # A conflicted merge-tree reports paths after the tree id. Never leave a maintainer merge in progress.
            if len(result.splitlines()) != 1:
                raise ValueError('PR 与上游有冲突，请在本地同步并解决后重新推送、评审')
            e.git(maintainer, 'merge', '--no-ff', 'FETCH_HEAD', '-m', 'Merge PR #1: ' + pr['title'])
            e.git(maintainer, 'push', 'origin', 'main')
            pr.update(status='merged', mergedHead=e.git(maintainer, 'rev-parse', 'HEAD'),
                      message='已合并到 upstream/main。回到终端同步本地 main，并推送 origin/main。')
    else:
        raise ValueError('未知托管操作')
    temporary = base / 'scenario.json.tmp'
    temporary.write_text(json.dumps(record, ensure_ascii=False))
    temporary.replace(base / 'scenario.json')
