import { describe, it, expect } from 'vitest';
import { newGame, levelOf, loveFor, addLove, levelCoins, visit, rollMissions, did, claim, unclaimed, buy, wear, checkinCoins, MISSIONS, type Kind } from '../src/game/progress';
import { CATALOG, themeRamps, DEFAULT_WORN } from '../src/game/shop';

const seq = (seed: number) => { let r = seed; return () => ((r = (r * 16807) % 2147483647) / 2147483647); };

describe('affection and its levels', () => {
  it('each level asks a little more than the last', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: loveFor(1) });
    expect(levelOf(loveFor(1) - 1).level).toBe(1);
    expect(levelOf(loveFor(1)).level).toBe(2);
    expect(levelOf(loveFor(1) + loveFor(2)).level).toBe(3);
    expect(loveFor(5)).toBeGreaterThan(loveFor(2));
  });

  it('a level won brings its coins; several at once, each its own', () => {
    const g = newGame();
    expect(addLove(g, 5)).toEqual([]);
    const ups = addLove(g, loveFor(1) + loveFor(2));
    expect(ups.map((u) => u.level)).toEqual([2, 3]);
    expect(g.coins).toBe(levelCoins(2) + levelCoins(3));
  });
});

describe('coming every day', () => {
  const at = (d: number, h = 12) => new Date(2026, 9, d, h).getTime();

  it('the first visit of a day: coins, three missions; the next the same day: nothing', () => {
    const g = newGame();
    const v = visit(g, at(10), seq(3))!;
    expect(v).toEqual({ streak: 1, coins: checkinCoins(1) });
    expect(g.missions.length).toBe(3);
    expect(visit(g, at(10, 22), seq(4))).toBeNull();
  });

  it('days in a row count on; a day missed begins again', () => {
    const g = newGame();
    visit(g, at(10));
    expect(visit(g, at(11, 1))!.streak).toBe(2);
    expect(visit(g, at(12, 23))!.streak).toBe(3);
    expect(visit(g, at(14))!.streak).toBe(1);
  });

  it('the seventh day in a row is the best, and then round again', () => {
    expect(checkinCoins(7)).toBeGreaterThan(checkinCoins(6));
    expect(checkinCoins(8)).toBe(checkinCoins(1));
  });
});

describe('missions', () => {
  it('three of three kinds, each asking for what its kind may, paid more for more', () => {
    for (let s = 1; s < 40; s++) {
      const ms = rollMissions(seq(s));
      expect(new Set(ms.map((m) => m.kind)).size).toBe(3);
      for (const m of ms) {
        const M = MISSIONS[m.kind];
        expect(m.need).toBeGreaterThanOrEqual(M.need[0]);
        expect(m.need).toBeLessThanOrEqual(M.need[1]);
        expect(m.reward).toBeGreaterThanOrEqual(M.reward[0]);
        expect(m.reward).toBeLessThanOrEqual(M.reward[1]);
        expect(M.say(m.need).length).toBeGreaterThan(3);
      }
    }
  });

  it('done bit by bit; finished once; the coins taken once', () => {
    const g = newGame();
    g.missions = [{ kind: 'treat', need: 3, got: 0, reward: 40, claimed: false }];
    expect(did(g, 'treat')).toEqual([]);
    expect(did(g, 'pet', 5)).toEqual([]);
    expect(did(g, 'treat', 2).length).toBe(1);
    expect(did(g, 'treat').length).toBe(0);
    expect(unclaimed(g)).toBe(1);
    expect(claim(g, g.missions[0])).toBe(40);
    expect(claim(g, g.missions[0])).toBe(0);
    expect(g.coins).toBe(40);
    expect(g.totals.treat).toBe(4);
  });
});

describe('the shop', () => {
  it('everything sold has a name, a place, a price, and a level it opens at; what is had at the start is free', () => {
    const ids = new Set<string>();
    for (const it of CATALOG) {
      expect(ids.has(it.id)).toBe(false);
      ids.add(it.id);
      expect(it.name.length).toBeGreaterThan(1);
      expect(it.lv).toBeGreaterThanOrEqual(1);
      if (it.ramps) for (const r of Object.values(it.ramps)) expect(r!.length).toBe(5);
    }
    for (const id of Object.values(DEFAULT_WORN)) if (id) expect(CATALOG.find((i) => i.id === id)!.price).toBe(0);
  });

  it('bought with coins enough, at the level it opens at, once', () => {
    const g = newGame();
    const it = CATALOG.find((i) => i.id === 'collar-red')!;
    g.coins = 1000;
    expect(buy(g, it.id)).toBe(false);
    addLove(g, loveFor(1));
    const coins = g.coins;
    expect(buy(g, it.id)).toBe(true);
    expect(g.coins).toBe(coins - it.price);
    expect(buy(g, it.id)).toBe(false);
    g.coins = 0;
    expect(buy(g, 'rug-rose')).toBe(false);
  });

  it('worn, and an accessory taken off again; a wall stays up', () => {
    const g = newGame();
    expect(wear(g, 'collar-red')).toBe(false);
    g.owned.push('collar-red', 'wall-mint');
    wear(g, 'collar-red');
    expect(g.worn.neck).toBe('collar-red');
    wear(g, 'collar-red');
    expect(g.worn.neck).toBeNull();
    wear(g, 'wall-mint');
    wear(g, 'wall-mint');
    expect(g.worn.wall).toBe('wall-mint');
    expect(themeRamps(g.worn).wall![2]).toBe('#5e8a80');
  });
});

describe('every kind of thing done has a mission', () => {
  it('and says what it asks in Korean', () => {
    for (const k of Object.keys(MISSIONS) as Kind[]) expect(/[가-힣]/.test(MISSIONS[k].say(3))).toBe(true);
  });
});

import { josa } from '../src/ui/hud';
describe('Korean particles', () => {
  it('fit the word before them', () => {
    expect(josa('민트 벽지', '으로')).toBe('로');
    expect(josa('분홍 러그', '으로')).toBe('로');
    expect(josa('황금 왕관', '을')).toBe('을');
    expect(josa('분홍 리본', '으로')).toBe('으로');
    expect(josa('노란 꽃', '을')).toBe('을');
    expect(josa('털실 모자', '을')).toBe('를');
    expect(josa('딸기 방석', '으로')).toBe('으로');
    expect(josa('고양이 발', '으로')).toBe('로');
  });
});
