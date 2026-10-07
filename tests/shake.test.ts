import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { shakeOff, type Ctx } from '../src/pixel/behave';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';
import type { Contact } from '../src/input/pointer';

/** a shake from where it lies or sits: what the body does, frame by frame */
function shake(from: 'loaf' | 'sit' | 'stand') {
  const m = new Motor();
  m.snap(from);
  const c = { m, sound: () => {}, viewer: () => new THREE.Vector3(0, 1.4, 3) } as unknown as Ctx;
  const act = shakeOff();
  const f: { t: number; posture: string; head: number; chest: number; hips: number; whip: boolean; puff: number; eye: number }[] = [];
  let t = 0, going = true;
  for (; t < 8 && going; t += 1 / 60) {
    going = act.update(1 / 60, c);
    m.update(1 / 60);
    f.push({ t, posture: m.targetPosture, head: m.pose.headRoll, chest: m.pose.chestRoll, hips: m.pose.hipRoll, whip: m.whipFor > 0, puff: m.pose.puff, eye: m.pose.eyeOpen });
  }
  act.stop(c);
  return { f, t, going, m };
}
/** how many times a channel swings from one side to the other past `by` */
const swings = (xs: number[], by: number) => {
  let n = 0, side = 0;
  for (const x of xs) {
    const s = x > by ? 1 : x < -by ? -1 : 0;
    if (s && s !== side) { if (side) n++; side = s; }
  }
  return n;
};

describe('a shake from head to tail', () => {
  it('lying, it gets up first; then the head whipped side to side, the body after it, and over in a few seconds', () => {
    const { f, t, going, m } = shake('loaf');
    expect(going).toBe(false);
    expect(t).toBeLessThan(6);
    // (on its feet for it)
    expect(f.at(-1)!.posture).toBe('stand');
    const on = f.filter((x) => x.whip);
    expect(on.length).toBeGreaterThan(30);
    // (not a shake of the head before it is up)
    const first = f.findIndex((x) => Math.abs(x.head) > 0.1);
    expect(first).toBeGreaterThan(f.findIndex((x) => x.whip) - 10);
    expect(swings(f.map((x) => x.head), 0.15)).toBeGreaterThanOrEqual(6);
    expect(swings(f.map((x) => x.chest), 0.06)).toBeGreaterThanOrEqual(4);
    expect(swings(f.map((x) => x.hips), 0.04)).toBeGreaterThanOrEqual(3);
    // (the head first, the hips after it)
    const hips = f.findIndex((x) => Math.abs(x.hips) > 0.04);
    expect(hips).toBeGreaterThan(first);
    // (the eyes shut and the fur up through it, and down again after)
    expect(Math.min(...on.map((x) => x.eye))).toBeLessThan(0.5);
    expect(Math.max(...f.map((x) => x.puff))).toBeGreaterThan(0.2);
    expect(m.whipFor).toBe(0);
  });

  it('sat up, it shakes sat, the hips still on the floor', () => {
    const { f, going } = shake('sit');
    expect(going).toBe(false);
    expect(f.every((x) => x.posture === 'sit')).toBe(true);
    expect(swings(f.map((x) => x.head), 0.15)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...f.map((x) => Math.abs(x.hips)))).toBeLessThan(0.03);
  });

  it('never quite the same twice: the beat and the length of it', () => {
    const lens = new Set<number>();
    for (let i = 0; i < 5; i++) lens.add(Math.round(shake('stand').t * 20));
    expect(lens.size).toBeGreaterThan(2);
  });
});

/** a cat stroked a good while, some of it against the lie of its fur (or none), and the hand off:
 *  what the brain has it do with its coat */
function after(against: number, seed: number) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  try {
    const now = Date.now();
    const s = newCat(now - 30 * 864e5);
    s.trust = 0.8;
    s.lastTick = now;
    s.hunger = s.thirst = s.bladder = 0.1;
    const quiet = (own: object = {}) =>
      new Proxy(own as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
    const did: string[] = [];
    const anim = quiet({
      inRoom: true,
      askMore: () => false,
      shakeOff: (then: string | null) => { did.push('shakes' + (then ? ' then ' + then : '')); return true; },
      tidy: (where: string) => { did.push('tidies ' + where); return true; },
    });
    const b = new Brain(s, anim as never, quiet() as never, quiet() as never, quiet() as never,
      quiet({ zoneAt: () => 'back', grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }), viewW: () => 400 }) as never);
    let t = 0;
    const step = (sec: number, cs: Contact[] = []) => { for (const end = t + sec; t < end; t += 0.05) { s.lastTick += 50; b.update(0.05, t, cs); } };
    b.wake(0, false, 0);
    (b as unknown as { toAwake: (m: string, q: boolean) => void }).toAwake('rest', true);
    (b as unknown as { wantSleepIn: number }).wantSleepIn = 1e6;
    step(1);
    const c: Contact = { id: 2, sx: 100, sy: 100, x0: 100, y0: 100, px: 100, py: 100, vx: 120, vy: 0, t0: t, last: t, onCat: true, startedOnCat: true, travel: 0, press: 0.4, maxSpeed: 0 };
    b.touchStart(c);
    // (along its fur, and then so long against it)
    for (const [sec, vx] of [[5, 120], [against, -120]] as const) {
      for (const end = t + sec; t < end; t += 0.05) {
        s.lastTick += 50;
        c.vx = vx;
        c.sx = c.px = 100 + ((t * 120) % 80);
        c.last = t;
        b.update(0.05, t, [c]);
      }
    }
    b.touchEnd(c, false);
    step(3);
    return did;
  } finally { Math.random = rnd; }
}

describe('rubbed the wrong way', () => {
  it('the hands gone, often a shake from head to tail (now and then a lick after), never a tidy on top', () => {
    let shook = 0;
    for (const seed of [3, 14, 15, 92, 65, 35, 89, 79]) {
      const did = after(2, seed);
      if (did.some((d) => d.startsWith('shakes'))) {
        shook++;
        expect(did.filter((d) => d.startsWith('tidies'))).toEqual([]);
      }
    }
    expect(shook).toBeGreaterThanOrEqual(2);
  });
  it('stroked the right way only: no shake', () => {
    for (const seed of [3, 14, 15, 92]) expect(after(0, seed).some((d) => d.startsWith('shakes'))).toBe(false);
  });
});
