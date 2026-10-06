import { describe, it, expect } from 'vitest';
import { Motor } from '../src/cat3d/motor';

/** a face come close in front of it: the motor's side of it */
describe('a face up close', () => {
  const settle = (m: Motor, s: number) => { for (let t = 0; t < s; t += 1 / 60) m.update(1 / 60); };

  it('known: the whiskers forward, the ears up, the nose working', () => {
    const m = new Motor();
    m.snap('loaf');
    settle(m, 1);
    const before = { whisker: m.pose.whisker, earFwd: m.pose.earFwd };
    m.nose = 1;
    settle(m, 1.5);
    expect(m.pose.whisker).toBeGreaterThan(before.whisker + 0.4);
    expect(m.pose.earFwd).toBeGreaterThan(before.earFwd + 0.25);
    // (the muzzle bobbing as it sniffs: the head's pitch going up and down quickly, in runs)
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t < 2.8; t += 1 / 60) { m.update(1 / 60); lo = Math.min(lo, m.pose.headPitch); hi = Math.max(hi, m.pose.headPitch); }
    expect(hi - lo).toBeGreaterThan(0.03);
    // gone again: back as it was
    m.nose = 0;
    settle(m, 3);
    expect(Math.abs(m.pose.whisker - before.whisker)).toBeLessThan(0.05);
  });

  it('unsure of it: the ears back and flat, the head drawn back, the eyes wide', () => {
    const m = new Motor();
    m.snap('loaf');
    settle(m, 1);
    const before = { earFwd: m.pose.earFwd, earFlat: m.pose.earFlat, pupil: m.pose.pupil, neck: m.pose.neckPitch, head: m.pose.headPitch };
    m.shy = 1;
    settle(m, 1.5);
    expect(m.pose.earFwd).toBeLessThan(before.earFwd - 0.4);
    expect(m.pose.earFlat).toBeGreaterThan(before.earFlat + 0.3);
    expect(m.pose.pupil).toBeGreaterThan(before.pupil + 0.15);
    expect(m.pose.neckPitch).toBeGreaterThan(before.neck + 0.06);
    expect(m.pose.headPitch).toBeLessThan(before.head - 0.06);
  });
});
