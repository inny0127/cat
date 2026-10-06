import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';

/** a cat lying down by you (or not), untouched, a while: how much it purrs */
function purrBy(trust: number, byYou: boolean) {
  let r = 9;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const now = Date.now();
  const s = newCat(now - 30 * 864e5);
  s.trust = trust;
  s.lastTick = now;
  s.hunger = 0.1;
  s.thirst = 0.1;
  const quiet = (own: object = {}) =>
    new Proxy(own as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
  const b = new Brain(s, quiet({ inRoom: true, byYouNow: byYou }) as never, quiet({ play: () => 0.5 }) as never, quiet() as never, quiet() as never, quiet({ zoneAt: () => 'back', grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }) }) as never);
  b.toAwake('rest');
  let most = 0;
  for (let t = 0; t < 20; t += 0.05) { s.lastTick += 50; b.update(0.05, t, []); most = Math.max(most, b.purr); }
  Math.random = rnd;
  return most;
}

describe('content just to be near you', () => {
  it('lying by you, very fond of you, it purrs a little, untouched; not otherwise', () => {
    expect(purrBy(0.85, true)).toBeGreaterThan(0.2);
    expect(purrBy(0.85, true)).toBeLessThan(0.4);
    expect(purrBy(0.85, false)).toBeLessThan(0.05);
    expect(purrBy(0.3, true)).toBeLessThan(0.05);
  });
});
