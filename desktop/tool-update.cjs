// Executed only by the trusted main process as root in its owned WSL distribution.
const APPLY_TOOLS = String.raw`
import hashlib, io, json, os, pathlib, re, subprocess, sys, tarfile, tempfile
os.environ['PATH'] = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
os.environ['GIT_CONFIG_GLOBAL'] = '/dev/null'
os.environ['GIT_CONFIG_NOSYSTEM'] = '1'
manifest = json.loads(sys.argv[1])
assert manifest['schema'] == 1 and 0 < manifest['size'] <= 134217728, 'Invalid tools manifest'
data = sys.stdin.buffer.read(manifest['size'] + 1)
assert len(data) == manifest['size'] and hashlib.sha256(data).hexdigest() == manifest['sha256'], 'Tools archive hash mismatch'
base = pathlib.Path('/opt/git-onboarding')
assert base.resolve() == base and base.stat().st_uid == 0 and not base.stat().st_mode & 0o022, 'Unsafe course directory'
with tempfile.TemporaryDirectory(prefix='git-onboarding-tools-', dir='/opt') as staging:
    target = pathlib.Path(staging)
    seen = set()
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:') as archive:
        for member in archive:
            name = member.name
            assert member.isfile() and re.fullmatch(r'[A-Za-z0-9_.+~-]+\.apk', name), 'Invalid APK member'
            assert name not in seen and name in manifest['files'], 'Unexpected or duplicate APK'
            expected = manifest['files'][name]
            assert member.size == expected['size'], 'APK size mismatch'
            content = archive.extractfile(member).read()
            assert hashlib.sha256(content).hexdigest() == expected['sha256'], 'APK hash mismatch'
            (target / name).write_bytes(content)
            seen.add(name)
    assert seen == set(manifest['files']), 'Missing APKs'
    # APK signatures use the distribution's trusted keys. No allow-untrusted or network.
    subprocess.run(['apk', 'add', '--no-network', *[str(target / name) for name in sorted(seen)]], check=True, timeout=120)
    subprocess.run(['git', 'lfs', 'version'], check=True, timeout=15)
    subprocess.run(['git', 'filter-repo', '--version'], check=True, timeout=15)
    subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(target / 'probe-key')], check=True, timeout=15)
    marker = base / 'tools-installed.json'
    temporary = base / 'tools-installed.pending'
    temporary.write_text(json.dumps({'sha256': manifest['sha256']}))
    temporary.chmod(0o644)
    temporary.replace(marker)
print('Offline tools installed; student home preserved')
`;
module.exports = { APPLY_TOOLS };
