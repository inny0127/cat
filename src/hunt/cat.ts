import * as THREE from 'three';
import { moveBody, type Body, type Box } from './physics';

/** what the player asks of the cat this frame */
export interface Intent {
  /** where to go: x to the right, y ahead (each -1..1; how far over: how fast) */
  move: { x: number; y: number };
  /** how far to turn the head (rad: yaw to the left, pitch up) */
  look: { yaw: number; pitch: number };
  jump: boolean;
  /** the pounce button held down (the haunches wiggling), and let go this frame */
  crouch: boolean;
  release: boolean;
  /** still, ears pricked */
  listen: boolean;
}

export type Doing = 'walk' | 'wiggle' | 'pounce' | 'swat' | 'listen';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * You, the cat: 26 cm tall, eyes 21 cm off the ground; a creep slow and silent, a trot, a dash
 * (loud); a spring up a metre; the pounce button held and the haunches wiggle (the longer, the
 * further the pounce will go), let go and it leaps the way you are looking; tapped, a quick swat
 * of a paw. What it does makes a noise, for the things it hunts to hear.
 */
export class Cat {
  readonly body: Body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0.12, h: 0.26, grounded: true, landed: 0 };
  yaw = 0;
  pitch = 0;
  doing: Doing = 'walk';
  /** the wiggle's charge (0..1), how long into the swat or the pounce (s) */
  charge = 0;
  t = 0;
  /** how loud it is just now (0..1+), for what is listening */
  noise = 0;
  /** speed over the ground (m/s), the walk's phase (for the paws and the bob) */
  speed = 0;
  stride = 0;
  /** how quick it is beyond itself (the frenzy: more) */
  pace = 1;
  /** the eye's place, and the way it looks */
  readonly eye = new THREE.Vector3();
  readonly fwd = new THREE.Vector3(0, 0, 1);
  /** the swat landed this frame (where the paw reached), and the pounce came down */
  swatAt: THREE.Vector3 | null = null;
  pounced = false;
  landedHard = 0;

  place(x: number, y: number, z: number, yaw: number) {
    Object.assign(this.body, { x, y, z, vx: 0, vy: 0, vz: 0, grounded: true });
    this.yaw = yaw;
    this.pitch = -0.1;
    this.doing = 'walk';
    this.charge = 0;
  }

  update(dt: number, I: Intent, boxes: readonly Box[]) {
    const b = this.body;
    this.swatAt = null;
    this.pounced = false;
    this.t += dt;
    this.yaw += I.look.yaw;
    this.pitch = clamp(this.pitch + I.look.pitch, -1.2, 1.25);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // what it is doing: a pounce goes on till it lands, a swat its moment; else as asked
    if (this.doing === 'pounce') {
      if (b.grounded && this.t > 0.08) { this.doing = 'walk'; this.pounced = true; }
    } else if (this.doing === 'swat') {
      if (this.t > 0.32) this.doing = 'walk';
      if (this.t > 0.12 && this.t - dt <= 0.12) this.swatAt = this.eye.clone().addScaledVector(this.fwd, 0.22).add(new THREE.Vector3(0, -0.12, 0));
    } else if (I.release && this.doing === 'wiggle') {
      if (this.charge < 0.14) { this.doing = 'swat'; this.t = 0; }
      else {
        // the leap: the way it looks, a little up always, as far as the wiggle wound it
        const p = clamp(this.pitch + 0.32, 0.12, 1.25);
        const v = (2.4 + 3.6 * this.charge) * Math.sqrt(this.pace);
        b.vx = sy * Math.cos(p) * v;
        b.vz = cy * Math.cos(p) * v;
        b.vy = Math.sin(p) * v + 1.2;
        b.grounded = false;
        this.doing = 'pounce';
        this.t = 0;
      }
      this.charge = 0;
    } else if (I.crouch && b.grounded && this.doing !== 'listen') {
      if (this.doing !== 'wiggle') { this.doing = 'wiggle'; this.charge = 0; }
      this.charge = Math.min(1.25, this.charge + dt / 0.85);
    } else if (I.listen && b.grounded) this.doing = 'listen';
    else if (this.doing === 'wiggle' || this.doing === 'listen') this.doing = 'walk';

    // moving: on the ground as asked (crept, trotted, dashed); in the air a little steering
    const m = Math.min(1, Math.hypot(I.move.x, I.move.y));
    const want = this.doing === 'walk' ? (m < 0.55 ? m * 1.1 : 0.6 + ((m - 0.55) / 0.45) * 2.6) * this.pace : 0;
    const dx = m > 0.01 ? (I.move.y * sy - I.move.x * cy) / m : 0, dz = m > 0.01 ? (I.move.y * cy + I.move.x * sy) / m : 0;
    const k = b.grounded ? (this.doing === 'walk' ? 10 : 14) : 1.2;
    if (b.grounded || this.doing !== 'pounce') {
      b.vx += (dx * want - b.vx) * Math.min(1, k * dt);
      b.vz += (dz * want - b.vz) * Math.min(1, k * dt);
    }
    if (I.jump && b.grounded && this.doing === 'walk') {
      b.vy = Math.sqrt(2 * 13 * 1.12);
      b.vx += sy * 0.6;
      b.vz += cy * 0.6;
      b.grounded = false;
    }
    moveBody(b, boxes, dt);
    this.landedHard = b.landed;
    this.speed = Math.hypot(b.vx, b.vz);
    if (b.grounded) this.stride += dt * (2 + this.speed * 5.5);

    // the noise it makes: a creep next to none, a trot some, a dash a lot; a landing by how hard
    let n = b.grounded ? (this.speed < 0.7 ? 0.03 * this.speed : Math.pow(this.speed / 3, 1.4)) : 0.02;
    if (b.landed) n = Math.max(n, Math.min(1.2, b.landed / 5));
    if (this.doing === 'wiggle') n = Math.max(n, 0.04);
    this.noise = n;

    // the eye: low to the ground, lower still crouched; a bob as it goes
    const crouch = this.doing === 'wiggle' ? 0.06 : this.doing === 'listen' ? 0.02 : 0;
    const bob = b.grounded ? Math.sin(this.stride * Math.PI) * Math.min(0.012, this.speed * 0.006) : 0;
    const sway = this.doing === 'wiggle' ? Math.sin(this.t * 16) * 0.012 * Math.min(1, this.charge * 2) : 0;
    this.eye.set(b.x + cy * sway, b.y + 0.21 - crouch + bob, b.z - sy * sway);
    this.fwd.set(sy * Math.cos(this.pitch), Math.sin(this.pitch), cy * Math.cos(this.pitch));
  }

  /** the camera put where the eye is, looking the way it looks */
  aim(cam: THREE.PerspectiveCamera) {
    cam.position.copy(this.eye);
    cam.rotation.set(this.pitch, this.yaw + Math.PI, 0, 'YXZ');
    // (a pounce: the world tips a little as it flies)
    if (this.doing === 'pounce') cam.rotation.z = Math.sin(Math.min(1, this.t / 0.5) * Math.PI) * 0.06;
  }

  /** where its paws and mouth reach: a point just ahead and below the eye */
  reach(out = new THREE.Vector3()) {
    return out.copy(this.eye).addScaledVector(new THREE.Vector3(this.fwd.x, 0, this.fwd.z).normalize(), 0.12).add(new THREE.Vector3(0, -0.1, 0));
  }
}
