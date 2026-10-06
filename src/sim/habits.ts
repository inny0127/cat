import type { CatState } from './state';

/** what it learns to look for, by the hour: a game with the red dot, with the feathers, with the
 *  ball of wool; strokes; its dinner */
export type Habit = 'laser' | 'wand' | 'yarn' | 'pet' | 'food';
export const HABITS: readonly Habit[] = ['laser', 'wand', 'yarn', 'pet', 'food'];

/** how many times each has come at each hour of the day, lately (and when they were last faded) */
export interface Habits {
  laser: number[];
  wand: number[];
  yarn: number[];
  pet: number[];
  /** (not in a cat saved before it learnt its dinner hours) */
  food?: number[];
  at: number;
}

/** the hours of one thing (made, empty, for a cat saved before it learnt that one) */
const row = (h: Habits, kind: Habit) => (h[kind] ??= new Array<number>(24).fill(0));

const DAY = 86_400_000;
/** how much of a habit is kept from one day to the next (a few weeks on, mostly forgotten) */
const KEEP = 0.9;

export function newHabits(now: number): Habits {
  const z = () => new Array<number>(24).fill(0);
  return { laser: z(), wand: z(), yarn: z(), pet: z(), food: z(), at: now };
}

function fade(h: Habits, now: number) {
  const days = (now - h.at) / DAY;
  if (days < 0.01) return;
  const k = Math.pow(KEEP, days);
  for (const kind of HABITS) { const r = row(h, kind); for (let i = 0; i < 24; i++) r[i] *= k; }
  h.at = now;
}

/** it came, just now (epoch ms) */
export function note(s: CatState, kind: Habit, now: number) {
  const h = s.habits;
  fade(h, now);
  row(h, kind)[new Date(now).getHours()] += 1;
}

/**
 * How much it looks for it just now (0 .. 1): how often it has come at this hour of late, and a
 * little at the hours either side (the next as it draws near, the last as it goes); a few times
 * at about this hour and it is looking for it.
 */
export function expectation(s: CatState, kind: Habit, now: number) {
  const h = s.habits;
  const d = new Date(now), hr = d.getHours(), frac = d.getMinutes() / 60;
  const k = Math.pow(KEEP, Math.max(0, (now - h.at) / DAY));
  const r = row(h, kind);
  const at = (i: number) => r[(i + 24) % 24] * k;
  const x = at(hr) + 0.5 * (frac * at(hr + 1) + (1 - frac) * at(hr - 1));
  return 1 - Math.exp(-x / 2.5);
}
