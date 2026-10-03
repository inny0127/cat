import * as THREE from 'three';
import { LIGHT_GLSL } from '../cat3d/fur';
import { PIX, PIX_GLSL, type Material } from '../cat3d/pixclass';
import type { CatState } from '../sim/state';

/**
 * The cat's room, drawn by the pixel pass from the same palette as the cat (pixclass.ts): a corner
 * of an old flat with honey floorboards, sage panelling under peach plaster, a big window with a
 * deep sill, mauve curtains and fairy lights, a shelf of books and a trailing plant, a monstera in
 * a terracotta pot, a floor lamp, a round rug, the cat's bed, its bowls and its box. By day the sun
 * comes in from the left; at night the lamp makes a warm pool and the rest of the room goes blue.
 * Through the window the sky follows the real hour: clouds by day, a pink dusk, and at night stars,
 * the moon and a town of lit windows.
 */
const VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
#include <packing>
uniform float uMat;
uniform int uPattern;
uniform float uGlow;
uniform float uDither;
uniform float uTone;
uniform vec3 uKeyDir;
uniform float uSpec;
uniform vec3 uLampPos;
uniform float uLampInt;
uniform float uDay;
uniform vec3 uRug;       // centre x, z and radius
uniform float uWallZ;
varying vec3 vN;
varying vec3 vWorld;
varying vec2 vUv;
${LIGHT_GLSL}
${PIX_GLSL}
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  int m = int(uMat + 0.5);
  float tone = uTone;
  if (uPattern == 1) {
    // floorboards running away from you, their ends staggered, now and then a darker one
    float bx = vWorld.x / 0.1;
    float bi = floor(bx), fx = fract(bx);
    float off = hash(bi) * 0.7;
    float bz = (vWorld.z + off) / 0.7;
    float ji = floor(bz), fz = fract(bz);
    float h = hash(bi * 7.13 + ji * 3.7);
    bool seam = fx < 0.07 || fz < 0.012;
    m = seam || h < 0.28 ? ${PIX.floorDark} : ${PIX.floor};
    tone += seam ? -0.08 : (h - 0.5) * 0.05;
  } else if (uPattern == 2) {
    // a round rug: a cream border, a cream ring inside it, indigo between, a cream heart of it
    float r = length(vWorld.xz - uRug.xy) / uRug.z;
    bool cream = r > 0.9 || (r > 0.66 && r < 0.72) || r < 0.16;
    m = cream ? ${PIX.rugCream} : ${PIX.rug};
  } else if (uPattern == 3) {
    // the wall: panelling to the dado rail, plaster above
    if (vWorld.y < 0.3) {
      m = ${PIX.panel};
      if (fract(vWorld.x / 0.24) < 0.06) tone -= 0.1;
    } else if (vWorld.y < 0.335) m = ${PIX.paint};
    else m = ${PIX.wall};
    // the floor's shadow along the foot of the wall
    tone -= 0.12 * (1.0 - smoothstep(0.0, 0.06, vWorld.y));
  }
  // the floor darkens toward the wall's foot
  if (uPattern == 1 || uPattern == 2) tone -= 0.1 * (1.0 - smoothstep(0.0, 0.12, vWorld.z - uWallZ));
  float sh = keyShadow(vWorld, N);
  float direct = max(dot(N, uKeyDir), 0.0) * sh;
  float sky = 0.3 + 0.12 * (N.y * 0.5 + 0.5);
  // the lamp: a shade open below, so a pool of light under it and a softer glow all round
  vec3 toL = uLampPos - vWorld;
  float dl = length(toL);
  vec3 Ld = toL / dl;
  float lamp = uLampInt * (0.3 + 0.7 * max(dot(N, Ld), 0.0)) * (0.45 + 0.55 * smoothstep(0.1, 0.8, Ld.y)) / (1.0 + dl * dl * 2.6);
  // by day the sunlit floor and the room behind you bounce light back onto everything, most of all
  // onto the walls facing into the room
  float bounce = 0.12 + 0.16 * max(N.z, 0.0);
  float light = (0.6 * direct + sky + bounce) * mix(0.3, 1.0, uDay) + lamp + tone;
  gl_FragColor = pixRoom(m, light, uGlow > 0.5 ? 1.0 : uDither > 0.5 ? 0.25 : 0.0);
}`;

/** the sky through the window: written as finished colours (alpha 0.15), in art pixels */
const SKY_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHour;
uniform vec2 uSkyPx;     // the window's size in art pixels (for the town and the stars)
varying vec2 vUv;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
vec3 hex(float r, float g, float b) { return vec3(r, g, b) / 255.0; }
// a dithered gradient through four colours
vec3 grad(vec3 a, vec3 b, vec3 c, vec3 d, float t, vec2 px) {
  float bay = fract(sin(dot(mod(px, 4.0), vec2(12.9898, 78.233))) * 43758.5453);
  const float BAY[16] = float[](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  ivec2 q = ivec2(mod(px, 4.0));
  float s = clamp(t, 0.0, 1.0) * 3.0 + (BAY[q.x * 4 + q.y] / 16.0 - 0.5) * 0.7;
  int i = int(clamp(floor(s + 0.5), 0.0, 3.0));
  return i == 0 ? a : i == 1 ? b : i == 2 ? c : d;
}
void main() {
  vec2 px = floor(vUv * uSkyPx);
  float y = vUv.y;
  float h = uHour;
  float night = 1.0 - smoothstep(5.5, 7.0, h) * (1.0 - smoothstep(19.0, 20.5, h));
  float dusk = max(1.0 - abs(h - 19.0) / 1.6, 1.0 - abs(h - 6.3) / 1.2);
  vec3 c;
  if (night > 0.5) c = grad(hex(59.0, 52.0, 98.0), hex(44.0, 42.0, 82.0), hex(33.0, 34.0, 66.0), hex(24.0, 26.0, 52.0), y, px);
  else if (dusk > 0.35) c = grad(hex(255.0, 196.0, 140.0), hex(240.0, 140.0, 118.0), hex(176.0, 112.0, 148.0), hex(108.0, 92.0, 150.0), y, px);
  else c = grad(hex(214.0, 234.0, 242.0), hex(178.0, 218.0, 238.0), hex(141.0, 196.0, 230.0), hex(112.0, 172.0, 220.0), y, px);
  if (night > 0.5) {
    // stars that twinkle, and the moon
    float st = hash2(px);
    if (y > 0.35 && st > 0.985 && sin(uTime * (1.0 + st * 3.0) + st * 40.0) > -0.3) c = hex(255.0, 246.0, 214.0);
    vec2 mc = vec2(0.72, 0.8) * uSkyPx;
    float md = length(px - mc), md2 = length(px - mc - vec2(2.0, 1.0));
    if (md < 3.6 && md2 > 3.0) c = hex(246.0, 231.0, 168.0);
  } else {
    // slow clouds
    float n = noise(px * vec2(0.09, 0.18) + vec2(uTime * 0.02, 0.0)) * 0.7 + noise(px * vec2(0.2, 0.4) + vec2(uTime * 0.03, 3.0)) * 0.3;
    float band = smoothstep(0.35, 0.95, y);
    if (n * band > 0.42) c = dusk > 0.35 ? hex(255.0, 214.0, 190.0) : hex(246.0, 249.0, 252.0);
    else if (n * band > 0.37) c = dusk > 0.35 ? hex(232.0, 160.0, 150.0) : hex(214.0, 228.0, 240.0);
  }
  // the town across the way: roofs, and at night lit windows
  float col = floor(px.x / 5.0);
  float roof = (0.16 + 0.22 * hash2(vec2(col, 1.0))) * uSkyPx.y;
  if (px.y < roof) {
    c = night > 0.5 ? hex(22.0, 22.0, 40.0) : dusk > 0.35 ? hex(96.0, 70.0, 104.0) : hex(126.0, 150.0, 176.0);
    if (night > 0.5 && mod(px.x, 5.0) > 0.5 && mod(px.x, 5.0) < 3.5 && mod(px.y, 3.0) > 1.0 && px.y < roof - 1.0) {
      float w = hash2(floor(px / vec2(1.0, 3.0)) + floor(uTime / 23.0) * 0.01);
      if (w > 0.6) c = w > 0.85 ? hex(255.0, 160.0, 92.0) : hex(255.0, 210.0, 120.0);
    }
  }
  gl_FragColor = vec4(c, 0.15);
}`;

const SKY_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** the fairy lights' bulbs: finished colours that twinkle */
const BULB_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOn;
uniform vec3 uCol;
uniform float uSeed;
void main() {
  float tw = 0.75 + 0.25 * sin(uTime * (0.8 + uSeed) + uSeed * 9.0);
  vec3 off = vec3(0.32, 0.28, 0.3);
  gl_FragColor = vec4(mix(off, uCol * tw + (1.0 - tw) * 0.25, uOn), 0.15);
}`;

export interface Spots {
  bed: THREE.Vector3;
  food: THREE.Vector3;
  water: THREE.Vector3;
  litter: THREE.Vector3;
}

export class Room {
  readonly group = new THREE.Group();
  readonly spots: Spots;
  /** where the lamp's light comes from */
  readonly lampPos: THREE.Vector3;
  private readonly kibble: THREE.Mesh;
  private readonly water: THREE.Mesh;
  private readonly clumps: THREE.InstancedMesh;
  private readonly sky: THREE.ShaderMaterial;
  private readonly shade: THREE.ShaderMaterial;
  private readonly bulbs: THREE.ShaderMaterial[] = [];
  private readonly mats: THREE.ShaderMaterial[] = [];
  private time = 0;

  constructor(private readonly lights: Record<string, { value: unknown }>, at: { bed: THREE.Vector3 }) {
    const bed = at.bed.clone();
    const bx = bed.x, bz = bed.z;
    const wallZ = bz - 0.62;
    this.spots = {
      bed,
      food: new THREE.Vector3(bx - 0.3, 0, wallZ + 0.16),
      water: new THREE.Vector3(bx - 0.15, 0, wallZ + 0.13),
      litter: new THREE.Vector3(bx + 0.62, 0, wallZ + 0.2),
    };
    const S = this.spots;
    const add = (m: THREE.Object3D, x: number, y: number, z: number) => {
      m.position.set(x, y, z);
      this.group.add(m);
      return m;
    };
    const shadowy = (m: THREE.Mesh) => { m.castShadow = true; m.receiveShadow = true; return m; };

    // the floor and the rug
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), this.mat('floor', { pattern: 1, wallZ }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    add(floor, bx, 0, wallZ + 1.5);
    const rugR = 0.42;
    const rug = new THREE.Mesh(new THREE.CircleGeometry(rugR, 48), this.mat('rug', { pattern: 2, rug: new THREE.Vector3(bx, bz - 0.02, rugR), wallZ }));
    rug.rotation.x = -Math.PI / 2;
    rug.receiveShadow = true;
    add(rug, bx, 0.002, bz - 0.02);

    // the back wall, round the window
    const winL = bx - 0.34, winR = bx + 0.34, winB = 0.36, winT = 1.16;
    const wallMat = this.mat('wall', { pattern: 3, dither: true });
    const wallPiece = (x0: number, x1: number, y0: number, y1: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), wallMat);
      m.receiveShadow = true;
      m.castShadow = true;   // the sun comes in only through the window
      add(m, (x0 + x1) / 2, (y0 + y1) / 2, wallZ);
    };
    wallPiece(bx - 2, winL, 0, 2.2);
    wallPiece(winR, bx + 2, 0, 2.2);
    wallPiece(winL, winR, 0, winB);
    wallPiece(winL, winR, winT, 2.2);
    // the dado rail stands proud of the wall
    add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(4, 0.03, 0.02), this.mat('paint'))), bx, 0.318, wallZ + 0.01);
    add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(4, 0.05, 0.015), this.mat('paint', { tone: -0.05 }))), bx, 0.025, wallZ + 0.008);

    // the window: the sky behind, a white frame and glazing bars, a deep sill
    const ww = winR - winL, wh = winT - winB;
    this.sky = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uHour: { value: 12 }, uSkyPx: { value: new THREE.Vector2(48, 56) } },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    });
    add(new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), this.sky), bx, winB + wh / 2, wallZ - 0.06);
    const paint = this.mat('paint');
    const bar = (w: number, h: number, d: number, x: number, y: number, z = wallZ - 0.02) => add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), paint)), x, y, z);
    bar(ww + 0.08, 0.045, 0.08, bx, winT + 0.02);                       // head
    bar(0.045, wh, 0.08, winL - 0.02, winB + wh / 2);                     // jambs
    bar(0.045, wh, 0.08, winR + 0.02, winB + wh / 2);
    bar(0.02, wh, 0.03, bx, winB + wh / 2, wallZ - 0.04);                 // glazing bars
    bar(ww, 0.02, 0.03, bx, winB + wh * 0.62, wallZ - 0.04);
    bar(ww + 0.14, 0.03, 0.15, bx, winB - 0.015, wallZ + 0.035);          // the sill
    // the curtains on their rod, gathered in soft folds
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, ww + 0.5, 8).rotateZ(Math.PI / 2), this.mat('metal'))), bx, winT + 0.09, wallZ + 0.06);
    for (const side of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.17, winT + 0.09 - 0.22, 18, 1);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.018 * Math.sin(pos.getX(i) / 0.17 * Math.PI * 5));
      g.computeVertexNormals();
      const c = shadowy(new THREE.Mesh(g, this.mat('curtain')));
      add(c, side < 0 ? winL - 0.07 : winR + 0.07, 0.22 + (winT + 0.09 - 0.22) / 2, wallZ + 0.07);
    }
    // fairy lights along the top of the window: a sagging wire and warm bulbs
    const n = 11, wire: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      wire.push(new THREE.Vector3(winL - 0.06 + t * (ww + 0.12), winT - 0.02 - 0.07 * Math.sin(Math.PI * ((t * 2) % 1)), wallZ + 0.1));
    }
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wire), 60, 0.0025, 4), this.mat('ink')), 0, 0, 0);
    const bulbCols = [[1, 0.86, 0.55], [1, 0.72, 0.5], [1, 0.95, 0.75], [1, 0.62, 0.62]];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = new THREE.CatmullRomCurve3(wire).getPoint(t);
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: this.timeU, uOn: this.nightU, uCol: { value: new THREE.Color(...(bulbCols[i % 4] as [number, number, number])) }, uSeed: { value: Math.random() } },
        vertexShader: SKY_VERT, fragmentShader: BULB_FRAG,
      });
      this.bulbs.push(m);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), m), p.x, p.y - 0.008, p.z);
    }

    // a shelf to the right of the window: books, a jar, a trailing plant
    const sx = winR + 0.32, sy = 0.92;
    add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.12), this.mat('brown'))), sx, sy, wallZ + 0.06);
    const books: [Material, number, number][] = [['bookRed', 0.13, 0.025], ['bookMustard', 0.15, 0.03], ['bookBlue', 0.12, 0.022], ['bookRed', 0.14, 0.028], ['bookBlue', 0.11, 0.02]];
    let bxs = sx - 0.18;
    for (const [mname, h, t] of books) {
      add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(t, h, 0.09), this.mat(mname))), bxs + t / 2, sy + 0.01 + h / 2, wallZ + 0.055);
      bxs += t + 0.003;
    }
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.06, 16), this.mat('pot'))), sx + 0.13, sy + 0.04, wallZ + 0.06);
    for (let i = 0; i < 9; i++) {
      // the trailing plant's strands, leaves down the wall
      const a = (i / 9 - 0.5) * 1.6;
      const len = 0.12 + 0.18 * Math.abs(Math.sin(i * 1.7));
      for (let j = 0; j < 5; j++) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), this.mat('leaf', { tone: (j % 2) * 0.05 }));
        l.scale.set(1, 0.6, 0.5);
        shadowy(l);
        add(l, sx + 0.13 + Math.sin(a) * 0.04 + j * 0.006 * Math.sign(a), sy + 0.06 - (j / 4) * len, wallZ + 0.07 + 0.02 * Math.cos(a));
      }
    }

    // the lamp: a bronze stand, a linen shade
    const lx = bx - 0.4, lz = bz - 0.34;
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 20), this.mat('metal'))), lx, 0.01, lz);
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 8), this.mat('metal'))), lx, 0.5, lz);
    this.shade = this.mat('shade');
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.17, 24, 1, true), this.shade)), lx, 1.02, lz);
    this.lampPos = new THREE.Vector3(lx, 0.97, lz);

    // a monstera in a terracotta pot by the box
    const px = bx + 0.42, pz = wallZ + 0.22;
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.2, 20), this.mat('pot'))), px, 0.1, pz);
    add(new THREE.Mesh(new THREE.CircleGeometry(0.1, 16).rotateX(-Math.PI / 2), this.mat('brown', { tone: -0.1 })), px, 0.19, pz);
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.bezierCurveTo(0.11, 0.04, 0.12, 0.2, 0, 0.26);
    leafShape.bezierCurveTo(-0.12, 0.2, -0.11, 0.04, 0, 0);
    const leafGeo = new THREE.ShapeGeometry(leafShape, 8);
    const stems: [number, number, number][] = [[0.0, 0.62, 0.0], [1.1, 0.45, 0.4], [2.3, 0.55, -0.2], [3.4, 0.4, 0.5], [4.6, 0.5, 0.1], [5.6, 0.36, -0.3], [0.6, 0.3, 0.6]];
    for (const [a, h, tilt] of stems) {
      const leaf = new THREE.Mesh(leafGeo, this.mat('leaf', { tone: tilt * 0.08 }));
      leaf.position.set(px + Math.cos(a) * 0.1, 0.2 + h, pz + Math.sin(a) * 0.08);
      leaf.rotation.set(-0.9 + tilt * 0.3, a, Math.cos(a) * 0.5);
      shadowy(leaf);
      this.group.add(leaf);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, h, 5), this.mat('leaf', { tone: -0.1 }));
      stem.position.set(px + Math.cos(a) * 0.05, 0.2 + h / 2, pz + Math.sin(a) * 0.04);
      stem.rotation.z = -Math.cos(a) * 0.2;
      this.group.add(stem);
    }

    // the bed: a soft teal rim round an oatmeal fleece cushion
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 32), this.mat('fleece'));
    cushion.receiveShadow = true;
    add(cushion, S.bed.x, 0.015, S.bed.z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.04, 12, 40), this.mat('bed'));
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = 0.75;
    shadowy(rim);
    add(rim, S.bed.x, 0.03, S.bed.z);

    // bowls: a red one for food, a white one for water
    const bowl = (m: Material) => {
      const pts = [[0.0, 0.002], [0.05, 0.002], [0.062, 0.032], [0.067, 0.04], [0.058, 0.04], [0.05, 0.012], [0.0, 0.012]].map(([x, y]) => new THREE.Vector2(x, y));
      return shadowy(new THREE.Mesh(new THREE.LatheGeometry(pts, 28), this.mat(m)));
    };
    add(bowl('redBowl'), S.food.x, 0, S.food.z);
    add(bowl('paint'), S.water.x, 0, S.water.z);
    this.kibble = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mat('brown')), S.food.x, 0.012, S.food.z) as THREE.Mesh;
    this.water = add(new THREE.Mesh(new THREE.CircleGeometry(0.053, 24).rotateX(-Math.PI / 2), this.mat('water')), S.water.x, 0.03, S.water.z) as THREE.Mesh;

    // the litter box: open at the top, sand inside, and what the cat leaves in it
    const box = new THREE.Group();
    const W = 0.3, D = 0.22, Hh = 0.08, t = 0.012;
    const boxMat = this.mat('bed', { tone: 0.05 });
    const wallMesh = (w: number, h: number, d: number, x: number, z: number) => {
      const m = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat));
      m.position.set(x, h / 2, z);
      box.add(m);
    };
    wallMesh(W, Hh, t, 0, -D / 2);
    wallMesh(W, Hh, t, 0, D / 2);
    wallMesh(t, Hh, D, -W / 2, 0);
    wallMesh(t, Hh, D, W / 2, 0);
    const sand = new THREE.Mesh(new THREE.BoxGeometry(W - t, 0.05, D - t), this.mat('sand'));
    sand.position.y = 0.025;
    box.add(sand);
    this.clumps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 6, 4), this.mat('sand', { tone: -0.2 }), 8);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 8; i++) {
      m4.makeTranslation((Math.random() - 0.5) * (W - 0.06), 0.052, (Math.random() - 0.5) * (D - 0.06));
      this.clumps.setMatrixAt(i, m4);
    }
    box.add(this.clumps);
    box.position.copy(S.litter);
    this.group.add(box);
  }

  private readonly timeU = { value: 0 };
  private readonly nightU = { value: 0 };

  private mat(name: Material, o: { pattern?: number; tone?: number; rug?: THREE.Vector3; wallZ?: number; dither?: boolean } = {}) {
    const L = this.lights;
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uMat: { value: PIX[name] }, uPattern: { value: o.pattern ?? 0 }, uGlow: { value: 0 }, uTone: { value: o.tone ?? 0 },
        uDither: { value: o.dither ? 1 : 0 },
        uKeyDir: L.uKeyDir, uSpec: { value: 0 },
        uLampPos: L.uLampPos, uLampInt: L.uLampInt, uDay: L.uDay,
        uRug: { value: o.rug ?? new THREE.Vector3() }, uWallZ: { value: o.wallZ ?? -10 },
        uShadowMap: L.uShadowMap, uShadowMatrix: L.uShadowMatrix, uShadowOn: L.uShadowOn, uShadowSoft: L.uShadowSoft,
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
    this.mats.push(m);
    return m;
  }

  /** the size of an art pixel at the window (metres), so the sky is drawn in whole art pixels */
  setPixel(px: number) {
    this.sky.uniforms.uSkyPx.value.set(0.68 / px, 0.8 / px);
  }

  /** the bowls and box as the cat's state has them; the light and the sky by the hour */
  update(s: CatState, night = 0, hour = 12, dt = 0) {
    this.time += dt;
    this.timeU.value = this.time;
    this.sky.uniforms.uTime.value = this.time;
    this.sky.uniforms.uHour.value = hour;
    // night: the lamp on (its shade glowing), the fairy lights on, daylight down
    const L = this.lights;
    (L.uLampPos.value as THREE.Vector3).copy(this.lampPos);
    L.uLampInt.value = 1.5 * night;
    L.uDay.value = 1 - night;
    this.shade.uniforms.uGlow.value = night > 0.5 ? 1 : 0;
    this.nightU.value = night > 0.5 ? 1 : 0;
    const f = Math.max(0, Math.min(1, s.food));
    this.kibble.visible = f > 0.02;
    this.kibble.scale.set(0.55 + 0.45 * Math.sqrt(f), 0.15 + 0.85 * f, 0.55 + 0.45 * Math.sqrt(f));
    const w = Math.max(0, Math.min(1, s.water));
    this.water.visible = w > 0.02;
    this.water.position.y = 0.012 + 0.024 * w;
    this.water.scale.setScalar(0.85 + 0.15 * w);
    this.clumps.count = Math.round(Math.max(0, Math.min(1, s.litter)) * 8);
  }
}
