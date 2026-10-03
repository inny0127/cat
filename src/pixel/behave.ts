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
