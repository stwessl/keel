// RawAccel 1.7: rotation, then the curve, then x *= Output DPI / 1000 and
// y *= Output DPI / 1000 * Y/X. Left and up multipliers act on the sign of
// that output, so they scale what the game sees moving left and up.

export const YX_KEYS = [
  "Y/X output DPI ratio (vertical sens multiplier)",
  "Y/X sensitivity ratio (vertical sens multiplier)",
];

export const ROTATION_KEY = "Degrees of rotation";

const NORMALIZED_DPI = 1000;
const DEVICE_DPI_KEY = "DPI (normalizes input speed unit: counts/ms -> in/s)";

export function yxKey(profile) {
  return YX_KEYS.find((key) => Object.prototype.hasOwnProperty.call(profile, key)) ?? null;
}

export function readYx(profile) {
  const key = yxKey(profile);
  if (!key) {
    throw new Error("This RawAccel profile has no Y/X ratio field.");
  }
  const value = Number(profile[key]);
  if (!Number.isFinite(value) || value === 0) {
    throw new Error("Y/X ratio must be a non-zero number.");
  }
  return { key, value };
}

export function wrapDegrees(degrees) {
  const wrapped = (((degrees + 180) % 360) + 360) % 360 - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

function horizontalMultiplier(settings, profile) {
  if (Object.prototype.hasOwnProperty.call(profile, "Output DPI")) {
    const deviceDpi = Number(settings?.defaultDeviceConfig?.[DEVICE_DPI_KEY]);
    const normalization = deviceDpi > 0 ? NORMALIZED_DPI / deviceDpi : 1;
    return (Number(profile["Output DPI"]) / NORMALIZED_DPI) * normalization;
  }
  const legacy = Number(profile["Sensitivity multiplier"]);
  return Number.isFinite(legacy) ? legacy : null;
}

export function summarize(settings) {
  return (settings.profiles ?? []).map((profile) => {
    const { key, value } = readYx(profile);
    const rotation = Number(profile[ROTATION_KEY] ?? 0);
    const flipped = Math.abs(wrapDegrees(rotation)) > 90;
    return {
      name: profile.name ?? "",
      mode: profile["Whole or horizontal accel parameters"]?.mode ?? "",
      outputDpi: profile["Output DPI"] ?? profile["Sensitivity multiplier"] ?? null,
      multiplier: horizontalMultiplier(settings, profile),
      yxKey: key,
      yx: value,
      lr: profile["L/R output DPI ratio (left sens multiplier)"]
        ?? profile["L/R sensitivity ratio (left sens multiplier)"]
        ?? null,
      ud: profile["U/D output DPI ratio (up sens multiplier)"]
        ?? profile["U/D sensitivity ratio (up sens multiplier)"]
        ?? null,
      rotation,
      driverInvert: {
        vertical: (value < 0) !== flipped,
        horizontal: flipped,
      },
    };
  });
}
