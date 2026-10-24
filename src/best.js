import { analyzeFlicks } from "./tune.js";

export const MIN_SCORED_FLICKS = 10;
// Directions landing this far apart (root mean square) score 0 for evenness.
export const UNEVEN_LIMIT = 0.1;
// Reacting this much slower than your typical round costs half the reaction score.
export const REACTION_HALF_RANGE = 0.15;
// Two setups with cm/360 this close are the same sensitivity, whatever the game.
export const SAME_DISTANCE = 0.01;

function closeDistance(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a / b - 1) <= SAME_DISTANCE;
}

export function sameSensitivity(setup, target) {
  if (!setup || !target) return false;
  return closeDistance(setup.cm360, target.cm360) && closeDistance(setup.cm360y ?? setup.cm360, target.cm360y ?? target.cm360);
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Root mean square spread of the four direction gains, in log space so going
// 5% long and 5% short count the same.
export function unevenness(axes) {
  const logs = Object.values(axes ?? {}).filter((gain) => Number.isFinite(gain) && gain > 0).map(Math.log);
  if (logs.length < 3) return null;
  const center = logs.reduce((sum, value) => sum + value, 0) / logs.length;
  return Math.sqrt(logs.reduce((sum, value) => sum + (value - center) ** 2, 0) / logs.length);
}

// Evenness is absolute. Reaction is against your own typical round, so a
// naturally slower player is not always ranked low.
export function scoreRounds(rounds) {
  const measured = (rounds ?? []).map((round) => {
    const report = analyzeFlicks(round.flicks);
    return {
      at: round.at,
      counted: report.counted,
      axes: report.axes,
      unevenness: unevenness(report.axes),
      reactionMs: report.timing.reactionMs,
    };
  });
  const usable = (entry) => entry.counted >= MIN_SCORED_FLICKS
    && entry.unevenness != null
    && Number.isFinite(entry.reactionMs);
  const reactions = measured.filter(usable).map((entry) => entry.reactionMs);
  const typical = reactions.length ? median(reactions) : null;
  let best = null;
  const scored = measured.map((entry) => {
    if (!usable(entry)) return { ...entry, evenScore: null, reactionScore: null, score: null };
    const evenScore = 100 * clamp(1 - entry.unevenness / UNEVEN_LIMIT, 0, 1);
    const reactionScore = clamp(50 + 50 * (typical - entry.reactionMs) / (REACTION_HALF_RANGE * typical), 0, 100);
    const score = (evenScore + reactionScore) / 2;
    if (!best || score > best.score) best = { at: entry.at, score };
    return { ...entry, evenScore, reactionScore, score };
  });
  return { rounds: scored, best: best?.at ?? null, typicalReactionMs: typical };
}
