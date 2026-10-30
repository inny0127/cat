import { NIGHTS, type Save } from './game';
import { TOYS } from './toys';

/** what is counted across every night: the things caught (by kind), gifts, things pushed off,
 *  the nights played and the best run of catches */
export type Totals = Record<string, number>;

/** what a night ended with, for the badges that look at one night */
export interface NightEnd { stars: number; wakes: number; best: number }

/** a badge: its name, how it is earned, and whether it is */
export interface Badge { id: string; name: string; how: string; won: (t: Totals, s: Save, n?: NightEnd) => boolean }

const total = (t: Totals, k: string) => t[k] ?? 0;
export const BADGES: Badge[] = [
  { id: 'first', name: '첫 사냥', how: '무엇이든 처음 잡기', won: (t) => total(t, 'moth') + total(t, 'cricket') + total(t, 'mouse') + total(t, 'spider') > 0 },
  { id: 'moth', name: '불나방 사냥꾼', how: '나방 10마리', won: (t) => total(t, 'moth') >= 10 },
  { id: 'cricket', name: '귀뚜라미 박사', how: '귀뚜라미 25마리', won: (t) => total(t, 'cricket') >= 25 },
  { id: 'mouse', name: '쥐잡이', how: '생쥐 10마리', won: (t) => total(t, 'mouse') >= 10 },
  { id: 'spider', name: '거미줄 끊기', how: '거미 5마리', won: (t) => total(t, 'spider') >= 5 },
  { id: 'gift', name: '효묘', how: '집사에게 선물 5번', won: (t) => total(t, 'gifts') >= 5 },
  { id: 'chain5', name: '연속 사냥', how: '한 밤에 5연속', won: (t) => total(t, 'bestChain') >= 5 },
  { id: 'chain8', name: '사냥의 신', how: '한 밤에 8연속', won: (t) => total(t, 'bestChain') >= 8 },
  { id: 'quiet', name: '쉿, 완벽한 밤', how: '집사를 안 깨우고 별 3개', won: (_t, _s, n) => !!n && n.stars === 3 && n.wakes === 0 },
  { id: 'crash', name: '와장창 대마왕', how: '물건 20개 떨어뜨리기', won: (t) => total(t, 'knocked') >= 20 },
  { id: 'nights', name: '밤의 주인', how: '모든 밤에서 별 하나 이상', won: (_t, s) => NIGHTS.every((N) => (s.stars[N.id] ?? 0) >= 1) },
  { id: 'toys', name: '보물 수집가', how: '숨은 보물 8개 모두', won: (_t, s) => (s.toys?.length ?? 0) >= TOYS.length },
  { id: 'daily', name: '개근 고양이', how: '오늘의 밤 7번 (다른 날)', won: (_t, s) => Object.keys(s.best).filter((k) => k.startsWith('day-')).length >= 7 },
];

/** the night's counts added in; the badges newly won (their names), kept as won */
export function reckon(s: Save, add: Totals, end: NightEnd): string[] {
  const t = (s.totals ??= {});
  for (const [k, v] of Object.entries(add)) t[k] = (t[k] ?? 0) + v;
  t.nights = (t.nights ?? 0) + 1;
  t.bestChain = Math.max(t.bestChain ?? 0, end.best);
  const have = new Set(s.badges ?? []), fresh: string[] = [];
  for (const b of BADGES) if (!have.has(b.id) && b.won(t, s, end)) { have.add(b.id); fresh.push(b.name); }
  s.badges = [...have];
  return fresh;
}
