import * as THREE from 'three';
import type { Cat3D } from '../cat3d/cat';
import type { PoseName } from '../cat3d/pose';
import type { Avatar } from '../sim/avatar';
import type { EarMood, TailMood } from '../rig/animator';

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
  spots: { food: THREE.Vector3; water: THREE.Vector3; litter: THREE.Vector3 } | null = null;
  private fading: { t: number; dur: number; onDone?: () => void } | null = null;
  private readonly look = new THREE.Vector3();

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
    if (this.errand) this.doErrand(dt);
    if (!this.trip) m.setPosture(this.wanted());
    else if (this.trip.kind === 'leave' && Math.abs(m.pos.x) > this.offstage) {
      const cb = this.trip.onDone;
      this.trip = null;
      m.stop();
      this.setHidden(true);
      cb?.();
    }
    // eyes on the finger, or on you (through the window); asleep, dead or busy, nowhere
    if (!this.alive || this.sleep > 0.5 || this.errand) m.lookAt(null);
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
