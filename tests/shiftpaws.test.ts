import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { POSES } from '../src/cat3d/pose';

/** a cat sat (or stood) still for `secs`, as keyed up or drowsy as asked: each time a forepaw is
 *  put down again elsewhere, and how far off its posture's own place it ever goes */
function sitFor(secs: number, mood: { arousal: number; sleepy: number }, posture: 'sit' | 'stand' | 'loaf' = 'sit') {
  const m = new Motor();
  m.snap(posture);
  const home = { LF: POSES[posture].LF.z, RF: POSES[posture].RF.z };
  let moves = 0, most = 0;
  const was = { LF: 0, RF: 0 };
  for (let t = 0; t < secs; t += 1 / 30) {
    m.setMood(mood, true);
    m.update(1 / 30);
    for (const l of ['LF', 'RF'] as const) {
      const off = m.pose[l].z - home[l];
      // (the posture's own sway is tiny: a shift is a jump of a couple of centimetres)
      if (Math.abs(off - was[l]) > 0.015) moves++;
      most = Math.max(most, Math.abs(off));
      was[l] = off;
    }
  }
  return { moves, most };
}

describe('sat still a while', () => {
  it('now and then a forepaw is put down again a little forward or back, and back again', () => {
    const r = sitFor(300, { arousal: 0.3, sleepy: 0.1 });
    expect(r.moves).toBeGreaterThan(2);
    expect(r.moves).toBeLessThan(30);
    expect(r.most).toBeLessThan(0.04);
  });
  it('drowsy, hardly ever', () => {
    const keen = sitFor(300, { arousal: 0.6, sleepy: 0 }).moves, drowsy = sitFor(300, { arousal: 0, sleepy: 0.9 }).moves;
    expect(drowsy).toBeLessThan(keen);
    expect(drowsy).toBeLessThan(4);
  });
  it('lying in a loaf, or walking: never', () => {
    expect(sitFor(300, { arousal: 0.6, sleepy: 0 }, 'loaf').moves).toBe(0);
    const m = new Motor();
    m.snap('stand');
    let off = 0;
    for (let t = 0; t < 120; t += 1 / 30) {
      if (t % 6 < 1 / 30) m.walkTo(new THREE.Vector3(Math.sin(t) * 0.5, 0, Math.cos(t) * 0.5), 0.3);
      m.setMood({ arousal: 0.6, sleepy: 0 }, true);
      m.update(1 / 30);
      if (m.goal) off = Math.max(off, Math.abs(m.pose.LF.z - POSES.stand.LF.z), Math.abs(m.pose.RF.z - POSES.stand.RF.z));
    }
    expect(off).toBeLessThan(0.015);
  });
});
