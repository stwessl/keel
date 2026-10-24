// Bin i points at i * 45 degrees, counterclockwise from right, with up positive.
export const BIN_NAMES = ["right", "up-right", "up", "up-left", "left", "down-left", "down", "down-right"];
export const EXAGGERATION = 3;
export const EVEN_BAND = 0.05;

function geometricMean(values) {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

export function flickLanding(flick) {
  const intended = flick?.intended;
  const actual = flick?.actual;
  if (!intended || !actual) return null;
  const lengthSquared = intended.x ** 2 + intended.y ** 2;
  if (!(lengthSquared >= 36)) return null;
  const gain = (actual.x * intended.x + actual.y * intended.y) / lengthSquared;
  return Number.isFinite(gain) && gain >= 0.35 && gain <= 2.5 ? gain : null;
}

export function landingSummary(flicks, band = EVEN_BAND) {
  const gains = (flicks ?? []).map(flickLanding).filter((gain) => gain != null);
  if (gains.length === 0) return null;
  const mean = geometricMean(gains);
  let shorter = 0;
  let longer = 0;
  for (const gain of gains) {
    const relative = gain / mean;
    if (relative < 1 - band) shorter += 1;
    else if (relative > 1 + band) longer += 1;
  }
  const share = (count) => Math.round((count / gains.length) * 100);
  return {
    mean,
    count: gains.length,
    even: 100 - share(shorter) - share(longer),
    shorter: share(shorter),
    longer: share(longer),
  };
}

export function relativeBins(bins, mean) {
  return bins.map((bin) => (Number.isFinite(bin?.gain) && bin.count > 0 && mean > 0 ? bin.gain / mean : null));
}

// The step scales the horizontal and vertical parts of a flick separately, so a
// diagonal moves by a blend of both factors.
export function predictedBins(relative, factors) {
  if (!factors) return null;
  const moved = relative.map((value, index) => {
    if (value == null) return null;
    const angle = (index * Math.PI) / 4;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const fx = x >= 0 ? factors.right : factors.left;
    const fy = y >= 0 ? factors.up : factors.down;
    return value * (x * x * fx + y * y * fy);
  });
  const present = moved.filter((value) => value != null);
  if (present.length === 0) return null;
  const center = geometricMean(present);
  return moved.map((value) => (value == null ? null : value / center));
}

export function smoothRing(values, perSegment = 24) {
  const filled = values.map((value) => (value == null ? 1 : value));
  const count = filled.length;
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const p0 = filled[(index - 1 + count) % count];
    const p1 = filled[index];
    const p2 = filled[(index + 1) % count];
    const p3 = filled[(index + 2) % count];
    for (let step = 0; step < perSegment; step += 1) {
      const t = step / perSegment;
      const value = 0.5 * (
        2 * p1
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
      );
      points.push({ angle: ((index + t) * Math.PI) / 4, value });
    }
  }
  return points;
}

export function biggestDifference(relative, bins, minimumCount = 2) {
  let best = null;
  relative.forEach((value, index) => {
    if (value == null || (bins[index]?.count ?? 0) < minimumCount) return;
    if (!best || Math.abs(value - 1) > Math.abs(best.value - 1)) best = { index, value, name: BIN_NAMES[index] };
  });
  return best;
}
