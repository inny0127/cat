import { describe, it, expect } from 'vitest';
import { Motor } from '../src/cat3d/motor';
import type { PoseName } from '../src/cat3d/pose';

/** in one posture, asked into another for a moment (k frames) and straight back: how far the hips
 *  go off where they were, and how long till they are back */
function backAgain(from: PoseName, to: PoseName, k: number) {
  let r = 7;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const m = new Motor();
  m.snap(from);
  for (let i = 0; i < 60; i++) m.update(1 / 60);
  const y0 = m.pose.hipY;
  m.setPosture(to);
  for (let i = 0; i < k; i++) m.update(1 / 60);
  const off0 = Math.abs(m.pose.hipY - y0);
  m.setPosture(from);
  let most = 0;
  for (let i = 0; i < 120; i++) { m.update(1 / 60); most = Math.max(most, Math.abs(m.pose.hipY - y0) - off0); }
  Math.random = rnd;
  return { most, posture: m.posture, target: m.targetPosture };
}

describe('asked into a posture and straight back', () => {
  it('a frame or a few of it, and back: the body turns back from where it has got to, no bob up and down', () => {
    for (const [a, b] of [['crouch', 'stand'], ['sit', 'stand'], ['stand', 'crouch'], ['loaf', 'sit']] as [PoseName, PoseName][]) {
      for (const k of [1, 3, 8]) {
        const r = backAgain(a, b, k);
        // (no further off than it had got when it was asked back, give or take its breathing; the
        // way there and back again was a bob of some 4 or 5 cm)
        expect(r.most).toBeLessThan(0.01);
        expect(r.posture).toBe(a);
        expect(r.target).toBe(a);
      }
    }
  });
});
