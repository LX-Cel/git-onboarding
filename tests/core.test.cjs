const { test } = require("node:test");
const assert = require("node:assert/strict");
const { decode, validateSelection } = require("../desktop/runtime.cjs");

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
