import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES } from "./games.js";
import { defaultStatePath, firstExisting, installerCandidates, keelSettingsPath, settingsCandidates, writerCandidates } from "./paths.js";
import { defaultSettings } from "./defaults.js";
import {
  backupPathFor,
  commitSettings,
  inspectSettings,
  loadJson,
  profileValues,
  roundSettings,
  saveJson,
  stageRevert,
  stageRound,
  stageRoundSettings,
  stageTune,
} from "./store.js";
import { analyzeFlicks, driverScales, factorsForDriver, pooledFlicks, snapshotProfile, toDriverSpace, tuneSettings } from "./tune.js";
import { sameSensitivity, scoreRounds } from "./best.js";
import { summarize } from "./transform.js";
import { runWriter } from "./writer.js";
import { launchDriverInstaller, queryDriver } from "./driver.js";
import { defaultStartupDir, readStartup, setStartup } from "./startup.js";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

function send(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(payload);
}

// Only this page may drive the server. A JSON content type forces a CORS
// preflight that other sites cannot pass, and the Host check stops DNS rebinding.
export function trustedRequest(request) {
  const port = request.socket.localPort;
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  if (!hosts.has(request.headers.host)) return false;
  const origin = request.headers.origin;
  if (origin && !hosts.has(origin.replace(/^http:\/\//, ""))) return false;
  if (request.method === "POST") {
    const type = String(request.headers["content-type"] || "");
    if (!type.toLowerCase().startsWith("application/json")) return false;
  }
  return true;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function cleanFlicks(flicks) {
  if (!Array.isArray(flicks)) return [];
  return flicks.slice(0, 200).flatMap((flick) => {
    const intended = { x: finite(flick?.intended?.x), y: finite(flick?.intended?.y) };
    const actual = { x: finite(flick?.actual?.x), y: finite(flick?.actual?.y) };
    if ([intended.x, intended.y, actual.x, actual.y].includes(null)) return [];
    return [{
      intended,
      actual,
      ms: finite(flick.ms),
      reactionMs: finite(flick.reactionMs),
      landMs: finite(flick.landMs),
      hit: Boolean(flick.hit),
    }];
  });
}

// The in-game setup a round was played at. cm/360 is before RawAccel, so
// rounds on different RawAccel steps still compare at the same game sensitivity.
export function cleanSetup(setup) {
  const cm360 = finite(setup?.cm360);
  if (!(cm360 > 0)) return null;
  const cm360y = finite(setup.cm360y);
  return {
    game: String(setup.game || "").slice(0, 40),
    aim: String(setup.aim || "").slice(0, 20),
    pad: String(setup.pad || "").slice(0, 20),
    sens: finite(setup.sens),
    sensY: finite(setup.sensY),
    dpi: finite(setup.dpi),
    yaw: finite(setup.yaw),
    cm360,
    cm360y: cm360y > 0 ? cm360y : cm360,
  };
}

function cleanLook(look) {
  return { invertY: Boolean(look?.invertY), invertX: Boolean(look?.invertX) };
}

function cleanPrefsGroup(group) {
  if (!group || typeof group !== "object" || Array.isArray(group)) return {};
  return Object.fromEntries(Object.entries(group).slice(0, 40).flatMap(([key, value]) => {
    if (typeof value === "string") return [[key.slice(0, 40), value.slice(0, 80)]];
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return [[key.slice(0, 40), value]];
    return [];
  }));
}

export function cleanPrefs(prefs) {
  return { setup: cleanPrefsGroup(prefs?.setup), look: cleanPrefsGroup(prefs?.look) };
}

export function defaultMarkerFor(settingsPath) {
  return `${settingsPath}.keel-default`;
}

export function validRawAccelSettings(settings) {
  const profile = settings?.profiles?.[0];
  return Boolean(profile && typeof profile === "object" && Number.isFinite(Number(profile["Output DPI"] ?? 1000)));
}

// The pool in the range's own directions, on the current RawAccel values, so
// the landing chart shows exactly what the step is computed from.
function pooledView(flicks, look) {
  const view = flicks.map((flick) => toDriverSpace(flick, look));
  return { flicks: view, bins: analyzeFlicks(view).bins };
}

function sameValues(a, b) {
  const close = (x, y) => Math.abs(x - y) <= Math.max(Math.abs(x), Math.abs(y)) * 0.0005;
  return close(a.outputDpi, b.outputDpi) && close(a.yx, b.yx) && close(a.lr, b.lr) && close(a.ud, b.ud)
    && Math.abs(a.rotation - b.rotation) < 0.01;
}

// Only rounds at the same in-game distance are ranked against each other.
export function roundsReport(state, settings, target) {
  const numbered = state.rounds.map((round, index) => ({ round, number: index + 1 }));
  const matching = numbered.filter(({ round }) => sameSensitivity(round.setup, target));
  const scored = scoreRounds(matching.map(({ round }) => round));
  const now = profileValues(snapshotProfile(settings.profiles[0]));
  return {
    ...scored,
    setup: target ?? null,
    otherRounds: numbered.filter(({ round }) => round.setup && !sameSensitivity(round.setup, target)).length,
    unrecordedRounds: numbered.filter(({ round }) => !round.setup).length,
    rounds: scored.rounds.map((entry, index) => {
      const { round, number } = matching[index];
      let values = null;
      try {
        values = roundSettings(settings, round).applied[0];
      } catch {
        values = null;
      }
      return {
        ...entry,
        number,
        game: round.setup.game,
        settings: values ? profileValues(values) : null,
        current: values ? sameValues(profileValues(values), now) : false,
      };
    }),
  };
}

function setupFromQuery(url) {
  return cleanSetup({ cm360: url.searchParams.get("cm360"), cm360y: url.searchParams.get("cm360y") });
}

function pooledReport(state, settings) {
  const pooled = pooledFlicks(state.rounds, driverScales(settings.profiles[0]));
  return {
    ...analyzeFlicks(pooled.flicks),
    roundsUsed: pooled.rounds,
    flicksUsed: pooled.flicks.length,
    view: pooledView(pooled.flicks, state.rounds.at(-1)?.look),
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createKeelServer(options) {
  const settingsPath = options.settingsPath;
  const statePath = options.statePath;
  const writerPath = options.writerPath;
  const dryRun = Boolean(options.dryRun);
  const invokeWriter = options.runWriter || runWriter;
  const checkDriver = options.queryDriver || queryDriver;
  const startupDir = options.startupDir === undefined ? defaultStartupDir() : options.startupDir;
  const prefsPath = path.join(path.dirname(statePath), "prefs.json");
  const installerPath = options.installerPath ?? null;
  const installDriver = options.installDriver || launchDriverInstaller;

  function snapshot() {
    const inspected = inspectSettings(settingsPath, statePath);
    const last = inspected.state.rounds.at(-1);
    return {
      lastRound: last ? { at: last.at, flicks: last.flicks, report: analyzeFlicks(last.flicks) } : null,
      pooled: last ? pooledReport(inspected.state, inspected.settings) : null,
      dryRun,
      settingsPath,
      writerPath,
      writerFound: Boolean(writerPath),
      driverInstallerFound: Boolean(installerPath),
      settingsAreDefault: fs.existsSync(defaultMarkerFor(settingsPath)),
      hasBackup: inspected.hasBackup,
      profiles: inspected.summary,
      roundsSaved: inspected.state.rounds.length,
      startup: readStartup(startupDir, settingsPath),
      history: inspected.state.history.map((entry, index) => ({
        index,
        at: entry.at,
        label: entry.label,
      })),
    };
  }

  async function publish(staged, successMessage) {
    if (dryRun) {
      return {
        status: 200,
        body: {
          ok: true,
          dryRun: true,
          applied: staged.applied,
          profiles: summarize(staged.settings),
          history: staged.state.history.map((entry, index) => ({ index, at: entry.at, label: entry.label })),
          message: "Dry run. The RawAccel driver was not changed.",
        },
      };
    }
    if (!writerPath) {
      return {
        status: 400,
        body: { ok: false, error: "writer.exe was not found. Install RawAccel, or set KEEL_WRITER to the official writer.exe." },
      };
    }
    const originalSettings = fs.readFileSync(settingsPath, "utf8");
    const hadState = fs.existsSync(statePath);
    const originalState = hadState ? fs.readFileSync(statePath, "utf8") : null;
    const hadBackup = fs.existsSync(backupPathFor(settingsPath));
    commitSettings({
      settingsPath,
      statePath,
      nextSettings: staged.settings,
      nextState: staged.state,
    });
    const writer = await invokeWriter(writerPath, settingsPath);
    if (!writer.ok) {
      fs.writeFileSync(settingsPath, originalSettings);
      if (hadState) fs.writeFileSync(statePath, originalState);
      else if (fs.existsSync(statePath)) fs.rmSync(statePath);
      if (!hadBackup && fs.existsSync(backupPathFor(settingsPath))) fs.rmSync(backupPathFor(settingsPath));
      return { status: 502, body: { ok: false, error: writer.error } };
    }
    return {
      status: 200,
      body: {
        ok: true,
        dryRun: false,
        applied: staged.applied,
        profiles: summarize(loadJson(settingsPath)),
        history: staged.state.history.map((entry, index) => ({ index, at: entry.at, label: entry.label })),
        hasBackup: true,
        message: successMessage,
      },
    };
  }

  const server = http.createServer(async (request, response) => {
    try {
      if (!trustedRequest(request)) {
        send(response, 403, { error: "Keel only accepts requests from its own page." });
        return;
      }
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/api/state") {
        send(response, 200, { ...snapshot(), driver: await checkDriver() });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/driver") {
        send(response, 200, await checkDriver());
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/prefs") {
        const saved = fs.existsSync(prefsPath) ? cleanPrefs(loadJson(prefsPath)) : null;
        send(response, 200, { prefs: saved });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/prefs") {
        const prefs = cleanPrefs(await readBody(request));
        saveJson(prefsPath, prefs);
        send(response, 200, { ok: true, prefs });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/import") {
        const body = await readBody(request);
        const settings = body.settings;
        let valid = validRawAccelSettings(settings);
        try {
          if (valid) summarize(settings);
        } catch {
          valid = false;
        }
        if (!valid) {
          send(response, 400, { ok: false, error: "That is not a RawAccel settings.json. Pick the settings.json next to rawaccel.exe." });
          return;
        }
        if (dryRun) {
          send(response, 200, { ok: true, dryRun: true, message: "Dry run. The settings were not imported." });
          return;
        }
        const kept = inspectSettings(settingsPath, statePath).state;
        saveJson(settingsPath, settings);
        fs.copyFileSync(settingsPath, backupPathFor(settingsPath));
        saveJson(statePath, { ...kept, history: [] });
        if (fs.existsSync(defaultMarkerFor(settingsPath))) fs.rmSync(defaultMarkerFor(settingsPath));
        send(response, 200, {
          ok: true,
          message: "Imported your RawAccel settings. Keel tunes from these, and Restore goes back to them. Nothing was sent to the driver yet.",
          ...snapshot(),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/driver/install") {
        if (!installerPath) {
          send(response, 400, { ok: false, error: "RawAccel's installer was not found next to Keel." });
          return;
        }
        if (dryRun) {
          send(response, 200, { ok: true, dryRun: true, message: "Dry run. The RawAccel installer was not started." });
          return;
        }
        const result = await installDriver(installerPath);
        if (!result.ok) {
          send(response, 502, { ok: false, error: result.error });
          return;
        }
        send(response, 200, { ok: true, message: "RawAccel's installer is running. When it finishes, restart the PC so the driver loads." });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/startup") {
        const body = await readBody(request);
        const enabled = Boolean(body.enabled);
        if (!startupDir) {
          send(response, 400, { ok: false, error: "Could not find the Windows Startup folder." });
          return;
        }
        if (enabled && !writerPath) {
          send(response, 400, { ok: false, error: "writer.exe was not found, so there is nothing to run at sign-in." });
          return;
        }
        if (dryRun) {
          send(response, 200, {
            ok: true,
            dryRun: true,
            startup: { ...readStartup(startupDir, settingsPath), enabled },
            message: "Dry run. The Startup folder was not changed.",
          });
          return;
        }
        const startup = setStartup(startupDir, enabled, writerPath, settingsPath);
        send(response, 200, {
          ok: true,
          startup,
          message: enabled
            ? "RawAccel gets these settings again every time you sign in to Windows."
            : "Keel no longer sends settings to RawAccel at sign-in.",
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/games") {
        send(response, 200, { games: GAMES });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/analyze") {
        const body = await readBody(request);
        send(response, 200, analyzeFlicks(body.flicks));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/rounds") {
        const body = await readBody(request);
        const flicks = cleanFlicks(body.flicks);
        if (flicks.length === 0) {
          send(response, 400, { ok: false, error: "That round has no usable flicks." });
          return;
        }
        const inspected = inspectSettings(settingsPath, statePath);
        const round = {
          at: new Date().toISOString(),
          look: cleanLook(body.look),
          game: String(body.game || "").slice(0, 40),
          setup: cleanSetup(body.setup),
          scales: driverScales(inspected.settings.profiles[0]),
          snapshot: inspected.settings.profiles.map((profile) => profileValues(snapshotProfile(profile))),
          flicks,
        };
        const state = stageRound(inspected.state, round);
        saveJson(statePath, state);
        const pooled = pooledReport(state, inspected.settings);
        send(response, 200, {
          ok: true,
          round: analyzeFlicks(flicks),
          pooled: {
            ...pooled,
            viewFactors: pooled.factors ? factorsForDriver(pooled.factors, round.look) : null,
            preview: pooled.factors ? tuneSettings(inspected.settings, pooled.factors).applied[0] : null,
          },
          roundsSaved: state.rounds.length,
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/tune") {
        const body = await readBody(request);
        const inspected = inspectSettings(settingsPath, statePath);
        const lastRound = inspected.state.rounds.at(-1);
        const lastStep = inspected.state.history.at(-1);
        if (!lastRound) {
          send(response, 400, { ok: false, error: "Play a round before tuning." });
          return;
        }
        if (lastStep?.afterRound === lastRound.at) {
          send(response, 400, { ok: false, error: "That round was already used. Play another round to measure the new values." });
          return;
        }
        const report = pooledReport(inspected.state, inspected.settings);
        if (!report.factors) {
          send(response, 400, { ok: false, error: "Need flicks in at least two directions before tuning." });
          return;
        }
        if (Object.values(report.factors).every((factor) => Math.abs(factor - 1) < 0.0005)) {
          send(response, 400, { ok: false, error: "No direction is off by more than the noise, so there is nothing to change. Play another round to tighten the measurement." });
          return;
        }
        const staged = stageTune(
          inspected.settings,
          inspected.state,
          report.factors,
          String(body.label || "Tuning step").slice(0, 80),
        );
        staged.state.history.at(-1).afterRound = lastRound.at;
        const published = await publish(staged, "Sent a small directional step to RawAccel. It updates about a second later.");
        send(response, published.status, { ...published.body, report });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/rounds/use") {
        const body = await readBody(request);
        const inspected = inspectSettings(settingsPath, statePath);
        const index = inspected.state.rounds.findIndex((round) => round.at === body.at);
        if (index < 0) {
          send(response, 400, { ok: false, error: "That round is no longer saved." });
          return;
        }
        const label = String(body.label || `Settings from round ${index + 1}`).slice(0, 80);
        const staged = stageRoundSettings(inspected.settings, inspected.state, inspected.state.rounds[index], label);
        const published = await publish(staged, "Sent that round's RawAccel values. They reach the mouse about a second later.");
        send(response, published.status, published.body);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/rounds/scores") {
        const inspected = inspectSettings(settingsPath, statePath);
        send(response, 200, roundsReport(inspected.state, inspected.settings, setupFromQuery(url)));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/rounds/adopt") {
        const body = await readBody(request);
        const setup = cleanSetup(body.setup);
        if (!setup) {
          send(response, 400, { ok: false, error: "Enter a positive DPI and sensitivity first." });
          return;
        }
        const inspected = inspectSettings(settingsPath, statePath);
        const rounds = inspected.state.rounds.map((round) => (round.setup ? round : { ...round, setup: { ...setup, game: round.game || setup.game } }));
        saveJson(statePath, { ...inspected.state, rounds });
        send(response, 200, { ok: true, ...roundsReport({ ...inspected.state, rounds }, inspected.settings, setup) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/revert") {
        const body = await readBody(request);
        const inspected = inspectSettings(settingsPath, statePath);
        const staged = stageRevert(inspected.settings, inspected.state, Number(body.index));
        const published = await publish(staged, "Restored that tuning step and sent it to RawAccel.");
        send(response, published.status, published.body);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/restore") {
        const backup = backupPathFor(settingsPath);
        if (!fs.existsSync(backup)) {
          send(response, 400, { ok: false, error: "There is no backup from before Keel changed this file." });
          return;
        }
        if (dryRun) {
          send(response, 200, { ok: true, dryRun: true, message: "Dry run. Backup was not restored." });
          return;
        }
        const restored = fs.readFileSync(backup);
        const kept = inspectSettings(settingsPath, statePath).state;
        fs.writeFileSync(settingsPath, restored);
        saveJson(statePath, { ...kept, history: [] });
        const writer = writerPath ? await invokeWriter(writerPath, settingsPath) : { ok: false, error: "writer.exe was not found." };
        if (!writer.ok) {
          send(response, 502, { ok: false, error: writer.error });
          return;
        }
        send(response, 200, { ok: true, message: "Restored the settings from before Keel, and sent them to RawAccel.", ...snapshot() });
        return;
      }
      if (request.method === "GET") {
        const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const filePath = path.normalize(path.join(publicDir, relative));
        if (!filePath.startsWith(path.normalize(publicDir)) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          send(response, 404, { error: "Not found" });
          return;
        }
        const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
        response.writeHead(200, {
          "content-type": types[path.extname(filePath)] || "application/octet-stream",
          "cache-control": "no-store",
        });
        fs.createReadStream(filePath).pipe(response);
        return;
      }
      send(response, 405, { error: "Method not allowed" });
    } catch (error) {
      send(response, 500, { error: error.message || "Keel failed." });
    }
  });

  return server;
}

export function parseArgs(argv) {
  const options = { dryRun: false, open: true, port: 4731, settingsPath: null, statePath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--no-open") options.open = false;
    else if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--settings") options.settingsPath = argv[++index];
    else if (arg === "--state") options.statePath = argv[++index];
  }
  return options;
}

// With no settings file anywhere, Keel starts its own from RawAccel's defaults
// and marks it, so the page can offer to import an existing RawAccel setup first.
export function createDefaultSettings(settingsPath) {
  saveJson(settingsPath, defaultSettings());
  fs.writeFileSync(defaultMarkerFor(settingsPath), "");
  return settingsPath;
}

export function resolveOptions(options) {
  let settingsPath = options.settingsPath || firstExisting(settingsCandidates());
  if (!settingsPath && options.dryRun) {
    throw new Error("No RawAccel settings.json found. Pass --settings for a dry run.");
  }
  if (!settingsPath) settingsPath = createDefaultSettings(keelSettingsPath());
  return {
    ...options,
    settingsPath,
    statePath: options.statePath || defaultStatePath(),
    writerPath: firstExisting(writerCandidates()),
    installerPath: firstExisting(installerCandidates()),
  };
}

function openBrowser(url) {
  import("node:child_process").then(({ spawn }) => {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  });
}

function main() {
  const options = resolveOptions(parseArgs(process.argv.slice(2)));
  const server = createKeelServer(options);
  server.listen(options.port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${options.port}/`;
    console.log(`Keel ${url}`);
    console.log(`settings ${options.settingsPath}`);
    console.log(`writer ${options.writerPath || "not found"}`);
    if (options.dryRun) console.log("dry run");
    if (options.open) openBrowser(url);
  });
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
