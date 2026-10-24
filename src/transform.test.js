import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, wrapDegrees } from "./transform.js";

function profile(yx = 1, rotation = 0) {
  return {
    name: "default",
    "Whole or horizontal accel parameters": { mode: "noaccel" },
    "Output DPI": 937.7,
    "Y/X output DPI ratio (vertical sens multiplier)": yx,
    "L/R output DPI ratio (left sens multiplier)": 1,
    "U/D output DPI ratio (up sens multiplier)": 1.027,
    "Degrees of rotation": rotation,
  };
}

test("wraps rotation onto -180..180", () => {
  assert.equal(wrapDegrees(0), 0);
  assert.equal(wrapDegrees(180), -180);
  assert.equal(wrapDegrees(530), 170);
  assert.equal(wrapDegrees(-10), -10);
});

test("Output DPI is a multiplier over 1000", () => {
  const [summary] = summarize({ profiles: [profile(1.12, -1.2)] });
  assert.ok(Math.abs(summary.multiplier - 0.9377) < 1e-9);
  assert.equal(summary.ud, 1.027);
  assert.deepEqual(summary.driverInvert, { vertical: false, horizontal: false });
});

test("a device DPI setting normalizes the multiplier", () => {
  const [summary] = summarize({
    defaultDeviceConfig: { "DPI (normalizes input speed unit: counts/ms -> in/s)": 1600 },
    profiles: [profile()],
  });
  assert.ok(Math.abs(summary.multiplier - 0.9377 * (1000 / 1600)) < 1e-9);
});

test("a negative ratio or a half turn inverts the whole mouse", () => {
  const [vertical] = summarize({ profiles: [profile(-1, 0)] });
  assert.deepEqual(vertical.driverInvert, { vertical: true, horizontal: false });
  const [horizontal] = summarize({ profiles: [profile(-1, 180)] });
  assert.deepEqual(horizontal.driverInvert, { vertical: false, horizontal: true });
});

test("supports the older Y/X sensitivity ratio name", () => {
  const [summary] = summarize({
    profiles: [{ name: "legacy", "Sensitivity multiplier": 1.5, "Y/X sensitivity ratio (vertical sens multiplier)": 1 }],
  });
  assert.equal(summary.yxKey, "Y/X sensitivity ratio (vertical sens multiplier)");
  assert.equal(summary.multiplier, 1.5);
});
