import { describe, it, expect } from 'vitest';
import { Motor } from '../src/cat3d/motor';

/** a lick of its own nose, frame by frame: how far the tongue is out and how far curled up */
function lick(n: number, from: 'sit' | 'loaf' = 'sit') {
  const m = new Motor();
  m.snap(from);
  for (let i = 0; i < 30; i++) m.update(1 / 60);
  m.noseLick(n);
  const f: { t: number; tongue: number; up: number; jaw: number; on: boolean }[] = [];
  for (let t = 0; t < 1.2; t += 1 / 60) {
    m.update(1 / 60);
    f.push({ t, tongue: m.pose.tongue, up: m.pose.tongueUp, jaw: m.pose.jaw, on: m.noseLicking });
  }
  return { f, m };
}
/** how many times the tongue comes out past `by` and goes back in */
const flicks = (xs: number[], by: number) => {
  let n = 0, out = false;
  for (const x of xs) {
    if (!out && x > by) { n++; out = true; } else if (out && x < by * 0.5) out = false;
  }
  return n;
};

describe('a lick of its own nose', () => {
  it('the tongue out and curled up over the nose, quick, the mouth hardly open, and in again', () => {
    const { f, m } = lick(1);
    const top = f.reduce((a, b) => (b.tongue > a.tongue ? b : a));
    expect(top.tongue).toBeGreaterThan(0.7);
    // (the tip up, at the nose, not down as in lapping)
    expect(top.up).toBeGreaterThan(1.5);
    expect(Math.max(...f.map((x) => x.jaw))).toBeLessThan(0.15);
    // (a quarter of a second or so, and over)
    expect(f.filter((x) => x.on).length / 60).toBeLessThan(0.35);
    expect(f.at(-1)!.tongue).toBeLessThan(0.05);
    expect(m.licking).toBe(false);
  });

  it('twice over, two flicks of the tongue', () => {
    const { f } = lick(2, 'loaf');
    expect(flicks(f.map((x) => x.tongue), 0.6)).toBe(2);
  });

  it('not in the middle of licking something else', () => {
    const m = new Motor();
    m.snap('sit');
    m.lick(3, false);
    m.update(1 / 60);
    m.noseLick(1);
    expect(m.noseLicking).toBe(false);
  });
});
