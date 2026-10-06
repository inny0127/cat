import { describe, it, expect } from 'vitest';
import { newCat } from '../src/sim/state';
import { note, expectation } from '../src/sim/habits';

const at = (day: number, hour: number, min = 0) => new Date(2026, 9, 1 + day, hour, min).getTime();

describe('it learns your hours', () => {
  it('a game every evening at eight: by the fourth it looks for one then, and not at noon', () => {
    const s = newCat(at(0, 7));
    expect(expectation(s, 'laser', at(0, 20, 10))).toBe(0);
    for (let d = 0; d < 4; d++) note(s, 'laser', at(d, 20, 15));
    expect(expectation(s, 'laser', at(4, 20, 10))).toBeGreaterThan(0.7);
    expect(expectation(s, 'laser', at(4, 12))).toBeLessThan(0.05);
    // (a little the hour before, as it draws near)
    expect(expectation(s, 'laser', at(4, 19, 50))).toBeGreaterThan(0.3);
    expect(expectation(s, 'wand', at(4, 20, 10))).toBe(0);
  });

  it('left off, a habit fades over the weeks', () => {
    const s = newCat(at(0, 7));
    for (let d = 0; d < 5; d++) note(s, 'pet', at(d, 9));
    const now = expectation(s, 'pet', at(5, 9));
    const later = expectation(s, 'pet', at(26, 9));
    expect(now).toBeGreaterThan(0.75);
    expect(later).toBeLessThan(0.45);
    expect(later).toBeGreaterThan(0.05);
  });
});

describe('its dinner hour', () => {
  it('a cat saved before it learnt its dinner hours learns them now, from nothing', async () => {
    const { note, expectation, newHabits } = await import('../src/sim/habits');
    const { newCat } = await import('../src/sim/state');
    const now = new Date(2026, 9, 6, 19, 0).getTime();
    const s = newCat(now);
    const old = newHabits(now) as { food?: number[] };
    delete old.food;
    s.habits = old as typeof s.habits;
    expect(expectation(s, 'food', now)).toBe(0);
    for (let d = 0; d < 4; d++) note(s, 'food', now - d * 864e5);
    expect(expectation(s, 'food', now)).toBeGreaterThan(0.6);
    // (the morning, nothing)
    expect(expectation(s, 'food', new Date(2026, 9, 6, 8, 0).getTime())).toBeLessThan(0.05);
  });

  it('about its dinner hour, the bowl empty and it a little peckish: over to it to wait for you', async () => {
    const { Brain } = await import('../src/sim/brain');
    const { newCat } = await import('../src/sim/state');
    const run = (learnt: boolean) => {
      let r = 5;
      const rnd = Math.random;
      Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
      const now = Date.now();
      const s = newCat(now - 30 * 864e5);
      s.trust = 0.5;
      s.lastTick = now;
      s.food = 0;
      s.hunger = 0.32;
      if (learnt) s.habits.food![new Date(now).getHours()] = 6;
      s.habits.at = now;
      const quiet = (own: object = {}) =>
        new Proxy(own as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
      let begged = '';
      const b = new Brain(s, quiet({ inRoom: true, beg: (what: string) => { begged ||= what; return true; } }) as never, quiet({ play: () => 0.5 }) as never, quiet() as never, quiet() as never, quiet({ zoneAt: () => 'back', grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }) }) as never);
      b.toAwake('rest');
      for (let t = 0; t < 240; t += 0.05) { s.lastTick += 50; s.hunger = 0.32; b.update(0.05, t, []); }
      Math.random = rnd;
      return begged;
    };
    expect(run(true)).toBe('food');
    expect(run(false)).toBe('');
  });
});
