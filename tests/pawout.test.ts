import { describe, it, expect } from 'vitest';
import { Motor } from '../src/cat3d/motor';
import { POSES } from '../src/cat3d/pose';

/** a cat lying in a loaf (or sat) for `secs`: how often a forepaw goes out in front, whether both
 *  ever are at once, and how far out one goes */
function lieFor(secs: number, posture: 'loaf' | 'sit' | 'sphinx' = 'loaf', room = true, seed = 4321) {
  // (the same dice every run: how often is a matter of chance, and chance is no test)
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  try { return lie(secs, posture, room); } finally { Math.random = rnd; }
}
function lie(secs: number, posture: 'loaf' | 'sit' | 'sphinx', room: boolean) {
  const m = new Motor();
  m.snap(posture);
  m.pawRoom = room;
  m.update(1 / 30);
  const home = { LF: POSES[posture].LF.z, RF: POSES[posture].RF.z };
  let outs = 0, both = 0, most = 0, jump = 0;
  const was = { LF: false, RF: false }, last = { LF: m.pose.LF.z, RF: m.pose.RF.z };
  for (let t = 0; t < secs; t += 1 / 30) {
    m.setMood({ arousal: 0.3, sleepy: 0.2 }, true);
    m.update(1 / 30);
    const out = { LF: false, RF: false };
    for (const l of ['LF', 'RF'] as const) {
      const d = m.pose[l].z - home[l];
      out[l] = d > 0.05;
      if (out[l] && !was[l]) outs++;
      most = Math.max(most, d);
      jump = Math.max(jump, Math.abs(m.pose[l].z - last[l]));
      last[l] = m.pose[l].z;
      was[l] = out[l];
    }
    if (out.LF && out.RF) both++;
  }
  return { outs, both, most, jump };
}

describe('lying in a loaf a while', () => {
  it('now and then a forepaw goes out in front of it, and in time back under; never both at once', () => {
    const r = lieFor(600);
    expect(r.outs).toBeGreaterThan(1);
    expect(r.outs).toBeLessThan(20);
    expect(r.both).toBe(0);
    // (out to about where a sphinx has it, and smoothly: a centimetre a frame at most)
    expect(r.most).toBeLessThan(POSES.sphinx.LF.z - POSES.loaf.LF.z);
    expect(r.jump).toBeLessThan(0.012);
  });
  it('sat up, or up on something (no room), never', () => {
    expect(lieFor(600, 'sit').outs).toBe(0);
    expect(lieFor(600, 'loaf', false).outs).toBe(0);
  });
});
