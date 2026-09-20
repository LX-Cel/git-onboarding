const vscode = require("vscode");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { Runtime, findPython } = require("./runtime.cjs");
const { getLesson, guideMarkdown, reportMarkdown } = require("./content.cjs");
const { coachModel, coachHtml } = require("./coach.cjs");

const IDS = ["basics", "collab", "recovery"];
const MODES = ["guided", "challenge"];
const modeName = (mode) => (mode === "guided" ? "引导练习" : "独立挑战");
const samePath = (a, b) =>
  path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
};

class Lessons {
  constructor(context) {
    this.context = context;
    const testRoot =
      context.extensionMode !== vscode.ExtensionMode.Production &&
      process.env.GIT_ONBOARDING_VSCODE_TEST_ROOT;
    this.root = testRoot || path.join(context.globalStorageUri.fsPath, "labs");
    this.change = new vscode.EventEmitter();
    this.documentChange = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.change.event;
    this.documents = new Map();
    this.session = null;
    this.snapshot = null;
    this.error = null;
    this.hints = 0;
    this.step = 0;
    this.busy = false;
    this.disposed = false;
    this.status = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      10,
    );
    this.status.command = "gitOnboarding.check";
    this.guideStatus = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      11,
    );
    this.guideStatus.command = "gitOnboarding.guide";
    this.guideStatus.tooltip = "打开常驻练习指引：操作位置、预期结果与下一步";
    context.subscriptions.push(
      this.change,
      this.documentChange,
      this.status,
      this.guideStatus,
      this,
    );
  }
  assertEnvironment() {
    if (!vscode.workspace.isTrusted)
      throw new Error("请先信任此练习工作区，再运行 Git 练习。");
    if (process.platform !== "win32" || vscode.env.remoteName)
      throw new Error(
        "此预览版支持 Windows 本地文件夹；请在本地 VS Code 窗口开始练习。",
      );
  }
  async getRuntime() {
    this.assertEnvironment();
    if (this.runtime) return this.runtime;
    if (this.loadingRuntime) return this.loadingRuntime;
    this.loadingRuntime = (async () => {
      const extension = vscode.extensions.getExtension("vscode.git");
      const exported = await extension.activate();
      if (!exported.enabled) throw new Error("请启用 VS Code 内置 Git 扩展。");
      this.git = exported.getAPI(1);
      // The Git API can be returned before its executable discovery finishes.
      for (let i = 0; i < 50 && this.git.state !== "initialized"; i++)
        await new Promise((resolve) => setTimeout(resolve, 100));
      if (!this.git.git?.path)
        throw new Error(
          "未找到 Git。请安装 Git for Windows，然后重启 VS Code。",
        );
      const python = await findPython(
        vscode.workspace
          .getConfiguration("gitOnboarding")
          .get("pythonPath", ""),
      );
      await vscode.workspace.fs.createDirectory(
        vscode.Uri.file(path.dirname(this.root)),
      );
      const runtime = new Runtime({
        python,
        git: this.git.git.path,
        root: this.root,
        extensionPath: this.context.extensionPath,
      });
      try {
        await runtime.request({ action: "probe" });
      } catch (error) {
        runtime.dispose();
        throw error;
      }
      this.runtime = runtime;
      this.context.subscriptions.push(
        this.git.onDidOpenRepository((repo) => this.watchRepository(repo)),
      );
      for (const repo of this.git.repositories) this.watchRepository(repo);
      return runtime;
    })();
    try {
      return await this.loadingRuntime;
    } finally {
      this.loadingRuntime = null;
    }
  }
  watchRepository(repo) {
    if (!this.session || !samePath(repo.rootUri.fsPath, this.session.path))
      return;
    this.repoSubscription?.dispose();
    this.repoSubscription = repo.state.onDidChange(() =>
      this.scheduleRefresh(),
    );
  }
  async prepareLesson(lesson, mode) {
    if (!IDS.includes(lesson) || !MODES.includes(mode))
      throw new Error("不支持的课程或练习模式。");
    const runtime = await this.getRuntime();
    return runtime.request({ action: "init", lesson, mode });
  }
  async start() {
    this.assertEnvironment();
    const chosen = await vscode.window.showQuickPick(
      IDS.map((id) => {
        const completed = this.context.globalState.get(`passed.${id}.guided`);
        return {
          label: getLesson(id).title,
          description: completed ? "引导练习已通过" : "Windows 原生 Git",
          id,
        };
      }),
      {
        title: "选择 Git 练习",
        placeHolder: "已有练习会继续保留；引导与挑战互不影响",
      },
    );
    if (!chosen) return;
    const mode = await vscode.window.showQuickPick(
      MODES.map((id) => ({ label: modeName(id), id })),
      { title: chosen.label },
    );
    if (!mode) return;
    let state;
    try {
      state = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "准备 Git 练习",
        },
        () => this.prepareLesson(chosen.id, mode.id),
      );
    } catch (error) {
      const retry = await vscode.window.showErrorMessage(
        `无法继续练习：${error.message}`,
        {
          modal: true,
          detail:
            "如果上次创建被中断，可以归档已有练习并重建。陌生目录仍会被拒绝；缺失 Git/Python 需先完成安装。",
        },
        "归档并重新开始",
      );
      if (retry !== "归档并重新开始") return;
      state = await this.archiveAndInitialize(chosen.id, mode.id);
    }
    if (this.session && samePath(this.session.path, state.path)) {
      await this.refresh();
      await this.showGuide();
    } else {
      await vscode.commands.executeCommand(
        "vscode.openFolder",
        vscode.Uri.file(state.path),
        { forceNewWindow: true },
      );
    }
  }
  async restore() {
    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length !== 1 || folders[0].uri.scheme !== "file") return;
    const folder = folders[0].uri.fsPath;
    for (const lesson of IDS)
      for (const mode of MODES) {
        if (
          !samePath(
            folder,
            path.join(this.root, `${lesson}-${mode}`, "workspace"),
          )
        )
          continue;
        this.session = { lesson, mode, path: folder };
        this.hints = this.context.workspaceState.get("hintLevel", 0);
        const savedStep = this.context.workspaceState.get("guideStep", 0);
        this.step = Number.isInteger(savedStep)
          ? Math.max(0, Math.min(getLesson(lesson).steps.length - 1, savedStep))
          : 0;
        this.documentChange.fire(
          vscode.Uri.parse("git-onboarding:/任务与指引.md"),
        );
        await vscode.commands.executeCommand(
          "setContext",
          "gitOnboarding.active",
          true,
        );
        const runtime = await this.getRuntime();
        await this.refresh();
        const repo = await this.git.openRepository(vscode.Uri.file(folder));
        if (repo) this.watchRepository(repo);
        this.poll = setInterval(() => {
          if (vscode.window.state.focused) this.scheduleRefresh();
        }, 5000);
        this.context.subscriptions.push(
          vscode.window.onDidChangeWindowState((state) => {
            if (state.focused) this.scheduleRefresh();
          }),
        );
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(folder, "**/*"),
        );
        this.context.subscriptions.push(
          watcher,
          watcher.onDidCreate(() => this.scheduleRefresh()),
          watcher.onDidChange(() => this.scheduleRefresh()),
          watcher.onDidDelete(() => this.scheduleRefresh()),
        );
        const dirtyChanged = (document) => {
          if (
            document.uri.scheme === "file" &&
            inside(folder, document.uri.fsPath)
          ) {
            this.change.fire();
            this.renderGuide();
            this.scheduleRefresh();
          }
        };
        this.context.subscriptions.push(
          vscode.workspace.onDidSaveTextDocument(dirtyChanged),
          vscode.workspace.onDidChangeTextDocument((event) =>
            dirtyChanged(event.document),
          ),
        );
        if (!this.context.workspaceState.get("opened")) {
          await this.context.workspaceState.update("opened", true);
          await vscode.commands.executeCommand("workbench.view.scm");
          await vscode.commands.executeCommand("gitOnboarding.lesson.focus");
          await this.openFile();
        }
        // Each extension host reconstructs the coach from persisted lesson state.
        // The old one-time Markdown preview lost its in-memory content on reload.
        await this.showGuide(true);
        return runtime;
      }
  }
  requireSession() {
    this.assertEnvironment();
    if (!this.session)
      throw new Error(
        "请先使用「Git Onboarding：开始 / 继续练习」打开专用练习窗口。",
      );
    const folders = vscode.workspace.workspaceFolders || [];
    if (
      folders.length !== 1 ||
      !samePath(folders[0].uri.fsPath, this.session.path)
    )
      throw new Error("当前窗口已切换工作区，请重新打开练习。");
    return this.session;
  }
  dirtyFiles() {
    if (!this.session) return [];
    return vscode.workspace.textDocuments
      .filter(
        (doc) =>
          doc.isDirty &&
          doc.uri.scheme === "file" &&
          inside(this.session.path, doc.uri.fsPath),
      )
      .map((doc) => path.relative(this.session.path, doc.uri.fsPath));
  }
  scheduleRefresh() {
    if (this.disposed || this.resetting) return;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.refresh().catch(() => {}), 500);
  }
  async refresh() {
    if (this.resetting) return this.snapshot;
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        const { lesson, mode } = this.requireSession();
        this.busy = true;
        this.change.fire();
        try {
          const runtime = await this.getRuntime();
          this.snapshot = await runtime.request({
            action: "state",
            lesson,
            mode,
          });
          this.error = this.snapshot.error || null;
          this.checkedAt = new Date().toISOString();
        } catch (error) {
          this.snapshot = null;
          this.error = error.message;
          this.checkedAt = new Date().toISOString();
        } finally {
          this.busy = false;
          this.updateStatus();
          this.change.fire();
          this.renderGuide();
        }
      } while (this.refreshAgain && !this.disposed && !this.resetting);
      return this.snapshot;
    })();
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }
  updateStatus() {
    if (!this.session) return;
    const total = this.snapshot?.checks?.length || 0;
    const done =
      this.snapshot?.checks?.filter((check) => check.done).length || 0;
    const complete =
      this.snapshot?.complete && !this.error && !this.dirtyFiles().length;
    this.status.text = this.error
      ? "$(warning) Git 练习：检查失败"
      : `$(mortar-board) Git 练习 ${done}/${total}${complete ? " ✓" : ""}`;
    this.status.tooltip = "点击查看本次练习检查报告";
    this.status.show();
    this.guideStatus.text =
      this.session.mode === "guided"
        ? `$(book) 练习指引 · 第 ${this.step + 1}/${getLesson(this.session.lesson).steps.length} 步`
        : "$(book) 挑战目标与提示";
    this.guideStatus.show();
  }
  async check() {
    if (this.resetting) throw new Error("正在归档并重建练习，请完成后再检查。");
    const { lesson, mode } = this.requireSession();
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "检查实际 Git 仓库" },
      () => this.refresh(),
    );
    if (this.resetting) throw new Error("练习已开始重建，请完成后重新检查。");
    const dirtyFiles = this.dirtyFiles();
    const passed =
      this.snapshot?.complete && !this.error && dirtyFiles.length === 0;
    if (passed)
      await this.context.globalState.update(`passed.${lesson}.${mode}`, {
        at: this.checkedAt,
        head: this.snapshot.head,
      });
    const report = reportMarkdown({
      lesson: getLesson(lesson),
      mode,
      snapshot: this.snapshot,
      checkedAt: this.checkedAt,
      dirtyFiles,
      error: this.error,
    });
    await this.showDocument("result", report);
    return {
      snapshot: this.snapshot,
      dirtyFiles,
      passed: Boolean(passed),
      error: this.error,
    };
  }
  async showGuide(preserveFocus = false) {
    this.requireSession();
    if (this.guidePanel) {
      this.guidePanel.reveal(
        this.guidePanel.viewColumn || vscode.ViewColumn.Two,
        preserveFocus,
      );
      this.renderGuide();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "gitOnboarding.coach",
      "Git 练习 · 分步指引",
      { viewColumn: vscode.ViewColumn.Two, preserveFocus },
      {
        enableScripts: true,
        localResourceRoots: [],
        retainContextWhenHidden: true,
      },
    );
    this.guidePanel = panel;
    this.guideNonce = randomBytes(24).toString("base64");
    this.guideContentKey = null;
    const messages = panel.webview.onDidReceiveMessage(async (message) => {
      try {
        await this.handleGuideMessage(message);
      } catch (error) {
        await vscode.window.showErrorMessage(`Git 练习：${error.message}`);
      }
    });
    panel.onDidDispose(() => {
      messages.dispose();
      if (this.guidePanel === panel) this.guidePanel = null;
    });
    this.renderGuide();
  }
  renderGuide() {
    if (!this.guidePanel || !this.session || this.disposed) return;
    const model = coachModel({
      lesson: getLesson(this.session.lesson),
      mode: this.session.mode,
      step: this.step,
      hintLevel: this.hints,
      snapshot: this.snapshot,
      dirtyFiles: this.dirtyFiles(),
      error: this.error,
    });
    const key = JSON.stringify(model);
    // Polling identical Git state must not reload the page or steal keyboard focus.
    if (key === this.guideContentKey) return;
    this.guideContentKey = key;
    this.guidePanel.webview.html = coachHtml(model, this.guideNonce);
  }
  async goToStep(step) {
    const { lesson, mode } = this.requireSession();
    if (
      mode !== "guided" ||
      !Number.isInteger(step) ||
      step < 0 ||
      step >= getLesson(lesson).steps.length
    )
      return;
    this.step = step;
    await this.context.workspaceState.update("guideStep", step);
    this.updateStatus();
    this.change.fire();
    this.renderGuide();
  }
  async handleGuideMessage(message) {
    this.requireSession();
    if (!message || typeof message !== "object" || this.resetting) return;
    // Only navigation and explicit read/check actions are exposed to the webview.
    switch (message.action) {
      case "previous":
        return this.goToStep(this.step - 1);
      case "next":
        return this.goToStep(this.step + 1);
      case "step":
        return this.goToStep(message.step);
      case "openFile":
        return this.openFile();
      case "sourceControl":
        await vscode.commands.executeCommand(
          "workbench.action.focusFirstEditorGroup",
        );
        return vscode.commands.executeCommand("workbench.view.scm");
      case "terminal":
        return this.terminal();
      case "check":
        return this.check();
      case "hint":
        return this.hint();
      case "start":
        return this.start();
    }
  }
  provideDocument(uri) {
    const key = uri.toString();
    const resourcePath =
      uri.path || decodeURIComponent(key.replace(/^git-onboarding:/, ""));
    if (resourcePath === "/任务与指引.md" && this.session)
      return guideMarkdown(
        getLesson(this.session.lesson),
        this.session.mode,
        this.hints,
      );
    if (this.documents.has(key)) return this.documents.get(key);
    if (resourcePath === "/练习检查报告.md")
      return "# 请重新检查练习结果\n\n窗口已重新打开或练习已重建。请点击状态栏的「Git 练习」重新检查当前仓库；之前的报告不能代替本次结果。\n";
    return "# Git 练习指引\n\n正在恢复练习。若当前不是专用练习窗口，请按 Ctrl+Shift+P，运行「Git Onboarding: 开始 / 继续练习」。\n";
  }
  async hint() {
    this.requireSession();
    this.hints = Math.min(3, this.hints + 1);
    await this.context.workspaceState.update("hintLevel", this.hints);
    this.change.fire();
    await this.showGuide();
  }
  async showDocument(kind, content) {
    const uri = vscode.Uri.parse(
      `git-onboarding:/${kind === "guide" ? "任务与指引" : "练习检查报告"}.md`,
    );
    this.documents.set(uri.toString(), content);
    this.documentChange.fire(uri);
    await vscode.commands.executeCommand(
      "markdown.showPreview",
      uri,
      vscode.ViewColumn.One,
      { locked: true },
    );
  }
  async openFile() {
    const { lesson, path: folder } = this.requireSession();
    await vscode.window.showTextDocument(
      vscode.Uri.file(path.join(folder, getLesson(lesson).file)),
      { preview: false, viewColumn: vscode.ViewColumn.One },
    );
  }
  async terminal() {
    const session = this.requireSession();
    const runtime = await this.getRuntime();
    const env = {};
    for (const key of Object.keys(process.env))
      if (key.toUpperCase().startsWith("GIT_")) env[key] = null;
    env.PATH = `${path.dirname(runtime.git)};${process.env.PATH || process.env.Path || ""}`;
    const terminal = vscode.window.createTerminal({
      name: "Git 练习 · PowerShell",
      cwd: session.path,
      shellPath: path.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      ),
      shellArgs: ["-NoLogo", "-NoProfile"],
      env,
    });
    terminal.show();
  }
  async reset() {
    const { lesson, mode } = this.requireSession();
    if (this.dirtyFiles().length)
      throw new Error("请先保存或关闭本练习中未保存的文件，再重新开始。");
    const answer = await vscode.window.showWarningMessage(
      "将当前练习归档，再创建新的练习。旧文件与提交会保留在归档目录。",
      { modal: true },
      "归档并重新开始",
    );
    if (answer !== "归档并重新开始") return;
    const state = await this.archiveAndInitialize(lesson, mode);
    if (state.archivedPath)
      vscode.window.showInformationMessage(
        `旧练习已归档：${state.archivedPath}`,
      );
    const repo = this.git.getRepository(vscode.Uri.file(this.session.path));
    if (repo) await repo.status();
    await this.refresh();
    await this.showGuide();
  }
  async archiveAndInitialize(lesson, mode) {
    if (!IDS.includes(lesson) || !MODES.includes(mode))
      throw new Error("不支持的课程或模式。");
    if (this.resetting) throw new Error("练习正在重建，请稍候。");
    const folder = path.join(this.root, `${lesson}-${mode}`, "workspace");
    if (
      vscode.workspace.textDocuments.some(
        (doc) =>
          doc.isDirty &&
          doc.uri.scheme === "file" &&
          inside(folder, doc.uri.fsPath),
      )
    ) {
      throw new Error("请先保存或关闭本练习中未保存的文件，再重新开始。");
    }
    this.resetting = true;
    this.snapshot = null;
    this.error = "正在归档并重建，请稍候。";
    this.documents.clear();
    this.documentChange.fire(
      vscode.Uri.parse("git-onboarding:/练习检查报告.md"),
    );
    this.change.fire();
    this.renderGuide();
    clearTimeout(this.debounce);
    try {
      if (this.refreshing) await this.refreshing;
      const runtime = await this.getRuntime();
      const state = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "归档并重建练习",
        },
        () => runtime.request({ action: "init", lesson, mode, reset: true }),
      );
      this.hints = 0;
      this.step = 0;
      await this.context.workspaceState.update("hintLevel", 0);
      await this.context.workspaceState.update("guideStep", 0);
      return state;
    } finally {
      this.resetting = false;
    }
  }
  node(label, icon, command, children, description) {
    const item = new vscode.TreeItem(
      label,
      children
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
    if (icon) item.iconPath = new vscode.ThemeIcon(icon);
    if (command) item.command = { command, title: label };
    if (description) item.description = description;
    item.children = children;
    return item;
  }
  getTreeItem(item) {
    return item;
  }
  getChildren(item) {
    if (item) return item.children || [];
    if (!this.session) return [];
    const { lesson, mode } = this.session;
    const spec = getLesson(lesson);
    const currentStep = coachModel({
      lesson: spec,
      mode,
      step: this.step,
    }).currentStep;
    const rows = [
      this.node(
        spec.title,
        "mortar-board",
        "gitOnboarding.guide",
        null,
        modeName(mode),
      ),
      this.node(
        mode === "guided"
          ? `第 ${this.step + 1}/${spec.steps.length} 步 · ${currentStep.title}`
          : "查看挑战目标与提示",
        "book",
        "gitOnboarding.guide",
      ),
    ];
    if (this.busy) rows.push(this.node("正在检查仓库…", "loading~spin"));
    if (this.error)
      rows.push(
        this.node("检查失败，查看原因", "warning", "gitOnboarding.check"),
      );
    if (this.snapshot) {
      rows.push(
        this.node(
          this.snapshot.branch || "分离 HEAD",
          "git-branch",
          null,
          null,
          this.snapshot.head,
        ),
      );
      const checks = (this.snapshot.checks || []).map((check) => {
        const row = this.node(
          check.label,
          check.done ? "pass" : "circle-large-outline",
          "gitOnboarding.check",
        );
        row.tooltip = check.detail || check.label;
        return row;
      });
      rows.push(this.node("完成条件", "checklist", null, checks));
    }
    if (this.dirtyFiles().length)
      rows.push(
        this.node(
          "有未保存文件，请先保存再检查",
          "warning",
          "gitOnboarding.openFile",
        ),
      );
    rows.push(
      this.node(
        `展开提示（${this.hints}/3）`,
        "lightbulb",
        "gitOnboarding.hint",
      ),
    );
    rows.push(
      this.node("打开本课文件", "go-to-file", "gitOnboarding.openFile"),
    );
    rows.push(this.node("检查练习结果", "checklist", "gitOnboarding.check"));
    rows.push(this.node("打开练习终端", "terminal", "gitOnboarding.terminal"));
    rows.push(
      this.node("选择下一课 / 独立挑战", "arrow-right", "gitOnboarding.start"),
    );
    return rows;
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.debounce);
    clearInterval(this.poll);
    this.repoSubscription?.dispose();
    this.guidePanel?.dispose();
    this.runtime?.dispose();
  }
}

async function activate(context) {
  const lessons = new Lessons(context);
  const tree = vscode.window.createTreeView("gitOnboarding.lesson", {
    treeDataProvider: lessons,
  });
  context.subscriptions.push(
    tree,
    vscode.workspace.registerTextDocumentContentProvider("git-onboarding", {
      onDidChange: lessons.documentChange.event,
      provideTextDocumentContent: (uri) => lessons.provideDocument(uri),
    }),
  );
  for (const [name, method] of Object.entries({
    start: "start",
    check: "check",
    guide: "showGuide",
    hint: "hint",
    reset: "reset",
    terminal: "terminal",
    openFile: "openFile",
  })) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`gitOnboarding.${name}`, async () => {
        try {
          return await lessons[method]();
        } catch (error) {
          await vscode.window.showErrorMessage(`Git 练习：${error.message}`);
        }
      }),
    );
  }
  try {
    await lessons.restore();
  } catch (error) {
    lessons.error = error.message;
    lessons.change.fire();
    if (lessons.session) {
      lessons.updateStatus();
      await lessons.showGuide(true);
    }
    vscode.window.showErrorMessage(`Git 练习：${error.message}`);
  }
  return { lessons };
}

module.exports = { activate, deactivate() {} };
