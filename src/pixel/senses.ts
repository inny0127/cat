import * as THREE from 'three';
import type { Cat3D } from '../cat3d/cat';
import type { Zone } from '../sim/zones';

export interface Hit {
  bone: string;
  /** world */
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * What a finger on the glass touches in the 3D room: which part of the cat (from the bones the
 * skin there follows), which way its fur lies on screen, and where its head is. The brain asks in
 * "painting" pixels (the 2D cat's units); `k` converts screen css px to those.
 */
export class Senses3D {
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly t = { a: new THREE.Vector3(), b: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion() };
  /** screen css px -> painting px */
  k = 1;

  constructor(
    private readonly cat: Cat3D,
    private readonly camera: THREE.Camera,
    private readonly el: HTMLElement,
  ) {}

  private bone(name: string) {
    return this.cat.byName.get(name)!;
  }

  /** the cat under a screen point (css px), or null */
  hit(sx: number, sy: number): Hit | null {
    if (!this.cat.group.visible) return null;
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    let best: THREE.Intersection | null = null;
    for (const m of this.cat.meshes) {
      m.computeBoundingSphere();
      const h = this.ray.intersectObject(m, false)[0];
      if (h && (!best || h.distance < best.distance)) best = h;
    }
    if (!best || !best.face) return null;
    const mesh = best.object as THREE.SkinnedMesh;
    const g = mesh.geometry;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const acc = new Map<number, number>();
    for (const v of [best.face.a, best.face.b, best.face.c]) {
      for (let c = 0; c < 4; c++) {
        const b = si.getComponent(v, c), w = sw.getComponent(v, c);
        acc.set(b, (acc.get(b) ?? 0) + w);
      }
    }
    let bi = 0, bw = -1;
    for (const [b, w] of acc) if (w > bw) { bw = w; bi = b; }
    // the face normal, posed: from the hit triangle's posed corners
    const pa = mesh.getVertexPosition(best.face.a, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const pb = mesh.getVertexPosition(best.face.b, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const pc = mesh.getVertexPosition(best.face.c, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const normal = pb.sub(pa).cross(pc.sub(pa)).normalize();
    if (normal.dot(this.ray.ray.direction) > 0) normal.negate();
    return { bone: this.cat.bones[bi].name, point: best.point.clone(), normal };
  }

  /** a near miss counts: fingertips are wide */
  hitNear(sx: number, sy: number, slop = 7): Hit | null {
    return this.hit(sx, sy) ?? this.hit(sx + slop, sy) ?? this.hit(sx - slop, sy) ?? this.hit(sx, sy + slop) ?? this.hit(sx, sy - slop);
  }

  /** a world point in a bone's frame (bones rest world-aligned, so this is the body's own frame there) */
  private local(bone: string, p: THREE.Vector3, out: THREE.Vector3) {
    const b = this.bone(bone);
    b.updateWorldMatrix(true, false);
    return out.copy(p).applyMatrix4(this.t.m.copy(b.matrixWorld).invert());
  }
  private localDir(bone: string, d: THREE.Vector3, out: THREE.Vector3) {
    const b = this.bone(bone);
    b.getWorldQuaternion(this.t.q);
    return out.copy(d).applyQuaternion(this.t.q.invert());
  }

  zoneAt(px: number, py: number): Zone {
    const h = this.hitNear(px / this.k, py / this.k);
    if (!h) return 'none';
    const n = h.bone;
    if (n.startsWith('ear')) return 'ear';
    if (n.startsWith('tail')) return 'tail';
    if (n === 'jaw') return 'chin';
    if (n === 'neck1' || n === 'neck2') return 'neck';
    if (/^(fore|wrist|hand|shin|hock|foot)/.test(n)) return 'paw';
    if (/^(scap|arm|thigh)/.test(n)) return 'flank';
    if (n === 'head') {
      // in the head's frame, measured from the point between the eyes
      const p = this.local('head', h.point, this.t.a).sub(this.cat.body.eyeOffset);
      const eyeX = Math.abs(this.cat.eyes[0].group.position.x);
      if (Math.abs(Math.abs(p.x) - eyeX) < 0.009 && Math.abs(p.y) < 0.008 && p.z > -0.01) return 'face';
      if (Math.abs(p.x) < 0.012 && p.y < -0.01 && p.y > -0.03 && p.z > 0.02) return 'face';   // the nose
      if (p.y < -0.03 && p.z > -0.02) return 'chin';
      if (Math.abs(p.x) > 0.018 && p.y < -0.005 && p.z > -0.03) return 'cheek';
      return 'head';
    }
    // the trunk: by which way the skin there faces in the body's own frame
    const up = this.localDir(n === 'root' ? 'hips' : n, h.normal, this.t.b).y;
    if (up < -0.45) return 'belly';
    if (up > 0.35) return n === 'hips' || n === 'spine1' ? 'rump' : 'back';
    return 'flank';
  }

  /** which way the fur lies at a point, on screen (unit vector, y down) */
  grainAt(px: number, py: number): [number, number] {
    const h = this.hitNear(px / this.k, py / this.k);
    if (!h) return [1, 0];
    const n = h.bone;
    const at = (name: string) => this.bone(name).getWorldPosition(new THREE.Vector3());
    const b = this.bone(n);
    const child = b.children.find((c) => (c as THREE.Bone).isBone) as THREE.Bone | undefined;
    let dir: THREE.Vector3;
    if (n.startsWith('tail') || /^(scap|arm|fore|wrist|hand|thigh|shin|hock|foot|ear)/.test(n)) {
      // down the legs, out along the tail, up the ears
      dir = child ? child.getWorldPosition(new THREE.Vector3()).sub(at(n)) : at(n).sub((b.parent as THREE.Bone).getWorldPosition(new THREE.Vector3()));
    } else if (n === 'hips' || n === 'root') {
      dir = at('tail0').sub(at('hips'));
    } else if (n === 'head' || n === 'jaw') {
      // from the nose back over the head
      dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.bone('head').getWorldQuaternion(new THREE.Quaternion()));
    } else {
      // along the back, toward the tail
      dir = (b.parent as THREE.Bone).getWorldPosition(new THREE.Vector3()).sub(at(n));
    }
    dir.normalize();
    const s0 = this.toScreen(h.point, new THREE.Vector3());
    const s1 = this.toScreen(h.point.clone().addScaledVector(dir, 0.01), new THREE.Vector3());
    const dx = s1.x - s0.x, dy = s1.y - s0.y;
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  }

  earSide(px: number, py: number): 'L' | 'R' {
    const h = this.hitNear(px / this.k, py / this.k);
    if (h?.bone === 'earL') return 'L';
    if (h?.bone === 'earR') return 'R';
    if (!h) return 'L';
    return this.local('head', h.point, this.t.a).x > 0 ? 'L' : 'R';
  }

  /** a world point on screen, css px */
  toScreen(p: THREE.Vector3, out: THREE.Vector3) {
    const r = this.el.getBoundingClientRect();
    out.copy(p).project(this.camera);
    return out.set(r.left + (out.x * 0.5 + 0.5) * r.width, r.top + (-out.y * 0.5 + 0.5) * r.height, out.z);
  }

  /** the point between the eyes, on screen (css px) */
  headScreen() {
    this.cat.group.updateMatrixWorld(true);
    const e = this.cat.body.eyes(new THREE.Vector3()).applyMatrix4(this.cat.group.matrixWorld);
    const s = this.toScreen(e, e);
    return { x: s.x, y: s.y };
  }

  /** the point in the room under a screen position, at the cat's head's distance */
  screenToWorld(sx: number, sy: number, out: THREE.Vector3) {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.cat.group.updateMatrixWorld(true);
    const head = this.cat.body.eyes(this.t.a).applyMatrix4(this.cat.group.matrixWorld);
    // a little in front of the cat, toward the glass, where a finger seems to be
    const d = Math.max(0.05, this.ray.ray.origin.distanceTo(head) - 0.15);
    return this.ray.ray.at(d, out);
  }
}
