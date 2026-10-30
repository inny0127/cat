import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Material } from '../cat3d/pixclass';
import type { Top } from './set';

/** the things there are to knock off */
export type Kind = 'mug' | 'cup' | 'glass' | 'vase' | 'plant' | 'book' | 'frame' | 'plate' | 'orange' | 'remote' | 'cushion' | 'candle' | 'clock' | 'jar' | 'teapot' | 'bowl';

/** each kind: what it is called, its points knocked down (and broken), whether it breaks, how big
 *  round it is and how tall, how heavy (a swat moves it less), whether it rolls */
export const KINDS: Record<Kind, { name: string; pts: number; fragile: boolean; r: number; h: number; mass: number; rolls?: boolean; spill?: 'water' | 'soil' }> = {
  mug: { name: '머그컵', pts: 120, fragile: true, r: 0.035, h: 0.08, mass: 1, spill: 'water' },
  cup: { name: '찻잔', pts: 150, fragile: true, r: 0.04, h: 0.06, mass: 0.9, spill: 'water' },
  glass: { name: '물컵', pts: 100, fragile: true, r: 0.03, h: 0.1, mass: 0.8, spill: 'water' },
  vase: { name: '꽃병', pts: 300, fragile: true, r: 0.045, h: 0.2, mass: 1.6, spill: 'water' },
  plant: { name: '화분', pts: 250, fragile: true, r: 0.05, h: 0.16, mass: 1.8, spill: 'soil' },
  book: { name: '책', pts: 60, fragile: false, r: 0.06, h: 0.03, mass: 1.2 },
  frame: { name: '액자', pts: 150, fragile: true, r: 0.05, h: 0.12, mass: 0.8 },
  plate: { name: '접시', pts: 120, fragile: true, r: 0.07, h: 0.02, mass: 0.9 },
  orange: { name: '귤', pts: 40, fragile: false, r: 0.03, h: 0.06, mass: 0.6, rolls: true },
  remote: { name: '리모컨', pts: 50, fragile: false, r: 0.05, h: 0.02, mass: 0.6 },
  cushion: { name: '쿠션', pts: 40, fragile: false, r: 0.1, h: 0.08, mass: 0.8 },
  candle: { name: '양초', pts: 80, fragile: false, r: 0.025, h: 0.09, mass: 0.7 },
  clock: { name: '자명종', pts: 100, fragile: true, r: 0.04, h: 0.08, mass: 1 },
  jar: { name: '과자 단지', pts: 200, fragile: true, r: 0.05, h: 0.12, mass: 1.4 },
  teapot: { name: '찻주전자', pts: 350, fragile: true, r: 0.06, h: 0.1, mass: 1.8, spill: 'water' },
  bowl: { name: '과일 그릇', pts: 200, fragile: true, r: 0.08, h: 0.05, mass: 1.5 },
};

type Paint = (m: Material, tone?: number, pattern?: number) => THREE.Material;

/** one of them in the room: where it is, how it is moving and turning, what it stands on */
export interface Prop {
  kind: Kind;
  group: THREE.Group;
  v: THREE.Vector3;
  w: THREE.Vector3;
  on: Top | null;
  state: 'still' | 'slide' | 'fall' | 'down' | 'broken';
  /** fallen from a height (the points for it are due when it comes down) */
  fell: number;
  /** the main material, for its pieces */
  mat: THREE.Material;
  /** how long since it came to rest on the floor */
  t: number;
}

interface Shard { m: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3; t: number; still: boolean }

/** a thing made, standing at its own origin (its foot) */
function makeParts(kind: Kind, paint: Paint): { g: THREE.Group; main: THREE.Material } {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  const K = KINDS[kind];
  switch (kind) {
    case 'mug': {
      const m = paint(['bookBlue', 'bookRed', 'paint', 'bookMustard'][Math.floor(Math.random() * 4)] as Material, 0.1, 9);
      add(new THREE.CylinderGeometry(K.r, K.r * 0.92, K.h, 14), m, 0, K.h / 2);
      add(new THREE.TorusGeometry(0.02, 0.006, 5, 10), m, K.r + 0.008, K.h * 0.55).rotation.y = 0;
      add(new THREE.CircleGeometry(K.r * 0.85, 12).rotateX(-Math.PI / 2), paint('brown', 0.05), 0, K.h - 0.008);
      return { g, main: m };
    }
    case 'cup': {
      const m = paint('paint', 0.2, 9);
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 16), m, 0, 0.004);
      add(new THREE.CylinderGeometry(0.035, 0.022, 0.045, 14), m, 0, 0.03);
      add(new THREE.TorusGeometry(0.012, 0.004, 4, 8), m, 0.04, 0.035);
      add(new THREE.CircleGeometry(0.03, 12).rotateX(-Math.PI / 2), paint('brown', 0.15), 0, 0.048);
      return { g, main: m };
    }
    case 'glass': {
      const m = paint('water', 0.35, 9);
      add(new THREE.CylinderGeometry(K.r, K.r * 0.85, K.h, 12), m, 0, K.h / 2);
      return { g, main: m };
    }
    case 'vase': {
      const m = paint(Math.random() < 0.5 ? 'bookBlue' : 'enamel', 0.12, 9);
      const pts = [[0.0, 0], [0.04, 0], [0.05, 0.05], [0.045, 0.1], [0.022, 0.15], [0.028, 0.18], [0.0, 0.18]].map(([x, y]) => new THREE.Vector2(x, y));
      add(new THREE.LatheGeometry(pts, 14), m);
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7;
        const st = add(new THREE.CylinderGeometry(0.002, 0.002, 0.1, 4), paint('leaf', 0), Math.cos(a) * 0.008, 0.22, Math.sin(a) * 0.008);
        st.rotation.set(Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3);
        add(new THREE.SphereGeometry(0.016, 6, 5), paint(['bookRed', 'pink', 'bookMustard', 'pink'][i] as Material, 0.15), Math.cos(a) * 0.03, 0.27 + 0.01 * (i % 2), Math.sin(a) * 0.03);
      }
      return { g, main: m };
    }
    case 'plant': {
      const m = paint('pot', 0, 9);
      add(new THREE.CylinderGeometry(0.05, 0.038, 0.08, 14), m, 0, 0.04);
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        const l = add(new THREE.SphereGeometry(0.03, 6, 4), paint('leaf', 0.05 * (i % 2)), Math.cos(a) * 0.025, 0.1 + 0.012 * (i % 3), Math.sin(a) * 0.025);
        l.scale.set(1, 0.6, 0.8);
      }
      return { g, main: m };
    }
    case 'book': {
      const m = paint(['bookRed', 'bookBlue', 'bookMustard'][Math.floor(Math.random() * 3)] as Material, 0.05);
      add(new THREE.BoxGeometry(0.14, K.h, 0.1), m, 0, K.h / 2);
      add(new THREE.BoxGeometry(0.13, K.h * 0.8, 0.002), paint('paper', 0.1), 0.004, K.h / 2, 0.05);
      return { g, main: m };
    }
    case 'frame': {
      const m = paint('brown', 0.1);
      const f = add(new THREE.BoxGeometry(0.1, 0.12, 0.015), m, 0, 0.06);
      f.rotation.x = -0.2;
      const pic = add(new THREE.BoxGeometry(0.07, 0.09, 0.003), paint(['bookBlue', 'leaf', 'pink'][Math.floor(Math.random() * 3)] as Material, 0.2), 0, 0.062, 0.009);
      pic.rotation.x = -0.2;
      return { g, main: m };
    }
    case 'plate': {
      const m = paint('paint', 0.18, 9);
      add(new THREE.CylinderGeometry(K.r, K.r * 0.7, 0.014, 18), m, 0, 0.007);
      add(new THREE.SphereGeometry(0.03, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), paint('cream', 0.1), 0, 0.012);
      return { g, main: m };
    }
    case 'orange': {
      const m = paint('pot', 0.25, 9);
      add(new THREE.SphereGeometry(K.r, 10, 8), m, 0, K.r);
      add(new THREE.SphereGeometry(0.007, 5, 4), paint('leaf', 0), 0, K.r * 2, 0);
      return { g, main: m };
    }
    case 'remote': {
      const m = paint('ink', 0.2);
      add(new THREE.BoxGeometry(0.04, K.h, 0.12), m, 0, K.h / 2);
      for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.008, 0.004, 0.008), paint('bookRed', 0.2), -0.01 + i * 0.01, K.h, 0.03);
      return { g, main: m };
    }
    case 'cushion': {
      const m = paint(['bookMustard', 'pink', 'bookBlue'][Math.floor(Math.random() * 3)] as Material, 0.05, 4);
      const c = add(new THREE.SphereGeometry(0.1, 10, 8), m, 0, 0.04);
      c.scale.set(1, 0.42, 1);
      return { g, main: m };
    }
    case 'candle': {
      const m = paint('rugCream', 0.15, 9);
      add(new THREE.CylinderGeometry(K.r, K.r, K.h, 12), m, 0, K.h / 2);
      add(new THREE.CylinderGeometry(0.002, 0.002, 0.012, 4), paint('ink', 0), 0, K.h + 0.006);
      return { g, main: m };
    }
    case 'clock': {
      const m = paint('bookRed', 0.1, 9);
      const b = add(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 14), m, 0, 0.045);
      b.rotation.x = Math.PI / 2;
      const face = add(new THREE.CircleGeometry(0.028, 14), paint('paint', 0.3), 0, 0.045, 0.0126);
      face.rotation.y = 0;
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.012, 6, 4), paint('bookMustard', 0.2), s * 0.022, 0.082, 0);
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 4), paint('ink', 0), s * 0.02, 0.01, 0);
      return { g, main: m };
    }
    case 'jar': {
      const m = paint('enamel', 0.1, 9);
      add(new THREE.CylinderGeometry(K.r, K.r * 0.95, K.h - 0.02, 14), m, 0, (K.h - 0.02) / 2);
      add(new THREE.CylinderGeometry(K.r * 0.75, K.r * 0.8, 0.02, 14), paint('pink', 0.05, 9), 0, K.h - 0.01);
      add(new THREE.SphereGeometry(0.01, 6, 4), paint('pink', 0.15), 0, K.h + 0.006);
      return { g, main: m };
    }
    case 'teapot': {
      const m = paint('enamel', 0.15, 9);
      const b = add(new THREE.SphereGeometry(K.r, 14, 10), m, 0, K.r * 0.85);
      b.scale.set(1, 0.85, 1);
      add(new THREE.CylinderGeometry(0.006, 0.01, 0.06, 6), m, K.r + 0.015, K.r * 0.95).rotation.z = -0.9;
      add(new THREE.TorusGeometry(0.025, 0.006, 5, 10, Math.PI), m, -K.r - 0.005, K.r * 0.85).rotation.z = Math.PI / 2;
      add(new THREE.SphereGeometry(0.012, 6, 4), m, 0, K.r * 1.6);
      return { g, main: m };
    }
    case 'bowl': {
      const m = paint('bookBlue', 0.15, 9);
      const pts = [[0.0, 0], [0.04, 0], [0.075, 0.035], [0.08, 0.05], [0.072, 0.05], [0.035, 0.008], [0, 0.008]].map(([x, y]) => new THREE.Vector2(x, y));
      add(new THREE.LatheGeometry(pts, 16), m);
      for (let i = 0; i < 3; i++) add(new THREE.SphereGeometry(0.026, 8, 6), paint('pot', 0.25, 9), Math.cos(i * 2.1) * 0.03, 0.04, Math.sin(i * 2.1) * 0.03);
      return { g, main: m };
    }
  }
}

const G = 9.8;
const UP = new THREE.Vector3(0, 1, 0);

/** a thing made, its parts of one material merged into one mesh (fewer draws on a phone) */
function make(kind: Kind, paint: Paint): { g: THREE.Group; main: THREE.Material } {
  const { g, main } = makeParts(kind, paint);
  const by = new Map<THREE.Material, THREE.Mesh[]>();
  for (const o of g.children) {
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material)) by.set(m.material, [...(by.get(m.material) ?? []), m]);
  }
  for (const [mat, meshes] of by) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      m.updateMatrix();
      const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
      return geo;
    });
    const merged = mergeGeometries(geos);
    for (const x of geos) x.dispose();
    if (!merged) continue;
    const one = new THREE.Mesh(merged, mat);
    one.castShadow = true;
    for (const m of meshes) { g.remove(m); m.geometry.dispose(); }
    g.add(one);
  }
  return { g, main };
}

/**
 * The things on the furniture, and what happens to them: pushed along a top they slide and slow;
 * over its edge they tip and fall, turning as they go; down on the floor a breakable one goes to
 * pieces (water spilt, earth scattered), the rest bounce, roll and come to rest; one that comes down
 * on a lower top stays there, to be knocked off again. Each down from a height is reported (points).
 */
export class Props {
  readonly group = new THREE.Group();
  readonly list: Prop[] = [];
  private shards: Shard[] = [];
  private puddles: THREE.Mesh[] = [];
  /** come down from a height: the thing, whether it broke, where */
  onDown: ((p: Prop, broke: boolean, at: THREE.Vector3) => void) | null = null;
  /** a thing begun to fall (for a sound of it going) */
  onTip: ((p: Prop) => void) | null = null;
  /** a light thump (something landing without breaking) */
  onBump: ((p: Prop, speed: number) => void) | null = null;

  constructor(private readonly paint: Paint, private readonly topAt: (x: number, z: number, below?: number) => Top | null) {}

  /** a thing put down on a top (or the floor) */
  place(kind: Kind, on: Top | null, x: number, z: number, yaw = Math.random() * Math.PI * 2) {
    const { g, main } = make(kind, this.paint);
    g.position.set(x, on ? on.h : 0, z);
    g.rotation.y = yaw;
    this.group.add(g);
    const p: Prop = { kind, group: g, v: new THREE.Vector3(), w: new THREE.Vector3(), on, state: 'still', fell: 0, mat: main, t: 0 };
    this.list.push(p);
    return p;
  }

  /** a paw's blow at a thing: along a way (flat, normalised), so hard (m/s) */
  swat(p: Prop, dir: THREE.Vector3, speed: number) {
    if (p.state === 'broken' || p.state === 'fall') return;
    const K = KINDS[p.kind];
    const s = speed / Math.sqrt(K.mass);
    p.v.set(dir.x * s, 0, dir.z * s);
    p.w.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 4);
    if (p.state === 'down' && K.rolls) p.v.y = 0.4;
    p.state = 'slide';
  }

  /** a thing bumped by the cat going by: shoved along a way, at least so fast */
  nudge(p: Prop, dir: THREE.Vector3, speed: number) {
    if (p.state !== 'still' && p.state !== 'slide') return;
    const s = speed / Math.sqrt(KINDS[p.kind].mass);
    if (Math.hypot(p.v.x, p.v.z) >= s) return;
    p.v.set(dir.x * s, 0, dir.z * s);
    if (p.state === 'still') p.w.set(0, (Math.random() - 0.5) * 4, 0);
    p.state = 'slide';
  }

  /** things still to be had: not on the floor yet, not broken */
  get standing() {
    return this.list.filter((p) => p.on && p.state !== 'broken' && p.state !== 'down');
  }

  step(dt: number) {
    for (const p of this.list) this.move(p, dt);
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.t += dt;
      if (!s.still) {
        s.v.y -= G * dt;
        s.m.position.addScaledVector(s.v, dt);
        s.m.rotation.x += s.w.x * dt;
        s.m.rotation.z += s.w.z * dt;
        if (s.m.position.y < 0.004) {
          s.m.position.y = 0.004;
          s.v.y *= -0.25;
          s.v.x *= 0.5;
          s.v.z *= 0.5;
          s.w.multiplyScalar(0.5);
          if (Math.abs(s.v.y) < 0.15) s.still = true;
        }
      }
    }
    for (const d of this.puddles) if (d.scale.x < d.userData.to) d.scale.setScalar(Math.min(d.userData.to, d.scale.x + dt * 0.8));
  }

  private move(p: Prop, dt: number) {
    const K = KINDS[p.kind], g = p.group;
    if (p.state === 'still' || p.state === 'broken') return;
    if (p.state === 'down') {
      p.t += dt;
      if (p.v.lengthSq() < 1e-4) return;
    }
    if (p.state === 'slide' || p.state === 'down') {
      // (along the top, slowing: rolling things hardly)
      const fr = K.rolls ? 0.6 : 3.2;
      const sp = Math.hypot(p.v.x, p.v.z);
      const ns = Math.max(0, sp - fr * dt);
      if (sp > 0) { p.v.x *= ns / sp; p.v.z *= ns / sp; }
      g.position.x += p.v.x * dt;
      g.position.z += p.v.z * dt;
      g.rotation.y += p.w.y * dt * Math.min(1, sp * 2);
      p.w.y *= Math.exp(-dt * 4);
      if (K.rolls) { g.rotation.x += p.v.z * dt / K.r; g.rotation.z -= p.v.x * dt / K.r; }
      // (off its edge: over it goes)
      const T = p.on;
      if (T && (g.position.x < T.x0 || g.position.x > T.x1 || g.position.z < T.z0 || g.position.z > T.z1)) {
        p.state = 'fall';
        p.fell = Math.max(p.fell, g.position.y);
        p.on = null;
        p.v.y = 0.15;
        // (tipping over the edge it went over)
        const tip = new THREE.Vector3(p.v.z, 0, -p.v.x).normalize();
        p.w.copy(tip).multiplyScalar(6 + 5 * Math.random()).add(new THREE.Vector3(0, (Math.random() - 0.5) * 6, 0));
        this.onTip?.(p);
      } else if (ns === 0 && p.state === 'slide') p.state = p.on ? 'still' : 'down';
      // (the room's walls)
      if (g.position.z < -0.57) { g.position.z = -0.57; p.v.z = Math.abs(p.v.z) * 0.3; }
      return;
    }
    // falling: down, turning
    p.v.y -= G * dt;
    g.position.addScaledVector(p.v, dt);
    const ang = p.w.length();
    if (ang > 0) g.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(p.w.clone().normalize(), ang * dt));
    if (g.position.z < -0.57) { g.position.z = -0.57; p.v.z = Math.abs(p.v.z) * 0.3; }
    const below = this.topAt(g.position.x, g.position.z, p.fell - 0.02);
    const ground = below ? below.h : 0;
    if (g.position.y > ground) return;
    g.position.y = ground;
    const speed = -p.v.y;
    const drop = p.fell - ground;
    if (K.fragile && !below && speed > 1.3) {
      this.shatter(p);
      this.onDown?.(p, true, g.position.clone());
      return;
    }
    // (bounced, and down: on its side, or as it fell, at rest)
    this.onBump?.(p, speed);
    if (speed > 1.2 && !below) {
      p.v.y = speed * 0.25;
      p.v.x *= 0.6;
      p.v.z *= 0.6;
      p.w.multiplyScalar(0.5);
      g.position.y = ground + 0.001;
      return;
    }
    // (come to rest: upright again if it landed mostly upright, else lying as it is, flat)
    const up = UP.clone().applyQuaternion(g.quaternion);
    if (up.y > 0.6) { const yaw = g.rotation.y; g.quaternion.identity(); g.rotation.y = yaw; }
    else if (!K.rolls) {
      // (lying on its side: the up turned flat)
      const yaw = Math.atan2(up.x, up.z);
      g.rotation.set(Math.PI / 2, yaw, 0, 'YXZ');
      g.position.y = ground + K.r * 0.9;
    } else g.position.y = ground;
    p.w.set(0, 0, 0);
    p.v.y = 0;
    if (below) {
      p.on = below;
      p.state = 'slide';
      p.fell = 0;
    } else {
      p.on = null;
      p.state = 'down';
      if (drop > 0.2) this.onDown?.(p, false, g.position.clone());
      p.fell = 0;
    }
    if (K.spill === 'water' && !below) this.puddle(g.position, 0.07);
  }

  /** gone to pieces: shards flying, and what was in it spilt */
  private shatter(p: Prop) {
    const K = KINDS[p.kind], g = p.group;
    p.state = 'broken';
    g.visible = false;
    const n = 5 + Math.floor(K.r * 60);
    // (only so many pieces lying about: the oldest at rest swept away)
    while (this.shards.length + n > 70) {
      const i = this.shards.findIndex((s) => s.still);
      if (i < 0) break;
      const [old] = this.shards.splice(i, 1);
      this.group.remove(old.m);
      old.m.geometry.dispose();
    }
    for (let i = 0; i < n; i++) {
      const s = 0.008 + Math.random() * 0.016;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.5, s * (0.6 + Math.random())), p.mat);
      m.position.copy(g.position).add(new THREE.Vector3((Math.random() - 0.5) * K.r, 0.01 + Math.random() * 0.02, (Math.random() - 0.5) * K.r));
      m.castShadow = true;
      this.group.add(m);
      const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 1.4;
      this.shards.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 0.6 + Math.random() * 1.2, Math.sin(a) * sp * 0.7), w: new THREE.Vector3((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 20), t: 0, still: false });
    }
    if (K.spill === 'water') this.puddle(g.position, 0.1 + K.r);
    if (K.spill === 'soil') this.puddle(g.position, 0.08, 'brown');
    // (a plant: its leaves scattered too)
    if (p.kind === 'plant' || p.kind === 'vase') {
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), this.paint(p.kind === 'vase' ? (['bookRed', 'pink', 'bookMustard'][i % 3] as Material) : 'leaf', 0.1));
        m.scale.set(1, 0.4, 0.8);
        m.position.copy(g.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.03, (Math.random() - 0.5) * 0.08));
        this.group.add(m);
        const a = Math.random() * Math.PI * 2;
        this.shards.push({ m, v: new THREE.Vector3(Math.cos(a) * 0.6, 0.8, Math.sin(a) * 0.4), w: new THREE.Vector3(3, 0, 3), t: 0, still: false });
      }
    }
  }

  /** a puddle (or earth) spreading on the floor where it landed */
  private puddle(at: THREE.Vector3, r: number, m: Material = 'water') {
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 16).rotateX(-Math.PI / 2), this.paint(m, m === 'water' ? 0.15 : -0.05));
    d.position.set(at.x + (Math.random() - 0.5) * 0.02, 0.003 + this.puddles.length * 0.0004, at.z);
    d.scale.setScalar(0.2);
    d.userData.to = 1;
    d.scale.y = 1;
    this.group.add(d);
    this.puddles.push(d);
  }

  /** all of it away: the props, their pieces, the puddles */
  clear() {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      o.traverse((m) => { if (m instanceof THREE.Mesh) m.geometry.dispose(); });
    }
    this.list.length = 0;
    this.shards.length = 0;
    this.puddles.length = 0;
  }
}
