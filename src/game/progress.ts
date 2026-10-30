import { CATALOG, DEFAULT_WORN, type Slot } from './shop';

/**
 * The game round the cat: the affection you win with it (its level, which opens new things in the
 * shop), the coins (냥) that come with it and with the day's missions, the days in a row you have
 * come, and what has been bought and what is on show. Plain data, kept on the device.
 */
export interface Game {
  v: 1;
  /** coins to spend */
  coins: number;
  /** all the affection ever won (hearts) */
  love: number;
  /** the last day you came ('2026-10-30') */
  day: string;
  /** days in a row, that one included */
  streak: number;
  /** today's missions */
  missions: Mission[];
  /** what has been bought (item ids) */
  owned: string[];
  /** what is on show in each place (null: nothing) */
  worn: Record<Slot, string | null>;
  /** how much of each thing has been done, ever */
  totals: Partial<Record<Kind, number>>;
}

/** the things done with the cat that count */
export type Kind = 'pet' | 'purr' | 'treat' | 'play' | 'feed' | 'water' | 'litter' | 'blink' | 'bubble' | 'nip';

export interface Mission {
  kind: Kind;
  need: number;
  got: number;
  reward: number;
  claimed: boolean;
}

/** each kind of mission: what it says (n: how many), how many it may ask for, and the coins for
 *  it (the more asked, the more) */
export const MISSIONS: Record<Kind, { say: (n: number) => string; need: [number, number]; step: number; reward: [number, number] }> = {
  pet: { say: (n) => `좋아하는 곳 쓰다듬기 ${n}초`, need: [30, 60], step: 10, reward: [30, 50] },
  purr: { say: (n) => `골골송 ${n}초 듣기`, need: [20, 40], step: 10, reward: [30, 50] },
  treat: { say: (n) => `간식 ${n}개 주기`, need: [2, 4], step: 1, reward: [25, 45] },
  play: { say: (n) => `같이 놀기 ${n}초`, need: [30, 90], step: 15, reward: [35, 60] },
  feed: { say: () => '밥그릇 채워 주기', need: [1, 1], step: 1, reward: [20, 20] },
  water: { say: () => '물그릇 채워 주기', need: [1, 1], step: 1, reward: [20, 20] },
  litter: { say: () => '화장실 모래 치우기', need: [1, 1], step: 1, reward: [20, 20] },
  blink: { say: () => '눈 키스 받기 (천천히 깜빡임)', need: [1, 1], step: 1, reward: [50, 50] },
  bubble: { say: (n) => `비눗방울 ${n}개 잡게 하기`, need: [3, 6], step: 1, reward: [30, 45] },
  nip: { say: () => '캣닢 주기', need: [1, 1], step: 1, reward: [25, 25] },
};

/** how much affection the next level asks, from this one */
export const loveFor = (level: number) => 20 + 15 * (level - 1);

/** the level a total of affection is, and how far into it */
export function levelOf(love: number) {
  let level = 1, left = Math.max(0, love);
  while (left >= loveFor(level)) {
    left -= loveFor(level);
    level++;
  }
  return { level, into: left, need: loveFor(level) };
}

/** the coins a new level brings */
export const levelCoins = (level: number) => 30 + 20 * level;

/** the coins for coming, the n-th day in a row (a week round, the seventh the best) */
export const CHECKIN = [20, 30, 40, 50, 60, 80, 150];
export const checkinCoins = (streak: number) => CHECKIN[(Math.max(1, streak) - 1) % CHECKIN.length];

/** a day as it is kept */
export const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function newGame(): Game {
  return {
    v: 1, coins: 0, love: 0, day: '', streak: 0, missions: [],
    owned: CATALOG.filter((i) => i.price === 0).map((i) => i.id), worn: { ...DEFAULT_WORN }, totals: {},
  };
}

const KEY = 'cat-window.game';

export function loadGame(): Game {
  const g = newGame();
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (s && s.v === 1) {
      return {
        ...g, ...s,
        owned: [...new Set([...g.owned, ...(Array.isArray(s.owned) ? s.owned : [])])],
        worn: { ...g.worn, ...(s.worn ?? {}) },
        missions: Array.isArray(s.missions) ? s.missions.filter((m: Mission) => m && MISSIONS[m.kind]) : [],
        totals: s.totals ?? {},
      };
    }
  } catch {
    /* private mode, or spoilt: a new one */
  }
  return g;
}

export function saveGame(g: Game) {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    /* no room, or not allowed: kept for this visit only */
  }
}

/** three missions for a day, each of its own kind (rnd: 0 .. 1) */
export function rollMissions(rnd = Math.random): Mission[] {
  const kinds = Object.keys(MISSIONS) as Kind[];
  const out: Mission[] = [];
  while (out.length < 3) {
    const k = kinds[Math.floor(rnd() * kinds.length)];
    if (out.some((m) => m.kind === k)) continue;
    const M = MISSIONS[k];
    const steps = Math.round((M.need[1] - M.need[0]) / M.step);
    const i = Math.floor(rnd() * (steps + 1));
    const need = M.need[0] + i * M.step;
    const reward = Math.round(M.reward[0] + (steps ? i / steps : 0) * (M.reward[1] - M.reward[0]));
    out.push({ kind: k, need, got: 0, reward, claimed: false });
  }
  return out;
}

/**
 * You came (now: ms). The first time today: the days in a row counted on (or begun again, if a day
 * was missed), today's missions, and the coins for coming. null: you have been today already.
 */
export function visit(g: Game, now: number, rnd = Math.random) {
  const today = dayKey(now);
  if (g.day === today) return null;
  const yesterday = dayKey(new Date(now).setDate(new Date(now).getDate() - 1));
  g.streak = g.day === yesterday ? g.streak + 1 : 1;
  g.day = today;
  g.missions = rollMissions(rnd);
  const coins = checkinCoins(g.streak);
  g.coins += coins;
  return { streak: g.streak, coins };
}

/** affection won: the levels it brings, each with its coins (added) */
export function addLove(g: Game, n: number) {
  const before = levelOf(g.love).level;
  g.love += n;
  const after = levelOf(g.love).level;
  const ups: { level: number; coins: number }[] = [];
  for (let l = before + 1; l <= after; l++) {
    const coins = levelCoins(l);
    g.coins += coins;
    ups.push({ level: l, coins });
  }
  return ups;
}

/** something done (how much of it): the missions it finishes now */
export function did(g: Game, kind: Kind, n = 1) {
  g.totals[kind] = (g.totals[kind] ?? 0) + n;
  const done: Mission[] = [];
  for (const m of g.missions) {
    if (m.kind !== kind || m.got >= m.need) continue;
    m.got = Math.min(m.need, m.got + n);
    if (m.got >= m.need) done.push(m);
  }
  return done;
}

/** a finished mission's coins taken (0: not finished, or taken already) */
export function claim(g: Game, m: Mission) {
  if (m.claimed || m.got < m.need) return 0;
  m.claimed = true;
  g.coins += m.reward;
  return m.reward;
}

/** missions finished and not yet claimed */
export const unclaimed = (g: Game) => g.missions.filter((m) => m.got >= m.need && !m.claimed).length;

/** bought (false: not enough coins, not yet open at this level, or had already) */
export function buy(g: Game, id: string) {
  const it = CATALOG.find((i) => i.id === id);
  if (!it || g.owned.includes(id) || g.coins < it.price || levelOf(g.love).level < it.lv) return false;
  g.coins -= it.price;
  g.owned.push(id);
  return true;
}

/** put on show (a thing had), or taken off (an accessory worn already) */
export function wear(g: Game, id: string) {
  const it = CATALOG.find((i) => i.id === id);
  if (!it || !g.owned.includes(id)) return false;
  if (g.worn[it.slot] === id && it.optional) g.worn[it.slot] = null;
  else g.worn[it.slot] = id;
  return true;
}
