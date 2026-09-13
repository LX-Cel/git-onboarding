const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  Runtime,
  decode,
  validateSelection,
  isWslMissing,
} = require("../desktop/runtime.cjs");
const { validScale } = require("../desktop/display.cjs");
test(
  "desktop-only upgrades reuse compatible courses but still reject old courses",
  {
    skip: process.platform !== "win32" || process.arch !== "x64",
  },
  async () => {
    const runtime = new Runtime("unused", "unused");
    runtime.owner = { distro: "test-owned-distro" };
    runtime.loadOwner = async () => runtime.owner;
    runtime.registered = async () => [runtime.owner.distro];
    let courseVersion = require("../package.json").courseVersion;
    let courseHashes = { "engine.py": "expected-hash" };
    runtime.coursePayload = async () => ({
      version: require("../package.json").courseVersion,
      files: { "engine.py": { sha256: "expected-hash" } },
    });
    runtime.call = async () => ({
      uid: 1000,
      courseVersion,
      courseHashes,
      git: "test Git",
      windowsMount: false,
      interop: false,
      initVisible: false,
    });
    assert.equal((await runtime.status()).ready, true);
    courseHashes = { "engine.py": "stale-hash" };
    assert.equal(
      (await runtime.status()).updateRequired,
      true,
      "same version with stale content must update",
    );
    courseHashes = undefined;
    assert.equal(
      (await runtime.status()).updateRequired,
      true,
      "old engines without fingerprints must update",
    );
    courseVersion = "0.1.1";
    const outdated = await runtime.status();
    assert.equal(outdated.ready, false);
    assert.equal(outdated.updateRequired, true);
  },
);
test("display scaling is bounded and supports up to 200%", () => {
  for (const value of [1, 1.25, 1.5, 2]) assert.equal(validScale(value), value);
  for (const value of [0, -1, 99, "2", NaN])
    assert.throws(() => validScale(value));
});
test("WSL timeouts and service failures never trigger component installation", async () => {
  for (const message of [
    "操作超时",
    "WSL service unavailable",
    "Access denied",
  ]) {
    const failure = new Error(message);
    assert.equal(isWslMissing(failure), false);
    if (process.platform === "win32" && process.arch === "x64") {
      const runtime = new Runtime("unused", "unused");
      runtime.registered = async () => {
        throw failure;
      };
      await assert.rejects(runtime.initialize(), (error) => error === failure);
      assert.equal(runtime.initializing, false);
    }
  }
  assert.equal(
    isWslMissing({ code: "ENOENT", message: "missing executable" }),
    true,
  );
  assert.equal(
    isWslMissing(new Error("Wsl/WSL_E_WSL_OPTIONAL_COMPONENT_REQUIRED")),
    true,
  );
});

test("selection rejects unknown lessons, modes and traversal", () => {
  for (const value of [
    null,
    {},
    { lesson: "../Ubuntu", mode: "guided" },
    { lesson: "basics", mode: ";rm -rf" },
  ]) {
    assert.throws(() => validateSelection(value));
  }
  assert.deepEqual(
    validateSelection({ lesson: "collab", mode: "challenge", extra: true }),
    { lesson: "collab", mode: "challenge" },
  );
});
test("WSL UTF-16 status output and UTF-8 Linux output decode correctly", () => {
  assert.equal(decode(Buffer.from("Ubuntu\r\n", "utf16le")), "Ubuntu\r\n");
  assert.equal(decode(Buffer.from("真实 Git")), "真实 Git");
  assert.equal(
    decode(
      Buffer.concat([
        Buffer.from("wsl: 代理提示\r\n", "utf16le"),
        Buffer.from("Traceback: 真实错误\n"),
      ]),
    ),
    "wsl: 代理提示\r\nTraceback: 真实错误\n",
  );
});
test("graph connects merge commits to their real parents", async () => {
  const { layoutGraph } = await import("../src/graph.js");
  const graph = layoutGraph([
    { hash: "merge", parents: ["feature", "team"] },
    { hash: "feature", parents: ["base"] },
    { hash: "team", parents: ["base"] },
    { hash: "base", parents: [] },
  ]);
  assert.equal(graph.edges.length, 4);
  assert.notEqual(graph.nodes[1].lane, graph.nodes[2].lane);
  assert.deepEqual(
    graph.edges.filter((e) => e.from.hash === "merge").map((e) => e.to.hash),
    ["feature", "team"],
  );
});
