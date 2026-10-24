import { app, BrowserWindow, dialog, Menu, session } from "electron";
import { createKeelServer, resolveOptions } from "../src/server.js";

// A fixed port keeps the page origin stable, so saved setup in localStorage survives restarts.
const PORT = 4741;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ALLOWED_PERMISSIONS = new Set(["pointerLock", "fullscreen"]);

let window = null;

function fail(message) {
  dialog.showErrorBox("Keel", message);
  app.quit();
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });
}

function openWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: "Keel",
    backgroundColor: "#0b0908",
    show: false,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true },
  });
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ORIGIN)) event.preventDefault();
  });
  window.on("closed", () => { window = null; });
  window.loadURL(`${ORIGIN}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on("window-all-closed", () => app.quit());

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(ALLOWED_PERMISSIONS.has(permission));
    });
    let options;
    try {
      options = resolveOptions({ dryRun: process.argv.includes("--dry-run"), port: PORT, settingsPath: null, statePath: null });
    } catch (error) {
      fail(error.message);
      return;
    }
    const server = createKeelServer(options);
    try {
      await listen(server);
    } catch (error) {
      fail(error.code === "EADDRINUSE"
        ? `Port ${PORT} is already in use, so Keel cannot start. Close whatever is using it and try again.`
        : error.message);
      return;
    }
    app.on("before-quit", () => server.close());
    openWindow();
  });
}
