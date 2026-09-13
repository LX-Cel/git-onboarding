"""Multi-stage repository handovers and an explicitly ungraded experiment workspace."""
import shutil
import advanced

IDS = {'capstone-onboarding', 'capstone-release', 'capstone-concurrent', 'capstone-legacy', 'freeplay'}
UNINITIALIZED = {'capstone-onboarding', 'freeplay'}


def setup(e, repo, base, lesson, mode, record):
    g = lambda *args: e.git(repo, *args)
    record['value'] = value = 'ready' if mode == 'guided' else 'released'
    (base / 'target-value.txt').write_text(value + '\n')
    record['draft'] = draft = '保留个人草稿-' + mode
    (repo / 'README.md').write_text('# 综合 Git 工作项目\n')
    (repo / 'feature.txt').write_text('draft\n')
    (repo / 'config.ini').write_text('safe_mode=on\n')
    (repo / 'draft.txt').write_text('original\n')
    (repo / 'version.txt').write_text('1.0.0\n')
    record['initial'] = e.commit(repo, '团队初始版本')
    if lesson == 'capstone-onboarding':
        g('switch', '-c', 'feature/welcome')
        (repo / 'handoff.txt').write_text('保留团队交接记录\n')
        record['team'] = e.commit(repo, '团队准备入职任务')
        e.git(base, 'clone', '--bare', str(repo), str(base / 'origin.git'))
        e.git(base / 'origin.git', 'symbolic-ref', 'HEAD', 'refs/heads/main')
        # Remove only the freshly created, validated exercise directory's contents.
        for path in repo.iterdir():
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
        return
    if lesson == 'capstone-release':
        g('tag', '-a', 'v1.0.0', '-m', 'stable')
        (repo / 'feature.txt').write_text(value + '\n')
        e.commit(repo, '交付需要保留的新功能')
        (repo / 'config.ini').write_text('safe_mode=off\n')
        (repo / 'version.txt').write_text('2.0.0\n')
        record['bad'] = e.commit(repo, '错误发布：关闭安全模式')
        g('tag', '-a', 'v2.0.0', '-m', 'published release')
        record['publishedTag'] = g('rev-parse', 'v2.0.0')
    e.git(base, 'clone', '--bare', str(repo), str(base / 'origin.git'))
    g('remote', 'add', 'origin', str(base / 'origin.git'))
    g('fetch', 'origin')
    g('branch', '--set-upstream-to=origin/main', 'main')
    if lesson == 'capstone-release':
        (repo / 'draft.txt').write_text(draft + '\n')
    elif lesson == 'capstone-concurrent':
        g('switch', '-c', 'feature/topic')
        (repo / 'feature.txt').write_text(value + '\n')
        record['feature'] = e.commit(repo, '个人功能，需要重放到新主线')
        g('push', '-u', 'origin', 'feature/topic')
        teammate = base / 'teammate'
        e.git(base, 'clone', str(base / 'origin.git'), str(teammate))
        e.config(teammate)
        (teammate / 'feature.txt').write_text('team-redesign\n')
        (teammate / 'team.txt').write_text('team=preserved\n')
        record['team'] = e.commit(teammate, '队友修改同一功能并补充团队文件')
        e.git(teammate, 'push', 'origin', 'main')
        (repo / 'draft.txt').write_text(draft + '\n')
        (repo / 'notes.local').write_text('本地笔记-' + mode + '\n')
    elif lesson == 'capstone-legacy':
        (repo / 'feature.txt').write_text(value + '\n')
        record['lost'] = e.commit(repo, '遗失的完整功能提交')
        g('reset', '--hard', record['initial'])
        g('switch', '--detach', record['initial'])
        g('remote', 'set-url', 'origin', str(base / 'missing.git'))
        (repo / 'config.ini').write_text('safe_mode=off\n')
        (repo / 'draft.txt').write_text('staged-' + draft + '\n')
        g('add', 'draft.txt')
        (repo / 'draft.txt').write_text('working-' + draft + '\n')
    elif lesson == 'freeplay':
        e.git(base, 'clone', '--bare', str(repo), str(base / 'upstream.git'))
        g('remote', 'add', 'upstream', str(base / 'upstream.git'))
        teammate = base / 'teammate'
        e.git(base, 'clone', str(base / 'upstream.git'), str(teammate))
        e.config(teammate)
        (teammate / 'team.txt').write_text('可以在 ../teammate 模拟队友提交\n')
        e.commit(teammate, '上游已有队友更新')
        e.git(teammate, 'push', 'origin', 'main')
        g('branch', 'feature/experiment')
        g('fetch', '--all')


def assess(e, repo, base, lesson, mode, record):
    if lesson == 'freeplay':
        return []
    g = lambda *args: e.git(repo, *args, check=False)
    head = g('rev-parse', '--verify', 'HEAD')
    read = lambda name: (repo / name).read_text().strip() if (repo / name).is_file() else ''
    remote = base / 'origin.git'
    value, draft = record['value'], record['draft']
    checks = [('功能与初始团队历史保留', e.text_at(repo, 'HEAD', 'feature.txt') == value and e.ancestor(repo, record['initial'], 'HEAD'))]
    if lesson == 'capstone-onboarding':
        checks.extend([
            ('接续团队交接分支并建立跟踪', g('branch', '--show-current') == 'feature/welcome' and g('rev-parse', '--abbrev-ref', '@{upstream}') == 'origin/feature/welcome' and e.ancestor(repo, record['team'], 'HEAD') and e.text_at(repo, 'HEAD', 'handoff.txt') == '保留团队交接记录'),
            ('功能提交使用入职练习身份', g('log', '-1', '--format=%an <%ae>', '--', 'feature.txt') == 'Git Learner <learner@example.invalid>' and head != record['team']),
            ('提交忽略规则且个人笔记未进入历史', bool(e.text_at(repo, 'HEAD', '.gitignore')) and g('check-ignore', '--no-index', 'notes.local') == 'notes.local' and read('notes.local') == '个人入职笔记' and not g('log', '--format=%H', '--all', '--', 'notes.local')),
            ('功能分支已交付且主线不变', e.git(remote, 'rev-parse', 'feature/welcome') == head and e.git(remote, 'rev-parse', 'main') == record['initial']),
            ('工作区与暂存区干净', not g('status', '--porcelain'))])
    elif lesson == 'capstone-release':
        checks.extend([
            ('以新历史恢复安全模式，保留错误发布证据', e.ancestor(repo, record['bad'], 'HEAD') and head != record['bad'] and e.text_at(repo, 'HEAD', 'config.ini') == 'safe_mode=on' and e.text_at(repo, 'HEAD', 'version.txt') == '2.0.1'),
            ('原发布标签未改写，补丁标签有说明并指向修复', g('rev-parse', 'v2.0.0') == record['publishedTag'] and g('cat-file', '-t', 'refs/tags/v2.0.1') == 'tag' and bool(g('for-each-ref', '--format=%(contents)', 'refs/tags/v2.0.1').strip()) and g('rev-parse', 'v2.0.1^{commit}') == head),
            ('修复主线和补丁标签均已发布', g('branch', '--show-current') == 'main' and e.git(remote, 'rev-parse', 'main') == head and e.git(remote, 'rev-parse', '--verify', 'refs/tags/v2.0.1', check=False) == g('rev-parse', '--verify', 'refs/tags/v2.0.1') and e.git(remote, 'rev-parse', 'v2.0.0') == record['publishedTag']),
            ('未发布草稿恢复且没有混入补丁历史', read('draft.txt') == draft and e.text_at(repo, 'HEAD', 'draft.txt') == 'original' and not g('log', record['initial']+'..HEAD', '--format=%H', '--', 'draft.txt') and g('diff', '--name-only') == 'draft.txt' and not g('diff', '--cached', '--name-only') and not g('stash', 'list'))])
    elif lesson == 'capstone-concurrent':
        checks.extend([
            ('线性整合队友最新主线并保留其内容', e.ancestor(repo, record['team'], 'HEAD') and e.text_at(repo, 'HEAD', 'team.txt') == 'team=preserved' and not g('rev-list', '--merges', record['initial']+'..HEAD') and not e.ancestor(repo, record['feature'], 'HEAD')),
            ('个人功能分支已同步且团队主线未覆盖', g('branch', '--show-current') == 'feature/topic' and e.git(remote, 'rev-parse', 'feature/topic') == head and e.git(remote, 'rev-parse', 'main') == record['team']),
            ('草稿和未跟踪笔记恢复，未混入提交', read('draft.txt') == draft and read('notes.local') == '本地笔记-'+mode and e.text_at(repo, 'HEAD', 'draft.txt') == 'original' and not g('log', record['initial']+'..HEAD', '--format=%H', '--', 'draft.txt', 'notes.local') and not g('diff', '--cached', '--name-only') and not g('stash', 'list'))])
    else:
        checks.extend([
            ('恢复原始丢失提交并离开分离 HEAD', head == record['lost'] and g('branch', '--show-current') == 'main'),
            ('远端地址修复且原提交成功交付', (repo / g('remote', 'get-url', 'origin')).resolve() == remote and e.git(remote, 'rev-parse', 'main') == record['lost']),
            ('仅丢弃错误配置，完整保留两个层次的草稿', read('config.ini') == 'safe_mode=on' and read('draft.txt') == 'working-'+draft and e.text_at(repo, '', 'draft.txt') == 'staged-'+draft and g('diff', '--name-only') == 'draft.txt' and g('diff', '--cached', '--name-only') == 'draft.txt')])
    checks.append(('没有遗留进行中的 Git 操作', not advanced.operation(e, repo)))
    return [{'label': label, 'done': bool(done)} for label, done in checks]
