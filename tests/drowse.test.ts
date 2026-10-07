import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';
import { moodFromBrain } from '../src/cat3d/mood';

/** a cat awake at its ease, left alone till it drops off: how drowsy it is, second by second, how
 *  heavy its lids, and whether it yawned on the way */
function dropOff(seed: number) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  try {
    const now = Date.now();
    const s = newCat(now - 30 * 864e5);
    s.trust = 0.6;
    s.lastTick = now;
    s.hunger = s.thirst = s.bladder = 0.1;
    const quiet = (own: object = {}) =>
      new Proxy(own as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: (t, k, v) => { (t as Record<string, unknown>)[k as string] = v; return true; } });
    let yawns = 0;
    const anim = quiet({ inRoom: true, yawn: () => { yawns++; return true; } });
    const b = new Brain(s, anim as never, quiet() as never, quiet() as never, quiet() as never,
      quiet({ zoneAt: () => 'none', grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }), viewW: () => 400 }) as never);
    const B = b as unknown as { toAwake: (m: string, q: boolean) => void; wantSleepIn: number; mode: string; drowse: number };
    b.wake(0, false, 0);
    B.toAwake('rest', true);
    B.wantSleepIn = 150;
    const f: { t: number; mode: string; drowse: number; eye: number; sleepy: number }[] = [];
    let t = 0;
    for (; t < 600; t += 0.1) {
      s.lastTick += 100;
      b.update(0.1, t, []);
      const mood = moodFromBrain(b, 0, 0.6, 0);
      f.push({ t, mode: B.mode, drowse: B.drowse, eye: (anim as unknown as { eyeTarget: number }).eyeTarget, sleepy: mood.sleepy });
      if (B.mode === 'doze' || B.mode === 'sleep') break;
    }
    return { f, yawns };
  } finally { Math.random = rnd; }
}

// (the same afternoon every run: how soon a cat drops off goes by the hour)
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 4, 4, 15, 0, 0)); });
afterEach(() => { vi.useRealTimers(); });

describe('dropping off', () => {
  it('not switched off: drowsy a while first, the lids heavier and heavier, and then asleep', () => {
    const { f } = dropOff(5);
    const asleep = f.findIndex((x) => x.mode === 'doze' || x.mode === 'sleep');
    expect(asleep).toBeGreaterThan(0);
    const before = f.slice(0, asleep);
    // (wide awake at first; well on the way to it the last stretch before)
    expect(before[10].drowse).toBeLessThan(0.1);
    const last = before.slice(-100);
    expect(Math.min(...last.map((x) => x.drowse))).toBeGreaterThan(0.4);
    // (the lids heavier as it comes on, and the mood sleepier)
    expect(before.at(-1)!.eye).toBeLessThan(before[10].eye - 0.15);
    expect(before.at(-1)!.sleepy).toBeGreaterThan(before[10].sleepy + 0.12);
    // (and the drowsy stretch a good minute long, not a moment)
    const from = before.findIndex((x) => x.drowse > 0.3);
    expect((asleep - from) * 0.1).toBeGreaterThan(30);
  });

  it('as often as not, a yawn as it comes over it', () => {
    // (twenty naps: more than a few with a yawn on the way, and not every one)
    let yawned = 0;
    for (let s = 1; s <= 20; s++) if (dropOff(s).yawns > 0) yawned++;
    expect(yawned).toBeGreaterThanOrEqual(6);
    expect(yawned).toBeLessThanOrEqual(18);
  });
});
