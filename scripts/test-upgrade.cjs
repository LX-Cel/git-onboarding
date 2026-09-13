const fs = require("node:fs/promises");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const assert = require("node:assert/strict");
const { Runtime, run } = require("../desktop/runtime.cjs");

(async () => {
  const directory = process.env.GIT_ONBOARDING_UPGRADE_TEST_DATA
    ? path.resolve(process.env.GIT_ONBOARDING_UPGRADE_TEST_DATA)
    : path.resolve(".local/upgrade-fixture", randomBytes(5).toString("hex"));
  await fs.mkdir(directory, { recursive: true });
  const runtime = new Runtime(directory, path.resolve("resources"));
  // Fixture comes from our published v0.1.0. No user's running distro is modified.
  if (!(await runtime.loadOwner())) {
    runtime.owner = {
      distro: "GitOnboarding-" + randomBytes(6).toString("hex"),
      directory: path.join(directory, "linux"),
    };
    await fs.writeFile(runtime.ownerFile, JSON.stringify(runtime.owner));
    await run(
      runtime.wsl,
      [
        "--import",
        runtime.owner.distro,
        runtime.owner.directory,
        path.resolve(".local/runtime-v0.1.0.tar"),
        "--version",
        "2",
      ],
      { timeout: 120000 },
    );
  }
  const oldProbe = await runtime.call({ action: "probe" });
  assert.equal(
    oldProbe.courseVersion,
    undefined,
    "fixture must still be v0.1.0",
  );
  await runtime.call({
    action: "init",
    lesson: "basics",
    mode: "guided",
    reset: true,
  });
  await runtime.call({
    action: "write",
    lesson: "basics",
    mode: "guided",
    path: "README.md",
    content: "# Git 学习手册\n\n今天天气不错。\n\n今天晚餐吃了什么？\n",
  });
  await run(runtime.wsl, [
    "-d",
    runtime.owner.distro,
    "-u",
    "student",
    "--exec",
    "/opt/git-onboarding/sandbox.sh",
    "bash",
    "-c",
    'cd /home/student/labs/basics-guided/workspace && git add README.md && git commit -m "新增了语句"',
  ]);
  const before = await runtime.call({
    action: "state",
    lesson: "basics",
    mode: "guided",
  });
  assert.equal(
    before.complete,
    false,
    "reproduces reported failure in old version",
  );
  const homeMarker = "must retain progress and repo";
  await fs.writeFile(
    path.join(directory, "progress.json"),
    JSON.stringify({ marker: homeMarker }),
  );
  await runtime.call({ action: "init", lesson: "recovery", mode: "challenge" });
  const unfinished = await runtime.call({
    action: "state",
    lesson: "recovery",
    mode: "challenge",
  });
  assert.equal((await runtime.status()).updateRequired, true);
  assert.equal((await runtime.initialize(console.log)).ready, true);
  const after = await runtime.call({
    action: "state",
    lesson: "basics",
    mode: "guided",
  });
  assert.equal(
    Boolean(
      await runtime.toolsCurrent(await runtime.call({ action: "probe" })),
    ),
    true,
    "old runtime receives runnable offline tools",
  );
  assert.equal(after.head, before.head);
  assert.deepEqual(after.history, before.history);
  assert.equal(
    after.complete,
    true,
    "same commits pass after course-only upgrade",
  );
  const retained = await runtime.call({
    action: "state",
    lesson: "recovery",
    mode: "challenge",
  });
  assert.equal(retained.diff, unfinished.diff);
  assert.equal(retained.stagedDiff, unfinished.stagedDiff);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(directory, "progress.json"))).marker,
    homeMarker,
  );
  console.log(
    `PASS v0.1.0 reproducer -> ${require("../package.json").courseVersion} upgrade: commits, staged work, working tree and progress preserved`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
