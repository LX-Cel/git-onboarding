"""Build a bundled, app-owned WSL rootfs. Never modifies an existing distribution."""
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / 'resources'
WORK = ROOT / '.local' / 'runtime-build'

def run(args, **kwargs):
    print('>', ' '.join(map(str, args)), flush=True)
    return subprocess.run(list(map(str, args)), check=True, **kwargs)

def download(url, target):
    run(['curl.exe', '--fail', '--location', '--retry', '3', '--connect-timeout', '20',
         '--max-time', '180', url, '--output', target])

def main():
    RES.mkdir(exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    # Stable upstream release metadata is only used at build time. The final image is hash-pinned.
    metadata = WORK / 'releases.yaml'
    download('https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/x86_64/latest-releases.yaml', metadata)
    source = metadata.read_text()
    entries = re.split(r'(?m)^-\s*\n', source)
    entry = next(e for e in entries if re.search(r'(?m)^\s*flavor: alpine-minirootfs\s*$', e))
    filename = re.search(r'(?m)^\s*file: (\S+)', entry).group(1)
    expected = re.search(r'(?m)^\s*sha256: (\S+)', entry).group(1)
    if not re.fullmatch(r'alpine-minirootfs-[0-9.]+-x86_64.tar.gz', filename):
        raise RuntimeError('Unexpected upstream image filename')
    archive = WORK / filename
    download(f'https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/x86_64/{filename}', archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        raise RuntimeError('Alpine SHA256 mismatch')
    injected = WORK / 'bootstrap.tar'
    with tarfile.open(archive, 'r:gz') as src, tarfile.open(injected, 'w') as dst:
        for item in src:
            if item.name.lstrip('./') == 'etc/wsl.conf':
                continue
            dst.addfile(item, src.extractfile(item) if item.isfile() else None)
        # Disable host mounts and interop before the first launch. Setup runs as explicit root.
        conf = (ROOT / 'runtime/wsl.conf').read_bytes().replace(b'default=student', b'default=root')
        info = tarfile.TarInfo('etc/wsl.conf')
        info.size, info.mode = len(conf), 0o644
        dst.addfile(info, io.BytesIO(conf))
        for file in (ROOT / 'runtime').iterdir():
            if file.is_file():
                data = file.read_bytes().replace(b'\r\n', b'\n')
                info = tarfile.TarInfo(f'opt/git-onboarding/{file.name}')
                info.size, info.mode = len(data), 0o755 if file.suffix == '.sh' else 0o644
                dst.addfile(info, io.BytesIO(data))
    name = 'GitOnboarding-Build-' + uuid.uuid4().hex[:10]
    install = WORK / name
    run(['wsl.exe', '--import', name, install, injected, '--version', '2'])
    # Record provenance immediately so a failed build can be cleaned deliberately.
    (WORK / 'owner.json').write_text(json.dumps({'distro': name, 'directory': str(install)}))
    run(['wsl.exe', '-d', name, '-u', 'root', '--exec', '/bin/sh', '/opt/git-onboarding/setup.sh'])
    run(['wsl.exe', '--terminate', name])
    probe = subprocess.check_output(['wsl.exe', '-d', name, '-u', 'student', '--exec',
                                    '/opt/git-onboarding/sandbox.sh', 'python3',
                                    '/opt/git-onboarding/engine.py'], input=b'{"action":"probe"}')
    print(probe.decode('utf-8', errors='replace'))
    result = json.loads(probe)['result']
    if result['uid'] != 1000 or any(result[k] for k in ('windowsMount', 'interop', 'initVisible')):
        raise RuntimeError('Isolation smoke test failed')
    run(['wsl.exe', '--terminate', name])
    image = RES / 'runtime.tar'
    if image.exists():
        image.unlink()
    run(['wsl.exe', '--export', name, image])
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    manifest = {'schema': 1, 'version': version, 'architecture': 'x64', 'source': filename,
                'sourceSha256': expected, 'sha256': hashlib.file_digest(image.open('rb'), 'sha256').hexdigest(),
                'git': result['git']}
    (RES / 'runtime-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    # Only the UUID distribution imported by this invocation is removed, after successful export.
    run(['wsl.exe', '--unregister', name])
    run([__import__('sys').executable, ROOT / 'scripts/refresh-courses.py'])
    print('Runtime ready:', image, flush=True)

if __name__ == '__main__':
    main()
