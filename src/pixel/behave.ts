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
  /** where to stand, and which way to face, to lie down in a posture with the middle of the body
   *  at a point and the face turned a way */
  lieAt: (p: PoseName, at: THREE.Vector3, face: number) => { to: THREE.Vector3; yaw: number };
  /** the ball of wool, if there is one, and a paw sending it rolling */
  yarn: () => THREE.Vector3 | null;
  kick: (dir: THREE.Vector3, speed: number) => void;
}

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

const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Play with the ball of wool: creep up to a pounce away from it, crouch low and watch it (eyes
 * wide, ears forward, the tip of the tail flicking), the rump up and wiggling, then spring and
 * land on it with both forepaws, and bat it about with one paw and the other; perhaps after it
 * once more where it rolled; then sit and wash a little, and back to bed.
 */
export class Play implements Act {
  readonly name = 'play';
  private phase: 'go' | 'stalk' | 'wiggle' | 'pounce' | 'bat' | 'sit' = 'go';
  private t = 0;
  private dur = 0;
  private rounds = 0;
  private bats = 0;
  private hits = new Set<number>();
  private bed: Act | null = null;
  private readonly fwd = new THREE.Vector3();
  private readonly left = new THREE.Vector3();

  private next(phase: Play['phase'], dur = 0) {
    this.phase = phase;
    this.t = 0;
    this.dur = dur;
  }

  update(dt: number, c: Ctx) {
    if (this.bed) return this.bed.update(dt, c);
    const m = c.m;
    const y = c.yarn();
    if (!y) return false;
    this.t += dt;
    const dx = y.x - m.pos.x, dz = y.z - m.pos.z, dist = Math.hypot(dx, dz);
    const face = Math.atan2(dx, dz);
    this.fwd.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
    this.left.set(Math.cos(m.yaw), 0, -Math.sin(m.yaw));
    // eyes on the ball all the while
    const watch: PoseLayer = { earFwd: 0.9, pupil: 0.95, eyeOpen: 1, whisker: 0.8 };
    switch (this.phase) {
      case 'go': {
        m.layer = null;
        if (!m.goal) {
          const stop = new THREE.Vector3(y.x - (dx / Math.max(dist, 1e-3)) * 0.27, 0, y.z - (dz / Math.max(dist, 1e-3)) * 0.27);
          if (dist < 0.33) this.next('stalk', rand(1.2, 2.4));
          else m.walkTo(stop, 0.2, face, () => this.next('stalk', rand(1.2, 2.4)));
        }
        return true;
      }
      case 'stalk': {
        // squarely at it, or round to it with a step or two
        if (Math.abs(wrapA(face - m.yaw)) > 0.45 && this.t < 0.1) { this.next('go'); m.walkTo(m.pos.clone(), 0.15, face, () => this.next('stalk', rand(1, 2))); return true; }
        m.setPosture('crouch');
        m.layer = {
          pose: { ...watch, hipY: 0.135, neckPitch: -0.45, headPitch: 0.1, tailLift: -0.35, tailSide: 0.3 * Math.sin(this.t * 6.5), tailCurl: 0.7 * Math.sin(this.t * 9) },
          w: Math.min(1, this.t / 0.4),
        };
        if (this.t > this.dur) this.next('wiggle', rand(0.7, 1.3));
        return true;
      }
      case 'wiggle': {
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
        if (this.t > this.dur) { this.hits.clear(); this.next('pounce', 0.34); }
        return true;
      }
      case 'pounce': {
        // spring forward, all four off the floor a moment, forepaws reaching to land on it
        const u = Math.min(1, this.t / this.dur), arc = Math.sin(Math.PI * u);
        const reach = Math.min(0.2, Math.max(0.05, dist - 0.1));
        m.pos.addScaledVector(this.fwd, ((Math.PI / 2) * reach / this.dur) * arc * dt);
        const fore = { planted: 0, frame: 0, x: 0.03, y: 0.012 + 0.07 * arc, z: 0.115 + 0.11 * Math.sin(Math.PI * Math.min(1, u * 1.15)), flex: 0.2 * arc };
        const hind = { planted: 0, frame: 0, x: 0.04, y: 0.013 + 0.025 * arc, z: -0.13 - 0.04 * arc };
        m.layer = {
          pose: { ...watch, hipY: 0.15 + 0.06 * arc, chestPitch: 0.3 * arc, neckPitch: -0.15, headPitch: 0.05, LF: fore, RF: fore, LH: hind, RH: hind, tailLift: 0.3 * arc - 0.2 },
          w: 1,
        };
        if (!this.hits.has(-1) && u > 0.6 && dist < 0.21) {
          this.hits.add(-1);
          c.kick(this.fwd.clone().addScaledVector(this.left, rand(-0.6, 0.6)), rand(0.35, 0.65));
        }
        if (u >= 1) { this.bats = 1 + Math.floor(Math.random() * 3); this.next('bat'); }
        return true;
      }
      case 'bat': {
        // swipes with one forepaw and then the other: up, out, across and down
        const T = 0.4, k = Math.floor(this.t / T), u = (this.t % T) / T;
        if (k >= this.bats || dist > 0.34) {
          m.layer = null;
          if (this.rounds < 1 && Math.random() < 0.55 && dist < 0.9) { this.rounds++; this.next('go'); }
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
          // the right paw sweeps it off to the cat's left, the left paw to its right
          c.kick(this.fwd.clone().multiplyScalar(0.5).addScaledVector(this.left, right ? 0.85 : -0.85), rand(0.3, 0.55));
        }
        return true;
      }
      case 'sit': {
        // done: sit and wash the chest a little, then home
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
  }
}

/** back to bed (or up, round and down again on it): turn round on it once and settle, lying so
 *  that the body is in the middle and the face toward the window */
export const toBed = (c: Ctx, settle: PoseName) => {
  const r = 0.07, a = Math.random() * Math.PI * 2, dir = Math.random() < 0.5 ? 1 : -1;
  const ring = [0, 1, 2].map((k) => new THREE.Vector3(c.home.x + r * Math.cos(a + dir * k * 2.1), 0, c.home.z + r * Math.sin(a + dir * k * 2.1)));
  const bed = c.bed(settle);
  return new Walk('to bed', [
    ...ring.map((to): Leg => ({ to, face: null, stay: 0, posture: 'stand' })),
    { to: bed.to, face: bed.yaw, stay: 0.1, posture: settle },
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
    if (lying) opts.push([1 + m.pleasure, groomFlank], [0.6, groomChest]);
    opts.push([0.35, () => new Stretch(posture === 'sit' ? 'sit' : 'loaf')]);
    if (atHome) opts.push([0.9 * Math.max(0, Math.min(1, m.trust + 0.3)) * (1 + m.arousal) + (c.mode === 'alert' ? 0.8 : 0), () => toWindow(c)]);
    if (atHome) opts.push([0.5 * (1 + m.arousal) * (1 - m.sleepy), () => wander(c)]);
    if (atHome && c.mode === 'rest') opts.push([0.7 + 0.8 * m.sleepy, () => sunbathe(c)]);
    if (atHome && c.yarn()) opts.push([0.6 * (0.4 + m.arousal) * (1 - m.sleepy) * (c.mode === 'rest' ? 1 : 0.4), () => new Play()]);
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
