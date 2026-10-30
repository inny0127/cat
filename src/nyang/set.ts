import * as THREE from 'three';
import { roomMaterial, type MatOpts } from '../pixel/room';
import { dayLight, moonLit, skyDay, type DayLight } from '../cat3d/roomlight';
import type { Material } from '../cat3d/pixclass';

/** a flat top the cat can be on: the floor's own furniture's tops, and how high */
export interface Top {
  id: string;
  x0: number; x1: number; z0: number; z1: number;
  h: number;
}

/** where the back wall is, and the window in it */
export const WALL_Z = -0.6;
const WIN = { l: 0.15, r: 0.85, b: 0.62, t: 1.42 };

/**
 * The living room the cat has to itself until its people come home: a sofa and a coffee table on a
 * round rug, a dresser with a lamp and a shelf over it, the window and its sill, the dining table
 * and a stool; the floor between them. Built of the window room's own materials and lit by its own
 * light (the day's sun through the window, the sky, the lamp), for the same pixel pass.
 */
export class LivingRoom {
  readonly group = new THREE.Group();
  /** the tops the cat can be on (the floor is height 0 everywhere else) */
  readonly tops: Top[] = [
    { id: 'dresser', x0: -1.6, x1: -0.98, z0: -0.6, z1: -0.25, h: 0.55 },
    { id: 'shelf', x0: -1.55, x1: -1.02, z0: -0.6, z1: -0.43, h: 1.0 },
    { id: 'sofa', x0: -0.8, x1: -0.06, z0: -0.44, z1: -0.12, h: 0.34 },
    { id: 'sofaBack', x0: -0.86, x1: 0.0, z0: -0.6, z1: -0.47, h: 0.62 },
    { id: 'coffee', x0: -0.64, x1: -0.16, z0: 0.12, z1: 0.4, h: 0.3 },
    { id: 'sill', x0: WIN.l - 0.04, x1: WIN.r + 0.04, z0: -0.6, z1: -0.42, h: WIN.b },
    { id: 'stool', x0: 1.12, x1: 1.38, z0: 0.12, z1: 0.38, h: 0.42 },
    { id: 'table', x0: 0.98, x1: 1.62, z0: -0.56, z1: 0.0, h: 0.66 },
  ];
  /** the floor the cat may run about on: within these */
  readonly bounds = { x0: -1.62, x1: 1.66, z0: WALL_Z + 0.12, z1: 0.75 };
  /** what is in the way on the floor (centre, radius): the furniture's footprints, in circles */
  readonly solids: [THREE.Vector3, number][] = [];
  /** the lamp on the dresser (its light) */
  readonly lampAt = new THREE.Vector3(-1.38, 0.86, -0.46);
  /** what glows when the lamp is lit */
  private readonly glows: THREE.ShaderMaterial[] = [];
  private readonly sky: THREE.ShaderMaterial;
  private readonly light = dayLight(12);
  private time = 0;

  constructor(private readonly lights: Record<string, { value: unknown }>) {
    const G = this.group;
    const M = (m: Material, tone = 0, o: MatOpts = {}) => roomMaterial(lights, m, { ...o, tone });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, shadow = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = shadow;
      G.add(m);
      return m;
    };
    const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, mat: THREE.Material, seg = 16) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      G.add(m);
      return m;
    };

    // the floor, and a round rug under the coffee table
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.4), M('floor', 0, { pattern: 1, wallZ: WALL_Z }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, WALL_Z + 1.2);
    floor.receiveShadow = true;
    G.add(floor);
    const rugAt = new THREE.Vector3(-0.42, 0.27, 0.56);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(rugAt.z + 0.022, 64), M('rug', 0, { pattern: 2, rug: rugAt, wallZ: WALL_Z }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(rugAt.x, 0.002, rugAt.y);
    rug.receiveShadow = true;
    G.add(rug);

    // the back wall, the window cut out of it
    const shape = new THREE.Shape([new THREE.Vector2(-2.2, 0), new THREE.Vector2(2.2, 0), new THREE.Vector2(2.2, 2.4), new THREE.Vector2(-2.2, 2.4)]);
    shape.holes.push(new THREE.Path([new THREE.Vector2(WIN.l, WIN.b), new THREE.Vector2(WIN.l, WIN.t), new THREE.Vector2(WIN.r, WIN.t), new THREE.Vector2(WIN.r, WIN.b)]));
    const wall = new THREE.Mesh(new THREE.ShapeGeometry(shape), M('wall', 0, { pattern: 3 }));
    wall.position.z = WALL_Z;
    wall.receiveShadow = true;
    wall.castShadow = true;
    G.add(wall);

    // the window: its frame and bars, the sill, the sky beyond; curtains either side
    const paint = M('paint', 0.05);
    const wcx = (WIN.l + WIN.r) / 2, ww = WIN.r - WIN.l, wh = WIN.t - WIN.b;
    box(0.04, wh + 0.04, 0.06, WIN.l - 0.02, WIN.b + wh / 2, WALL_Z + 0.01, paint);
    box(0.04, wh + 0.04, 0.06, WIN.r + 0.02, WIN.b + wh / 2, WALL_Z + 0.01, paint);
    box(ww + 0.08, 0.04, 0.06, wcx, WIN.t + 0.02, WALL_Z + 0.01, paint);
    box(0.018, wh, 0.03, wcx, WIN.b + wh / 2, WALL_Z - 0.03, paint);
    box(ww, 0.018, 0.03, wcx, WIN.b + wh * 0.6, WALL_Z - 0.03, paint);
    box(ww + 0.16, 0.03, 0.2, wcx, WIN.b - 0.015, WALL_Z + 0.08, M('paint', 0.1));
    this.sky = new THREE.ShaderMaterial({
      uniforms: { uDay: { value: 1 }, uGold: { value: 0 }, uTime: { value: 0 }, uRain: { value: 0 } },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(ww + 0.02, wh + 0.02), this.sky);
    sky.position.set(wcx, WIN.b + wh / 2, WALL_Z - 0.08);
    G.add(sky);
    const curtain = M('curtain', 0);
    for (const s of [-1, 1]) {
      const x = s < 0 ? WIN.l - 0.12 : WIN.r + 0.12;
      for (let i = 0; i < 4; i++) box(0.05, 0.98, 0.035 + 0.012 * (i % 2), x - 0.075 + i * 0.05, WIN.b + 0.4, WALL_Z + 0.05 + 0.012 * (i % 2), curtain);
    }
    box(ww + 0.5, 0.015, 0.015, wcx, WIN.t + 0.12, WALL_Z + 0.06, M('metal', 0.1));

    // the dresser: three drawers, its knobs, short legs; a lamp on it; a shelf over it
    {
      const T = this.tops[0], w = T.x1 - T.x0, d = T.z1 - T.z0, cx = (T.x0 + T.x1) / 2, cz = (T.z0 + T.z1) / 2;
      const wood = M('brown', 0.12);
      box(w, T.h - 0.06, d, cx, 0.06 + (T.h - 0.06) / 2, cz, wood);
      box(w + 0.02, 0.025, d + 0.02, cx, T.h - 0.0125, cz, M('brown', 0.2));
      for (let i = 0; i < 3; i++) {
        const y = 0.12 + i * 0.13;
        box(w - 0.06, 0.008, 0.004, cx, y + 0.06, T.z1 + 0.001, M('brown', -0.25), false);
        cyl(0.012, 0.012, 0.012, cx, y, T.z1 + 0.008, M('metal', 0.2), 8).rotation.x = Math.PI / 2;
      }
      for (const lx of [T.x0 + 0.04, T.x1 - 0.04]) for (const lz of [T.z0 + 0.04, T.z1 - 0.04]) cyl(0.012, 0.01, 0.06, lx, 0.03, lz, wood, 6);
      // (the lamp: a round foot, a stem, a pleated shade that glows when lit)
      const L = this.lampAt;
      cyl(0.05, 0.06, 0.03, L.x, T.h + 0.015, L.z, M('pot', 0.05, { pattern: 9 }));
      cyl(0.008, 0.008, 0.2, L.x, T.h + 0.13, L.z, M('metal', 0.1), 6);
      const shade = M('shade', 0.05, { pattern: 7 });
      this.glows.push(shade);
      cyl(0.07, 0.11, 0.14, L.x, T.h + 0.29, L.z, shade, 24);
      const S = this.tops[1], sw = S.x1 - S.x0, scx = (S.x0 + S.x1) / 2;
      box(sw, 0.025, S.z1 - S.z0, scx, S.h - 0.0125, (S.z0 + S.z1) / 2, M('brown', 0.18));
      for (const bx of [S.x0 + 0.06, S.x1 - 0.06]) box(0.015, 0.08, 0.1, bx, S.h - 0.06, WALL_Z + 0.06, M('metal', 0));
      this.foot(T);
    }

    // the sofa: its seat, back and arms in a soft cloth, round wooden feet
    {
      const cloth = M('bed', 0.05, { pattern: 4 });
      const x0 = -0.86, x1 = 0.0, cx = (x0 + x1) / 2, z0 = WALL_Z, z1 = -0.1;
      box(x1 - x0, 0.2, z1 - z0, cx, 0.06 + 0.1, (z0 + z1) / 2, cloth);
      for (let i = 0; i < 2; i++) {
        const sx = -0.8 + 0.37 * i + 0.185;
        box(0.36, 0.08, 0.32, sx, 0.3, -0.28, M('bed', 0.1, { pattern: 4 }));
        box(0.36, 0.3, 0.12, sx, 0.47, -0.53, M('bed', 0.08, { pattern: 4 }));
      }
      for (const ax of [x0 + 0.03, x1 - 0.03]) box(0.06, 0.3, z1 - z0, ax, 0.31, (z0 + z1) / 2, M('bed', 0.0, { pattern: 4 }));
      for (const lx of [x0 + 0.05, x1 - 0.05]) for (const lz of [z0 + 0.05, z1 - 0.05]) cyl(0.015, 0.012, 0.06, lx, 0.03, lz, M('brown', 0), 6);
      this.foot({ id: '', x0, x1, z0, z1, h: 0 });
    }
    // two pictures on the wall over the sofa
    for (const [x, y, w, h, m] of [[-0.62, 1.0, 0.24, 0.3, 'bookBlue'], [-0.28, 0.94, 0.18, 0.18, 'bookMustard']] as const) {
      box(w, h, 0.02, x, y, WALL_Z + 0.012, M('brown', -0.05), false);
      box(w - 0.04, h - 0.04, 0.005, x, y, WALL_Z + 0.024, M('paint', 0.2), false);
      box(w * 0.5, h * 0.35, 0.004, x, y - h * 0.08, WALL_Z + 0.028, M(m, 0.05), false);
    }

    // the coffee table
    {
      const T = this.tops[4], cx = (T.x0 + T.x1) / 2, cz = (T.z0 + T.z1) / 2;
      box(T.x1 - T.x0, 0.03, T.z1 - T.z0, cx, T.h - 0.015, cz, M('brown', 0.25));
      for (const lx of [T.x0 + 0.03, T.x1 - 0.03]) for (const lz of [T.z0 + 0.03, T.z1 - 0.03]) box(0.025, T.h - 0.03, 0.025, lx, (T.h - 0.03) / 2, lz, M('brown', 0.1));
      this.foot(T);
    }

    // a big plant in a pot by the window
    {
      const px = 0.0 + 0.04, pz = -0.02;
      cyl(0.09, 0.07, 0.16, px + 0.0, 0.08, pz + 0.0, M('pot', 0, { pattern: 9 }), 20);
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4, r = 0.03 + 0.06 * ((i * 7) % 5) / 5;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 5), M('leaf', 0.05 * (i % 3)));
        leaf.scale.set(1.2, 0.5, 0.8);
        leaf.position.set(px + Math.cos(a) * r, 0.2 + 0.03 * (i % 4) + 0.012 * i, pz + Math.sin(a) * r);
        leaf.rotation.set(0.4 * Math.sin(a), a, 0.5 * Math.cos(a));
        leaf.castShadow = true;
        G.add(leaf);
      }
      this.solids.push([new THREE.Vector3(px, 0, pz), 0.11]);
    }

    // the dining table, and a stool before it
    {
      const T = this.tops[7], cx = (T.x0 + T.x1) / 2, cz = (T.z0 + T.z1) / 2;
      box(T.x1 - T.x0, 0.035, T.z1 - T.z0, cx, T.h - 0.0175, cz, M('brown', 0.22));
      for (const lx of [T.x0 + 0.04, T.x1 - 0.04]) for (const lz of [T.z0 + 0.04, T.z1 - 0.04]) box(0.03, T.h - 0.035, 0.03, lx, (T.h - 0.035) / 2, lz, M('brown', 0.08));
      this.foot(T);
      const S = this.tops[6], sx = (S.x0 + S.x1) / 2, sz = (S.z0 + S.z1) / 2;
      cyl(0.13, 0.13, 0.03, sx, S.h - 0.015, sz, M('bookRed', 0.05, { pattern: 9 }), 20);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        const leg = cyl(0.01, 0.012, S.h - 0.03, sx + Math.cos(a) * 0.09, (S.h - 0.03) / 2, sz + Math.sin(a) * 0.09, M('brown', 0.05), 6);
        leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
      }
      this.solids.push([new THREE.Vector3(sx, 0, sz), 0.14]);
    }
    // a clock on the wall over the table
    cyl(0.09, 0.09, 0.02, 1.3, 1.15, WALL_Z + 0.02, M('paint', 0.15, { pattern: 9 }), 24).rotation.x = Math.PI / 2;

    // what the room's light needs to know: the window
    const Lt = lights;
    (Lt.uWin.value as THREE.Vector4).set(WIN.l, WIN.r, WIN.b, WIN.t);
    (Lt.uWinBar.value as THREE.Vector3).set(wcx, WIN.b + wh * 0.6, 0.01);
    Lt.uWinZ.value = WALL_Z - 0.03;
    (Lt.uFairy.value as THREE.Vector4).set(0, 0, -10, 0);
    for (const v of Lt.uOcc.value as THREE.Vector4[]) v.set(0, 0, 0, 0);
  }

  /** a piece of furniture's footprint on the floor, in circles, for the cat to go round */
  private foot(T: Top, r = 0) {
    const w = T.x1 - T.x0, d = T.z1 - T.z0, rr = r || Math.min(w, d) / 2 + 0.04;
    const n = Math.max(1, Math.ceil(w / (rr * 1.2)));
    for (let i = 0; i < n; i++) this.solids.push([new THREE.Vector3(T.x0 + (w * (i + 0.5)) / n, 0, (T.z0 + T.z1) / 2), rr]);
  }

  /** the top a point is over (null: the floor), the highest of them under it */
  topAt(x: number, z: number, below = Infinity): Top | null {
    let best: Top | null = null;
    for (const T of this.tops) if (x >= T.x0 && x <= T.x1 && z >= T.z0 && z <= T.z1 && T.h < below && (!best || T.h > best.h)) best = T;
    return best;
  }

  /** the light of an hour, and the weather: the sun through the window, the sky, the lamp (on at
   *  dusk and after) */
  update(dt: number, hour: number, rain = 0, date = new Date()): DayLight {
    this.time += dt;
    const d = dayLight(hour, this.light, rain, moonLit(date), 0);
    const L = this.lights;
    (L.uKeyDir.value as THREE.Vector3).copy(d.keyDir);
    (L.uLampPos.value as THREE.Vector3).copy(this.lampAt);
    L.uLampInt.value = d.lamp;
    if (L.uDay) L.uDay.value = skyDay(hour);
    L.uSun.value = d.sun;
    L.uSkyI.value = d.sky;
    L.uAmb.value = d.amb;
    L.uFloorB.value = d.floorB;
    (L.uFill.value as THREE.Vector4).w = d.fill;
    L.uFairyInt.value = 0;
    const day = skyDay(hour);
    if (L.uSubject) (L.uSubject.value as THREE.Vector4).w = 0.42 * day + (1 - day) * (0.2 + 0.1 * Math.min(1, d.lamp / 2));
    // where the sun through the window lies on the floor
    const K = d.keyDir, P = L.uPatch.value as THREE.Vector4;
    if (d.sun > 0 && K.y > 0.03 && K.z < -0.03) {
      const cy = (WIN.b + WIN.t) / 2;
      P.set((WIN.l + WIN.r) / 2 - (K.x * cy) / K.y, WALL_Z - (K.z * cy) / K.y, Math.min(1.5, ((WIN.r - WIN.l) * (WIN.t - WIN.b) * -K.z) / K.y), d.sun * 0.45 * K.y);
    } else P.set(0, 0, 0, 0);
    for (const g of this.glows) g.uniforms.uGlow.value = d.lamp > 0.5 ? 2 : 0;
    const u = this.sky.uniforms;
    u.uDay.value = day;
    u.uGold.value = Math.max(0, 1 - Math.abs(hour - 18.2) / 1.6) + Math.max(0, 1 - Math.abs(hour - 6.6) / 1.2);
    u.uTime.value = this.time;
    u.uRain.value = rain;
    return d;
  }
}

const SKY_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** the view out of the window: the sky by the hour (a golden glow low down at sunset), a few
 *  blocky clouds going over, the roofs and lit windows of the houses across the way; written as
 *  finished colours (alpha 0.15) */
const SKY_FRAG = /* glsl */ `
uniform float uDay;
uniform float uGold;
uniform float uTime;
uniform float uRain;
varying vec2 vUv;
float h1(float n) { return fract(sin(n * 91.7) * 43758.5); }
void main() {
  vec2 q = floor(vUv * vec2(70.0, 80.0)) / vec2(70.0, 80.0);
  vec3 top = mix(vec3(0.10, 0.11, 0.24), vec3(0.42, 0.66, 0.90), uDay);
  vec3 low = mix(vec3(0.20, 0.17, 0.33), vec3(0.74, 0.86, 0.95), uDay);
  low = mix(low, vec3(0.98, 0.66, 0.42), uGold * 0.85);
  top = mix(top, vec3(0.55, 0.42, 0.62), uGold * 0.5);
  vec3 c = mix(low, top, smoothstep(0.1, 0.95, q.y));
  // (clouds: soft blocks drifting across)
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float cx = fract(h1(fi + 1.0) + uTime * (0.004 + 0.002 * fi)) * 1.6 - 0.3;
    float cy = 0.55 + 0.35 * h1(fi + 7.0);
    vec2 d = (q - vec2(cx, cy)) / vec2(0.16 + 0.06 * h1(fi + 3.0), 0.05);
    float k = step(length(d * vec2(1.0, 1.4)), 1.0) + step(length((d - vec2(0.35, 0.6)) * vec2(1.2, 1.3)), 0.8);
    if (k > 0.0) c = mix(c, mix(vec3(0.42, 0.42, 0.58), vec3(0.98, 0.97, 0.95), uDay) * mix(vec3(1.0), vec3(1.0, 0.85, 0.75), uGold), 0.85);
  }
  c = mix(c, vec3(0.55, 0.57, 0.64) * mix(0.4, 1.0, uDay), uRain * 0.6);
  // (the houses across the way: roofs at their heights, windows lit after dark)
  float col = floor(q.x * 9.0);
  float hgt = 0.18 + 0.2 * h1(col + 11.0);
  if (q.y < hgt) {
    vec3 b = mix(vec3(0.16, 0.14, 0.24), vec3(0.62, 0.55, 0.62), uDay);
    b *= 0.9 + 0.12 * h1(col);
    vec2 w = fract(vec2(q.x * 9.0 * 3.0, q.y * 28.0));
    float lit = step(0.55, h1(floor(q.x * 27.0) * 3.1 + floor(q.y * 28.0)));
    if (w.x > 0.3 && w.x < 0.7 && w.y > 0.35 && w.y < 0.75) b = mix(b * 0.8, vec3(1.0, 0.82, 0.5), lit * (1.0 - uDay) * 0.9);
    c = b;
  }
  gl_FragColor = vec4(c, 0.15);
}`;
