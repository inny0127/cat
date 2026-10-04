import * as THREE from 'three';
import { AO_GLSL, LIGHT_GLSL } from '../cat3d/fur';
import { PIX, PIX_GLSL } from '../cat3d/pixclass';

/**
 * The ball of wool the smooth cat plays with, on its paper: the pixel room's ball (pixel/room.ts)
 * without the room. It rolls, slowing, turning as it goes, its loose strand trailing after it; a
 * finger can take it and roll it about (quick after the fingertip, but rolling, never jumping);
 * a paw sends it off; paws coming down on it hold it a while. It is red wool, painted from the
 * same ramp as the pixel room's ball, lit as the cat is.
 */

const VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vLocal;
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
#include <packing>
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uFillDir;
uniform vec3 uFillCol;
uniform vec3 uRimDir;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform float uSpec;
uniform float uWool;    // 1: the ball, wound in bands; 0: the loose strand
${LIGHT_GLSL}
${AO_GLSL}
${PIX_GLSL}
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vLocal;
void main() {
  vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  float tone = 0.12;
  if (uWool > 0.5) {
    // strands wound round it in bands, one way over another (they turn with it as it rolls)
    vec3 q = normalize(vLocal);
    float b1 = fract(asin(clamp(dot(q, vec3(0.0, 0.8, 0.6)), -1.0, 1.0)) / 0.3);
    float b2 = fract(asin(clamp(dot(q, vec3(0.8, -0.2, 0.56)), -1.0, 1.0)) / 0.3);
    bool top = dot(q, vec3(0.5, 0.5, -0.7)) > 0.0;
    float b = top ? b2 : b1;
    if (b < 0.28) tone -= 0.09;
    else if (b > 0.85) tone += 0.04;
  }
  float sh = keyShadow(vWorld, N);
  float direct = smoothstep(-0.15, 0.55, dot(N, uKeyDir)) * mix(0.25, 1.0, sh);
  float light = direct * 0.56 + (N.y * 0.5 + 0.5) * 0.28 + max(dot(N, uFillDir), 0.0) * 0.2 + max(-N.y, 0.0) * 0.14;
  light = light * mix(0.55, 1.0, capsuleAO(vWorld, N)) + tone;
  gl_FragColor = pixRoom(${PIX.bookRed}, light, 0.25);
}`;

const R = 0.045;

export class Yarn {
  readonly mesh: THREE.Mesh;
  private readonly strand: THREE.Mesh;
  private readonly v = new THREE.Vector3();
  private readonly tail = new THREE.Vector3();
  private hold: THREE.Vector3 | null = null;
  private pinned = 0;
  private pinAt: THREE.Vector3 | null = null;
  private rebuild = 0;
  /** the paper it rolls over (it glances off the edges) */
  bounds = { minX: -0.9, maxX: 0.9, minZ: -0.55, maxZ: 0.75 };

  constructor(scene: THREE.Scene, lights: Record<string, { value: unknown }>, at: THREE.Vector3) {
    const mat = (wool: number) => new THREE.ShaderMaterial({
      uniforms: { ...lights, uWool: { value: wool } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 18), mat(1));
    this.mesh.castShadow = true;
    this.mesh.position.set(at.x, R, at.z);
    this.strand = new THREE.Mesh(new THREE.BufferGeometry(), mat(0));
    this.tail.set(at.x + 0.12, 0.003, at.z + 0.2);
    scene.add(this.mesh, this.strand);
    this.windStrand();
  }

  /** where the ball is */
  at() {
    return this.mesh.position;
  }

  /** a paw sends the ball rolling, a way and at a speed (m/s); under a finger it stays there */
  kick(dir: THREE.Vector3, speed: number) {
    if (this.hold) return;
    const d = Math.hypot(dir.x, dir.z) || 1;
    this.v.set((dir.x / d) * speed, 0, (dir.z / d) * speed);
  }

  /** a finger on the ball: it rolls after the finger to a point on the floor (null: let go, and it
   *  rolls on the way it was going, no faster than a good flick) */
  holdAt(at: THREE.Vector3 | null) {
    if (at) {
      (this.hold ??= new THREE.Vector3()).set(at.x, 0, at.z);
      return;
    }
    this.hold = null;
    const sp = Math.hypot(this.v.x, this.v.z);
    if (sp > 1.3) this.v.multiplyScalar(1.3 / sp);
  }

  /** a cat's paws come down on the ball: held there a while, however it is pulled */
  pin(sec: number, at: THREE.Vector3) {
    this.pinned = Math.max(this.pinned, sec);
    (this.pinAt ??= new THREE.Vector3()).set(at.x, R, at.z);
    this.v.set(0, 0, 0);
  }

  get held() {
    return !!this.hold;
  }
  get isPinned() {
    return this.pinned > 0;
  }
  /** how fast it is going (m/s) */
  get speed() {
    return Math.hypot(this.v.x, this.v.z);
  }

  /** the ball and the toy interface the pixel cat's play takes (pixel/avatar.ts toys) */
  toys() {
    return {
      yarn: () => this.at(),
      kick: (dir: THREE.Vector3, speed: number) => this.kick(dir, speed),
      held: () => this.held,
      pin: (sec: number, at: THREE.Vector3) => this.pin(sec, at),
      pinned: () => this.isPinned,
    };
  }

  update(dt: number) {
    const p = this.mesh.position, v = this.v;
    let ns: number;
    if (this.pinned > 0) {
      // under the paws: drawn in under them, then still
      this.pinned = Math.max(0, this.pinned - dt);
      const to = this.pinAt ?? p;
      v.set(to.x - p.x, 0, to.z - p.z).multiplyScalar(Math.min(1, dt * 20) / Math.max(dt, 1e-4));
      ns = Math.hypot(v.x, v.z);
      if (this.pinned <= 0) v.set(0, 0, 0);
      if (ns < 1e-4) return;
    } else if (this.hold) {
      v.set((this.hold.x - p.x) * 12, 0, (this.hold.z - p.z) * 12);
      ns = Math.hypot(v.x, v.z);
      if (ns > 2.2) { v.multiplyScalar(2.2 / ns); ns = 2.2; }
      if (ns < 1e-4) return;
    } else {
      const sp = Math.hypot(v.x, v.z);
      if (sp < 1e-4) return;
      ns = Math.max(0, sp - 0.55 * dt);
      v.multiplyScalar(ns / sp);
    }
    p.x += v.x * dt;
    p.z += v.z * dt;
    if (ns > 1e-5) this.mesh.rotateOnWorldAxis(new THREE.Vector3(v.z, 0, -v.x).normalize(), (ns * dt) / R);
    const B = this.bounds;
    if (p.x < B.minX || p.x > B.maxX) { p.x = Math.max(B.minX, Math.min(B.maxX, p.x)); v.x *= -0.5; }
    if (p.z < B.minZ || p.z > B.maxZ) { p.z = Math.max(B.minZ, Math.min(B.maxZ, p.z)); v.z *= -0.5; }
    if ((this.rebuild -= dt) <= 0) {
      this.rebuild = 0.06;
      this.windStrand();
    }
  }

  /** the loose strand: from the ball to its end, which is dragged along once the ball is far */
  private windStrand() {
    const p = this.mesh.position, t = this.tail;
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz), L = 0.3;
    if (d > L) { t.x = p.x + (dx / d) * L; t.z = p.z + (dz / d) * L; }
    const ux = (t.x - p.x) / Math.max(d, 1e-4), uz = (t.z - p.z) / Math.max(d, 1e-4);
    const pts = [
      new THREE.Vector3(p.x + ux * 0.04, 0.008, p.z + uz * 0.04),
      new THREE.Vector3(p.x + (t.x - p.x) * 0.4 - uz * 0.03, 0.003, p.z + (t.z - p.z) * 0.4 + ux * 0.03),
      new THREE.Vector3(p.x + (t.x - p.x) * 0.7 + uz * 0.025, 0.003, p.z + (t.z - p.z) * 0.7 - ux * 0.025),
      t.clone(),
    ];
    this.strand.geometry.dispose();
    this.strand.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0028, 5);
  }
}
