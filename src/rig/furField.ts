import { clamp, pointInPoly } from '../util/math';
import type { Pt } from './rig';

/**
 * A small spring grid laid over the painting. Fingers drag the fur along (and it springs back),
 * pressing darkens it a touch, and stroking against the grain leaves it ruffled for a while
 * until it is smoothed down again.
 */
export class FurField {
  readonly n = 150;
  readonly cell = 600 / 150;
  private dx: Float32Array;
  private dy: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private shade: Float32Array;
  private ruffle: Float32Array;
  private gx: Float32Array; // fur grain (root -> tip) per cell
  private gy: Float32Array;
  readonly out: Float32Array;
  private quiet = 0;
  dirty = true;

  constructor(headPoly: readonly Pt[]) {
    const N = this.n * this.n;
    this.dx = new Float32Array(N);
    this.dy = new Float32Array(N);
    this.vx = new Float32Array(N);
    this.vy = new Float32Array(N);
    this.shade = new Float32Array(N);
    this.ruffle = new Float32Array(N);
    this.gx = new Float32Array(N);
    this.gy = new Float32Array(N);
    this.out = new Float32Array(N * 4);
    for (let j = 0; j < this.n; j++)
      for (let i = 0; i < this.n; i++) {
        const x = (i + 0.5) * this.cell, y = (j + 0.5) * this.cell;
        const [gx, gy] = grain(x, y, headPoly);
        this.gx[j * this.n + i] = gx;
        this.gy[j * this.n + i] = gy;
      }
  }

  /** Grain direction at a painting point (unit vector pointing from fur root to tip). */
  grainAt(x: number, y: number): [number, number] {
    const i = clamp(Math.floor(x / this.cell), 0, this.n - 1);
    const j = clamp(Math.floor(y / this.cell), 0, this.n - 1);
    const k = j * this.n + i;
    return [this.gx[k], this.gy[k]];
  }

  /**
   * One finger contact for this frame. (x, y) painting px, (vx, vy) painting px/s.
   * `press` 0..1 how much it pushes in; `grip` 0..1 how much the fur follows the finger.
   */
  touch(x: number, y: number, vx: number, vy: number, radius: number, press: number, grip: number, dt: number) {
    const n = this.n, c = this.cell;
    const r = radius * 1.6;
    const i0 = clamp(Math.floor((x - r) / c), 0, n - 1), i1 = clamp(Math.ceil((x + r) / c), 0, n - 1);
    const j0 = clamp(Math.floor((y - r) / c), 0, n - 1), j1 = clamp(Math.ceil((y + r) / c), 0, n - 1);
    const s2 = 2 * (radius * 0.55) ** 2;
    const speed = Math.hypot(vx, vy);
    // the fur under a moving finger leans with it, capped: hair only bends so far
    const lean = Math.min(1, speed / 260);
    const tx = speed > 1e-3 ? (vx / speed) * 5.5 * lean : 0;
    const ty = speed > 1e-3 ? (vy / speed) * 5.5 * lean : 0;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const cx = (i + 0.5) * c, cy = (j + 0.5) * c;
        const ddx = cx - x, ddy = cy - y;
        const w = Math.exp(-(ddx * ddx + ddy * ddy) / s2);
        if (w < 0.01) continue;
        const k = j * n + i;
        // pressing gathers the skin a little towards the fingertip
        const px = -ddx * 0.07 * press, py = -ddy * 0.07 * press;
        const ax = (tx * grip + px - this.dx[k]) * 520 * w;
        const ay = (ty * grip + py - this.dy[k]) * 520 * w;
        this.vx[k] += ax * dt;
        this.vy[k] += ay * dt;
        this.shade[k] = Math.min(0.9, this.shade[k] + w * press * dt * 3.2);
        if (speed > 25) {
          const along = (vx * this.gx[k] + vy * this.gy[k]) / speed; // +1 with the grain
          if (along < -0.25) this.ruffle[k] = Math.min(1, this.ruffle[k] + w * (-along) * dt * Math.min(speed, 500) / 260);
          else if (along > 0.25) this.ruffle[k] = Math.max(0, this.ruffle[k] - w * along * dt * 3.0);
        }
      }
    this.quiet = 0;
  }

  step(dt: number) {
    if (this.quiet > 3) return;
    const N = this.n * this.n;
    const k = 150, damp = 13;
    let energy = 0;
    const h = Math.min(dt, 1 / 30);
    const shadeDecay = Math.exp(-h * 2.2), ruffleDecay = Math.exp(-h * 0.22);
    for (let i = 0; i < N; i++) {
      let vx = this.vx[i], vy = this.vy[i];
      vx += (-k * this.dx[i] - damp * vx) * h;
      vy += (-k * this.dy[i] - damp * vy) * h;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.dx[i] += vx * h;
      this.dy[i] += vy * h;
      this.shade[i] *= shadeDecay;
      this.ruffle[i] *= ruffleDecay;
      energy += Math.abs(this.dx[i]) + Math.abs(vx) * 0.05 + this.shade[i] + this.ruffle[i];
      const o = i * 4;
      this.out[o] = this.dx[i];
      this.out[o + 1] = this.dy[i];
      this.out[o + 2] = this.shade[i];
      this.out[o + 3] = this.ruffle[i];
    }
    this.dirty = true;
    if (energy < 0.5) {
      this.quiet++;
      if (this.quiet > 3) {
        this.dx.fill(0); this.dy.fill(0); this.vx.fill(0); this.vy.fill(0);
        this.shade.fill(0); this.ruffle.fill(0); this.out.fill(0);
      }
    } else this.quiet = 0;
  }

  sample(x: number, y: number): [number, number] {
    const n = this.n, c = this.cell;
    const fx = clamp(x / c - 0.5, 0, n - 1.001), fy = clamp(y / c - 0.5, 0, n - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy);
    const ax = fx - i, ay = fy - j;
    const k = j * n + i;
    const l = (a: Float32Array) =>
      (a[k] * (1 - ax) + a[k + 1] * ax) * (1 - ay) + (a[k + n] * (1 - ax) + a[k + n + 1] * ax) * ay;
    return [l(this.dx), l(this.dy)];
  }

  /** take the upload buffer if it changed since last frame */
  take(): Float32Array | null {
    if (!this.dirty) return null;
    this.dirty = false;
    return this.out;
  }
}

/** Fur grows from the nose back over the skull, and round the curled body clockwise. */
function grain(x: number, y: number, headPoly: readonly Pt[]): [number, number] {
  const head: [number, number] = [0.45, -0.89];
  const dx = x - 390, dy = y - 330;
  const l = Math.hypot(dx, dy) || 1;
  const body: [number, number] = [-dy / l, dx / l];
  if (pointInPoly(x, y, headPoly)) {
    // blend towards the body flow near the neck
    const t = clamp((x - 170) / 60);
    const gx = head[0] * (1 - t) + body[0] * t, gy = head[1] * (1 - t) + body[1] * t;
    const m = Math.hypot(gx, gy) || 1;
    return [gx / m, gy / m];
  }
  return body;
}
