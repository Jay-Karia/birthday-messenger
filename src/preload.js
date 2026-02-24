const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");
const fs = require("fs");

// Load environment variables from .env.local
const dotenv = require("dotenv");
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

contextBridge.exposeInMainWorld("darkMode", {
  toggle: () => ipcRenderer.invoke("dark-mode:toggle"),
  system: () => ipcRenderer.invoke("dark-mode:system"),
  set: (mode) => ipcRenderer.invoke("dark-mode:set", mode), // NEW
});

contextBridge.exposeInMainWorld("electron", {
  openExternal: async (url) => {
    try {
      const res = await ipcRenderer.invoke("open-external", url);
      if (!res || res.ok !== true) {
        console.warn("openExternal reported an issue", res);
      }
      return res;
    } catch (e) {
      console.error("openExternal ipc error", e);
      return { ok: false, error: e.message };
    }
  },
});
