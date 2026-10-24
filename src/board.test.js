import { test } from "node:test";
import assert from "node:assert/strict";
import {
  biggestDifference,
  landingSummary,
  predictedBins,
  relativeBins,
  smoothRing,
} from "../public/board.js";

function flick(gain) {
  return { intended: { x: 20, y: 0 }, actual: { x: 20 * gain, y: 0 } };
}

test("flicks are sorted against the round's own average landing", () => {
  const summary = landingSummary([flick(0.96), flick(0.96), flick(0.8), flick(1.2)]);
  assert.equal(summary.count, 4);
  assert.equal(summary.shorter, 25);
  assert.equal(summary.longer, 25);
  assert.equal(summary.even, 50);
});

test("a step that lifts the short axis evens out the predicted ring", () => {
  const bins = Array.from({ length: 8 }, (_, index) => ({ count: 4, gain: index === 2 ? 0.8 : 1 }));
  const relative = relativeBins(bins, 1);
  const after = predictedBins(relative, { right: 1, left: 1, up: 1.25, down: 1 });
  const spread = (values) => Math.max(...values) - Math.min(...values);
  assert.ok(spread(after) < spread(relative));
});

test("the smooth ring passes through every bin", () => {
  const values = [1, 1.1, 0.9, 1, 1.05, 0.95, 1, 1];
  const ring = smoothRing(values, 12);
  values.forEach((value, index) => assert.ok(Math.abs(ring[index * 12].value - value) < 1e-9));
});

test("the biggest difference ignores directions with too few flicks", () => {
  const bins = [{ count: 1, gain: 2 }, { count: 3, gain: 1.03 }, ...Array.from({ length: 6 }, () => ({ count: 3, gain: 1 }))];
  const best = biggestDifference(relativeBins(bins, 1), bins);
  assert.equal(best.name, "up-right");
});
