"""State-based exercises for the index, recovery, diagnosis and repository upkeep."""
from pathlib import Path
import advanced

IDS = {'partial-stage', 'amend', 'reset-soft', 'reset-mixed', 'reset-hard',
       'worktree', 'bisect', 'tags', 'ignore', 'rename'}


def settings(enabled, theme):
    return f'enabled={enabled}\n' + ''.join(f'option_{i}=keep\n' for i in range(12)) + f'theme={theme}\n'


def setup(e, repo, base, lesson, mode, record):
    g = lambda *args: e.git(repo, *args)
    record['value'] = value = 'ready' if mode == 'guided' else 'released'
    (repo / 'README.md').write_text('# 团队项目\n')
    (repo / 'feature.txt').write_text('draft\n')
    (repo / 'config.ini').write_text('safe_mode=on\n')
    if lesson == 'partial-stage':
        (repo / 'settings.ini').write_text(settings('no', 'light'))
    elif lesson == 'ignore':
        (repo / 'build.log').write_text('构建日志要保留在本地\n')
        (repo / 'cache').mkdir()
        (repo / 'cache/data.txt').write_text('缓存要保留在本地\n')
        (repo / '.gitignore').write_text('# 项目忽略规则\n')
    elif lesson == 'rename':
        (repo / 'old-guide.md').write_text('# 保留完整学习手册\n')
        (repo / 'obsolete.txt').write_text('已过时的示例\n')
    elif lesson == 'bisect':
        (repo / 'price.py').write_text('def total(price, quantity):\n    return price * quantity\n')
        (repo / 'check.py').write_text('from pathlib import Path\n# Git checkout may change equal-sized files within one timestamp tick.\n# Read the current source instead of reusing an import bytecode cache.\nnamespace = {}\nexec(compile(Path("price.py").read_text(), "price.py", "exec"), namespace)\nassert namespace["total"](7, 3) == 21\n')
        (repo / '.gitignore').write_text('__pycache__/\n')
    record['initial'] = e.commit(repo, '建立正确的基线')
    g('tag', 'baseline', record['initial'])
    if lesson == 'partial-stage':
        (repo / 'settings.ini').write_text(settings('yes', 'dark'))
    elif lesson == 'amend':
        (repo / 'feature.txt').write_text(value + '\n')
        record['incomplete'] = e.commit(repo, '实现功能，但漏了测试')
        (repo / 'tests.txt').write_text('tests=pass\n')
    elif lesson.startswith('reset-'):
        (repo / 'feature.txt').write_text(value + '\n')
        record['beforeReset'] = e.commit(repo, '需要重新处理的本地提交')
        (repo / 'scratch.txt').write_text('不与被恢复路径冲突的未跟踪草稿\n')
    elif lesson == 'worktree':
        (repo / 'feature.txt').write_text(value + '\n')
    elif lesson == 'bisect':
        bad_index = 4 if mode == 'guided' else 6
        for i in range(1, 10):
            (repo / 'changelog.txt').write_text(f'iteration={i}\n')
            if i == bad_index:
                (repo / 'price.py').write_text('def total(price, quantity):\n    return price + quantity\n')
            revision = e.commit(repo, f'迭代 {i}')
            if i == bad_index:
                record['firstBad'] = revision
        record['latest'] = g('rev-parse', 'HEAD')
    elif lesson == 'tags':
        remote = base / 'origin.git'
        e.git(base, 'init', '--bare', '-b', 'main', str(remote))
        g('remote', 'add', 'origin', str(remote))
        g('push', '-u', 'origin', 'main')
        (repo / 'feature.txt').write_text(value + '\n')
        record['release'] = e.commit(repo, '准备发布')
        record['tag'] = 'v1.0.0' if mode == 'guided' else 'v2.0.0'


def assess(e, repo, base, lesson, mode, record):
    g = lambda *args: e.git(repo, *args, check=False)
    at = lambda ref, name: e.text_at(repo, ref, name)
    read = lambda name: (repo / name).read_text() if (repo / name).is_file() else ''
    tip = g('rev-parse', 'HEAD')
    initial, value = record['initial'], record['value']
    status = g('status', '--porcelain')
    index = g('diff', '--cached', '--name-only')
    branch = g('branch', '--show-current')
    checks = []
    if lesson == 'partial-stage':
        checks = [
            ('本次提交只包含 enabled 功能修改', at('HEAD', 'settings.ini') == settings('yes', 'light').rstrip('\n') and e.ancestor(repo, initial, tip) and g('rev-list', '--count', f'{initial}..HEAD') == '1'),
            ('theme 修改仍完整保留在工作区', read('settings.ini') == settings('yes', 'dark')),
            ('暂存区为空，剩余差异只有 settings.ini', not index and g('diff', '--name-only') == 'settings.ini'),
        ]
    elif lesson == 'amend':
        checks = [
            ('用一个完整提交替换漏文件的提交', tip != record['incomplete'] and g('rev-parse', 'HEAD^') == initial and not e.ancestor(repo, record['incomplete'], tip)),
            ('功能与遗漏测试都在该提交中', at('HEAD', 'feature.txt') == value and at('HEAD', 'tests.txt') == 'tests=pass'),
        ]
    elif lesson.startswith('reset-'):
        kind = lesson.removeprefix('reset-')
        checks = [('main 回到 baseline', tip == initial and branch == 'main'),
                  ('未跟踪草稿保留', read('scratch.txt') == '不与被恢复路径冲突的未跟踪草稿\n' and 'scratch.txt' in g('ls-files', '--others', '--exclude-standard').splitlines())]
        if kind == 'soft':
            checks += [('完整修改仍在暂存区', index == 'feature.txt' and at('', 'feature.txt') == value),
                       ('工作区与暂存区一致', read('feature.txt') == value + '\n' and not g('diff', '--name-only'))]
        elif kind == 'mixed':
            checks += [('暂存区回到基线', not index and at('', 'feature.txt') == 'draft'),
                       ('修改保留为未暂存内容', read('feature.txt') == value + '\n' and g('diff', '--name-only') == 'feature.txt')]
        else:
            checks += [('已跟踪文件与暂存区回到基线', read('feature.txt') == 'draft\n' and not index and not g('diff', '--name-only'))]
    elif lesson == 'worktree':
        linked = base / 'hotfix-tree'
        registered = f'worktree {linked}' in g('worktree', 'list', '--porcelain').splitlines()
        checks = [
            ('hotfix-tree 是共享此仓库的 hotfix 工作树', registered and linked.is_dir() and e.git(linked, 'branch', '--show-current', check=False) == 'hotfix'),
            ('hotfix 中已提交修复', at('hotfix', 'config.ini') == 'safe_mode=strict' and e.ancestor(repo, initial, 'hotfix') and bool(registered) and not e.git(linked, 'status', '--porcelain', check=False)),
            ('main 的位置与未提交功能不受影响', branch == 'main' and tip == initial and read('feature.txt') == value + '\n' and not index),
        ]
    elif lesson == 'bisect':
        checks = [
            ('culprit 分支保留首次引入错误的提交', g('rev-parse', '--verify', 'refs/heads/culprit') == record['firstBad']),
            ('已结束二分并回到原来的 main', not advanced.operation(e, repo) and branch == 'main' and tip == record['latest']),
            ('原提交历史没有被改写', e.ancestor(repo, initial, 'main') and g('rev-list', '--count', f'{initial}..main') == '9'),
        ]
    elif lesson == 'tags':
        tag, remote = record['tag'], base / 'origin.git'
        ref = 'refs/tags/' + tag
        local_object = g('rev-parse', '--verify', ref)
        checks = [
            ('发布的是带说明的标签对象', g('cat-file', '-t', ref) == 'tag' and bool(g('for-each-ref', '--format=%(contents)', ref))),
            ('标签准确指向发布提交', g('rev-parse', '--verify', ref + '^{}') == record['release']),
            ('远端收到相同标签对象及发布分支', bool(local_object) and e.git(remote, 'rev-parse', '--verify', ref, check=False) == local_object and e.git(remote, 'rev-parse', 'main') == record['release']),
        ]
    elif lesson == 'ignore':
        tracked = set(g('ls-files').splitlines())
        checks = [
            ('忽略规则已提交，日志和缓存不再被跟踪', '.gitignore' in tracked and bool(at('HEAD', '.gitignore').strip()) and not {'build.log', 'cache/data.txt'} & tracked and e.ancestor(repo, initial, tip) and tip != initial),
            ('日志和缓存仍留在磁盘', read('build.log') == '构建日志要保留在本地\n' and read('cache/data.txt') == '缓存要保留在本地\n'),
            ('规则覆盖后续日志与缓存文件', set(g('check-ignore', '--no-index', 'build.log', 'future.log', 'cache/data.txt', 'cache/future.txt').splitlines()) == {'build.log', 'future.log', 'cache/data.txt', 'cache/future.txt'}),
        ]
    elif lesson == 'rename':
        checks = [
            ('手册移动到 docs/guide.md 且正文完整', at('HEAD', 'docs/guide.md') == '# 保留完整学习手册' and not (repo / 'old-guide.md').exists()),
            ('过时示例已从新提交移除', not g('ls-tree', '--name-only', 'HEAD', 'obsolete.txt', 'old-guide.md') and not (repo / 'obsolete.txt').exists()),
            ('原历史仍可查询', e.ancestor(repo, initial, tip) and at(initial, 'old-guide.md') == '# 保留完整学习手册'),
        ]
    if lesson not in {'partial-stage', 'worktree', 'reset-soft', 'reset-mixed', 'reset-hard'}:
        checks.append(('工作区与暂存区干净', not status))
    checks.append(('没有遗留进行中的操作', not advanced.operation(e, repo)))
    return [{'label': label, 'done': bool(done)} for label, done in checks]
