// Hand travel for one flick, in cm, by what does the moving.
export const AIM_STYLES = {
  fingers: { near: 0.5, far: 2.5 },
  wrist: { near: 1.5, far: 6 },
  arm: { near: 4, far: 15 },
  shoulder: { near: 8, far: 30 },
};

// Grip only fills in the aim style when that is unknown.
const LIKELY_STYLE = { palm: "arm", claw: "wrist", fingertip: "wrist" };

// Room for one flick out from the middle of the pad, in cm, after leaving
// space for the hand itself. Pads are shallower than they are wide.
export const PADS = {
  small: { x: 9, y: 6 },
  medium: { x: 15, y: 10 },
  large: { x: 30, y: 14 },
};

// The direction decks give flick lengths between these, in degrees. Their
// spread is kept and moved onto the hand travel range.
const DECK_NEAR = 8;
const DECK_FAR = 40;

export function resolveHand({ grip, aim, pad } = {}) {
  const style = AIM_STYLES[aim] ? aim : LIKELY_STYLE[grip] ?? "wrist";
  const padName = PADS[pad] ? pad : "medium";
  return { style, pad: padName, travel: AIM_STYLES[style], room: PADS[padName] };
}

// cm of hand movement per degree of view along a direction. cm360 is the
// effective distance per turn sideways (x) and up and down (y).
export function cmPerDegree(angleDeg, cm360) {
  const radians = (angleDeg * Math.PI) / 180;
  return Math.hypot(Math.cos(radians) * cm360.x, Math.sin(radians) * cm360.y) / 360;
}

export function padRoom(angleDeg, room) {
  const radians = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return Math.min(cos > 1e-6 ? room.x / cos : Infinity, sin > 1e-6 ? room.y / sin : Infinity);
}

export function handTravel(entry, hand) {
  const share = (value) => Math.min(1, Math.max(0, (value - DECK_NEAR) / (DECK_FAR - DECK_NEAR)));
  const span = hand.travel.far - hand.travel.near;
  const limit = padRoom(entry.angle, hand.room);
  return {
    near: Math.min(hand.travel.near + share(entry.near) * span, limit),
    far: Math.min(hand.travel.near + share(entry.far) * span, limit),
  };
}

// A deck entry with its lengths turned from hand travel into view degrees.
export function fitEntry(entry, hand, cm360) {
  const travel = handTravel(entry, hand);
  const perDegree = cmPerDegree(entry.angle, cm360);
  return { ...entry, near: travel.near / perDegree, far: travel.far / perDegree };
}
