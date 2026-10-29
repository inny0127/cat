import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { Nip, nipMeh, type Ctx, type Act } from '../src/pixel/behave';

const AT = new THREE.Vector3(0.45, 0, 0.25);
const YOU = new THREE.Vector3(0, 1.4, 3);

/** an open floor, you out in front, and a pinch of catnip on it */
function setup(seed: number) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const m = new Motor();
  m.snap('stand');
  m.pos.set(0, 0, 0);
  const said: string[] = [];
  const c = new Proxy({
    m, viewer: () => YOU.clone(), keepClear: (p: THREE.Vector3) => p, temper: { bold: 0, playful: 0, lazy: 0, curious: 0 },
    mood: { sleepy: 0.1 }, say: (k: string) => said.push(k), sound: () => {}, scatterNip: () => {},
  } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => null) }) as unknown as Ctx;
  return { m, c, said, done: () => { Math.random = rnd; } };
}

/** the act run through, frame by frame (dazed, not dashing off, unless asked) */
function run(seed: number, dash = false) {
  const { m, c, said, done } = setup(seed);
  try {
    const act = new Nip(c, AT);
    (act as unknown as { dash: boolean }).dash = dash;
    const f: { t: number; phase: string; posture: string; high: number }[] = [];
    const moments = new Set<string>();
    let t = 0, going = true;
    for (; t < 120 && going; t += 1 / 30) {
      going = act.update(1 / 30, c);
      m.update(1 / 30);
      if (m.moment) { moments.add(m.moment); m.moment = null; }
      f.push({ t, phase: act.phase, posture: m.posture, high: act.high });
    }
    act.stop(c);
    return { act, f, t, going, said, moments, m };
  } finally { done(); }
}

describe('catnip', () => {
  it('over to it, a sniff, the leaves chewed, the cheeks rubbed in it, a roll on its back in it, then dazed; over in a minute or so', () => {
    const { f, t, going, moments, m } = run(3);
    expect(going).toBe(false);
    expect(t).toBeLessThan(90);
    // (each part in its turn, none left out)
    const order = f.map((x) => x.phase).filter((p, i, a) => i === 0 || a[i - 1] !== p);
    expect(order).toEqual(['go', 'sniff', 'chew', 'rub', 'roll', 'after']);
    // (rolling, it is down on its side and back; dazed, on its chest)
    expect(f.some((x) => x.phase === 'roll' && x.posture === 'side')).toBe(true);
    expect(f.some((x) => x.phase === 'after' && x.posture === 'sphinx')).toBe(true);
    // (high as a kite at the height of it, and coming down after)
    expect(Math.max(...f.map((x) => x.high))).toBeGreaterThan(0.95);
    expect(f.filter((x) => x.phase === 'after').at(-1)!.high).toBeLessThan(0.6);
    expect(moments.has('nip')).toBe(true);
    // (where the catnip is, still)
    expect(Math.hypot(m.pos.x - AT.x, m.pos.z - AT.z)).toBeLessThan(0.35);
  });

  it('side on to you over it, so that what it does shows in its face', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { c, done } = setup(seed);
      try {
        const act = new Nip(c, AT) as unknown as { face: number };
        const view = Math.atan2(AT.x - YOU.x, AT.z - YOU.z);
        expect(Math.abs(Math.cos(act.face - view))).toBeLessThan(0.5);
      } finally { done(); }
    }
  });

  it('now and then a mad dash after it, now and then a daze', () => {
    let dash = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { c, done } = setup(seed);
      try { if (new Nip(c, AT).dash) dash++; } finally { done(); }
    }
    expect(dash).toBeGreaterThan(5);
    expect(dash).toBeLessThan(35);
  });

  it('a cry or two as it rolls, as often as not', () => {
    let cried = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) if (run(seed).said.length) cried++;
    expect(cried).toBeGreaterThanOrEqual(2);
  });

  it('a cat it does nothing for: a sniff, a look at you, and that is all', () => {
    const { m, c, done } = setup(9);
    try {
      const act: Act = nipMeh(c, AT);
      const moments = new Set<string>();
      let t = 0, going = true, sat = false;
      for (; t < 30 && going; t += 1 / 30) {
        going = act.update(1 / 30, c);
        m.update(1 / 30);
        if (m.moment) { moments.add(m.moment); m.moment = null; }
        if (m.posture === 'sit') sat = true;
      }
      expect(going).toBe(false);
      expect(t).toBeLessThan(16);
      expect(sat).toBe(true);
      expect(moments.has('nipmeh')).toBe(true);
    } finally { done(); }
  });
});
