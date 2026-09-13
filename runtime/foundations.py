"""Repository lifecycle, integration policy and diagnostic recovery using real Git."""
import shutil
import advanced

IDS = {'init-config', 'clone-tracking', 'merge-abort', 'pull-ff-only', 'pull-rebase',
       'pull-merge', 'detached-head', 'deleted-branch', 'blame-log', 'am-conflict',
       'attributes', 'fsck-recovery'}
UNINITIALIZED = {'init-config', 'clone-tracking'}


def is_repository(e, repo):
    return e.git(repo, 'rev-parse', '--show-toplevel', check=False) == str(repo)


def setup(e, repo, base, lesson, mode, record):
    g = lambda *args: e.git(repo, *args)
    record['value'] = value = 'ready' if mode == 'guided' else 'released'
    if lesson in UNINITIALIZED:
        # Only the empty repository created for this new, validated scenario is removed.
        shutil.rmtree(repo / '.git')
        if lesson == 'init-config':
            (repo / 'README.md').write_text('# 新项目\n')
        else:
            seed = base / 'seed'
            seed.mkdir()
            e.git(seed, 'init', '-b', 'main')
            e.config(seed)
            (seed / 'README.md').write_text('# 远端团队项目\n')
            record['initial'] = e.commit(seed, '团队初始提交')
            e.git(seed, 'switch', '-c', 'feature/team')
            (seed / 'feature.txt').write_text('draft\n')
            record['team'] = e.commit(seed, '队友建立功能分支')
            e.git(base, 'clone', '--bare', str(seed), str(base / 'origin.git'))
            e.git(base / 'origin.git', 'symbolic-ref', 'HEAD', 'refs/heads/main')
        return
    (repo / 'README.md').write_text('# 工作项目\n')
    (repo / 'feature.txt').write_text('draft\n')
    if lesson == 'blame-log':
        record['retries'] = retries = '3' if mode == 'guided' else '5'
        (repo / 'config.ini').write_text(f'timeout=30\nretries={retries}\nmode=safe\n')
    if lesson == 'attributes':
        (repo / 'run.sh').write_bytes(b'#!/bin/sh\nprintf hello\r\n')
        (repo / 'run.cmd').write_bytes(b'@echo off\r\necho hello\r\n')
        (repo / 'asset.bin').write_bytes(b'\x00binary\r\n\xff')
    record['initial'] = e.commit(repo, '项目初始版本')
    if lesson.startswith('pull-'):
        remote = base / 'origin.git'
        e.git(base, 'clone', '--bare', str(repo), str(remote))
        g('remote', 'add', 'origin', str(remote))
        g('fetch', 'origin')
        g('branch', '--set-upstream-to=origin/main', 'main')
        teammate = base / 'teammate'
        e.git(base, 'clone', str(remote), str(teammate))
        e.config(teammate)
        (teammate / 'team.txt').write_text('team=preserved\n')
        record['remote'] = e.commit(teammate, '队友新增独立工作')
        e.git(teammate, 'push', 'origin', 'main')
        (repo / 'feature.txt').write_text(value + '\n')
        record['local'] = e.commit(repo, '本地尚未推送的功能')
    elif lesson == 'merge-abort':
        g('switch', '-c', 'feature/topic')
        (repo / 'feature.txt').write_text('topic-version\n')
        record['feature'] = e.commit(repo, '功能分支改动')
        g('switch', 'main')
        (repo / 'feature.txt').write_text('main-version\n')
        record['main'] = e.commit(repo, '主线独立改动')
        (repo / 'notes.txt').write_text('untracked draft to keep\n')
        e.git(repo, 'merge', 'feature/topic', check=False)
    elif lesson in {'detached-head', 'deleted-branch', 'fsck-recovery'}:
        if lesson == 'detached-head':
            g('switch', '--detach', 'HEAD')
        else:
            g('switch', '-c', 'feature/lost')
        (repo / 'feature.txt').write_text(value + '\n')
        record['lost'] = e.commit(repo, '需要保留的未合并工作')
        if lesson != 'detached-head':
            g('switch', 'main')
            g('branch', '-D', 'feature/lost')
        if lesson == 'fsck-recovery':
            g('reflog', 'expire', '--expire=now', '--all')
    elif lesson == 'blame-log':
        (repo / 'config.ini').write_text('timeout=30\nretries=0\nmode=safe\n')
        record['bad'] = e.commit(repo, '调整连接配置')
        for i in range(3):
            (repo / 'README.md').write_text(f'# 工作项目\n文档版本 {i+1}\n')
            record['tip'] = e.commit(repo, f'完善说明 {i+1}')
    elif lesson == 'am-conflict':
        g('switch', '-c', 'patch/source')
        g('config', 'user.name', 'Patch Contributor')
        g('config', 'user.email', 'contributor@example.invalid')
        (repo / 'feature.txt').write_text(value + '\n')
        record['patch'] = e.commit(repo, '通过邮件交付功能')
        patch = g('format-patch', '-1', '--stdout')
        (base / 'incoming.patch').write_text(patch + '\n')
        e.config(repo)
        g('switch', 'main')
        (repo / 'feature.txt').write_text('team-version\n')
        (repo / 'team.txt').write_text('team=preserved\n')
        record['main'] = e.commit(repo, '主线改变了同一处内容')
        e.git(repo, 'am', '-3', str(base / 'incoming.patch'), check=False)


def assess(e, repo, base, lesson, mode, record):
    g = lambda *args: e.git(repo, *args, check=False)
    at = lambda ref, name: e.text_at(repo, ref, name)
    value = record['value']
    has_repo = is_repository(e, repo)
    if not has_repo:
        return [{'label': '当前目录已建立真实 Git 仓库', 'done': False},
                {'label': '完成本关配置、提交与协作目标', 'done': False}]
    head = g('rev-parse', '--verify', 'HEAD')
    branch = g('branch', '--show-current')
    checks = []
    if lesson == 'init-config':
        checks = [
            ('仓库位于当前目录，分支名为 main', branch == 'main'),
            ('身份配置仅作用于本仓库', bool(g('config', '--local', 'user.name')) and g('config', '--local', 'user.email') == 'learner@example.invalid'),
            ('README 的学习内容已进入首个提交', at('HEAD', 'README.md') == '# 新项目\n' + value and g('rev-list', '--count', 'HEAD') == '1'),
            ('提交作者使用配置的练习身份', g('log', '-1', '--format=%ae') == 'learner@example.invalid')]
    elif lesson == 'clone-tracking':
        origin = base / 'origin.git'
        url = g('remote', 'get-url', 'origin')
        checks = [
            ('origin 指向团队仓库且保留已有历史', bool(url) and (repo / url).resolve() == origin and e.ancestor(repo, record['initial'], 'HEAD')),
            ('本地功能分支跟踪对应远端分支', branch == 'feature/team' and g('rev-parse', '--abbrev-ref', '@{upstream}') == 'origin/feature/team'),
            ('在队友工作之后提交功能', e.ancestor(repo, record['team'], 'HEAD') and head != record['team'] and at('HEAD', 'feature.txt') == value),
            ('功能分支已推送，主线保持不变', e.git(origin, 'rev-parse', 'feature/team') == head and e.git(origin, 'rev-parse', 'main') == record['initial'])]
    elif lesson.startswith('pull-'):
        remote = base / 'origin.git'
        linear = not g('rev-list', '--merges', f'{record["initial"]}..HEAD')
        checks = [
            ('两侧工作均已整合并保留队友提交', at('HEAD', 'feature.txt') == value and at('HEAD', 'team.txt') == 'team=preserved' and e.ancestor(repo, record['remote'], 'HEAD')),
            ('本地主线跟踪 origin/main 且结果已推送', branch == 'main' and g('rev-parse', '--abbrev-ref', '@{upstream}') == 'origin/main' and e.git(remote, 'rev-parse', 'main') == head)]
        if lesson == 'pull-merge':
            checks.extend([
                ('保留本地原提交并生成双亲合并节点', e.ancestor(repo, record['local'], 'HEAD') and len(g('rev-list', '--parents', '-1', 'HEAD').split()) == 3),
                ('本仓库 pull 使用 merge 策略', g('config', '--local', '--bool', 'pull.rebase') == 'false')])
        else:
            checks.append(('本地提交重放到远端之后且历史线性', linear and not e.ancestor(repo, record['local'], 'HEAD') and g('rev-list', '--count', f'{record["remote"]}..HEAD') == '1'))
            checks.append(('本仓库已设置对应的 pull 策略', g('config', '--local', 'pull.ff') == 'only' if lesson == 'pull-ff-only' else g('config', '--local', '--bool', 'pull.rebase') == 'true'))
    elif lesson == 'merge-abort':
        checks = [
            ('main 回到合并前的位置和内容', branch == 'main' and head == record['main'] and at('HEAD', 'feature.txt') == 'main-version'),
            ('功能分支原提交保留', g('rev-parse', 'feature/topic') == record['feature']),
            ('未跟踪草稿保留且没有冲突内容', (repo / 'notes.txt').is_file() and (repo / 'notes.txt').read_text() == 'untracked draft to keep\n' and g('status', '--porcelain') == '?? notes.txt')]
    elif lesson in {'detached-head', 'deleted-branch', 'fsck-recovery'}:
        checks = [
            ('为原来的丢失提交建立 recovered 分支', g('rev-parse', '--verify', 'refs/heads/recovered') == record['lost']),
            ('回到命名分支且工作内容完整', branch == 'recovered' and head == record['lost'] and at('HEAD', 'feature.txt') == value),
            ('main 原历史保持不变', g('rev-parse', 'main') == record['initial'])]
        if lesson == 'fsck-recovery':
            try:
                e.git(repo, 'fsck', '--full')
                healthy = True
            except ValueError:
                healthy = False
            checks.extend([('对象完整且没有损坏', healthy),
                           ('恢复引用后已打包整理对象', bool(list((repo / '.git/objects/pack').glob('*.pack'))))])
    elif lesson == 'blame-log':
        checks = [
            ('定位报告记录真正引入故障的提交', at('HEAD', 'investigation.txt') == 'suspect=' + record['bad']),
            ('修复重试配置且保留其他参数', at('HEAD', 'config.ini') == f'timeout=30\nretries={record["retries"]}\nmode=safe'),
            ('以新提交修复并保留后续文档工作', head != record['tip'] and e.ancestor(repo, record['tip'], 'HEAD') and at('HEAD', 'README.md') == '# 工作项目\n文档版本 3')]
    elif lesson == 'am-conflict':
        checks = [
            ('补丁内容已提交且队友工作保留', at('HEAD', 'feature.txt') == value and at('HEAD', 'team.txt') == 'team=preserved'),
            ('在当前主线之后新增独立补丁提交', e.ancestor(repo, record['main'], 'HEAD') and g('rev-list', '--count', f'{record["main"]}..HEAD') == '1'),
            ('邮件原作者身份被保留', g('log', '-1', '--format=%an%n%ae') == 'Patch Contributor\ncontributor@example.invalid')]
    elif lesson == 'attributes':
        attrs = g('check-attr', '--cached', 'text', 'eol', '--', 'run.sh', 'run.cmd', 'asset.bin')
        checks = [
            ('换行规则已提交且应用到正确路径', bool(at('HEAD', '.gitattributes')) and 'run.sh: eol: lf' in attrs and 'run.cmd: eol: crlf' in attrs and 'asset.bin: text: unset' in attrs),
            ('仓库中的文本均规范化为 LF', at('HEAD', 'run.sh') == '#!/bin/sh\nprintf hello' and at('HEAD', 'run.cmd') == '@echo off\necho hello'),
            ('检出文件遵守各自换行规则', (repo / 'run.sh').read_bytes() == b'#!/bin/sh\nprintf hello\n' and (repo / 'run.cmd').read_bytes() == b'@echo off\r\necho hello\r\n'),
            ('二进制字节保留', (repo / 'asset.bin').read_bytes() == b'\x00binary\r\n\xff' and g('rev-parse', 'HEAD:asset.bin') == g('rev-parse', record['initial'] + ':asset.bin'))]
    if lesson != 'merge-abort':
        checks.append(('工作区与暂存区干净', not g('status', '--porcelain')))
    checks.append(('没有遗留进行中的 Git 操作', not advanced.operation(e, repo)))
    return [{'label': label, 'done': bool(done)} for label, done in checks]
