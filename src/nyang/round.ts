import { KINDS, type Kind } from './props';
import { TOPS } from './tops';
import type { Wardrobe } from './closet';

/** a room to wreck: its name, the hour (its light), how long till they are home, the points for each
 *  star, and what is where (on which top, where on it) */
export interface Level {
  id: string;
  name: string;
  blurb: string;
  hour: number;
  rain?: number;
  time: number;
  stars: [number, number, number];
  props: [Kind, string, number, number][];
}

export const LEVELS: Level[] = [
  {
    id: 'afternoon', name: '나른한 오후', blurb: '집사가 장 보러 갔어요. 60초 안에 거실을 엉망으로!', hour: 14, time: 60, stars: [1400, 3000, 4600],
    props: [
      ['mug', 'coffee', -0.55, 0.2], ['plate', 'coffee', -0.4, 0.28], ['remote', 'coffee', -0.24, 0.18], ['cup', 'coffee', -0.28, 0.33],
      ['cushion', 'sofa', -0.62, -0.26], ['cushion', 'sofa', -0.22, -0.26],
      ['vase', 'dresser', -1.5, -0.4], ['book', 'dresser', -1.12, -0.38], ['jar', 'dresser', -1.06, -0.3],
      ['plant', 'shelf', -1.45, -0.52], ['clock', 'shelf', -1.2, -0.52], ['candle', 'shelf', -1.08, -0.52],
      ['plant', 'sill', 0.24, -0.5], ['glass', 'sill', 0.5, -0.48], ['plant', 'sill', 0.76, -0.5],
      ['teapot', 'table', 1.2, -0.3], ['bowl', 'table', 1.42, -0.16], ['glass', 'table', 1.08, -0.08], ['plate', 'table', 1.3, -0.45], ['mug', 'table', 1.52, -0.42],
      ['orange', 'table', 1.48, -0.05], ['book', 'stool', 1.25, 0.24],
    ],
  },
  {
    id: 'rain', name: '비 오는 오후', blurb: '우산 사러 잠깐 나갔대요. 빗소리에 묻어 70초!', hour: 15.5, rain: 1, time: 70, stars: [1300, 2900, 4400],
    props: [
      ['teapot', 'coffee', -0.5, 0.22], ['cup', 'coffee', -0.34, 0.3], ['cup', 'coffee', -0.24, 0.18], ['candle', 'coffee', -0.58, 0.34],
      ['book', 'sofa', -0.6, -0.24], ['cushion', 'sofa', -0.3, -0.28], ['remote', 'sofa', -0.15, -0.2],
      ['candle', 'sofaBack', -0.75, -0.53], ['frame', 'sofaBack', -0.5, -0.53], ['candle', 'sofaBack', -0.2, -0.53],
      ['vase', 'dresser', -1.52, -0.36], ['book', 'dresser', -1.15, -0.32], ['candle', 'dresser', -1.05, -0.5],
      ['plant', 'shelf', -1.48, -0.52], ['jar', 'shelf', -1.25, -0.52], ['clock', 'shelf', -1.08, -0.52],
      ['plant', 'sill', 0.2, -0.5], ['candle', 'sill', 0.4, -0.5], ['glass', 'sill', 0.6, -0.48], ['plant', 'sill', 0.8, -0.5],
      ['mug', 'table', 1.1, -0.4], ['mug', 'table', 1.3, -0.42], ['bowl', 'table', 1.45, -0.18], ['orange', 'table', 1.2, -0.1], ['orange', 'table', 1.55, -0.05],
      ['book', 'stool', 1.25, 0.25],
    ],
  },
  {
    id: 'evening', name: '노을 지는 저녁', blurb: '저녁 약속이 생겼대요. 75초, 이번엔 더 많이!', hour: 18.3, time: 75, stars: [1600, 3500, 5400],
    props: [
      ['cup', 'coffee', -0.58, 0.2], ['cup', 'coffee', -0.44, 0.33], ['vase', 'coffee', -0.3, 0.24], ['glass', 'coffee', -0.2, 0.16],
      ['frame', 'sofaBack', -0.7, -0.53], ['plant', 'sofaBack', -0.4, -0.53], ['frame', 'sofaBack', -0.12, -0.53],
      ['cushion', 'sofa', -0.45, -0.28],
      ['vase', 'dresser', -1.48, -0.42], ['frame', 'dresser', -1.25, -0.5], ['jar', 'dresser', -1.08, -0.34], ['mug', 'dresser', -1.3, -0.3],
      ['teapot', 'shelf', -1.42, -0.52], ['clock', 'shelf', -1.18, -0.52], ['plant', 'shelf', -1.06, -0.52],
      ['plant', 'sill', 0.22, -0.5], ['vase', 'sill', 0.42, -0.5], ['glass', 'sill', 0.6, -0.48], ['candle', 'sill', 0.8, -0.5],
      ['teapot', 'table', 1.1, -0.36], ['cup', 'table', 1.3, -0.4], ['cup', 'table', 1.5, -0.3], ['bowl', 'table', 1.25, -0.12], ['glass', 'table', 1.48, -0.08],
      ['plate', 'table', 1.06, -0.12], ['orange', 'table', 1.38, -0.04], ['orange', 'table', 1.56, -0.12],
    ],
  },
  {
    id: 'party', name: '파티 다음 날', blurb: '어젯밤 파티의 설거지가 그대로! 80초 만에 와장창', hour: 11.5, time: 80, stars: [1800, 4000, 6000],
    props: [
      ['plate', 'table', 1.05, -0.45], ['plate', 'table', 1.3, -0.48], ['plate', 'table', 1.55, -0.45], ['glass', 'table', 1.12, -0.28], ['glass', 'table', 1.42, -0.3],
      ['cup', 'table', 1.25, -0.15], ['cup', 'table', 1.55, -0.2], ['bowl', 'table', 1.05, -0.08], ['vase', 'table', 1.35, -0.05],
      ['plate', 'coffee', -0.55, 0.2], ['glass', 'coffee', -0.42, 0.33], ['mug', 'coffee', -0.3, 0.2], ['bowl', 'coffee', -0.22, 0.33],
      ['cushion', 'sofa', -0.65, -0.28], ['plate', 'sofa', -0.4, -0.22], ['glass', 'sofa', -0.15, -0.25],
      ['frame', 'sofaBack', -0.7, -0.53], ['vase', 'sofaBack', -0.3, -0.53],
      ['vase', 'dresser', -1.5, -0.38], ['cup', 'dresser', -1.2, -0.3], ['glass', 'dresser', -1.05, -0.45],
      ['teapot', 'shelf', -1.42, -0.52], ['frame', 'shelf', -1.15, -0.52],
      ['glass', 'sill', 0.25, -0.48], ['vase', 'sill', 0.5, -0.5], ['cup', 'sill', 0.75, -0.5],
      ['plate', 'stool', 1.25, 0.25],
    ],
  },
  {
    id: 'night', name: '한밤의 대소동', blurb: '집사가 늦게 온대요. 불 켜진 거실, 90초 동안 마음껏!', hour: 22.5, time: 90, stars: [3600, 7800, 12000],
    props: [
      ['mug', 'coffee', -0.58, 0.18], ['teapot', 'coffee', -0.42, 0.28], ['cup', 'coffee', -0.25, 0.2], ['candle', 'coffee', -0.22, 0.34],
      ['vase', 'sofaBack', -0.72, -0.53], ['frame', 'sofaBack', -0.45, -0.53], ['plant', 'sofaBack', -0.14, -0.53],
      ['cushion', 'sofa', -0.62, -0.26], ['cushion', 'sofa', -0.22, -0.26], ['remote', 'sofa', -0.42, -0.2],
      ['vase', 'dresser', -1.5, -0.4], ['jar', 'dresser', -1.08, -0.32], ['frame', 'dresser', -1.25, -0.52], ['book', 'dresser', -1.3, -0.3],
      ['clock', 'shelf', -1.45, -0.52], ['plant', 'shelf', -1.28, -0.52], ['mug', 'shelf', -1.1, -0.52],
      ['plant', 'sill', 0.2, -0.5], ['glass', 'sill', 0.38, -0.48], ['vase', 'sill', 0.58, -0.5], ['plant', 'sill', 0.8, -0.5],
      ['teapot', 'table', 1.12, -0.36], ['bowl', 'table', 1.35, -0.14], ['glass', 'table', 1.06, -0.1], ['plate', 'table', 1.5, -0.4],
      ['cup', 'table', 1.3, -0.44], ['mug', 'table', 1.56, -0.2], ['orange', 'table', 1.2, -0.02], ['jar', 'stool', 1.25, 0.25],
    ],
  },
  {
    id: 'dawn', name: '새벽 햇살', blurb: '집사가 새벽 운동을 나갔어요. 해 뜨는 95초 동안 전부!', hour: 6.8, time: 95, stars: [4600, 10000, 15000],
    props: [
      ['mug', 'coffee', -0.58, 0.18], ['plant', 'coffee', -0.42, 0.3], ['remote', 'coffee', -0.28, 0.2], ['orange', 'coffee', -0.2, 0.34],
      ['cushion', 'sofa', -0.65, -0.26], ['book', 'sofa', -0.4, -0.22], ['cushion', 'sofa', -0.18, -0.28],
      ['plant', 'sofaBack', -0.78, -0.53], ['vase', 'sofaBack', -0.55, -0.53], ['frame', 'sofaBack', -0.32, -0.53], ['candle', 'sofaBack', -0.1, -0.53],
      ['clock', 'dresser', -1.52, -0.34], ['jar', 'dresser', -1.2, -0.3], ['mug', 'dresser', -1.05, -0.48], ['book', 'dresser', -1.3, -0.3],
      ['vase', 'shelf', -1.48, -0.52], ['candle', 'shelf', -1.32, -0.52], ['plant', 'shelf', -1.12, -0.52],
      ['plant', 'sill', 0.18, -0.5], ['clock', 'sill', 0.36, -0.5], ['vase', 'sill', 0.54, -0.5], ['glass', 'sill', 0.7, -0.48], ['plant', 'sill', 0.84, -0.5],
      ['teapot', 'table', 1.1, -0.38], ['cup', 'table', 1.3, -0.45], ['cup', 'table', 1.5, -0.4], ['bowl', 'table', 1.3, -0.16], ['jar', 'table', 1.55, -0.12],
      ['plate', 'table', 1.06, -0.1], ['orange', 'table', 1.2, -0.03],
      ['glass', 'stool', 1.2, 0.22], ['mug', 'stool', 1.3, 0.3],
    ],
  },
];

/** the room of the day: a layout of its own for each day (the same for everyone on it), at an hour
 *  and in a weather of its own, its marks from what is in it */
export function dailyLevel(d: Date): Level {
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let seed = 0;
  for (const c of key) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const kinds = Object.keys(KINDS) as Kind[];
  const props: [Kind, string, number, number][] = [];
  const n = 20 + Math.floor(rnd() * 8);
  for (let tries = 0; props.length < n && tries < 400; tries++) {
    const T = TOPS[Math.floor(rnd() * TOPS.length)], kind = kinds[Math.floor(rnd() * kinds.length)];
    const r = KINDS[kind].r, ix = Math.min(r, (T.x1 - T.x0) / 2), iz = Math.min(r, (T.z1 - T.z0) / 2);
    const x = T.x0 + ix + rnd() * (T.x1 - T.x0 - 2 * ix), z = T.z0 + iz + rnd() * (T.z1 - T.z0 - 2 * iz);
    // (not on the lamp's foot, nor on top of another thing)
    if (T.id === 'dresser' && Math.hypot(x + 1.38, z + 0.46) < 0.1 + r) continue;
    if (props.some(([k, t, px, pz]) => t === T.id && Math.hypot(px - x, pz - z) < KINDS[k].r + r + 0.02)) continue;
    props.push([kind, T.id, +x.toFixed(3), +z.toFixed(3)]);
  }
  const worth = props.reduce((s, [k]) => s + KINDS[k].pts * (KINDS[k].fragile ? 1.5 : 1), 0);
  const mark = (f: number) => Math.round((worth * f) / 100) * 100;
  const hours = [9, 13, 16.5, 18.2, 21];
  return {
    id: `daily-${key}`, name: '오늘의 방', blurb: `${d.getMonth() + 1}월 ${d.getDate()}일의 배치. 날마다 바뀌어요!`,
    hour: hours[Math.floor(rnd() * hours.length)], rain: rnd() < 0.25 ? 1 : 0, time: 75,
    stars: [mark(0.4), mark(0.75), mark(1.05)], props,
  };
}

/** how much a run of quick knocks is worth: each within this long of the one before, a step up */
export const COMBO_GAP = 3.2;
export const comboMul = (n: number) => Math.min(4, 1 + 0.5 * Math.max(0, n - 1));

/**
 * A round: the time left, the points, the run of quick knocks (combo), what has been knocked down and
 * what broken. Plain rules, kept apart from the room.
 */
export class Round {
  t = 0;
  score = 0;
  combo = 0;
  best = 0;
  downs = 0;
  breaks = 0;
  private last = -99;
  over = false;
  /** what every knock is worth over its own, for a while (the catnip's frenzy: 2) */
  boost = 1;
  /** how long a run of knocks keeps going between them (s) */
  gap = COMBO_GAP;
  constructor(readonly level: Level) {}

  get left() {
    return Math.max(0, this.level.time - this.t);
  }

  step(dt: number) {
    if (this.over) return false;
    this.t += dt;
    if (this.t >= this.level.time) { this.over = true; return true; }
    return false;
  }

  /** a thing down (base points, whether it broke): the points it brings now */
  down(pts: number, broke: boolean) {
    if (this.over) return 0;
    this.combo = this.t - this.last <= this.gap ? this.combo + 1 : 1;
    this.best = Math.max(this.best, this.combo);
    this.last = this.t;
    this.downs++;
    if (broke) this.breaks++;
    const got = Math.round((pts * (broke ? 1.5 : 1) * comboMul(this.combo) * this.boost) / 10) * 10;
    this.score += got;
    return got;
  }

  /** stars won (0 .. 3) */
  get stars() {
    return this.level.stars.filter((s) => this.score >= s).length;
  }

  /** the combo still going (it lapses after the gap) */
  get comboLive() {
    return this.t - this.last <= this.gap ? this.combo : 0;
  }
}

/** what is kept between rounds: the best score and stars for each room, the coins (냥), and the
 *  cat's wardrobe */
export interface Save extends Wardrobe {
  best: Record<string, number>; stars: Record<string, number>; coins: number; up: Record<string, number>;
  /** the book: of each kind of thing, how many have been knocked down, and how many broken */
  book: Record<string, [number, number]>;
}
const KEY = 'nyang.save';
export function loadSave(): Save {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && typeof s === 'object') {
      return {
        best: s.best ?? {}, stars: s.stars ?? {}, coins: s.coins ?? 0,
        owned: Array.isArray(s.owned) ? s.owned : [], coat: s.coat ?? 'coat-ginger', neck: s.neck ?? null, head: s.head ?? null, up: s.up ?? {}, book: s.book ?? {},
      };
    }
  } catch { /* none */ }
  return { best: {}, stars: {}, coins: 0, owned: [], coat: 'coat-ginger', neck: null, head: null, up: {}, book: {} };
}
export function saveSave(s: Save) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* kept this visit only */ }
}
/** a room open to play: the first, and each after one with a star won in the one before */
export const unlocked = (s: Save, i: number) => i === 0 || (s.stars[LEVELS[i - 1].id] ?? 0) >= 1;
