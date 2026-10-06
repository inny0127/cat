import { describe, expect, it } from 'vitest';
import { bell, grumble, lick, meow, pencil, rugScratch, rustle, shatter, sigh, sneeze, yawn } from '../src/audio/synth';

const check = (d: Float32Array, sr: number, minS: number, maxS: number) => {
  expect(d.length / sr).toBeGreaterThan(minS);
  expect(d.length / sr).toBeLessThan(maxS);
  let peak = 0, energy = 0;
  for (const v of d) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); energy += v * v; }
  expect(peak).toBeLessThanOrEqual(0.9001);
  expect(Math.sqrt(energy / d.length)).toBeGreaterThan(0.02);
};

describe("the cat's small sounds", () => {
  it('a pull of claws through the rug is a short, dry rasp', () => {
    for (let i = 0; i < 4; i++) check(rugScratch(22050), 22050, 0.2, 0.4);
  });

  it('a grumble is short and low, the mouth hardly open: well under a meow', () => {
    // (where the energy sits: a crude centroid from how often the wave crosses zero)
    const zc = (d: Float32Array) => { let n = 0; for (let i = 1; i < d.length; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++; return n / d.length; };
    for (let i = 0; i < 4; i++) {
      const g = grumble(22050);
      check(g, 22050, 0.3, 0.5);
      expect(zc(g)).toBeLessThan(zc(meow(22050, 'ask')) * 0.75);
    }
  });

  it('a lick is a short dry rasp, quieter than a scratch', () => {
    for (let i = 0; i < 6; i++) check(lick(22050), 22050, 0.08, 0.2);
  });

  it('a sneeze is short', () => {
    for (let i = 0; i < 4; i++) check(sneeze(22050), 22050, 0.1, 1);
  });

  it('a sigh is a short soft breath', () => {
    for (let i = 0; i < 6; i++) check(sigh(22050), 22050, 0.6, 1.0);
  });

  it('a yawn is a breath of about a second', () => {
    for (let i = 0; i < 6; i++) check(yawn(22050), 22050, 0.9, 1.4);
  });

  it('a pencil on the boards is a click and a short rattle', () => {
    for (let i = 0; i < 6; i++) check(pencil(22050), 22050, 0.1, 0.25);
  });

  it('leaves knocked are a short rustle', () => {
    for (let i = 0; i < 6; i++) check(rustle(22050), 22050, 0.3, 0.5);
  });

  it('the bell on a toy is a short jingle', () => {
    for (let i = 0; i < 6; i++) check(bell(22050), 22050, 0.2, 0.5);
  });

  it('a mug breaking is a crash under a second, loudest at the start', () => {
    for (let i = 0; i < 6; i++) {
      const d = shatter(22050);
      check(d, 22050, 0.5, 1.0);
      const rms = (a: number, b: number) => { let e = 0; for (let k = a; k < b; k++) e += d[k] * d[k]; return Math.sqrt(e / (b - a)); };
      expect(rms(0, 2205)).toBeGreaterThan(3 * rms(11025, 16537));
    }
  });
});
