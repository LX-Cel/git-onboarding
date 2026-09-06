const { contextBridge, ipcRenderer } = require("electron");
const invoke = (channel, value) => ipcRenderer.invoke(channel, value);
const subscribe = (channel, callback) => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld("gitLab", {
  display: () => invoke("display:read"),
  setDisplay: (value) => invoke("display:set", value),
  onDisplay: (callback) => subscribe("display:changed", callback),
  status: () => invoke("runtime:status"),
  initialize: () => invoke("runtime:initialize"),
  begin: (value) => invoke("lesson:begin", value),
  state: () => invoke("lesson:state"),
  read: (path) => invoke("file:read", path),
  write: (value) => invoke("file:write", value),
  progress: () => invoke("progress:read"),
  connect: () => invoke("terminal:connect"),
  disconnect: () => invoke("terminal:disconnect"),
  input: (data) => ipcRenderer.send("terminal:input", data),
  resize: (size) => ipcRenderer.send("terminal:resize", size),
  onData: (callback) => subscribe("terminal:data", callback),
  onExit: (callback) => subscribe("terminal:exit", callback),
  onSetup: (callback) => subscribe("runtime:log", callback),
});
