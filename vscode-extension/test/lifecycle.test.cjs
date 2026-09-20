"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const entry = path.resolve(__dirname, "../src/extension.cjs");
const extensionRequire = createRequire(entry);
const source = fs.readFileSync(entry, "utf8");
const windowsPath = path.win32;
const disposable = () => ({ dispose() {} });

class EventEmitter {
  constructor() {
    this.event = () => disposable();
  }
  fire() {}
  dispose() {}
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture(t, request) {
  const writes = [];
  const requests = [];
  const previews = [];
  const status = { ...disposable(), show() {} };
  const vscode = {
    ExtensionMode: { Production: 1 },
    EventEmitter,
    StatusBarAlignment: { Left: 1 },
    ProgressLocation: { Window: 1, Notification: 2 },
    env: {},
    Uri: {
      file: (fsPath) => ({ scheme: "file", fsPath }),
      parse: (value) => ({ toString: () => value }),
    },
    workspace: {
      isTrusted: true,
      workspaceFolders: [],
      textDocuments: [],
      registerTextDocumentContentProvider: disposable,
    },
    window: {
      createStatusBarItem: () => status,
      createTreeView: disposable,
      withProgress: async (_options, operation) => operation(),
      showErrorMessage: async (message) => {
        throw new Error(`Unexpected activation error: ${message}`);
      },
    },
    commands: {
      registerCommand: disposable,
      executeCommand: async (command, uri) => previews.push({ command, uri }),
    },
  };
  const context = {
    extensionMode: vscode.ExtensionMode.Production,
    extensionPath: path.dirname(path.dirname(entry)),
    globalStorageUri: { fsPath: "C:\\Git Practice\\extension-storage" },
    subscriptions: [],
    globalState: {
      get() {},
      async update(key, value) {
        writes.push({ key, value });
      },
    },
    workspaceState: { get() {}, async update() {} },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(
    source,
    {
      module: loaded,
      exports: loaded.exports,
      require: (name) =>
        name === "vscode"
          ? vscode
          : name === "node:path"
            ? windowsPath
            : extensionRequire(name),
      // Lifecycle tests exercise Windows paths without requiring a Windows host.
      process: { platform: "win32", env: {} },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    },
    { filename: entry },
  );
  const { lessons } = await loaded.exports.activate(context);
  t.after(() => lessons.dispose());
  const folder = windowsPath.join(lessons.root, "basics-guided", "workspace");
  lessons.session = { lesson: "basics", mode: "guided", path: folder };
  vscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file(folder) }];
  lessons.runtime = {
    async request(value) {
      requests.push(value);
      return request(value);
    },
    dispose() {},
  };
  const passed = {
    path: folder,
    branch: "main",
    head: "previous-success",
    checks: [{ label: "README 修改已进入提交", done: true }],
    complete: true,
  };
  lessons.snapshot = passed;
  lessons.checkedAt = "2026-09-20T10:00:00.000Z";
  return {
    lessons,
    vscode,
    writes,
    requests,
    previews,
    status,
    passed,
    folder,
  };
}

test("checking during archive cannot reuse a prior pass or save progress", async (t) => {
  const state = await fixture(t, () => {
    throw new Error("A check must not reach the engine during archive");
  });
  state.lessons.resetting = true;

  await assert.rejects(state.lessons.check(), /重建/);

  assert.equal(state.requests.length, 0);
  assert.equal(state.writes.length, 0);
  assert.equal(state.previews.length, 0);
});

test("a check already in flight cannot record a pass after archive starts", async (t) => {
  const started = deferred();
  const response = deferred();
  const state = await fixture(t, () => {
    started.resolve();
    return response.promise;
  });
  const checking = state.lessons.check();
  await started.promise;
  state.lessons.resetting = true;
  response.resolve(state.passed);

  await assert.rejects(checking, /重建/);

  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].action, "state");
  assert.equal(state.writes.length, 0);
  assert.equal(state.previews.length, 0);
});

test("archive refuses unsaved target files even without an active lesson", async (t) => {
  const state = await fixture(t, () => {
    throw new Error("Unsaved target files must prevent engine initialization");
  });
  state.lessons.session = null;
  state.vscode.workspace.textDocuments = [
    {
      isDirty: true,
      uri: state.vscode.Uri.file(windowsPath.join(state.folder, "README.md")),
    },
  ];

  await assert.rejects(
    state.lessons.archiveAndInitialize("basics", "guided"),
    /未保存/,
  );

  assert.equal(state.requests.length, 0);
  assert.equal(state.writes.length, 0);
  assert.notEqual(state.lessons.resetting, true);
});

test("unsaved files in another project do not block owned lesson recovery", async (t) => {
  const state = await fixture(t, () => ({
    path: "new-lesson",
    complete: false,
  }));
  state.lessons.session = null;
  state.vscode.workspace.textDocuments = [
    {
      isDirty: true,
      uri: state.vscode.Uri.file("C:\\My Project\\README.md"),
    },
  ];

  const result = await state.lessons.archiveAndInitialize("basics", "guided");

  assert.equal(result.complete, false);
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].action, "init");
  assert.equal(state.requests[0].reset, true);
  assert.equal(state.lessons.snapshot, null);
  assert.equal(state.lessons.resetting, false);
  assert.equal(state.writes.length, 0);
});

test("engine failure removes the old passing snapshot and reports failure", async (t) => {
  const state = await fixture(t, () => {
    throw new Error("Git repository is unavailable");
  });

  const result = await state.lessons.check();

  assert.equal(result.passed, false);
  assert.equal(result.snapshot, null);
  assert.equal(state.lessons.snapshot, null);
  assert.equal(result.error, "Git repository is unavailable");
  assert.equal(state.writes.length, 0);
  assert.match(state.status.text, /检查失败/);
  const report = [...state.lessons.documents.values()].join("\n");
  assert.match(report, /本次检查：未能完成检查/);
  assert.match(report, /Git repository is unavailable/);
  assert.doesNotMatch(report, /全部条件通过|previous-success/);
});
