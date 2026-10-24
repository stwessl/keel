import { test } from "node:test";
import assert from "node:assert/strict";
import { primaryLanding, reactionTime } from "../public/flick.js";

function flickPath({ distance, overshoot, correctTo, angle = 0, hz = 1000 }) {
  const radians = (angle * Math.PI) / 180;
  const ux = Math.cos(radians);
  const uy = Math.sin(radians);
  const samples = [];
  const step = 1000 / hz;
  const primaryMs = 180;
  const landed = distance * overshoot;
  for (let t = 0; t <= primaryMs; t += step) {
    const s = landed * (1 - Math.cos((Math.PI * t) / primaryMs)) / 2;
    samples.push({ t, x: s * ux, y: s * uy });
  }
  for (let t = primaryMs + step; t <= primaryMs + 120; t += step) {
    samples.push({ t, x: landed * ux, y: landed * uy });
  }
  const correctionMs = 140;
  const startT = primaryMs + 120;
  for (let t = step; t <= correctionMs; t += step) {
    const s = landed + (correctTo - landed) * (1 - Math.cos((Math.PI * t) / correctionMs)) / 2;
    samples.push({ t: startT + t, x: s * ux, y: s * uy });
  }
  return { samples, intended: { x: distance * ux, y: distance * uy } };
}

test("an overshoot that was corrected still lands long", () => {
  const { samples, intended } = flickPath({ distance: 20, overshoot: 1.2, correctTo: 20 });
  const landing = primaryLanding(samples, intended);
  assert.ok(Math.abs(landing.x / intended.x - 1.2) < 0.03);
  const final = samples[samples.length - 1];
  assert.ok(Math.abs(final.x - 20) < 1e-6);
});

test("an undershoot on an upward flick lands short", () => {
  const { samples, intended } = flickPath({ distance: 18, overshoot: 0.8, correctTo: 18, angle: 90 });
  const landing = primaryLanding(samples, intended);
  assert.ok(Math.abs(landing.y / intended.y - 0.8) < 0.03);
});

test("frame-rate input still finds the landing", () => {
  const { samples, intended } = flickPath({ distance: 20, overshoot: 1.15, correctTo: 20, hz: 144 });
  const landing = primaryLanding(samples, intended);
  assert.ok(Math.abs(landing.x / intended.x - 1.15) < 0.05);
});

test("reaction time is when the flick starts, not when it lands", () => {
  const { samples, intended } = flickPath({ distance: 20, overshoot: 1, correctTo: 20 });
  const waiting = [{ t: 0, x: 0, y: 0 }, { t: 100, x: 0, y: 0 }, { t: 200, x: 0, y: 0 }];
  const delayed = [...waiting, ...samples.map((sample) => ({ ...sample, t: sample.t + 220 }))];
  const reaction = reactionTime(delayed, intended);
  assert.ok(reaction >= 220 && reaction < 280);
  const landing = primaryLanding(delayed, intended);
  assert.ok(landing.ms > reaction + 100);
});

test("no movement toward the target has no landing", () => {
  const samples = [{ t: 0, x: 0, y: 0 }, { t: 10, x: -1, y: 0 }, { t: 20, x: -2, y: 0 }];
  assert.equal(primaryLanding(samples, { x: 20, y: 0 }), null);
});
