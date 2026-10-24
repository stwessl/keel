export const WARMUP_SHOTS = 5;

// A shot at a target, never the center orb. Warmup shots are practice: they
// move the deck along, then hand the round its real order, and they are not
// part of the saved count.
// Returns "warmup", "count", "next", "finish", or "batch".
export function advanceRound(round) {
  if (round.warmupLeft > 0) {
    round.warmupLeft -= 1;
    if (round.warmupLeft > 0) {
      round.index += 1;
      return "warmup";
    }
    round.order = round.measured;
    round.index = 0;
    return "count";
  }
  round.index += 1;
  round.shots += 1;
  if (round.index < round.order.length) return "next";
  return round.continuous ? "batch" : "finish";
}
