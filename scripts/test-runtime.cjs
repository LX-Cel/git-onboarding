const path = require("node:path");
const fs = require("node:fs/promises");
const assert = require("node:assert/strict");
const { Runtime, run } = require("../desktop/runtime.cjs");

(async () => {
  const manifest = JSON.parse(
    await fs.readFile(path.resolve("resources/runtime-manifest.json"), "utf8"),
  );
  const runtime = new Runtime(
    process.env.GIT_ONBOARDING_TEST_DATA_DIR
      ? path.resolve(process.env.GIT_ONBOARDING_TEST_DATA_DIR)
      : path.resolve(".local/test-data", manifest.sha256.slice(0, 12)),
    path.resolve("resources"),
  );
  const status = await runtime.initialize(console.log);
  assert.equal(status.ready, true);
  const script = await fs.readFile(
    path.resolve("tests/runtime_checks.py"),
    "utf8",
  );
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
      { input: script, timeout: 120000 },
    ),
  );
  await runtime.call({
    action: "init",
    lesson: "basics",
    mode: "guided",
    reset: true,
  });
  let output = "";
  runtime.startTerminal(
    { lesson: "basics", mode: "guided" },
    (data) => {
      output += Buffer.from(data, "base64").toString();
    },
    console.log,
  );
  const until = async (predicate, message) => {
    const deadline = Date.now() + 12000;
    while (!predicate() && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(predicate(), message + "\n" + output);
  };
  try {
    await until(
      () => output.includes("basics-guided/workspace"),
      "PTY should enter lesson directory",
    );
    runtime.terminalResize({ rows: 37, cols: 111 });
    runtime.terminalInput(
      "stty size; printf '\\120\\124\\131\\137\\117\\113\\n'\r",
    );
    await until(
      () => output.includes("37 111") && output.includes("PTY_OK"),
      "PTY supports resize and shell command execution",
    );
    runtime.terminalInput("sleep 30\r");
    await new Promise((resolve) => setTimeout(resolve, 300));
    runtime.terminalInput("\x03");
    runtime.terminalInput(
      "printf '\\103\\124\\122\\114\\137\\103\\137\\117\\113\\n'\r",
    );
    await until(
      () => output.includes("CTRL_C_OK"),
      "Ctrl+C interrupts running process",
    );
    console.log("PASS real PTY: directory, Bash, resize, Ctrl+C");
  } finally {
    runtime.stopTerminal();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
