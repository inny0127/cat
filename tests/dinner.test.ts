import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';

/** the kibble rattled for a cat resting, so hungry: how soon it is off to the bowl, and how keen */
function dinner(hunger: number, seed = 7) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const now = Date.now();
  const s = newCat(now - 30 * 864e5);
  s.trust = 0.5;
  s.lastTick = now;
  s.hunger = hunger;
  s.food = 0;
  const quiet = (own: object = {}) =>
    new Proxy(own as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
  let off: { t: number; reason?: string; keen: number } | null = null;
  let t = 0;
  const anim = quiet({
    inRoom: true,
    bolt: (_d: number, _go: () => void, _calm?: boolean, reason?: string, keen = 0) => { off ??= { t, reason, keen }; },
  });
  const b = new Brain(s, anim as never, quiet({ play: () => 0.5 }) as never, quiet() as never, quiet() as never, quiet({ zoneAt: () => 'back', grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }) }) as never);
  const step = (sec: number) => { for (const end = t + sec; t < end; t += 0.05) { s.lastTick += 50; b.update(0.05, t, []); } };
  b.toAwake('rest');
  step(2);
  const at = t;
  b.kibble(0.9);
  step(8);
  Math.random = rnd;
  return off ? { after: off.t - at, reason: off.reason, keen: off.keen } : null;
}

describe('dinner', () => {
  it('a hungry cat is off to its bowl at once at the rattle of the kibble, and keen', () => {
    const d = dinner(0.9)!;
    expect(d.reason).toBe('eat');
    expect(d.keen).toBeGreaterThan(0.6);
    expect(d.after).toBeLessThan(1.2);
  });

  it('one only just peckish goes in its own time, at its own pace', () => {
    const d = dinner(0.45);
    // (it may go, or not yet; if it goes, it is not keen on it)
    if (d) expect(d.keen).toBeLessThan(0.3);
  });
});
