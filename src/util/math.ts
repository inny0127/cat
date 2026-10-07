export type V2 = { x: number; y: number };

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const rand = (lo = 0, hi = 1) => lo + Math.random() * (hi - lo);
export const chance = (p: number) => Math.random() < p;
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Frame-rate independent exponential approach: rate = fraction remaining per second. */
export const approach = (cur: number, target: number, ratePerSec: number, dt: number) =>
  target + (cur - target) * Math.exp(-ratePerSec * dt);

/** Critically damped spring towards a moving target (Unity-style SmoothDamp). */
export class Smooth {
  v = 0;
  constructor(public x = 0, public time = 0.25) {}
  to(target: number, dt: number, time = this.time, maxSpeed = Infinity) {
    const omega = 2 / Math.max(1e-4, time);
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    let change = this.x - target;
    const maxChange = maxSpeed * time;
    change = clamp(change, -maxChange, maxChange);
    const t = this.x - change;
    const temp = (this.v + omega * change) * dt;
    this.v = (this.v - omega * temp) * exp;
    let out = t + (change + temp) * exp;
    if ((target - this.x > 0) === (out > target)) {
      out = target;
      this.v = (out - target) / Math.max(dt, 1e-6);
    }
    this.x = out;
    return out;
  }
}

/** Under-damped oscillator used for twitches and flicks: kick() it and it rings back to 0. */
export class Wobble {
  x = 0;
  v = 0;
  constructor(public stiffness = 260, public damping = 9) {}
  kick(velocity: number) {
    this.v += velocity;
  }
  step(dt: number, target = 0) {
    // semi-implicit Euler in small substeps for stability
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -this.stiffness * (this.x - target) - this.damping * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

// ---- smooth 1D noise (gradient noise) for idle micro-motion
const PERM = new Uint8Array(512);
const GRAD = new Float32Array(256);
{
  let s = 1234567;
  const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) GRAD[i] = r() * 2 - 1;
}
export function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const g0 = GRAD[PERM[i & 255]];
  const g1 = GRAD[PERM[(i + 1) & 255]];
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return lerp(g0 * f, g1 * (f - 1), u) * 2;
}
/**
 * A twitch, as a tail's tip twitches at something it is watching: to and fro at about `f` rad/s,
 * but never quite in time (now quicker, now slower) and in bursts (now hard, now hardly at all),
 * unlike a pendulum. About -1 .. 1; each `f` its own (two at once are not in step).
 */
export function twitch(t: number, f: number): number {
  const s = f * 7.31;
  const burst = Math.max(0.1, Math.min(1, 0.55 + 0.7 * noise1(t * 0.8 + s + 31.7)));
  return Math.sin(f * t + 2.4 * noise1(t * 0.8 + s)) * burst;
}
/**
 * How much of a thing done at its ease (a tail swishing, a tip ticking) is going on at time t: in
 * bouts, now a while of it, now a while quite still (about half the time, a few seconds to the
 * better part of half a minute at a stretch), never a metronome's that never stops. 0 .. 1; each
 * `s` its own.
 */
export function bouts(t: number, s = 0): number {
  const n = Math.max(0, Math.min(1, (noise1(t * 0.09 + 11 + s * 3.7) + 0.5 * noise1(t * 0.23 + 4 + s * 1.9) + 0.05) / 0.5));
  return n * n * (3 - 2 * n);
}
/** fractal noise in about [-1, 1] */
export function fbm1(x: number, oct = 3): number {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise1(x);
    n += a;
    x *= 2.03;
    a *= 0.5;
  }
  return s / n;
}

export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function polylineDist(px: number, py: number, pts: readonly (readonly [number, number])[]) {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    d = Math.min(d, segDist(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  return d;
}

export function pointInPoly(px: number, py: number, poly: readonly (readonly [number, number])[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const rot = (x: number, y: number, a: number): [number, number] => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c * x - s * y, s * x + c * y];
};
