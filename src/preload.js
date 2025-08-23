const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("darkMode", {
  toggle: () => ipcRenderer.invoke("dark-mode:toggle"),
  system: () => ipcRenderer.invoke("dark-mode:system"),
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