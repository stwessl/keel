import { test } from "node:test";
import assert from "node:assert/strict";
import { AIM_STYLES, PADS, cmPerDegree, fitEntry, handTravel, padRoom, resolveHand } from "../public/hand.js";

const even = { x: 36, y: 36 };

test("an unknown aim style is guessed from the grip", () => {
  assert.equal(resolveHand({ grip: "palm", aim: "unknown" }).style, "arm");
  assert.equal(resolveHand({ grip: "claw" }).style, "wrist");
  assert.equal(resolveHand({}).style, "wrist");
  assert.equal(resolveHand({ grip: "palm", aim: "fingers" }).style, "fingers");
  assert.equal(resolveHand({ pad: "unknown" }).pad, "medium");
});

test("the deck's shortest and longest flicks map onto the hand travel range", () => {
  const hand = resolveHand({ aim: "wrist", pad: "large" });
  const travel = handTravel({ angle: 0, near: 8, far: 40 }, hand);
  assert.equal(travel.near, AIM_STYLES.wrist.near);
  assert.equal(travel.far, AIM_STYLES.wrist.far);
});

test("hand travel becomes degrees through the cm/360", () => {
  const hand = resolveHand({ aim: "wrist", pad: "large" });
  const entry = fitEntry({ angle: 0, near: 8, far: 40 }, hand, even);
  assert.ok(Math.abs(entry.near - 15) < 1e-9);
  assert.ok(Math.abs(entry.far - 60) < 1e-9);
  const slower = fitEntry({ angle: 0, near: 8, far: 40 }, hand, { x: 72, y: 72 });
  assert.ok(Math.abs(slower.far - 30) < 1e-9);
});

test("a vertical flick uses the vertical cm/360", () => {
  assert.equal(cmPerDegree(90, { x: 36, y: 72 }), 0.2);
  assert.equal(cmPerDegree(0, { x: 36, y: 72 }), 0.1);
});

test("flicks never ask for more room than the pad has", () => {
  const hand = resolveHand({ aim: "shoulder", pad: "small" });
  assert.equal(handTravel({ angle: 0, near: 8, far: 40 }, hand).far, PADS.small.x);
  assert.equal(handTravel({ angle: 90, near: 8, far: 40 }, hand).far, PADS.small.y);
  assert.ok(Math.abs(padRoom(45, PADS.small) - PADS.small.y / Math.SQRT1_2) < 1e-9);
});
