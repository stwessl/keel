export function viewCardinals(profile, look = {}) {
  const output = Number(profile?.outputDpi);
  const yx = Number(profile?.yx);
  const lr = Number(profile?.lr ?? 1);
  const ud = Number(profile?.ud ?? 1);
  if (![output, yx, lr, ud].every(Number.isFinite) || output === 0 || yx === 0 || lr <= 0 || ud <= 0) {
    return null;
  }
  let right = output;
  let left = output * lr;
  let down = output * Math.abs(yx);
  let up = down * ud;
  if (look.invertX) [right, left] = [left, right];
  if (look.invertY) [up, down] = [down, up];
  return { right, left, up, down };
}

export function profileOutline(profile, look = {}, steps = 64) {
  const cardinals = viewCardinals(profile, look);
  if (!cardinals) return null;
  const mean = Math.exp(
    (Math.log(cardinals.right) + Math.log(cardinals.left) + Math.log(cardinals.up) + Math.log(cardinals.down)) / 4,
  );
  const points = [];
  for (let index = 0; index < steps; index += 1) {
    const theta = (index / steps) * Math.PI * 2;
    const x = Math.cos(theta);
    const y = Math.sin(theta);
    const horizontal = x >= 0 ? cardinals.right : cardinals.left;
    const vertical = y >= 0 ? cardinals.up : cardinals.down;
    points.push({ theta, gain: (x * x * horizontal + y * y * vertical) / mean });
  }
  return { cardinals, mean, points };
}
