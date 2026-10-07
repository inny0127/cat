import { describe, it, expect } from 'vitest';
import { Motor } from '../src/cat3d/motor';

/** an easy cat sat a while, nothing in particular going on: its blinks of its own accord, how
 *  many a minute, how far apart (s), and how many only part way */
function blinks(minutes: number) {
  const m = new Motor();
  m.snap('sit');
  const at: number[] = [];
  let was = 0, partial = 0, most = 0;
  for (let t = 0; t < minutes * 60; t += 1 / 30) {
    m.setMood({ arousal: 0.2, sleepy: 0.2, trust: 0.5 }, true);
    m.update(1 / 30);
    if (m.blink > 0 && was === 0) at.push(t);
    if (m.blink > 0) most = Math.max(most, m.blink);
    if (m.blink === 0 && was > 0) { if (most < 0.9) partial++; most = 0; }
    was = m.blink;
  }
  const gaps = at.slice(1).map((x, i) => x - at[i]);
  return { perMinute: at.length / minutes, shortest: Math.min(...gaps), longest: Math.max(...gaps), partial: partial / Math.max(1, at.length) };
}

describe('blinking', () => {
  it('a cat blinks seldom, at no set pace, now and then only part way', () => {
    const r = blinks(20);
    expect(r.perMinute).toBeGreaterThan(1.5);
    expect(r.perMinute).toBeLessThan(6);
    // (not a metronome: some close together, some a long while apart)
    expect(r.longest).toBeGreaterThan(30);
    expect(r.shortest).toBeLessThan(8);
    expect(r.partial).toBeGreaterThan(0.15);
    expect(r.partial).toBeLessThan(0.6);
  });
});
