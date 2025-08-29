const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require("electron");
const path = require("node:path");
require('update-electron-app')()

if (require("electron-squirrel-startup")) {
  app.quit();
}

ipcMain.handle("open-external", async (_event, url) => {
  try {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      throw new Error("Invalid external URL");
    }
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    console.error("[open-external] Failed:", err);
    return { ok: false, error: err.message || "openExternal failed" };
  }
});

ipcMain.handle("dark-mode:toggle", () => {
  nativeTheme.themeSource = nativeTheme.shouldUseDarkColors ? "light" : "dark";
  return nativeTheme.shouldUseDarkColors;
});

ipcMain.handle("dark-mode:system", () => {
  nativeTheme.themeSource = "system";
  return nativeTheme.shouldUseDarkColors;
});

// NEW: explicit setter for persistence
ipcMain.handle("dark-mode:set", (_evt, mode) => {
  if (!["light", "dark", "system"].includes(mode)) {
    mode = "system";
  }
  nativeTheme.themeSource = mode;
  return nativeTheme.shouldUseDarkColors;
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minHeight: 600,
    minWidth: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "icons", "icon.ico"),
    autoHideMenuBar: true,
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
};

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});