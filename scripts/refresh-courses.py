"""Refresh trusted course code inside an already verified rootfs; keep OS packages fixed."""
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[1]
res = ROOT / 'resources'
version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
manifest = json.loads((res / 'runtime-manifest.json').read_text(encoding='utf-8'))
image = res / 'runtime.tar'
with image.open('rb') as stream:
    assert hashlib.file_digest(stream, 'sha256').hexdigest() == manifest['sha256'], 'Base image hash mismatch'
files = {name: (ROOT / 'runtime' / name).read_bytes().replace(b'\r\n', b'\n') for name in ['lessons.json', 'engine.py']}
compile(files['engine.py'], 'engine.py', 'exec')
json.loads(files['lessons.json'])
update = {'version': version, 'files': {name: {'data': base64.b64encode(data).decode(),
           'sha256': hashlib.sha256(data).hexdigest()} for name, data in files.items()}}
(res / 'course-update.json').write_text(json.dumps(update, indent=2) + '\n', encoding='utf-8', newline='\n')
temporary = res / 'runtime.tar.pending'
targets = {f'opt/git-onboarding/{name}' for name in files}
with tarfile.open(image, 'r:') as src, tarfile.open(temporary, 'w:') as dst:
    for item in src:
        if item.name.lstrip('./') not in targets:
            dst.addfile(item, src.extractfile(item) if item.isfile() else None)
    for name, data in files.items():
        item = tarfile.TarInfo(f'opt/git-onboarding/{name}')
        item.size, item.mode, item.uid, item.gid = len(data), 0o644, 0, 0
        dst.addfile(item, io.BytesIO(data))
temporary.replace(image)
with image.open('rb') as stream:
    manifest['sha256'] = hashlib.file_digest(stream, 'sha256').hexdigest()
manifest['version'] = version
(res / 'runtime-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
print('Verified base retained; course update and image prepared:', version, manifest['sha256'])
