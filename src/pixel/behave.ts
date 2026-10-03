import * as THREE from 'three';
import type { Motor } from '../cat3d/motor';
import type { Mood } from '../cat3d/mood';
import type { PoseLayer, PoseName } from '../cat3d/pose';

/**
 * What a cat does by itself between the brain's big decisions (sleep, errands, being stroked): a
 * small repertoire of little scripts on the motor (postures, walks, and motions laid over the
 * pose), picked by what the brain is up to, how the cat feels, and where it is.
 */
export interface Ctx {
  m: Motor;
  /** the middle of its bed */
  home: THREE.Vector3;
  /** just inside the glass, in front of the bed */
  window: THREE.Vector3;
  /** the floor it may wander over */
  room: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** the brain's mode */
  mode: string;
  mood: Mood;
  /** the brain wants kneading (purring under a hand) */
  kneading: boolean;
  /** where to stand and which way to face to lie down in a posture in the middle of the bed */
  bed: (p: PoseName) => { to: THREE.Vector3; yaw: number };
  /** places in the room worth a sniff */
  sniff: () => { to: THREE.Vector3; face: number }[];
  /** a place on the floor in the sun, if the sun is in */
  sun: () => THREE.Vector3 | null;
  /** a warm place by the radiator, if the heating is on, and which way to lie along it */
  warm: () => { at: THREE.Vector3; face: number } | null;
  /** where to stand, and which way to face, to lie down in a posture with the middle of the body
   *  at a point and the face turned a way */
  lieAt: (p: PoseName, at: THREE.Vector3, face: number) => { to: THREE.Vector3; yaw: number };
  /** the ball of wool, if there is one, and a paw sending it rolling */
  yarn: () => THREE.Vector3 | null;
  kick: (dir: THREE.Vector3, speed: number) => void;
  /** a finger has the ball (moving it about for the cat); paws pin it down a while, at a point
   *  (held under them however the finger pulls), and whether they still have it */
  toyHeld: () => boolean;
  pin: (sec: number, at: THREE.Vector3) => void;
  toyPinned: () => boolean;
  /** the windowsill, if there is one to sit on */
  sill: () => SillSpot | null;
  /** a cardboard box on the floor, if one is out */
  box: () => SillSpot | null;
  /** a sound of the cat's own (a soft thump landing from a jump) */
  sound: (name: string, gain: number) => void;
  /** how hard it is raining (0 .. 1): a grey day is for watching it from the sill */
  rain: number;
  /** how dark it is outside (0 day .. 1 night): the lit town is for watching too */
  night: number;
  /** birds going by outside the window (where, on the glass), if any; a chirp at them */
  birds: () => THREE.Vector3 | null;
  chirp: () => void;
  /** a moth or a fly about the room, if there is one (resting: landed somewhere), and a swipe at
   *  it from a point, which sends it off */
  bug: () => { p: THREE.Vector3; resting: boolean } | null;
  scareBug: (from: THREE.Vector3) => void;
  /** one raindrop running down the glass, at a point on it (null: none) */
  drop: (p: THREE.Vector3 | null) => void;
  /** up on something this high (null: on the floor), and held in the air at a height (a jump) */
  perch: (h: number | null) => void;
  hold: (lift: number | null) => void;
}

export interface SillSpot { launch: THREE.Vector3; seat: THREE.Vector3; land: THREE.Vector3; height: number }

/** one thing the cat does: update returns false when it is over; stop cuts it short cleanly */
export interface Act {
  readonly name: string;
  update(dt: number, c: Ctx): boolean;
  stop(c: Ctx): void;
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** up, held, and back down over [0, d], with ramps of r seconds */
const hump = (t: number, d: number, r: number) => ease(t / r) * ease((d - t) / r);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** a motion laid over the pose for a while, shaped by a function of time */
class Layered implements Act {
  private t = 0;
  constructor(readonly name: string, private readonly dur: number, private readonly ramp: number,
    private readonly shape: (t: number) => PoseLayer, private readonly posture: PoseName | null = null) {}
  update(dt: number, c: Ctx) {
    this.t += dt;
    if (this.posture) c.m.setPosture(this.posture);
    c.m.layer = { pose: this.shape(this.t), w: hump(this.t, this.dur, this.ramp) };
    return this.t < this.dur;
  }
  stop(c: Ctx) {
    c.m.layer = null;
  }
}

/** a big yawn: the mouth wide, eyes squeezed, head back, ears out */
export const yawn = () => new Layered('yawn', 2.4, 0.7, () => ({
  jaw: 1, eyeOpen: 0.08, squint: 0.8, headPitch: 0.35, neckPitch: 0.1, earOut: 0.35, earFwd: -0.3,
}));

/** washing a flank: head round to the side and down, licking in strokes */
export const groomFlank = () => {
  const side = Math.random() < 0.5 ? 1 : -1, d = rand(5, 9);
  return new Layered('groom', d, 0.7, (t) => ({
    neckYaw: side * 1.05, headYaw: side * 0.7, neckPitch: -0.35, headPitch: -0.35 + 0.13 * Math.sin(t * 9),
    jaw: 0.12 * Math.max(0, Math.sin(t * 9)), eyeOpen: 0.35, squint: 0.3,
  }));
};

/** washing the chest: chin tucked, licking down the bib */
export const groomChest = () => new Layered('groom chest', rand(3, 6), 0.6, (t) => ({
  neckPitch: -0.75, headPitch: -0.55 + 0.12 * Math.sin(t * 8.5), jaw: 0.1 * Math.max(0, Math.sin(t * 8.5)), eyeOpen: 0.4,
}));

/** washing the face: sitting up, a forepaw raised to the mouth and licked, then drawn up over the
 *  cheek to behind the ear with the head turned down into it, and again and again; then perhaps
 *  the other side. The eyes half shut all the while */
export const washFace = () => {
  const first = Math.random() < 0.5 ? 1 : -1;
  const cyc = rand(1.3, 1.7), n = 3 + Math.floor(Math.random() * 3);
  const both = Math.random() < 0.6;
  const d = cyc * n * (both ? 2 : 1) + 0.6;
  return new Layered('wash', d, 0.5, (t) => {
    const k = Math.floor(t / cyc), u = (t % cyc) / cyc;
    const s = both && k >= n ? -first : first;
    const paw = s > 0 ? 'LF' : 'RF';
    // up to the mouth (a quarter of the turn), licked (the next), then the wipe up and back over
    // the cheek and ear, and down to the mouth again
    const reach = Math.min(1, u / 0.12);
    const lick = u > 0.12 && u < 0.45;
    const w = u >= 0.45 ? Math.sin(Math.PI * (u - 0.45) / 0.55) : 0;
    const pose: PoseLayer = {
      [paw]: {
        planted: 0, frame: 0,
        x: 0.012 + 0.03 * w, y: 0.06 + 0.15 * reach + 0.06 * w, z: 0.08 + 0.055 * reach - 0.035 * w, flex: 0.85,
      },
      headPitch: -0.32 - 0.25 * reach * (1 - w) + 0.1 * w, headYaw: s * 0.35 * w, headRoll: s * 0.4 * w,
      neckPitch: -0.1 * reach,
      jaw: lick ? 0.16 * Math.max(0, Math.sin(t * 15)) : 0.04,
      eyeOpen: 0.3, squint: 0.55, earFwd: -0.2 * w,
    };
    return pose;
  }, 'sit');
};

/** kneading: the front paws treading in turn, as kittens do at their mother */
export const knead = () => new Layered('knead', 1e9, 0.5, (t) => {
  const ph = t * Math.PI * 2 * 1.4;
  const l = Math.max(0, Math.sin(ph)), r = Math.max(0, Math.sin(ph + Math.PI));
  return { LF: { y: 0.012 + 0.02 * l, flex: 0.4 * l }, RF: { y: 0.012 + 0.02 * r, flex: 0.4 * r }, eyeOpen: 0.3, squint: 0.5 };
}, 'sphinx');

/** a stretch: up, forelegs out and rump high, then back down */
export class Stretch implements Act {
  readonly name = 'stretch';
  private t = 0;
  constructor(private readonly then: PoseName) {}
  update(dt: number, c: Ctx) {
    this.t += dt;
    c.m.setPosture(this.t < 3.6 ? 'stretch' : this.then);
    return this.t < 5;
  }
  stop() {}
}

interface Leg {
  to: THREE.Vector3;
  /** which way to face on arrival (null: as it comes) */
  face: number | null;
  /** seconds there */
  stay: number;
  posture: PoseName;
  layer?: (t: number) => PoseLayer;
}

/** walking somewhere and doing something there, then on */
class Walk implements Act {
  private i = 0;
  private arrived = false;
  private t = 0;
  constructor(readonly name: string, private readonly legs: Leg[], private readonly speed = 0.25) {}
  update(dt: number, c: Ctx) {
    const leg = this.legs[this.i];
    if (!leg) return false;
    if (!this.arrived) {
      // up on its feet (again, if something sat it down on the way)
      c.m.setPosture('stand');
      if (!c.m.goal) {
        // a waypoint with nothing to do there is walked through
        const pass = leg.stay <= 0 && this.i < this.legs.length - 1;
        c.m.walkTo(leg.to, this.speed, leg.face, () => { this.arrived = true; this.t = 0; }, pass);
      }
      return true;
    }
    this.t += dt;
    c.m.setPosture(leg.posture);
    c.m.layer = leg.layer ? { pose: leg.layer(this.t), w: hump(this.t, leg.stay, 0.5) } : null;
    if (this.t > leg.stay) {
      c.m.layer = null;
      this.i++;
      this.arrived = false;
    }
    return true;
  }
  stop(c: Ctx) {
    c.m.layer = null;
    c.m.stop();
  }
}

/** come to the glass and sit looking at you a while, then back to bed */
export const toWindow = (c: Ctx) => {
  const bed = c.bed('loaf');
  return new Walk('window', [
    { to: c.window, face: 0, stay: rand(8, 22), posture: 'sit' },
    { to: bed.to, face: bed.yaw, stay: 0.1, posture: 'loaf' },
  ]);
};

/** potter about: a spot or two on the floor, a sniff there, home again */
export const wander = (c: Ctx) => {
  // somewhere on the floor round the bed, clear of it
  const spot = () => {
    const a = rand(-0.4, Math.PI + 0.4), r = rand(0.3, 0.42);
    return new THREE.Vector3(c.home.x + r * Math.cos(a), 0, c.home.z + r * Math.sin(a) * 0.8);
  };
  // sniffing: standing, the head right down to the floor, the nose working
  const sniff = (t: number): PoseLayer => ({ neckPitch: -1.05, headPitch: -0.45 + 0.05 * Math.sin(t * 14), whisker: 0.6, earFwd: 0.4, hipY: 0.19 });
  // one or two of the room's places worth a sniff, or a spot on the floor
  const places = c.sniff().slice().sort(() => Math.random() - 0.5);
  const first = places.length ? places[0] : { to: spot(), face: null as number | null };
  const legs: Leg[] = [{ to: first.to, face: first.face, stay: rand(1.5, 3), posture: 'stand', layer: sniff }];
  if (Math.random() < 0.5) {
    const next = places.length > 1 && Math.random() < 0.6 ? places[1] : { to: spot(), face: null as number | null };
    legs.push({ to: next.to, face: next.face, stay: rand(2, 5), posture: pick<PoseName>(['sit', 'stand']) });
  }
  const bed = c.bed('loaf');
  legs.push({ to: bed.to, face: bed.yaw, stay: 0.1, posture: 'loaf' });
  return new Walk('wander', legs);
};

/** lie a long while in the patch of sun on the floor, as cats will, then back to bed */
export const sunbathe = (c: Ctx) => {
  const spot = c.sun();
  if (!spot) return null;
  const bed = c.bed('loaf');
  const posture = pick<PoseName>(['side', 'side', 'loaf', 'sphinx']);
  const place = c.lieAt(posture, spot, rand(-0.7, 0.7));
  return new Walk('sun', [
    { to: place.to, face: place.yaw, stay: rand(40, 100), posture },
    { to: bed.to, face: bed.yaw, stay: 0.1, posture: 'loaf' },
  ]);
};

/** in the heating months, a long while lying on the floor by the warm radiator, then back to bed */
export const warmUp = (c: Ctx) => {
  const spot = c.warm();
  if (!spot) return null;
  const bed = c.bed('loaf');
  const posture = pick<PoseName>(['loaf', 'loaf', 'side', 'sphinx']);
  const place = c.lieAt(posture, spot.at, spot.face + rand(-0.2, 0.2));
  return new Walk('warm', [
    { to: place.to, face: place.yaw, stay: rand(45, 120), posture },
    { to: bed.to, face: bed.yaw, stay: 0.1, posture: 'loaf' },
  ]);
};

const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Play with the ball of wool: creep up to a pounce away from it, crouch low and watch it (eyes
 * wide, ears forward, the tip of the tail flicking), the rump up and wiggling, then spring and
 * land on it with both forepaws, and bat it about with one paw and the other; perhaps after it
 * once more where it rolled; then sit and wash a little, and back to bed.
 *
 * A ball under a finger is another thing: the head follows it everywhere; moved away it is run
 * after, moved at all it is pounced on, brushed past close it gets a swipe; and caught, it is
 * pinned under both forepaws and bitten at until it is pulled free (the finger feels the paws).
 * So long as the hand keeps it going the cat keeps on, until it has had enough.
 */
export class Play implements Act {
  readonly name = 'play';
  private phase: 'go' | 'stalk' | 'wiggle' | 'pounce' | 'bat' | 'pin' | 'sit' = 'go';
  private t = 0;
  private dur = 0;
  private rounds = 0;
  private bats = 0;
  private hits = new Set<number>();
  private caught = false;
  private bed: Act | null = null;
  private readonly fwd = new THREE.Vector3();
  private readonly left = new THREE.Vector3();
  /** where the ball was a frame ago and how fast it is going; where the walk after it was aimed */
  private readonly was = new THREE.Vector3(NaN, 0, 0);
  private ys = 0;
  private readonly aim = new THREE.Vector3(NaN, 0, 0);
  /** how long it has played, and how long it will before it has had enough */
  private total = 0;
  private readonly patience = rand(70, 150);
  /** how long since a hand last had the ball */
  private sinceHand = 1e9;

  /** it has had enough (and will not be tempted again for a while) */
  get tired() {
    return this.total > this.patience;
  }

  private next(phase: Play['phase'], dur = 0) {
    this.phase = phase;
    this.t = 0;
    this.dur = dur;
  }

  update(dt: number, c: Ctx) {
    const m = c.m;
    const y = c.yarn();
    if (!y) return false;
    this.t += dt;
    this.total += dt;
    // the ball's way and speed (it may be on a finger)
    if (Number.isNaN(this.was.x)) this.was.copy(y);
    const inst = Math.hypot(y.x - this.was.x, y.z - this.was.z) / Math.max(dt, 1e-3);
    this.ys += (inst - this.ys) * Math.min(1, dt * 8);
    this.was.copy(y);
    const held = c.toyHeld();
    this.sinceHand = held ? 0 : this.sinceHand + dt;
    // a hand still playing with it, and the cat not yet tired of it
    const lured = this.sinceHand < 3 && !this.tired;
    if (this.bed) {
      // on its way back to bed: the ball moving again draws it back
      if (!(lured && this.ys > 0.1)) return this.bed.update(dt, c);
      this.bed.stop(c);
      this.bed = null;
      this.next('go');
    }
    const dx = y.x - m.pos.x, dz = y.z - m.pos.z, dist = Math.hypot(dx, dz);
    const face = Math.atan2(dx, dz);
    this.fwd.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
    this.left.set(Math.cos(m.yaw), 0, -Math.sin(m.yaw));
    // eyes and head on the ball all the while
    if (this.phase !== 'sit') m.lookAt(y, 1);
    const watch: PoseLayer = { earFwd: 0.9, pupil: 0.95, eyeOpen: 1, whisker: 0.8 };
    // enough is enough: off to sit and wash (not in the middle of a spring)
    if (this.tired && (this.phase === 'go' || this.phase === 'stalk')) {
      m.stop();
      m.layer = null;
      this.next('sit', rand(3, 6));
    }
    switch (this.phase) {
      case 'go': {
        m.layer = null;
        if (dist < 0.33) {
          m.stop();
          this.next('stalk', lured ? rand(0.5, 1.2) : rand(1.2, 2.4));
          return true;
        }
        // (and again whenever the ball has gone somewhere else)
        if (!m.goal || !(Math.hypot(y.x - this.aim.x, y.z - this.aim.z) < 0.06)) {
          this.aim.copy(y);
          const stop = new THREE.Vector3(y.x - (dx / dist) * 0.27, 0, y.z - (dz / dist) * 0.27);
          // after a ball on the move at a run, creeping up low on one at rest
          const sp = this.ys > 0.25 ? (dist > 0.6 ? 0.95 : 0.5) : dist > 0.6 ? 0.45 : 0.22;
          if (sp > 0.3) m.setPosture('stand');
          m.walkTo(stop, sp, face, () => this.next('stalk', lured ? rand(0.5, 1.2) : rand(1.2, 2.4)));
        }
        return true;
      }
      case 'stalk': {
        // off out of reach: after it; gone round to the side: round to it, still low
        if (dist > 0.45) { this.next('go'); return true; }
        const err = wrapA(face - m.yaw);
        if (Math.abs(err) > 0.5 && !m.goal) m.walkTo(m.pos.clone(), 0.15, face);
        m.setPosture('crouch');
        m.layer = {
          pose: { ...watch, hipY: 0.135, neckPitch: -0.45, headPitch: 0.1, tailLift: -0.35, tailSide: 0.3 * Math.sin(this.t * 6.5), tailCurl: 0.7 * Math.sin(this.t * 9) },
          w: Math.min(1, this.t / 0.4),
        };
        // it moves: the hunter cannot wait (brushed past close by, a swipe at it)
        if (this.ys > 0.35 && dist < 0.26 && this.t > 0.25) { this.bats = 1 + Math.floor(Math.random() * 2); this.hits.clear(); this.next('bat'); }
        else if (this.ys > 0.12 && this.t > 0.4 && Math.abs(err) < 0.4) this.next('wiggle', rand(0.3, 0.6));
        else if (this.t > this.dur) this.next('wiggle', rand(0.7, 1.3));
        return true;
      }
      case 'wiggle': {
        if (dist > 0.5) { this.next('go'); return true; }
        // the rump up a little and wiggling, the hind paws treading
        const wg = Math.sin(this.t * Math.PI * 2 * 5);
        m.layer = {
          pose: {
            ...watch, hipY: 0.15, hipPitch: -0.12, neckPitch: -0.45, headPitch: 0.1, hipYaw: 0.1 * wg, hipRoll: 0.07 * wg,
            LH: { y: 0.012 + 0.012 * Math.max(0, wg) }, RH: { y: 0.012 + 0.012 * Math.max(0, -wg) },
            tailLift: -0.3, tailSide: 0.4 * Math.sin(this.t * 11), tailCurl: 0.9 * Math.sin(this.t * 13),
          },
          w: 1,
        };
        if (this.t > this.dur) { this.hits.clear(); this.caught = false; this.next('pounce', 0.34); }
        return true;
      }
      case 'pounce': {
        // spring forward, all four off the floor a moment, forepaws reaching to land on it (and
        // steering a little in the air after a ball that moves)
        const u = Math.min(1, this.t / this.dur), arc = Math.sin(Math.PI * u);
        m.yaw = wrapA(m.yaw + Math.max(-1, Math.min(1, wrapA(face - m.yaw))) * Math.min(1, dt * 5) * (1 - u));
        const reach = Math.min(0.24, Math.max(0.05, dist - 0.13));
        m.pos.addScaledVector(this.fwd, ((Math.PI / 2) * reach / this.dur) * arc * dt);
        const fore = { planted: 0, frame: 0, x: 0.03, y: 0.012 + 0.07 * arc, z: 0.115 + 0.11 * Math.sin(Math.PI * Math.min(1, u * 1.15)), flex: 0.2 * arc };
        const hind = { planted: 0, frame: 0, x: 0.04, y: 0.013 + 0.025 * arc, z: -0.13 - 0.04 * arc };
        m.layer = {
          pose: { ...watch, hipY: 0.15 + 0.06 * arc, chestPitch: 0.3 * arc, neckPitch: -0.15, headPitch: 0.05, LF: fore, RF: fore, LH: hind, RH: hind, tailLift: 0.3 * arc - 0.2 },
          w: 1,
        };
        if (!this.hits.has(-1) && u > 0.6 && dist < 0.21) {
          this.hits.add(-1);
          if (held) {
            // got it: down under both paws
            this.caught = true;
            c.pin(rand(0.9, 1.8), m.pos.clone().addScaledVector(this.fwd, 0.155));
          } else c.kick(this.fwd.clone().addScaledVector(this.left, rand(-0.6, 0.6)), rand(0.35, 0.65));
        }
        if (u >= 1) {
          c.sound('thump', 0.18);
          if (this.caught) {
            if (Math.random() < 0.3) c.sound('trill', 0.22);
            this.next('pin');
          } else { this.bats = 1 + Math.floor(Math.random() * 3); this.next('bat'); }
        }
        return true;
      }
      case 'pin': {
        // both forepaws on it, holding it down, the head down biting at it, the hind feet
        // treading; till it is pulled out from under them, or it lets go to bat it about
        const bite = Math.max(0, Math.sin(this.t * 7));
        const tread = Math.sin(this.t * Math.PI * 2 * 3);
        const paw = { planted: 0, frame: 0, x: 0.028, y: 0.075, z: 0.15, flex: 0.3 };
        m.setPosture('crouch');
        m.layer = {
          pose: {
            ...watch, hipY: 0.14, chestPitch: 0.1, neckPitch: -0.5, headPitch: -0.1 - 0.15 * bite, jaw: 0.3 * bite,
            LF: paw, RF: paw, LH: { y: 0.012 + 0.01 * Math.max(0, tread) }, RH: { y: 0.012 + 0.01 * Math.max(0, -tread) },
            tailSide: 0.5 * Math.sin(this.t * 7), tailCurl: 0.8 * Math.sin(this.t * 9),
          },
          w: Math.min(1, this.t / 0.12),
        };
        if (!c.toyPinned()) {
          m.layer = null;
          if (held || dist > 0.3) this.next('stalk', rand(0.3, 0.7));
          else { this.bats = 1 + Math.floor(Math.random() * 2); this.hits.clear(); this.next('bat'); }
        }
        return true;
      }
      case 'bat': {
        // swipes with one forepaw and then the other: up, out, across and down
        const T = 0.4, k = Math.floor(this.t / T), u = (this.t % T) / T;
        if (k >= this.bats || dist > 0.34) {
          m.layer = null;
          if (lured) this.next(dist < 0.33 ? 'stalk' : 'go', rand(0.6, 1.4));
          else if (this.rounds < 1 && Math.random() < 0.55 && dist < 0.9 && !this.tired) { this.rounds++; this.next('go'); }
          else this.next('sit', rand(3, 6));
          return true;
        }
        const right = k % 2 === 0;
        const lift = Math.sin(Math.PI * u);
        const across = u < 0.45 ? 0.045 : 0.045 - 0.09 * (u - 0.45) / 0.55;
        const paw = { planted: 0, frame: 0, x: across, y: 0.012 + 0.07 * lift, z: 0.125 + 0.1 * lift, flex: 0.35 * lift };
        m.setPosture('crouch');
        m.layer = { pose: { ...watch, hipY: 0.145, neckPitch: -0.35, headPitch: 0.05, [right ? 'RF' : 'LF']: paw, tailSide: 0.3 * Math.sin(this.t * 8) }, w: 1 };
        if (!this.hits.has(k) && u > 0.55 && dist < 0.24) {
          this.hits.add(k);
          // on a finger, a claw snags it a moment; loose, the right paw sweeps it off to the
          // cat's left, the left paw to its right
          if (held) c.pin(rand(0.2, 0.35), y.clone());
          else c.kick(this.fwd.clone().multiplyScalar(0.5).addScaledVector(this.left, right ? 0.85 : -0.85), rand(0.3, 0.55));
        }
        return true;
      }
      case 'sit': {
        // done: sit and wash the chest a little, then home (unless the ball is moving again)
        m.lookAt(null);
        if (lured && this.ys > 0.1 && this.t > 0.5) { m.layer = null; this.next('go'); return true; }
        m.setPosture('sit');
        m.layer = { pose: { neckPitch: -0.75, headPitch: -0.55 + 0.12 * Math.sin(this.t * 8.5), jaw: 0.1 * Math.max(0, Math.sin(this.t * 8.5)), eyeOpen: 0.4 }, w: hump(this.t, this.dur, 0.6) };
        if (this.t > this.dur) {
          m.layer = null;
          this.bed = toBed(c, 'loaf');
        }
        return true;
      }
    }
    return true;
  }

  stop(c: Ctx) {
    this.bed?.stop(c);
    c.m.layer = null;
    c.m.lookAt(null);
  }
}

/**
 * A moth or a fly in the room: the cat's eyes and head go with it wherever it goes, ears up, the
 * tip of the tail twitching, and now and then it chatters at it, jaw quivering. Landed low, it is
 * crept up on; come within reach, the cat rears up on its haunches and swipes at it (and off it
 * goes). In the end it loses interest, or the thing goes out of the window.
 */
/**
 * The zoomies: for no reason anyone can see, a burst of running round the room. A wiggle, then off
 * at a scramble round the front of the bed and back, quick and low, sharp turns with a scrabble of
 * claws, the tail up and the ears back, the ball of wool sent flying if it is in the way; then a
 * dead stop, a sit, and a look round as if nothing had happened.
 */
export class Zoomies implements Act {
  readonly name = 'zoomies';
  private phase: 'wind' | 'dash' | 'stop' = 'wind';
  private t = 0;
  private readonly route: THREE.Vector3[] = [];
  private i = -1;
  private readonly speed = rand(1.1, 1.35);
  private kicked = false;
  private readonly lookDir = Math.random() < 0.5 ? -1 : 1;
  /** at the end: turning round to face you (1), turned (2) */
  private facing = 0;

  constructor(c: Ctx) {
    const h = c.home;
    const at = (x: number, z: number) => new THREE.Vector3(h.x + x, 0, h.z + z);
    // zigzags over the open floor in front of the bed: the middle, out to the left of the bed, the
    // front right (clear of the books), ... (when the box is out on the left, the right only)
    const box = c.box() !== null;
    const F = () => at(box ? rand(0.04, 0.12) : rand(-0.1, 0.1), rand(0.44, 0.5));
    const L = () => at(-0.42, rand(0.12, 0.24));
    const R = () => at(rand(0.14, 0.22), rand(0.5, 0.56));
    const n = 3 + Math.floor(Math.random() * 3);
    const cycle = box ? [F, R] : Math.random() < 0.5 ? [F, L, R, L] : [L, F, R, F];
    for (let k = 0; k < n; k++) this.route.push(cycle[k % cycle.length]());
    // (and it ends in the middle, just in front of the bed, where it sits down facing you, coming
    // to it from one side, so that the skid does not carry it out toward you)
    if (this.route[this.route.length - 1].z > h.z + 0.4) this.route.push(box ? R() : pick([L, R])());
    this.route.push(at(box ? rand(0.04, 0.12) : rand(-0.08, 0.08), rand(0.3, 0.34)));
    // (not off to a point it is all but standing on)
    while (this.route.length > 2 && this.route[0].distanceTo(c.m.pos.clone().setY(0)) < 0.25) this.route.shift();
  }

  private leg(c: Ctx) {
    this.i++;
    if (this.i >= this.route.length) {
      // the brakes on: a skid of a few centimetres, and down it sits
      c.m.stop();
      this.phase = 'stop';
      this.t = 0;
      c.sound('thump', 0.12);
      return;
    }
    // (each turn a scrabble of claws on the boards)
    if (this.i > 0) c.sound('scrabble', 0.2);
    c.m.walkTo(this.route[this.i], this.speed, null, null, true);
  }

  update(dt: number, c: Ctx) {
    const m = c.m;
    this.t += dt;
    if (this.phase === 'wind') {
      // low on the forelegs, the rump up and wiggling, eyes on nothing at all
      m.setPosture('crouch');
      const wg = Math.sin(this.t * Math.PI * 2 * 5);
      m.layer = { pose: { hipY: 0.15, hipPitch: -0.12, hipYaw: 0.1 * wg, hipRoll: 0.07 * wg, tailCurl: 0.8 * Math.sin(this.t * 13), earFwd: 0.4 }, w: ease(this.t / 0.25) };
      if (this.t > 0.75) {
        this.phase = 'dash';
        this.t = 0;
        m.zoom = 1;
        this.leg(c);
      }
      return true;
    }
    if (this.phase === 'dash') {
      // low and quick, the tail up and hooked, the ears back
      m.setPosture('stand');
      m.layer = { pose: { tailLift: 1.25, tailHook: 0.7, earFwd: -0.35, earOut: 0.25, hipY: 0.185, neckPitch: 0.1, puff: 0.2 }, w: ease(this.t / 0.2) };
      // the ball of wool in the way goes flying
      const y = c.yarn();
      if (y && !this.kicked && Math.hypot(y.x - m.pos.x, y.z - m.pos.z) < 0.13) {
        this.kicked = true;
        c.kick(new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw)), 0.9);
      }
      // on to the next as soon as it is close, or has gone past it: at this speed it would only
      // circle round a point it missed
      const to = this.route[this.i];
      const dx = to.x - m.pos.x, dz = to.z - m.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.13 || (d < 0.3 && dx * Math.sin(m.yaw) + dz * Math.cos(m.yaw) < 0) || !m.goal) this.leg(c);
      return true;
    }
    m.zoom = Math.max(0, m.zoom - dt * 2);
    // stopped dead (once the skid is over): sat down, a look one way and the other, as if nothing
    // had happened
    if (m.speed > 0.12 || this.facing < 2) {
      // (round to face you, on the spot, once it has stopped)
      if (m.speed <= 0.12 && this.facing === 0) {
        this.facing = 1;
        m.walkTo(m.pos.clone(), 0.2, rand(-0.35, 0.35), () => { this.facing = 2; });
      }
      this.t = 0;
      return true;
    }
    m.setPosture('sit');
    const look = this.lookDir * 0.7 * Math.sin(Math.min(1, this.t / 2.2) * Math.PI * 2);
    m.layer = { pose: { headYaw: look, neckYaw: 0.5 * look, earFwd: 0.3 }, w: hump(this.t, 2.6, 0.4) };
    if (this.t > 2.8) {
      m.layer = null;
      return false;
    }
    return true;
  }

  stop(c: Ctx) {
    c.m.layer = null;
    c.m.zoom = 0;
    c.m.stop();
  }
}

export class Hunt implements Act {
  readonly name = 'hunt';
  private phase: 'watch' | 'go' | 'swat' = 'watch';
  private t = 0;
  private total = 0;
  private readonly patience = rand(30, 70);
  private chatterIn = rand(1.5, 4);
  private chatter = -1;
  private side = 1;
  private hit = false;
  private calm = 0;
  private readonly fwd = new THREE.Vector3();

  private next(phase: Hunt['phase']) {
    this.phase = phase;
    this.t = 0;
  }

  update(dt: number, c: Ctx) {
    const m = c.m;
    const bug = c.bug();
    this.t += dt;
    this.total += dt;
    if (!bug || (this.total > this.patience && this.phase !== 'swat')) return false;
    const b = bug.p;
    const dx = b.x - m.pos.x, dz = b.z - m.pos.z, dist = Math.hypot(dx, dz);
    const face = Math.atan2(dx, dz);
    const low = b.y < 0.42;
    this.fwd.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
    m.lookAt(b, 1);
    // chattering at it now and then: a quick quiver of the jaw and a little twittering
    if (this.chatter < 0 && (this.chatterIn -= dt) <= 0) { this.chatter = 0; this.chatterIn = rand(3, 7); c.chirp(); }
    let jaw = 0;
    if (this.chatter >= 0) {
      this.chatter += dt;
      jaw = 0.1 + 0.1 * Math.max(0, Math.sin(this.chatter * Math.PI * 2 * 11));
      if (this.chatter > 0.7) this.chatter = -1;
    }
    const keen: PoseLayer = { earFwd: 1, pupil: 0.95, eyeOpen: 1, whisker: 0.9, jaw, tailCurl: 0.6 * Math.sin(this.total * 9) };
    this.calm = Math.max(0, this.calm - dt);
    switch (this.phase) {
      case 'watch': {
        m.layer = { pose: keen, w: Math.min(1, this.t / 0.4) };
        if (!m.goal && low && this.calm <= 0) {
          if (dist < 0.36) {
            // squarely at it first, then up and at it
            if (Math.abs(wrapA(face - m.yaw)) > 0.5) m.walkTo(m.pos.clone(), 0.15, face);
            else { this.hit = false; this.side = Math.random() < 0.5 ? 1 : -1; this.next('swat'); }
          } else if (bug.resting && dist < 1.4) {
            // landed low within a few strides: crept up on, low to the floor
            const stop = new THREE.Vector3(b.x - (dx / dist) * 0.28, 0, b.z - (dz / dist) * 0.28);
            m.setPosture('crouch');
            m.walkTo(stop, 0.18, face, () => this.next('watch'));
            this.next('go');
          }
        }
        return true;
      }
      case 'go': {
        m.layer = { pose: { ...keen, tailLift: -0.35 }, w: 1 };
        // it took off: stop and watch again
        if (!bug.resting || !low) { m.stop(); this.next('watch'); }
        return true;
      }
      case 'swat': {
        // up on the haunches and a forepaw flung up and out at it, then down again
        const u = Math.min(1, this.t / 0.55), up = Math.sin(Math.PI * u);
        const reach = Math.min(0.32, Math.max(0.16, b.y - 0.02)), out = Math.min(0.26, Math.max(0.12, dist));
        const paw = { planted: 0, frame: 0, x: 0.02 + 0.03 * up, y: 0.05 + (reach - 0.05) * up, z: 0.08 + (out - 0.08) * up, flex: 0.5 * up };
        m.setPosture('sit');
        m.layer = {
          pose: { ...keen, chestPitch: -1.12 * up - 0.97 * (1 - up), hipY: 0.064 + 0.03 * up, neckPitch: 0.1 * up, [this.side > 0 ? 'LF' : 'RF']: paw },
          w: 1,
        };
        if (!this.hit && u > 0.45) {
          this.hit = true;
          const pawAt = m.pos.clone().addScaledVector(this.fwd, out).setY(reach);
          if (pawAt.distanceTo(b) < 0.18) c.scareBug(pawAt);
        }
        if (u >= 1) { this.calm = rand(1.5, 3); this.next('watch'); }
        return true;
      }
    }
    return true;
  }

  stop(c: Ctx) {
    c.m.layer = null;
    c.m.lookAt(null);
  }
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (10 + x * (6 * x - 15)));

/**
 * If it fits, it sits: to the box, down on its haunches for a look in over the side, a hop in, round
 * to face out and down in it, a loaf with just its head over the side, looking about; a long while
 * (dozing off in there if sleep comes), then up, round to the way out, and a hop out. Asked to come
 * out, it hops out first: it is never just dropped from inside.
 */
export class Box implements Act {
  readonly name = 'box';
  phase: 'go' | 'gather' | 'in' | 'settle' | 'sit' | 'turn' | 'out' | 'done' = 'go';
  /** how deep asleep the cat is (set by the avatar): asleep in here, it stays and dozes */
  nap = 0;
  private t = 0;
  private dur = 0;
  private leaving = false;
  private look = Math.random() * 10;
  private readonly from = new THREE.Vector3();
  constructor(private readonly spot: SillSpot) {}

  /** asked out: out as soon as it can be */
  leave() {
    this.leaving = true;
  }

  /** in the box or hopping in or out of it: it cannot simply be stopped */
  get up() {
    return this.phase === 'in' || this.phase === 'settle' || this.phase === 'sit' || this.phase === 'turn' || this.phase === 'out';
  }

  private next(phase: Box['phase'], dur = 0) {
    this.phase = phase;
    this.t = 0;
    this.dur = dur;
  }

  /** over the side: the body up in an arc, the paws tucked */
  private hop(c: Ctx, to: THREE.Vector3, u: number, base: number) {
    const m = c.m, S = this.spot;
    m.pos.lerpVectors(this.from, to, smooth(u));
    c.hold(base + (S.height + 0.05) * Math.sin(Math.PI * u));
    const tuck = Math.sin(Math.PI * u);
    const fore = { planted: 0, frame: 0, x: 0.035, y: 0.012 + 0.08 * tuck, z: 0.11 + 0.05 * tuck, flex: 0.45 * tuck };
    const hind = { planted: 0, frame: 0, x: 0.04, y: 0.013 + 0.06 * tuck, z: -0.15 + 0.03 * tuck, flex: 0.3 * tuck };
    m.layer = { pose: { hipY: 0.17, chestPitch: 0.2 * tuck, neckPitch: 0.15, earFwd: 0.6, LF: fore, RF: fore, LH: hind, RH: hind, tailLift: 0.3 }, w: 1 };
  }

  update(dt: number, c: Ctx) {
    const m = c.m, S = this.spot;
    this.t += dt;
    const faceIn = Math.atan2(S.seat.x - S.launch.x, S.seat.z - S.launch.z);
    switch (this.phase) {
      case 'go':
        if (this.leaving) return false;
        m.layer = null;
        if (!m.goal) m.walkTo(S.launch, 0.25, faceIn, () => this.next('gather', rand(0.6, 1.2)));
        return true;
      case 'gather':
        // a look in over the side, down on its haunches
        if (this.leaving) { m.layer = null; return false; }
        m.setPosture('crouch');
        m.layer = { pose: { neckPitch: 0.15, headPitch: -0.3, earFwd: 0.9, pupil: 0.75, eyeOpen: 1, hipY: 0.135 }, w: Math.min(1, this.t / 0.3) };
        if (this.t > this.dur) { this.from.copy(m.pos); m.yaw = faceIn; this.next('in', 0.42); }
        return true;
      case 'in': {
        const u = Math.min(1, this.t / this.dur);
        m.yaw = faceIn;
        this.hop(c, S.seat, u, 0);
        if (u >= 1) { c.hold(null); m.layer = null; c.sound('thump', 0.1); c.sound('scrabble', 0.06); this.next('settle'); }
        return true;
      }
      case 'settle':
        // round in it to face out, toward you
        m.setPosture('stand');
        if (!m.goal) {
          if (Math.abs(wrapA(0 - m.yaw)) < 0.15) this.next('sit', this.leaving ? 0.5 : c.night > 0.5 ? rand(60, 140) : rand(30, 80));
          else m.walkTo(m.pos.clone(), 0.1, 0);
        }
        return true;
      case 'sit': {
        // down in it, just the head over the side, looking about; dozing off in here if sleep
        // comes, the head sinking
        m.setPosture('loaf');
        this.look += dt;
        const deep = Math.min(1, Math.max(0, (this.nap - 0.3) / 0.5));
        const glance = (1 - deep) * (0.4 * Math.sin(this.look * 0.4) + 0.2 * Math.sin(this.look * 1.1));
        m.layer = { pose: { neckYaw: glance, headYaw: 0.5 * glance, neckPitch: -0.45 * deep, headPitch: -0.2 * deep, earFwd: 0.5 * (1 - deep) }, w: Math.min(1, this.t / 1.2) };
        if ((this.t > this.dur && this.nap <= 0.3) || this.leaving) { m.layer = null; this.next('turn', 0.6); }
        return true;
      }
      case 'turn': {
        // up, round to the way out, a look over the side
        m.setPosture('stand');
        const faceOut = Math.atan2(S.land.x - m.pos.x, S.land.z - m.pos.z);
        if (Math.abs(wrapA(faceOut - m.yaw)) > 0.15) { if (!m.goal) m.walkTo(m.pos.clone(), 0.1, faceOut); this.t = 0; return true; }
        if (this.t > this.dur) { this.from.copy(m.pos); this.next('out', 0.42); }
        return true;
      }
      case 'out': {
        const u = Math.min(1, this.t / this.dur);
        this.hop(c, S.land, u, 0.006 * (1 - u));
        if (u >= 1) { c.hold(null); m.layer = null; c.sound('thump', 0.1); this.next('done'); }
        return true;
      }
      case 'done':
        return false;
    }
    return true;
  }

  stop(c: Ctx) {
    c.m.layer = null;
    c.hold(null);
  }
}

/**
 * Up on the windowsill: walk to below it, gather and look up, spring up onto it, sit looking out a
 * long while (the tail hanging down over the edge, the head following what goes by out there),
 * then turn round on it, look down, jump down, and back to bed. Asked to come down early (to sleep,
 * to go and eat) it finishes what it is doing and comes down; up there it is never just dropped.
 */
export class Sill implements Act {
  readonly name = 'sill';
  phase: 'go' | 'gather' | 'up' | 'settle' | 'sit' | 'nap' | 'about' | 'look' | 'down' | 'done' = 'go';
  /** how deep asleep the cat is (set by the avatar): asleep up here, it dozes on the sill */
  nap = 0;

  private t = 0;
  private dur = 0;
  private readonly from = new THREE.Vector3();
  private leaving = false;
  private bed: Act | null = null;
  private watch = Math.random() * 10;
  private chirpIn = 0.6;
  /** a raindrop running down the glass in front (where, how long it has run, paw pats at it) */
  private drop: { p: THREE.Vector3; t: number; pats: number; patT: number; next: number; side: number } | null = null;
  private dropIn = rand(2, 6);
  private readonly gaze = new THREE.Vector3();
  constructor(private readonly spot: SillSpot) {}

  /** asked down: it comes down as soon as it can, and stops there */
  leave() {
    this.leaving = true;
  }

  /** up on the sill or in the air: it cannot simply be stopped */
  get up() {
    return this.phase !== 'go' && this.phase !== 'gather' && this.phase !== 'done';
  }

  private next(phase: Sill['phase'], dur = 0) {
    this.phase = phase;
    this.t = 0;
    this.dur = dur;
  }

  update(dt: number, c: Ctx) {
    if (this.bed) return this.bed.update(dt, c);
    const m = c.m, S = this.spot;
    this.t += dt;
    switch (this.phase) {
      case 'go':
        if (this.leaving) return false;
        m.layer = null;
        if (!m.goal) m.walkTo(S.launch, 0.25, Math.PI, () => this.next('gather', rand(0.7, 1.1)));
        return true;
      case 'gather': {
        // down on its haunches, eyes up on where it is going, the hind paws shifting
        if (this.leaving) { m.layer = null; return false; }
        m.setPosture('crouch');
        const sh = Math.sin(this.t * 14);
        m.layer = {
          pose: { neckPitch: 0.55, headPitch: 0.05, earFwd: 0.8, pupil: 0.75, eyeOpen: 1, hipY: 0.135, LH: { y: 0.013 + 0.008 * Math.max(0, sh) }, RH: { y: 0.013 + 0.008 * Math.max(0, -sh) }, tailLift: -0.2 },
          w: Math.min(1, this.t / 0.3),
        };
        if (this.t > this.dur) {
          this.from.copy(m.pos);
          c.hold(0);
          this.next('up', 0.44);
        }
        return true;
      }
      case 'up': {
        // the spring: the body up in an arc onto the sill, forelegs reaching up and forward, hind
        // legs driving back and then tucked under
        const u = Math.min(1, this.t / this.dur);
        m.pos.lerpVectors(this.from, S.seat, smooth(u));
        m.yaw = Math.PI;
        c.hold(S.height * smooth(Math.min(1, u * 1.15)) + 0.08 * Math.sin(Math.PI * u));
        const fy = 0.012 + 0.11 * Math.sin(Math.PI * Math.min(1, u / 0.75));
        const fore = { planted: 0, frame: 0, x: 0.035, y: fy, z: 0.11 + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.25)), flex: 0.3 * Math.sin(Math.PI * u) };
        const hind = { planted: 0, frame: 0, x: 0.04, y: 0.013 + 0.05 * Math.sin(Math.PI * u), z: -0.16 - 0.07 * (1 - u) * Math.sin(Math.PI * Math.min(1, u * 2)) };
        m.layer = { pose: { hipY: 0.2, chestPitch: 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.3)), neckPitch: 0.2, earFwd: 0.6, LF: fore, RF: fore, LH: hind, RH: hind, tailLift: 0.4 }, w: 1 };
        if (u >= 1) {
          c.perch(S.height);
          c.hold(null);
          m.layer = null;
          c.sound('thump', 0.28);
          this.next('settle', 0.6);
        }
        return true;
      }
      case 'settle':
        // (squarely to the glass: back round to it after a doze along the sill)
        m.setPosture('stand');
        if (Math.abs(wrapA(Math.PI - m.yaw)) > 0.12) { if (!m.goal) m.walkTo(m.pos.clone(), 0.1, Math.PI); return true; }
        if (this.t > this.dur) this.next('sit', this.leaving ? 1 : c.night > 0.5 ? rand(60, 150) : rand(30, 80));
        return true;
      case 'nap': {
        // dozing up here: down where it sits, a loaf looking out, the head sinking as it goes
        // deeper, the tail hanging down over the edge; woken, a while looking out again before it
        // is down
        m.lookAt(null);
        m.setPosture('loaf');
        const deep = Math.min(1, Math.max(0, (this.nap - 0.3) / 0.5));
        m.layer = { pose: { neckPitch: -0.55 * deep, headPitch: -0.25 * deep, tailLift: -1.3, tailSag: 1, tailCurve: 0.2 }, w: Math.min(1, this.t / 1.5) };
        if (this.nap <= 0.3 || this.leaving) { m.layer = null; this.next('settle', this.leaving ? 0.3 : rand(4, 10)); }
        return true;
      }
      case 'sit': {
        if (this.nap > 0.3 && !this.leaving) {
          m.layer = null; m.lookAt(null); this.drop = null; c.drop(null);
          this.next('nap');
          return true;
        }
        // sat looking out: the tail down over the edge, the head turning after what goes by; birds
        // going by are followed with the eyes and chattered at
        m.setPosture('sit');
        this.watch += dt;
        const birds = c.birds();
        const look = birds ? 0 : 0.45 * Math.sin(this.watch * 0.37) + 0.2 * Math.sin(this.watch * 1.3);
        if (birds) {
          // (they are far off: out through the glass and a little up, following them along)
          this.gaze.set(m.pos.x + (birds.x - m.pos.x) * 5, 1.9, m.pos.z - 4);
          m.lookAt(this.gaze, 1);
          if ((this.chirpIn -= dt) <= 0) { c.chirp(); this.chirpIn = rand(1.5, 3.5); }
        } else m.lookAt(null);
        const chatter = birds ? 0.1 + 0.09 * Math.max(0, Math.sin(this.watch * Math.PI * 2 * 11)) : 0;
        // rain on the glass: now and then a drop runs down it right in front, stopping and going,
        // watched all the way down and patted at through the glass
        let patPaw: Record<string, unknown> = {};
        const D = this.drop;
        if (!D && !birds && c.rain > 0.3 && !this.leaving && (this.dropIn -= dt) <= 0) {
          // (off to one side, where a paw can go to it past the body, and you can see it do so)
          const side = Math.random() < 0.5 ? 1 : -1, off = side * rand(0.08, 0.12);
          this.drop = {
            p: new THREE.Vector3(m.pos.x + Math.cos(m.yaw) * off, S.height + rand(0.32, 0.42), S.seat.z - 0.16),
            t: 0, pats: 0, patT: -1, next: rand(0.4, 1), side,
          };
        } else if (D) {
          D.t += dt;
          D.p.y -= dt * (0.012 + 0.07 * Math.max(0, Math.sin(D.t * 2.1 + D.side)));
          m.lookAt(D.p, 1);
          const hy = D.p.y - S.height;
          if (D.patT < 0 && D.pats < 3 && hy < 0.27 && hy > 0.07 && (D.next -= dt) <= 0) D.patT = 0;
          if (D.patT >= 0) {
            D.patT += dt;
            const u = Math.min(1, D.patT / 0.38), reach = Math.sin(Math.PI * u);
            const ax = Math.abs((D.p.x - m.pos.x) * Math.cos(m.yaw) - (D.p.z - m.pos.z) * Math.sin(m.yaw));
            patPaw = { [D.side > 0 ? 'LF' : 'RF']: { planted: 0, frame: 0, x: 0.03 + (Math.max(0.01, ax) - 0.03) * reach, y: 0.03 + (hy - 0.03) * reach, z: 0.07 + 0.07 * reach, flex: 0.3 * reach } };
            if (u >= 1) { D.patT = -1; D.pats++; D.next = rand(0.5, 1.2); }
          }
          if (hy < 0.035) { this.drop = null; this.dropIn = rand(4, 10); }
        }
        c.drop(this.drop?.p ?? null);
        m.layer = {
          pose: {
            neckYaw: D ? 0 : look, headYaw: D ? 0 : 0.4 * look, neckPitch: 0.1, headPitch: -0.05 + 0.05 * Math.sin(this.watch * 0.5),
            earFwd: birds || D ? 1 : 0.6, pupil: birds || D ? 0.95 : 0.6, whisker: birds || D ? 1 : 0, jaw: chatter,
            tailLift: -1.35, tailSide: 0.1, tailCurve: 0.25, tailCurl: (birds || D ? 0.8 : 0.35) * Math.sin(this.watch * (birds ? 3 : 0.8)), tailSag: 1,
            ...patPaw,
          },
          w: Math.min(1, this.t / 1.2) * Math.min(1, Math.max(0, (this.dur - this.t) / 0.8)),
        };
        if (!D && !birds) m.lookAt(null);
        if (this.t > this.dur || (this.leaving && this.t > 1)) { m.layer = null; m.lookAt(null); this.drop = null; c.drop(null); this.next('about'); }
        return true;
      }
      case 'about':
        // round on the sill to face the room
        m.setPosture('stand');
        if (!m.goal) m.walkTo(m.pos.clone(), 0.12, 0, () => this.next('look', 0.6));
        return true;
      case 'look':
        // a look down at where it will land, gathering
        m.setPosture('crouch');
        m.layer = { pose: { neckPitch: -0.7, headPitch: -0.2, earFwd: 0.7, hipY: 0.14 }, w: Math.min(1, this.t / 0.3) };
        if (this.t > this.dur) {
          this.from.copy(m.pos);
          c.perch(null);
          c.hold(S.height);
          this.next('down', 0.4);
        }
        return true;
      case 'down': {
        // and down: a little up and out, forelegs reaching down to land, hind legs following
        const u = Math.min(1, this.t / this.dur);
        m.pos.lerpVectors(this.from, S.land, smooth(u));
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
          this.next('done');
        }
        return true;
      }
      case 'done':
        if (this.leaving) return false;
        this.bed = toBed(c, 'loaf');
        return true;
    }
    return true;
  }

  stop(c: Ctx) {
    this.bed?.stop(c);
    c.m.layer = null;
    this.drop = null;
    c.drop(null);
  }
}

/** back to bed (or up, round and down again on it): turn round on it once and settle, lying so
 *  that the body is in the middle and the face toward the window */
export const toBed = (c: Ctx, settle: PoseName) => {
  const bed = c.bed(settle);
  // onto the bed, then round once on the spot (two turns of a third, the third bringing it round
  // to the way it will lie), as a cat turns before it settles; already on it, it turns where it
  // stands (lying down, it shuffles the rest of the way into the middle)
  const near = Math.hypot(c.m.pos.x - bed.to.x, c.m.pos.z - bed.to.z) < 0.2;
  const spot = near ? c.m.pos.clone() : bed.to;
  const dir = Math.random() < 0.5 ? 1 : -1, a = bed.yaw + dir * 0.6;
  const ring: Leg[] = [
    ...(near ? [] : [{ to: spot, face: null, stay: 0, posture: 'stand' } as Leg]),
    { to: spot, face: a + dir * 2.1, stay: 0.01, posture: 'stand' },
    { to: spot, face: a + dir * 4.2, stay: 0.01, posture: 'stand' },
  ];
  // sometimes it treads the cushion a little before it lies down, as cats do
  const tread: Leg[] = Math.random() < 0.4 ? [{
    to: spot, face: bed.yaw, stay: 2 + Math.random() * 2, posture: 'stand',
    layer: (t) => {
      const ph = t * Math.PI * 2 * 1.6, l = Math.max(0, Math.sin(ph)), rr = Math.max(0, Math.sin(ph + Math.PI));
      return { LF: { planted: 0, y: 0.012 + 0.018 * l, flex: 0.35 * l }, RF: { planted: 0, y: 0.012 + 0.018 * rr, flex: 0.35 * rr }, neckPitch: -0.35, headPitch: -0.1, eyeOpen: 0.5 };
    },
  }] : [];
  return new Walk('to bed', [
    ...ring,
    ...tread,
    { to: spot, face: bed.yaw, stay: 0.1, posture: settle },
  ], 0.22);
};

/** how it would like to lie or sit about, given how it feels */
export function restingPose(mood: Mood, mode: string): PoseName {
  if (mode === 'alert') return 'sit';
  const r = Math.random();
  if (mood.pleasure > 0.4 || mood.sleepy > 0.4) return r < 0.4 ? 'side' : r < 0.75 ? 'sphinx' : 'loaf';
  return r < 0.35 ? 'loaf' : r < 0.65 ? 'sphinx' : 'sit';
}

/** something to do now, or null to stay as it is */
export function chooseAct(c: Ctx, atHome: boolean, posture: PoseName): Act | null {
  const m = c.mood;
  const opts: [number, () => Act | null][] = [];
  const lying = posture === 'loaf' || posture === 'sphinx' || posture === 'side' || posture === 'sit';
  if (c.mode === 'rest' || c.mode === 'alert') {
    opts.push([0.8 + m.sleepy, yawn]);
    if (lying) opts.push([1 + m.pleasure, groomFlank], [0.6, groomChest], [0.8, washFace]);
    opts.push([0.35, () => new Stretch(posture === 'sit' ? 'sit' : 'loaf')]);
    if (atHome) opts.push([0.9 * Math.max(0, Math.min(1, m.trust + 0.3)) * (1 + m.arousal) + (c.mode === 'alert' ? 0.8 : 0), () => toWindow(c)]);
    if (atHome) opts.push([0.5 * (1 + m.arousal) * (1 - m.sleepy), () => wander(c)]);
    if (atHome && c.mode === 'rest') opts.push([0.7 + 0.8 * m.sleepy, () => sunbathe(c)]);
    if (atHome && c.mode === 'rest' && c.warm()) opts.push([0.8 + 0.8 * m.sleepy, () => warmUp(c)]);
    if (atHome && c.yarn()) opts.push([0.6 * (0.4 + m.arousal) * (1 - m.sleepy) * (c.mode === 'rest' ? 1 : 0.4), () => new Play()]);
    const box = c.box();
    if (atHome && box) opts.push([0.7 * (1 - 0.4 * m.sleepy), () => new Box(box)]);
    // now and then, more at dusk and after dark, a mad few seconds
    if (atHome) opts.push([0.28 * (0.3 + m.arousal) * (1 - m.sleepy) * (1 + 1.2 * c.night), () => new Zoomies(c)]);
    const sill = c.sill();
    if (atHome && sill) opts.push([0.55 * (1 + 1.5 * c.rain + 1.2 * c.night) * (1 - 0.6 * m.sleepy), () => new Sill(sill)]);
    else opts.push([1.5, () => toBed(c, 'loaf')]);
    opts.push([0.8, () => null]);
  }
  const total = opts.reduce((a, [w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [w, f] of opts) {
    if ((r -= w) <= 0) return f();
  }
  return null;
}
