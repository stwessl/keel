import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function localAppData() {
  return process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
}

export function keelDir() {
  return path.join(localAppData(), "Keel");
}

export function keelSettingsPath() {
  return path.join(keelDir(), "settings.json");
}

// The official RawAccel runtime: shipped inside the installed app, or fetched
// into vendor/ by `npm run fetch-rawaccel` when running from source.
export function bundledRawAccelDirs() {
  return [
    process.resourcesPath && path.join(process.resourcesPath, "rawaccel"),
    path.join(projectDir, "vendor", "rawaccel"),
  ].filter(Boolean);
}

export function settingsCandidates() {
  return [
    process.env.KEEL_SETTINGS,
    keelSettingsPath(),
    path.join(localAppData(), "RawAccel", "settings.json"),
  ].filter(Boolean);
}

export function writerCandidates() {
  return [
    process.env.KEEL_WRITER,
    path.join(keelDir(), "rawaccel", "writer.exe"),
    ...bundledRawAccelDirs().map((dir) => path.join(dir, "writer.exe")),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "RawAccel", "writer.exe"),
  ].filter(Boolean);
}

export function installerCandidates() {
  return [
    path.join(keelDir(), "rawaccel", "installer.exe"),
    ...bundledRawAccelDirs().map((dir) => path.join(dir, "installer.exe")),
  ];
}

export function firstExisting(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function defaultStatePath() {
  return path.join(keelDir(), "state.json");
}
