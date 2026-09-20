"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { coachModel, coachHtml } = require("../src/coach.cjs");
const { getLesson } = require("../src/content.cjs");

const nonce = "a-valid_nonce-123456";
const model = (overrides) =>
  coachModel({ lesson: getLesson("basics"), mode: "guided", ...overrides });
const passedState = {
  complete: true,
  checks: [
    {
      label: "README 修改已进入提交",
      done: true,
      detail: "提交中的正文已修改。",
    },
    { label: "工作区与暂存区干净", done: true },
  ],
};

test("all introductory lessons provide four actionable native interaction steps", () => {
  for (const id of ["basics", "collab", "recovery"]) {
    for (let step = 0; step < 4; step++) {
      const value = model({ lesson: getLesson(id), step });
      assert.equal(value.total, 4);
      assert.ok(value.currentStep.do.length >= 2);
      assert.ok(value.currentStep.where);
      assert.ok(value.currentStep.observe.length >= 2);
      assert.ok(value.currentStep.meaning);
      const html = coachHtml(value, nonce);
      assert.match(html, /现在做什么/);
      assert.match(html, /在哪里操作/);
      assert.match(html, /完成后你会看到/);
    }
  }
  assert.match(model({ step: 2 }).currentStep.where, /README.md.*\+/);
  assert.match(
    model({ lesson: getLesson("collab"), step: 2 }).currentStep.do.join(" "),
    /origin\/main/,
  );
  assert.match(
    model({ lesson: getLesson("recovery"), step: 2 }).currentStep.meaning,
    /不会撤销文件正文/,
  );
});

test("navigation is manual and never substitutes for real Git assessment", () => {
  const finished = model({ snapshot: passedState, step: 0 });
  assert.equal(finished.complete, true);
  assert.equal(finished.step, 0);
  assert.equal(finished.currentStep.title, "找到你的练习仓库");
  const lastStep = model({
    step: 3,
    snapshot: { checks: [{ label: "提交", done: false }] },
  });
  assert.equal(lastStep.complete, false);
  assert.equal(lastStep.checks[0].done, false);
  assert.match(coachHtml(lastStep, nonce), /翻到最后一步不会自动通关/);
  assert.equal(model({ step: 99 }).step, 3);
  assert.equal(model({ step: -3 }).step, 0);
  assert.equal(model({ step: Infinity }).step, 0);
});

test("challenge omits all step instructions and reveals only selected hints", () => {
  const lesson = getLesson("collab");
  const challenge = model({ lesson, mode: "challenge" });
  assert.equal(challenge.steps.length, 0);
  assert.equal(challenge.currentStep, null);
  assert.equal(challenge.target, lesson.challengeTarget);
  assert.equal(challenge.hints.length, 0);
  const html = coachHtml(challenge, nonce);
  assert.doesNotMatch(
    html,
    /Git: Merge Branch|data-action="next"|data-action="step"|现在做什么/,
  );
  assert.match(html, /release=6/);
  const first = model({ lesson, mode: "challenge", hintLevel: 1 });
  assert.deepEqual(first.hints, lesson.hints.slice(0, 1));
  assert.doesNotMatch(coachHtml(first, nonce), /Git: Merge Branch/);
  assert.equal(
    model({ lesson, mode: "challenge", hintLevel: 999 }).hints.length,
    3,
  );
  assert.equal(
    model({ lesson, mode: "challenge", hintLevel: -1 }).hints.length,
    0,
  );
});

test("unsaved buffers and failed checks cannot produce a completion claim", () => {
  for (const overrides of [
    { snapshot: passedState, dirtyFiles: ["README.md"] },
    { snapshot: passedState, error: new Error("Git unavailable") },
    { snapshot: { complete: true, checks: [] } },
    {
      snapshot: {
        complete: true,
        checks: [{ label: "not a boolean", done: "true" }],
      },
    },
  ]) {
    const value = model(overrides);
    assert.equal(value.complete, false);
    assert.doesNotMatch(coachHtml(value, nonce), /本次目标已达成/);
  }
  assert.match(
    coachHtml(
      model({ snapshot: passedState, dirtyFiles: ["README.md"] }),
      nonce,
    ),
    /先处理未保存的编辑/,
  );
  assert.match(
    coachHtml(model({ snapshot: { error: "failed", checks: [] } }), nonce),
    /检查暂时无法完成/,
  );
});

test("untrusted repository content stays text and CSP permits only nonce assets", () => {
  const payload =
    '</p><script>attack()</script><button onclick="attack()">[run](command:bad)</button>';
  const lesson = getLesson("basics");
  lesson.title = payload;
  lesson.target = payload;
  lesson.hints[0] = payload;
  const html = coachHtml(
    model({
      lesson,
      hintLevel: 1,
      dirtyFiles: [payload],
      error: payload,
      snapshot: {
        path: payload,
        branch: payload,
        head: payload,
        checks: [{ label: payload, detail: payload, done: false }],
      },
    }),
    nonce,
  );
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.doesNotMatch(html, /<script>attack|<button onclick=/);
  assert.match(html, /&lt;script&gt;attack\(\)&lt;\/script&gt;/);
  assert.match(
    html,
    /default-src 'none'; style-src 'nonce-a-valid_nonce-123456'; script-src 'nonce-a-valid_nonce-123456'/,
  );
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|https?:\/\//);
  assert.throws(() => coachHtml(model(), "bad'; script-src *"), /nonce/);
});

test("static webview bridge only emits permitted navigation and tool entry actions", () => {
  const html = coachHtml(model(), nonce);
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
  const posted = [];
  let listener;
  vm.runInNewContext(script, {
    acquireVsCodeApi: () => ({
      getState: () => ({}),
      setState() {},
      postMessage: (message) =>
        posted.push(JSON.parse(JSON.stringify(message))),
    }),
    document: {
      getElementById: (id) =>
        id === "git-coach"
          ? { dataset: { step: "0" } }
          : { scrollIntoView() {} },
      addEventListener: (name, callback) => {
        assert.equal(name, "click");
        listener = callback;
      },
    },
  });
  const click = (action, step, disabled = false) =>
    listener({
      target: { closest: () => ({ dataset: { action, step }, disabled }) },
    });
  click("check");
  click("step", "2");
  click("terminal");
  click("git.reset");
  click("step", "4");
  click("step", "-1");
  click("step", "0.5");
  click("next", undefined, true);
  assert.deepEqual(posted, [
    { action: "check" },
    { action: "step", step: 2 },
    { action: "terminal" },
  ]);
  assert.doesNotMatch(script, /executeCommand|sendText|innerHTML|eval\(/);
});

function navigationBridge({
  step = 0,
  savedState = {},
  readyState = "complete",
} = {}) {
  const script = coachHtml(model({ step }), nonce).match(
    /<script nonce="[^"]+">([\s\S]*?)<\/script>/,
  )[1];
  let state = structuredClone(savedState);
  let click;
  let load;
  const frames = [];
  const scrolls = [];
  const messages = [];
  vm.runInNewContext(script, {
    acquireVsCodeApi: () => ({
      getState: () => state,
      setState: (value) => {
        state = JSON.parse(JSON.stringify(value));
      },
      postMessage: (value) => messages.push(JSON.parse(JSON.stringify(value))),
    }),
    document: {
      readyState,
      getElementById: (id) =>
        id === "git-coach"
          ? { dataset: { step: String(step) } }
          : {
              scrollIntoView: (value) =>
                scrolls.push(JSON.parse(JSON.stringify(value))),
            },
      addEventListener: (event, listener) => {
        if (event === "click") click = listener;
      },
    },
    window: {
      addEventListener: (event, listener) => {
        if (event === "load") load = listener;
      },
    },
    requestAnimationFrame: (callback) => frames.push(callback),
  });
  return {
    state: () => state,
    scrolls,
    messages,
    click: (action, selected) =>
      click({
        target: {
          closest: () => ({
            dataset: { action, step: String(selected) },
            disabled: false,
          }),
        },
      }),
    load: () => load?.(),
    frame: () => frames.shift()?.(),
    frameCount: () => frames.length,
  };
}

test("manual navigation remembers its target and scrolls once after the new frame loads", () => {
  const oldFrame = navigationBridge({
    step: 0,
    savedState: { unrelated: "preserved" },
  });
  oldFrame.click("next");
  assert.deepEqual(oldFrame.state(), {
    unrelated: "preserved",
    coachScrollStep: 1,
  });
  assert.deepEqual(oldFrame.messages, [{ action: "next" }]);
  assert.equal(oldFrame.scrolls.length, 0);
  const newFrame = navigationBridge({
    step: 1,
    savedState: oldFrame.state(),
    readyState: "loading",
  });
  assert.deepEqual(newFrame.state(), { unrelated: "preserved" });
  assert.equal(newFrame.frameCount(), 0);
  newFrame.load();
  newFrame.frame();
  assert.equal(newFrame.scrolls.length, 0);
  newFrame.frame();
  assert.deepEqual(newFrame.scrolls, [{ block: "start", behavior: "auto" }]);
  const ordinaryRefresh = navigationBridge({
    step: 1,
    savedState: newFrame.state(),
  });
  assert.equal(ordinaryRefresh.frameCount(), 0);
  assert.equal(ordinaryRefresh.scrolls.length, 0);
});

test("non-navigation actions keep reading position and explicit step selection is bounded", () => {
  for (const action of [
    "check",
    "hint",
    "sourceControl",
    "terminal",
    "openFile",
  ]) {
    const bridge = navigationBridge({ step: 2, savedState: { unrelated: 7 } });
    bridge.click(action);
    assert.deepEqual(bridge.state(), { unrelated: 7 });
    assert.equal(bridge.frameCount(), 0);
    assert.equal(bridge.scrolls.length, 0);
  }
  const previous = navigationBridge({ step: 2 });
  previous.click("previous");
  assert.equal(previous.state().coachScrollStep, 1);
  const selected = navigationBridge({ step: 2 });
  selected.click("step", 0);
  assert.equal(selected.state().coachScrollStep, 0);
  const same = navigationBridge({ step: 2 });
  same.click("step", 2);
  assert.equal(same.scrolls.length, 1);
  assert.deepEqual(same.state(), {});
  const beforeTarget = navigationBridge({
    step: 0,
    savedState: { coachScrollStep: 1 },
  });
  assert.equal(beforeTarget.state().coachScrollStep, 1);
  assert.equal(beforeTarget.frameCount(), 0);
});

test("core action buttons are visible before lengthy step instructions", () => {
  const html = coachHtml(model({ step: 1 }), nonce);
  const heading = html.indexOf('id="current-step-title"');
  const openFile = html.indexOf('data-action="openFile"', heading);
  const instruction = html.indexOf("现在做什么", heading);
  assert.ok(heading < openFile && openFile < instruction);
});

test("coach follows VS Code theme and keeps controls and copy at readable sizes", () => {
  const html = coachHtml(model(), nonce);
  assert.match(html, /font-family:var\(--vscode-font-family/);
  assert.match(html, /font-size:max\(14px,var\(--vscode-font-size,14px\)\)/);
  assert.match(html, /--vscode-sideBar-background/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /data-action="previous" disabled/);
});

test("empty session offers a clear entry without invented lesson results", () => {
  const welcome = coachModel({ lesson: null });
  assert.equal(welcome.welcome, true);
  const html = coachHtml(welcome, nonce);
  assert.match(html, /选择一门练习/);
  assert.match(html, /data-action="start"/);
  assert.doesNotMatch(html, /实际完成条件|本次目标已达成/);
});
