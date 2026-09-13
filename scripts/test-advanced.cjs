// Use an existing app-owned test distro, with temporary source and labs only.
const fs = require("node:fs/promises");
const path = require("node:path");
const { Runtime, run } = require("../desktop/runtime.cjs");

(async () => {
  const directory =
    process.env.GIT_ONBOARDING_TEST_DATA || ".local/ui-after-wsl-restart";
  const runtime = new Runtime(
    path.resolve(directory),
    path.resolve("resources"),
  );
  if (!(await runtime.loadOwner()))
    throw new Error(
      "Set GIT_ONBOARDING_TEST_DATA to an initialized test environment",
    );
  const files = {};
  for (const name of [
    "engine.py",
    "advanced.py",
    "maintenance.py",
    "teamwork.py",
    "foundations.py",
    "hosting.py",
    "relay.py",
    "lessons.json",
  ])
    files[name] = (await fs.readFile(path.resolve("runtime", name))).toString(
      "base64",
    );
  const suite = process.argv.includes("--foundations")
    ? "foundations_checks.py"
    : process.argv.includes("--hosting")
      ? "hosting_checks.py"
      : process.argv.includes("--teamwork")
        ? "teamwork_checks.py"
        : process.argv.includes("--maintenance")
          ? "maintenance_checks.py"
          : "advanced_checks.py";
  const test = (await fs.readFile(path.join("tests", suite))).toString(
    "base64",
  );
  const script = `import base64, json, os, pathlib, tempfile\nwith tempfile.TemporaryDirectory(prefix='course-test-') as directory:\n for name, data in json.loads(${JSON.stringify(JSON.stringify(files))}).items():\n  (pathlib.Path(directory)/name).write_bytes(base64.b64decode(data))\n os.environ['COURSE_TEST_DIR']=directory\n exec(compile(base64.b64decode(${JSON.stringify(test)}), 'advanced_checks.py', 'exec'))\n`;
  console.log(
    await run(
      runtime.wsl,
      [
        "-d",
        runtime.owner.distro,
        "-u",
        "student",
        "--exec",
        "/opt/git-onboarding/sandbox.sh",
        "python3",
        "-",
      ],
      { input: script, timeout: 180000 },
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
