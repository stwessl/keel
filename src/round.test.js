import { test } from "node:test";
import assert from "node:assert/strict";
import { WARMUP_SHOTS, advanceRound } from "../public/round.js";

function round({ warmup = false, length = 4, continuous = false } = {}) {
  const measured = Array.from({ length }, (_, index) => index);
  return {
    order: warmup ? Array.from({ length: WARMUP_SHOTS }, () => "warm") : measured,
    measured,
    index: 0,
    warmupLeft: warmup ? WARMUP_SHOTS : 0,
    shots: 0,
    continuous,
  };
}

test("five warmup shots are not counted, then the round starts at the first flick", () => {
  const session = round({ warmup: true, length: 16 });
  const steps = [];
  for (let shot = 0; shot < WARMUP_SHOTS; shot += 1) steps.push(advanceRound(session));
  assert.deepEqual(steps, ["warmup", "warmup", "warmup", "warmup", "count"]);
  assert.equal(session.shots, 0);
  assert.equal(session.warmupLeft, 0);
  assert.equal(session.index, 0);
  assert.equal(session.order, session.measured);

  assert.equal(advanceRound(session), "next");
  assert.equal(session.shots, 1);
  assert.equal(session.index, 1);
});

test("a round with warmup off counts every shot and finishes on the last one", () => {
  const session = round({ length: 2 });
  assert.equal(advanceRound(session), "next");
  assert.equal(advanceRound(session), "finish");
  assert.equal(session.shots, 2);
  assert.equal(session.index, 2);
});

test("continuous mode keeps going after a full batch", () => {
  const session = round({ length: 2, continuous: true });
  assert.equal(advanceRound(session), "next");
  assert.equal(advanceRound(session), "batch");
  assert.equal(session.shots, 2);
});
