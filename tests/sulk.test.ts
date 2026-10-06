import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';

/** a cat that has had enough and bolts: how many minutes it stays away (born this long ago, ms) */
function sulkMinutes(bornAgo: number) {
  const now = Date.now();
  const s = newCat(now - bornAgo);
  s.lastTick = now;
  // (everything the brain drives does nothing, but the bolt out of the room ends at once)
  const quiet = (own: Record<string, unknown> = {}) =>
    new Proxy(own, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
  const anim = quiet({ bolt: (_d: number, go: () => void) => go() });
  const b = new Brain(s, anim as never, quiet() as never, quiet() as never, quiet() as never, quiet() as never);
  (b as unknown as { irritation: number }).irritation = 0.95;
  (b as unknown as { leave: (r: string) => void }).leave('sulk');
  expect(s.where).toBe('away');
  return (s.awayUntil - now) / 60000;
}

describe('sulking', () => {
  it('a cat you have only just met is back in a few minutes', () => {
    for (let k = 0; k < 20; k++) expect(sulkMinutes(60_000)).toBeLessThan(7);
  });
  it('one you have known a week stays away the best part of twenty', () => {
    for (let k = 0; k < 20; k++) expect(sulkMinutes(7 * 864e5)).toBeGreaterThan(14);
  });
});

describe('had enough, and off', () => {
  it('pestered till it bolts: once off, it is off (not cross again the same moment), and the scrabble of claws heard once', () => {
    let r = 5;
    const rnd = Math.random;
    Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    const now = Date.now();
    const s = newCat(now - 30 * 864e5);
    s.trust = 0.3;
    s.lastTick = now;
    const quiet = (own: Record<string, unknown> = {}) =>
      new Proxy(own, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
    // (the bolt takes its time: a second and a half across the room)
    let bolts = 0, done: (() => void) | null = null, doneAt = 0, t = 0;
    const anim = quiet({ inRoom: true, bolt: (_d: number, go: () => void) => { bolts++; done = go; doneAt = t + 1.5; } });
    const heard: string[] = [];
    const audio = quiet({ play: (n: string) => { heard.push(n); return 0.4; } });
    const b = new Brain(s, anim as never, audio as never, quiet() as never, quiet() as never, quiet({ zoneAt: () => 'tail', grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }) }) as never);
    b.toAwake('rest');
    const c = { id: 2, sx: 100, sy: 100, x0: 100, y0: 100, px: 100, py: 100, vx: 0, vy: 0, t0: 0, last: 0, onCat: true, startedOnCat: true, travel: 0, press: 0.4, maxSpeed: 0 };
    b.touchStart(c);
    const modes: string[] = [];
    for (; t < 60 && b.mode !== 'away'; t += 0.05) {
      s.lastTick += 50;
      c.vx = 400 * Math.sin(t * 6);
      if (done && t >= doneAt) { const go = done as () => void; done = null; go(); }
      b.update(0.05, t, b.mode === 'leaving' ? [] : [c]);
      if (modes[modes.length - 1] !== b.mode) modes.push(b.mode);
    }
    Math.random = rnd;
    expect(b.mode).toBe('away');
    const off = modes.indexOf('leaving');
    expect(off).toBeGreaterThan(0);
    expect(modes.slice(off)).toEqual(['leaving', 'away']);
    expect(bolts).toBe(1);
    expect(heard.filter((n) => n === 'scrabble').length).toBe(1);
  });
});
