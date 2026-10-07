import * as THREE from 'three';
import type { EyeFrame } from '../cat3d/retina';

/**
 * The cat's midbrain, as far as looking and shying go.
 *
 * The colliculus: a sheet of neurons laid out as the way round the cat is (each a few degrees of
 * bearing and elevation, all the way round), on which what the eyes see (retina.ts) and what the
 * cat has in mind (nerves.ts: the things it knows) come together. Each neuron is driven by
 * movement and change in its bit of the view (anything at all that moves: a curtain swinging, the
 * rain on the glass, a shadow), a little by plain contrast, by the things its other neurons fire
 * for where they are, and by a little noise; it excites its neighbours and the whole sheet holds
 * itself down, so that one patch of it fires at a time, a bump that holds while what drives it is
 * there and moves with it; and each tires where it fires, a few seconds (having looked at a thing
 * a while, the eyes go elsewhere). Where the bump is, the eyes go.
 *
 * Kept by bearing in the world rather than as the eye has it, a turn of the head does not smear
 * the view across it: what stays still in the room stays still on the sheet, and only what really
 * moves is movement to it.
 *
 * And a handful of neurons for what to do about what it looks at (Valence): go toward it, shy
 * from it, freeze, or be curious about it; each with its own pace, all holding each other in check,
 * the shying tiring with a fright that came to nothing.
 */

/** the sheet: bearings all the way round, and elevations from well below level to well above */
export const SC_AZ = 72;
export const SC_EL = 24;
const DA = (2 * Math.PI) / SC_AZ;
const EL0 = (-70 * Math.PI) / 180;
const DE = (5 * Math.PI) / 180;
const N = SC_AZ * SC_EL;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ss = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const sig = (x: number) => 1 / (1 + Math.exp(-x));

/** a thing it knows, as the colliculus takes it from the nerves: its id, where (world), how hard
 *  its neuron fires (0 .. 1), how big it is (m) */
export interface Known {
  id: string;
  p: THREE.Vector3;
  a: number;
  r: number;
}

/** column and row (fractional) of a bearing and an elevation */
export const cellOf = (az: number, el: number) => ({ c: ((az / DA) % SC_AZ + SC_AZ) % SC_AZ, r: (el - EL0) / DE });
/** the bearing and elevation of the middle of a cell */
export const dirOf = (c: number, r: number) => ({ az: wrap(c * DA), el: EL0 + r * DE });

export class Colliculus {
  /** what each neuron has taken in, and how hard it fires (0 .. 1) */
  readonly u = new Float32Array(N).fill(-0.4);
  readonly f = new Float32Array(N);
  /** how tired each is (looked at a while) */
  readonly tire = new Float32Array(N);
  /** what the eyes give it, held between frames: movement and change, and contrast (0 .. 1) */
  readonly move = new Float32Array(N);
  readonly edge = new Float32Array(N);
  /** in view just now (0 .. 1) */
  readonly view = new Float32Array(N);
  /** the room as the eyes last had it, by bearing (brightness, adapted), and how well each cell
   *  was covered */
  private readonly img = new Float32Array(N);
  private readonly had = new Float32Array(N);
  private readonly sum = new Float32Array(N);
  private readonly wsum = new Float32Array(N);
  private readonly input = new Float32Array(N);
  private readonly tmpA = new Float32Array(N);
  private readonly tmpB = new Float32Array(N);
  private readonly tmpC = new Float32Array(N);
  private readonly tmpD = new Float32Array(N);
  private lastFrame: EyeFrame | null = null;
  /** the light the eye has come round to (-1: none yet) */
  private adapt = -1;
  /** the whole view changed at once (a light switched, lightning): a start (0 .. 1, fading) */
  flash = 0;
  /** the bump: where (world bearing and elevation), how strong (0 .. 1), and which known thing it is
   *  on, if any */
  peak = 0;
  readonly at = { az: 0, el: 0 };
  on: string | null = null;
  /** how far the eyes moved the head's view since the last frame (for the eye's blur while it
   *  turns: a frame taken mid-turn is not trusted for movement) */
  private seed = 7;

  private noise() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647 - 0.5;
  }

  /** how hard the sheet fires at a bearing and elevation (0 .. 1) */
  firing(az: number, el: number) {
    const { c, r } = cellOf(az, el);
    const ci = Math.round(c) % SC_AZ, ri = Math.round(r);
    if (ri < 0 || ri >= SC_EL) return 0;
    return this.f[ri * SC_AZ + ci];
  }

  /**
   * A frame from the eyes: laid onto the sheet by bearing; what changed since the last (that both
   * saw) is movement, the more the brighter the change against the light there is; a frame taken
   * as the body goes is trusted the less for it (the room slides by a walking cat's eyes).
   */
  see(F: EyeFrame, moving: number) {
    const { sum, wsum, img, had } = this;
    sum.fill(0);
    wsum.fill(0);
    let mean = 0;
    const n = F.w * F.h;
    for (let i = 0; i < n; i++) mean += F.lum[i];
    mean = mean / n + 0.04;
    // (the eye comes round to the light there is over a second or so, not at once: a light put out
    // is a change to it, all over)
    const dt = this.lastFrame ? Math.max(0, Math.min(1, F.t - this.lastFrame.t)) : 1;
    this.adapt = this.adapt < 0 ? mean : this.adapt + (mean - this.adapt) * (1 - Math.exp(-dt / 0.8));
    const light = this.adapt;
    // (each receptor spread over the four cells round where it looked)
    for (let i = 0; i < n; i++) {
      const { c, r } = cellOf(F.az[i], F.el[i]);
      const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0;
      // (the eye's own adaptation: brightness against the light there is)
      const v = F.lum[i] / (F.lum[i] + light);
      for (let dr = 0; dr < 2; dr++) {
        const rr = r0 + dr;
        if (rr < 0 || rr >= SC_EL) continue;
        for (let dc = 0; dc < 2; dc++) {
          const w = (dc ? fc : 1 - fc) * (dr ? fr : 1 - fr);
          const k = rr * SC_AZ + ((c0 + dc) % SC_AZ + SC_AZ) % SC_AZ;
          sum[k] += v * w;
          wsum[k] += w;
        }
      }
    }
    // (moving about the room itself, the view slides: movement counts the less, the faster)
    const trust = Math.exp(-moving / 0.35);
    let changed = 0, both = 0;
    for (let k = 0; k < N; k++) {
      const cover = Math.min(1, wsum[k] * 2);
      this.view[k] = cover;
      if (cover < 0.25) { had[k] = 0; continue; }
      const v = sum[k] / wsum[k];
      if (had[k] > 0.25) {
        const d = Math.abs(v - img[k]);
        changed += d;
        both++;
        this.tmpA[k] = d;
      } else this.tmpA[k] = 0;
      img[k] = v;
      had[k] = cover;
    }
    // (all of it changed at once: not a thing moving but the light, or a flash; a start, and no
    // movement anywhere in particular)
    const whole = both > 30 ? changed / both : 0;
    this.flash = Math.max(this.flash, ss(0.06, 0.16, whole));
    const local = whole > 0.06 ? 0 : 1;
    for (let k = 0; k < N; k++) {
      if (this.view[k] < 0.25) continue;
      const m = ss(0.035, 0.2, this.tmpA[k] - 0.6 * whole) * trust * local;
      this.move[k] = Math.max(this.move[k], m);
    }
    // contrast: a cell against the cells round it
    for (let r = 0; r < SC_EL; r++) {
      for (let c = 0; c < SC_AZ; c++) {
        const k = r * SC_AZ + c;
        if (had[k] < 0.25) { this.edge[k] = 0; continue; }
        let s = 0, w = 0;
        for (let dr = -1; dr <= 1; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= SC_EL) continue;
          for (let dc = -1; dc <= 1; dc++) {
            const kk = rr * SC_AZ + ((c + dc) % SC_AZ + SC_AZ) % SC_AZ;
            if (had[kk] < 0.25) continue;
            s += img[kk];
            w++;
          }
        }
        this.edge[k] = ss(0.04, 0.3, Math.abs(img[k] - s / w));
      }
    }
    this.lastFrame = F;
  }

  /** the last frame it was given */
  get frame() {
    return this.lastFrame;
  }

  /**
   * One step of the sheet: the things it knows, where they are from its eyes (`eye`), each a bump
   * of drive as wide as it is from there; what the eyes give (movement, a little contrast); its
   * neighbours and the whole sheet; and tiring where it fires. `awake` 0 .. 1.
   */
  update(dt: number, eye: THREE.Vector3, known: readonly Known[], awake: number) {
    const { u, f, input, tire, move, edge } = this;
    input.fill(0);
    if (awake > 0.3) {
      for (let k = 0; k < N; k++) input[k] = 1.1 * move[k] + 0.12 * edge[k] * this.view[k];
      // what it knows, where it is: a bump of drive as wide as the thing looks (and never narrower
      // than about a neuron)
      for (const K of known) {
        if (K.a < 0.02) continue;
        const dx = K.p.x - eye.x, dy = K.p.y - eye.y, dz = K.p.z - eye.z;
        const flat = Math.hypot(dx, dz), d = Math.hypot(flat, dy);
        if (d < 1e-4) continue;
        const { c, r } = cellOf(Math.atan2(dx, dz), Math.atan2(dy, flat));
        const sig2 = Math.max(1.1, Math.atan2(K.r, d) / DA);
        const amp = 1.6 * K.a;
        const reach = Math.ceil(2.5 * sig2);
        for (let dr = -reach; dr <= reach; dr++) {
          const rr = Math.round(r) + dr;
          if (rr < 0 || rr >= SC_EL) continue;
          for (let dc = -reach; dc <= reach; dc++) {
            const cc = Math.round(c) + dc;
            const ex = cc - c, ey = rr - r;
            input[rr * SC_AZ + ((cc % SC_AZ) + SC_AZ) % SC_AZ] += amp * Math.exp(-(ex * ex + ey * ey) / (2 * sig2 * sig2));
          }
        }
      }
    }
    // what the eyes gave fades between frames (a moment: what moved is still in mind a little after)
    const fade = Math.exp(-dt / 0.18);
    for (let k = 0; k < N; k++) move[k] *= fade;
    this.flash *= Math.exp(-dt / 0.4);
    // its neighbours: the firing spread a little either way (a Gaussian, a neuron or so wide) excites;
    // all the firing further off than a few neurons holds it down (so that a patch that has the
    // lead keeps it, and puts out any other)
    const A = this.tmpA, B = this.tmpB, L = this.tmpC, M = this.tmpD;
    let total = 0;
    for (let k = 0; k < N; k++) total += f[k];
    const w3 = [0.27, 0.46, 0.27];
    for (let r = 0; r < SC_EL; r++) {
      const o = r * SC_AZ;
      for (let c = 0; c < SC_AZ; c++) {
        A[o + c] = w3[0] * f[o + (c + SC_AZ - 1) % SC_AZ] + w3[1] * f[o + c] + w3[2] * f[o + (c + 1) % SC_AZ];
        // (and the firing within three neurons either way, across)
        let s = 0;
        for (let d = -3; d <= 3; d++) s += f[o + (c + d + SC_AZ) % SC_AZ];
        L[o + c] = s;
      }
    }
    for (let r = 0; r < SC_EL; r++) {
      for (let c = 0; c < SC_AZ; c++) {
        const k = r * SC_AZ + c;
        B[k] = w3[1] * A[k] + w3[0] * (r > 0 ? A[k - SC_AZ] : 0) + w3[2] * (r < SC_EL - 1 ? A[k + SC_AZ] : 0);
        let s = 0;
        for (let d = -3; d <= 3; d++) { const rr = r + d; if (rr >= 0 && rr < SC_EL) s += L[rr * SC_AZ + c]; }
        M[k] = s;
      }
    }
    const tau = 0.06, kk = Math.min(1, dt / tau);
    const kt = 1 - Math.exp(-dt / 3.5), kr = 1 - Math.exp(-dt / 6);
    let best = -1, bestF = 0;
    for (let k = 0; k < N; k++) {
      const drive = input[k] + 1.15 * B[k] - 0.12 * (total - M[k]) - 0.45 * tire[k] - 0.42 + 0.06 * this.noise();
      u[k] += (drive - u[k]) * kk;
      f[k] = sig((u[k] - 0.35) * 9);
      // (tiring where it fires, a few seconds; rested again more slowly)
      tire[k] += f[k] > 0.3 ? (f[k] - tire[k]) * kt : -tire[k] * kr;
      if (f[k] > bestF) { bestF = f[k]; best = k; }
    }
    // the bump: where it is, the firing round its peak weighed together
    this.peak = bestF;
    this.on = null;
    if (best >= 0 && bestF > 0.5) {
      const r0 = Math.floor(best / SC_AZ), c0 = best % SC_AZ;
      let sx = 0, sy = 0, sw = 0;
      for (let dr = -2; dr <= 2; dr++) {
        const rr = r0 + dr;
        if (rr < 0 || rr >= SC_EL) continue;
        for (let dc = -2; dc <= 2; dc++) {
          const w = f[rr * SC_AZ + ((c0 + dc) % SC_AZ + SC_AZ) % SC_AZ];
          if (w < 0.3) continue;
          sx += (c0 + dc) * w;
          sy += rr * w;
          sw += w;
        }
      }
      const d = dirOf(sx / sw, sy / sw);
      this.at.az = d.az;
      this.at.el = d.el;
      // (which thing it knows, if it is on one: the nearest to it, near enough)
      let near = 0.2;
      for (const K of known) {
        if (K.a < 0.05) continue;
        const dx = K.p.x - eye.x, dy = K.p.y - eye.y, dz = K.p.z - eye.z;
        const off = Math.hypot(wrap(Math.atan2(dx, dz) - d.az), Math.atan2(dy, Math.hypot(dx, dz)) - d.el);
        if (off < near) { near = off; this.on = K.id; }
      }
    }
  }

  /** the way the bump is, as a unit vector (world) */
  dir(out: THREE.Vector3) {
    const { az, el } = this.at;
    return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  }
}

/**
 * What to do about it: five neurons, each with its own pace, that hold each other in check. Go
 * toward it (prey-like movement and a game draw it on); shy from it (a thing coming at its face,
 * the more the less it trusts what it is; a start; fear); freeze (a thing just come, a start: stock
 * still a moment); curious (something new, if it is not afraid); and a slow one that tires the
 * shying (a fright that came to nothing is less of one the next time).
 */
export interface ValenceIn {
  /** prey-like movement in what it looks at (0 .. 1) */
  prey: number;
  /** a thing coming at its face (0 .. 1: how fast, how close) */
  loom: number;
  /** something new come into view (0 .. 1) */
  novel: number;
  /** a start: a flash, a bang, a thing out of nowhere (0 .. 1) */
  startle: number;
  /** its mood: afraid, and keyed up (0 .. 1) */
  fear: number;
  arousal: number;
}

export class Valence {
  /** approach, withdraw, freeze, curious, and the slow one that tires the withdrawing */
  readonly y = new Float32Array([-2, -2.5, -2, -2, -1.5]);
  private static readonly TAU = [0.22, 0.07, 0.18, 1.4, 3];
  private static readonly BIAS = [-1.2, -1.7, -1.6, -1.4, -1.0];
  // (who drives whom: row to, column from; approach, withdraw, freeze, curious, tiring)
  private static readonly W = [
    [0.6, -3.6, -0.9, 0.5, 0],
    [-0.5, 0.5, 0, 0, -2.2],
    [-1.0, 1.0, 0.4, 0, 0],
    [0, -1.8, 0.3, 0.8, 0],
    [0, 3.0, 0, 0, 0.3],
  ];
  private readonly o = new Float32Array(5);

  update(dt: number, I: ValenceIn) {
    const y = this.y, o = this.o, W = Valence.W;
    for (let i = 0; i < 5; i++) o[i] = sig(y[i] + Valence.BIAS[i]);
    const ext = [
      2.4 * I.prey + 0.6 * I.arousal,
      4.5 * I.loom + 3.0 * I.startle + 1.4 * I.fear,
      1.8 * I.novel + 1.8 * I.startle,
      2.4 * I.novel * (1 - I.fear),
      0,
    ];
    for (let i = 0; i < 5; i++) {
      let s = ext[i];
      for (let j = 0; j < 5; j++) s += W[i][j] * o[j];
      y[i] += ((-y[i] + s) * Math.min(dt, 0.05)) / Valence.TAU[i];
    }
  }

  private out(i: number) {
    return sig(this.y[i] + Valence.BIAS[i]);
  }
  /** drawn toward it (0 .. 1) */
  get approach() {
    return this.out(0);
  }
  /** shying from it */
  get withdraw() {
    return this.out(1);
  }
  /** stock still */
  get freeze() {
    return this.out(2);
  }
  /** curious about it */
  get curious() {
    return this.out(3);
  }
}
