/**
 * A body the size of a cat among boxes: the furniture, the walls, the floor. The cat is a box too
 * (its footprint square, r either side of its middle, h tall), pushed out of whatever it has got
 * into the shortest way; landing on a top it stands on it, and a ledge no higher than a step it
 * walks up.
 */

/** an axis-aligned box: x0, y0, z0, x1, y1, z1 */
export type Box = [number, number, number, number, number, number];

export interface Body {
  /** where its feet are (the middle of its footprint) */
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  r: number; h: number;
  grounded: boolean;
  /** how hard it came down this step (m/s, 0 if it did not) */
  landed: number;
}

/** how high a ledge it walks up without jumping */
const STEP = 0.045;

/** one step of a body's moving: along its velocity, out of the boxes, onto what it lands on (in
 *  steps short enough that nothing fast goes through a wall between one and the next) */
export function moveBody(b: Body, boxes: readonly Box[], dt: number, gravity = 13) {
  const n = Math.min(12, Math.max(1, Math.ceil((Math.max(Math.abs(b.vx), Math.abs(b.vy), Math.abs(b.vz)) * dt) / 0.04)));
  let landed = 0;
  for (let i = 0; i < n; i++) {
    stepBody(b, boxes, dt / n, gravity);
    landed = Math.max(landed, b.landed);
  }
  b.landed = landed;
}

function stepBody(b: Body, boxes: readonly Box[], dt: number, gravity: number) {
  const wasGrounded = b.grounded;
  b.vy -= gravity * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  b.grounded = false;
  b.landed = 0;
  // (twice round: pushed out of one box into another, out of that too)
  for (let pass = 0; pass < 2; pass++) {
    for (const B of boxes) {
      const ox = Math.min(b.x + b.r, B[3]) - Math.max(b.x - b.r, B[0]);
      const oz = Math.min(b.z + b.r, B[5]) - Math.max(b.z - b.r, B[2]);
      const oy = Math.min(b.y + b.h, B[4]) - Math.max(b.y, B[1]);
      if (ox <= 0 || oz <= 0 || oy <= 0) continue;
      // (onto it: coming down on its top, or walking up a ledge no higher than a step)
      const up = B[4] - b.y;
      if (up <= Math.max(STEP, -b.vy * dt + 0.02) && (b.vy <= 0 || up <= STEP)) {
        if (b.vy < -0.5 && !wasGrounded) b.landed = Math.max(b.landed, -b.vy);
        b.y = B[4];
        if (b.vy < 0) b.vy = 0;
        b.grounded = true;
        continue;
      }
      // (its head into the underside of it, going up)
      const down = b.y + b.h - B[1];
      if (b.vy > 0 && down < Math.min(ox, oz) && down < 0.15) {
        b.y = B[1] - b.h;
        b.vy = 0;
        continue;
      }
      // (out sideways, the shorter way)
      if (ox < oz) {
        const s = b.x < (B[0] + B[3]) / 2 ? -1 : 1;
        b.x += s * ox;
        if (b.vx * s < 0) b.vx = 0;
      } else {
        const s = b.z < (B[2] + B[5]) / 2 ? -1 : 1;
        b.z += s * oz;
        if (b.vz * s < 0) b.vz = 0;
      }
    }
  }
  if (b.y <= 0) {
    if (b.vy < -0.5 && !wasGrounded) b.landed = Math.max(b.landed, -b.vy);
    b.y = 0;
    if (b.vy < 0) b.vy = 0;
    b.grounded = true;
  }
  // (still standing on what it stood on: a top it has not walked off)
  if (!b.grounded && wasGrounded && b.vy <= 0) {
    const under = groundUnder(b, boxes);
    if (b.y - under < 0.03) { b.y = under; b.vy = 0; b.grounded = true; }
  }
}

/** the height of what is under a body's footprint (the floor: 0) */
export function groundUnder(b: { x: number; y: number; z: number; r: number }, boxes: readonly Box[]) {
  let g = 0;
  for (const B of boxes) {
    if (b.x + b.r * 0.6 <= B[0] || b.x - b.r * 0.6 >= B[3] || b.z + b.r * 0.6 <= B[2] || b.z - b.r * 0.6 >= B[5]) continue;
    if (B[4] <= b.y + STEP && B[4] > g) g = B[4];
  }
  return g;
}

/** is the straight line between two points clear of the boxes (for whether one can see the other) */
export function lineClear(ax: number, ay: number, az: number, bx: number, by: number, bz: number, boxes: readonly Box[]) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (const B of boxes) {
    let t0 = 0, t1 = 1;
    const axes: [number, number, number, number][] = [[ax, dx, B[0], B[3]], [ay, dy, B[1], B[4]], [az, dz, B[2], B[5]]];
    let hit = true;
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-9) {
        if (o <= lo || o >= hi) { hit = false; break; }
        continue;
      }
      let ta = (lo - o) / d, tb = (hi - o) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 >= t1) { hit = false; break; }
    }
    if (hit && t1 > 0.02 && t0 < 0.98) return false;
  }
  return true;
}
