import { describe, expect, it } from 'vitest';
import { pencil, rugScratch, sigh, sneeze, yawn } from '../src/audio/synth';

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
});
