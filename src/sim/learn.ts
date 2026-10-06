import type { CatState } from './state';

/**
 * What it has come to expect of the things it takes into its head to do, with you about: each
 * done a while before something good came of it (strokes it liked, a game) is done more, each
 * before something bad (scolded, handled roughly) less, and the ones that are meant for you (come
 * to the front, asking for a game, a present) and come to nothing, less too, a little. A log of a
 * weight on how much it is in the mood for each: 0 nothing learnt, +0.7 about twice as keen, -0.7
 * about half; and when they were last faded.
 */
export interface Learned {
  v: Record<string, number>;
  at: number;
}

const DAY = 86_400_000;
/** how much of it is kept from one day to the next (a fortnight or so on, mostly forgotten) */
const KEEP = 0.93;
/** how much one time counts */
const RATE = 0.12;
const MAX = 1;
const MIN = -0.8;

export function newLearned(now: number): Learned {
  return { v: {}, at: now };
}

function fade(L: Learned, now: number) {
  const days = (now - L.at) / DAY;
  if (days < 0.01) return;
  const k = Math.pow(KEEP, days);
  for (const key of Object.keys(L.v)) {
    L.v[key] *= k;
    if (Math.abs(L.v[key]) < 0.005) delete L.v[key];
  }
  L.at = now;
}

/**
 * It did `key` a while ago (how much that has to do with it: 0 .. 1, less the longer ago), and
 * then this came of it: r, +1 a good thing .. -1 a bad one. The more it has learnt one way, the
 * less one more time moves it that way.
 */
export function learn(s: CatState, key: string, r: number, e: number, now: number) {
  const L = s.learned;
  fade(L, now);
  const v = L.v[key] ?? 0;
  const room = r > 0 ? (MAX - v) / MAX : (v - MIN) / -MIN;
  L.v[key] = Math.max(MIN, Math.min(MAX, v + RATE * r * e * Math.max(0, room)));
}

/** what it has learnt of each, as it is now (faded to now) */
export function learnt(s: CatState, key: string, now: number) {
  const L = s.learned;
  return (L.v[key] ?? 0) * Math.pow(KEEP, Math.max(0, (now - L.at) / DAY));
}

/** how much more (or less) it is in the mood for it for what it has learnt: a weight on it */
export function worth(s: CatState, key: string, now: number) {
  return Math.exp(learnt(s, key, now));
}

/** the few things it has learnt most about, and how much keener (or less keen) on each it is for
 *  it (a share: +0.45 is half as keen again) */
export function lessons(s: CatState, now: number, n = 2) {
  return Object.keys(s.learned.v)
    .map((key) => ({ key, v: learnt(s, key, now) }))
    .filter((x) => Math.abs(x.v) >= 0.15)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, n)
    .map((x) => ({ key: x.key, by: Math.exp(x.v) - 1 }));
}
