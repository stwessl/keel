import { test } from "node:test";
import assert from "node:assert/strict";
import { profileOutline } from "../public/shape.js";

const even = { outputDpi: 1000, yx: 1, lr: 1, ud: 1 };

test("an even profile is a circle", () => {
  const outline = profileOutline(even);
  assert.ok(outline.points.every((point) => Math.abs(point.gain - 1) < 1e-9));
});

test("more up sensitivity bulges upward and not downward", () => {
  const outline = profileOutline({ outputDpi: 1000, yx: 1, lr: 1, ud: 1.4 });
  const up = outline.points.find((point) => Math.abs(point.theta - Math.PI / 2) < 0.05);
  const down = outline.points.find((point) => Math.abs(point.theta - Math.PI * 1.5) < 0.05);
  assert.ok(up.gain > 1.2);
  assert.ok(down.gain < 1);
});

test("range invert shows the up bulge on look-down", () => {
  const plain = profileOutline({ outputDpi: 1000, yx: 1, lr: 1, ud: 1.4 });
  const inverted = profileOutline({ outputDpi: 1000, yx: 1, lr: 1, ud: 1.4 }, { invertY: true });
  const plainUp = plain.points.find((point) => Math.abs(point.theta - Math.PI / 2) < 0.05);
  const invertedDown = inverted.points.find((point) => Math.abs(point.theta - Math.PI * 1.5) < 0.05);
  assert.ok(Math.abs(plainUp.gain - invertedDown.gain) < 1e-9);
});
