import * as THREE from 'three';
import { LEGS, type Leg } from './pose';

/** Lateral-sequence walk: left hind, left fore, right hind, right fore, a quarter cycle apart. */
const WALK: Record<Leg, number> = { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 };
/** Trot: diagonal pairs together. */
const TROT: Record<Leg, number> = { LH: 0, RF: 0.02, RH: 0.5, LF: 0.52 };

interface FootState {
  pos: THREE.Vector3;        // world, where the paw is (or is going)
  from: THREE.Vector3;
  to: THREE.Vector3;
  stepping: boolean;
  s: number;                 // 0..1 through the step
  dur: number;
  height: number;
  flex: number;              // output: wrist/ankle fold while lifted
  wasPlanted: boolean;
}

/**
 * Decides where each paw is in the world. Planted paws stay exactly where they were put down;
 * when the body walks they are lifted in gait order and placed ahead, and when it stands still
 * any paw left too far from where the pose wants it takes a small settling step.
 */
export class Stepper {
  readonly feet: Record<Leg, FootState>;
  phase = 0;
  /** 0 walk .. 1 trot */
  trot = 0;
  /** gait cycles per second last frame */
  freq = 0;
  private settleCooldown = 0;
  private moving = 0;

  constructor() {
    const f = (): FootState => ({
      pos: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(),
      stepping: false, s: 0, dur: 0.25, height: 0.03, flex: 0, wasPlanted: false,
    });
    this.feet = { LF: f(), RF: f(), LH: f(), RH: f() };
  }

  /** put every paw where the pose wants it (teleport / first frame) */
  reset(home: Record<Leg, THREE.Vector3>) {
    for (const l of LEGS) {
      const F = this.feet[l];
      F.pos.copy(home[l]);
      F.stepping = false;
      F.flex = 0;
    }
  }

  /**
   * home: where the pose wants each paw, world space. planted: 0..1 per leg. vel: body velocity
   * (world, m/s); yawRate rad/s; centre: body centre on the floor, for turning.
   */
  update(dt: number, home: Record<Leg, THREE.Vector3>, planted: Record<Leg, number>, vel: THREE.Vector3, yawRate: number, centre: THREE.Vector3) {
    const speed = Math.hypot(vel.x, vel.z);
    const turning = Math.abs(yawRate);
    const wantGait = speed > 0.025 || turning > 0.35;
    this.moving = wantGait ? Math.min(1, this.moving + dt * 4) : Math.max(0, this.moving - dt * 3);
    // stride frequency rises with speed (and a little for turning on the spot)
    this.freq = Math.min(3.4, 0.9 + 1.9 * speed + 0.25 * turning);
    this.trot = Math.min(1, Math.max(0, (speed - 0.75) / 0.35));
    const duty = 0.64 - 0.14 * this.trot;
    const prev = this.phase;
    if (this.moving > 0) this.phase = (this.phase + this.freq * dt) % 1;

    for (const l of LEGS) {
      const F = this.feet[l];
      const isPlanted = planted[l] > 0.5;
      if (!isPlanted) {
        // held by the body: follows its pose target
        F.pos.copy(home[l]);
        F.stepping = false;
        F.flex = 0;
        F.wasPlanted = false;
        continue;
      }
      if (!F.wasPlanted) {
        // just came down to the floor: start from wherever the pose put it
        F.pos.copy(home[l]);
        F.pos.y = Math.min(F.pos.y, home[l].y);
        F.wasPlanted = true;
      }
      if (F.stepping) {
        F.s = Math.min(1, F.s + dt / F.dur);
        const s = F.s;
        const e = s * s * (3 - 2 * s);
        F.pos.lerpVectors(F.from, F.to, e);
        // lift fast, set down a touch slower
        F.pos.y += F.height * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.85)), 0.9);
        F.flex = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.75)), 1.2);
        if (s >= 1) {
          F.stepping = false;
          F.flex = 0;
          F.pos.copy(F.to);
        }
        continue;
      }
      F.flex = 0;
      if (this.moving > 0) {
        // gait: lift when this leg's phase enters its swing
        const off = WALK[l] * (1 - this.trot) + TROT[l] * this.trot;
        const a = (prev - off + 2) % 1, b = (this.phase - off + 2) % 1;
        const crossed = a < duty && b >= duty;
        if (crossed && this.moving > 0.5) {
          const swingT = (1 - duty) / this.freq;
          const standT = duty / this.freq;
          this.begin(F, l, home[l], vel, yawRate, centre, swingT, swingT + standT * 0.5, 0.022 + 0.018 * Math.min(1, speed));
        }
      }
    }
    // standing still: tidy up paws that are out of place, one at a time
    this.settleCooldown -= dt;
    if (this.moving < 0.5 && this.settleCooldown <= 0 && !LEGS.some((l) => this.feet[l].stepping)) {
      let worst: Leg | null = null, err = 0.022;
      for (const l of LEGS) {
        if (planted[l] <= 0.5) continue;
        const d = Math.hypot(this.feet[l].pos.x - home[l].x, this.feet[l].pos.z - home[l].z);
        if (d > err) { err = d; worst = l; }
      }
      if (worst) {
        this.begin(this.feet[worst], worst, home[worst], vel, 0, centre, 0.2 + Math.min(0.12, err), 0, 0.016 + Math.min(0.02, err * 0.3));
        this.settleCooldown = 0.08;
      }
    }
  }

  private begin(F: FootState, _l: Leg, home: THREE.Vector3, vel: THREE.Vector3, yawRate: number, centre: THREE.Vector3, dur: number, lead: number, height: number) {
    F.from.copy(F.pos);
    F.from.y = Math.max(F.from.y, home.y);
    // where home will be when this paw is halfway through its next stance
    F.to.copy(home).addScaledVector(vel, lead);
    if (yawRate !== 0) {
      const a = yawRate * lead;
      const dx = F.to.x - centre.x, dz = F.to.z - centre.z;
      const c = Math.cos(a), s = Math.sin(a);
      F.to.x = centre.x + dx * c + dz * s;
      F.to.z = centre.z - dx * s + dz * c;
    }
    F.to.y = home.y;
    F.s = 0;
    F.dur = dur;
    F.height = height;
    F.stepping = true;
  }

  /** is any paw in the air */
  get busy() {
    return LEGS.some((l) => this.feet[l].stepping);
  }
}
