// Degrees the view turns for one mouse count at in-game sensitivity 1.
// cm/360 = 914.4 / (dpi * sensitivity * yaw). 914.4 is 360 * 2.54.
export const GAMES = [
  { id: "cs2", name: "Counter-Strike 2", yaw: 0.022, fov: 90 },
  { id: "valorant", name: "Valorant", yaw: 0.07, fov: 103 },
  { id: "apex", name: "Apex Legends", yaw: 0.022, fov: 110 },
  { id: "overwatch", name: "Overwatch 2", yaw: 0.0066, fov: 103 },
  { id: "cod", name: "Call of Duty / Warzone", yaw: 0.0066, fov: 90, vertical: true, sensHint: "Black Ops 6, Black Ops 7, Warzone, and Modern Warfare share this number. Horizontal is Mouse Sensitivity. Vertical is the separate slider." },
  { id: "fortnite", name: "Fortnite", yaw: 0.005555, fov: 80, sensHint: "Enter the X-axis slider. 8 means 8%." },
  { id: "r6", name: "Rainbow Six Siege", yaw: 0.00572958, fov: 90 },
  { id: "custom", name: "Custom", yaw: 0.022, fov: 103 },
];

export function degreesPerCount(yaw, sensitivity) {
  const value = Number(yaw) * Number(sensitivity);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Sensitivity and yaw must be positive.");
  }
  return value;
}

export function cmPer360(dpi, yaw, sensitivity) {
  const countsPerDegree = 1 / degreesPerCount(yaw, sensitivity);
  const dpiNumber = Number(dpi);
  if (!Number.isFinite(dpiNumber) || dpiNumber <= 0) {
    throw new Error("DPI must be positive.");
  }
  return 914.4 / (dpiNumber * Number(sensitivity) * Number(yaw));
}
