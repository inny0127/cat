import * as THREE from 'three';
import { POSES, blendPose, clonePose, copyPose, GROUPS, type Foot, type Group, type Leg, type Pose, type PoseLayer, type PoseName } from './pose';
import { Wobble, noise1, clamp } from '../util/math';
import { NEUTRAL, bodyFor, eyesFor, type BodyLook, type Mood } from './mood';
import type { GaitSignals } from './stepper';

/** Which postures can go straight to which, and how long it takes (seconds). */
const EDGES: [PoseName, PoseName, number][] = [
  ['stand', 'sit', 0.95],
  ['stand', 'crouch', 0.45],
  ['stand', 'alert', 0.35],
  ['stand', 'arch', 0.35],
  ['stand', 'stretch', 1.1],
  ['stand', 'loaf', 1.25],
  ['crouch', 'loaf', 0.9],
  ['crouch', 'sit', 0.8],
  ['sit', 'loaf', 1.0],
  ['sit', 'sphinx', 1.15],
  ['loaf', 'sphinx', 0.8],
  ['loaf', 'side', 1.5],
  ['sphinx', 'side', 1.4],
  ['side', 'curl', 1.6],
  ['loaf', 'back', 2.0],
  ['loaf', 'curl', 1.9],
  ['loaf', 'curlL', 1.9],
  ['alert', 'sit', 0.9],
  ['arch', 'crouch', 0.5],
];

/** body parts start and finish at different moments: [delay, length] as fractions */
const SCHEDULE: Record<Group, [number, number]> = {
  hips: [0, 0.82], hind: [0, 0.85], chest: [0.08, 0.84], front: [0.12, 0.8],
  head: [0.14, 0.78], tail: [0.18, 0.82], ears: [0, 0.55], face: [0, 1],
};
/** getting up leads with the front end */
const RISE: Record<Group, [number, number]> = {
  hips: [0.12, 0.85], hind: [0.12, 0.85], chest: [0, 0.8], front: [0, 0.75],
  head: [0, 0.65], tail: [0.2, 0.8], ears: [0, 0.5], face: [0, 0.8],
};
/** postures whose tail is laid round to one side, which might as well be the other */
const TAIL_FLIPS = new Set<PoseName>(['loaf', 'sit', 'sphinx']);
const LOW: Partial<Record<PoseName, number>> = { stand: 3, alert: 3, arch: 3, stretch: 3, crouch: 2, sit: 2, loaf: 1, sphinx: 1, side: 0, back: 0, curl: 0, curlL: 0 };

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10));

function route(from: PoseName, to: PoseName): PoseName[] {
  if (from === to) return [];
  const prev = new Map<PoseName, PoseName>();
  const open: PoseName[] = [from];
  const seen = new Set<PoseName>([from]);
  while (open.length) {
    const a = open.shift()!;
    for (const [x, y] of EDGES) {
      const b = x === a ? y : y === a ? x : null;
      if (!b || seen.has(b)) continue;
      seen.add(b);
      prev.set(b, a);
      if (b === to) {
        const path: PoseName[] = [to];
        let c = to;
        while (prev.get(c) !== from) { c = prev.get(c)!; path.unshift(c); }
        return path;
      }
      open.push(b);
    }
  }
  return [to];
}

/** the numbers of a pose that are eased (all but the flags), and of each paw */
const EASE_KEYS = Object.keys(POSES.stand).filter((k) => typeof (POSES.stand as unknown as Record<string, unknown>)[k] === 'number'
  // (not the mouth: a chatter or a meow is quicker than this would let it be)
  && k !== 'jaw' && k !== 'tongue' && k !== 'tongueUp');
const FOOT_EASE = ['x', 'y', 'z', 'frame', 'flex'] as const;
const LEG_KEYS: Leg[] = ['LF', 'RF', 'LH', 'RH'];

/** which group each channel of a pose moves with */
const GROUP_OF: Record<string, Group> = {};
for (const [g, ks] of Object.entries(GROUPS)) for (const k of ks) GROUP_OF[k] = g as Group;

function edgeTime(a: PoseName, b: PoseName) {
  for (const [x, y, d] of EDGES) if ((x === a && y === b) || (x === b && y === a)) return d;
  return 1.2;
}

/**
 * The cat's motor control: where it is and which way it faces, which posture it holds or is
 * moving into, walking toward a goal, where it looks, blinking, ear flicks and the small
 * restless motions of a living body. Produces the pose for this frame; cat.ts turns it into bones.
 */
export class Motor {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  readonly vel = new THREE.Vector3();
  yawRate = 0;
  speed = 0;
  /** the speed it means to go at (the stride sets its pace by this while it gets going) */
  wantSpeed = 0;

  posture: PoseName = 'stand';
  private target: PoseName = 'stand';
  private path: PoseName[] = [];
  private from: Pose = clonePose(POSES.stand);
  private to: Pose = clonePose(POSES.stand);
  private tt = 1;
  private tdur = 1;
  private sched = SCHEDULE;
  private readonly prog = {} as Record<Group, number>;
  readonly base: Pose = clonePose(POSES.stand);
  readonly pose: Pose = clonePose(POSES.stand);
  /** pose overrides blended on top (eating head-down, grooming leg, ...) */
  layer: { pose: PoseLayer; w: number } | null = null;
  /** how far a layer has its say over the trunk and the legs (0..1 per group): while the body is
   *  on its way into a posture, it comes in with it (a layer is a turn on the posture it is asked
   *  with: the hips lifted to a running height while the back is still sat upright would stand
   *  the cat on its tail); the face, the ears, the head and the tail answer at once */
  private readonly layerIn: Record<'hips' | 'chest' | 'front' | 'hind', number> = { hips: 1, chest: 1, front: 1, hind: 1 };

  // locomotion
  goal: THREE.Vector3 | null = null;
  goalSpeed = 0.45;
  goalFace: number | null = null;
  /** a waypoint on the way somewhere: walk through it without stopping */
  goalPass = false;
  /** the nearest it has got to the goal, and how long it has walked at it since without getting
   *  any nearer (something in the way it cannot get round: as near as it will get) */
  private goalBest = Infinity;
  private goalStall = 0;
  /** this walk's own pace (never two walks quite alike) */
  private goalPace = 1;
  onArrive: (() => void) | null = null;
  maxSpeed = 1.6;
  /** what is in the way on the floor (circles: middle and radius), round which a walk bends; and
   *  of those the solid things a body is never in (the plant's pot, the lamp's foot, the books, the
   *  scratching post). Neither while `ghost`: at something it means to be right up against or in
   *  (raking the post, at the bowl, in the box), or up off the floor */
  obstacles: (() => readonly (readonly [THREE.Vector3, number])[]) | null = null;
  solids: (() => readonly (readonly [THREE.Vector3, number])[]) | null = null;
  ghost = false;
  /** 0 .. 1: quick off the mark and sharp in the turns (the zoomies), rather than an easy walk */
  zoom = 0;
  /** 0 .. 1: out of breath, after a run (the harder and the longer, the more; got back over half a
   *  minute or so): it breathes faster and deeper, and after a really hard one, still at last, it
   *  pants a moment, the mouth open and the tip of the tongue showing */
  exertion = 0;
  private pantT = 0;
  /** its temperament's laziness (-1 .. 1): slow about getting up and lying down, a dawdle of a walk */
  lazy = 0;
  /** a face close in front of it (0 .. 1): sniffing at it, the whiskers forward, the nose working,
   *  the ears up; and unsure of it (0 .. 1): the head drawn back, the ears turned back and down */
  nose = 0;
  shy = 0;
  private noseNow = 0;
  private shyNow = 0;

  // gaze (world point) and how much the head follows it
  readonly look = new THREE.Vector3(0, 0.2, 1);
  private readonly lookS = new THREE.Vector3(0, 0.2, 1);
  lookTarget: THREE.Vector3 | null = null;
  lookW = 0;
  lookWTarget = 0;
  /** where the eyes themselves are on, if not on the gaze: they jump ahead and the head follows */
  eyeAt: THREE.Vector3 | null = null;
  /** the root of the neck (world, the cat's last frame): the gaze turns about it (not about the
   *  eyes, which move as the head turns, so that the head would chase its own turning) */
  readonly eyeRef = new THREE.Vector3(NaN, 0, 0);
  private readonly lookDir = new THREE.Vector3(0, 0, 1);
  private lookDist = 1;
  private lookVel = 0;
  private readonly lookTo = new THREE.Vector3();
  private readonly lookAxis = new THREE.Vector3();

  // face
  blink = 0;
  /** 0 .. 1: intent on something (a hunt): its eyes hardly blink */
  focus = 0;
  private blinkT = 2;
  private blinkPhase = -1;
  private blinkSlow = false;
  /** a slow blink (the cat's smile at someone) is under way */
  get slowBlinking() {
    return this.blinkSlow && this.blinkPhase >= 0;
  }
  /** what the cat feels (see mood.ts); its eyes follow a beat behind */
  readonly mood: Mood = { ...NEUTRAL };
  /** how far the feeling moves the eyes from the posture's own face (lids, lower lid, pupil),
   *  smoothed, and how bright they are */
  readonly eyes = { open: 0, squint: 0, pupil: 0, shine: 1 };
  /** ... and the rest of the body (ears, whiskers, tail, fur, mouth, head, breath), smoothed */
  readonly feel: BodyLook = bodyFor(NEUTRAL);
  private slowBlinkIn = 6;
  readonly twitch = { L: 0, R: 0, swivelL: 0, swivelR: 0 };
  private earL = new Wobble(380, 11);
  private earR = new Wobble(380, 11);
  /** ears turned toward something: -1 the cat's right .. 1 its left */
  earAim = 0;
  private earAimS = 0;
  /** each ear turned toward something (rad of its own swivel; the cat's attention sets it), and
   *  how far it has got */
  readonly earTo = { L: 0, R: 0 };
  private readonly earToS = { L: 0, R: 0 };
  private tailFlickW = new Wobble(140, 6);
  private joltW = new Wobble(260, 12);
  /** a twitch in its sleep (a dream): a forepaw, the whiskers */
  private dreamW = new Wobble(320, 9);
  private dreamPaw: 'LF' | 'RF' = 'LF';
  private earT = 3;
  time = 0;
  tailWave = 0.15;
  tailWaveSpeed = 1;
  private wavePhase = 0;

  /** ask for a posture; finds a way there through the others */
  setPosture(name: PoseName) {
    if (name === this.target && (this.path.length || this.tt < 1 || this.posture === name)) return;
    this.target = name;
    this.path = route(this.tt < 1 ? this.nextOf() : this.posture, name);
    if (this.tt >= 1) this.advance();
  }

  /** the pose eased toward what is asked: two smoothings one after the other (as a weight on a
   *  spring, no overshoot), for every number of the trunk, the head, the paws, the ears and tail */
  private eased: Float32Array | null = null;
  private eased2: Float32Array | null = null;
  private easePose(p: Pose, dt: number) {
    const n = EASE_KEYS.length + 4 * FOOT_EASE.length;
    const fresh = !this.eased;
    if (!this.eased) { this.eased = new Float32Array(n); this.eased2 = new Float32Array(n); }
    const a = this.eased, b = this.eased2!;
    // (the paws quicker than the body: a kick or a swat is quick, and must stay so)
    const kb = 1 - Math.exp(-dt * 40), kp = 1 - Math.exp(-dt * 120);
    const P = p as unknown as Record<string, number>;
    let i = 0;
    const one = (get: () => number, set: (x: number) => void, k: number) => {
      const x = get();
      if (fresh || this.easeReset) { a[i] = x; b[i] = x; }
      else {
        a[i] += (x - a[i]) * k;
        b[i] += (a[i] - b[i]) * k;
        set(b[i]);
      }
      i++;
    };
    for (const key of EASE_KEYS) one(() => P[key], (x) => { P[key] = x; }, kb);
    for (const leg of LEG_KEYS) {
      const f = p[leg] as unknown as Record<string, number>;
      for (const key of FOOT_EASE) one(() => f[key], (x) => { f[key] = x; }, kp);
    }
    this.easeReset = false;
  }
  private easeReset = false;

  /** jump straight into a posture (tests, restoring a saved state) */
  snap(name: PoseName) {
    this.easeReset = true;
    this.posture = this.target = this.fromName = name;
    this.path = [];
    copyPose(this.base, POSES[name]);
    this.flipTail(this.base, name);
    copyPose(this.from, this.base);
    copyPose(this.to, this.base);
    this.tt = 1;
  }

  private nextOf(): PoseName {
    return this.posture;
  }

  /** postures the body is between right now, with weights summing to 1 */
  postureWeights(): [PoseName, number][] {
    if (this.tt >= 1) return [[this.posture, 1]];
    const k = this.prog.hips ?? 0;
    return [[this.fromName, 1 - k], [this.posture, k]];
  }
  private fromName: PoseName = 'stand';
  /** which side the tail is laid round to when it sits or lies on its chest (-1: the other side
   *  from the posture's own), picked afresh each time it sits or lies down from standing */
  private tailFlip = 1;
  private flipTail(p: Pose, name: PoseName) {
    if (this.tailFlip < 0 && TAIL_FLIPS.has(name)) {
      p.tailSide = -p.tailSide;
      p.tailCurl = -p.tailCurl;
    }
  }

  private advance() {
    const next = this.path.shift();
    if (!next) return;
    // a transition interrupted part-way starts from wherever the body is; call that the old posture
    this.fromName = this.tt < 1 && this.prog.hips < 0.5 ? this.fromName : this.posture;
    copyPose(this.from, this.base);
    copyPose(this.to, POSES[next]);
    if (TAIL_FLIPS.has(next) && !TAIL_FLIPS.has(this.posture) && (LOW[this.posture] ?? 2) >= 2) this.tailFlip = Math.random() < 0.5 ? 1 : -1;
    this.flipTail(this.to, next);
    // (in its own time: languid when drowsy, quick when keyed up or frightened, quicker still in a
    // mad rush; and never twice quite the same)
    const md = this.mood;
    const tempo = clamp(1 + 0.45 * md.sleepy - 0.3 * md.arousal - 0.35 * md.fear - 0.25 * this.zoom + 0.15 * this.lazy, 0.6, 1.5);
    this.tdur = edgeTime(this.posture, next) * (0.85 + Math.random() * 0.3) * tempo;
    this.sched = (LOW[next] ?? 2) > (LOW[this.posture] ?? 2) ? RISE : SCHEDULE;
    this.posture = next;
    this.tt = 0;
  }

  /** the posture it is in or on its way to */
  get targetPosture() {
    return this.target;
  }

  get settled() {
    return this.tt >= 1 && this.path.length === 0;
  }

  get standing() {
    return this.settled && (this.posture === 'stand' || this.posture === 'crouch' || this.posture === 'alert');
  }

  walkTo(p: THREE.Vector3, speed = 0.45, face: number | null = null, onArrive: (() => void) | null = null, pass = false) {
    // (a new place to go: how near it has got to it so far starts afresh)
    if (!this.goal || Math.hypot(p.x - this.goal.x, p.z - this.goal.z) > 0.02) {
      this.goalBest = Infinity;
      this.goalStall = 0;
      this.goalPace = 0.9 + 0.2 * Math.random();
    }
    this.goal = p.clone();
    this.goal.y = 0;
    this.goalSpeed = speed;
    this.goalFace = face;
    this.goalPass = pass;
    this.onArrive = onArrive;
    if (this.posture !== 'stand' && this.posture !== 'crouch' && this.posture !== 'alert') this.setPosture('stand');
  }

  stop() {
    this.goal = null;
  }

  /** round on the spot this fast, with nowhere to go (rad/s, + to the left; 0 to stop): after its
   *  own tail */
  spin = 0;

  lookAt(p: THREE.Vector3 | null, weight = 1) {
    this.lookTarget = p ? p.clone() : null;
    this.lookWTarget = p ? weight : 0;
  }

  slowBlink() {
    this.blinkSlow = true;
    this.blinkPhase = 0;
  }

  /** an ordinary blink, now */
  blinkNow() {
    if (this.blinkPhase < 0) {
      this.blinkPhase = 0;
      this.blinkSlow = false;
    }
  }

  /** flick an ear, or both */
  flickEar(which: 'L' | 'R' | 'both', strength = 1) {
    const kick = (w: Wobble) => w.kick((Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 6) * strength);
    if (which !== 'R') kick(this.earL);
    if (which !== 'L') kick(this.earR);
  }

  /** a quick flick of the tail */
  flickTail(strength = 1) {
    this.tailFlickW.kick(-(1.6 + Math.random() * 0.8) * strength);
  }

  private hissT = -1;
  /** how far into the hiss itself (0 .. 1): the coat shader draws the lip up off the fangs with it */
  hissNow = 0;
  /** the upper lip drawn up (0 .. 1) this frame, asked for by whoever has the face (the flehmen),
   *  and as it is, eased toward that (the coat shader draws it up as for a snarl) */
  lipUp = 0;
  lipUpNow = 0;
  /** the hiss itself: the mouth flung wide on the fangs, the ears flat back, the whiskers back,
   *  the head drawn back, then easing to a snarl */
  hiss() {
    this.hissT = 0;
  }

  /** leaning into a hand: the head rolled and turned toward the side being rubbed, the chin up
   *  under a scratch, the rump and tail raised under a stroke at the base of the tail (set by
   *  whoever knows where the hand is; eased toward) */
  readonly petTarget = { roll: 0, yaw: 0, pitch: 0, rump: 0 };
  /** the head tipped to one side, as a cat listens to something it cannot place (radians, + to
   *  its right) */
  tilt = 0;
  private tiltNow = 0;
  private readonly pet = { roll: 0, yaw: 0, pitch: 0, rump: 0 };

  /** a moment in what it does worth a word to someone new to cats (a silent meow, a roll on its
   *  back), just now (for whoever wants it, to clear) */
  moment: string | null = null;

  /** something said (a meow, a trill, a chirp), how long it lasts and when it starts */
  private voice: { kind: string; t: number; dur: number } | null = null;
  vocalize(kind: string, dur: number, delay = 0) {
    this.voice = { kind, t: -delay, dur: Math.max(0.08, dur) };
  }

  /** licks (a hand held still by its face): how far through, how many */
  private licks: { t: number; n: number } | null = null;
  /** n rough licks, about three a second: the tongue out, tip up, and in again each time */
  lick(n = 4) {
    this.licks = { t: 0, n };
  }
  get licking() {
    return this.licks !== null || this.nibbleT >= 0;
  }
  /** a love bite: the mouth opened on a finger, shut on it gently and held a moment, let go; and
   *  then the place licked, two or three times (how far into it; -1: none) */
  private nibbleT = -1;
  nibble() {
    this.nibbleT = 0;
  }
  /** set as the teeth close on the finger (for whoever wants to feel it, to clear) */
  nibbled = false;
  /** set as each lick lands (for whoever wants to feel it or hear it, to clear) */
  lickLanded = false;
  /** set as each kick of the hind feet lands on a hand (for whoever wants to feel it, to clear) */
  kicked = false;
  /** the tip of the tongue left out between the lips, forgotten there (0 .. 1): a blep */
  blep = 0;
  /** the beat of music it is keeping time with, its tail tip flicking to it (0 .. 1 at each beat) */
  beat = 0;

  /** asleep and dreaming: a forepaw twitches, the whiskers quiver */
  dreamTwitch() {
    this.dreamPaw = Math.random() < 0.5 ? 'LF' : 'RF';
    this.dreamW.kick(0.8 + Math.random() * 0.6);
    if (Math.random() < 0.5) this.flickEar(Math.random() < 0.5 ? 'L' : 'R', 0.6);
    // (and the tip of the tail, as if it had a life of its own)
    if (Math.random() < 0.4) this.flickTail(0.45 + 0.3 * Math.random());
  }

  /** running in its sleep: all four paws paddling a few seconds, the whiskers and the tail tip
   *  going, building and dying away (how far through, how long) */
  private dreamRunT = -1;
  private dreamRunDur = 0;
  dreamRun(dur = 2.5 + Math.random() * 2) {
    this.dreamRunT = 0;
    this.dreamRunDur = dur;
  }
  get dreamRunning() {
    return this.dreamRunT >= 0;
  }

  /** startle: the head jerks up */
  jolt(strength = 1) {
    this.joltW.kick((1.2 + Math.random() * 0.6) * strength);
    this.flickEar('both', 1.2 * strength);
  }

  /** set what the cat feels: the named parts change, the rest stay (or return to neutral with replace) */
  setMood(m: Partial<Mood>, replace = false) {
    if (replace) Object.assign(this.mood, NEUTRAL);
    Object.assign(this.mood, m);
  }

  update(dt: number) {
    this.time += dt;
    // (an act that squares the body round to something itself, all at once: no quicker than a
    // body can turn, and the rest of the turn next time)
    if (this.yawWas !== null && dt > 0) {
      const d = wrap(this.yaw - this.yawWas), lim = (5 + 3 * this.zoom) * dt;
      if (Math.abs(d) > lim) this.yaw = wrap(this.yawWas + Math.sign(d) * lim);
    }
    this.transition(dt);
    this.locomote(dt);
    this.compose(dt);
    this.yawWas = this.yaw;
  }
  /** where it faced at the end of the last step (null: put down somewhere, facing anywhere) */
  yawWas: number | null = null;

  private transition(dt: number) {
    if (this.tt < 1) {
      this.tt = Math.min(1, this.tt + dt / this.tdur);
      for (const g of Object.keys(GROUPS) as Group[]) {
        const [d, l] = this.sched[g];
        this.prog[g] = ease((this.tt - d) / l);
      }
      blendPose(this.base, this.from, this.to, this.prog);
      if (this.tt >= 1 && this.path.length) this.advance();
    } else if (this.path.length) {
      this.advance();
    }
  }

  /** on its feet, or as good as: getting up from a crouch into a stand (or down into one), it can
   *  be off already, as a cat springs up into a run */
  private get canWalk() {
    if (this.standing) return true;
    const feet = (p: PoseName) => p === 'stand' || p === 'crouch' || p === 'alert';
    return this.path.length === 0 && feet(this.posture) && feet(this.fromName);
  }

  /** the way to head to get round whatever is first in the way between here and the goal, along
   *  its near side (null: the way is clear) */
  private roundAbout(dx: number, dz: number, dist: number): number | null {
    if (this.ghost || !this.obstacles || !this.goal) return null;
    const ux = dx / dist, uz = dz / dist, way = Math.atan2(ux, uz);
    let best: number | null = null, bestT = dist;
    for (const [c, R0] of this.obstacles()) {
      const R = R0 + 0.13;
      const ox = c.x - this.pos.x, oz = c.z - this.pos.z, dc = Math.hypot(ox, oz);
      // (going to it, in among it: not in the way; already in it: the push out sees to that)
      if (Math.hypot(this.goal.x - c.x, this.goal.z - c.z) < R || dc < R * 0.98) continue;
      const t = ox * ux + oz * uz;
      if (t <= 0 || t - R > bestT) continue;
      if (Math.abs(ox * uz - oz * ux) >= R) continue;
      // (to the side of it the way already passes, just clear of it)
      const at = Math.atan2(ox, oz), off = Math.asin(Math.min(1, R / dc));
      best = at + (wrap(at - way) > 0 ? -1 : 1) * Math.min(1.5, off * 1.08);
      bestT = t;
    }
    return best;
  }

  /** stepping out of a thing it was right up against or in on purpose (the box, the post), now
   *  that that is over: not yet clear of it */
  easingOut = false;
  private wasGhost = false;

  /** the body out of anything solid it has got into (its chest and its hips, each a circle).
   *  Walked into, it is kept out there and then; right up against a thing or in it on purpose,
   *  once that is over it steps out, as quick as it is going and at a walk at the least, the paws
   *  going with it, and does not jump clear of it in one go */
  private keepOut(dt: number) {
    if (this.ghost || !this.solids) { this.wasGhost = this.ghost; return; }
    if (this.wasGhost) { this.wasGhost = false; this.easingOut = true; }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let left = this.easingOut ? Math.max(0.3, 1.3 * Math.abs(this.speed)) * dt : Infinity;
    let inside = false;
    // (a few times over: squeezed between two things, out of the one is into the other)
    const solids = this.solids();
    for (let pass = 0; pass < 4 && left > 0; pass++) {
      let moved = false;
      for (const [c, R0] of solids) {
        for (const k of [0.11, -0.09]) {
          const dx = this.pos.x + fx * k - c.x, dz = this.pos.z + fz * k - c.z, d = Math.hypot(dx, dz), min = R0 + 0.075;
          if (d >= min - 1e-4) continue;
          inside = true;
          if (left <= 0) continue;
          const ux = d > 1e-4 ? dx / d : fx, uz = d > 1e-4 ? dz / d : fz;
          const by = Math.min(min - d, left);
          this.pos.x += ux * by;
          this.pos.z += uz * by;
          left -= by;
          moved = true;
        }
      }
      if (!moved) break;
    }
    if (!inside) this.easingOut = false;
  }

  private locomote(dt: number) {
    let want = 0, turn = 0;
    if (!this.goal && this.spin && this.standing) turn = this.spin;
    if (this.goal && this.canWalk) {
      const dx = this.goal.x - this.pos.x, dz = this.goal.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      // (walking straight at it and getting no nearer: the last of the way is blocked, by the box's
      // corner or the like; near it, that will do; a long way off, it gives up on it)
      if (dist < this.goalBest - 0.004) { this.goalBest = dist; this.goalStall = 0; }
      else if (this.speed > 0.05 && Math.abs(wrap(Math.atan2(dx, dz) - this.yaw)) < 0.7) this.goalStall += dt;
      const stuck = (this.goalStall > 0.6 && dist < 0.2) || this.goalStall > 2;
      if (this.goalPass && (dist < 0.06 || stuck)) this.arrive();
      else if ((dist < 0.025 || stuck) && this.speed < 0.05) {
        // arrived: turn to face the requested way, then report
        if (this.goalFace !== null) {
          const e = wrap(this.goalFace - this.yaw);
          turn = clamp(e * 3, -2.2, 2.2);
          if (Math.abs(e) < 0.06) this.arrive();
        } else this.arrive();
      } else {
        // (round anything in the way)
        const want_yaw = this.roundAbout(dx, dz, dist) ?? Math.atan2(dx, dz);
        const e = wrap(want_yaw - this.yaw);
        // (on the spot a little slower than on the move; quicker at a run, but in an arc, not on
        // a pin)
        const maxTurn = (1.35 + 0.45 * clamp(this.speed / 0.2)) * (1 + 1.2 * this.zoom);
        turn = clamp(e * 3.2, -maxTurn, maxTurn);
        // a cat walks round in an arc rather than stopping to pivot, slowing for the sharper
        // turns (near the goal too, so as not to circle it); the way behind it, it all but turns
        // on the spot. It eases into the stop over the last step or two
        const facing = Math.cos(e);
        const steer = this.goalPass ? clamp(0.45 + 0.55 * facing, 0.15, 1)
          : clamp(0.35 + 0.65 * facing, 0.1, 1) * (Math.abs(e) > 0.6 ? clamp(dist / 0.25, 0.35, 1) : 1);
        // (an easy walk at its own pace, and its mood's: dawdling drowsy, brisk keyed up; a run is
        // as fast as it is asked)
        const md = this.mood;
        const pace = this.goalSpeed <= 0.35 ? this.goalPace * clamp(1 - 0.25 * md.sleepy + 0.2 * md.arousal - 0.1 * this.lazy, 0.7, 1.25) : 1;
        want = this.goalSpeed * pace * steer * (this.goalPass ? 1 : clamp(dist / 0.14, 0.3, 1));
        if (dist < 0.025 || stuck) want = 0;
      }
    }
    this.wantSpeed = want;
    // accelerate like an animal: quick to start, a couple of steps to stop
    const acc = (want > this.speed ? 0.7 : 1.4) * (1 + 2 * this.zoom);
    this.speed += clamp(want - this.speed, -acc * dt, acc * dt);
    // (a body has weight: the turn comes on and goes off no faster than legs can swing it round,
    // quicker in a mad rush; never a whip from one way to the other)
    const yawAcc = (12 + 10 * this.zoom) * dt;
    this.yawRate += clamp((turn - this.yawRate) * Math.min(1, dt * 5), -yawAcc, yawAcc);
    this.yaw = wrap(this.yaw + this.yawRate * dt);
    this.vel.set(Math.sin(this.yaw) * this.speed, 0, Math.cos(this.yaw) * this.speed);
    this.pos.addScaledVector(this.vel, dt);
    this.keepOut(dt);
  }

  private arrive() {
    this.goal = null;
    const cb = this.onArrive;
    this.onArrive = null;
    cb?.();
  }

  /** the pose for this frame: posture blend + any layer + gait and life on top */
  private compose(dt: number) {
    const p = this.pose;
    copyPose(p, this.base);
    const li = this.layerIn, kIn = 1 - Math.exp(-dt * 12);
    for (const g of ['hips', 'chest', 'front', 'hind'] as const) {
      const want = this.tt >= 1 && !this.path.length ? 1 : this.path.length ? 0 : this.prog[g] ?? 1;
      li[g] += (want - li[g]) * kIn;
    }
    if (this.layer && this.layer.w > 0) {
      const w0 = this.layer.w;
      for (const [k, val] of Object.entries(this.layer.pose)) {
        const g = GROUP_OF[k];
        const w = g === 'hips' || g === 'chest' || g === 'front' || g === 'hind' ? w0 * li[g] : w0;
        if (typeof val === 'number') (p as unknown as Record<string, number>)[k] += (val - (p as unknown as Record<string, number>)[k]) * w;
        else if (val) {
          // a paw: each of its numbers given
          const f = (p as unknown as Record<string, Foot>)[k];
          for (const [fk, fv] of Object.entries(val as Partial<Foot>)) (f as unknown as Record<string, number>)[fk] += ((fv as number) - (f as unknown as Record<string, number>)[fk]) * w;
        }
      }
    }
    // (and no part of it ever jumps: what the posture and the act ask for is followed closely, but
    // eased, a few hundredths of a second behind: an act's overrides coming on all at once, or a
    // posture asked for in the middle of another, are a quick movement, not a cut)
    this.easePose(p, dt);
    const t = this.time;
    // the stride: the body rises over each leg as it stands straight under it, dips over the
    // swinging side and turns with the legs; the head rides it out
    const g = this.gait;
    const moving = g ? g.moving : 0;
    if (g) {
      p.hipY += g.hipHeave;
      // (bounding: the back rounds, the chest coming down toward the hips, and stretches out)
      p.lumbarPitch -= 0.32 * g.flex;
      p.chestPitch += 0.12 * g.flex;
      p.hipRoll += g.hipRoll;
      p.hipYaw += g.hipYaw;
      p.chestRoll += g.chestRoll;
      p.chestYaw += g.chestYaw;
      // (pitch is nose-up positive)
      p.chestPitch += (g.chestHeave - g.hipHeave) / 0.26;
      p.neckPitch -= 0.5 * g.chestHeave / 0.12;
      // walking, the head comes down to about the line of the back, the face still level; the
      // body goes a little lower on softer legs, the hind paws under the hips
      p.neckPitch -= 0.3 * moving;
      p.headPitch += 0.22 * moving;
      p.hipY -= 0.01 * moving;
      p.LH.z += 0.01 * moving;
      p.RH.z += 0.01 * moving;
    }
    // turning: the spine bends into the curve and the head leads
    const yr = clamp(this.yawRate, -2.5, 2.5);
    p.lumbarYaw += yr * 0.12;
    p.chestYaw += yr * 0.1;
    p.neckYaw += yr * 0.12;
    // walking, the tail is carried: up with a hook at the tip in a cat at ease with you, lower
    // and easy otherwise
    const m = this.mood;
    const ease01 = clamp((m.trust + 0.1) / 0.7) * (1 - m.fear) * (1 - 0.7 * m.sick) * (1 - 0.5 * m.sleepy);
    const wl = moving * (1 - clamp(p.tailSag));
    p.tailLift += (0.45 + 0.85 * ease01 - p.tailLift) * wl;
    p.tailCurve += (0.35 - 0.5 * ease01 - p.tailCurve) * wl;
    p.tailHook += (0.45 + 0.45 * ease01 - p.tailHook) * wl;
    p.tailCurl += (0 - p.tailCurl) * wl;
    this.swayW = moving;
    this.swayA = g ? g.angle : 0;
    // alive: slow weight shifts and head drift
    p.hipRoll += 0.012 * noise1(t * 0.23 + 3);
    p.chestYaw += 0.02 * noise1(t * 0.19 + 7);
    p.headRoll += 0.05 * noise1(t * 0.13 + 11);
    p.neckPitch += 0.03 * noise1(t * 0.17 + 5);
    // what the cat feels, in its ears, whiskers, tail, fur, mouth, head and breath (mood.ts):
    // ears and whiskers quick, the tail slower; fur bristles at once and lies down slowly
    const fb = bodyFor(this.mood), f = this.feel;
    const kk = (rate: number) => 1 - Math.exp(-dt * rate);
    for (const key of Object.keys(fb) as (keyof BodyLook)[]) {
      const rate = key.startsWith('ear') || key === 'whisker' || key === 'jaw' || key === 'snarl' ? 6
        : key === 'puff' ? (fb.puff > f.puff ? 4 : 0.7)
        : key.startsWith('tail') ? 2.5 : 1.5;
      f[key] += (fb[key] - f[key]) * kk(rate);
    }
    p.earFwd += f.earFwd;
    p.earOut += f.earOut;
    p.earFlat = clamp(p.earFlat + f.earFlat);
    p.whisker = clamp(p.whisker + f.whisker, -1, 1);
    // a tail lying on the floor (sleeping, lying on the side) stays there
    const up = 1 - clamp(p.tailSag);
    p.tailLift += f.tailLift * up;
    p.tailCurve += f.tailCurve * up;
    p.tailCurl += f.tailCurl;
    p.tailHook += f.tailHook * up;
    p.tailLift = Math.min(1.45, p.tailLift);
    p.tailSag = clamp(p.tailSag + f.tailSag);
    p.puff = clamp(p.puff + f.puff);
    p.jaw = clamp(p.jaw + f.jaw);
    p.headPitch += f.headPitch;
    p.breath = clamp(p.breath + f.breath);
    {
      const work = clamp(((this.speed - 0.3) / 0.8) * (1 + 0.5 * this.zoom));
      this.exertion += (work - this.exertion) * kk(work > this.exertion ? 0.25 : 0.04);
      p.breath = clamp(p.breath + 0.5 * this.exertion);
      const pant = clamp((this.exertion - 0.7) / 0.2) * (1 - clamp(this.speed / 0.15)) * (1 - clamp(p.tailSag));
      this.pantT += dt * 2.6;
      if (pant > 0.01) {
        p.jaw = Math.max(p.jaw, pant * (0.11 + 0.04 * Math.sin(this.pantT * Math.PI * 2)));
        p.tongue = Math.max(p.tongue, 0.3 * pant);
        p.tongueUp = Math.min(p.tongueUp, -0.1 * pant);
      }
    }
    if (this.hissT >= 0) {
      this.hissT += dt;
      const ht = this.hissT;
      const env = ht < 0.09 ? ht / 0.09 : ht < 0.85 ? 1 : Math.max(0, 1 - (ht - 0.85) / 0.6);
      if (env <= 0 && ht > 0.5) this.hissT = -1;
      this.hissNow = env;
      p.jaw = Math.max(p.jaw, 0.95 * env);
      p.earFlat = clamp(p.earFlat + env);
      p.earFwd -= 0.8 * env;
      p.earOut += 0.5 * env;
      p.whisker = clamp(p.whisker - env, -1, 1);
      p.squint = clamp(p.squint + 0.3 * env);
      p.headPitch += 0.16 * env;
      p.neckPitch -= 0.12 * env;
    } else this.hissNow = 0;
    // (asked for frame by frame: when nobody asks, it goes down again)
    this.lipUpNow += (this.lipUp - this.lipUpNow) * Math.min(1, dt * 7);
    this.lipUp = 0;
    // talking: the mouth shaped by the sound, in time with it. A meow is "mi-aow", lips parting on
    // the "m", wide on the "aow" and closing as it trails off, the head lifting a little toward
    // whoever it is said to; a plea longer and wider, a soft one small; a trill is said with the
    // mouth all but shut, a hum in the throat; a chirp a quick little open and shut
    const v = this.voice;
    if (v) {
      v.t += dt;
      if (v.t >= 0) {
        const x = v.t / v.dur;
        const out = x > 1 ? Math.max(0, 1 - (x - 1) / 0.25) : 1;
        let jaw = 0, lift = 0;
        if (v.kind.startsWith('meow')) {
          const wide = v.kind === 'meowPlead' ? 0.75 : v.kind === 'meowSoft' ? 0.4 : 0.66;
          const open = Math.sin(Math.PI * Math.min(1, x * 1.25));
          jaw = (x < 0.08 ? 0.12 * (x / 0.08) : wide * Math.max(0.2, open)) * out;
          lift = (v.kind === 'meowPlead' ? 0.22 : 0.1) * Math.sin(Math.PI * Math.min(1, x)) * out;
        } else if (v.kind === 'trill') {
          jaw = (0.06 + 0.04 * Math.max(0, Math.sin(v.t * Math.PI * 2 * 9))) * Math.sin(Math.PI * Math.min(1, x)) * out;
          lift = 0.08 * Math.sin(Math.PI * Math.min(1, x)) * out;
        } else {
          jaw = 0.35 * Math.sin(Math.PI * Math.min(1, x));
          lift = 0.04 * Math.sin(Math.PI * Math.min(1, x));
        }
        p.jaw = Math.max(p.jaw, jaw);
        p.headPitch += lift;
        p.earFwd += 0.4 * lift;
        if (x > 1.25) this.voice = null;
      }
    }
    // a love bite: the mouth open to it (0 .. 0.35 s), shut on it softly and held, the eyes half
    // shut (to 1 s), let go (to 1.2 s); and then the licks
    if (this.nibbleT >= 0) {
      const u = this.nibbleT, was = u;
      this.nibbleT += dt;
      const open = u < 0.35 ? ease(u / 0.35) * 0.42 : u < 0.47 ? 0.42 - 0.32 * ease((u - 0.35) / 0.12) : u < 1 ? 0.1 : u < 1.2 ? 0.1 + 0.12 * Math.sin(Math.PI * (u - 1) / 0.2) : 0;
      p.jaw = Math.max(p.jaw, open);
      if (u > 0.35 && u < 1.1) {
        p.eyeOpen = Math.min(p.eyeOpen, 0.35);
        p.squint = Math.max(p.squint, 0.5);
        p.earFwd -= 0.25;
      }
      if (was < 0.45 && this.nibbleT >= 0.45) this.nibbled = true;
      if (this.nibbleT >= 1.25) { this.nibbleT = -1; this.lick(2 + Math.floor(Math.random() * 2)); }
    }
    // licks: each one the tongue out, its tip curled up, and back in, the head lifting into it
    const L = this.licks;
    if (L) {
      const per = 0.34, k0 = L.t / per;
      L.t += dt;
      const k = L.t / per;
      if (Math.floor(k0 + 0.5) !== Math.floor(k + 0.5) && k < L.n) this.lickLanded = true;
      if (k >= L.n) this.licks = null;
      else {
        const s = Math.sin(Math.PI * (k - Math.floor(k)));
        p.tongue = Math.max(p.tongue, s);
        p.tongueUp += (0.7 - p.tongueUp) * Math.min(1, 3 * s);
        p.jaw = Math.max(p.jaw, 0.13 * s);
        p.headPitch += 0.1 * s;
        p.eyeOpen = Math.min(p.eyeOpen, 0.5);
      }
    }
    // keeping time: the tip of the tail flicked to each beat
    if (this.beat > 0.01) p.tailCurl += 0.55 * this.beat * (1 - 0.5 * clamp(p.tailSag));
    // a blep: the tip of the tongue just showing
    if (this.blep > 0.01) {
      p.tongue = Math.max(p.tongue, 0.38 * this.blep);
      p.tongueUp = Math.min(p.tongueUp, -0.15 * this.blep);
      p.jaw = Math.max(p.jaw, 0.035 * this.blep);
    }
    // leaning into a hand
    {
      const P = this.pet, T = this.petTarget, kp = 1 - Math.exp(-dt * 3.5);
      P.roll += (T.roll - P.roll) * kp;
      P.yaw += (T.yaw - P.yaw) * kp;
      P.pitch += (T.pitch - P.pitch) * kp;
      P.rump += (T.rump - P.rump) * kp;
      p.headRoll += P.roll;
      p.headYaw += P.yaw;
      p.neckYaw += 0.5 * P.yaw;
      p.headPitch += P.pitch;
      p.neckPitch += 0.4 * P.pitch;
      if (this.posture === 'stand' || this.posture === 'sit' || this.posture === 'crouch') p.hipY += 0.018 * P.rump;
      p.hipPitch -= 0.12 * P.rump;
      p.tailLift += 0.6 * P.rump;
    }
    // a face close in front of it
    this.noseNow += (this.nose - this.noseNow) * (1 - Math.exp(-dt * 3));
    this.shyNow += (this.shy - this.shyNow) * (1 - Math.exp(-dt * 4));
    if (this.noseNow > 0.01 || this.shyNow > 0.01) {
      const n = this.noseNow, s = this.shyNow;
      p.whisker = clamp(p.whisker + 0.7 * n - 0.5 * s, -1, 1);
      p.earFwd += 0.45 * n - 0.7 * s;
      p.earFlat = clamp(p.earFlat + 0.55 * s);
      // (the head put out to it, and the nose working: quick little lifts of the muzzle, in runs
      // of a few with a breath between)
      const run = Math.max(0, Math.sin(this.time * 2.3));
      p.neckPitch -= 0.06 * n;
      p.headPitch += 0.04 * n * Math.sin(this.time * 40) * run * run;
      // (unsure of it: the head drawn back, the chin in, the eyes wide)
      p.neckPitch += 0.12 * s;
      p.headPitch -= 0.14 * s;
      p.pupil = clamp(p.pupil + 0.35 * s);
    }
    // the puzzled tilt: over quickly, back slowly, the ears pricked while it lasts
    this.tiltNow += (this.tilt - this.tiltNow) * (1 - Math.exp(-dt * (this.tilt !== 0 ? 7 : 3.5)));
    p.headRoll += this.tiltNow;
    p.earFwd += 0.5 * Math.abs(this.tiltNow);
    // tail: a lazy swish, more when the motor asks for it or the cat is cross or keen
    this.wavePhase += dt * (1.1 + 1.6 * this.waveAmp) * this.tailWaveSpeed * Math.max(0.2, f.tailWaveSpeed);
    // ears: flick now and then, often when annoyed
    this.earT -= dt;
    if (this.earT < 0) {
      this.earT = (1.5 + Math.random() * 5) / Math.max(1, f.earFlicks);
      const side = Math.random() < 0.5 ? this.earL : this.earR;
      side.kick((Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 10));
    }
    this.twitch.L = this.earL.step(dt);
    this.twitch.R = this.earR.step(dt);
    this.earAimS += (this.earAim - this.earAimS) * (1 - Math.exp(-dt * 6));
    // (each ear round to what it attends to, quickly, the one nearer it the further)
    const ke = 1 - Math.exp(-dt * 9);
    this.earToS.L += (this.earTo.L - this.earToS.L) * ke;
    this.earToS.R += (this.earTo.R - this.earToS.R) * ke;
    this.twitch.swivelL = 0.25 * noise1(t * 0.3 + 1) + 0.6 * this.earAimS + this.earToS.L;
    this.twitch.swivelR = 0.25 * noise1(t * 0.3 + 9) + 0.6 * this.earAimS + this.earToS.R;
    // startle and tail flicks: springs that settle by themselves
    p.headPitch += 0.35 * this.joltW.step(dt);
    p.neckPitch += 0.2 * this.joltW.x;
    const dw = this.dreamW.step(dt);
    if (Math.abs(dw) > 1e-4) {
      const paw = p[this.dreamPaw];
      paw.flex = Math.max(0, Math.min(1, paw.flex + 0.5 * dw));
      paw.z += 0.012 * dw;
      p.whisker = Math.max(-1, Math.min(1, p.whisker + 0.6 * dw));
    }
    if (this.dreamRunT >= 0) {
      this.dreamRunT += dt;
      const u = this.dreamRunT / this.dreamRunDur;
      if (u >= 1) this.dreamRunT = -1;
      else {
        // (about three paddles a second, the fore and hind pairs a quarter out of step, only the
        // paws bearing no weight; a little, as in a dream)
        const env = Math.pow(Math.sin(Math.PI * u), 0.7), w = this.dreamRunT * Math.PI * 2 * 3.1;
        const legs: [Leg, number][] = [['LF', 0], ['RF', Math.PI], ['LH', Math.PI * 0.5], ['RH', Math.PI * 1.5]];
        for (const [leg, ph] of legs) {
          const f = p[leg];
          if (f.planted > 0.5) continue;
          const s = Math.sin(w + ph);
          f.z += 0.011 * env * s;
          f.flex = Math.max(0, Math.min(1, f.flex + 0.22 * env * Math.max(0, s)));
        }
        p.whisker = Math.max(-1, Math.min(1, p.whisker + 0.5 * env * Math.sin(w * 2.3)));
        p.tailCurl += 0.3 * env * Math.sin(w * 0.6);
      }
    }
    this.tailFlickW.step(dt);
    // gaze: turned about the eyes toward what it looks at (not slid across to it in a straight
    // line, which between two things either side of the head goes right past its nose, and the
    // head whips round)
    if (this.lookTarget) this.look.copy(this.lookTarget);
    const kl = 1 - Math.exp(-dt * 7);
    if (Number.isNaN(this.eyeRef.x)) this.lookS.lerp(this.look, kl);
    else {
      const to = this.lookTo.copy(this.look).sub(this.eyeRef);
      const d = Math.max(0.15, to.length());
      to.divideScalar(d);
      // (the head swings round like a weight: it gathers speed, never more than a cat's head can
      // go, and slows into place, the eyes having got there first)
      const ang = this.lookDir.angleTo(to);
      this.lookVel += (144 * ang - 24 * this.lookVel) * Math.min(dt, 0.05);
      this.lookVel = Math.max(0, Math.min(9, this.lookVel));
      if (ang > 1e-5) {
        const axis = this.lookAxis.crossVectors(this.lookDir, to);
        if (axis.lengthSq() < 1e-10) axis.set(0, 1, 0);
        this.lookDir.applyAxisAngle(axis.normalize(), Math.min(ang, this.lookVel * dt)).normalize();
      }
      this.lookDist += (d - this.lookDist) * kl;
      this.lookS.copy(this.eyeRef).addScaledVector(this.lookDir, Math.max(0.45, this.lookDist));
    }
    this.lookW += (this.lookWTarget - this.lookW) * (1 - Math.exp(-dt * 3));
    // the feeling in the eyes: lids within a few tenths of a second, pupils flooding open faster
    // than they close down, the shine slowly
    const want = eyesFor(this.mood), calm = eyesFor(NEUTRAL);
    const ey = this.eyes;
    const k = (rate: number) => 1 - Math.exp(-dt * rate);
    ey.open += (want.open - calm.open - ey.open) * k(4);
    ey.squint += (want.squint - calm.squint - ey.squint) * k(4);
    const dp = want.pupil - calm.pupil;
    ey.pupil += (dp - ey.pupil) * k(dp > ey.pupil ? 5 : 2.5);
    ey.shine += (want.shine - ey.shine) * k(1.5);
    // a cat that likes you says so with slow blinks
    if (want.slowBlinkEvery > 0) {
      this.slowBlinkIn -= dt;
      if (this.slowBlinkIn < 0 && this.blinkPhase < 0) {
        this.slowBlink();
        this.slowBlinkIn = want.slowBlinkEvery * (0.7 + 0.6 * Math.random());
      }
    } else this.slowBlinkIn = Math.min(this.slowBlinkIn, 5);
    // blinking (hardly at all, intent on something)
    this.blinkT -= dt * (1 - 0.8 * clamp(this.focus));
    if (this.blinkPhase < 0 && this.blinkT < 0) {
      this.blinkPhase = 0;
      this.blinkSlow = false;
      this.blinkT = 2.5 + Math.random() * 6;
    }
    if (this.blinkPhase >= 0) {
      const dur = this.blinkSlow ? 1.4 + 0.6 * this.mood.sleepy : want.blinkTime;
      this.blinkPhase += dt / dur;
      const s = this.blinkPhase;
      this.blink = this.blinkSlow
        ? (s < 0.35 ? ease(s / 0.35) : s < 0.55 ? 1 : 1 - ease((s - 0.55) / 0.45))
        : (s < 0.35 ? s / 0.35 : 1 - (s - 0.35) / 0.65);
      if (s >= 1) { this.blinkPhase = -1; this.blink = 0; }
    }
  }

  /** the smoothed gaze point (world) */
  get gaze() {
    return this.lookS;
  }

  /** gait phase is kept by the stepper; the cat object copies it in */
  gaitPhase = 0;
  /** what the stride does to the body this frame (the stepper's, copied in by the cat) */
  gait: GaitSignals | null = null;
  private swayW = 0;
  private swayA = 0;

  /** the tail's sway: the motor's own, plus the feeling's */
  private get waveAmp() {
    return Math.max(0, this.tailWave + this.feel.tailWave);
  }

  /** time-varying tail yaw for segment i of n */
  tailWaveAt(i: number, n: number) {
    const u = i / (n - 1);
    // walking, it swings across once a stride, the tip a beat behind the root
    const sway = 0.12 * this.swayW * Math.sin(this.swayA + 0.6 - u * 1.8) * (0.35 + u);
    return this.waveAmp * 0.22 * Math.sin(this.wavePhase - u * 2.2) * (0.3 + u) + 0.18 * this.tailFlickW.x * u * u + sway;
  }
}

function wrap(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
