import { ROTATION_KEY, yxKey } from "./transform.js";

export const BIN_LABELS = ["Right", "Up-right", "Up", "Up-left", "Left", "Down-left", "Down", "Down-right"];
const AXES = ["right", "left", "up", "down"];

const OUTPUT_KEYS = ["Output DPI", "Sensitivity multiplier"];
const LR_KEYS = [
  "L/R output DPI ratio (left sens multiplier)",
  "L/R sensitivity ratio (left sens multiplier)",
];
const UD_KEYS = [
  "U/D output DPI ratio (up sens multiplier)",
  "U/D sensitivity ratio (up sens multiplier)",
];

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function existingKey(object, keys) {
  return keys.find((key) => Object.prototype.hasOwnProperty.call(object, key)) ?? null;
}

export function directionKeys(profile) {
  const output = existingKey(profile, OUTPUT_KEYS);
  const yx = yxKey(profile);
  if (!output || !yx) {
    throw new Error("This profile has no output DPI or Y/X ratio for Keel to tune.");
  }
  return {
    output,
    yx,
    lr: existingKey(profile, LR_KEYS) ?? LR_KEYS[0],
    ud: existingKey(profile, UD_KEYS) ?? UD_KEYS[0],
  };
}

export function viewScales(profile) {
  const keys = directionKeys(profile);
  const output = Number(profile[keys.output]);
  const yx = Number(profile[keys.yx]);
  const lr = Number(profile[keys.lr] ?? 1);
  const ud = Number(profile[keys.ud] ?? 1);
  if (![output, yx, lr, ud].every((value) => Number.isFinite(value)) || output === 0 || yx === 0 || lr <= 0 || ud <= 0) {
    throw new Error("Directional RawAccel values must be non-zero, and left/up ratios must be positive.");
  }
  const magnitude = Math.abs(yx);
  return {
    right: output,
    left: output * lr,
    down: output * magnitude,
    up: output * magnitude * ud,
    yxSign: yx < 0 ? -1 : 1,
    keys,
    rotation: Number(profile[ROTATION_KEY] ?? 0),
  };
}

function geometricMean(values) {
  const logs = values.reduce((sum, value) => sum + Math.log(value), 0);
  return Math.exp(logs / values.length);
}

export function flickGain(intended, actual) {
  const magnitudeSquared = intended.x ** 2 + intended.y ** 2;
  if (magnitudeSquared < 36) return null;
  const along = (actual.x * intended.x + actual.y * intended.y) / Math.sqrt(magnitudeSquared);
  const gain = along / Math.sqrt(magnitudeSquared);
  if (!Number.isFinite(gain) || gain < 0.35 || gain > 2.5) return null;
  return gain;
}

export function driverScales(profile) {
  const scales = viewScales(profile);
  return { right: scales.right, left: scales.left, up: scales.up, down: scales.down };
}

// Range invert only flips the view, so a flick in RawAccel's own directions
// is the view flick with the inverted axes negated.
export function toDriverSpace(flick, look = {}) {
  const sx = look.invertX ? -1 : 1;
  const sy = look.invertY ? -1 : 1;
  return {
    ...flick,
    intended: { x: flick.intended.x * sx, y: flick.intended.y * sy },
    actual: { x: flick.actual.x * sx, y: flick.actual.y * sy },
  };
}

// A round played on older RawAccel values is replayed on the current ones:
// the same hand movement now moves the view by the ratio of the two scales.
export function rescaleFlick(flick, then, now) {
  const x = flick.actual.x >= 0 ? "right" : "left";
  const y = flick.actual.y >= 0 ? "up" : "down";
  return {
    ...flick,
    actual: {
      x: flick.actual.x * (now[x] / then[x]),
      y: flick.actual.y * (now[y] / then[y]),
    },
  };
}

export function pooledFlicks(rounds, currentScales, options = {}) {
  const maxRounds = options.maxRounds ?? 5;
  const decay = options.decay ?? 0.6;
  const recent = (rounds ?? []).slice(-maxRounds).reverse();
  const flicks = [];
  recent.forEach((round, age) => {
    const weight = decay ** age;
    for (const flick of round.flicks) {
      flicks.push({ ...rescaleFlick(toDriverSpace(flick, round.look), round.scales, currentScales), weight });
    }
  });
  return { flicks, rounds: recent.length };
}

// RawAccel scales the x and y parts of a movement on their own, so each part
// of a flick is a separate sample for its axis. Aim error across the flick
// spills into the smaller part, so its weight is its share squared.
export function componentSamples(intended, actual) {
  const magnitude = Math.hypot(intended.x, intended.y);
  if (magnitude < 6) return [];
  const parts = [
    [intended.x, actual.x, "right", "left"],
    [intended.y, actual.y, "up", "down"],
  ];
  const samples = [];
  for (const [value, landed, positive, negative] of parts) {
    const share = Math.abs(value) / magnitude;
    if (share < 0.3) continue;
    const gain = landed / value;
    if (!Number.isFinite(gain) || gain < 0.4 || gain > 2.5) continue;
    samples.push({ axis: value > 0 ? positive : negative, gain, weight: share * share });
  }
  return samples;
}

function axisEstimate(samples) {
  if (samples.length < 2) return null;
  let weight = 0;
  let squared = 0;
  let logged = 0;
  for (const sample of samples) {
    weight += sample.weight;
    squared += sample.weight ** 2;
    logged += sample.weight * Math.log(sample.gain);
  }
  const center = logged / weight;
  let variance = 0;
  for (const sample of samples) variance += sample.weight * (Math.log(sample.gain) - center) ** 2;
  variance /= weight;
  const effective = (weight * weight) / squared;
  return {
    log: center,
    gain: Math.exp(center),
    spread: Math.sqrt(variance / Math.max(1, effective - 1)),
    count: samples.length,
  };
}

export function directionBin(intended) {
  const degrees = (Math.atan2(intended.y, intended.x) * 180) / Math.PI;
  return Math.round(((degrees % 360) + 360) % 360 / 45) % 8;
}

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function analyzeFlicks(flicks, options = {}) {
  const step = options.step ?? 0.45;
  const limit = options.limit ?? 0.08;
  const list = Array.isArray(flicks) ? flicks.slice(0, 500) : [];
  const bins = BIN_LABELS.map((label) => ({ label, gains: [], times: [], reactions: [], landings: [] }));
  const axes = { right: [], left: [], up: [], down: [] };
  let counted = 0;
  const timeOk = (value) => Number.isFinite(value) && value >= 0 && value < 10000;

  for (const flick of list) {
    if (!finitePoint(flick?.intended) || !finitePoint(flick?.actual)) continue;
    const gain = flickGain(flick.intended, flick.actual);
    if (gain == null) continue;
    const weight = Number.isFinite(flick.weight) && flick.weight > 0 ? flick.weight : 1;
    counted += 1;
    const bin = bins[directionBin(flick.intended)];
    bin.gains.push(gain);
    if (timeOk(flick.ms)) bin.times.push(flick.ms);
    if (timeOk(flick.reactionMs)) bin.reactions.push(flick.reactionMs);
    if (timeOk(flick.landMs)) bin.landings.push(flick.landMs);
    for (const sample of componentSamples(flick.intended, flick.actual)) {
      axes[sample.axis].push({ ...sample, weight: sample.weight * weight });
    }
  }
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  const estimates = {};
  for (const axis of AXES) estimates[axis] = axisEstimate(axes[axis]);
  const axisGain = Object.fromEntries(AXES.map((axis) => [axis, estimates[axis]?.gain ?? null]));

  const present = AXES.filter((axis) => estimates[axis] != null);
  let factors = null;
  if (present.length >= 2) {
    const center = present.reduce((sum, axis) => sum + estimates[axis].log, 0) / present.length;
    factors = { right: 1, left: 1, up: 1, down: 1 };
    for (const axis of present) {
      const deviation = estimates[axis].log - center;
      const beyondNoise = Math.sign(deviation) * Math.max(0, Math.abs(deviation) - estimates[axis].spread);
      factors[axis] = Math.exp(-beyondNoise * step);
    }
    const normalize = () => {
      const meanFactor = geometricMean(AXES.map((name) => factors[name]));
      for (const axis of AXES) factors[axis] /= meanFactor;
    };
    normalize();
    for (const axis of AXES) factors[axis] = clamp(factors[axis], 1 - limit, 1 + limit);
    normalize();
  }

  return {
    counted,
    bins: bins.map((bin) => ({
      label: bin.label,
      count: bin.gains.length,
      gain: bin.gains.length ? geometricMean(bin.gains) : null,
      ms: average(bin.times),
      reactionMs: average(bin.reactions),
      landMs: average(bin.landings),
    })),
    timing: {
      ms: average(bins.flatMap((bin) => bin.times)),
      reactionMs: average(bins.flatMap((bin) => bin.reactions)),
      landMs: average(bins.flatMap((bin) => bin.landings)),
    },
    axes: axisGain,
    spread: Object.fromEntries(AXES.map((axis) => [axis, estimates[axis]?.spread ?? null])),
    factors,
  };
}

export function snapshotProfile(profile) {
  const scales = viewScales(profile);
  return {
    outputDpi: scales.right,
    yx: scales.yxSign * (scales.down / scales.right),
    lr: scales.left / scales.right,
    ud: scales.up / scales.down,
    rotation: scales.rotation,
    outputKey: scales.keys.output,
    yxKey: scales.keys.yx,
    lrKey: scales.keys.lr,
    udKey: scales.keys.ud,
  };
}

export function writeSnapshot(profile, snapshot) {
  const keys = directionKeys(profile);
  profile[keys.output] = snapshot.outputDpi;
  profile[keys.yx] = snapshot.yx;
  profile[keys.lr] = snapshot.lr;
  profile[keys.ud] = snapshot.ud;
  profile[ROTATION_KEY] = snapshot.rotation;
}

export function applyFactors(profile, factors) {
  const scales = viewScales(profile);
  const next = {
    right: scales.right * factors.right,
    left: scales.left * factors.left,
    down: scales.down * factors.down,
    up: scales.up * factors.up,
  };
  const snapshot = {
    outputDpi: next.right,
    yx: scales.yxSign * (next.down / next.right),
    lr: next.left / next.right,
    ud: next.up / next.down,
    rotation: scales.rotation,
  };
  writeSnapshot(profile, snapshot);
  return { name: profile.name ?? "", ...snapshot, mode: profile["Whole or horizontal accel parameters"]?.mode ?? "" };
}

export function factorsForDriver(factors, look = {}) {
  const mapped = { ...factors };
  if (look.invertX) {
    const right = mapped.right;
    mapped.right = mapped.left;
    mapped.left = right;
  }
  if (look.invertY) {
    const up = mapped.up;
    mapped.up = mapped.down;
    mapped.down = up;
  }
  return mapped;
}

export function tuneSettings(settings, factors) {
  if (!factors) throw new Error("Not enough measured flicks in different directions yet.");
  if (!settings?.profiles?.length) throw new Error("Settings file has no RawAccel profiles.");
  const next = structuredClone(settings);
  const applied = next.profiles.map((profile) => applyFactors(profile, factors));
  return { settings: next, applied };
}
