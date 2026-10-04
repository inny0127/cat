import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { TailChase, type Ctx } from '../src/pixel/behave';

afterEach(() => { vi.restoreAllMocks(); });

describe('after its own tail', () => {
  it('round and round, a pounce, and sat facing you as if nothing had happened', () => {
    for (const seed0 of [11, 222, 3333, 44444]) {
      let seed = seed0;
      vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
      const m = new Motor();
      m.snap('sit');
      m.yaw = 0.3;
      const c = {
        m, mood: { ...NEUTRAL }, sound: () => {}, viewer: () => new THREE.Vector3(0, 1.4, 3),
      } as unknown as Ctx;
      const act = new TailChase(), phases = new Set<string>();
      let turned = 0, going = true, t = 0;
      for (; t < 20 && going; t += 1 / 60) {
        const y0 = m.yaw;
        going = act.update(1 / 60, c);
        m.update(1 / 60);
        turned += Math.abs(Math.atan2(Math.sin(m.yaw - y0), Math.cos(m.yaw - y0)));
        phases.add(act.phase);
      }
      expect([...phases]).toEqual(['see', 'spin', 'catch', 'after']);
      expect(turned / (Math.PI * 2)).toBeGreaterThan(1.5);
      expect(going).toBe(false);
      // (more or less facing you at the end)
      expect(Math.abs(Math.atan2(Math.sin(m.yaw), Math.cos(m.yaw)))).toBeLessThan(0.8);
      vi.restoreAllMocks();
    }
  });
});
