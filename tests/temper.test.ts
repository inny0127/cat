import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { newPersonality, loadState, newCat } from '../src/sim/state';
import { idleOptions, type Ctx } from '../src/pixel/behave';
import { NEUTRAL } from '../src/cat3d/mood';
import { Motor } from '../src/cat3d/motor';

/** a room with a ball of wool in it and little else, for a cat of a temperament */
function room(temper: { bold: number; playful: number; lazy: number; curious: number }): Ctx {
  const m = new Motor();
  m.snap('loaf');
  const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  return {
    m, mode: 'rest', mood: { ...NEUTRAL, arousal: 0.3 }, temper, home: V(0, 0), window: V(0, 0.3), night: 0, rain: 0,
    bed: () => ({ to: V(0, 0), yaw: 0 }), posts: () => [], scratcher: () => null, pompom: () => null, sun: () => V(0.4, 0.2),
    warm: () => null, yarn: () => V(0.3, 0.3), lure: () => null, mouse: () => null, finger: () => null, box: () => null,
    sill: () => null, visitor: () => null, keepClear: (p: THREE.Vector3) => p,
  } as unknown as Ctx;
}
const weight = (c: Ctx, key: string) => idleOptions(c, true, 'loaf').find((o) => o.key === key)?.w ?? 0;

describe('a cat of its own', () => {
  it('each new cat has a temperament, most near the middle, all within bounds', () => {
    let seed = 12345;
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    const all = Array.from({ length: 400 }, () => newPersonality(2));
    spy.mockRestore();
    for (const p of all) for (const k of ['bold', 'playful', 'lazy', 'curious'] as const) {
      expect(p[k]).toBeGreaterThanOrEqual(-1);
      expect(p[k]).toBeLessThanOrEqual(1);
    }
    const near = all.filter((p) => Math.abs(p.playful) < 0.5).length;
    expect(near / all.length).toBeGreaterThan(0.5);
  });

  describe('a cat from before temperaments', () => {
    beforeEach(() => {
      const store: Record<string, string> = {};
      (globalThis as unknown as { localStorage: Storage }).localStorage = {
        getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; }, clear: () => {}, key: () => null, length: 0,
      } as Storage;
    });
    it('is given one, and keeps what it had', () => {
      const old = newCat(1000);
      const p = old.personality as unknown as Record<string, unknown>;
      delete p.bold; delete p.playful; delete p.lazy; delete p.curious;
      p.voice = 0.77;
      localStorage.setItem('cat-window.v1', JSON.stringify(old));
      const s = loadState(2000);
      expect(s.personality.voice).toBe(0.77);
      expect(typeof s.personality.bold).toBe('number');
      expect(Number.isFinite(s.personality.curious)).toBe(true);
    });
  });

  it('what it might do is weighed by its temperament', () => {
    const playful = room({ bold: 0, playful: 0.9, lazy: -0.5, curious: 0 });
    const staid = room({ bold: 0, playful: -0.9, lazy: 0.8, curious: 0 });
    expect(weight(playful, 'play')).toBeGreaterThan(1.8 * weight(staid, 'play'));
    expect(weight(staid, 'sun')).toBeGreaterThan(weight(playful, 'sun') * 1.3);
    const bold = room({ bold: 0.9, playful: 0, lazy: 0, curious: 0.5 });
    const timid = room({ bold: -0.9, playful: 0, lazy: 0, curious: -0.5 });
    expect(weight(bold, 'wander')).toBeGreaterThan(1.5 * weight(timid, 'wander'));
  });
});
