// Renderer bilan asosiy jarayon orasidagi yagona ko'prik.
// contextIsolation yoqilgan — renderer'da Node API yo'q.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("stocker", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (patch) => ipcRenderer.invoke("config:save", patch),
  listPrinters: () => ipcRenderer.invoke("printers:list"),
  testPrint: (target) => ipcRenderer.invoke("printers:test", target),
  getState: () => ipcRenderer.invoke("state:get"),
  clearJobs: () => ipcRenderer.invoke("jobs:clear"),
  reconnect: () => ipcRenderer.invoke("client:reconnect"),
  pairQr: () => ipcRenderer.invoke("pair:qr"),

  onStatus: (cb) => ipcRenderer.on("status", (e, v) => cb(v)),
  onLog: (cb) => ipcRenderer.on("log", (e, v) => cb(v)),
  onJobs: (cb) => ipcRenderer.on("jobs", (e, v) => cb(v)),
});
