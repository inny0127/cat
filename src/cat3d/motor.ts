import * as THREE from 'three';
import { POSES, blendPose, clonePose, copyPose, GROUPS, type Foot, type Group, type Pose, type PoseLayer, type PoseName } from './pose';
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
  ['loaf', 'curl', 1.9],
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
const LOW: Partial<Record<PoseName, number>> = { stand: 3, alert: 3, arch: 3, stretch: 3, crouch: 2, sit: 2, loaf: 1, sphinx: 1, side: 0, curl: 0 };

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

  // locomotion
  goal: THREE.Vector3 | null = null;
  goalSpeed = 0.45;
  goalFace: number | null = null;
  /** a waypoint on the way somewhere: walk through it without stopping */
  goalPass = false;
  onArrive: (() => void) | null = null;
  maxSpeed = 1.6;

  // gaze (world point) and how much the head follows it
  readonly look = new THREE.Vector3(0, 0.2, 1);
  private readonly lookS = new THREE.Vector3(0, 0.2, 1);
  lookTarget: THREE.Vector3 | null = null;
  lookW = 0;
  lookWTarget = 0;

  // face
  blink = 0;
  private blinkT = 2;
  private blinkPhase = -1;
  private blinkSlow = false;
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

  /** jump straight into a posture (tests, restoring a saved state) */
  snap(name: PoseName) {
    this.posture = this.target = this.fromName = name;
    this.path = [];
    copyPose(this.base, POSES[name]);
    copyPose(this.from, POSES[name]);
    copyPose(this.to, POSES[name]);
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

  private advance() {
    const next = this.path.shift();
    if (!next) return;
    // a transition interrupted part-way starts from wherever the body is; call that the old posture
    this.fromName = this.tt < 1 && this.prog.hips < 0.5 ? this.fromName : this.posture;
    copyPose(this.from, this.base);
    copyPose(this.to, POSES[next]);
    this.tdur = edgeTime(this.posture, next) * (0.9 + Math.random() * 0.2);
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
  /** the hiss itself: the mouth flung wide on the fangs, the ears flat back, the whiskers back,
   *  the head drawn back, then easing to a snarl */
  hiss() {
    this.hissT = 0;
  }

  /** asleep and dreaming: a forepaw twitches, the whiskers quiver */
  dreamTwitch() {
    this.dreamPaw = Math.random() < 0.5 ? 'LF' : 'RF';
    this.dreamW.kick(0.8 + Math.random() * 0.6);
    if (Math.random() < 0.5) this.flickEar(Math.random() < 0.5 ? 'L' : 'R', 0.6);
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
    this.transition(dt);
    this.locomote(dt);
    this.compose(dt);
  }

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

  private locomote(dt: number) {
    let want = 0, turn = 0;
    if (this.goal && this.standing) {
      const dx = this.goal.x - this.pos.x, dz = this.goal.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (this.goalPass && dist < 0.06) this.arrive();
      else if (dist < 0.025 && this.speed < 0.05) {
        // arrived: turn to face the requested way, then report
        if (this.goalFace !== null) {
          const e = wrap(this.goalFace - this.yaw);
          turn = clamp(e * 3, -2.2, 2.2);
          if (Math.abs(e) < 0.06) this.arrive();
        } else this.arrive();
      } else {
        const want_yaw = Math.atan2(dx, dz);
        const e = wrap(want_yaw - this.yaw);
        // (on the spot a little slower than on the move)
        const maxTurn = 1.35 + 0.45 * clamp(this.speed / 0.2);
        turn = clamp(e * 3.2, -maxTurn, maxTurn);
        // a cat walks round in an arc rather than stopping to pivot, slowing for the sharper
        // turns (near the goal too, so as not to circle it); the way behind it, it all but turns
        // on the spot. It eases into the stop over the last step or two
        const facing = Math.cos(e);
        const steer = this.goalPass ? clamp(0.45 + 0.55 * facing, 0.15, 1)
          : clamp(0.35 + 0.65 * facing, 0.1, 1) * (Math.abs(e) > 0.6 ? clamp(dist / 0.25, 0.35, 1) : 1);
        want = this.goalSpeed * steer * (this.goalPass ? 1 : clamp(dist / 0.14, 0.3, 1));
        if (dist < 0.025) want = 0;
      }
    }
    this.wantSpeed = want;
    // accelerate like an animal: quick to start, a couple of steps to stop
    const acc = want > this.speed ? 0.7 : 1.4;
    this.speed += clamp(want - this.speed, -acc * dt, acc * dt);
    this.yawRate += (turn - this.yawRate) * Math.min(1, dt * 5);
    this.yaw = wrap(this.yaw + this.yawRate * dt);
    this.vel.set(Math.sin(this.yaw) * this.speed, 0, Math.cos(this.yaw) * this.speed);
    this.pos.addScaledVector(this.vel, dt);
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
    if (this.layer && this.layer.w > 0) {
      const w = this.layer.w;
      for (const [k, val] of Object.entries(this.layer.pose)) {
        if (typeof val === 'number') (p as unknown as Record<string, number>)[k] += (val - (p as unknown as Record<string, number>)[k]) * w;
        else if (val) {
          // a paw: each of its numbers given
          const f = (p as unknown as Record<string, Foot>)[k];
          for (const [fk, fv] of Object.entries(val as Partial<Foot>)) (f as unknown as Record<string, number>)[fk] += ((fv as number) - (f as unknown as Record<string, number>)[fk]) * w;
        }
      }
    }
    const t = this.time;
    // the stride: the body rises over each leg as it stands straight under it, dips over the
    // swinging side and turns with the legs; the head rides it out
    const g = this.gait;
    const moving = g ? g.moving : 0;
    if (g) {
      p.hipY += g.hipHeave;
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
    this.twitch.swivelL = 0.25 * noise1(t * 0.3 + 1) + 0.6 * this.earAimS;
    this.twitch.swivelR = 0.25 * noise1(t * 0.3 + 9) + 0.6 * this.earAimS;
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
    this.tailFlickW.step(dt);
    // gaze
    if (this.lookTarget) this.look.copy(this.lookTarget);
    this.lookS.lerp(this.look, 1 - Math.exp(-dt * 7));
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
    // blinking
    this.blinkT -= dt;
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
