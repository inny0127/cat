import { clamp } from '../util/math';
import type { AwayReason, CatState } from './state';

export type LifeEventKind = 'eat' | 'drink' | 'litter' | 'accident' | 'sick' | 'died' | 'leave' | 'return';
export interface LifeEvent {
  kind: LifeEventKind;
  reason?: AwayReason;
  at: number;
}

const H = 3600_000;
const MIN = 60_000;

/** Per-hour rates. A full bowl lasts about a day; with no care at all it is sick after ~2 days and dies after ~4. */
export const RATES = {
  hungerPerH: 1 / 9,
  thirstPerH: 1 / 14,
  bladderPerH: 1 / 6.5,
  lonelyPerH: 1 / 10,
  waterEvaporatePerH: 0.018,
  starvePerH: 1 / 200,
  dehydratePerH: 1 / 150,
  filthPerH: 1 / 400,
  healPerH: 1 / 20,
};

export const THRESH = {
  eat: 0.42,
  drink: 0.38,
  askFood: 0.55,
  askWater: 0.5,
  sick: 0.55,
  litterDirty: 0.7,
  litterRefuse: 0.92,
};

/** Is the cat currently in need of something only you can provide? */
export function needs(s: CatState) {
  return {
    food: s.hunger > THRESH.askFood && s.food < 0.05,
    water: s.thirst > THRESH.askWater && s.water < 0.05,
    litter: s.litter > THRESH.litterDirty,
    sick: s.health < THRESH.sick,
  };
}

/** Night is 23:00–07:00 local time: deeper sleep, fewer errands. */
export function nightness(t: number) {
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 23 || h < 6) return 1;
  if (h >= 21) return (h - 21) / 2;
  if (h < 7) return 1 - (h - 6);
  return 0;
}

/** Cats are crepuscular: busiest around dawn and dusk. */
export function activity(t: number) {
  const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
  const bump = (c: number, w: number) => Math.exp(-((h - c) ** 2) / (2 * w * w));
  return clamp(0.25 + 0.75 * Math.max(bump(6.5, 1.3), bump(19, 1.6)));
}

function rand(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

/**
 * Advance the cat's body by `ms` of wall time. When `selfDirected` is true the cat also runs its
 * own errands (used while the window is hidden); while you watch, the brain decides when to go
 * so it can be animated.
 */
export function stepLife(s: CatState, ms: number, selfDirected: boolean): LifeEvent[] {
  const ev: LifeEvent[] = [];
  if (!s.alive) {
    s.lastTick += ms;
    return ev;
  }
  let left = ms;
  while (left > 0) {
    const dt = Math.min(left, 5 * MIN);
    left -= dt;
    s.lastTick += dt;
    const h = dt / H;
    const t = s.lastTick;
    const wasSick = s.health < THRESH.sick;

    s.hunger = clamp(s.hunger + RATES.hungerPerH * h);
    s.thirst = clamp(s.thirst + RATES.thirstPerH * h);
    s.bladder = clamp(s.bladder + RATES.bladderPerH * h);
    s.lonely = clamp(s.lonely + RATES.lonelyPerH * h * (1 - 0.5 * nightness(t)));
    s.water = clamp(s.water - RATES.waterEvaporatePerH * h);

    // body
    let dh = 0;
    if (s.hunger > 0.97) dh -= RATES.starvePerH * h;
    if (s.thirst > 0.97) dh -= RATES.dehydratePerH * h;
    if (s.hunger < 0.6 && s.thirst < 0.6) dh += RATES.healPerH * h;
    if (s.litter > THRESH.litterRefuse) dh -= RATES.filthPerH * h;
    s.health = clamp(s.health + dh);
    // neglect is noticed
    if (s.hunger > 0.9 || s.thirst > 0.9) s.trust = clamp(s.trust - 0.006 * h, -1, 1);
    if (s.litter > THRESH.litterRefuse) s.trust = clamp(s.trust - 0.002 * h, -1, 1);

    if (s.health <= 0) {
      s.alive = false;
      s.diedAt = t;
      s.where = 'bed'; // it comes back to its place by the window
      s.awayReason = null;
      ev.push({ kind: 'died', at: t });
      s.lastTick += left;
      return ev;
    }

    if (selfDirected) {
      if (s.where === 'away') {
        if (t >= s.awayUntil) {
          s.where = 'bed';
          s.awayReason = null;
          ev.push({ kind: 'return', at: t });
        }
      } else {
        // errands, most urgent first
        const errand = chooseErrand(s, t);
        if (errand) ev.push(...runErrand(s, errand, t));
      }
    }
    if (!wasSick && s.health < THRESH.sick) ev.push({ kind: 'sick', at: t });
  }
  return ev;
}

export function chooseErrand(s: CatState, t: number): AwayReason | null {
  if (s.bladder >= 1) return 'litter';
  if (s.thirst > THRESH.drink && s.water > 0.04) return 'drink';
  if (s.hunger > THRESH.eat && s.food > 0.04) return 'eat';
  // wandering about the house, mostly at dawn and dusk
  const p = 0.012 * activity(t) * (1 - s.lonely * 0.5);
  if (Math.random() < p) return 'wander';
  return null;
}

/** Leave the window for an errand; the bowls and box change straight away. */
export function runErrand(s: CatState, reason: AwayReason, t: number): LifeEvent[] {
  const ev: LifeEvent[] = [{ kind: 'leave', reason, at: t }];
  let mins = 3;
  switch (reason) {
    case 'eat': {
      const portion = Math.min(s.food, rand(0.22, 0.32));
      s.food = clamp(s.food - portion);
      s.hunger = clamp(s.hunger - portion * 2.3);
      mins = rand(4, 8);
      ev.push({ kind: 'eat', at: t });
      break;
    }
    case 'drink': {
      const sip = Math.min(s.water, rand(0.12, 0.18));
      s.water = clamp(s.water - sip);
      s.thirst = clamp(s.thirst - sip * 4);
      mins = rand(1.5, 3);
      ev.push({ kind: 'drink', at: t });
      break;
    }
    case 'litter': {
      s.bladder = 0;
      if (s.litter > THRESH.litterRefuse) {
        // the box is too dirty: it goes somewhere else, and is upset about it
        s.accidents++;
        s.trust = clamp(s.trust - 0.03, -1, 1);
        s.health = clamp(s.health - 0.01);
        ev.push({ kind: 'accident', at: t });
      } else {
        s.litter = clamp(s.litter + rand(0.18, 0.26));
        ev.push({ kind: 'litter', at: t });
      }
      mins = rand(2, 4);
      break;
    }
    case 'wander':
      mins = rand(12, 50);
      break;
    case 'sulk':
      mins = 10;
      break;
  }
  s.where = 'away';
  s.awayReason = reason;
  s.awayUntil = t + mins * MIN;
  return ev;
}

/** Fill the food bowl. Returns how much went in (0 if it was already full). */
export function addFood(s: CatState, amount = 1) {
  const before = s.food;
  s.food = clamp(s.food + amount);
  return s.food - before;
}
export function addWater(s: CatState, amount: number) {
  const before = s.water;
  s.water = clamp(s.water + amount);
  return s.water - before;
}
export function scoop(s: CatState) {
  const before = s.litter;
  s.litter = clamp(s.litter - 0.4);
  return before - s.litter;
}
