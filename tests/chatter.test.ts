import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';

/** how many times the cat speaks in the first ten seconds of your being back (away: seconds) */
function said(away: number, trust: number, seed: number) {
  let s = seed;
  const rnd = Math.random;
  Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  try {
    const now = Date.now();
    const st = newCat(now - 30 * 864e5);
    st.trust = trust;
    st.lonely = 0.9;
    st.personality.voice = 1;
    st.lastTick = now;
    const quiet = (own: Record<string, unknown> = {}) =>
      new Proxy(own, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
    const words: string[] = [];
    const audio = quiet({ play: (name: string) => { words.push(name); return 0.6; } });
    const b = new Brain(st, quiet() as never, audio as never, quiet() as never, quiet() as never, quiet() as never);
    b.wake(0, false, away);
    for (let t = 0; t < 10; t += 0.05) b.update(0.05, t, []);
    return words.filter((w) => /^(meow|trill|chirp)/.test(w)).length;
  } finally {
    Math.random = rnd;
  }
}

describe('back after a long day', () => {
  it('a cat fond of you has a deal to say about it; back after half an hour, a hello and no more', () => {
    let long = 0, short = 0;
    for (let k = 1; k <= 12; k++) {
      long += said(9 * 3600, 0.85, 1000 + k);
      short += said(1800, 0.85, 1000 + k);
    }
    expect(long / 12).toBeGreaterThan(2.2);
    expect(short / 12).toBeLessThan(1.5);
  });
});
