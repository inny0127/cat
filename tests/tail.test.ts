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

describe('keeping time', () => {
  it('the tip of the tail flicks to a beat and settles between', () => {
    const m = new Motor();
    m.snap('loaf');
    for (let i = 0; i < 40; i++) m.update(0.02);
    const rest = m.pose.tailCurl;
    m.beat = 1;
    m.update(0.02);
    const on = m.pose.tailCurl;
    m.beat = 0;
    m.update(0.02);
    expect(on - rest).toBeGreaterThan(0.2);
    expect(Math.abs(m.pose.tailCurl - rest)).toBeLessThan(0.05);
  });
});

describe('running in its sleep', () => {
  it('all four paws paddle a few seconds, building and dying away, and then lie still', () => {
    const m = new Motor();
    m.snap('curl');
    for (let i = 0; i < 40; i++) m.update(0.02);
    const z0 = m.pose.LF.z, h0 = m.pose.LH.z;
    m.dreamRun(2);
    let fmax = 0, hmax = 0;
    for (let t = 0; t < 2.5; t += 0.02) {
      m.update(0.02);
      fmax = Math.max(fmax, Math.abs(m.pose.LF.z - z0));
      hmax = Math.max(hmax, Math.abs(m.pose.LH.z - h0));
    }
    expect(fmax).toBeGreaterThan(0.006);
    expect(hmax).toBeGreaterThan(0.006);
    expect(m.dreamRunning).toBe(false);
    expect(Math.abs(m.pose.LF.z - z0)).toBeLessThan(0.002);
  });
});
