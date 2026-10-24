import { spawn } from "node:child_process";
import path from "node:path";

export function runWriter(writerPath, settingsPath, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = spawn(writerPath, [settingsPath], {
      cwd: path.dirname(writerPath),
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      finish({
        ok: false,
        code: null,
        error: "RawAccel writer did not finish. If a Raw Accel dialog is open, close it and try again.",
      });
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ ok: false, code: null, error: error.message });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      finish({
        ok: code === 0,
        code,
        error: code === 0 ? "" : `RawAccel writer exited with code ${code}.`,
      });
    });
  });
}
