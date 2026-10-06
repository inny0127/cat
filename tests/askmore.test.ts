import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';
import type { Contact } from '../src/input/pointer';

/** a cat stroked a good while along its fur, and the hand taken off: what the brain has it do */
function world(trust: number, seed = 11) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const now = Date.now();
  const s = newCat(now - 30 * 864e5);
  s.trust = trust;
  s.lastTick = now;
  s.hunger = s.thirst = s.bladder = 0.1;
  const quiet = (own: object = {}) =>
    new Proxy(own as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
  const did: string[] = [];
  const anim = quiet({
    inRoom: true,
    askMore: () => { did.push('asks for more'); return true; },
    doBlink: (slow?: boolean) => { if (slow) did.push('slow blink'); },
    tidy: () => did.push('tidies'),
  });
  const audio = quiet({ play: (n: string) => { did.push('sound ' + n); return 0.5; } });
  const b = new Brain(s, anim as never, audio as never, quiet() as never, quiet() as never,
    quiet({ zoneAt: () => 'back', grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }), viewW: () => 400 }) as never);
  let t = 0;
  const step = (sec: number) => { for (const end = t + sec; t < end; t += 0.05) { s.lastTick += 50; b.update(0.05, t, []); } };
  /** a hand on it, stroking gently along its fur, so long (s) */
  const stroke = (sec: number) => {
    const c: Contact = { id: 2, sx: 100, sy: 100, x0: 100, y0: 100, px: 100, py: 100, vx: 120, vy: 0, t0: t, last: t, onCat: true, startedOnCat: true, travel: 0, press: 0.4, maxSpeed: 0 };
    b.touchStart(c);
    for (const end = t + sec; t < end; t += 0.05) {
      s.lastTick += 50;
      c.sx = c.px = 100 + ((t * 120) % 80);
      c.last = t;
      b.update(0.05, t, [c]);
    }
    b.touchEnd(c, false);
  };
  /** up and about, not sleepy */
  const awake = () => {
    b.wake(0, false, 0);
    (b as unknown as { toAwake: (m: string, q: boolean) => void }).toAwake('rest', true);
    (b as unknown as { wantSleepIn: number }).wantSleepIn = 1e6;
    step(1);
  };
  return { s, b, did, step, stroke, awake, get mode() { return b.mode; }, done: () => { Math.random = rnd; } };
}

describe('more, please', () => {
  it('a good stroke from a hand it is fond of, over too soon: it asks for more, with a word', () => {
    let asked = 0;
    for (const seed of [11, 22, 33, 44, 55]) {
      const w = world(0.8, seed);
      try {
        w.awake();
        w.stroke(6);
        expect(w.mode).toBe('enjoy');
        w.step(2.5);
        if (w.did.includes('asks for more')) {
          asked++;
          expect(w.did.some((d) => d === 'sound trill' || d === 'sound meowSoft')).toBe(true);
          expect(w.did).not.toContain('tidies');
        }
      } finally { w.done(); }
    }
    // (not every time, but a cat this fond of you, as often as not)
    expect(asked).toBeGreaterThanOrEqual(3);
  });

  it('a hand back on it soon after it asked: glad of it, the purr straight up, and a slow blink', () => {
    for (const seed of [11, 22, 33, 44, 55, 66, 77]) {
      const w = world(0.8, seed);
      try {
        w.awake();
        w.stroke(6);
        w.step(2.5);
        if (!w.did.includes('asks for more')) continue;
        const before = w.b.purr;
        w.stroke(0.3);
        expect(w.b.purr).toBeGreaterThan(Math.max(0.45, before));
        w.stroke(1.5);
        expect(w.did).toContain('slow blink');
        return;
      } finally { w.done(); }
    }
    throw new Error('it never asked');
  });

  it('a cat that hardly knows you does not ask; nor one that has had enough of it (the love bite said so)', () => {
    const w = world(0.1);
    try {
      w.awake();
      w.stroke(6);
      w.step(2.5);
      expect(w.did).not.toContain('asks for more');
    } finally { w.done(); }
    const v = world(0.8, 22);
    try {
      v.awake();
      // (stroked till it has had about enough: past most of what it will take)
      (v.b as unknown as { stim: number }).stim = 80;
      v.stroke(3);
      v.step(2.5);
      expect(v.did).not.toContain('asks for more');
    } finally { v.done(); }
  });
});
