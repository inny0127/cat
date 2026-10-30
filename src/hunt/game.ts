import * as THREE from 'three';
import { Cat, type Intent } from './cat';
import { PREY, Prey, type PreyKind } from './prey';
import type { World } from './world';
import { THINGS, Thing } from './things';

/** a night: how long it lasts (s of play), what is out, the points for its stars */
export interface Night {
  id: string;
  name: string;
  blurb: string;
  time: number;
  roster: Partial<Record<PreyKind, number>>;
  stars: [number, number, number];
}

export const NIGHTS: Night[] = [
  { id: 'first', name: '첫 번째 밤', blurb: '나방과 귀뚜라미부터. 살금살금 다가가 꾹 눌러 덮쳐요!', time: 150, roster: { moth: 3, cricket: 3, mouse: 1 }, stars: [600, 1400, 2400] },
  { id: 'mice', name: '생쥐의 밤', blurb: '부엌에 생쥐가 나왔대요. 잡아서 집사 침대에 선물해요.', time: 180, roster: { moth: 2, cricket: 2, mouse: 3 }, stars: [900, 2200, 3800] },
  { id: 'full', name: '보름달 밤', blurb: '모두가 깨어 있는 밤. 연속으로 잡아 콤보를 노려요.', time: 210, roster: { moth: 4, cricket: 4, mouse: 3 }, stars: [1400, 3200, 5200] },
];

/** a run of catches, each within this long of the one before, counts up; and what it is worth */
export const CHAIN = 12;
export const chainMul = (n: number) => Math.min(3, 1 + 0.5 * Math.max(0, n - 1));
/** a mouse laid on their bed */
export const GIFT = 500;

export interface GameEvents {
  caught: (p: Prey, pts: number, chain: number) => void;
  gift: (pts: number) => void;
  missed: () => void;
  stirred: (woke: boolean) => void;
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
  caught: Record<PreyKind, number> = { moth: 0, cricket: 0, mouse: 0 };
  gifts = 0;
  /** how deeply they sleep (1: soundly; at 0, woken) */
  sleep = 1;
  wakes = 0;
  over = false;
  private back: { p: Prey; at: number }[] = [];
  /** the things about to be pushed off, and how many have been */
  readonly things: Thing[] = [];
  knocked = 0;

  constructor(readonly world: World, readonly night: Night, readonly on: GameEvents) {
    for (const [kind, n] of Object.entries(night.roster) as [PreyKind, number][]) {
      for (let i = 0; i < n; i++) {
        const p = new Prey(kind);
        p.spawn(world);
        this.prey.push(p);
      }
    }
    for (const s of world.spots ?? []) this.things.push(new Thing(s.kind, s.at));
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
    const cat = this.cat, W = this.world;
    cat.update(dt, I, W.boxes);
    if (cat.doing === 'pounce' && cat.t < dt * 1.5) this.on.sound('whoosh', null, 0.5);
    if (cat.landedHard > 2) this.on.sound('thud', null, Math.min(0.8, cat.landedHard / 8));
    for (const p of this.prey) {
      p.update(dt, { eye: cat.eye, noise: cat.noise, speed: cat.speed, world: W, sound: (q, name) => this.on.sound(name, q.pos, name === 'chirp' ? 0.5 : 0.7) });
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
        const pts = Math.round((GIFT * chainMul(this.chainLive || 1)) / 10) * 10;
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
    if (this.t >= this.night.time) this.over = true;
  }

  /** their sleep made lighter (or, less than nothing, deeper): stirring past the half, and woken */
  private rouse(by: number) {
    const before = this.sleep;
    this.sleep = Math.min(1, this.sleep - by);
    if (before >= 0.5 && this.sleep < 0.5 && this.sleep > 0) this.on.stirred(false);
    if (this.sleep <= 0) {
      this.sleep = 0.8;
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
      const pts = Math.round((K.pts * (0.5 + Math.min(1, fell))) / 10) * 10;
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
      if (!hit && cat.pounced) this.on.missed();
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
export interface Save { best: Record<string, number>; stars: Record<string, number>; mute?: boolean; knocked?: boolean }
const KEY = 'bamsanyang.save';
export function loadSave(): Save {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && typeof s === 'object') return { best: s.best ?? {}, stars: s.stars ?? {}, mute: !!s.mute, knocked: !!s.knocked };
  } catch { /* none kept */ }
  return { best: {}, stars: {} };
}
export function saveSave(s: Save) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* this visit only */ }
}
export const nightOpen = (s: Save, i: number) => i === 0 || (s.stars[NIGHTS[i - 1].id] ?? 0) >= 1;
