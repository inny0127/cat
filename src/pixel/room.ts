import * as THREE from 'three';
import { LIGHT_GLSL } from '../cat3d/fur';
import type { CatState } from '../sim/state';

/**
 * The room behind the window, drawn by the pixel pass in its own palette (the things in it mark
 * themselves with alpha 0.35): the back wall, the cat's bed, the food and water bowls at the back,
 * whose contents rise and fall with the cat's state, and the litter box off to one side.
 */
const VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
#include <packing>
uniform vec3 uColor;
uniform vec3 uKeyDir;
uniform float uSpec;
uniform float uAlpha;
varying vec3 vN;
varying vec3 vWorld;
${LIGHT_GLSL}
void main() {
  vec3 N = normalize(vN);
  float sh = keyShadow(vWorld, N);
  // two soft tones under the key light, as the cat has; 0.87 undoes the pixel pass's exposure
  float lit = smoothstep(0.3, 0.6, dot(N, uKeyDir) * 0.5 + 0.5) * mix(0.55, 1.0, sh);
  gl_FragColor = vec4(uColor * mix(0.62, 1.0, lit) * 0.87, uAlpha);
}`;

export interface Spots {
  bed: THREE.Vector3;
  food: THREE.Vector3;
  water: THREE.Vector3;
  litter: THREE.Vector3;
}

const srgb = (hex: string) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);

export class Room {
  readonly group = new THREE.Group();
  readonly spots: Spots;
  private readonly kibble: THREE.Mesh;
  private readonly water: THREE.Mesh;
  private readonly clumps: THREE.InstancedMesh;

  constructor(private readonly lights: Record<string, { value: unknown }>, at: { bed: THREE.Vector3 }) {
    const bed = at.bed.clone();
    this.spots = {
      bed,
      food: new THREE.Vector3(bed.x - 0.1, 0, bed.z - 0.45),
      water: new THREE.Vector3(bed.x + 0.08, 0, bed.z - 0.5),
      litter: new THREE.Vector3(bed.x + 0.55, 0, bed.z - 0.5),
    };
    const S = this.spots;

    // the back wall, and the skirting along its foot
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), this.mat('#e9dfd0', 0.25));
    wall.position.set(0, 1, bed.z - 0.95);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(6, 0.05, 0.02), this.mat('#c8a27a'));
    skirt.position.set(0, 0.025, bed.z - 0.94);
    this.group.add(wall, skirt);

    // the bed: a round cushion in a soft rim
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 32), this.mat('#b9cbe0'));
    cushion.position.set(S.bed.x, 0.006, S.bed.z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.022, 10, 40), this.mat('#8fa7c4'));
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = 0.8;   // a low, soft rim
    rim.position.set(S.bed.x, 0.016, S.bed.z);
    cushion.receiveShadow = rim.receiveShadow = true;
    this.group.add(cushion, rim);

    // bowls: a red one for food, a blue-white one for water
    const bowl = (color: string) => {
      const pts = [[0.0, 0.002], [0.05, 0.002], [0.062, 0.032], [0.067, 0.04], [0.058, 0.04], [0.05, 0.012], [0.0, 0.012]].map(([x, y]) => new THREE.Vector2(x, y));
      const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), this.mat(color));
      m.castShadow = true;
      return m;
    };
    const fb = bowl('#cf6f74');
    fb.position.copy(S.food);
    const wb = bowl('#f7f3ec');
    wb.position.copy(S.water);
    this.kibble = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mat('#c58b52'));
    this.kibble.position.copy(S.food);
    this.water = new THREE.Mesh(new THREE.CircleGeometry(0.053, 24), this.mat('#86c4e3'));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.copy(S.water);
    this.group.add(fb, wb, this.kibble, this.water);

    // the litter box: open at the top, sand inside, and what the cat leaves in it
    const box = new THREE.Group();
    const W = 0.3, D = 0.22, Hh = 0.08, t = 0.012;
    const boxMat = this.mat('#a57f58');
    const wallMesh = (w: number, h: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
      m.position.set(x, h / 2, z);
      m.castShadow = true;
      box.add(m);
    };
    wallMesh(W, Hh, t, 0, -D / 2);
    wallMesh(W, Hh, t, 0, D / 2);
    wallMesh(t, Hh, D, -W / 2, 0);
    wallMesh(t, Hh, D, W / 2, 0);
    const sand = new THREE.Mesh(new THREE.BoxGeometry(W - t, 0.05, D - t), this.mat('#e3dccd'));
    sand.position.y = 0.025;
    box.add(sand);
    this.clumps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 6, 4), this.mat('#968c7a'), 8);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 8; i++) {
      m4.makeTranslation((Math.random() - 0.5) * (W - 0.06), 0.052, (Math.random() - 0.5) * (D - 0.06));
      this.clumps.setMatrixAt(i, m4);
    }
    box.add(this.clumps);
    box.position.copy(S.litter);
    this.group.add(box);
  }

  private mat(hex: string, alpha = 0.35) {
    const L = this.lights;
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: srgb(hex) }, uKeyDir: L.uKeyDir, uSpec: { value: 0 }, uAlpha: { value: alpha },
        uShadowMap: L.uShadowMap, uShadowMatrix: L.uShadowMatrix, uShadowOn: L.uShadowOn, uShadowSoft: L.uShadowSoft,
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
  }

  /** the bowls and box as the cat's state has them */
  update(s: CatState) {
    const f = Math.max(0, Math.min(1, s.food));
    this.kibble.visible = f > 0.02;
    this.kibble.scale.set(0.55 + 0.45 * Math.sqrt(f), 0.15 + 0.85 * f, 0.55 + 0.45 * Math.sqrt(f));
    this.kibble.position.y = 0.012;
    const w = Math.max(0, Math.min(1, s.water));
    this.water.visible = w > 0.02;
    this.water.position.y = 0.012 + 0.024 * w;
    this.water.scale.setScalar(0.85 + 0.15 * w);
    this.clumps.count = Math.round(Math.max(0, Math.min(1, s.litter)) * 8);
  }
}
