import * as THREE from 'three';
import { AO_GLSL, LIGHT_GLSL } from '../cat3d/fur';
import { ROOM_LIGHT_GLSL, NOCC, cloudAt, dayLight, fogAt, moonLit, moonPhase, rainAt, skyDay, stormAt, type DayLight } from '../cat3d/roomlight';
import { PIX, PIX_GLSL, type Material } from '../cat3d/pixclass';
import type { CatState } from '../sim/state';
import { seasonAt } from './season';

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
varying vec3 vLocal;
void main() {
  vLocal = position;
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
uniform float uTone;
uniform vec3 uKeyDir;
uniform float uSpec;
uniform vec3 uLampPos;
uniform float uLampInt;
uniform vec3 uRug;       // centre x, z and radius
uniform float uWallZ;
varying vec3 vN;
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vLocal;
${LIGHT_GLSL}
${AO_GLSL}
${ROOM_LIGHT_GLSL}
${PIX_GLSL}
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  int m = int(uMat + 0.5);
  float tone = uTone;
  if (uPattern == 1) {
    // floorboards running away from you, their ends staggered: a dark seam between them with a
    // catch of light on the edge beside it, long streaks of grain, a knot here and there, and now
    // and then a darker board
    float bx = vWorld.x / 0.1;
    float bi = floor(bx), fx = fract(bx);
    float off = hash(bi) * 0.75;
    float bz = (vWorld.z + off) / 0.75;
    float ji = floor(bz), fz = fract(bz);
    float h = hash(bi * 7.13 + ji * 3.7);
    m = h < 0.3 ? ${PIX.floorDark} : ${PIX.floor};
    tone += (h - 0.5) * 0.06 + (vnoise(vec2(bi * 3.0, vWorld.z * 4.0)) - 0.5) * 0.04;
    // grain: two or three long, slightly wavering lines down each board
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float gx = 0.2 + 0.65 * hash(bi * 13.1 + ji * 5.7 + fk * 3.3) + 0.03 * sin(vWorld.z * 9.0 + fk * 2.0 + h * 6.0);
      if (abs(fx - gx) < 0.022 && hash(bi + fk * 7.0 + ji) > 0.25) tone -= 0.07;
    }
    vec2 kc = vec2(bi + 0.3 + 0.4 * hash(h * 91.0), ji + 0.2 + 0.6 * hash(h * 53.0));
    vec2 kd = (vec2(bx, bz) - kc) * vec2(0.1 / 0.009, 0.75 / 0.016);
    if (hash(h * 17.0) > 0.55 && dot(kd, kd) < 1.0) tone -= 0.12;
    if (fx < 0.055 || fz < 0.012) { m = ${PIX.floorDark}; tone -= 0.16; }
    else if (fx < 0.11) tone += 0.07;
  } else if (uPattern == 2) {
    // a round rug: a fringe of tassels, a cream border, a band of terracotta diamonds on the
    // indigo, a cream ring, indigo within
    vec2 d = vWorld.xz - uRug.xy;
    float r = length(d) / uRug.z;
    float th = atan(d.y, d.x);
    if (r > 1.0) {
      if (fract(th * uRug.z / 0.011) > 0.5) discard;
      m = ${PIX.rugCream};
      tone -= 0.05;
    } else {
      bool cream = r > 0.92 || (r > 0.78 && r < 0.81);
      float t = (r - 0.6) / 0.15;
      float cell = fract(th / 6.2832 * 28.0);
      bool diamond = t > 0.0 && t < 1.0 && abs(cell - 0.5) * 2.0 + abs(t - 0.5) * 2.0 < 0.55;
      m = cream ? ${PIX.rugCream} : diamond ? ${PIX.pot} : ${PIX.rug};
      if (diamond) tone += 0.04;
    }
  } else if (uPattern == 3) {
    if (vWorld.y < 0.3) {
      // panelling: narrow boards, a groove between them with a lit edge beside it
      m = ${PIX.panel};
      // (the groove two art pixels wide at the least, however far off: thinner, the pixel pass's
      // evening of the light breaks it into dashes)
      float fx = fract(vWorld.x / 0.12), pw = max(0.045, 2.0 * fwidth(vWorld.x / 0.12));
      if (fx < pw) tone -= 0.14;
      else if (fx < pw + max(0.045, fwidth(vWorld.x / 0.12))) tone += 0.05;
    } else if (vWorld.y < 0.335) m = ${PIX.paint};
    else {
      // old plaster, a little uneven
      m = ${PIX.wall};
      tone += (vnoise(vWorld.xy * 45.0 + 7.0) - 0.5) * 0.02;
    }
    // the floor's shadow along the foot of the wall
    tone -= 0.12 * (1.0 - smoothstep(0.0, 0.06, vWorld.y));
  } else if (uPattern == 8) {
    // a monstera leaf: folded a little along its midrib, as a leaf is, so each half takes the light
    // its own way, one lit and one in shade (a pixel artist's leaf in two tones, not one flat
    // green): the leaf's own across-direction from how its coordinates run over the screen
    vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
    float dvx = dFdx(vLocal.y), dvy = dFdy(vLocal.y);
    float det = dFdx(vLocal.x) * dvy - dFdy(vLocal.x) * dvx;
    vec3 T = (dpx * dvy - dpy * dvx) * sign(det);
    T -= N * dot(T, N);
    if (dot(T, T) > 1e-14) N = normalize(N - sign(vLocal.x) * normalize(T) * 0.55);
    // its midrib and the veins running out between the slits, paler
    float ax = abs(vLocal.x);
    if (ax < 0.003 && vLocal.y < 0.215) tone += 0.13;
    else for (int k = 0; k < 5; k++) {
      if (abs(vLocal.y - (0.04 + 0.0415 * float(k)) - 0.35 * ax) < 0.0022 && ax > 0.006) tone += 0.06;
    }
  } else if (uPattern == 9) {
    // a thing in the round, painted as a pixel artist paints a column or a dome: a lit band toward
    // the upper left, then the middle tone, the far edge in shade (the light alone is too even
    // across something this small to give it form)
    tone += 0.16 * (dot(N, normalize(vec3(-0.42, 0.55, 0.72))) - 0.55);
  } else if (uPattern == 4) {
    // fleece: soft and a little uneven
    tone += (vnoise(vWorld.xz * 70.0) - 0.5) * 0.08;
  } else if (uPattern == 7) {
    // a pleated shade: narrow folds all the way round, each lit on one side
    float a = atan(vLocal.z, vLocal.x) / 6.2832 * 36.0;
    float f = fract(a);
    tone += f < 0.5 ? 0.05 : -0.06;
  } else if (uPattern == 6) {
    // plush: the deep pile of a cat's bed, in soft tufts
    tone += (vnoise(vWorld.xz * 95.0 + vWorld.y * 40.0) - 0.5) * 0.16 + (vnoise(vWorld.xz * 31.0 - 3.0) - 0.5) * 0.08;
  } else if (uPattern == 5) {
    // a ball of wool: strands wound round it in bands, one way over another (they turn with it
    // as it rolls)
    vec3 q = normalize(vLocal);
    float b1 = fract(asin(clamp(dot(q, vec3(0.0, 0.8, 0.6)), -1.0, 1.0)) / 0.3);
    float b2 = fract(asin(clamp(dot(q, vec3(0.8, -0.2, 0.56)), -1.0, 1.0)) / 0.3);
    bool top = dot(q, vec3(0.5, 0.5, -0.7)) > 0.0;
    float b = top ? b2 : b1;
    if (b < 0.28) tone -= 0.09;
    else if (b > 0.85) tone += 0.04;
  }
  // the floor darkens toward the wall's foot
  if (uPattern == 1 || uPattern == 2) tone -= 0.1 * (1.0 - smoothstep(0.0, 0.12, vWorld.z - uWallZ));
  float sh = keyShadow(vWorld, N);
  float ao = capsuleAO(vWorld, N) * roomAO(vWorld, N);
  vec3 lt = roomLight(vWorld, N, sh, ao);
  if (uPattern == 8) {
    // a leaf lets the light through: with the sun or the bright window behind it, it glows
    float back = uSun * max(-dot(N, uKeyDir), 0.0) * sunThrough(vWorld) * keyShadow(vWorld, -N) * 0.7 + uSkyI * skyThrough(vWorld, -N) * 0.45;
    float tot = lt.x + back;
    lt = vec3(tot, lt.y * lt.x / max(tot, 1e-4), (lt.z * lt.x + back) / max(tot, 1e-4));
  }
  lt.x = max(lt.x * (1.0 + 1.3 * tone) + 0.25 * tone, 0.0);
  // what glows: all of it at once (a candle's jar, the radio's dial), or a lit lamp's shade, which
  // is brightest at its open foot and dimmer up toward its top
  float glowAmt = 0.0;
  if (uGlow > 1.5) {
    float foot = 1.0 - smoothstep(uLampPos.y - 0.04, uLampPos.y + 0.12, vWorld.y);
    lt.x = 0.62 + 0.4 * foot + 0.6 * (tone - uTone);
    glowAmt = 0.35 + 0.64 * foot;
  } else if (uGlow > 0.5) glowAmt = 0.99;
  gl_FragColor = pixRoomLit(m, lt, glowAmt);
}`;

/** the sky through the window: written as finished colours (alpha 0.15), in art pixels */
const SKY_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHour;
uniform vec2 uSkyPx;     // the window's size in art pixels
uniform float uPxSize;   // an art pixel at the window, in metres
uniform float uPar;      // where you look from, across the room from the window's middle (metres)
uniform float uRain;     // 0 dry .. 1 raining (or snowing, in winter)
uniform float uSnowing;  // 1: what falls is snow
uniform float uSnowLie;  // snow lying on the roofs and the tree (0 .. 1)
uniform float uRainbow;  // a rainbow, after rain by day (0 .. 1)
uniform float uCloud;    // how much cloud there is (0 a clear sky .. 1 overcast)
uniform float uMoon;     // the moon's phase (0 new, 0.5 full)
uniform float uFog;      // a morning mist (0 .. 1)
uniform float uFlash;    // lightning now (0 .. 1)
uniform vec3 uBolt;      // the bolt: where across (of the window), its seed, whether it is seen
uniform vec2 uFall;      // leaves (or blossom) coming down off the tree: how many (0 .. 1), petals (1)
uniform vec4 uVisitor;   // a sparrow on the ledge outside: where along it, how high above it (flying;
                         // window pixels), its pose (0 stands, 1 pecks, 2 hops, 3 4 wings up, down),
                         // which way it faces (1 right, -1 left; 0: no bird)
uniform vec4 uMeteor;    // a shooting star: where it starts (of the window), how long since (s;
                         // below 0, none), and which way it falls (-1 left, 1 right)
uniform vec3 uDrop;      // one drop running down the glass (window pixels), if z: the one a cat is after
uniform vec3 uLeafA;     // the tree's leaves by the season: lit,
uniform vec3 uLeafB;     // ... in shade,
uniform vec3 uLeafC;     // ... and the season's other colour among them (autumn's red, spring's pink)
uniform vec2 uLeafs;     // how full the tree is (0 bare .. 1), how much of the other colour
varying vec2 vUv;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h1(float n) { return fract(sin(n * 127.1 + 31.7) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
vec3 hex(float r, float g, float b) { return vec3(r, g, b) / 255.0; }
// which of four bands of a gradient a pixel is in, dithered where they meet
int band4(float t, vec2 px) {
  const float BAY[16] = float[](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  ivec2 q = ivec2(mod(px, 4.0));
  float s = clamp(t, 0.0, 1.0) * 3.0 + (BAY[q.x * 4 + q.y] / 16.0 - 0.5) * 0.7;
  return int(clamp(floor(s + 0.5), 0.0, 3.0));
}
vec3 pick(int i, vec3 a, vec3 b, vec3 c, vec3 d) { return i == 0 ? a : i == 1 ? b : i == 2 ? c : d; }
// a gradient laid in n flat bands; where one gives way to the next, three rows of dither between
// them, a quarter, a half and three quarters of the next (per: how far one pixel goes up it)
float bands(float t, float n, float per, vec2 px) {
  float s = clamp(t, 0.0, 1.0) * (n - 1.0);
  float b = floor(s);
  float k = (1.0 - (s - b)) / (per * (n - 1.0));
  if (k < 3.0) {
    float m = mod(px.x + 2.0 * mod(px.y, 2.0), 4.0);
    if (k < 1.0 ? m != 0.0 : k < 2.0 ? mod(m, 2.0) == 0.0 : m == 0.0) b += 1.0;
  }
  return min(b, n - 1.0) / (n - 1.0);
}
// four colours spread evenly from 0 to 1
vec3 grad4(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  float s = clamp(t, 0.0, 1.0) * 3.0;
  return s < 1.0 ? mix(a, b, s) : s < 2.0 ? mix(b, c, s - 1.0) : mix(c, d, s - 2.0);
}
// the hours' weights: day, gold, dusk, night
vec4 W;
vec3 tod(vec3 day, vec3 gold, vec3 dusk, vec3 night) { return W.x * day + W.y * gold + W.z * dusk + W.w * night; }
// a sparrow, a few pixels of it, facing +x with its feet at y 0: which part a cell is (0 none, 1 its
// brown back and wings, 2 its grey-brown cap and cheek, 3 its pale breast, 4 dark (the eye, the
// tail, a wing bar), 5 its beak, 6 its legs)
int sparrow(ivec2 q, int pose) {
  int x = q.x, y = q.y;
  if (pose == 1) {
    // head down, pecking at the ledge
    if (y == 3) return x == -1 || x == 0 ? 1 : 0;
    if (y == 2) return x == -2 ? 4 : x == -1 || x == 0 ? 1 : x == 1 ? 2 : 0;
    if (y == 1) return x == -3 ? 4 : x == -1 ? 4 : x == 0 ? 3 : x == 1 ? 4 : x == 2 ? 2 : 0;
    if (y == 0) return x == 0 ? 6 : x == 2 ? 5 : 0;
    return 0;
  }
  if (pose == 3 || pose == 4) {
    // flying: the wings up, or down
    if (y == 4) return pose == 3 && x == -1 ? 1 : 0;
    if (y == 3) return pose == 3 && (x == -1 || x == 0) ? 1 : 0;
    if (y == 2) return x == -2 ? 4 : x == -1 || x == 0 ? 1 : x == 1 ? 2 : x == 2 ? 5 : 0;
    if (y == 1) return x == -1 ? (pose == 4 ? 1 : 3) : x == 0 ? 3 : x == 1 ? 4 : 0;
    if (y == 0) return pose == 4 && x == -1 ? 1 : 0;
    return 0;
  }
  if (y == 4) return x == 0 || x == 1 ? 2 : 0;
  if (y == 3) return x == -1 ? 1 : x == 0 ? 2 : x == 1 ? 4 : x == 2 ? 5 : 0;
  if (y == 2) return x == -2 ? 4 : x == -1 || x == 0 ? 1 : x == 1 ? 3 : 0;
  if (y == 1) return x == -3 ? 4 : x == -1 ? 4 : x == 0 || x == 1 ? 3 : 0;
  if (y == 0) return x == 0 ? 6 : 0;
  return 0;
}
// how far a layer at a distance seems to slide as you move across the room (whole pixels)
float slide(float f) { return floor(uPar * f / uPxSize + 0.5); }
// heaps of cloud drifting across: each a row of round puffs on a flat base, every puff lit on its
// own from where the light comes (L), the belly in shade (or, with the sun low under it, lit).
// Gives how lit the cloud is at p, or -9 where there is none
float cloud(vec2 p, vec3 L, float belly, float H, float Wd) {
  // nine clouds, in the order they come out as the sky clouds over: where their bases are (up the
  // window), how wide (of the window), how tall they heap up, where along their way they start
  const float CY[9] = float[](0.8, 0.6, 0.7, 0.5, 0.86, 0.66, 0.54, 0.76, 0.62);
  const float CW[9] = float[](0.44, 0.24, 0.32, 0.15, 0.38, 0.2, 0.13, 0.3, 0.18);
  const float CT[9] = float[](0.95, 0.55, 0.75, 0.35, 0.6, 0.5, 0.3, 0.8, 0.45);
  const float CX[9] = float[](0.18, 0.55, 0.86, 0.4, 0.68, 0.05, 0.27, 0.95, 0.78);
  float bestZ = -1.0, v = -9.0;
  float span = Wd * 1.9;
  for (int k = 0; k < 9; k++) {
    float fk = float(k);
    // the clearer the day, the fewer
    if ((fk + 0.5) / 9.0 > 0.1 + 0.9 * uCloud) break;
    float yb = floor(H * CY[k]);
    float w = Wd * CW[k] * (1.0 + 0.5 * uRain);
    float tall = CT[k];
    // (drifting with the wind, the near big ones quicker across the window than the far ones)
    float xc = mod(CX[k] * span + uTime * (0.03 + 0.25 * CW[k]), span) - 0.45 * Wd;
    if (abs(p.x - xc) > w * 0.85 + 2.0 || p.y < yb || p.y > yb + w * (0.45 + 0.6 * tall)) continue;
    for (int j = 0; j < 8; j++) {
      float fj = float(j);
      float hj = h1(fk * 13.7 + fj * 1.9);
      vec2 cc;
      float r;
      if (j < 6) {
        // along the base, the middle ones the biggest
        float u = (fj + 0.5) / 3.0 - 1.0;
        r = w * (0.12 + 0.2 * (1.0 - u * u)) * (0.75 + 0.5 * hj);
        cc = vec2(xc + u * w * 0.56, yb + r * (0.1 + 0.5 * hj) * (1.0 - 0.5 * abs(u)));
      } else {
        // heaped on top of them, a little off the middle
        r = w * (0.15 + 0.08 * hj) * (0.7 + 0.5 * tall);
        cc = vec2(xc + w * (fj == 6.0 ? -0.12 - 0.1 * hj : 0.1 + 0.12 * hj), yb + w * (0.14 + 0.22 * tall) * (fj == 6.0 ? 1.0 : 0.7 + 0.4 * hj));
      }
      vec2 d = p - cc;
      float q = dot(d, d) / (r * r);
      if (q < 1.0) {
        float z = sqrt(1.0 - q) * r + hj * r * 0.4 - (cc.y - yb) * 0.25;
        if (z > bestZ) {
          bestZ = z;
          v = dot(vec3(d / r, sqrt(1.0 - q)), L) + belly * (1.0 - smoothstep(0.0, 2.0 + 0.07 * w, p.y - yb));
        }
      }
    }
  }
  return v;
}

void main() {
  vec2 px = floor(vUv * uSkyPx);
  float H = uSkyPx.y, Wd = uSkyPx.x;
  float y = vUv.y;
  float h = uHour;
  float dusk = min(1.0, max(0.0, 1.0 - abs(h - 19.2) / 0.9) + max(0.0, 1.0 - abs(h - 6.2) / 0.7));
  // (after the sunset's glow, and before the dawn's, what is left of the sky is night, not day)
  float night = h > 19.2 || h < 6.2 ? 1.0 - dusk : 0.0;
  float gold = clamp(smoothstep(16.0, 17.6, h) * (1.0 - smoothstep(18.7, 19.5, h)) + (1.0 - smoothstep(6.6, 8.2, h)) * smoothstep(5.5, 6.2, h), 0.0, 1.0) * (1.0 - night - dusk);
  float day = max(0.0, 1.0 - night - dusk - gold);
  W = vec4(day, gold, dusk, night);
  // alpha: 0.15 shown as it is; 0.17 a small light that glows a little (a star, a lit window);
  // 0.2 one that glows (the moon, a beacon)
  float a = 0.15;

  // the sky, far off: it slides with you. From the town's rooftops up, in flat bands, lighter
  // toward the sun when it is low
  vec2 sp = px - vec2(slide(1.0), 0.0);
  float side = h < 12.0 ? 1.0 - vUv.x : vUv.x;
  float toSun = (gold + 0.6 * dusk) * smoothstep(0.3, 1.0, side) * smoothstep(0.85, 0.3, y);
  float t = bands((y - 0.25) / 0.72 - 0.25 * toSun, 7.0, 1.0 / (0.72 * H), px);
  vec3 c = tod(grad4(t, hex(226.0, 240.0, 245.0), hex(190.0, 225.0, 242.0), hex(150.0, 203.0, 235.0), hex(108.0, 168.0, 222.0)),
               grad4(t, hex(255.0, 226.0, 168.0), hex(252.0, 204.0, 160.0), hex(214.0, 186.0, 194.0), hex(140.0, 156.0, 208.0)),
               grad4(t, hex(255.0, 190.0, 134.0), hex(238.0, 138.0, 120.0), hex(172.0, 106.0, 150.0), hex(96.0, 84.0, 150.0)),
               grad4(t, hex(112.0, 72.0, 112.0), hex(66.0, 52.0, 102.0), hex(36.0, 36.0, 78.0), hex(20.0, 22.0, 54.0)));
  // under rain: a low grey sky, the same brightness drained of colour
  float lumS = dot(c, vec3(0.3, 0.59, 0.11));
  vec3 grey = vec3(lumS) * vec3(0.93, 0.97, 1.08) * 0.8;
  c = mix(c, grey, uRain * 0.85);
  bool starry = night > 0.5 && uRain < 0.5;
  // how much of the mist lies between the window and what is seen at this pixel (set layer by
  // layer below: the sky, the hill far off, the town, the roofs across the way, the tree)
  float fk = 0.5;
  if (starry) {
    // stars, fewer down toward the town's glow; a few bright ones that glint
    float st = hash2(sp);
    if (st > 1.0 - 0.011 * smoothstep(0.45, 0.7, y) && sin(uTime * (1.0 + st * 3.0) + st * 40.0) > -0.3) {
      c = mix(c, hex(255.0, 246.0, 220.0), 0.55 + 0.45 * fract(st * 91.0)); a = 0.17;
    }
    vec2 gc = floor(sp / 19.0);
    float gh = hash2(gc + 3.3);
    vec2 s0 = gc * 19.0 + floor(vec2(3.0 + 13.0 * h1(gh * 7.0), 3.0 + 13.0 * h1(gh * 3.0)));
    if (gh < 0.4 * smoothstep(0.55, 0.75, s0.y / H)) {
      vec2 q = abs(sp - s0);
      float tw = sin(uTime * (0.5 + gh) + gh * 50.0);
      if (q.x + q.y == 0.0) { c = hex(255.0, 250.0, 232.0); a = 0.2; }
      else if (tw > 0.1 && q.x + q.y == 1.0) { c = mix(c, hex(214.0, 218.0, 255.0), 0.5); a = 0.17; }
    }
    // the moon, as it is tonight (lit on the right as it waxes, on the left as it wanes), its seas
    // showing, the rest of it faintly there; a soft ring of light round it
    vec2 dm = (sp - floor(vec2(0.36 * Wd, 0.8 * H))) / 6.0;
    float dl = length(dm);
    float full = 0.5 - 0.5 * cos(6.2832 * uMoon);
    if (dl >= 1.0 && dl < 2.8) {
      int hb = band4((1.0 - smoothstep(1.0, 2.8, dl)) * (0.3 + 0.7 * full), px);
      if (hb > 0) c = mix(c, hex(150.0, 150.0, 198.0), float(hb) / 3.0 * 0.4);
    }
    if (dl < 1.0) {
      float k = cos(6.2832 * uMoon), e = sqrt(max(0.0, 1.0 - dm.y * dm.y));
      if (uMoon < 0.5 ? dm.x > k * e : dm.x < -k * e) {
        c = hex(250.0, 240.0, 206.0);
        if (length(dm - vec2(-0.3, 0.22)) < 0.3 || length(dm - vec2(0.3, -0.22)) < 0.22 || length(dm - vec2(0.05, 0.52)) < 0.17) c = hex(222.0, 212.0, 180.0);
        a = 0.2;
      } else c = mix(c, hex(72.0, 74.0, 116.0), 0.45);
    }
  } else {
    // the sun itself when it is low: rising over the town on the left in the morning, going down
    // behind the hill on the right in the evening, deeper and redder as it sinks, a haze of light
    // round it (the town and the hill, drawn after, hide it as it goes behind them)
    float up = h < 12.0 ? smoothstep(5.9, 8.4, h) : 1.0 - smoothstep(16.8, 19.3, h);
    float low = (h < 12.0 ? 1.0 - smoothstep(7.6, 8.6, h) : smoothstep(16.6, 17.4, h) * (1.0 - smoothstep(19.25, 19.45, h))) * (1.0 - uRain);
    if (low > 0.01) {
      vec2 sc = vec2((h < 12.0 ? 0.26 : 0.6) * Wd, H * (0.3 + 0.4 * up));
      float sd = length(sp - sc);
      float r = 5.0;
      vec3 disc = mix(hex(255.0, 170.0, 110.0), hex(255.0, 248.0, 224.0), smoothstep(0.0, 0.3, up));
      vec3 halo = mix(hex(255.0, 176.0, 120.0), hex(255.0, 236.0, 196.0), smoothstep(0.1, 0.6, up));
      int hb = band4(1.0 - smoothstep(r, r + 13.0, sd), px);
      if (hb > 0) c = mix(c, halo, (float(hb) / 3.0) * 0.55 * low);
      if (sd < r) { c = mix(c, disc, low); if (low > 0.5) a = 0.2; }
    }
    // after rain, with the sun out again: a rainbow, low and wide over the town
    if (uRainbow > 0.01) {
      float rk = (length(sp - vec2(0.45 * Wd, -0.55 * H)) / H - 1.0) / 0.075;
      if (rk > 0.0 && rk < 1.0) {
        int rb = int(floor((1.0 - rk) * 6.0));
        vec3 rc = rb == 0 ? hex(236.0, 122.0, 122.0) : rb == 1 ? hex(240.0, 172.0, 112.0) : rb == 2 ? hex(240.0, 224.0, 132.0)
          : rb == 3 ? hex(142.0, 208.0, 142.0) : rb == 4 ? hex(128.0, 170.0, 230.0) : hex(170.0, 140.0, 220.0);
        c = mix(c, rc, 0.42 * uRainbow * smoothstep(0.0, 0.12, rk) * smoothstep(1.0, 0.88, rk));
      }
    }
  }
  // clouds drifting by: by day white with blue shade, lit from the sun's side; low sun lights their
  // bellies gold and pink; by night dark, a little moonlight on their tops and the town's glow
  // under them; under rain, grey and many
  {
    float sx = clamp((h - 12.75) / 6.35, -1.0, 1.0);
    float lowSun = max(gold * 0.6, dusk);
    vec3 L = normalize(vec3(sx * mix(0.5, 1.0, lowSun), mix(0.8, 0.1, lowSun), 0.55));
    float belly = mix(-0.55, 0.5, lowSun);
    if (night > 0.5) { L = normalize(vec3(-0.45, 0.7, 0.55)); belly = -0.6; }
    float cv = cloud(sp + 0.5, L, belly, H, Wd);
    if (cv > -8.0) {
      int ti = cv > 0.68 ? 3 : cv > 0.4 ? 2 : cv > 0.08 ? 1 : 0;
      c = tod(pick(ti, hex(172.0, 184.0, 224.0), hex(204.0, 218.0, 240.0), hex(234.0, 241.0, 250.0), hex(255.0, 255.0, 255.0)),
              pick(ti, hex(204.0, 160.0, 174.0), hex(236.0, 190.0, 178.0), hex(255.0, 224.0, 190.0), hex(255.0, 244.0, 222.0)),
              pick(ti, hex(120.0, 86.0, 134.0), hex(188.0, 114.0, 138.0), hex(244.0, 156.0, 128.0), hex(255.0, 204.0, 158.0)),
              pick(ti, hex(86.0, 62.0, 96.0), hex(48.0, 48.0, 88.0), hex(60.0, 62.0, 104.0), hex(88.0, 92.0, 140.0)));
      c = mix(c, tod(pick(ti, hex(118.0, 124.0, 140.0), hex(144.0, 150.0, 166.0), hex(168.0, 174.0, 188.0), hex(192.0, 196.0, 206.0)),
                     pick(ti, hex(128.0, 118.0, 128.0), hex(154.0, 142.0, 150.0), hex(178.0, 166.0, 170.0), hex(200.0, 190.0, 190.0)),
                     pick(ti, hex(88.0, 78.0, 102.0), hex(108.0, 96.0, 120.0), hex(128.0, 114.0, 136.0), hex(148.0, 132.0, 150.0)),
                     pick(ti, hex(40.0, 34.0, 50.0), hex(36.0, 37.0, 56.0), hex(46.0, 47.0, 68.0), hex(58.0, 59.0, 82.0))), uRain);
      a = 0.15;
    }
  }
  // lightning: a bolt far off over the town, a jagged line down out of the cloud with a branch off
  // it (behind the hill and the town, which stand dark against it)
  if (uBolt.z > 0.5) {
    float top = floor(H * 0.84), seg = 5.0;
    float k = (top - sp.y) / seg;
    if (k >= 0.0 && k < 15.0) {
      float x = uBolt.x * Wd, xb = 0.0;
      float kk = floor(k);
      for (int j = 0; j < 15; j++) {
        if (float(j) >= kk) break;
        x += (h1(uBolt.y + float(j) * 1.7) - 0.5) * 6.0;
        if (j == 3) xb = x;
      }
      float xl = x + (h1(uBolt.y + kk * 1.7) - 0.5) * 6.0 * fract(k);
      // (two pixels wide down from the cloud, one below; a glow round it)
      float dx = abs(sp.x + 0.5 - (xl + 0.5));
      float wide = k < 8.0 ? 1.0 : 0.5;
      if (dx < wide) { c = hex(240.0, 244.0, 255.0); a = 0.2; }
      else if (dx < wide + 2.0) c = mix(c, hex(196.0, 206.0, 255.0), 0.5 - 0.2 * (dx - wide));
      // (the branch, off one side from the fourth bend for a few)
      float side = h1(uBolt.y * 3.3) < 0.5 ? -1.0 : 1.0;
      if (k > 4.0 && k < 8.0) {
        float xbr = xb + side * (k - 4.0) * seg * 0.75 + (h1(uBolt.y + floor(k) * 4.1) - 0.5) * 3.0;
        if (abs(sp.x - floor(xbr + 0.5)) < 0.5) { c = hex(224.0, 230.0, 255.0); a = 0.2; }
      }
    }
  }
  if (starry) {
    // now and then a plane's light crossing, blinking
    float tp = mod(uTime, 70.0);
    vec2 pl = vec2(-6.0 + tp * (Wd + 12.0) / 40.0, H * 0.9 - tp * 0.12);
    if (tp < 40.0 && sp == floor(pl) && fract(uTime * 0.8) < 0.3) { c = hex(255.0, 120.0, 100.0); a = 0.2; }
    // once in a while a shooting star: a bright head and a short tail that fades behind it, gone
    // in well under a second
    if (uMeteor.z >= 0.0 && uMeteor.z < 0.6) {
      vec2 dir = normalize(vec2(uMeteor.w, -0.55));
      vec2 head = vec2(uMeteor.x * Wd, uMeteor.y * H) + dir * uMeteor.z * 90.0;
      vec2 d = sp + 0.5 - head;
      float behind = -dot(d, dir), across = abs(d.x * dir.y - d.y * dir.x);
      // (the tail no longer than the way it has come)
      float tail = min(16.0, uMeteor.z * 90.0 + 1.0);
      if (behind > -0.6 && behind < tail && across < 0.6) {
        float u = max(behind, 0.0) / 16.0;
        float k = (1.0 - u) * (1.0 - u) * (1.0 - smoothstep(0.38, 0.6, uMeteor.z));
        if (k > 0.06) { c = mix(c, behind < 1.5 ? hex(255.0, 254.0, 246.0) : hex(236.0, 236.0, 255.0), min(1.0, k * 1.3)); a = k > 0.5 ? 0.2 : 0.17; }
      }
    }
  } else {
    // a few birds crossing now and then, wings up, wings down
    float tb = mod(uTime + 20.0, 47.0);
    if (tb < 16.0 && uRain < 0.3) {
      for (int k = 0; k < 4; k++) {
        float fk = float(k);
        vec2 bc = floor(vec2(-8.0 + tb * (Wd + 16.0) / 16.0 - fk * 5.0 - h1(fk) * 3.0, H * 0.74 + fk * 2.0 + 2.0 * sin(tb * 0.7 + fk * 1.7)));
        vec2 q = px - bc;
        bool upw = fract(uTime * 2.6 + fk * 0.37) > 0.5;
        bool hit = upw ? ((q.y == 0.0 && abs(q.x) == 1.0) || (q.y == -1.0 && q.x == 0.0)) : ((q.y == -1.0 && abs(q.x) == 1.0) || (q.y == 0.0 && q.x == 0.0));
        if (hit) c = tod(hex(70.0, 78.0, 96.0), hex(96.0, 70.0, 70.0), hex(80.0, 56.0, 76.0), c);
      }
    }
  }

  // far away: a hill with a tower on it, and the hazy tops of tall buildings
  float fx = px.x - slide(0.96);
  float fcell = floor(fx / 7.0);
  float farH = H * (0.27 + 0.09 * h1(fcell * 3.1)) + (h1(fcell * 7.7) > 0.8 ? H * 0.09 * h1(fcell) : 0.0);
  float hx = (fx - Wd * 0.7) / (Wd * 0.3);
  float hill = H * (0.31 + 0.09 * max(0.0, 1.0 - hx * hx));
  vec3 farCol = tod(hex(170.0, 196.0, 214.0), hex(210.0, 178.0, 168.0), hex(150.0, 108.0, 138.0), hex(38.0, 38.0, 70.0));
  // (in the rain the far side of town is half lost in it)
  farCol = mix(farCol, grey * 1.05, uRain * 0.6);
  if (px.y < max(farH, hill)) {
    c = farCol;
    fk = 0.93;
    if (night > 0.5 && px.y < farH && hash2(vec2(fx, px.y) * 0.37) > 0.985) { c = hex(255.0, 214.0, 150.0); a = 0.17; }
  }
  // the tower on the hill: a mast, a pod, a light on top
  float tx = fx - floor(Wd * 0.7);
  float tBase = H * 0.395;
  if (abs(tx) < 1.0 && px.y >= tBase && px.y < tBase + H * 0.17) { c = farCol * 0.88; fk = 0.9; }
  if (abs(tx) < 2.5 && px.y >= tBase + H * 0.11 && px.y < tBase + H * 0.13) {
    c = farCol * 0.85;
    if (night > 0.5 && abs(tx) < 2.0 && mod(px.x, 2.0) < 1.0) { c = hex(255.0, 236.0, 200.0); a = 0.17; }
  }
  if (tx == 0.0 && px.y == floor(tBase + H * 0.17) && (night + dusk) > 0.5 && fract(uTime * 0.5) < 0.5) { c = hex(255.0, 90.0, 70.0); a = 0.2; }

  // nearer, the town: blocks side by side with gaps between, rows of windows, water tanks and
  // aerials on their roofs; at dusk the windows begin to light
  float mx = px.x - slide(0.88);
  float cell = 17.0;
  float mc = floor(mx / cell);
  float x0 = mc * cell + floor(1.0 + 3.0 * h1(mc * 5.3));
  float bw = cell - (x0 - mc * cell) - floor(1.0 + 2.0 * h1(mc * 2.9));
  float top = floor(H * (0.15 + 0.15 * h1(mc * 9.1)));
  float lx = mx - x0;
  bool inB = lx >= 0.0 && lx < bw && px.y < top;
  // each block in its own paint: cream, a faded brick, sage, a grey-blue; by day a little hazed
  // with the distance, gold and rose in the low sun, dark by night
  float pk = fract(mc * 0.618 + 0.3);
  vec3 paint = pk < 0.3 ? hex(214.0, 206.0, 196.0) : pk < 0.55 ? hex(198.0, 152.0, 140.0) : pk < 0.78 ? hex(162.0, 180.0, 172.0) : hex(142.0, 162.0, 192.0);
  vec3 facade = tod(mix(paint, hex(176.0, 204.0, 228.0), 0.25), paint * vec3(1.0, 0.78, 0.68), paint * vec3(0.6, 0.46, 0.6), paint * vec3(0.15, 0.15, 0.25));
  facade = mix(facade, grey * 0.85, uRain * 0.35);
  if (inB) {
    c = facade;
    fk = 0.62;
    // the side toward the sun lit, the other in shade (by night, neither)
    bool sunR = h > 12.75;
    float lit = (1.0 - night) * (1.0 - uRain);
    if (lx >= bw - 2.0) c = sunR ? mix(c, hex(255.0, 236.0, 200.0), 0.22 * lit) : c * mix(1.0, 0.84, lit);
    if (lx < 1.0) c = sunR ? c * mix(1.0, 0.88, lit) : mix(c, hex(255.0, 236.0, 200.0), 0.22 * lit);
    // windows: two wide, two tall, in rows; by day dark glass with the sky caught in a corner;
    // the blocks of flats have a balcony rail under each row
    float wx = mod(lx - 2.0, 4.0), wy = mod(px.y - 2.0, 5.0);
    bool flats = h1(mc * 6.6) > 0.45;
    if (flats && wy == 4.0 && lx >= 1.0 && lx < bw - 1.0 && px.y < top - 3.0) c = mix(c, hex(250.0, 246.0, 236.0), 0.22 * lit);
    if (lx >= 2.0 && lx < bw - 2.0 && px.y < top - 3.0 && px.y > 1.0 && wx < 2.0 && wy < 2.0) {
      vec2 wid = vec2(mc * 31.0 + floor((lx - 2.0) / 4.0), floor((px.y - 2.0) / 5.0));
      float on = hash2(wid + floor(uTime / 37.0) * 0.013 * step(0.5, h1(wid.x + wid.y)));
      vec3 glass = mix(facade * 0.62, hex(112.0, 140.0, 182.0), 0.45);
      if (wx == 0.0 && wy == 1.0) glass = mix(glass, hex(226.0, 238.0, 246.0), 0.45);
      c = tod(glass, mix(facade * 0.7, hex(255.0, 206.0, 150.0), 0.35), facade * 0.72, facade * 0.7);
      // (through glass running with rain, each lit window swims in a glow of its own)
      if (on > 1.0 - 0.45 * night - 0.2 * dusk - 0.18 * uRain) { c = on > 0.93 ? hex(255.0, 168.0, 96.0) : hex(255.0, 214.0, 132.0); a = uRain > 0.3 ? 0.2 : 0.17; }
    }
  }
  // rain running down the glass at night: each lit window blurred into a soft glow round it
  if (uRain > 0.3 && night > 0.5 && px.y < top + 4.0) {
    float best = 9.0;
    float wcx = floor((lx - 2.0) / 4.0), wcy = floor((px.y - 2.0) / 5.0);
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
      vec2 wc = vec2(wcx + float(i), wcy + float(j));
      float wlx = 2.0 + wc.x * 4.0, wly = 2.0 + wc.y * 5.0;
      // (a window the block has there, and lit)
      if (wlx < 2.0 || wlx + 1.0 >= bw - 2.0 || wly <= 1.0 || wly + 1.0 >= top - 3.0) continue;
      vec2 wid = vec2(mc * 31.0 + wc.x, wc.y);
      float on = hash2(wid + floor(uTime / 37.0) * 0.013 * step(0.5, h1(wid.x + wid.y)));
      if (on <= 1.0 - 0.45 * night - 0.2 * dusk - 0.18 * uRain) continue;
      best = min(best, length(vec2(lx, px.y) - vec2(wlx + 0.5, wly + 0.5)));
    }
    if (a < 0.16 && best < 3.8) {
      float k = 1.0 - best / 3.8;
      int g = band4(k * k * smoothstep(0.3, 0.8, uRain) * 1.2, px);
      if (g > 0) c = mix(c, hex(255.0, 196.0, 120.0), float(g) * 0.14);
    }
  }
  // on the roofs
  float rk = h1(mc * 13.7);
  if (rk > 0.55 && lx >= 3.0 && lx < 7.0 && px.y >= top && px.y < top + 4.0) c = facade * (px.y == top + 3.0 ? 0.95 : 0.8);   // a water tank
  if (rk < 0.25 && lx == bw - 4.0 && px.y >= top && px.y < top + 7.0) c = facade * 0.75;                                 // an aerial

  // close by, across the street: tiled roofs with chimneys
  float nx = px.x - slide(0.72);
  float ncell = 31.0;
  float nc = floor(nx / ncell);
  float nl = nx - nc * ncell;
  float ridge = floor(H * (0.085 + 0.04 * h1(nc * 3.3)));
  float slope = abs(nl - ncell * 0.5) * 0.45;
  float roofTop = ridge - floor(slope);
  if (px.y < roofTop) {
    fk = 0.4;
    c = tod(hex(160.0, 98.0, 84.0), hex(186.0, 104.0, 76.0), hex(112.0, 64.0, 80.0), hex(30.0, 24.0, 38.0));
    if (mod(px.y + floor(nl * 0.5), 3.0) < 1.0) c *= 0.88;           // rows of tiles
    if (nl > ncell * 0.5) c *= 0.9;                                   // the far side of the ridge
  }
  float chx = nl - floor(ncell * (0.25 + 0.4 * h1(nc * 8.1)));
  if (chx >= 0.0 && chx < 3.0 && px.y >= roofTop && px.y < ridge + 3.0) c = tod(hex(140.0, 90.0, 80.0), hex(160.0, 96.0, 74.0), hex(96.0, 60.0, 76.0), hex(26.0, 22.0, 34.0));

  // snow lying: along the tops of the roofs across the way and of the blocks behind them
  vec3 snowCol = tod(hex(240.0, 244.0, 250.0), hex(255.0, 236.0, 220.0), hex(220.0, 196.0, 214.0), hex(70.0, 76.0, 104.0));
  if (uSnowLie > 0.01) {
    if (px.y < roofTop && px.y >= roofTop - 2.0 && hash2(vec2(floor(nx / 2.0), 3.0)) < 0.4 + uSnowLie) c = snowCol;
    else if (inB && px.y >= top - 1.0 && px.y >= roofTop) c = mix(c, snowCol, 0.85);
  }

  // a tree in the corner, its leaves stirring; it goes through the year: blossom in spring, deep
  // green in summer, gold and red in autumn, bare branches (snow on them) in winter. Its leaves
  // grow in clumps, each lit on its own from the sun's side, ragged at the edge
  vec2 tp = px - vec2(slide(0.6), 0.0);
  // its trunk and boughs, seen where the leaves are thin
  vec2 tb = tp - vec2(-Wd * 0.04, 0.0);
  float wood = 0.0;
  if (tb.x > -2.0 && tb.x < Wd * 0.05 && tb.y < H * 0.2) wood = 1.0;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    vec2 a0 = vec2(Wd * 0.015, H * (0.1 + 0.04 * fk));
    vec2 a1 = a0 + vec2(Wd * (0.08 + 0.05 * fk), H * (0.16 - 0.02 * fk)) * (fk == 1.0 ? vec2(1.2, 0.8) : vec2(1.0));
    vec2 ab = a1 - a0;
    float u = clamp(dot(tb - a0, ab) / dot(ab, ab), 0.0, 1.0);
    if (length(tb - a0 - ab * u) < 1.6 - u) wood = 1.0;
  }
  vec3 woodCol = tod(hex(74.0, 58.0, 60.0), hex(96.0, 66.0, 58.0), hex(66.0, 48.0, 62.0), hex(16.0, 18.0, 26.0));
  if (wood > 0.5) { c = woodCol; fk = 0.24; }
  {
    const float TX[12] = float[](0.04, 0.14, 0.22, 0.09, 0.19, -0.01, 0.27, 0.11, 0.02, 0.21, 0.3, 0.08);
    const float TY[12] = float[](0.3, 0.32, 0.26, 0.23, 0.19, 0.2, 0.17, 0.13, 0.09, 0.1, 0.24, 0.03);
    const float TR[12] = float[](0.085, 0.075, 0.07, 0.09, 0.08, 0.09, 0.06, 0.085, 0.08, 0.07, 0.05, 0.08);
    float sx = clamp((h - 12.75) / 6.35, -1.0, 1.0);
    vec3 Lt = normalize(vec3(sx * 0.6, 0.75, 0.6));
    float bestZ = -1.0, lv = 0.0;
    int own = -1;
    for (int k = 0; k < 12; k++) {
      float fk = float(k);
      float hk = h1(fk * 4.7 + 2.1);
      // (thinning in autumn, bare in winter)
      if (hk > 0.06 + 0.94 * uLeafs.x) continue;
      float r = Wd * TR[k];
      // stirring in the wind, the top of the tree the most
      vec2 cc = vec2(Wd * TX[k] + floor(sin(uTime * 0.9 + fk * 1.3) * TY[k] * 3.5 + 0.5), H * TY[k]);
      vec2 d = tp - cc;
      // a ragged edge: little clusters of leaves standing out from it
      float rr = r * (0.9 + 0.08 * sin(atan(d.y, d.x) * 6.0 + fk * 2.0)) + (hash2(floor(tp * 0.5) + fk * 7.0) - 0.5) * 2.2;
      float q = dot(d, d) / (rr * rr);
      if (q < 1.0) {
        float z = sqrt(1.0 - q) * rr + hk * r * 0.5;
        if (z > bestZ) {
          bestZ = z;
          own = k;
          // lit from the sun's side, the clumps low in the tree in its shade; leaves in little
          // clusters breaking up the light
          lv = dot(vec3(d / rr, sqrt(1.0 - q)), Lt) - 0.22 * (1.0 - TY[k] / 0.32) + (hash2(floor(tp * 0.5) + fk) - 0.5) * 0.3;
        }
      }
    }
    // gaps between the leaves as the tree thins
    if (own >= 0 && hash2(floor(tp * 0.5) + 31.0) > 0.25 + uLeafs.x) own = -1;
    if (own >= 0) {
      vec3 la = uLeafA, lb = uLeafB;
      // the season's other colour, whole clumps of it (red among the gold, pink blossom on the green)
      if (h1(float(own) * 9.1 + 0.3) < uLeafs.y) { la = uLeafC; lb = uLeafC * vec3(0.74, 0.7, 0.8); }
      int ti = lv > 0.7 ? 3 : lv > 0.42 ? 2 : lv > 0.12 ? 1 : 0;
      vec3 col = pick(ti, lb * vec3(0.68, 0.72, 0.86), lb, la, la * 1.1 + vec3(0.04, 0.04, 0.0));
      c = tod(col, col * vec3(1.06, 0.98, 0.82), col * vec3(0.66, 0.55, 0.72), col * vec3(0.16, 0.22, 0.3));
      fk = 0.22;
    }
  }
  // snow lying on the boughs
  if (uSnowLie > 0.01 && wood > 0.5 && hash2(px + 7.0) < uSnowLie * 0.5) c = snowCol;
  // now and then a leaf (in April a petal) let go of by the tree, drifting down on the breeze,
  // turning over as it comes
  if (uFall.x > 0.01) {
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float per = 7.0 + fk * 2.3;
      float ph = uTime / per + h1(fk * 7.1);
      float cyc = floor(ph), u = fract(ph);
      if (h1(cyc * 3.7 + fk) > uFall.x) continue;
      float y0 = H * (0.18 + 0.18 * h1(cyc * 2.9 + fk));
      // (off the side of the crown away from the wall, the breeze carrying it out over the town)
      vec2 lp = floor(vec2(Wd * (0.16 + 0.15 * h1(cyc * 1.3 + fk * 5.0)) + u * (24.0 + 14.0 * h1(cyc + fk * 3.0)) + 3.0 * sin(u * 12.566 + fk), y0 - u * (y0 + 4.0)));
      vec2 q = floor(tp) - lp;
      // (flat on, three pixels of it; edge on, two)
      bool across = fract(u * 7.0 + fk * 0.3) < 0.5;
      if (across ? (q.y == 0.0 && (q.x == 0.0 || q.x == 1.0)) || (q.x == 1.0 && q.y == 1.0) : (q.x == 0.0 && (q.y == 0.0 || q.y == 1.0))) {
        vec3 lc = uFall.y > 0.5 || mod(fk, 2.0) < 0.5 ? uLeafC : uLeafA;
        c = tod(lc, lc * vec3(1.06, 0.96, 0.84), lc * vec3(0.7, 0.6, 0.72), lc * vec3(0.22, 0.26, 0.38));
      }
    }
  }
  // the mist: all of it paler and softer the further off, the far side of town all but gone (the
  // lit windows of the night and the stars still show through, blurred a little)
  if (uFog > 0.01) {
    vec3 fogCol = tod(hex(214.0, 222.0, 228.0), hex(242.0, 222.0, 200.0), hex(200.0, 176.0, 190.0), hex(58.0, 58.0, 84.0));
    c = mix(c, fogCol, uFog * fk * (a > 0.16 ? 0.35 : 1.0));
  }
  // a flash of lightning lights it all up, the sky and its clouds the most
  if (uFlash > 0.01) {
    float fl = fk == 0.5 ? 0.78 : fk > 0.9 ? 0.4 : fk > 0.6 ? 0.25 : 0.12;
    c = mix(c, hex(214.0, 222.0, 255.0), uFlash * fl);
  }

  // the stone ledge outside along the foot of the glass, lit from above (snow on it in winter);
  // and now and then a sparrow on it
  if (px.y < 2.0) {
    c = tod(hex(186.0, 180.0, 176.0), hex(222.0, 182.0, 150.0), hex(128.0, 106.0, 128.0), hex(50.0, 48.0, 72.0));
    if (px.y < 1.0) c *= vec3(0.72, 0.7, 0.78);
    else if (uSnowLie > 0.3) c = snowCol;
    c = mix(c, c * vec3(0.8, 0.84, 0.92), uRain);
    a = 0.15;
  }
  if (uVisitor.w != 0.0) {
    ivec2 q = ivec2(floor(px) - vec2(floor(uVisitor.x), 2.0 + floor(uVisitor.y)));
    q.x *= int(uVisitor.w);
    int part = q.x >= -3 && q.x <= 2 && q.y >= 0 && q.y <= 4 ? sparrow(q, int(uVisitor.z + 0.5)) : 0;
    if (part > 0) {
      vec3 bc = part == 1 ? hex(132.0, 92.0, 64.0) : part == 2 ? hex(118.0, 104.0, 96.0) : part == 3 ? hex(226.0, 214.0, 190.0)
        : part == 4 ? hex(50.0, 38.0, 40.0) : part == 5 ? hex(222.0, 168.0, 76.0) : hex(98.0, 74.0, 66.0);
      c = tod(bc, bc * vec3(1.08, 0.94, 0.8), bc * vec3(0.7, 0.6, 0.74), bc * vec3(0.3, 0.32, 0.45));
      a = 0.15;
    }
  }

  // snow falling: flakes drifting down slowly, swaying, near ones bigger
  if (uRain > 0.01 && uSnowing > 0.5) {
    vec3 flake = mix(vec3(1.0), c, 0.2) * mix(1.0, 0.8, night);
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float cell = 7.0 + fk * 5.0;
      vec2 q = vec2(px.x, px.y + uTime * (6.0 + fk * 5.0));
      vec2 ci = floor(q / cell);
      float hf = hash2(ci + fk * 17.0);
      if (hf < uRain * 0.6) {
        vec2 fp = (ci + vec2(0.2 + 0.6 * h1(hf * 9.0), 0.5)) * cell;
        fp.x += 2.0 * sin(uTime * (0.8 + hf) + hf * 30.0);
        vec2 dd = abs(q - floor(fp));
        if (fk < 0.5 ? (dd.x + dd.y < 0.5) : (dd.x + dd.y < 1.5)) c = mix(c, flake, 0.85);
      }
    }
  }
  // rain falling past: thin slanted streaks, near ones longer and quicker than far ones
  if (uRain > 0.01 && uSnowing < 0.5) {
    vec3 drop = mix(vec3(1.0), c, 0.45) * mix(1.0, 0.75, night);
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float w = 3.0 + fk * 2.0, len = 3.0 + fk * 4.0, per = 26.0 + fk * 14.0;
      vec2 q = vec2(px.x + px.y * (0.22 + fk * 0.08), px.y + uTime * (48.0 + fk * 40.0));
      float colI = floor(q.x / w);
      if (mod(q.x, w) < 1.0 && h1(colI * 7.3 + fk * 31.0) < uRain * (0.75 - fk * 0.2)) {
        float ph = fract((q.y + h1(colI * 3.1 + fk) * per) / per);
        if (ph < len / per) c = mix(c, drop, 0.35 + 0.2 * fk);
      }
    }
    // drops on the glass: little beads, lit on top and dark under; now and then one runs down
    vec2 cellI = floor(px / 6.0);
    vec2 inC = px - cellI * 6.0;
    float hb = hash2(cellI + 0.5);
    vec2 bead = floor(vec2(1.0 + 4.0 * h1(hb * 9.1), 1.0 + 4.0 * h1(hb * 5.7)));
    if (hb < 0.3 * uRain) {
      // (by night they only catch a little of the light from the room and the town)
      if (inC == bead) c = mix(c, vec3(1.0), 0.55 - 0.3 * night);
      else if (inC == bead - vec2(0.0, 1.0)) c *= 0.8;
    }
    float runCol = floor(px.x / 9.0);
    if (h1(runCol * 1.7) < 0.35 * uRain && mod(px.x, 9.0) == 4.0) {
      float speed = 6.0 + 10.0 * h1(runCol * 4.3);
      float yd = H - mod(uTime * speed + h1(runCol) * H * 3.0, H * 1.6);
      if (px.y == floor(yd)) c = mix(c, vec3(1.0), 0.6);
      else if (px.y > yd && px.y < yd + 9.0) c = mix(c, vec3(1.0), 0.16);
    }
  }
  // the drop the cat on the sill is after: a bead, and the wet trail it leaves above it
  if (uDrop.z > 0.5) {
    vec2 dq = px - floor(uDrop.xy);
    if ((dq.x == 0.0 || dq.x == 1.0) && dq.y == 0.0) c = mix(c, vec3(1.0), 0.7);
    else if ((dq.x == 0.0 || dq.x == 1.0) && dq.y == -1.0) c *= 0.8;
    else if (dq.x == 0.0 && dq.y > 0.0 && dq.y < 12.0) c = mix(c, vec3(1.0), 0.2 * (1.0 - dq.y / 12.0));
  }
  // the glass catches the light: two thin streaks across the top corner of each pane (by day: at
  // night, across the dark, they would only look like rain)
  float g = mod(px.x + px.y, 40.0);
  vec2 pane = mod(px, vec2(Wd * 0.5, H * 0.62));
  if ((g < 2.0 || (g > 4.0 && g < 5.0)) && pane.y > H * 0.62 * 0.45 && pane.x < Wd * 0.25) c = mix(c, vec3(1.0), 0.18 * (1.0 - night));
  gl_FragColor = vec4(c, a);
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
uniform float uDay;
void main() {
  float tw = 0.5 + 0.5 * sin(uTime * (0.8 + uSeed) + uSeed * 9.0);
  // (unlit: clear glass, catching the day)
  vec3 off = mix(vec3(0.3, 0.27, 0.3), vec3(0.86, 0.82, 0.76), uDay);
  // lit, it breathes: dimming, a filament goes amber, never a dull grey
  vec3 on = mix(uCol * vec3(0.95, 0.66, 0.4), uCol, tw);
  // alpha 0.2: shown as it is, and glowing (when lit)
  gl_FragColor = vec4(mix(off, on, uOn), uOn > 0.5 ? 0.2 : 0.15);
}`;

const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export interface Spots {
  bed: THREE.Vector3;
  food: THREE.Vector3;
  water: THREE.Vector3;
  litter: THREE.Vector3;
  /** places worth a sniff on a wander round the room: where to stand, and which way to face */
  sniff: { to: THREE.Vector3; face: number }[];
  /** upright things to rub a cheek on: the lamp's pole */
  posts: THREE.Vector3[];
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
  /** the monstera's leaves, as they were set, to stir about that */
  private readonly leaves: { leaf: THREE.Mesh; x: number; z: number; seed: number }[] = [];
  /** where the monstera's pot stands, and how much its leaves are shaking (knocked) */
  private readonly potAt = new THREE.Vector3();
  private plantShake = 0;
  /** the curtains, each swinging a little from its rod (how far, how fast) */
  private readonly curtains: { mesh: THREE.Object3D; x: number; a: number; v: number; seed: number }[] = [];
  /** the monstera's leaves rustling (how hard) */
  onRustle: ((k: number) => void) | null = null;
  /** the standard lamp rocking on its foot (tipped so far each way, and how fast), and where its
   *  light is when it stands straight */
  private readonly lampSway = { group: new THREE.Group() as THREE.Object3D, ax: 0, az: 0, vx: 0, vz: 0, home: new THREE.Vector3() };

  /** a cat knocks against something, at a point, so hard (0 .. 1): the monstera's pot, and its
   *  leaves shake and rustle; a curtain, and it swings */
  bump(at: THREE.Vector3, k: number) {
    if (Math.hypot(at.x - this.potAt.x, at.z - this.potAt.z) < 0.3 && at.y < 0.5) {
      if (this.plantShake < 0.3) this.onRustle?.(k);
      this.plantShake = Math.min(1, this.plantShake + k);
    }
    // the lamp: knocked, it rocks on its foot, away from the knock
    const S = this.lampSway, dx = S.home.x - at.x, dz = S.home.z - at.z, dl = Math.hypot(dx, dz);
    if (dl < 0.16) {
      S.vz += (dx / (dl || 1)) * k * 0.09;
      S.vx -= (dz / (dl || 1)) * k * 0.09;
    }
    const w = this.win;
    for (const C of this.curtains) {
      // (out toward the room, and back)
      if (Math.abs(at.x - C.x) < 0.16 && at.z < w.z + 0.4) C.v -= k * 0.5 * (0.7 + 0.3 * Math.random());
    }
  }
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
      sniff: [],
      posts: [],
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
    // (a little wider than the rug: its fringe)
    const rug = new THREE.Mesh(new THREE.CircleGeometry(rugR + 0.022, 64), this.mat('rug', { pattern: 2, rug: new THREE.Vector3(bx, bz - 0.02, rugR), wallZ }));
    rug.rotation.x = -Math.PI / 2;
    rug.receiveShadow = true;
    add(rug, bx, 0.002, bz - 0.02);

    // the back wall, round the window
    const winL = bx - 0.34, winR = bx + 0.34, winB = 0.36, winT = 1.16;
    // one sheet with the window cut out of it (pieces would leave hairline cracks at their seams)
    const wallShape = new THREE.Shape([new THREE.Vector2(bx - 2, 0), new THREE.Vector2(bx + 2, 0), new THREE.Vector2(bx + 2, 2.4), new THREE.Vector2(bx - 2, 2.4)]);
    wallShape.holes.push(new THREE.Path([new THREE.Vector2(winL, winB), new THREE.Vector2(winL, winT), new THREE.Vector2(winR, winT), new THREE.Vector2(winR, winB)]));
    const wall = new THREE.Mesh(new THREE.ShapeGeometry(wallShape), this.mat('wall', { pattern: 3 }));
    wall.receiveShadow = true;
    wall.castShadow = true;   // the sun comes in only through the window
    add(wall, 0, 0, wallZ);
    // the dado rail stands proud of the wall
    add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(4, 0.03, 0.02), this.mat('paint'))), bx, 0.318, wallZ + 0.01);
    add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(4, 0.05, 0.015), this.mat('paint', { tone: -0.05 }))), bx, 0.025, wallZ + 0.008);

    this.win = { l: winL, r: winR, b: winB, t: winT, z: wallZ };
    // the window: the sky behind, a white frame and glazing bars, a deep sill
    const ww = winR - winL, wh = winT - winB;
    // (drawn after the sunbeam, so its light does not tint the sky)
    this.sky = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uHour: { value: 12 }, uSkyPx: { value: new THREE.Vector2(48, 56) }, uPxSize: { value: 0.01 }, uPar: { value: 0 }, uRain: { value: 0 },
        uSnowing: { value: 0 }, uSnowLie: { value: 0 }, uRainbow: { value: 0 }, uCloud: { value: 0.5 }, uMoon: { value: 0.5 }, uFog: { value: 0 }, uFlash: { value: 0 }, uBolt: { value: new THREE.Vector3() }, uMeteor: { value: new THREE.Vector4(0, 0, -1, 1) }, uVisitor: { value: new THREE.Vector4() }, uFall: { value: new THREE.Vector2() }, uDrop: { value: new THREE.Vector3() },
        uLeafA: { value: new THREE.Vector3(122 / 255, 162 / 255, 96 / 255) }, uLeafB: { value: new THREE.Vector3(76 / 255, 116 / 255, 76 / 255) },
        uLeafC: { value: new THREE.Vector3(1, 0.7, 0.75) }, uLeafs: { value: new THREE.Vector2(1, 0) },
      },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      transparent: true, blending: THREE.NoBlending,
    });
    const skyMesh = add(new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), this.sky), bx, winB + wh / 2, wallZ - 0.06);
    skyMesh.renderOrder = 20;
    this.skyMesh = skyMesh;
    const paint = this.mat('paint');
    const bar = (w: number, h: number, d: number, x: number, y: number, z = wallZ - 0.02) => add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), paint)), x, y, z);
    bar(ww + 0.08, 0.045, 0.08, bx, winT + 0.02);                       // head
    bar(0.045, wh, 0.08, winL - 0.02, winB + wh / 2);                     // jambs
    bar(0.045, wh, 0.08, winR + 0.02, winB + wh / 2);
    bar(0.02, wh, 0.03, bx, winB + wh / 2, wallZ - 0.04);                 // glazing bars
    bar(ww, 0.02, 0.03, bx, winB + wh * 0.62, wallZ - 0.04);
    bar(ww + 0.14, 0.03, 0.3, bx, winB - 0.015, wallZ + 0.11);            // the sill, deep enough for a cat to sleep on
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
    const jar = this.mat('bookMustard', { tone: 0.1 });
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.06, 14), jar)), winR - 0.12, winB + 0.03, wallZ + 0.02);
    this.candle(jar, new THREE.Vector3(winR - 0.12, winB + 0.068, wallZ + 0.02));
    // a yellow pencil left lying on the sill, near its edge (a cat will see to that)
    {
      const pen = new THREE.Group();
      const r = 0.0045, len = 0.15;
      const along = (m: THREE.Mesh, x: number) => { m.rotation.z = Math.PI / 2; m.position.x = x; pen.add(m); return m; };
      along(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len - 0.03, 6), this.mat('bookMustard', { tone: 0.12 }))), 0);
      along(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.008, 8), this.mat('metal', { tone: 0.25 })), -(len - 0.03) / 2 - 0.004);
      along(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.01, 8), this.mat('redBowl', { tone: 0.3 })), -(len - 0.03) / 2 - 0.013);
      // the sharpened end: bare wood, then the lead
      const wood = along(new THREE.Mesh(new THREE.ConeGeometry(r, 0.016, 6), this.mat('cardboard', { tone: 0.15 })), (len - 0.03) / 2 + 0.008);
      wood.rotation.z = -Math.PI / 2;
      const lead = along(new THREE.Mesh(new THREE.ConeGeometry(r * 0.35, 0.006, 6), this.mat('ink')), (len - 0.03) / 2 + 0.0135);
      lead.rotation.z = -Math.PI / 2;
      pen.position.set((winL + winR) / 2 + 0.12, winB + r, wallZ + 0.17);
      pen.rotation.y = 0.12;
      this.group.add(pen);
      this.pencil = pen;
      this.pen.home.copy(pen.position);
      this.pen.homeYaw = pen.rotation.y;
      this.pen.r = r;
      this.pen.edge = wallZ + 0.255;
    }
    // a little laser pointer lying at the front of the sill (taken up, the red dot it makes is for
    // the cat to chase): a dark barrel, a pale ring at the business end, a red button
    {
      const make = () => {
        const g = new THREE.Group();
        const r = 0.0065, len = 0.09;
        const along = (m: THREE.Mesh, x: number) => { m.rotation.z = Math.PI / 2; m.position.x = x; g.add(m); return m; };
        along(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), this.mat('bookBlue', { tone: -0.05 })), 0);
        along(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.08, 0.014, 8), this.mat('paint', { tone: -0.05 })), len / 2 - 0.007);
        along(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.006, 8), this.mat('paint', { tone: -0.12 })), -len / 2 + 0.003);
        const button = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.006), this.mat('redBowl', { tone: 0.25 }));
        button.position.set(0.012, r, 0);
        g.add(button);
        // (the little window it shines from, red and lit while it shines)
        const eye = new THREE.Mesh(new THREE.CircleGeometry(r * 0.6, 10), this.mat('redBowl', { tone: 0.35 }));
        eye.rotation.y = Math.PI / 2;
        eye.position.x = len / 2 + 0.0004;
        g.add(eye);
        return { g, eye: eye.material as THREE.ShaderMaterial };
      };
      const lp = make().g;
      lp.traverse((o) => { if ((o as THREE.Mesh).isMesh) shadowy(o as THREE.Mesh); });
      lp.position.set(bx - 0.14, winB + 0.0066, wallZ + 0.205);
      lp.rotation.y = -0.38;
      this.group.add(lp);
      this.pointer = lp;
      // (the same one in your hand, in front of the room, its end coming in from the bottom of the
      // picture; no shadow of it falls in the room)
      const held = make();
      held.g.visible = false;
      this.group.add(held.g);
      this.held = held.g;
      this.heldEye = held.eye;
    }
    // a feather wand left lying on the floor in front of the bed: a long cane, a string from its
    // end, and on the string a little bell and a bunch of bright feathers (taken up, you dangle them
    // for the cat)
    {
      const W = this.wand;
      // (thin, and thinner at the end nearer you: it is seen close to)
      const rod = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0021, 1, 6).translate(0, 0.5, 0), this.mat('brown', { tone: 0.2 })));
      const lure = new THREE.Group();
      const bell = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.0065, 8, 6), this.mat('bookMustard', { tone: 0.22 })));
      bell.position.y = -0.004;
      lure.add(bell);
      const feathers: [Material, number, number, number][] = [['pink', 0.08, -0.42, 0.95], ['water', 0.1, 0, 1.1], ['bookMustard', 0.12, 0.42, 0.9], ['pink', 0.0, 0.18, 0.75]];
      for (const [m, tone, a, len] of feathers) {
        const f = shadowy(new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), this.mat(m, { tone })));
        f.scale.set(0.014, 0.042 * len, 0.004);
        // (hanging from the bell, fanned out, a little apart front to back)
        f.position.set(Math.sin(a) * 0.042 * len, -0.014 - Math.cos(a) * 0.04 * len, a * 0.005);
        f.rotation.z = a;
        lure.add(f);
      }
      this.group.add(rod, lure);
      W.rod = rod;
      W.lure = lure;
      W.tip.copy(W.restTip);
      W.end.copy(W.restEnd);
      W.pos.set(W.restTip.x - 0.1, 0.012, W.restTip.z - 0.07);
      W.prev.copy(W.pos);
      this.placeWand(0);
    }

    // October (to early November): a little pumpkin at the end of the sill
    {
      const pk = new THREE.Group();
      const g = new THREE.SphereGeometry(0.04, 18, 12);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        // squat, with ribs
        const a = Math.atan2(z, x), rib = 1 + 0.07 * Math.cos(a * 8);
        pos.setXYZ(i, x * rib * 1.15, y * 0.72, z * rib * 1.15);
      }
      g.computeVertexNormals();
      pk.add(shadowy(new THREE.Mesh(g, this.mat('ginger', { tone: 0.04 }))));
      const stem = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.02, 6), this.mat('leaf', { tone: -0.1 })));
      stem.position.y = 0.033;
      stem.rotation.z = 0.3;
      pk.add(stem);
      pk.position.set(winL + 0.075, winB + 0.029, wallZ + 0.115);
      this.group.add(pk);
      this.decor.push({ obj: pk, from: [9, 1], to: [10, 6] });
      // Halloween week: a face carved in it, dark by day, lit from within at night
      const face = new THREE.Shape();
      const tri = (sh: THREE.Shape | THREE.Path, cx: number, cy: number, w: number, h: number, up = true) => {
        sh.moveTo(cx - w / 2, cy - (up ? h / 2 : -h / 2));
        sh.lineTo(cx + w / 2, cy - (up ? h / 2 : -h / 2));
        sh.lineTo(cx, cy + (up ? h / 2 : -h / 2));
        sh.closePath();
      };
      tri(face, -0.016, 0.009, 0.014, 0.012);
      const shapes = [face];
      const eyeR = new THREE.Shape(); tri(eyeR, 0.016, 0.009, 0.014, 0.012); shapes.push(eyeR);
      const nose = new THREE.Shape(); tri(nose, 0, -0.002, 0.007, 0.006); shapes.push(nose);
      // a grin with two teeth
      const grin = new THREE.Shape();
      grin.moveTo(-0.024, -0.009);
      grin.lineTo(-0.012, -0.013); grin.lineTo(-0.008, -0.009); grin.lineTo(-0.004, -0.014); grin.lineTo(0.004, -0.014);
      grin.lineTo(0.008, -0.009); grin.lineTo(0.012, -0.013); grin.lineTo(0.024, -0.009);
      grin.lineTo(0.016, -0.021); grin.lineTo(-0.016, -0.021);
      grin.closePath();
      shapes.push(grin);
      this.lantern = this.mat('shade', { tone: -0.75 });
      const fm = new THREE.Mesh(new THREE.ShapeGeometry(shapes), this.lantern);
      fm.position.set(winL + 0.075, winB + 0.029, wallZ + 0.115 + 0.047);
      this.group.add(fm);
      this.decor.push({ obj: fm, from: [9, 24], to: [10, 1] });
    }

    // December: a little fir in a pot at that end of the sill, a star on top and lights on it
    {
      const xt = new THREE.Group();
      xt.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.021, 0.035, 12), this.mat('pot', { tone: 0.04 }))));
      for (let k = 0; k < 3; k++) {
        const cone = shadowy(new THREE.Mesh(new THREE.ConeGeometry(0.05 - k * 0.012, 0.06, 10), this.mat('leaf', { tone: -0.06 + k * 0.03 })));
        cone.position.y = 0.045 + k * 0.032;
        xt.add(cone);
      }
      const star = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), this.mat('bookMustard', { tone: 0.2 }));
      star.position.y = 0.14;
      xt.add(star);
      this.xmasStar = star.material as THREE.ShaderMaterial;
      const cols = [[1, 0.5, 0.45], [1, 0.85, 0.5], [0.6, 0.8, 1], [1, 0.95, 0.8]];
      for (let k = 0; k < 9; k++) {
        const a = k * 2.4, h = 0.035 + (k / 9) * 0.085, r = 0.042 - (k / 9) * 0.03;
        const m = new THREE.ShaderMaterial({
          uniforms: { uTime: this.timeU, uOn: { value: 1 }, uCol: { value: new THREE.Color(...(cols[k % 4] as [number, number, number])) }, uSeed: { value: Math.random() } },
          vertexShader: SKY_VERT, fragmentShader: BULB_FRAG, transparent: true, blending: THREE.NoBlending,
        });
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 5, 3), m);
        b.position.set(Math.cos(a) * r, h, Math.sin(a) * r + 0.004);
        b.renderOrder = 20;
        xt.add(b);
      }
      xt.position.set(winL + 0.075, winB + 0.0175, wallZ + 0.115);
      this.group.add(xt);
      this.decor.push({ obj: xt, from: [11, 1], to: [11, 31] });
    }
    // spring: a jar of tulips there
    {
      const tl = new THREE.Group();
      tl.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.06, 12), this.mat('water', { tone: 0.15 }))));
      const bloom = ['bookRed', 'pink', 'bookMustard', 'bookRed', 'pink'] as Material[];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2, lean = 0.25;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.09, 4), this.mat('leaf'));
        stem.position.set(Math.cos(a) * 0.01, 0.075, Math.sin(a) * 0.01);
        stem.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
        tl.add(stem);
        const head = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), this.mat(bloom[k], { tone: 0.05 })));
        head.scale.set(0.9, 1.3, 0.9);
        head.position.set(Math.cos(a) * 0.022, 0.12, Math.sin(a) * 0.022);
        tl.add(head);
      }
      tl.position.set(winL + 0.075, winB + 0.03, wallZ + 0.115);
      this.group.add(tl);
      this.decor.push({ obj: tl, from: [2, 15], to: [4, 20] });
    }

    // under the window, an old column radiator painted cream: its fins, the pipes along its top
    // and foot, its legs, and the pipe and valve at its end
    const radW = 0.46, radB = 0.07, radH = 0.19, radZ = wallZ + 0.055;
    const radMat = this.mat('enamel', { tone: 0.06, pattern: 9 });
    const nFin = 13;
    // (each section a round-topped column, so the light runs across it: lit on the lamp's side,
    // in shade on the other, a glint on its shoulder; flat boxes would be a single dull tone each)
    const finR = radW / nFin / 2 - 0.003;
    const fin = new THREE.CapsuleGeometry(finR, radH - 2 * finR, 4, 10).scale(1, 1, 1.5);
    for (let i = 0; i < nFin; i++) {
      const x = bx - radW / 2 + (i + 0.5) * (radW / nFin);
      add(shadowy(new THREE.Mesh(fin, radMat)), x, radB + radH / 2, radZ);
    }
    for (const y of [radB + 0.022, radB + radH - 0.026]) {
      add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, radW + 0.01, 10).rotateZ(Math.PI / 2), radMat)), bx, y, radZ - 0.012);
    }
    for (const x of [bx - radW / 2 + 0.03, bx + radW / 2 - 0.03]) add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.02, radB, 0.03), radMat)), x, radB / 2, radZ);
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, radB + 0.02, 8), this.mat('metal', { tone: 0.15 }))), bx + radW / 2 + 0.03, (radB + 0.02) / 2, radZ + 0.01);
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8).rotateZ(Math.PI / 2), this.mat('metal', { tone: 0.15 }))), bx + radW / 2 + 0.008, radB + 0.02, radZ + 0.01);
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 12), this.mat('bookRed', { tone: 0.05 }))), bx + radW / 2 + 0.03, radB + 0.055, radZ + 0.01);
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6), this.mat('metal', { tone: 0.15 }))), bx + radW / 2 + 0.03, radB + 0.035, radZ + 0.01);

    // the curtains on their rod, gathered in soft folds
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, ww + 0.5, 8).rotateZ(Math.PI / 2), this.mat('metal'))), bx, winT + 0.09, wallZ + 0.06);
    for (const side of [-1, 1]) {
      const ch = winT + 0.09 - 0.22;
      const g = new THREE.PlaneGeometry(0.17, ch, 18, 1);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.018 * Math.sin(pos.getX(i) / 0.17 * Math.PI * 5));
      g.computeVertexNormals();
      // (hung from the rod: it swings about the top, brushed by a cat going by)
      g.translate(0, -ch / 2, 0);
      const c = shadowy(new THREE.Mesh(g, this.mat('curtain')));
      const x = side < 0 ? winL - 0.07 : winR + 0.07;
      add(c, x, winT + 0.09, wallZ + 0.07);
      this.curtains.push({ mesh: c, x, a: 0, v: 0, seed: side * 1.7 });
    }
    // fairy lights along the top of the window: a sagging wire and warm bulbs
    const n = 11, wire: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      wire.push(new THREE.Vector3(winL - 0.06 + t * (ww + 0.12), winT - 0.02 - 0.07 * Math.sin(Math.PI * ((t * 2) % 1)), wallZ + 0.1));
    }
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wire), 60, 0.0025, 4), this.mat('brown', { tone: 0.12 })), 0, 0, 0);
    const bulbCols = [[1, 0.86, 0.55], [1, 0.72, 0.5], [1, 0.95, 0.75], [1, 0.62, 0.62]];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = new THREE.CatmullRomCurve3(wire).getPoint(t);
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: this.timeU, uOn: this.nightU, uDay: this.lights.uDay, uCol: { value: new THREE.Color(...(bulbCols[i % 4] as [number, number, number])) }, uSeed: { value: Math.random() } },
        vertexShader: SKY_VERT, fragmentShader: BULB_FRAG,
        transparent: true, blending: THREE.NoBlending,
      });
      this.bulbs.push(m);
      const bulb = add(new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), m), p.x, p.y - 0.008, p.z);
      bulb.renderOrder = 20;
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
    // (standing on the sill by the succulent, a little back against the glass)
    print.scale.setScalar(0.62);
    print.rotation.set(-0.14, 0.18, 0);
    print.position.set(winL + 0.16, winB + 0.04, wallZ - 0.005);
    this.group.add(print);

    // an old wooden radio on the sill: a cloth grille, a round dial that glows warm while it plays,
    // two knobs and a handle (tapping it switches it on and off)
    const radio = new THREE.Group();
    const rw = 0.105, rh = 0.068, rd = 0.045;
    radio.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(rw, rh, rd), this.mat('brown', { tone: 0.06 }))));
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(rw * 0.5, rh * 0.62), this.mat('rugCream', { tone: -0.05 }));
    grille.position.set(-rw * 0.2, 0.002, rd / 2 + 0.0008);
    radio.add(grille);
    for (let i = 0; i < 4; i++) {
      const slat = new THREE.Mesh(new THREE.PlaneGeometry(rw * 0.5, 0.0035), this.mat('brown', { tone: -0.12 }));
      slat.position.set(-rw * 0.2, -rh * 0.2 + i * rh * 0.135, rd / 2 + 0.0012);
      radio.add(slat);
    }
    this.dial = this.mat('bookMustard', { tone: 0.12 });
    const dialM = new THREE.Mesh(new THREE.CircleGeometry(0.014, 16), this.dial);
    dialM.position.set(rw * 0.27, 0.008, rd / 2 + 0.0008);
    radio.add(dialM);
    const needle = new THREE.Mesh(new THREE.PlaneGeometry(0.0025, 0.013), this.mat('bookRed'));
    needle.position.set(rw * 0.27, 0.01, rd / 2 + 0.0014);
    needle.rotation.z = -0.5;
    radio.add(needle);
    for (const kx of [0.19, 0.36]) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 10).rotateX(Math.PI / 2), this.mat('metal', { tone: 0.2 }));
      knob.position.set(rw * kx, -rh * 0.32, rd / 2 + 0.003);
      radio.add(knob);
    }
    const handle = shadowy(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 16, Math.PI), this.mat('brown', { tone: -0.08 })));
    handle.position.set(0, rh / 2, 0);
    radio.add(handle);
    radio.rotation.y = -0.22;
    radio.position.set(winR - 0.15, winB + rh / 2, wallZ + 0.03);
    this.group.add(radio);
    this.radio = radio;
    this.print = print;
    pot(bx + 0.27, 0.03, 0.055, 'pot');
    tuft(bx + 0.27, ty + 0.085, 8, 0.02, 0.016, 0.05);
    const wax = this.mat('rugCream', { tone: 0.15 });
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12), wax)), bx + 0.38, ty + 0.036, wallZ + 0.05);
    this.candle(wax, new THREE.Vector3(bx + 0.38, ty + 0.07, wallZ + 0.05));

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

    // on the wall to the left (seen on wide screens): a framed print of the sea under a low sun,
    // and a clock that keeps the real time
    {
      const pr = new THREE.Group();
      pr.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.015), this.mat('brown', { tone: -0.05 }))));
      const layer = (w: number, h: number, y: number, m: Material, tone: number, z = 0.0085) => {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat(m, { tone }));
        q.position.set(0, y, z);
        pr.add(q);
      };
      layer(0.25, 0.35, 0, 'rugCream', 0.1);
      layer(0.25, 0.12, -0.115, 'water', 0.05, 0.009);
      layer(0.25, 0.012, -0.05, 'water', 0.15, 0.0095);
      layer(0.25, 0.012, -0.09, 'water', 0.12, 0.0095);
      const sunD = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), this.mat('bookMustard', { tone: 0.1 }));
      sunD.position.set(0.03, -0.035, 0.0088);
      pr.add(sunD);
      pr.position.set(bx - 0.9, 0.95, wallZ + 0.01);
      this.group.add(pr);
      const clock = new THREE.Group();
      clock.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.025, 32).rotateX(Math.PI / 2), this.mat('brown', { tone: 0.05 }))));
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.085, 32), this.mat('paint', { tone: 0.05 }));
      face.position.z = 0.0135;
      clock.add(face);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const tick = new THREE.Mesh(new THREE.PlaneGeometry(i % 3 === 0 ? 0.008 : 0.005, i % 3 === 0 ? 0.018 : 0.01), this.mat('ink'));
        tick.position.set(Math.sin(a) * 0.07, Math.cos(a) * 0.07, 0.014);
        tick.rotation.z = -a;
        clock.add(tick);
      }
      const hand = (len: number, w: number) => {
        const g = new THREE.PlaneGeometry(w, len).translate(0, len / 2 - 0.008, 0);
        const m = new THREE.Mesh(g, this.mat('ink'));
        m.position.z = 0.015;
        clock.add(m);
        return m;
      };
      this.hourHand = hand(0.045, 0.008);
      this.minHand = hand(0.068, 0.005);
      clock.position.set(bx - 0.62, 1.06, wallZ + 0.0125);
      this.group.add(clock);
    }

    // the lamp: a bronze stand, a linen shade
    const lx = bx - 0.3, lz = bz - 0.2;
    // (its foot a low dome, which catches the light along its top; a flat disc is a black blot)
    add(shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.32, 1), this.mat('metal', { tone: 0.08, pattern: 9 }))), lx, 0.004, lz);
    add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.083, 0.006, 24), this.mat('metal', { tone: 0.08 }))), lx, 0.003, lz);
    // (the pole and the shade on it rock a little on the foot when a cat knocks into it, and the
    // light with them)
    const lamp = new THREE.Group();
    lamp.position.set(lx, 0.006, lz);
    const pole = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 8), this.mat('metal')));
    pole.position.y = 0.494;
    this.shade = this.mat('shade', { pattern: 7 });
    const shadeM = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, 0.16, 24, 1, true), this.shade));
    shadeM.position.y = 1.014;
    lamp.add(pole, shadeM);
    this.group.add(lamp);
    this.lampSway.group = lamp;
    this.lampPos = new THREE.Vector3(lx, 0.97, lz);
    this.lampSway.home.copy(this.lampPos);

    // a monstera in a terracotta pot by the box: big split leaves fanned out toward the room
    const px = bx + 0.43, pz = wallZ + 0.24;
    this.potAt.set(px, 0, pz);
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
      const leaf = new THREE.Mesh(leafGeo, this.mat('leaf', { tone: (sz - 0.85) * 0.4, pattern: 8 }));
      leaf.scale.setScalar(sz);
      leaf.position.copy(tip);
      // the leaf sits on the end of its stem, its face toward the room (and a little up), leaning
      // out the way its stem goes
      leaf.rotation.order = 'YXZ';
      leaf.rotation.set(-0.5 - 0.3 * (1 - lean), Math.sin(a) * 0.35, -Math.sin(a) * 0.95);
      shadowy(leaf);
      this.group.add(leaf);
      this.leaves.push({ leaf, x: leaf.rotation.x, z: leaf.rotation.z, seed: a * 3.1 + h * 7 });
    }

    // in front: a stack of books with a mug on top, and a ball of yarn the cat plays with
    const fx = bx + 0.42, fz = bz + 0.38;
    this.books.set(fx, 0, fz);
    const stack: [Material, number, number][] = [['bookBlue', 0.2, 0.03], ['bookRed', 0.18, 0.025], ['bookMustard', 0.17, 0.028]];
    let fy = 0;
    stack.forEach(([mname, w, t], i) => {
      const bk = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, t, w * 0.7), this.mat(mname)));
      bk.rotation.y = (i - 1) * 0.18;
      add(bk, fx, fy + t / 2, fz);
      fy += t;
    });
    {
      // the mug of tea, all of a piece (a cat can knock it off), its base at the top of the books
      const mug = new THREE.Group();
      const china = this.mat('paint');
      const body = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.07, 16), china));
      body.position.y = 0.035;
      const handle = shadowy(new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 6, 12), china));
      handle.position.set(0.035, 0.04, 0);
      const tea = new THREE.Mesh(new THREE.CircleGeometry(0.028, 14).rotateX(-Math.PI / 2), this.mat('brown'));
      tea.position.y = 0.066;
      mug.add(body, handle, tea);
      mug.position.set(fx + 0.01, fy, fz);
      this.group.add(mug);
      this.cup.mesh = mug;
      this.cup.home.copy(mug.position);
      this.cup.tea = tea;
      // what is left of it on the floor: pieces of china, the handle, and the tea spreading
      const bits = new THREE.Group();
      bits.visible = false;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.random() * 0.4, w = 0.6 + Math.random() * 0.7, h = 0.018 + Math.random() * 0.022;
        const pg = new THREE.CylinderGeometry(0.031, 0.03, h, 4, 1, true, a, w);
        // (about its own middle, not the mug's: it is a piece on its own now)
        pg.translate(-0.031 * Math.sin(a + w / 2), 0, -0.031 * Math.cos(a + w / 2));
        const piece = shadowy(new THREE.Mesh(pg, china));
        (piece.material as THREE.Material).side = THREE.DoubleSide;
        bits.add(piece);
      }
      const hb = shadowy(new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 6, 12, Math.PI * 1.3), china));
      bits.add(hb);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), this.mat('brown', { tone: 0.05 }));
      {
        // (not a circle: a spill runs out in lobes)
        const pp = pool.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pp.count; i++) {
          const x = pp.getX(i), z = pp.getZ(i), a = Math.atan2(z, x);
          const k = 1 + 0.22 * Math.sin(a * 3 + 1.1) + 0.12 * Math.sin(a * 5 + 0.3);
          pp.setXYZ(i, x * k * 1.3, 0, z * k * 0.85);
        }
      }
      pool.receiveShadow = true;
      // (wet: a glint of the light from the window on it)
      const glint = new THREE.Mesh(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), this.mat('paint', { tone: -0.12 }));
      glint.scale.set(0.32, 1, 0.16);
      glint.position.set(-0.25, 0.0012, -0.3);
      pool.add(glint);
      this.group.add(pool);
      pool.visible = false;
      this.group.add(bits);
      this.cup.bits = bits;
      this.cup.pool = pool;
    }
    this.mugTop = new THREE.Vector3(fx + 0.01, fy + 0.07, fz);
    const wool = this.mat('bookRed', { tone: 0.12, pattern: 5 });
    const yarn = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), wool));
    // (in front of the bed, well in view on a phone, where a finger can find it)
    const yx = bx + 0.24, yz = bz + 0.31;
    add(yarn, yx, 0.045, yz);
    const strand = new THREE.Mesh(new THREE.BufferGeometry(), this.mat('bookRed', { tone: 0.12 }));
    this.group.add(strand);
    this.yarn = { mesh: yarn, v: new THREE.Vector3(), tail: new THREE.Vector3(yx + 0.12, 0.003, yz + 0.22), strand, rebuild: 0, hold: null, pinned: 0, pinAt: null, occ: -1 };
    this.windStrand();

    // the bed: a soft teal rim round an oatmeal fleece cushion
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 32), this.mat('fleece', { pattern: 4 }));
    cushion.receiveShadow = true;
    add(cushion, S.bed.x, 0.015, S.bed.z);
    // (stuffed in eight puffy sections, a little uneven)
    const rimGeo = new THREE.TorusGeometry(0.172, 0.04, 12, 64);
    {
      const pos = rimGeo.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const a = Math.atan2(v.y, v.x);
        c.set(Math.cos(a) * 0.172, Math.sin(a) * 0.172, 0);
        const puff = 1 + 0.13 * Math.pow(Math.abs(Math.cos(a * 4)), 0.6) - 0.06 + 0.04 * Math.sin(a * 3 + 1);
        v.sub(c).multiplyScalar(puff).add(c);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      rimGeo.computeVertexNormals();
    }
    const rim = new THREE.Mesh(rimGeo, this.mat('bed', { pattern: 6 }));
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = 0.75;
    shadowy(rim);
    add(rim, S.bed.x, 0.03, S.bed.z);

    // a cardboard box on the floor in front, open, its flaps folded out (left out for a few days
    // now and then, as boxes are): the cat's, of course
    {
      const W = 0.3, D = 0.23, H = 0.11, t = 0.006;
      const card = this.mat('cardboard'), inner = this.mat('cardboard', { tone: -0.12 });
      const box = new THREE.Group();
      const wall = (w: number, x: number, z: number, ry: number, m: THREE.Material) => {
        const g = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, H, t), m));
        g.position.set(x, H / 2, z);
        g.rotation.y = ry;
        box.add(g);
      };
      wall(W, 0, D / 2, 0, card);
      wall(W, 0, -D / 2, 0, card);
      wall(D, W / 2, 0, Math.PI / 2, card);
      wall(D, -W / 2, 0, Math.PI / 2, card);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(W, t, D), inner);
      floor.position.y = t / 2;
      floor.receiveShadow = true;
      box.add(floor);
      // the flaps, hinged at the top of each side and folded out and down a little
      const flap = (w: number, d: number, x: number, z: number, ry: number) => {
        const piv = new THREE.Group();
        piv.position.set(x, H, z);
        piv.rotation.y = ry;
        const f = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, t, d), card));
        f.position.z = d / 2;
        piv.add(f);
        piv.rotateX(0.32);
        box.add(piv);
      };
      flap(W, D * 0.3, 0, D / 2, 0);
      flap(W, D * 0.3, 0, -D / 2, Math.PI);
      flap(D, W * 0.26, W / 2, 0, Math.PI / 2);
      flap(D, W * 0.26, -W / 2, 0, -Math.PI / 2);
      // what a box that came in the post has on its side: a shipping label (on the part of its
      // front you see: the box stands at the corner of the picture, its flaps over the rest)
      const onFront = (w: number, h: number, x: number, y: number, m: THREE.Material, dz = 0.0008) => {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
        q.position.set(x, y, D / 2 + t / 2 + dz);
        box.add(q);
      };
      onFront(0.07, 0.046, 0.075, H * 0.45, this.mat('paper'));
      const ink = this.mat('ink');
      for (const [w, y] of [[0.05, 0.015], [0.038, 0.004], [0.046, -0.007]] as [number, number][]) onFront(w, 0.0035, 0.075 - (0.05 - w) / 2, H * 0.45 + y, ink, 0.0016);
      box.position.set(bx - 0.31, 0, bz + 0.35);
      box.rotation.y = 0.35;
      this.group.add(box);
      this.box = { group: box, center: box.position.clone(), yaw: 0.35, w: W, d: D, h: H, here: false, thing: [box.position, 0] };
    }

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

    // what the room's light needs to know: the window, its bars, the fairy lights' wire, and the
    // things that shade the floor and walls near them
    const L = this.lights;
    (L.uWin.value as THREE.Vector4).set(winL, winR, winB, winT);
    (L.uWinBar.value as THREE.Vector3).set(bx, winB + wh * 0.62, 0.01);
    L.uWinZ.value = wallZ - 0.03;
    (L.uFairy.value as THREE.Vector4).set(winL - 0.06, winR + 0.06, winT - 0.05, wallZ + 0.1);
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const occ: [THREE.Vector3, THREE.Vector3, number, number][] = [];
    const cap = (a: THREE.Vector3, b2: THREE.Vector3, r: number, k: number) => occ.push([a, b2, r, k]);
    for (let i = 0; i < 8; i++) {
      // the bed's soft rim
      const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
      cap(V(S.bed.x + 0.172 * Math.cos(a0), 0.03, S.bed.z + 0.172 * Math.sin(a0)), V(S.bed.x + 0.172 * Math.cos(a1), 0.03, S.bed.z + 0.172 * Math.sin(a1)), 0.04, 0.55);
    }
    cap(V(px, 0.05, pz), V(px, 0.17, pz), 0.1, 0.6);                       // the monstera's pot
    cap(V(lx, 0.01, lz), V(lx, 0.012, lz), 0.07, 0.4);                     // the lamp's foot
    cap(V(S.food.x, 0.02, S.food.z), V(S.food.x, 0.021, S.food.z), 0.06, 0.5);
    cap(V(S.water.x, 0.02, S.water.z), V(S.water.x, 0.021, S.water.z), 0.06, 0.5);
    for (const [ax, az, bx2, bz2] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
      cap(V(S.litter.x + ax * W / 2, 0.04, S.litter.z + az * D / 2), V(S.litter.x + bx2 * W / 2, 0.04, S.litter.z + bz2 * D / 2), 0.035, 0.5);
    }
    cap(V(fx, 0.03, fz), V(fx, 0.06, fz), 0.1, 0.5);                       // the stack of books
    this.yarn.occ = occ.length;
    cap(V(yx, 0.045, yz), V(yx, 0.046, yz), 0.045, 0.6);   // the yarn (it goes where the ball goes)
    cap(V(bx - 0.45, ty - 0.005, wallZ + 0.055), V(bx + 0.45, ty - 0.005, wallZ + 0.055), 0.045, 0.5);
    cap(V(sx - 0.21, sy, wallZ + 0.06), V(sx + 0.21, sy, wallZ + 0.06), 0.045, 0.5);
    cap(V(winL - 0.07, winB - 0.02, wallZ + 0.14), V(winR + 0.07, winB - 0.02, wallZ + 0.14), 0.04, 0.5);
    cap(V(bx - 2, 0.318, wallZ + 0.01), V(bx + 2, 0.318, wallZ + 0.01), 0.015, 0.4);
    cap(V(bx - 0.2, 0.16, wallZ + 0.055), V(bx + 0.2, 0.16, wallZ + 0.055), 0.07, 0.5);   // the radiator
    this.yarnHome.set(yx, 0, yz);
    this.things.push([V(px, 0, pz), 0.11], [V(lx, 0, lz), 0.08], [V(fx, 0, fz), 0.14], [this.yarnHome, 0.05], this.box.thing);
    this.hides.push([V(fx, 0, fz), 0.14]);
    // worth a sniff: the monstera's pot, the radiator, the yarn, the books with the mug on them
    const face = (from: THREE.Vector3, at: THREE.Vector3) => Math.atan2(at.x - from.x, at.z - from.z);
    for (const [sx2, sz2, ax, az] of [
      [px - 0.22, pz + 0.14, px, pz], [bx - 0.06, wallZ + 0.26, bx - 0.06, wallZ], [yx - 0.18, yz + 0.07, yx, yz], [fx - 0.17, fz + 0.03, fx, fz],
    ]) {
      const to = V(sx2, 0, sz2);
      S.sniff.push({ to, face: face(to, V(ax, 0, az)) });
    }
    S.posts.push(V(lx, 0, lz));
    const O = L.uOcc.value as THREE.Vector4[];
    occ.slice(0, NOCC).forEach(([a, b2, r, k], i) => { O[2 * i].set(a.x, a.y, a.z, r); O[2 * i + 1].set(b2.x, b2.y, b2.z, k); });
  }

  /** the window opening, for the sunbeam and the dust in it */
  private readonly win: { l: number; r: number; b: number; t: number; z: number };
  private readonly motes: { p: THREE.Vector3; v: THREE.Vector3; b: number; life: number }[] = [];
  private readonly timeU = { value: 0 };
  /** the ball of wool: the ball, how it is rolling, the loose end of its strand; where a finger on
   *  it is pulling it, how much longer a cat's paws hold it down; its shadow among the occluders */
  private readonly yarn!: {
    mesh: THREE.Mesh; v: THREE.Vector3; tail: THREE.Vector3; strand: THREE.Mesh; rebuild: number;
    hold: THREE.Vector3 | null; pinned: number; pinAt: THREE.Vector3 | null; occ: number;
  };

  /** the cardboard box on the floor: its middle, which way it is turned, its size, whether it is
   *  out just now, and its place among the things on the floor (no size while it is not) */
  private box!: {
    group: THREE.Group; center: THREE.Vector3; yaw: number; w: number; d: number; h: number; here: boolean;
    thing: [THREE.Vector3, number];
  };

  /** the box for a cat: where to hop in from (on the side toward the room), where to sit in it,
   *  where to land hopping out, and how high its sides are */
  boxSpot() {
    const B = this.box;
    if (!B.here) return null;
    const toRoom = new THREE.Vector3(this.spots.bed.x - B.center.x, 0, this.spots.bed.z - B.center.z).normalize();
    return {
      launch: B.center.clone().addScaledVector(toRoom, 0.33), seat: B.center.clone(),
      land: B.center.clone().addScaledVector(toRoom, 0.36).add(new THREE.Vector3(0.04, 0, -0.02)), height: B.h,
    };
  }

  /** the windowsill for a cat: where to jump up from, where to sit on it (facing the glass), where
   *  to land jumping down, and how high it is */
  sillSpot() {
    const { l, r, b, z } = this.win;
    const x = (l + r) / 2;
    return { launch: new THREE.Vector3(x, 0, z + 0.44), seat: new THREE.Vector3(x, 0, z + 0.08), land: new THREE.Vector3(x + 0.03, 0, z + 0.46), height: b };
  }

  /** the little flock of birds going by outside, as the sky draws them (by day, not in rain): the
   *  middle of it on the window's glass, or null when there are none */
  birds(): THREE.Vector3 | null {
    const u = this.sky.uniforms;
    const h = u.uHour.value as number, rain = u.uRain.value as number;
    const night = 1 - ss(5.4, 6.6, h) * (1 - ss(19.6, 20.6, h));
    if (night > 0.5 || rain >= 0.3) return null;
    const tb = ((this.time + 20) % 47 + 47) % 47;
    if (tb >= 16) return null;
    const px = u.uSkyPx.value as THREE.Vector2;
    const x = -8 + (tb * (px.x + 16)) / 16 - 9, y = px.y * 0.74 + 3;
    if (x < 0 || x > px.x) return null;
    const { l, r, b, t, z } = this.win;
    return new THREE.Vector3(l + (x / px.x) * (r - l), b + (y / px.y) * (t - b), z - 0.06);
  }

  /** where the ball of wool is */
  yarnAt() {
    return this.yarn.mesh.position;
  }

  /** the ball itself (to tap) */
  get yarnBall(): THREE.Object3D {
    return this.yarn.mesh;
  }

  /** a paw sends the ball rolling, a way and at a speed (m/s); under a finger it stays there */
  kickYarn(dir: THREE.Vector3, speed: number) {
    if (this.yarn.hold) return;
    const d = Math.hypot(dir.x, dir.z) || 1;
    this.yarn.v.set((dir.x / d) * speed, 0, (dir.z / d) * speed);
  }

  /** a finger on the ball: it rolls after the finger to a point on the floor (null: let go, and it
   *  rolls on the way it was going, no faster than a good flick) */
  holdYarn(at: THREE.Vector3 | null) {
    const Y = this.yarn;
    if (at) {
      (Y.hold ??= new THREE.Vector3()).set(at.x, 0, at.z);
      return;
    }
    Y.hold = null;
    const sp = Math.hypot(Y.v.x, Y.v.z);
    if (sp > 1.3) Y.v.multiplyScalar(1.3 / sp);
  }

  /** a cat's paws come down on the ball: held there a while (drawn in under them, at a point),
   *  however it is pulled */
  pinYarn(sec: number, at: THREE.Vector3) {
    const Y = this.yarn;
    Y.pinned = Math.max(Y.pinned, sec);
    (Y.pinAt ??= new THREE.Vector3()).set(at.x, 0.045, at.z);
    Y.v.set(0, 0, 0);
  }

  /** the floor the ball can roll over: from the room's one end to the other, from the wall under
   *  the window to the front of the room */
  get yarnBounds() {
    return { minX: -0.7, maxX: 0.8, minZ: this.win.z + 0.08, maxZ: this.spots.bed.z + 0.55 };
  }

  /** a finger has the ball; a paw has it pinned */
  get yarnHeld() {
    return !!this.yarn.hold;
  }
  get yarnPinned() {
    return this.yarn.pinned > 0;
  }

  /** how fast the ball is going (m/s) */
  get yarnSpeed() {
    return Math.hypot(this.yarn.v.x, this.yarn.v.z);
  }

  /** the ball rolls, slowing, turning as it goes, glancing off the bed and the things on the floor
   *  and the room's ends (under a finger, after the finger; under a paw, not at all); its strand
   *  trails after it */
  private rollYarn(dt: number) {
    const Y = this.yarn, p = Y.mesh.position, v = Y.v, R = 0.045;
    let ns: number;
    if (Y.pinned > 0) {
      // under the paws: drawn in under them, then still
      Y.pinned = Math.max(0, Y.pinned - dt);
      const to = Y.pinAt ?? p;
      v.set(to.x - p.x, 0, to.z - p.z).multiplyScalar(Math.min(1, dt * 20) / Math.max(dt, 1e-4));
      ns = Math.hypot(v.x, v.z);
      if (Y.pinned <= 0) v.set(0, 0, 0);
      if (ns < 1e-4) return;
    } else if (Y.hold) {
      // quick after the fingertip, but rolling there, never jumping
      v.set((Y.hold.x - p.x) * 12, 0, (Y.hold.z - p.z) * 12);
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
    if (ns > 1e-5) Y.mesh.rotateOnWorldAxis(new THREE.Vector3(v.z, 0, -v.x).normalize(), (ns * dt) / R);
    const S = this.spots;
    const round: [THREE.Vector3, number][] = [[S.bed, 0.21], [S.food, 0.07], [S.water, 0.07], [S.litter, 0.19], ...this.things.filter(([c, r]) => r > 0 && c.distanceTo(this.yarnHome) > 0.01)];
    for (const [c, r] of round) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = r + R;
      if (d < min && d > 1e-5) {
        const nx = dx / d, nz = dz / d;
        p.x = c.x + nx * min;
        p.z = c.z + nz * min;
        const vn = v.x * nx + v.z * nz;
        if (vn < 0) { v.x -= 1.5 * vn * nx; v.z -= 1.5 * vn * nz; }
      }
    }
    const B = this.yarnBounds;
    if (p.x < B.minX || p.x > B.maxX) { p.x = Math.max(B.minX, Math.min(B.maxX, p.x)); v.x *= -0.5; }
    if (p.z < B.minZ || p.z > B.maxZ) { p.z = Math.max(B.minZ, Math.min(B.maxZ, p.z)); v.z *= -0.5; }
    // its shadow on the floor goes with it
    if (Y.occ >= 0) {
      const O = this.lights.uOcc.value as THREE.Vector4[];
      O[2 * Y.occ].set(p.x, R, p.z, R);
      O[2 * Y.occ + 1].set(p.x, R + 0.001, p.z, 0.6);
    }
    if ((Y.rebuild -= dt) <= 0) {
      Y.rebuild = 0.06;
      this.windStrand();
    }
  }

  /** the loose strand: from the ball to its end, which is dragged along once the ball is far */
  private windStrand() {
    const Y = this.yarn, p = Y.mesh.position, t = Y.tail;
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz), L = 0.3;
    if (d > L) { t.x = p.x + (dx / d) * L; t.z = p.z + (dz / d) * L; }
    const ux = (t.x - p.x) / Math.max(d, 1e-4), uz = (t.z - p.z) / Math.max(d, 1e-4);
    const pts = [
      new THREE.Vector3(p.x + ux * 0.04, 0.008, p.z + uz * 0.04),
      new THREE.Vector3(p.x + (t.x - p.x) * 0.4 - uz * 0.03, 0.003, p.z + (t.z - p.z) * 0.4 + ux * 0.03),
      new THREE.Vector3(p.x + (t.x - p.x) * 0.7 + uz * 0.025, 0.003, p.z + (t.z - p.z) * 0.7 - ux * 0.025),
      t.clone(),
    ];
    Y.strand.geometry.dispose();
    Y.strand.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.003, 4);
  }

  /** the candles: lit in the evening and on grey days, their flames trembling, their jars aglow */
  private readonly candles: { body: THREE.ShaderMaterial; flame: THREE.Mesh; seed: number }[] = [];
  private candle(body: THREE.ShaderMaterial, top: THREE.Vector3) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: this.timeU, uOn: { value: 1 }, uCol: { value: new THREE.Color(1, 0.86, 0.5) }, uSeed: { value: Math.random() } },
      vertexShader: SKY_VERT, fragmentShader: BULB_FRAG, transparent: true, blending: THREE.NoBlending,
    });
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 6, 4), m);
    flame.position.copy(top);
    flame.scale.set(1, 2, 1);
    flame.renderOrder = 20;
    this.group.add(flame);
    this.candles.push({ body, flame, seed: Math.random() * 10 });
  }

  /** things put out for a time of the year: shown from a (month, day) to another */
  private readonly decor: { obj: THREE.Object3D; from: [number, number]; to: [number, number] }[] = [];

  /** the jack-o'-lantern's carved face (lit from within when the lamp is) */
  private lantern: THREE.ShaderMaterial | null = null;

  /** the little fir's star (it glows when the lights are lit) */
  private xmasStar: THREE.ShaderMaterial | null = null;

  /** the clock's hands */
  private hourHand: THREE.Mesh | null = null;
  private minHand: THREE.Mesh | null = null;

  /** snow falling past the window now */
  snowing = false;
  /** the radio on the sill (tapping it switches the music on and off), and its dial */
  radio: THREE.Object3D = new THREE.Group();
  private dial!: THREE.ShaderMaterial;
  private notesT = 0;
  private readonly notes: { p: THREE.Vector3; t: number; dx: number }[] = [];

  /** the radio playing or not: its dial lit, and notes rising off it (world points, how bright) */
  setRadio(on: boolean, dt: number) {
    this.dial.uniforms.uGlow.value = on ? 1 : 0;
    if (on && (this.notesT -= dt) <= 0) {
      this.notesT = 1.1 + Math.random() * 0.9;
      const top = this.radio.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * 0.04, 0.05, 0.02));
      this.notes.push({ p: top, t: 0, dx: (Math.random() - 0.5) * 0.03 });
    }
    for (const n of this.notes) {
      n.t += dt;
      n.p.y += 0.022 * dt;
      n.p.x += n.dx * dt + 0.004 * Math.sin(n.t * 3) * dt;
    }
    while (this.notes.length && this.notes[0].t > 3.2) this.notes.shift();
    return this.notes.map((n) => ({ p: n.p, b: Math.min(1, n.t / 0.4, (3.2 - n.t) / 1.0) }));
  }

  /** the pencil on the sill (a cat pushes it off; tapped on the floor, it goes back) */
  pencil: THREE.Object3D = new THREE.Group();
  /** what the pencil is doing: lying on the sill, falling, or lying on the floor; how it moves */
  private readonly pen = {
    state: 'sill' as 'sill' | 'fall' | 'floor', home: new THREE.Vector3(), homeYaw: 0, r: 0.0045, edge: 0,
    vel: new THREE.Vector3(), axis: new THREE.Vector3(1, 0, 0), spin: 0, roll: 0, bounces: 0,
  };
  /** a sound for the pencil: hitting the floor (how hard), or put back on the sill */
  onPencil: ((what: 'hit' | 'back', strength: number) => void) | null = null;

  /** where the pencil is (its middle), and whether it is still lying on the sill */
  pencilWhere() {
    return { at: this.pencil.position.clone(), onSill: this.pen.state === 'sill' };
  }

  /** is the pencil down on the floor */
  get pencilDown() {
    return this.pen.state === 'floor';
  }

  /** a paw pushes the pencil along the sill toward the room; over the edge, off it goes */
  pushPencil(dz: number, dx = 0) {
    const P = this.pen;
    if (P.state !== 'sill') return;
    this.pencil.position.z += dz;
    this.pencil.position.x += dx;
    this.pencil.rotation.y += (Math.random() - 0.5) * 0.15;
    if (this.pencil.position.z < P.edge) return;
    // off the edge: over it and down, turning end over end (nearly straight down: it is a narrow
    // strip of floor between the radiator and the bed)
    P.state = 'fall';
    P.vel.set(dx * 4 + (Math.random() - 0.5) * 0.06, 0.1, 0.03 + Math.random() * 0.04);
    P.axis.set(Math.cos(this.pencil.rotation.y), 0, -Math.sin(this.pencil.rotation.y)).cross(new THREE.Vector3(0, 1, 0)).normalize();
    P.spin = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 5);
    P.bounces = 0;
  }

  /** the pencil back on the sill where it was */
  putPencilBack() {
    const P = this.pen;
    if (P.state === 'sill') return;
    P.state = 'sill';
    this.pencil.position.copy(P.home);
    this.pencil.rotation.set(0, P.homeYaw, 0);
    this.onPencil?.('back', 1);
  }

  /** the pencil falling: down off the sill, a bounce or two on the boards with a click each time,
   *  then it lies flat and rolls a little way on its six sides */
  private movePencil(dt: number) {
    const P = this.pen, pen = this.pencil;
    if (P.state === 'fall') {
      P.vel.y -= 9.8 * dt;
      pen.position.addScaledVector(P.vel, dt);
      pen.rotateOnWorldAxis(P.axis, P.spin * dt);
      if (pen.position.y <= P.r && P.vel.y < 0) {
        const hit = -P.vel.y;
        pen.position.y = P.r;
        this.onPencil?.('hit', Math.min(1, hit / 2.6));
        if (hit > 0.55 && P.bounces < 2) {
          P.bounces++;
          P.vel.y = hit * 0.3;
          P.vel.x *= 0.5;
          P.vel.z *= 0.5;
          P.spin *= 0.45;
        } else {
          // down: flat on the floor along the way it lay, rolling on a little
          const a = new THREE.Vector3(1, 0, 0).applyQuaternion(pen.quaternion);
          pen.rotation.set(0, Math.atan2(-a.z, a.x), 0);
          P.state = 'floor';
          P.roll = 0.03 + Math.hypot(P.vel.x, P.vel.z) * 0.4;
        }
      }
    } else if (P.state === 'floor' && P.roll > 0.002) {
      // (rolling square to its length, slowing quickly on its flat sides)
      const yaw = pen.rotation.y;
      const side = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const step = P.roll * dt;
      pen.position.addScaledVector(side, step);
      pen.rotateOnAxis(new THREE.Vector3(1, 0, 0), step / P.r);
      P.roll = Math.max(0, P.roll - dt * 0.45);
      // (well short of the bed: behind its rim, it would be out of sight)
      const bed = this.spots.bed;
      if (Math.hypot(pen.position.x - bed.x, pen.position.z - bed.z) < 0.32) {
        pen.position.addScaledVector(side, -step);
        P.roll = 0;
      }
    }
  }

  /** the view out of the window (a laser pointed at it goes out into the town), and where the
   *  stack of books with the mug on it stands */
  private skyMesh: THREE.Object3D | null = null;
  readonly books = new THREE.Vector3();
  /** the laser pointer on the sill, and the same one in your hand when it has been taken up */
  pointer: THREE.Object3D = new THREE.Group();
  private held: THREE.Object3D = new THREE.Group();
  readonly laserRay = new THREE.Raycaster();

  /** the feather wand: its cane (from the end in your hand, or lying on the floor, to its tip), the
   *  feathers on the end of the string (where, and where a moment ago: they swing as a weight on a
   *  string does), the string's length; whether a hand has it and where the tip is being taken; a
   *  cat's paws having the feathers (how much longer, where); the bell's last ring */
  private readonly wand = {
    rod: new THREE.Group() as THREE.Object3D, lure: new THREE.Group() as THREE.Object3D,
    held: false, tip: new THREE.Vector3(), tipV: new THREE.Vector3(), aim: new THREE.Vector3(), end: new THREE.Vector3(),
    restTip: new THREE.Vector3(0.17, 0.006, 0.47), restEnd: new THREE.Vector3(0.6, 0.006, 1.15),
    pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), L: 0.27, pinned: 0, pinAt: new THREE.Vector3(),
    ring: 0, slack: 0,
  };
  /** the little bell on the wand: it rings when the feathers are jerked about (how hard) */
  onBell: ((k: number) => void) | null = null;
  /** the feathers pulled out from under a cat's paws */
  onLureFree: (() => void) | null = null;

  /** the end of the wand's cane (in the hand, or on the floor) */
  get wandEnd() {
    return this.wand.end;
  }

  /** the wand, to take hold of (the cane and the feathers) */
  get wandParts(): THREE.Object3D[] {
    return [this.wand.lure, this.wand.rod];
  }

  /** where the feathers are, how fast they are going, whether a hand has the wand, whether a cat's
   *  paws have the feathers */
  lureAt() {
    return this.wand.pos;
  }
  get lureVel() {
    return this.wand.vel;
  }
  get wandHeld() {
    return this.wand.held;
  }
  get lurePinned() {
    return this.wand.pinned > 0;
  }

  /** a hand takes up the wand (true), its end in the hand just below the picture; or lets it fall,
   *  to lie with its end on the floor at a point */
  holdWand(on: boolean, end?: THREE.Vector3) {
    const W = this.wand;
    W.held = on;
    W.tipV.set(0, 0, 0);
    if (on) W.aim.copy(W.tip);
    else if (end) W.end.copy(end).setY(0.006);
  }

  /** where the hand takes the tip of the wand (a point in the room), and where the hand is (the
   *  cane's other end) */
  aimWand(tip: THREE.Vector3, hand: THREE.Vector3) {
    this.wand.aim.copy(tip);
    this.wand.end.copy(hand);
  }

  /** a paw hits the feathers: sent flying a way (m/s) */
  batLure(v: THREE.Vector3) {
    const W = this.wand;
    if (W.pinned > 0) return;
    // (Verlet: a change of velocity is a change of where it was)
    W.prev.addScaledVector(v, -1 / 240);
    // (and the bell rings)
    this.onBell?.(Math.min(1, 0.4 + v.length() / 3));
    W.ring = 0.4;
  }

  /** a cat's paws come down on the feathers: held there a while, at a point, however the string is
   *  pulled (pulled hard, they come free) */
  pinLure(sec: number, at: THREE.Vector3) {
    const W = this.wand;
    W.pinned = Math.max(W.pinned, sec);
    W.pinAt.copy(at);
    W.pinAt.y = Math.max(W.pinAt.y, 0.012);
  }

  /** the cane, the string and the feathers: the tip after the hand (quick, but a cane has some
   *  give), or fallen to the floor; the feathers swinging on the string from it under their own
   *  weight, held back by the air, dragging over the floor, held under a paw */
  private moveWand(dt: number) {
    const W = this.wand;
    const n = 4, h = Math.min(dt, 0.05) / n;
    const was = W.pos.clone();
    for (let k = 0; k < n; k++) {
      if (W.held) {
        // a spring toward where the hand takes it, critically damped
        const w = 26;
        W.tipV.addScaledVector(W.aim.clone().sub(W.tip), w * w * h).multiplyScalar(Math.max(0, 1 - 2 * w * h));
        W.tip.addScaledVector(W.tipV, h);
      } else if (W.tip.y > 0.0061 || W.tipV.lengthSq() > 0) {
        // let go: down it falls, and lies where it lands
        W.tipV.y -= 9.8 * h;
        W.tip.addScaledVector(W.tipV, h);
        if (W.tip.y <= 0.006) { W.tip.y = 0.006; W.tipV.set(0, 0, 0); }
      }
      if (W.pinned > 0) {
        // under its paws: there it stays, unless the string is pulled hard
        W.pos.copy(W.pinAt);
        W.prev.copy(W.pinAt);
        if (W.held && W.tip.distanceTo(W.pinAt) > W.L + 0.16) {
          W.pinned = 0;
          this.onLureFree?.();
          this.onBell?.(0.8);
          W.ring = 0.4;
        }
        continue;
      }
      const g = this.groundAt(W.pos.x, W.pos.z) + 0.012;
      const onFloor = W.pos.y <= g + 0.002;
      // (feathers are mostly air: they fall slowly and the air soon stops them; on the floor they
      // drag)
      const v = W.pos.clone().sub(W.prev);
      // (sent sliding, feathers skid a little way over the boards before they stop)
      v.multiplyScalar(onFloor ? (v.length() / h > 0.4 ? 0.96 : 0.8) : 0.988);
      if (onFloor) v.y = Math.max(0, v.y);
      W.prev.copy(W.pos);
      W.pos.add(v);
      W.pos.y -= 6.5 * h * h;
      // the string: never longer than it is
      const d = W.pos.distanceTo(W.tip);
      W.slack = Math.max(0, W.L - d);
      if (d > W.L) W.pos.sub(W.tip).multiplyScalar(W.L / d).add(W.tip);
      if (W.pos.y < g) W.pos.y = g;
    }
    W.pinned = Math.max(0, W.pinned - dt);
    // how fast the feathers go; a jerk of them rings the bell
    const nv = W.pos.clone().sub(was).divideScalar(Math.max(dt, 1e-3));
    const jerk = nv.distanceTo(W.vel);
    W.vel.copy(nv);
    W.ring = Math.max(W.ring - dt * 3, 0);
    if (jerk > 1.6 && W.ring <= 0) {
      W.ring = 0.5;
      this.onBell?.(Math.min(1, jerk / 5));
    }
    this.placeWand(dt);
  }

  /** the cane from its end to its tip, the feathers hanging from the knot the way the string runs
   *  and trailing the way they go; the string (drawn as a line of single pixels) from the tip */
  private placeWand(_dt: number) {
    const W = this.wand, R = W.rod;
    const along = W.tip.clone().sub(W.end);
    const len = along.length();
    R.position.copy(W.end);
    R.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.divideScalar(Math.max(len, 1e-6)));
    R.scale.set(1, len, 1);
    const down = W.pos.clone().sub(W.tip);
    if (down.lengthSq() < 1e-8) down.set(0, -1, 0);
    down.normalize().addScaledVector(W.vel, -0.12);
    // (lying on the floor, or the bed: flat on it; held under a cat's paws or hugged to it, the
    // same: they do not hang down through the floor)
    if (W.pos.y < 0.016 || (W.pos.y < 0.046 && W.slack > 0.01) || W.pinned > 0) {
      if (Math.hypot(down.x, down.z) < 0.05) down.set(1, 0, 0);
      down.y = Math.min(down.y, -0.05) * 0.2;
    }
    W.lure.position.copy(W.pos);
    W.lure.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), down.normalize());
  }

  /** the string, for the picture: from the tip of the cane to the feathers, and how much it sags */
  stringLine() {
    const W = this.wand;
    return { a: W.tip, b: W.pos, sag: W.slack };
  }

  /** the pointer in your hand (to tap and put down) */
  get heldPointer(): THREE.Object3D {
    return this.held;
  }

  /** where the laser pointer lies on the sill (a tap there puts it back) */
  get pointerHome() {
    return this.pointer.position;
  }

  /** the laser pointer taken up off the sill (true) or put back on it */
  takePointer(up: boolean) {
    this.pointer.visible = !up;
    if (!up) this.held.visible = false;
  }

  /** the pointer in your hand, close in front of the glass, coming in from the bottom right of the
   *  picture: turned toward the dot across the picture (not end on to you, as it truly would be,
   *  aimed into the room: then it would be only a blob), tipped a little into the room (at: where
   *  the dot is; null: off, lowered a little) */
  private readonly aimS = new THREE.Vector2(-0.6, 0.6);
  holdPointer(cam: THREE.PerspectiveCamera, at: THREE.Vector3 | null, dt = 0.016, safe = 0) {
    const H = this.held;
    H.visible = true;
    const D = 1.25, tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const hh = tv * D, hw = hh * cam.aspect;
    // (the hand just below the bottom edge, right of the middle; above whatever of the phone's own
    // the bottom of the screen has, safe: a fraction of the screen's height)
    // (shining, it is mostly down out of the way, only its end showing; not, more of it, to tap)
    this.heldUp += ((at ? 0 : 1) - this.heldUp) * Math.min(1, dt * 8);
    const hx = 0.62 * hw, hy = -hh - 0.05 + 0.028 * this.heldUp + 2 * hh * safe;
    // the way to the dot on the screen, from the hand (in the camera's plane), eased
    let ax = -0.5, ay = 0.75;
    if (at) {
      const q = at.clone().applyMatrix4(cam.matrixWorldInverse);
      const sx = (q.x / -q.z) * D, sy = (q.y / -q.z) * D;
      ax = sx - hx;
      ay = Math.max(0.05 * hh, sy - hy);
    }
    const l = Math.hypot(ax, ay) || 1;
    this.aimS.x += (ax / l - this.aimS.x) * Math.min(1, dt * 14);
    this.aimS.y += (ay / l - this.aimS.y) * Math.min(1, dt * 14);
    const dir = new THREE.Vector3(this.aimS.x, this.aimS.y, -0.55).normalize().transformDirection(cam.matrixWorld);
    const hand = new THREE.Vector3(hx, hy, -D).applyMatrix4(cam.matrixWorld);
    // (its barrel along +x: turned so that +x runs along the beam, the button up toward you)
    H.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    H.position.copy(hand).addScaledVector(dir, 0.038);
    this.heldEye.uniforms.uGlow.value = at ? 1 : 0;
  }
  private heldEye!: THREE.ShaderMaterial;
  private heldUp = 1;

  /** where a laser pointed through a screen point lands: the first thing in the room it meets,
   *  what that is (the floor or the bed, the sill, the books and mug on them, anything else
   *  upright; out: through the window, where no dot shows), and which way it faces */
  laserHit(ndc: THREE.Vector2, cam: THREE.Camera) {
    const R = this.laserRay;
    R.setFromCamera(ndc, cam);
    const hits = R.intersectObject(this.group, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object, seen = true;
      for (; o; o = o.parent) {
        if (!o.visible || o === this.held) { seen = false; break; }
      }
      if (!seen || !(h.object as THREE.Mesh).isMesh) continue;
      const p = h.point.clone();
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      if (n.dot(R.ray.direction) > 0) n.negate();
      const { l, r, b, z } = this.win;
      let on: 'floor' | 'bed' | 'sill' | 'books' | 'up' | 'out' = 'up';
      let mug = false;
      for (let q: THREE.Object3D | null = h.object; q; q = q.parent) if (q === this.cup.mesh) mug = true;
      if (h.object === this.skyMesh) on = 'out';
      else if (Math.hypot(p.x - this.books.x, p.z - this.books.z) < 0.16 && p.y < 0.17 && p.y > 0.004) on = 'books';
      else if (p.y >= b - 0.006 && p.y < b + 0.2 && p.z > z - 0.05 && p.z < z + 0.27 && p.x > l - 0.08 && p.x < r + 0.08) on = 'sill';
      else if (Math.hypot(p.x - this.spots.bed.x, p.z - this.spots.bed.z) < 0.22 && p.y < 0.1) on = 'bed';
      else if (p.y < 0.04 && n.y > 0.5) on = 'floor';
      return { p, n, on, mug };
    }
    return null;
  }

  /** the mug of tea on the books: standing there, going over the edge, falling, in pieces on the
   *  floor (and, swept up, gone a while till there is another); how it moves; its pieces and the
   *  tea spilled, and how they move */
  private readonly cup = {
    state: 'up' as 'up' | 'tip' | 'fall' | 'broken' | 'gone', mesh: new THREE.Group() as THREE.Object3D, home: new THREE.Vector3(),
    tea: null as THREE.Object3D | null, bits: new THREE.Group() as THREE.Object3D, pool: new THREE.Group() as THREE.Object3D,
    t: 0, dir: new THREE.Vector3(1, 0, 0), vel: new THREE.Vector3(), axis: new THREE.Vector3(), spin: 0,
    pieces: [] as { v: THREE.Vector3; spin: number; axis: THREE.Vector3 }[], spill: 0, at: new THREE.Vector3(), back: 0,
  };
  /** the mug: falling over the edge (where), in pieces on the floor (where, how hard) */
  onMug: ((what: 'tip' | 'crash' | 'swept', at: THREE.Vector3, k: number) => void) | null = null;

  /** is there a mug of tea on the books (and steaming) */
  get mugUp() {
    return this.cup.state === 'up';
  }

  /** the pieces on the floor, to tap and sweep up (null: there are none) */
  get mess(): THREE.Object3D | null {
    return this.cup.state === 'broken' ? this.cup.bits : null;
  }

  /** a paw (or a cat landing) knocks the mug on the books, a way: over it goes, now and then
   *  (sure: it was what the cat was after); true if it went */
  knockMug(dir: THREE.Vector3, sure = false) {
    const C = this.cup;
    if (C.state !== 'up' || (!sure && Math.random() < 0.4)) return false;
    C.state = 'tip';
    C.t = 0;
    C.dir.set(dir.x, 0, dir.z).normalize();
    if (C.dir.lengthSq() < 0.5) C.dir.set(1, 0, 0);
    // (the books stand at the front of the room: knocked toward you, it would land out of the
    // picture; it goes over the side instead, the side the push was toward)
    if (C.dir.z > 0.35) {
      C.dir.z = 0.35;
      C.dir.x = (Math.sign(C.dir.x) || 1) * Math.sqrt(1 - 0.35 * 0.35);
    }
    // (over the edge on the far side: it topples about its foot, then falls clear)
    C.axis.set(0, 1, 0).cross(C.dir).normalize();
    this.onMug?.('tip', C.mesh.position.clone(), 1);
    return true;
  }

  /** the pieces swept up (and the tea mopped): gone, and some while after, a fresh cup */
  sweepMug() {
    const C = this.cup;
    if (C.state !== 'broken') return;
    C.state = 'gone';
    C.bits.visible = false;
    C.pool.visible = false;
    C.back = 70 + Math.random() * 50;
    this.onMug?.('swept', C.at.clone(), 1);
  }

  /** the mug going over, falling, breaking; the pieces skittering and settling, the tea spreading */
  private moveMug(dt: number) {
    const C = this.cup, M = C.mesh;
    if (C.state === 'tip') {
      // over about the edge of its foot, sliding the way it was pushed
      C.t += dt;
      const ang = Math.min(1.1, 9 * C.t * C.t);
      M.position.copy(C.home).addScaledVector(C.dir, 0.06 * Math.min(1, C.t / 0.22));
      M.quaternion.setFromAxisAngle(C.axis, ang);
      if (C.t > 0.22) {
        C.state = 'fall';
        C.vel.copy(C.dir).multiplyScalar(0.45).setY(0.05);
        C.spin = 7 + Math.random() * 4;
      }
    } else if (C.state === 'fall') {
      C.vel.y -= 9.8 * dt;
      M.position.addScaledVector(C.vel, dt);
      M.rotateOnWorldAxis(C.axis, C.spin * dt);
      if (M.position.y <= 0.01) {
        // in pieces: they go skittering out from where it hit, the handle among them; the tea
        // spreads out over the boards
        const hit = Math.min(1, -C.vel.y / 1.4);
        C.state = 'broken';
        C.at.set(M.position.x, 0, M.position.z);
        M.visible = false;
        C.bits.visible = true;
        C.bits.position.copy(C.at);
        C.pieces = [];
        C.bits.children.forEach((b, i) => {
          const a = Math.random() * Math.PI * 2;
          const sp = 0.25 + Math.random() * 0.55;
          b.position.set(0, 0.006, 0);
          b.rotation.set(Math.random() * 3, Math.random() * 6, Math.random() * 3);
          const v = new THREE.Vector3(Math.cos(a) * sp + C.dir.x * 0.3, 0, Math.sin(a) * sp + C.dir.z * 0.3);
          C.pieces.push({ v, spin: (Math.random() - 0.5) * 30, axis: new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize() });
          if (i === C.bits.children.length - 1) v.multiplyScalar(0.5);
        });
        C.pool.visible = true;
        C.pool.position.set(C.at.x + C.dir.x * 0.03, 0.0015, C.at.z + C.dir.z * 0.03);
        C.pool.rotation.y = Math.atan2(C.dir.x, C.dir.z);
        C.pool.scale.set(0.005, 1, 0.005);
        C.spill = 0;
        this.onMug?.('crash', C.at.clone(), hit);
      }
    } else if (C.state === 'broken') {
      // the pieces slide and spin to a stop on the boards; the tea runs out to its edges
      C.bits.children.forEach((b, i) => {
        const P = C.pieces[i];
        if (!P) return;
        const sp = P.v.length();
        if (sp > 0.001) {
          b.position.addScaledVector(P.v, dt);
          P.v.multiplyScalar(Math.max(0, sp - 2.6 * dt) / sp);
          b.rotateOnWorldAxis(P.axis, P.spin * dt * Math.min(1, sp * 3));
        }
        // (lying on the floor, whichever way up)
        b.position.y = 0.006;
      });
      C.spill = Math.min(1, C.spill + dt / 1.6);
      const r = 0.075 * Math.sqrt(1 - (1 - C.spill) * (1 - C.spill));
      C.pool.scale.set(Math.max(0.005, r), 1, Math.max(0.005, r));
    } else if (C.state === 'gone') {
      if ((C.back -= dt) <= 0) {
        // a fresh cup of tea on the books
        C.state = 'up';
        M.visible = true;
        M.position.copy(C.home);
        M.quaternion.identity();
      }
    }
  }

  /** the little print on the sill (tapping it shows the credits) */
  print: THREE.Object3D = new THREE.Group();
  /** where the mug's steam rises from */
  mugTop = new THREE.Vector3();
  private readonly nightU = { value: 0 };

  private mat(name: Material, o: { pattern?: number; tone?: number; rug?: THREE.Vector3; wallZ?: number } = {}) {
    const L = this.lights;
    const shared: Record<string, { value: unknown }> = {};
    for (const k of ['uKeyDir', 'uLampPos', 'uLampInt', 'uShadowMap', 'uShadowMatrix', 'uShadowOn', 'uShadowSoft', 'uCaps',
      'uSun', 'uWin', 'uWinBar', 'uWinZ', 'uSkyI', 'uPatch', 'uAmb', 'uFloorB', 'uFill', 'uFairy', 'uFairyInt', 'uOcc']) shared[k] = L[k];
    const m = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uMat: { value: PIX[name] }, uPattern: { value: o.pattern ?? 0 }, uGlow: { value: 0 }, uTone: { value: o.tone ?? 0 },
        uSpec: { value: 0 },
        uRug: { value: o.rug ?? new THREE.Vector3() }, uWallZ: { value: o.wallZ ?? -10 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
    this.mats.push(m);
    return m;
  }

  /** a sparrow that comes down on the ledge outside now and then by day: flies in, hops about and
   *  pecks a while, and is off again (at once, if a cat comes up to the glass). Where along the
   *  ledge and how high (window pixels), which way it faces, what it is doing */
  private readonly visitor = { phase: 'none' as 'none' | 'in' | 'on' | 'out', t: 0, x: 0, y: 0, dir: 1, pose: 0, stay: 0, next: 0, act: 0, to: 0 };
  private visitorIn = 90 + Math.random() * 200;
  /** may a bird come down now (no cat up at the glass) */
  visitorOk = true;
  /** a bird has come down on the ledge */
  onVisitor: (() => void) | null = null;

  /** a sparrow coming down on the ledge now */
  visitorNow() {
    const V = this.visitor, W = (this.sky.uniforms.uSkyPx.value as THREE.Vector2).x;
    V.phase = 'in';
    V.t = 0;
    V.dir = Math.random() < 0.5 ? 1 : -1;
    // (where the sill's things leave the ledge in view, either side of the middle bar)
    V.to = W * (Math.random() < 0.5 ? 0.37 + 0.09 * Math.random() : 0.55 + 0.1 * Math.random());
    V.x = V.to - V.dir * 40;
    V.y = 26;
  }

  /** the bird is off, now */
  scareVisitor() {
    const V = this.visitor;
    if (V.phase === 'in' || V.phase === 'on') {
      V.phase = 'out';
      V.t = 0;
      if (Math.random() < 0.5) V.dir = -V.dir;
    }
  }

  /** where the bird on the ledge is, on the glass (null: none there) */
  visitorAt(): THREE.Vector3 | null {
    const V = this.visitor;
    if (V.phase !== 'on') return null;
    const px = this.sky.uniforms.uSkyPx.value as THREE.Vector2, { l, r, b, t, z } = this.win;
    return new THREE.Vector3(l + (V.x / px.x) * (r - l), b + ((V.y + 4) / px.y) * (t - b), z - 0.02);
  }

  private updateVisitor(dt: number, may: boolean) {
    const V = this.visitor, W = (this.sky.uniforms.uSkyPx.value as THREE.Vector2).x;
    const flap = () => (Math.floor(V.t * 14) % 2 ? 3 : 4);
    if (V.phase === 'none') {
      if (may && this.visitorOk && (this.visitorIn -= dt) <= 0) this.visitorNow();
    } else if (V.phase === 'in') {
      // down on a slant to the ledge, wings going, the last of it a glide
      V.t += dt;
      const u = Math.min(1, V.t / 1.3);
      V.x = V.to - V.dir * 40 * (1 - u);
      V.y = 26 * (1 - u) * (1 - u);
      V.pose = u < 0.85 ? flap() : 0;
      if (u >= 1) {
        V.phase = 'on';
        V.t = 0;
        V.stay = 9 + Math.random() * 16;
        V.next = 0.6 + Math.random();
        V.act = 0;
        this.onVisitor?.();
      }
    } else if (V.phase === 'on') {
      V.t += dt;
      V.y = 0;
      // now a hop or two along the ledge, now a peck at it, now a turn round
      if (V.act > 0) {
        V.act -= dt;
        if (V.act <= 0) V.pose = 0;
      } else if ((V.next -= dt) <= 0) {
        V.next = 0.6 + Math.random() * 1.8;
        const r = Math.random();
        const lo = W * 0.36, hi = W * 0.66, mid = W * 0.5;
        if (r < 0.35) {
          // a hop (not over the middle bar, nor out of view)
          const nx = V.x + V.dir * (2 + Math.floor(Math.random() * 2));
          if (nx > lo && nx < hi && Math.abs(nx - mid) > 3 && Math.sign(nx - mid) === Math.sign(V.x - mid)) { V.x = nx; V.pose = 2; V.act = 0.12; }
          else V.dir = -V.dir;
        } else if (r < 0.75) { V.pose = 1; V.act = 0.22; if (Math.random() < 0.5) V.next = 0.3; }
        else if (r < 0.9) V.dir = -V.dir;
      }
      if (V.pose === 2) V.y = 1;
      if (V.t > V.stay || !may || !this.visitorOk) this.scareVisitor();
    } else {
      // off: up and away, wings going
      V.t += dt;
      V.x += V.dir * 45 * dt;
      V.y += 30 * dt;
      V.pose = flap();
      if (V.x < -8 || V.x > W + 8 || V.y > 60) {
        V.phase = 'none';
        this.visitorIn = 150 + Math.random() * 360;
      }
    }
    (this.sky.uniforms.uVisitor.value as THREE.Vector4).set(V.x, V.y, V.pose, V.phase === 'none' ? 0 : V.dir);
  }

  /** a shooting star on a clear night now and then: where, how long ago, which way; and someone to
   *  tell (the cat looks up) */
  private readonly meteor = { t: -1, x: 0, y: 0, dir: 1 };
  private meteorIn = 60 + Math.random() * 240;
  onMeteor: (() => void) | null = null;

  /** a shooting star now */
  meteorNow() {
    const M = this.meteor;
    M.t = 0;
    M.dir = Math.random() < 0.5 ? -1 : 1;
    // (below the fairy lights, and clear of the moon high on the left)
    M.x = M.dir > 0 ? 0.5 + 0.2 * Math.random() : 0.75 + 0.2 * Math.random();
    M.y = 0.62 + 0.18 * Math.random();
    this.meteorIn = 90 + Math.random() * 420;
    this.onMeteor?.();
  }

  /** a thunderstorm: lightning now and then, and after each flash (the further off it struck, the
   *  later and the softer) its thunder */
  private readonly storm = { next: 6, t: 9, peak: 0, bolt: false, x: 0.5, seed: 0 };
  private readonly thunderQ: { at: number; loud: number }[] = [];
  /** thunder arriving now, how loud (0 .. 1) */
  onThunder: ((loud: number) => void) | null = null;
  /** a storm (0 .. 1) whatever the weather (the lab, tests) */
  stormOverride: number | null = null;

  /** a flash of lightning now: how far off (0 near .. 1 far) */
  flashNow(far = Math.random()) {
    const S = this.storm;
    S.next = 10 + Math.random() * 35;
    S.t = 0;
    S.peak = 0.45 + 0.55 * (1 - far);
    S.bolt = far < 0.65 && Math.random() < 0.7;
    S.x = 0.15 + 0.7 * Math.random();
    S.seed = Math.random() * 100;
    this.thunderQ.push({ at: this.time + 1 + 6 * far + Math.random(), loud: 1 - 0.75 * far });
  }

  /** how bright the lightning is now (0 .. 1), and thunder heard when it is due */
  private lightning(dt: number, storm: number) {
    const S = this.storm;
    if (storm > 0.05 && (S.next -= dt * storm) <= 0) this.flashNow();
    S.t += dt;
    // a stroke, a flicker, a second stroke, and it dies away
    const t = S.t;
    const b = t < 0.07 ? 1 : t < 0.13 ? 0.2 : t < 0.2 ? 0.85 : t < 0.7 ? 0.85 * Math.exp(-(t - 0.2) * 9) : 0;
    for (let i = this.thunderQ.length - 1; i >= 0; i--) {
      if (this.time < this.thunderQ[i].at) continue;
      const q = this.thunderQ.splice(i, 1)[0];
      this.onThunder?.(q.loud);
    }
    return S.peak * b;
  }

  /** the heating is on: from late October to early April */
  heating = false;

  /** a warm place on the floor by the radiator while the heating is on: the middle of the body
   *  there, and which way to face, lying along it */
  warmSpot(): { at: THREE.Vector3; face: number } | null {
    if (!this.heating) return null;
    const { l, r, z } = this.win;
    return { at: new THREE.Vector3((l + r) / 2 + 0.1, 0, z + 0.25), face: -Math.PI / 2 };
  }

  /** is a point on the floor in the patch of sun (the window's opening, carried along the light) */
  sunlit(p: THREE.Vector3) {
    const L = this.lights;
    const P = L.uPatch.value as THREE.Vector4;
    const K = L.uKeyDir.value as THREE.Vector3;
    if (P.w <= 0.04 || K.y < 0.1 || K.z > -0.05) return false;
    const { l, r, b, t, z } = this.win;
    const s = (z - p.z) / K.z;
    const x = p.x + K.x * s, y = K.y * s;
    return x > l + 0.03 && x < r - 0.03 && y > b + 0.03 && y < t - 0.03;
  }

  /** is a circle on the floor clear of the bed, the bowls, the litter tray and the room's things */
  floorClear(p: THREE.Vector3, r: number) {
    const S = this.spots;
    const things: [THREE.Vector3, number][] = [[S.bed, 0.21], [S.food, 0.07], [S.water, 0.07], [S.litter, 0.19], ...this.things.filter(([, rr]) => rr > 0)];
    return !things.some(([c, rr]) => Math.hypot(p.x - c.x, p.z - c.z) < rr + r);
  }

  /** what a cat running about has to go round (not the bed: that it runs over; not the ball of
   *  wool, which it sends flying) */
  private inTheWay(): [THREE.Vector3, number][] {
    const S = this.spots;
    return [[S.food, 0.07], [S.water, 0.07], [S.litter, 0.19], ...this.things.filter(([c, r]) => r > 0 && c !== this.yarnHome)];
  }

  /** a point on the floor (for the middle of a cat r across) moved out of the room's things and
   *  in from the walls: off the radiator, the plant, the books, the bowls (changed in place) */
  keepClear(p: THREE.Vector3, r: number) {
    const B = this.yarnBounds, w = this.win;
    const bounds = () => {
      p.x = Math.max(B.minX + 0.08, Math.min(B.maxX - 0.08, p.x));
      // (in front of the radiator under the window, further out from the wall)
      const back = w.z + (Math.abs(p.x - (w.l + w.r) / 2) < 0.3 ? 0.31 : 0.2);
      p.z = Math.max(back, Math.min(B.maxZ - 0.05, p.z));
    };
    for (let k = 0; k < 3; k++) {
      bounds();
      for (const [c, R] of this.inTheWay()) {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
        if (d >= R + r) continue;
        const ux = d > 1e-4 ? dx / d : 0, uz = d > 1e-4 ? dz / d : 1;
        p.x = c.x + ux * (R + r);
        p.z = c.z + uz * (R + r);
      }
    }
    bounds();
    return p;
  }

  /** on the way from one point to another, a point to go by round whatever is in the way (null:
   *  nothing is), on the side the way passes it, for a cat r across */
  detour(from: THREE.Vector3, to: THREE.Vector3, r: number): THREE.Vector3 | null {
    const ax = to.x - from.x, az = to.z - from.z, len2 = ax * ax + az * az;
    if (len2 < 1e-6) return null;
    let best: THREE.Vector3 | null = null, bestU = 2;
    for (const [c, R] of this.inTheWay()) {
      const u = ((c.x - from.x) * ax + (c.z - from.z) * az) / len2;
      if (u <= 0.02 || u >= 0.98) continue;
      const qx = from.x + ax * u, qz = from.z + az * u;
      const d = Math.hypot(qx - c.x, qz - c.z);
      if (d >= R + r || u >= bestU) continue;
      // (out to the side the way already passes it, a little wider than it)
      const len = Math.sqrt(len2);
      let nx = -az / len, nz = ax / len;
      if ((qx - c.x) * nx + (qz - c.z) * nz < 0) { nx = -nx; nz = -nz; }
      best = this.keepClear(new THREE.Vector3(c.x + nx * (R + r + 0.05), 0, c.z + nz * (R + r + 0.05)), r * 0.6);
      bestU = u;
    }
    return best;
  }

  /** a warm place on the floor in the sun, clear of the bed and the room's things, if the sun is
   *  in: points of the window's opening carried along the light down to the floor */
  sunSpot(): THREE.Vector3 | null {
    const L = this.lights;
    const P = L.uPatch.value as THREE.Vector4;
    const K = L.uKeyDir.value as THREE.Vector3;
    if (P.w <= 0.04 || K.y < 0.1) return null;
    const { l, r, b, t, z } = this.win;
    const S = this.spots;
    // (a cat lying down takes a circle about a quarter of a metre round the middle of its body)
    const things: [THREE.Vector3, number][] = [[S.bed, 0.21], [S.food, 0.07], [S.water, 0.07], [S.litter, 0.19], ...this.things.filter(([, r]) => r > 0)];
    const clear = things.map(([c, rr]): [THREE.Vector3, number] => [c, rr + 0.19]);
    const ok: THREE.Vector3[] = [];
    // (well inside the opening: a spot the sun only just reaches is one it is about to leave, and
    // one sunlit() would not count as in the sun, so that the cat would be up again at once)
    const m = 0.06;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
      const w = new THREE.Vector3(l + m + (r - l - 2 * m) * (i + 0.5) / 12, b + m + (t - b - 2 * m) * (j + 0.5) / 12, z);
      const f = w.clone().addScaledVector(K, -w.y / K.y);
      f.y = 0;
      if (f.x < -0.62 || f.x > 0.62 || f.z < z + 0.3 || f.z > S.bed.z + 0.3) continue;
      if (clear.some(([c, d]) => Math.hypot(f.x - c.x, f.z - c.z) < d)) continue;
      // nor where something standing nearer you would hide it (the books with the mug on them)
      if (this.hides.some(([c, d]) => c.z > f.z && c.z - f.z < 0.32 && Math.abs(c.x - f.x) < d + 0.2)) continue;
      ok.push(f);
    }
    if (!ok.length) return null;
    return ok[Math.floor(Math.random() * ok.length)];
  }

  /** things standing on the floor a cat lying down keeps clear of: where, and how big */
  private readonly things: [THREE.Vector3, number][] = [];
  /** ... and those tall enough to hide a cat lying behind them */
  private readonly hides: [THREE.Vector3, number][] = [];
  /** where the ball of wool was left (it is among the things on the floor) */
  private readonly yarnHome = new THREE.Vector3();

  /** what the floor is at a point, for the sound of a paw on it: the bed, the rug, or the boards */
  surfaceAt(x: number, z: number): 'bed' | 'rug' | 'boards' {
    const b = this.spots.bed;
    if (Math.hypot(x - b.x, z - b.z) < 0.21) return 'bed';
    return Math.hypot(x - b.x, z - (b.z - 0.02)) < 0.44 ? 'rug' : 'boards';
  }

  /** how high the floor is at a point: the bed's cushion and its soft rim, the lamp's domed foot
   *  (paws stand on them) */
  groundAt(x: number, z: number) {
    const L = this.lampSway.home, rl = Math.hypot(x - L.x, z - L.z);
    if (rl < 0.083) return rl < 0.08 ? 0.004 + 0.0256 * Math.sqrt(1 - (rl / 0.08) ** 2) : 0.006;
    // inside the box: its cardboard floor
    const B = this.box;
    if (B && B.here) {
      const dx = x - B.center.x, dz = z - B.center.z, c = Math.cos(B.yaw), s = Math.sin(B.yaw);
      if (Math.abs(dx * c - dz * s) < B.w / 2 && Math.abs(dx * s + dz * c) < B.d / 2) return 0.006;
    }
    const b = this.spots.bed;
    const r = Math.hypot(x - b.x, z - b.z);
    let y = r < 0.15 ? 0.03 : 0;
    const u = Math.abs(r - 0.172) / 0.04;
    if (u < 1) y = Math.max(y, 0.03 + 0.03 * Math.sqrt(1 - u * u));
    return y;
  }

  /** a moth round the lit lamp by night; a fly about the window by day in the warm months: what
   *  it is, where, where it is making for, how long it has been about and will be, how long yet it
   *  rests where it has landed, and whether it is on its way out */
  private bug: {
    kind: 'moth' | 'fly'; p: THREE.Vector3; v: THREE.Vector3; aim: THREE.Vector3; t: number; life: number;
    rest: number; land: boolean; turn: number; leaving: boolean;
  } | null = null;
  private bugIn = 60 + Math.random() * 180;

  /** one drop running down the glass at a point on it (null: none), the one a cat is after */
  setDrop(p: THREE.Vector3 | null) {
    const u = this.sky.uniforms.uDrop.value as THREE.Vector3;
    if (!p) { u.set(0, 0, 0); return; }
    const { l, r, b, t } = this.win, px = this.sky.uniforms.uSkyPx.value as THREE.Vector2;
    u.set(((p.x - l) / (r - l)) * px.x, ((p.y - b) / (t - b)) * px.y, 1);
  }

  /** the box out (true) or put away (false) whatever the day (the lab, tests) */
  boxOverride: boolean | null = null;

  /** a rainbow now (the lab, tests), whatever the weather was */
  rainbowOverride: number | null = null;

  /** the moon's phase (0 new .. 0.5 full) and how cloudy it is (0 .. 1), whatever the date (the
   *  lab, tests) */
  moonOverride: number | null = null;
  cloudOverride: number | null = null;
  /** a morning mist (0 .. 1), whatever the date (the lab, tests) */
  fogOverride: number | null = null;

  /** the middle of the window (where the world outside is heard from) */
  get windowMiddle() {
    const { l, r, b, t, z } = this.win;
    return new THREE.Vector3((l + r) / 2, (b + t) / 2, z);
  }

  /** where on the glass the shooting star is now (or last was) */
  get meteorAt() {
    const { l, r, b, t, z } = this.win, M = this.meteor;
    return new THREE.Vector3(l + (r - l) * (M.x + 0.25 * M.dir), b + (t - b) * (M.y - 0.15), z);
  }

  /** the insect about the room, if there is one */
  bugAt() {
    return this.bug ? { p: this.bug.p, kind: this.bug.kind, resting: this.bug.rest > 0 } : null;
  }

  /** something swiped at it: off it goes, quick, away from there and up */
  scareBug(from: THREE.Vector3) {
    const B = this.bug;
    if (!B) return;
    B.rest = 0;
    const d = B.p.clone().sub(from).setY(0);
    if (d.lengthSq() < 1e-6) d.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    d.normalize();
    B.v.set(d.x * 1.1, 0.9, d.z * 1.1);
    B.aim.copy(B.p).addScaledVector(d, 0.4).setY(Math.min(1.25, B.p.y + 0.35));
    B.land = false;
    B.turn = 0.6;
  }

  /** let one in now (the lab, tests, reels) */
  letBugIn(kind: 'moth' | 'fly') {
    const { l, r, t, z } = this.win;
    this.bug = {
      kind, p: new THREE.Vector3(l + Math.random() * (r - l), t - 0.06, z + 0.04), v: new THREE.Vector3(), aim: new THREE.Vector3(),
      t: 0, life: 50 + Math.random() * 90, rest: 0, land: false, turn: 0, leaving: false,
    };
    this.bug.aim.copy(this.bug.p);
  }

  /** the moth or fly about its business: now and then one comes in at the window (a moth only while
   *  the lamp is lit, a fly by day in the warm months), stays a while and goes */
  private flyBug(dt: number, lamp: boolean, day: number, month: number, rain: number) {
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    if (!this.bug) {
      if ((this.bugIn -= dt) > 0) return;
      this.bugIn = rnd(150, 420);
      if (lamp && month >= 2 && month <= 10) this.letBugIn('moth');
      else if (!lamp && day > 0.6 && rain < 0.3 && month >= 4 && month <= 8) this.letBugIn('fly');
      return;
    }
    const B = this.bug, p = B.p, v = B.v;
    B.t += dt;
    const { l, r, b, t, z } = this.win;
    if (!B.leaving && (B.t > B.life || (B.kind === 'moth' && !lamp))) {
      // out the way it came: up to the top of the window
      B.leaving = true;
      B.rest = 0;
      B.aim.set(rnd(l, r), t + 0.3, z + 0.02);
    }
    if (B.rest > 0) {
      B.rest -= dt;
      v.set(0, 0, 0);
      return;
    }
    let speed: number, steer: number, jitter: number;
    if (B.kind === 'moth' && !B.leaving) {
      // round and round the lamp's shade, close in and bumping it, now and then out a little way
      // (a little toward the room's middle, where the light falls)
      const L = this.lampPos;
      const a = B.t * 2.3 + Math.sin(B.t * 0.9) * 1.5;
      const rad = 0.16 + 0.06 * Math.sin(B.t * 0.7) + 0.16 * Math.max(0, Math.sin(B.t * 0.23)) ** 6;
      B.aim.set(L.x + 0.09 + Math.cos(a) * rad * 1.3, L.y + 0.02 + 0.08 * Math.sin(B.t * 1.3) + 0.04 * Math.sin(B.t * 3.1), L.z + 0.05 + Math.sin(a) * rad);
      speed = 0.55; steer = 7; jitter = 2.2;
    } else {
      // a fly: quick straight darts with sudden turns; now and then it lands on the sill, the wall
      // or the glass, and sits there rubbing its legs
      if (!B.leaving && ((B.turn -= dt) <= 0 || p.distanceTo(B.aim) < 0.025)) {
        if (B.land && p.distanceTo(B.aim) < 0.03) {
          B.rest = rnd(1.5, 5);
          B.land = false;
          B.turn = 0;
          return;
        }
        B.turn = rnd(0.25, 0.9);
        B.land = Math.random() < 0.3;
        if (B.land) {
          const where = Math.random();
          if (where < 0.45) B.aim.set(rnd(l + 0.05, r - 0.05), b + 0.006, z + rnd(0.04, 0.18));         // the sill
          else if (where < 0.8) B.aim.set(rnd(l + 0.03, r - 0.03), rnd(b + 0.1, t - 0.08), z - 0.045); // the glass
          else B.aim.set(rnd(l - 0.3, l - 0.08) * (Math.random() < 0.5 ? 1 : -1), rnd(0.45, 1.1), z + 0.006);   // the wall
          B.turn = 3;
        } else B.aim.set(rnd(l - 0.15, r + 0.15), rnd(0.3, 1.15), z + rnd(0.05, 0.6));
      }
      speed = B.leaving ? 0.7 : 0.75; steer = 9; jitter = 1.2;
    }
    const want = B.aim.clone().sub(p);
    const dist = want.length();
    want.multiplyScalar(Math.min(1, dist / 0.05) * speed / Math.max(dist, 1e-4));
    v.lerp(want, Math.min(1, dt * steer));
    v.x += (Math.random() - 0.5) * jitter * dt;
    v.y += (Math.random() - 0.5) * jitter * dt;
    v.z += (Math.random() - 0.5) * jitter * dt;
    p.addScaledVector(v, dt);
    // never through the floor, the wall or the glass
    p.y = Math.max(0.03, p.y);
    p.z = Math.max(p.z, (p.x > l && p.x < r && p.y > b && p.y < t) ? z - 0.05 : z + 0.004);
    if (B.leaving && (p.y > t + 0.25 || Math.abs(p.x) > 1.2)) this.bug = null;
  }

  /** dust motes drifting in the sunbeam (world points and how bright each is) */
  dust(dt: number, day: number) {
    const K = this.lights.uKeyDir.value as THREE.Vector3;
    const { l, r, b, t, z } = this.win;
    while (this.motes.length < 14) this.motes.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), b: 0, life: 0 });
    for (const m of this.motes) {
      m.life -= dt;
      if (m.life <= 0) {
        // somewhere in the beam: a point of the opening, carried a way along the light
        const w = new THREE.Vector3(l + Math.random() * (r - l), b + Math.random() * (t - b), z);
        m.p.copy(w).addScaledVector(K, -Math.random() * (w.y / K.y) * 0.85);
        m.v.set((Math.random() - 0.5) * 0.01, (Math.random() - 0.3) * 0.008, (Math.random() - 0.5) * 0.01);
        m.life = 4 + Math.random() * 6;
      }
      m.v.x += (Math.random() - 0.5) * 0.004 * dt;
      m.v.y += (Math.random() - 0.5) * 0.004 * dt;
      m.p.addScaledVector(m.v, dt);
      // bright while it turns in the light, fading in and out
      const fade = Math.min(1, m.life / 1.5, (10 - m.life) / 1.5);
      m.b = day * Math.max(0, fade) * (0.4 + 0.6 * Math.abs(Math.sin(this.time * 0.9 + m.p.x * 40)));
    }
    return this.motes;
  }

  /** the size of an art pixel at the window (metres), so the sky is drawn in whole art pixels */
  setPixel(px: number) {
    this.sky.uniforms.uSkyPx.value.set(0.68 / px, 0.8 / px);
    this.sky.uniforms.uPxSize.value = px;
  }

  /** where you look from (the camera's x): the town and the sky outside slide against the window,
   *  the far off more than the near */
  setView(x: number) {
    this.sky.uniforms.uPar.value = x - (this.win.l + this.win.r) / 2;
  }

  /** how dark it is outside at an hour (0 day .. 1 night): light in the sky from before the sun
   *  is up until a while after it has set (the sky in the window follows the same hours) */
  static dark(hour: number) {
    return 1 - skyDay(hour);
  }

  private readonly light = dayLight(12);

  /** the bowls and box as the cat's state has them; the light and the sky by the hour (and that
   *  light, for the pixel pass's colours) */
  update(s: CatState, hour = 12, dt = 0, rain = 0, date: Date = new Date()): DayLight {
    const fog = this.fogOverride ?? fogAt(date, rain);
    const d = dayLight(hour, this.light, rain, moonLit(date), fog);
    this.sky.uniforms.uFog.value = fog;
    this.sky.uniforms.uRain.value = rain;
    this.sky.uniforms.uMoon.value = this.moonOverride ?? moonPhase(date);
    this.sky.uniforms.uCloud.value = this.cloudOverride ?? cloudAt(date, rain);
    // the year outside: the tree's leaves, snow; and what is put out for the time of year
    const md = date.getMonth() * 100 + date.getDate();
    this.heating = md >= 925 || md <= 310;
    {
      const dayN = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
      const B = this.box;
      B.here = this.boxOverride ?? Math.floor(dayN / 3) % 2 === 0;
      B.group.visible = B.here;
      B.thing[1] = B.here ? 0.22 : 0;
    }
    for (const d of this.decor) d.obj.visible = md >= d.from[0] * 100 + d.from[1] && md <= d.to[0] * 100 + d.to[1];
    if (this.xmasStar) this.xmasStar.uniforms.uGlow.value = 1;
    const se = seasonAt(date, rain);
    const su = this.sky.uniforms;
    (su.uLeafA.value as THREE.Vector3).set(...se.leafA);
    (su.uLeafB.value as THREE.Vector3).set(...se.leafB);
    (su.uLeafC.value as THREE.Vector3).set(...se.leafC);
    (su.uLeafs.value as THREE.Vector2).set(se.full, se.other);
    su.uSnowing.value = se.snowing ? 1 : 0;
    this.snowing = se.snowing && rain > 0.15;
    (su.uFall.value as THREE.Vector2).set(se.falling * (1 - rain), se.petals ? 1 : 0);
    // a rainbow for a while after rain stops by day (not in winter's snow)
    const before = rainAt(new Date(date.getTime() - 30 * 60e3));
    const sunny = ss(7.5, 8.5, hour) * (1 - ss(17.0, 18.0, hour));
    su.uRainbow.value = this.rainbowOverride ?? Math.max(0, Math.min(1, before * 1.5 - rain * 3)) * sunny * (se.snowing ? 0 : 1);
    su.uSnowLie.value = se.winter;
    this.time += dt;
    this.movePencil(dt);
    this.moveMug(dt);
    this.moveWand(dt);
    this.timeU.value = this.time;
    const flash = this.lightning(dt, this.stormOverride ?? stormAt(date, rain));
    su.uFlash.value = flash;
    // (a clear dark night: no rain, not overcast)
    const M = this.meteor;
    if (Room.dark(hour) > 0.85 && rain < 0.3 && (su.uCloud.value as number) < 0.75 && (this.meteorIn -= dt) <= 0) this.meteorNow();
    if (M.t >= 0) M.t = M.t > 1 ? -1 : M.t + dt;
    (su.uMeteor.value as THREE.Vector4).set(M.x, M.y, M.t, M.dir);
    // (birds come down by day, when it is dry and not snowing)
    this.updateVisitor(dt, hour > 7 && hour < 17.5 && rain < 0.1 && !se.snowing);
    (su.uBolt.value as THREE.Vector3).set(this.storm.x, this.storm.seed, this.storm.bolt && flash > 0.2 ? 1 : 0);
    // the air in the room just stirs the monstera's leaves, now one, now another, slowly
    // (knocked, they shake, quickly at first, and settle)
    const sh = this.plantShake;
    this.plantShake *= Math.exp(-dt * 2.2);
    for (const L of this.leaves) {
      const t = this.time * 0.45 + L.seed;
      const w = Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.7) * 0.4;
      L.leaf.rotation.x = L.x + 0.025 * w + 0.14 * sh * Math.sin(this.time * 13 + L.seed * 5);
      L.leaf.rotation.z = L.z + 0.018 * Math.sin(t * 0.8 + 2.1) + 0.1 * sh * Math.sin(this.time * 11 + L.seed * 3);
    }
    // the lamp rocking on its foot, settling; its light goes with it
    {
      const S = this.lampSway, h = Math.min(dt, 0.05);
      S.vx += (-30 * S.ax - 1.6 * S.vx) * h;
      S.vz += (-30 * S.az - 1.6 * S.vz) * h;
      S.ax += S.vx * h;
      S.az += S.vz * h;
      S.group.rotation.set(S.ax, 0, S.az);
      this.lampPos.set(S.home.x - Math.sin(S.az) * S.home.y, S.home.y, S.home.z + Math.sin(S.ax) * S.home.y);
    }
    // the curtains: the air hardly stirs them; brushed, they swing out and back, and settle
    for (const C of this.curtains) {
      C.v += (-26 * C.a - 2.6 * C.v) * Math.min(dt, 0.05);
      C.a += C.v * Math.min(dt, 0.05);
      C.mesh.rotation.x = C.a + 0.006 * Math.sin(this.time * 0.37 + C.seed);
    }
    this.rollYarn(dt);
    this.flyBug(dt, d.lamp > 0.5, 1 - Room.dark(hour), date.getMonth(), rain);
    this.sky.uniforms.uTime.value = this.time;
    this.sky.uniforms.uHour.value = hour;
    // the clock on the wall keeps the room's time
    if (this.hourHand && this.minHand) {
      this.hourHand.rotation.z = -((hour % 12) / 12) * Math.PI * 2;
      this.minHand.rotation.z = -(hour % 1) * Math.PI * 2;
    }
    const L = this.lights;
    (L.uKeyDir.value as THREE.Vector3).copy(d.keyDir);
    (L.uLampPos.value as THREE.Vector3).copy(this.lampPos);
    L.uLampInt.value = d.lamp;
    L.uDay.value = 1 - Room.dark(hour);
    L.uSun.value = d.sun;
    // (lightning floods the room with the sky's light a moment)
    L.uSkyI.value = d.sky + 2.6 * flash;
    L.uAmb.value = d.amb;
    L.uFloorB.value = d.floorB;
    (L.uFill.value as THREE.Vector4).w = d.fill;
    L.uFairyInt.value = d.fairy;
    // where the sun through the window lies on the floor: its middle, its size, how bright
    const K = d.keyDir;
    const { l, r, b, t, z } = this.win;
    const P = L.uPatch.value as THREE.Vector4;
    if (d.sun > 0 && K.y > 0.03 && K.z < -0.03) {
      const cy = (b + t) / 2;
      P.set((l + r) / 2 - (K.x * cy) / K.y, z - (K.z * cy) / K.y, Math.min(1.5, ((r - l) * (t - b) * -K.z) / K.y), d.sun * 0.45 * K.y);
    } else P.set(0, 0, 0, 0);
    // the lamp's shade glows when it is lit; the fairy lights and the candles come on with it
    this.shade.uniforms.uGlow.value = d.lamp > 0.5 ? 2 : 0;
    if (this.lantern) this.lantern.uniforms.uGlow.value = d.lamp > 0.5 ? 1 : 0;
    for (const c of this.candles) {
      const lit = d.lamp > 0.5;
      c.flame.visible = lit;
      c.body.uniforms.uGlow.value = lit ? 1 : 0;
      const f = Math.sin(this.time * 9 + c.seed) * 0.5 + Math.sin(this.time * 23 + c.seed * 3) * 0.3;
      c.flame.scale.set(1 + 0.15 * f, 2 + 0.5 * f, 1);
    }
    this.nightU.value = d.fairy > 0.2 ? 1 : 0;
    const f = Math.max(0, Math.min(1, s.food));
    this.kibble.visible = f > 0.02;
    this.kibble.scale.set(0.55 + 0.45 * Math.sqrt(f), 0.15 + 0.85 * f, 0.55 + 0.45 * Math.sqrt(f));
    const w = Math.max(0, Math.min(1, s.water));
    this.water.visible = w > 0.02;
    this.water.position.y = 0.012 + 0.024 * w;
    this.water.scale.setScalar(0.85 + 0.15 * w);
    this.clumps.count = Math.round(Math.max(0, Math.min(1, s.litter)) * 8);
    return d;
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
