import { describe, it, expect } from 'vitest';
import { GlassFog, fogOnGlass } from '../src/pixel/glassfog';

describe('the glass misting over on your side', () => {
  it('thickest at the bottom and the edges, thinnest in the middle', () => {
    const f = new GlassFog(64, 140);
    f.level = 1;
    f.settle();
    const at = (x: number, y: number) => f.amount[Math.floor(y * 140) * 64 + Math.floor(x * 64)];
    expect(at(0.5, 0.97)).toBeGreaterThan(0.75);
    expect(at(0.02, 0.5)).toBeGreaterThan(0.6);
    expect(at(0.5, 0.42)).toBeLessThan(0.3);
  });

  it('wiped clear where a finger goes, and misting over again in a minute or so', () => {
    const f = new GlassFog(64, 140);
    f.level = 1;
    f.settle();
    const n = Math.floor(0.9 * 140) * 64 + 32;
    const before = f.amount[n];
    f.wipe(0.5, 0.9, 0.045);
    expect(f.amount[n]).toBeLessThan(0.02);
    for (let t = 0; t < 10; t += 0.1) f.update(0.1);
    expect(f.amount[n]).toBeGreaterThan(0.2 * before);
    expect(f.amount[n]).toBeLessThan(0.6 * before);
    for (let t = 0; t < 80; t += 0.1) f.update(0.1);
    expect(f.amount[n]).toBeGreaterThan(0.95 * before);
  });

  it('on a winter morning, and a wet day; not on a summer afternoon', () => {
    expect(fogOnGlass(new Date(2026, 0, 12, 7, 30))).toBeGreaterThan(0.7);
    expect(fogOnGlass(new Date(2026, 6, 12, 15, 0))).toBe(0);
    expect(fogOnGlass(new Date(2026, 6, 12, 15, 0), 0.8)).toBeGreaterThan(0.4);
    expect(fogOnGlass(new Date(2026, 0, 12, 13, 0))).toBe(0);
  });
});
