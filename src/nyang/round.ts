import type { Kind } from './props';
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
    id: 'afternoon', name: '나른한 오후', blurb: '집사가 장 보러 갔어요. 60초 안에 거실을 엉망으로!', hour: 14, time: 60, stars: [1200, 2600, 4000],
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
    id: 'evening', name: '노을 지는 저녁', blurb: '저녁 약속이 생겼대요. 75초, 이번엔 더 많이!', hour: 18.3, time: 75, stars: [2200, 4400, 6600],
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
    id: 'night', name: '한밤의 대소동', blurb: '집사가 늦게 온대요. 불 켜진 거실, 90초 동안 마음껏!', hour: 22.5, time: 90, stars: [3000, 6000, 9000],
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
];

/** how much a run of quick knocks is worth: each within this long of the one before, a step up */
export const COMBO_GAP = 2.6;
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
    this.combo = this.t - this.last <= COMBO_GAP ? this.combo + 1 : 1;
    this.best = Math.max(this.best, this.combo);
    this.last = this.t;
    this.downs++;
    if (broke) this.breaks++;
    const got = Math.round((pts * (broke ? 1.5 : 1) * comboMul(this.combo)) / 10) * 10;
    this.score += got;
    return got;
  }

  /** stars won (0 .. 3) */
  get stars() {
    return this.level.stars.filter((s) => this.score >= s).length;
  }

  /** the combo still going (it lapses after the gap) */
  get comboLive() {
    return this.t - this.last <= COMBO_GAP ? this.combo : 0;
  }
}

/** what is kept between rounds: the best score and stars for each room, the coins (냥), and the
 *  cat's wardrobe */
export interface Save extends Wardrobe { best: Record<string, number>; stars: Record<string, number>; coins: number }
const KEY = 'nyang.save';
export function loadSave(): Save {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && typeof s === 'object') {
      return {
        best: s.best ?? {}, stars: s.stars ?? {}, coins: s.coins ?? 0,
        owned: Array.isArray(s.owned) ? s.owned : [], coat: s.coat ?? 'coat-ginger', neck: s.neck ?? null, head: s.head ?? null,
      };
    }
  } catch { /* none */ }
  return { best: {}, stars: {}, coins: 0, owned: [], coat: 'coat-ginger', neck: null, head: null };
}
export function saveSave(s: Save) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* kept this visit only */ }
}
/** a room open to play: the first, and each after one with a star won in the one before */
export const unlocked = (s: Save, i: number) => i === 0 || (s.stars[LEVELS[i - 1].id] ?? 0) >= 1;
