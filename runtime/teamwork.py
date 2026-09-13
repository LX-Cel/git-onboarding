"""Remote collaboration, advanced integration and multi-repository exercises."""
from pathlib import Path
import advanced

IDS = {'push-rejected', 'force-with-lease', 'remote-repair', 'rebase-onto',
       'autosquash', 'stash-conflict', 'merge-revert', 'submodule',
       'sparse-checkout', 'shallow-clone', 'patch-am', 'bundle'}


def setup(e, repo, base, lesson, mode, record):
    g = lambda *args: e.git(repo, *args)
    record['value'] = value = 'ready' if mode == 'guided' else 'released'
    (repo / 'README.md').write_text('# 团队项目\n')
    (repo / 'feature.txt').write_text('draft\n')
    if lesson == 'sparse-checkout':
        for name in ['apps/web/index.txt', 'apps/admin/index.txt', 'docs/guide.txt']:
            (repo / name).parent.mkdir(parents=True, exist_ok=True)
            (repo / name).write_text(name + '\n')
    if lesson == 'submodule':
        source = base / 'library'
        source.mkdir()
        e.git(source, 'init', '-b', 'main')
        e.config(source)
        (source / 'version.txt').write_text('version=1\n')
        record['libraryInitial'] = e.commit(source, 'library version 1')
        g('-c', 'protocol.file.allow=always', 'submodule', 'add', str(source), 'vendor/library')
    record['initial'] = e.commit(repo, '建立项目基线')
    g('tag', 'baseline')
    if lesson in {'push-rejected', 'force-with-lease', 'remote-repair'}:
        remote = base / 'origin.git'
        e.git(base, 'init', '--bare', '-b', 'main', str(remote))
        g('remote', 'add', 'origin', str(remote))
        g('push', '-u', 'origin', 'main')
        if lesson == 'force-with-lease':
            g('switch', '-c', 'feature/topic')
            (repo / 'feature.txt').write_text(value + '\n')
            e.commit(repo, '功能第一部分')
            (repo / 'tests.txt').write_text('tests=pass\n')
            record['published'] = e.commit(repo, '功能测试')
            g('push', '-u', 'origin', 'feature/topic')
        if lesson == 'remote-repair':
            g('push', 'origin', 'main:refs/heads/obsolete')
            g('fetch', 'origin')
            e.git(remote, 'update-ref', '-d', 'refs/heads/obsolete')
            g('remote', 'set-url', 'origin', str(base / 'missing.git'))
        else:
            teammate = base / 'teammate'
            e.git(base, 'clone', str(remote), str(teammate))
            e.config(teammate)
            target = 'feature/topic' if lesson == 'force-with-lease' else 'main'
            if target != 'main':
                e.git(teammate, 'switch', target)
            (teammate / 'team.txt').write_text('team=preserved\n')
            record['teammate'] = e.commit(teammate, '队友追加修改')
            e.git(teammate, 'push', 'origin', target)
            if lesson == 'push-rejected':
                (repo / 'feature.txt').write_text(value + '\n')
                record['local'] = e.commit(repo, '本地功能提交')
            else:
                g('reset', '--soft', record['initial'])
                record['rewritten'] = e.commit(repo, '合并功能与测试为一个提交')
    elif lesson == 'rebase-onto':
        g('switch', '-c', 'feature/base')
        (repo / 'experimental.txt').write_text('尚未评审的基础功能\n')
        record['oldBase'] = e.commit(repo, '基础分支实验')
        g('switch', '-c', 'feature/topic')
        (repo / 'feature.txt').write_text(value + '\n')
        record['topic'] = e.commit(repo, '可独立交付的功能')
        g('switch', 'main')
        (repo / 'team.txt').write_text('team=preserved\n')
        record['main'] = e.commit(repo, '主线更新')
        g('switch', 'feature/topic')
    elif lesson == 'autosquash':
        g('switch', '-c', 'feature/topic')
        (repo / 'feature.txt').write_text('incomplete\n')
        record['first'] = e.commit(repo, '实现功能')
        (repo / 'docs.txt').write_text('docs=ready\n')
        e.commit(repo, '独立文档提交')
        (repo / 'feature.txt').write_text(value + '\n')
        g('add', 'feature.txt')
        g('commit', '--fixup=' + record['first'])
    elif lesson == 'stash-conflict':
        (repo / 'feature.txt').write_text(f'feature={value}\nteam=preserved\n')
        g('stash', 'push', '-m', '待恢复的功能')
        (repo / 'feature.txt').write_text('feature=team-draft\nteam=preserved\n')
        record['team'] = e.commit(repo, '主线修改同一处配置')
    elif lesson == 'merge-revert':
        g('switch', '-c', 'feature/unsafe')
        (repo / 'feature.txt').write_text('unsafe\n')
        e.commit(repo, '不应上线的功能')
        g('switch', 'main')
        g('merge', '--no-ff', 'feature/unsafe', '-m', '合并了错误功能')
        record['merge'] = g('rev-parse', 'HEAD')
        g('tag', 'bad-merge')
        (repo / 'team.txt').write_text('team=preserved\n')
        record['team'] = e.commit(repo, '合并后的队友工作')
    elif lesson == 'submodule':
        source = base / 'library'
        (source / 'version.txt').write_text('version=' + value + '\n')
        record['libraryLatest'] = e.commit(source, 'library update')
        g('submodule', 'deinit', '-f', 'vendor/library')
    elif lesson == 'shallow-clone':
        source = base / 'source'
        source.mkdir()
        e.git(source, 'init', '-b', 'main')
        e.config(source)
        for i in range(8):
            (source / 'release.txt').write_text(f'release={i}\n')
            sha = e.commit(source, f'版本 {i}')
            if i == 0:
                record['first'] = sha
        record['latest'] = sha
        e.git(base, 'clone', '--bare', str(source), str(base / 'origin.git'))
    elif lesson == 'patch-am':
        g('switch', '-c', 'patch-source')
        g('config', 'user.name', 'Patch Author')
        g('config', 'user.email', 'author@example.invalid')
        (repo / 'feature.txt').write_text(value + '\n')
        record['patch'] = e.commit(repo, '邮件贡献的功能')
        (base / 'incoming.patch').write_text(g('format-patch', '-1', '--stdout') + '\n')
        e.config(repo)
        g('switch', 'main')
        (repo / 'team.txt').write_text('team=preserved\n')
        record['main'] = e.commit(repo, '本地主线工作')
    elif lesson == 'bundle':
        (repo / 'feature.txt').write_text(value + '\n')
        record['latest'] = e.commit(repo, '离线交付的功能')


def assess(e, repo, base, lesson, mode, record):
    g = lambda *args: e.git(repo, *args, check=False)
    at = lambda ref, name: e.text_at(repo, ref, name)
    tip, initial, value = g('rev-parse', 'HEAD'), record['initial'], record['value']
    checks = []
    if lesson == 'push-rejected':
        remote = base / 'origin.git'
        checks = [('保留队友与本地功能', e.ancestor(repo, record['teammate'], tip) and at('HEAD', 'feature.txt') == value and at('HEAD', 'team.txt') == 'team=preserved'),
                  ('origin/main 已收到整合结果', e.git(remote, 'rev-parse', 'main') == tip and g('branch', '--show-current') == 'main')]
    elif lesson == 'force-with-lease':
        remote = base / 'origin.git'
        checks = [
            ('保存队友原始共享提交的备份引用', g('rev-parse', '--verify', 'refs/heads/backup/team') == record['teammate']),
            ('整理后为两个提交并保留全部内容', e.ancestor(repo, initial, tip) and g('rev-list', '--count', f'{initial}..HEAD') == '2' and at('HEAD', 'feature.txt') == value and at('HEAD', 'tests.txt') == 'tests=pass' and at('HEAD', 'team.txt') == 'team=preserved'),
            ('共享功能分支更新为整理后的历史', g('branch', '--show-current') == 'feature/topic' and e.git(remote, 'rev-parse', 'feature/topic') == tip and not e.ancestor(repo, record['published'], tip))]
    elif lesson == 'remote-repair':
        raw = g('remote', 'get-url', 'upstream')
        checks = [('upstream 使用正确地址且不再保留旧 origin 名称', bool(raw) and (repo / raw).resolve() == (base / 'origin.git').resolve() and g('remote').splitlines() == ['upstream']),
                  ('清理已删除的远端跟踪分支', not g('show-ref', '--verify', 'refs/remotes/upstream/obsolete') and not g('show-ref', '--verify', 'refs/remotes/origin/obsolete')),
                  ('main 正确跟踪 upstream/main', g('rev-parse', '--abbrev-ref', 'main@{upstream}') == 'upstream/main' and g('rev-parse', 'upstream/main') == initial and tip == initial)]
    elif lesson == 'rebase-onto':
        checks = [('仅把 topic 提交移到最新 main', g('branch', '--show-current') == 'feature/topic' and g('rev-parse', 'HEAD^') == record['main'] and at('HEAD', 'feature.txt') == value),
                  ('没有带入旧基础分支的实验', not at('HEAD', 'experimental.txt') and not e.ancestor(repo, record['oldBase'], tip) and at('HEAD', 'team.txt') == 'team=preserved'),
                  ('旧基础分支仍保留', g('rev-parse', 'feature/base') == record['oldBase'])]
    elif lesson == 'autosquash':
        checks = [('整理为两个独立提交', g('branch', '--show-current') == 'feature/topic' and e.ancestor(repo, initial, tip) and g('rev-list', '--count', f'{initial}..HEAD') == '2'),
                  ('修正归入功能提交，文档独立保留', at('HEAD^', 'feature.txt') == value and not at('HEAD^', 'docs.txt') and at('HEAD', 'feature.txt') == value and at('HEAD', 'docs.txt') == 'docs=ready'),
                  ('main 未被改写', g('rev-parse', 'main') == initial)]
    elif lesson == 'stash-conflict':
        checks = [('恢复并提交双方内容', at('HEAD', 'feature.txt') == f'feature={value}\nteam=preserved' and e.ancestor(repo, record['team'], tip) and tip != record['team']),
                  ('成功恢复后显式移除 stash', not g('stash', 'list'))]
    elif lesson == 'merge-revert':
        checks = [('撤销错误功能并保留后续队友工作', at('HEAD', 'feature.txt') == 'draft' and at('HEAD', 'team.txt') == 'team=preserved'),
                  ('用新提交修正合并而非改写历史', e.ancestor(repo, record['team'], tip) and e.ancestor(repo, record['merge'], tip) and tip != record['team'])]
    elif lesson == 'submodule':
        module = repo / 'vendor/library'
        link = g('ls-tree', 'HEAD', 'vendor/library')
        checks = [('父仓库提交了正确的 gitlink', link == f'160000 commit {record["libraryLatest"]}\tvendor/library' and e.ancestor(repo, initial, tip)),
                  ('子模块检出目标版本且没有未提交修改', (module / '.git').is_file() and e.git(module, 'rev-parse', 'HEAD', check=False) == record['libraryLatest'] and not e.git(module, 'status', '--porcelain', check=False)),
                  ('子模块地址记录仍保留', bool(at('HEAD', '.gitmodules')))]
    elif lesson == 'sparse-checkout':
        checks = [('启用 cone 稀疏检出，范围是 web 和 docs', g('config', '--bool', 'core.sparseCheckout') == 'true' and g('config', '--bool', 'core.sparseCheckoutCone') == 'true' and set(g('sparse-checkout', 'list').splitlines()) == {'apps/web', 'docs'}),
                  ('目标文件在工作区，admin 不在工作区', (repo / 'apps/web/index.txt').is_file() and (repo / 'docs/guide.txt').is_file() and not (repo / 'apps/admin/index.txt').exists()),
                  ('完整内容仍在 Git 历史和索引中', tip == initial and 'apps/admin/index.txt' in g('ls-files').splitlines() and bool(at('HEAD', 'apps/admin/index.txt')))]
    elif lesson == 'shallow-clone':
        checkout = base / 'checkout'
        valid = (checkout / '.git').is_dir()
        checks = [('checkout 是独立克隆仓库', valid and bool(e.git(checkout, 'remote', 'get-url', 'origin', check=False))),
                  ('补齐历史至完整的八个提交', valid and e.git(checkout, 'rev-parse', '--is-shallow-repository') == 'false' and e.git(checkout, 'rev-list', '--count', 'HEAD') == '8' and e.ancestor(checkout, record['first'], 'HEAD')),
                  ('克隆的最新内容保持完整', valid and e.git(checkout, 'rev-parse', 'HEAD') == record['latest'] and e.text_at(checkout, 'HEAD', 'release.txt') == 'release=7' and not e.git(checkout, 'status', '--porcelain'))]
    elif lesson == 'patch-am':
        checks = [('补丁内容应用到当前主线', at('HEAD', 'feature.txt') == value and at('HEAD', 'team.txt') == 'team=preserved' and g('rev-parse', 'HEAD^') == record['main']),
                  ('保留邮件补丁的作者信息', g('show', '-s', '--format=%an <%ae>', 'HEAD') == 'Patch Author <author@example.invalid>')]
    elif lesson == 'bundle':
        bundle, verification = base / 'transfer.bundle', base / 'verification'
        valid = False
        if bundle.is_file():
            try:
                e.git(repo, 'bundle', 'verify', str(bundle))
                valid = True
            except ValueError:
                pass
        checks = [('完整 bundle 可通过 Git 验证', valid and record['latest'] in g('bundle', 'list-heads', str(bundle))),
                  ('从 bundle 克隆并确认离线交付内容', (verification / '.git').is_dir() and e.git(verification, 'rev-parse', 'main', check=False) == record['latest'] and e.text_at(verification, 'main', 'feature.txt') == value)]
    checks += [('工作区与暂存区干净', not g('status', '--porcelain')),
               ('没有遗留进行中的操作', not advanced.operation(e, repo))]
    return [{'label': label, 'done': bool(done)} for label, done in checks]
