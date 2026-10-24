import { execFile } from "node:child_process";
import path from "node:path";

// RawAccel's installer needs administrator rights, so Windows shows its UAC
// prompt. It finds the driver in the driver folder next to itself.
export function launchDriverInstaller(installerPath) {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const command = `Start-Process -FilePath ${quote(installerPath)} -WorkingDirectory ${quote(path.dirname(installerPath))} -Verb RunAs`;
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true }, (error) => {
      resolve(error
        ? { ok: false, error: "Windows did not start the RawAccel installer. Accept the administrator prompt to install the driver." }
        : { ok: true });
    });
  });
}

export function parseServiceQuery(output) {
  const match = /STATE\s*:\s*\d+\s+(\w+)/.exec(output ?? "");
  return match ? match[1].toUpperCase() : null;
}

// Only reports whether the kernel driver is loaded. The settings it holds can
// only be read through its device interface, which Keel does not use.
export function queryDriver(timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve({ known: false, installed: false, running: false, state: null });
      return;
    }
    execFile("sc.exe", ["query", "rawaccel"], { windowsHide: true, timeout: timeoutMs }, (error, stdout) => {
      const state = parseServiceQuery(stdout);
      if (state) {
        resolve({ known: true, installed: true, running: state === "RUNNING", state });
        return;
      }
      const missing = /1060/.test(String(stdout)) || error?.code === 1060;
      resolve({ known: missing, installed: false, running: false, state: null });
    });
  });
}
