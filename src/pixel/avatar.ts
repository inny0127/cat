import * as THREE from 'three';
import type { Cat3D } from '../cat3d/cat';
import { POSES, SIDE_TURN, type Leg, type PoseLayer, type PoseName } from '../cat3d/pose';
import { NEUTRAL, type Mood } from '../cat3d/mood';
import type { Avatar } from '../sim/avatar';
import type { EarMood, TailMood } from '../rig/animator';
import { boop, byYou, chooseAct, groomChest, groomFlank, knead, restingPose, sneeze, toBed, toWindow, wander, warmUp, washFace, yawn, type Act, type Ctx, sunbathe, Play, Sill, Hunt, Box, Zoomies, Walk, Stare, Rub, scratchEar, wakeUp, stretchSideOn, Greet, Gift, Snub, Beg, PawGlass, TailChase, Claw, Top, Fish, isPerching, type Perching, type ScratchPost, type GlassFinger, type SillSpot } from './behave';
import { Chase, Startle, type LaserDot } from './chase';
import { Tease, type Lure } from './tease';

const LYING: PoseName[] = ['loaf', 'sphinx', 'side', 'back', 'curl', 'curlL'];
const CURLED = (p: PoseName) => p === 'curl' || p === 'curlL';
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export interface Spot {
  x: number;
  z: number;
  /** facing: 0 is toward the window (+z) */
  yaw: number;
}

/**
 * The brain's body in the 3D room. The brain says what it wants (asleep, head up to look around,
 * eyes on the finger) and does a few things now (blink, flick an ear, leave); this picks the
 * posture, where to look and how to come and go. The face, ears, tail, fur and breath follow the
 * cat's feelings, which the app hands the motor from the brain (cat3d/mood.ts), so the 2D-only
 * intentions here (eye targets, ear and tail moods, puff) are kept but not drawn (the fur's ripple
 * is: the skin of its back twitching).
 */
export class PixelAvatar implements Avatar {
  sleep = 1;
  eyeTarget = 0;
  squintTarget = 0;
  pupilTarget = 0.3;
  gazeTarget: { x: number; y: number } | null = null;
  earMood: EarMood = 'sleep';
  tailMood: TailMood = 'still';
  headLift = 0;
  headLean = { x: 0, y: 0 };
  headRecoil = 0;
  kneading = false;
  /** a hand on it now or a moment ago (set by the app): it stays put rather than getting up */
  touched = false;
  rippleTarget = 0;
  puffTarget = 0;
  breathRate = 0.33;
  breathDepth = 0.85;
  alive = true;
  sick = 0;
  desatTarget = 0;
  purr = 0;

  private isHidden = false;
  /** coming or going: the walk is the avatar's until it ends */
  private trip: { kind: 'leave' | 'come' | 'errand'; onDone?: () => void } | null = null;
  /** an errand in the room: to the bowl, eat or drink there, then off out of the room */
  private errand: { reason: string; phase: 'go' | 'do' | 'off'; t: number; dur: number; dir: number } | null = null;
  /** the room's places (bowls, box), once there is a room */
  spots: { food: THREE.Vector3; water: THREE.Vector3; litter: THREE.Vector3; sniff?: { to: THREE.Vector3; face: number }[]; posts?: THREE.Vector3[]; scratcher?: ScratchPost } | null = null;
  /** a place in the sun on the floor, if there is one now */
  sunSpot: (() => THREE.Vector3 | null) | null = null;
  /** is a circle on the floor clear of the room's things */
  floorClear: ((p: THREE.Vector3, r: number) => boolean) | null = null;
  /** is a point on the floor in the sun */
  sunlitAt: ((p: THREE.Vector3) => boolean) | null = null;
  /** by the radiator, while the heating is on */
  warmSpot: (() => { at: THREE.Vector3; face: number } | null) | null = null;
  /** the ball of wool to play with: where it is, a paw sending it off, a finger having it, paws
   *  pinning it down (and still having it) */
  toys: {
    yarn: () => THREE.Vector3; kick: (dir: THREE.Vector3, speed: number) => void;
    held: () => boolean; pin: (sec: number, at: THREE.Vector3) => void; pinned: () => boolean;
  } | null = null;
  /** the ball while someone moves it about (set by the app), and how long the cat has watched it
   *  go before it has to have it; and after a good long game, a while before it will play again */
  lure: THREE.Vector3 | null = null;
  lureMoving = false;
  /** a bird on the ledge outside, if there is one (where, on the glass) */
  visitor: THREE.Vector3 | null = null;
  /** the red dot of a laser pointer, while one shines in the room (set by the app); a moment's
   *  stare at it before it has to be had; and after a long game of it, a while before it will be
   *  drawn in again (it only watches) */
  laser: LaserDot | null = null;
  /** a glint of sun going across the floor (the room's): its eyes go after it, and now and then,
   *  in the mood for it, the rest of it (decided as it comes) */
  glint: THREE.Vector3 | null = null;
  chasingGlint = false;
  private glintSeen = false;
  private laserT = 0;
  private laserNeed = 0.3;
  private chaseRest = 0;
  /** the room's say in where a cat can run, and what it can knock over (set by the app) */
  ground: {
    keepClear: (p: THREE.Vector3, r: number) => THREE.Vector3;
    detour: (from: THREE.Vector3, to: THREE.Vector3, r: number) => THREE.Vector3 | null;
    books: THREE.Vector3;
    bump: (at: THREE.Vector3, k: number) => void;
    batLure: (v: THREE.Vector3) => void;
    pinLure: (sec: number, at: THREE.Vector3) => void;
    mouse: () => { p: THREE.Vector3; state: 'floor' | 'mouth' | 'air'; moving: boolean; under?: boolean } | null;
    hookMouse: (toward: THREE.Vector3) => void;
    carry: (at: THREE.Vector3 | null, yaw?: number) => void;
  } | null = null;
  /** the feathers of the wand (set by the app): dangled by a hand, a moment's watching and it has
   *  to have them; after a long game, a while before it will play again */
  wand: Lure | null = null;
  private wandT = 0;
  private wandNeed = 0.5;
  private teaseRest = 0;
  /** how strong the sun in the room is (set by the app): asleep in it, a cat draws a paw over its
   *  eyes */
  glare = 0;
  private chatterIn = 2;
  private lureT = 0;
  private lureNeed = 0.8;
  private playRest = 0;
  /** the windowsill to sit on */
  sillSpot: (() => SillSpot) | null = null;
  /** a cardboard box on the floor, when one is out */
  boxSpot: (() => SillSpot | null) | null = null;
  /** how hard it is raining outside */
  set rain(r: number) {
    this.ctx.rain = r;
  }
  /** how dark it is outside */
  set night(n: number) {
    this.ctx.night = n;
  }
  /** snow falling outside */
  set snow(s: boolean) {
    this.ctx.snow = s;
  }
  /** what goes by outside the window, and the chirp it gets */
  outside: {
    birds: () => THREE.Vector3 | null; chirp: () => void; sound: (name: string, gain: number) => void;
    /** a moth or a fly in the room, and a swipe that sends it off */
    bug?: () => { p: THREE.Vector3; resting: boolean } | null; scareBug?: (from: THREE.Vector3) => void;
    /** one raindrop running down the glass (the one the cat is after), or none */
    drop?: (p: THREE.Vector3 | null) => void;
    /** the pencil (its middle, and whether it is still on the sill), and a paw pushing it along */
    pencil?: () => { at: THREE.Vector3; onSill: boolean }; pushPencil?: (dz: number, dx: number) => void;
    /** the mug of tea (the middle of its foot, and whether it is still on the sill), and a paw
     *  pushing it along */
    mug?: () => { at: THREE.Vector3; onSill: boolean }; pushMug?: (dz: number, dx: number) => void;
  } | null = null;
  /** after a hunt, a while before the next */
  private huntRest = 0;
  /** a finger moving on the glass: where (GlassFinger), when it was last seen and since when it
   *  has been there; and how long before another game with it */
  private glassFinger: (GlassFinger & { last: number; since: number; moved: number; from: THREE.Vector3 }) | null = null;
  private clock = 0;
  private pawRest = 0;
  /** fingers on the cat now (screen points, set by the app), and what is under one: a bone of
   *  the body and the point on it */
  hands: { sx: number; sy: number }[] = [];
  /** how long since the last hand left it, and whether it has turned its back on you since it
   *  was last annoyed */
  private sinceHands = 0;
  private snubbed = false;
  feel: ((sx: number, sy: number) => { bone: string; point: THREE.Vector3 } | null) | null = null;
  private rub = 0;
  /** a hand held still: since when, and where (screen px); what it licks (null: nothing), and a
   *  while before it licks a hand again */
  private still = { t: 0, sx: 0, sy: 0 };
  private lickAt: THREE.Vector3 | null = null;
  private lickRest = 15;
  /** the tip of its tongue left out (how long yet), and how far out it is now; and whether it
   *  sleeps this nap with it out (decided as it goes deep: now and then) */
  private blepFor = 0;
  private napBlep: boolean | null = null;
  /** the radio playing (set by the app); keeping time with it now and then, the tail tip to the
   *  beat: how far into it (0 .. 1, read by the app), how long it goes on yet, how long till next */
  music = false;
  groove = 0;
  private grooveFor = 0;
  private grooveIn = 15 + Math.random() * 30;
  /** after eating: a wash of the face before it goes */
  private washAfter: Act | null = null;
  private rubSide = 1;
  private readonly eyesAt = new THREE.Vector3();

  /** where a hand is on it, its body answers: the cheek or the head rubbed into it, the chin
   *  lifted to a scratch, the rump and tail raised to a stroke at the base of the tail; the
   *  happier it is under the hand, the more */
  private leanIntoHand(dt: number) {
    const m = this.cat.motor, T = m.petTarget;
    T.roll = T.yaw = T.pitch = T.rump = 0;
    const h = this.hands[0];
    const keen = !this.alive || this.sleep > 0.5 ? 0 : this.mode === 'enjoy' ? 1 : this.mode === 'rest' || this.mode === 'alert' ? 0.45 : 0;
    if (!h || keen <= 0 || !this.feel) return;
    const hit = this.feel(h.sx, h.sy);
    if (!hit) return;
    this.rub += dt;
    const b = hit.bone;
    // where on the head the hand is, from between the eyes: which side (+ the cat's left; near the
    // middle, the side it was), and whether it is under the chin
    this.cat.group.updateMatrixWorld(true);
    const E = this.cat.body.eyes(this.eyesAt).applyMatrix4(this.cat.group.matrixWorld);
    const lx = (hit.point.x - E.x) * Math.cos(m.yaw) - (hit.point.z - E.z) * Math.sin(m.yaw);
    if (Math.abs(lx) > 0.008) this.rubSide = Math.sign(lx);
    const side = this.rubSide;
    const chin = b === 'jaw' || (b === 'head' && hit.point.y < E.y - 0.02);
    const rubbing = 0.08 * Math.sin(this.rub * 5);
    if (chin) { T.pitch = 0.35 * keen; T.roll = side * 0.08 * keen; }
    else if (b === 'head' || b.startsWith('ear')) { T.roll = side * (0.3 + rubbing) * keen; T.yaw = side * 0.22 * keen; }
    else if (b === 'neck1' || b === 'neck2') { T.pitch = 0.2 * keen; T.roll = side * 0.15 * keen; }
    else if (b === 'hips' || b === 'tail0' || b === 'tail1') T.rump = keen;
  }

  /**
   * A hand held still on its head (or its cheek, under its chin) while it is in bliss under it,
   * from a cat that trusts you: it turns its face up to the hand and licks it, a few rough licks
   * of the tongue, the eyes half shut, and is done; now and then, not every time.
   */
  private lickHand(dt: number) {
    const m = this.cat.motor, S = this.still, h = this.hands[0];
    this.lickRest = Math.max(0, this.lickRest - dt);
    if (this.lickAt) {
      if (m.licking) { m.lookAt(this.lickAt, 1); return; }
      this.lickAt = null;
      m.lookAt(null);
    }
    if (!h) { S.t = 0; return; }
    if (Math.hypot(h.sx - S.sx, h.sy - S.sy) > 8) { S.t = 0; S.sx = h.sx; S.sy = h.sy; return; }
    S.t += dt;
    // (treading the bed with its forepaws as it purrs is no bar to it)
    if (S.t < 1.6 || this.mode !== 'enjoy' || this.mood.trust < 0.55 || this.lickRest > 0 || (this.act && this.act.name !== 'knead') || this.errand || this.trip
      || !this.alive || this.sleep > 0.3 || !this.feel || Math.random() > dt * 1.2) return;
    const hit = this.feel(h.sx, h.sy);
    if (!hit || !/^(head|jaw|neck|ear)/.test(hit.bone)) return;
    // (the hand is on this side of the glass: the face goes up and out to it, not to the spot on
    // its own head)
    this.cat.group.updateMatrixWorld(true);
    const E = this.cat.body.eyes(this.eyesAt).applyMatrix4(this.cat.group.matrixWorld);
    const toYou = this.ctx.viewer().sub(E).normalize();
    this.lickAt = hit.point.clone().addScaledVector(toYou, 0.09).setY(Math.max(hit.point.y, E.y) + 0.02);
    m.lick(3 + Math.floor(Math.random() * 3));
    this.lickRest = 25 + Math.random() * 25;
    // (and after, as often as not, the tip of the tongue forgotten out a moment)
    if (Math.random() < 0.35) this.blepFor = -(1.8 + Math.random());
  }

  /** a blep: after a lick or a wash, now and then the tip of the tongue stays out a few seconds,
   *  forgotten there, until something else takes its mind */
  private blepNow(dt: number) {
    const m = this.cat.motor;
    // (a negative time: waiting to start, after the licks)
    if (this.blepFor < 0) {
      this.blepFor = m.licking ? this.blepFor : Math.min(0, this.blepFor + dt);
      if (this.blepFor === 0) this.blepFor = 2.5 + Math.random() * 4;
    } else this.blepFor = Math.max(0, this.blepFor - dt);
    // (asleep, deep: now and then a nap with the tip of the tongue out the whole while)
    if (this.sleep < 0.3) this.napBlep = null;
    else if (this.napBlep === null && this.sleep > 0.8) this.napBlep = Math.random() < 0.1;
    const on = (this.blepFor > 0 || (!!this.napBlep && this.sleep > 0.6)) && !m.licking && this.alive && !m.hissNow;
    m.blep += ((on ? 1 : 0) - m.blep) * Math.min(1, dt * (on ? 3 : 8));
  }

  /** the radio on, awake and at its ease, lying or sat where it is: now and then, for a few bars,
   *  the tip of its tail flicks in time with the beat; then it forgets to */
  private keepTime(dt: number) {
    const m = this.cat.motor;
    const easy = this.music && this.alive && !this.isHidden && this.sleep < 0.2 && (this.mode === 'rest' || this.mode === 'enjoy')
      && (!this.act || this.act.name === 'knead') && !this.errand && !this.trip && m.speed < 0.05 && !m.goal
      && (m.targetPosture === 'loaf' || m.targetPosture === 'sit' || m.targetPosture === 'sphinx');
    if (this.grooveFor > 0) {
      this.grooveFor = easy ? Math.max(0, this.grooveFor - dt) : 0;
      if (this.grooveFor === 0) this.grooveIn = 30 + Math.random() * 60;
    } else if (easy && (this.grooveIn -= dt) <= 0) this.grooveFor = 6 + Math.random() * 10;
    this.groove += ((this.grooveFor > 0 ? 1 : 0) - this.groove) * Math.min(1, dt * 1.5);
  }

  /** after a wash (and, by the app, a lick of the nose), now and then a blep */
  maybeBlep(p = 0.15) {
    if (this.blepFor === 0 && Math.random() < p) this.blepFor = -(0.6 + Math.random());
  }

  /** a sound it turned to: where, for how much longer it looks, and whether (and which way) it
   *  tips its head to it */
  private heard: { at: THREE.Vector3; t: number; tilt: number } | null = null;
  private puzzle = () => (Math.random() < 0.4 ? (Math.random() < 0.5 ? -1 : 1) * (0.3 + 0.15 * Math.random()) : 0);
  /** a tap on the glass it cannot make out: the head tipped to one side (which way, how long yet) */
  private puzzledTilt = 0;
  private puzzledFor = 0;
  puzzled() {
    if (this.sleep > 0.3 || this.act) return;
    this.puzzledTilt = this.puzzle() || (Math.random() < 0.5 ? -0.36 : 0.36);
    this.puzzledFor = 1.4 + Math.random();
  }

  /** a sound somewhere in the room or outside: an ear goes to it, and an idle cat awake glances
   *  that way a moment */
  hear(at: THREE.Vector3) {
    if (!this.alive || this.isHidden) return;
    if (this.sleep > 0.5) {
      if (Math.random() < 0.4) this.cat.motor.flickEar(Math.random() < 0.5 ? 'L' : 'R', 0.5);
      return;
    }
    this.cat.motor.flickEar('both', 0.6);
    if (!this.act && !this.errand && !this.trip && Math.random() < 0.6) this.heard = { at: at.clone(), t: 0.9 + Math.random() * 0.8, tilt: this.puzzle() };
  }
  /** something seen out of the corner of its eye (a shooting star going down the window): awake
   *  and idle, the ears go up and it looks */
  see(at: THREE.Vector3) {
    if (!this.alive || this.isHidden || this.sleep > 0.5) return;
    this.cat.motor.flickEar('both', 0.4);
    if (!this.act && !this.errand && !this.trip) this.heard = { at: at.clone(), t: 1.3 + Math.random() * 0.8, tilt: this.puzzle() };
  }
  /** a crash in the room (the mug in pieces on the floor): it starts at it, asleep or awake;
   *  awake and about, it is off from it at a scramble, and then has a look (up on the sill or in
   *  the box, it only stares). True if it was up on the sill (or in the box): its own doing */
  crash(at: THREE.Vector3) {
    if (!this.alive || this.isHidden) return false;
    this.cat.motor.jolt(1.3);
    this.cat.motor.flickEar('both', 1.2);
    if (this.sleep > 0.3 || this.errand || this.trip) return false;
    // (up on the sill, most likely it was the one that sent it over: it only starts, and looks)
    if (this.perched) { this.see(at); return true; }
    this.stopAct();
    this.act = new Startle(this.ctx, at);
    // (and no games for a little while after)
    this.chaseRest = Math.max(this.chaseRest, 8);
    this.teaseRest = Math.max(this.teaseRest, 8);
    return false;
  }

  /** you are back after a while away, and it is awake: hello (glad: how glad, 0 .. 1). Its own
   *  master, it comes up to the glass to you; up on the sill or in the box, or in the middle of a
   *  game, it looks round at you from where it is */
  greet(glad: number) {
    if (!this.alive || this.isHidden || this.sleep > 0.3 || this.errand || this.trip) return;
    if (this.perched || this.act instanceof Chase || this.act instanceof Tease || this.act instanceof Startle || this.act instanceof Play || this.act instanceof Hunt) {
      this.perk(this.ctx.viewer(), 0);
      return;
    }
    this.stopAct();
    // (gladdest, now and then it fetches you its toy mouse by way of a hello)
    const M = this.ground?.mouse();
    const far = M && M.state === 'floor' && Math.hypot(M.p.x - this.ctx.window.x, M.p.z - this.ctx.window.z) > 0.3;
    this.act = far && glad > 0.7 && Math.random() < 0.25 ? new Gift() : new Greet(glad);
  }

  /** back after long, and it has been waiting for you at the glass all the while: found sat there
   *  looking out for you, and there you are (Greet, from where it sits) */
  waited(glad: number) {
    if (!this.alive || this.isHidden || this.errand || this.trip || this.perched) { this.greet(glad); return; }
    this.stopAct();
    const w = this.ctx.window;
    this.cat.place(w.x + (Math.random() - 0.5) * 0.08, w.z + 0.02, (Math.random() < 0.5 ? -1 : 1) * (0.25 + 0.2 * Math.random()));
    this.cat.snap('sit');
    this.act = new Greet(glad, true);
  }

  /** a boop on the nose: the face screwed up, a lick of the nose, a shake of the head (not in the
   *  middle of a game, a hunt or a fright, nor up on something or on its way somewhere) */
  booped() {
    if (!this.alive || this.isHidden || this.sleep > 0.3 || this.errand || this.trip || this.perched) return false;
    if (this.act instanceof Chase || this.act instanceof Tease || this.act instanceof Startle || this.act instanceof Play || this.act instanceof Hunt
      || this.act instanceof Zoomies || this.act instanceof PawGlass || this.act instanceof TailChase) return false;
    this.stopAct();
    this.act = boop();
    return true;
  }

  /** hungry or thirsty, the bowl empty: it goes and asks you at the bowl (true if it does: awake,
   *  its own master, not up on something or in a game or on its way somewhere) */
  beg(what: 'food' | 'water', urgent: boolean, empty: () => boolean) {
    if (!this.alive || this.isHidden || this.sleep > 0.3 || this.errand || this.trip || this.perched || !this.spots) return false;
    if (this.mode !== 'rest' && this.mode !== 'alert') return false;
    if (this.hands.length || this.act instanceof Chase || this.act instanceof Tease || this.act instanceof Startle || this.act instanceof Play
      || this.act instanceof Hunt || this.act instanceof Greet || this.act instanceof Gift || this.act instanceof Beg) return false;
    this.stopAct();
    this.act = new Beg((what === 'food' ? this.spots.food : this.spots.water).clone(), urgent, empty);
    return true;
  }

  /** a finger on the glass, where the cat sees it (GlassFinger): told each frame it is there, and
   *  as it moves */
  fingerOnGlass(at: THREE.Vector3) {
    const F = this.glassFinger;
    if (!F || this.clock - F.last > 0.5) this.glassFinger = { at: at.clone(), still: 0, last: this.clock, since: this.clock, moved: this.clock, from: at.clone() };
    else {
      F.at.copy(at);
      F.last = this.clock;
      // (moved: more than a finger's tremble from where it was last still)
      if (F.from.distanceTo(at) > 0.01) { F.moved = this.clock; F.from.copy(at); }
    }
  }
  /** at the glass asking you for a game just now */
  get asking() {
    return this.act instanceof PawGlass && this.act.asking;
  }
  /** a tap on the glass: caught at whatever it was up to on the sill (true if it was up to
   *  something there) */
  caught() {
    return this.act instanceof Sill && this.act.caught();
  }
  /** a paw patted at the glass this frame: which (null: none) */
  get pawLanded() {
    return this.act instanceof PawGlass ? this.act.landed : null;
  }
  /** its cheek rubbed on the glass this frame, where your finger is */
  get nuzzled() {
    return this.act instanceof PawGlass && this.act.nuzzled;
  }
  /** its breath on the glass since last asked: where its nose was (null: none) */
  private breath: THREE.Vector3 | null = null;
  takeBreath() {
    const b = this.breath;
    this.breath = null;
    return b;
  }
  /** the finger on the glass now (null: gone) */
  private fingerNow(): GlassFinger | null {
    const F = this.glassFinger;
    if (!F || this.clock - F.last > 0.25) return null;
    F.still = this.clock - F.moved;
    return F;
  }

  /** where its mouth is (between the lips, under the nose), in the room */
  private readonly mouthW = new THREE.Vector3();
  mouthAt() {
    const head = this.cat.byName.get('head');
    if (!head) return this.mouthW.copy(this.cat.motor.pos).setY(0.15);
    head.updateWorldMatrix(true, false);
    return this.mouthW.set(0, -0.016, 0.05).applyMatrix4(head.matrixWorld);
  }

  /** its toy mouse thrown (where it is going): awake, its own master, and fond enough of you, it is
   *  after it (and now and then brings it back to you); else its eyes go after it */
  /** the lamp put out: a cat awake and not settled, now and then, takes the dark for its own and
   *  has a mad few minutes round the room (a moment after, its eyes shining as it goes) */
  lightsOut() {
    if (!this.alive || this.isHidden || this.sleep > 0.3 || this.errand || this.trip || this.perched || this.act || this.hands.length) return false;
    if (this.mode !== 'rest' && this.mode !== 'alert') return false;
    if (Math.random() > 0.15 + 0.35 * Math.max(0, this.mood.arousal) + 0.15 * (1 - this.mood.sleepy)) return false;
    this.lightsOutIn = 0.8 + Math.random() * 1.5;
    return true;
  }
  private lightsOutIn = 0;

  /** you here a long while but busy (the room open, the radio on, nobody touching it): it comes
   *  to the glass and asks for a moment of you, as a cat walks over the keyboard; no answer, and
   *  it lies down by the glass, as near you as it can get (true if it will; 1 on its way to ask,
   *  2 asking) */
  private nudge = 0;
  nudgeNow() {
    if (!this.alive || this.isHidden || this.errand || this.trip || this.hands.length || this.nudge) return false;
    if (this.mood.trust < 0.3 || this.sleep > 0.75) return false;
    this.nudge = 1;
    // (whatever it is at, it leaves off: up on the sill or in the box, it is asked down first)
    if (this.act) this.stopAct();
    return true;
  }

  /** the lamp put on in the dark: asleep, it stirs, its ears flick, an eye opens a slit against
   *  the light (and shuts again), and, curled up, a paw comes up over its eyes and stays there a
   *  good while; awake, a blink or two at it */
  lightsOn() {
    if (!this.alive || this.isHidden) return;
    const m = this.cat.motor;
    if (this.sleep > 0.5) {
      this.dazzle = 1.8;
      this.dazzled = 25 + Math.random() * 45;
      if (!this.shade.on) this.shade.in = Math.min(this.shade.in, 1.2 + Math.random() * 0.8);
      m.jolt(0.12);
      m.flickEar('both', 0.6);
      if (Math.random() < 0.5) this.cat.sigh();
    } else {
      m.flickEar('both', 0.4);
      m.blinkNow();
    }
  }
  /** how long since the lamp came on in its eyes (the slit of an eye), and how long it will keep
   *  them shaded from it */
  private dazzle = 0;
  private dazzled = 0;

  fetchNow() {
    const M = this.ground?.mouse();
    if (!M || !this.alive || this.isHidden || this.sleep > 0.3 || this.errand || this.trip || this.perched) return false;
    if (this.mode !== 'rest' && this.mode !== 'alert') return false;
    if (this.act instanceof Chase || this.act instanceof Tease || this.act instanceof Startle || this.act instanceof Gift || this.mood.sleepy > 0.6) return false;
    this.perk(M.p, 0.2);
    if (Math.random() > 0.35 + 0.6 * Math.max(0, this.mood.trust)) return false;
    this.stopAct();
    // (in under the radiator: a paw in after it first)
    this.act = M.under ? new Fish() : new Gift(true);
    return true;
  }

  /** the hands gone, it puts its coat to rights where they were: a paw licked and drawn over the
   *  face, a lick or two down the chest, or at the flank (not up on something, nor busy with
   *  something of its own) */
  tidy(where: 'face' | 'flank' | 'chest') {
    if (!this.alive || this.isHidden || this.sleep > 0.3 || this.errand || this.trip || this.perched || this.hands.length) return;
    if (this.act && this.act.name !== 'knead') return;
    this.stopAct();
    this.act = this.tidying = where === 'face' ? washFace() : where === 'chest' ? groomChest() : groomFlank();
  }
  /** a tidy-up of the coat under way (it carries on in the minute or so the hands' pleasure
   *  lingers, as long as none come back) */
  private tidying: Act | null = null;

  /** one of its toys taken up (where it is): awake, it knows what that means: the ears go up and
   *  its eyes to it, and now and then a little trill of it */
  perk(at: THREE.Vector3, keen = 0.5) {
    if (!this.alive || this.isHidden || this.sleep > 0.5) return;
    this.cat.motor.flickEar('both', 0.5);
    if (!this.act && !this.errand && !this.trip) this.heard = { at: at.clone(), t: 1.6 + Math.random() * 0.8, tilt: 0 };
    if (Math.random() < keen) {
      const k = Math.random() < 0.6 ? 'trill' : 'chirp';
      this.outside?.sound(k, 0.5);
      this.vocalize(k, k === 'trill' ? 0.29 : 0.11, 0.2);
    }
  }

  /** thunder (loud 0 .. 1): it looks to the window; awake, a near clap may send it to cover, into
   *  the box if it is out, or to its bed */
  thunder(loud: number, at: THREE.Vector3) {
    if (!this.alive || this.isHidden) return;
    this.hear(at);
    if (loud < 0.75 || this.sleep > 0.3 || this.perched || this.errand || this.trip || Math.random() < 0.5) return;
    // (by you already: it stays by you, only starts)
    if (this.act && (this.act.name === 'box' || this.act.name === 'to bed' || this.act.name === 'by you')) return;
    this.stopAct();
    const box = this.boxSpot?.();
    this.act = box ? new Box(box) : toBed(this.ctx, 'loaf');
    // and a while after, a cat that trusts you, the storm still going, comes out to be near you
    if (this.mood.trust > 0.45) this.comfortIn = 10 + Math.random() * 15;
  }
  /** taken cover from the thunder: how long till it comes out to lie by you instead */
  private comfortIn = 0;

  /** something to do once it is down off the sill (asked to go somewhere while up there) */
  private afterPerch: (() => void) | null = null;

  /** up on the sill or in the box (or jumping to or from them): it has to come out before anything
   *  else */
  private get perched() {
    return isPerching(this.act) && this.act.up;
  }
  private fading: { t: number; dur: number; onDone?: () => void } | null = null;
  private readonly look = new THREE.Vector3();
  /** the brain's mode and the cat's feelings (set by the app each frame) */
  mode = 'sleep';
  mood: Mood = { ...NEUTRAL };
  /** what it is doing of its own accord (behave.ts), and when to think of something else */
  private act: Act | null = null;
  private nextActIn = 6;
  private dreamIn = 20;
  private scoot: { t: number; dx: number; dz: number; len: number } | null = null;
  private scootIn = 0.4;
  private rest: PoseName = 'loaf';
  private readonly ctx: Ctx;

  constructor(
    private readonly cat: Cat3D,
    /** where it lives: the bed by the window */
    readonly home: Spot,
    /** how far to either side is out of sight (metres from the middle of the room) */
    private readonly offstage: number,
    /** a point in the room under a screen position (css px), for looking at a finger */
    private readonly screenToWorld: (sx: number, sy: number, out: THREE.Vector3) => THREE.Vector3 | null,
    /** the viewer's eye: the camera */
    private readonly viewer: () => THREE.Vector3,
  ) {
    cat.place(home.x, home.z, home.yaw);
    const h = new THREE.Vector3(home.x, 0, home.z);
    this.ctx = {
      m: cat.motor, home: h, window: new THREE.Vector3(home.x, 0, home.z + 0.2),
      room: { minX: home.x - 0.22, maxX: home.x + 0.22, minZ: home.z - 0.3, maxZ: home.z + 0.2 },
      mode: this.mode, mood: this.mood, kneading: false,
      bed: (p) => this.bedSpot(p),
      rain: 0,
      snow: false,
      night: 0,
      sniff: () => this.spots?.sniff ?? [],
      posts: () => this.spots?.posts ?? [],
      scratcher: () => this.spots?.scratcher ?? null,
      visitor: () => this.visitor,
      sun: () => this.sunSpot?.() ?? null,
      clear: (p, r) => this.floorClear?.(p, r) ?? true,
      sunlit: (p) => this.sunlitAt?.(p) ?? false,
      warm: () => this.warmSpot?.() ?? null,
      lieAt: (p, at, face) => this.lieAt(p, at, face),
      yarn: () => this.toys?.yarn() ?? null,
      kick: (dir, speed) => this.toys?.kick(dir, speed),
      toyHeld: () => this.toys?.held() ?? false,
      pin: (sec, at) => this.toys?.pin(sec, at),
      toyPinned: () => this.toys?.pinned() ?? false,
      sill: () => this.sillSpot?.() ?? null,
      box: () => this.boxSpot?.() ?? null,
      birds: () => this.outside?.birds() ?? null,
      sound: (name, gain) => this.outside?.sound(name, gain),
      say: (kind) => {
        this.outside?.sound(kind, 0.55);
        this.vocalize(kind, { trill: 0.29, meow: 0.65, meowSoft: 0.44, meowPlead: 0.92, chirp: 0.11 }[kind], 0);
      },
      chirp: () => this.outside?.chirp(),
      bug: () => this.outside?.bug?.() ?? null,
      scareBug: (from) => this.outside?.scareBug?.(from),
      drop: (p) => this.outside?.drop?.(p),
      pencil: () => this.outside?.pencil?.() ?? null,
      pushPencil: (dz, dx) => this.outside?.pushPencil?.(dz, dx),
      mug: () => this.outside?.mug?.() ?? null,
      pushMug: (dz, dx) => this.outside?.pushMug?.(dz, dx),
      viewer: () => this.viewer(),
      laser: () => this.laser,
      keepClear: (p, r) => this.ground?.keepClear(p, r) ?? p,
      detour: (from, to, r) => this.ground?.detour(from, to, r) ?? null,
      books: () => this.ground?.books ?? new THREE.Vector3(9, 0, 9),
      bump: (at, k) => this.ground?.bump(at, k),
      lure: () => this.wand,
      batLure: (v) => this.ground?.batLure(v),
      pinLure: (sec, at) => this.ground?.pinLure(sec, at),
      perch: (h) => { this.cat.perch = h; },
      hold: (y) => { this.cat.liftHold = y; },
      blink: (slow) => this.doBlink(slow),
      mouse: () => this.ground?.mouse() ?? null,
      hookMouse: (toward) => this.ground?.hookMouse(toward),
      carry: (at, yaw) => this.ground?.carry(at, yaw),
      mouthAt: () => this.mouthAt(),
      finger: () => this.fingerNow(),
      breathe: (at) => { this.breath = at.clone(); },
    };
  }

  /** straight into the posture the brain wants, no getting there (opening the app) */
  settle() {
    // (straight into bed, from wherever it was, the sill included)
    if (this.act) this.act.stop(this.ctx);
    this.act = null;
    this.cat.perch = null;
    this.cat.liftHold = null;
    this.afterPerch = null;
    const p = this.wanted();
    const b = this.bedSpot(p);
    this.cat.place(b.to.x, b.to.z, b.yaw);
    this.cat.snap(p);
  }

  /**
   * Where to stand, and which way to face, so that lying down in posture p puts the body (not the
   * spot it stood on) in the middle of the bed with the face toward the window: curling up, a cat
   * ends nose to tail, so it lies down facing the wall. Lying or sitting up, it settles side on
   * (SIDE_TURN), whichever way round is the nearer to the way it faces now: it lies down the way it
   * came in, and shifting from a loaf to sitting up it stays the way round it was.
   */
  bedSpot(p: PoseName) {
    // (on its back: across the bed with its belly to you, the head turned over toward you)
    // (the body's own way round, whichever way its head is turned over)
    if (p === 'back') return this.lieAt(p, this.home, this.home.yaw + 1.4 + this.cat.footprint(p).face);
    const turn = SIDE_TURN[p];
    if (!turn) return this.lieAt(p, this.home, this.home.yaw);
    const a = this.lieAt(p, this.home, this.home.yaw + turn), b = this.lieAt(p, this.home, this.home.yaw - turn);
    const y = this.cat.motor.yaw;
    return Math.abs(wrap(a.yaw - y)) <= Math.abs(wrap(b.yaw - y)) ? a : b;
  }

  /** where to stand and which way to turn so that lying down in posture p puts the middle of the
   *  body at a point, the face turned to `face` */
  lieAt(p: PoseName, at: { x: number; z: number }, face: number) {
    const f = this.cat.footprint(p);
    const yaw = wrap(face - f.face);
    const s = Math.sin(yaw), c = Math.cos(yaw);
    return { to: new THREE.Vector3(at.x - (f.x * c + f.z * s), 0, at.z + f.x * s - f.z * c), yaw };
  }

  /**
   * Lie (or sit) in posture p on the bed. Lying the wrong way round for it (asleep curled toward
   * the wall, then woken; or settling deeper from a loaf into a curl) it first gets up, turns round
   * once and lies down again, unless a hand is on it; otherwise it shuffles and turns a little into
   * the middle of the bed.
   */
  private lieIn(p: PoseName, atHome: boolean, dt: number) {
    const m = this.cat.motor;
    const b = this.bedSpot(p);
    const e = wrap(b.yaw - m.yaw);
    if (atHome && !this.touched && Math.abs(e) > 0.8) {
      this.act = toBed(this.ctx, p);
      this.act.update(dt, this.ctx);
      return;
    }
    m.setPosture(p);
    // (not shuffled about under a hand)
    if (!atHome || m.goal || !LYING.includes(m.targetPosture) || this.hands.length) return;
    // into the middle of the bed in little scoots, not a glide: now and then a quick shift of a
    // few centimetres
    const dx = b.to.x - m.pos.x, dz = b.to.z - m.pos.z, d = Math.hypot(dx, dz);
    if (this.scoot) {
      const sc = this.scoot;
      sc.t += dt;
      const u = Math.min(1, sc.t / 0.3), du = Math.min(1, (sc.t - dt) / 0.3);
      const ease = (x: number) => x * x * (3 - 2 * x);
      const k = (ease(u) - ease(Math.max(0, du))) * sc.len;
      m.pos.x += sc.dx * k;
      m.pos.z += sc.dz * k;
      if (u >= 1) this.scoot = null;
    } else if (d > 0.012 && d < 0.3 && (this.scootIn -= dt) <= 0) {
      this.scootIn = 0.7 + Math.random() * 0.6;
      this.scoot = { t: 0, dx: dx / d, dz: dz / d, len: Math.min(d, 0.035) };
    }
    if (Math.abs(e) <= 0.8) m.yaw = wrap(m.yaw + Math.max(-0.3 * dt, Math.min(0.3 * dt, e)));
  }

  /** what it is doing of its own accord, if anything */
  get doing() {
    return this.act?.name ?? null;
  }

  /** a present just laid at your feet (the toy mouse, the cat sat by it looking at you) */
  get presenting() {
    return this.act instanceof Gift && this.act.phase === 'show';
  }

  /** start one of its acts now (for the lab and tests) */
  startAct(name: 'yawn' | 'groom' | 'groom chest' | 'wash' | 'stretch' | 'window' | 'wander' | 'knead' | 'bed' | 'sun' | 'play' | 'sill' | 'box' | 'zoomies' | 'warm' | 'sneeze' | 'stare' | 'rub' | 'scratch' | 'greet' | 'gift' | 'ask' | 'tail' | 'by you' | 'claw' | 'top' | 'fish') {
    // (not on its way somewhere, to the bowls or out of the room: the walk there is its business)
    if (this.perched || this.trip) return;
    this.stopAct();
    const c = this.ctx;
    this.act = name === 'yawn' ? yawn() : name === 'groom' ? groomFlank() : name === 'groom chest' ? groomChest() : name === 'wash' ? washFace()
      : name === 'stretch' ? stretchSideOn(c, 'loaf') : name === 'window' ? toWindow(c) : name === 'wander' ? wander(c)
        : name === 'knead' ? knead() : name === 'sun' ? sunbathe(c) : name === 'play' ? new Play()
          : name === 'sill' && this.sillSpot ? new Sill(this.sillSpot())
            : name === 'box' && this.boxSpot?.() ? new Box(this.boxSpot()!) : name === 'zoomies' ? new Zoomies(c) : name === 'warm' ? warmUp(c) ?? toBed(c, 'loaf') : name === 'sneeze' ? sneeze(c) : name === 'stare' ? new Stare(c)
              : name === 'rub' && c.posts().length ? new Rub(c, c.posts()[0]) : name === 'scratch' ? scratchEar() : name === 'greet' ? new Greet(0.9) : name === 'gift' ? new Gift() : name === 'ask' ? new PawGlass(c.finger, true) : name === 'tail' ? new TailChase() : name === 'by you' ? byYou(c) : name === 'claw' && c.scratcher() ? new Claw(c.scratcher()!) : name === 'top' && c.scratcher() ? new Top(c.scratcher()!) : name === 'fish' && c.mouse()?.under ? new Fish() : toBed(c, 'loaf');
  }

  /** the red dot of a laser pointer: awake and its own master, it drops what it was doing and is
   *  after it (up on the sill with the dot up there too, after it there; in the box, out first) */
  chaseNow() {
    if (!this.alive || this.sleep > 0.3 || this.errand || this.trip || this.hidden || this.chaseRest > 0 || !this.laser) return false;
    if (this.mode !== 'rest' && this.mode !== 'alert') return false;
    // (not while it is getting over a fright)
    if (this.mood.sleepy > 0.75 || this.act instanceof Chase || this.act instanceof Startle) return false;
    if (this.act instanceof Sill && this.act.up) {
      const ph = this.act.phase;
      if (this.laser.on === 'sill' && (ph === 'settle' || ph === 'sit' || ph === 'nap' || ph === 'about' || ph === 'knock')) {
        this.act.stop(this.ctx);
        this.act = new Chase(this.ctx, true);
        return true;
      }
    }
    if (this.perched) {
      if (!this.afterPerch) {
        this.afterPerch = () => { this.chaseNow(); };
        (this.act as Perching).leave();
      }
      return false;
    }
    this.stopAct();
    this.act = new Chase(this.ctx);
    return true;
  }

  /** feathers dangled before it: awake and its own master, it drops what it was doing for them */
  teaseNow() {
    if (!this.alive || this.sleep > 0.3 || this.errand || this.trip || this.hidden || this.teaseRest > 0 || !this.wand) return false;
    if (this.mode !== 'rest' && this.mode !== 'alert') return false;
    if (this.mood.sleepy > 0.75 || this.act instanceof Tease || this.act instanceof Startle || (this.act instanceof Chase && this.laser)) return false;
    if (this.perched) {
      if (!this.afterPerch) {
        this.afterPerch = () => { this.teaseNow(); };
        (this.act as Perching).leave();
      }
      return false;
    }
    this.stopAct();
    this.act = new Tease();
    return true;
  }

  /** something to chase: awake and its own master, it drops what it was doing and plays */
  playNow() {
    if (!this.alive || this.sleep > 0.3 || this.errand || this.trip || this.hidden || this.perched || this.playRest > 0) return false;
    // (not while it is after the red dot, or the feathers, or getting over a fright)
    if ((this.act instanceof Chase && this.laser) || (this.act instanceof Tease && this.wand?.held) || this.act instanceof Startle) return false;
    if (this.mode !== 'rest' && this.mode !== 'alert') return false;
    if (this.act?.name === 'play') return true;
    if (this.mood.sleepy > 0.6) return false;
    this.stopAct();
    this.act = new Play();
    return true;
  }

  private stopAct() {
    if (!this.act) return;
    // up on the sill or in the box it is not simply dropped: it is asked out, and carries on until
    // it is
    if (isPerching(this.act) && this.act.up) {
      this.act.leave();
      return;
    }
    this.act.stop(this.ctx);
    this.act = this.tidying = null;
  }

  /** the cat's own business: the brain's state decides what is allowed (asleep: back to bed
   *  first; being handled: stay put, kneading if it is happy; at rest: things of its own) */
  private behave(dt: number) {
    const m = this.cat.motor, c = this.ctx;
    c.mode = this.mode;
    c.mood = this.mood;
    c.kneading = this.kneading;
    // at home: on the bed, wherever on it the body has settled
    const atHome = Math.hypot(m.pos.x - c.home.x, m.pos.z - c.home.z) < 0.2;
    // (woken in the middle of a stretch in its sleep: that is over)
    if (this.stretchT > 0 && (this.sleep <= 0.3 || !this.alive)) this.sleepStretch(0, false);
    this.waking = Math.max(0, this.waking - dt);
    this.dazzle = Math.max(0, this.dazzle - dt);
    this.dazzled = Math.max(0, this.dazzled - dt);
    this.shadeEyes(dt, this.alive && this.sleep > 0.75 && atHome && !this.touched && !this.act && this.stretchT <= 0 && (this.glare > 0.4 || this.dazzled > 0));
    if (!this.alive) {
      this.stopAct();
      m.setPosture('side');
      return;
    }
    if (this.act instanceof Sill || this.act instanceof Box || this.act instanceof Top || this.act instanceof Walk) this.act.nap = this.sleep;
    if (this.sleep > 0.3) {
      // up on the sill when sleep comes: it dozes there, against the glass; lying in the sun or by
      // the radiator, it sleeps there
      if (this.perched || (this.act instanceof Walk && this.act.canNap)) {
        if (!this.act!.update(dt, c)) this.act = null;
        return;
      }
      // otherwise sleep is taken in bed: go back to it, turn round once and settle
      if (this.act && this.act.name !== 'to bed') this.stopAct();
      if (!this.act && !atHome) this.act = toBed(c, this.wanted());
      if (this.act) {
        if (!this.act.update(dt, c)) this.act = null;
        return;
      }
      this.lieIn(this.wanted(), atHome, dt);
      // deep asleep, now and then it dreams: a twitch of a paw, the whiskers, an ear
      if (this.sleep > 0.75 && atHome && (this.dreamIn -= dt) < 0) {
        this.dreamIn = 12 + Math.random() * 40;
        // (now and then, more than a twitch: it runs in its sleep, all four paws going a while)
        if (Math.random() < 0.22) this.cat.motor.dreamRun();
        else {
          this.cat.motor.dreamTwitch();
          if (Math.random() < 0.4) setTimeout(() => this.cat.motor.dreamTwitch(), 180 + Math.random() * 200);
        }
        // (and now and then a little mew in its sleep, hardly heard, the mouth hardly moving)
        if (Math.random() < 0.18) {
          this.outside?.sound('meowSoft', 0.07);
          this.vocalize('chirp', 0.2, 0.05);
        }
      }
      this.sleepStretch(dt, this.sleep > 0.75 && atHome && !this.touched);
      this.nodOff(dt, this.sleep <= 0.75 && atHome && !this.touched && !this.act && m.posture === 'loaf' && m.targetPosture === 'loaf' && m.settled);
      return;
    }
    this.nodOff(dt, false);
    this.sinceHands = this.hands.length ? 0 : this.sinceHands + dt;
    if (this.mode !== 'annoyed' && this.mode !== 'angry') this.snubbed = false;
    if (this.mode === 'enjoy' || this.mode === 'annoyed' || this.mode === 'angry') {
      // in somebody's hands: stop and stay; tread with the front paws when it is happy there
      // (the hands gone, it may be putting its coat to rights)
      if (this.perched) { this.act!.update(dt, c); return; }
      // annoyed by them, the hands gone a moment, as often as not it turns its back on you
      if (this.mode === 'annoyed' && !this.snubbed && this.sinceHands > 1.2 && !this.act) {
        this.snubbed = true;
        if (Math.random() < 0.6) this.act = new Snub();
      }
      if (this.act instanceof Snub) {
        if (this.hands.length) this.stopAct();
        else {
          if (!this.act.update(dt, c)) this.stopAct();
          this.swatStep(dt);
          return;
        }
      }
      if (this.act && this.act === this.tidying && !this.hands.length) {
        if (!this.act.update(dt, c)) { this.act.stop(c); this.maybeBlep(0.15); this.act = this.tidying = null; }
        this.swatStep(dt);
        return;
      }
      // (a boop on the nose is seen through, though)
      if (this.act && !(this.act.name === 'knead' && this.kneading) && this.act.name !== 'boop') this.stopAct();
      if (!this.act && this.kneading) this.act = knead();
      if (this.act && !this.act.update(dt, c) && this.act.name === 'boop') { this.stopAct(); this.maybeBlep(0.3); }
      else m.setPosture(this.wanted() === 'sit' ? 'sit' : atHome ? this.rest : 'loaf');
      this.swatStep(dt);
      return;
    }
    this.swatStep(dt);
    // a hand on it: it stops for it, whatever it was about (short of a game, a hunt, the zoomies
    // or a fright; up on something, it stays up there): not walked out from under the hand
    if (this.hands.length && this.act && !this.perched
      && !(this.act instanceof Chase || this.act instanceof Tease || this.act instanceof Play || this.act instanceof Hunt || this.act instanceof Zoomies || this.act instanceof Startle)) {
      this.stopAct();
      m.stop();
    }
    // its own time: carry on with what it is doing, or now and then think of something
    if (this.act) {
      if (!this.act.update(dt, c)) {
        this.act.stop(c);
        // (asked for a moment of you and no one came: then it will be by you)
        const unanswered = this.nudge === 2 && this.act instanceof PawGlass && this.act.unanswered;
        if (this.nudge === 2) this.nudge = 0;
        // played itself out: not again for a while
        if (this.act instanceof Play) this.playRest = this.act.tired ? 60 : 6;
        if (this.act instanceof Chase) this.chaseRest = this.act.tired ? 90 : 2;
        if (this.act instanceof Tease) this.teaseRest = this.act.tired ? 60 : 2;
        if (this.act instanceof Hunt) this.huntRest = 40 + Math.random() * 60;
        // (a wash done, or the nose licked: now and then the tip of the tongue stays out)
        if (/^(wash|groom|boop)/.test(this.act.name)) this.maybeBlep(this.act.name === 'boop' ? 0.3 : 0.15);
        // (gladdest to see you, now and then off to the scratching post with it after: claws dragged
        // down it with a will, as a cat does when its people come home)
        const post = c.scratcher();
        const proud = this.act instanceof Greet && this.act.glad > 0.55 && !!post && Math.random() < 0.3;
        // (the toy mouse got out from under the radiator: after it, and it is brought to you)
        const fetch = this.act instanceof Fish && this.act.out;
        this.act = unanswered ? byYou(c) : proud ? new Claw(post!) : fetch ? new Gift(true) : null;
      }
      return;
    }
    // just awake of itself, at home in bed: a yawn and a stretch first (the paw down off its eyes
    // before anything)
    if (this.waking > 0) {
      if (this.shade.u > 0) return;
      this.waking = 0;
      if (atHome && this.mode === 'rest' && !this.touched) {
        this.act = wakeUp(c);
        return;
      }
    }
    // asking for a moment of you (nudgeNow): to the glass with it, once awake and down
    if (this.nudge === 1) {
      if (this.sleep < 0.3 && this.mode === 'rest') {
        this.nudge = 2;
        this.act = new PawGlass(() => this.fingerNow(), true);
        return;
      }
      if (this.sleep > 0.75 || !this.alive) this.nudge = 0;
    }
    // a finger moving on the glass a while: a cat in the mood comes and pats at it
    const F = this.fingerNow();
    if (F && F.still < 0.5 && this.clock - this.glassFinger!.since > 1 && this.pawRest <= 0 && this.mood.sleepy < 0.6
      && (this.mood.arousal > 0.2 || this.mood.trust > 0.3)) {
      this.pawRest = 20;
      this.act = new PawGlass(() => this.fingerNow());
      return;
    }
    // a moth or a fly about: nothing else matters for a while
    const bug = c.bug();
    if (bug && this.huntRest <= 0 && this.mood.sleepy < 0.7 && Math.hypot(bug.p.x - m.pos.x, bug.p.z - m.pos.z) < 2.2) {
      this.act = new Hunt();
      return;
    }
    this.lieIn(this.mode === 'alert' ? 'sit' : this.rest, atHome, dt);
    if (this.act) return;
    this.nextActIn -= dt;
    if (this.nextActIn < 0) {
      // (a cat at its ease mostly just sits there: something now and then, not one thing after
      // another)
      this.nextActIn = 6 + Math.random() * 12;
      this.act = chooseAct(c, atHome, m.posture);
      if (!this.act && Math.random() < 0.5) this.rest = restingPose(this.mood, this.mode);
    }
  }

  get hidden() {
    return this.isHidden;
  }

  /** which side it curls up on this time (picked afresh each time it goes off to sleep) */
  private curlPose: PoseName = Math.random() < 0.5 ? 'curl' : 'curlL';
  private deep = false;

  /** the brain's wish for a posture right now */
  private wanted(): PoseName {
    if (!this.alive) return 'side';
    // (curled up deep asleep, and a hand it trusts on it: it sleeps on more lightly, curled as it
    // was, not up into a loaf)
    if (this.sleep > 0.75 || (this.deep && this.sleep >= 0.5)) {
      if (!this.deep) {
        this.deep = true;
        // (now and then, a cat quite sure of you, belly up)
        this.curlPose = this.mood.trust > 0.7 && Math.random() < 0.18 ? 'back' : Math.random() < 0.5 ? 'curl' : 'curlL';
      }
      return this.curlPose;
    }
    if (this.sleep < 0.5) this.deep = false;
    if (this.sleep > 0.3) return 'loaf';
    if (this.headLift > 0.8) return 'sit';
    return 'loaf';
  }

  update(dt: number) {
    const m = this.cat.motor;
    // (the skin of its back twitching under a hand it has had about enough of)
    this.cat.ripple = this.alive ? this.rippleTarget : 0;
    if (this.fading) {
      this.fading.t += dt;
      if (this.fading.t >= this.fading.dur) {
        const cb = this.fading.onDone;
        this.fading = null;
        this.setHidden(true);
        cb?.();
      }
    }
    if (this.afterPerch && !this.perched) {
      const f = this.afterPerch;
      this.afterPerch = null;
      if (isPerching(this.act)) { this.act.stop(this.ctx); this.act = null; }
      f();
    }
    if (this.errand) this.doErrand(dt);
    this.leanIntoHand(dt);
    this.lickHand(dt);
    this.blepNow(dt);
    this.keepTime(dt);
    // (the lights out a moment ago, and the cat still free: off it goes)
    if (this.lightsOutIn > 0 && (this.lightsOutIn -= dt) <= 0 && !this.act && !this.hands.length && this.sleep < 0.3 && !this.perched) {
      this.act = new Zoomies(this.ctx);
    }
    this.playRest = Math.max(0, this.playRest - dt);
    this.huntRest = Math.max(0, this.huntRest - dt);
    this.pawRest = Math.max(0, this.pawRest - dt);
    this.clock += dt;
    // under cover from the storm a while: out, and over to lie by the glass, near you (out of the
    // box first if it is in it)
    if (this.comfortIn > 0 && (this.comfortIn -= dt) <= 0) {
      if (this.alive && !this.isHidden && this.ctx.rain > 0.3 && this.sleep < 0.5 && !this.errand && !this.trip && !this.hands.length
        && (this.mode === 'rest' || this.mode === 'alert')) {
        if (this.perched) {
          if (!this.afterPerch) {
            this.afterPerch = () => { this.act = byYou(this.ctx); };
            (this.act as Perching).leave();
          }
        } else {
          if (this.act) this.stopAct();
          if (!this.act) this.act = byYou(this.ctx);
        }
      }
    }
    // a glint across the floor: after it or not, as the mood takes it
    if (this.glint && !this.glintSeen) {
      this.glintSeen = true;
      const free = this.alive && !this.isHidden && this.sleep < 0.3 && !this.errand && !this.trip && !this.hands.length && !this.perched
        && (this.mode === 'rest' || this.mode === 'alert');
      this.chasingGlint = free && this.mood.sleepy < 0.5 && Math.random() < 0.2 + 0.45 * Math.max(0, this.mood.arousal);
    } else if (!this.glint) {
      this.glintSeen = false;
      this.chasingGlint = false;
    }
    // the red dot of a laser pointer: a moment's stare, and it is after it
    this.chaseRest = Math.max(0, this.chaseRest - dt);
    if (this.laser && !(this.act instanceof Chase)) {
      this.laserT += dt;
      if (this.laserT > this.laserNeed && this.chaseNow()) this.laserT = 0;
    } else {
      this.laserT = 0;
      this.laserNeed = 0.15 + Math.random() * 0.45;
    }
    // the feathers on the wand dangled and twitched: watched a moment, then it has to have them
    this.teaseRest = Math.max(0, this.teaseRest - dt);
    const W = this.wand;
    if (W && W.held && !(this.act instanceof Tease)) {
      this.wandT += dt * (W.v.length() > 0.15 ? 1 : 0.2);
      if (this.wandT > this.wandNeed && this.teaseNow()) this.wandT = 0;
    } else {
      this.wandT = 0;
      this.wandNeed = 0.3 + Math.random() * 0.6;
    }
    // a ball someone is moving about: watched a moment, then it has to have it
    if (this.lure && this.act?.name !== 'play') {
      this.lureT += dt * (this.lureMoving ? 1 : 0.25);
      if (this.lureT > this.lureNeed && this.playNow()) this.lureT = 0;
    } else {
      this.lureT = 0;
      this.lureNeed = 0.5 + Math.random() * 1.1;
    }
    // (out of the room it does nothing here)
    if (!this.trip) { if (!this.isHidden) this.behave(dt); }
    else {
      this.stopAct();
      if (this.trip.kind === 'leave' && Math.abs(m.pos.x) > this.offstage) {
        const cb = this.trip.onDone;
        this.trip = null;
        m.stop();
        this.setHidden(true);
        cb?.();
      }
    }
    // asleep, now and then it opens an eye to see what you are up to (the upper one, lying on
    // its side; the brain says when and how far)
    {
      // (and the lamp just come on: a slit of an eye against it, a moment, and shut again)
      const want = this.alive && this.sleep > 0.5 ? Math.min(0.6, Math.max(this.eyeTarget, this.dazzle > 0.5 ? 0.3 : 0)) : 0;
      this.cat.peek += (want - this.cat.peek) * (1 - Math.exp(-dt * (want > this.cat.peek ? 4 : 6)));
      this.cat.peekEye = m.posture === 'curlL' ? 1 : 0;
    }
    // eyes on the finger, or on you (through the window); asleep, dead or busy, nowhere (up on
    // the sill it looks where it likes: out of the window)
    const busy = this.errand || (this.act && this.act.name !== 'window' && this.act.name !== 'knead' && this.act.name !== 'greet' && this.act.name !== 'gift');
    let tilt = 0;
    if ((this.act instanceof Sill || this.act instanceof Play || this.act instanceof Hunt || this.act instanceof Box || this.act instanceof Zoomies || this.act instanceof Stare || this.act?.ownGaze) && this.mode !== 'enjoy') { /* the act decides */ }
    else if (!this.alive || this.sleep > 0.5 || busy) m.lookAt(null);
    else if (this.lure) m.lookAt(this.lure, 1);
    else if (this.laser) m.lookAt(this.laser.p, 1);
    else if (this.glint && this.sleep < 0.5) m.lookAt(this.glint, 1);
    else if (this.wand?.held) m.lookAt(this.wand.p, 1);
    else if (this.visitor) {
      // a bird on the ledge: eyes on it, and now and then a chatter at it
      m.lookAt(this.visitor, 1);
      if ((this.chatterIn -= dt) <= 0) {
        this.chatterIn = 2.5 + Math.random() * 3;
        if (Math.random() < 0.6) this.outside?.chirp();
      }
    } else if (this.heard && (this.heard.t -= dt) > 0) {
      m.lookAt(this.heard.at, 0.8);
      tilt = this.heard.tilt;
    }
    else if (this.gazeTarget && this.screenToWorld(this.gazeTarget.x, this.gazeTarget.y, this.look)) m.lookAt(this.look, 0.9);
    else m.lookAt(this.viewer(), this.trip ? 0.3 : 0.85);
    if (this.puzzledFor > 0) {
      this.puzzledFor -= dt;
      if (!busy && this.alive && this.sleep <= 0.5) tilt = this.puzzledTilt;
    }
    m.tilt = tilt;
  }

  /** now and then, deep asleep on its side or curled up, a long slow stretch in its sleep: the
   *  legs reaching out, a little tremble at the full of it, the head tipped back and the mouth
   *  coming open a little; then it lets go and settles again */
  private stretchIn = 90 + Math.random() * 240;
  private stretchT = 0;
  private sleepStretch(dt: number, may: boolean) {
    const m = this.cat.motor;
    const posture = m.posture;
    if (this.stretchT <= 0) {
      if (!may || (this.stretchIn -= dt) > 0 || (posture !== 'side' && !CURLED(posture)) || !m.settled || this.shade.u > 0) return;
      this.stretchT = 1e-3;
      this.stretchIn = 150 + Math.random() * 420;
    }
    // (woken, or touched, it stops there)
    if (!may || (posture !== 'side' && !CURLED(posture))) {
      this.stretchT = 0;
      m.layer = null;
      return;
    }
    const t = (this.stretchT += dt), P = POSES[posture];
    const tr = 0.005 * Math.sin(t * 38) * ease((t - 1.1) / 0.3) * (1 - ease((t - 2.2) / 0.25));
    // flat out on its side the paws go straight ahead and back; curled up, the forepaws reach out
    // past its nose and the hind paws out behind its back (the upper legs a little the further)
    const [uf, lf, uh, lh] = posture === 'curlL' ? ['RF', 'LF', 'RH', 'LH'] as const : ['LF', 'RF', 'LH', 'RH'] as const;
    const reach = (leg: Leg, dx: number, dz: number, dy = 0) => ({ x: P[leg].x + dx, y: P[leg].y + dy, z: P[leg].z + dz, flex: 0 });
    const c = CURLED(posture);
    m.layer = {
      pose: {
        [uf]: c ? reach(uf, 0.05, -0.05 + tr, 0.005) : reach(uf, 0, 0.07 + tr, 0.008),
        [lf]: c ? reach(lf, -0.045, -0.045 + tr) : reach(lf, 0, 0.055 + tr),
        [uh]: c ? reach(uh, 0.015, 0.07) : reach(uh, 0, -0.06),
        [lh]: c ? reach(lh, -0.012, 0.06) : reach(lh, 0, -0.045),
        // (the trunk as it lies: lying on its side, bending the back or the neck would lift it off
        // the bed)
        headPitch: P.headPitch + 0.15, tailCurl: P.tailCurl * 0.5,
        jaw: 0.28 * ease((t - 1.2) / 0.5) * (1 - ease((t - 2.2) / 0.4)), eyeOpen: 0, squint: 0.6,
      },
      w: ease(t / 1.4) * (1 - ease((t - 2.4) / 1.2)),
    };
    if (t > 3.6) {
      this.stretchT = 0;
      m.layer = null;
    }
  }

  /** asleep curled up in the sun, now and then it draws its upper forepaw up over its head and
   *  down over its eyes, and leaves it there a good while; it takes it away again when the sun
   *  goes, when it stirs, or just to shift */
  private shade = { u: 0, on: false, in: 20 + Math.random() * 60, hold: 0 };
  private shadeLayer: { pose: PoseLayer; w: number } | null = null;
  private shadeEyes(dt: number, may: boolean) {
    const m = this.cat.motor, s = this.shade;
    // (its layer taken for something else: whatever that is has the paws now)
    if (this.shadeLayer && m.layer !== this.shadeLayer) {
      this.shadeLayer = null;
      s.u = 0;
      s.on = false;
    }
    const curled = CURLED(m.posture) && m.targetPosture === m.posture;
    if (!s.on && s.u <= 0) {
      if (!may || !curled || !m.settled || (s.in -= dt) > 0) return;
      s.on = true;
      s.hold = 50 + Math.random() * 200;
    }
    if (s.on && (!may || !curled || (s.hold -= dt) <= 0)) {
      s.on = false;
      s.in = 30 + Math.random() * 150;
    }
    // up and over slowly; down a little quicker, and at once if it is getting up
    s.u = Math.max(0, Math.min(1, s.u + (s.on ? dt / 2.4 : -dt / (curled ? 1.6 : 0.35))));
    if (s.u <= 0) {
      if (m.layer === this.shadeLayer) m.layer = null;
      this.shadeLayer = null;
      return;
    }
    // from where it lies to the eyes, over the top of the head, the paw curling as it comes down
    // (the upper forepaw: the left lying on the right side, the right on the left)
    const paw = m.posture === 'curlL' ? 'RF' : 'LF';
    if (!this.shadeLayer || !this.shadeLayer.pose[paw]) this.shadeLayer = { pose: { [paw]: {} }, w: 1 };
    const e = ease(s.u), A = POSES[m.posture === 'curlL' ? 'curlL' : 'curl'][paw];
    const L = this.shadeLayer;
    Object.assign(L.pose[paw] as object, {
      x: A.x + (0.144 - A.x) * e, y: A.y + (0.089 - A.y) * e + 0.04 * Math.sin(Math.PI * e), z: A.z + (-0.224 - A.z) * e,
      flex: A.flex + (1 - A.flex) * e,
    });
    m.layer = L;
  }

  /** woken of itself from a long sleep in its bed: a yawn and a stretch before anything else (if
   *  it gets to it in the next few seconds, that is: not once it has been picked up and petted) */
  private waking = 0;
  wakeStretch() {
    this.waking = 4;
  }

  /** dozing off on its chest: the head sinks, slowly, slowly, and catches itself with a little
   *  jerk, and sinks again, until sleep wins and it curls up */
  private nod = { t: 0, len: 4.5, w: 0 };
  private nodLayer: { pose: PoseLayer; w: number } | null = null;
  private nodOff(dt: number, may: boolean) {
    const m = this.cat.motor, n = this.nod;
    // (its layer taken for something else: that has the head now)
    if (this.nodLayer && m.layer !== this.nodLayer) {
      this.nodLayer = null;
      n.w = 0;
    }
    n.w = Math.max(0, Math.min(1, n.w + (may ? dt / 1.5 : -dt / 0.4)));
    if (n.w <= 0) {
      if (this.nodLayer && m.layer === this.nodLayer) m.layer = null;
      this.nodLayer = null;
      n.t = 0;
      return;
    }
    n.t += dt;
    if (n.t > n.len) {
      n.t -= n.len;
      n.len = 3.5 + Math.random() * 3;
    }
    // how far down: sinking most of the time, then up with a start, a little past, and settling
    const u = n.t / n.len;
    const d = u < 0.85 ? ease(u / 0.85) : u < 0.92 ? 1 - 1.1 * ease((u - 0.85) / 0.07) : -0.1 * (1 - ease((u - 0.92) / 0.08));
    // (from the head held up, the nose toward you, to the chin sunk on the chest)
    this.nodLayer ??= { pose: {}, w: 0 };
    this.nodLayer.pose.neckPitch = -0.2 - 0.3 * d;
    this.nodLayer.pose.headPitch = 0.75 - 0.4 * d;
    this.nodLayer.w = ease(n.w);
    m.layer = this.nodLayer;
  }

  doBlink(slow = false) {
    if (slow) this.cat.motor.slowBlink();
    else this.cat.motor.blinkNow();
  }

  twitchEar(which: 'L' | 'R' | 'both', strength = 1) {
    this.cat.motor.flickEar(which, strength);
  }

  swivelEars(amount: number) {
    // screen right is the cat's left while it faces the window
    this.cat.motor.earAim = Math.max(-1, Math.min(1, amount));
  }

  flickTail(strength = 1) {
    this.cat.motor.flickTail(strength);
  }

  jolt(strength = 1) {
    this.cat.motor.jolt(strength);
  }

  /** a quick cuff with a forepaw at the hand on it: struck out at you and back in under half a
   *  second, the ears back, the head drawn away from it (dirX: which way on the screen) */
  private swatting: { t: number; paw: 'LF' | 'RF' } | null = null;
  swat(dirX = 0) {
    this.cat.motor.jolt(0.5);
    this.cat.motor.flickTail(1.5);
    if (!this.alive || this.sleep > 0.5) return;
    // (screen left is the cat's right while it faces you)
    this.swatting = { t: 0, paw: dirX < 0 ? 'RF' : dirX > 0 ? 'LF' : Math.random() < 0.5 ? 'LF' : 'RF' };
  }
  private swatStep(dt: number) {
    const S = this.swatting, m = this.cat.motor;
    if (!S) return;
    const u = (S.t += dt) / 0.42;
    if (u >= 1 || this.act) {
      this.swatting = null;
      if (!this.act) m.layer = null;
      return;
    }
    const k = u < 0.28 ? ease(u / 0.28) : 1 - ease((u - 0.28) / 0.72);
    m.layer = {
      pose: { [S.paw]: { planted: 0, frame: 0, x: 0.03, y: 0.1, z: 0.21, flex: 0.2 }, neckPitch: 0.25, headPitch: -0.1, earFlat: 1, earFwd: -0.8, earOut: 0.5 },
      w: k,
    };
  }

  sigh() {
    // asleep, a sigh is a breath, deep and slow, and just to be heard; awake, a slow blink
    if (this.sleep > 0.5) {
      this.cat.sigh();
      setTimeout(() => this.outside?.sound('sigh', 0.07), 1400);
    } else this.cat.motor.slowBlink();
  }

  hiss() {
    this.cat.motor.hiss();
  }

  vocalize(kind: 'trill' | 'meow' | 'meowSoft' | 'meowPlead' | 'chirp', dur: number, delay: number) {
    if (!this.isHidden) this.cat.motor.vocalize(kind, dur, delay);
  }

  /** eating and drinking where you can see: crouched with the head in the bowl, chewing or lapping */
  private doErrand(dt: number) {
    const e = this.errand!, m = this.cat.motor;
    e.t += dt;
    if (e.phase === 'do') {
      if (e.t > e.dur) {
        // done eating: sat up from the bowl, a wash of the face first; then off
        if (e.reason === 'eat' && !this.washAfter) {
          this.washAfter = washFace();
          m.layer = null;
        }
        if (this.washAfter) {
          if (this.washAfter.update(dt, this.ctx)) return;
          this.washAfter.stop(this.ctx);
          this.washAfter = null;
        }
        // off out of the room, the far way round; from the litter box, as often as not, at a
        // gallop with the tail up, as cats will
        e.phase = 'off';
        m.layer = null;
        m.setPosture('stand');
        const rocket = e.reason === 'litter' && Math.random() < 0.5;
        if (rocket) {
          m.zoom = 1;
          m.layer = { pose: { tailLift: 1.25, tailHook: 0.7, earFwd: -0.35, earOut: 0.25, hipY: 0.185 }, w: 1 };
          this.ctx.sound('scrabble', 0.25);
        }
        m.walkTo(new THREE.Vector3(e.dir * (this.offstage + 0.35), 0, m.pos.z - 0.1), rocket ? 1.3 : 0.3);
        return;
      }
      m.setPosture('crouch');
      if (e.reason === 'litter') {
        // squatting a while, the tail up out of the way; then turning the litter over the top of it
        // with a forepaw, a scrape or two
        const dig = e.t > e.dur - 2.5;
        const sw = Math.sin(e.t * 9);
        if (dig && Math.floor(e.t * 1.5) !== Math.floor((e.t - dt) * 1.5)) this.ctx.sound('scrabble', 0.12);
        m.layer = {
          pose: dig ? { neckPitch: -0.5, headPitch: -0.2, LF: { z: 0.03 + 0.03 * sw, y: 0.012 * Math.max(0, sw) } } : { hipY: 0.13, tailLift: 0.7, neckPitch: 0.05, earFwd: -0.15 },
          w: Math.min(1, e.t * 1.5),
        };
        return;
      }
      const chew = e.reason === 'eat' ? 0.25 * Math.max(0, Math.sin(e.t * 8)) : 0.14 * Math.max(0, Math.sin(e.t * 15));
      // (drinking, the tongue lapping, curled down to scoop: four or five laps a second)
      const lap = e.reason === 'drink' ? Math.max(0, Math.sin(e.t * 15)) : 0;
      m.layer = { pose: { neckPitch: -0.85, headPitch: -0.25, jaw: chew, tongue: lap, tongueUp: -0.9 }, w: Math.min(1, e.t * 1.5) };
    } else if (e.phase === 'off' && Math.abs(m.pos.x) > this.offstage) {
      m.zoom = 0;
      m.layer = null;
      this.errand = null;
      this.trip = null;
      this.setHidden(true);
    }
  }

  bolt(dir: number, onDone?: () => void, calm = false, reason?: string) {
    if (this.trip || this.isHidden) return;
    if (this.perched) {
      // down off the sill first
      this.afterPerch = () => this.bolt(dir, onDone, calm, reason);
      (this.act as Perching).leave();
      return;
    }
    const m = this.cat.motor;
    // whatever it was doing is dropped first (stopping it later would stop this walk too)
    this.stopAct();
    m.layer = null;
    const spot = !calm || !this.spots ? null : reason === 'eat' ? this.spots.food : reason === 'drink' ? this.spots.water : reason === 'litter' ? this.spots.litter : null;
    if (spot) {
      // walk to it and stop with the mouth over the bowl (the box: in it); the errand itself
      // (the bowl going down) happens on arrival
      const face = Math.atan2(spot.x - m.pos.x, spot.z - m.pos.z);
      const reach = reason === 'litter' ? 0 : 0.2;
      const at = new THREE.Vector3(spot.x - Math.sin(face) * reach, 0, spot.z - Math.cos(face) * reach);
      this.trip = { kind: 'errand' };
      this.washAfter = null;
      this.errand = {
        reason: reason!, phase: 'go', t: 0, dur: reason === 'eat' ? 26 + Math.random() * 14 : reason === 'drink' ? 12 + Math.random() * 8 : reason === 'litter' ? 7 + Math.random() * 3 : 0,
        dir: spot.x >= 0 ? 1 : -1,
      };
      m.setPosture('stand');
      m.walkTo(at, 0.3, face, () => {
        if (this.errand) {
          this.errand.phase = 'do';
          this.errand.t = 0;
        }
        onDone?.();
      });
      return;
    }
    const x = Math.sign(dir || 1) * (this.offstage + 0.3);
    this.trip = { kind: 'leave', onDone };
    m.setPosture('stand');
    m.walkTo(new THREE.Vector3(x, 0, this.home.z - 0.25), calm ? 0.35 : 1.1);
  }

  fadeAway(onDone?: () => void) {
    this.fading = { t: 0, dur: 4.5, onDone };
  }

  arrive(onDone?: () => void) {
    const m = this.cat.motor;
    // (anything left over from before is dropped first: stopping it later would stop this walk too)
    if (this.act) { this.act.stop(this.ctx); this.act = null; }
    this.cat.perch = null;
    this.cat.liftHold = null;
    this.errand = null;
    m.layer = null;
    m.zoom = 0;
    const side = Math.random() < 0.5 ? -1 : 1;
    this.fading = null;
    this.setHidden(false);
    this.cat.place(side * (this.offstage + 0.25), this.home.z - 0.25, -side * Math.PI / 2);
    m.snap('stand');
    this.trip = { kind: 'come', onDone };
    m.walkTo(new THREE.Vector3(this.home.x, 0, this.home.z), 0.32, this.home.yaw, () => {
      const cb = this.trip?.onDone;
      this.trip = null;
      cb?.();
    });
  }

  setHidden(h: boolean) {
    // the brain thinks of an errand as away; here the cat is still in view at the bowl until it
    // walks out
    if (h && this.errand) return;
    this.isHidden = h;
    this.cat.group.visible = !h;
    if (h) {
      this.trip = null;
      this.cat.motor.stop();
      this.cat.motor.zoom = 0;
      this.cat.place(this.home.x, this.home.z, this.home.yaw);
    }
  }
}
