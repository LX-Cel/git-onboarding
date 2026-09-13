const assert = require("node:assert/strict");
const path = require("node:path");
const { Runtime, run } = require("../desktop/runtime.cjs");
const { APPLY_TOOLS } = require("../desktop/tool-update.cjs");

(async () => {
  const runtime = new Runtime(
    path.resolve(
      process.env.GIT_ONBOARDING_TEST_DATA_DIR || ".local/ui-after-wsl-restart",
    ),
    path.resolve("resources"),
  );
  if (!(await runtime.loadOwner()))
    throw new Error("An initialized app-owned test environment is required");
  const probe = await runtime.call({ action: "probe" });
  assert.equal(Boolean(await runtime.toolsCurrent(probe)), true);
  const script = `import hashlib, io, json, pathlib, subprocess, tarfile
installer = ${JSON.stringify(APPLY_TOOLS)}
marker = pathlib.Path('/opt/git-onboarding/tools-installed.json')
before = marker.read_bytes()
cases = [('traversal', 'Invalid APK member'), ('symlink', 'Invalid APK member'), ('duplicate', 'duplicate APK'), ('hash', 'APK hash mismatch'), ('missing', 'Missing APKs'), ('archive', 'Tools archive hash mismatch')]
for kind, message in cases:
    output = io.BytesIO()
    name = '../git-onboarding-unexpected.apk' if kind == 'traversal' else 'fixture.apk'
    payload = b'not-a-package'
    with tarfile.open(fileobj=output, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for _ in range(2 if kind == 'duplicate' else 1):
            entry = tarfile.TarInfo(name)
            entry.size = len(payload)
            if kind == 'symlink':
                entry.type = tarfile.SYMTYPE
                entry.linkname = '/etc/passwd'
                entry.size = 0
                archive.addfile(entry)
            else:
                archive.addfile(entry, io.BytesIO(payload))
    data = output.getvalue()
    files = {name: {'size': len(payload), 'sha256': '0'*64 if kind == 'hash' else hashlib.sha256(payload).hexdigest()}}
    if kind == 'missing': files['missing.apk'] = files[name]
    manifest = {'schema': 1, 'size': len(data), 'sha256': '0'*64 if kind == 'archive' else hashlib.sha256(data).hexdigest(), 'files': files}
    result = subprocess.run(['/usr/bin/python3', '-I', '-c', installer, json.dumps(manifest)], input=data, capture_output=True)
    assert result.returncode != 0 and message in result.stderr.decode(), (kind, result.stderr)
    assert marker.read_bytes() == before
    assert not pathlib.Path('/opt/git-onboarding-unexpected.apk').exists()
    print('PASS tools reject', kind, flush=True)
print('PASS 6 malformed archives rejected before installation; trusted tools marker unchanged')
`;
  console.log(
    await run(
      runtime.wsl,
      [
        "-d",
        runtime.owner.distro,
        "-u",
        "root",
        "--exec",
        "/usr/bin/python3",
        "-I",
        "-",
      ],
      { input: script, timeout: 60000 },
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
