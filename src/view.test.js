import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectPoint,
  ROOM,
  lookCamera,
  cameraSpace,
  projectCamera,
  farWallPoint,
  TARGET_RADIUS,
  TARGET_DISTANCE,
  angularDistance,
  targetAngularRadius,
  targetPoint,
  variedTarget,
  TARGET_NEAR,
  buildFlickOrder,
  flickOffset,
  viewHalfAngles,
  roomReach,
} from "../public/view.js";
import { componentSamples } from "./tune.js";

const camera = { yaw: 0, pitch: 0 };

test("the view center stays in the middle of the screen", () => {
  const point = projectPoint(0, 0, camera, 90, 1600, 900);
  assert.ok(Math.abs(point.x - 800) < 1e-6);
  assert.ok(Math.abs(point.y - 450) < 1e-6);
});

test("looking right slides the world to the left", () => {
  const ahead = projectPoint(0, 0, camera, 90, 1600, 900);
  const turned = projectPoint(0, 0, { yaw: 20, pitch: 0 }, 90, 1600, 900);
  assert.ok(turned.x < ahead.x - 100);
  assert.ok(Math.abs(turned.y - ahead.y) < 1e-6);
});

test("one degree of yaw matches one degree of pitch on screen", () => {
  const yaw = projectPoint(1, 0, camera, 90, 1600, 900);
  const pitch = projectPoint(0, 1, camera, 90, 1600, 900);
  const dx = Math.abs(yaw.x - 800);
  const dy = Math.abs(pitch.y - 450);
  assert.ok(Math.abs(dx - dy) < 0.01);
});

test("the far-wall target sits in front of the camera", () => {
  const target = farWallPoint(0, 0);
  const screen = projectCamera(cameraSpace(target, lookCamera(0, 0)), 90, 1600, 900);
  assert.ok(Math.abs(screen.x - 800) < 1);
  assert.ok(Math.abs(screen.y - 450) < 1);
});

test("looking right moves the far-wall target to the left", () => {
  const target = farWallPoint(0, 0);
  const ahead = projectCamera(cameraSpace(target, lookCamera(0, 0)), 90, 1600, 900);
  const turned = projectCamera(cameraSpace(target, lookCamera(20, 0)), 90, 1600, 900);
  assert.ok(turned.x < ahead.x - 100);
});

test("the floor recedes toward the horizon", () => {
  const eye = lookCamera(0, 0);
  const near = projectCamera(cameraSpace({ x: 0, y: 0, z: 4.5 }, eye), 90, 1600, 900);
  const far = projectCamera(cameraSpace({ x: 0, y: 0, z: ROOM.depth }, eye), 90, 1600, 900);
  assert.ok(near.y > far.y);
  assert.ok(far.y > 450 && far.y < 900);
});

test("every round target floats inside the room", () => {
  for (let angle = 0; angle < 360; angle += 5) {
    const radians = (angle * Math.PI) / 180;
    const point = targetPoint(Math.cos(radians) * 30, Math.sin(radians) * 30);
    assert.ok(point.y - TARGET_RADIUS > ROOM.floor && point.y + TARGET_RADIUS < ROOM.ceiling);
    assert.ok(Math.abs(point.x) + TARGET_RADIUS < ROOM.halfWidth);
    assert.ok(point.z + TARGET_RADIUS < ROOM.depth);
  }
});

test("varied targets stay inside the room at every depth and size", () => {
  for (let angle = 0; angle < 360; angle += 5) {
    const radians = (angle * Math.PI) / 180;
    for (const roll of [0, 0.5, 0.999]) {
      const target = variedTarget(Math.cos(radians) * 30, Math.sin(radians) * 30, () => roll);
      const point = targetPoint(target.yaw, target.pitch, target.distance);
      assert.ok(target.distance >= TARGET_NEAR);
      assert.ok(point.y - target.radius > ROOM.floor && point.y + target.radius < ROOM.ceiling);
      assert.ok(Math.abs(point.x) + target.radius < ROOM.halfWidth);
      assert.ok(point.z + target.radius < ROOM.depth);
    }
  }
});

test("the floor and ceiling stay in a 90 degree view", () => {
  const eye = lookCamera(0, 0);
  const floor = projectCamera(cameraSpace({ x: 0, y: ROOM.floor, z: ROOM.depth }, eye), 90, 1600, 900);
  const ceiling = projectCamera(cameraSpace({ x: 0, y: ROOM.ceiling, z: ROOM.depth }, eye), 90, 1600, 900);
  assert.ok(floor.y < 800);
  assert.ok(ceiling.y > 100);
});

test("a target straight ahead is in the middle of the screen", () => {
  const screen = projectCamera(cameraSpace(targetPoint(0, 0), lookCamera(0, 0)), 90, 1600, 900);
  assert.ok(Math.abs(screen.x - 800) < 1e-6);
  assert.ok(Math.abs(screen.y - 450) < 1e-6);
});

test("the hit zone matches the drawn orb", () => {
  const radius = targetAngularRadius();
  assert.ok(Math.abs(radius - (Math.atan(TARGET_RADIUS / TARGET_DISTANCE) * 180) / Math.PI) < 1e-9);
  assert.ok(angularDistance({ yaw: 0, pitch: 0 }, { yaw: radius * 0.9, pitch: 0 }) < radius);
  assert.ok(angularDistance({ yaw: 0, pitch: 0 }, { yaw: 0, pitch: radius * 1.1 }) > radius);
});

test("the ceiling and side walls frame the far wall", () => {
  const eye = lookCamera(0, 0);
  const ceiling = projectCamera(cameraSpace({ x: 0, y: ROOM.ceiling, z: ROOM.depth }, eye), 90, 1600, 900);
  const side = projectCamera(cameraSpace({ x: -ROOM.halfWidth, y: ROOM.eye, z: ROOM.depth }, eye), 90, 1600, 900);
  assert.ok(ceiling.y > 20 && ceiling.y < 400);
  assert.ok(side.x > 40 && side.x < 560);
});

function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

test("game-like rounds are mostly sideways but still measure every axis", () => {
  const random = seeded(7);
  const offsets = buildFlickOrder("game", 400, random).map((entry) => flickOffset(entry, random));
  const sideways = offsets.filter((offset) => Math.abs(offset.pitch) < Math.abs(offset.yaw) * Math.tan(Math.PI / 6));
  assert.ok(sideways.length / offsets.length > 0.55);
  const axes = { right: 0, left: 0, up: 0, down: 0 };
  for (const offset of offsets) {
    const intended = { x: offset.yaw, y: offset.pitch };
    for (const sample of componentSamples(intended, intended)) axes[sample.axis] += 1;
  }
  assert.ok(axes.right > 150 && axes.left > 150);
  assert.ok(axes.up > 50 && axes.down > 50);
  const longestSide = Math.max(...offsets.map((offset) => Math.abs(offset.yaw)));
  const longestUp = Math.max(...offsets.map((offset) => Math.abs(offset.pitch)));
  assert.ok(longestSide > 35 && longestUp < 26);
});

test("every round of 16 gets the same balanced deck", () => {
  const order = buildFlickOrder("game", 16, seeded(3));
  const count = (angle) => order.filter((entry) => entry.angle === angle).length;
  assert.equal(count(0), 3);
  assert.equal(count(180), 3);
  assert.equal(count(90), 1);
  assert.equal(count(270), 1);
  assert.equal(buildFlickOrder("even", 16, seeded(3)).filter((entry) => entry.angle === 45).length, 2);
});

test("flick targets stay on screen and inside the room for narrow views", () => {
  const random = seeded(11);
  for (const fov of [60, 90, 120]) {
    const limits = viewHalfAngles(fov, 1600, 900);
    for (const entry of buildFlickOrder("game", 200, random)) {
      const offset = flickOffset(entry, random, limits);
      assert.ok(Math.abs(offset.yaw) <= limits.halfYaw * 0.88 + 1e-9);
      assert.ok(Math.abs(offset.pitch) <= limits.halfPitch * 0.85 + 1e-9);
      const target = variedTarget(offset.yaw, offset.pitch, random);
      assert.ok(target.distance <= roomReach(offset.yaw, offset.pitch, target.radius) + 1e-9);
    }
  }
});
