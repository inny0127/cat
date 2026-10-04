import { describe, it, expect } from 'vitest';
import { Firsts, FIRSTS } from '../src/ui/firsts';

/** the line at the foot of the screen, as the first words see it: up for as long as asked */
const line = () => {
  const L = {
    text: '', left: 0, shown: [] as string[],
    get visible() { return this.left > 0; },
    show(text: string, ms = 5200) { this.text = text; this.left = ms / 1000; this.shown.push(text); },
    tick(dt: number) { this.left = Math.max(0, this.left - dt); if (!this.left) this.text = ''; },
  };
  return L;
};

const run = (f: Firsts, L: ReturnType<typeof line>, secs: number, seen: string[] = [], ok = true) => {
  for (let t = 0; t < secs; t += 0.1) { f.update(0.1, new Set(seen), ok); L.tick(0.1); }
};

describe('a word the first time', () => {
  it('nothing in the first half minute; then a word on it, once, and a good while before the next', () => {
    const said: Record<string, number> = {}, L = line();
    const f = new Firsts(() => said, L);
    run(f, L, 25, ['purr']);
    expect(L.shown).toEqual([]);
    run(f, L, 6, ['purr']);
    expect(L.shown).toEqual([FIRSTS.purr]);
    expect(said['first purr']).toBe(1);
    // (purring again, and a slow blink, inside the minute and a half: nothing)
    run(f, L, 80, ['purr', 'blink']);
    expect(L.shown.length).toBe(1);
    run(f, L, 15, ['purr', 'blink']);
    expect(L.shown).toEqual([FIRSTS.purr, FIRSTS.blink]);
    // (and never again, either of them)
    run(f, L, 400, ['purr', 'blink']);
    expect(L.shown.length).toBe(2);
  });

  it('the most telling of what it is doing first', () => {
    const said: Record<string, number> = {}, L = line();
    const f = new Firsts(() => said, L);
    run(f, L, 31, ['loaf', 'tilt', 'blink']);
    expect(L.shown).toEqual([FIRSTS.blink]);
  });

  it('not over something else being said, nor with nobody there to see it', () => {
    const said: Record<string, number> = {}, L = line();
    const f = new Firsts(() => said, L);
    L.show('밥을 주세요', 60000);
    run(f, L, 40, ['knead']);
    expect(L.shown).toEqual(['밥을 주세요']);
    L.tick(100);
    run(f, L, 5, ['knead'], false);
    expect(L.shown.length).toBe(1);
    run(f, L, 1, ['knead']);
    expect(L.shown[1]).toBe(FIRSTS.knead);
  });

  it('said over at once by something that mattered more: as if not said, and said the next time', () => {
    const said: Record<string, number> = {}, L = line();
    const f = new Firsts(() => said, L);
    run(f, L, 31, ['back']);
    expect(L.shown).toEqual([FIRSTS.back]);
    L.show('고양이가 아파요', 6000);
    run(f, L, 1);
    expect(said['first back']).toBeUndefined();
    run(f, L, 30, ['back']);
    expect(L.shown).toEqual([FIRSTS.back, '고양이가 아파요', FIRSTS.back]);
    expect(said['first back']).toBe(1);
  });

  it('kept with the saved hints: a word said before the app was last closed is not said again', () => {
    const said: Record<string, number> = { 'first flop': 1 }, L = line();
    const f = new Firsts(() => said, L);
    run(f, L, 200, ['flop']);
    expect(L.shown).toEqual([]);
  });

  it('every word short enough for two lines on a phone', () => {
    for (const k in FIRSTS) expect([...FIRSTS[k]].length).toBeLessThanOrEqual(36);
  });
});
