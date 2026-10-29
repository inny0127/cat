import { describe, it, expect, beforeEach } from 'vitest';
import { loadPhotos, savePhotos, dayOf, daysTogether, KEEP_PHOTOS, type Photo } from '../src/ui/photos';

/** a browser's storage, as much of it as is used, with room for so many characters */
function storage(room = Infinity) {
  const m = new Map<string, string>();
  const s = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > room) throw new Error('QuotaExceededError');
      m.set(k, v);
    },
    removeItem: (k: string) => { m.delete(k); },
  };
  (globalThis as unknown as { localStorage: typeof s }).localStorage = s;
  return m;
}

const photo = (i: number, size = 100): Photo => ({ k: `k${i}`, text: `t${i}`, at: 1_700_000_000_000 + i, url: 'data:image/png;base64,' + 'A'.repeat(size) });

describe('the photographs, kept', () => {
  beforeEach(() => { storage(); });

  it('kept and found again, oldest first', () => {
    savePhotos([photo(1), photo(2), photo(3)]);
    expect(loadPhotos().map((p) => p.k)).toEqual(['k1', 'k2', 'k3']);
  });

  it('only so many: the oldest let go', () => {
    const list = Array.from({ length: KEEP_PHOTOS + 5 }, (_, i) => photo(i));
    savePhotos(list);
    const back = loadPhotos();
    expect(back.length).toBe(KEEP_PHOTOS);
    expect(back[0].k).toBe('k5');
    expect(back.at(-1)!.k).toBe(`k${KEEP_PHOTOS + 4}`);
  });

  it('no room for them all: the oldest go until there is, and the newest is kept', () => {
    storage(2000);
    const list = Array.from({ length: 10 }, (_, i) => photo(i, 300));
    savePhotos(list);
    const back = loadPhotos();
    expect(back.length).toBeGreaterThan(0);
    expect(back.length).toBeLessThan(10);
    expect(back.at(-1)!.k).toBe('k9');
  });

  it('nothing kept, or something spoilt there: none, and no trouble', () => {
    expect(loadPhotos()).toEqual([]);
    localStorage.setItem('cat-window.photos', '{not json');
    expect(loadPhotos()).toEqual([]);
    localStorage.setItem('cat-window.photos', JSON.stringify([{ k: 'a' }, photo(1)]));
    expect(loadPhotos().map((p) => p.k)).toEqual(['k1']);
  });
});

describe('the day on a print', () => {
  it('the month and day; the year too, if it was another year', () => {
    const now = new Date(2026, 9, 29).getTime();
    expect(dayOf(new Date(2026, 2, 5, 14).getTime(), now)).toBe('3월 5일');
    expect(dayOf(new Date(2025, 11, 31, 23).getTime(), now)).toBe('2025년 12월 31일');
  });
});

describe('which day together', () => {
  it('the day it came is the first; by the calendar, not by hours', () => {
    const born = new Date(2026, 9, 27, 23, 30).getTime();
    expect(daysTogether(born, new Date(2026, 9, 27, 23, 50).getTime())).toBe(1);
    expect(daysTogether(born, new Date(2026, 9, 28, 0, 10).getTime())).toBe(2);
    expect(daysTogether(born, new Date(2026, 10, 27, 12).getTime())).toBe(32);
  });
});
