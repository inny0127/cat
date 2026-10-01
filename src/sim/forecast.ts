import type { CatState } from './state';
import { stepLife, THRESH } from './life';

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export interface Planned {
  at: number;
  title: string;
  body: string;
  kind: 'call' | 'food' | 'water' | 'litter' | 'sick' | 'critical';
}

const TITLE = '창가의 고양이';
const TEXT: Record<Planned['kind'], string[]> = {
  call: [
    '냐아— 고양이가 창가에서 당신을 기다려요.',
    '고양이가 자꾸 화면 쪽을 바라봐요.',
    '고양이가 쓰다듬어 달라는 듯 작게 울어요.',
    '고양이가 창에 몸을 비비고 있어요.',
  ],
  food: ['밥그릇이 비었어요. 고양이가 당신을 부르고 있어요.', '고양이가 빈 밥그릇 앞에 앉아 있어요.'],
  water: ['물그릇이 말랐어요.', '고양이가 마른 물그릇을 핥고 있어요.'],
  litter: ['화장실이 더러워서 고양이가 불편해해요.'],
  sick: ['고양이가 기운이 없어요… 밥과 물이 필요해요.'],
  critical: ['고양이가 많이 아파요. 지금 와 주세요.'],
};

const quiet = (t: number) => {
  const h = new Date(t).getHours();
  return h >= 23 || h < 8;
};
const morning = (t: number) => {
  const d = new Date(t);
  if (d.getHours() >= 23) d.setDate(d.getDate() + 1);
  d.setHours(8, 5 + Math.floor(Math.random() * 20), 0, 0);
  return d.getTime();
};

/** Look ahead at what the cat will need if nobody comes, and when it will ask. */
export function forecast(state: CatState, now: number): Planned[] {
  if (!state.alive) return [];
  const s: CatState = JSON.parse(JSON.stringify(state));
  s.lastTick = now;
  const out: Planned[] = [];
  const seen = new Set<string>();
  const STEP = 15 * 60_000;
  let lastCall = 0;
  for (let t = now + STEP; t < now + 96 * 3600_000; t += STEP) {
    stepLife(s, STEP, true);
    if (!s.alive) break;
    const add = (kind: Planned['kind'], urgent = false) => {
      let at = t + 5 * 60_000;
      if (!urgent && quiet(at)) at = morning(at);
      out.push({ at, kind, title: TITLE, body: pick(TEXT[kind]) });
    };
    if (!seen.has('food') && s.hunger > THRESH.askFood && s.food < 0.05) { seen.add('food'); add('food'); }
    if (!seen.has('water') && s.thirst > THRESH.askWater && s.water < 0.05) { seen.add('water'); add('water'); }
    if (!seen.has('litter') && s.litter > THRESH.litterDirty + 0.1) { seen.add('litter'); add('litter'); }
    if (!seen.has('sick') && s.health < THRESH.sick) { seen.add('sick'); add('sick', true); }
    if (!seen.has('critical') && s.health < 0.22) { seen.add('critical'); add('critical', true); }
    // a trusting cat that is left alone calls for you, twice a day at most
    if (s.trust > 0.25 && s.lonely > 0.75 && t - lastCall > 9 * 3600_000 && s.health > THRESH.sick) {
      lastCall = t;
      s.lonely = 0.45; // it gives up for a while
      add('call');
    }
  }
  // keep them apart and few
  out.sort((a, b) => a.at - b.at);
  const kept: Planned[] = [];
  for (const p of out) {
    if (kept.length && p.at - kept[kept.length - 1].at < 80 * 60_000 && p.kind !== 'critical') continue;
    kept.push(p);
    if (kept.length >= 6) break;
  }
  return kept;
}
