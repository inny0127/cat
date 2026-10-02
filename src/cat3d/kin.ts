import * as THREE from 'three';
import type { BoneDef } from './load';

/**
 * Light forward kinematics over the cat's skeleton in model space (the cat group's frame), so the
 * body solver can set rotations bone by bone and read back joint positions straight away without
 * going through three.js' matrix updates. Rest rotations are all identity, so a bone's rest
 * direction to its child is the same in its own frame and in model space.
 */
export class Kin {
  readonly names: string[];
  readonly parent: Int16Array;
  readonly rest: THREE.Vector3[];     // rest joint positions, model space
  readonly offset: THREE.Vector3[];   // translation from the parent joint
  readonly local: THREE.Quaternion[];
  readonly wq: THREE.Quaternion[];
  readonly wp: THREE.Vector3[];
  private readonly ix = new Map<string, number>();

  constructor(defs: BoneDef[]) {
    this.names = defs.map((d) => d.name);
    this.names.forEach((n, i) => this.ix.set(n, i));
    this.parent = Int16Array.from(defs.map((d) => (d.parent ? this.ix.get(d.parent)! : -1)));
    this.rest = defs.map((d) => new THREE.Vector3(...d.pos));
    this.offset = defs.map((_, i) => {
      const p = this.parent[i];
      return p < 0 ? this.rest[i].clone() : this.rest[i].clone().sub(this.rest[p]);
    });
    this.local = defs.map(() => new THREE.Quaternion());
    this.wq = defs.map(() => new THREE.Quaternion());
    this.wp = defs.map(() => new THREE.Vector3());
    this.fkAll();
  }

  i(name: string) {
    const i = this.ix.get(name);
    if (i === undefined) throw new Error('no bone ' + name);
    return i;
  }

  /** update one bone from its parent (which must be current) */
  fk(i: number) {
    const p = this.parent[i];
    if (p < 0) {
      this.wq[i].copy(this.local[i]);
      this.wp[i].copy(this.offset[i]);
    } else {
      this.wq[i].copy(this.wq[p]).multiply(this.local[i]);
      this.wp[i].copy(this.offset[i]).applyQuaternion(this.wq[p]).add(this.wp[p]);
    }
  }

  fkAll() {
    for (let i = 0; i < this.names.length; i++) this.fk(i);
  }

  /** set the local rotation so the bone ends up with world rotation q; updates the bone */
  setWorld(i: number, q: THREE.Quaternion) {
    const p = this.parent[i];
    if (p < 0) this.local[i].copy(q);
    else this.local[i].copy(this.wq[p]).invert().multiply(q);
    this.fk(i);
  }

  setLocal(i: number, q: THREE.Quaternion) {
    this.local[i].copy(q);
    this.fk(i);
  }

  /** distance between two joints at rest */
  len(a: number, b: number) {
    return this.rest[a].distanceTo(this.rest[b]);
  }

  /** copy rotations (and the driven offsets) onto three.js bones */
  apply(bones: THREE.Bone[]) {
    for (let i = 0; i < bones.length; i++) {
      bones[i].quaternion.copy(this.local[i]);
      bones[i].position.copy(this.offset[i]);
    }
  }
}

// ------------------------------------------------------------------ math helpers

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

/** orientation from body angles: yaw (left +) about y, then pitch (nose up +), then roll (right side down +) */
export function euler(pitch: number, yaw: number, roll: number, out = new THREE.Quaternion()) {
  out.setFromAxisAngle(AY, yaw);
  _qa.setFromAxisAngle(AX, -pitch);
  _qb.setFromAxisAngle(AZ, roll);
  return out.multiply(_qa).multiply(_qb);
}

function basis(dir: THREE.Vector3, side: THREE.Vector3, m: THREE.Matrix4) {
  _x.copy(dir).normalize();
  _y.copy(side).addScaledVector(_x, -side.dot(_x));
  if (_y.lengthSq() < 1e-10) _y.set(_x.y, -_x.x, 0).normalize();
  _y.normalize();
  _z.crossVectors(_x, _y);
  return m.makeBasis(_x, _y, _z);
}

/**
 * The rotation that carries a bone's rest direction (and a rest "side" axis, which fixes the
 * twist) onto a new direction and side.
 */
export function aim(restDir: THREE.Vector3, restSide: THREE.Vector3, dir: THREE.Vector3, side: THREE.Vector3, out: THREE.Quaternion) {
  basis(dir, side, _m1);
  basis(restDir, restSide, _m2);
  _m1.multiply(_m2.transpose());
  return out.setFromRotationMatrix(_m1);
}

/**
 * Two-bone IK. From joint `a` with segment lengths la, lb, reach toward `target`, bending toward
 * `pole` (a direction). Writes the middle joint and the reached end point.
 */
export function twoBone(a: THREE.Vector3, la: number, lb: number, target: THREE.Vector3, pole: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3) {
  const d = _x.copy(target).sub(a);
  let dist = d.length();
  const dir = d.multiplyScalar(1 / Math.max(dist, 1e-9));
  dist = Math.min(Math.max(dist, Math.abs(la - lb) + 1e-5), la + lb - 1e-5);
  const cosA = Math.min(1, Math.max(-1, (la * la + dist * dist - lb * lb) / (2 * la * dist)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  const bend = _y.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (bend.lengthSq() < 1e-10) bend.set(0, 0, -1).addScaledVector(dir, dir.z);
  bend.normalize();
  mid.copy(a).addScaledVector(dir, la * cosA).addScaledVector(bend, la * sinA);
  end.copy(a).addScaledVector(dir, dist);
  return dist;
}

export const vec = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const AXES = { X: AX, Y: AY, Z: AZ };

/** rotation vector (axis * angle) of q, shortest way round */
export function logQ(q: THREE.Quaternion, out: THREE.Vector3) {
  let { x, y, z, w } = q;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.sqrt(x * x + y * y + z * z);
  if (s < 1e-9) return out.set(0, 0, 0);
  const a = 2 * Math.atan2(s, w);
  return out.set(x, y, z).multiplyScalar(a / s);
}

/** quaternion from a rotation vector */
export function expQ(v: THREE.Vector3, out: THREE.Quaternion) {
  const a = v.length();
  if (a < 1e-9) return out.set(0, 0, 0, 1);
  const s = Math.sin(a / 2) / a;
  return out.set(v.x * s, v.y * s, v.z * s, Math.cos(a / 2));
}
