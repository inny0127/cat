import * as THREE from 'three';
import { Kin, euler, expQ, logQ } from './kin';
import type { Pose } from './pose';

/**
 * The tail as a chain of angular springs in world space. Each segment is pulled toward the shape
 * the pose asks for, measured from the segment before it, so when the body turns or stops the
 * tail follows a beat later and settles with a little overshoot. Stiffness falls off toward the
 * tip, which is what gives the whip. Segments are kept above the floor.
 */
export class Tail {
  readonly n: number;
  private readonly idx: number[];
  private readonly q: THREE.Quaternion[];
  private readonly w: THREE.Vector3[];
  private readonly seg: THREE.Vector3[];   // rest offset to the next joint
  private readonly radius: number[];
  private ready = false;
  /** extra time-varying shape added by the motor: yaw wave per segment, lift */
  readonly wave: number[];
  stiffness = 1;
  private readonly t = { q: new THREE.Quaternion(), q2: new THREE.Quaternion(), p: new THREE.Quaternion(), v: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };

  constructor(private readonly kin: Kin, private readonly hips: number) {
    this.idx = [];
    for (let i = 0; ; i++) {
      try { this.idx.push(kin.i('tail' + i)); } catch { break; }
    }
    this.n = this.idx.length;
    this.q = this.idx.map(() => new THREE.Quaternion());
    this.w = this.idx.map(() => new THREE.Vector3());
    this.seg = this.idx.map((b, i) => (i + 1 < this.n ? kin.offset[this.idx[i + 1]].clone() : kin.offset[b].clone()));
    this.radius = this.idx.map((_, i) => 0.0175 - 0.0065 * (i / this.n) + 0.006);
    this.wave = this.idx.map(() => 0);
  }

  /** the shape the pose asks for, as local rotations */
  private target(p: Pose, i: number, out: THREE.Quaternion) {
    const n = this.n;
    const u = i / (n - 1);
    if (i === 0) return euler(-p.tailLift, -p.tailSide + this.wave[0], 0, out);
    // bend grows along the tail; curl concentrates toward the tip
    const bend = p.tailCurve / (n - 1) * (0.6 + 0.8 * u);
    const wrap = -p.tailCurl / (n - 1) * (0.5 + 1.0 * u);
    return euler(bend, wrap + this.wave[i], 0, out);
  }

  /** tip a segment's target down toward the floor, more toward the tip (a limp tail) */
  private sag(q: THREE.Quaternion, i: number, amount: number) {
    const d = this.sg.d.copy(this.seg[i]).normalize().applyQuaternion(q);
    const horiz = Math.hypot(d.x, d.z);
    if (horiz < 1e-4) return;
    const axis = this.sg.a.set(d.z, 0, -d.x).multiplyScalar(1 / horiz);   // horizontal, square to the segment
    const pitch = Math.atan2(d.y, horiz);                                  // + pointing up
    const drop = (pitch + 0.25) * amount * (0.35 + 0.65 * i / (this.n - 1));
    if (drop > 0) q.premultiply(this.sg.q.setFromAxisAngle(axis, drop));
  }
  private readonly sg = { d: new THREE.Vector3(), a: new THREE.Vector3(), q: new THREE.Quaternion() };

  /**
   * Step the springs. `groupQ`/`groupP` place the model in the world; `floor` is the world height
   * of the floor.
   */
  update(dt: number, p: Pose, groupQ: THREE.Quaternion, groupP: THREE.Vector3, floor = 0) {
    const { kin, idx, n, t } = this;
    const parentW = t.p.copy(groupQ).multiply(kin.wq[this.hips]);
    if (!this.ready) {
      for (let i = 0; i < n; i++) {
        this.q[i].copy(parentW).multiply(this.target(p, i, t.q));
        parentW.copy(this.q[i]);
        this.w[i].set(0, 0, 0);
      }
      this.ready = true;
    } else {
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        parentW.copy(groupQ).multiply(kin.wq[this.hips]);
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1);
          const k = (420 - 330 * Math.pow(u, 0.7)) * this.stiffness;
          const c = 2 * 0.62 * Math.sqrt(k);
          const tgt = t.q.copy(parentW).multiply(this.target(p, i, t.q2));
          if (p.tailSag > 0) this.sag(tgt, i, p.tailSag);
          // error as a world rotation vector from current to target
          const err = logQ(t.q2.copy(tgt).multiply(t.q.copy(this.q[i]).invert()), t.v);
          this.w[i].addScaledVector(err, k * h).multiplyScalar(Math.max(0, 1 - c * h));
          this.q[i].premultiply(expQ(t.a.copy(this.w[i]).multiplyScalar(h), t.q)).normalize();
          parentW.copy(this.q[i]);
        }
      }
    }
    // keep every joint above the floor, then write back as local rotations
    const inv = t.q2.copy(groupQ).invert();
    const pos = t.a.copy(kin.wp[idx[0]]).applyQuaternion(groupQ).add(groupP);
    for (let i = 0; i < n; i++) {
      const d = t.b.copy(this.seg[i]).applyQuaternion(this.q[i]);
      const r = this.radius[Math.min(n - 1, i + 1)];
      const lift = floor + r - (pos.y + d.y);
      if (lift > 0) {
        const len = d.length();
        const nd = t.c.copy(d);
        nd.y = Math.min(len * 0.999, nd.y + lift);
        const horiz = Math.sqrt(Math.max(0, len * len - nd.y * nd.y));
        const hl = Math.hypot(d.x, d.z) || 1;
        nd.x = (d.x / hl) * horiz;
        nd.z = (d.z / hl) * horiz;
        this.q[i].premultiply(t.q.setFromUnitVectors(d.normalize(), nd.normalize()));
        // lose the velocity going into the floor
        this.w[i].multiplyScalar(0.6);
      }
      kin.setWorld(idx[i], t.q.copy(inv).multiply(this.q[i]));
      pos.add(t.b.copy(this.seg[i]).applyQuaternion(this.q[i]));
    }
  }

  reset() {
    this.ready = false;
  }
}
