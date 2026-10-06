import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';
import type { Contact } from '../src/input/pointer';

/** a hand kept stroking where the cat does not like it (its tail), so long: what it says, when */
function pester(seed: number, sec: number) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const now = Date.now();
  const s = newCat(now - 30 * 864e5);
  s.trust = 0.4;
  s.lastTick = now;
  const quiet = (own: object = {}) =>
    new Proxy(own as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
  const said: { t: number; what: string }[] = [];
  let t = 0;
  const audio = quiet({ play: (n: string) => { said.push({ t, what: n }); return 0.4; } });
  const b = new Brain(s, quiet({ inRoom: true }) as never, audio as never, quiet() as never, quiet() as never, quiet({ zoneAt: () => 'tail', grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }) }) as never);
  const step = (sec: number) => { for (const end = t + sec; t < end; t += 0.05) { s.lastTick += 50; b.update(0.05, t, []); } };
  b.toAwake('rest');
  step(2);
  const c: Contact = { id: 2, sx: 100, sy: 100, x0: 100, y0: 100, px: 100, py: 100, vx: 0, vy: 0, t0: t, last: t, onCat: true, startedOnCat: true, travel: 0, press: 0.4, maxSpeed: 0 };
  b.touchStart(c);
  for (const end = t + sec; t < end; t += 0.05) {
    s.lastTick += 50;
    c.sx = c.px = 100 + 30 * Math.sin(t * 3);
    c.vx = 90 * Math.cos(t * 3);
    c.last = t;
    b.update(0.05, t, [c]);
  }
  b.touchEnd(c, false);
  Math.random = rnd;
  return said.filter((x) => x.what === 'grumble' || x.what === 'hiss' || x.what === 'growl');
}

describe('a grumble before a hiss', () => {
  it('pestered where it does not like it, it grumbles first, and not over and over', () => {
    let warned = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const S = pester(seed, 25);
      const g = S.filter((x) => x.what === 'grumble');
      const firstHiss = S.find((x) => x.what === 'hiss');
      if (g.length) warned++;
      // (a grumble comes before the hiss, if it hisses at all)
      if (firstHiss && g.length) expect(g[0].t).toBeLessThan(firstHiss.t);
      // (and some seconds apart)
      for (let i = 1; i < g.length; i++) expect(g[i].t - g[i - 1].t).toBeGreaterThanOrEqual(5.9);
    }
    // (a quiet cat skips a word now and then; most say it)
    expect(warned).toBeGreaterThanOrEqual(5);
  });
});
