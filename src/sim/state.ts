import { newHabits, type Habits } from './habits';
import { newLearned, type Learned } from './learn';

export type AwayReason = 'eat' | 'drink' | 'litter' | 'wander' | 'sulk';

export interface Personality {
  /** per-zone offsets added to the average cat's likes */
  likes: Record<string, number>;
  /** how long petting stays nice before it becomes too much (multiplier) */
  tolerance: number;
  /** how quickly trust is won (multiplier) */
  warmth: number;
  /** how vocal (meows, trills) */
  voice: number;
  coat: 'ginger' | 'cream' | 'silver' | 'smoke';
  /** its temperament, each -1 .. 1 (most cats somewhere near the middle): bold (to go up and
   *  over and into things, and not much put out by a start) or timid; playful or staid; lazy (a
   *  long lie in the sun, and slow about getting up) or busy; curious (its eyes everywhere, and off
   *  to see about anything new) or incurious */
  bold: number;
  playful: number;
  lazy: number;
  curious: number;
}

/** a temperament: most cats near the middle, now and then one well to one side */
export function temperament(): Pick<Personality, 'bold' | 'playful' | 'lazy' | 'curious'> {
  const t = () => Math.max(-1, Math.min(1, (Math.random() + Math.random() + Math.random() - 1.5) * 1.15));
  return { bold: t(), playful: t(), lazy: t(), curious: t() };
}

export interface CatState {
  v: 1;
  generation: number;
  born: number;
  lastTick: number; // simulation clock, epoch ms
  alive: boolean;
  diedAt: number | null;
  buried: boolean;
  // 0 fine .. 1 desperate
  hunger: number;
  thirst: number;
  bladder: number;
  lonely: number;
  // bowls and box
  food: number; // 0 empty .. 1 full
  water: number;
  litter: number; // 0 clean .. 1 filthy
  health: number; // 0 dead .. 1 healthy
  trust: number; // -1 fears/hates you .. 1 adores you
  where: 'bed' | 'away';
  awayReason: AwayReason | null;
  awayUntil: number;
  grudgeUntil: number; // won't come to you before this
  personality: Personality;
  lastPetAt: number;
  lastVisitAt: number;
  accidents: number;
  hints: Record<string, number>;
  notifyAsked: boolean;
  stats: { petSeconds: number; hisses: number; feeds: number; visits: number };
  /** what it has learnt to look for at what hour of the day (habits.ts) */
  habits: Habits;
  /** what it has learnt comes of the things it does of its own accord (learn.ts) */
  learned: Learned;
}

const KEY = 'cat-window.v1';

export function newPersonality(generation: number): Personality {
  const r = () => Math.random() * 2 - 1;
  const coats: Personality['coat'][] = ['ginger', 'cream', 'silver', 'smoke'];
  return {
    likes: {
      chin: r() * 0.15, cheek: r() * 0.15, head: r() * 0.2, neck: r() * 0.2,
      back: r() * 0.3, rump: r() * 0.45, flank: r() * 0.15, ear: r() * 0.2, tail: r() * 0.15,
    },
    tolerance: 0.75 + Math.random() * 0.6,
    warmth: 0.7 + Math.random() * 0.6,
    voice: 0.5 + Math.random() * 0.7,
    coat: generation === 1 ? 'ginger' : coats[Math.floor(Math.random() * coats.length)],
    ...temperament(),
  };
}

export function newCat(now: number, generation = 1): CatState {
  return {
    v: 1,
    generation,
    born: now,
    lastTick: now,
    alive: true,
    diedAt: null,
    buried: false,
    hunger: 0.25,
    thirst: 0.2,
    bladder: 0.3,
    lonely: 0.3,
    food: 0.55,
    water: 0.65,
    litter: 0.1,
    health: 1,
    trust: generation === 1 ? 0.12 : 0.0,
    where: 'bed',
    awayReason: null,
    awayUntil: 0,
    grudgeUntil: 0,
    personality: newPersonality(generation),
    lastPetAt: 0,
    lastVisitAt: now,
    accidents: 0,
    hints: {},
    notifyAsked: false,
    stats: { petSeconds: 0, hisses: 0, feeds: 0, visits: 0 },
    habits: newHabits(now),
    learned: newLearned(now),
  };
}

export function loadState(now: number): CatState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as CatState;
      // (a cat from before cats had a temperament: given one now, kept from here on)
      if (s && s.v === 1) return { ...newCat(now), ...s, personality: { ...temperament(), ...s.personality } };
    }
  } catch {
    /* private mode or corrupt: start fresh */
  }
  return newCat(now);
}

export function saveState(s: CatState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked; the cat lives on in memory */
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
