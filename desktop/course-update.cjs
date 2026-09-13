// Runs only as explicit root inside our owned WSL distro. Never accepts renderer paths.
const APPLY_COURSES = String.raw`
import base64, hashlib, json, os, pathlib, sys, tempfile
payload = json.loads(sys.stdin.buffer.read(1048576))
assert set(payload['files']) == {'lessons.json', 'advanced.py', 'maintenance.py', 'teamwork.py', 'relay.py', 'engine.py'}, 'Unexpected course files'
base = pathlib.Path('/opt/git-onboarding')
assert base.resolve() == base and base.stat().st_uid == 0 and not base.stat().st_mode & 0o022, 'Unsafe course directory'
decoded = {}
for name in ['lessons.json', 'advanced.py', 'maintenance.py', 'teamwork.py', 'relay.py', 'engine.py']:
    item = payload['files'][name]
    data = base64.b64decode(item['data'], validate=True)
    assert hashlib.sha256(data).hexdigest() == item['sha256'], 'Course hash mismatch'
    decoded[name] = data
json.loads(decoded['lessons.json'])
compile(decoded['engine.py'], 'engine.py', 'exec')
compile(decoded['advanced.py'], 'advanced.py', 'exec')
compile(decoded['maintenance.py'], 'maintenance.py', 'exec')
compile(decoded['teamwork.py'], 'teamwork.py', 'exec')
compile(decoded['relay.py'], 'relay.py', 'exec')
with tempfile.TemporaryDirectory(prefix='course-update-', dir='/opt') as staging:
    for name, data in decoded.items():
        target = pathlib.Path(staging) / name
        target.write_bytes(data)
        target.chmod(0o644)
    # Publish the versioned engine last. On interruption, startup still detects an old version.
    for name in ['lessons.json', 'advanced.py', 'maintenance.py', 'teamwork.py', 'relay.py', 'engine.py']:
        os.replace(pathlib.Path(staging) / name, base / name)
print('Course code updated; student home untouched')
`;
module.exports = { APPLY_COURSES };
