"""Fetch signed Alpine APKs in a disposable copy of the app image for offline upgrades."""
import hashlib
import json
from pathlib import Path
import subprocess
import re
import sys
from concurrent.futures import ThreadPoolExecutor
import tarfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / 'resources'
WORK = ROOT / '.local/tools-build'


def run(args, **kwargs):
    print('>', ' '.join(map(str, args)), flush=True)
    return subprocess.run(list(map(str, args)), check=True, **kwargs)


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    image = RES / 'runtime.tar'
    manifest = json.loads((RES / 'runtime-manifest.json').read_text(encoding='utf-8'))
    with image.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == manifest['sha256'], 'Base image mismatch'
    if '--resume' in sys.argv:
        owner = json.loads((WORK / 'owner.json').read_text(encoding='utf-8'))
        name, directory = owner['distro'], Path(owner['directory'])
        assert re.fullmatch(r'GitOnboarding-Tools-[a-f0-9]{10}', name) and directory.resolve() == (WORK / name).resolve()
        active = subprocess.run(['wsl.exe', '-d', name, '-u', 'root', '--exec', '/usr/bin/pgrep', '-x', 'apk'], capture_output=True)
        assert active.returncode == 1, 'A previous apk process is still active, or its state could not be inspected'
    else:
        name = 'GitOnboarding-Tools-' + uuid.uuid4().hex[:10]
        directory = WORK / name
        run(['wsl.exe', '--import', name, directory, image, '--version', '2'])
        (WORK / 'owner.json').write_text(json.dumps({'distro': name, 'directory': str(directory)}), encoding='utf-8')
        run(['wsl.exe', '-d', name, '-u', 'root', '--exec', '/sbin/apk', 'update'], timeout=180)
    urls = subprocess.check_output(['wsl.exe', '-d', name, '-u', 'root', '--exec', '/sbin/apk', 'fetch', '--simulate', '--url', '--recursive', 'git-lfs', 'openssh-keygen', 'git-filter-repo']).decode().splitlines()
    downloads = WORK / 'apks'
    downloads.mkdir(exist_ok=True)
    def download(url):
        assert re.fullmatch(r'https://dl-cdn\.alpinelinux\.org/alpine/v[0-9.]+/(main|community)/x86_64/[A-Za-z0-9_.+~-]+\.apk', url), 'Unexpected APK source'
        destination = downloads / url.rsplit('/', 1)[1]
        run(['curl.exe', '--fail', '--silent', '--show-error', '--location', '--retry', '2', '--connect-timeout', '20', '--max-time', '180', url, '--output', destination])
        return destination
    with ThreadPoolExecutor(max_workers=6) as pool:
        packages = list(pool.map(download, urls))
    artifact = RES / 'runtime-tools.tar'
    with tarfile.open(artifact, 'w', format=tarfile.USTAR_FORMAT) as archive:
        for package in sorted(packages):
            archive.add(package, arcname=package.name)
    run(['wsl.exe', '-d', name, '-u', 'root', '--exec', '/bin/mkdir', '-p', '/tmp/tool-packages'])
    run(['wsl.exe', '-d', name, '-u', 'root', '--exec', '/bin/tar', '-xf', '-', '-C', '/tmp/tool-packages'], input=artifact.read_bytes())
    script = '''set -eu
apk add --no-network /tmp/tool-packages/*.apk
git lfs version
git filter-repo --version
ssh-keygen -q -t ed25519 -N '' -f /tmp/tool-probe-key
ssh-keygen -lf /tmp/tool-probe-key.pub
'''
    run(['wsl.exe', '-d', name, '-u', 'root', '--exec', '/bin/sh', '-s'], input=script.encode(), timeout=180)
    files = {}
    with tarfile.open(artifact, 'r:') as archive:
        for item in archive:
            assert item.isfile() and '/' not in item.name and item.name.endswith('.apk'), 'Unexpected package member'
            data = archive.extractfile(item).read()
            files[item.name] = {'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data)}
    data = {'schema': 1, 'sha256': hashlib.sha256(artifact.read_bytes()).hexdigest(), 'size': artifact.stat().st_size,
            'source': 'Signed APKs fetched from the app image Alpine repositories; signatures verified by apk add', 'files': files}
    (RES / 'runtime-tools.json').write_text(json.dumps(data, indent=2)+'\n', encoding='utf-8')
    # Only this invocation's UUID distribution is removed, after verified artifact creation.
    run(['wsl.exe', '--unregister', name])
    print('Offline tools ready:', data['sha256'], data['size'], 'bytes', flush=True)


if __name__ == '__main__':
    main()
