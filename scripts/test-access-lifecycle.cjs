const assert = require("node:assert/strict");
const path = require("node:path");
const { Runtime, run } = require("../desktop/runtime.cjs");

(async () => {
  const runtime = new Runtime(
    path.resolve(
      process.env.GIT_ONBOARDING_TEST_DATA || ".local/ui-after-wsl-restart",
    ),
    path.resolve("resources"),
  );
  assert.ok(
    await runtime.loadOwner(),
    "Requires an app-owned test environment",
  );
  assert.equal((await runtime.status()).ready, true);
  const processList = () =>
    run(runtime.wsl, [
      "-d",
      runtime.owner.distro,
      "-u",
      "student",
      "--exec",
      "/bin/ps",
      "-eo",
      "args",
    ]);
  const services = async () =>
    (await processList())
      .split("\n")
      .filter((line) => /^python(?:3)? .*serve\.py --start/.test(line.trim()));
  assert.deepEqual(
    await services(),
    [],
    "No existing test service may be disturbed",
  );
  const selected = { lesson: "auth-scope", mode: "guided" };
  await runtime.call({ action: "init", ...selected, reset: true });
  for (let iteration = 0; iteration < 6; iteration++) {
    let output = "";
    try {
      await runtime.startTerminal(
        selected,
        (data) => {
          output += Buffer.from(data, "base64").toString();
        },
        () => {},
      );
      output = "";
      runtime.terminalInput("python ../serve.py --start\r");
      const deadline = Date.now() + 10000;
      while (
        !output.includes("离线 Git HTTP 服务已就绪") &&
        Date.now() < deadline
      )
        await new Promise((resolve) => setTimeout(resolve, 50));
      assert.ok(output.includes("离线 Git HTTP 服务已就绪"), output);
      assert.equal(
        (await services()).length,
        1,
        "Exactly one live service per terminal",
      );
    } finally {
      await runtime.stopTerminal();
    }
    const deadline = Date.now() + 5000;
    while ((await services()).length && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(
      await services(),
      [],
      "Closing the terminal must reap its HTTP service",
    );
  }
  console.log(
    "PASS 6 real PTY HTTP service start/close/reconnect cycles; no child service remains",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
