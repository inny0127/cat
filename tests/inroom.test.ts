import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';
import type { Contact } from '../src/input/pointer';

/** a cat whose body keeps to its room (as the pixel cat's does): what the brain has the body do */
function world(trust: number, seed = 7) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const now = Date.now();
  const s = newCat(now - 30 * 864e5);
  s.trust = trust;
  s.lastTick = now;
  const quiet = (own: object = {}) =>
    new Proxy(own as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
  const did: string[] = [];
  let done = false;
  let there: (() => void) | null = null;
  const anim = quiet({
    inRoom: true,
    get errandDone() { return done; },
    bolt: (_d: number, go: () => void, _calm?: boolean, reason?: string) => { did.push('off to ' + (reason ?? 'a corner')); there = go; },
    awayAt: (why: string) => did.push('found at ' + why),
    sulkTouched: (again: boolean) => did.push(again ? 'shrugs, and moves off' : 'shrugs'),
    sulkOver: () => did.push('turns round to you'),
    sulkHeard: () => did.push('looks back'),
    arrive: () => did.push('about the room'),
    setHidden: (h: boolean) => { if (h) did.push('HIDDEN'); },
  });
  const audio = quiet({ play: (n: string) => { did.push('sound ' + n); return 0.5; } });
  const b = new Brain(s, anim as never, audio as never, quiet() as never, quiet() as never, quiet({ zoneAt: () => 'back' }) as never);
  let t = 0;
  const step = (sec: number) => { for (const end = t + sec; t < end; t += 0.05) { s.lastTick += 50; b.update(0.05, t, []); } };
  const touch = () => {
    const c: Contact = { id: 1, sx: 100, sy: 100, x0: 100, y0: 100, px: 100, py: 100, vx: 0, vy: 0, t0: t, last: t, onCat: true, startedOnCat: true, travel: 0, press: 0.4, maxSpeed: 0 };
    b.touchStart(c);
    b.touchEnd(c, false);
  };
  return {
    s, b, did, step, touch,
    get mode() { return b.mode; },
    there: () => there?.(),
    errandDone: () => { done = true; },
    done: () => { Math.random = rnd; },
  };
}

describe('away, and in the room all the same', () => {
  it('sulking: off to a corner, never hidden; a hand on it shrugged off, and pestered, off to the other corner, sulking the longer', () => {
    const w = world(0.2);
    try {
      w.b.wake(0, false, 0);
      w.step(1);
      (w.b as unknown as { irritation: number }).irritation = 0.95;
      (w.b as unknown as { leave: (r: string) => void }).leave('sulk');
      expect(w.did).toContain('off to a corner');
      w.there();
      expect(w.mode).toBe('away');
      w.step(2);
      const until = w.s.awayUntil;
      w.touch();
      w.step(1);
      w.touch();
      expect(w.did).toContain('shrugs');
      expect(w.did).toContain('shrugs, and moves off');
      expect(w.did).toContain('sound growl');
      expect(w.s.awayUntil).toBeGreaterThan(until + 30_000);
      expect(w.mode).toBe('away');
      // (called, with a knock on the glass: it looks back, and sulks on)
      w.b.knock(100, 100);
      expect(w.did).toContain('looks back');
      expect(w.mode).toBe('away');
      // (and never made up with, a cat not yet fond of you: it sulks it out)
      w.step(200);
      w.touch();
      expect(w.did).not.toContain('turns round to you');
      expect(w.did).not.toContain('HIDDEN');
    } finally { w.done(); }
  });
  it('a cat fond of you, the worst of it over: a hand on it, and it makes it up with you there in its corner', () => {
    for (const seed of [3, 33, 333]) {
      const w = world(0.9, seed);
      try {
        w.b.wake(0, false, 0);
        w.step(1);
        (w.b as unknown as { irritation: number }).irritation = 0.95;
        (w.b as unknown as { leave: (r: string) => void }).leave('sulk');
        w.there();
        // (straight away, it will not have it)
        w.touch();
        expect(w.did).toContain('shrugs');
        w.step(70);
        for (let k = 0; k < 4 && w.mode === 'away'; k++) { w.touch(); w.step(7); }
        expect(w.did).toContain('turns round to you');
        expect(w.mode).not.toBe('away');
        expect(w.s.where).toBe('bed');
        expect(w.did).not.toContain('HIDDEN');
      } finally { w.done(); }
    }
  });
  it('the sulk worn off: about the room again, from its corner', () => {
    const w = world(0.2);
    try {
      w.b.wake(0, false, 0);
      (w.b as unknown as { irritation: number }).irritation = 0.95;
      (w.b as unknown as { leave: (r: string) => void }).leave('sulk');
      w.there();
      w.s.awayUntil = w.s.lastTick + 5000;
      w.step(6);
      expect(w.did).toContain('about the room');
      expect(w.mode).toBe('rest');
      expect(w.s.where).toBe('bed');
    } finally { w.done(); }
  });
  it('an errand: at the bowl in view, and about the room again as soon as it is done (not minutes later)', () => {
    const w = world(0.5);
    try {
      w.b.wake(0, false, 0);
      w.step(1);
      (w.b as unknown as { leave: (r: string) => void }).leave('eat');
      w.step(1.5);
      expect(w.did).toContain('off to eat');
      w.there();
      expect(w.mode).toBe('away');
      w.step(5);
      expect(w.mode).toBe('away');
      // (a hand on it at the bowl: it gets on with it)
      w.touch();
      expect(w.mode).toBe('away');
      w.errandDone();
      w.step(0.2);
      expect(w.did).toContain('about the room');
      expect(w.mode).toBe('rest');
      expect(w.did).not.toContain('HIDDEN');
    } finally { w.done(); }
  });
  it('found away as the window is opened: in the room, where it was away to', () => {
    for (const [why, stays] of [['wander', false], ['sulk', true], ['drink', true]] as const) {
      const w = world(0.5);
      try {
        w.s.where = 'away';
        w.s.awayReason = why;
        w.s.awayUntil = w.s.lastTick + 10 * 60_000;
        w.b.wake(0, false, 600);
        expect(w.did).toContain('found at ' + why);
        expect(w.mode === 'away').toBe(stays);
        if (!stays) expect(w.s.where).toBe('bed');
        expect(w.did).not.toContain('HIDDEN');
      } finally { w.done(); }
    }
  });
});
