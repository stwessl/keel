import fs from "node:fs";
import path from "node:path";
import { snapshotProfile, tuneSettings, writeSnapshot } from "./tune.js";
import { summarize } from "./transform.js";

export function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function saveJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

const KEPT_ROUNDS = 20;

export function emptyState(settingsPath) {
  return { settingsPath, history: [], rounds: [] };
}

export function readState(statePath, settingsPath) {
  try {
    const parsed = loadJson(statePath);
    if (parsed.settingsPath !== settingsPath) return emptyState(settingsPath);
    return {
      settingsPath,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      rounds: Array.isArray(parsed.rounds) ? parsed.rounds : [],
    };
  } catch {
    return emptyState(settingsPath);
  }
}

export function stageRound(state, round) {
  return { ...state, rounds: [...(state.rounds ?? []), round].slice(-KEPT_ROUNDS) };
}

export function backupPathFor(settingsPath) {
  return `${settingsPath}.keel-before.json`;
}

export function inspectSettings(settingsPath, statePath) {
  const settings = loadJson(settingsPath);
  return {
    settings,
    state: readState(statePath, settingsPath),
    summary: summarize(settings),
    hasBackup: fs.existsSync(backupPathFor(settingsPath)),
  };
}

export function stageTune(settings, state, factors, label) {
  const before = settings.profiles.map((profile) => snapshotProfile(profile));
  const history = [...(state.history ?? [])];
  if (history.length === 0) {
    history.push({ at: new Date().toISOString(), label: "Before tuning", snapshot: before });
  }
  const { settings: next, applied } = tuneSettings(settings, factors);
  history.push({
    at: new Date().toISOString(),
    label,
    factors,
    snapshot: applied.map((profile) => ({
      outputDpi: profile.outputDpi,
      yx: profile.yx,
      lr: profile.lr,
      ud: profile.ud,
      rotation: profile.rotation,
    })),
  });
  return { settings: next, applied, state: { ...state, history } };
}

export function stageRevert(settings, state, index) {
  const history = state.history ?? [];
  const entry = history[index];
  if (!entry) throw new Error("That history step does not exist.");
  const next = structuredClone(settings);
  if (entry.snapshot.length !== next.profiles.length) {
    throw new Error("History does not match the current profiles.");
  }
  const applied = next.profiles.map((profile, profileIndex) => {
    writeSnapshot(profile, entry.snapshot[profileIndex]);
    return { name: profile.name ?? "", ...entry.snapshot[profileIndex] };
  });
  return {
    settings: next,
    applied,
    state: { ...state, history: history.slice(0, index + 1) },
  };
}

export function commitSettings({ settingsPath, statePath, nextSettings, nextState }) {
  const backupPath = backupPathFor(settingsPath);
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(settingsPath, backupPath);
  }
  saveJson(settingsPath, nextSettings);
  saveJson(statePath, nextState);
  return { backupPath };
}
