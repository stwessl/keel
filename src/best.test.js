import { test } from "node:test";
import assert from "node:assert/strict";
import { sameSensitivity, scoreRounds, unevenness } from "./best.js";

function round(at, gains, reactionMs, perDirection = 4) {
  const flicks = [];
  for (const [angle, gain] of [[0, gains.right], [180, gains.left], [90, gains.up], [270, gains.down]]) {
    const radians = (angle * Math.PI) / 180;
    for (let index = 0; index < perDirection; index += 1) {
      const distance = 18 + index * 2;
      const intended = { x: Math.cos(radians) * distance, y: Math.sin(radians) * distance };
      flicks.push({ intended, actual: { x: intended.x * gain, y: intended.y * gain }, ms: 500, reactionMs });
    }
  }
  return { at, flicks };
}

const even = { right: 1, left: 1, up: 1, down: 1 };
const lopsided = { right: 1, left: 1, up: 0.85, down: 1.1 };

test("unevenness is zero when every direction lands the same", () => {
  assert.equal(unevenness({ right: 0.9, left: 0.9, up: 0.9, down: 0.9 }), 0);
  assert.ok(unevenness(lopsided) > 0.05);
  assert.equal(unevenness({ right: 1, left: 1 }), null);
});

test("the even and quick round is best, a lopsided slow one ranks lowest", () => {
  const scored = scoreRounds([
    round("a", lopsided, 260),
    round("b", even, 200),
    round("c", even, 240),
  ]);
  assert.equal(scored.best, "b");
  const [slow, best, middle] = scored.rounds;
  assert.ok(best.score > middle.score);
  assert.ok(middle.score > slow.score);
  assert.equal(best.evenScore, 100);
  assert.equal(scored.typicalReactionMs, 240);
});

test("an even round can beat a faster one that lands unevenly", () => {
  const scored = scoreRounds([round("quick", lopsided, 210), round("steady", even, 230), round("other", even, 240)]);
  assert.equal(scored.best, "steady");
});

test("the same cm/360 is the same sensitivity in any game", () => {
  const cs2 = { cm360: 914.4 / (800 * 2 * 0.022) };
  const valorant = { cm360: 914.4 / (800 * (2 * 0.022) / 0.07 * 0.07) };
  assert.ok(sameSensitivity(cs2, valorant));
  assert.ok(sameSensitivity({ cm360: 30 }, { cm360: 30.2 }));
  assert.equal(sameSensitivity({ cm360: 30 }, { cm360: 31 }), false);
  assert.equal(sameSensitivity({ cm360: 30, cm360y: 40 }, { cm360: 30, cm360y: 30 }), false);
  assert.equal(sameSensitivity(null, { cm360: 30 }), false);
});

test("rounds with too few flicks are not scored", () => {
  const scored = scoreRounds([round("short", even, 150, 2), round("full", lopsided, 300)]);
  assert.equal(scored.rounds[0].score, null);
  assert.equal(scored.best, "full");
});
