import fs from "node:fs";
import path from "node:path";

export const SCRIPT_NAME = "Keel RawAccel.vbs";
const TEXT_SCRIPTS = new Set([".vbs", ".cmd", ".bat", ".ps1"]);

export function defaultStartupDir() {
  const roaming = process.env.APPDATA;
  return roaming ? path.join(roaming, "Microsoft", "Windows", "Start Menu", "Programs", "Startup") : null;
}

function vbsString(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function startupScript(writerPath, settingsPath) {
  const command = `"${writerPath}" "${settingsPath}"`;
  return [
    "' Keel: send the tuned RawAccel settings to the driver at sign-in.",
    'Set sh = CreateObject("WScript.Shell")',
    `sh.CurrentDirectory = ${vbsString(path.dirname(writerPath))}`,
    `sh.Run ${vbsString(command)}, 0, False`,
    "",
  ].join("\r\n");
}

function readText(file) {
  const bytes = fs.readFileSync(file);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  return bytes.toString("utf8");
}

// Windows Script Host reads UTF-16 with a BOM, which keeps non-ASCII user paths intact.
function writeScript(file, text) {
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
}

// Any other script that runs writer.exe at sign-in races Keel's and may send different settings.
export function readStartup(dir, settingsPath) {
  if (!dir || !fs.existsSync(dir)) return { available: Boolean(dir), enabled: false, others: [] };
  const target = settingsPath.toLowerCase();
  const others = fs.readdirSync(dir).flatMap((name) => {
    if (name === SCRIPT_NAME || !TEXT_SCRIPTS.has(path.extname(name).toLowerCase())) return [];
    try {
      const text = readText(path.join(dir, name)).toLowerCase();
      return text.includes("writer.exe") ? [{ name, sameFile: text.includes(target) }] : [];
    } catch {
      return [];
    }
  });
  return { available: true, enabled: fs.existsSync(path.join(dir, SCRIPT_NAME)), others };
}

export function setStartup(dir, enabled, writerPath, settingsPath) {
  const file = path.join(dir, SCRIPT_NAME);
  if (enabled) {
    fs.mkdirSync(dir, { recursive: true });
    writeScript(file, startupScript(writerPath, settingsPath));
  } else if (fs.existsSync(file)) {
    fs.rmSync(file);
  }
  return readStartup(dir, settingsPath);
}
