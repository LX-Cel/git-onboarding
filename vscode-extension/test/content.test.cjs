"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getLesson,
  guideMarkdown,
  reportMarkdown,
  supportedIds,
} = require("../src/content.cjs");
const sharedLessons = require("../../runtime/lessons.json");

function report(overrides = {}) {
  return reportMarkdown({
    lesson: getLesson("basics"),
    mode: "guided",
    checkedAt: "2026-09-20T10:20:30.000Z",
    snapshot: {
      path: "C:\\Git Practice\\basics\\workspace",
      branch: "main",
      head: "123abcd",
      checks: [{ label: "README 修改已进入提交", done: true }],
      complete: true,
    },
    ...overrides,
  });
}

test("three supported units share original targets and independent lesson objects", () => {
  assert.deepEqual(supportedIds, ["basics", "collab", "recovery"]);
  for (const id of supportedIds) {
    const lesson = getLesson(id);
    const original = sharedLessons.find((item) => item.id === id);
    assert.equal(lesson.target, original.target);
    assert.equal(lesson.challengeTarget, original.challengeTarget);
    assert.equal(lesson.file, original.file);
    assert.deepEqual(
      lesson.steps.map((step) => step.command),
      original.steps.map((step) => step.command),
    );
    lesson.hints[0] = "mutated";
    assert.notEqual(getLesson(id).hints[0], "mutated");
    assert.match(guideMarkdown(getLesson(id)), /Source Control/);
  }
  assert.throws(() => getLesson("rebase"), /暂不支持/);
});

test("challenge hides procedure and only reveals requested cumulative hints", () => {
  const lesson = getLesson("collab");
  const hidden = guideMarkdown(lesson, "challenge");
  assert.match(hidden, /release=6/);
  assert.doesNotMatch(hidden, /release=3/);
  assert.doesNotMatch(hidden, /Git: Merge Branch|git switch|提示 1/);
  const first = guideMarkdown(lesson, "challenge", 1);
  assert.match(first, /提示 1/);
  assert.doesNotMatch(first, /提示 2|Git: Merge Branch/);
  const second = guideMarkdown(lesson, "challenge", 2);
  assert.match(second, /提示 2/);
  assert.doesNotMatch(second, /提示 3/);
  assert.match(guideMarkdown(lesson, "challenge", 99), /提示 3/);
  assert.doesNotMatch(guideMarkdown(lesson, "challenge", -1), /提示 1/);
});

test("report makes completed evidence and check time inspectable", () => {
  const markdown = report();
  assert.match(markdown, /本次检查：全部条件通过/);
  assert.match(markdown, /HEAD：123abcd/);
  assert.match(markdown, /当前分支：main/);
  assert.match(markdown, /10:20:30/);
  assert.match(markdown, /仓库路径：C:/);
  assert.match(markdown, /磁盘状态的检查条件 · 1\/1/);
  assert.match(markdown, /不是历史通关记录/);
});

test("unsaved buffers prevent completion even when disk checks and complete pass", () => {
  const markdown = report({ dirtyFiles: ["README.md"] });
  assert.match(markdown, /本次检查：尚未完成/);
  assert.match(markdown, /有未保存的编辑器内容/);
  assert.match(markdown, /不能据此确认当前编辑已完成/);
  assert.doesNotMatch(markdown, /本次检查：全部条件通过|本次目标已达成/);
});

test("errors, empty checks and failed checks cannot be replaced by prior completion", () => {
  for (const overrides of [
    { error: new Error("Git unavailable") },
    { snapshot: { checks: [], complete: true } },
    {
      snapshot: {
        checks: [{ label: "工作区与暂存区干净", done: false }],
        complete: true,
      },
    },
    {
      snapshot: {
        checks: [{ label: "工作区与暂存区干净", done: "true" }],
        complete: true,
      },
    },
  ]) {
    const markdown = report(overrides);
    assert.doesNotMatch(markdown, /本次检查：全部条件通过|本次目标已达成/);
  }
  assert.match(
    report({ error: new Error("Git unavailable") }),
    /Git unavailable/,
  );
  assert.match(
    report({ snapshot: { error: "blocked", checks: [] } }),
    /未能完成检查/,
  );
});

test("repository and error content cannot inject Markdown links, HTML or sections", () => {
  const malicious =
    "<img src=x> [run](command:workbench.action.terminal.new)\n# forged\n```\nhttps://example.invalid";
  const markdown = report({
    snapshot: {
      path: malicious,
      branch: malicious,
      head: malicious,
      conflicts: [malicious],
      checks: [{ label: malicious, detail: malicious, done: false }],
    },
    dirtyFiles: [malicious],
    error: malicious,
  });
  assert.doesNotMatch(markdown, /<img|\[run\]\(command:|\n# forged|\n```/);
  assert.match(markdown, /&lt;img src=x&gt;/);
  assert.match(markdown, /\\\[run\\\]\\\(command:/);
  assert.match(markdown, /\\# forged/);
});

test("native guide explains exact remote merge and preserves recovery draft", () => {
  const collab = guideMarkdown("collab");
  assert.match(collab, /Git: Merge Branch/);
  assert.match(collab, /origin\/main/);
  assert.match(collab, /推送（Push）/);
  const recovery = guideMarkdown("recovery");
  assert.match(recovery, /取消暂存/);
  assert.match(recovery, /git revert --no-edit HEAD/);
  assert.match(recovery, /错误提交 ID 代替 HEAD/);
  assert.match(recovery, /无需提交它/);
  assert.doesNotMatch(collab + recovery, /\]\(command:/);
});
