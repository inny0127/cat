import { describe, it, expect } from 'vitest';
import { Motor } from '../src/cat3d/motor';

describe('the tongue', () => {
  it('licks: each one out (tip up) and in again, felt as it lands, and then back in for good', () => {
    const m = new Motor();
    m.snap('sit');
    m.lick(4);
    let landed = 0, most = 0, up = 0;
    for (let t = 0; t < 2.5; t += 0.02) {
      m.update(0.02);
      if (m.lickLanded) { landed++; m.lickLanded = false; }
      if (m.pose.tongue > most) { most = m.pose.tongue; up = m.pose.tongueUp; }
    }
    expect(landed).toBe(4);
    expect(most).toBeGreaterThan(0.9);
    expect(up).toBeGreaterThan(0.3);
    expect(m.licking).toBe(false);
    expect(m.pose.tongue).toBeLessThan(0.05);
  });

  it('a blep: just the tip left out, the mouth all but shut', () => {
    const m = new Motor();
    m.snap('loaf');
    m.blep = 1;
    m.update(0.02);
    expect(m.pose.tongue).toBeGreaterThan(0.3);
    expect(m.pose.tongue).toBeLessThan(0.5);
    expect(m.pose.jaw).toBeLessThan(0.1);
  });
});
