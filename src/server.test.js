import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createKeelServer } from "./server.js";

const LR = "L/R output DPI ratio (left sens multiplier)";
const UD = "U/D output DPI ratio (up sens multiplier)";
const YX = "Y/X output DPI ratio (vertical sens multiplier)";

function fixture() {
  return {
    version: "1.7.1",
    profiles: [
      {
        name: "default",
        "Whole or horizontal accel parameters": { mode: "noaccel", acceleration: 0.2 },
        "Output DPI": 1300,
        [YX]: 1.4,
        [LR]: 1,
        [UD]: 1,
        "Degrees of rotation": 12,
      },
      {
        name: "other",
        "Whole or horizontal accel parameters": { mode: "classic" },
        "Output DPI": 800,
        [YX]: 0.8,
        "Degrees of rotation": 0,
      },
    ],
  };
}

async function withServer(options, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "keel-"));
  const settingsPath = path.join(directory, "settings.json");
  const statePath = path.join(directory, "state.json");
  const original = JSON.stringify(options.settings ?? fixture(), null, 2);
  fs.writeFileSync(settingsPath, original);
  const server = createKeelServer({
    settingsPath,
    statePath,
    writerPath: options.writer ? "writer.exe" : null,
    dryRun: !options.writer,
    runWriter: options.writer,
    queryDriver: async () => ({ known: true, installed: true, running: true, state: "RUNNING" }),
    startupDir: path.join(directory, "Startup"),
    installerPath: options.installerPath ?? null,
    installDriver: options.installDriver,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const post = async (route, body) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    await run({ port, settingsPath, statePath, original, post, startupDir: path.join(directory, "Startup") });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function compassFlicks(upGain) {
  const flicks = [];
  for (const angle of [0, 180, 270]) {
    const radians = (angle * Math.PI) / 180;
    for (const distance of [20, 22]) {
      const intended = { x: Math.cos(radians) * distance, y: Math.sin(radians) * distance };
      flicks.push({ intended, actual: { x: intended.x, y: intended.y }, ms: 300 });
    }
  }
  flicks.push({ intended: { x: 0, y: 20 }, actual: { x: 0, y: 20 * upGain }, ms: 450 });
  flicks.push({ intended: { x: 0, y: 22 }, actual: { x: 0, y: 22 * upGain }, ms: 450 });
  return flicks;
}

const writerOk = async () => ({ ok: true, code: 0, error: "" });

const CS2_SETUP = { game: "cs2", sens: 2, sensY: 2, dpi: 800, yaw: 0.022, cm360: 914.4 / (800 * 2 * 0.022) };

async function playRound(post, flicks, look = {}, setup = CS2_SETUP) {
  const played = await post("/api/rounds", { flicks, look, game: setup?.game ?? "cs2", setup });
  assert.equal(played.status, 200);
  return played.body;
}

test("a tuning step raises the short axis and can be reverted", async () => {
  await withServer({ writer: writerOk }, async ({ settingsPath, post }) => {
    const round = await playRound(post, compassFlicks(0.75));
    assert.ok(round.pooled.viewFactors.up > 1);
    assert.ok(round.pooled.preview.ud > 1);
    const tuned = await post("/api/tune", { label: "Round 1" });
    assert.equal(tuned.body.ok, true);
    assert.ok(tuned.body.report.factors.up > 1);
    const saved = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.ok(saved.profiles[0][UD] > 1);
    assert.ok(saved.profiles[0][YX] > 0);
    assert.equal(saved.profiles[0]["Whole or horizontal accel parameters"].acceleration, 0.2);
    assert.equal(saved.profiles[0]["Whole or horizontal accel parameters"].mode, "noaccel");
    assert.equal(saved.profiles[0]["Degrees of rotation"], 12);
    assert.ok(fs.existsSync(`${settingsPath}.keel-before.json`));
    const undone = await post("/api/revert", { index: 0 });
    assert.equal(undone.body.ok, true);
    const restored = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.equal(restored.profiles[0][UD], 1);
    assert.equal(restored.profiles[0]["Output DPI"], 1300);
  });
});

test("an even round has no step to send", async () => {
  await withServer({ writer: writerOk }, async ({ port, settingsPath, original, post }) => {
    await playRound(post, compassFlicks(1));
    const loaded = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
    assert.equal(loaded.driver.running, true);
    assert.equal(loaded.lastRound.flicks.length, compassFlicks(1).length);
    assert.equal(loaded.lastRound.report.bins.length, 8);
    const tuned = await post("/api/tune", {});
    assert.equal(tuned.status, 400);
    assert.equal(fs.readFileSync(settingsPath, "utf8"), original);
  });
});

function viewFlicks(shortDirection) {
  const flicks = [];
  for (const angle of [0, 90, 180, 270]) {
    const radians = (angle * Math.PI) / 180;
    const gain = angle === shortDirection ? 0.75 : 1;
    for (const distance of [18, 22]) {
      const intended = { x: Math.cos(radians) * distance, y: Math.sin(radians) * distance };
      flicks.push({ intended, actual: { x: intended.x * gain, y: intended.y * gain }, ms: 400 });
    }
  }
  return flicks;
}

function physicalScales(profile) {
  const right = profile["Output DPI"];
  const down = right * Math.abs(profile[YX]);
  return { right, left: right * profile[LR], down, up: down * profile[UD] };
}

// The view direction that fell short, the range invert, and the hand
// direction RawAccel has to speed up.
const INVERT_CASES = [
  { view: 90, look: {}, physical: "up" },
  { view: 90, look: { invertY: true }, physical: "down" },
  { view: 270, look: {}, physical: "down" },
  { view: 270, look: { invertY: true }, physical: "up" },
  { view: 180, look: {}, physical: "left" },
  { view: 180, look: { invertX: true }, physical: "right" },
  { view: 0, look: {}, physical: "right" },
  { view: 0, look: { invertX: true }, physical: "left" },
  { view: 90, look: { invertX: true, invertY: true }, physical: "down" },
  { view: 180, look: { invertX: true, invertY: true }, physical: "right" },
];

for (const { view, look, physical } of INVERT_CASES) {
  const flags = Object.keys(look).join(" and ") || "no invert";
  test(`a short ${view}° view flick with ${flags} speeds up physical ${physical}`, async () => {
    await withServer({ writer: writerOk }, async ({ settingsPath, post }) => {
      const before = physicalScales(JSON.parse(fs.readFileSync(settingsPath, "utf8")).profiles[0]);
      await playRound(post, viewFlicks(view), look);
      const tuned = await post("/api/tune", {});
      assert.equal(tuned.body.ok, true);
      const after = physicalScales(JSON.parse(fs.readFileSync(settingsPath, "utf8")).profiles[0]);
      const change = Object.fromEntries(Object.keys(before).map((axis) => [axis, after[axis] / before[axis]]));
      const fastest = Object.keys(change).reduce((best, axis) => (change[axis] > change[best] ? axis : best));
      assert.equal(fastest, physical);
      assert.ok(change[physical] > 1.02);
    });
  });
}

test("range invert tunes the physical axis that moved the view", async () => {
  await withServer({ writer: writerOk }, async ({ settingsPath, post }) => {
    const round = await playRound(post, compassFlicks(0.75), { invertY: true });
    assert.ok(round.pooled.viewFactors.up > 1);
    const tuned = await post("/api/tune", {});
    assert.equal(tuned.body.ok, true);
    const saved = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.ok(saved.profiles[0][UD] < 1);
    assert.ok(saved.profiles[0][YX] > 1.4);
  });
});

test("a failed writer puts the settings file back", async () => {
  const writerFails = async () => ({ ok: false, code: 1, error: "driver missing" });
  await withServer({ writer: writerFails }, async ({ settingsPath, statePath, original, post }) => {
    await playRound(post, compassFlicks(0.75));
    const response = await post("/api/tune", {});
    assert.equal(response.status, 502);
    assert.equal(response.body.error, "driver missing");
    assert.equal(fs.readFileSync(settingsPath, "utf8"), original);
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.equal(state.history.length, 0);
    assert.equal(state.rounds.length, 1);
    assert.equal(fs.existsSync(`${settingsPath}.keel-before.json`), false);
  });
});

test("dry run does not write the settings file", async () => {
  await withServer({}, async ({ settingsPath, original, post }) => {
    await playRound(post, compassFlicks(0.75));
    const response = await post("/api/tune", {});
    assert.equal(response.body.dryRun, true);
    assert.equal(fs.readFileSync(settingsPath, "utf8"), original);
  });
});

test("rounds are saved, and one round is only used for one step", async () => {
  await withServer({ writer: writerOk }, async ({ port, settingsPath, post }) => {
    const refused = await post("/api/tune", {});
    assert.equal(refused.status, 400);
    await playRound(post, compassFlicks(0.75));
    assert.equal((await post("/api/tune", {})).body.ok, true);
    const firstUp = JSON.parse(fs.readFileSync(settingsPath, "utf8")).profiles[0][UD];
    const again = await post("/api/tune", {});
    assert.equal(again.status, 400);
    const second = await playRound(post, compassFlicks(0.75));
    assert.equal(second.pooled.roundsUsed, 2);
    assert.equal(second.pooled.view.flicks.length, 2 * compassFlicks(0.75).length);
    assert.equal(second.pooled.view.bins.length, 8);
    assert.equal(second.roundsSaved, 2);
    assert.equal((await post("/api/tune", {})).body.ok, true);
    const secondUp = JSON.parse(fs.readFileSync(settingsPath, "utf8")).profiles[0][UD];
    assert.ok(secondUp > firstUp);
    const state = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
    assert.equal(state.roundsSaved, 2);
  });
});

test("state reports the RawAccel multiplier and a driver invert", async () => {
  const settings = fixture();
  settings.profiles[0][YX] = -1.4;
  await withServer({ settings }, async ({ port }) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/state`);
    const body = await response.json();
    assert.equal(body.profiles[0].multiplier, 1.3);
    assert.equal(body.profiles[0].mode, "noaccel");
    assert.deepEqual(body.profiles[0].driverInvert, { vertical: true, horizontal: false });
  });
});

test("the old driver invert routes are gone", async () => {
  await withServer({}, async ({ post }) => {
    const response = await post("/api/apply", { invertY: true });
    assert.notEqual(response.status, 200);
  });
});

function rawRequest(port, { method = "POST", route = "/api/tune", headers = {}, body = "" }) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, method, path: route, headers }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
    request.end(body);
  });
}

test("other sites cannot drive the server", async () => {
  await withServer({ writer: writerOk }, async ({ port, settingsPath, original }) => {
    const body = JSON.stringify({ flicks: compassFlicks(0.75) });
    const plain = await rawRequest(port, { headers: { "content-type": "text/plain" }, body });
    assert.equal(plain, 403);
    const foreign = await rawRequest(port, {
      headers: { "content-type": "application/json", origin: "https://example.com" },
      body,
    });
    assert.equal(foreign, 403);
    const rebound = await rawRequest(port, {
      method: "GET",
      route: "/api/state",
      headers: { host: `evil.example:${port}` },
    });
    assert.equal(rebound, 403);
    assert.equal(fs.readFileSync(settingsPath, "utf8"), original);
  });
});

test("the sign-in toggle writes and removes only Keel's startup script", async () => {
  await withServer({ writer: writerOk }, async ({ port, settingsPath, post, startupDir }) => {
    fs.mkdirSync(startupDir);
    const other = path.join(startupDir, "Other RawAccel.vbs");
    fs.writeFileSync(other, `sh.Run """C:\\RawAccel\\writer.exe"" ""${settingsPath}""", 0, False`);
    const before = (await (await fetch(`http://127.0.0.1:${port}/api/state`)).json()).startup;
    assert.deepEqual(before, { available: true, enabled: false, others: [{ name: "Other RawAccel.vbs", sameFile: true }] });
    fs.writeFileSync(path.join(startupDir, "Stale.vbs"), 'sh.Run """C:\\RawAccel\\writer.exe"" ""C:\\elsewhere\\settings.json"""');
    const stale = (await (await fetch(`http://127.0.0.1:${port}/api/state`)).json()).startup.others;
    assert.deepEqual(stale.find((entry) => entry.name === "Stale.vbs"), { name: "Stale.vbs", sameFile: false });

    const on = await post("/api/startup", { enabled: true });
    assert.equal(on.body.startup.enabled, true);
    const bytes = fs.readFileSync(path.join(startupDir, "Keel RawAccel.vbs"));
    const script = bytes.subarray(2).toString("utf16le");
    assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xfe]);
    assert.ok(script.includes(`sh.Run """writer.exe"" ""${settingsPath}""", 0, False`));

    const off = await post("/api/startup", { enabled: false });
    assert.equal(off.body.startup.enabled, false);
    assert.equal(fs.existsSync(path.join(startupDir, "Keel RawAccel.vbs")), false);
    assert.equal(fs.existsSync(other), true);
  });
});

test("the sign-in toggle changes nothing in a dry run", async () => {
  await withServer({}, async ({ post, startupDir }) => {
    fs.mkdirSync(startupDir);
    const script = path.join(startupDir, "Keel RawAccel.vbs");
    fs.writeFileSync(script, "keep");
    const off = await post("/api/startup", { enabled: false });
    assert.equal(off.body.dryRun, true);
    assert.equal(off.body.startup.enabled, false);
    assert.equal(fs.readFileSync(script, "utf8"), "keep");
  });
});

test("setup is saved next to the state file and cleaned", async () => {
  await withServer({}, async ({ port, statePath, post }) => {
    const empty = await (await fetch(`http://127.0.0.1:${port}/api/prefs`)).json();
    assert.equal(empty.prefs, null);
    const saved = await post("/api/prefs", {
      setup: { game: "cod", sens: "2.19", nested: { no: 1 } },
      look: { invertY: true, invertX: false },
      extra: "dropped",
    });
    assert.deepEqual(saved.body.prefs, { setup: { game: "cod", sens: "2.19" }, look: { invertY: true, invertX: false } });
    const file = JSON.parse(fs.readFileSync(path.join(path.dirname(statePath), "prefs.json"), "utf8"));
    assert.deepEqual(file, saved.body.prefs);
    const loaded = await (await fetch(`http://127.0.0.1:${port}/api/prefs`)).json();
    assert.deepEqual(loaded.prefs, saved.body.prefs);
  });
});

test("importing RawAccel settings replaces the file, the backup, and the history", async () => {
  await withServer({ writer: writerOk }, async ({ settingsPath, post }) => {
    await playRound(post, compassFlicks(0.75));
    await post("/api/tune", { label: "Round 1" });
    fs.writeFileSync(`${settingsPath}.keel-default`, "");
    const mine = fixture();
    mine.profiles[0]["Output DPI"] = 777;
    const rejected = await post("/api/import", { settings: { hello: 1 } });
    assert.equal(rejected.status, 400);
    const imported = await post("/api/import", { settings: mine });
    assert.equal(imported.body.ok, true);
    assert.equal(imported.body.history.length, 0);
    assert.equal(imported.body.settingsAreDefault, false);
    assert.equal(JSON.parse(fs.readFileSync(settingsPath, "utf8")).profiles[0]["Output DPI"], 777);
    assert.equal(JSON.parse(fs.readFileSync(`${settingsPath}.keel-before.json`, "utf8")).profiles[0]["Output DPI"], 777);
  });
});

test("the driver installer only runs outside a dry run", async () => {
  let launched = null;
  await withServer({ writer: writerOk, installerPath: "C:\\RawAccel\\installer.exe", installDriver: async (file) => { launched = file; return { ok: true }; } }, async ({ post }) => {
    const started = await post("/api/driver/install", {});
    assert.equal(started.body.ok, true);
    assert.equal(launched, "C:\\RawAccel\\installer.exe");
  });
  launched = null;
  await withServer({ installerPath: "C:\\RawAccel\\installer.exe", installDriver: async () => { launched = true; return { ok: true }; } }, async ({ post }) => {
    const dry = await post("/api/driver/install", {});
    assert.equal(dry.body.dryRun, true);
    assert.equal(launched, null);
  });
});

test("Keel's default settings load like a real RawAccel file", async () => {
  const { defaultSettings } = await import("./defaults.js");
  await withServer({ settings: defaultSettings() }, async ({ port }) => {
    const loaded = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
    assert.equal(loaded.profiles[0].outputDpi, 1000);
    assert.equal(loaded.profiles[0].mode, "noaccel");
  });
});

test("the settings a round was played on can be put back", async () => {
  await withServer({ writer: writerOk }, async ({ port, settingsPath, post }) => {
    await playRound(post, compassFlicks(0.75));
    const tuned = await post("/api/tune", { label: "Round 1" });
    assert.equal(tuned.body.ok, true);
    assert.ok(JSON.parse(fs.readFileSync(settingsPath, "utf8")).profiles[0][UD] > 1);

    const scores = await (await fetch(`http://127.0.0.1:${port}/api/rounds/scores?cm360=${CS2_SETUP.cm360}`)).json();
    assert.equal(scores.rounds.length, 1);
    assert.equal(scores.rounds[0].current, false);
    assert.equal(scores.rounds[0].settings.ud, 1);

    const used = await post("/api/rounds/use", { at: scores.rounds[0].at });
    assert.equal(used.body.ok, true);
    const saved = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.equal(saved.profiles[0][UD], 1);
    assert.equal(saved.profiles[0]["Output DPI"], 1300);
    assert.equal(saved.profiles[0]["Degrees of rotation"], 12);
    assert.equal(saved.profiles[1]["Output DPI"], 800);
    assert.equal(used.body.history.at(-1).label, "Settings from round 1");

    const after = await (await fetch(`http://127.0.0.1:${port}/api/rounds/scores?cm360=${CS2_SETUP.cm360}`)).json();
    assert.equal(after.rounds[0].current, true);
    const missing = await post("/api/rounds/use", { at: "never" });
    assert.equal(missing.status, 400);
  });
});

test("rounds saved before snapshots are put back from their direction scales", async () => {
  await withServer({ writer: writerOk }, async ({ port, settingsPath, statePath, post }) => {
    await playRound(post, compassFlicks(0.75));
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    delete state.rounds[0].snapshot;
    state.rounds[0].scales = { ...state.rounds[0].scales, up: state.rounds[0].scales.up * 1.1 };
    fs.writeFileSync(statePath, JSON.stringify(state));
    const scores = await (await fetch(`http://127.0.0.1:${port}/api/rounds/scores?cm360=${CS2_SETUP.cm360}`)).json();
    await post("/api/rounds/use", { at: scores.rounds[0].at });
    const saved = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const scales = physicalScales(saved.profiles[0]);
    assert.ok(Math.abs(scales.up / scales.right / (1.4 * 1.1) - 1) < 1e-6);
    assert.equal(saved.profiles[0]["Degrees of rotation"], 12);
  });
});

test("rounds are only ranked against the same cm/360, whatever the game", async () => {
  await withServer({}, async ({ port, post }) => {
    const valorant = { game: "valorant", sens: 2 * 0.022 / 0.07, dpi: 800, yaw: 0.07, cm360: CS2_SETUP.cm360 };
    const faster = { ...CS2_SETUP, sens: 3, cm360: 914.4 / (800 * 3 * 0.022) };
    await playRound(post, compassFlicks(1));
    await playRound(post, compassFlicks(1), {}, valorant);
    await playRound(post, compassFlicks(1), {}, faster);
    await playRound(post, compassFlicks(1), {}, null);
    const scores = async (cm360) => (await fetch(`http://127.0.0.1:${port}/api/rounds/scores?cm360=${cm360}`)).json();

    const same = await scores(CS2_SETUP.cm360);
    assert.deepEqual(same.rounds.map((entry) => [entry.number, entry.game]), [[1, "cs2"], [2, "valorant"]]);
    assert.equal(same.otherRounds, 1);
    assert.equal(same.unrecordedRounds, 1);
    const other = await scores(faster.cm360);
    assert.deepEqual(other.rounds.map((entry) => entry.number), [3]);

    const adopted = await post("/api/rounds/adopt", { setup: faster });
    assert.deepEqual(adopted.body.rounds.map((entry) => entry.number), [3, 4]);
    assert.equal(adopted.body.unrecordedRounds, 0);
    const kept = await scores(CS2_SETUP.cm360);
    assert.equal(kept.rounds.length, 2);
  });
});

test("the pooled chart is drawn in the range's directions even when inverted", async () => {
  await withServer({}, async ({ port, post }) => {
    const flicks = compassFlicks(0.75);
    const round = await playRound(post, flicks, { invertY: true });
    const up = round.pooled.view.flicks.find((item) => item.intended.y > 0 && item.intended.x === 0);
    assert.ok(up.actual.y > 0);
    const upBin = round.pooled.view.bins[2];
    assert.ok(upBin.count > 0);
    const loaded = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
    assert.deepEqual(loaded.pooled.view.bins, round.pooled.view.bins);
  });
});
