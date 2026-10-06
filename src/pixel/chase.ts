import * as THREE from 'three';
import type { PoseLayer, PoseName } from '../cat3d/pose';
import { washFace, type Act, type Ctx, type SillSpot } from './behave';

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (10 + x * (6 * x - 15)));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const DOWN = new Set<PoseName>(['loaf', 'sphinx', 'side', 'curl', 'curlL']);

/** the red dot of a laser pointer as the cat sees it: where it is, on what (the floor or the bed,
 *  the windowsill, the books, anything else upright: a wall, the radiator, the lamp), and which
 *  way that faces */
export interface LaserDot {
  p: THREE.Vector3;
  on: 'floor' | 'bed' | 'sill' | 'books' | 'up';
  n: THREE.Vector3;
  /** on the mug itself */
  mug?: boolean;
  /** on the cat itself: which part (its rear and its tail, a forepaw, its side, its head), and
   *  where (p is then the floor beyond it) */
  self?: 'rear' | 'front' | 'side' | 'head';
  selfAt?: THREE.Vector3;
}

type Phase = 'notice' | 'stalk' | 'run' | 'wiggle' | 'pounce' | 'land' | 'hold' | 'rear' | 'leap' | 'search' | 'tired' | 'self'
  | 'gather' | 'up' | 'sill' | 'spring' | 'look' | 'down';

/**
 * The red dot of a laser pointer: it has to be had. The moment it shows, the head goes to it, the
 * pupils go wide and the ears forward. Still or creeping, it is stalked low to the floor, the rump
 * wiggles and it is pounced on, both forepaws coming down on it, and then a paw is lifted to see
 * whether it is under there; darting off, it is run after flat out, claws scrabbling at the turns.
 * Low on the wall it is reared up to and patted at; higher, leapt at, again and again; on the sill,
 * the cat goes up after it (and whatever is in the way up there, the pencil, the mug of tea, goes
 * over the edge); on the books, it is pounced on there. Gone, it is looked for: where it was,
 * round about, under a paw, and then at you. In the end the game palls, and it lies down and only watches.
 */
export class Chase implements Act {
  readonly name = 'chase';
  phase: Phase = 'notice';
  private t = 0;
  private dur = 0;
  /** how long it has been after the dot, and how long it will be before it has had enough */
  private total = 0;
  private readonly patience = rand(70, 150);
  /** the floor under the dot, or in front of what it is on; where the run after it was aimed */
  private readonly T = new THREE.Vector3();
  private readonly aim = new THREE.Vector3(NaN, 0, 0);
  /** the dot a frame ago, how fast it is going (m/s, smoothed), how long since it was seen, and
   *  where and on what it was last */
  private readonly was = new THREE.Vector3(NaN, 0, 0);
  private ds = 0;
  private gone = 0;
  private readonly last = new THREE.Vector3();
  private lastOn: LaserDot['on'] = 'floor';
  /** where its paws came down on it; which paw it looks under */
  private readonly pinAt = new THREE.Vector3();
  private side = Math.random() < 0.5 ? 1 : -1;
  /** leaps at it, up out of reach on the wall, at this spot */
  private leaps = 0;
  private scrabbleIn = 0;
  private asked = false;
  private readonly fwd = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  /** asked to stop (sleep, the bowl): down off the sill first if it is up there */
  private leaving = false;
  /** a way round something in the way (and how long it has been going that way) */
  private via: THREE.Vector3 | null = null;
  private viaT = 0;
  /** going after it: the nearest it has come yet, and how long since it came any nearer (a cat
   *  going round and round a point it cannot quite turn in to is better stopped and started again) */
  private best = 1e9;
  private stuck = 0;
  /** at the end, a wash (as if nothing had happened) */
  private wash: Act | null = null;
  private readonly sill: SillSpot | null;
  /** up on the sill, how long the dot has been off it */
  private offSill = 0;
  /** the dot on its own body: which part of it, and a moment between goes after it there */
  private part: NonNullable<LaserDot['self']> = 'rear';
  private selfRest = 0;
  /** how long the dot has been on its own coat (a beam it has only walked through is nothing) */
  private selfOn = 0;
  /** the pounce under way: from where, facing which way (fixed once it is off the floor), how far
   *  it carries and for how long; and when the last one was (the chase's own clock) */
  private readonly leapFrom = new THREE.Vector3();
  private leapYaw = 0;
  private leapReach = 0;
  private lastPounce = -9;
  /** the last pat that knocked at the wall, and whether this leap has */
  private patK = -1;
  private patted = false;

  /** onSill: it is up on the windowsill already (it was sitting there when the dot came) */
  constructor(c: Ctx, onSill = false) {
    this.sill = c.sill();
    if (onSill && this.sill) this.next('sill', 0);
    else this.next('notice', rand(0.15, 0.4));
  }

  /** it has had enough (and will not be drawn in again for a while) */
  get tired() {
    return this.total > this.patience;
  }

  /** up on the sill, or jumping up or down: it cannot simply be stopped */
  get up() {
    return this.phase === 'up' || this.phase === 'sill' || this.phase === 'spring' || this.phase === 'look' || this.phase === 'down';
  }

  /** asked to stop: done at once on the floor, down off the sill first */
  leave() {
    this.leaving = true;
  }

  get ownGaze() {
    return true;
  }

  private next(phase: Phase, dur = 0) {
    this.phase = phase;
    this.t = 0;
    this.dur = dur;
    this.best = 1e9;
    this.stuck = 0;
  }

  /** keep track of the dot */
  private see(L: LaserDot | null, dt: number) {
    if (!L) {
      this.gone += dt;
      this.ds *= Math.exp(-dt * 6);
      this.was.set(NaN, 0, 0);
      return;
    }
    if (Number.isNaN(this.was.x)) this.was.copy(L.p);
    const inst = Math.min(6, L.p.distanceTo(this.was) / Math.max(dt, 1e-3));
    this.ds += (inst - this.ds) * Math.min(1, dt * 10);
    this.was.copy(L.p);
    this.last.copy(L.p);
    this.lastOn = L.on;
    this.gone = 0;
    this.total += dt;
  }

  /** the floor point to go to for the dot: under it on the floor; in front of whatever upright
   *  thing it is on (out along the way that faces); before the sill or the books */
  private target(c: Ctx, L: LaserDot) {
    const T = this.T;
    if (L.on === 'floor' || L.on === 'bed') T.set(L.p.x, 0, L.p.z);
    else if (L.on === 'sill' && this.sill) T.set(L.p.x, 0, this.sill.launch.z - 0.04);
    else if (L.on === 'books') {
      // (the books: from the side of them the cat is on)
      const B = c.books(), dx = c.m.pos.x - B.x, dz = c.m.pos.z - B.z, d = Math.hypot(dx, dz) || 1;
      T.set(B.x + (dx / d) * 0.25, 0, B.z + (dz / d) * 0.25);
    } else {
      const nl = Math.hypot(L.n.x, L.n.z);
      const out = 0.2;
      // (a dot on top of a thing: from the side of it nearest the cat)
      if (nl < 0.3) {
        const dx = c.m.pos.x - L.p.x, dz = c.m.pos.z - L.p.z, d = Math.hypot(dx, dz) || 1;
        T.set(L.p.x + (dx / d) * out, 0, L.p.z + (dz / d) * out);
      } else T.set(L.p.x + (L.n.x / nl) * out, 0, L.p.z + (L.n.z / nl) * out);
    }
    c.keepClear(T, 0.13);
    return T;
  }

  /** after the dot, running or creeping, to a point short of it, facing it (round anything in the
   *  way); re-aimed whenever the dot has gone somewhere else */
  private goAfter(c: Ctx, L: LaserDot, short: number, speed: number, dt: number) {
    const m = c.m, T = this.T;
    if (this.via) {
      // (near enough the way round, or long enough at it: on to the dot itself)
      this.viaT += dt;
      if (Math.hypot(this.via.x - m.pos.x, this.via.z - m.pos.z) > 0.12 && m.goal && this.viaT < 2.5) return;
      this.via = null;
      this.aim.set(NaN, 0, 0);
    }
    if (m.goal && Math.hypot(T.x - this.aim.x, T.z - this.aim.z) < 0.05) return;
    this.aim.copy(T);
    const dx = T.x - m.pos.x, dz = T.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
    const stop = d > short ? new THREE.Vector3(T.x - (dx / d) * short, 0, T.z - (dz / d) * short) : m.pos.clone();
    c.keepClear(stop, 0.13);
    const face = Math.atan2(L.p.x - stop.x, L.p.z - stop.z);
    const round = c.detour(m.pos, stop, 0.12);
    if (round) {
      this.via = round;
      this.viaT = 0;
      m.walkTo(round, speed, null, null, true);
      return;
    }
    m.walkTo(stop, speed, face);
  }

  update(dt: number, c: Ctx) {
    const m = c.m;
    this.t += dt;
    this.scrabbleIn -= dt;
    if (this.wash) {
      if (this.wash.update(dt, c)) return true;
      this.wash.stop(c);
      this.wash = null;
      return false;
    }
    const L = c.laser();
    this.see(L, dt);
    this.fwd.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
    // up on the sill (or on the way up or down): that first
    if (this.up || this.phase === 'gather') return this.aloft(dt, c, L);
    if (this.leaving) return false;
    // eyes on it all the while it is there to see
    if (L && this.phase !== 'search') m.lookAt(c.gaze('dot') ?? L.p, 1);
    const keen: PoseLayer = { earFwd: 0.95, pupil: 1, eyeOpen: 1, whisker: 0.9, tailCurl: 0.7 * Math.sin(this.total * 9) };
    // gone (and not in the middle of a spring): where did it go?
    if (!L && this.phase !== 'search' && this.phase !== 'pounce' && !(this.phase === 'leap' && this.t > this.dur)) {
      m.stop();
      m.zoom = 0;
      this.asked = false;
      this.next('search');
    }
    // enough is enough: down where it is, and it only watches
    if (L && this.tired && this.phase !== 'tired' && this.phase !== 'pounce' && this.phase !== 'leap') {
      m.stop();
      m.zoom = 0;
      m.layer = null;
      this.next('tired');
    }
    // the dot on its own body: that has to be had too (not in the middle of a spring)
    this.selfRest = Math.max(0, this.selfRest - dt);
    this.selfOn = L?.self ? this.selfOn + dt : 0;
    // (not on the run after it, nor with it under its paws: then the dot on its coat is only the
    // beam crossing it on the way to the floor; and not again and again)
    if (L?.self && this.selfOn > 0.45 && this.selfRest <= 0 && (this.phase === 'notice' || this.phase === 'stalk' || this.phase === 'wiggle' || this.phase === 'search')) {
      m.stop();
      m.zoom = 0;
      this.part = L.self;
      const lx = L.selfAt ? (L.selfAt.x - m.pos.x) * Math.cos(m.yaw) - (L.selfAt.z - m.pos.z) * Math.sin(m.yaw) : 0;
      this.side = Math.abs(lx) > 0.01 ? Math.sign(lx) : Math.random() < 0.5 ? 1 : -1;
      this.next('self', this.part === 'rear' ? rand(1.3, 2.1) : rand(1.2, 1.8));
      if (this.part === 'rear') c.sound('scrabble', 0.18);
    }
    switch (this.phase) {
      case 'self': {
        // round after it on itself: on its rear or its tail, round and round after it, the head
        // turned back to it and the body bent round, then sat to give the spot a lick; on a forepaw,
        // a look down at the paw, the paw lifted and shaken, a pat at it with the other; on its
        // side, a look round at it and a lick; on its head, where it cannot see it, a shake of
        // the head and the ears flicking
        const s = this.side, u = this.t / this.dur;
        m.lookAt(null);
        let pose: PoseLayer;
        if (this.part === 'rear') {
          const spin = u < 0.72;
          if (spin) {
            m.setPosture('stand');
            m.yaw = wrapA(m.yaw + s * 5 * Math.min(1, this.t / 0.25) * dt);
            pose = { ...keen, hipY: 0.17, neckYaw: s * 0.95, headYaw: s * 0.55, headRoll: -s * 0.2, lumbarYaw: s * 0.4, chestYaw: s * 0.3, tailSide: s * 1.2, tailCurl: s * 0.8, tailLift: 0.2 };
          } else {
            m.setPosture('sit');
            const lick = Math.max(0, Math.sin(this.t * 9));
            pose = { neckYaw: s * 1.05, headYaw: s * 0.7, neckPitch: -0.35, headPitch: -0.35 + 0.12 * lick, jaw: 0.12 * lick, eyeOpen: 0.4, squint: 0.3 };
          }
        } else if (this.part === 'front') {
          m.setPosture('crouch');
          const shake = Math.sin(this.t * 22) * Math.min(1, this.t / 0.3);
          const pat = u > 0.55 ? Math.max(0, Math.sin((u - 0.55) / 0.45 * Math.PI * 2)) : 0;
          const [lifted, other] = s > 0 ? ['LF', 'RF'] : ['RF', 'LF'];
          pose = {
            ...keen, hipY: 0.15, neckPitch: -0.65, headPitch: -0.3, neckYaw: s * 0.2,
            [lifted]: { planted: 0, frame: 0, x: 0.04, y: 0.04 + 0.008 * shake, z: 0.13, flex: 0.5 },
            [other]: { planted: 0, frame: 0, x: 0.03 - 0.02 * pat, y: 0.012 + 0.05 * pat, z: 0.14 + 0.02 * pat, flex: 0.3 * pat },
          };
        } else if (this.part === 'side') {
          m.setPosture('sit');
          const lick = u > 0.4 ? Math.max(0, Math.sin(this.t * 9)) : 0;
          pose = { ...keen, neckYaw: s * 1.0, headYaw: s * 0.6, neckPitch: -0.25, headPitch: -0.25 + 0.1 * lick, jaw: 0.1 * lick };
        } else {
          m.setPosture('sit');
          const sh = Math.sin(this.t * 18) * Math.max(0, 1 - Math.abs(u - 0.4) / 0.25);
          pose = { earFwd: -0.2, earOut: 0.4, pupil: 0.8, headRoll: 0.35 * sh, headYaw: 0.15 * sh, eyeOpen: 0.7 };
          if (Math.floor(this.t * 3) !== Math.floor((this.t - dt) * 3)) m.flickEar(Math.random() < 0.5 ? 'L' : 'R', 0.8);
        }
        m.layer = { pose, w: Math.min(1, this.t / 0.15) * Math.min(1, (this.dur - this.t) / 0.2 + 0.001) };
        if (this.t >= this.dur) {
          m.layer = null;
          this.selfRest = rand(6, 12);
          if (L) this.decide(c, L);
          else { this.asked = false; this.next('search'); }
        }
        return true;
      }
      case 'notice': {
        // stock still, the head on it, the pupils going wide; up off the floor onto its feet, low
        // (round behind it, where its head will not turn to: round on the spot to it)
        if (!this.turnTo(c, L ? L.p : this.last)) m.stop();
        if (DOWN.has(m.targetPosture)) m.setPosture('crouch');
        m.layer = { pose: { ...keen }, w: Math.min(1, this.t / 0.15) };
        if (this.t > this.dur && L) this.decide(c, L);
        return true;
      }
      case 'stalk': {
        // low to the floor, creeping up on it, the tip of the tail going
        const T = this.target(c, L!), d = Math.hypot(T.x - m.pos.x, T.z - m.pos.z);
        if (L!.on !== 'floor' && L!.on !== 'bed') { this.decide(c, L!); return true; }
        if (this.ds > 0.6 || d > 0.95) { this.next('run'); return true; }
        if (d < 0.33 && !this.via) { m.stop(); this.next('wiggle', rand(0.35, 0.9)); return true; }
        m.setPosture('crouch');
        this.goAfter(c, L!, 0.27, 0.2, dt);
        m.layer = {
          pose: { ...keen, hipY: 0.135, neckPitch: -0.45, headPitch: 0.1, tailLift: -0.35, tailSide: 0.3 * Math.sin(this.t * 6.5) },
          w: Math.min(1, this.t / 0.3),
        };
        return true;
      }
      case 'run': {
        // after it flat out: low and quick, the ears forward, the claws scrabbling at the turns
        const T = this.target(c, L!), d = Math.hypot(T.x - m.pos.x, T.z - m.pos.z);
        const flat = L!.on === 'floor' || L!.on === 'bed', books = L!.on === 'books';
        const short = flat ? 0.26 : books ? 0.02 : 0;
        if (d < short + 0.07 && !this.via && (m.speed < 0.3 || !m.goal)) {
          m.zoom = 0;
          if (flat) this.next('wiggle', this.ds > 0.4 ? rand(0.1, 0.25) : rand(0.3, 0.75));
          else if (books) this.next('wiggle', rand(0.4, 0.8));
          else if (L!.p.y < 0.4 || L!.on === 'sill') this.next('rear');
          else { this.leaps = 0; this.next('leap', rand(0.5, 1)); }
          return true;
        }
        // (no nearer for a good while: stopped, and a fresh start at it)
        if (d < this.best - 0.02) { this.best = d; this.stuck = 0; }
        else if ((this.stuck += dt) > 1.6) { m.stop(); m.zoom = 0; this.best = 1e9; this.stuck = 0; this.via = null; this.aim.set(NaN, 0, 0); }
        // (close, and running straight at a dot on the floor: a running pounce)
        const err = Math.abs(wrapA(Math.atan2(L!.p.x - m.pos.x, L!.p.z - m.pos.z) - m.yaw));
        if (flat && d < 0.42 && d > 0.2 && m.speed > 0.55 && err < 0.3) { this.pounce(c); return true; }
        const fast = d > 0.5 || this.ds > 0.6;
        m.setPosture('stand');
        m.zoom = fast ? 0.8 : 0.3;
        this.goAfter(c, L!, short, fast ? rand(1.05, 1.3) : 0.5, dt);
        m.layer = { pose: { ...keen, hipY: 0.185, neckPitch: 0.05, tailLift: 0.45, tailCurve: -0.2 }, w: Math.min(1, this.t / 0.15) };
        // (brushing past things at a run)
        if (m.speed > 0.6) c.bump(m.pos.clone().setY(0.12), dt * 1.2);
        if (Math.abs(m.yawRate) > 2.6 && m.speed > 0.5 && this.scrabbleIn <= 0) {
          this.scrabbleIn = 0.6;
          c.sound('scrabble', 0.16);
        }
        return true;
      }
      case 'wiggle': {
        // the rump up and wiggling, the hind paws treading, eyes locked on it
        const T = this.target(c, L!), d = Math.hypot(T.x - m.pos.x, T.z - m.pos.z);
        const books = L!.on === 'books';
        if (!books && L!.on !== 'floor' && L!.on !== 'bed') { this.decide(c, L!); return true; }
        if (d > (books ? 0.3 : 0.5)) { this.next(this.ds > 0.5 ? 'run' : 'stalk'); return true; }
        // (squared round to it, as a crouched cat does, a shuffle of the forepaws at a time: not
        // spun on a pin)
        m.stop();
        const err = wrapA(Math.atan2(L!.p.x - m.pos.x, L!.p.z - m.pos.z) - m.yaw);
        m.yaw = wrapA(m.yaw + clamp(err * 4, -1.7, 1.7) * dt);
        m.setPosture('crouch');
        const wg = Math.sin(this.t * Math.PI * 2 * 5);
        m.layer = {
          pose: {
            ...keen, hipY: 0.15, hipPitch: -0.12, neckPitch: -0.45, headPitch: 0.1, hipYaw: 0.1 * wg, hipRoll: 0.07 * wg,
            LH: { y: 0.012 + 0.012 * Math.max(0, wg) }, RH: { y: 0.012 + 0.012 * Math.max(0, -wg) },
            tailLift: -0.3, tailSide: 0.4 * Math.sin(this.t * 11), tailCurl: 0.9 * Math.sin(this.t * 13),
          },
          w: 1,
        };
        // (once square to it, and its last spring a moment behind it: off, when the wiggle is done,
        // or at once if it moves, in reach: the hunter cannot wait)
        const ready = Math.abs(err) < 0.3 && this.total - this.lastPounce > 1.1;
        if (ready && (this.t > this.dur || (this.t > 0.3 && this.ds > 0.25 && d < 0.4))) this.pounce(c);
        return true;
      }
      case 'pounce': {
        // gathered, then up and forward off the hind legs, the forepaws reaching out and coming
        // down on where it was; the way it faces fixed from the moment it leaves the floor; on the
        // books, the forepaws come down on top of them
        const books = (L ? L.on : this.lastOn) === 'books';
        const u = Math.min(1, this.t / this.dur);
        const fx = Math.sin(this.leapYaw), fz = Math.cos(this.leapYaw);
        // (the gather 0 .. 0.2, in the air 0.2 .. 0.8, landing after)
        const air = clamp((u - 0.2) / 0.6, 0, 1), go = smooth(air), arc = Math.sin(Math.PI * air);
        const gather = u < 0.2 ? ease(u / 0.2) : 1 - ease((u - 0.2) / 0.15);
        const land = u > 0.8 ? Math.sin(Math.PI * (u - 0.8) / 0.2) : 0;
        m.yaw = this.leapYaw;
        m.pos.set(this.leapFrom.x + fx * this.leapReach * go, 0, this.leapFrom.z + fz * this.leapReach * go);
        const lift = (0.02 + 0.1 * this.leapReach / 0.5) * arc;
        const top = books ? 0.088 * smooth(u) : 0;
        const fore = { planted: 0, frame: 0, x: 0.03, y: 0.012 + top + 0.09 * arc, z: 0.1 + 0.13 * Math.sin(Math.PI * Math.min(1, air * 1.1)) + (books ? 0.03 * u : 0), flex: 0.35 * arc - 0.2 * land };
        const hind = { planted: 0, frame: 0, x: 0.04, y: 0.013 + 0.03 * arc, z: -0.13 - 0.07 * Math.sin(Math.PI * Math.min(1, air * 1.6)) };
        m.layer = {
          pose: {
            ...keen, hipY: 0.15 - 0.025 * gather + lift + (books ? 0.04 * u : 0) - 0.02 * land, hipPitch: -0.15 * gather,
            chestPitch: 0.25 * arc - 0.12 * gather + (books ? 0.25 * u : 0) - 0.1 * land, neckPitch: -0.2 + 0.1 * arc, headPitch: 0.05,
            LF: fore, RF: fore, LH: hind, RH: hind, tailLift: 0.35 * arc - 0.25, tailCurve: -0.3 * arc,
          },
          w: 1,
        };
        if (u >= 1) {
          c.sound('thump', books ? 0.12 : 0.18);
          const paws = m.pos.clone().addScaledVector(this.fwd.set(fx, 0, fz), books ? 0.18 : 0.19);
          this.pinAt.copy(paws);
          c.bump(paws.clone().setY(0.05), 0.4);
          // on it (as near as a cat can tell): held down; or missed, and a moment to see where it
          // went before it goes after it again
          const near = L && Math.hypot(L.p.x - paws.x, L.p.z - paws.z) < 0.1 && (L.on === 'floor' || L.on === 'bed' || books);
          if (near) { this.side = Math.random() < 0.5 ? 1 : -1; this.next('hold', rand(0.6, 1.2)); }
          else if (L) this.next('land', rand(0.3, 0.6));
          else { this.asked = false; this.next('search'); }
        }
        return true;
      }
      case 'land': {
        // missed: down where it came down, crouched, the head round after it, the tail lashing
        // (and only then after it again)
        m.stop();
        m.setPosture('crouch');
        if (L) m.lookAt(c.gaze('dot') ?? L.p, 1);
        m.layer = { pose: { ...keen, hipY: 0.135, neckPitch: -0.3, tailSide: 0.5 * Math.sin(this.t * 9) }, w: 1 };
        if (this.t > this.dur) {
          m.layer = null;
          if (L) this.decide(c, L);
          else { this.asked = false; this.next('search'); }
        }
        return true;
      }
      case 'hold': {
        // both forepaws pressed down on it, the head down between them; then one paw lifted a
        // little, the head on one side, a look under it (the dot on top of the paw all the while)
        if (L && (Math.hypot(L.p.x - this.pinAt.x, L.p.z - this.pinAt.z) > 0.1 || (L.on !== 'floor' && L.on !== 'bed' && L.on !== 'books'))) {
          m.layer = null;
          this.decide(c, L);
          return true;
        }
        const books = this.lastOn === 'books';
        m.setPosture('crouch');
        const peek = ease((this.t - this.dur) / 0.35);
        const y0 = books ? 0.1 : 0.012;
        const paw = { planted: 0, frame: 0, x: 0.026, y: y0, z: 0.165, flex: 0.15 };
        const lift = { planted: 0, frame: 0, x: 0.03, y: y0 + 0.035 * peek, z: 0.165 - 0.025 * peek, flex: 0.15 + 0.45 * peek };
        m.layer = {
          pose: {
            ...keen, hipY: books ? 0.17 : 0.14, chestPitch: books ? 0.2 : 0.05, neckPitch: -0.65, headPitch: -0.2 - 0.1 * peek, headRoll: 0.3 * peek * this.side,
            LF: this.side > 0 ? lift : paw, RF: this.side > 0 ? paw : lift, tailSide: 0.4 * Math.sin(this.t * 7),
          },
          w: Math.min(1, this.t / 0.1),
        };
        if (this.t > this.dur + 1.1) {
          // (still there, on the paw: at it again)
          m.layer = null;
          if (L) { this.side = -this.side; this.pounce(c); } else { this.asked = false; this.next('search'); }
        }
        return true;
      }
      case 'rear': {
        // up on the hind legs at the foot of it, the forepaws up on the wall (or the sill), patting
        // at it, one and the other
        const D = L!;
        if (D.on === 'floor' || D.on === 'bed' || D.on === 'books') { m.layer = null; this.decide(c, D); return true; }
        const T = this.target(c, D);
        // (gone along the wall, or up out of reach: after it, or a leap)
        if (Math.hypot(T.x - m.pos.x, T.z - m.pos.z) > 0.12) { m.layer = null; this.next('run'); return true; }
        if (D.on === 'up' && D.p.y > 0.42) { m.layer = null; this.leaps = 0; this.next('leap', rand(0.4, 0.8)); return true; }
        // on the sill and out of reach of a paw over its edge, a while: up after it
        if (D.on === 'sill' && this.sill && this.t > 1.2 && (D.p.z < this.sill.launch.z - 0.26 || this.t > 2.6)) { m.layer = null; this.next('gather', rand(0.35, 0.6)); return true; }
        const face = Math.atan2(D.p.x - m.pos.x, D.p.z - m.pos.z);
        m.yaw = wrapA(m.yaw + clamp(wrapA(face - m.yaw), -2, 2) * Math.min(1, dt * 5));
        m.stop();
        m.setPosture('sit');
        const h = clamp(D.p.y, 0.1, 0.37);
        const lx = (D.p.x - m.pos.x) * Math.cos(m.yaw) - (D.p.z - m.pos.z) * Math.sin(m.yaw);
        const out = clamp((D.p.x - m.pos.x) * Math.sin(m.yaw) + (D.p.z - m.pos.z) * Math.cos(m.yaw), 0.1, 0.22);
        const k = Math.floor(this.t / 0.36), u = (this.t % 0.36) / 0.36, pat = Math.sin(Math.PI * u);
        // (each pat a knock at whatever it is on: the pot shakes its leaves, a curtain swings)
        if (k !== this.patK && u > 0.45) { this.patK = k; c.bump(m.pos.clone().addScaledVector(this.fwd, out + 0.04).setY(h), 0.3); }
        const right = (k + (lx > 0 ? 1 : 0)) % 2 === 0;
        const up = ease(this.t / 0.35);
        const hit = { planted: 0, frame: 0, x: 0.02 + Math.abs(lx) * 0.5, y: 0.05 + (h + 0.02 * pat - 0.05) * up, z: 0.07 + (out - 0.07 - 0.015 * pat) * up, flex: 0.25 + 0.3 * pat };
        const rest = { planted: 0, frame: 0, x: 0.035, y: 0.05 + (h - 0.08) * up, z: 0.07 + (out - 0.09) * up, flex: 0.5 };
        m.layer = {
          pose: { ...keen, chestPitch: -1.02 - 0.18 * up, hipY: 0.056 + 0.03 * up, neckPitch: 0.25 * up, headPitch: -0.1, LF: right ? rest : hit, RF: right ? hit : rest, tailSide: 0.5 * Math.sin(this.t * 6) },
          w: 1,
        };
        return true;
      }
      case 'leap': {
        // high up on the wall: sat under it looking up, the rump wiggling; then straight up at
        // it, the forepaws reaching, and down again; a few times, then it sits and only watches
        const D = L;
        if (D && D.on !== 'up') { m.layer = null; this.decide(c, D); return true; }
        if (D) {
          const T = this.target(c, D);
          if (Math.hypot(T.x - m.pos.x, T.z - m.pos.z) > 0.15 && this.t < this.dur) { m.layer = null; this.next('run'); return true; }
        }
        const at = D ? D.p : this.last;
        const face = Math.atan2(at.x - m.pos.x, at.z - m.pos.z);
        m.yaw = wrapA(m.yaw + clamp(wrapA(face - m.yaw), -2, 2) * Math.min(1, dt * 5));
        m.stop();
        const H = clamp(at.y - 0.32, 0.06, 0.3);
        if (this.t < this.dur || this.leaps >= 3) {
          // (watching it up there: chattering at it now and then once it has given up leaping)
          m.setPosture('crouch');
          const wg = this.leaps < 3 ? Math.sin(this.t * Math.PI * 2 * 5) : 0;
          const chat = this.leaps >= 3 ? 0.1 + 0.09 * Math.max(0, Math.sin(this.t * Math.PI * 2 * 11)) * (Math.sin(this.t * 1.3) > 0.6 ? 1 : 0) : 0;
          m.layer = { pose: { ...keen, hipY: 0.15, neckPitch: 0.5, headPitch: 0.15, hipYaw: 0.08 * wg, jaw: chat, LH: { y: 0.012 + 0.01 * Math.max(0, wg) }, RH: { y: 0.012 + 0.01 * Math.max(0, -wg) } }, w: Math.min(1, this.t / 0.25) };
          if (this.leaps >= 3 && this.t > 4) { this.leaps = 0; this.next('leap', rand(0.4, 0.8)); }
          return true;
        }
        const u = Math.min(1, (this.t - this.dur) / 0.62);
        const s = Math.sin(Math.PI * u);
        c.hold(H * s);
        const fore = { planted: 0, frame: 0, x: 0.03, y: 0.012 + (0.13 + H * 0.4) * Math.sin(Math.PI * Math.min(1, u * 1.2)), z: 0.1 + 0.03 * s, flex: 0.2 + 0.3 * s };
        const hind = { planted: 0, frame: 0, x: 0.04, y: 0.013 + 0.02 * s, z: -0.12 - 0.05 * s };
        m.layer = { pose: { ...keen, hipY: 0.18, chestPitch: 0.75 * s, neckPitch: 0.35 * s, headPitch: 0.1, LF: fore, RF: fore, LH: hind, RH: hind, tailLift: -0.3 + 0.6 * s }, w: 1 };
        if (u > 0.45 && !this.patted) { this.patted = true; c.bump(m.pos.clone().addScaledVector(this.fwd, 0.12).setY(0.3 + H), 0.6); }
        if (u >= 1) {
          c.hold(null);
          c.sound('thump', 0.15);
          this.leaps++;
          this.patted = false;
          this.next('leap', rand(0.5, 1.1));
        }
        return true;
      }
      case 'search': {
        // where did it go? stock still a moment, eyes on where it was; a look round, this way and
        // that; then at you, as if you might know
        if (L) { m.layer = null; this.next('notice', rand(0.08, 0.2)); return true; }
        const g = this.gone;
        if (m.speed < 0.1 && !DOWN.has(m.targetPosture)) m.setPosture(g > 2.5 ? 'sit' : 'crouch');
        let pose: PoseLayer = { earFwd: 0.6, pupil: 0.85, eyeOpen: 1, whisker: 0.5 };
        if (g < 0.8) { m.lookAt(this.last, 1); this.turnTo(c, this.last); }
        else if (g < 3.4) {
          m.lookAt(null);
          const a = Math.sin((g - 0.8) * 2.4) * 0.85 * this.side;
          pose = { ...pose, neckYaw: a, headYaw: 0.5 * a, headRoll: -0.12 * a, neckPitch: -0.15 };
          // (and round on the spot, one way and then the other: a look behind it too)
          if (!m.goal && ((g > 1.3 && g - dt <= 1.3) || (g > 2.4 && g - dt <= 2.4))) {
            m.walkTo(m.pos.clone(), 0.25, m.yaw + (g < 2 ? 1 : -1) * this.side * 2.1);
          }
        } else if (g < 5.8) {
          // (round to you first, if it is facing away)
          if (Math.abs(wrapA(m.yaw)) > 1.4 && !m.goal && g < 4) m.walkTo(m.pos.clone(), 0.2, rand(-0.5, 0.5));
          m.lookAt(c.viewer(), 1);
          if (!this.asked && !m.goal) { this.asked = true; if (Math.random() < 0.45) c.say(Math.random() < 0.5 ? 'meowSoft' : 'trill'); }
        } else {
          // given up on it: a wash, as if nothing had happened
          m.lookAt(null);
          m.layer = null;
          this.wash = Math.random() < 0.6 ? washFace() : null;
          return !!this.wash;
        }
        m.layer = { pose, w: Math.min(1, this.t / 0.3) };
        return true;
      }
      case 'tired': {
        // had enough: down on its chest where it is, the head still going after it, the tail tip
        // flicking; a lazy paw at it if it comes right under its nose
        if (!L) { if (this.gone > 2.5) { m.lookAt(null); m.layer = null; return false; } return true; }
        m.setPosture('sphinx');
        const d = Math.hypot(L.p.x - m.pos.x, L.p.z - m.pos.z);
        const near = (L.on === 'floor' || L.on === 'bed') && d < 0.3 && d > 0.12;
        const swipe = near ? Math.max(0, Math.sin(this.t * 2.2)) : 0;
        m.layer = {
          pose: { earFwd: 0.5, pupil: 0.8, eyeOpen: 0.75, tailCurl: 0.5 * Math.sin(this.t * 4), ...(swipe > 0.3 ? { LF: { planted: 0, frame: 0, x: 0.04, y: 0.012 + 0.04 * swipe, z: 0.2 + 0.05 * swipe, flex: 0.3 } } : {}) },
          w: Math.min(1, this.t / 0.6),
        };
        return true;
      }
    }
    return true;
  }

  /** what to do about the dot where it is now */
  private decide(c: Ctx, L: LaserDot) {
    const m = c.m;
    m.layer = null;
    const T = this.target(c, L), d = Math.hypot(T.x - m.pos.x, T.z - m.pos.z);
    this.aim.set(NaN, 0, 0);
    this.via = null;
    if (L.on === 'floor' || L.on === 'bed') {
      if (d < 0.36) this.next('wiggle', rand(0.35, 0.8));
      else if (this.ds > 0.45 || d > 0.85) this.next('run');
      else this.next('stalk');
      return;
    }
    // (on the books, on the wall, on the sill: to the foot of it, quick or not)
    this.next('run');
  }

  /** a thing round behind it, further than its head will turn: round on the spot to face it
   *  (false: it is in front already) */
  private turnTo(c: Ctx, p: THREE.Vector3) {
    const m = c.m, face = Math.atan2(p.x - m.pos.x, p.z - m.pos.z);
    if (Math.abs(wrapA(face - m.yaw)) < 1.1) return false;
    if (!m.goal) m.walkTo(m.pos.clone(), 0.25, face);
    return true;
  }

  /** a pounce: how far to carry (the forepaws to come down on the dot, as near as a cat can
   *  judge), the way it faces now, and the longer the leap the longer it takes */
  private pounce(c: Ctx) {
    const m = c.m, L = c.laser();
    m.stop();
    m.zoom = 0;
    // (the run's way on is in the leap now)
    m.speed = 0;
    this.leapFrom.copy(m.pos);
    this.leapYaw = m.yaw;
    const at = L ? L.p : this.last, books = (L ? L.on : this.lastOn) === 'books';
    const along = (at.x - m.pos.x) * Math.sin(m.yaw) + (at.z - m.pos.z) * Math.cos(m.yaw);
    this.leapReach = books ? 0.04 : clamp(along - 0.19 + rand(-0.03, 0.03), 0.04, 0.5);
    // (not into anything: no further than the floor there is clear)
    const to = m.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw)), this.leapReach);
    const clear = c.keepClear(to.clone(), 0.12);
    if (clear.distanceTo(to) > 0.02) this.leapReach = Math.max(0.04, this.leapReach - clear.distanceTo(to));
    this.lastPounce = this.total;
    this.next('pounce', 0.3 + 0.32 * this.leapReach / 0.5);
  }

  /** after it up on the windowsill: a gather, the spring up, hunting it along the sill (anything
   *  in the way goes over the edge), and down again when it has gone off the sill */
  private aloft(dt: number, c: Ctx, L: LaserDot | null) {
    const m = c.m, S = this.sill!;
    const keen: PoseLayer = { earFwd: 0.95, pupil: 1, eyeOpen: 1, whisker: 0.9, tailCurl: 0.7 * Math.sin(this.total * 9) };
    if (L) m.lookAt(c.gaze('dot') ?? L.p, 1);
    // (the sill's length a cat can go along, its body clear of the plant at one end and the radio
    // at the other)
    const sx = (x: number) => clamp(x, S.seat.x - 0.1, S.seat.x + 0.06);
    switch (this.phase) {
      case 'gather': {
        // down on its haunches, eyes up on where it is going
        if (this.leaving || !L || L.on !== 'sill') { m.layer = null; this.next(L ? 'run' : 'search'); return true; }
        m.setPosture('crouch');
        const face = Math.PI;
        m.yaw = wrapA(m.yaw + clamp(wrapA(face - m.yaw), -2.5, 2.5) * Math.min(1, dt * 6));
        m.layer = { pose: { ...keen, neckPitch: 0.55, headPitch: 0.05, hipY: 0.135, tailLift: -0.2 }, w: Math.min(1, this.t / 0.2) };
        if (this.t > this.dur) {
          this.from.copy(m.pos);
          c.hold(0);
          this.next('up', 0.42);
        }
        return true;
      }
      case 'up': {
        // the spring up onto it, toward the dot
        const u = Math.min(1, this.t / this.dur);
        const seat = new THREE.Vector3(sx(L ? L.p.x : this.from.x), 0, S.seat.z + 0.04);
        m.pos.lerpVectors(this.from, seat, smooth(u));
        m.yaw = wrapA(m.yaw + clamp(wrapA(Math.PI - m.yaw), -3, 3) * Math.min(1, dt * 8));
        c.hold(S.height * smooth(Math.min(1, u * 1.15)) + 0.08 * Math.sin(Math.PI * u));
        const fy = 0.012 + 0.11 * Math.sin(Math.PI * Math.min(1, u / 0.75));
        const fore = { planted: 0, frame: 0, x: 0.035, y: fy, z: 0.11 + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.25)), flex: 0.3 * Math.sin(Math.PI * u) };
        const hind = { planted: 0, frame: 0, x: 0.04, y: 0.013 + 0.05 * Math.sin(Math.PI * u), z: -0.16 - 0.07 * (1 - u) * Math.sin(Math.PI * Math.min(1, u * 2)) };
        m.layer = { pose: { hipY: 0.2, chestPitch: 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.3)), neckPitch: 0.2, earFwd: 0.8, LF: fore, RF: fore, LH: hind, RH: hind, tailLift: 0.4 }, w: 1 };
        if (u >= 1) {
          c.perch(S.height);
          c.hold(null);
          m.layer = null;
          c.sound('thump', 0.28);
          // (landing on the pencil: over the edge it goes)
          this.brush(c, m.pos, 0.09);
          this.next('sill');
        }
        return true;
      }
      case 'sill': {
        // up here after it: crouched, turning to it, a quick pat or a pounce along the sill; gone
        // off the sill (or asked down), a look down and off
        this.offSill = !L || L.on !== 'sill' ? this.offSill + dt : 0;
        if (this.leaving || this.offSill > (L ? 0.45 : 1.5)) {
          m.layer = null;
          this.next('look', 0.45);
          return true;
        }
        m.setPosture('crouch');
        const at = L ? L.p : this.last;
        const dx = at.x - m.pos.x, dz = at.z - m.pos.z, d = Math.hypot(dx, dz);
        const face = Math.atan2(dx, dz);
        m.yaw = wrapA(m.yaw + clamp(wrapA(face - m.yaw), -3, 3) * Math.min(1, dt * 5));
        // (a quick spring along the sill to it, when it is off a way)
        if (L && L.on === 'sill' && d > 0.16 && this.t > 0.35 && Math.abs(wrapA(face - m.yaw)) < 0.5) {
          this.pinAt.set(sx(at.x - (dx / d) * 0.12), 0, clamp(at.z - (dz / d) * 0.12, S.seat.z - 0.02, S.seat.z + 0.1));
          // (only if it gets it anywhere: off past the radio, it stays and watches it there)
          if (Math.hypot(this.pinAt.x - m.pos.x, this.pinAt.z - m.pos.z) > 0.05) {
            this.from.copy(m.pos);
            this.next('spring', 0.3);
            return true;
          }
        }
        const wg = Math.sin(this.t * Math.PI * 2 * 5);
        const pat = L && d < 0.2 ? Math.max(0, Math.sin(this.t * 7)) : 0;
        m.layer = {
          pose: {
            ...keen, hipY: 0.145, neckPitch: -0.4, headPitch: 0.1, hipYaw: 0.06 * wg,
            ...(pat > 0.2 ? { [this.side > 0 ? 'LF' : 'RF']: { planted: 0, frame: 0, x: 0.03, y: 0.012 + 0.05 * pat, z: 0.12 + 0.06 * pat, flex: 0.3 } } : {}),
            tailLift: -1.2, tailSag: 1,
          },
          w: Math.min(1, this.t / 0.2),
        };
        if (pat > 0.9) this.brush(c, m.pos.clone().addScaledVector(this.fwd, 0.17), 0.05);
        return true;
      }
      case 'spring': {
        // a little leap along the sill, both forepaws coming down on it
        const u = Math.min(1, this.t / this.dur), arc = Math.sin(Math.PI * u);
        m.pos.lerpVectors(this.from, this.pinAt, smooth(u));
        c.hold(S.height + 0.04 * arc);
        const fore = { planted: 0, frame: 0, x: 0.03, y: 0.012 + 0.06 * arc, z: 0.12 + 0.08 * arc, flex: 0.2 * arc };
        m.layer = { pose: { ...keen, hipY: 0.15 + 0.04 * arc, chestPitch: 0.25 * arc, LF: fore, RF: fore, tailLift: -0.6 }, w: 1 };
        if (u >= 1) {
          c.hold(null);
          c.perch(S.height);
          c.sound('thump', 0.12);
          this.brush(c, m.pos.clone().addScaledVector(this.fwd, 0.17), 0.07);
          this.next('sill');
        }
        return true;
      }
      case 'look': {
        // round to the room, a look down at where it will land
        m.setPosture('crouch');
        m.yaw = wrapA(m.yaw + clamp(wrapA(0 - m.yaw), -3, 3) * Math.min(1, dt * 5));
        m.layer = { pose: { neckPitch: -0.7, headPitch: -0.2, earFwd: 0.7, hipY: 0.14 }, w: Math.min(1, this.t / 0.25) };
        if (this.t > this.dur && Math.abs(wrapA(m.yaw)) < 0.3) {
          this.from.copy(m.pos);
          c.perch(null);
          c.hold(S.height);
          this.next('down', 0.4);
        }
        return true;
      }
      case 'down': {
        const u = Math.min(1, this.t / this.dur);
        const land = new THREE.Vector3(this.from.x, 0, S.land.z);
        m.pos.lerpVectors(this.from, land, smooth(u));
        m.yaw = 0;
        c.hold(S.height * (1 - smooth(Math.min(1, u * 1.1))) + 0.05 * Math.sin(Math.PI * u));
        const fore = { planted: 0, frame: 0, x: 0.035, y: 0.012 - 0.03 * Math.sin(Math.PI * Math.min(1, u * 1.3)), z: 0.13 + 0.07 * Math.sin(Math.PI * u), flex: 0.25 };
        const hind = { planted: 0, frame: 0, x: 0.04, y: 0.013 + 0.03 * Math.sin(Math.PI * u), z: -0.17 };
        m.layer = { pose: { hipY: 0.2, chestPitch: -0.45 * Math.sin(Math.PI * u), neckPitch: -0.2, LF: fore, RF: fore, LH: hind, RH: hind, tailLift: 0.5 }, w: 1 };
        if (u >= 1) {
          c.hold(null);
          m.layer = null;
          m.setPosture('stand');
          c.sound('thump', 0.38);
          if (this.leaving) return false;
          if (L) this.decide(c, L);
          else { this.asked = false; this.next('search'); }
        }
        return true;
      }
    }
    return true;
  }

  /** paws up on the sill coming down by the pencil: it goes over the edge */
  private brush(c: Ctx, at: THREE.Vector3, r: number) {
    const P = c.pencil();
    if (P && P.onSill && Math.hypot(P.at.x - at.x, P.at.z - at.z) < r + 0.06) c.pushPencil(0.12, 0.03 * Math.sign(P.at.x - at.x || 1));
    // (the mug, standing up, is knocked by a body or a paw close by: along the sill toward the
    // room, a long way, or over)
    const M = c.mug();
    if (M && M.onSill && Math.hypot(M.at.x - at.x, M.at.z - at.z) < r + 0.045) c.pushMug(0.13, 0.03 * Math.sign(M.at.x - at.x || 1));
  }

  stop(c: Ctx) {
    this.wash?.stop(c);
    c.m.layer = null;
    c.m.zoom = 0;
    c.m.lookAt(null);
    c.hold(null);
  }
}

/**
 * A crash in the room (the mug in pieces on the floor): a start, up off all four feet with the fur
 * on end and the ears flat; away from it at a scramble, a few strides; round to stare at it from
 * there, low, the ears back; and, nothing more happening, creeping up to it for a sniff at the
 * pieces, a paw put out to one, and off.
 */
export class Startle implements Act {
  readonly name = 'startle';
  private phase: 'jump' | 'flee' | 'stare' | 'creep' | 'sniff' = 'jump';
  private t = 0;
  private dur = 0.36;
  private readonly to = new THREE.Vector3();

  constructor(c: Ctx, private readonly at: THREE.Vector3) {
    // away from it, the other way, a good few strides, onto open floor
    const m = c.m;
    const dx = m.pos.x - at.x, dz = m.pos.z - at.z, d = Math.hypot(dx, dz) || 1;
    this.to.set(m.pos.x + (dx / d) * 0.55, 0, m.pos.z + (dz / d) * 0.55);
    c.keepClear(this.to, 0.14);
  }

  get ownGaze() {
    return true;
  }

  private next(phase: Startle['phase'], dur = 0) {
    this.phase = phase;
    this.t = 0;
    this.dur = dur;
  }

  update(dt: number, c: Ctx) {
    const m = c.m;
    this.t += dt;
    const face = Math.atan2(this.at.x - m.pos.x, this.at.z - m.pos.z);
    switch (this.phase) {
      case 'jump': {
        // straight up off the floor, back up, fur on end, ears flat, eyes on it
        const u = Math.min(1, this.t / this.dur), s = Math.sin(Math.PI * u);
        m.stop();
        c.hold(0.07 * s);
        m.lookAt(this.at, 1);
        m.setPosture('stand');
        m.layer = { pose: { puff: 1, earFlat: 1, earFwd: -0.8, earOut: 0.5, pupil: 1, eyeOpen: 1, whisker: -0.5, tailLift: 1.2, tailCurve: -0.5, hipY: 0.2, lumbarPitch: 0.25 * s }, w: Math.min(1, this.t / 0.06) };
        if (u >= 1) {
          c.hold(null);
          m.zoom = 1;
          m.walkTo(this.to, 1.35, null);
          c.sound('scrabble', 0.3);
          this.next('flee');
        }
        return true;
      }
      case 'flee': {
        // off at a scramble, low, the tail up and bushed
        m.setPosture('stand');
        m.lookAt(null);
        m.layer = { pose: { puff: 0.8, earFwd: -0.6, earFlat: 0.6, tailLift: 0.9, hipY: 0.17 }, w: 1 };
        if (!m.goal || this.t > 2.2) {
          m.zoom = 0;
          m.walkTo(m.pos.clone(), 0.25, face);
          this.next('stare', rand(3, 6));
        }
        return true;
      }
      case 'stare': {
        // round to it and down low, staring, the fur going down and the ears coming round to it
        m.setPosture('crouch');
        m.lookAt(this.at, 1);
        const k = Math.min(1, this.t / this.dur);
        m.layer = { pose: { puff: 0.6 * (1 - k), earFwd: -0.5 + 1.2 * k, earFlat: 0.6 * (1 - k), pupil: 1, eyeOpen: 1, hipY: 0.13, tailLift: -0.3, tailCurl: 0.6 * Math.sin(this.t * 5) }, w: 1 };
        if (this.t > this.dur && !m.goal) {
          const d = Math.hypot(this.at.x - m.pos.x, this.at.z - m.pos.z) || 1;
          const stop = new THREE.Vector3(this.at.x - ((this.at.x - m.pos.x) / d) * 0.24, 0, this.at.z - ((this.at.z - m.pos.z) / d) * 0.24);
          c.keepClear(stop, 0.12);
          m.walkTo(stop, 0.16, face);
          this.next('creep');
        }
        return true;
      }
      case 'creep': {
        // creeping up on it, stretched out long and low, ready to be off
        m.lookAt(this.at, 1);
        m.layer = { pose: { earFwd: 0.7, pupil: 0.9, eyeOpen: 1, hipY: 0.14, neckPitch: -0.3, headPitch: 0.15, tailLift: -0.4 }, w: 1 };
        if (!m.goal || this.t > 6) this.next('sniff', rand(2.5, 4));
        return true;
      }
      case 'sniff': {
        // the nose down to it, working; a paw put out to a piece, and drawn back
        m.lookAt(null);
        m.setPosture('crouch');
        const paw = this.t > this.dur * 0.55 && this.t < this.dur * 0.8 ? Math.sin(Math.PI * (this.t - this.dur * 0.55) / (this.dur * 0.25)) : 0;
        m.layer = {
          pose: {
            neckPitch: -0.9, headPitch: -0.35 + 0.05 * Math.sin(this.t * 14), whisker: 0.7, earFwd: 0.5, hipY: 0.14,
            ...(paw > 0 ? { RF: { planted: 0, frame: 0, x: 0.04, y: 0.012 + 0.03 * paw, z: 0.13 + 0.07 * paw, flex: 0.4 } } : {}),
          },
          w: Math.min(1, this.t / 0.4) * Math.min(1, (this.dur - this.t) / 0.4),
        };
        return this.t < this.dur;
      }
    }
    return true;
  }

  stop(c: Ctx) {
    c.m.layer = null;
    c.m.zoom = 0;
    c.m.lookAt(null);
    c.hold(null);
  }
}
