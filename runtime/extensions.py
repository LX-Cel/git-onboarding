"""Real SSH signatures and Git LFS objects, using disposable offline practice identities."""
import hashlib
import subprocess
import advanced

IDS = {'ssh-signing', 'lfs-track', 'lfs-migrate', 'history-cleanup'}


def run(repo, args):
    return subprocess.run(args, cwd=repo, capture_output=True, check=True, timeout=30)


def setup(e, repo, base, lesson, mode, record):
    g = lambda *args: e.git(repo, *args)
    record['value'] = value = 'ready' if mode == 'guided' else 'released'
    (repo / 'README.md').write_text('# 扩展工作流\n')
    record['initial'] = e.commit(repo, '建立项目')
    if lesson == 'ssh-signing':
        keys = base / 'keys'
        keys.mkdir(mode=0o700)
        run(repo, ['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'offline-practice-only', '-f', str(keys / 'learner')])
        public = (keys / 'learner.pub').read_text().strip()
        record['publicKey'] = public
        (base / 'expected-signers').write_text('learner@example.invalid ' + public + '\n')
        (repo / 'feature.txt').write_text(value + '\n')
    elif lesson == 'history-cleanup':
        record['secret'] = 'DEMO-NOT-A-REAL-SECRET-' + mode
        (repo / 'credentials.txt').write_text(record['secret'] + '\n')
        record['leak'] = e.commit(repo, '误把假凭据放入历史')
        g('tag', 'v0')
        (repo / 'credentials.txt').unlink()
        (repo / 'feature.txt').write_text(value + '\n')
        record['tip'] = e.commit(repo, '只从当前目录删除凭据')
        remote = base / 'origin.git'
        e.git(base, 'clone', '--bare', str(repo), str(remote))
        g('remote', 'add', 'origin', str(remote))
        g('fetch', 'origin')
        (base / 'remote-before.txt').write_text(record['tip'] + '\n')
        (base / 'tag-before.txt').write_text(record['leak'] + '\n')
    else:
        # Binary fixture; small enough for practice, but tracked by the real LFS clean filter.
        old = (b'OLD-OFFLINE-ASSET\x00' * 4096)
        content = (('ASSET-' + value + '\x00').encode() * 8192)
        if lesson == 'lfs-migrate':
            (repo / 'model.bin').write_bytes(old)
            record['firstAsset'] = e.commit(repo, '直接把首版二进制放入 Git')
            (repo / 'model.bin').write_bytes(content)
            record['unmigrated'] = e.commit(repo, '再次直接提交二进制')
            record['assetOids'] = [hashlib.sha256(old).hexdigest(), hashlib.sha256(content).hexdigest()]
        else:
            record['assetOids'] = [hashlib.sha256(content).hexdigest()]
        record['assetSha'] = hashlib.sha256(content).hexdigest()
        record['assetSize'] = len(content)
        remote = base / 'origin.git'
        e.git(base, 'clone', '--bare', str(repo), str(remote))
        g('remote', 'add', 'origin', remote.as_uri())
        g('fetch', 'origin')
        g('branch', '--set-upstream-to=origin/main', 'main')
        if lesson == 'lfs-track':
            (repo / 'model.bin').write_bytes(content)


def assess(e, repo, base, lesson, mode, record):
    g = lambda *args: e.git(repo, *args, check=False)
    head = g('rev-parse', 'HEAD')
    if lesson == 'ssh-signing':
        def verifies(kind, ref, configured=False):
            try:
                args = [] if configured else ['-c', 'gpg.format=ssh', '-c', 'gpg.ssh.program=/usr/bin/ssh-keygen', '-c', 'gpg.ssh.allowedSignersFile=' + str(base / 'expected-signers')]
                e.git(repo, *args, kind, ref)
                return True
            except ValueError:
                return False
        checks = [
            ('功能已提交且保留原历史', e.text_at(repo, 'HEAD', 'feature.txt') == record['value'] and head != record['initial'] and e.ancestor(repo, record['initial'], 'HEAD')),
            ('提交具有本关练习密钥的有效签名', verifies('verify-commit', 'HEAD')),
            ('发布标签具有有效签名且指向当前提交', g('rev-parse', '--verify', 'refs/tags/v1^{commit}') == head and verifies('verify-tag', 'v1')),
            ('本仓库已配置 SSH 信任并可自行验签', g('config', '--local', 'gpg.format') == 'ssh' and verifies('verify-commit', 'HEAD', True) and verifies('verify-tag', 'v1', True)),
            ('私钥没有进入 Git 历史', not any('PRIVATE KEY' in g('show', oid) for line in g('rev-list', '--objects', '--all').splitlines() if (oid := line.split(' ', 1)[0]) and g('cat-file', '-t', oid) == 'blob'))]
    elif lesson == 'history-cleanup':
        remote = base / 'origin.git'
        def no_sensitive_objects(where):
            # Include unreachable blobs, so deleting a ref alone cannot hide the exercise secret.
            objects = e.git(where, 'cat-file', '--batch-all-objects', '--batch-check=%(objectname) %(objecttype)', check=False).splitlines()
            return bool(objects) and all(record['secret'] not in e.git(where, 'cat-file', 'blob', line.split()[0]) for line in objects if line.endswith(' blob'))
        checks = [
            ('有用功能与初始历史保留', e.text_at(repo, 'HEAD', 'feature.txt') == record['value'] and e.ancestor(repo, record['initial'], 'HEAD')),
            ('本地主线与标签已清除假凭据的全部对象', not e.ancestor(repo, record['leak'], 'HEAD') and bool(g('rev-parse', '--verify', 'refs/tags/v0')) and no_sensitive_objects(repo)),
            ('离线远端主线、标签和对象同步清理', e.git(remote, 'rev-parse', 'main') == head and e.git(remote, 'rev-parse', 'v0') == g('rev-parse', 'v0') and no_sensitive_objects(remote))]
    else:
        pointer = f'version https://git-lfs.github.com/spec/v1\noid sha256:{record["assetSha"]}\nsize {record["assetSize"]}'
        try:
            e.git(repo, 'lfs', 'fsck', '--objects', '--pointers')
            valid_objects = True
        except ValueError:
            valid_objects = False
        remote = base / 'origin.git'
        def stored(oid):
            return any(p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest() == oid for p in (remote / 'lfs/objects').rglob(oid))
        checks = [
            ('提交使用真实 LFS 指针和已提交的属性规则', e.text_at(repo, 'HEAD', 'model.bin') == pointer and 'filter=lfs' in e.text_at(repo, 'HEAD', '.gitattributes')),
            ('工作区保留完整二进制且本地 LFS 对象完整', (repo / 'model.bin').is_file() and hashlib.sha256((repo / 'model.bin').read_bytes()).hexdigest() == record['assetSha'] and valid_objects),
            ('Git 主线与实际 LFS 对象都已上传', e.git(remote, 'rev-parse', 'main') == head and all(stored(oid) for oid in record['assetOids']))]
        if lesson == 'lfs-migrate':
            commits = g('rev-list', 'main').splitlines()
            checks.append(('旧版本二进制也已迁移而非仅转换当前文件', not e.ancestor(repo, record['unmigrated'], 'main') and all(not e.text_at(repo, commit, 'model.bin') or e.text_at(repo, commit, 'model.bin').startswith('version https://git-lfs.github.com/spec/v1\n') for commit in commits)))
    checks.append(('工作区与暂存区干净', not g('status', '--porcelain')))
    checks.append(('没有遗留进行中的 Git 操作', not advanced.operation(e, repo)))
    return [{'label': label, 'done': bool(done)} for label, done in checks]
