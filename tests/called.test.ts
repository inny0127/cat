import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';

/** a cat awake and at its ease, and a knock on the glass: whether it comes, and what it says */
function knockAt(trust: number, seed: number, knocks = 1, gap = 5) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  try {
    const now = Date.now();
    const s = newCat(now - 30 * 864e5);
    s.trust = trust;
    s.lastTick = now;
    s.hunger = s.thirst = s.bladder = 0.1;
    const quiet = (own: object = {}) =>
      new Proxy(own as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
    const did: string[] = [];
    const anim = quiet({ inRoom: true, called: () => { did.push('comes'); return true; } });
    const audio = quiet({ play: (n: string) => { did.push('sound ' + n); return 0.5; } });
    const b = new Brain(s, anim as never, audio as never, quiet() as never, quiet() as never,
      quiet({ zoneAt: () => 'none', grainAt: () => [1, 0], headScreen: () => ({ x: 200, y: 400 }), viewW: () => 400 }) as never);
    let t = 0;
    const step = (sec: number) => { for (const end = t + sec; t < end; t += 0.05) { s.lastTick += 50; b.update(0.05, t, []); } };
    b.wake(0, false, 0);
    (b as unknown as { toAwake: (m: string, q: boolean) => void }).toAwake('rest', true);
    (b as unknown as { wantSleepIn: number }).wantSleepIn = 1e6;
    step(2);
    for (let k = 0; k < knocks; k++) { b.knock(200, 700); step(gap); }
    return did;
  } finally { Math.random = rnd; }
}

describe('a knock on the glass', () => {
  it('a cat fond of you, awake and at its ease, as often as not comes to see, with a word', () => {
    let came = 0, said = 0;
    for (const seed of [2, 7, 12, 19, 23, 31, 42, 57]) {
      const did = knockAt(0.8, seed);
      if (did.includes('comes')) {
        came++;
        if (did.some((d) => d === 'sound trill' || d === 'sound chirp')) said++;
      }
    }
    expect(came).toBeGreaterThanOrEqual(5);
    // (a quiet cat now and then says nothing)
    expect(said).toBeGreaterThanOrEqual(came - 2);
  });
  it('one that hardly knows you does not come', () => {
    for (const seed of [2, 7, 12, 19]) expect(knockAt(0.1, seed)).not.toContain('comes');
  });
  it('knocked again and again, it does not come every time', () => {
    for (const seed of [2, 7, 12]) expect(knockAt(0.9, seed, 4, 3).filter((d) => d === 'comes').length).toBeLessThanOrEqual(1);
  });
});

/** a chat through the glass: the cat says something, you knock back, and so on: what it says each
 *  time (and whether it slow-blinks at the end of it) */
function chat(trust: number, seed: number, knocks: number, gap = 1.6) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  try {
    const now = Date.now();
    const s = newCat(now - 30 * 864e5);
    s.trust = trust;
    s.personality.voice = 0.9;
    s.lastTick = now;
    s.hunger = s.thirst = s.bladder = 0.1;
    const quiet = (own: object = {}) =>
      new Proxy(own as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
    const said: string[] = [];
    let blinks = 0;
    // (it will not come to the glass for it: only talk)
    const anim = quiet({ inRoom: true, called: () => false, doBlink: (slow: boolean) => { if (slow) blinks++; } });
    const audio = quiet({ play: (n: string) => { said.push(n); return 0.5; } });
    const b = new Brain(s, anim as never, audio as never, quiet() as never, quiet() as never,
      quiet({ zoneAt: () => 'none', grainAt: () => [1, 0], headScreen: () => ({ x: 200, y: 400 }), viewW: () => 400 }) as never);
    let t = 0;
    const step = (sec: number) => { for (const end = t + sec; t < end; t += 0.05) { s.lastTick += 50; b.update(0.05, t, []); } };
    b.wake(0, false, 0);
    (b as unknown as { toAwake: (m: string, q: boolean) => void }).toAwake('rest', true);
    (b as unknown as { wantSleepIn: number }).wantSleepIn = 1e6;
    step(2);
    // (it says something first)
    b.say('meowSoft');
    const before = said.length;
    for (let k = 0; k < knocks; k++) { step(gap); b.knock(200, 700); }
    step(4);
    return { replies: said.slice(before), blinks };
  } finally { Math.random = rnd; }
}

describe('a chat through the glass', () => {
  it('it says something, you knock back, it answers: a few times over, then a slow blink and that will do', () => {
    let long = 0, ended = 0;
    for (const seed of [3, 9, 27, 81, 5, 15]) {
      const { replies, blinks } = chat(0.8, seed, 12);
      expect(replies.length).toBeGreaterThanOrEqual(2);
      // (not on and on for as long as you knock)
      expect(replies.length).toBeLessThanOrEqual(7);
      if (replies.length >= 4) long++;
      if (blinks > 0) ended++;
    }
    expect(long).toBeGreaterThanOrEqual(2);
    expect(ended).toBeGreaterThanOrEqual(2);
  });
  it('a cat that hardly knows you does not chat', () => {
    for (const seed of [3, 9, 27]) expect(chat(0.05, seed, 6).replies.length).toBe(0);
  });
});
