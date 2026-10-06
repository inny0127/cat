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
