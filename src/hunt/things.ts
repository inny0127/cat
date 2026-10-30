import * as THREE from 'three';
import { groundUnder, type Box } from './physics';

export type ThingKind = 'mug' | 'glass' | 'vase' | 'remote' | 'figure' | 'pens';

/** what each is called, what it is worth on the floor, how it sounds landing there (and how loud) */
export const THINGS: Record<ThingKind, { name: string; pts: number; sound: 'shatter' | 'clatter'; loud: number }> = {
  mug: { name: '머그컵', pts: 120, sound: 'shatter', loud: 1 },
  glass: { name: '물컵', pts: 200, sound: 'shatter', loud: 1.1 },
  vase: { name: '꽃병', pts: 150, sound: 'shatter', loud: 1 },
  remote: { name: '리모컨', pts: 80, sound: 'clatter', loud: 0.6 },
  figure: { name: '고양이 인형', pts: 100, sound: 'clatter', loud: 0.7 },
  pens: { name: '연필꽂이', pts: 90, sound: 'clatter', loud: 0.7 },
};

/** where each stands, at the start of a night: on the top at y */
export interface Spot { kind: ThingKind; at: THREE.Vector3 }

const G = 9.8;

/**
 * A thing on a table or a shelf, for a cat to push off the edge: a swat sends it skidding (and off
 * the edge, falling); walked into, it is shoved along. It lands with a crash (a glass in pieces),
 * worth points, and loud: whatever is near hears it, and so might they.
 */
export class Thing {
  readonly mesh = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  state: 'up' | 'moving' | 'down' = 'up';
  /** the top it stood on at the start (a fall from it is a fall worth the name) */
  private top = 0;
  private spin = new THREE.Vector3();

  constructor(readonly kind: ThingKind, at: THREE.Vector3) {
    this.pos.copy(at);
    this.top = at.y;
    this.build();
    this.mesh.position.copy(at);
  }

  /** knocked the given way (m/s along the floor), up a little */
  knock(dx: number, dz: number, up = 0.9) {
    if (this.state === 'down') return;
    this.vel.set(dx, up, dz);
    this.spin.set(Math.random() * 10 - 5, Math.random() * 6 - 3, Math.random() * 10 - 5);
    this.state = 'moving';
  }

  /** a step of its fall; the height it came down from when it lands on the floor (else 0) */
  update(dt: number, boxes: readonly Box[]): number {
    if (this.state !== 'moving') return 0;
    const p = this.pos, v = this.vel;
    v.y -= G * dt;
    const ox = p.x, oz = p.z;
    p.x += v.x * dt;
    p.z += v.z * dt;
    // (into something: stopped against it, and drops)
    for (const B of boxes) {
      if (p.x > B[0] && p.x < B[3] && p.z > B[2] && p.z < B[5] && p.y + 0.03 > B[1] && p.y + 0.03 < B[4]) {
        p.x = ox;
        p.z = oz;
        v.x *= -0.2;
        v.z *= -0.2;
        break;
      }
    }
    p.y += v.y * dt;
    const under = groundUnder({ x: p.x, y: p.y + 0.04, z: p.z, r: 0.04 }, boxes);
    this.mesh.position.copy(p);
    this.mesh.rotation.x += this.spin.x * dt * Math.min(1, Math.abs(v.y));
    this.mesh.rotation.z += this.spin.z * dt * Math.min(1, Math.abs(v.y));
    if (p.y > under) return 0;
    p.y = under;
    this.mesh.position.y = under;
    const fell = this.top - under;
    if (fell > 0.25) {
      // on the floor (or the seat of a chair): there it stays
      this.state = 'down';
      this.lieDown();
      return fell;
    }
    // (still on a top: it skids to a stop there)
    v.y = 0;
    v.x *= 0.5;
    v.z *= 0.5;
    if (Math.hypot(v.x, v.z) < 0.05) {
      this.state = 'up';
      this.mesh.rotation.set(0, this.mesh.rotation.y, 0);
    }
    return 0;
  }

  /** where it is, near enough to be reached from a point (a swat, a body) */
  near(x: number, y: number, z: number, r: number) {
    return this.state !== 'down' && Math.hypot(this.pos.x - x, this.pos.z - z) < r && Math.abs(this.pos.y + 0.04 - y) < r + 0.06;
  }

  private lieDown() {
    if (THINGS[this.kind].sound === 'shatter') {
      // (in pieces where it came down)
      for (const c of this.mesh.children) c.visible = false;
      const g = new THREE.Group();
      const mat = (this.mesh.children[0] as THREE.Mesh).material as THREE.Material;
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.02 + Math.random() * 0.025, 0.006, 0.015 + Math.random() * 0.02), mat);
        const a = Math.random() * Math.PI * 2, r = 0.02 + Math.random() * 0.12;
        s.position.set(Math.cos(a) * r, 0.003, Math.sin(a) * r);
        s.rotation.y = Math.random() * 3;
        g.add(s);
      }
      if (this.kind === 'glass' || this.kind === 'vase') {
        // (and a puddle)
        const pud = new THREE.Mesh(new THREE.CircleGeometry(0.13, 10), new THREE.MeshLambertMaterial({ color: 0x6e8fb8, transparent: true, opacity: 0.55 }));
        pud.rotation.x = -Math.PI / 2;
        pud.position.y = 0.002;
        pud.scale.set(1, 0.7, 1);
        g.add(pud);
      }
      this.mesh.rotation.set(0, 0, 0);
      this.mesh.add(g);
    } else {
      this.mesh.rotation.set(0, this.mesh.rotation.y, Math.PI / 2);
      this.mesh.position.y += 0.02;
    }
  }

  private build() {
    const M = (c: number, o: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      this.mesh.add(mesh);
      return mesh;
    };
    switch (this.kind) {
      case 'mug': {
        const m = M(0xf0e6d6);
        add(new THREE.CylinderGeometry(0.038, 0.034, 0.09, 10), m, 0, 0.045);
        const h = add(new THREE.TorusGeometry(0.022, 0.007, 4, 8), m, 0.04, 0.05);
        h.rotation.y = Math.PI / 2;
        add(new THREE.CylinderGeometry(0.033, 0.033, 0.004, 10), M(0x5a3420), 0, 0.085);
        break;
      }
      case 'glass': {
        add(new THREE.CylinderGeometry(0.034, 0.03, 0.11, 10, 1, true), M(0xcfe6ff, { transparent: true, opacity: 0.55, side: THREE.DoubleSide }), 0, 0.055);
        add(new THREE.CylinderGeometry(0.031, 0.029, 0.07, 10), M(0x7fb0e8, { transparent: true, opacity: 0.6 }), 0, 0.036);
        break;
      }
      case 'vase': {
        const m = M(0x5f8fc8);
        add(new THREE.CylinderGeometry(0.025, 0.04, 0.15, 8), m, 0, 0.075);
        add(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 4), M(0x3f8a4a), 0, 0.2);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          add(new THREE.SphereGeometry(0.018, 5, 4), M(0xf07a8a), Math.cos(a) * 0.02, 0.27, Math.sin(a) * 0.02);
        }
        add(new THREE.SphereGeometry(0.012, 5, 4), M(0xffd27a), 0, 0.275);
        break;
      }
      case 'remote': {
        add(new THREE.BoxGeometry(0.05, 0.022, 0.17), M(0x2a2830), 0, 0.011);
        for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.012, 0.006, 0.012), M(i === 0 ? 0xd9534f : 0x8890a0), 0, 0.024, -0.05 + i * 0.03);
        break;
      }
      case 'figure': {
        // (a lucky cat, its paw up)
        const m = M(0xf6f0e4);
        add(new THREE.BoxGeometry(0.07, 0.07, 0.05), m, 0, 0.035);
        add(new THREE.BoxGeometry(0.075, 0.06, 0.055), m, 0, 0.1);
        add(new THREE.ConeGeometry(0.014, 0.025, 4), m, -0.024, 0.14);
        add(new THREE.ConeGeometry(0.014, 0.025, 4), m, 0.024, 0.14);
        add(new THREE.BoxGeometry(0.018, 0.04, 0.018), m, 0.045, 0.1);
        add(new THREE.BoxGeometry(0.06, 0.01, 0.01), M(0xd9534f), 0, 0.068, 0.026);
        add(new THREE.SphereGeometry(0.009, 5, 4), M(0xd8b25a), 0, 0.058, 0.03);
        break;
      }
      case 'pens': {
        add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), M(0x4f8a5a), 0, 0.04);
        const cols = [0xd9534f, 0x3f5f9a, 0xffd27a, 0x2a2830];
        cols.forEach((c, i) => {
          const p = add(new THREE.CylinderGeometry(0.004, 0.004, 0.13, 4), M(c), -0.012 + i * 0.008, 0.1, (i % 2) * 0.01 - 0.005);
          p.rotation.z = -0.15 + i * 0.1;
        });
        break;
      }
    }
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
  }
}
