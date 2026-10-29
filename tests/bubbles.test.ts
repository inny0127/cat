import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Bubbles } from '../src/pixel/bubbles';
import { Motor } from '../src/cat3d/motor';
import { BubbleHunt, type Lure } from '../src/pixel/tease';
import type { Ctx } from '../src/pixel/behave';

const ROOM = { minX: -1, maxX: 1, minZ: -0.6, maxZ: 0.8 };

function seeded<T>(seed: number, f: () => T): T {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  try { return f(); } finally { Math.random = rnd; }
}

describe('soap bubbles', () => {
  it('blown in from your side, they drift on into the room, slowing, and sink slowly; none lasts much past a quarter of a minute', () => {
    seeded(3, () => {
      const B = new Bubbles();
      const pops: string[] = [];
      B.onPop = (_b, why) => pops.push(why);
      B.blow(new THREE.Vector3(0, 0.45, 0.75), new THREE.Vector3(0, 0.3, 0), 8);
      const z0 = 0.75;
      let t = 0, deepest = 0;
      const heights: number[] = [];
      for (; t < 30 && B.list.length; t += 1 / 30) {
        B.step(1 / 30, ROOM);
        for (const b of B.whole) { deepest = Math.max(deepest, z0 - b.p.z); heights.push(b.p.y); }
      }
      expect(B.list.length).toBe(0);
      expect(pops.length).toBe(8);
      // (well into the room, not stuck at the glass; and drifting down, not dropping like stones)
      expect(deepest).toBeGreaterThan(0.25);
      expect(Math.max(...heights)).toBeLessThan(0.75);
      expect(heights.filter((h) => h > 0.2).length / heights.length).toBeGreaterThan(0.5);
    });
  });

  it('one that comes down to the floor pops there', () => {
    const B = new Bubbles();
    let why = '';
    B.onPop = (_b, w) => { why = w; };
    B.list.push({ p: new THREE.Vector3(0, 0.03, 0), v: new THREE.Vector3(0, -0.2, 0), r: 0.012, age: 0, life: 99, pop: -1, seed: 1 });
    for (let i = 0; i < 30; i++) B.step(1 / 30, ROOM);
    expect(why).toBe('floor');
  });

  it('the nearest whole one is the one to go after', () => {
    const B = new Bubbles();
    B.list.push({ p: new THREE.Vector3(0.5, 0.3, 0), v: new THREE.Vector3(), r: 0.01, age: 1, life: 9, pop: -1, seed: 1 });
    B.list.push({ p: new THREE.Vector3(0.1, 0.3, 0), v: new THREE.Vector3(), r: 0.01, age: 1, life: 9, pop: 0.05, seed: 2 });
    B.list.push({ p: new THREE.Vector3(0.2, 0.3, 0), v: new THREE.Vector3(), r: 0.01, age: 1, life: 9, pop: -1, seed: 3 });
    expect(B.nearest(new THREE.Vector3(0, 0, 0))!.p.x).toBe(0.2);
  });
});

describe('after the bubbles', () => {
  it('up after one in the air within reach; all gone, a look about for them, and done', () => {
    seeded(5, () => {
      const m = new Motor();
      m.snap('stand');
      let L: Lure | null = { p: new THREE.Vector3(0, 0.38, 0.2), v: new THREE.Vector3(0.02, 0, 0), held: true, pinned: false };
      const c = new Proxy({
        m, bubble: () => L, popBubble: () => { L = null; }, gaze: () => null, seen: () => null, viewer: () => new THREE.Vector3(0, 1.4, 3),
        keepClear: (p: THREE.Vector3) => p, sound: () => {},
      } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => null) }) as unknown as Ctx;
      const act = new BubbleHunt();
      const phases = new Set<string>();
      let t = 0, going = true, popped = -1;
      for (; t < 30 && going; t += 1 / 30) {
        going = act.update(1 / 30, c);
        m.update(1 / 30);
        phases.add(act.phase);
        // (the bubble popped by a paw, or on its own after a while)
        if (!L && popped < 0) popped = t;
        if (t > 6 && L) L = null;
      }
      expect(phases.has('rear') || phases.has('swat') || phases.has('leap')).toBe(true);
      expect(phases.has('gone')).toBe(true);
      expect(going).toBe(false);
      expect(t - popped).toBeLessThan(6);
    });
  });
});
