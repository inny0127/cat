import * as THREE from 'three';
import type { Motor } from '../cat3d/motor';
import type { Mood } from '../cat3d/mood';
import { POSES, type PoseLayer, type PoseName } from '../cat3d/pose';
import type { LaserDot } from './chase';
import { Tease, type Lure } from './tease';

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
  /** upright things to rub a cheek on (where they stand on the floor) */
  posts: () => THREE.Vector3[];
  /** the scratching post, if there is one: where it stands on the floor, how thick its post is,
   *  and how high its top is */
  scratcher: () => ScratchPost | null;
  /** the pompom hanging from the post's top, if there is one (where it is now as it swings), and a
   *  paw sending it swinging (a push across the floor, m/s) */
  pompom: () => THREE.Vector3 | null;
  batPompom: (v: THREE.Vector3) => void;
  /** a bird come down on the ledge outside the window, if there is one (where, on the glass) */
  visitor: () => THREE.Vector3 | null;
  /** a place on the floor in the sun, if the sun is in; and whether a point is in it */
  sun: () => THREE.Vector3 | null;
  sunlit: (p: THREE.Vector3) => boolean;
  /** is a circle on the floor clear of the bed, the bowls and the room's things */
  clear: (p: THREE.Vector3, r: number) => boolean;
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
  /** a word from the cat: the sound, and the mouth saying it */
  say: (kind: 'trill' | 'meow' | 'meowSoft' | 'meowPlead' | 'chirp') => void;
  /** how hard it is raining (0 .. 1): a grey day is for watching it from the sill */
  rain: number;
  /** what is falling is snow */
  snow: boolean;
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
  /** the pencil (its middle, and whether it is still lying on the sill), if there is one; a paw
   *  pushing it along the sill (metres toward the room, and sideways) */
  pencil: () => { at: THREE.Vector3; onSill: boolean } | null;
  pushPencil: (dz: number, dx: number) => void;
  /** the mug of tea (the middle of its foot, and whether it is still standing on the sill), if
   *  there is one; a paw pushing it along the sill (as the pencil) */
  mug: () => { at: THREE.Vector3; onSill: boolean } | null;
  pushMug: (dz: number, dx: number) => void;
  /** where you are, to look at */
  viewer: () => THREE.Vector3;
  /** the red dot of a laser pointer shining in the room, as the cat has it: where it believes it
   *  is, if it is sure enough (chase.ts) */
  laser: () => LaserDot | null;
  /** where its eyes are, while they are on this thing (nerves.ts): in jumps, a little behind it */
  gaze: (id: string) => THREE.Vector3 | null;
  /** where it believes a thing is (nerves.ts: seen a moment late, carried on a little when lost
   *  sight of), if it has a fair idea; what it goes for and aims at (a paw lands where the thing
   *  really is, or misses) */
  seen?: (id: string) => THREE.Vector3 | null;
  /** what it looks for just now, by the hour (habits.ts, 0 .. 1): a game with the red dot, the
   *  feathers, the ball of wool; strokes. And where the laser pointer lies, if it is lying there */
  expects?: () => { laser: number; wand: number; yarn: number; pet: number };
  pointer?: () => THREE.Vector3 | null;
  /** its temperament (state.ts: bold, playful, lazy, curious, each -1 .. 1) */
  temper?: { bold: number; playful: number; lazy: number; curious: number };
  /** how much keener (or less keen) on each thing it might do it is for what it has learnt comes
   *  of it with you (learn.ts: a weight, 1 nothing learnt) */
  worth?: (key: string) => number;
  /** one of its things moved while it was not looking, and where it is now: something to go and
   *  see about (how much: 0 .. 1) */
  curious?: () => { id: string; at: THREE.Vector3; k: number } | null;
  /** a point on the floor moved out of the room's things and in from the walls, for the middle of
   *  a cat r across (changed in place); and a point to go by on the way from one point to another,
   *  round whatever is in the way (null: the way is clear) */
  keepClear: (p: THREE.Vector3, r: number) => THREE.Vector3;
  detour: (from: THREE.Vector3, to: THREE.Vector3, r: number) => THREE.Vector3 | null;
  /** where the books stand (a pounce on them lands on top) */
  books: () => THREE.Vector3;
  /** a paw (or the body) knocks against whatever is at a point, so hard (0 .. 1): the plant's
   *  leaves shake, a curtain swings */
  bump: (at: THREE.Vector3, k: number) => void;
  /** the feathers on the wand, if it is about (tease.ts); a paw sending them swinging (m/s), and
   *  paws holding them down a while at a point */
  lure: () => Lure | null;
  batLure: (v: THREE.Vector3) => void;
  pinLure: (sec: number, at: THREE.Vector3) => void;
  /** up on something this high (null: on the floor), and held in the air at a height (a jump) */
  perch: (h: number | null) => void;
  hold: (lift: number | null) => void;
  /** a blink (slow: a cat's long, soft blink at someone it trusts) */
  blink: (slow: boolean) => void;
  /** its toy mouse, if there is one (where, whether it is lying still, in its mouth, or in the
   *  air), taken up in the mouth (where the mouth is now, which way it faces) or let fall (null);
   *  and where its mouth is */
  mouse: () => { p: THREE.Vector3; state: 'floor' | 'mouth' | 'air'; moving: boolean; under?: boolean } | null;
  /** the toy mouse hooked out from under the radiator by a paw, skidding out toward a point */
  hookMouse: (toward: THREE.Vector3) => void;
  carry: (at: THREE.Vector3 | null, yaw?: number) => void;
  mouthAt: () => THREE.Vector3;
  /** a finger on the glass, if there is one (GlassFinger) */
  finger: () => GlassFinger | null;
}

export interface ScratchPost {
  at: THREE.Vector3;
  r: number;
  /** the top: how high it is, and how far across */
  top: number;
  topR: number;
}

/** an act that has the cat up on something (the sill, the box, the top of the scratching post;
 *  after the red dot up the wall): it is never simply dropped but asked down, and carries on until
 *  it is (up: up there, or in the air on the way up or down) */
export interface Perching extends Act {
  readonly up: boolean;
  /** asked down (for a game: where the game is, to go for it from up there if it can) */
  leave(at?: () => THREE.Vector3 | null): void;
}
export const isPerching = (a: Act | null): a is Perching => !!a && typeof (a as Perching).leave === 'function' && 'up' in a;

export interface SillSpot {
  launch: THREE.Vector3; seat: THREE.Vector3; land: THREE.Vector3; height: number;
  /** how far out into the room the sill's front edge comes (z; if not given, a little in front of the seat) */
  edge?: number;
}

/** one thing the cat does: update returns false when it is over; stop cuts it short cleanly */
export interface Act {
  readonly name: string;
  update(dt: number, c: Ctx): boolean;
  stop(c: Ctx): void;
  /** it is looking at something of its own just now (the eyes are not to be taken off it) */
  readonly ownGaze?: boolean;
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** done with something away from its bed: back to it now? Drowsy, or after dark, most likely;
 *  wide awake, as often as not it stays where it is a while, sits or lies down there, and goes back
 *  in its own time (or on to something else) */
export const homeward = (c: Ctx) => Math.random() < 0.3 + 0.55 * (c.mood?.sleepy ?? 0) + 0.2 * (c.night ?? 0);
/** up, held, and back down over [0, d], with ramps of r seconds */
const hump = (t: number, d: number, r: number) => ease(t / r) * ease((d - t) / r);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
/** a living thing's own time for a rhythm (licks, treads, sniffs): now a little quicker, now a
 *  little slower, a tenth or so either way over a second or two; never a metronome's. Monotonic,
 *  and never more than a tenth of a second off the clock */
export const lived = (t: number, s: number) => t + 0.06 * Math.sin(1.3 * t + s) + 0.04 * Math.sin(0.7 * t + 2.1 * s);

/** an act it can look up from a moment (a wash, a scratch): its own time stopped while it looks,
 *  and on again where it left off */
export interface Glancing {
  glance(s: number): void;
  readonly glancing: boolean;
}
export const canGlance = (a: Act | null): a is Act & Glancing => !!a && typeof (a as Partial<Glancing>).glance === 'function';

/** a motion laid over the pose for a while, shaped by a function of time (and a sound with it, at
 *  a time into it). It can be looked up from: the motion let go of (as much as `letGo`), its time
 *  stopped, the head free to turn to whatever it was; then back to it */
class Layered implements Act, Glancing {
  private t = 0;
  /** looking up from it: for how long yet, and how far it has let go of it (0 .. 1) */
  private upFor = 0;
  private up = 0;
  letGo = 0.8;
  private readonly seed = Math.random() * 10;
  constructor(readonly name: string, private readonly dur: number, private readonly ramp: number,
    private readonly shape: (t: number) => PoseLayer, private readonly posture: PoseName | null = null,
    private cue: { at: number; sound: string; gain: number } | null = null) {}
  glance(s: number) {
    this.upFor = Math.max(this.upFor, s);
  }
  get glancing() {
    return this.up > 0.05;
  }
  update(dt: number, c: Ctx) {
    const looking = this.upFor > 0;
    this.upFor = Math.max(0, this.upFor - dt);
    this.up += ((looking ? 1 : 0) - this.up) * (1 - Math.exp(-dt * (looking ? 9 : 4)));
    // (its own time goes on only as it gets back to it)
    this.t += dt * Math.max(0, 1 - 2 * this.up);
    if (this.cue && this.t >= this.cue.at) {
      c.sound(this.cue.sound, this.cue.gain);
      this.cue = null;
    }
    if (this.posture) c.m.setPosture(this.posture);
    c.m.layer = { pose: this.shape(lived(this.t, this.seed)), w: hump(this.t, this.dur, this.ramp) * (1 - this.letGo * this.up) };
    return this.t < this.dur;
  }
  stop(c: Ctx) {
    c.m.layer = null;
  }
}

/** an act that needs the cat in a posture first (a hind foot up to an ear wants it sitting, not
 *  still halfway up from lying): into it, settled, and only then the act */
class Settled implements Act, Glancing {
  private ready = false;
  private wait = 0;
  constructor(private readonly inner: Act, private readonly posture: PoseName) {}
  get name() {
    return this.inner.name;
  }
  glance(s: number) {
    if (this.ready && canGlance(this.inner)) this.inner.glance(s);
  }
  get glancing() {
    return canGlance(this.inner) && this.inner.glancing;
  }
  update(dt: number, c: Ctx) {
    if (!this.ready) {
      c.m.setPosture(this.posture);
      c.m.layer = null;
      this.wait += dt;
      // (if it cannot get there, it gives up on it)
      if (c.m.settled && c.m.posture === this.posture) this.ready = true;
      else return this.wait < 4;
    }
    return this.inner.update(dt, c);
  }
  stop(c: Ctx) {
    this.inner.stop(c);
  }
}

/** a big yawn: the mouth wide, the tongue curled up at its tip in the bottom of it, eyes squeezed,
 *  head back, ears out; now and then you hear it */
export const yawn = (heard = Math.random() < 0.5) => new Layered('yawn', 2.4, 0.7, () => ({
  jaw: 1, tongue: 0.5, tongueUp: 1, eyeOpen: 0.08, squint: 0.8, headPitch: 0.35, neckPitch: 0.1, earOut: 0.35, earFwd: -0.3,
}), null, heard ? { at: 0.45, sound: 'yawn', gain: 0.22 } : null);

/** one act after another */
class Seq implements Act {
  private i = 0;
  private cur: Act | null = null;
  constructor(readonly name: string, private readonly parts: (() => Act)[]) {}
  /** (where it looks is the part's own business, if the part under way says so) */
  get ownGaze() {
    return this.cur?.ownGaze ?? false;
  }
  update(dt: number, c: Ctx) {
    while (this.i < this.parts.length) {
      this.cur ??= this.parts[this.i]();
      if (this.cur.update(dt, c)) return true;
      this.cur.stop(c);
      this.cur = null;
      this.i++;
      dt = 0;
    }
    return false;
  }
  stop(c: Ctx) {
    this.cur?.stop(c);
    this.cur = null;
  }
}

/** a stretch where it can be seen for one: side on to you (round to it first, whichever way is the
 *  less of a turn, if it is facing you or away), then, at home, round again to lie down in the
 *  middle of its bed facing you */
export const stretchSideOn = (c: Ctx, then: PoseName, hind?: boolean) => {
  const make = (end: PoseName) => {
    const s = new Stretch(end);
    if (hind !== undefined) s.hind = hind;
    return s;
  };
  // (you are straight ahead of a cat at yaw 0)
  if (Math.abs(Math.sin(c.m.yaw)) > 0.6) return make(then);
  const a = Math.PI / 2, b = -Math.PI / 2;
  const face = Math.abs(wrapA(a - c.m.yaw)) < Math.abs(wrapA(b - c.m.yaw)) ? a : b;
  const home = Math.hypot(c.m.pos.x - c.home.x, c.m.pos.z - c.home.z) < 0.2;
  return new Seq('stretch', [
    () => new Walk('stretch', [{ to: c.m.pos.clone(), face, stay: 0.3, posture: 'stand' }], 0.22),
    () => make('stand'),
    ...(home ? [() => toBed(c, then === 'sit' ? 'sit' : 'loaf')] : []),
  ]);
};

/** waking of itself from a long sleep: a big yawn where it lies, the head hardly lifted from the
 *  bed; then up and round side on to you (whichever way is the less of a turn), a long stretch,
 *  forelegs and then hind legs, and round to lie down on its chest to get on with the day. Now and
 *  then the stretch is done up the scratching post instead, and the claws seen to while it is at
 *  it */
export const wakeUp = (c: Ctx) => {
  const post = c.scratcher?.();
  const atPost = !!post && Math.random() < 0.3;
  return new Seq('wake', [
    () => new Layered('yawn', 2.6, 0.8, () => ({
      jaw: 1, tongue: 0.5, tongueUp: 1, eyeOpen: 0.08, squint: 0.8, neckPitch: -0.2, headPitch: 0, earOut: 0.35, earFwd: -0.3,
    }), null, { at: 0.5, sound: 'yawn', gain: 0.22 }),
    atPost ? () => new Claw(post!) : () => stretchSideOn(c, 'loaf', Math.random() < 0.8),
  ]);
};

/** washing a flank: head round to the side and down, licking in strokes */
export const groomFlank = () => {
  const side = Math.random() < 0.5 ? 1 : -1, d = rand(5, 9);
  return new Layered('groom', d, 0.7, (t) => ({
    neckYaw: side * 1.05, headYaw: side * 0.7, neckPitch: -0.35, headPitch: -0.35 + 0.13 * Math.sin(t * 9),
    jaw: 0.12 * Math.max(0, Math.sin(t * 9)), tongue: 0.8 * Math.max(0, Math.sin(t * 9)), tongueUp: -0.3, eyeOpen: 0.35, squint: 0.3,
  }));
};

/** washing the chest: chin tucked, licking down the bib */
export const groomChest = () => new Layered('groom chest', rand(3, 6), 0.6, (t) => ({
  neckPitch: -0.75, headPitch: -0.55 + 0.12 * Math.sin(t * 8.5), jaw: 0.1 * Math.max(0, Math.sin(t * 8.5)),
  tongue: 0.75 * Math.max(0, Math.sin(t * 8.5)), tongueUp: -0.5, eyeOpen: 0.4,
}));

/** washing the face: sitting up, a forepaw raised to the mouth and licked, then drawn up over the
 *  cheek to behind the ear with the head turned down into it, and again and again; then perhaps
 *  the other side. The eyes half shut all the while */
export const washFace = () => {
  const first = Math.random() < 0.5 ? 1 : -1;
  const cyc = rand(1.3, 1.7), n = 3 + Math.floor(Math.random() * 3);
  const both = Math.random() < 0.6;
  // a side: the paw up to the mouth, licked and wiped n times over without being put down, and down
  // to the floor again; then perhaps the other
  const R = 0.4, side = 2 * R + n * cyc;
  const d = side * (both ? 2 : 1);
  const sat = POSES.sit.LF;
  return new Settled(new Layered('wash', d, 0.5, (t) => {
    const k = both && t >= side ? 1 : 0, ts = t - k * side;
    const s = k ? -first : first;
    const paw = s > 0 ? 'LF' : 'RF';
    const reach = ease(ts / R) * (1 - ease((ts - side + R) / R));
    // each turn: licked (the first third or so), then the wipe up the cheek to behind the ear,
    // forward over the eye and down to the mouth again
    const tc = ts - R, u = tc > 0 && tc < n * cyc ? (tc % cyc) / cyc : 0;
    const lick = u < 0.38 ? Math.sin(Math.PI * u / 0.38) : 0;
    const v = u >= 0.38 ? (u - 0.38) / 0.62 : 0, w = Math.sin(Math.PI * v);
    const pose: PoseLayer = {
      [paw]: {
        planted: 0, frame: 0,
        x: sat.x + (0.012 - sat.x) * reach + 0.03 * w, y: sat.y + (0.21 - sat.y) * reach + 0.06 * w,
        z: sat.z + (0.135 - sat.z) * reach - 0.035 * w - 0.012 * Math.sin(2 * Math.PI * v), flex: 0.85 * reach,
      },
      headPitch: -0.32 - 0.25 * reach * (1 - w) + 0.1 * w, headYaw: s * 0.35 * w, headRoll: s * 0.4 * w,
      neckPitch: -0.1 * reach,
      jaw: 0.04 + 0.12 * lick * Math.max(0, Math.sin(t * 15)),
      tongue: 0.9 * lick * Math.max(0, Math.sin(t * 15)), tongueUp: -0.2,
      eyeOpen: 0.3, squint: 0.55, earFwd: -0.2 * w,
    };
    return pose;
  }, 'sit'), 'sit');
};

/** a scratch behind the ear with a hind foot: sitting, leaning a little the other way, the head
 *  tipped down and round into the raised foot, which goes at it in quick strokes, the eyes shut;
 *  perhaps a pause and another go; then the foot down, and a shake of the head */
export const scratchEar = () => {
  const s = Math.random() < 0.5 ? 1 : -1;
  const paw = s > 0 ? 'LH' : 'RH';
  const bouts = Math.random() < 0.5 ? 2 : 1, bout = rand(1.1, 1.8), gap = 0.45;
  const down = 0.4 + bouts * bout + (bouts - 1) * gap;
  // (looking up from it, the foot stays up, as a cat stops dead with its foot in the air)
  const L = new Layered('scratch', down + 1.0, 0.35, (t) => {
    // the foot up (and down again after), the strokes about seven a second while it goes at it
    const up = ease(t / 0.4) * (1 - ease((t - down) / 0.3));
    const tb = t - 0.4, k = Math.floor(tb / (bout + gap)), u = tb - k * (bout + gap);
    const st = tb > 0 && k < bouts && u < bout ? Math.sin(u * Math.PI * 2 * 7) : 0;
    // the shake: the head whipped side to side a few times, the ears flapping
    const sh = t > down + 0.3 && t < down + 0.75 ? Math.sin((t - down - 0.3) / 0.45 * Math.PI * 4) * Math.sin((t - down - 0.3) / 0.45 * Math.PI) : 0;
    // (from where the paw sits, up behind the ear and back)
    const f = POSES.sit.LH, to = { x: 0.065, y: 0.2 + 0.012 * st, z: 0.04 - 0.012 * st };
    return {
      [paw]: {
        planted: up > 0.05 ? 0 : 1, frame: 0, x: f.x + (to.x - f.x) * up, y: f.y + (to.y - f.y) * up,
        z: f.z + (to.z - f.z) * up, flex: (0.2 + 0.1 * st) * up,
      },
      neckYaw: s * 0.6 * up, headRoll: (-s * 0.55 + 0.05 * st) * up + 0.45 * sh, neckPitch: -0.15 * up, headPitch: -0.1 * up,
      hipRoll: s * 0.12 * up, eyeOpen: 1 - 0.7 * up - 0.3 * Math.abs(sh), squint: 0.6 * up, earOut: 0.3 * up + 0.4 * Math.abs(sh), earFwd: -0.2 * up,
    };
  }, 'sit');
  L.letGo = 0.45;
  return new Settled(L, 'sit');
};

/** kneading: the front paws treading in turn, as kittens do at their mother */
export const knead = () => new Layered('knead', 1e9, 0.5, (t) => {
  const ph = t * Math.PI * 2 * 1.4;
  const l = Math.max(0, Math.sin(ph)), r = Math.max(0, Math.sin(ph + Math.PI));
  return { LF: { y: 0.012 + 0.02 * l, flex: 0.4 * l }, RF: { y: 0.012 + 0.02 * r, flex: 0.4 * r }, eyeOpen: 0.3, squint: 0.5 };
}, 'sphinx');

/** booped on the nose: the face screwed up a moment, the eyes squeezed shut and the whiskers back,
 *  the head drawn back a little; then a lick of the nose and a quick shake of the head */
export const boop = () => new Layered('boop', 1.6, 0.06, (t) => {
  const scr = hump(t, 0.55, 0.08);
  const lick = t > 0.6 && t < 1.05 ? Math.max(0, Math.sin((t - 0.6) * 28)) : 0;
  const shake = t > 1.05 ? Math.sin((t - 1.05) * 42) * Math.max(0, 1 - (t - 1.05) / 0.45) : 0;
  return {
    eyeOpen: 1 - 0.92 * scr, squint: scr, whisker: -0.7 * scr, earFwd: -0.35 * scr,
    headPitch: 0.18 * scr, neckPitch: -0.08 * scr, jaw: 0.13 * lick, tongue: lick, tongueUp: 1, headRoll: 0.2 * shake,
  };
});

/** a sneeze: a breath in with the head up a little and the eyes squeezing shut, then a sharp
 *  little nod down with the sound of it; now and then two */
export const sneeze = (c: Ctx) => {
  const two = Math.random() < 0.3;
  let heard = 0;
  return new Layered('sneeze', two ? 1.6 : 0.9, 0.08, (t) => {
    const k = two && t > 0.8 ? 1 : 0, u = (t - k * 0.8) / 0.8;
    if (heard <= k && u > 0.45) { heard = k + 1; c.sound('sneeze', 0.32); }
    const pre = u < 0.45 ? Math.sin(Math.PI * 0.5 * Math.max(0, u) / 0.45) : 0;
    const nod = u >= 0.45 ? Math.sin(Math.PI * Math.min(1, (u - 0.45) / 0.3)) : 0;
    return {
      headPitch: 0.25 * pre - 0.55 * nod, neckPitch: 0.1 * pre - 0.3 * nod, eyeOpen: 0.25, squint: Math.min(1, 0.6 * pre + nod),
      earFwd: -0.3 * nod, jaw: 0.22 * nod, whisker: 0.5 * nod,
    };
  });
};

/**
 * Staring at nothing: up at a spot on the wall where nobody else can see a thing, the ears forward,
 * the pupils wide and the tail tip ticking, a long while; then, as often as not, a chirp at it, and
 * back to its own business as if nothing were there.
 */
export class Stare implements Act {
  readonly name = 'stare';
  private t = 0;
  private readonly dur = rand(5, 10);
  private readonly at: THREE.Vector3;
  private chirp = Math.random() < 0.45;
  constructor(c: Ctx) {
    const h = c.home;
    this.at = new THREE.Vector3(h.x + rand(-0.6, 0.6), rand(0.95, 1.5), h.z - 0.62);
  }
  update(dt: number, c: Ctx) {
    this.t += dt;
    const m = c.m;
    m.setPosture('sit');
    m.lookAt(this.at, 1);
    m.layer = { pose: { earFwd: 0.55, pupil: 0.55, eyeOpen: 1, tailCurl: 0.6 * Math.sin(this.t * 6.5), whisker: 0.4 }, w: hump(this.t, this.dur, 0.5) };
    if (this.chirp && this.t > this.dur - 1.2) { this.chirp = false; c.chirp(); }
    return this.t < this.dur;
  }
  stop(c: Ctx) {
    c.m.layer = null;
    c.m.lookAt(null);
  }
}

/**
 * Marking its things: along to the lamp's pole and slowly past it with the cheek pressed to it,
 * the head turned and tipped into it, the eyes half shut, the tail up; then the side of the neck,
 * the flank brushing along after, the tail curling round the pole as it goes by. As often as not
 * it turns and comes back past it the other way, the other cheek. (It passes behind the pole, so
 * it is the face you see.)
 */
export class Rub implements Act {
  readonly name = 'rub';
  phase: 'go' | 'rub' | 'done' = 'go';
  private passes = Math.random() < 0.6 ? 2 : 1;
  private dir: number;
  private readonly lineZ: number;
  private t = 0;
  private trill = Math.random() < 0.3;
  private set = false;
  /** afterwards, back to bed */
  private home: Act | null = null;
  private stays = false;
  constructor(c: Ctx, private readonly post: THREE.Vector3) {
    // (the line it walks: just behind the pole, the cheek's reach from it; from the nearer end)
    this.lineZ = post.z - 0.068;
    this.dir = c.m.pos.x < post.x ? 1 : -1;
  }
  /** a point on the line, so far past the pole (m) */
  private at(x: number) {
    return new THREE.Vector3(this.post.x + this.dir * x, 0, this.lineZ);
  }
  update(dt: number, c: Ctx) {
    const m = c.m;
    if (this.phase === 'done') {
      if (!this.home) {
        if (this.stays || !homeward(c)) { this.stays = true; return false; }
        this.home = toBed(c, 'loaf');
      }
      return this.home.update(dt, c);
    }
    this.t += dt;
    const face = this.dir * Math.PI / 2;
    m.setPosture('stand');
    if (this.phase === 'go') {
      // to the start of the line (after a pass: a step on, and round to come back)
      m.layer = null;
      if (!this.set) {
        this.set = true;
        m.walkTo(this.at(-0.33), 0.25, face, () => {
          this.phase = 'rub';
          this.t = 0;
          this.set = false;
        });
      }
      return true;
    }
    if (!this.set) {
      this.set = true;
      // (now and then a little trill to it, the mouth with it)
      if (this.trill) { this.trill = false; c.sound('trill', 0.2); c.m.vocalize('trill', 0.29); }
      m.walkTo(this.at(0.37), 0.11, face, () => {
        m.layer = null;
        this.set = false;
        if (--this.passes > 0) {
          this.dir = -this.dir;
          this.phase = 'go';
        } else this.phase = 'done';
      });
    }
    // slowly past it: how far the cheek (and after it the ribs, the root of the tail) is past the
    // pole
    const s = (m.pos.x - this.post.x) * this.dir;
    const cheek = s + 0.16, flank = s - 0.05, tail = s - 0.2;
    // the pole on the cat's left (+1) or its right (-1)
    const side = this.dir > 0 ? -1 : 1;
    const bell = (x: number, a: number, b: number) => ease((x - a + 0.12) / 0.12) * (1 - ease((x - b) / 0.14));
    // (the tail's sweep over before the pass ends, so that it does not jump back when it does: the
    // pass is no longer than the view can follow out at that side of the room)
    const k = bell(cheek, -0.03, 0.1), kf = bell(flank, -0.06, 0.08), kt = bell(tail, -0.02, 0.02);
    // (leaning into it, the pole rocks a little on its foot)
    c.bump(new THREE.Vector3(this.post.x, 0.2, this.lineZ), (k + kf) * 0.35 * dt);
    m.layer = {
      pose: {
        neckYaw: side * 0.65 * k, headYaw: side * 0.35 * k, headRoll: -side * 0.4 * k, neckPitch: -0.12 * k,
        squint: 0.55 * k, eyeOpen: 1 - 0.5 * k, earOut: 0.3 * k, earFwd: 0.1,
        chestRoll: -side * 0.1 * kf, lumbarYaw: side * 0.12 * kf,
        tailLift: 1.15, tailHook: 0.45, tailSide: side * 0.9 * kt,
      },
      w: Math.min(1, this.t / 0.6),
    };
    return true;
  }
  stop(c: Ctx) {
    if (this.home) this.home.stop(c);
    c.m.layer = null;
    c.m.stop();
  }
}

/** a stretch: up, forelegs out and rump high, then back down; now and then, stretched out, it
 *  drags its claws back through the rug (or the bed) a few times, one paw and then the other */
export class Stretch implements Act {
  readonly name = 'stretch';
  private t = 0;
  private readonly claws = Math.random() < 0.45;
  private pulls = 0;
  /** after the forelegs, now and then the hind legs: up on all fours, one hind leg and then the
   *  other pushed out straight behind, the toes spread, a moment each */
  hind = Math.random() < 0.6;
  private hindAsked = false;
  constructor(private readonly then: PoseName) {}
  update(dt: number, c: Ctx) {
    this.t += dt;
    // (only side on to you: facing you, its hind legs would be out of sight behind it, and it would
    // seem only to stand there)
    if (this.t >= 3.6 && !this.hindAsked) {
      this.hindAsked = true;
      if (Math.abs(Math.sin(c.m.yaw)) < 0.6) this.hind = false;
    }
    if (this.hind && this.t >= 3.6 && this.t < 6.4) {
      c.m.setPosture('stand');
      const u = this.t - 3.9, leg = u < 1.25 ? 'LH' : 'RH', v = u < 1.25 ? u : u - 1.25;
      // (each leg out and back over a second and a bit, a little tremble at full stretch)
      const w = u < 0 ? 0 : ease(v / 0.4) * (1 - ease((v - 0.8) / 0.35));
      const tr = 0.004 * Math.sin(this.t * 40) * ease((v - 0.35) / 0.1) * (1 - ease((v - 0.75) / 0.1));
      c.m.layer = {
        pose: { [leg]: { planted: 0, x: 0.035, z: -0.34 + tr, y: 0.05, flex: -0.5 }, hipY: 0.186, hipPitch: -0.08, neckPitch: 0.3, headPitch: 0, eyeOpen: 0.5, squint: 0.4 },
        w,
      };
      return true;
    }
    if (this.hind && this.t >= 6.4) {
      c.m.layer = null;
      c.m.setPosture(this.then);
      return this.t < 7.6;
    }
    c.m.setPosture(this.t < 3.6 ? 'stretch' : this.then);
    if (this.claws && this.t > 1.4 && this.t < 3.3) {
      // each pull: the paw put out a little further, then drawn back along the floor, claws in
      const ph = (this.t - 1.4) * 2.4, k = Math.floor(ph), u = ph - k;
      if (k >= this.pulls) { this.pulls = k + 1; c.sound('rugScratch', 0.2); }
      const reach = u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75;
      c.m.layer = {
        pose: { [k % 2 ? 'RF' : 'LF']: { planted: 0, z: 0.2 + 0.06 * reach, y: 0.012 + (u < 0.25 ? 0.015 * Math.sin(Math.PI * u / 0.25) : 0), flex: u < 0.25 ? 0 : 0.25 } },
        w: ease((this.t - 1.4) / 0.2) * ease((3.3 - this.t) / 0.2),
      };
    } else c.m.layer = null;
    return this.t < 5;
  }
  stop(c: Ctx) {
    c.m.layer = null;
  }
}

interface Leg {
  to: THREE.Vector3;
  /** which way to face on arrival (null: as it comes) */
  face: number | null;
  /** seconds there */
  stay: number;
  posture: PoseName;
  layer?: (t: number, m: Motor) => PoseLayer;
  /** the upper lip drawn up, so far (0 .. 1), at a time there (the flehmen) */
  lip?: (t: number) => number;
  /** it may doze off here, where it lies (in the sun, by the radiator), and stays till it wakes */
  nap?: boolean;
  /** where it would rather be now (the patch of sun having moved on): it gets up and goes there
   *  (undefined: it is well where it is; null: there is nothing to stay for, and it moves on) */
  follow?: () => { to: THREE.Vector3; yaw: number } | null | undefined;
  /** back to its bed, if it has a mind to (homeward): else the walk ends here, where it is */
  home?: boolean;
}

/** walking somewhere and doing something there, then on */
export class Walk implements Act {
  private i = 0;
  private arrived = false;
  private t = 0;
  /** how deep asleep the cat is (set by whoever knows): lying where it may doze, it sleeps there */
  nap = 0;
  private napT = 0;
  private followIn = 8;
  /** a stop on the way, a look round (where at, how long yet), and whether this leg has had one */
  private pause: { t: number; at: THREE.Vector3 } | null = null;
  private paused = false;
  /** the last leg it has asked itself whether to go home on (Leg.home) */
  private asked = -1;
  constructor(readonly name: string, private readonly legs: Leg[], private readonly speed = 0.25) {}
  get ownGaze() {
    return !!this.pause;
  }
  /** lying somewhere it may doze off */
  get canNap() {
    const leg = this.legs[this.i];
    return !!leg && this.arrived && !!leg.nap;
  }
  update(dt: number, c: Ctx) {
    const leg = this.legs[this.i];
    if (!leg) return false;
    if (leg.home && this.asked < this.i) {
      this.asked = this.i;
      if (!homeward(c)) return false;
    }
    if (this.arrived && leg.nap && this.nap > 0.3) {
      // dozed off where it lay: the head sinking as it goes deeper; the time there waits till it wakes
      this.napT += dt;
      c.m.setPosture(leg.posture);
      const deep = Math.min(1, Math.max(0, (this.nap - 0.3) / 0.5));
      c.m.layer = leg.posture === 'side' ? null : { pose: { neckPitch: -0.5 * deep, headPitch: -0.25 * deep }, w: Math.min(1, this.napT / 1.5) };
      return true;
    }
    if (this.napT > 0) {
      // awake again: a little while longer where it is before it gets up
      this.napT = 0;
      c.m.layer = null;
      this.t = Math.max(0, leg.stay - rand(6, 15));
    }
    if (!this.arrived) {
      // (the next thing to do where it already is, facing about the way it is: no getting up for
      // it, as from a roll in the sun to lying in it)
      if (this.i > 0 && Math.hypot(leg.to.x - c.m.pos.x, leg.to.z - c.m.pos.z) < 0.04 && leg.face !== null
        && Math.abs(wrapA(leg.face - c.m.yaw)) < 0.3 && leg.posture !== 'stand' && !c.m.goal) {
        this.arrived = true;
        this.t = 0;
        return true;
      }
      // up on its feet (again, if something sat it down on the way)
      c.m.setPosture('stand');
      // on a longer way, now and then a stop part way along: stood still a moment, the head up
      // and turned to something (a sound, the window, you), then on
      if (this.pause) {
        c.m.lookAt(this.pause.at, 0.9);
        if ((this.pause.t -= dt) > 0) return true;
        this.pause = null;
        c.m.lookAt(null);
      } else if (!this.paused && c.m.goal && this.name !== 'to bed' && this.speed <= 0.3) {
        const left = Math.hypot(leg.to.x - c.m.pos.x, leg.to.z - c.m.pos.z);
        if (left > 0.35 && left < 0.6 && c.m.speed > 0.12) {
          this.paused = true;
          if (Math.random() < 0.35) {
            const side = Math.random() < 0.5 ? -1 : 1, a = c.m.yaw + side * rand(0.6, 1.3);
            this.pause = { t: rand(0.6, 1.6), at: new THREE.Vector3(c.m.pos.x + Math.sin(a), rand(0.2, 0.9), c.m.pos.z + Math.cos(a)) };
            c.m.stop();
            return true;
          }
        }
      }
      if (!c.m.goal) {
        // a waypoint with nothing to do there is walked through
        const pass = leg.stay <= 0 && this.i < this.legs.length - 1;
        c.m.walkTo(leg.to, this.speed, leg.face, () => { this.arrived = true; this.t = 0; }, pass);
      }
      return true;
    }
    // lying in the sun, awake, as the patch moves off across the floor: up, and after it
    if (leg.follow && (this.followIn -= dt) <= 0) {
      this.followIn = 8;
      const want = leg.follow();
      if (want === null) this.t = Math.max(this.t, leg.stay);
      else if (want) {
        leg.to = want.to;
        leg.face = want.yaw;
        leg.stay = Math.max(leg.stay, this.t + 30);
        this.arrived = false;
        return true;
      }
    }
    this.t += dt;
    c.m.setPosture(leg.posture);
    c.m.layer = leg.layer ? { pose: leg.layer(this.t, c.m), w: hump(this.t, leg.stay, 0.5) } : null;
    if (leg.lip) c.m.lipUp = leg.lip(this.t) * hump(this.t, leg.stay, 0.5);
    if (this.t > leg.stay) {
      c.m.layer = null;
      this.i++;
      this.arrived = false;
      this.paused = false;
    }
    return true;
  }
  stop(c: Ctx) {
    c.m.layer = null;
    if (this.pause) c.m.lookAt(null);
    c.m.stop();
  }
}

/** come to the glass and sit looking at you a while (a little side-on, the head turned to you:
 *  square on, a sitting cat is a pillar), then back to bed */
export const toWindow = (c: Ctx) => {
  const bed = c.bed('loaf');
  const stay = rand(8, 22);
  // now and then, sat there looking up at you, the silent meow: the mouth opened on a meow with
  // no sound to it (a cat's way with someone it is fond of), and, fond enough, a slow blink after
  const trust = c.mood?.trust ?? 0;
  const silent = Math.random() < 0.15 + 0.35 * Math.max(0, trust - 0.3) ? rand(2.5, Math.max(3, stay - 3)) : -1;
  let said = false, blinked = false;
  const meow = silent < 0 ? undefined : (t: number, m: Motor): PoseLayer => {
    if (!said && t > silent) { said = true; m.vocalize('meow', 0.5); m.moment = 'silent'; }
    if (said && !blinked && t > silent + 1.3) { blinked = true; if (trust > 0.6) m.slowBlink(); }
    return {};
  };
  return new Walk('window', [
    { to: c.window, face: (Math.random() < 0.5 ? -1 : 1) * 0.42, stay, posture: 'sit', layer: meow },
    { to: bed.to, face: bed.yaw, stay: 0.1, posture: 'loaf', home: true },
  ]);
};

/**
 * You are back after a while away, and it has seen you: the ears come up and round to you, and it
 * comes up to the glass at a brisk walk, its tail carried up with the tip hooked over (a cat's
 * hello: how high, as far as it trusts you, the walk says). There it sits close and looks up at
 * you, gives you a slow blink, and (fond of you) pushes its head at the glass as it would at a
 * hand, a cheek along it after, once or twice; a while longer there looking at you, and then it is
 * about its business. glad: how glad it is (0 .. 1)
 */
export class Greet implements Act {
  readonly name = 'greet';
  phase: 'see' | 'come' | 'sit' | 'bump' | 'flop' | 'stay' = 'see';
  private t = 0;
  private set = false;
  private blinks = 0;
  private bumps: number;
  private side = Math.random() < 0.5 ? -1 : 1;
  private readonly stay: number;
  /** gladdest of all, now and then: down on its side before you, belly up (how long; which side
   *  it is lying on) */
  private readonly flop: number;
  roll = 1;
  /** waiting: found sat at the glass already, waiting for you (and there you are) */
  constructor(readonly glad: number, private readonly waiting = false) {
    this.bumps = glad > 0.5 && Math.random() < 0.8 ? (Math.random() < 0.4 ? 2 : 1) : 0;
    this.stay = rand(5, 9) + 8 * glad;
    this.flop = glad > 0.75 && Math.random() < 0.4 ? rand(4.5, 7) : 0;
  }
  get ownGaze() {
    return this.waiting && this.phase === 'see' && this.t < 0.7;
  }
  update(dt: number, c: Ctx) {
    const m = c.m;
    this.t += dt;
    if (this.phase === 'see' && this.waiting) {
      // sat at the glass waiting, the head low and the ears easy, looking out past you; then it sees
      // you: up comes the head, the ears go up and round to you, the eyes wide
      m.setPosture('sit');
      const seen = ease((this.t - 0.6) / 0.25);
      m.lookAt(this.t < 0.6 ? null : c.viewer(), 1);
      m.layer = { pose: { neckPitch: -0.25 * (1 - seen), headPitch: -0.2 * (1 - seen), earFwd: -0.1 + 0.6 * seen, eyeOpen: 0.7 + 0.3 * seen, pupil: 0.6 + 0.3 * seen }, w: 1 };
      if (this.t >= 0.6 && this.t - dt < 0.6) m.jolt(0.35);
      if (this.t < 1.3) return true;
      this.phase = 'sit';
      this.t = 0;
      return true;
    }
    if (this.phase === 'see') {
      // (where it is, a moment: the ears up and round to you, the eyes on you)
      m.layer = { pose: { earFwd: 0.45 }, w: ease(this.t / 0.3) };
      if (this.t < 0.8) return true;
      this.phase = 'come';
      this.t = 0;
    }
    if (this.phase === 'come') {
      // (the walk carries the tail; the eyes are on you, the avatar's business; very glad, the
      // tail held up quivers, as a cat's does for someone it has missed)
      m.setPosture('stand');
      m.layer = { pose: { earFwd: 0.35, tailSide: this.quiver(c) }, w: 1 };
      if (!this.set) {
        this.set = true;
        // (sat a little side-on, the head turned to you: square on, a sitting cat is a pillar)
        m.walkTo(c.window, 0.3, -this.side * 0.42, () => { this.phase = 'sit'; this.t = 0; this.set = false; });
      }
      return true;
    }
    if (this.phase === 'sit' || this.phase === 'stay') {
      m.setPosture('sit');
      // looking up at you (the eyes and the head are on you of themselves), the ears to you; sat
      // down, the tail is still up a moment before it comes down round the paws
      const up = this.phase === 'sit' ? 1 - ease((this.t - 0.5) / 1.4) : 0;
      const S = POSES.sit;
      m.layer = {
        pose: { earFwd: 0.3, tailLift: S.tailLift + (1.25 - S.tailLift) * up, tailHook: S.tailHook + (0.6 - S.tailHook) * up, tailSag: S.tailSag * (1 - up), tailSide: S.tailSide * (1 - up) + this.quiver(c) * up },
        w: ease(this.t / 0.4) || (this.phase === 'stay' ? 1 : 0),
      };
      // a slow blink at you once it is settled (and, gladder, another later on)
      if (this.phase === 'sit' && this.t > 1.5 && this.blinks === 0) { this.blinks = 1; c.blink(true); }
      if (this.phase === 'stay' && this.blinks === 1 && this.glad > 0.4 && this.t > this.stay * 0.6) { this.blinks = 2; c.blink(true); }
      if (this.phase === 'sit' && this.t > 2.8) {
        this.phase = this.bumps > 0 ? 'bump' : this.flop ? 'flop' : 'stay';
        this.t = 0;
      }
      return this.phase !== 'stay' || this.t < this.stay;
    }
    if (this.phase === 'flop') {
      // down on its side before you, rolled a little over onto its back with the belly your way,
      // the forepaws curled to its chest, looking at you upside down and wriggling its back on the
      // floor, the tail sweeping slowly: a cat's warmest welcome (on its right side facing left
      // across the picture, or its left facing right, whichever is the less of a turn)
      if (this.t <= dt) { this.roll = Math.sin(m.yaw) > 0 ? -1 : 1; m.moment = 'flop'; }
      const sd = this.roll, face0 = -sd * Math.PI / 2, D = this.flop;
      m.yaw = wrapA(m.yaw + Math.max(-3, Math.min(3, wrapA(face0 - m.yaw))) * Math.min(1, dt * 4));
      m.setPosture('crouch');
      m.layer = bellyUp(sd, this.t, D, 0);
      if (this.blinks === 1 && this.t > 3.2) { this.blinks = 2; c.blink(true); }
      if (this.t > D + 0.7) { m.layer = null; this.phase = 'stay'; this.t = 0; }
      return true;
    }
    // a head pushed at the glass as at a hand, the eyes shut; then the cheek along it, the head
    // turned and tipped into it, the side of the neck after
    m.setPosture('sit');
    const T = 1.7, u = this.t / T;
    const push = hump(this.t, 0.75, 0.25), cheek = hump(this.t - 0.45, T - 0.45, 0.35);
    const sd = this.side, S = POSES.sit;
    m.layer = {
      pose: {
        neckPitch: S.neckPitch + 0.2 * push - 0.05 * cheek, headPitch: S.headPitch - 0.18 * push, chestPitch: S.chestPitch - 0.06 * push,
        neckYaw: sd * 0.3 * cheek, headYaw: sd * 0.4 * cheek, headRoll: -sd * 0.42 * cheek,
        squint: Math.max(push, 0.8 * cheek), eyeOpen: 1 - 0.85 * Math.max(push, 0.7 * cheek), earOut: 0.25 * Math.max(push, cheek), earFwd: 0.15,
        tailLift: S.tailLift + 0.4 * cheek, tailHook: S.tailHook + 0.3 * cheek,
      },
      w: 1,
    };
    if (u >= 1) {
      this.t = 0;
      this.side = -this.side;
      if (--this.bumps <= 0) this.phase = this.flop ? 'flop' : 'stay';
    }
    return true;
  }
  /** the upright tail quivering, quick and small, if it is glad enough */
  private quiver(c: Ctx) {
    const k = Math.max(0, (this.glad - 0.65) / 0.35);
    return k > 0 ? 0.05 * k * Math.sin(c.m.time * 75) : 0;
  }
  stop(c: Ctx) {
    c.m.layer = null;
    c.m.stop();
  }
}

/**
 * A present: it goes to its toy mouse (at a run, if you have just thrown it: a game of fetch,
 * with a pounce on it where it lands), takes it up in its mouth, and carries it to the glass, its
 * head and its tail up; there it lets it fall at your feet, sits and looks at you and tells you
 * so (a mrrow: look what I have brought you)
 */
/**
 * Annoyed by a hand, and the hand gone: it turns its back on you. Up and round on the spot till
 * it faces away (the window, more or less), and down to sit with its back to you, its ears turned
 * out to the sides; a while on, once, a look back over its shoulder at you, and away again; and
 * when it is over it, it is itself again (as often as not putting its coat to rights after).
 */
export class Snub implements Act {
  readonly name = 'snub';
  phase: 'turn' | 'sit' = 'turn';
  private t = 0;
  private set = false;
  private readonly glance = rand(2.5, 5);
  constructor(private readonly yaw = Math.PI + (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 0.7)) {}
  /** its eyes are its own business: not on you (but for the glance back) */
  get ownGaze() {
    return true;
  }
  /** already lying with its back to you: it stays as it is */
  private still = false;
  update(dt: number, c: Ctx) {
    const m = c.m;
    this.t += dt;
    if (this.phase === 'turn') {
      if (!this.set) {
        this.set = true;
        m.lookAt(null);
        if (Math.abs(wrapA(m.yaw - Math.PI)) < 0.9) {
          this.still = true;
          this.phase = 'sit';
          this.t = 0;
          return true;
        }
      }
      // (up first: it may have been on its way down)
      m.setPosture('stand');
      if (!m.goal) m.walkTo(m.pos.clone(), 0.2, this.yaw, () => { this.phase = 'sit'; this.t = 0; });
      m.layer = { pose: { earFwd: -0.35 }, w: ease(this.t / 0.4) };
      // (if it cannot get round, it gives it up)
      return this.t < 5;
    }
    if (!this.still) m.setPosture('sit');
    // the glance back over its shoulder at you: the head comes round as far as it goes, a moment
    const g = this.t - this.glance;
    const look = g > 0 && g < 1.8 ? hump(g, 1.8, 0.45) : 0;
    m.lookAt(look > 0.05 ? c.viewer() : null, look);
    m.layer = { pose: { earFwd: -0.35 + 0.45 * look }, w: ease(this.t / 0.5) };
    // over it: back to itself
    if (c.mode !== 'annoyed' && c.mode !== 'angry' && this.t > 1.5) return false;
    return this.t < 45;
  }
  stop(c: Ctx) {
    c.m.layer = null;
    c.m.lookAt(null);
  }
}

/** a corner of the room to sulk in: where to sit, and which way (away from you) */
export interface SulkSpot { to: THREE.Vector3; face: number }

/**
 * Sulking, and in the room still: off to a far corner of it at a stiff quick walk, the ears back,
 * and sat down there with its back to you, the end of its tail lashing now and then, and a look
 * back over its shoulder at you now and then, and away again. A hand on it there is shrugged off:
 * the ears flat, the tail lashed, the head round at the hand a moment. Made up with, it turns round
 * to you, sits, and gives you a slow blink: no hard feelings.
 */
export class Sulk implements Act {
  readonly name = 'sulk';
  phase: 'go' | 'sit' | 'round' = 'go';
  private t = 0;
  private going = false;
  private glance = -1;
  private glanceIn = rand(4, 9);
  private lashIn = rand(1.5, 4);
  private shrug = 0;
  private faceYou = 0;
  /** sat there a good while, it dozes off where it sulks, its back still to you: how long it has
   *  sat (s), when it nods off, and how far gone it is (0 .. 1) */
  private satFor = 0;
  private readonly dozeAt = rand(90, 150);
  doze = 0;
  constructor(public spot: SulkSpot, private onThere?: () => void, private hurry = true) {}
  /** its eyes are its own business */
  get ownGaze() {
    return true;
  }
  /** sat down in its corner already (found sulking there when the window is opened) */
  sat() {
    this.phase = 'sit';
    this.t = 0;
    this.there();
  }
  /** a hand on it: shrugged off (woken, if it was dozing) */
  rebuff() {
    this.shrug = 1;
    this.lashIn = 0;
    this.satFor = 0;
  }
  /** called (a knock on the glass): a look back over its shoulder (it heard you), and away again
   *  (woken a while, if it was dozing) */
  heard() {
    if (this.phase === 'sit' && this.glance < 0) { this.glance = 0; this.glanceIn = rand(6, 12); }
    this.satFor = Math.min(this.satFor, this.dozeAt - 30);
  }
  /** a hand that will not leave it be: up and off to another corner */
  moveTo(spot: SulkSpot) {
    this.spot = spot;
    this.phase = 'go';
    this.going = false;
    this.hurry = true;
    this.t = 0;
  }
  /** made up with: round to you, and over */
  makeUp() {
    if (this.phase === 'round') return;
    this.phase = 'round';
    this.t = 0;
    this.going = false;
  }
  private there() {
    const cb = this.onThere;
    this.onThere = undefined;
    cb?.();
  }
  update(dt: number, c: Ctx) {
    const m = c.m;
    this.t += dt;
    this.shrug = Math.max(0, this.shrug - dt * 0.8);
    // (the sulk over by the mind's say, whatever way it ended: round to you, and done)
    if (this.phase !== 'round' && c.mode !== 'away' && c.mode !== 'leaving') this.makeUp();
    if (this.phase === 'go') {
      if (!this.going) {
        this.going = true;
        m.layer = null;
        m.setPosture('stand');
        m.walkTo(this.spot.to.clone(), this.hurry ? 0.75 : 0.35, this.spot.face, () => { this.phase = 'sit'; this.t = 0; this.there(); });
      }
      m.lookAt(null);
      m.layer = { pose: { earFwd: -0.55, earOut: 0.35, tailLift: -0.2 }, w: ease(this.t / 0.3) };
      // (if it cannot get there, it sulks where it is)
      if (this.t > 12) { m.stop(); this.phase = 'sit'; this.t = 0; this.there(); }
      return true;
    }
    if (this.phase === 'round') {
      // round on the spot to you, sat down, a slow blink, and that is that
      const v = c.viewer();
      if (!this.going) {
        this.going = true;
        m.setPosture('stand');
        m.walkTo(m.pos.clone(), 0.2, Math.atan2(v.x - m.pos.x, v.z - m.pos.z), () => { this.faceYou = this.t; m.slowBlink(); });
      }
      if (this.faceYou > 0) m.setPosture('sit');
      m.lookAt(v, this.faceYou > 0 ? 0.9 : 0.4);
      m.layer = { pose: { earFwd: 0.1 }, w: ease(this.t / 0.6) };
      return this.faceYou === 0 ? this.t < 5 : this.t - this.faceYou < 1.6;
    }
    // sat with its back to you (and, a good while sat, dozing off there: the eyes closing, the head
    // sinking, the tail still, the glances over the shoulder given up)
    m.setPosture('loaf');
    this.satFor += dt;
    const dozy = this.satFor > this.dozeAt && this.shrug < 0.05 && this.glance < 0 ? 1 : 0;
    this.doze += (dozy - this.doze) * (1 - Math.exp(-dt * (dozy ? 0.25 : 3)));
    if ((this.lashIn -= dt * (1 - 0.8 * this.doze)) <= 0) {
      this.lashIn = rand(1.8, 4.5);
      m.flickTail(0.9 + 0.6 * this.shrug + 0.3 * Math.random());
    }
    // the look back over its shoulder at you, a moment, now and then (and at a hand on it, at once)
    if (this.glance < 0 && ((this.doze < 0.5 && (this.glanceIn -= dt) <= 0) || this.shrug > 0.95)) { this.glance = 0; this.glanceIn = rand(6, 12); }
    let look = 0;
    if (this.glance >= 0) {
      this.glance += dt;
      look = hump(this.glance, 1.6, 0.35);
      if (this.glance > 1.6) this.glance = -1;
    }
    m.lookAt(look > 0.05 ? c.viewer() : null, look);
    const d = this.doze;
    m.layer = {
      pose: {
        earFwd: -0.4 - 0.5 * this.shrug + 0.25 * d, earOut: 0.3 + 0.3 * this.shrug, earFlat: 0.8 * this.shrug, squint: 0.2 + 0.3 * this.shrug,
        eyeOpen: 0.92 - 0.8 * d, neckPitch: -0.45 * d, headPitch: -0.2 * d,
      },
      w: ease(this.t / 0.5),
    };
    return true;
  }
  stop(c: Ctx) {
    c.m.layer = null;
    c.m.lookAt(null);
  }
}

/**
 * Hungry (or thirsty) and the bowl empty: over to it, a sniff down into it, nothing there; then
 * round to you, sat by it looking up at you, and a meow, a plaintive one if it has waited long, as
 * a cat asks. Fed meanwhile, it stops at once (and goes to eat of its own accord).
 */
export class Beg implements Act {
  readonly name = 'beg';
  phase: 'go' | 'sniff' | 'turn' | 'ask' = 'go';
  private t = 0;
  private set = false;
  private said = false;
  private readonly stay = rand(7, 11);
  constructor(private readonly bowl: THREE.Vector3, private readonly urgent: boolean, private readonly empty: () => boolean) {}
  /** on the bowl till it has turned round to you */
  get ownGaze() {
    return this.phase !== 'ask';
  }
  update(dt: number, c: Ctx) {
    const m = c.m;
    this.t += dt;
    if (!this.empty()) return false;
    if (this.phase === 'go') {
      if (!this.set) {
        this.set = true;
        // (stopped with its mouth over the bowl, as when it eats)
        const face = Math.atan2(this.bowl.x - m.pos.x, this.bowl.z - m.pos.z);
        m.setPosture('stand');
        m.walkTo(new THREE.Vector3(this.bowl.x - Math.sin(face) * 0.2, 0, this.bowl.z - Math.cos(face) * 0.2), 0.32, face, () => {
          this.phase = 'sniff';
          this.t = 0;
        });
      }
      m.lookAt(this.bowl, 1);
      return this.t < 14;
    }
    if (this.phase === 'sniff') {
      // the head down into it a moment, sniffing: nothing
      m.setPosture('stand');
      m.lookAt(null);
      m.layer = { pose: { neckPitch: -0.85, headPitch: -0.25, earFwd: 0.2 }, w: hump(this.t, 1.7, 0.35) };
      if (this.t > 1.8) { this.phase = 'turn'; this.t = 0; this.set = false; m.layer = null; }
      return true;
    }
    if (this.phase === 'turn') {
      // a step aside, toward the middle of the room, and round to you: sat beside the bowl, so
      // that you see it empty there
      if (!this.set) {
        this.set = true;
        const v = c.viewer();
        const side = this.bowl.x < 0 ? 1 : -1;
        const at = c.keepClear(new THREE.Vector3(this.bowl.x + side * 0.15, 0, this.bowl.z + 0.1), 0.06);
        m.setPosture('stand');
        m.walkTo(at, 0.2, Math.atan2(v.x - at.x, v.z - at.z), () => { this.phase = 'ask'; this.t = 0; });
      }
      return this.t < 6;
    }
    // sat by it looking up at you (the eyes are on you of themselves), the ears to you; the meow
    m.setPosture('sit');
    m.layer = { pose: { earFwd: 0.35 }, w: ease(this.t / 0.4) };
    if (!this.said && this.t > 0.7) {
      this.said = true;
      c.say(this.urgent ? 'meowPlead' : 'meow');
    }
    return this.t < this.stay;
  }
  stop(c: Ctx) {
    c.m.layer = null;
    c.m.lookAt(null);
  }
}

/** a finger on the glass as the cat sees it: where on the glass in front of it (in the room), and
 *  how long it has been still (seconds) */
export interface GlassFinger {
  at: THREE.Vector3;
  still: number;
}

type PawSide = 'LF' | 'RF';

/** a go at the finger on the glass: how it reaches (sat; reared up on its haunches; stood up on its
 *  hind legs, both forepaws to the glass), how long it takes, and when a paw lands on the glass */
interface Bout {
  kind: 'sit' | 'rear' | 'up';
  end: number;
  /** the paw it reaches with (stood up: the one at the finger) */
  paw: PawSide;
  /** when a paw meets the glass, and which */
  beats: { at: number; paw: PawSide }[];
}

/**
 * A finger moving over the glass low down in the room: something to be had. Up to the glass under
 * it, sat facing it with the head going after it, ears pricked and eyes wide; then at it. Low down,
 * a forepaw put out to the glass where the finger is, the wrist bent back so the pads meet it flat
 * (to you), held a moment and taken back; a little higher, the same up on its haunches; higher
 * still, up on its hind legs, both forepaws on the glass, and a pat or two at the finger with one
 * and then the other as it goes. Now and then two pats quick together; after the finger along the
 * glass when it goes out of reach. Each pat lands on the glass (`landed`: which paw, for the app to
 * leave its print there, and make it felt under the finger and heard). The finger gone, it is
 * looked for a moment; after a few goes the game is over.
 *
 * Asking (invite): in the mood for a game and nobody playing, it comes to the glass of its own
 * accord, sits and looks at you, says so (a chirp, a trill), and pats at the glass in front of it,
 * or stands up and puts its paws to it; once or twice, and a while waiting. A finger on the glass
 * then, and the game is on.
 */
export class PawGlass implements Act {
  readonly name = 'paw';
  phase: 'come' | 'ask' | 'watch' | 'pat' | 'look' | 'lick' | 'nuzzle' | 'blink' = 'come';
  private t = 0;
  private goes = 0;
  private wait = 0.5 + Math.random() * 0.5;
  private readonly most = 3 + Math.floor(Math.random() * 3);
  private bout: Bout | null = null;
  /** where on the glass its paws go (its own frame: out from its middle, up, ahead), after the
   *  finger as it moves */
  private readonly aim = new THREE.Vector3();
  private going = false;
  /** where the finger was when it last came after it */
  private readonly cameFor = new THREE.Vector3(1e3, 0, 0);
  /** a paw met the glass this frame: which (null: none) */
  landed: PawSide | null = null;
  /** its cheek met the glass this frame (rubbing its head on it where the finger is) */
  nuzzled = false;
  /** a cat that loves you, the finger held still at its head's height: a rub of the head on the
   *  glass there instead of a game (decided once, the first time it can be; which cheek; whether
   *  it has stepped in close for it) */
  private rubs: boolean | null = null;
  private cheek = 1;
  private closeIn = false;
  /** before the first pat, as often as not, a sniff at it */
  private sniff = Math.random() < 0.6;
  /** asking you for a game: how many times yet, and whether it has said so this time */
  private asks = 1 + Math.floor(Math.random() * 2);
  private said = false;
  constructor(private readonly finger: () => GlassFinger | null, private invite = false) {}
  /** asked, and nobody came to the glass */
  get unanswered() {
    return this.invite;
  }
  /** asking you for a game, and has said so (or put a paw to the glass) */
  get asking() {
    return this.invite && (this.phase === 'pat' || (this.phase === 'ask' && this.said));
  }
  get ownGaze() {
    return true;
  }
  /** where to sit to reach the finger on the glass: a forearm's reach back from it and a little to
   *  the side it is on (a paw put out to one side, not straight ahead in front of its own white
   *  chest) */
  private spot(c: Ctx, f: GlassFinger) {
    const side = c.m.pos.x < f.at.x ? -1 : 1;
    return c.keepClear(new THREE.Vector3(f.at.x + side * 0.06, 0, f.at.z - 0.2), 0.08);
  }
  /** the finger in its own frame: how far across (to its left), up and ahead */
  private local(f: GlassFinger, m: Ctx['m'], out: THREE.Vector3) {
    const dx = f.at.x - m.pos.x, dz = f.at.z - m.pos.z, cy = Math.cos(m.yaw), sy = Math.sin(m.yaw);
    return out.set(dx * cy - dz * sy, f.at.y, dx * sy + dz * cy);
  }
  private readonly fl = new THREE.Vector3();
  update(dt: number, c: Ctx) {
    const m = c.m;
    this.t += dt;
    this.landed = null;
    this.nuzzled = false;
    const f = this.finger();
    const keen: PoseLayer = { earFwd: 0.85, pupil: 0.9, eyeOpen: 1, whisker: 0.8, tailCurl: 0.5 * Math.sin(this.t * 7) };
    // asked, and here is a finger on the glass: the game is on
    if (this.invite && f && this.phase === 'ask') {
      this.invite = false;
      this.phase = 'watch';
      this.t = 0;
      this.wait = 0.3;
    }
    if (this.invite) return this.ask(dt, c, keen);
    if (this.phase === 'come') {
      if (!f) return false;
      if (!this.going) {
        this.going = true;
        this.cameFor.copy(f.at);
        const to = this.spot(c, f);
        // (near enough already: no shuffle across for the sake of it, only squared up to the glass)
        if (Math.hypot(to.x - m.pos.x, to.z - m.pos.z) < 0.1) {
          if (Math.abs(wrapA(m.yaw)) > 0.35) m.walkTo(m.pos.clone(), 0.15, 0, () => { this.phase = 'watch'; this.t = 0; });
          else { this.phase = 'watch'; this.t = 0; }
        } else {
          m.setPosture('stand');
          m.walkTo(to, 0.4, 0, () => { this.phase = 'watch'; this.t = 0; });
        }
      }
      m.lookAt(f.at, 1);
      return this.t < 8;
    }
    if (!f && this.phase !== 'look' && this.phase !== 'pat' && this.phase !== 'lick' && this.phase !== 'blink') { this.phase = 'look'; this.t = 0; m.layer = null; }
    if (this.phase === 'nuzzle') return this.nuzzle(dt, c, f!);
    if (this.phase === 'blink') {
      // sat back from the glass, looking at you: a slow blink, and done
      m.setPosture('sit');
      m.lookAt(c.viewer(), 1);
      m.layer = { pose: { earFwd: 0.3, whisker: -0.2 }, w: 1 - ease((this.t - 1.4) / 0.5) };
      if (this.t > 0.35 && this.t - dt <= 0.35) m.slowBlink();
      return this.t < 1.9;
    }
    m.setPosture('sit');
    if (this.phase === 'lick') {
      // the paw up to the mouth and licked a few times, the eyes half shut, and down
      const reach = hump(this.t, 1.9, 0.3), sat = POSES.sit.LF;
      const lk = this.t > 0.35 && this.t < 1.5 ? Math.sin(Math.PI * (this.t - 0.35) / 1.15) * Math.max(0, Math.sin(lived(this.t, 3) * 15)) : 0;
      m.lookAt(null);
      m.layer = {
        pose: {
          [this.bout?.paw ?? 'LF']: { planted: 0, frame: 0, x: sat.x + (0.012 - sat.x) * reach, y: sat.y + (0.21 - sat.y) * reach, z: sat.z + (0.135 - sat.z) * reach, flex: 0.85 * reach },
          headPitch: -0.32 - 0.25 * reach, neckPitch: -0.1 * reach, jaw: 0.04 + 0.12 * lk,
          tongue: 0.9 * lk, tongueUp: -0.2,
          eyeOpen: 0.35, squint: 0.5,
        },
        w: 1,
      };
      return this.t < 1.9;
    }
    if (this.phase === 'look') {
      // (where did it go: a look at where it was, and away)
      m.layer = { pose: { earFwd: 0.5, eyeOpen: 1 }, w: 1 - ease((this.t - 0.8) / 0.6) };
      if (this.t > 0.9) m.lookAt(null);
      return this.t < 1.6;
    }
    if (f) m.lookAt(f.at, 1);
    const L = f ? this.local(f, m, this.fl) : null;
    if (this.phase === 'watch') {
      m.layer = { pose: keen, w: ease(this.t / 0.3) };
      if (!L) return true;
      // a cat that loves you, the finger held still about its head's height, near: no game, its
      // head rubbed on the glass there (now and then; the first time it could be)
      this.rubs ??= c.mood.trust > 0.6 && c.mood.arousal < 0.6 && Math.random() < 0.55;
      if (this.rubs && this.goes === 0 && f!.still > 0.7 && L.y > 0.1 && L.y < 0.34 && Math.abs(L.x) < 0.12) {
        this.phase = 'nuzzle'; this.t = 0; this.closeIn = false;
        this.cheek = L.x > 0 ? 1 : -1;
        return true;
      }
      // still a good while (after a pat or two at it, to see if it would go): no game in it
      if (f!.still > 3.5) { this.phase = 'look'; this.t = 0.6; return true; }
      // gone along the glass out of a paw's reach (and not where it was the last time it came
      // after it, as far as it could): after it
      if (Math.abs(L.x) > 0.13 && this.t > 0.4 && Math.abs(f!.at.x - this.cameFor.x) > 0.1) {
        this.phase = 'come'; this.going = false; this.t = 0; m.layer = null;
        return true;
      }
      // first, as often as not, a sniff at it: leant in to it, the head pushed out, the whiskers
      // forward and the nose working
      if (this.sniff && this.goes === 0 && this.t > 0.3) {
        const u = this.t - 0.3, k = hump(u, 1.5, 0.35);
        m.layer = { pose: { ...keen, chestPitch: -1.02 + 0.16 * k, neckPitch: 0.06 - 0.1 * k, headPitch: 0.05 * Math.sin(u * 40) * k, whisker: 1, earFwd: 1 }, w: 1 };
        if (u > 1.5) { this.sniff = false; this.t = 0; this.wait = 0.35 + Math.random() * 0.4; }
        return true;
      }
      if (this.t > this.wait) {
        this.phase = 'pat';
        this.t = 0;
        this.bout = this.plan(L);
        this.aimAt(L, 1);
      }
      return true;
    }
    // at it
    const B = this.bout!;
    if (L) this.aimAt(L, 1 - Math.exp(-dt * 5));
    const u = this.t;
    for (const b of B.beats) if (u >= b.at && u - dt < b.at) this.landed = b.paw;
    m.layer = { pose: { ...keen, ...this.reach(B, u) }, w: this.weight(B, u) };
    if (u >= B.end) {
      this.goes++;
      if (this.goes >= this.most || !f) {
        if (!f) { this.phase = 'look'; this.t = 0; m.layer = null; return true; }
        // (game over: as often as not, the paw that did it licked, as if nothing had happened)
        if (Math.random() < 0.5) { this.phase = 'lick'; this.t = 0; return true; }
        return false;
      }
      this.phase = 'watch';
      this.t = 0;
      this.wait = 0.45 + Math.random() * 1.1;
    }
    return true;
  }
  /** its head rubbed on the glass where the finger is: in close to the glass under it, then leant
   *  in, the cheek put to the glass and drawn along it and back, two or three times, the eyes
   *  shut and the ears laid back a little, the tail up (a trill first, now and then); each time
   *  the cheek meets the finger it is felt; then sat back */
  private nuzzle(dt: number, c: Ctx, f: GlassFinger | null) {
    const m = c.m;
    if (!this.closeIn) {
      this.closeIn = true;
      if (Math.random() < 0.5) c.say('trill');
    }
    // (a scoot across and in as it leans, so that its head comes under the finger)
    if (f && this.t < 0.6) {
      const tx = f.at.x - this.cheek * 0.015, tz = f.at.z - 0.17;
      const k = Math.min(1, dt * 6);
      m.pos.x += (tx - m.pos.x) * k;
      m.pos.z += Math.max(0, tz - m.pos.z) * k;
    }
    m.setPosture('sit');
    // (the eyes on the finger as it comes in; then the face to the glass, whatever the finger's
    // height, the cheek and not the top of the head to it, so you see it from your side)
    if (f) m.lookAt(f.at, this.t < 0.5 ? 0.6 : 0.15);
    const s = this.cheek, t = this.t;
    // in (0 .. 0.6), the strokes (each 0.8 s), out after the last
    const n = 3, lean = ease(t / 0.6) * (1 - ease((t - 0.6 - n * 0.8) / 0.5));
    const ph = Math.max(0, t - 0.6) / 0.8, k = Math.floor(ph), u = ph - k;
    const stroke = t > 0.6 && k < n ? Math.sin(Math.PI * 2 * u) : 0;
    // (the cheek meets the glass at the start of each stroke)
    if (t > 0.6 && k < n && Math.floor((t - dt - 0.6) / 0.8) < k) this.nuzzled = true;
    m.layer = {
      pose: {
        // (the face up to the glass and turned to put the cheek to it, drawn along it and back;
        // seen from your side of the glass, the face pressed to it)
        neckPitch: 0, headPitch: -0.32 + 0.4 * lean,
        headYaw: s * lean * (0.45 + 0.22 * stroke), headRoll: s * lean * (0.15 + 0.12 * stroke), neckYaw: s * 0.16 * stroke * lean,
        eyeOpen: 1 - 0.85 * lean, squint: 0.5 * lean, earFwd: -0.35 * lean, earOut: 0.25 * lean, whisker: -0.4 * lean,
        tailLift: 1.1 * lean, tailHook: 0.6 * lean,
      },
      w: 1,
    };
    if (t > 0.6 + n * 0.8 + 0.5) { this.phase = 'blink'; this.t = 0; m.layer = null; }
    return true;
  }

  /** asking for a game: up to the glass, sat looking at you, a word, and a pat or two at the
   *  glass in front of it (or up on its hind legs with its paws to it); a while waiting */
  private ask(dt: number, c: Ctx, keen: PoseLayer) {
    const m = c.m;
    if (this.phase === 'come') {
      if (!this.going) {
        this.going = true;
        const to = c.keepClear(c.window.clone(), 0.08);
        if (Math.hypot(to.x - m.pos.x, to.z - m.pos.z) < 0.1) { this.phase = 'ask'; this.t = 0; }
        else {
          m.setPosture('stand');
          m.walkTo(to, 0.35, 0, () => { this.phase = 'ask'; this.t = 0; });
        }
      }
      m.lookAt(c.viewer(), 1);
      return this.t < 10;
    }
    m.setPosture('sit');
    m.lookAt(c.viewer(), 1);
    if (this.phase === 'ask') {
      m.layer = { pose: keen, w: ease(this.t / 0.3) };
      if (this.t > 0.7 && !this.said) { this.said = true; c.say(Math.random() < 0.6 ? 'chirp' : 'trill'); }
      if (this.t > 1.5 && this.asks > 0) {
        this.asks--;
        this.phase = 'pat';
        this.t = 0;
        // (at the glass just in front of its face; or up to it)
        this.fl.set((Math.random() < 0.5 ? -1 : 1) * 0.04, Math.random() < 0.5 ? 0.32 : 0.19, 0.2);
        this.bout = this.plan(this.fl);
        this.aimAt(this.fl, 1);
      }
      return this.t < 6;
    }
    const B = this.bout!, u = this.t;
    for (const b of B.beats) if (u >= b.at && u - dt < b.at) this.landed = b.paw;
    m.layer = { pose: { ...keen, ...this.reach(B, u) }, w: this.weight(B, u) };
    if (u >= B.end) {
      this.phase = 'ask';
      this.t = 0;
      this.said = Math.random() < 0.5;
    }
    return true;
  }
  /** a go at it: how it reaches for a finger so high, and its beats */
  private plan(L: THREE.Vector3): Bout {
    const near: PawSide = Math.abs(L.x) < 0.02 ? (Math.random() < 0.5 ? 'LF' : 'RF') : L.x > 0 ? 'LF' : 'RF';
    const other: PawSide = near === 'LF' ? 'RF' : 'LF';
    if (L.y >= 0.22) {
      // up on its hind legs (0.45 s), both paws to the glass, a pat or two, and down (from as low
      // as its chin: sat, a paw put up there is lost against its own white chest)
      const pats = 1 + Math.floor(Math.random() * 3);
      const beats = [{ at: 0.45, paw: near }, { at: 0.52, paw: other }];
      let at = 0.52;
      for (let i = 0; i < pats; i++) {
        at += 0.4 + Math.random() * 0.35;
        beats.push({ at, paw: i % 2 ? other : near });
      }
      return { kind: 'up', paw: near, beats, end: at + 0.45 + 0.55 };
    }
    const twice = Math.random() < 0.35;
    return { kind: L.y >= 0.15 ? 'rear' : 'sit', paw: near, beats: twice ? [{ at: 0.32, paw: near }, { at: 0.6, paw: near }] : [{ at: 0.32, paw: near }], end: twice ? 1.05 : 0.85 };
  }
  /** the paws' mark on the glass after the finger (rate: how far there this frame) */
  private aimAt(L: THREE.Vector3, rate: number) {
    const B = this.bout!;
    const lo = B.kind === 'up' ? 0.26 : B.kind === 'rear' ? 0.15 : 0.05;
    const hi = B.kind === 'up' ? 0.44 : B.kind === 'rear' ? 0.24 : 0.15;
    const x = Math.min(0.09, Math.max(0.035, Math.abs(L.x))), y = Math.min(hi, Math.max(lo, L.y));
    const z = B.kind === 'up' ? 0.17 : Math.min(0.22, Math.max(0.13, L.z));
    this.aim.x += (x - this.aim.x) * rate;
    this.aim.y += (y - this.aim.y) * rate;
    this.aim.z += (z - this.aim.z) * rate;
  }
  /** how far into the reach the body is (the layer's weight) */
  private weight(B: Bout, u: number) {
    if (B.kind === 'up') return u < 0.45 ? ease(u / 0.45) : 1 - ease((u - (B.end - 0.55)) / 0.55);
    const last = B.beats[B.beats.length - 1].at;
    if (u < 0.32) return ease(u / 0.32);
    // (two quick together: drawn back a little between)
    if (B.beats.length > 1 && u < last) return u < 0.44 ? 1 - 0.35 * ease((u - 0.32) / 0.12) : 0.65 + 0.35 * ease((u - 0.44) / (last - 0.44));
    return u < last + 0.14 ? 1 : 1 - ease((u - last - 0.14) / (B.end - last - 0.14));
  }
  /** the reach itself at full weight: the body, and the paw (or paws) on the glass */
  private reach(B: Bout, u: number): PoseLayer {
    const a = this.aim;
    if (B.kind !== 'up') {
      const hi = B.kind === 'rear' ? 1 : 0;
      // (up over it and down on to it: lifted high and drawn back a little on the way, then out and
      // down to the glass; the wrist bending back as it goes, so the pads meet the glass flat;
      // sliding down it a little while held there)
      const s = Math.min(1, u / 0.32), arc = Math.sin(Math.PI * s);
      const slide = u > 0.32 ? 0.012 * Math.min(1, (u - 0.32) / 0.4) : 0;
      const foot = { planted: 0, frame: 0, x: a.x, y: a.y + 0.12 * arc - slide, z: a.z - 0.05 * arc, flex: 0.35 - 1.35 * ease(u / 0.3) };
      return { chestPitch: -1.02 - 0.15 * hi, hipY: 0.058 + 0.022 * hi, neckPitch: 0.06 + 0.08 * hi, [B.paw]: foot };
    }
    // stood up: each paw on the glass, drawn back off it and put to it again at its beats (the
    // first beats are the paws going up to it)
    const paw = (side: PawSide, x: number, y: number) => {
      let off = 0;
      for (const b of B.beats.slice(2)) {
        if (b.paw !== side) continue;
        const s = (u - (b.at - 0.24)) / 0.24;
        if (s > 0 && s < 1) off = Math.max(off, Math.sin(Math.PI * s));
      }
      return { planted: 0, frame: 0, x, y: y - 0.03 * off, z: a.z - 0.06 * off, flex: -1 + 0.6 * off };
    };
    const other: PawSide = B.paw === 'LF' ? 'RF' : 'LF';
    // (the tail out behind along the floor, curving off to one side: with the hips tipped up, a
    // sitting cat's tail would come round between its legs)
    return {
      hipY: 0.13, hipZ: -0.09, hipPitch: 1.25, lumbarPitch: 0.3, chestPitch: -1.35,
      tailLift: 0.6, tailSide: B.paw === 'LF' ? -0.9 : 0.9, tailCurve: 1, tailSag: 1,
      [B.paw]: paw(B.paw, a.x, a.y), [other]: paw(other, 0.045, a.y - 0.05),
    };
  }
  stop(c: Ctx) {
    c.m.layer = null;
    c.m.lookAt(null);
  }
}

/**
 * Claws seen to on the scratching post: over to it (a sniff at its foot, now and then), up on its
 * hind legs at it, the forepaws high on the rope; and the claws dragged down it, one paw and then
 * the other, hard, the back long, the tail up and the eyes half shut with the good of it, the rope
 * rasping and the post rocking; a last long pull with both together, the whole cat stretched; and
 * down again, sat by it, with a look round at you (it is its post, and it has seen to it).
 */
export class Claw implements Act {
  readonly name = 'claw';
  phase: 'go' | 'sniff' | 'up' | 'rake' | 'pull' | 'down' | 'after' = 'go';
  private t = 0;
  private set = false;
  /** how many drags down the rope (each paw's), and how many done */
  private readonly strokes = 5 + Math.floor(Math.random() * 4);
  private drags = 0;
  private readonly sniffs = Math.random() < 0.45;
  /** which paw drags first */
  private readonly lead: PawSide = Math.random() < 0.5 ? 'LF' : 'RF';
  /** how far from the post's middle it stands, and the paws' reach up it */
  static readonly STAND = 0.28;
  static readonly TOP = 0.47;
  static readonly DROP = 0.09;
  /** drags a second (each paw drags once in a cycle) */
  static readonly RATE = 1.5;
  constructor(private readonly post: ScratchPost) {}
  get ownGaze() {
    return true;
  }
  update(dt: number, c: Ctx) {
    const m = c.m, P = this.post;
    this.t += dt;
    // (it stands at the side of the post toward the room's middle, side on to you, facing it)
    const face = -Math.PI / 2;
    if (this.phase === 'go') {
      if (!this.set) {
        this.set = true;
        m.setPosture('stand');
        m.walkTo(new THREE.Vector3(P.at.x + Claw.STAND, 0, P.at.z), 0.3, face, () => {
          this.phase = this.sniffs ? 'sniff' : 'up';
          this.t = 0;
        });
      }
      m.lookAt(new THREE.Vector3(P.at.x, 0.3, P.at.z), 0.7);
      return this.t < 12;
    }
    // (stood: up from all fours on to the hind legs and down again, as a cat does it; sat, after)
    m.setPosture(this.phase === 'after' ? 'sit' : 'stand');
    const surface = Claw.STAND - P.r - 0.008;
    if (this.phase === 'sniff') {
      // the nose down to the foot of it and up the rope a little, the whiskers forward
      m.lookAt(null);
      const k = hump(this.t, 1.4, 0.35), up = ease((this.t - 0.6) / 0.5);
      m.layer = { pose: { neckPitch: -0.55 * k + 0.35 * up * k, headPitch: -0.3 * k + 0.05 * Math.sin(this.t * 38) * k, whisker: 1, earFwd: 0.8 }, w: k };
      if (this.t > 1.4) { this.phase = 'up'; this.t = 0; }
      return true;
    }
    m.lookAt(null);
    const look: PoseLayer = { eyeOpen: 0.5, squint: 0.45, earFwd: 0.15, earOut: 0.3, whisker: 0.2 };
    if (this.phase === 'up') {
      // up on the hind legs, the forepaws going up the rope to the top of their reach
      const w = ease(this.t / 0.5);
      m.layer = { pose: { ...look, ...this.stance(surface, 0, 0, 0) }, w };
      if (this.t >= 0.5) { this.phase = 'rake'; this.t = 0; }
      return true;
    }
    if (this.phase === 'rake') {
      // one paw dragged down the rope while the other goes back up for its turn
      const cyc = this.t * Claw.RATE;
      const n = Math.floor(cyc * 2);
      if (n >= this.drags && n < this.strokes) {
        this.drags = n + 1;
        const side = (n % 2 === 0) === (this.lead === 'LF') ? 1 : -1;
        c.sound('sisal', 0.2 + 0.08 * Math.random());
        c.bump(new THREE.Vector3(P.at.x + P.r, Claw.TOP, P.at.z + side * 0.03), 0.5);
      }
      const ph = (u: number) => ((u % 1) + 1) % 1;
      // (the first paw drags from the top at once, the other waits at the top for its turn half a
      // stroke later; and each, its drags done, stays at the top for the other to be done with its)
      const S = this.strokes;
      const a = cyc < Math.ceil(S / 2) ? ph(cyc) : 0;
      const b = cyc >= 0.5 && cyc < 0.5 + Math.floor(S / 2) ? ph(cyc - 0.5) : 0;
      m.layer = { pose: { ...look, ...this.stance(surface, this.lead === 'LF' ? a : b, this.lead === 'LF' ? b : a, 1) }, w: 1 };
      // (done: both paws back at the top for the last long pull)
      if (cyc >= (S + 1) / 2) { this.phase = 'pull'; this.t = 0; }
      return true;
    }
    if (this.phase === 'pull') {
      // both paws drawn slowly down together, the back stretched long, the tail up and quivering
      const u = ease(this.t / 0.9);
      if (this.t - dt <= 0.05 && this.t > 0.05) {
        c.sound('sisal', 0.3);
        c.bump(new THREE.Vector3(P.at.x + P.r, Claw.TOP, P.at.z), 0.8);
      }
      const L = this.stance(surface, 0, 0, 0);
      const pd = Claw.DROP * 1.3 * u;
      for (const k of ['LF', 'RF'] as const) {
        const f = L[k] as { y: number; flex: number };
        f.y -= pd;
        f.flex = -0.9 + 0.55 * u;
      }
      L.lumbarPitch = (L.lumbarPitch ?? 0) - 0.2 * u;
      L.chestPitch = (L.chestPitch ?? 0) + 0.1 * u;
      L.tailCurl = 0.25 * Math.sin(this.t * 30) * u;
      m.layer = { pose: { ...look, eyeOpen: 0.3, squint: 0.6, ...L }, w: 1 };
      if (this.t > 1.1) { this.phase = 'down'; this.t = 0; }
      return true;
    }
    if (this.phase === 'down') {
      const L = this.stance(surface, 0, 0, 0);
      for (const k of ['LF', 'RF'] as const) (L[k] as { y: number }).y -= Claw.DROP * 1.3;
      m.layer = { pose: { ...look, ...L }, w: 1 - ease(this.t / 0.5) };
      if (this.t >= 0.5) { this.phase = 'after'; this.t = 0; m.layer = null; }
      return true;
    }
    // sat by it, a look round at you, pleased with that
    m.layer = null;
    m.lookAt(this.t > 0.3 && this.t < 2.2 ? c.viewer() : null, 1);
    if (this.t > 0.9 && this.t - dt <= 0.9 && c.mood.trust > 0.6) m.slowBlink();
    return this.t < 2.6;
  }
  /** up at the post: the hind legs under it, the body long up the post, the forepaws on the rope
   *  (each so far through its drag: 0 at the top, going down until 0.55, then back up off the
   *  rope; going: whether it is under way, the shoulders working with the paws) */
  private stance(surface: number, l: number, r: number, going: number): PoseLayer {
    const paw = (u: number, x: number) => {
      const drag = u < 0.55;
      const s = drag ? ease(u / 0.55) : 1 - ease((u - 0.55) / 0.45);
      const off = drag ? 0 : Math.sin(Math.PI * (u - 0.55) / 0.45);
      return { planted: 0, frame: 0, x, y: Claw.TOP - Claw.DROP * s, z: surface - 0.03 * off, flex: drag ? -0.95 + 0.6 * s : -1 + 0.3 * off };
    };
    const ld = l < 0.55 ? Math.sin(Math.PI * l / 0.55) : 0, rd = r < 0.55 ? Math.sin(Math.PI * r / 0.55) : 0;
    // (the back long and straight up to the shoulders, the head down between the forelegs; the
    // hind legs stood up straight under it, on their toes)
    const hind = { planted: 1, frame: 0, x: 0.045, y: 0.013, z: -0.13, flex: 0 };
    return {
      hipY: 0.2, hipZ: -0.1, hipPitch: 0.85, lumbarPitch: 0.1, chestPitch: -0.3 + 0.05 * going * (ld + rd),
      chestRoll: 0.07 * going * (ld - rd), neckPitch: -0.55, headPitch: -0.25,
      hindFlat: 0.15, LH: hind, RH: { ...hind },
      tailLift: 0.95, tailSide: 0.15, tailCurve: 0.5, tailSag: 0.4,
      LF: paw(l, 0.03), RF: paw(r, 0.03),
    };
  }
  stop(c: Ctx) {
    c.m.layer = null;
    c.m.lookAt(null);
  }
}

/**
 * The pompom hanging from the scratching post: sat by it, the eyes on it and the tail tip going;
 * then a paw at it, up off the haunches, out and onto it, and off it swings; the head after it, to
 * and fro, as it goes and comes back; at it again as it comes (and missed, now and then: it moves);
 * a few goes, and then sat watching it come to rest, and a look round at you.
 */
export class Bat implements Act {
  readonly name = 'pompom';
  phase: 'go' | 'watch' | 'swat' | 'after' = 'go';
  private t = 0;
  private set = false;
  private swats = 0;
  private readonly most = 3 + Math.floor(Math.random() * 4);
  private wait = rand(1.2, 2);
  private paw: PawSide = 'RF';
  /** where the paw goes for it (its own frame, the paw's x outward), set as the swat starts */
  private readonly aim = new THREE.Vector3();
  private hit = false;
  /** hits so far */
  hits = 0;
  private readonly tmp = new THREE.Vector3();
  get ownGaze() {
    return true;
  }
  /** the pompom in the cat's own frame: across (to its left), up, ahead */
  private local(c: Ctx, p: THREE.Vector3, out: THREE.Vector3) {
    const m = c.m, dx = p.x - m.pos.x, dz = p.z - m.pos.z, cy = Math.cos(m.yaw), sy = Math.sin(m.yaw);
    return out.set(dx * cy - dz * sy, p.y, dx * sy + dz * cy);
  }
  update(dt: number, c: Ctx) {
    const m = c.m, B = c.pompom();
    if (!B) return false;
    this.t += dt;
    if (this.phase === 'go') {
      if (!this.set) {
        this.set = true;
        // (a paw's reach off it, out to the front and the room side of it, facing it: side on
        // to you as it bats)
        const spot = new THREE.Vector3(B.x + 0.16, 0, B.z + 0.075);
        m.setPosture('stand');
        m.walkTo(spot, 0.3, Math.atan2(B.x - spot.x, B.z - spot.z), () => { this.phase = 'watch'; this.t = 0; });
      }
      m.lookAt(B, 0.8);
      return this.t < 12;
    }
    m.setPosture('sit');
    m.lookAt(B, 1);
    const keen: PoseLayer = { earFwd: 0.9, pupil: 0.95, eyeOpen: 1, whisker: 0.7, tailCurl: 0.8 * Math.sin(this.t * 6), tailLift: -0.4 };
    if (this.phase === 'watch') {
      m.layer = { pose: keen, w: ease(this.t / 0.3) };
      if (this.t > this.wait) {
        const L = this.local(c, B, this.tmp);
        this.paw = L.x > 0 ? 'LF' : 'RF';
        this.aim.set(Math.min(0.09, Math.max(0.02, Math.abs(L.x))), Math.min(0.3, Math.max(0.08, L.y)), Math.min(0.24, Math.max(0.1, L.z)));
        this.hit = false;
        this.phase = 'swat';
        this.t = 0;
      }
      return true;
    }
    if (this.phase === 'swat') {
      // up off its haunches, the paw up and out to it and down through it, and back
      const u = this.t, out = u < 0.22 ? ease(u / 0.22) : 1 - ease((u - 0.3) / 0.3);
      const lift = Math.sin(Math.PI * Math.min(1, u / 0.6));
      const a = this.aim;
      const foot = { planted: 0, frame: 0, x: 0.03 + (a.x - 0.03) * out, y: 0.02 + (a.y + 0.03 - 0.02) * out - 0.05 * ease((u - 0.18) / 0.12) * out, z: 0.1 + (a.z - 0.1) * out, flex: 0.3 - 0.9 * out };
      m.layer = { pose: { ...keen, chestPitch: -1.02 - 0.2 * lift, hipY: 0.058 + 0.03 * lift, neckPitch: 0.1 * lift, [this.paw]: foot }, w: 1 };
      if (!this.hit && u >= 0.2) {
        this.hit = true;
        // (where the paw is now, against where the pompom is: near enough, and it goes)
        const L = this.local(c, B, this.tmp);
        const px = (this.paw === 'LF' ? 1 : -1) * a.x;
        if (Math.hypot(L.x - px, L.y - a.y, L.z - a.z) < 0.08) {
          this.hits++;
          // (pushed away from it and across, the way the paw goes)
          const f = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw)), side = new THREE.Vector3(Math.cos(m.yaw), 0, -Math.sin(m.yaw));
          const k = rand(0.5, 0.9);
          c.batPompom(f.multiplyScalar(k * 0.8).addScaledVector(side, (this.paw === 'LF' ? -1 : 1) * k * 0.6));
        }
      }
      if (u > 0.65) {
        this.swats++;
        this.t = 0;
        this.phase = this.swats >= this.most ? 'after' : 'watch';
        this.wait = rand(0.6, 1.5);
      }
      return true;
    }
    // sat watching it come to rest, then a look round at you
    m.layer = { pose: { ...keen, tailCurl: 0.3 * Math.sin(this.t * 3) }, w: 1 - ease((this.t - 1.6) / 0.4) };
    if (this.t > 1.8) m.lookAt(c.viewer(), 1);
    return this.t < 3;
  }
  stop(c: Ctx) {
    c.m.layer = null;
    c.m.lookAt(null);
  }
}

/**
 * Up on top of the scratching post: over to it, down on its haunches with a long look up, a
 * spring, and it is up there (the post rocking under it as it lands); round on the top to look out
 * over the room, and down into a loaf, the tail hanging over the edge and the tip of it ticking,
 * the head going after whatever moves down below; dozing up there if sleep comes, the head sinking.
 * Then up, round, a look down, and down it jumps. Asked down early (to eat, to sleep in its bed,
 * for a game), it comes down as soon as it can.
 */
export class Top implements Act {
  readonly name = 'top';
  phase: 'go' | 'gather' | 'up' | 'settle' | 'sit' | 'turn' | 'look' | 'down' | 'done' = 'go';
  /** how deep asleep the cat is (set by the avatar): asleep up here, it dozes */
  nap = 0;
  private t = 0;
  private dur = 0;
  private leaving = false;
  private readonly from = new THREE.Vector3();
  private look = Math.random() * 10;
  /** which way it lies up there: out over the room toward you, a little round toward the room */
  private readonly faceUp = rand(0.15, 0.6);
  private going = false;
  constructor(private readonly post: ScratchPost) {}

  /** asked down: down as soon as it can be */
  leave() {
    this.leaving = true;
  }
  /** up there, or on the way up or down */
  get up() {
    return this.phase !== 'go' && this.phase !== 'gather' && this.phase !== 'done';
  }
  get ownGaze() {
    return true;
  }
  /** where it springs from, and where it lands coming down: off the post's side toward the room */
  private launch() {
    return new THREE.Vector3(this.post.at.x + 0.3, 0, this.post.at.z + 0.03);
  }
  private land() {
    return new THREE.Vector3(this.post.at.x + 0.36, 0, this.post.at.z + 0.1);
  }
  private next(phase: Top['phase'], dur = 0) {
    this.phase = phase;
    this.t = 0;
    this.dur = dur;
  }
  update(dt: number, c: Ctx): boolean {
    const m = c.m, P = this.post, H = P.top;
    const seat = new THREE.Vector3(P.at.x, 0, P.at.z);
    this.t += dt;
    switch (this.phase) {
      case 'go':
        if (this.leaving) return false;
        m.layer = null;
        // (straight there, whatever it was walking to before)
        if (!this.going) {
          this.going = true;
          m.walkTo(this.launch(), 0.28, -Math.PI / 2, () => this.next('gather', rand(0.8, 1.3)));
        }
        m.lookAt(new THREE.Vector3(P.at.x, H, P.at.z), 0.6);
        return this.t < 15;
      case 'gather': {
        // down on its haunches, the eyes on the top of the post, the hind paws shifting under it
        if (this.leaving) { m.layer = null; return false; }
        m.setPosture('crouch');
        m.lookAt(new THREE.Vector3(P.at.x, H, P.at.z), 1);
        const sh = Math.sin(this.t * 14);
        m.layer = {
          pose: { neckPitch: 0.7, headPitch: 0.1, earFwd: 0.9, pupil: 0.8, eyeOpen: 1, hipY: 0.13, LH: { y: 0.013 + 0.008 * Math.max(0, sh) }, RH: { y: 0.013 + 0.008 * Math.max(0, -sh) }, tailLift: -0.2, tailCurl: 0.6 * Math.sin(this.t * 6) },
          w: Math.min(1, this.t / 0.3),
        };
        if (this.t > this.dur) {
          this.from.copy(m.pos);
          c.hold(0);
          m.lookAt(null);
          this.next('up', 0.5);
        }
        return true;
      }
      case 'up': {
        // the spring: up in an arc, the forelegs reaching up for the top, the hind legs driving and
        // then tucked up after
        const u = Math.min(1, this.t / this.dur);
        m.pos.lerpVectors(this.from, seat, smooth(u));
        m.yaw = -Math.PI / 2;
        c.hold(H * smooth(Math.min(1, u * 1.15)) + 0.1 * Math.sin(Math.PI * u));
        const fy = 0.012 + 0.12 * Math.sin(Math.PI * Math.min(1, u / 0.75));
        const fore = { planted: 0, frame: 0, x: 0.035, y: fy, z: 0.11 + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.25)), flex: 0.3 * Math.sin(Math.PI * u) };
        const hind = { planted: 0, frame: 0, x: 0.04, y: 0.013 + 0.06 * Math.sin(Math.PI * u), z: -0.16 - 0.08 * (1 - u) * Math.sin(Math.PI * Math.min(1, u * 2)) };
        // (the body reared up steep off the floor, coming round level as the forepaws reach the top
        // and the hind legs are drawn up after)
        const rear = 1 - smooth(Math.min(1, u * 1.25));
        m.layer = { pose: { hipY: 0.2, hipPitch: 0.95 * rear, chestPitch: 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.3)), neckPitch: 0.25 - 0.3 * rear, earFwd: 0.6, LF: fore, RF: fore, LH: hind, RH: hind, tailLift: 0.4 - 0.6 * rear }, w: 1 };
        if (u >= 1) {
          c.perch(H);
          c.hold(null);
          m.layer = null;
          c.sound('thump', 0.24);
          c.bump(new THREE.Vector3(P.at.x + P.topR, H, P.at.z), 0.9);
          this.next('settle', 0.4);
        }
        return true;
      }
      case 'settle':
        // round on the top to look out over the room
        m.setPosture('stand');
        m.lookAt(null);
        if (Math.abs(wrapA(this.faceUp - m.yaw)) > 0.12) { if (!m.goal) m.walkTo(m.pos.clone(), 0.08, this.faceUp); this.t = 0; return true; }
        if (this.t > this.dur) this.next('sit', this.leaving ? 0.8 : c.night > 0.5 ? rand(70, 160) : rand(35, 90));
        return true;
      case 'sit': {
        // a loaf up there, the tail down over the edge, the tip of it ticking now and then; looking
        // about over the room, or down at it; dozing if sleep comes, the head sinking
        m.setPosture('loaf');
        this.look += dt;
        const deep = Math.min(1, Math.max(0, (this.nap - 0.3) / 0.5));
        const glance = (1 - deep) * (0.45 * Math.sin(this.look * 0.37) + 0.2 * Math.sin(this.look * 1.13));
        const down = (1 - deep) * Math.max(0, Math.sin(this.look * 0.21 + 1)) * 0.35;
        const tick = Math.max(0, Math.sin(this.look * 0.6)) ** 6;
        m.lookAt(null);
        m.layer = {
          pose: {
            neckYaw: glance, headYaw: 0.5 * glance, neckPitch: -0.5 * deep - down, headPitch: -0.22 * deep - 0.3 * down, earFwd: 0.45 * (1 - deep),
            // (the tail out to the side over the edge, where it hangs down in sight of you)
            tailLift: -1.1, tailSide: -1.35, tailSag: 1, tailCurve: 0.1, tailCurl: 0.9 * tick * Math.sin(this.look * 9) * (1 - 0.7 * deep),
          },
          w: Math.min(1, this.t / 1.2),
        };
        if ((this.t > this.dur && this.nap <= 0.3) || this.leaving) { m.layer = null; this.next('turn', 0.4); }
        return true;
      }
      case 'turn': {
        // up, round to the way down
        m.setPosture('stand');
        const L = this.land(), out = Math.atan2(L.x - m.pos.x, L.z - m.pos.z);
        if (Math.abs(wrapA(out - m.yaw)) > 0.15) { if (!m.goal) m.walkTo(m.pos.clone(), 0.08, out); this.t = 0; return true; }
        // (asked down, for the red dot or its bowl, no long look first)
        if (this.t > this.dur) this.next('look', this.leaving ? 0.3 : rand(0.5, 0.9));
        return true;
      }
      case 'look':
        // a look down at where it will land, gathering
        m.setPosture('crouch');
        m.layer = { pose: { neckPitch: -0.75, headPitch: -0.25, earFwd: 0.7, hipY: 0.14 }, w: Math.min(1, this.t / 0.3) };
        if (this.t > this.dur) {
          this.from.copy(m.pos);
          c.perch(null);
          c.hold(H);
          this.next('down', 0.48);
          // (off the top this very frame: not a moment stood on it with nothing under the paws)
          return this.update(0, c);
        }
        return true;
      case 'down': {
        // out and down: forelegs reaching down to land, the hind legs following
        const u = Math.min(1, this.t / this.dur), L = this.land();
        m.pos.lerpVectors(this.from, L, smooth(u));
        m.yaw = Math.atan2(L.x - this.from.x, L.z - this.from.z);
        c.hold(H * (1 - smooth(Math.min(1, u * 1.1))) + 0.05 * Math.sin(Math.PI * u));
        const fore = { planted: 0, frame: 0, x: 0.035, y: 0.012 - 0.03 * Math.sin(Math.PI * Math.min(1, u * 1.3)), z: 0.13 + 0.08 * Math.sin(Math.PI * u), flex: 0.25 };
        const hind = { planted: 0, frame: 0, x: 0.04, y: 0.013 + 0.04 * Math.sin(Math.PI * u), z: -0.17 };
        // (nose down off the top, coming level again as the forepaws meet the floor)
        m.layer = { pose: { hipY: 0.2, hipPitch: -0.55 * Math.sin(Math.PI * Math.min(1, u * 1.1)), chestPitch: -0.35 * Math.sin(Math.PI * u), neckPitch: -0.2, LF: fore, RF: fore, LH: hind, RH: hind, tailLift: 0.5 }, w: 1 };
        if (this.t > 0.05 && this.t - dt <= 0.05) c.bump(new THREE.Vector3(P.at.x + P.topR, H, P.at.z), 0.6);
        if (u >= 1) {
          c.hold(null);
          m.layer = null;
          m.setPosture('stand');
          c.sound('thump', 0.36);
          this.next('done');
        }
        return true;
      }
      case 'done':
        return false;
    }
    return true;
  }
  stop(c: Ctx) {
    c.m.layer = null;
    c.m.lookAt(null);
    c.hold(null);
    c.perch(null);
  }
}

/**
 * Its own tail: the tip of it twitching at the edge of its eye, and it is after it. A look back
 * over its shoulder, low on its legs; then round after it, faster and faster, twice or three times,
 * the tail always swinging away just out of reach; a pounce on it as it comes round at last, held
 * down and bitten; and up it sits as if nothing had happened, a look round at you, and a lick or two
 * at its chest.
 */
export class TailChase implements Act {
  readonly name = 'tail';
  phase: 'see' | 'spin' | 'catch' | 'after' = 'see';
  private t = 0;
  /** which way round it goes (the side the tail is on) */
  private readonly dir = Math.random() < 0.5 ? 1 : -1;
  private readonly turns = 1.6 + Math.random() * 1.4;
  private turned = 0;
  get ownGaze() {
    return this.phase !== 'after';
  }
  update(dt: number, c: Ctx) {
    const m = c.m, d = this.dir;
    this.t += dt;
    if (this.phase === 'see') {
      // the tail tip ticking, and the head round over the shoulder after it
      m.setPosture('crouch');
      m.lookAt(null);
      m.layer = {
        pose: { neckYaw: d * 1.1, headYaw: d * 0.6, headRoll: -d * 0.15, earFwd: 0.85, pupil: 0.95, eyeOpen: 1, whisker: 0.6, tailSide: d * 0.9, tailLift: -0.15, tailCurl: 1.4 * Math.sin(this.t * 17), hipY: 0.15, hipPitch: -0.08 },
        w: ease(this.t / 0.3),
      };
      if (this.t > 1.1) { this.phase = 'spin'; this.t = 0; }
      return true;
    }
    if (this.phase === 'spin') {
      // round after it, the head leading and the tail swinging away out of reach
      m.spin = d * 5.5 * ease(this.t / 0.5);
      this.turned += Math.abs(m.yawRate) * dt / (Math.PI * 2);
      m.layer = { pose: { neckYaw: d * 0.9, headYaw: d * 0.4, earFwd: 0.7, pupil: 1, eyeOpen: 1, tailSide: d * 1.3, tailLift: -0.05, tailCurl: 0.6, hipY: 0.15 }, w: 1 };
      // (round enough: off the brakes where it will come to rest more or less facing you, the way
      // it is going carrying it a radian or so on as it stops)
      const ahead = ((d * (0 - m.yaw)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const carry = Math.abs(m.yawRate) / 5;
      if ((this.turned >= this.turns && Math.abs(ahead - carry) < 0.35) || this.t > 6) {
        m.spin = 0;
        this.phase = 'catch';
        this.t = 0;
        c.sound('thump', 0.08);
      }
      return true;
    }
    if (this.phase === 'catch') {
      // got it: down on it, a forepaw on it and the head round and down to bite
      m.setPosture('sit');
      const bite = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (this.t - 0.35) / 0.5))));
      m.layer = {
        pose: {
          neckYaw: d * 1.25, neckPitch: -0.55, headYaw: d * 0.5, headPitch: -0.35, jaw: 0.28 * bite, eyeOpen: 0.7, earFwd: 0.4,
          tailSide: d * 1.6, tailLift: -0.9, tailCurve: 1.2, tailCurl: 0.3,
          [d > 0 ? 'LF' : 'RF']: { planted: 0, frame: 0, x: 0.06, y: 0.045, z: 0.09, flex: 0.6 },
        },
        w: ease(this.t / 0.2) * (1 - ease((this.t - 1.2) / 0.4)),
      };
      if (this.t > 1.6) { this.phase = 'after'; this.t = 0; m.layer = null; }
      return true;
    }
    // as if nothing had happened: sat up, a look at you, and a lick or two at the chest
    m.setPosture('sit');
    m.lookAt(this.t < 1.4 ? c.viewer() : null, 1);
    if (this.t > 1.4) {
      const u = this.t - 1.4;
      const l = Math.sin(lived(u, 5) * 8.5);
      m.layer = { pose: { neckPitch: -0.75, headPitch: -0.55 + 0.12 * l, jaw: 0.1 * Math.max(0, l), eyeOpen: 0.4 }, w: ease(u / 0.4) * (1 - ease((u - 1.6) / 0.4)) };
    }
    return this.t < 3.5;
  }
  stop(c: Ctx) {
    c.m.spin = 0;
    c.m.layer = null;
    c.m.lookAt(null);
  }
}

/**
 * The toy mouse gone in under the radiator: over to it, down low with the head to the floor for a
 * look in under (the rump up, the tail going); then down on its chest and a forepaw in after it,
 * feeling about, a scrabble of claws on the boards; a look again; and again. Now and then the paw
 * hooks it and out it skids (after it at once, and it is brought to you); or, beaten, it sits up,
 * looks at the radiator and then at you, and asks: a meow, the eyes going from you to the
 * radiator and back, waiting for a hand (a tap there gets it out, and it is after it).
 */
export class Fish implements Act {
  readonly name = 'fish';
  phase: 'go' | 'peer' | 'reach' | 'ask' | 'after' = 'go';
  private t = 0;
  private set = false;
  private reaches = 0;
  private readonly most = 2 + Math.floor(Math.random() * 2);
  /** which forepaw goes in after it */
  private paw: PawSide = Math.random() < 0.5 ? 'LF' : 'RF';
  /** out from under it now (a paw got it, or a hand): after it, as for a thrown one (the avatar
   *  sends it, a Gift) */
  out = false;
  /** how likely a reach is to hook it (set beforehand to have it so) */
  luck = 0.35;
  /** asking: round to you yet */
  private turning = false;
  private turned = false;
  get ownGaze() {
    return true;
  }
  update(dt: number, c: Ctx) {
    const m = c.m, M = c.mouse();
    if (!M) return false;
    this.t += dt;
    // out of there (a paw, or a hand), and moving: after it
    if (!M.under) {
      m.layer = null;
      this.out = true;
      return false;
    }
    // (in front of it, facing the wall: a forearm's length and a bit back from the gap)
    const stand = new THREE.Vector3(M.p.x, 0, M.p.z + 0.27);
    if (this.phase === 'go') {
      if (!this.set) {
        this.set = true;
        m.setPosture('stand');
        m.walkTo(c.keepClear(stand.clone(), 0.06), 0.4, Math.PI, () => { this.phase = 'peer'; this.t = 0; });
      }
      m.lookAt(M.p, 1);
      return this.t < 15;
    }
    if (this.phase === 'peer') {
      // the head right down to the boards and on one side, to see in under it; the rump up and
      // the tail swishing
      m.setPosture('crouch');
      m.lookAt(null);
      const k = hump(this.t, 1.6, 0.35), side = this.paw === 'LF' ? 1 : -1;
      m.layer = {
        pose: {
          hipY: 0.17, neckPitch: -1.0, headPitch: -0.35, headRoll: side * 0.45, earFwd: 0.9, pupil: 0.95, eyeOpen: 1, whisker: 0.8,
          tailLift: 0.5, tailCurl: 0.9 * Math.sin(this.t * 7),
        },
        w: k,
      };
      if (this.t > 1.6) { this.phase = 'reach'; this.t = 0; }
      return true;
    }
    if (this.phase === 'reach') {
      // down on its chest, a forepaw in under after it, feeling about this way and that, the
      // claws scrabbling on the boards; the cheek down to the floor beside it
      m.setPosture('sphinx');
      m.lookAt(null);
      const u = this.t, k = hump(u, 2.4, 0.4);
      const sweep = Math.sin(u * 9), dig = Math.max(0, Math.sin(u * 4.5));
      if (Math.floor(u * 3) !== Math.floor((u - dt) * 3) && u > 0.4 && u < 2.1) c.sound('scrabble', 0.05);
      const side = this.paw === 'LF' ? 1 : -1;
      m.layer = {
        pose: {
          [this.paw]: { planted: 0, frame: 0, x: 0.02 + 0.035 * sweep * side, y: 0.012 + 0.006 * dig, z: 0.25 + 0.03 * dig, flex: 0.2 + 0.4 * dig },
          neckPitch: -0.3, headPitch: -0.2, headRoll: side * 0.35, chestRoll: -side * 0.12, earFwd: 0.7, whisker: 0.9, pupil: 1,
          tailLift: 0.1, tailCurl: 1.1 * Math.sin(u * 8),
        },
        w: k,
      };
      if (u > 2.4) {
        this.reaches++;
        this.paw = Math.random() < 0.7 ? this.paw : this.paw === 'LF' ? 'RF' : 'LF';
        if (Math.random() < this.luck) {
          // got it: out it skids, toward it, and it is after it
          c.hookMouse(m.pos.clone());
          c.sound('pencil', 0.05);
          return true;
        }
        this.t = 0;
        this.phase = this.reaches >= this.most ? 'ask' : 'peer';
      }
      return true;
    }
    if (this.phase === 'ask') {
      // beaten: up, a last look in at it, round to you and sat down, and a word: get it out. The
      // eyes on you, and on the radiator, and on you again
      m.layer = null;
      const at = this.t;
      if (!this.turned) {
        const v = c.viewer(), face = Math.atan2(v.x - m.pos.x, v.z - m.pos.z) + (M.p.x > m.pos.x ? 0.35 : -0.35);
        if (at < 0.8) { m.setPosture('stand'); m.lookAt(M.p, 1); return true; }
        m.lookAt(null);
        if (!this.turning) { this.turning = true; m.walkTo(m.pos.clone(), 0.12, face, () => { this.turned = true; this.t = 0; }); }
        return at < 6 || ((this.turned = true), true);
      }
      m.setPosture('sit');
      m.lookAt((at > 3.2 && at < 4.3) || (at > 7.5 && at < 8.3) ? M.p : c.viewer(), 1);
      if (at > 0.9 && at - dt <= 0.9) c.say(Math.random() < 0.6 ? 'meow' : 'meowPlead');
      if (at > 5.2 && at - dt <= 5.2 && Math.random() < 0.6) c.say('meowSoft');
      if (at > 10) { this.phase = 'after'; this.t = 0; }
      return true;
    }
    // no one came: a last look at it, and it gives it up
    m.lookAt(this.t < 1 ? M.p : null, 1);
    return this.t < 1.4;
  }
  stop(c: Ctx) {
    c.m.layer = null;
    c.m.lookAt(null);
  }
}

export class Gift implements Act {
  readonly name = 'gift';
  phase: 'go' | 'pounce' | 'take' | 'bring' | 'drop' | 'show' = 'go';
  private t = 0;
  private aimIn = 0;
  private readonly side = Math.random() < 0.5 ? -1 : 1;
  constructor(private readonly fetch = false) {}
  /** going for it, its eyes are on the mouse; bringing it and after, on you */
  get ownGaze() {
    return this.phase === 'go' || this.phase === 'pounce' || this.phase === 'take';
  }
  update(dt: number, c: Ctx) {
    const m = c.m, M = c.mouse();
    if (!M) return false;
    this.t += dt;
    // (where the mouth would be over it: the cat stands its head's reach off, facing it)
    const toward = (p: THREE.Vector3) => Math.atan2(p.x - m.pos.x, p.z - m.pos.z);
    if (this.phase === 'go') {
      if (M.state === 'mouth') return false;
      // (gone in under the radiator: that is another matter, Fish)
      if (M.under) return false;
      // (thrown: after it the moment it is down)
      if (M.state === 'air') { m.setPosture('crouch'); m.lookAt(M.p, 1); return this.t < 4; }
      const d = Math.hypot(M.p.x - m.pos.x, M.p.z - m.pos.z);
      if ((this.aimIn -= dt) <= 0 || !m.goal) {
        this.aimIn = 0.3;
        const away = d > 1e-3 ? 0.15 / d : 0;
        const stand = new THREE.Vector3(M.p.x + (m.pos.x - M.p.x) * away, 0, M.p.z + (m.pos.z - M.p.z) * away);
        m.setPosture('stand');
        m.walkTo(c.keepClear(stand, 0.08), this.fetch ? 0.7 : 0.26, toward(M.p), () => {
          this.phase = this.fetch && !M.moving ? 'pounce' : 'take';
          this.t = 0;
        });
      }
      m.lookAt(M.p, 1);
      return this.t < 25;
    }
    if (this.phase === 'pounce') {
      // (a quick crouch and a hop onto it, the forepaws coming down on it)
      m.setPosture('crouch');
      const u = Math.min(1, this.t / 0.7), hop = Math.sin(Math.PI * Math.max(0, (u - 0.45) / 0.55));
      m.layer = { pose: { hipY: 0.1 + 0.03 * hop, chestPitch: 0.25 * hop, neckPitch: -0.45, headPitch: -0.25, earFwd: 0.7, pupil: 0.9 }, w: 1 };
      if (u >= 1) { m.layer = null; this.phase = 'take'; this.t = 0; }
      return true;
    }
    if (this.phase === 'take') {
      // the head down to it, the mouth open, and shut on it
      m.stop();
      m.setPosture('stand');
      const down = ease(this.t / 0.35);
      m.layer = { pose: { neckPitch: -1.0 * down, headPitch: -0.45 * down, jaw: this.t > 0.2 && this.t < 0.55 ? 0.55 : 0.05, earFwd: 0.4 }, w: 1 };
      if (this.t > 0.55) c.carry(c.mouthAt(), m.yaw);
      if (this.t > 0.85) { this.phase = 'bring'; this.t = 0; }
      return true;
    }
    if (this.phase === 'bring') {
      // to the glass with it, the head up and the tail up, proud of it
      if (this.t <= dt) m.lookAt(null);
      c.carry(c.mouthAt(), m.yaw);
      m.setPosture('stand');
      m.layer = { pose: { neckPitch: 0.1, headPitch: 0.08, jaw: 0.08, earFwd: 0.35 }, w: ease(this.t / 0.3) };
      // (a step short of the glass: its mouth, and so the mouse, are well ahead of its feet)
      if (!m.goal) m.walkTo(new THREE.Vector3(c.window.x, 0, c.window.z - 0.1), 0.26, -this.side * 0.42, () => { this.phase = 'drop'; this.t = 0; });
      return this.t < 25;
    }
    if (this.phase === 'drop') {
      // the head down, and the mouth opens: there it is, at your feet
      m.setPosture('stand');
      const down = ease(this.t / 0.4);
      m.layer = { pose: { neckPitch: -0.65 * down, headPitch: -0.3 * down, jaw: this.t > 0.45 ? 0.4 : 0.08, earFwd: 0.3 }, w: 1 };
      if (this.t > 0.45) c.carry(null, m.yaw);
      else c.carry(c.mouthAt(), m.yaw);
      if (this.t > 0.9) { m.layer = null; this.phase = 'show'; this.t = 0; }
      return true;
    }
    // sat by it, looking up at you: a mrrow, and a slow blink
    m.setPosture('sit');
    m.layer = { pose: { earFwd: 0.35 }, w: ease(this.t / 0.4) };
    if (this.t > 0.6 && this.t - dt <= 0.6) c.say(Math.random() < 0.6 ? 'meow' : 'trill');
    if (this.t > 2.4 && this.t - dt <= 2.4) c.blink(true);
    return this.t < 6;
  }
  stop(c: Ctx) {
    // (whatever is in its mouth falls)
    const M = c.mouse();
    if (M?.state === 'mouth') c.carry(null);
    c.m.layer = null;
    c.m.lookAt(null);
    c.m.stop();
  }
}

/** how long a flehmen face is held, with the head coming up into it and going back */
const FLEHMEN = 3.0;
/**
 * The flehmen: a smell worth more than a sniff taken in through the mouth, to taste it. After the
 * sniff (from `from`), the head comes up a little, the mouth hangs open, the upper lip is drawn up
 * off the teeth, the eyes go half shut and the whiskers back; and it stays like that, quite still,
 * a long moment, lost in it (a cat's "what IS that"), and then it is over.
 */
const flehmen = (from: number, before: (t: number) => PoseLayer) => (t: number, m: Motor): PoseLayer => {
  if (t < from) return before(t);
  // (the head up into it, and kept up; the face let go of before the end, the leg's own easing
  // then letting the head go too: not back down into the sniff. Lost in it, the head comes round
  // toward you as it comes up: most things worth a sniff are by the walls, the face away from you)
  const up = ease((t - from) / 0.45), k = flehmenLip(from)(t);
  const b = before(from);
  const mix = (a: number | undefined, z: number, w: number) => (a ?? 0) + (z - (a ?? 0)) * w;
  const toYou = Math.max(-1.4, Math.min(1.4, wrapA(0 - m.yaw)));
  return {
    neckYaw: 0.6 * toYou * up, headYaw: 0.4 * toYou * up,
    neckPitch: mix(b.neckPitch, -0.15, up), headPitch: mix(b.headPitch, 0.28 * k, up), jaw: 0.32 * k,
    eyeOpen: 1 - 0.5 * k, squint: 0.55 * k, earFwd: mix(b.earFwd, 0.3 - 0.4 * k, up), earOut: 0.25 * k, whisker: mix(b.whisker, -0.5 * k, up),
    hipY: b.hipY,
  };
};
const flehmenLip = (from: number) => (t: number) => t < from ? 0 : ease((t - from) / 0.45) * (1 - ease((t - from - FLEHMEN + 1.0) / 0.5));

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
  const s1 = rand(1.5, 3);
  // (now and then something there worth more than a sniff: the flehmen after it)
  const legs: Leg[] = [Math.random() < 0.22
    ? { to: first.to, face: first.face, stay: s1 + FLEHMEN, posture: 'stand', layer: flehmen(s1, sniff), lip: flehmenLip(s1) }
    : { to: first.to, face: first.face, stay: s1, posture: 'stand', layer: sniff }];
  if (Math.random() < 0.5) {
    const next = places.length > 1 && Math.random() < 0.6 ? places[1] : { to: spot(), face: null as number | null };
    legs.push({ to: next.to, face: next.face, stay: rand(2, 5), posture: pick<PoseName>(['sit', 'stand']) });
  }
  const bed = c.bed('loaf');
  legs.push({ to: bed.to, face: bed.yaw, stay: 0.1, posture: 'loaf', home: true });
  return new Walk('wander', legs);
};

/**
 * About the hour you mostly play with it: it goes and waits by the thing (the laser pointer on the
 * sill, the feathers, the ball of wool), sat a little side-on to you between it and you, its eyes
 * going from it to you and back, and now and then a little meow about it.
 */
export const waitBy = (c: Ctx, at: THREE.Vector3) => {
  const you = c.viewer();
  // (a little way off it, on your side of it)
  const dx = you.x - at.x, dz = you.z - at.z, d = Math.hypot(dx, dz) || 1;
  const to = c.keepClear(new THREE.Vector3(at.x + (dx / d) * 0.3, 0, at.z + (dz / d) * 0.3), 0.12);
  const face = Math.atan2(you.x - to.x, you.z - to.z) + (Math.random() < 0.5 ? -1 : 1) * 0.42;
  const stay = rand(8, 20), say = rand(2, stay - 2);
  let said = false;
  return new Walk('wait', [{
    to, face, stay, posture: 'sit',
    layer: (t, m) => {
      if (!said && t > say) { said = true; if (Math.random() < 0.6) m.vocalize(Math.random() < 0.5 ? 'meowSoft' : 'trill', 0.45); }
      return { earFwd: 0.4, tailCurl: 0.4 * Math.sin(t * 3) };
    },
  }]);
};

/**
 * One of its things not where it was (the ball of wool, the toy mouse, the feathers moved while it
 * was not looking): over to it, slowing as it comes, and a look at it close, the neck stretched out
 * to it and the nose working, the ears and whiskers forward, a little wary of it (the tail low);
 * then it is satisfied, and stays where it is.
 */
export const investigate = (c: Ctx, at: THREE.Vector3) => {
  const from = c.m.pos, d = Math.hypot(at.x - from.x, at.z - from.z) || 1;
  const near = Math.min(d, 0.21);
  const stand = c.keepClear(new THREE.Vector3(at.x - ((at.x - from.x) / d) * near, 0, at.z - ((at.z - from.z) / d) * near), 0.12);
  const face = Math.atan2(at.x - stand.x, at.z - stand.z);
  // (the head down to it on the floor, out to it a little higher)
  const low = at.y < 0.1;
  const sniffAt = (t: number): PoseLayer => ({
    neckPitch: low ? -0.95 : -0.35, headPitch: (low ? -0.35 : 0.05) + 0.05 * Math.sin(t * 14), whisker: 0.8, earFwd: 0.7,
    hipY: 0.18 + 0.01 * Math.sin(t * 1.3), tailLift: -0.25, eyeOpen: 1, pupil: 0.7,
  });
  return new Walk('investigate', [{ to: stand, face, stay: rand(1.8, 3.4), posture: 'stand', layer: sniffAt }], 0.2);
};

/**
 * Down on its side and rolled over onto its back, the belly up, the forepaws curled to its chest
 * and the hind legs loose, the back wriggled on the floor, the tail sweeping slowly; rocked (rock
 * 0 .. 1) right over onto its back and half back again, for the joy of it (sd: which side it is on,
 * 1 its right; t: how long into it; D: how long it lasts, coming out of it after)
 */
const bellyUp = (sd: number, t: number, D: number, rock: number): { pose: PoseLayer; w: number } => {
  const S = POSES.side;
  const w = ease(t / 0.7) * (1 - ease((t - D) / 0.7));
  const wr = Math.sin(t * 4.2) * ease((t - 1) / 0.5) * (1 - ease((t - Math.min(2.6, D - 1)) / 0.5) * (1 - rock));
  const over = rock * 0.45 * (0.5 - 0.5 * Math.cos(t * 1.7)) * ease((t - 0.8) / 0.6) * (1 - ease((t - D + 1) / 0.6));
  const [uf, lf, uh, lh] = sd > 0 ? ['LF', 'RF', 'LH', 'RH'] : ['RF', 'LF', 'RH', 'LH'];
  return {
    pose: {
      hipY: S.hipY, hipZ: S.hipZ, hipPitch: S.hipPitch, hipRoll: sd * (S.hipRoll + 0.28 + 0.12 * wr + over), lumbarPitch: 0.05,
      chestRoll: sd * (S.chestRoll + 0.22 - 0.12 * wr + 0.8 * over), chestPitch: -0.05,
      neckPitch: 0.12, headPitch: -0.05, headRoll: sd * (0.25 + 0.4 * over),
      [uf]: { planted: 0, frame: 0, x: 0.07, y: 0.085 + 0.02 * over, z: 0.1, flex: 0.85 },
      [lf]: { planted: 0, frame: 0, x: -0.05, y: 0.04 + 0.04 * over, z: 0.13, flex: 0.6 },
      [uh]: { planted: 0, frame: 0, x: 0.09, y: 0.07 + 0.03 * over, z: -0.2, flex: 0.3 },
      [lh]: { planted: 0, frame: 0, x: -0.06, y: 0.025 + 0.04 * over, z: -0.24, flex: 0.2 },
      pastern: S.pastern, hindFlat: S.hindFlat,
      earFwd: 0.1, earOut: 0.15 + 0.15 * rock, eyeOpen: 0.8 - 0.35 * rock, squint: 0.3 + 0.3 * rock,
      tailLift: S.tailLift, tailSide: 0.5 * Math.sin(t * 1.6), tailCurve: S.tailCurve, tailSag: 1,
    },
    w,
  };
};

/**
 * Its belly offered (rolled over before you, flat out on its side, asleep on its back) and a hand
 * put on it: a trap. All at once the forepaws close round the hand and hold it, the head curls in
 * to bite at it and the hind feet rake it, kick after kick, the tail lashing, the ears out and the
 * pupils black; then it lets go and lies looking at you, eyes wide, as if nothing had happened.
 * Half a game and half meant: a cat sure enough of you to show you its belly is not asking for a
 * hand on it. kind: what it was lying as ('flop': rolled half over, as in Greet and the roll in
 * the sun; 'side': flat out on its side; 'back': on its back); sd: the side it lies on (1: its
 * right, -1: its left; on its back, 0)
 */
export class Trap implements Act {
  readonly name = 'trap';
  phase: 'grab' | 'kick' | 'let' = 'grab';
  private t = 0;
  private all = 0;
  private readonly hold = rand(1.5, 2.6);
  private readonly look = rand(0.9, 1.5);
  /** the pose it was in as it sprang (eased out of over the first moment) */
  private from: PoseLayer | null = null;
  private kicks = -1;
  private bites = 0;
  constructor(readonly kind: 'flop' | 'side' | 'back', readonly sd: number) {}
  get ownGaze() {
    return true;
  }
  /** the hand gone from its grip: let go of it */
  release() {
    if (this.phase === 'let') return;
    this.phase = 'let';
    this.t = 0;
  }
  update(dt: number, c: Ctx) {
    const m = c.m;
    this.t += dt;
    this.all += dt;
    if (!this.from) {
      const p = m.pose as unknown as Record<string, unknown>;
      const from: Record<string, unknown> = {};
      for (const k in p) from[k] = typeof p[k] === 'number' ? p[k] : { ...(p[k] as object) };
      this.from = from as PoseLayer;
    }
    m.stop();
    m.setPosture(this.kind === 'back' ? 'back' : this.kind === 'side' ? 'side' : 'crouch');
    if (this.phase === 'grab' && this.t > 0.22) { this.phase = 'kick'; this.t = 0; }
    if (this.phase === 'kick' && this.t > this.hold) this.release();
    const sd = this.sd, back = this.kind === 'back';
    const kicking = this.phase === 'kick' ? ease(this.t / 0.15) : 0;
    const held = this.phase === 'let' ? 1 - ease(this.t / 0.3) : 1;
    // (the kicks, about four a second, the two hind feet nearly together; and a bite at the hand
    // now and then between them)
    const ph = this.all * Math.PI * 2 * 4.2;
    const k1 = Math.max(0, Math.sin(ph)) * kicking, k2 = Math.max(0, Math.sin(ph + 0.7)) * kicking;
    const n = this.phase === 'kick' ? Math.floor(this.all * 4.2 - 0.25) : this.kicks;
    if (n > this.kicks) { if (this.kicks >= 0) m.kicked = true; this.kicks = n; }
    const bite = this.phase === 'let' ? 0 : Math.max(0, Math.sin(this.all * 6.5 - 0.6)) ** 2;
    if (bite > 0.9 && this.bites < Math.floor(this.all * 6.5 / (Math.PI * 2)) + 1) { this.bites++; m.nibbled = true; }
    // let go: the paws open and come away, the head comes round to look at you
    const open = 1 - held;
    let pose: PoseLayer;
    if (!back) {
      const S = POSES.side;
      const [uf, lf, uh, lh] = sd > 0 ? ['LF', 'RF', 'LH', 'RH'] : ['RF', 'LF', 'RH', 'LH'];
      // (the body rocked by the kicks, the back curled so the hind feet come up under the hand)
      const rock = 0.06 * (k1 - k2);
      pose = {
        hipY: S.hipY, hipZ: S.hipZ, hipPitch: S.hipPitch, hipRoll: sd * (S.hipRoll + 0.34 + rock), lumbarPitch: -0.42 * held, chestRoll: sd * (S.chestRoll + 0.32 - rock), chestPitch: -0.12,
        neckPitch: -0.38 * held + 0.1 * open, neckYaw: sd * 0.05, headPitch: -0.42 * held - 0.15 * bite - 0.1 * open, headRoll: sd * (S.headRoll + 0.35 * open), jaw: 0.32 * bite,
        // (the forepaws out round the hand, in front of the belly)
        [uf]: { planted: 0, frame: 0, x: 0.165 - 0.04 * open, y: 0.1 + 0.04 * open, z: 0.09 + 0.04 * open, flex: 0.85 - 0.55 * open },
        [lf]: { planted: 0, frame: 0, x: -0.15 + 0.04 * open, y: 0.055 + 0.02 * open, z: 0.1 + 0.03 * open, flex: 0.85 - 0.55 * open },
        // (the hind feet together, raking up at it)
        [uh]: { planted: 0, frame: 0, x: 0.1 + 0.07 * k1, y: 0.06 + 0.05 * k1, z: -0.22 + 0.22 * k1, flex: 0.3 + 0.2 * k1 },
        [lh]: { planted: 0, frame: 0, x: -0.07 - 0.07 * k2, y: 0.03 + 0.04 * k2, z: -0.21 + 0.2 * k2, flex: 0.3 + 0.2 * k2 },
        pastern: S.pastern, hindFlat: S.hindFlat,
        earFwd: -0.3 * held + 0.3 * open, earOut: 0.35 * held, pupil: 1, eyeOpen: 0.9 + 0.1 * open, squint: 0, whisker: 0.8 * held,
        tailLift: S.tailLift, tailSide: 0.8 * Math.sin(this.all * 7) * held, tailCurve: S.tailCurve, tailSag: 1,
      };
    } else {
      // on its back: all four paws up round the hand over its belly, the head lifted to it
      const B = POSES.back;
      pose = {
        hipY: B.hipY, hipZ: B.hipZ, hipPitch: B.hipPitch, hipRoll: B.hipRoll, lumbarPitch: -0.28 * held, chestRoll: B.chestRoll, chestPitch: -0.12 * held,
        neckPitch: -0.55 * held - 0.15 * open, neckYaw: 0.25 * held + 0.7 * open, headPitch: -0.3 * held - 0.2 * open - 0.12 * bite, headYaw: 0.15 * held + 0.5 * open, headRoll: 0.3 * open, jaw: 0.3 * bite,
        LF: { planted: 0, frame: 0, x: 0.01 + 0.05 * open, y: 0.21 - 0.03 * open, z: 0.07 + 0.04 * open, flex: 0.85 - 0.5 * open },
        RF: { planted: 0, frame: 0, x: 0.01 + 0.05 * open, y: 0.2 - 0.03 * open, z: 0.05 + 0.04 * open, flex: 0.85 - 0.5 * open },
        LH: { planted: 0, frame: 0, x: 0.07, y: 0.15 + 0.05 * k1, z: -0.14 + 0.13 * k1, flex: 0.35 },
        RH: { planted: 0, frame: 0, x: 0.07, y: 0.15 + 0.05 * k2, z: -0.13 + 0.12 * k2, flex: 0.35 },
        pastern: B.pastern, hindFlat: B.hindFlat,
        earFwd: -0.3 * held + 0.3 * open, earOut: 0.35 * held, pupil: 1, eyeOpen: 0.9 + 0.1 * open, squint: 0, whisker: 0.8 * held,
        tailLift: B.tailLift, tailSide: 0.8 * Math.sin(this.all * 7) * held + B.tailSide * open, tailCurve: B.tailCurve, tailSag: 1,
      };
    }
    // (sprung from where it lay: out of that pose in a moment, quicker than the eye)
    const e = ease(this.all / 0.16);
    if (e < 1 && this.from) {
      const F = this.from as Record<string, unknown>, P = pose as Record<string, unknown>;
      for (const k in P) {
        const a = F[k], b = P[k];
        if (typeof b === 'number' && typeof a === 'number') P[k] = a + (b - a) * e;
        else if (b && typeof b === 'object' && a && typeof a === 'object') {
          const fa = a as Record<string, number>, fb = b as Record<string, number>;
          for (const fk in fb) if (typeof fa[fk] === 'number') fb[fk] = fa[fk] + (fb[fk] - fa[fk]) * e;
        }
      }
    }
    m.layer = { pose, w: 1 };
    // its eyes on the hand while it has it; let go, on you
    m.lookAt(this.phase === 'let' ? c.viewer() : null, 1);
    return this.phase !== 'let' || this.t < this.look;
  }
  stop(c: Ctx) {
    c.m.layer = null;
    c.m.lookAt(null);
  }
}

/** lie a long while in the patch of sun on the floor, as cats will, then back to bed (now and
 *  then first a roll in the warm of it: over onto its back, wriggling, rocking from side to back
 *  and back, the eyes half shut) */
export const sunbathe = (c: Ctx) => {
  const spot = c.sun();
  if (!spot) return null;
  const bed = c.bed('loaf');
  // side on to you as it lies (as in its bed), flat out on its side or on its chest; and turned so
  // that, flat out, its head one way and its tail the other, it is clear of the room's things (not
  // its nose in the books with the mug on them)
  const options = (at: THREE.Vector3) => {
    const out: [PoseName, number][] = [];
    for (const posture of ['side', 'loaf', 'sphinx'] as PoseName[]) {
      const half = posture === 'side' ? 0.25 : 0.14;
      for (const a of posture === 'side' ? [1.25, 1.55, 1.85] : [0.6, 0.9, 1.2]) for (const face of [a, -a]) {
        const end = (d: number) => new THREE.Vector3(at.x + Math.sin(face) * d, 0, at.z + Math.cos(face) * d);
        if (c.clear(end(half), 0.06) && c.clear(end(-half), 0.06)) out.push([posture, face]);
      }
    }
    return out;
  };
  const ok = options(spot);
  if (!ok.length) return null;
  // (flat out on its side more often than not, where there is room to; and now and then a roll
  // first, for which it lies facing to the left across the picture: flat out on its right side, as
  // it always is, that has its belly your way, rolled up to the sky)
  const flat = ok.filter(([p]) => p === 'side');
  const rolls = Math.random() < 0.35 && flat.some(([, f]) => Math.sin(f) < 0);
  const [posture, face] = rolls ? pick(flat.filter(([, f]) => Math.sin(f) < 0)) : flat.length && Math.random() < 0.6 ? pick(flat) : pick(ok);
  const place = c.lieAt(posture, spot, face);
  // (as the sun moves round and the patch goes off it, it gets up and lies down in it again, the
  // same way if it fits there)
  let mid = spot.clone();
  const follow = () => {
    if (c.sunlit(mid)) return undefined;
    const s = c.sun();
    if (!s) return null;
    const there = options(s).filter(([p]) => p === posture);
    if (!there.length) return null;
    mid = s.clone();
    const f = there.find(([, f]) => f === face)?.[1] ?? there[0][1];
    return c.lieAt(posture, s, f);
  };
  // (rolled over the side it will lie on after, so it comes out of the roll into it)
  const roll: Leg[] = rolls ? [{
    to: place.to, face: place.yaw, stay: 5.5, posture: 'side',
    layer: (t, m) => {
      if (t < 1) m.moment = 'flop';
      return bellyUp(1, t, 5.5, 1).pose;
    },
  }] : [];
  return new Walk('sun', [
    ...roll,
    { to: place.to, face: place.yaw, stay: rand(60, 160), posture, nap: true, follow },
    { to: bed.to, face: bed.yaw, stay: 0.1, posture: 'loaf', home: true },
  ]);
};

/** fond of you and drowsy: a nap as near you as it can get, just inside the glass, rather than in
 *  its bed (lying side-on to you, or flat out on its side across in front of you), dozing off
 *  there; then back to bed */
export const byYou = (c: Ctx) => {
  const bed = c.bed('loaf');
  const flat = Math.random() < 0.35;
  const posture: PoseName = flat ? 'side' : 'loaf';
  const side = Math.random() < 0.5 ? -1 : 1;
  const at = c.keepClear(new THREE.Vector3(c.window.x + rand(-0.06, 0.06), 0, c.window.z + 0.1), flat ? 0.16 : 0.1);
  const place = c.lieAt(posture, at, side * (flat ? 1.55 : rand(0.15, 0.35)));
  return new Walk('by you', [
    { to: place.to, face: place.yaw, stay: rand(70, 160), posture, nap: true },
    { to: bed.to, face: bed.yaw, stay: 0.1, posture: 'loaf', home: true },
  ]);
};

/** you looking round the room, at something over there (x along the room): a cat curious about
 *  you, and about what you see, strolls over there itself, has a sniff about, and sits and looks
 *  up at you; then about its own business again */
export const lookWith = (c: Ctx, x: number) => {
  const at = c.keepClear(new THREE.Vector3(x + rand(-0.08, 0.08), 0, c.home.z + rand(0.05, 0.22)), 0.12);
  const sniff = (t: number): PoseLayer => ({ neckPitch: -1.0, headPitch: -0.4 + 0.05 * Math.sin(t * 14), whisker: 0.6, earFwd: 0.4, hipY: 0.19 });
  // (sat a little side-on to you, the head turned up to you: square on, a sitting cat is a pillar)
  const v = c.viewer(), you = Math.atan2(v.x - at.x, v.z - at.z), side = Math.random() < 0.5 ? -1 : 1;
  return new Walk('look with you', [
    { to: at, face: null, stay: rand(1.2, 2.4), posture: 'stand', layer: sniff },
    { to: at, face: you + side * 0.42, stay: rand(4, 8), posture: 'sit' },
  ], 0.3);
};

/** in the heating months, a long while lying on the floor by the warm radiator, then back to bed */
export const warmUp = (c: Ctx) => {
  const spot = c.warm();
  if (!spot) return null;
  const bed = c.bed('loaf');
  const posture = pick<PoseName>(['loaf', 'loaf', 'side', 'sphinx']);
  const place = c.lieAt(posture, spot.at, spot.face + rand(-0.2, 0.2));
  return new Walk('warm', [
    { to: place.to, face: place.yaw, stay: rand(45, 120), posture, nap: true },
    { to: bed.to, face: bed.yaw, stay: 0.1, posture: 'loaf', home: true },
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
    const Y = c.yarn();
    if (!Y) return false;
    this.t += dt;
    this.total += dt;
    // (where it believes the ball is, seen a moment late and lost track of when flicked away too
    // fast, is what it watches, goes after and aims at; under its paws it feels it. Whether a paw
    // meets it is where it really is)
    const y = c.toyPinned() || !c.seen ? Y : c.seen('yarn') ?? (Number.isNaN(this.was.x) ? Y : this.was);
    const dT = Math.hypot(Y.x - m.pos.x, Y.z - m.pos.z);
    // the ball's way and speed as it sees it (it may be on a finger)
    if (Number.isNaN(this.was.x)) this.was.copy(y);
    const inst = Math.hypot(y.x - this.was.x, y.z - this.was.z) / Math.max(dt, 1e-3);
    this.ys += (Math.min(inst, 6) - this.ys) * Math.min(1, dt * 8);
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
    if (this.phase !== 'sit') m.lookAt((!c.toyPinned() && c.gaze('yarn')) || y, 1);
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
        if (!this.hits.has(-1) && u > 0.6 && dT < 0.21) {
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
        if (!this.hits.has(k) && u > 0.55 && dT < 0.24) {
          this.hits.add(k);
          // on a finger, a claw snags it a moment; loose, the right paw sweeps it off to the
          // cat's left, the left paw to its right
          if (held) c.pin(rand(0.2, 0.35), Y.clone());
          else c.kick(this.fwd.clone().multiplyScalar(0.5).addScaledVector(this.left, right ? 0.85 : -0.85), rand(0.3, 0.55));
        }
        return true;
      }
      case 'sit': {
        // done: sit and wash the chest a little, then home (unless the ball is moving again)
        m.lookAt(null);
        if (lured && this.ys > 0.1 && this.t > 0.5) { m.layer = null; this.next('go'); return true; }
        m.setPosture('sit');
        const l = Math.sin(lived(this.t, 7) * 8.5);
        m.layer = { pose: { neckPitch: -0.75, headPitch: -0.55 + 0.12 * l, jaw: 0.1 * Math.max(0, l), eyeOpen: 0.4 }, w: hump(this.t, this.dur, 0.6) };
        if (this.t > this.dur) {
          m.layer = null;
          if (!homeward(c)) return false;
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
  private readonly speed = rand(1.3, 1.55);
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
    // (not so far out to the left that it runs out of the picture before the view can follow)
    const L = () => at(-0.36, rand(0.14, 0.24));
    const R = () => at(rand(0.14, 0.22), rand(0.5, 0.56));
    const n = 3 + Math.floor(Math.random() * 3);
    const cycle = box ? [F, R] : Math.random() < 0.5 ? [F, L, R, L] : [L, F, R, F];
    for (let k = 0; k < n; k++) this.route.push(cycle[k % cycle.length]());
    // (and it ends in the middle, just in front of the bed, where it sits down facing you, coming
    // to it from one side, so that the skid does not carry it out toward you)
    if (this.route[this.route.length - 1].z > h.z + 0.4) this.route.push(box ? R() : pick([L, R])());
    // (not so near you that its head would go off the bottom of the picture)
    this.route.push(at(box ? rand(0.04, 0.12) : rand(-0.08, 0.08), rand(0.24, 0.28)));
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
      // brushing past the plant, the curtains, they shake and swing
      c.bump(m.pos.clone().setY(0.12), dt * 1.5);
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
  phase: 'go' | 'gather' | 'in' | 'settle' | 'sit' | 'turn' | 'out' | 'duck' | 'spring' | 'done' = 'go';
  /** how deep asleep the cat is (set by the avatar): asleep in here, it stays and dozes */
  nap = 0;
  private t = 0;
  private dur = 0;
  private leaving = false;
  private look = Math.random() * 10;
  private readonly from = new THREE.Vector3();
  constructor(private readonly spot: SillSpot) {}
  /** a game going on out there (where it is), and where it springs out to at it */
  private prey: (() => THREE.Vector3 | null) | null = null;
  private readonly to = new THREE.Vector3();
  private readonly preyAt = new THREE.Vector3();

  /** asked out: out as soon as it can be. For a game, sat down in it: an ambush, down out of
   *  sight with the eyes over the rim on it, and out over the side at it */
  leave(at?: () => THREE.Vector3 | null) {
    this.leaving = true;
    if (at) this.prey = at;
  }

  /** in the box or hopping in or out of it: it cannot simply be stopped */
  get up() {
    return this.phase === 'in' || this.phase === 'settle' || this.phase === 'sit' || this.phase === 'turn' || this.phase === 'out'
      || this.phase === 'duck' || this.phase === 'spring';
  }
  /** its eyes on the game over the rim, getting ready: they are its own */
  get ownGaze() {
    return this.phase === 'duck';
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
        // (a game out there: down after it, out of sight, unless it is too sleepy for that)
        const P = this.prey?.();
        if (this.leaving && P && deep < 0.3) { this.preyAt.copy(P); this.next('duck', rand(0.8, 1.8)); return true; }
        if ((this.t > this.dur && this.nap <= 0.3) || this.leaving) { m.layer = null; this.next('turn', 0.6); }
        return true;
      }
      case 'duck': {
        // down in it, only the ears and the eyes over the rim, wide on it; at the end of it the
        // rump shifts, a little wiggle, and out it goes
        const P = this.prey?.();
        if (P) this.preyAt.lerp(P, Math.min(1, dt * 8));
        else { m.layer = null; this.prey = null; this.next('turn', 0.3); return true; }
        m.setPosture('loaf');
        m.lookAt(this.preyAt, 1);
        const w = Math.min(1, this.t / 0.3), wig = this.t > this.dur - 0.45 ? Math.sin(this.t * 26) : 0;
        m.layer = {
          pose: { neckPitch: -0.6, headPitch: 0.45, hipY: 0.1, hipYaw: 0.08 * wig, earFwd: 0.9, earOut: 0.15, pupil: 1, eyeOpen: 1, whisker: 0.7, tailCurl: 0.8 * Math.sin(this.t * 9) },
          w,
        };
        if (this.t > this.dur) {
          // over the side the way it is, as far as clears the box, where there is floor for it
          const dx = this.preyAt.x - S.seat.x, dz = this.preyAt.z - S.seat.z, d = Math.hypot(dx, dz) || 1;
          const out = Math.max(0.3, Math.hypot(S.land.x - S.seat.x, S.land.z - S.seat.z));
          this.to.set(S.seat.x + (dx / d) * out, 0, S.seat.z + (dz / d) * out);
          c.keepClear(this.to, 0.08);
          if (Math.hypot(this.to.x - S.seat.x, this.to.z - S.seat.z) < 0.25) this.to.copy(S.land);
          this.from.copy(m.pos);
          m.lookAt(null);
          c.sound('scrabble', 0.1);
          this.next('spring', 0.36);
        }
        return true;
      }
      case 'spring': {
        // out over the side at it, turning to it in the air
        const u = Math.min(1, this.t / this.dur);
        const face = Math.atan2(this.to.x - this.from.x, this.to.z - this.from.z);
        m.yaw = wrapA(m.yaw + wrapA(face - m.yaw) * Math.min(1, dt * 14));
        this.hop(c, this.to, u, 0.006 * (1 - u));
        if (u >= 1) { c.hold(null); m.layer = null; c.sound('thump', 0.12); this.next('done'); }
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
/** hanging from the sill after a jump that came up short: how far below the top of it the legs
 *  are measured from (its forearms over the edge) */
const HANG = 0.185;

export class Sill implements Act {
  readonly name = 'sill';
  phase: 'go' | 'gather' | 'up' | 'hang' | 'haul' | 'settle' | 'sit' | 'nap' | 'about' | 'knock' | 'look' | 'down' | 'done' = 'go';
  /** the jump comes up short (one in eleven or so; set beforehand to have it so): the forepaws
   *  hooked over the edge, the rest of it hanging, the hind legs going like mad, and hauled up */
  miss: boolean | null = null;
  /** up the hard way: sat, a look round to see who saw (you did), and a brisk wash of a shoulder
   *  as if nothing had happened (how far into that, which shoulder) */
  private oops = -1;
  private oopsSide = 1;
  private scrabbleIn = 0;
  private readonly hangAt = new THREE.Vector3();
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
  /** snow going by: one flake after another followed down with the head (how far after this one,
   *  how long it takes to fall from sight, which way it is) */
  private flake = { t: 0, len: 1.8, yaw: 0 };
  /** the pencil (or the mug of tea) by its paws, turned to face the room: a step over to it, a
   *  look at it, a look at you, a pat at it (how many so far), and again, until it goes over;
   *  watched all the way down */
  /** the tea by it steaming: a sniff at the steam now and then (how far into it; how long till the
   *  next; whether it has started back from the heat yet) */
  private sniff = -1;
  /** ... or, as often as not, a pat at the wisps going up instead: nothing there, a look at the
   *  paw, puzzled, and a lick of it (set beforehand to have it so) */
  steamBat: boolean | null = null;
  private batting = false;
  private sniffIn = rand(6, 20);
  private flinched = false;
  private knock = {
    what: 'pencil' as 'pencil' | 'mug', step: 'eye' as 'to' | 'eye' | 'you' | 'paw' | 'caught' | 'watch' | 'after', t: 0, len: 0, taps: 0, pushed: false,
    /** caught at it (a tap on the glass): whether it goes ahead anyway, holding your eye; the paw
     *  where it was when it froze */
    defiant: false, held: {} as Record<string, unknown>, last: {} as Record<string, unknown>,
  };
  constructor(private readonly spot: SillSpot) {}

  /** asked down: it comes down as soon as it can, and stops there */
  leave() {
    this.leaving = true;
  }

  /** a tap on the glass while it is seeing to the pencil or the mug: caught at it (true if it
   *  was) */
  caught() {
    const K = this.knock;
    if (this.phase !== 'knock' || (K.step !== 'eye' && K.step !== 'you' && K.step !== 'paw' && K.step !== 'to')) return false;
    K.held = K.step === 'paw' ? K.last : {};
    K.defiant = Math.random() < 0.5;
    K.step = 'caught';
    K.t = 0;
    K.len = rand(1.1, 1.6);
    K.pushed = false;
    return true;
  }

  /** up on the sill or in the air: it cannot simply be stopped */
  get up() {
    return this.phase !== 'go' && this.phase !== 'gather' && this.phase !== 'done';
  }

  /** hanging from the sill by the forearms: the body down the front of it, the hind legs kicking
   *  (k: how hard; pawY: how far up the sill's top is from where the legs are measured from) */
  private hanging(s: number, k: number, pawY: number): PoseLayer {
    const f = s * Math.PI * 2 * 4.5;
    // (the hind legs out to the sides as they kick, so that from behind you see them going)
    const kick = (ph: number) => ({
      planted: 0, frame: 0, x: 0.05 + 0.02 * k * Math.max(0, Math.sin(f + ph)), y: 0.012 + 0.05 * k * Math.max(0, Math.sin(f + ph)),
      z: -0.005 - 0.05 * k * Math.cos(f + ph), flex: 0.3 + 0.4 * Math.max(0, Math.sin(f + ph)),
    });
    // (the forearms flat on the sill, well apart, the claws in)
    const fore = (side: number) => ({ planted: 0, frame: 0, x: 0.05, y: pawY, z: 0.17 + 0.012 * side * k * Math.sin(f * 0.5), flex: 0.05 });
    return {
      hipY: 0.07 + 0.008 * k * Math.sin(f * 2), hipPitch: 0.95, hipRoll: 0.16 * k * Math.sin(f), hipYaw: 0.1 * k * Math.sin(f + 1),
      lumbarPitch: 0.3, chestPitch: -0.75, chestRoll: -0.08 * k * Math.sin(f),
      // the head down over the sill, ears back with the effort of it
      neckPitch: -0.5, headPitch: -0.45, earFwd: -0.5, earOut: 0.4, earFlat: 0.25, eyeOpen: 1, pupil: 0.9,
      LF: fore(1), RF: fore(-1), LH: kick(0), RH: kick(Math.PI), hindFlat: 0,
      tailLift: -0.3 + 0.4 * k * Math.sin(s * 7), tailSide: 1.2 * Math.sin(s * 6.1), tailCurve: 0.4, tailCurl: 0.8 * k * Math.sin(s * 11),
    };
  }

  private next(phase: Sill['phase'], dur = 0) {
    this.phase = phase;
    this.t = 0;
    this.dur = dur;
  }

  update(dt: number, c: Ctx): boolean {
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
          if (this.miss === null) this.miss = Math.random() < 0.09;
          // (where it would hang: in front of the edge, its forearms over it)
          if (this.miss) this.hangAt.set(S.seat.x, 0, (S.edge ?? S.seat.z + 0.19) + 0.08);
          this.next('up', this.miss ? 0.36 : 0.44);
        }
        return true;
      }
      case 'up': {
        if (this.miss) {
          // short: the forepaws come down over the edge, and the rest of it does not follow
          const u = Math.min(1, this.t / this.dur);
          m.pos.lerpVectors(this.from, this.hangAt, smooth(u));
          m.yaw = Math.PI;
          const H = S.height - HANG;
          c.hold(H * smooth(Math.min(1, u * 1.1)) + 0.06 * Math.sin(Math.PI * u));
          m.setPosture('sit');
          m.lookAt(null);
          m.layer = { pose: this.hanging(0, 0, S.height + 0.005 - H), w: ease(u / 0.7) };
          if (u >= 1) {
            c.sound('thump', 0.14);
            c.sound('scrabble', 0.3);
            this.scrabbleIn = 0.2;
            this.next('hang', rand(0.8, 1.3));
          }
          return true;
        }
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
      case 'hang': {
        // hanging there by its forearms, the hind legs going like mad against the radiator and
        // the tail flailing; a slip down a little at first, and then a grip
        const slip = 0.012 * Math.sin(Math.PI * Math.min(1, this.t / 0.35));
        const H = S.height - HANG - slip;
        c.hold(H);
        m.pos.copy(this.hangAt);
        m.yaw = Math.PI;
        m.setPosture('sit');
        m.lookAt(null);
        m.layer = { pose: this.hanging(this.t, 1, S.height + 0.005 - H), w: 1 };
        if ((this.scrabbleIn -= dt) <= 0) { c.sound('scrabble', 0.2); this.scrabbleIn = rand(0.17, 0.28); }
        if (this.t > this.dur) this.next('haul', 0.55);
        return true;
      }
      case 'haul': {
        // a shove from the hind legs, and it slithers forward over the edge and is up
        const u = Math.min(1, this.t / this.dur), e = smooth(u);
        const H = S.height - HANG;
        c.hold(H + (S.height - H) * e);
        m.pos.lerpVectors(this.hangAt, S.seat, e);
        m.yaw = Math.PI;
        m.setPosture('crouch');
        m.lookAt(null);
        // (the body coming round from hanging to lying along the sill as it rises: the head
        // hardly higher, the hips swung up level with it; the forepaws on the sill throughout)
        const A = this.hanging(this.t + 1.3, 1 - u, S.height + 0.005 - H - (S.height - H) * e) as Record<string, unknown>;
        const B = POSES.crouch as unknown as Record<string, unknown>;
        const L: Record<string, unknown> = {};
        for (const k in A) {
          const a = A[k], b = B[k];
          if (typeof a === 'number') L[k] = typeof b === 'number' ? a + (b - a) * e : a * (1 - e);
          else if (k === 'LF' || k === 'RF') L[k] = { ...(a as object), z: 0.17 + (0.115 - 0.17) * e };
          else {
            // (the hind paws not set down till it is up: set down on the way, they would stay
            // behind there, down in the sill)
            const fa = a as Record<string, number>, fb = b as Record<string, number>, f: Record<string, number> = {};
            for (const q in fa) f[q] = q === 'planted' || q === 'frame' ? fa[q] : fa[q] + (fb[q] - fa[q]) * e;
            L[k] = f;
          }
        }
        m.layer = { pose: L as PoseLayer, w: 1 };
        if (u >= 1) {
          c.perch(S.height);
          c.hold(null);
          m.layer = null;
          c.sound('thump', 0.2);
          this.oops = 0;
          this.oopsSide = Math.random() < 0.5 ? 1 : -1;
          this.next('settle', 0.35);
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
        if (this.oops >= 0) {
          this.oops += dt;
          const o = this.oops;
          m.setPosture('sit');
          if (o < 1.1) {
            // a look round, the ears out to the sides: did anyone see that (you did)
            m.lookAt(o > 0.25 ? c.viewer() : null, 1);
            m.layer = { pose: { earOut: 0.45, earFwd: -0.15, eyeOpen: 1, tailLift: -1.2, tailSag: 1, tailCurl: 0.6 * Math.sin(o * 9) }, w: ease(o / 0.25) };
            return true;
          }
          // and a brisk wash of a shoulder, eyes half shut: nothing happened
          const g = o - 1.1, d = 2.8, lk = Math.max(0, Math.sin(g * 11));
          m.lookAt(null);
          m.layer = {
            pose: {
              neckYaw: this.oopsSide * 1.05, headYaw: this.oopsSide * 0.7, neckPitch: -0.35, headPitch: -0.35 + 0.14 * Math.sin(g * 11),
              jaw: 0.12 * lk, tongue: 0.8 * lk, tongueUp: -0.3, eyeOpen: 0.35, squint: 0.3, earOut: 0.25 * (1 - Math.min(1, g / d)),
              tailLift: -1.2, tailSag: 1,
            },
            w: Math.min(1, ease(g / 0.3) + (1 - Math.min(1, o / 1.4))) * ease((d - g) / 0.35),
          };
          if (g > d) { this.oops = -1; m.layer = null; }
          return true;
        }
        if (this.nap > 0.3 && !this.leaving) {
          m.layer = null; m.lookAt(null); this.drop = null; c.drop(null); this.sniff = -1;
          this.next('nap');
          return true;
        }
        // the tea steaming beside it: now and then the nose put into the steam, whiskers forward;
        // a start back from the heat, the eyes screwed up and the ears flicking, a lick of the nose
        // and a shake of the head; then back to the window
        const M = c.mug();
        if (this.sniff < 0 && M && M.onSill && !this.drop && !this.leaving && this.t > 3 && Math.hypot(M.at.x - m.pos.x, M.at.z - m.pos.z) < 0.2
          && (this.sniffIn -= dt) <= 0) {
          this.sniff = 0;
          this.sniffIn = rand(45, 120);
          this.flinched = false;
          this.batting = this.steamBat ?? Math.random() < 0.35;
          this.steamBat = null;
        }
        if (this.sniff >= 0 && this.batting) {
          this.sniff += dt;
          const s = this.sniff;
          m.setPosture('sit');
          // (which side the tea is, in its own frame: its left +)
          const dx = M ? M.at.x - m.pos.x : 0, dz = M ? M.at.z - m.pos.z : 0;
          const side = dx * Math.cos(m.yaw) - dz * Math.sin(m.yaw) >= 0 ? 1 : -1, paw = side > 0 ? 'LF' : 'RF';
          // eyes on the wisps going up, after them; a paw up through them, quick; nothing there: a
          // look down at the paw, the head on one side; and a lick of it
          if (s < 1.3 && M) m.lookAt(M.at.clone().setY(M.at.y + 0.1 + 0.05 * Math.sin(s * 2.6)), 1);
          else m.lookAt(null);
          const swipe = s > 0.75 && s < 1.25 ? Math.sin(Math.PI * (s - 0.75) / 0.5) : 0;
          const atPaw = s > 1.25 && s < 2.5 ? ease((s - 1.25) / 0.25) * (1 - ease((s - 2.3) / 0.2)) : 0;
          const lick = s > 2.4 && s < 3.2 ? Math.max(0, Math.sin((s - 2.4) * 22)) : 0;
          const up = Math.max(swipe, 0.55 * atPaw, s > 2.35 && s < 3.25 ? 0.65 : 0);
          m.layer = {
            pose: {
              [paw]: { planted: 0, frame: 0, x: 0.04 + 0.03 * swipe, y: 0.012 + 0.13 * up, z: 0.07 + 0.08 * swipe, flex: 0.5 * up },
              neckYaw: side * 0.5 * atPaw, headPitch: -0.3 * atPaw, headRoll: side * 0.35 * atPaw,
              earFwd: 0.7 * (1 - atPaw) - 0.1, pupil: 0.9, whisker: 0.6 * (1 - atPaw), jaw: 0.12 * lick, tongue: lick, tongueUp: 1,
              tailLift: -1.35, tailSag: 1, tailCurve: 0.25, tailCurl: 0.6 * Math.sin(s * 8) * (1 - atPaw),
            },
            w: Math.min(1, s / 0.3) * Math.min(1, (3.5 - s) / 0.3),
          };
          if (s > 3.5) { this.sniff = -1; this.batting = false; m.layer = null; m.lookAt(null); }
          return true;
        }
        if (this.sniff >= 0) {
          this.sniff += dt;
          const s = this.sniff;
          m.setPosture('sit');
          if (M) m.lookAt(M.at.clone().setY(M.at.y + 0.09), 1);
          const lean = s < 1.25 ? ease(s / 0.7) : 1 - ease((s - 1.25) / 0.2);
          const start = s >= 1.25 && s < 2.0 ? Math.sin(Math.PI * (s - 1.25) / 0.75) : 0;
          const lick = s > 1.75 && s < 2.25 ? Math.max(0, Math.sin((s - 1.75) * 28)) : 0;
          const shake = s > 2.25 && s < 2.75 ? Math.sin((s - 2.25) * 42) * (1 - (s - 2.25) / 0.5) : 0;
          m.layer = {
            pose: {
              neckPitch: -0.2 * lean, headPitch: -0.1 * lean + 0.22 * start, whisker: 0.8 * lean - 0.9 * start, earFwd: 0.6 * lean - 0.5 * start,
              squint: 0.75 * start, eyeOpen: 1 - 0.75 * start, jaw: 0.12 * lick, tongue: lick, tongueUp: 1, headRoll: 0.22 * shake,
              tailLift: -1.35, tailSag: 1, tailCurve: 0.25,
            },
            w: Math.min(1, s / 0.3) * Math.min(1, (3.0 - s) / 0.3),
          };
          if (start > 0.8 && !this.flinched) { this.flinched = true; m.jolt(0.45); m.flickEar('both', 0.8); }
          if (s > 3.0) { this.sniff = -1; m.layer = null; m.lookAt(null); }
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
        // snow coming down past the glass: the head goes up to a flake, follows it down, and up
        // again to the next, this way and that
        let fall = 0;
        const snowing = c.snow && !birds && !this.drop;
        if (snowing) {
          const F = this.flake;
          if ((F.t += dt) > F.len) {
            F.t = 0;
            F.len = rand(1.3, 2.6);
            F.yaw = rand(-0.55, 0.55);
          }
          const u = F.t / F.len;
          fall = u < 0.15 ? -0.28 + 0.6 * ease(u / 0.15) : 0.32 - 0.62 * ease((u - 0.15) / 0.85);
        }
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
            neckYaw: D ? 0 : snowing ? 0.7 * this.flake.yaw + 0.3 * look : look, headYaw: D ? 0 : snowing ? 0.4 * this.flake.yaw : 0.4 * look,
            neckPitch: 0.1 + 0.4 * fall, headPitch: -0.05 + 0.05 * Math.sin(this.watch * 0.5) + 0.6 * fall,
            earFwd: birds || D || snowing ? 1 : 0.6, pupil: birds || D ? 0.95 : snowing ? 0.85 : 0.6, whisker: birds || D ? 1 : snowing ? 0.5 : 0, jaw: chatter,
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
        // round on the sill to face the room (and now and then, the pencil there by its paws, or
        // the mug of tea by its side...)
        m.setPosture('stand');
        if (!m.goal) m.walkTo(m.pos.clone(), 0.12, 0, () => {
          const near = (P: { at: THREE.Vector3; onSill: boolean } | null) => !!P && P.onSill && Math.abs(P.at.x - m.pos.x) < 0.15 && P.at.z - m.pos.z > 0.02 && P.at.z - m.pos.z < 0.2;
          const P = c.pencil(), M = c.mug();
          const what = near(M) && (!near(P) || Math.random() < 0.5) ? 'mug' : near(P) ? 'pencil' : null;
          if (what && !this.leaving && this.nap < 0.3 && Math.random() < (what === 'mug' ? 0.3 : 0.4)) {
            Object.assign(this.knock, { what, step: what === 'mug' ? 'to' : 'eye', t: 0, len: rand(1.2, 2), taps: 0, pushed: false, defiant: false, held: {}, last: {} });
            this.next('knock');
          } else this.next('look', 0.6);
        });
        return true;
      case 'knock': {
        // sat facing the room, the pencil by its front paws: a long look at it, a look at you, a pat
        // at it, a look at you... and the last pat sends it over the edge; its eyes follow it all
        // the way down, then come back to you to see what you make of it
        const K = this.knock;
        K.t += dt;
        const P = K.what === 'mug' ? c.mug() : c.pencil();
        const go = (step: typeof K.step, len: number) => { K.step = step; K.t = 0; K.len = len; };
        let paw: Record<string, unknown> = {};
        // (called down, or wanted elsewhere: it leaves the pencil be, unless it is on its way down)
        if (!P || (this.leaving && K.step !== 'watch')) { m.layer = null; m.lookAt(null); this.next('look', 0.6); return true; }
        if (K.step === 'to') {
          // (the mug is off by its side: a shuffle along the sill, still facing the room, so that it
          // stands before a forepaw, a little out to that side)
          m.setPosture('stand');
          m.lookAt(P.at, 1);
          const side = P.at.x < m.pos.x ? 1 : -1;
          const S = this.spot, to = new THREE.Vector3(P.at.x + side * 0.045, 0, Math.max(S.seat.z - 0.03, P.at.z - 0.075));
          const dx = to.x - m.pos.x, dz = to.z - m.pos.z, d = Math.hypot(dx, dz), step = Math.min(d, 0.1 * dt);
          if (d > 1e-4) { m.pos.x += (dx / d) * step; m.pos.z += (dz / d) * step; }
          m.yaw = wrapA(m.yaw * (1 - Math.min(1, dt * 4)));
          if (d < 0.004 || K.t > 2.5) go('eye', rand(1.2, 2));
          return true;
        }
        m.setPosture('sit');
        if (K.step === 'eye') {
          m.lookAt(P.at, 1);
          if (K.t > K.len) go('you', rand(0.8, 1.5));
        } else if (K.step === 'you') {
          m.lookAt(c.viewer(), 1);
          if (K.t > K.len) go(P.onSill ? 'paw' : 'after', P.onSill ? 0.62 : rand(1.2, 1.8));
        } else if (K.step === 'caught') {
          // stock still, the paw where it was, round to you with its eyes wide and its ears a
          // little back; then either the paw drawn slowly back and a look anywhere but at the
          // thing, as if it had never been near it, or, holding your eye, over it goes anyway
          m.lookAt(c.viewer(), 1);
          const back = K.defiant ? 0 : ease((K.t - K.len) / 0.8);
          paw = {};
          for (const [leg, v] of Object.entries(K.held)) {
            const f = v as Record<string, number>;
            paw[leg] = { ...f, x: 0.036 + (f.x - 0.036) * (1 - back), y: 0.012 + (f.y - 0.012) * (1 - back), z: 0.068 + (f.z - 0.068) * (1 - back), flex: (f.flex ?? 0) * (1 - back) };
          }
          if (!K.defiant && K.t > K.len) {
            // (looking away, out of the window, at nothing)
            if (K.t > K.len + 0.5) m.lookAt(new THREE.Vector3(m.pos.x - 0.6, 0.9, m.pos.z - 1.5), 1);
          }
          m.layer = {
            pose: { earFwd: 0.1 - 0.4 * (1 - back), earOut: 0.25 * (1 - back), pupil: 1, eyeOpen: 1, whisker: 0.2, tailCurl: 0.3, ...paw },
            w: 1,
          };
          if (K.defiant && K.t > K.len) { go('paw', 0.75); K.taps = 9; }
          else if (!K.defiant && K.t > K.len + 2.2) { m.layer = null; m.lookAt(null); this.next('look', 0.6); }
          return true;
        } else if (K.step === 'paw') {
          // (holding your eye, if it was caught at it and is doing it anyway)
          m.lookAt(K.defiant ? c.viewer() : P.at, 1);
          const dx = P.at.x - m.pos.x, dz = P.at.z - m.pos.z;
          const lx = dx * Math.cos(m.yaw) - dz * Math.sin(m.yaw), lz = dx * Math.sin(m.yaw) + dz * Math.cos(m.yaw);
          const u = Math.min(1, K.t / K.len), ax = Math.max(0.03, Math.abs(lx));
          // up and over to behind it, down, a shove forward, and back
          const reach = u < 0.45 ? ease(u / 0.45) : u < 0.65 ? 1 : 1 - ease((u - 0.65) / 0.35);
          const shove = u < 0.45 ? 0 : u < 0.65 ? (u - 0.45) / 0.2 : 1;
          const R = { x: 0.036, z: 0.068 };
          paw = {
            [lx > 0 ? 'LF' : 'RF']: {
              planted: 0, frame: 0,
              x: R.x + (ax - R.x) * reach, z: R.z + (lz - 0.024 + 0.035 * shove * reach - R.z) * reach,
              y: 0.012 + 0.045 * Math.sin(Math.PI * Math.min(1, u / 0.45)) * (u < 0.45 ? 1 : 0), flex: u < 0.45 ? 0.35 * reach : 0,
            },
          };
          if (!K.pushed && u > 0.55) {
            K.pushed = true;
            K.taps++;
            // (a pat or two first; then over it goes, a little off to the side, past the end of the
            // bed, where it lies in sight)
            const last = K.taps >= 3 || (K.taps >= 2 && Math.random() < 0.6);
            // (caught at it and doing it anyway: one shove, and over it goes)
            const sure = K.defiant ? 0.13 : 0;
            if (K.what === 'mug') c.pushMug(Math.max(sure, last ? 0.075 : 0.024), (last ? 0.012 : 0.004) * Math.sign(lx || 1));
            else c.pushPencil(Math.max(sure, last ? 0.07 : 0.022), (last ? 0.03 : 0.006) * Math.sign(lx || 1));
          }
          K.last = structuredClone(paw);
          if (u >= 1) {
            K.pushed = false;
            const p2 = K.what === 'mug' ? c.mug() : c.pencil();
            if (p2 && !p2.onSill) go('watch', rand(1.2, 1.6));
            else go(Math.random() < 0.6 ? 'you' : 'eye', rand(0.7, 1.3));
          }
        } else if (K.step === 'watch') {
          m.lookAt(P.at, 1);
          if (K.t > K.len) go('after', rand(1.4, 2.2));
        } else {
          m.lookAt(c.viewer(), 1);
          if (K.t > K.len) { m.layer = null; m.lookAt(null); this.next('look', 0.6); return true; }
        }
        m.layer = {
          pose: { earFwd: 0.8, pupil: 0.8, whisker: 0.5, tailCurl: 0.5 * Math.sin(this.t * 2.2), ...paw },
          w: Math.min(1, this.t / 0.5),
        };
        return true;
      }
      case 'look':
        // a look down at where it will land, gathering
        m.setPosture('crouch');
        m.layer = { pose: { neckPitch: -0.7, headPitch: -0.2, earFwd: 0.7, hipY: 0.14 }, w: Math.min(1, this.t / 0.3) };
        if (this.t > this.dur) {
          this.from.copy(m.pos);
          c.perch(null);
          c.hold(S.height);
          this.next('down', 0.4);
          // (off the sill this very frame: not a moment stood on it with nothing under the paws)
          return this.update(0, c);
        }
        return true;
      case 'down': {
        // and down: a little up and out, forelegs reaching down to land, hind legs following
        const u = Math.min(1, this.t / this.dur);
        m.pos.lerpVectors(this.from, S.land, smooth(u));
        m.yaw = wrapA(m.yaw * (1 - Math.min(1, dt * 14)));
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
        if (this.leaving || !homeward(c)) return false;
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

/** one thing it might take it into its head to do (whim.ts): how much it is in the mood for it
 *  (a weight: what counts is how it compares with the rest), what it is about (a thing it sees,
 *  by the nerves' name for it; or a place), and the act itself */
export interface Option {
  key: string;
  w: number;
  about?: string;
  at?: THREE.Vector3 | null;
  make: () => Act | null;
}

/** what it might do of its own accord just now, and how much it is in the mood for each */
export function idleOptions(c: Ctx, atHome: boolean, posture: PoseName): Option[] {
  const m = c.mood;
  const opts: Option[] = [];
  // (its temperament weighs everything it might do: a playful cat's games, a lazy one's long lies,
  // a bold one's ups and overs and intos, a curious one's going to see)
  const T = c.temper ?? { bold: 0, playful: 0, lazy: 0, curious: 0 };
  const GAME = new Set(['play', 'tease', 'pompom', 'tail', 'zoomies', 'ask', 'gift', 'fish']);
  const REST = new Set(['sun', 'warm', 'by you', 'still', 'yawn']);
  const OUT = new Set(['wander', 'sill', 'top', 'box', 'claw', 'rub', 'window']);
  const tempered = (key: string) => GAME.has(key) ? (1 + 0.5 * T.playful) * (1 - 0.3 * T.lazy)
    : REST.has(key) ? 1 + 0.4 * T.lazy
    : OUT.has(key) ? (1 + 0.35 * T.bold) * (1 + 0.2 * T.curious) * (1 - 0.2 * T.lazy)
    : key === 'investigate' ? (1 + 0.6 * T.curious) * (1 + 0.3 * T.bold) : 1;
  const add = (key: string, w: number, make: () => Act | null, about?: string, at?: THREE.Vector3 | null) => {
    w *= tempered(key) * (c.worth?.(key) ?? 1);
    if (w > 0) opts.push({ key, w, make, about, at });
  };
  const lying = posture === 'loaf' || posture === 'sphinx' || posture === 'side' || posture === 'sit';
  if (c.mode === 'rest' || c.mode === 'alert') {
    add('yawn', 0.8 + m.sleepy, yawn);
    if (lying) {
      add('groom', 1 + m.pleasure, groomFlank);
      add('groom chest', 0.6, groomChest);
      add('wash', 0.8, washFace);
    }
    add('stretch', 0.35, () => stretchSideOn(c, posture === 'sit' ? 'sit' : 'loaf'));
    add('sneeze', 0.1, () => sneeze(c));
    add('scratch', 0.22, scratchEar);
    add('stare', 0.25 * (0.5 + m.arousal) * (1 - m.sleepy), () => new Stare(c));
    // (the hour you mostly stroke it: over to you, and as near you as it can get, more)
    const strokes = c.expects?.().pet ?? 0;
    add('window', (0.9 * Math.max(0, Math.min(1, m.trust + 0.3)) * (1 + m.arousal) + (c.mode === 'alert' ? 0.8 : 0)) * (1 + 1.5 * strokes), () => toWindow(c), 'you');
    add('wander', 0.5 * (1 + m.arousal) * (1 - m.sleepy), () => wander(c));
    // content and about, it goes and marks its things
    const posts = c.posts();
    if (posts.length) {
      const post = pick(posts);
      add('rub', 0.3 * (0.4 + m.pleasure) * (1 - m.sleepy), () => new Rub(c, post), undefined, new THREE.Vector3(post.x, 0.12, post.z));
    }
    // ... and its claws, on the scratching post
    const post = c.scratcher();
    if (post) add('claw', 0.4 * (0.4 + m.arousal) * (1 - 0.7 * m.sleepy), () => new Claw(post), undefined, new THREE.Vector3(post.at.x, 0.2, post.at.z));
    // ... and the pompom hanging from it to bat at
    if (post && c.pompom?.()) add('pompom', 0.3 * (0.4 + m.arousal) * (1 - m.sleepy), () => new Bat(), 'pompom');
    // ... and up on top of it for a while, to look down on the room (or doze up there)
    if (post && c.mode === 'rest') add('top', 0.35 * (0.6 + 0.6 * m.trust) * (1 + 0.6 * c.night) * (1 - 0.5 * m.sleepy), () => new Top(post), undefined, new THREE.Vector3(post.at.x, post.top, post.at.z));
    if (c.mode === 'rest') add('sun', 0.7 + 0.8 * m.sleepy, () => sunbathe(c), undefined, c.sun());
    const warm = c.warm();
    if (c.mode === 'rest' && warm) add('warm', 0.8 + 0.8 * m.sleepy, () => warmUp(c), undefined, warm.at);
    // very fond of you and drowsy: a nap as near you as it can get
    if (c.mode === 'rest' && m.trust > 0.55) add('by you', 1.2 * (m.trust - 0.5) * (0.3 + m.sleepy) * (1 + 1.5 * strokes), () => byYou(c), 'you');
    if (c.yarn()) add('play', 0.6 * (0.4 + m.arousal) * (1 - m.sleepy) * (c.mode === 'rest' ? 1 : 0.4), () => new Play(), 'yarn');
    // the feathers of the wand lying on the floor: now and then a game with them on its own
    const lure = c.lure();
    if (lure && !lure.held && lure.p.y < 0.05) add('tease', 0.3 * (0.4 + m.arousal) * (1 - m.sleepy), () => new Tease(true), 'wand');
    // fond of you, now and then it brings you its toy mouse (lying somewhere off from the glass)
    const toy = c.mouse();
    // (the toy mouse in under the radiator: a go at getting it out)
    if (toy?.under) add('fish', 0.5 * (0.5 + m.arousal) * (1 - m.sleepy), () => new Fish(), undefined, toy.p.clone());
    else if (toy && toy.state === 'floor' && Math.hypot(toy.p.x - c.window.x, toy.p.z - c.window.z) > 0.3) {
      add('gift', 0.45 * Math.max(0, (m.trust - 0.35) / 0.65) * (0.5 + m.arousal) * (1 - m.sleepy), () => new Gift(), 'mouse');
    }
    // in the mood for a game and fond of you, now and then it comes and asks you for one at the
    // glass
    // (the more, about the hour you mostly play with it)
    const X = c.expects?.() ?? { laser: 0, wand: 0, yarn: 0, pet: 0 };
    const game = Math.max(X.laser, X.wand, X.yarn);
    if (m.trust > 0.3) add('ask', 0.35 * (Math.max(0, m.arousal - 0.15) + 0.8 * game) * Math.min(1, m.trust + 0.2) * (1 - m.sleepy), () => new PawGlass(c.finger, true), 'you');
    // (and now and then it goes and waits by the thing itself: the pointer on the sill, the
    // feathers, the ball)
    if (game > 0.15) {
      const pointer = c.pointer?.(), lyingLure = lure && !lure.held ? lure.p : null, ball = c.yarn();
      const which = X.laser >= X.wand && X.laser >= X.yarn && pointer ? { id: 'pointer', at: pointer }
        : X.wand >= X.yarn && lyingLure ? { id: 'wand', at: lyingLure } : ball ? { id: 'yarn', at: ball } : null;
      if (which) add('wait', 3 * game * (1 - m.sleepy), () => waitBy(c, which.at.clone().setY(0)), which.id);
    }
    const box = c.box();
    if (box) add('box', 0.7 * (1 - 0.4 * m.sleepy), () => new Box(box), undefined, box.seat);
    // playful and with nothing better to do: its own tail
    add('tail', 0.18 * Math.max(0, m.arousal - 0.1) * (1 - m.sleepy), () => new TailChase());
    // now and then, more at dusk and after dark, a mad few seconds
    add('zoomies', 0.28 * (0.3 + m.arousal) * (1 - m.sleepy) * (1 + 1.2 * c.night), () => new Zoomies(c));
    const sill = c.sill();
    // (a bird on the ledge outside: up for a closer look, which, as it is a bird, it will not wait for)
    const bird = c.visitor();
    if (sill) add('sill', 0.55 * (1 + 1.5 * c.rain + 1.2 * c.night) * (1 - 0.6 * m.sleepy) + (bird ? 3 : 0), () => new Sill(sill), bird ? 'bird' : undefined, bird ? undefined : sill.seat);
    else if (atHome) add('bed', 1.5, () => toBed(c, 'loaf'));
    // away from its bed (it stayed where it was, after something): back to it in its own time, the
    // sooner the drowsier it is, or after dark
    if (!atHome) add('bed', 1 + 1.6 * m.sleepy + 0.6 * c.night, () => toBed(c, 'loaf'), undefined, c.home);
    // (one of its things moved while it was not looking: something to see about, and soon)
    const cur = c.curious?.();
    if (cur) add('investigate', 6 * cur.k * (1 - 0.7 * m.sleepy), () => investigate(c, cur.at.clone()), cur.id);
    add('still', 1.6, () => null);
  }
  return opts;
}

/** something to do now, or null to stay as it is (one throw of the dice: see whim.ts for how it
 *  is done in the room) */
export function chooseAct(c: Ctx, atHome: boolean, posture: PoseName): Act | null {
  const opts = idleOptions(c, atHome, posture);
  const total = opts.reduce((a, o) => a + o.w, 0);
  let r = Math.random() * total;
  for (const o of opts) {
    if ((r -= o.w) <= 0) return o.make();
  }
  return null;
}
