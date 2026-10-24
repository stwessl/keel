export function wrapDegrees(degrees) {
  return (((degrees + 180) % 360) + 360) % 360 - 180;
}

// Horizontal field of view, corrected for the view's aspect so one degree
// covers the same distance sideways and up.
export function projectPoint(yaw, pitch, camera, fovDegrees, width, height) {
  const deltaYaw = wrapDegrees(yaw - camera.yaw);
  const deltaPitch = pitch - camera.pitch;
  if (Math.abs(deltaYaw) > 89 || Math.abs(deltaPitch) > 89) return null;
  const aspect = width / height;
  if (!Number.isFinite(aspect) || aspect <= 0) return null;
  const tanHalfH = Math.tan(((Number(fovDegrees) || 90) * Math.PI) / 360);
  if (!(tanHalfH > 0)) return null;
  const tanHalfV = tanHalfH / aspect;
  const x = Math.tan((deltaYaw * Math.PI) / 180) / tanHalfH;
  const y = Math.tan((deltaPitch * Math.PI) / 180) / tanHalfV;
  return {
    x: (x * 0.5 + 0.5) * width,
    y: (-y * 0.5 + 0.5) * height,
  };
}

// The flick room. Targets float at one distance from the eye so every one
// has the same angular size, and the room is large enough to hold a target
// 28° from center in any direction.
export const ROOM = {
  depth: 9,
  halfWidth: 5.5,
  floor: 0,
  ceiling: 4.8,
  eye: 2.2,
  back: -1.2,
  grid: 0.5,
};

export const TARGET_RADIUS = 0.08;
export const HOME_RADIUS = 0.16;
export const TARGET_DISTANCE = 4;
export const TARGET_NEAR = 3;
export const TARGET_FAR = 7.5;
export const TARGET_RADIUS_RANGE = [0.05, 0.09];

export function targetPoint(yawDeg, pitchDeg, distance = TARGET_DISTANCE, room = ROOM) {
  const direction = directionVector(yawDeg, pitchDeg);
  return {
    x: direction.x * distance,
    y: room.eye + direction.y * distance,
    z: direction.z * distance,
  };
}

// How far along the view ray a target of this radius can sit and still float
// clear of the walls, floor, and ceiling.
export function roomReach(yawDeg, pitchDeg, radius, room = ROOM) {
  const direction = directionVector(yawDeg, pitchDeg);
  const margin = radius * 1.5;
  const limits = [];
  if (direction.x > 0) limits.push((room.halfWidth - margin) / direction.x);
  if (direction.x < 0) limits.push((-room.halfWidth + margin) / direction.x);
  if (direction.y > 0) limits.push((room.ceiling - margin - room.eye) / direction.y);
  if (direction.y < 0) limits.push((room.floor + margin - room.eye) / direction.y);
  if (direction.z > 0) limits.push((room.depth - margin) / direction.z);
  if (direction.z < 0) limits.push((room.back + margin) / direction.z);
  return Math.min(...limits);
}

export function variedTarget(yawDeg, pitchDeg, random = Math.random, room = ROOM) {
  const [smallest, largest] = TARGET_RADIUS_RANGE;
  const radius = smallest + random() * (largest - smallest);
  const far = Math.max(TARGET_NEAR, Math.min(TARGET_FAR, roomReach(yawDeg, pitchDeg, radius, room)));
  const distance = TARGET_NEAR + random() * (far - TARGET_NEAR);
  return { yaw: yawDeg, pitch: pitchDeg, distance, radius };
}

// Each entry is one flick in a shuffled deck: a screen direction (0° is right,
// 90° is up), how far it may wander, and the range of flick lengths in degrees.
// Shallow flicks stay at least 20° off horizontal so their small vertical part
// still counts toward up or down.
const flick = (angle, spread, near, far) => ({ angle, spread, near, far });
export const FLICK_PATTERNS = {
  game: [
    ...[0, 0, 0, 180, 180, 180].map((angle) => flick(angle, 6, 12, 40)),
    ...[24, -24, 156, 204].map((angle) => flick(angle, 4, 10, 34)),
    ...[45, 135, 225, 315].map((angle) => flick(angle, 6, 10, 26)),
    ...[90, 270].map((angle) => flick(angle, 6, 8, 18)),
  ],
  even: [0, 45, 90, 135, 180, 225, 270, 315].map((angle) => flick(angle, 10, 10, 30)),
};

export function buildFlickOrder(pattern, total, random = Math.random) {
  const deck = FLICK_PATTERNS[pattern] ?? FLICK_PATTERNS.game;
  const order = [];
  while (order.length < total) {
    const copy = [...deck];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    order.push(...copy);
  }
  return order.slice(0, total);
}

// Keeps the target inside the visible screen from the center orb, so a narrow
// field of view never asks for a flick to something you cannot see.
export function flickOffset(entry, random = Math.random, view = { halfYaw: 45, halfPitch: 29 }) {
  const angle = ((entry.angle + (random() - 0.5) * 2 * entry.spread) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const fit = Math.min(
    Math.abs(cos) > 1e-6 ? (view.halfYaw * 0.88) / Math.abs(cos) : Infinity,
    Math.abs(sin) > 1e-6 ? (view.halfPitch * 0.85) / Math.abs(sin) : Infinity,
  );
  const far = Math.min(entry.far, fit);
  const near = Math.min(entry.near, far);
  const length = near + random() * (far - near);
  return { yaw: cos * length, pitch: sin * length };
}

export function viewHalfAngles(fovDegrees, width, height) {
  const tanHalfH = Math.tan(((Number(fovDegrees) || 90) * Math.PI) / 360);
  const aspect = width > 0 && height > 0 ? width / height : 16 / 9;
  return {
    halfYaw: (Math.atan(tanHalfH) * 180) / Math.PI,
    halfPitch: (Math.atan(tanHalfH / aspect) * 180) / Math.PI,
  };
}

export function directionVector(yawDeg, pitchDeg) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  return {
    x: Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: Math.cos(yaw) * Math.cos(pitch),
  };
}

export function angularDistance(a, b) {
  const u = directionVector(a.yaw, a.pitch);
  const v = directionVector(b.yaw, b.pitch);
  const dot = Math.min(1, Math.max(-1, u.x * v.x + u.y * v.y + u.z * v.z));
  return (Math.acos(dot) * 180) / Math.PI;
}

export function targetAngularRadius(radius = TARGET_RADIUS, distance = TARGET_DISTANCE) {
  return (Math.atan(radius / distance) * 180) / Math.PI;
}

export function lookCamera(yaw, pitch, room = ROOM) {
  return { x: 0, y: room.eye, z: 0, yaw, pitch };
}

export function cameraSpace(point, camera) {
  const yaw = (camera.yaw * Math.PI) / 180;
  const pitch = (camera.pitch * Math.PI) / 180;
  const dx = point.x - camera.x;
  const dy = point.y - camera.y;
  const dz = point.z - camera.z;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const x1 = dx * cosYaw - dz * sinYaw;
  const z1 = dx * sinYaw + dz * cosYaw;
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  return {
    x: x1,
    y: dy * cosPitch - z1 * sinPitch,
    z: dy * sinPitch + z1 * cosPitch,
  };
}

export function projectCamera(point, fovDegrees, width, height) {
  if (point.z <= 0.02) return null;
  const aspect = width / height;
  if (!Number.isFinite(aspect) || aspect <= 0) return null;
  const tanHalfH = Math.tan(((Number(fovDegrees) || 90) * Math.PI) / 360);
  if (!(tanHalfH > 0)) return null;
  const tanHalfV = tanHalfH / aspect;
  const x = (point.x / point.z) / tanHalfH;
  const y = (point.y / point.z) / tanHalfV;
  return {
    x: (x * 0.5 + 0.5) * width,
    y: (-y * 0.5 + 0.5) * height,
    depth: point.z,
  };
}

export function cameraRight(camera) {
  const yaw = (camera.yaw * Math.PI) / 180;
  return { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
}

// Where a yaw/pitch direction meets the far wall. This is the 3D point a flick aims at.
export function farWallPoint(yawDeg, pitchDeg, room = ROOM) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const forward = Math.cos(pitch) * Math.cos(yaw);
  if (forward <= 0.2) return null;
  const scale = room.depth / forward;
  return {
    x: Math.sin(yaw) * Math.cos(pitch) * scale,
    y: room.eye + Math.sin(pitch) * scale,
    z: room.depth,
  };
}

export function clipPolygonNear(points, nearZ) {
  if (points.length === 0) return [];
  const output = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const currentIn = current.z >= nearZ;
    const previousIn = previous.z >= nearZ;
    if (currentIn !== previousIn) {
      const denom = current.z - previous.z;
      const t = denom === 0 ? 0 : (nearZ - previous.z) / denom;
      output.push({
        x: previous.x + (current.x - previous.x) * t,
        y: previous.y + (current.y - previous.y) * t,
        z: nearZ,
      });
    }
    if (currentIn) output.push(current);
  }
  return output;
}

export function clipSegmentNear(start, end, nearZ) {
  const startIn = start.z >= nearZ;
  const endIn = end.z >= nearZ;
  if (!startIn && !endIn) return null;
  if (startIn && endIn) return [start, end];
  const denom = end.z - start.z;
  const t = denom === 0 ? 0 : (nearZ - start.z) / denom;
  const hit = {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: nearZ,
  };
  return startIn ? [start, hit] : [hit, end];
}

function steps(from, to, step) {
  const count = Math.max(1, Math.round((to - from) / step));
  const values = [];
  for (let index = 0; index <= count; index += 1) {
    values.push(from + ((to - from) * index) / count);
  }
  return values;
}

function face(id, color, line, corners, lines) {
  return { id, color, line, corners, lines };
}

export function roomGeometry(room = ROOM) {
  const { depth, halfWidth, floor, ceiling, back, grid } = room;
  const floorCorners = [
    { x: -halfWidth, y: floor, z: back },
    { x: halfWidth, y: floor, z: back },
    { x: halfWidth, y: floor, z: depth },
    { x: -halfWidth, y: floor, z: depth },
  ];
  const ceilingCorners = [
    { x: -halfWidth, y: ceiling, z: back },
    { x: -halfWidth, y: ceiling, z: depth },
    { x: halfWidth, y: ceiling, z: depth },
    { x: halfWidth, y: ceiling, z: back },
  ];
  const leftCorners = [
    { x: -halfWidth, y: floor, z: back },
    { x: -halfWidth, y: floor, z: depth },
    { x: -halfWidth, y: ceiling, z: depth },
    { x: -halfWidth, y: ceiling, z: back },
  ];
  const rightCorners = [
    { x: halfWidth, y: floor, z: depth },
    { x: halfWidth, y: floor, z: back },
    { x: halfWidth, y: ceiling, z: back },
    { x: halfWidth, y: ceiling, z: depth },
  ];
  const farCorners = [
    { x: -halfWidth, y: floor, z: depth },
    { x: halfWidth, y: floor, z: depth },
    { x: halfWidth, y: ceiling, z: depth },
    { x: -halfWidth, y: ceiling, z: depth },
  ];
  const across = (y, z0, z1) => steps(-halfWidth, halfWidth, grid).map((x) => [
    { x, y, z: z0 },
    { x, y, z: z1 },
  ]);
  const depthLines = (y) => steps(back, depth, grid).map((z) => [
    { x: -halfWidth, y, z },
    { x: halfWidth, y, z },
  ]);
  const upright = (x) => steps(back, depth, grid).map((z) => [
    { x, y: floor, z },
    { x, y: ceiling, z },
  ]);
  const horizontal = (x) => steps(floor, ceiling, grid).map((y) => [
    { x, y, z: back },
    { x, y, z: depth },
  ]);
  return [
    face("floor", "#100e0c", "#4a3c31", floorCorners, [...across(floor, back, depth), ...depthLines(floor)]),
    face("ceiling", "#1a1612", "#3a3128", ceilingCorners, [...across(ceiling, back, depth), ...depthLines(ceiling)]),
    face("left", "#1c1814", "#4a3c31", leftCorners, [...upright(-halfWidth), ...horizontal(-halfWidth)]),
    face("right", "#1c1814", "#4a3c31", rightCorners, [...upright(halfWidth), ...horizontal(halfWidth)]),
    face("far", "#2a241c", "#6a5748", farCorners, [
      ...steps(-halfWidth, halfWidth, grid).map((x) => [
        { x, y: floor, z: depth },
        { x, y: ceiling, z: depth },
      ]),
      ...steps(floor, ceiling, grid).map((y) => [
        { x: -halfWidth, y, z: depth },
        { x: halfWidth, y, z: depth },
      ]),
    ]),
  ];
}
