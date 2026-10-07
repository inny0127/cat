import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { buryFood, type Ctx } from '../src/pixel/behave';

/** done eating, crouched at the bowl: the floor scraped as if to cover what is left */
function bury(seed: number) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  try {
    const m = new Motor();
    m.snap('crouch');
    const sounds: string[] = [];
    const c = { m, sound: (n: string) => sounds.push(n), viewer: () => new THREE.Vector3(0, 1.4, 3) } as unknown as Ctx;
    const act = buryFood();
    const f: { LF: { y: number; z: number; planted: number }; RF: { y: number; z: number; planted: number } }[] = [];
    let t = 0, going = true;
    for (; t < 8 && going; t += 1 / 60) {
      going = act.update(1 / 60, c);
      m.update(1 / 60);
      f.push({ LF: { ...m.pose.LF }, RF: { ...m.pose.RF } });
    }
    act.stop(c);
    for (let i = 0; i < 60; i++) m.update(1 / 60);
    return { f, t, going, sounds, m };
  } finally { Math.random = rnd; }
}

describe('burying its dinner', () => {
  it('a few scrapes with a forepaw, each one out ahead and drawn back along the floor, and over in a few seconds', () => {
    const { f, t, going, sounds, m } = bury(7);
    expect(going).toBe(false);
    expect(t).toBeLessThan(6);
    expect(sounds.filter((s) => s === 'scrabble').length).toBeGreaterThanOrEqual(3);
    // (a paw off the floor and out ahead of where it stood, and back)
    const z = f.map((x) => Math.max(x.LF.z, x.RF.z));
    expect(Math.max(...z) - Math.min(...z)).toBeGreaterThan(0.03);
    expect(Math.min(...f.map((x) => Math.min(x.LF.planted, x.RF.planted)))).toBeLessThan(0.2);
    // (and both paws on the floor again after)
    expect(m.pose.LF.planted).toBeGreaterThan(0.9);
    expect(m.pose.RF.planted).toBeGreaterThan(0.9);
  });

  it('never quite the same: how many scrapes and how long it takes', () => {
    const lens = new Set<number>();
    for (const s of [1, 2, 3, 4, 5]) lens.add(Math.round(bury(s).t * 10));
    expect(lens.size).toBeGreaterThan(2);
  });
});
