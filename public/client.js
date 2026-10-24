import { profileOutline } from "/shape.js";
import { primaryLanding, reactionTime } from "/flick.js";
import { playHit, playMiss, playTick, unlockSound } from "/sound.js";
import {
  EVEN_BAND,
  EXAGGERATION,
  biggestDifference,
  landingSummary,
  predictedBins,
  relativeBins,
  smoothRing,
} from "/board.js";
import {
  TARGET_RADIUS,
  TARGET_DISTANCE,
  HOME_RADIUS,
  variedTarget,
  angularDistance,
  targetAngularRadius,
  lookCamera,
  cameraSpace,
  projectCamera,
  cameraRight,
  targetPoint,
  clipPolygonNear,
  clipSegmentNear,
  roomGeometry,
  buildFlickOrder,
  flickOffset,
  viewHalfAngles,
} from "/view.js";

const view = document.querySelector("#view");
const capture = document.querySelector("#capture");
const hudRound = document.querySelector("#hud-round");
const scoreNode = document.querySelector("#score");
const gameSelect = document.querySelector("#game");
const sensInput = document.querySelector("#sens");
const sensLabel = document.querySelector("#sens-label");
const verticalField = document.querySelector("#vertical-field");
const sensYInput = document.querySelector("#sens-y");
const dpiInput = document.querySelector("#dpi");
const fovInput = document.querySelector("#fov");
const yawInput = document.querySelector("#yaw");
const yawField = document.querySelector("#yaw-field");
const sensHint = document.querySelector("#sens-hint");
const cmNode = document.querySelector("#cm");
const roundLength = document.querySelector("#round-length");
const roundLengthLabel = document.querySelector("#round-length-label");
const modeSelect = document.querySelector("#mode");
const targetsSelect = document.querySelector("#targets");
const soundSelect = document.querySelector("#sound");
const patternSelect = document.querySelector("#pattern");
const modeHint = document.querySelector("#mode-hint");
const driverNode = document.querySelector("#driver");
const invertY = document.querySelector("#invert-y");
const invertX = document.querySelector("#invert-x");
const startButton = document.querySelector("#start");
const fullscreenButton = document.querySelector("#fullscreen");
const restoreButton = document.querySelector("#restore");
const installDriverRow = document.querySelector("#install-driver-row");
const installDriverButton = document.querySelector("#install-driver");
const importButton = document.querySelector("#import");
const importFile = document.querySelector("#import-file");
const importNote = document.querySelector("#import-note");
const startupToggle = document.querySelector("#startup");
const startupNote = document.querySelector("#startup-note");
const setupPanel = document.querySelector("#setup");
const livePanel = document.querySelector("#live");
const resultsPanel = document.querySelector("#results");
const progressNode = document.querySelector("#progress");
const lastFlickNode = document.querySelector("#last-flick");
const abandonButton = document.querySelector("#abandon");
const chart = document.querySelector("#chart");
const board = document.querySelector("#board");
const statEven = document.querySelector("#stat-even");
const statShort = document.querySelector("#stat-short");
const statLong = document.querySelector("#stat-long");
const boardHeadline = document.querySelector("#board-headline");
const boardDetail = document.querySelector("#board-detail");
const resultCopy = document.querySelector("#result-copy");
const applyStepButton = document.querySelector("#apply-step");
const againButton = document.querySelector("#again");
const historyNode = document.querySelector("#history");
const statusNode = document.querySelector("#status");
const valuesHead = document.querySelector("#values-head");
const valuesBody = document.querySelector("#values-body");
const valuesNote = document.querySelector("#values-note");
const profileChart = document.querySelector("#profile-chart");
const profileCaption = document.querySelector("#profile-caption");
const profileContext = profileChart.getContext("2d");
const pathsNode = document.querySelector("#paths");
const context = view.getContext("2d", { alpha: false });
const chartContext = chart.getContext("2d");

const SHORT = ["R", "UR", "U", "UL", "L", "DL", "D", "DR"];

const state = {
  yaw: 0,
  pitch: 0,
  hits: 0,
  games: [],
  server: null,
  profile: null,
  verticalFollows: true,
  round: null,
  flicks: [],
  report: null,
  preview: null,
  profileCount: 0,
  lastRound: null,
};

function wrap(degrees) {
  return (((degrees + 180) % 360) + 360) % 360 - 180;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function selectedGame() {
  return state.games.find((game) => game.id === gameSelect.value) ?? state.games[0];
}

function activeYaw() {
  const game = selectedGame();
  if (!game) return 0.022;
  return game.id === "custom" ? Number(yawInput.value) : game.yaw;
}

function degreesPerCount() {
  return activeYaw() * Number(sensInput.value);
}

function pitchPerCount() {
  const game = selectedGame();
  const sensitivity = game?.vertical ? Number(sensYInput.value) : Number(sensInput.value);
  return activeYaw() * sensitivity;
}

function updateSetupReadout() {
  const game = selectedGame();
  if (!game) return;
  yawField.hidden = game.id !== "custom";
  verticalField.hidden = !game.vertical;
  sensLabel.textContent = game.vertical ? "Horizontal sensitivity" : "Sensitivity";
  sensHint.hidden = !game.sensHint;
  sensHint.textContent = game.sensHint || "";
  const dpi = Number(dpiInput.value);
  const sensitivity = Number(sensInput.value);
  const yaw = activeYaw();
  if (dpi > 0 && sensitivity > 0 && yaw > 0) {
    const multiplier = Number(state.profile?.multiplier);
    const driver = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
    const cm = 914.4 / (dpi * driver * sensitivity * yaw);
    const through = Math.abs(driver - 1) > 0.0005 ? ` through RawAccel's ${formatNumber(driver)}×` : "";
    const vertical = Number(sensYInput.value);
    if (game.vertical && vertical > 0 && Math.abs(vertical - sensitivity) > 0.001) {
      const ratio = Math.round((vertical / sensitivity) * 100);
      cmNode.textContent = `${cm.toFixed(1)} cm / 360°${through}. Look up and down is ${ratio}% of horizontal.`;
    } else if (game.vertical) {
      cmNode.textContent = `${cm.toFixed(1)} cm / 360°${through}. Vertical matches horizontal.`;
    } else {
      cmNode.textContent = `${cm.toFixed(1)} cm / 360°${through}`;
    }
  } else {
    cmNode.textContent = "Enter a positive DPI and sensitivity.";
  }
}

function showPanel(name) {
  setupPanel.hidden = name !== "setup";
  livePanel.hidden = name !== "live";
  resultsPanel.hidden = name !== "results";
  board.hidden = name !== "results";
}

function drawProfile() {
  const landing = lastRoundData();
  if (landing) {
    drawLandingChart(profileChart, profileContext, landing);
    const when = new Date(state.lastRound.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    const after = landing.after ? " Green is after the pending step." : "";
    profileCaption.textContent = `Last round, ${when}. ${describeBiggest(landing)} Copper is where you landed, dashed is perfect, drawn 3× larger.${after}`;
    return;
  }
  const outline = state.profile
    ? profileOutline(state.profile, { invertY: invertY.checked, invertX: invertX.checked })
    : null;
  const ratio = window.devicePixelRatio || 1;
  profileChart.width = Math.max(1, Math.floor(profileChart.clientWidth * ratio));
  profileChart.height = Math.max(1, Math.floor(profileChart.clientHeight * ratio));
  const width = profileChart.width;
  const height = profileChart.height;
  profileContext.clearRect(0, 0, width, height);
  if (!outline) {
    profileCaption.textContent = "No directional profile to draw yet.";
    return;
  }
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.32;
  profileContext.strokeStyle = "#3a3128";
  profileContext.lineWidth = Math.max(1, width / 320);
  profileContext.beginPath();
  profileContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
  profileContext.stroke();
  profileContext.beginPath();
  outline.points.forEach((point, index) => {
    const length = radius * Math.min(1.8, Math.max(0.35, point.gain));
    const theta = -point.theta;
    const x = centerX + Math.cos(theta) * length;
    const y = centerY + Math.sin(theta) * length;
    if (index === 0) profileContext.moveTo(x, y);
    else profileContext.lineTo(x, y);
  });
  profileContext.closePath();
  profileContext.fillStyle = "rgba(227, 154, 85, 0.35)";
  profileContext.strokeStyle = "#e39a55";
  profileContext.fill();
  profileContext.stroke();
  profileContext.fillStyle = "#b5a494";
  profileContext.font = `${Math.max(12, width / 28)}px Bahnschrift, Segoe UI, sans-serif`;
  profileContext.textAlign = "center";
  profileContext.textBaseline = "middle";
  SHORT.forEach((label, index) => {
    const theta = -index * Math.PI / 4;
    profileContext.fillText(label, centerX + Math.cos(theta) * radius * 1.28, centerY + Math.sin(theta) * radius * 1.28);
  });
  const percent = (value) => `${Math.round((value / outline.mean) * 100)}%`;
  const values = Object.values(outline.cardinals).map((value) => value / outline.mean);
  const even = values.every((value) => Math.abs(value - 1) < 0.01);
  const shape = even
    ? "Every direction is the same speed."
    : "The ring is your average. The shape bulges where a direction is faster.";
  profileCaption.textContent = `Speed by direction, compared with your average: Right ${percent(outline.cardinals.right)} · Left ${percent(outline.cardinals.left)} · Up ${percent(outline.cardinals.up)} · Down ${percent(outline.cardinals.down)}. ${shape}`;
}

function renderProfile(profiles) {
  state.profile = profiles?.[0] ?? null;
  state.profileCount = profiles?.length ?? 0;
  requestAnimationFrame(drawProfile);
  renderValues();
}

function rawAccelSettings(now) {
  const baseMultiplier = Number(now.multiplier) > 0 ? Number(now.multiplier) : Number(now.outputDpi) / 1000;
  return [
    { label: "Sensitivity", read: (p) => baseMultiplier * (Number(p.outputDpi) / Number(now.outputDpi)), format: (v) => `${v.toFixed(3)}×` },
    { label: "Left multiplier", read: (p) => Number(p.lr), format: (v) => v.toFixed(3) },
    { label: "Vertical multiplier", read: (p) => Number(p.yx), format: (v) => v.toFixed(3) },
    { label: "Up multiplier", read: (p) => Number(p.ud), format: (v) => v.toFixed(3) },
    { label: "Rotation", read: (p) => Number(p.rotation), format: (v) => `${formatNumber(v)}°` },
  ];
}

function settingChanges(now, next) {
  if (!now || !next) return [];
  return rawAccelSettings(now)
    .map((setting) => ({ label: setting.label, before: setting.read(now), after: setting.read(next) }))
    .filter(({ before, after }) => before !== 0 && Math.abs(after / before - 1) >= 0.0005);
}

function formatChange(before, after) {
  const percent = (after / before - 1) * 100;
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent).toFixed(1)}%`;
}

function cell(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function renderDriver(driver) {
  let stateName = "unknown";
  let text = "Keel could not check the RawAccel driver.";
  if (driver?.running) {
    stateName = "running";
    text = "RawAccel driver is running. Changes reach the mouse about a second after they are sent.";
  } else if (driver?.installed) {
    stateName = "stopped";
    text = `RawAccel driver is installed but ${String(driver.state || "not running").toLowerCase()}. Your mouse is raw, and steps will not take effect. Restart the PC or reinstall RawAccel.`;
  } else if (driver?.known) {
    stateName = "missing";
    text = "RawAccel driver is not installed. Steps only change the settings file until RawAccel is installed.";
  }
  driverNode.dataset.state = stateName;
  driverNode.textContent = text;
  installDriverRow.hidden = !(stateName === "missing" && state.server?.driverInstallerFound);
}

async function installDriver() {
  installDriverButton.disabled = true;
  try {
    setStatus((await post("/api/driver/install", {})).message);
  } catch (error) {
    setStatus(error.message);
  } finally {
    installDriverButton.disabled = false;
  }
}

async function importSettings() {
  const file = importFile.files?.[0];
  importFile.value = "";
  if (!file) return;
  let settings;
  try {
    settings = JSON.parse(await file.text());
  } catch {
    setStatus("That file is not valid JSON. Pick the settings.json next to rawaccel.exe.");
    return;
  }
  try {
    const payload = await post("/api/import", { settings });
    state.preview = null;
    await loadState();
    setStatus(payload.message);
  } catch (error) {
    setStatus(error.message);
  }
}

function renderStartup(startup) {
  startupToggle.checked = Boolean(startup?.enabled);
  startupToggle.disabled = !startup?.available || (!startup.enabled && !state.server?.writerFound);
  const others = startup?.others ?? [];
  let text = "RawAccel forgets its settings when the PC restarts. This sends them again each time you sign in.";
  if (!startup?.available) text = "Could not find the Windows Startup folder.";
  else if (others.some((other) => !other.sameFile)) {
    const names = others.filter((other) => !other.sameFile).map((other) => other.name).join(", ");
    text = `${names} in the Startup folder sends a different settings file to RawAccel at sign-in and can overwrite Keel's values. Remove it from the Startup folder.`;
  } else if (others.length > 0) {
    text = `Also applied at sign-in by ${others.map((other) => other.name).join(", ")} in the Startup folder, so turning this off alone does not stop it.`;
  }
  startupNote.textContent = text;
}

async function toggleStartup() {
  const wanted = startupToggle.checked;
  startupToggle.disabled = true;
  try {
    const payload = await post("/api/startup", { enabled: wanted });
    renderStartup(payload.startup);
    setStatus(payload.message);
  } catch (error) {
    startupToggle.checked = !wanted;
    startupToggle.disabled = false;
    setStatus(error.message);
  }
}

async function refreshDriver() {
  if (document.hidden) return;
  try {
    const response = await fetch("/api/driver");
    if (response.ok) renderDriver(await response.json());
  } catch {
    renderDriver(null);
  }
}

function renderValues() {
  const now = state.profile;
  const next = state.preview;
  valuesHead.replaceChildren();
  valuesBody.replaceChildren();
  if (!now) {
    valuesNote.textContent = "No RawAccel profile found in the settings file.";
    return;
  }
  const headRow = document.createElement("tr");
  headRow.append(cell("th", "Setting"), cell("th", "Now"));
  if (next) headRow.append(cell("th", "After step"));
  valuesHead.append(headRow);
  for (const setting of rawAccelSettings(now)) {
    const row = document.createElement("tr");
    const before = setting.read(now);
    row.append(cell("td", setting.label), cell("td", setting.format(before)));
    if (next) {
      const after = setting.read(next);
      const changed = before !== 0 && Math.abs(after / before - 1) >= 0.0005;
      const value = cell("td", setting.format(after), changed ? "changed" : "");
      if (changed) value.append(cell("small", ` ${formatChange(before, after)}`));
      row.append(value);
    }
    valuesBody.append(row);
  }
  const extra = state.profileCount > 1 ? ` Only the first of ${state.profileCount} profiles is tuned.` : "";
  if (!next) {
    valuesNote.textContent = `Curve: ${now.mode || "unknown"}. Output DPI ${formatNumber(now.outputDpi)}.${extra}`;
  } else if (state.server?.dryRun) {
    valuesNote.textContent = `Dry run: applying shows these values but writes nothing.${extra}`;
  } else {
    valuesNote.textContent = `Apply sends the After step column to RawAccel. The curve is not changed.${extra}`;
  }
}

function renderHistory(history) {
  historyNode.replaceChildren();
  (history ?? []).forEach((entry, index, all) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quiet";
    button.textContent = index === all.length - 1 ? `${entry.label} (current)` : `Back to ${entry.label}`;
    button.disabled = index === all.length - 1;
    button.addEventListener("click", () => revertTo(index));
    historyNode.append(button);
  });
}

function setStatus(text) {
  statusNode.textContent = text;
}

async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function describeLanding(round) {
  const names = { right: "Right", left: "Left", up: "Up", down: "Down" };
  const parts = Object.entries(round?.axes ?? {})
    .filter(([, gain]) => Number.isFinite(gain))
    .map(([axis, gain]) => `${names[axis]} ${Math.round(gain * 100)}%`);
  if (parts.length === 0) return null;
  return `${parts.join(" · ")}. 100% stops right on the target, lower is short, higher is long.`;
}

function describeTiming(round) {
  const timing = round?.timing;
  if (!Number.isFinite(timing?.reactionMs)) return null;
  const parts = [`React ${Math.round(timing.reactionMs)} ms`];
  if (Number.isFinite(timing.landMs)) parts.push(`flick done ${Math.round(timing.landMs)} ms`);
  if (Number.isFinite(timing.ms)) parts.push(`shot ${Math.round(timing.ms)} ms`);
  const timed = (round.bins ?? []).filter((bin) => Number.isFinite(bin.reactionMs));
  const slowest = timed.reduce((worst, bin) => (!worst || bin.reactionMs > worst.reactionMs ? bin : worst), null);
  const slow = slowest && timed.length > 1 ? ` Slowest: ${slowest.label.toLowerCase()}.` : "";
  return `${parts.join(" · ")}, averaged.${slow}`;
}

function describeBasis(round, pooled) {
  if (!(pooled?.roundsUsed > 1)) return `This round, ${round?.counted ?? 0} flicks.`;
  return `Last ${pooled.roundsUsed} rounds, ${pooled.flicksUsed} flicks. Newer rounds count more.`;
}

function describeStep(pooled) {
  if (!pooled?.viewFactors) return "Not enough yet. Flick in at least two directions.";
  const changes = settingChanges(state.profile, state.preview);
  if (changes.length === 0) return "No change. Every direction is within your normal scatter.";
  const list = changes.map(({ label, before, after }) => `${label} ${formatChange(before, after)}`).join(", ");
  return `${list}. Average sensitivity and the curve stay the same.`;
}

function renderResults(payload) {
  const rows = [
    ["Landing", describeLanding(payload?.round)],
    ["Timing", describeTiming(payload?.round)],
    ["Based on", describeBasis(payload?.round, payload?.pooled)],
    ["Step", describeStep(payload?.pooled)],
  ];
  resultCopy.replaceChildren();
  for (const [label, text] of rows) {
    if (!text) continue;
    resultCopy.append(cell("dt", label), cell("dd", text));
  }
}

function boardData(bins, flicks, factors = null) {
  const summary = landingSummary(flicks);
  if (!summary || bins?.length !== 8) return null;
  const relative = relativeBins(bins, summary.mean);
  return { summary, bins, relative, after: predictedBins(relative, state.preview ? factors : null) };
}

function reportData() {
  return state.report ? boardData(state.report.round.bins, state.flicks, state.report.pooled?.viewFactors) : null;
}

function lastRoundData() {
  const last = state.lastRound;
  if (!last) return null;
  return boardData(last.report?.bins, last.flicks, state.report ? state.report.pooled?.viewFactors : null);
}

function drawChart(data) {
  drawLandingChart(chart, chartContext, data, true);
}

function drawLandingChart(canvas, ctx, data, square = false) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  canvas.height = square ? canvas.width : Math.max(1, Math.floor(canvas.clientHeight * ratio));
  const width = canvas.width;
  const height = canvas.height;
  const size = Math.min(width, height);
  ctx.clearRect(0, 0, width, height);
  if (!data) return;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = size * 0.33;
  const reach = (value) => radius * Math.min(1.55, Math.max(0.3, 1 + EXAGGERATION * (value - 1)));
  const point = (angle, length) => ({ x: centerX + Math.cos(angle) * length, y: centerY - Math.sin(angle) * length });
  const line = Math.max(1, size / 360);

  ctx.strokeStyle = "#2c251f";
  ctx.lineWidth = line;
  for (const ring of [0.35, 0.7, 1.3]) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * ring, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  for (let index = 0; index < 8; index += 1) {
    const end = point((index * Math.PI) / 4, radius * 1.3);
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(end.x, end.y);
  }
  ctx.stroke();

  ctx.fillStyle = "#b5a494";
  ctx.font = `600 ${Math.max(11, size / 30)}px Bahnschrift, Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let compass = 0; compass < 360; compass += 45) {
    const label = point(((90 - compass) * Math.PI) / 180, radius * 1.42);
    ctx.fillText(`${compass}°`, label.x, label.y);
  }

  const trace = (values) => {
    ctx.beginPath();
    smoothRing(values).forEach(({ angle, value }, index) => {
      const at = point(angle, reach(value));
      if (index === 0) ctx.moveTo(at.x, at.y);
      else ctx.lineTo(at.x, at.y);
    });
    ctx.closePath();
  };

  trace(data.relative);
  ctx.fillStyle = "rgba(227, 154, 85, 0.28)";
  ctx.fill();
  ctx.strokeStyle = "#e39a55";
  ctx.lineWidth = line * 2.5;
  ctx.stroke();

  ctx.setLineDash([line * 5, line * 5]);
  ctx.strokeStyle = "#b5a494";
  ctx.lineWidth = line * 1.5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (data.after) {
    trace(data.after);
    ctx.strokeStyle = "#d7e38a";
    ctx.lineWidth = line * 2.5;
    ctx.stroke();
  }

  ctx.fillStyle = "#e39a55";
  data.relative.forEach((value, index) => {
    if (value == null) return;
    const at = point((index * Math.PI) / 4, reach(value));
    ctx.beginPath();
    ctx.arc(at.x, at.y, line * 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function describeBiggest({ relative, bins }) {
  const biggest = biggestDifference(relative, bins);
  if (!biggest || Math.abs(biggest.value - 1) < 0.01) return "Every direction lands within 1% of your average.";
  const percent = Math.round(Math.abs(biggest.value - 1) * 100);
  const name = biggest.name[0].toUpperCase() + biggest.name.slice(1);
  return `Biggest difference: ${name}, ${percent}% ${biggest.value > 1 ? "longer" : "shorter"} than your other flicks.`;
}

function renderBoard(data) {
  if (!data) {
    statEven.textContent = statShort.textContent = statLong.textContent = "—";
    boardHeadline.textContent = "Not enough clean flicks to chart this round.";
    boardDetail.textContent = "";
    return;
  }
  const { summary } = data;
  statEven.textContent = `${summary.even}%`;
  statShort.textContent = `${summary.shorter}%`;
  statLong.textContent = `${summary.longer}%`;
  boardHeadline.textContent = describeBiggest(data);
  const landing = Math.round(summary.mean * 100);
  boardDetail.textContent = `Your first fast movement lands at ${landing}% of the distance on average, then you correct. That is normal. Keel compares every direction with this average and leaves your overall sensitivity alone. "Even" means within ${Math.round(EVEN_BAND * 100)}% of it.`;
}

function showBoard() {
  const data = reportData();
  renderBoard(data);
  requestAnimationFrame(() => drawChart(data));
}

async function loadGames() {
  const response = await fetch("/api/games");
  const payload = await response.json();
  state.games = payload.games;
  gameSelect.replaceChildren();
  for (const game of state.games) {
    const option = document.createElement("option");
    option.value = game.id;
    option.textContent = game.name;
    gameSelect.append(option);
  }
  gameSelect.value = "cs2";
  fovInput.value = String(selectedGame().fov);
  const prefs = await loadPrefs();
  loadSetup(prefs.setup);
  loadLook(prefs.look);
  updateSetupReadout();
}

const SETUP_KEY = "keel-setup";
const SETUP_FIELDS = { sens: sensInput, sensY: sensYInput, dpi: dpiInput, fov: fovInput, yaw: yawInput };
const SETUP_CHOICES = { rounds: roundLength, mode: modeSelect, targets: targetsSelect, pattern: patternSelect, sound: soundSelect };

const LOOK_KEY = "keel-look";

function readLocal(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}

// The copy on disk is shared by the desktop app and the browser page. Browser
// storage is only the fallback, and seeds the disk copy the first time.
async function loadPrefs() {
  const local = { setup: readLocal(SETUP_KEY) ?? {}, look: readLocal(LOOK_KEY) ?? {} };
  try {
    const response = await fetch("/api/prefs");
    const payload = await response.json();
    if (response.ok && payload.prefs) {
      localStorage.setItem(SETUP_KEY, JSON.stringify(payload.prefs.setup));
      localStorage.setItem(LOOK_KEY, JSON.stringify(payload.prefs.look));
      return payload.prefs;
    }
    if (response.ok && (Object.keys(local.setup).length || Object.keys(local.look).length)) {
      await post("/api/prefs", local);
    }
  } catch {
    // Keep going with the browser copy.
  }
  return local;
}

let prefsTimer = null;
function storePrefs() {
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    post("/api/prefs", { setup: readLocal(SETUP_KEY) ?? {}, look: readLocal(LOOK_KEY) ?? {} }).catch(() => {});
  }, 300);
}

function loadSetup(saved = {}) {
  if (state.games.some((game) => game.id === saved.game)) gameSelect.value = saved.game;
  for (const [key, input] of Object.entries(SETUP_FIELDS)) {
    if (Number(saved[key]) > 0) input.value = String(saved[key]);
  }
  for (const [key, select] of Object.entries(SETUP_CHOICES)) {
    if ([...select.options].some((option) => option.value === saved[key])) select.value = saved[key];
  }
  state.verticalFollows = sensYInput.value === sensInput.value;
  updateModeReadout();
}

function saveSetup() {
  const values = Object.fromEntries(Object.entries(SETUP_FIELDS).map(([key, input]) => [key, input.value]));
  const choices = Object.fromEntries(Object.entries(SETUP_CHOICES).map(([key, select]) => [key, select.value]));
  localStorage.setItem(SETUP_KEY, JSON.stringify({ game: gameSelect.value, ...choices, ...values }));
  storePrefs();
}

function continuousMode() {
  return modeSelect.value === "continuous";
}

function updateModeReadout() {
  const continuous = continuousMode();
  roundLengthLabel.textContent = continuous ? "Check RawAccel every" : "Round";
  const [quick, full] = roundLength.options;
  quick.textContent = continuous ? "16 shots" : "Quick, 16 flicks";
  full.textContent = continuous ? "40 shots" : "Full, 40 flicks";
  modeHint.textContent = continuous
    ? `Targets keep coming. After every ${roundLength.value} shots Keel saves them and, if a direction is clearly off, sends a small step to RawAccel and carries on. Leave the round to stop.`
    : "";
  modeHint.hidden = !continuous;
  startButton.textContent = continuous ? "Start continuous" : "Start round";
}

async function loadState() {
  const response = await fetch("/api/state");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Could not read settings");
  state.server = payload;
  state.lastRound = payload.lastRound ?? null;
  renderDriver(payload.driver);
  renderStartup(payload.startup);
  importNote.hidden = !payload.settingsAreDefault;
  renderProfile(payload.profiles);
  renderHistory(payload.history);
  updateSetupReadout();
  const writer = payload.writerFound ? payload.writerPath : "writer.exe not found";
  pathsNode.textContent = `${payload.settingsPath}\n${writer}`;
  restoreButton.disabled = !payload.hasBackup;
  const flipped = payload.profiles?.[0]?.driverInvert;
  if (flipped?.vertical || flipped?.horizontal) {
    setStatus("RawAccel itself is inverting this mouse everywhere, not just in the range. Restore the original RawAccel file, or undo the negative Y/X or half-turn rotation in RawAccel.");
    return;
  }
  setStatus(payload.dryRun
    ? "Dry run is on. Nothing will be sent to the driver."
    : "RawAccel is ready. A change takes about a second to reach the mouse.");
}

function loadLook(saved = {}) {
  invertY.checked = Boolean(saved.invertY);
  invertX.checked = Boolean(saved.invertX);
}

function saveLook() {
  localStorage.setItem(LOOK_KEY, JSON.stringify({
    invertY: invertY.checked,
    invertX: invertX.checked,
  }));
  storePrefs();
  drawProfile();
}

async function restoreSettings() {
  restoreButton.disabled = true;
  try {
    const payload = await post("/api/restore", {});
    setStatus(payload.message);
    if (!payload.dryRun) state.preview = null;
    await loadState();
    showPanel("setup");
  } catch (error) {
    setStatus(error.message);
    restoreButton.disabled = false;
  }
}

function buildOrder(total) {
  return buildFlickOrder(patternSelect.value, total);
}

function setProgress(text) {
  progressNode.textContent = text;
  const parts = [text, lastFlickNode.dataset.short, state.round?.batchNote].filter(Boolean);
  hudRound.textContent = parts.join(" · ");
  hudRound.hidden = !state.round;
}

function progressText() {
  const round = state.round;
  if (!round.continuous) return `Flick ${round.index + 1} of ${round.order.length}`;
  const left = round.order.length - round.index;
  const steps = `${round.steps} step${round.steps === 1 ? "" : "s"} sent`;
  return `Shot ${round.shots + 1} · next check in ${left} · ${steps}`;
}

function showHome() {
  state.round.phase = "home";
  state.round.target = HOME;
  state.round.origin = null;
  state.round.path = null;
  setProgress(`${progressText()}. Shoot the center orb.`);
}

const COUNTDOWN_MS = 3000;

function startCountdown() {
  const round = state.round;
  round.phase = "countdown";
  round.target = null;
  round.countdownEnds = performance.now() + COUNTDOWN_MS;
  setProgress(round.continuous ? "Get ready. Continuous mode." : `Get ready. ${round.order.length} flicks.`);
  setTimeout(() => {
    if (state.round === round && round.phase === "countdown") showHome();
  }, COUNTDOWN_MS);
}

function spawnTarget() {
  const limits = viewHalfAngles(Number(fovInput.value) || 90, view.width, view.height);
  const offset = flickOffset(state.round.order[state.round.index], Math.random, limits);
  const origin = { yaw: state.yaw, pitch: state.pitch };
  const yaw = HOME.yaw + offset.yaw;
  const pitch = HOME.pitch + offset.pitch;
  state.round.phase = "flick";
  state.round.target = state.round.varied
    ? variedTarget(yaw, pitch)
    : { yaw, pitch, distance: TARGET_DISTANCE, radius: TARGET_RADIUS };
  state.round.origin = origin;
  state.round.born = performance.now();
  state.round.path = [{ t: state.round.born, x: 0, y: 0 }];
  setProgress(progressText());
}

function startRound() {
  unlockSound();
  state.hits = 0;
  scoreNode.textContent = "0 hits";
  state.flicks = [];
  state.report = null;
  const batch = Number(roundLength.value);
  state.round = {
    order: buildOrder(batch),
    index: 0,
    phase: "countdown",
    target: null,
    origin: null,
    path: null,
    born: 0,
    varied: targetsSelect.value === "varied",
    continuous: continuousMode(),
    shots: 0,
    steps: 0,
    batches: 0,
    settleUntil: 0,
    look: { invertY: invertY.checked, invertX: invertX.checked },
  };
  invertY.disabled = true;
  invertX.disabled = true;
  showPanel("live");
  lastFlickNode.textContent = "Shoot the green orb, then flick straight onto the copper one and click. Flick the way you would in game.";
  delete lastFlickNode.dataset.short;
  startCountdown();
  captureForRound();
}

async function captureForRound() {
  // requestFullscreen consumes the click's activation, so the lock has to be requested first.
  await lockPointer();
  if (!fullscreenElement()) await toggleFullscreen();
  if (document.pointerLockElement !== view) await lockPointer();
}

function closeRound() {
  state.round = null;
  invertY.disabled = false;
  invertX.disabled = false;
  hudRound.hidden = true;
  if (document.pointerLockElement === view) document.exitPointerLock();
  if (fullscreenElement()) toggleFullscreen();
}

function leaveRound() {
  const round = state.round;
  closeRound();
  showPanel("setup");
  if (!round?.continuous) return;
  const pending = state.flicks.length;
  const unsaved = pending > 0 ? ` The last ${pending} shot${pending === 1 ? "" : "s"} did not fill a batch and were not saved.` : "";
  setStatus(`Continuous session ended: ${round.shots} shots, ${round.batches} batch${round.batches === 1 ? "" : "es"} saved, ${round.steps} step${round.steps === 1 ? "" : "s"} sent to RawAccel.${unsaved}`);
  state.flicks = [];
}

// The writer needs about a second to reach the driver, so flicks right after a
// step would mix the old and new values.
const SETTLE_MS = 1500;

async function submitBatch(round, flicks) {
  try {
    const payload = await post("/api/rounds", { flicks, look: round.look, game: gameSelect.value });
    round.batches += 1;
    state.report = payload;
    state.lastRound = { at: new Date().toISOString(), flicks, report: payload.round };
    let note = "no change needed";
    if (stepChangesSomething(payload.pooled.viewFactors)) {
      const before = state.profile;
      const tuned = await post("/api/tune", { label: `Continuous, shots ${round.shots - flicks.length + 1}–${round.shots}` });
      if (!tuned.dryRun && tuned.profiles) {
        renderProfile(tuned.profiles);
        renderHistory(tuned.history);
        restoreButton.disabled = false;
      }
      const changes = settingChanges(before, tuned.dryRun ? payload.pooled.preview : state.profile);
      note = changes.map(({ label, before: from, after: to }) => `${label} ${formatChange(from, to)}`).join(", ") || "step sent";
      if (tuned.dryRun) note += " (dry run, not written)";
      round.steps += 1;
      round.settleUntil = performance.now() + SETTLE_MS;
    }
    state.preview = null;
    drawProfile();
    renderValues();
    round.batchNote = `Check ${round.batches}: ${note}`;
    lastFlickNode.textContent = `Batch ${round.batches} saved, ${payload.round.counted} flicks counted: ${note}.`;
  } catch (error) {
    round.batchNote = "Batch not saved";
    lastFlickNode.textContent = `Batch not saved: ${error.message}`;
  }
  if (state.round === round && round.phase !== "flick") setProgress(`${progressText()}. Shoot the center orb.`);
}

function noteFlick(hit, ms, flick) {
  if (hit) {
    state.hits += 1;
    scoreNode.textContent = `${state.hits} hit${state.hits === 1 ? "" : "s"}`;
  }
  const lead = hit ? `Hit in ${Math.round(ms)} ms.` : "Missed.";
  if (!flick) {
    lastFlickNode.textContent = `${lead} That flick had no clear first movement, so it is not counted.`;
    lastFlickNode.dataset.short = hit ? "Hit" : "Missed";
    return;
  }
  const gain = (flick.actual.x * flick.intended.x + flick.actual.y * flick.intended.y)
    / (flick.intended.x ** 2 + flick.intended.y ** 2);
  const landed = gain > 1.05 ? "went long" : gain < 0.95 ? "fell short" : "landed on distance";
  const reaction = Number.isFinite(flick.reactionMs) ? ` Reacted in ${Math.round(flick.reactionMs)} ms.` : "";
  lastFlickNode.textContent = `${lead}${reaction} The first movement ${landed} (${Math.round(gain * 100)}%).`;
  lastFlickNode.dataset.short = `${hit ? "Hit" : "Missed"}, landed ${Math.round(gain * 100)}%`;
}

async function finishRound() {
  const flicks = state.flicks;
  const look = state.round.look;
  closeRound();
  try {
    const payload = await post("/api/rounds", { flicks, look, game: gameSelect.value });
    state.report = payload;
    state.lastRound = { at: new Date().toISOString(), flicks, report: payload.round };
    state.preview = stepChangesSomething(payload.pooled.viewFactors) ? payload.pooled.preview : null;
    drawProfile();
    renderValues();
    renderResults(payload);
    applyStepButton.disabled = !state.preview;
    showPanel("results");
    showBoard();
    setStatus(`${payload.round.counted} flicks counted.`);
  } catch (error) {
    setStatus(error.message);
    showPanel("setup");
  }
}

function onTarget(target, radius = target.radius ?? TARGET_RADIUS) {
  const aim = { yaw: state.yaw, pitch: state.pitch };
  return angularDistance(aim, target) <= targetAngularRadius(radius, target.distance ?? TARGET_DISTANCE);
}

function shoot() {
  const round = state.round;
  if (!round?.target) return;
  const sound = soundSelect.value === "on";
  if (round.phase === "home") {
    if (onTarget(HOME, HOME_RADIUS)) {
      if (sound) playTick();
      spawnTarget();
    }
    return;
  }
  const { target, origin, born, path } = round;
  const now = performance.now();
  const intended = { x: wrap(target.yaw - origin.yaw), y: target.pitch - origin.pitch };
  const landing = primaryLanding(path, intended);
  const hit = onTarget(target);
  if (sound) (hit ? playHit : playMiss)();
  const flick = landing
    ? {
      intended,
      actual: { x: landing.x, y: landing.y },
      ms: now - born,
      reactionMs: reactionTime(path, intended),
      landMs: landing.ms,
      hit,
    }
    : null;
  const settling = born < round.settleUntil;
  if (flick && !settling) state.flicks.push(flick);
  noteFlick(hit, now - born, flick);
  if (settling && flick) {
    lastFlickNode.textContent += " Not counted, RawAccel was still updating.";
    lastFlickNode.dataset.short += ", not counted";
  }
  round.index += 1;
  round.shots += 1;
  if (round.index < round.order.length) {
    showHome();
    return;
  }
  if (!round.continuous) {
    finishRound();
    return;
  }
  const batch = state.flicks;
  state.flicks = [];
  round.order = buildOrder(Number(roundLength.value));
  round.index = 0;
  showHome();
  if (batch.length > 0) submitBatch(round, batch);
}

function recordPath(time) {
  const round = state.round;
  if (round?.phase !== "flick" || !round.path) return;
  if (round.path.length >= 4000) return;
  round.path.push({
    t: time,
    x: wrap(state.yaw - round.origin.yaw),
    y: state.pitch - round.origin.pitch,
  });
}

async function lockPointer() {
  try {
    await view.requestPointerLock({ unadjustedMovement: true });
  } catch {
    try {
      await view.requestPointerLock();
    } catch {
      setStatus("Click the range to capture the mouse.");
    }
  }
}

async function submitStep() {
  applyStepButton.disabled = true;
  try {
    const rounds = state.report?.pooled?.roundsUsed ?? 1;
    const payload = await post("/api/tune", {
      label: rounds > 1 ? `Round of ${state.flicks.length}, with ${rounds - 1} earlier` : `Round of ${state.flicks.length}`,
    });
    setStatus(payload.message);
    if (!payload.dryRun) state.preview = null;
    if (!payload.dryRun && payload.profiles) renderProfile(payload.profiles);
    if (!payload.dryRun && payload.history) renderHistory(payload.history);
    if (!payload.dryRun) restoreButton.disabled = false;
    updateSetupReadout();
  } catch (error) {
    setStatus(error.message);
    applyStepButton.disabled = !state.preview;
  }
}

function stepChangesSomething(factors) {
  return Boolean(factors) && Object.values(factors).some((factor) => Math.abs(factor - 1) >= 0.0005);
}

async function revertTo(index) {
  try {
    const payload = await post("/api/revert", { index });
    setStatus(payload.message);
    if (!payload.dryRun) state.preview = null;
    if (!payload.dryRun && payload.profiles) renderProfile(payload.profiles);
    if (!payload.dryRun && payload.history) renderHistory(payload.history);
    updateSetupReadout();
  } catch (error) {
    setStatus(error.message);
  }
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  view.width = Math.max(1, Math.floor(view.clientWidth * ratio));
  view.height = Math.max(1, Math.floor(view.clientHeight * ratio));
  if (!resultsPanel.hidden && state.report) drawChart(reportData());
  drawProfile();
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function syncFullscreen() {
  const on = Boolean(fullscreenElement());
  document.body.classList.toggle("is-fullscreen", on);
  fullscreenButton.textContent = on ? "Exit full screen" : "Full screen";
  fullscreenButton.setAttribute("aria-pressed", on ? "true" : "false");
  requestAnimationFrame(resize);
}

async function toggleFullscreen() {
  try {
    if (fullscreenElement()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      await exit.call(document);
      return;
    }
    const root = document.documentElement;
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    await request.call(root);
  } catch (error) {
    setStatus("Full screen was blocked by the browser.");
  }
}

const ROOM_FACES = roomGeometry();
const PRACTICE_TARGET = { yaw: -14, pitch: 3 };
const HOME = { yaw: 0, pitch: 0 };

const fpsNode = document.querySelector("#fps");
const frameClock = { start: 0, frames: 0 };

function countFrame(now) {
  if (!frameClock.start) frameClock.start = now;
  frameClock.frames += 1;
  const elapsed = now - frameClock.start;
  if (elapsed < 500) return;
  fpsNode.textContent = `${Math.round((frameClock.frames * 1000) / elapsed)} fps`;
  frameClock.start = now;
  frameClock.frames = 0;
}

function draw(now) {
  countFrame(now);
  renderFrame();
  requestAnimationFrame(draw);
}

function renderFrame() {
  const width = view.width;
  const height = view.height;
  const fov = Number(fovInput.value) || 90;
  const camera = lookCamera(state.yaw, state.pitch);
  context.fillStyle = "#0b0908";
  context.fillRect(0, 0, width, height);
  for (const face of ROOM_FACES) paintFace(face, camera, fov, width, height);
  const aim = state.round ? state.round.target : PRACTICE_TARGET;
  if (aim) {
    const home = state.round?.phase === "home";
    const size = home ? HOME_RADIUS : aim.radius ?? TARGET_RADIUS;
    drawOrb(targetPoint(aim.yaw, aim.pitch, aim.distance ?? TARGET_DISTANCE), camera, fov, width, height, home, size);
  }
  drawCrosshair(width, height);
  if (state.round?.phase === "countdown") drawCountdown(width, height);
}

function drawCountdown(width, height) {
  const left = Math.max(0, state.round.countdownEnds - performance.now());
  const seconds = Math.ceil(left / 1000);
  if (seconds <= 0) return;
  const size = Math.min(width, height) * 0.22;
  context.save();
  context.globalAlpha = 0.35 + 0.65 * ((left % 1000) / 1000);
  context.fillStyle = "#f3eadf";
  context.font = `600 ${size}px Bahnschrift, Segoe UI, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(seconds), width / 2, height / 2 - size * 0.9);
  context.restore();
}

function paintFace(face, camera, fov, width, height) {
  const near = 0.18;
  const clipped = clipPolygonNear(face.corners.map((point) => cameraSpace(point, camera)), near);
  if (clipped.length >= 3) {
    context.beginPath();
    clipped.forEach((point, index) => {
      const screen = projectCamera(point, fov, width, height);
      if (!screen) return;
      if (index === 0) context.moveTo(screen.x, screen.y);
      else context.lineTo(screen.x, screen.y);
    });
    context.closePath();
    context.fillStyle = face.color;
    context.fill();
  }
  context.beginPath();
  context.strokeStyle = face.line;
  context.lineWidth = Math.max(1, width / 1100);
  for (const [start, end] of face.lines) {
    const segment = clipSegmentNear(cameraSpace(start, camera), cameraSpace(end, camera), near);
    if (!segment) continue;
    const a = projectCamera(segment[0], fov, width, height);
    const b = projectCamera(segment[1], fov, width, height);
    if (!a || !b) continue;
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
  }
  context.stroke();
}

function drawOrb(world, camera, fov, width, height, home, size) {
  const center = projectCamera(cameraSpace(world, camera), fov, width, height);
  if (!center) return;
  const right = cameraRight(camera);
  const edge = projectCamera(cameraSpace({
    x: world.x + right.x * size,
    y: world.y,
    z: world.z + right.z * size,
  }, camera), fov, width, height);
  if (!edge) return;
  const radius = Math.max(4, Math.hypot(edge.x - center.x, edge.y - center.y));
  context.beginPath();
  context.fillStyle = "rgba(0, 0, 0, 0.28)";
  context.ellipse(center.x, center.y + radius * 0.08, radius * 1.15, radius * 1.15, 0, 0, Math.PI * 2);
  context.fill();
  const shade = context.createRadialGradient(
    center.x - radius * 0.35,
    center.y - radius * 0.4,
    radius * 0.08,
    center.x,
    center.y,
    radius,
  );
  const colors = home ? ["#f4fbe0", "#b9c96a", "#4f5a22"] : ["#fff6ea", "#f0b272", "#8a4e22"];
  shade.addColorStop(0, colors[0]);
  shade.addColorStop(0.42, colors[1]);
  shade.addColorStop(1, colors[2]);
  context.beginPath();
  context.fillStyle = shade;
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.strokeStyle = "rgba(255, 244, 230, 0.7)";
  context.lineWidth = Math.max(1, radius * 0.06);
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.stroke();
}

function drawCrosshair(width, height) {
  const arm = Math.max(8, width / 90);
  const gap = arm * 0.55;
  const x = width / 2;
  const y = height / 2;
  context.strokeStyle = "#f3eadf";
  context.lineWidth = Math.max(1, width / 700);
  context.beginPath();
  context.moveTo(x - arm, y);
  context.lineTo(x - gap, y);
  context.moveTo(x + gap, y);
  context.lineTo(x + arm, y);
  context.moveTo(x, y - arm);
  context.lineTo(x, y - gap);
  context.moveTo(x, y + gap);
  context.lineTo(x, y + arm);
  context.stroke();
  context.beginPath();
  context.arc(x, y, 2, 0, Math.PI * 2);
  context.fillStyle = "#f3eadf";
  context.fill();
}

view.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  unlockSound();
  if (document.pointerLockElement !== view) {
    lockPointer();
    return;
  }
  if (state.round) shoot();
});

document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === view;
  capture.textContent = locked
    ? "Click to shoot. Esc releases the mouse."
    : "Click the range to look around. Click again to shoot.";
});

function look(event) {
  if (document.pointerLockElement !== view) return;
  let dx = event.movementX;
  let dy = event.movementY;
  if (!dx && !dy) return;
  if (invertX.checked) dx = -dx;
  if (invertY.checked) dy = -dy;
  const yawScale = degreesPerCount();
  const pitchScale = pitchPerCount();
  if (!Number.isFinite(yawScale) || yawScale <= 0 || !Number.isFinite(pitchScale) || pitchScale <= 0) return;
  state.yaw = wrap(state.yaw + dx * yawScale);
  state.pitch = Math.max(-80, Math.min(80, state.pitch - dy * pitchScale));
  recordPath(event.timeStamp);
}

// A pointerrawupdate listener makes the browser deliver every mouse report on
// its own, which starves rendering on high polling rate mice. pointermove is
// batched per frame and still carries each report as a coalesced event.
document.addEventListener("pointermove", (event) => {
  const reports = event.getCoalescedEvents?.() ?? [];
  const sum = reports.reduce((total, report) => ({
    x: total.x + report.movementX,
    y: total.y + report.movementY,
  }), { x: 0, y: 0 });
  if (reports.length > 0 && sum.x === event.movementX && sum.y === event.movementY) {
    for (const report of reports) look(report);
  } else {
    look(event);
  }
});

gameSelect.addEventListener("change", () => {
  const game = selectedGame();
  if (game) fovInput.value = String(game.fov);
  if (game?.vertical && state.verticalFollows) sensYInput.value = sensInput.value;
  updateSetupReadout();
});
sensInput.addEventListener("input", () => {
  if (state.verticalFollows) sensYInput.value = sensInput.value;
  updateSetupReadout();
});
sensYInput.addEventListener("input", () => {
  state.verticalFollows = sensYInput.value === sensInput.value;
  updateSetupReadout();
});
for (const input of [dpiInput, fovInput, yawInput]) {
  input.addEventListener("input", updateSetupReadout);
}
for (const select of [modeSelect, roundLength]) select.addEventListener("change", updateModeReadout);
for (const control of [gameSelect, ...Object.values(SETUP_CHOICES), ...Object.values(SETUP_FIELDS)]) {
  control.addEventListener("input", saveSetup);
  control.addEventListener("change", saveSetup);
}
startButton.addEventListener("click", () => { startRound(); });
fullscreenButton.addEventListener("click", () => { toggleFullscreen(); });
document.addEventListener("fullscreenchange", syncFullscreen);
document.addEventListener("webkitfullscreenchange", syncFullscreen);
invertY.addEventListener("change", saveLook);
invertX.addEventListener("change", saveLook);
restoreButton.addEventListener("click", () => { restoreSettings(); });
startupToggle.addEventListener("change", () => { toggleStartup(); });
installDriverButton.addEventListener("click", () => { installDriver(); });
importButton.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", () => { importSettings(); });
abandonButton.addEventListener("click", () => { leaveRound(); });
applyStepButton.addEventListener("click", () => { submitStep(); });
againButton.addEventListener("click", () => { showPanel("setup"); });
window.addEventListener("resize", resize);

resize();
requestAnimationFrame(draw);
loadGames().then(loadState).catch((error) => setStatus(error.message));
setInterval(refreshDriver, 15000);document.addEventListener("visibilitychange", refreshDriver);