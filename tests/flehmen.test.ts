import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { wander, type Ctx } from '../src/pixel/behave';

afterEach(() => { vi.restoreAllMocks(); });

describe('the flehmen', () => {
  it('now and then after a sniff: the head up, the mouth open and the lip drawn up, the eyes half shut; then it is over', () => {
    let found = 0;
    for (let seed0 = 1; seed0 < 400 && found < 3; seed0++) {
      let seed = seed0;
      vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
      const m = new Motor();
      m.snap('stand');
      m.pos.set(0, 0, 0.05);
      const c = {
        m, mood: { ...NEUTRAL }, home: new THREE.Vector3(0, 0, 0.05),
        sniff: () => [{ to: new THREE.Vector3(0.3, 0, -0.2), face: 0.5 }],
        bed: () => ({ to: new THREE.Vector3(0, 0, 0.05), yaw: 0 }),
      } as unknown as Ctx;
      const w = wander(c) as unknown as { legs: { lip?: unknown }[]; update: (dt: number, c: Ctx) => boolean };
      if (!w.legs[0].lip) { vi.restoreAllMocks(); continue; }
      found++;
      let lip = 0, jaw = 0, headUp = -9, sniffed = false, after = 0;
      for (let t = 0; t < 30; t += 1 / 60) {
        const going = w.update(1 / 60, c);
        m.update(1 / 60);
        if (m.pose.neckPitch < -0.8) sniffed = true;
        if (m.lipUpNow > 0.8) {
          lip = Math.max(lip, m.lipUpNow);
          jaw = Math.max(jaw, m.pose.jaw);
          headUp = Math.max(headUp, m.pose.neckPitch);
          expect(m.pose.squint).toBeGreaterThan(0.3);
        }
        if (lip > 0 && m.lipUpNow < 0.02) after += 1 / 60;
        if (!going) break;
      }
      expect(sniffed).toBe(true);
      expect(lip).toBeGreaterThan(0.85);
      expect(jaw).toBeGreaterThan(0.2);
      expect(headUp).toBeGreaterThan(-0.4);
      // (and the lip down again after it)
      expect(after).toBeGreaterThan(0.5);
      vi.restoreAllMocks();
    }
    expect(found).toBe(3);
  });
});
