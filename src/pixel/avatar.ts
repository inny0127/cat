import * as THREE from 'three';
import type { Cat3D } from '../cat3d/cat';
import { POSES, SIDE_TURN, type Leg, type PoseLayer, type PoseName } from '../cat3d/pose';
import { NEUTRAL, type Mood } from '../cat3d/mood';
import type { Avatar } from '../sim/avatar';
import type { EarMood, TailMood } from '../rig/animator';
import { boop, byYou, inTurn, shakeOff, canGlance, crab, coolOff, feel, huff, idleOptions, mealLayer, mealPlan, type MealPlan, groomChest, groomFlank, knead, lookWith, restingPose, sneeze, toBed, toWindow, wander, warmUp, washFace, yawn, type Act, type Ctx, sunbathe, Play, Sill, Hunt, Box, Zoomies, Walk, Stare, Rub, scratchEar, wakeUp, stretchSideOn, Greet, Gift, Snub, Beg, PawGlass, TailChase, Claw, Top, Fish, Bat, Trap, Sulk, Wrestle, isPerching, type Perching, type ScratchPost, type GlassFinger, type SillSpot, type SulkSpot } from './behave';
import { Chase, Startle, type LaserDot } from './chase';
import { Tease, type Lure } from './tease';
import { GOAL, Whim } from './whim';
import { noise1 } from '../util/math';
import { Ears } from './ears';
import { Nerves, type Blocker, type Thing } from './nerves';
import { Valence } from './midbrain';

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
  gazeAside = false;
  /** a glance aside of its own: somewhere off to one side of where it faces, about its own eye
   *  level (a little up, a little down), picked once a glance; never a point on the screen taken
   *  into the room, which over its head had it looking straight up, and the head spun round on
   *  the neck to come down from there */
  private aside: { of: object; at: THREE.Vector3 } | null = null;
  earMood: EarMood = 'sleep';
  tailMood: TailMood = 'still';
  headLift = 0;
  /** how far up it holds itself, as it comes to it (quicker up than down), and whether it is sat
   *  up by that, or down in a loaf */
  private liftSlow = -1;
  private satUp = false;
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
  /** an errand in the room: to the bowl (or the box), eat or drink there, and then about the room
   *  again (off: done, and waiting to be called back) */
  private errand: { reason: string; phase: 'go' | 'do' | 'off'; t: number; dur: number; dir: number; plan?: MealPlan } | null = null;
  /** the room's places (bowls, box), once there is a room */
  spots: { food: THREE.Vector3; water: THREE.Vector3; litter: THREE.Vector3; sniff?: { to: THREE.Vector3; face: number }[]; posts?: THREE.Vector3[]; scratcher?: ScratchPost; sulk?: SulkSpot[] } | null = null;
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
  /** its eyes and the neurons behind them (nerves.ts): what it can see of the room from where its
   *  eyes are, and what of that holds its attention; the room's say in what hides what (set by
   *  the app) */
  readonly nerves = new Nerves();
  /** and what to do about what it looks at (midbrain.ts): go toward it, shy from it, freeze, wonder */
  readonly valence = new Valence();
  /** a start just now, other than by sight (a hand out of nowhere): fades */
  private startled = 0;
  blockers: (() => readonly Blocker[]) | null = null;
  /** your hand, while a finger is on the screen: just in front of the room (set by the app) */
  userHand: THREE.Vector3 | null = null;
  /** the middle of the window, and how hungry and thirsty it is (0..1; set by the app) */
  windowAt: THREE.Vector3 | null = null;
  readonly needs = { hunger: 0, thirst: 0 };
  private readonly seeing: Thing[] = [];
  private readonly eyeW = new THREE.Vector3();
  private readonly headQ = new THREE.Quaternion();
  private readonly headF = new THREE.Vector3();
  /** where its eyes are and the way its head faces (world), as of the last look round (for the
   *  retina: retina.ts) */
  get eyes(): Readonly<THREE.Vector3> {
    return this.eyeW;
  }
  get facing(): Readonly<THREE.Vector3> {
    return this.headF;
  }
  /** the red dot as it has it: where it believes the dot is (lost: none) */
  private readonly dotSeen: LaserDot = { p: new THREE.Vector3(), on: 'floor', n: new THREE.Vector3(0, 1, 0) };
  private dotLost = true;
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
    pompom: () => THREE.Vector3 | null;
    batPompom: (v: THREE.Vector3) => void;
    carry: (at: THREE.Vector3 | null, yaw?: number) => void;
    kickMouse?: (dir: THREE.Vector3, speed: number, up: number) => void;
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
  /** how near it is to dawn or dusk (0 .. 1): a cat's liveliest hours */
  dusk = 0;
  set night(n: number) {
    this.ctx.night = n;
  }
  /** snow falling outside */
  set snow(s: boolean) {
    this.ctx.snow = s;
  }
  /** how warm the room is (0 cold .. 1 hot): the way it sleeps, and where */
  set warmth(w: number) {
    this.ctx.warmth = w;
  }
  get warmth() {
    return this.ctx.warmth ?? 0.5;
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
  /** how close you are looking at its face (0 .. 1; set by the app): the view taken right in on
   *  it by two fingers */
  lean = 0;
  /** your face up close just now, as it answers it: sniffing at it, looking away from it, or
   *  neither */
  get closeLooking(): 'sniff' | 'shy' | null {
    if (this.closeT < 0) return null;
    if (this.avertT > 0) return 'shy';
    return this.cat.motor.nose > 0.5 ? 'sniff' : null;
  }
  /** you up close in front of it: since when, as it has it (s; less than nothing: not); whether
   *  it has blinked at you (or looked away) yet; and how long yet its eyes keep off you */
  private closeT = -1;
  private farT = 0;
  private closeDone = false;
  /** this close look: whether it will bump its head at your face (decided as it starts), done it
   *  yet; and till when it will not again (its clock) */
  private bonkWill = false;
  private bonkDone = false;
  private bonkRest = 0;
  private avertT = 0;
  private readonly lookAway = new THREE.Vector3();
  /** a sound heard in its sleep: where, and how much longer an ear stays round to it (s) */
  private earSound: { at: THREE.Vector3; t: number } | null = null;
  /** lying down as near you as it can get, and there now */
  get byYouNow() {
    return this.act instanceof Walk && this.act.name === 'by you' && this.act.canNap;
  }
  /** asleep, an ear round to a sound it heard (for the word on it, the first time) */
  get earToSound() {
    return !!this.earSound && this.earSound.t > 0.5 && this.sleep > 0.5;
  }
  groove = 0;
  private grooveFor = 0;
  private grooveIn = 15 + Math.random() * 30;
  /** after eating: a wash of the face before it goes */
  private washAfter: Act | null = null;
  /** off to its dinner, keen (the motor's eagerness its, till it gets there or is stopped) */
  private keenWalk = false;
  private rubSide = 1;
  private readonly eyesAt = new THREE.Vector3();
  private readonly crownL = new THREE.Vector3();
  private readonly crownR = new THREE.Vector3();
  private readonly crownM = new THREE.Vector3();
  /** a hand pressing its ears down just now */
  private earsDown = false;

  /** where a hand is on it, its body answers: the cheek or the head rubbed into it, the chin
   *  lifted to a scratch, the rump and tail raised to a stroke at the base of the tail; the
   *  happier it is under the hand, the more */
  private leanIntoHand(dt: number) {
    const m = this.cat.motor, T = m.petTarget;
    T.roll = T.yaw = T.pitch = T.rump = T.ears = 0;
    const h = this.hands[0];
    if (!h) this.earsDown = false;
    if (!h && this.lastHand) this.lastHand.t += dt;
    const keen = !this.alive || this.sleep > 0.5 ? 0 : this.mode === 'enjoy' ? 1 : this.mode === 'rest' || this.mode === 'alert' ? 0.45 : 0;
    if (!h || !this.feel || !this.alive) return;
    const hit = this.feel(h.sx, h.sy);
    if (!hit) return;
    // (a hand on its crown, between and over the ears, presses them down flat, asleep or awake,
    // liking it or not: it is only a hand, and ears give)
    if (hit.bone.startsWith('ear') || hit.bone === 'head') {
      // (near the roots of the ears, or between them: wherever the head lies)
      const K = this.cat.kin, W = this.cat.group.matrixWorld;
      const l = this.crownL.copy(K.wp[K.i('earL')]).applyMatrix4(W), r = this.crownR.copy(K.wp[K.i('earR')]).applyMatrix4(W);
      const mid = this.crownM.copy(l).add(r).multiplyScalar(0.5);
      // (and once down under the hand, kept down while it stays about there: not let up and
      // pressed again as the head moves a little under it)
      const more = this.earsDown ? 0.015 : 0;
      this.earsDown = hit.bone.startsWith('ear') || Math.min(hit.point.distanceTo(l), hit.point.distanceTo(r)) < 0.04 + more || hit.point.distanceTo(mid) < 0.045 + more;
      if (this.earsDown) T.ears = 1;
    } else this.earsDown = false;
    if (keen <= 0) return;
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
    this.lastHand = { bone: b, side, chin, t: 0 };
    const rubbing = 0.08 * Math.sin(this.rub * 5);
    if (chin) { T.pitch = 0.35 * keen; T.roll = side * 0.08 * keen; }
    else if (b === 'head' || b.startsWith('ear')) { T.roll = side * (0.3 + rubbing) * keen; T.yaw = side * 0.22 * keen; }
    else if (b === 'neck1' || b === 'neck2') { T.pitch = 0.2 * keen; T.roll = side * 0.15 * keen; }
    else if (b === 'hips' || b === 'tail0' || b === 'tail1') T.rump = keen;
  }

  /** the last of a hand on it: the bone, which side of the head, under the chin; how long since */
  private lastHand: { bone: string; side: number; chin: boolean; t: number } | null = null;
  /** asking for more (see askMore): how long it has been at it, and where the hand had been */
  private more: { t: number; bone: string; side: number; chin: boolean } | null = null;
  /** at it now: the head pushed out after the hand that left (the first words, the brain) */
  get askingNow() {
    return !!this.more && this.more.t > 0.3 && this.more.t < 2.6;
  }

  /** the hand gone before it had had enough: up comes the head after it, the cheek (or the chin,
   *  or the small of the back) rubbed on the air where the hand was, twice, and a look at you
   *  while it waits; true if it does (the brain has it say so, and minds what you do next) */
  askMore() {
    const L = this.lastHand;
    if (!L || L.t > 4 || this.hands.length || !this.alive || this.sleep > 0.3 || this.errand || this.trip
      || this.cat.motor.licking || (this.act && this.act.name !== 'knead') || isPerching(this.act)) return false;
    // (the treading stops: the head comes up off it)
    if (this.act) this.stopAct();
    this.more = { t: 0, bone: L.bone, side: L.side, chin: L.chin };
    return true;
  }

  private askAfter(dt: number) {
    const A = this.more;
    if (!A) return;
    const T = this.cat.motor.petTarget;
    if (this.hands.length || !this.alive || this.sleep > 0.3 || this.act || this.errand || this.trip || (A.t += dt) > 3.4) {
      this.more = null;
      return;
    }
    const t = A.t;
    const push = ease((t - 0.3) / 0.45) * (1 - ease((t - 1.9) / 0.6));
    const rub = 0.1 * Math.sin((t - 0.3) * 6.5);
    if (A.chin) { T.pitch = 0.45 * push; T.roll = A.side * 0.1 * push; }
    else if (A.bone === 'head' || A.bone.startsWith('ear')) { T.roll = A.side * (0.32 + rub) * push; T.yaw = A.side * 0.22 * push; T.pitch = 0.12 * push; }
    else if (A.bone === 'neck1' || A.bone === 'neck2') { T.pitch = 0.3 * push; T.roll = A.side * (0.15 + rub) * push; }
    else if (/^(hips|tail0|tail1|spine)/.test(A.bone)) T.rump = push;
    else { T.pitch = 0.25 * push; T.roll = A.side * (0.18 + rub) * push; }
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

  /** a love bite: a good long while under a hand it likes, and that will do for now; the head
   *  round to the finger, the mouth on it, gently, a moment, let go, and the place licked (true if
   *  it did) */
  loveBite() {
    const m = this.cat.motor, h = this.hands[0];
    if (!h || !this.alive || this.sleep > 0.3 || this.errand || this.trip || m.licking || !this.feel || m.hissNow > 0) return false;
    const hit = this.feel(h.sx, h.sy);
    if (!hit) return false;
    this.cat.group.updateMatrixWorld(true);
    const E = this.cat.body.eyes(this.eyesAt).applyMatrix4(this.cat.group.matrixWorld);
    const toYou = this.ctx.viewer().sub(E).normalize();
    this.lickAt = hit.point.clone().addScaledVector(toYou, 0.08).setY(Math.max(hit.point.y, E.y - 0.02));
    m.nibble();
    this.lickRest = Math.max(this.lickRest, 20);
    return true;
  }

  /** it has just licked the air (for whoever wants to say what that is, to clear) */
  airLicked = false;
  /** scratched at the base of its tail: the nose lifted, the eyes half shut, and a few licks at
   *  the air in front of it (true if it did) */
  airLick() {
    const m = this.cat.motor;
    if (!this.alive || this.sleep > 0.3 || this.errand || this.trip || m.licking || m.hissNow > 0 || (this.act && this.act.name !== 'knead')) return false;
    this.cat.group.updateMatrixWorld(true);
    const E = this.cat.body.eyes(this.eyesAt).applyMatrix4(this.cat.group.matrixWorld);
    this.lickAt = E.clone().add(new THREE.Vector3(Math.sin(m.yaw) * 0.12, 0.05, Math.cos(m.yaw) * 0.12));
    m.lick(3 + Math.floor(Math.random() * 4), false);
    this.lickRest = Math.max(this.lickRest, 8);
    this.airLicked = true;
    return true;
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

  /** a sound somewhere in the room (a knock, a click): an ear goes to it, and an idle cat awake
   *  glances that way a moment, if it is not used to it (listen) */
  hear(at: THREE.Vector3) {
    if (!this.alive || this.isHidden) return;
    this.ears.sound('sound', at, 0.7);
    if (this.sleep > 0.5) {
      // (asleep, an ear goes round to it, the rest of it still asleep; and back in a moment)
      this.earSound = { at: at.clone(), t: 1.4 + Math.random() * 1.8 };
    }
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
    this.frightAt = at.clone();
    this.cat.motor.jolt(1.3);
    this.cat.motor.flickEar('both', 1.2);
    this.lookToYou();
    if (this.sleep > 0.3 || this.errand || this.trip) return false;
    // (up on the sill, most likely it was the one that sent it over: it only starts, and looks;
    // sulking in its corner, it only starts, and looks)
    if (this.perched) { this.see(at); return true; }
    if (this.act instanceof Sulk) { this.see(at); return false; }
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

  /** a hand on its belly, and the belly offered (rolled over before you, flat out on its side,
   *  asleep on its back): the hand trapped (see Trap). False: its belly is not to be had just now */
  bellyTrap() {
    if (!this.alive || this.isHidden || this.errand || this.trip || this.perched) return false;
    if (this.act instanceof Trap) return true;
    const m = this.cat.motor;
    const kind = this.act instanceof Greet && this.act.phase === 'flop' ? 'flop' : m.posture === 'side' ? 'side' : m.posture === 'back' ? 'back' : null;
    if (!kind) return false;
    const sd = kind === 'flop' ? (this.act as Greet).roll : kind === 'side' ? 1 : 0;
    // (woken by it, if it was asleep: wide awake at once)
    this.sleep = 0;
    this.stopAct();
    this.act = new Trap(kind, sd);
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
    // (asked at the bowl a little while ago, and still nothing in it: this time it comes and gets
    // you, and leads the way; not from right by the bowl, where there is no way to lead)
    const bowl = (what === 'food' ? this.spots.food : this.spots.water).clone();
    const far = Math.hypot(bowl.x - this.cat.motor.pos.x, bowl.z - this.cat.motor.pos.z) > 0.35;
    const lead = far && this.clock - this.beggedAt < 240 && Math.random() < 0.7;
    this.beggedAt = this.clock;
    this.act = new Beg(bowl, urgent, empty, lead);
    return true;
  }
  /** when it last asked you at its bowl (its clock) */
  private beggedAt = -1e9;

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
    const was = this.act instanceof Sill && this.act.caught();
    if (was) this.outcome(-1);
    return was;
  }

  /**
   * Something good (r > 0: strokes it likes, a game) or bad (r < 0: scolded, handled roughly) has
   * just come of what it did lately: put down to each thing it did of its own accord in the last
   * minute, the more the more lately it did it, once each.
   */
  outcome(r: number) {
    for (const T of this.tried) {
      const age = this.clock - T.t;
      if (age > 60 || (r > 0 ? T.paid : T.rued)) continue;
      const e = Math.exp(-age / 25);
      if (e < 0.1) continue;
      this.taught?.(T.key, r, e);
      if (r > 0) T.paid = true; else T.rued = true;
    }
  }

  /** each frame: strokes it is enjoying, or a hand that has made it cross, are what came of it;
   *  and what it did for you (come up to the front, asked for a game, brought you its mouse, lay
   *  down by you) and nothing came of in a minute, with you there, it does a little less */
  private reckon(dt: number) {
    const L = this.laser || this.wand?.held || this.lure;
    this.sinceYou = this.hands.length || this.touched || L ? 0 : this.sinceYou + dt;
    if (this.mode !== this.learnMode) {
      if (this.mode === 'enjoy') this.outcome(1);
      else if ((this.mode === 'annoyed' || this.mode === 'angry') && this.hands.length) this.outcome(-0.6);
      this.learnMode = this.mode;
    }
    for (let i = this.tried.length - 1; i >= 0; i--) {
      const T = this.tried[i];
      if (this.clock - T.t < 60) continue;
      if (!T.paid && /^(window|ask|gift|by you)$/.test(T.key) && this.sinceYou < 600 && this.alive) this.taught?.(T.key, -0.25, 1);
      this.tried.splice(i, 1);
    }
  }
  /** a paw patted at the glass this frame: which (null: none) */
  get pawLanded() {
    return this.act instanceof PawGlass ? this.act.landed : null;
  }
  /** its cheek rubbed on the glass this frame, where your finger is */
  get nuzzled() {
    return this.act instanceof PawGlass && this.act.nuzzled;
  }
  /** the finger on the glass now (null: gone) */
  /** round further than its head will turn, the thing it attends to is turned to: the body comes
   *  round on the spot, sitting or standing (lying down, the head does what it can) */
  private orientT = 0;
  private orient(dt: number, at: THREE.Vector3) {
    const m = this.cat.motor;
    const face = Math.atan2(at.x - m.pos.x, at.z - m.pos.z);
    const off = Math.abs(wrap(face - m.yaw));
    const up = m.targetPosture === 'sit' || m.targetPosture === 'stand' || m.targetPosture === 'crouch' || m.targetPosture === 'alert';
    this.orientT = off > 1.3 && up && !m.goal && !this.act && !this.hands.length ? this.orientT + dt : 0;
    if (this.orientT > 0.35) {
      this.orientT = 0;
      m.walkTo(m.pos.clone(), 0.2, face);
    }
  }

  /** what it sees of the room this frame, from where its eyes are, and what its neurons make of it */
  private sense(dt: number) {
    const N = this.nerves, cat = this.cat, m = cat.motor, mood = this.mood;
    const T = this.seeing;
    T.length = 0;
    const L = this.laser;
    // (on its own coat it is felt; where it is, for the eyes, is where the beam goes on to: the dot
    // on its back and the dot on the floor beside it are one dot to it, not a thing leaping about)
    if (L) T.push({ id: 'dot', kind: 'dot', p: L.p, felt: !!L.self });
    if (this.toys) T.push({ id: 'yarn', kind: 'toy', p: this.toys.yarn() });
    if (this.wand) T.push({ id: 'wand', kind: 'toy', p: this.wand.p });
    if (this.glint) T.push({ id: 'glint', kind: 'glint', p: this.glint });
    if (this.visitor) T.push({ id: 'bird', kind: 'bird', p: this.visitor });
    const bug = this.outside?.bug?.();
    if (bug) T.push({ id: 'bug', kind: 'bug', p: bug.p });
    const mouse = this.ground?.mouse();
    if (mouse && mouse.state !== 'mouth' && !mouse.under) T.push({ id: 'mouse', kind: 'toy', p: mouse.p });
    const pom = this.ground?.pompom();
    if (pom) T.push({ id: 'pompom', kind: 'toy', p: pom });
    T.push({ id: 'you', kind: 'you', p: this.viewer() });
    // (places it knows, looked at now and then: the window; its bowls, the more the hungrier or
    // thirstier it is)
    if (this.windowAt) T.push({ id: 'window', kind: 'spot', p: this.windowAt });
    if (this.pointerAt) T.push({ id: 'pointer', kind: 'spot', p: this.pointerAt });
    if (this.spots) {
      T.push({ id: 'food', kind: 'spot', p: this.spots.food }, { id: 'water', kind: 'spot', p: this.spots.water });
    }
    // (and a place it has a mind to go to: looked at before it goes)
    const I = this.whim.intent;
    if (I?.at) T.push({ id: GOAL, kind: 'spot', p: I.at });
    const F = this.fingerNow();
    if (F) T.push({ id: 'hand', kind: 'hand', p: F.at });
    else if (this.userHand) T.push({ id: 'hand', kind: 'hand', p: this.userHand });
    // the eyes, and the way the head faces
    cat.body.eyes(this.eyeW).applyMatrix4(cat.group.matrixWorld);
    const head = cat.byName.get('head');
    if (head) this.headF.set(0, 0, 1).applyQuaternion(head.getWorldQuaternion(this.headQ));
    else this.headF.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
    N.awake = this.alive && !this.isHidden ? Math.max(0, Math.min(1, 1 - this.sleep)) : 0;
    N.playful = Math.max(0, Math.min(1, 0.45 + 0.15 * this.temper.playful + 0.5 * mood.arousal - 0.5 * mood.sleepy - 0.4 * mood.fear));
    N.restless = 1 + 0.3 * this.temper.curious;
    // (how much the room itself draws its eyes: keyed up, on edge, or curious by nature, it looks
    // about it; sleepy or contented, hardly)
    N.sc.look = Math.max(0, Math.min(1, 0.45 + 0.4 * mood.arousal + 0.12 * this.temper.curious + 0.25 * (mood.wary ?? 0) + 0.2 * mood.fear - 0.7 * mood.sleepy - 0.3 * mood.pleasure));
    N.fond = Math.max(0, Math.min(1, 0.2 + 0.8 * mood.trust));
    N.blockers = this.blockers ?? (() => []);
    // (what it is about colours what it watches: after the dot, the dot)
    N.bias.clear();
    N.bias.set('food', 0.35 * Math.max(0, this.needs.hunger - 0.4));
    N.bias.set('water', 0.35 * Math.max(0, this.needs.thirst - 0.4));
    // (and you, the more lately you were about)
    N.bias.set('you', 0.08 * Math.exp(-this.sinceYou / 30));
    // (the hour you mostly play with it: its eyes go to the pointer lying on the sill, the feathers,
    // the ball, as a cat's do to the door at the time someone comes home)
    const X = this.expects;
    N.bias.set('pointer', 0.5 * X.laser);
    if (!this.wand?.held) N.bias.set('wand', 0.4 * X.wand);
    N.bias.set('yarn', 0.35 * X.yarn);
    if (this.act instanceof Chase) N.bias.set('dot', 0.45);
    else if (this.act instanceof Tease) N.bias.set('wand', 0.4);
    else if (this.act?.name === 'play') N.bias.set('yarn', 0.35);
    else if (this.act?.name === 'pompom') N.bias.set('pompom', 0.35);
    // (come to say hello, or sat by a present for you: it is you it is about, and its eyes keep
    // coming back to you; a glance away now and then, as the look tires, and back)
    if ((this.act instanceof Greet && this.act.phase !== 'see') || this.presenting) N.bias.set('you', (N.bias.get('you') ?? 0) + 0.35);
    if (I) N.bias.set(I.id, (N.bias.get(I.id) ?? 0) + this.whim.pull);
    for (const [id, k] of this.wonder) N.bias.set(id, (N.bias.get(id) ?? 0) + 0.3 * k);
    // (a face up close: hard to look away from; one it is not sure of, its eyes kept off it a
    // while once they have been on it, as between cats)
    if (this.avertT > 0) N.bias.set('you', -0.9);
    else if (this.closeT >= 0) N.bias.set('you', 0.4);
    this.headYaw = Math.atan2(this.headF.x, this.headF.z);
    this.headPitch = Math.asin(Math.max(-1, Math.min(1, this.headF.y)));
    N.selfMotion = m.speed;
    N.body.copy(m.pos);
    N.update(dt, this.eyeW, this.headYaw, this.headPitch, T);
    this.feelAbout(dt);
    // (a hand come down on it out of nowhere: felt, and its eyes go round to it)
    if (this.handCue > 0 && N.unit('hand')) { N.cue('hand', this.handCue); this.handCue = 0; }
    // (a start, a moment ago: a look at you)
    if (this.referIn > 0 && (this.referIn -= dt) <= 0 && N.awake > 0.6) N.cue('you', 1.3);
    // (busy with its coat, and something moving or new catches its eye: it looks up from it a
    // moment, stopped as it was, caught with the tip of its tongue out as like as not; then back to
    // it)
    this.glanceRest = Math.max(0, this.glanceRest - dt);
    const G = this.act, B = N.attending;
    if (canGlance(G) && /^(groom|wash|scratch)/.test(G.name) && B && N.jump > 0.35 && N.awake > 0.6 && this.glanceRest <= 0
      && (B.motion > 0.25 || B.onset > 0.3 || B.cue > 0.3)) {
      this.glanceRest = 3 + Math.random() * 3;
      G.glance(0.7 + Math.random() * 1.4);
    }
    this.remember(dt);
    // (what its eyes are on, kept a while: an hour on, mostly gone)
    const k = Math.exp(-dt / 3600);
    for (const [id, s] of this.onMind) this.onMind.set(id, s * k);
    if (N.attending && N.awake > 0.6) this.onMind.set(N.attending.id, (this.onMind.get(N.attending.id) ?? 0) + dt);
    this.dreamT = Math.max(0, this.dreamT - dt);
    // (the second twitch of a dream, in game time)
    if (this.twitchAgain >= 0 && (this.twitchAgain -= dt) < 0 && this.sleep > 0.5) this.cat.motor.dreamTwitch();
    // (a big shift of the eyes, as often as not, a blink with it, as eyes do when they jump a long
    // way; intent on prey, its eyes hardly blink)
    m.focus = Math.min(1, 1.2 * N.hunt);
    if (N.jump > 0.7 && N.hunt < 0.5 && N.awake > 0.6 && Math.random() < 0.4) m.blinkNow();
    // (the red dot come on: the click of the pointer, and the room's light changed; it looks
    // round for it wherever it is)
    if (L && !this.dotWas) N.cue('dot', 1.4);
    this.dotWas = !!L;
    // the ears round to what it attends to, like a pair of dishes: the one on that side the
    // further, the other a little; straight ahead, both forward
    const A = N.attending, E = m.earTo;
    if (A && N.awake > 0.5 && A.kind !== 'you') {
      const to = this.headLocal.copy(A.belief).sub(this.eyeW).applyQuaternion(this.headInv.copy(this.headQ).invert());
      const az = Math.atan2(to.x, to.z), k = Math.min(1, A.a * 1.2);
      // (the cat's left is +x: the left ear turns out to it, the right ear in)
      const near = Math.min(1.3, Math.abs(az) * 0.9), far = Math.min(0.5, Math.abs(az) * 0.4);
      E.L = k * (az > 0 ? near : -far);
      E.R = k * (az > 0 ? -far : near);
    } else if (N.place === 'move' && N.awake > 0.5) {
      // (something it knows nothing of moved: the ears round to it with the eyes)
      const to = this.headLocal.copy(N.gazePoint).sub(this.eyeW).applyQuaternion(this.headInv.copy(this.headQ).invert());
      const az = Math.atan2(to.x, to.z), k = 0.9;
      const near = Math.min(1.3, Math.abs(az) * 0.9), far = Math.min(0.4, Math.abs(az) * 0.3);
      E.L = k * (az > 0 ? near : -far);
      E.R = k * (az > 0 ? -far : near);
    } else if (this.earSound && (this.earSound.t -= dt) > 0) {
      const to = this.headLocal.copy(this.earSound.at).sub(this.eyeW).applyQuaternion(this.headInv.copy(this.headQ).invert());
      const az = Math.atan2(to.x, to.z), k = 0.9 * Math.min(1, this.earSound.t / 0.6);
      const near = Math.min(1.3, Math.abs(az) * 0.9), far = Math.min(0.3, Math.abs(az) * 0.25);
      E.L = k * (az > 0 ? near : -far);
      E.R = k * (az > 0 ? -far : near);
    } else { E.L = 0; E.R = 0; this.earSound = null; }
    this.listen(dt, A && A.kind !== 'you' ? A.a : 0);
  }

  /**
   * What to do about what it sees (midbrain.ts's Valence), from moment to moment: prey-like movement
   * draws it on (the head and whiskers put out, the ears forward); a thing coming at its face, the
   * faster and the nearer the more, makes it shy (a friend's hand much less so, to a cat that
   * trusts you); something new, a flash or a hand out of nowhere stops it dead a moment; and a
   * thing new to it it wonders at, if it is not afraid.
   */
  private feelAbout(dt: number) {
    const N = this.nerves, m = this.cat.motor, mood = this.mood;
    let loom = 0, novel = 0;
    for (const u of N.units.values()) {
      if (!u.here || u.vis < 0.2) continue;
      // (a thing that could hit it: not a spot of light)
      const w = u.kind === 'hand' ? 1 : u.kind === 'toy' ? 0.8 : u.kind === 'you' ? 0.5 : u.kind === 'bird' || u.kind === 'bug' ? 0.3 : 0;
      const friend = u.kind === 'hand' || u.kind === 'you' ? Math.max(0, Math.min(1, (mood.trust - 0.2) / 0.6)) : 0;
      const rate = u.closing / Math.max(0.08, u.dist);
      const l = Math.max(0, Math.min(1, (rate - 0.5) / 1.5)) * Math.max(0, Math.min(1, (0.9 - u.dist) / 0.6)) * u.vis * w * (1 - 0.85 * friend);
      loom = Math.max(loom, l);
      if (u.kind !== 'spot') novel = Math.max(novel, Math.min(1, u.onset) * u.vis);
    }
    this.startled *= Math.exp(-dt / 0.3);
    const awake = this.alive && !this.isHidden ? N.awake : 0;
    const V = this.valence;
    V.update(dt, {
      prey: N.prey * awake, loom: loom * awake, novel: novel * awake, startle: Math.min(1, N.sc.flash + this.startled) * awake,
      fear: mood.fear, arousal: mood.arousal,
    });
    const k = awake > 0.5 ? 1 : 0;
    m.approach = k * V.approach;
    m.withdraw = k * V.withdraw;
    m.freeze = k * V.freeze;
    // (a thing at its face: a blink, as any eye blinks at one; and coming hard at it, a flinch, the
    // head jerked back)
    if (k && V.withdraw > 0.45 && !this.shied) {
      this.shied = true;
      m.blinkNow();
      if (loom > 0.3) m.jolt(0.4 + 0.5 * Math.min(1, (loom - 0.3) / 0.5));
    } else if (V.withdraw < 0.3) this.shied = false;
  }
  private shied = false;

  /**
   * Your face come up close in front of it (the view taken right in on it): its eyes go to you;
   * a cat that knows you puts its nose out at you, the whiskers forward, the ears up, the nose
   * working, a good sniff and then less (it is only you), and before long a slow blink, and now
   * and then a little trill; one that does not draws its head back, the ears going back, the eyes
   * wide, and after a moment looks away from you (as a cat does from another's stare).
   */
  private closeLook(dt: number) {
    const N = this.nerves, m = this.cat.motor;
    this.avertT = Math.max(0, this.avertT - dt);
    const free = this.alive && !this.isHidden && !this.trip && !this.errand && !this.hands.length && N.awake > 0.6 && N.hunt < 0.5
      && (!this.act || /^(window|greet|gift|knead|by you|sun|warm|stare|look with you)/.test(this.act.name));
    // (once it has you close, a little further off is close still; and gone a moment, you are
    // still there to it)
    if (!free || this.lean < (this.closeT >= 0 ? 0.2 : 0.6)) {
      m.nose = m.shy = 0;
      if (!free || (this.farT += dt) > 1.5) this.closeT = -1;
      return;
    }
    this.farT = 0;
    if (this.closeT < 0) {
      this.closeT = 0;
      this.closeDone = false;
      // (one that loves you, now and then, puts its head to your face: a bump of the forehead, the
      // cheek drawn along after)
      this.bonkWill = this.mood.trust > 0.7 && this.clock > this.bonkRest && Math.random() < 0.3 + 0.5 * (this.mood.trust - 0.7) / 0.3;
      this.bonkDone = false;
      N.cue('you', 1.2);
    }
    this.closeT += dt;
    const trust = this.mood.trust, t = this.closeT;
    if (trust >= 0.2) {
      m.nose = Math.max(0.2, Math.min(1, 1 - (t - 4) / 5));
      m.shy = 0;
      // (a slow blink at you, once its eyes are on you; and now and then a trill with it)
      if (!this.closeDone && t > 1.8 && trust > 0.45 && N.attending?.id === 'you') {
        this.closeDone = true;
        m.slowBlink();
        if (Math.random() < 0.25 + 0.3 * trust) this.ctx.say('trill');
      }
      if (this.bonkWill && !this.bonkDone && this.closeDone && t > 3.4 && N.attending?.id === 'you' && !m.licking && !m.slowBlinking) {
        this.bonkDone = true;
        this.bonkRest = this.clock + 40 + Math.random() * 40;
        m.bonk(Math.random() < 0.5 ? -1 : 1);
      }
    } else {
      m.nose = 0;
      m.shy = Math.min(1, this.lean * (1.2 - trust));
      if (!this.closeDone && t > 1.2 + 0.8 * Math.max(0, trust)) {
        this.closeDone = true;
        this.avertT = 3 + Math.random() * 3;
        m.blinkNow();
        // (somewhere off to one side and down: anywhere but at you)
        const to = this.headLocal.copy(this.viewer()).sub(this.eyeW);
        const a = Math.atan2(to.x, to.z) + (Math.random() < 0.5 ? -1 : 1) * (0.9 + 0.5 * Math.random());
        this.lookAway.set(this.eyeW.x + 0.8 * Math.sin(a), Math.max(0.02, this.eyeW.y - 0.25), this.eyeW.z + 0.8 * Math.cos(a));
      }
      // (and you there still, a good while after: it turns its back on you)
      if (this.closeDone && t > 6 && !this.act && !this.perched && Math.random() < dt / 2) this.act = new Snub();
    }
  }

  /** where the radio stands (set by the app), for its ears */
  radioAt: THREE.Vector3 | null = null;
  /** its hearing (ears.ts): the radio's beats, the rain on the glass, a knock about the room,
   *  each heard as it comes, and got used to */
  readonly ears = new Ears();
  /**
   * Listening: what its hearing has it listen to turns an ear all the same, the one on that side
   * round to it while it lasts (a song just come on, the rain getting up, a knock), and a sound out
   * of a quiet flicks one at once; its eyes on something, the ears are mostly theirs. Asleep, only
   * a sound it is not used to gets as far as an ear.
   */
  private listen(dt: number, busy: number) {
    const N = this.nerves, E = this.cat.motor.earTo, H = this.ears;
    H.update(dt);
    if (!this.alive || this.isHidden) { H.flick = H.orient = null; return; }
    const awake = N.awake >= 0.6;
    const F = H.flick, O = H.orient;
    H.flick = H.orient = null;
    if (F && (awake || F.k > 0.6)) {
      const to = this.headLocal.copy(F.at).sub(this.eyeW).applyQuaternion(this.headInv.copy(this.headQ).invert());
      this.cat.motor.flickEar(Math.atan2(to.x, to.z) > 0 ? 'L' : 'R', 0.4 + 0.5 * F.k);
    }
    // (a sound come hard at it, awake and about nothing in particular: a look that way a moment,
    // the harder the longer, and at the oddest the head tipped to it; one it is used to, the ear
    // only)
    if (O && awake && this.sleep < 0.3 && !this.act && !this.errand && !this.trip && !this.hands.length && !this.heard) {
      this.heard = { at: O.at.clone(), t: 0.5 + 0.9 * O.k + 0.4 * Math.random(), tilt: O.k > 0.6 ? this.puzzle() : 0 };
    }
    const S = H.on;
    if (!S || (!awake && S.a < 0.6)) return;
    // (the ear on that side round to it, the more the further round it is)
    const to = this.headLocal.copy(S.at).sub(this.eyeW).applyQuaternion(this.headInv.copy(this.headQ).invert());
    const az = Math.atan2(to.x, to.z), k = (1 - busy) * Math.min(1, S.a * 1.6);
    const near = Math.min(1.3, Math.abs(az) * 0.9);
    if (az > 0) E.L += k * (near - E.L); else E.R += k * (near - E.R);
  }
  private readonly headLocal = new THREE.Vector3();
  private readonly headInv = new THREE.Quaternion();
  private dotWas = false;
  /** where it last saw each of its things lying still (the ball of wool, the toy mouse, the
   *  feathers), and how curious it is about one found somewhere else (fading over a minute or
   *  so; satisfied, once it has been over and had a look) */
  private readonly where = new Map<string, THREE.Vector3>();
  private readonly wonder = new Map<string, number>();
  private remember(dt: number) {
    const N = this.nerves;
    const mouse = this.ground?.mouse();
    for (const id of ['yarn', 'mouse', 'wand']) {
      const k = this.wonder.get(id);
      if (k !== undefined) {
        const left = k - dt / 60;
        if (left <= 0) this.wonder.delete(id); else this.wonder.set(id, left);
      }
      const u = N.unit(id);
      if (!u || !u.here) continue;
      // (its own game with it, or a hand on it, or in its mouth: it knows well enough where it is)
      const busy = (id === 'yarn' && (this.act?.name === 'play' || this.toys?.held()))
        || (id === 'wand' && (this.act instanceof Tease || !!this.wand?.held))
        || (id === 'mouse' && (!mouse || mouse.state !== 'floor' || this.act instanceof Gift || this.act instanceof Fish));
      const was = this.where.get(id);
      if (busy) { if (was) was.copy(u.belief); else this.where.set(id, u.belief.clone()); this.wonder.delete(id); continue; }
      // (seen clearly: going somewhere before its eyes, it knows where it went; lying still somewhere
      // else than it was, that it did not see)
      if (u.vis < 0.5 || u.conf < 0.6) continue;
      if (!was) { this.where.set(id, u.belief.clone()); continue; }
      if (u.motion > 0.1) { was.copy(u.belief); continue; }
      if (was.distanceTo(u.belief) > 0.2 && N.awake > 0.6) {
        this.wonder.set(id, 1);
        N.cue(id, 0.5);
      }
      was.copy(u.belief);
    }
  }
  /** what its eyes have been on of late, and for how long (s, fading over an hour or so): what
   *  it dreams of, asleep; and what it is dreaming of now, if anything */
  private readonly onMind = new Map<string, number>();
  private dreamOf: string | null = null;
  private dreamT = 0;
  private mostOnMind() {
    let best: string | null = null, most = 3;
    for (const [id, s] of this.onMind) if (id !== 'goal' && s > most) { most = s; best = id; }
    return best;
  }
  /** looking up from its coat at something just now */
  get glancing() {
    return canGlance(this.act) && this.act.glancing && /^(groom|wash|scratch)/.test(this.act.name);
  }
  get dreaming() {
    return this.dreamT > 0 && this.sleep > 0.5 ? this.dreamOf : null;
  }

  /** what it wonders at just now, if anything (the name its eyes know it by) */
  get wondering() {
    return this.curiosity()?.id ?? null;
  }
  /** the thing it is most curious about just now, and where it is */
  private curiosity() {
    let best: { id: string; at: THREE.Vector3; k: number } | null = null;
    for (const [id, k] of this.wonder) {
      const at = this.where.get(id);
      if (at && (!best || k > best.k)) best = { id, at, k };
    }
    // (the more so the more its midbrain is curious just now; afraid, hardly at all)
    if (best) best.k *= 0.5 + this.valence.curious;
    return best;
  }

  /** the way its head faces (world), as of the last look round */
  private headYaw = 0;
  private headPitch = 0;
  private handCue = 0;
  /** not looking up from its coat again till this has gone by (s) */
  private glanceRest = 0;
  private readonly comeIn = new THREE.Vector3();

  /** a hand come down on it at a point on the screen: how far out of its sight that was (0: it saw
   *  it coming .. 1: out of nowhere). A hand comes in from your side, so it is seen coming if the way
   *  in from you to the spot is in its eyes' field: its back stroked while it looks at you is no
   *  surprise; while it looks away, round behind it, it is. Its eyes go round to it, as felt */
  unseen(sx: number, sy: number) {
    if (!this.alive || this.isHidden || this.sleep > 0.3 || !this.feel) return 0;
    const hit = this.feel(sx, sy);
    if (!hit) return 0;
    const N = this.nerves, blockers = this.blockers?.() ?? [], you = this.viewer();
    let seen = 0;
    for (const k of [0.06, 0.15, 0.28]) {
      const q = this.comeIn.copy(you).sub(hit.point).normalize().multiplyScalar(k).add(hit.point);
      seen = Math.max(seen, N.visible(q, this.headYaw, this.headPitch, blockers));
    }
    this.handCue = 0.6 + 0.9 * (1 - seen);
    this.startled = Math.max(this.startled, 1 - seen);
    return 1 - seen;
  }

  /** the red dot as it has it: where it believes it is, if it is sure enough (once lost, it has to
   *  be surer before it counts as found again); on its own coat it feels it, and knows */
  private seenLaser(): LaserDot | null {
    const L = this.laser;
    if (L?.self) { this.dotLost = false; return L; }
    const u = this.nerves.unit('dot');
    if (!u || u.conf < (this.dotLost ? 0.45 : 0.25)) { this.dotLost = true; return null; }
    this.dotLost = false;
    const S = this.dotSeen;
    S.p.copy(u.belief);
    if (L) {
      S.on = L.on;
      S.n.copy(L.n);
      S.mug = L.mug;
      S.self = undefined;
      S.selfAt = undefined;
    }
    return S;
  }

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

  /** a point (a little over the floor) hidden from you (the camera) behind the room's tall things */
  hiddenFromYou(p: THREE.Vector3) {
    const v = this.viewer();
    const dx = v.x - p.x, dz = v.z - p.z, L2 = dx * dx + dz * dz;
    if (L2 < 1e-6) return false;
    for (const b of this.blockers?.() ?? []) {
      // (where the line from it to you passes nearest the thing's middle, and how high it is there)
      const u = ((b.c.x - p.x) * dx + (b.c.z - p.z) * dz) / L2;
      if (u <= 0 || u >= 1) continue;
      if (Math.hypot(p.x + dx * u - b.c.x, p.z + dz * u - b.c.z) > b.r + 0.03) continue;
      if (p.y + (v.y - p.y) * u < b.h) return true;
    }
    return false;
  }

  /** where its forepaws are (between the two), in the room */
  private readonly pawsW = new THREE.Vector3();
  private readonly pawW = new THREE.Vector3();
  pawsAt() {
    const k = this.cat.kin, legs = this.cat.body.legs;
    this.cat.group.updateWorldMatrix(true, false);
    this.pawsW.set(0, 0, 0);
    for (const leg of ['LF', 'RF'] as const) this.pawsW.add(this.pawW.copy(k.wp[legs[leg].b[3]]).applyMatrix4(this.cat.group.matrixWorld));
    return this.pawsW.multiplyScalar(0.5);
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
    // (in under the radiator: a paw in after it first; and now and then, caught, it is a tussle
    // with it on the floor rather than brought back)
    this.act = M.under ? new Fish() : Math.random() < 0.25 + 0.15 * Math.max(0, this.temper?.playful ?? 0) ? new Wrestle(true) : new Gift(true);
    return true;
  }

  /** the hands gone, it puts its coat to rights where they were: a paw licked and drawn over the
   *  face, a lick or two down the chest, or at the flank (not up on something, nor busy with
   *  something of its own) */
  tidy(where: 'face' | 'flank' | 'chest') {
    if (!this.alive || this.isHidden || this.sleep > 0.3 || this.errand || this.trip || this.perched || this.hands.length) return false;
    if (this.act && this.act.name !== 'knead') return false;
    this.stopAct();
    this.act = this.tidying = where === 'face' ? washFace() : where === 'chest' ? groomChest() : groomFlank();
    return true;
  }
  shakeOff(then: 'face' | 'flank' | 'chest' | null) {
    if (!this.alive || this.isHidden || this.sleep > 0.3 || this.errand || this.trip || this.perched || this.hands.length) return false;
    if (this.act && this.act.name !== 'knead') return false;
    this.stopAct();
    const tidy = then === 'face' ? washFace : then === 'chest' ? groomChest : then === 'flank' ? groomFlank : null;
    this.act = this.tidying = tidy ? inTurn('shake', [shakeOff, tidy]) : shakeOff();
    return true;
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

  /** the pompom on the scratching post swung about by your finger: watched; and, in the mood for
   *  it, gone over to and batted at */
  pompomTeased() {
    const B = this.ctx.pompom();
    if (!B || !this.alive || this.isHidden || this.sleep > 0.3 || this.errand || this.trip || this.perched || this.hands.length) return;
    if (this.act instanceof Bat) return;
    this.heard = { at: B.clone(), t: 1.6 + Math.random() * 0.8, tilt: 0 };
    if (this.act && !/^(wander|yawn|groom|wash|to bed|by you|look with you|greet|window|stare)/.test(this.act.name)) return;
    const keen = 0.35 + 0.5 * this.mood.arousal + 0.3 * Math.max(0, this.mood.trust) - 0.6 * this.mood.sleepy;
    if (Math.random() < keen) {
      this.stopAct();
      this.act = new Bat();
    }
  }

  /** thunder (loud 0 .. 1): it looks to the window; awake, a near clap may send it to cover, into
   *  the box if it is out, or to its bed */
  thunder(loud: number, at: THREE.Vector3) {
    if (!this.alive || this.isHidden) return;
    this.hear(at);
    if (loud > 0.4) this.frightAt = at.clone();
    // (sulking in its corner: it starts, and looks, and sulks on)
    if (loud < 0.75 || this.sleep > 0.3 || this.perched || this.errand || this.trip || this.act instanceof Sulk || Math.random() < 0.5) return;
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
  /** where its last fright came from (the window, for the thunder; where the mug broke): on edge
   *  after it, it looks back there now and then, the ears going to it, till it settles */
  private frightAt: THREE.Vector3 | null = null;
  private waryLookIn = 3;
  private waryLook(dt: number) {
    const wary = this.mood.wary ?? 0;
    if (wary < 0.05) { this.frightAt = null; return; }
    if (!this.frightAt || this.sleep > 0.3 || this.act || this.errand || this.trip || this.hands.length || this.heard) return;
    if ((this.waryLookIn -= dt) > 0) return;
    this.waryLookIn = (4 + Math.random() * 8) / (0.4 + wary);
    if (wary < 0.2) return;
    this.cat.motor.flickEar('both', 0.4);
    this.heard = { at: this.frightAt.clone(), t: 0.7 + Math.random() * 0.8, tilt: 0 };
  }

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
  /** what it is doing of its own accord (behave.ts), and what it has in mind to do next (whim.ts:
   *  urges fed by what its eyes are on, each looked at before it is done); whether it was at its
   *  ease this frame (else whatever it had in mind is gone) */
  private act: Act | null = null;
  readonly whim = new Whim();
  private easyNow = false;
  /** its temperament (state.ts: bold, playful, lazy, curious, each -1 .. 1; set by the app) */
  temper = { bold: 0, playful: 0, lazy: 0, curious: 0 };
  /** what it has learnt comes of the things it does with you about (learn.ts; set by the app):
   *  how much keener on each it is for it, and where a lesson goes */
  worthOf: ((key: string) => number) | null = null;
  taught: ((key: string, r: number, e: number) => void) | null = null;
  /** what it did of its own accord lately (its clock), and whether anything good, or bad, came of
   *  it yet; and how long since you did anything at all */
  private tried: { key: string; t: number; paid: boolean; rued: boolean }[] = [];
  private sinceYou = 0;
  private learnMode = '';
  /** what it looks for just now, by the hour it is (habits.ts, 0 .. 1; set by the app): a game
   *  with the red dot, the feathers, the ball of wool; strokes. And where the laser pointer lies,
   *  if it is lying there */
  readonly expects = { laser: 0, wand: 0, yarn: 0, pet: 0, food: 0 };
  pointerAt: THREE.Vector3 | null = null;
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
      laser: () => this.seenLaser(),
      gaze: (id) => (this.nerves.attending?.id === id ? this.nerves.gazePoint : null),
      looking: () => {
        const N = this.nerves;
        return N.awake > 0.6 && (N.place || (N.sc.on && N.sc.peak > 0.5) || N.attending) ? N.gazePoint : null;
      },
      glimpse: () => {
        const N = this.nerves;
        if (N.awake < 0.6) return null;
        if (N.place) return { at: N.gazePoint, k: N.place === 'move' ? 1 : 0.4 };
        const A = N.attending;
        return A && A.kind !== 'you' && A.kind !== 'spot' && A.onset > 0.3 ? { at: A.belief, k: Math.min(1, A.onset) } : null;
      },
      curious: () => this.curiosity(),
      expects: () => this.expects,
      worth: (key) => this.worthOf?.(key) ?? 1,
      pointer: () => this.pointerAt,
      seen: (id) => {
        const u = this.nerves.unit(id);
        return u && u.conf > 0.25 ? u.belief : null;
      },
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
      pompom: () => this.ground?.pompom() ?? null,
      batPompom: (v) => this.ground?.batPompom(v),
      carry: (at, yaw) => this.ground?.carry(at, yaw),
      mouthAt: () => this.mouthAt(),
      pawsAt: () => this.pawsAt(),
      hidden: (p) => this.hiddenFromYou(p),
      kickMouse: (dir, speed, up) => this.ground?.kickMouse?.(dir, speed, up),
      finger: () => this.fingerNow(),
    };
  }

  /** straight into the posture the brain wants, no getting there (opening the app) */
  settle() {
    // (found away as the window was opened: it is where that put it)
    if (this.placed) { this.placed = false; return; }
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

  /** where the middle of the body is in posture p (on the floor), as the cat stands or lies now */
  private middle(p: PoseName) {
    const m = this.cat.motor, f = this.cat.footprint(p), s = Math.sin(m.yaw), c = Math.cos(m.yaw);
    return { x: m.pos.x + f.x * c + f.z * s, z: m.pos.z - f.x * s + f.z * c };
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
  /** how long it has lain (or sat) as it is, settled (s) */
  private lyingFor = 0;
  private lieIn(p: PoseName, atHome: boolean, dt: number) {
    const m = this.cat.motor;
    // (up on its feet to turn round to something behind it (orient): let it, and settle after; not
    // sat straight back down the next moment, the turn undone)
    if (m.goal && !this.touched && !this.hands.length) return;
    if (this.touched) p = this.sameWay(p);
    const b = this.bedSpot(p);
    const e = wrap(b.yaw - m.yaw);
    if (atHome && !this.touched && Math.abs(e) > 0.8) {
      // (only just lain down, it does not get straight up again to lie another way: it lies as it
      // is a while first; only just sat down, it sits a moment before it gets up to curl round)
      if (this.lyingFor < (LYING.includes(m.posture) ? 12 : m.posture === 'sit' ? 4 : 0)) return;
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

  /** a resting pose that fits where it is, away from its bed: flat out on its side only with room
   *  for it either way along the floor (not its nose in the plant's pot), else a loaf */
  private restHere(p: PoseName): PoseName {
    if (p !== 'side') return p;
    const m = this.cat.motor, c = this.ctx;
    const end = (d: number) => this.restEnd.set(m.pos.x + Math.sin(m.yaw) * d, 0, m.pos.z + Math.cos(m.yaw) * d);
    const R = c.room, inside = (q: THREE.Vector3) => q.x > R.minX && q.x < R.maxX && q.z > R.minZ && q.z < R.maxZ;
    return c.clear(end(0.25), 0.06) && inside(this.restEnd) && c.clear(end(-0.25), 0.06) && inside(this.restEnd) ? p : 'loaf';
  }
  private readonly restEnd = new THREE.Vector3();

  /** p, unless going into it from the posture it is in now would turn it round where it lies:
   *  curled up nose to tail, its face is the other way from a loaf's, and it would rise and turn
   *  under the hand, the close view going round with it. Then it stays as it is, and gets up and
   *  turns round properly (lieIn, toBed) once it is let be */
  private sameWay(p: PoseName): PoseName {
    const now = this.cat.motor.targetPosture;
    // (up on its feet, or sat, lying down any way is lying down: it is from lying one way round to
    // lying the other that it would turn about where it lies)
    if (p === now || !LYING.includes(now)) return p;
    return Math.abs(wrap(this.cat.footprint(p).face - this.cat.footprint(now).face)) > 0.7 ? now : p;
  }

  /** what it is doing of its own accord, if anything */
  get doing() {
    return this.act?.name ?? null;
  }

  /** how far into it it is, for those of its acts that go by steps (null: no such act) */
  get doingPhase(): string | null {
    const ph = (this.act as { phase?: unknown } | null)?.phase;
    return typeof ph === 'string' ? ph : null;
  }

  /** a present just laid at your feet (the toy mouse, the cat sat by it looking at you) */
  get presenting() {
    return this.act instanceof Gift && this.act.phase === 'show';
  }

  /** start one of its acts now (for the lab and tests) */
  startAct(name: 'yawn' | 'groom' | 'groom chest' | 'wash' | 'stretch' | 'window' | 'wander' | 'knead' | 'bed' | 'sun' | 'play' | 'sill' | 'box' | 'zoomies' | 'warm' | 'sneeze' | 'stare' | 'rub' | 'scratch' | 'greet' | 'gift' | 'ask' | 'tail' | 'by you' | 'claw' | 'top' | 'fish' | 'pompom' | 'cool' | 'wrestle' | 'crab' | 'shake') {
    // (not on its way somewhere, to the bowls or out of the room: the walk there is its business)
    if (this.perched || this.trip) return;
    this.stopAct();
    const c = this.ctx;
    this.act = name === 'yawn' ? yawn() : name === 'groom' ? groomFlank() : name === 'groom chest' ? groomChest() : name === 'wash' ? washFace()
      : name === 'stretch' ? stretchSideOn(c, 'loaf') : name === 'window' ? toWindow(c) : name === 'wander' ? wander(c)
        : name === 'knead' ? knead() : name === 'sun' ? sunbathe(c) : name === 'play' ? new Play()
          : name === 'sill' && this.sillSpot ? new Sill(this.sillSpot())
            : name === 'box' && this.boxSpot?.() ? new Box(this.boxSpot()!) : name === 'zoomies' ? new Zoomies(c) : name === 'warm' ? warmUp(c) ?? toBed(c, 'loaf') : name === 'cool' ? coolOff(c) ?? toBed(c, 'loaf') : name === 'sneeze' ? sneeze(c) : name === 'stare' ? new Stare(c)
              : name === 'rub' && c.posts().length ? new Rub(c, c.posts()[0]) : name === 'scratch' ? scratchEar() : name === 'greet' ? new Greet(0.9) : name === 'gift' ? new Gift() : name === 'ask' ? new PawGlass(c.finger, true) : name === 'tail' ? new TailChase() : name === 'by you' ? byYou(c) : name === 'claw' && c.scratcher() ? new Claw(c.scratcher()!) : name === 'top' && c.scratcher() ? new Top(c.scratcher()!) : name === 'fish' && c.mouse()?.under ? new Fish() : name === 'pompom' && c.pompom() ? new Bat() : name === 'wrestle' && c.mouse() && !c.mouse()!.under ? new Wrestle() : name === 'crab' ? crab(c) : name === 'shake' ? shakeOff() : toBed(c, 'loaf');
  }

  /** you looking round the room at something over there (x along the room): awake, at its ease
   *  and curious, it strolls over to see for itself, and sits and looks up at you (true if it goes) */
  comeSee(x: number) {
    if (!this.alive || this.isHidden || this.sleep > 0.3 || this.errand || this.trip || this.perched || this.hands.length) return false;
    if (this.mode !== 'rest' && this.mode !== 'alert') return false;
    // (not from a game, a hunt, a fright, or anything else it is set on: from the way to bed, a
    // wander, a wash, it will)
    if (this.act && !/^(to bed|wander|yawn|groom|wash)/.test(this.act.name)) return false;
    this.stopAct();
    this.act = lookWith(this.ctx, x);
    return true;
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
        (this.act as Perching).leave(() => this.laser?.p ?? null);
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
        (this.act as Perching).leave(() => (this.wand?.held ? this.wand.p : null));
      }
      return false;
    }
    this.stopAct();
    this.act = new Tease();
    return true;
  }

  /** something to chase: awake and its own master, it drops what it was doing and plays */
  playNow() {
    if (!this.alive || this.sleep > 0.3 || this.errand || this.trip || this.hidden || this.playRest > 0) return false;
    // (in the box, the ball of wool rolled about out there: an ambush, and then the game; up on
    // the sill or the post, it only watches)
    if (this.perched) {
      if (this.act instanceof Box && !this.afterPerch && (this.mode === 'rest' || this.mode === 'alert') && this.mood.sleepy <= 0.6) {
        this.afterPerch = () => { this.playNow(); };
        this.act.leave(() => (this.lure ? this.toys?.yarn() ?? null : null));
      }
      return false;
    }
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
    c.temper = this.temper;
    this.whim.gain = 6 * (1 + 0.4 * this.temper.curious);
    // (how often something of its own comes into its head: stirred up, often; calm, now and then;
    // drowsy, hardly; a lazy cat less, about dawn and dusk more, and in bouts, livelier a few
    // minutes and then quieter)
    const md = this.mood, bout = 0.75 + 0.25 * (1 + noise1(this.clock * 0.012 + 7));
    this.whim.pace = Math.max(0.15, Math.min(1.6, (0.3 + 1.2 * md.arousal) * (1 - 0.6 * md.sleepy) * (1 - 0.25 * this.temper.lazy)
      * (this.mode === 'alert' ? 1.4 : 1) * (1 + 0.6 * this.dusk) * bout));
    m.lazy = this.temper.lazy;
    c.kneading = this.kneading;
    // at home: on the bed, wherever on it the body has settled (the middle of the body as it lies,
    // or is lying down to: curled up nose to tail, that is a good way from where it stood; judged
    // by where it stood, a curl a step short of the middle would be away from home, and up it would
    // get to go to bed again)
    const mid = this.middle(m.targetPosture);
    const atHome = Math.hypot(mid.x - c.home.x, mid.z - c.home.z) < 0.2;
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
        // (and dreams there as in its bed; a run in its sleep only stretched out on the floor)
        const out = m.posture === 'side' || m.posture === 'back' || CURLED(m.posture);
        this.dream(dt, this.sleep > 0.75 && !this.touched, out && !this.perched);
        return;
      }
      // otherwise sleep is taken in bed: go back to it, turn round once and settle (a hand on it on
      // the way, or as it turns round on the bed: it lies down there and then, under the hand,
      // rather than go round and round under it; on to its bed once it is let be)
      if (this.act && (this.act.name !== 'to bed' || this.hands.length)) this.stopAct();
      // (sent to bed awake and sleepy by the time it is on its way: it means to lie down as it now
      // wants to, curled up, not as it did when it set off, sat up, and up again a moment after to
      // lie down right)
      if (this.act instanceof Walk && this.act.settle && this.act.setOff && this.act.settle !== this.wanted()) this.act = toBed(c, this.wanted());
      if (!this.act && !atHome && !this.touched) this.act = toBed(c, this.wanted());
      if (this.act) {
        if (!this.act.update(dt, c)) this.act = null;
        return;
      }
      this.lieIn(this.wanted(), atHome, dt);
      this.dream(dt, this.sleep > 0.75 && atHome, true);
      this.sleepStretch(dt, this.sleep > 0.75 && atHome && !this.touched);
      this.resettle(dt, this.sleep > 0.75 && atHome && !this.touched && !this.act);
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
      // (its head in the bowl, or at the tray: it gets on with that under the hand)
      if (this.errand?.phase === 'do') return;
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
      // (a boop on the nose is seen through, though; and a hand trapped is held till it is let go)
      if (this.act instanceof Trap) {
        if (!this.hands.length) this.act.release();
        if (!this.act.update(dt, c)) this.stopAct();
        this.swatStep(dt);
        return;
      }
      if (this.act && !(this.act.name === 'knead' && this.kneading) && this.act.name !== 'boop') this.stopAct();
      // (treading with the front paws: in a sphinx, the elbows out; not from curled up nose to tail,
      // which would turn it round under the hand)
      if (!this.act && this.kneading && !this.more && this.sameWay('sphinx') === 'sphinx') this.act = knead();
      if (this.act && !this.act.update(dt, c) && this.act.name === 'boop') { this.stopAct(); this.maybeBlep(0.3); }
      // (the kneading has the posture it treads in; anything else, the one it would rest in: never
      // both, or the body is pulled from one to the other and back, rising and sinking)
      else if (this.act?.name !== 'knead') m.setPosture(this.sameWay(this.wanted() === 'sit' ? 'sit' : atHome ? this.rest : 'loaf'));
      this.swatStep(dt);
      return;
    }
    this.swatStep(dt);
    // a hand on it: it stops for it, whatever it was about (short of a game, a hunt, the zoomies
    // or a fright; up on something, it stays up there): not walked out from under the hand
    if (this.hands.length && this.act && !this.perched
      && !(this.act instanceof Chase || this.act instanceof Tease || this.act instanceof Play || this.act instanceof Hunt || this.act instanceof Zoomies || this.act instanceof Startle || this.act instanceof Trap || this.act instanceof Sulk)) {
      this.stopAct();
      m.stop();
    }
    if (this.act instanceof Trap && !this.hands.length) this.act.release();
    // its own time: carry on with what it is doing, or now and then think of something
    if (this.act) {
      if (!this.act.update(dt, c)) {
        this.act.stop(c);
        // (asked for a moment of you and no one came: then it will be by you)
        const unanswered = this.nudge === 2 && this.act instanceof PawGlass && this.act.unanswered;
        // (asked you for a game of its own accord, and no one came: as often as not, a huff)
        const ignored = !unanswered && this.act instanceof PawGlass && this.act.unanswered && Math.random() < 0.6;
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
        // (made up with in its corner: over to the glass to you, as it would come to say hello)
        const madeUp = this.act instanceof Sulk && this.act.phase === 'round' && this.mode === 'rest' && this.mood.trust > 0.3;
        this.act = unanswered ? byYou(c) : proud ? new Claw(post!) : fetch ? new Gift(true) : madeUp ? new Greet(0.4 + 0.5 * Math.max(0, this.mood.trust)) : ignored ? huff() : null;
        if (ignored) {
          this.cat.sigh();
          this.outside?.sound('sigh', 0.09);
        }
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
    // (not a stroke that came down just off it, the hand on it a moment ago)
    const F = this.fingerNow();
    if (F && F.still < 0.5 && this.clock - this.glassFinger!.since > 1 && this.pawRest <= 0 && this.mood.sleepy < 0.6 && this.sinceHands > 4
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
    this.lieIn(this.mode === 'alert' ? 'sit' : atHome ? this.rest : this.restHere(this.rest), atHome, dt);
    if (this.act) return;
    // (a cat at its ease mostly just sits there: something now and then, not one thing after
    // another; and what it does, it looks at first)
    this.easyNow = true;
    // (your face up close: nothing else comes into its head a while)
    if (this.closeT >= 0 && this.closeT < 6) return;
    const w = this.whim.update(dt, () => idleOptions(c, atHome, m.posture), this.nerves);
    if (w?.act) {
      this.act = w.act;
      this.tried.push({ key: w.o.key, t: this.clock, paid: false, rued: false });
      if (w.o.key === 'investigate' && w.o.about) this.wonder.delete(w.o.about);
    }
    else if (w && Math.random() < 0.5) this.rest = restingPose(this.mood, this.mode, this.warmth);
  }

  get hidden() {
    return this.isHidden;
  }

  /** which side it curls up on this time (picked afresh each time it goes off to sleep) */
  private curlPose: PoseName = Math.random() < 0.5 ? 'curl' : 'curlL';
  private deep = false;

  /** the shape it sleeps in this time: curled up, as a rule, one way or the other; now and then,
   *  a cat quite sure of you, belly up; and as the room warms up, the hotter the oftener flat out on
   *  its side (or its back), and in the cold all but always curled up tight */
  private sleepShape(): PoseName {
    const { hot, cold } = feel(this.warmth), trust = this.mood.trust;
    if (Math.random() < 0.6 * hot) return trust > 0.45 && Math.random() < 0.35 ? 'back' : 'side';
    if (trust > 0.7 && Math.random() < 0.18 * (1 - cold)) return 'back';
    return Math.random() < 0.5 ? 'curl' : 'curlL';
  }

  /** deep asleep, now and then it dreams: a twitch of a paw, the whiskers, an ear; now and then
   *  (if it may: lying where its legs are free) more than a twitch, a run in its sleep; and now and
   *  then a little mew, hardly heard */
  private dream(dt: number, may: boolean, run: boolean) {
    if (!may || (this.dreamIn -= dt) >= 0) return;
    this.dreamIn = 12 + Math.random() * 40;
    // (what it dreams of: whatever its eyes were on most, of late; a run is a chase)
    this.dreamOf = this.mostOnMind();
    this.dreamT = 5 + Math.random() * 4;
    if (run && Math.random() < 0.22) this.cat.motor.dreamRun();
    else {
      this.cat.motor.dreamTwitch();
      if (Math.random() < 0.4) this.twitchAgain = 0.18 + Math.random() * 0.2;
    }
    // (the mouth hardly moving)
    if (Math.random() < 0.18) {
      this.outside?.sound('meowSoft', 0.07);
      this.vocalize('chirp', 0.2, 0.05);
    }
  }
  /** a second twitch coming in a moment (s; less than nothing: none) */
  private twitchAgain = -1;

  /** the brain's wish for a posture right now */
  private wanted(): PoseName {
    if (!this.alive) return 'side';
    // (curled up deep asleep, and a hand it trusts on it: it sleeps on more lightly, curled as it
    // was, not up into a loaf)
    if (this.sleep > 0.75 || (this.deep && this.sleep >= 0.5)) {
      if (!this.deep) {
        this.deep = true;
        this.curlPose = this.sleepShape();
      }
      return this.curlPose;
    }
    if (this.sleep < 0.5) this.deep = false;
    if (this.sleep > 0.3) return 'loaf';
    // (sat up on the alert, down in a loaf at its ease: a moment's ease between two alarms does
    // not have it half down and straight back up)
    this.satUp = (this.liftSlow < 0 ? this.headLift : this.liftSlow) > (this.satUp ? 0.55 : 0.75);
    return this.satUp ? 'sit' : 'loaf';
  }

  update(dt: number) {
    const m = this.cat.motor;
    this.liftSlow = this.liftSlow < 0 ? this.headLift : this.liftSlow + (this.headLift - this.liftSlow) * (1 - Math.exp(-dt / (this.headLift > this.liftSlow ? 0.5 : 1.5)));
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
    // (the trot to its dinner stopped on the way, by a hand or anything else: its keenness with it)
    if (this.keenWalk && this.errand?.phase !== 'go') {
      this.keenWalk = false;
      m.eager = 0;
    }
    // (right up against a thing or in it on purpose, or up off the floor: no keeping clear of it)
    m.ghost = !!this.errand || this.perched || this.isHidden || this.act instanceof Claw || this.act instanceof Rub || this.act instanceof Top
      || this.act instanceof Sill || this.act instanceof Box || this.act instanceof Bat || this.act instanceof Fish || (this.act instanceof Chase && this.act.up);
    this.lyingFor = (LYING.includes(m.posture) || m.posture === 'sit') && m.targetPosture === m.posture && !m.goal ? this.lyingFor + dt : 0;
    this.leanIntoHand(dt);
    this.askAfter(dt);
    this.lickHand(dt);
    this.blepNow(dt);
    this.keepTime(dt);
    this.waryLook(dt);
    // (the lights out a moment ago, and the cat still free: off it goes)
    if (this.lightsOutIn > 0 && (this.lightsOutIn -= dt) <= 0 && !this.act && !this.hands.length && this.sleep < 0.3 && !this.perched) {
      this.act = new Zoomies(this.ctx);
    }
    this.playRest = Math.max(0, this.playRest - dt);
    this.huntRest = Math.max(0, this.huntRest - dt);
    this.pawRest = Math.max(0, this.pawRest - dt);
    this.clock += dt;
    this.closeLook(dt);
    this.sense(dt);
    this.reckon(dt);
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
      // (only once it has seen it and has its eyes on it; the more it has a mind to hunt, the
      // sooner it is off)
      this.laserT += dt * this.nerves.on('dot') * (0.6 + this.nerves.hunt);
      if (this.laserT > this.laserNeed && this.chaseNow()) this.laserT = 0;
    } else {
      this.laserT = 0;
      this.laserNeed = (0.15 + Math.random() * 0.45) * (1 - 0.6 * this.expects.laser);
    }
    // the feathers on the wand dangled and twitched: watched a moment, then it has to have them
    this.teaseRest = Math.max(0, this.teaseRest - dt);
    const W = this.wand;
    if (W && W.held && !(this.act instanceof Tease)) {
      this.wandT += dt * (W.v.length() > 0.15 ? 1 : 0.2);
      if (this.wandT > this.wandNeed && this.teaseNow()) this.wandT = 0;
    } else {
      this.wandT = 0;
      this.wandNeed = (0.3 + Math.random() * 0.6) * (1 - 0.6 * this.expects.wand);
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
    if (!this.easyNow && this.whim.intent) this.whim.drop(this.nerves);
    this.easyNow = false;
    // asleep, now and then it opens an eye to see what you are up to (the upper one, lying on
    // its side; the brain says when and how far)
    {
      // (and the lamp just come on: a slit of an eye against it, a moment, and shut again)
      const want = this.alive && this.sleep > 0.5 ? Math.min(0.6, Math.max(this.eyeTarget, this.dazzle > 0.5 ? 0.3 : 0)) : 0;
      this.cat.peek += (want - this.cat.peek) * (1 - Math.exp(-dt * (want > this.cat.peek ? 4 : 6)));
      this.cat.peekEye = m.posture === 'curlL' ? 1 : 0;
      // (awake where it lay curled up asleep: the eyes open, slowly, as waking)
      const up = this.alive && this.sleep < 0.3 ? 1 : 0;
      this.cat.awake += (up - this.cat.awake) * (1 - Math.exp(-dt * (up > this.cat.awake ? 2.5 : 6)));
    }
    // eyes on the finger, or on you (through the window); asleep, dead or busy, nowhere (up on
    // the sill it looks where it likes: out of the window)
    const busy = this.errand || (this.act && this.act.name !== 'window' && this.act.name !== 'knead' && this.act.name !== 'greet' && this.act.name !== 'gift'
      && !(canGlance(this.act) && this.act.glancing));
    const N = this.nerves, seen = this.alive && this.sleep <= 0.5 ? N.attending : null;
    // (the eyes their own, ahead of the head, only while what it sees is what it looks at)
    m.eyeAt = this.act instanceof Chase && seen?.id === 'dot' ? N.gazePoint : null;
    let tilt = 0;
    if ((this.act instanceof Sill || this.act instanceof Play || this.act instanceof Hunt || this.act instanceof Box || this.act instanceof Zoomies || this.act instanceof Stare || this.act?.ownGaze) && this.mode !== 'enjoy') { /* the act decides */ }
    else if (!this.alive || this.sleep > 0.5) m.lookAt(null);
    else if (busy) {
      // (on its way somewhere, its eyes still go to a thing that moves, and the head a little way
      // after them; otherwise ahead, where it is going)
      const going = (this.errand || this.act instanceof Walk) && m.goal && m.speed > 0.05;
      if (going && N.place === 'move' && N.awake > 0.6) { m.lookAt(N.gazePoint, 0.5); m.eyeAt = N.gazePoint; }
      else m.lookAt(null);
    }
    else if (seen && seen.kind !== 'you' && seen.kind !== 'hand') {
      // whatever has its attention: the eyes on it in jumps, the head after them; and if it is
      // round further than the head will turn, a moment, and the body turns round to it
      m.lookAt(N.gazePoint, 1);
      m.eyeAt = N.gazePoint;
      this.orient(dt, N.gazePoint);
      // (a bird on the ledge: now and then a chatter at it)
      if (seen.kind === 'bird' && (this.chatterIn -= dt) <= 0) {
        this.chatterIn = 2.5 + Math.random() * 3;
        if (Math.random() < 0.6) this.outside?.chirp();
      }
    } else if (N.place === 'move' && N.awake > 0.6) {
      // (something it knows nothing about moved, there in front of it: a curtain swinging, a
      // shadow, a thing gone flying; its eyes go to it, and its head after them, and stay a moment
      // after it is still)
      m.lookAt(N.gazePoint, 0.9);
      m.eyeAt = N.gazePoint;
    } else if (this.heard && (this.heard.t -= dt) > 0) {
      m.lookAt(this.heard.at, 0.8);
      tilt = this.heard.tilt;
    }
    else if (this.gazeTarget && this.gazeAside) m.lookAt(this.glanceAside(this.gazeTarget), 0.9);
    else if (this.gazeTarget && this.screenToWorld(this.gazeTarget.x, this.gazeTarget.y, this.look)) m.lookAt(this.look, 0.9);
    else if (seen) { m.lookAt(N.gazePoint, this.trip ? 0.3 : 0.85); m.eyeAt = N.gazePoint; }
    else if (this.avertT > 0) m.lookAt(this.lookAway, 0.7);
    // (your hands about, or a slow blink for you, or come to say hello: on you)
    else if (this.sinceYou < 4 || this.cat.motor.slowBlinking || (this.act instanceof Greet && this.act.phase !== 'see') || this.presenting) m.lookAt(this.viewer(), this.trip ? 0.3 : 0.85);
    else if (N.awake > 0.6 && (N.place === 'still' || (N.sc.on && N.sc.peak > 0.5))) {
      // (a thing in the room that stands out, or a place it knows: its eyes on it a while, the head
      // going a little way after them; then on to the next, or nowhere much)
      m.lookAt(N.gazePoint, 0.6);
      m.eyeAt = N.gazePoint;
    } else m.lookAt(this.restingGaze(dt), 0.5);
    if (this.puzzledFor > 0) {
      this.puzzledFor -= dt;
      if (!busy && this.alive && this.sleep <= 0.5) tilt = this.puzzledTilt;
    }
    m.tilt = tilt;
  }

  /** nowhere much: ahead of it and down a little, the eyes resting on one place a while, then on
   *  another near it (eyes rest, or jump; they do not drift about) */
  private readonly restAt = new THREE.Vector3();
  private readonly restEyes = { yaw: 0, pitch: -0.3, t: 0 };
  private restingGaze(dt: number) {
    const R = this.restEyes;
    if ((R.t -= dt) <= 0) {
      R.t = 2.5 + Math.random() * 6;
      R.yaw = 0.3 * (Math.random() * 2 - 1);
      R.pitch = -0.18 - 0.2 * Math.random();
    }
    const a = this.cat.motor.yaw + R.yaw;
    return this.restAt.set(Math.sin(a), R.pitch, Math.cos(a)).multiplyScalar(1.1).add(this.eyeW);
  }

  private glanceAside(of: object) {
    if (this.aside?.of !== of) {
      const m = this.cat.motor, side = Math.random() < 0.5 ? -1 : 1;
      const yaw = m.yaw + side * (0.35 + Math.random() * 1.05), pitch = -0.15 + Math.random() * 0.5, d = 0.8 + Math.random() * 1.2;
      const at = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(d).add(this.eyeW);
      this.aside = { of, at };
    }
    return this.aside.at;
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

  /**
   * A long sleep: now and then it half wakes and shifts, up a little, round, and down again the
   * other way, or flat out on its side, or (quite sure of you) on its back; settled, a sigh. Not
   * in the middle of a stretch, nor with a paw over its eyes in the sun.
   */
  private settleIn = 480 + Math.random() * 720;
  private sighIn = 0;
  private resettle(dt: number, may: boolean) {
    const m = this.cat.motor;
    if (this.sighIn > 0 && (this.sighIn -= dt) <= 0 && may && m.settled) this.sigh();
    if (!may || !this.deep || !m.settled || m.targetPosture !== m.posture || this.stretchT > 0 || this.shade.u > 0 || this.scoot) return;
    if ((this.settleIn -= dt) > 0) return;
    this.settleIn = 480 + Math.random() * 720;
    const was = this.curlPose, r = Math.random();
    // (flat out the more, the hotter it is; in the cold, from one curl into the other)
    const { hot, cold } = feel(this.warmth), flat = 0.25 * (1 - 0.8 * cold) + 0.4 * hot;
    let next: PoseName = was === 'curl' ? 'curlL' : was === 'curlL' ? 'curl' : Math.random() < 1 - hot ? (Math.random() < 0.5 ? 'curl' : 'curlL') : was === 'side' && this.mood.trust > 0.45 ? 'back' : 'side';
    if (was !== 'side' && r < flat) next = 'side';
    else if (was !== 'back' && this.mood.trust > 0.7 && r < flat + 0.15 * (1 - cold)) next = 'back';
    this.curlPose = next;
    this.sighIn = 6 + Math.random() * 4;
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
    this.lookToYou();
  }

  /** something gave it a start: a moment after, a look at you (what do you make of it?), as a cat
   *  does at the one it lives with, the more the surer of you it is */
  private referIn = 0;
  private lookToYou() {
    if (this.mood.trust > 0.15 && Math.random() < 0.35 + 0.5 * this.mood.trust) this.referIn = 0.7 + Math.random() * 0.9;
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

  vocalize(kind: 'trill' | 'meow' | 'meowSoft' | 'meowPlead' | 'chirp' | 'grumble', dur: number, delay: number) {
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
        // done: up from it, and called back about the room (arrive)
        e.phase = 'off';
        m.layer = null;
        m.setPosture('stand');
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
      // (a sniff at it first; then mouthfuls, the head up between them to chew and look about; or
      // lapping, with now and then a lick of the lips)
      e.plan ??= mealPlan(e.reason, e.dur);
      m.layer = { pose: mealLayer(e.reason, e.t, e.plan), w: Math.min(1, e.t * 1.5) };
    } else if (e.phase === 'off' && this.mode !== 'away') {
      // (done, and nobody waiting to call it back: about the room again of itself)
      this.arrive();
    }
  }

  /** the errand done where you can see it (at the bowl, up out of the box), and waiting to be
   *  called back about the room */
  get errandDone() {
    return this.errand?.phase === 'off';
  }

  /** a body in a room keeps to it: away (an errand, a sulk), the cat is in it all the same */
  readonly inRoom = true;

  /** a corner to sulk in: the one further from where it is (not: the one it is in) */
  private corner(not?: SulkSpot): SulkSpot | null {
    const S = (this.spots?.sulk ?? []).filter((k) => k !== not);
    if (!S.length) return null;
    const m = this.cat.motor;
    return S.reduce((a, b) => (Math.hypot(b.to.x - m.pos.x, b.to.z - m.pos.z) > Math.hypot(a.to.x - m.pos.x, a.to.z - m.pos.z) ? b : a));
  }

  /** sulking in its corner: a hand on it is shrugged off (again: a hand that will not leave it be,
   *  it is up and off to the other corner) */
  sulkTouched(again: boolean) {
    const k = this.act instanceof Sulk ? this.act : null;
    if (!k) return;
    this.cat.motor.flickEar('both', 1.1);
    if (again && k.phase === 'sit') {
      const other = this.corner(k.spot);
      if (other) { k.moveTo(other); return; }
    }
    k.rebuff();
  }
  /** called as it sulks in its corner: an ear to it, and a look back over its shoulder */
  sulkHeard() {
    if (!(this.act instanceof Sulk)) return;
    this.cat.motor.flickEar('both', 0.8);
    this.act.heard();
  }
  /** made up with in its corner: round to you, and a slow blink */
  sulkOver() {
    if (this.act instanceof Sulk) this.act.makeUp();
  }

  /** found away as the window is opened: in the room all the same. At the bowl (or in the box),
   *  at it a little while yet; sulking, in its corner with its back to you; out and about (a wander
   *  round the house, as the cat sees it), somewhere about the room, by one of its things */
  private placed = false;
  awayAt(reason: string) {
    const m = this.cat.motor;
    this.placed = true;
    // (awake: at it, or sulking, or about)
    this.sleep = 0;
    this.setHidden(false);
    // (up on something when you left: it has been down off it since, whatever else)
    const wasUp = this.perched || this.cat.perch !== null || this.cat.liftHold !== null;
    if (this.act) { this.act.stop(this.ctx); this.act = null; }
    this.errand = null;
    this.trip = null;
    this.washAfter = null;
    this.cat.perch = null;
    this.cat.liftHold = null;
    m.layer = null;
    m.zoom = 0;
    const spot = !this.spots ? null : reason === 'eat' ? this.spots.food : reason === 'drink' ? this.spots.water : reason === 'litter' ? this.spots.litter : null;
    if (spot) {
      const face = Math.atan2(spot.x - this.home.x, spot.z - this.home.z);
      const reach = reason === 'litter' ? 0 : 0.2;
      this.cat.place(spot.x - Math.sin(face) * reach, spot.z - Math.cos(face) * reach, face);
      m.snap('crouch');
      this.trip = { kind: 'errand' };
      this.washAfter = null;
      this.errand = { reason, phase: 'do', t: 0, dur: 5 + Math.random() * 6, dir: spot.x >= 0 ? 1 : -1 };
      return;
    }
    if (reason === 'sulk') {
      const k = this.corner();
      if (k) {
        this.cat.place(k.to.x, k.to.z, k.face);
        m.snap('loaf');
        const act = new Sulk(k);
        act.sat();
        this.act = act;
        return;
      }
    }
    // (out and about: by one of its things, nosing at it, and so back to you by its own way)
    const S = this.spots?.sniff ?? [];
    const w = S.length ? S[Math.floor(Math.random() * S.length)] : null;
    if (w) {
      this.cat.place(w.to.x, w.to.z, w.face);
      m.snap('stand');
    } else if (wasUp) {
      // (nowhere in particular to be: at home, not still in the air over the floor where it was)
      this.cat.place(this.home.x, this.home.z, m.yaw);
      m.snap('stand');
    }
  }

  bolt(dir: number, onDone?: () => void, calm = false, reason?: string, keen = 0) {
    // (still at the bowl from the last errand, the mind on another already: that one is over)
    if (this.trip?.kind === 'errand') {
      this.errand = null;
      this.trip = null;
      this.washAfter = null;
      this.cat.motor.layer = null;
    }
    if (this.trip || this.isHidden) return;
    if (this.perched) {
      // down off the sill first
      this.afterPerch = () => this.bolt(dir, onDone, calm, reason, keen);
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
      // (to its dinner, keen: up and away at once, at a trot, quick round to it)
      m.eager = keen;
      this.keenWalk = keen > 0;
      m.walkTo(at, 0.3 + 0.4 * keen, face, () => {
        m.eager = 0;
        this.keenWalk = false;
        if (this.errand) {
          this.errand.phase = 'do';
          this.errand.t = 0;
        }
        onDone?.();
      });
      return;
    }
    // off into the far corner of the room to sulk, its back to you (in view, or for the view to be
    // taken round to: never out of the room)
    const k = this.corner();
    if (k) {
      this.act = new Sulk(k, onDone, !calm);
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
    if (!this.isHidden) {
      // in the room all along (the bowl, the box, a corner it sulked in): about it again from
      // there, and back to its bed in its own time, a walk a hand can stop it in; from the litter
      // box, as often as not, a mad dash round the room first, as cats will
      const rocket = this.errand?.reason === 'litter' && Math.random() < 0.5;
      this.errand = null;
      this.washAfter = null;
      this.trip = null;
      if (this.act) { this.act.stop(this.ctx); this.act = null; }
      m.layer = null;
      m.zoom = 0;
      if (rocket) {
        this.ctx.sound('scrabble', 0.25);
        this.act = new Zoomies(this.ctx);
      } else this.act = toBed(this.ctx, this.wanted());
      onDone?.();
      return;
    }
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
