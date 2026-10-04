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
