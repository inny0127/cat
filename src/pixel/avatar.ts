import * as THREE from 'three';
import type { Cat3D } from '../cat3d/cat';
import type { PoseName } from '../cat3d/pose';
import { NEUTRAL, type Mood } from '../cat3d/mood';
import type { Avatar } from '../sim/avatar';
import type { EarMood, TailMood } from '../rig/animator';
import { Stretch, chooseAct, groomChest, groomFlank, knead, restingPose, toBed, toWindow, wander, yawn, type Act, type Ctx, sunbathe, Play, Sill, type SillSpot } from './behave';

const LYING: PoseName[] = ['loaf', 'sphinx', 'side', 'curl'];
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

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
  spots: { food: THREE.Vector3; water: THREE.Vector3; litter: THREE.Vector3; sniff?: { to: THREE.Vector3; face: number }[] } | null = null;
  /** a place in the sun on the floor, if there is one now */
  sunSpot: (() => THREE.Vector3 | null) | null = null;
  /** the ball of wool to play with */
  toys: { yarn: () => THREE.Vector3; kick: (dir: THREE.Vector3, speed: number) => void } | null = null;
  /** the windowsill to sit on */
  sillSpot: (() => SillSpot) | null = null;
  /** how hard it is raining outside */
  set rain(r: number) {
    this.ctx.rain = r;
  }
  /** what goes by outside the window, and the chirp it gets */
  outside: { birds: () => THREE.Vector3 | null; chirp: () => void; sound: (name: string, gain: number) => void } | null = null;
  /** something to do once it is down off the sill (asked to go somewhere while up there) */
  private afterPerch: (() => void) | null = null;

  /** up on the sill (or jumping to or from it): it has to come down before anything else */
  private get perched() {
    return this.act instanceof Sill && this.act.up;
  }
  private fading: { t: number; dur: number; onDone?: () => void } | null = null;
  private readonly look = new THREE.Vector3();
  /** the brain's mode and the cat's feelings (set by the app each frame) */
  mode = 'sleep';
  mood: Mood = { ...NEUTRAL };
  /** what it is doing of its own accord (behave.ts), and when to think of something else */
  private act: Act | null = null;
  private nextActIn = 6;
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
      sniff: () => this.spots?.sniff ?? [],
      sun: () => this.sunSpot?.() ?? null,
      lieAt: (p, at, face) => this.lieAt(p, at, face),
      yarn: () => this.toys?.yarn() ?? null,
      kick: (dir, speed) => this.toys?.kick(dir, speed),
      sill: () => this.sillSpot?.() ?? null,
      birds: () => this.outside?.birds() ?? null,
      sound: (name, gain) => this.outside?.sound(name, gain),
      chirp: () => this.outside?.chirp(),
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
    const dx = b.to.x - m.pos.x, dz = b.to.z - m.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.004 && d < 0.3) {
      const step = Math.min(d, 0.08 * dt);
      m.pos.x += (dx / d) * step;
      m.pos.z += (dz / d) * step;
    }
    if (Math.abs(e) <= 0.8) m.yaw = wrap(m.yaw + Math.max(-0.3 * dt, Math.min(0.3 * dt, e)));
  }

  /** what it is doing of its own accord, if anything */
  get doing() {
    return this.act?.name ?? null;
  }

  /** start one of its acts now (for the lab and tests) */
  startAct(name: 'yawn' | 'groom' | 'groom chest' | 'stretch' | 'window' | 'wander' | 'knead' | 'bed' | 'sun' | 'play' | 'sill') {
    if (this.perched) return;
    this.stopAct();
    const c = this.ctx;
    this.act = name === 'yawn' ? yawn() : name === 'groom' ? groomFlank() : name === 'groom chest' ? groomChest()
      : name === 'stretch' ? new Stretch('loaf') : name === 'window' ? toWindow(c) : name === 'wander' ? wander(c)
        : name === 'knead' ? knead() : name === 'sun' ? sunbathe(c) : name === 'play' ? new Play()
          : name === 'sill' && this.sillSpot ? new Sill(this.sillSpot()) : toBed(c, 'loaf');
  }

  /** something to chase: awake and its own master, it drops what it was doing and plays */
  playNow() {
    if (!this.alive || this.sleep > 0.3 || this.errand || this.trip || this.hidden || this.perched) return false;
    if (this.mode !== 'rest' && this.mode !== 'alert') return false;
    if (this.act?.name === 'play') return true;
    if (this.mood.sleepy > 0.6) return false;
    this.stopAct();
    this.act = new Play();
    return true;
  }

  private stopAct() {
    if (!this.act) return;
    // up on the sill it is not simply dropped: it is asked down, and carries on until it is
    if (this.act instanceof Sill && this.act.up) {
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
    if (!this.alive) {
      this.stopAct();
      m.setPosture('side');
      return;
    }
    if (this.sleep > 0.3) {
      // sleep is taken in bed: go back to it, turn round once and settle (down off the sill first)
      if (this.act && this.act.name !== 'to bed') this.stopAct();
      if (this.perched) {
        if (!this.act!.update(dt, c)) this.act = null;
        return;
      }
      if (!this.act && !atHome) this.act = toBed(c, this.wanted());
      if (this.act) {
        if (!this.act.update(dt, c)) this.act = null;
        return;
      }
      this.lieIn(this.wanted(), atHome, dt);
      return;
    }
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
        this.act = null;
      }
      return;
    }
    this.lieIn(this.mode === 'alert' ? 'sit' : this.rest, atHome, dt);
    if (this.act) return;
    this.nextActIn -= dt;
    if (this.nextActIn < 0) {
      this.nextActIn = 4 + Math.random() * 8;
      this.act = chooseAct(c, atHome, m.posture);
      if (!this.act && Math.random() < 0.5) this.rest = restingPose(this.mood, this.mode);
    }
  }

  get hidden() {
    return this.isHidden;
  }

  /** the brain's wish for a posture right now */
  private wanted(): PoseName {
    if (!this.alive) return 'side';
    if (this.sleep > 0.75) return 'curl';
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
      if (this.act instanceof Sill) { this.act.stop(this.ctx); this.act = null; }
      f();
    }
    if (this.errand) this.doErrand(dt);
    if (!this.trip) this.behave(dt);
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
    // eyes on the finger, or on you (through the window); asleep, dead or busy, nowhere (up on
    // the sill it looks where it likes: out of the window)
    const busy = this.errand || (this.act && this.act.name !== 'window' && this.act.name !== 'knead');
    if (this.act instanceof Sill && this.mode !== 'enjoy') { /* the sill decides */ }
    else if (!this.alive || this.sleep > 0.5 || busy) m.lookAt(null);
    else if (this.gazeTarget && this.screenToWorld(this.gazeTarget.x, this.gazeTarget.y, this.look)) m.lookAt(this.look, 0.9);
    else m.lookAt(this.viewer(), this.trip ? 0.3 : 0.85);
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
    this.cat.motor.slowBlink();
  }

  hiss() {
    this.cat.motor.hiss();
  }

  /** eating and drinking where you can see: crouched with the head in the bowl, chewing or lapping */
  private doErrand(dt: number) {
    const e = this.errand!, m = this.cat.motor;
    e.t += dt;
    if (e.phase === 'do') {
      if (e.t > e.dur) {
        // done: off out of the room, the far way round
        e.phase = 'off';
        m.layer = null;
        m.setPosture('stand');
        m.walkTo(new THREE.Vector3(e.dir * (this.offstage + 0.35), 0, m.pos.z - 0.1), 0.3);
        return;
      }
      m.setPosture('crouch');
      const chew = e.reason === 'eat' ? 0.25 * Math.max(0, Math.sin(e.t * 8)) : 0.14 * Math.max(0, Math.sin(e.t * 15));
      m.layer = { pose: { neckPitch: -0.85, headPitch: -0.25, jaw: chew }, w: Math.min(1, e.t * 1.5) };
    } else if (e.phase === 'off' && Math.abs(m.pos.x) > this.offstage) {
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
      (this.act as Sill).leave();
      return;
    }
    const m = this.cat.motor;
    const spot = !calm || !this.spots ? null : reason === 'eat' ? this.spots.food : reason === 'drink' ? this.spots.water : reason === 'litter' ? this.spots.litter : null;
    if (spot) {
      // walk to it and stop with the mouth over the bowl (the box: in it); the errand itself
      // (the bowl going down) happens on arrival
      const face = Math.atan2(spot.x - m.pos.x, spot.z - m.pos.z);
      const reach = reason === 'litter' ? 0 : 0.2;
      const at = new THREE.Vector3(spot.x - Math.sin(face) * reach, 0, spot.z - Math.cos(face) * reach);
      this.trip = { kind: 'errand' };
      this.errand = {
        reason: reason!, phase: 'go', t: 0, dur: reason === 'eat' ? 26 + Math.random() * 14 : reason === 'drink' ? 12 + Math.random() * 8 : 0,
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
    this.errand = null;
    m.layer = null;
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
      this.cat.place(this.home.x, this.home.z, this.home.yaw);
    }
  }
}
