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
  const panels = [];
  const openedFiles = [];
  const statusItems = [];
  const providers = new Map();
  const workspaceValues = new Map();
  const status = { ...disposable(), show() {} };
  const vscode = {
    ExtensionMode: { Production: 1 },
    EventEmitter,
    StatusBarAlignment: { Left: 1 },
    ProgressLocation: { Window: 1, Notification: 2 },
    ViewColumn: { One: 1, Two: 2 },
    TreeItemCollapsibleState: { None: 0, Expanded: 2 },
    TreeItem: class {
      constructor(label, collapsibleState) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    },
    ThemeIcon: class {
      constructor(id) {
        this.id = id;
      }
    },
    RelativePattern: class {
      constructor(base, pattern) {
        this.base = base;
        this.pattern = pattern;
      }
    },
    env: {},
    Uri: {
      file: (fsPath) => ({ scheme: "file", fsPath }),
      parse: (value) => ({
        scheme: value.split(":")[0],
        path: value.slice(value.indexOf(":") + 1),
        toString: () => value,
      }),
    },
    workspace: {
      isTrusted: true,
      workspaceFolders: [],
      textDocuments: [],
      registerTextDocumentContentProvider: (scheme, provider) => {
        providers.set(scheme, provider);
        return disposable();
      },
      createFileSystemWatcher: () => ({
        ...disposable(),
        onDidCreate: disposable,
        onDidChange: disposable,
        onDidDelete: disposable,
      }),
      onDidSaveTextDocument: disposable,
      onDidChangeTextDocument: disposable,
    },
    window: {
      createStatusBarItem: () => {
        const item = statusItems.length
          ? { ...disposable(), show() {} }
          : status;
        statusItems.push(item);
        return item;
      },
      createTreeView: disposable,
      createWebviewPanel: (viewType, title, column, options) => {
        const disposeListeners = new Set();
        const messageListeners = new Set();
        let html = "";
        const panel = {
          viewType,
          title,
          column: typeof column === "object" ? column.viewColumn : column,
          viewColumn: typeof column === "object" ? column.viewColumn : column,
          showOptions: column,
          options,
          htmlWrites: 0,
          disposed: false,
          reveal(nextColumn) {
            this.column = nextColumn;
            this.viewColumn = nextColumn;
          },
          onDidDispose(listener) {
            disposeListeners.add(listener);
            return { dispose: () => disposeListeners.delete(listener) };
          },
          dispose() {
            if (this.disposed) return;
            this.disposed = true;
            for (const listener of disposeListeners) listener();
          },
          webview: {
            cspSource: "vscode-webview://test",
            get html() {
              return html;
            },
            set html(value) {
              assert.equal(
                panel.disposed,
                false,
                "A closed coach panel cannot render",
              );
              panel.htmlWrites += 1;
              html = value;
            },
            onDidReceiveMessage(listener) {
              messageListeners.add(listener);
              return { dispose: () => messageListeners.delete(listener) };
            },
          },
          async receive(message) {
            for (const listener of messageListeners) await listener(message);
          },
        };
        panels.push(panel);
        return panel;
      },
      showTextDocument: async (uri, options) => {
        openedFiles.push({ uri, options });
        return { document: { uri } };
      },
      onDidChangeWindowState: disposable,
      state: { focused: false },
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
    workspaceState: {
      get: (key, fallback) => workspaceValues.get(key) ?? fallback,
      async update(key, value) {
        workspaceValues.set(key, value);
      },
    },
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
    panels,
    openedFiles,
    statusItems,
    status,
    passed,
    folder,
    providers,
    context,
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

test("reopening an already opened lesson restores guide content through the registered provider", async (t) => {
  const state = await fixture(t, () => ({
    complete: false,
    checks: [{ label: "README 修改已进入提交", done: false }],
  }));
  await state.context.workspaceState.update("opened", true);
  await state.context.workspaceState.update("guideStep", 2);
  state.lessons.git = { openRepository: async () => null };

  await state.lessons.restore();
  const guide = await state.providers
    .get("git-onboarding")
    .provideTextDocumentContent(
      state.vscode.Uri.parse("git-onboarding:/任务与指引.md"),
    );

  assert.match(guide, /你的第一次提交/);
  assert.match(guide, /Source Control/);
  assert.match(guide, /暂存/);
  assert.equal(state.panels.length, 1);
  assert.equal(state.panels[0].column, state.vscode.ViewColumn.Two);
  assert.equal(state.panels[0].showOptions.preserveFocus, true);
  assert.ok(
    state.lessons
      .getChildren()
      .slice(0, 2)
      .some((row) => /第 3\/4 步/.test(row.label)),
  );
});

test("restored check-report tabs request a fresh check instead of showing a blank or historic pass", async (t) => {
  const state = await fixture(t, () => {
    throw new Error(
      "Restoring a document must not implicitly check the engine",
    );
  });
  // A fresh extension host has no report document, even if the last known
  // snapshot or persisted learning progress previously indicated success.
  const report = await state.providers
    .get("git-onboarding")
    .provideTextDocumentContent(
      state.vscode.Uri.parse("git-onboarding:/练习检查报告.md"),
    );

  assert.match(report, /重新检查|再次检查/);
  assert.doesNotMatch(report, /全部条件通过|previous-success/);
  assert.equal(state.requests.length, 0);
  assert.equal(state.writes.length, 0);
});

test("browsing guide steps persists only the reading position, never course completion", async (t) => {
  const state = await fixture(t, () => {
    throw new Error(
      "Browsing guidance must not change or inspect the Git repository",
    );
  });

  await state.lessons.goToStep(1);
  assert.equal(state.context.workspaceState.get("guideStep"), 1);
  await state.lessons.handleGuideMessage({ action: "next" });
  assert.equal(state.context.workspaceState.get("guideStep"), 2);
  await state.lessons.handleGuideMessage({ action: "previous" });
  assert.equal(state.context.workspaceState.get("guideStep"), 1);
  await state.lessons.handleGuideMessage({ action: "step", step: 3 });
  assert.equal(state.context.workspaceState.get("guideStep"), 3);

  assert.equal(state.requests.length, 0);
  assert.equal(state.writes.length, 0);
  assert.equal(state.lessons.snapshot, state.passed);
});

test("invalid or challenge-mode step navigation has no side effects", async (t) => {
  const state = await fixture(t, () => {
    throw new Error("Rejected step navigation must not invoke the engine");
  });
  await state.lessons.goToStep(1);
  const rejectStep = async (value) => {
    try {
      await state.lessons.goToStep(value);
    } catch (error) {
      assert.match(
        error.message,
        /引导|挑战|步骤|范围|整数|索引|invalid|step/i,
      );
    }
    assert.equal(state.context.workspaceState.get("guideStep"), 1);
  };

  for (const invalid of [-1, 4, 1.5, "2", null, Number.NaN]) {
    await rejectStep(invalid);
  }
  state.lessons.session.mode = "challenge";
  await rejectStep(2);

  assert.equal(state.requests.length, 0);
  assert.equal(state.writes.length, 0);
});

test("unrecognized guide messages cannot execute arbitrary VS Code commands", async (t) => {
  const state = await fixture(t, () => {
    throw new Error("Unknown guide actions must not invoke the engine");
  });
  for (const message of [
    null,
    { action: "workbench.action.closeWindow" },
    {
      action: "executeCommand",
      command: "workbench.action.terminal.sendSequence",
      args: ["git reset --hard"],
    },
  ]) {
    await state.lessons.handleGuideMessage(message);
  }

  assert.equal(state.previews.length, 0);
  assert.equal(state.requests.length, 0);
  assert.equal(state.writes.length, 0);
});

test("opening a lesson file keeps its editor beside the coach instead of replacing it", async (t) => {
  const state = await fixture(t, () => ({ checks: [], complete: false }));
  await state.lessons.showGuide();
  assert.equal(state.panels.length, 1);
  const coach = state.panels[0];
  const initialHtml = coach.webview.html;

  await state.lessons.openFile();

  assert.equal(state.openedFiles.length, 1);
  assert.equal(
    state.openedFiles[0].options.viewColumn,
    state.vscode.ViewColumn.One,
  );
  assert.equal(
    state.openedFiles[0].uri.fsPath,
    windowsPath.join(state.folder, "README.md"),
  );
  assert.equal(coach.column, state.vscode.ViewColumn.Two);
  assert.equal(coach.disposed, false);
  assert.equal(coach.webview.html, initialHtml);
});

test("closing the coach stops rendering without disabling repository refresh", async (t) => {
  const state = await fixture(t, () => ({ checks: [], complete: false }));
  await state.lessons.showGuide();
  const coach = state.panels[0];
  assert.ok(coach.htmlWrites > 0, "Opening the coach should render guidance");
  const before = coach.htmlWrites;
  coach.dispose();

  await state.lessons.refresh();

  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].action, "state");
  assert.equal(
    state.panels.length,
    1,
    "Background refresh must not reopen a closed coach",
  );
  assert.equal(coach.htmlWrites, before);
});

test("the current teaching step is visible at the top of the lesson tree", async (t) => {
  const state = await fixture(t, () => ({ checks: [], complete: false }));

  const rows = state.lessons.getChildren();
  const step = rows.slice(0, 2).find((row) => /第 1\/4 步/.test(row.label));

  assert.ok(step, "The guide entry must precede Git state and pass conditions");
  assert.equal(step.command.command, "gitOnboarding.guide");
});

test("polling an unchanged repository does not reload the coach", async (t) => {
  let state;
  state = await fixture(t, () => state.passed);
  await state.lessons.showGuide();
  const coach = state.panels[0];
  const before = coach.htmlWrites;

  await state.lessons.refresh();
  await state.lessons.refresh();

  assert.equal(state.requests.length, 2);
  assert.equal(coach.htmlWrites, before);
});
