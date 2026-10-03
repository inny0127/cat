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
    bool cream = r > 0.92 || (r > 0.78 && r < 0.81);
    m = cream ? ${PIX.rugCream} : ${PIX.rug};
    // a tufted texture: every so often a stitch a shade lighter
    if (!cream && fract(sin(dot(floor(vWorld.xz / 0.018), vec2(12.9898, 78.233))) * 43758.5453) > 0.86) tone += 0.06;
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
    // one sheet with the window cut out of it (pieces would leave hairline cracks at their seams)
    const wallShape = new THREE.Shape([new THREE.Vector2(bx - 2, 0), new THREE.Vector2(bx + 2, 0), new THREE.Vector2(bx + 2, 2.4), new THREE.Vector2(bx - 2, 2.4)]);
    wallShape.holes.push(new THREE.Path([new THREE.Vector2(winL, winB), new THREE.Vector2(winL, winT), new THREE.Vector2(winR, winT), new THREE.Vector2(winR, winB)]));
    const wall = new THREE.Mesh(new THREE.ShapeGeometry(wallShape), this.mat('wall', { pattern: 3, dither: true }));
    wall.receiveShadow = true;
    wall.castShadow = true;   // the sun comes in only through the window
    add(wall, 0, 0, wallZ);
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
    // on the sill: a little succulent in a pot and a candle in a jar
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.05, 14), this.mat('paint', { tone: -0.04 }))), winL + 0.11, winB + 0.025, wallZ + 0.02);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const l = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), this.mat('leaf', { tone: 0.08 * (i % 2) })));
      l.scale.set(0.7, 1.4, 0.7);
      l.rotation.z = Math.cos(a) * 0.5;
      l.rotation.x = Math.sin(a) * 0.5;
      add(l, winL + 0.11 + Math.cos(a) * 0.014, winB + 0.06, wallZ + 0.02 + Math.sin(a) * 0.014);
    }
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.06, 14), this.mat('bookMustard', { tone: 0.1 }))), winR - 0.12, winB + 0.03, wallZ + 0.02);

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

    // a long shelf over the window: little pots of green (one trailing down past the curtain),
    // a few books, a candle, a small framed print of hills under a sun
    const ty = 1.4;
    add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.022, 0.11), this.mat('brown'))), bx, ty, wallZ + 0.055);
    for (const sxp of [-0.3, 0.3]) add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.08), this.mat('metal'))), bx + sxp, ty - 0.035, wallZ + 0.04);
    const pot = (x: number, r: number, h: number, m: Material) => add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, h, 14), this.mat(m))), x, ty + 0.011 + h / 2, wallZ + 0.055);
    const tuft = (x: number, y: number, n: number, spread: number, size: number, tone = 0) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const l = shadowy(new THREE.Mesh(new THREE.SphereGeometry(size, 6, 4), this.mat('leaf', { tone: tone + 0.05 * (i % 2) })));
        l.scale.set(0.8, 1.3, 0.8);
        l.rotation.z = Math.cos(a) * 0.6;
        add(l, x + Math.cos(a) * spread, y + Math.abs(Math.sin(i * 1.3)) * size, wallZ + 0.055 + Math.sin(a) * spread);
      }
    };
    pot(bx - 0.36, 0.035, 0.06, 'pot');
    tuft(bx - 0.36, ty + 0.09, 9, 0.025, 0.018);
    pot(bx - 0.2, 0.028, 0.05, 'paint');
    // a trailing pothos: strands of leaves down over the shelf's edge
    for (let i = 0; i < 6; i++) {
      const len = 0.14 + 0.22 * Math.abs(Math.sin(i * 1.9));
      const sx0 = bx - 0.2 + (i - 2.5) * 0.012;
      for (let j = 0; j < 6; j++) {
        const l = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), this.mat('leaf', { tone: ((i + j) % 3) * 0.05 })));
        l.scale.set(1, 0.65, 0.6);
        add(l, sx0 + Math.sin(j * 1.7 + i) * 0.012, ty + 0.05 - (j / 5) * len, wallZ + 0.11);
      }
    }
    const shelfBooks: [Material, number, number][] = [['bookBlue', 0.1, 0.02], ['bookRed', 0.12, 0.022], ['bookMustard', 0.09, 0.018]];
    let sbx = bx - 0.06;
    for (const [mname, h, t] of shelfBooks) {
      add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(t, h, 0.08), this.mat(mname))), sbx + t / 2, ty + 0.011 + h / 2, wallZ + 0.055);
      sbx += t + 0.002;
    }
    // the print, leaning against the wall
    const print = new THREE.Group();
    print.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.012), this.mat('brown', { tone: 0.1 }))));
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.09), this.mat('rugCream', { tone: 0.12 }));
    card.position.z = 0.0065;
    print.add(card);
    const hillIn = (cx: number, w: number, h: number, m: Material, z: number) => {
      const sh = new THREE.Shape();
      sh.moveTo(cx - w / 2, -0.045);
      for (let i = 0; i <= 10; i++) { const t = i / 10; sh.lineTo(cx - w / 2 + w * t, -0.045 + h * Math.sin(Math.PI * t)); }
      const hm = new THREE.Mesh(new THREE.ShapeGeometry(sh), this.mat(m));
      hm.position.z = z;
      print.add(hm);
    };
    hillIn(0.025, 0.1, 0.05, 'leaf', 0.007);
    hillIn(-0.03, 0.09, 0.035, 'panel', 0.0075);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(0.011, 10), this.mat('bookMustard', { tone: 0.15 }));
    sun.position.set(0.03, 0.02, 0.0072);
    print.add(sun);
    print.rotation.x = -0.12;
    print.position.set(bx + 0.13, ty + 0.072, wallZ + 0.04);
    this.group.add(print);
    pot(bx + 0.27, 0.03, 0.055, 'pot');
    tuft(bx + 0.27, ty + 0.085, 8, 0.02, 0.016, 0.05);
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12), this.mat('rugCream', { tone: 0.15 }))), bx + 0.38, ty + 0.036, wallZ + 0.05);

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

    // a monstera in a terracotta pot by the box: big split leaves fanned out toward the room
    const px = bx + 0.43, pz = wallZ + 0.24;
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.2, 20), this.mat('pot'))), px, 0.1, pz);
    add(shadowy(new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.012, 6, 24).rotateX(Math.PI / 2), this.mat('pot', { tone: 0.06 }))), px, 0.2, pz);
    add(new THREE.Mesh(new THREE.CircleGeometry(0.1, 16).rotateX(-Math.PI / 2), this.mat('brown', { tone: -0.1 })), px, 0.19, pz);
    const leafGeo = monsteraLeaf();
    const stems: [number, number, number, number][] = [
      // angle round the pot, height, lean out, size
      [0.0, 0.6, 0.55, 1.0], [1.3, 0.42, 0.75, 0.85], [2.6, 0.5, 0.6, 0.9], [-1.2, 0.36, 0.8, 0.8],
      [3.6, 0.3, 0.7, 0.75], [0.7, 0.24, 0.9, 0.7], [-2.3, 0.48, 0.5, 0.85],
    ];
    for (const [a, h, lean, sz] of stems) {
      const dir = new THREE.Vector3(Math.sin(a) * 0.9, 0, Math.cos(a) * 0.6 + 0.25).normalize();
      const tip = new THREE.Vector3(px, 0.2, pz).addScaledVector(dir, lean * 0.22).add(new THREE.Vector3(0, h, 0));
      const stemC = new THREE.QuadraticBezierCurve3(new THREE.Vector3(px + dir.x * 0.02, 0.19, pz + dir.z * 0.02), new THREE.Vector3(px + dir.x * 0.04, 0.2 + h * 0.8, pz + dir.z * 0.04), tip);
      add(shadowy(new THREE.Mesh(new THREE.TubeGeometry(stemC, 8, 0.0045, 4), this.mat('leaf', { tone: -0.08 }))), 0, 0, 0);
      const leaf = new THREE.Mesh(leafGeo, this.mat('leaf', { tone: (sz - 0.85) * 0.4 }));
      leaf.scale.setScalar(sz);
      leaf.position.copy(tip);
      // the leaf sits on the end of its stem, its face toward the room (and a little up), leaning
      // out the way its stem goes
      leaf.rotation.order = 'YXZ';
      leaf.rotation.set(-0.5 - 0.3 * (1 - lean), Math.sin(a) * 0.35, -Math.sin(a) * 0.95);
      shadowy(leaf);
      this.group.add(leaf);
    }

    // in front: a stack of books with a mug on top, and a ball of yarn the cat plays with
    const fx = bx + 0.36, fz = bz + 0.3;
    const stack: [Material, number, number][] = [['bookBlue', 0.2, 0.03], ['bookRed', 0.18, 0.025], ['bookMustard', 0.17, 0.028]];
    let fy = 0;
    stack.forEach(([mname, w, t], i) => {
      const bk = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, t, w * 0.7), this.mat(mname)));
      bk.rotation.y = (i - 1) * 0.18;
      add(bk, fx, fy + t / 2, fz);
      fy += t;
    });
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.07, 16), this.mat('paint'))), fx + 0.01, fy + 0.035, fz);
    add(shadowy(new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 6, 12), this.mat('paint'))), fx + 0.045, fy + 0.04, fz);
    add(new THREE.Mesh(new THREE.CircleGeometry(0.028, 14).rotateX(-Math.PI / 2), this.mat('brown')), fx + 0.01, fy + 0.066, fz);
    this.mugTop = new THREE.Vector3(fx + 0.01, fy + 0.07, fz);
    const yarn = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), this.mat('bookRed', { tone: 0.12 })));
    add(yarn, bx - 0.3, 0.045, bz + 0.26);
    const strand = new THREE.CatmullRomCurve3([new THREE.Vector3(bx - 0.27, 0.01, bz + 0.3), new THREE.Vector3(bx - 0.18, 0.003, bz + 0.36), new THREE.Vector3(bx - 0.08, 0.003, bz + 0.33), new THREE.Vector3(bx - 0.02, 0.003, bz + 0.4)]);
    add(new THREE.Mesh(new THREE.TubeGeometry(strand, 20, 0.003, 4), this.mat('bookRed', { tone: 0.12 })), 0, 0, 0);

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
  /** where the mug's steam rises from */
  mugTop = new THREE.Vector3();
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

/** a monstera leaf: a broad heart with deep slits from the edge toward the midrib (in the xy
 *  plane, stem at the origin, tip up +y) */
function monsteraLeaf() {
  const L = 0.24, W = 0.12;
  const pts: THREE.Vector2[] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = i / n;                                   // right edge from the stem to the tip
    const y = t * L;
    const w = W * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.15 * t);
    pts.push(new THREE.Vector2(w, y - 0.02 * Math.sin(Math.PI * t)));
  }
  const right = pts;
  const left = pts.slice().reverse().map((p) => new THREE.Vector2(-p.x, p.y));
  const outline = [...right, ...left.slice(1)];
  // the slits: thin wedges cut in from each edge
  const shape = new THREE.Shape();
  shape.moveTo(outline[0].x, outline[0].y);
  const slitAt = new Set([10, 17, 24, 31]);
  for (let i = 1; i < outline.length; i++) {
    const p = outline[i];
    const k = i <= n ? i : 2 * n - i;
    if (slitAt.has(k)) {
      const inward = new THREE.Vector2(-Math.sign(p.x) * Math.abs(p.x) * 0.62, -0.012);
      shape.lineTo(p.x, p.y);
      shape.lineTo(p.x + inward.x, p.y + inward.y);
      shape.lineTo(p.x + inward.x * 0.95, p.y + inward.y - 0.008);
      continue;
    }
    shape.lineTo(p.x, p.y);
  }
  return new THREE.ShapeGeometry(shape, 4);
}
