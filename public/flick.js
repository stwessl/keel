// Where the first, ballistic part of a flick stopped. Players correct after
// the flick and click on target, so the click point hides overshoot and
// undershoot. The end of the primary movement keeps it.
const WINDOW_MS = 12;
const STOP_SHARE = 0.2;

// Time from the target appearing to the first movement toward it.
export function reactionTime(samples, intended) {
  const magnitude = Math.hypot(intended?.x, intended?.y);
  if (!Array.isArray(samples) || samples.length < 2 || !(magnitude > 0)) return null;
  const threshold = Math.max(0.4, magnitude * 0.03);
  for (const sample of samples) {
    const along = (sample.x * intended.x + sample.y * intended.y) / magnitude;
    if (along >= threshold) return sample.t - samples[0].t;
  }
  return null;
}

export function primaryLanding(samples, intended) {
  const magnitude = Math.hypot(intended?.x, intended?.y);
  if (!Array.isArray(samples) || samples.length < 2 || !(magnitude > 0)) return null;
  const ux = intended.x / magnitude;
  const uy = intended.y / magnitude;
  const along = samples.map((sample) => sample.x * ux + sample.y * uy);
  const speeds = new Array(samples.length).fill(0);
  let start = 0;
  for (let index = 1; index < samples.length; index += 1) {
    while (start < index - 1 && samples[index].t - samples[start + 1].t >= WINDOW_MS) start += 1;
    const elapsed = samples[index].t - samples[start].t;
    speeds[index] = elapsed > 0 ? (along[index] - along[start]) / elapsed : 0;
  }
  let peak = 0;
  let peakIndex = -1;
  speeds.forEach((speed, index) => {
    if (speed > peak) {
      peak = speed;
      peakIndex = index;
    }
  });
  if (peakIndex < 0) return null;
  let stop = samples.length - 1;
  for (let index = peakIndex + 1; index < samples.length; index += 1) {
    if (speeds[index] <= peak * STOP_SHARE) {
      stop = index;
      break;
    }
  }
  if (along[stop] < magnitude * 0.25) return null;
  return { x: samples[stop].x, y: samples[stop].y, ms: samples[stop].t - samples[0].t };
}
