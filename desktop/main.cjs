const { app, BrowserWindow, ipcMain, session, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { Runtime, validateSelection } = require("./runtime.cjs");

if (process.env.GIT_ONBOARDING_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.GIT_ONBOARDING_DATA_DIR));
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let window, runtime, selected;
let queue = Promise.resolve();
let progress = {};
const entry = path.join(__dirname, "../dist/index.html");
const trustedURL = pathToFileURL(entry).href;

function trusted(event) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    event.senderFrame.url !== trustedURL
  ) {
    throw new Error("拒绝不可信页面请求");
  }
}
function serial(operation) {
  const result = queue.then(operation);
  queue = result.catch(() => {});
  return result;
}
async function record(state) {
  if (state.complete && selected) {
    const key = `${selected.lesson}-${selected.mode}`;
    if (!progress[key]) {
      progress[key] = new Date().toISOString();
      const file = path.join(app.getPath("userData"), "progress.json");
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file + ".tmp", JSON.stringify(progress, null, 2));
      await fs.rename(file + ".tmp", file);
    }
  }
  return state;
}
function handle(channel, callback) {
  ipcMain.handle(channel, (event, value) => {
    trusted(event);
    return serial(() => callback(value));
  });
}
function connect() {
  if (!selected) throw new Error("请先选择练习");
  runtime.startTerminal(
    selected,
    (data) => {
      if (!window.isDestroyed()) window.webContents.send("terminal:data", data);
    },
    (message) => {
      if (!window.isDestroyed())
        window.webContents.send("terminal:exit", message);
    },
  );
}
async function createWindow() {
  window = new BrowserWindow({
    width: 1536,
    height: 1000,
    minWidth: 1080,
    minHeight: 720,
    title: "Git Onboarding",
    backgroundColor: "#f5f6f8",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: "question",
      buttons: ["继续编辑", "放弃编辑并关闭"],
      defaultId: 0,
      cancelId: 0,
      title: "编辑尚未保存",
      message: "编辑器中的改动还没有保存到练习文件。",
      detail: "关闭后会丢失未保存的编辑；已保存的仓库和学习进度会保留。",
    });
    if (choice === 1) event.preventDefault();
  });
  window.on("closed", () => runtime.stopTerminal());
  await window.loadFile(entry);
}
if (locked)
  app.whenReady().then(async () => {
    runtime = new Runtime(
      app.getPath("userData"),
      app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, "../resources"),
    );
    try {
      progress = JSON.parse(
        await fs.readFile(
          path.join(app.getPath("userData"), "progress.json"),
          "utf8",
        ),
      );
    } catch {
      progress = {};
    }
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    handle("runtime:status", () => runtime.status());
    handle("runtime:initialize", () =>
      runtime.initialize((log) => window.webContents.send("runtime:log", log)),
    );
    handle("progress:read", () => progress);
    handle("lesson:begin", async (value) => {
      const next = validateSelection(value);
      runtime.stopTerminal();
      const state = await runtime.call({
        ...next,
        action: "init",
        reset: value.reset === true,
      });
      selected = next;
      return record(state);
    });
    handle("lesson:state", async () => {
      if (!selected) throw new Error("请先选择练习");
      return record(await runtime.call({ ...selected, action: "state" }));
    });
    handle("file:read", async (name) => {
      if (!selected || typeof name !== "string")
        throw new Error("文件请求无效");
      return runtime.call({ ...selected, action: "read", path: name });
    });
    handle("file:write", async (value) => {
      if (
        !selected ||
        !value ||
        typeof value.path !== "string" ||
        typeof value.content !== "string"
      )
        throw new Error("文件请求无效");
      return record(
        await runtime.call({
          ...selected,
          action: "write",
          path: value.path,
          content: value.content,
        }),
      );
    });
    handle("terminal:connect", connect);
    handle("terminal:disconnect", () => runtime.stopTerminal());
    ipcMain.on("terminal:input", (event, value) => {
      try {
        trusted(event);
        runtime.terminalInput(value);
      } catch {}
    });
    ipcMain.on("terminal:resize", (event, value) => {
      try {
        trusted(event);
        runtime.terminalResize(value);
      } catch {}
    });
    await createWindow();
  });
app.on("second-instance", () => {
  window?.restore();
  window?.focus();
});
app.on("window-all-closed", () => app.quit());
