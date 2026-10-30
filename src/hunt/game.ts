import * as THREE from 'three';
import { Cat, type Intent } from './cat';
import { PREY, Prey, type PreyKind } from './prey';
import type { World } from './world';
import { THINGS, Thing } from './things';

/** what is different about a night: the cat heard less (rain on the windows) or seen further (a
 *  bright moon), their sleep lighter, a gift or a crash worth more; rain (and lightning), the moon
 *  brighter or dimmer */
export interface Mods { hear?: number; see?: number; sleepy?: number; gift?: number; knock?: number; rain?: boolean; moon?: number }

/** a night's challenge: done (at once, or only at dawn, as for not waking them) */
export interface Goal { text: string; done: (h: Hunt, dawn: boolean) => boolean }
/** what each challenge done is worth */
export const GOAL = 200;

/** a night: how long it lasts (s of play), what is out, the points for its stars, its twist and
 *  its challenges */
export interface Night {
  id: string;
  name: string;
  blurb: string;
  time: number;
  roster: Partial<Record<PreyKind, number>>;
  stars: [number, number, number];
  mods?: Mods;
  goals: Goal[];
}

const caught = (k: PreyKind, n: number, text: string): Goal => ({ text, done: (h) => h.caught[k] >= n });
const chain = (n: number): Goal => ({ text: `${n}연속 잡기`, done: (h) => h.best >= n });
const gifts = (n: number): Goal => ({ text: n > 1 ? `집사에게 생쥐 선물 ${n}번` : '집사에게 생쥐 선물하기', done: (h) => h.gifts >= n });
const knocked = (n: number): Goal => ({ text: n > 1 ? `물건 ${n}개 떨어뜨리기` : '물건 하나 떨어뜨리기', done: (h) => h.knocked >= n });
const asleep: Goal = { text: '집사를 한 번도 깨우지 않기', done: (h, dawn) => dawn && h.wakes === 0 };

export const NIGHTS: Night[] = [
  { id: 'first', name: '첫 번째 밤', blurb: '나방과 귀뚜라미부터. 살금살금 다가가 꾹 눌러 덮쳐요!', time: 150, roster: { moth: 3, cricket: 3, mouse: 1 }, stars: [600, 1400, 2400],
    goals: [caught('cricket', 2, '귀뚜라미 2마리 잡기'), caught('moth', 1, '나방 잡기'), knocked(1)] },
  { id: 'mice', name: '생쥐의 밤', blurb: '부엌에 생쥐가 나왔대요. 잡아서 집사 침대에 선물해요.', time: 180, roster: { moth: 2, cricket: 2, mouse: 3 }, stars: [900, 2200, 3800],
    goals: [gifts(1), chain(3), asleep] },
  { id: 'rain', name: '비 오는 밤', blurb: '빗소리가 발소리를 덮어줘요. 하지만 번개가 치면 다 보여요!', time: 180, roster: { moth: 1, cricket: 5, mouse: 2, spider: 1 }, stars: [1000, 2400, 4000],
    mods: { hear: 0.45, rain: true, moon: 0.35 }, goals: [caught('cricket', 5, '귀뚜라미 5마리 잡기'), chain(4), gifts(1)] },
  { id: 'full', name: '보름달 밤', blurb: '달빛이 밝아 멀리서도 들켜요. 그림자를 따라 살금살금.', time: 210, roster: { moth: 4, cricket: 4, mouse: 3, spider: 2 }, stars: [1400, 3200, 5200],
    mods: { see: 1.5, moon: 1.8 }, goals: [caught('moth', 3, '나방 3마리 잡기'), caught('spider', 1, '천장에서 내려온 거미 잡기'), chain(5)] },
  { id: 'light', name: '예민한 집사의 밤', blurb: '집사가 잠귀가 밝아요. 대신 선물은 두 배!', time: 180, roster: { moth: 3, cricket: 3, mouse: 3, spider: 1 }, stars: [1200, 3000, 5000],
    mods: { sleepy: 2, gift: 2 }, goals: [gifts(2), asleep, caught('mouse', 3, '생쥐 3마리 잡기')] },
  { id: 'chaos', name: '난장판의 밤', blurb: '오늘 밤은 다 떨어뜨려도 돼요. 물건 점수 두 배!', time: 180, roster: { moth: 3, cricket: 4, mouse: 2, spider: 2 }, stars: [1500, 3500, 6000],
    mods: { knock: 2 }, goals: [knocked(7), { text: '집사 머리맡 물컵 떨어뜨리기', done: (h) => h.things.some((t) => t.kind === 'glass' && t.state === 'down') }, chain(3)] },
];

/** the night of the day: the same for everyone on a date (what is out, the weather, the
 *  challenges), a new one tomorrow; open once the first night has a star */
export function today(d = new Date()): Night {
  const M = d.getMonth() + 1, D = d.getDate();
  const key = `${d.getFullYear()}${String(M).padStart(2, '0')}${String(D).padStart(2, '0')}`;
  let seed = (+key % 2147483646) + 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const twist = pick<{ name: string; mods: Mods }>([
    { name: '고요한 밤', mods: {} },
    { name: '비 오는 밤', mods: { hear: 0.45, rain: true, moon: 0.35 } },
    { name: '달 밝은 밤', mods: { see: 1.5, moon: 1.8 } },
    { name: '집사가 예민한 밤', mods: { sleepy: 2, gift: 2 } },
    { name: '난장판의 밤', mods: { knock: 2 } },
  ]);
  const roster = { moth: 1 + Math.floor(rnd() * 4), cricket: 1 + Math.floor(rnd() * 5), mouse: 1 + Math.floor(rnd() * 3), spider: Math.floor(rnd() * 3) };
  // (three challenges, each of a different sort)
  const sorts: Goal[][] = [
    [caught('moth', 2, '나방 2마리 잡기'), caught('cricket', 3, '귀뚜라미 3마리 잡기'), caught('mouse', 2, '생쥐 2마리 잡기'), ...(roster.spider ? [caught('spider', 1, '거미 잡기')] : [])],
    [chain(3), chain(4)],
    [gifts(1), asleep],
    [knocked(2), knocked(4)],
  ];
  const goals: Goal[] = [];
  while (goals.length < 3) {
    const i = Math.floor(rnd() * sorts.length);
    if (!sorts[i].length) continue;
    goals.push(pick(sorts[i]));
    sorts[i] = [];
  }
  // (stars by what is out: about what a fair night of it would come to)
  const worth = roster.moth * 100 + roster.cricket * 150 + roster.mouse * 500 + roster.spider * 200;
  const r = (x: number) => Math.max(100, Math.round(x / 100) * 100);
  return {
    id: `day-${key}`, name: '오늘의 밤', blurb: `${M}월 ${D}일 · ${twist.name} · 나방 ${roster.moth} · 귀뚜라미 ${roster.cricket} · 생쥐 ${roster.mouse}${roster.spider ? ` · 거미 ${roster.spider}` : ''}`,
    time: 180, roster, stars: [r(worth * 0.6), r(worth * 1.3), r(worth * 2.1)], mods: twist.mods, goals,
  };
}

/** the night by its place in the list (the night of the day: -1) */
export const nightAt = (i: number) => (i < 0 ? today() : NIGHTS[i]);

/** a run of catches, each within this long of the one before, counts up; and what it is worth */
export const CHAIN = 12;
export const chainMul = (n: number) => Math.min(3, 1 + 0.5 * Math.max(0, n - 1));
/** a mouse laid on their bed */
export const GIFT = 500;

export interface GameEvents {
  caught: (p: Prey, pts: number, chain: number) => void;
  gift: (pts: number) => void;
  /** a pounce come down on nothing (near: something got away by a whisker) */
  missed: (near: boolean) => void;
  stirred: (woke: boolean) => void;
  /** a challenge done (its index, and the points for it) */
  goal: (i: number, pts: number) => void;
  /** lightning (a rainy night): everything seen a moment */
  lightning: () => void;
  /** a thing pushed off, landed: what, and its points */
  crashed: (t: Thing, pts: number) => void;
  sound: (name: string, at: THREE.Vector3 | null, gain?: number) => void;
}

/**
 * One night of it: the clock running toward dawn, the things out to be hunted (a moth or a cricket
 * caught is back somewhere else after a while; a mouse caught is carried, and given on their bed is
 * worth the most), the run of catches, the points; and their person asleep, who a racket in the
 * bedroom wakes a little (wake them and it costs you).
 */
export class Hunt {
  readonly cat = new Cat();
  readonly prey: Prey[] = [];
  t = 0;
  score = 0;
  chain = 0;
  best = 0;
  private lastCatch = -99;
  /** a mouse in the mouth */
  held: Prey | null = null;
  caught: Record<PreyKind, number> = { moth: 0, cricket: 0, mouse: 0, spider: 0 };
  gifts = 0;
  /** how deeply they sleep (1: soundly; at 0, woken) */
  sleep = 1;
  wakes = 0;
  over = false;
  private back: { p: Prey; at: number }[] = [];
  /** the things about to be pushed off, and how many have been */
  readonly things: Thing[] = [];
  knocked = 0;
  /** the night's challenges, done or not */
  readonly goals: boolean[];
  /** lightning: the next (s into the night), and how lit it still is (0..1) */
  private nextBolt = 15 + Math.random() * 15;
  bolt = 0;
  /** when they last woke */
  private wokeAt = -99;

  constructor(readonly world: World, readonly night: Night, readonly on: GameEvents) {
    for (const [kind, n] of Object.entries(night.roster) as [PreyKind, number][]) {
      for (let i = 0; i < n; i++) {
        const p = new Prey(kind);
        p.spawn(world);
        this.prey.push(p);
      }
    }
    for (const s of world.spots ?? []) this.things.push(new Thing(s.kind, s.at));
    this.goals = night.goals.map(() => false);
    // the cat starts on the rug, looking toward the kitchen
    this.cat.place(1.5, 0, 1.0, -Math.PI * 0.75);
  }

  get left() {
    return Math.max(0, this.night.time - this.t);
  }
  /** the clock: from two in the morning to five, as the night goes */
  get clock() {
    const m = 120 + (this.t / this.night.time) * 180;
    return `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  }
  get chainLive() {
    return this.t - this.lastCatch <= CHAIN ? this.chain : 0;
  }
  get stars() {
    return this.night.stars.filter((s) => this.score >= s).length;
  }

  step(dt: number, I: Intent) {
    if (this.over) return;
    this.t += dt;
    const cat = this.cat, W = this.world, M = this.night.mods ?? {};
    cat.update(dt, I, W.boxes);
    this.homing(dt);
    // (a rainy night: now and then a flash, everything plain to see a moment)
    this.bolt = Math.max(0, this.bolt - dt * 2.5);
    if (M.rain && this.t >= this.nextBolt) {
      this.nextBolt = this.t + 12 + Math.random() * 16;
      this.bolt = 1;
      this.on.lightning();
    }
    if (cat.doing === 'pounce' && cat.t < dt * 1.5) this.on.sound('whoosh', null, 0.5);
    if (cat.landedHard > 2) this.on.sound('thud', null, Math.min(0.8, cat.landedHard / 8));
    for (const p of this.prey) {
      p.update(dt, { eye: cat.eye, noise: cat.noise * (M.hear ?? 1), speed: cat.speed, world: W, see: (M.see ?? 1) * (1 + 1.5 * this.bolt), sound: (q, name) => this.on.sound(name, q.pos, name === 'chirp' ? 0.5 : 0.7) });
    }
    this.catching();
    this.pushing(dt);
    // (a moth or cricket caught: back again, somewhere, in a while)
    for (let i = this.back.length - 1; i >= 0; i--) {
      if (this.t < this.back[i].at) continue;
      this.back[i].p.spawn(W);
      this.back.splice(i, 1);
    }
    // the gift: a mouse brought up onto (or right by) their bed
    if (this.held) {
      const b = W.bed.at, e = cat.body;
      if (Math.hypot(e.x - b.x, e.z - b.z) < W.bed.r && e.y > 0.4) {
        const pts = Math.round((GIFT * (M.gift ?? 1) * chainMul(this.chainLive || 1)) / 10) * 10;
        this.score += pts;
        this.gifts++;
        this.held.release(new THREE.Vector3(e.x, 0, e.z + 0.3), W);
        this.held = null;
        this.on.gift(pts);
      }
    }
    // their sleep: a racket in the bedroom wakes them by degrees; quiet, it deepens again
    const near = cat.body.x > 1.5 && cat.body.z < 0 ? 1 : 0;
    const loud = near * Math.max(0, cat.noise - 0.15) * 1.6;
    this.rouse(loud * dt - 0.05 * dt);
    this.challenges(false);
    if (this.t >= this.night.time) {
      this.challenges(true);
      this.over = true;
    }
  }

  /** the challenges done since last looked: their points, and said */
  private challenges(dawn: boolean) {
    this.night.goals.forEach((g, i) => {
      if (this.goals[i] || !g.done(this, dawn)) return;
      this.goals[i] = true;
      this.score += GOAL;
      this.on.goal(i, GOAL);
    });
  }

  /** a cat's eye on its mark: a pounce's flight bent a little toward the nearest thing ahead of it
   *  (within some thirty degrees, in reach), and its pace made to come down on it */
  private homing(dt: number) {
    const cat = this.cat, b = cat.body;
    if (cat.doing !== 'pounce' || cat.t > 0.5) return;
    const sp = Math.hypot(b.vx, b.vz);
    if (sp < 0.5) return;
    const hx = b.vx / sp, hz = b.vz / sp;
    let best: Prey | null = null, score = Infinity;
    for (const p of this.prey) {
      if (p.state === 'hidden' || p.state === 'held' || !p.mesh.visible) continue;
      const dx = p.pos.x - b.x, dz = p.pos.z - b.z, d = Math.hypot(dx, dz), dy = p.pos.y - b.y;
      if (d < 0.05 || d > 2.6 || dy < -0.4 || dy > 1.3) continue;
      const cos = (dx * hx + dz * hz) / d;
      if (cos < 0.85) continue;
      if (d * (2 - cos) < score) { score = d * (2 - cos); best = p; }
    }
    if (!best) return;
    const dx = best.pos.x - b.x, dz = best.pos.z - b.z, d = Math.hypot(dx, dz);
    const have = Math.atan2(b.vx, b.vz);
    let da = Math.atan2(dx, dz) - have;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const a = have + THREE.MathUtils.clamp(da, -2.5 * dt, 2.5 * dt);
    // (as long in the air as it takes to come down to its height: that fast along, to be there)
    const g = 13, T = Math.max(0.15, (b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 2 * g * (b.y - best.pos.y + 0.05)))) / g);
    const s2 = sp + THREE.MathUtils.clamp(d / T - sp, -sp * 0.5, sp * 0.25) * Math.min(1, 4 * dt);
    b.vx = Math.sin(a) * s2;
    b.vz = Math.cos(a) * s2;
  }

  /** their sleep made lighter (or, less than nothing, deeper): stirring past the half, and woken */
  private rouse(by: number) {
    // (just woken, sitting up and dropping off again: not woken again straight away)
    if (by > 0 && this.t < this.wokeAt + 8) return;
    const before = this.sleep;
    this.sleep = Math.min(1, this.sleep - (by > 0 ? by * (this.night.mods?.sleepy ?? 1) : by));
    if (before >= 0.5 && this.sleep < 0.5 && this.sleep > 0) this.on.stirred(false);
    if (this.sleep <= 0) {
      this.sleep = 1;
      this.wokeAt = this.t;
      this.wakes++;
      this.score = Math.max(0, this.score - 300);
      this.chain = 0;
      this.on.stirred(true);
    }
  }

  /** the things on the tops: swatted or shoved off, falling, landing with a crash that everything
   *  near hears (the things hunted, off; they, if it is near enough, stirring) */
  private pushing(dt: number) {
    const cat = this.cat, b = cat.body, W = this.world;
    const sw = cat.swatAt;
    for (const t of this.things) {
      if (sw && cat.t < 0.15 && t.near(sw.x, sw.y, sw.z, 0.2)) {
        // (a swat: sent off the way the paw went, and a little across)
        const f = new THREE.Vector3(cat.fwd.x, 0, cat.fwd.z).normalize();
        t.knock(f.x * 1.7 - f.z * 0.4, f.z * 1.7 + f.x * 0.4);
        this.on.sound('pat', t.pos, 0.6);
      } else if (cat.speed > 0.3 && t.state === 'up' && t.near(b.x, b.y + 0.02, b.z, b.r + 0.04)) {
        // (walked into: shoved along ahead)
        const k = 0.6 + 0.5 * cat.speed;
        t.knock((b.vx / cat.speed) * k, (b.vz / cat.speed) * k, 0.2);
      }
      const fell = t.update(dt, W.boxes);
      if (!fell) continue;
      const K = THINGS[t.kind];
      const pts = Math.round((K.pts * (this.night.mods?.knock ?? 1) * (0.5 + Math.min(1, fell))) / 10) * 10;
      this.score += pts;
      this.knocked++;
      this.on.sound(K.sound, t.pos, K.loud);
      this.on.crashed(t, pts);
      for (const p of this.prey) p.hear(t.pos, K.loud);
      const bed = W.sleeper?.position;
      if (bed) this.rouse(0.75 * K.loud * Math.max(0, 1 - t.pos.distanceTo(bed) / 4.5));
    }
  }

  /** a pounce or a swat that finds something */
  private catching() {
    const cat = this.cat;
    const reach = cat.reach();
    let hit: Prey | null = null;
    if (cat.doing === 'pounce' || cat.pounced) {
      // (in the air and as it comes down, round the paws out ahead)
      for (const p of this.prey) {
        if (p.state === 'hidden' || p.state === 'held' || !p.mesh.visible) continue;
        const r = p.kind === 'mouse' ? 0.2 : 0.22;
        if (p.pos.distanceTo(reach) < r + PREY[p.kind].size) { hit = p; break; }
      }
      if (!hit && cat.pounced) {
        const near = this.prey.some((p) => p.state !== 'hidden' && p.state !== 'held' && p.mesh.visible && p.pos.distanceTo(reach) < 0.55);
        this.on.missed(near);
      }
    } else if (cat.swatAt) {
      for (const p of this.prey) {
        if (p.state === 'hidden' || p.state === 'held' || !p.mesh.visible) continue;
        if (p.pos.distanceTo(cat.swatAt) < 0.17 + PREY[p.kind].size) { hit = p; break; }
      }
      this.on.sound('swish', null, 0.5);
      // (a swat stuns a mouse a moment, for a pounce to follow)
      if (hit && hit.kind === 'mouse') {
        hit.stun(1.2);
        this.on.sound('squeak', hit.pos, 0.8);
        return;
      }
    }
    if (!hit) return;
    if (hit.kind === 'mouse') {
      // (a mouse is carried, one at a time; a second waits)
      if (this.held) return;
      this.held = hit;
    }
    hit.catchIt();
    this.chain = this.t - this.lastCatch <= CHAIN ? this.chain + 1 : 1;
    this.best = Math.max(this.best, this.chain);
    this.lastCatch = this.t;
    const pts = Math.round((PREY[hit.kind].pts * chainMul(this.chain)) / 10) * 10;
    this.score += pts;
    this.caught[hit.kind]++;
    if (hit.kind !== 'mouse') this.back.push({ p: hit, at: this.t + 6 + Math.random() * 8 });
    this.on.caught(hit, pts, this.chain);
  }
}

/** what is kept between nights: the best of each, its stars */
export interface Save { best: Record<string, number>; stars: Record<string, number>; mute?: boolean; knocked?: boolean;
  /** each night's challenges ever done (a bit each) */
  goals?: Record<string, number>;
  /** the coat worn */
  coat?: string;
  /** how fast a drag turns the head (0: slow, 1: as made, 2: fast); buzzes off */
  look?: number;
  still?: boolean;
  /** counted across every night, and the badges won */
  totals?: Record<string, number>;
  badges?: string[] }
const KEY = 'bamsanyang.save';
export function loadSave(): Save {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && typeof s === 'object') return { best: s.best ?? {}, stars: s.stars ?? {}, mute: !!s.mute, knocked: !!s.knocked, goals: s.goals ?? {}, coat: typeof s.coat === 'string' ? s.coat : undefined, totals: s.totals ?? {}, badges: Array.isArray(s.badges) ? s.badges : [], look: typeof s.look === 'number' ? s.look : 1, still: !!s.still };
  } catch { /* none kept */ }
  return { best: {}, stars: {} };
}
export function saveSave(s: Save) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* this visit only */ }
}
export const nightOpen = (s: Save, i: number) => i === 0 || (s.stars[NIGHTS[i < 0 ? 0 : i - 1].id] ?? 0) >= 1;
