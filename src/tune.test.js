import { test } from "node:test";
import assert from "node:assert/strict";
import { cmPer360, GAMES } from "./games.js";
import { analyzeFlicks, factorsForDriver, pooledFlicks, tuneSettings } from "./tune.js";

function flick(angle, distance, gain, ms = 400) {
  const radians = (angle * Math.PI) / 180;
  const intended = { x: Math.cos(radians) * distance, y: Math.sin(radians) * distance };
  return { intended, actual: { x: intended.x * gain, y: intended.y * gain }, ms };
}

function profile() {
  return {
    name: "default",
    "Whole or horizontal accel parameters": { mode: "noaccel", acceleration: 0.2 },
    "Output DPI": 1000,
    "Y/X output DPI ratio (vertical sens multiplier)": -1.2,
    "L/R output DPI ratio (left sens multiplier)": 1,
    "U/D output DPI ratio (up sens multiplier)": 1,
    "Degrees of rotation": -180,
  };
}

test("Call of Duty sens 5 at 800 DPI is 34.6 cm per 360", () => {
  const cod = GAMES.find((game) => game.id === "cod");
  assert.equal(cod.yaw, 0.0066);
  assert.equal(cod.vertical, true);
  assert.ok(Math.abs(cmPer360(800, cod.yaw, 5) - 34.636) < 0.01);
});

test("cm/360 matches the published Counter-Strike figure", () => {
  assert.ok(Math.abs(cmPer360(800, 0.022, 1) - 51.95) < 0.05);
});

test("a miss shared by every direction does not change sensitivity", () => {
  const flicks = [];
  for (const angle of [0, 90, 180, 270]) {
    flicks.push(flick(angle, 20, 1.25), flick(angle, 24, 1.25));
  }
  const report = analyzeFlicks(flicks);
  assert.ok(report.factors);
  for (const value of Object.values(report.factors)) assert.ok(Math.abs(value - 1) < 1e-9);
  const tuned = tuneSettings({ profiles: [profile()] }, report.factors);
  assert.equal(tuned.settings.profiles[0]["Output DPI"], 1000);
  assert.equal(tuned.settings.profiles[0]["Y/X output DPI ratio (vertical sens multiplier)"], -1.2);
});

test("a short upward flick raises up and keeps the overall product", () => {
  const flicks = [];
  for (const angle of [0, 180, 270]) {
    flicks.push(flick(angle, 20, 1), flick(angle, 22, 1));
  }
  flicks.push(flick(90, 20, 0.75), flick(90, 22, 0.75));
  const before = profile();
  const report = analyzeFlicks(flicks);
  assert.ok(report.factors.up > 1);
  assert.ok(report.factors.down < 1);
  const product = Object.values(report.factors).reduce((total, value) => total * value, 1);
  assert.ok(Math.abs(product - 1) < 1e-9);
  const tuned = tuneSettings({ profiles: [before] }, report.factors);
  const next = tuned.settings.profiles[0];
  assert.ok(next["U/D output DPI ratio (up sens multiplier)"] > 1);
  assert.equal(next["Y/X output DPI ratio (vertical sens multiplier)"] < 0, true);
  assert.equal(next["Degrees of rotation"], -180);
  assert.equal(next["Whole or horizontal accel parameters"].acceleration, 0.2);
  assert.equal(next["Whole or horizontal accel parameters"].mode, "noaccel");
});

test("range invert maps the correction onto the physical axis", () => {
  const factors = { right: 1.05, left: 0.95, up: 1.08, down: 0.92 };
  const mapped = factorsForDriver(factors, { invertY: true, invertX: false });
  assert.equal(mapped.up, 0.92);
  assert.equal(mapped.down, 1.08);
  assert.equal(mapped.right, 1.05);
  const both = factorsForDriver(factors, { invertY: true, invertX: true });
  assert.equal(both.right, 0.95);
  assert.equal(both.left, 1.05);
  assert.equal(both.down, 1.08);
});

test("scatter with no real bias leaves the profile alone", () => {
  const scatter = [0.9, 1.1, 0.95, 1.05, 1.0];
  const flicks = [];
  for (const angle of [0, 90, 180, 270]) {
    const lean = angle === 90 ? 1.03 : 1;
    scatter.forEach((gain, index) => flicks.push(flick(angle, 18 + index, gain * lean)));
  }
  const report = analyzeFlicks(flicks);
  for (const value of Object.values(report.factors)) assert.ok(Math.abs(value - 1) < 0.01);
});

test("a diagonal flick measures each axis by its own part", () => {
  const flicks = [];
  for (const distance of [18, 20, 22, 24]) {
    const intended = { x: distance * Math.SQRT1_2, y: distance * Math.SQRT1_2 };
    flicks.push({ intended, actual: { x: intended.x, y: intended.y * 0.8 }, ms: 300 });
  }
  const report = analyzeFlicks(flicks);
  assert.ok(Math.abs(report.axes.right - 1) < 1e-9);
  assert.ok(Math.abs(report.axes.up - 0.8) < 1e-9);
  assert.ok(report.factors.up > 1);
  assert.ok(report.factors.right < 1);
});

test("an older round is replayed on the current RawAccel values", () => {
  const even = { right: 1000, left: 1000, up: 1000, down: 1000 };
  const fasterUp = { ...even, up: 1100 };
  const round = { look: {}, scales: even, flicks: [flick(90, 20, 0.75)] };
  const { flicks } = pooledFlicks([round], fasterUp);
  assert.ok(Math.abs(flicks[0].actual.y - 20 * 0.75 * 1.1) < 1e-9);
});

test("a range-inverted round is pooled in RawAccel's own directions", () => {
  const even = { right: 1000, left: 1000, up: 1000, down: 1000 };
  const round = { look: { invertY: true }, scales: even, flicks: [flick(90, 20, 0.75)] };
  const { flicks } = pooledFlicks([round], even);
  assert.ok(flicks[0].intended.y < 0);
  assert.ok(flicks[0].actual.y < 0);
});

test("newer rounds count for more", () => {
  const even = { right: 1000, left: 1000, up: 1000, down: 1000 };
  const rounds = [1, 2, 3].map(() => ({ look: {}, scales: even, flicks: [flick(0, 20, 1)] }));
  const { flicks } = pooledFlicks(rounds, even);
  assert.deepEqual(flicks.map((item) => Math.round(item.weight * 100) / 100), [1, 0.6, 0.36]);
});

test("one direction is not enough to tune", () => {
  const report = analyzeFlicks([flick(90, 20, 0.7), flick(90, 22, 0.7)]);
  assert.equal(report.factors, null);
  assert.equal(report.counted, 2);
});

test("eight-direction chart keeps time to hit", () => {
  const report = analyzeFlicks([flick(0, 20, 1, 300), flick(10, 20, 1.1, 500)]);
  assert.equal(report.bins[0].label, "Right");
  assert.equal(report.bins[0].count, 2);
  assert.equal(report.bins[0].ms, 400);
});
