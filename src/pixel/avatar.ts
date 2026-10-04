import * as THREE from 'three';
import type { Cat3D } from '../cat3d/cat';
import { POSES, type PoseLayer, type PoseName } from '../cat3d/pose';
import { NEUTRAL, type Mood } from '../cat3d/mood';
import type { Avatar } from '../sim/avatar';
import type { EarMood, TailMood } from '../rig/animator';
import { chooseAct, groomChest, groomFlank, knead, restingPose, sneeze, toBed, toWindow, wander, warmUp, washFace, yawn, type Act, type Ctx, sunbathe, Play, Sill, Hunt, Box, Zoomies, Walk, Stare, Rub, scratchEar, wakeUp, stretchSideOn, type SillSpot } from './behave';

const LYING: PoseName[] = ['loaf', 'sphinx', 'side', 'curl', 'curlL'];
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
 * intentions here (eye targets, ear and tail moods, fur ripple, puff) are kept but not drawn.
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
  spots: { food: THREE.Vector3; water: THREE.Vector3; litter: THREE.Vector3; sniff?: { to: THREE.Vector3; face: number }[]; posts?: THREE.Vector3[] } | null = null;
  /** a place in the sun on the floor, if there is one now */
  sunSpot: (() => THREE.Vector3 | null) | null = null;
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
  } | null = null;
  /** after a hunt, a while before the next */
  private huntRest = 0;
  /** fingers on the cat now (screen points, set by the app), and what is under one: a bone of
   *  the body and the point on it */
  hands: { sx: number; sy: number }[] = [];
  feel: ((sx: number, sy: number) => { bone: string; point: THREE.Vector3 } | null) | null = null;
  private rub = 0;
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
  /** thunder (loud 0 .. 1): it looks to the window; awake, a near clap may send it to cover, into
   *  the box if it is out, or to its bed */
  thunder(loud: number, at: THREE.Vector3) {
    if (!this.alive || this.isHidden) return;
    this.hear(at);
    if (loud < 0.75 || this.sleep > 0.3 || this.perched || this.errand || this.trip || Math.random() < 0.5) return;
    if (this.act && (this.act.name === 'box' || this.act.name === 'to bed')) return;
    this.stopAct();
    const box = this.boxSpot?.();
    this.act = box ? new Box(box) : toBed(this.ctx, 'loaf');
  }

  /** something to do once it is down off the sill (asked to go somewhere while up there) */
  private afterPerch: (() => void) | null = null;

  /** up on the sill or in the box (or jumping to or from them): it has to come out before anything
   *  else */
  private get perched() {
    return (this.act instanceof Sill || this.act instanceof Box) && this.act.up;
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
      visitor: () => this.visitor,
      sun: () => this.sunSpot?.() ?? null,
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
      chirp: () => this.outside?.chirp(),
      bug: () => this.outside?.bug?.() ?? null,
      scareBug: (from) => this.outside?.scareBug?.(from),
      drop: (p) => this.outside?.drop?.(p),
      perch: (h) => { this.cat.perch = h; },
      hold: (y) => { this.cat.liftHold = y; },
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
   * ends nose to tail, so it lies down facing the wall.
   */
  bedSpot(p: PoseName) {
    return this.lieAt(p, this.home, this.home.yaw);
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
    if (!atHome || m.goal || !LYING.includes(m.targetPosture)) return;
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

  /** start one of its acts now (for the lab and tests) */
  startAct(name: 'yawn' | 'groom' | 'groom chest' | 'wash' | 'stretch' | 'window' | 'wander' | 'knead' | 'bed' | 'sun' | 'play' | 'sill' | 'box' | 'zoomies' | 'warm' | 'sneeze' | 'stare' | 'rub' | 'scratch') {
    // (not on its way somewhere, to the bowls or out of the room: the walk there is its business)
    if (this.perched || this.trip) return;
    this.stopAct();
    const c = this.ctx;
    this.act = name === 'yawn' ? yawn() : name === 'groom' ? groomFlank() : name === 'groom chest' ? groomChest() : name === 'wash' ? washFace()
      : name === 'stretch' ? stretchSideOn(c, 'loaf') : name === 'window' ? toWindow(c) : name === 'wander' ? wander(c)
        : name === 'knead' ? knead() : name === 'sun' ? sunbathe(c) : name === 'play' ? new Play()
          : name === 'sill' && this.sillSpot ? new Sill(this.sillSpot())
            : name === 'box' && this.boxSpot?.() ? new Box(this.boxSpot()!) : name === 'zoomies' ? new Zoomies(c) : name === 'warm' ? warmUp(c) ?? toBed(c, 'loaf') : name === 'sneeze' ? sneeze(c) : name === 'stare' ? new Stare(c)
              : name === 'rub' && c.posts().length ? new Rub(c, c.posts()[0]) : name === 'scratch' ? scratchEar() : toBed(c, 'loaf');
  }

  /** something to chase: awake and its own master, it drops what it was doing and plays */
  playNow() {
    if (!this.alive || this.sleep > 0.3 || this.errand || this.trip || this.hidden || this.perched || this.playRest > 0) return false;
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
    if ((this.act instanceof Sill || this.act instanceof Box) && this.act.up) {
      this.act.leave();
      return;
    }
    this.act.stop(this.ctx);
    this.act = null;
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
    this.shadeEyes(dt, this.alive && this.sleep > 0.75 && atHome && !this.touched && !this.act && this.stretchT <= 0 && this.glare > 0.4);
    if (!this.alive) {
      this.stopAct();
      m.setPosture('side');
      return;
    }
    if (this.act instanceof Sill || this.act instanceof Box || this.act instanceof Walk) this.act.nap = this.sleep;
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
        this.cat.motor.dreamTwitch();
        if (Math.random() < 0.4) setTimeout(() => this.cat.motor.dreamTwitch(), 180 + Math.random() * 200);
      }
      this.sleepStretch(dt, this.sleep > 0.75 && atHome && !this.touched);
      this.nodOff(dt, this.sleep <= 0.75 && atHome && !this.touched && !this.act && m.posture === 'loaf' && m.targetPosture === 'loaf' && m.settled);
      return;
    }
    this.nodOff(dt, false);
    if (this.mode === 'enjoy' || this.mode === 'annoyed' || this.mode === 'angry') {
      // in somebody's hands: stop and stay; tread with the front paws when it is happy there
      if (this.perched) { this.act!.update(dt, c); return; }
      if (this.act && !(this.act.name === 'knead' && this.kneading)) this.stopAct();
      if (!this.act && this.kneading) this.act = knead();
      if (this.act) this.act.update(dt, c);
      else m.setPosture(this.wanted() === 'sit' ? 'sit' : atHome ? this.rest : 'loaf');
      return;
    }
    // its own time: carry on with what it is doing, or now and then think of something
    if (this.act) {
      if (!this.act.update(dt, c)) {
        this.act.stop(c);
        // played itself out: not again for a while
        if (this.act instanceof Play) this.playRest = this.act.tired ? 60 : 6;
        if (this.act instanceof Hunt) this.huntRest = 40 + Math.random() * 60;
        this.act = null;
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
    if (this.sleep > 0.75) {
      if (!this.deep) {
        this.deep = true;
        this.curlPose = Math.random() < 0.5 ? 'curl' : 'curlL';
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
      if (this.act instanceof Sill || this.act instanceof Box) { this.act.stop(this.ctx); this.act = null; }
      f();
    }
    if (this.errand) this.doErrand(dt);
    this.leanIntoHand(dt);
    this.playRest = Math.max(0, this.playRest - dt);
    this.huntRest = Math.max(0, this.huntRest - dt);
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
      const want = this.alive && this.sleep > 0.5 ? Math.min(0.6, this.eyeTarget) : 0;
      this.cat.peek += (want - this.cat.peek) * (1 - Math.exp(-dt * (want > this.cat.peek ? 4 : 6)));
      this.cat.peekEye = m.posture === 'curlL' ? 1 : 0;
    }
    // eyes on the finger, or on you (through the window); asleep, dead or busy, nowhere (up on
    // the sill it looks where it likes: out of the window)
    const busy = this.errand || (this.act && this.act.name !== 'window' && this.act.name !== 'knead');
    let tilt = 0;
    if ((this.act instanceof Sill || this.act instanceof Play || this.act instanceof Hunt || this.act instanceof Box || this.act instanceof Zoomies || this.act instanceof Stare || this.act?.ownGaze) && this.mode !== 'enjoy') { /* the act decides */ }
    else if (!this.alive || this.sleep > 0.5 || busy) m.lookAt(null);
    else if (this.lure) m.lookAt(this.lure, 1);
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
    m.layer = {
      pose: {
        LF: { z: P.LF.z + 0.07 + tr, y: P.LF.y + 0.008, flex: 0 }, RF: { z: P.RF.z + 0.055 + tr, flex: 0 },
        LH: { z: P.LH.z - 0.06, flex: 0 }, RH: { z: P.RH.z - 0.045, flex: 0 },
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
      x: A.x + (0.28 - A.x) * e, y: A.y + (0.06 - A.y) * e + 0.045 * Math.sin(Math.PI * e), z: A.z + (-0.08 - A.z) * e,
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

  swat() {
    // a quick cuff with the near forepaw: for now a startle with the ears back
    this.cat.motor.jolt(0.8);
    this.cat.motor.flickTail(1.5);
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
      m.layer = { pose: { neckPitch: -0.85, headPitch: -0.25, jaw: chew }, w: Math.min(1, e.t * 1.5) };
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
      (this.act as Sill | Box).leave();
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
