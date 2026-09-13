"""Advanced scenarios and the offline code-host exercise, backed by real Git."""
import hosting

IDS = {'rebase', 'rebase-conflict', 'interactive-rebase', 'cherry-pick',
       'cherry-pick-conflict', 'stash', 'reflog'} | hosting.IDS


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
    elif lesson in hosting.IDS:
        hosting.setup(e, repo, base, lesson, mode, record)


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
    elif lesson in hosting.IDS:
        checks = hosting.assess(e, repo, base, record)
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
            if marker == 'rebase-apply':
                return 'am' if (repo / Path(location) / 'applying').exists() else 'rebase'
            return name
    return None


def hosting_view(e, repo, base, record):
    return hosting.view(e, repo, base, record)


def host_action(e, repo, base, record, request):
    return hosting.action(e, repo, base, record, request)
