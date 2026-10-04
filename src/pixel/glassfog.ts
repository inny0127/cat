/**
 * Your side of the glass misting over: on a cold morning, or a wet day, a breath of condensation
 * on the glass between you and the room, thickest round the edges and along the bottom, thinnest
 * in the middle where the warmth of the room is. Wherever a finger goes on the glass it wipes it
 * clear, and the mist creeps back over the wiped places, in a minute or so: you can draw on it.
 *
 * The mist is a coarse field over the screen (each cell a few of the art's pixels), 0 clear .. 1
 * as thick as it gets; the art pass draws it (stage.ts setFog), stepped and dithered.
 */
export class GlassFog {
  readonly w: number;
  readonly h: number;
  /** how misted each cell is now (0 .. 1), row by row from the top of the screen */
  readonly amount: Float32Array;
  /** how thick the mist is here when it has had time to settle: the shape (edges and bottom),
   *  times a little blotchiness of its own */
  private readonly shape: Float32Array;
  /** how misted the glass is, all told, this hour (0: clear) */
  level = 0;
  /** changed since last drawn */
  dirty = true;

  constructor(w = 64, h = 140, seed = 7) {
    this.w = w;
    this.h = h;
    this.amount = new Float32Array(w * h);
    this.shape = new Float32Array(w * h);
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // (blotches: a few soft bumps of thicker and thinner mist)
    const blots = Array.from({ length: 14 }, () => [rnd(), rnd(), 0.06 + 0.12 * rnd(), rnd() < 0.5 ? -1 : 1] as const);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = (i + 0.5) / w, y = (j + 0.5) / h;
      // (from the middle, in the screen's own proportions; the bottom misting most, the top a
      // little, the sides between)
      const dx = (x - 0.5) * 2, dy = (y - 0.45) * 2;
      const edge = Math.max(Math.abs(dx) ** 2.2, Math.abs(dy) ** 3);
      const bottom = Math.max(0, (y - 0.48) / 0.52);
      let v = 0.12 + 0.88 * Math.min(1, Math.max(edge, bottom ** 1.4));
      for (const [bx, by, r, sg] of blots) {
        const d = Math.hypot((x - bx) * w / h, y - by) / r;
        if (d < 1) v *= 1 + sg * 0.25 * (1 - d * d);
      }
      this.shape[j * w + i] = Math.max(0, Math.min(1, v));
    }
  }

  /** a finger on the glass at a point (0 .. 1 across and down the screen), so wide (a fraction of
   *  the screen's width): the mist wiped away there */
  wipe(x: number, y: number, r = 0.035) {
    if (this.level <= 0) return;
    const { w, h } = this;
    const rx = r * w, ry = r * w;
    const ci = x * w - 0.5, cj = y * h - 0.5;
    for (let j = Math.max(0, Math.floor(cj - ry - 1)); j <= Math.min(h - 1, Math.ceil(cj + ry + 1)); j++) {
      for (let i = Math.max(0, Math.floor(ci - rx - 1)); i <= Math.min(w - 1, Math.ceil(ci + rx + 1)); i++) {
        const d = Math.hypot((i - ci) / rx, (j - cj) / ry);
        if (d >= 1.45) continue;
        const n = j * w + i;
        // (wiped clear under the finger; the water pushed aside gathers in a thicker line along
        // the edges of the stroke)
        if (d < 1.0) {
          const k = d < 0.8 ? 0 : (d - 0.8) / 0.2 * 0.5;
          if (this.amount[n] > k * this.amount[n] + 1e-3) { this.amount[n] *= k; this.dirty = true; }
        } else if (d < 1.4 && this.amount[n] > 0.05) {
          const ridge = Math.min(1, this.level * this.shape[n] * 1.35 + 0.12);
          if (ridge > this.amount[n]) { this.amount[n] += (ridge - this.amount[n]) * 0.6; this.dirty = true; }
        }
      }
    }
  }

  /** the mist settling toward the hour's (slowly: a wiped place takes a minute or so to mist
   *  over again; a clearing hour clears it a little faster) */
  update(dt: number) {
    const a = this.amount, s = this.shape, L = this.level;
    const grow = 1 - Math.exp(-dt / 22), clear = 1 - Math.exp(-dt / 12);
    let moved = false;
    for (let n = 0; n < a.length; n++) {
      const want = L * s[n];
      const d = want - a[n];
      if (Math.abs(d) < 1e-4) continue;
      a[n] += d * (d > 0 ? grow : clear);
      moved = true;
    }
    if (moved) this.dirty = true;
  }

  /** settled at once to the hour's (as when the app is opened) */
  settle() {
    for (let n = 0; n < this.amount.length; n++) this.amount[n] = this.level * this.shape[n];
    this.dirty = true;
  }
}

/** how misted your side of the glass is at an hour (0 .. 1): on a cold morning, the most (the
 *  colder the month, the more), fading by late morning; on a wet day some all day */
export function fogOnGlass(d: Date, rain = 0) {
  const m = d.getMonth(), h = d.getHours() + d.getMinutes() / 60;
  // (how cold the month is: the depth of winter most, the shoulders of it a little)
  const cold = [1, 1, 0.75, 0.35, 0, 0, 0, 0, 0, 0.3, 0.7, 1][m];
  const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const morning = ss(4, 6.5, h) * (1 - ss(9, 11, h));
  return Math.max(0.9 * cold * morning, 0.5 * Math.min(1, rain / 0.6));
}
