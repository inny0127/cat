import * as THREE from 'three';
import type { Cat3D } from './cat';
import { NMAT, PIX, PIX_GLSL, PIX_STEPS, rampTexture, setCoatRamps } from './pixclass';
import { ROOM_LIGHT_GLSL, roomLightUniforms, type DayLight } from './roomlight';

const FLOOR_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FLOOR_FRAG = /* glsl */ `
#include <packing>
uniform vec3 uPaper;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn;
uniform float uShadowSoft;
uniform float uShadowDark;
uniform vec4 uCaps[40];
uniform float uPixel;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
${PIX_GLSL}
void main() {
  float sh = 1.0;
  if (uShadowOn > 0.5) {
    vec4 sc = uShadowMatrix * vec4(vWorld, 1.0);
    sc.xyz /= sc.w;
    if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) {
      float a = hash(gl_FragCoord.xy) * 6.2832;
      float sum = 0.0;
      for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / 16.0) * uShadowSoft;
        float t = fi * 2.39996 + a;
        float d = unpackRGBAToDepth(texture2D(uShadowMap, sc.xy + vec2(cos(t), sin(t)) * r));
        sum += step(sc.z - 0.002, d);
      }
      sh = sum / 16.0;
    }
  }
  // contact shadow: how much of the sky the body hides from this bit of floor
  float vis = 1.0;
  for (int i = 0; i < 20; i++) {
    vec4 A = uCaps[2 * i];
    vec3 B = uCaps[2 * i + 1].xyz;
    vec3 ab = B - A.xyz;
    float t = clamp(dot(vWorld - A.xyz, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
    vec3 d = A.xyz + ab * t - vWorld;
    float l2 = max(dot(d, d), 1e-6);
    float cosT = d.y * inversesqrt(l2);
    vis *= 1.0 - 0.8 * clamp(cosT, 0.0, 1.0) * clamp(A.w * A.w / l2, 0.0, 1.0);
  }
  if (uPixel > 0.5) { gl_FragColor = pixRoom(${PIX.paper}, mix(0.4, 0.9, sh) * mix(0.55, 1.0, vis), 0.25); return; }
  vec3 c = uPaper * mix(1.0, uShadowDark, 1.0 - sh) * mix(0.55, 1.0, vis);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export interface StageOptions {
  paper?: string;            // backdrop colour (display sRGB)
  exposure?: number;
  shadowSize?: number;       // metres covered by the key light's shadow
  /** pixel art: the scene is drawn this many art pixels across, in a fixed palette, and blown up */
  pixel?: number;
}

// Pixel art: the scene is rendered small, every surface writing its material and its light
// (pixclass.ts); the art pass paints each art pixel from its material's ramp in the colours of the
// hour, the bloom passes blur what glows, and the present pass draws each art pixel as an exact
// square of screen pixels with the glow soft over it.
const PIXEL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** the irises keep a palette of their own (they write colour, alpha 0.75) */
const PAL_EYE = ['#ecd98a', '#c4c25a', '#8a8a36', '#4f5222', '#121010', '#ffffff'];
const eyePalette = () => PAL_EYE.map((h) => new THREE.Vector3(...new THREE.Color().setStyle(h, THREE.SRGBColorSpace).convertLinearToSRGB().toArray()));

/** the big, smooth surfaces, whose light dithers across the edges of its bands */
const DITHERS: number[] = [PIX.wall, PIX.panel, PIX.floor, PIX.floorDark, PIX.rug, PIX.rugCream, PIX.paper, PIX.fleece];

const ART_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform sampler2D uRampTex;
uniform vec2 uSize;
uniform float uExposure;
uniform float uNear;
uniform float uFar;
uniform vec3 uPalEye[${PAL_EYE.length}];
uniform vec4 uSteam;     // steam off a hot drink: where it rises from (art pixels, view depth), and how much
uniform float uDetail;   // how much finer the art is than at its coarsest (1), for little things drawn
                         // pixel by pixel that keep their size in the room (the steam)
uniform vec4 uGlint;     // a glint of sun on the floor: its middle (art pixels) and its half widths across and up
uniform vec2 uGlintK;    // ... its view depth, and how bright (0: none)
uniform vec3 uMotes[16]; // dust in the sunlight: where (art pixels), and how bright (0 for none)
uniform vec3 uNotes[4];  // music notes rising off the radio: where (art pixels), how bright
uniform vec4 uBug;       // a moth or a fly: where (art pixels), how far off (view depth), and what
                         // (0 none, 1 a moth, 2 a fly; its fraction, the wings' beat)
uniform vec3 uBugCol;    // ... and the colour of the light on it
uniform vec3 uLaser;     // the red dot of a laser pointer: where (art pixels), how bright (0: off)
uniform vec3 uStrA;      // a string (the feather wand's): from here (art pixels, view depth) ...
uniform vec3 uStrB;      // ... to here
uniform vec2 uStrSag;    // how far it sags at its middle (art pixels; and whether there is one)
uniform float uTime;
uniform vec3 uTintSun;   // the colour of the hour: on what the sun lights,
uniform vec3 uTintShade; // ... on everything else,
uniform vec3 uTintLamp;  // ... and in the lamp's warm light
uniform float uBeam;     // how much the sunlight shows in the air
uniform float uCatDull;  // how much colour an ill cat's coat has lost (0 .. 1)
uniform vec3 uBeamCol;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform vec3 uKeyDir;
uniform vec3 uLampPos;
uniform float uLampInt;
${ROOM_LIGHT_GLSL}

// Khronos PBR Neutral, as the full-resolution stage uses
vec3 neutral(vec3 c) {
  c *= uExposure;
  float x = min(c.r, min(c.g, c.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= offset;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < 0.76) return c;
  float d = 0.24;
  float np = 1.0 - d * d / (peak + d - 0.76);
  c *= np / peak;
  float g = 1.0 - 1.0 / (0.15 * (peak - np) + 1.0);
  return mix(c, vec3(np), g);
}
vec3 toSRGB(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
// is an art pixel on a line drawn as pixel art draws one (one pixel to a column, or to a row,
// whichever way it runs more), and how far along it
float onLine(vec2 a, vec2 b, ivec2 p) {
  vec2 d = b - a, c = vec2(p) + 0.5;
  if (abs(d.x) >= abs(d.y)) {
    if (abs(d.x) < 0.5) return all(equal(ivec2(floor(a)), p)) ? 0.0 : -1.0;
    float t = (c.x - a.x) / d.x;
    if (t < 0.0 || t > 1.0) return -1.0;
    return int(floor(a.y + t * d.y)) == p.y ? t : -1.0;
  }
  float t = (c.y - a.y) / d.y;
  if (t < 0.0 || t > 1.0) return -1.0;
  return int(floor(a.x + t * d.x)) == p.x ? t : -1.0;
}
vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 oklab(vec3 c) {
  c = toLin(c);
  vec3 lms = mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005) * c;
  lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
  return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662, -0.0040720468, 0.4505937099, -0.8086757660) * lms;
}
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float invDepth(ivec2 q) { return 1.0 / lin(texelFetch(uDepth, q, 0).r); }
vec3 snapEye(vec3 c) {
  vec3 q = oklab(c);
  float best = 1e9; vec3 r = c;
  for (int i = 0; i < ${PAL_EYE.length}; i++) {
    vec3 e = oklab(uPalEye[i]) - q;
    float d = dot(e * vec3(1.0, 1.4, 1.4), e);
    if (d < best) { best = d; r = uPalEye[i]; }
  }
  return r;
}
vec3 ramp(int m, int step) { return texelFetch(uRampTex, ivec2(clamp(step, 0, 4), m), 0).rgb; }
float bayer(ivec2 p) {
  const float BAYER[16] = float[](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return BAYER[(p.x & 3) * 4 + (p.y & 3)] / 16.0;
}
bool dithers(int m) {
  ${DITHERS.map((m) => `if (m == ${m}) return true;`).join(' ')}
  return false;
}

// the sunbeam in the air at a point: in the sun through the window, the light streaky (rays
// fanning from the panes, as through old glass and dust) and fading as it goes into the room
float beamAt(vec3 P) {
  if (uKeyDir.z > -0.02) return 0.0;
  float t = (uWinZ - P.z) / uKeyDir.z;
  if (t < 0.0) return 0.0;
  vec2 q = P.xy + uKeyDir.xy * t;
  const float e = 0.01;
  float s = smoothstep(uWin.x - e, uWin.x + e, q.x) * smoothstep(uWin.y + e, uWin.y - e, q.x)
          * smoothstep(uWin.z - e, uWin.z + e, q.y) * smoothstep(uWin.w + e, uWin.w - e, q.y);
  s *= smoothstep(uWinBar.z - e, uWinBar.z + 2.0 * e, abs(q.x - uWinBar.x));
  s *= smoothstep(uWinBar.z - e, uWinBar.z + 2.0 * e, abs(q.y - uWinBar.y));
  float streak = 0.15 + 0.85 * smoothstep(0.05, 0.75, sin(q.x * 31.0 + 1.7 * sin(q.y * 7.0)) * 0.6 + sin(q.x * 13.0 - q.y * 5.0) * 0.4);
  return s * streak * exp(-t * 1.1);
}

// what lies under an art pixel: 1 the cat, 2 the room, 0 anything else; its material and light
int kindAt(ivec2 q, out int mat, out float light, out float third) {
  vec4 t = texelFetch(uColor, q, 0);
  mat = int(t.r * ${NMAT}.0);
  light = t.g;
  third = t.b;
  if (texelFetch(uDepth, q, 0).r >= 0.99999) return 0;
  return t.a > 0.9 ? 1 : (t.a > 0.4 && t.a < 0.6) ? 2 : 0;
}

const float TH[4] = float[](${PIX_STEPS.join(', ')});
// the step of the ramp a light falls on; big smooth surfaces dither across the edges of their
// bands (a narrow seam of checkers, as a pixel artist would), everything else keeps clean bands
float stepPos(float L) {
  if (L < TH[0]) return L / TH[0] - 0.5;
  if (L >= TH[3]) return 4.0 + (L - TH[3]) / (1.0 - TH[3]) * 0.5;
  for (int i = 0; i < 3; i++) if (L >= TH[i] && L < TH[i + 1]) return float(i + 1) + (L - TH[i]) / (TH[i + 1] - TH[i]) - 0.5;
  return 4.0;
}
// slope: how far along the ramp the light moves from one pixel to the next, so the checkered seam
// is a pixel or two wide however slowly the light changes
int stepOf(float L, bool dither, ivec2 p, float slope) {
  float b = dither ? (bayer(p) - 0.47) * clamp(slope * 2.2, 0.0, 0.5) : 0.0;
  return int(floor(stepPos(L) + 0.5 + b));
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 src = texelFetch(uColor, p, 0);
  float depth = texelFetch(uDepth, p, 0).r;
  int mat; float L0, B0;
  int kind = kindAt(p, mat, L0, B0);
  vec3 col;
  float glow = 0.0;
  if (kind == 0) {
    if (depth >= 0.99999) col = toSRGB(src.rgb);
    // the irises in their own palette, in the colour of the hour
    else if (src.a > 0.7 && src.a < 0.8) col = clamp(snapEye(toSRGB(neutral(src.rgb))) * uTintShade, 0.0, 1.0);
    else {
      // a colour written to be shown as it is: the sky (alpha 0.15; its brightest clouds glow a
      // little), small lights (0.17: stars, lit windows across the way), lights (0.2: bulbs, the moon)
      col = src.rgb;
      float lum = dot(col, vec3(0.3, 0.59, 0.11));
      glow = src.a > 0.185 ? 1.0 : src.a > 0.16 ? 0.55 : 0.18 * smoothstep(0.8, 1.0, lum);
    }
  } else {
    // a single pixel of a material none of its neighbours share takes the commonest of theirs, and
    // the light is evened a little over the same material: clean shapes and bands, not specks
    int nm[8];
    float nl[8];
    int k = 0, same = 0;
    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) continue;
      int m2; float l2, b2;
      int k2 = kindAt(p + ivec2(dx, dy), m2, l2, b2);
      nm[k] = k2 == kind ? m2 : -1; nl[k] = l2; k++;
      if (k2 == kind && m2 == mat) same++;
    }
    // (the cat's coat, its white, cream, ginger and stripes, more strictly: a pixel with only one
    // neighbour in its colour, a stray end or a nick in a band's edge, goes too)
    if (same == 0 || (kind == 1 && mat <= ${PIX.stripe} && same <= 1)) {
      int best = mat, bestN = 0;
      for (int i = 0; i < 8; i++) {
        if (nm[i] < 0) continue;
        int n = 0;
        for (int j = 0; j < 8; j++) if (nm[j] == nm[i]) n++;
        if (n > bestN) { bestN = n; best = nm[i]; }
      }
      mat = best;
    }
    float sumL = L0 * 4.0, sumW = 4.0;
    for (int i = 0; i < 8; i++) if (nm[i] == mat) { sumL += nl[i]; sumW += 1.0; }
    float L = sumL / sumW;
    // the third channel: its whole part, how much of its light is the lamp's and how much the
    // sun's (or the moon's), in fifths; its fraction, the rim light (the cat) or how much it glows
    // (the room)
    int code = int(floor(B0 + 1e-3));
    float third = B0 - float(code);
    float wl = float(code / 6) / 5.0, ws = float(code - (code / 6) * 6) / 5.0;
    // (nm, nl: 0 1 2 below, 3 left, 4 right, 5 6 7 above)
    // (the gentler side of each way, so a groove or a speck of texture is not taken for a slope)
    float s0 = stepPos(L0);
    float sx = nm[3] == mat && nm[4] == mat ? min(abs(stepPos(nl[4]) - s0), abs(s0 - stepPos(nl[3]))) : 0.0;
    float sy = nm[1] == mat && nm[6] == mat ? min(abs(stepPos(nl[6]) - s0), abs(s0 - stepPos(nl[1]))) : 0.0;
    int level = stepOf(L, kind == 2 && dithers(mat), p, max(sx, sy));
    // the cat: a pixel in a light that none (or only one) of its neighbours in the same colour are
    // in takes the light most of them are in, so the coat is painted in clean bands of light and
    // shade, not salted with specks of the one next to it (and so the curtains' folds)
    if (kind == 1 || (kind == 2 && mat == ${PIX.curtain})) {
      int cnt[5] = int[](0, 0, 0, 0, 0);
      int nSame = 0, sameLv = 0;
      for (int i = 0; i < 8; i++) {
        if (nm[i] != mat) continue;
        int lv = clamp(int(floor(stepPos(nl[i]) + 0.5)), 0, 4);
        cnt[lv]++;
        nSame++;
        if (lv == level) sameLv++;
      }
      if (nSame >= 5 && sameLv <= 1) {
        int bestN = 0;
        for (int i = 0; i < 5; i++) if (cnt[i] > bestN) { bestN = cnt[i]; level = i; }
      }
    }
    // the cat: the light catching an edge from behind lifts it a step; its outline below and to
    // the right, against whatever is behind it, a step darker in its own colours (a pixel
    // artist's selective outline: the shadow side drawn in, never in black)
    // (neither outline ever goes down to a ramp's deepest step: that reads as a black line)
    bool rimLit = kind == 1 && third > 0.4;
    if (rimLit) level += third > 0.7 ? 2 : 1;
    else if (kind == 1 && (nm[1] < 0 || nm[4] < 0) && level >= 2) level -= 1;
    // (the room: a third value over a quarter glows that much; nearly one, at its brightest)
    bool glows = kind == 2 && third > 0.9;
    float partGlow = kind == 2 && third > 0.25 ? (third - 0.25) / 0.74 : 0.0;
    if (glows) level = 4;
    // just behind something nearer (a leg across the chest, the bed's rim on the floor): a line in
    // this colour's own shade, never black
    float w = invDepth(p);
    float dl = invDepth(p + ivec2(-1, 0)), dr = invDepth(p + ivec2(1, 0)), dd = invDepth(p + ivec2(0, -1)), du = invDepth(p + ivec2(0, 1));
    float front = max(max(dl, dr), max(du, dd)) - w;
    // the cat, just behind a nearer part of itself (the head over the shoulder, the chin over the
    // chest, a leg across the flank) or down in a fold of itself: the line a pixel artist draws
    // where one form passes over another. A step in its depth, not a slope: measured against the
    // line through its neighbours either side (1/depth runs straight across a flat surface, so a
    // back seen aslant is no edge, and a round flank turning away bulges the other way), in metres
    float crease = 0.0;
    if (kind == 1) {
      float z2 = 1.0 / (w * w);
      if (nm[3] >= 0 && nm[4] >= 0) crease = max(crease, (dl + dr - 2.0 * w) * z2);
      if (nm[1] >= 0 && nm[6] >= 0) crease = max(crease, (dd + du - 2.0 * w) * z2);
    }
    // the room against the bright window by day: a thing's edge where it meets the daylit sky
    // (the frame and its glazing bars, a leaf, the curtain's edge, a mug on the sill) is lit by it,
    // a step lighter, as a backlit thing's edges are
    if (kind == 2 && !glows) {
      float sky = 0.0;
      for (int i = 0; i < 4; i++) {
        ivec2 q = p + (i == 0 ? ivec2(-1, 0) : i == 1 ? ivec2(1, 0) : i == 2 ? ivec2(0, 1) : ivec2(0, -1));
        vec4 t = texelFetch(uColor, q, 0);
        if (texelFetch(uDepth, q, 0).r < 0.99999 && t.a > 0.1 && t.a < 0.16) sky = max(sky, dot(t.rgb, vec3(0.3, 0.59, 0.11)));
      }
      if (sky > 0.6 && level < 4) level += 1;
    }
    if ((front > 0.035 * w || crease > 0.018) && w > 0.25) level -= level >= 2 ? 1 : 0;
    // the top edge of a thing against what lies behind it catches the window's light: a line a
    // step lighter, as a pixel artist picks out an edge (not on what glows, nor in the dark)
    else if (!glows && w > 0.25 && w - du > 0.035 * w && L > 0.2) level += 1;
    col = ramp(mat, level);
    // the colour of the light it is in: the lamp's, the sun's (the moon's), the shade's, mixed as
    // they are mixed on it
    vec3 tint = uTintShade * max(0.0, 1.0 - wl - ws) + uTintLamp * wl + uTintSun * ws;
    // (an edge of the cat caught by the light from the window behind it is lit by that light, the
    // sun's gold, or by night the moon's blue, whatever the light on the rest of it)
    if (rimLit) tint = mix(tint, uTintSun, 0.85);
    // (what glows of itself, a candle's jar, a lit dial, a lantern, is its own warm light)
    if (glows) tint = vec3(1.05, 0.97, 0.86);
    col = clamp(col * tint, 0.0, 1.0);
    // richer: a little more colour in the lights and middle tones (not the darks, which would go
    // garish), the darks a little deeper
    // (the more colour a thing has already, the less it is given: a ginger coat stays a coat, not
    // a neon sign)
    float lu = dot(col, vec3(0.299, 0.587, 0.114));
    float chroma = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
    col = clamp(mix(vec3(lu), col, 1.0 + 0.22 * smoothstep(0.12, 0.45, lu) * (1.0 - smoothstep(0.3, 0.7, chroma))), 0.0, 1.0);
    col = col * col * (3.0 - 2.0 * col) * 0.35 + col * 0.65;
    // an ill cat's coat goes dull, and greyer the iller it is
    if (kind == 1 && uCatDull > 0.0) col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))) * vec3(0.98, 0.98, 1.02), uCatDull);
    if (glows) glow = 1.0;
    else if (partGlow > 0.0) glow = partGlow;
    else if (ws > 0.5 && level >= 4) glow = 0.16;
  }
  // the sunlight in the air: how far the line of sight runs through the beam from the window
  if (uBeam > 0.001) {
    vec2 uv = (vec2(p) + 0.5) / uSize;
    vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, min(depth, 0.9999) * 2.0 - 1.0, 1.0);
    vec3 P = (uViewInv * vec4(v.xyz / v.w, 1.0)).xyz;
    vec3 C = (uViewInv * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 D = P - C;
    float acc = 0.0;
    for (int i = 0; i < 24; i++) acc += beamAt(C + D * ((float(i) + 0.5) / 24.0));
    // (a weak light, the sun just up, shows nothing in the air: a faint haze would only be a blot)
    float hz = acc / 24.0 * length(D) * uBeam * smoothstep(0.12, 0.3, uBeam);
    // lighter air in three layers, the thicker the brighter, dithered where one gives way to the
    // next (lit, not greyed: the light adds to what is behind it); and a soft glow all through it
    // (in the light's own colour, and a little more of it, warming what is seen through it too:
    // lightened alone, the violet shade under a low gold sun goes a misty grey, a fog, not a ray)
    // (not dithered over the cat: checkers all over its coat read as noise, not light)
    float lv = clamp(floor(hz * 22.0 + (kind == 1 ? 0.0 : (bayer(p) - 0.5) * 0.9)), 0.0, 3.0);
    vec3 bc = clamp(mix(vec3(dot(uBeamCol, vec3(0.3, 0.59, 0.11))), uBeamCol, 1.5), 0.0, 1.0);
    col *= mix(vec3(1.0), bc, lv * 0.09);
    col = 1.0 - (1.0 - col) * (1.0 - bc * lv * 0.085);
    glow = max(glow, clamp(hz * 2.5, 0.0, 1.0) * 0.75);
  }
  // steam curling up off a hot drink, and dust turning in the sunlight: a soft warm white over
  // whatever is behind
  float haze = 0.0;
  // (behind whatever stands nearer)
  if (uSteam.w > 0.0 && !(depth < 0.99999 && lin(depth) < uSteam.z - 0.04)) {
    // (two wisps, each a line of single pixels, one to a row, as a pixel artist draws steam:
    // rising, swaying wider the higher they get, coming apart in lengths that drift up, paler as
    // they go; the second shorter, from the other side of the cup)
    ivec2 q = p - ivec2(uSteam.xy);
    float sc = uDetail;
    if (q.y >= 2 && float(q.y) < 18.0 * sc && abs(float(q.x)) < 7.0 * sc) {
      for (int i = 0; i < 2; i++) {
        // (y in the pixels of the coarsest art, so the wisps are as tall and sway as wide over the
        // cup however fine the art; still a line of single pixels, one to a row)
        float fi = float(i), y = float(q.y) / sc, H = 17.0 - fi * 5.0;
        if (y >= H) continue;
        float x = (sin(y * 0.5 - uTime * 2.0 + fi * 2.7) * (0.5 + y * 0.09) + sin(y * 0.11 + uTime * 0.6 + fi * 1.3) * 0.7 + (fi - 0.5) * 2.6) * sc;
        float seg = fract(y * 0.12 - uTime * 0.55 + fi * 0.43);
        if (q.x == int(floor(x + 0.5)) && seg > 0.3) {
          float u = y / H;
          haze = max(haze, (u < 0.4 ? 0.78 : u < 0.75 ? 0.56 : 0.34) * uSteam.w);
        }
      }
    }
  }
  for (int i = 0; i < 16; i++) {
    if (uMotes[i].z > 0.0 && floor(uMotes[i].x) == float(p.x) && floor(uMotes[i].y) == float(p.y)) haze = max(haze, 0.75 * uMotes[i].z);
  }
  // a quaver: its head, its stem, its flag (five wide, six high, from the bottom left)
  const int NOTE[6] = int[](3, 7, 4, 4, 20, 12);
  for (int i = 0; i < 4; i++) {
    if (uNotes[i].z <= 0.0) continue;
    ivec2 q = p - ivec2(floor(uNotes[i].xy));
    if (q.x >= 0 && q.x < 5 && q.y >= 0 && q.y < 6 && ((NOTE[q.y] >> q.x) & 1) != 0) haze = max(haze, 0.85 * uNotes[i].z);
  }
  col = mix(col, vec3(1.0, 0.97, 0.9), haze);
  glow = max(glow, haze * 0.5);
  // a moth (pale wings beating, its body between them) or a fly (a dark speck, its wings
  // catching the light), behind whatever stands nearer
  if (uBug.w >= 1.0) {
    ivec2 q = p - ivec2(floor(uBug.xy));
    bool behind = depth < 0.99999 && lin(depth) < uBug.z - 0.03;
    int what = int(uBug.w);
    bool up = fract(uBug.w) > 0.5;
    if (!behind && what == 1) {
      // five wide, three high: wings up, then down
      const int UP[3] = int[](4, 31, 17);
      const int DN[3] = int[](17, 31, 4);
      if (q.x >= -2 && q.x <= 2 && q.y >= -1 && q.y <= 1) {
        int row = up ? UP[q.y + 1] : DN[q.y + 1];
        if (((row >> (q.x + 2)) & 1) != 0) {
          bool body = q.x == 0;
          col = (body ? vec3(0.42, 0.33, 0.3) : vec3(0.86, 0.79, 0.66)) * uBugCol;
          glow = max(glow, body ? 0.0 : 0.25);
        }
      }
    } else if (!behind && what == 2) {
      if (q == ivec2(0, 0) || q == ivec2(1, 0)) col = vec3(0.13, 0.11, 0.15);
      else if (up && (q == ivec2(0, 1) || q == ivec2(1, 1))) col = mix(col, vec3(0.85, 0.88, 0.95) * uBugCol, 0.6);
    }
  }
  // the wand's string, a line of single pixels (sagging when slack), behind whatever is nearer
  if (uStrSag.y > 0.0) {
    vec2 a = uStrA.xy, b = uStrB.xy, m = (a + b) * 0.5 - vec2(0.0, uStrSag.x);
    vec2 lo = min(min(a, b), m) - 1.0, hi = max(max(a, b), m) + 1.0;
    if (float(p.x) >= lo.x && float(p.x) <= hi.x && float(p.y) >= lo.y && float(p.y) <= hi.y) {
      float t1 = onLine(a, m, p), t2 = t1 < 0.0 ? onLine(m, b, p) : -1.0;
      float t = t1 >= 0.0 ? 0.5 * t1 : t2 >= 0.0 ? 0.5 + 0.5 * t2 : -1.0;
      if (t >= 0.0) {
        float z = mix(uStrA.z, uStrB.z, t);
        bool behind = depth < 0.99999 && lin(depth) < z - 0.02;
        if (!behind) col = mix(col, vec3(0.36, 0.25, 0.31), 0.85);
      }
    }
  }
  // a glint of sun thrown off a car's windows in the street below, sweeping across the floor: a
  // soft warm patch, brightest in the middle in steps, its fringe a checker; on the floor only
  // (anything standing in front of it is in front of it)
  if (uGlintK.y > 0.0 && !(depth < 0.99999 && lin(depth) < uGlintK.x - 0.06)) {
    vec2 d = (vec2(p) + 0.5 - uGlint.xy) / max(uGlint.zw, vec2(1.0));
    float r = length(d);
    // (a hot middle nearly white, gold round it, the fringe a warm wash over what is there)
    int ring = r < 0.38 ? 3 : r < 0.66 ? 2 : r < 0.88 ? 1 : r < 1.0 && bayer(p) > 0.5 ? 1 : 0;
    if (ring > 0) {
      float k = uGlintK.y;
      if (ring == 3) col = mix(col, vec3(1.0, 0.97, 0.88), 0.85 * k);
      else if (ring == 2) col = mix(col, max(col, vec3(1.0, 0.86, 0.56)), 0.7 * k);
      else col = mix(col, 1.0 - (1.0 - col) * (1.0 - vec3(1.0, 0.85, 0.55) * 0.6), k);
      glow = max(glow, (ring == 3 ? 0.55 : ring == 2 ? 0.35 : 0.12) * k);
    }
  }
  // the red dot of a laser pointer on whatever it falls on (the cat too): a hot point nearly white
  // at its heart, red round it, a speckle of red light on the surface about it, and a glow
  if (uLaser.z > 0.0) {
    // (from the middle of the art pixel the dot is in, so that it is round about its own middle;
    // its speckle shimmers, as a laser's does)
    ivec2 q = p - ivec2(floor(uLaser.xy));
    float r = length(vec2(q));
    float sp = fract(sin(dot(vec2(q) + floor(uTime * 20.0) * vec2(3.1, 7.7), vec2(12.9898, 78.233))) * 43758.5453);
    vec3 red = vec3(1.0, 0.12, 0.24);
    float k = 0.0, g = 0.0;
    if (r < 0.5) { col = mix(col, vec3(1.0, 0.93, 0.9), uLaser.z); g = 1.0; }
    else if (r < 1.2) { col = mix(col, vec3(1.0, 0.36, 0.42), uLaser.z); g = 1.0; }
    else if (r < 1.5) { col = mix(col, red, uLaser.z); g = 0.85; }
    else if (r < 2.3) { k = 0.45 + 0.25 * sp; g = 0.5; }
    else if (r < 3.2 && sp > 0.55) { k = 0.25; g = 0.2; }
    if (k > 0.0) col = mix(col, 1.0 - (1.0 - col) * (1.0 - red), k * uLaser.z);
    glow = max(glow, g * uLaser.z);
  }
  gl_FragColor = vec4(col, glow);
}`;

/** a gaussian blur, one way (the first pass takes the art's glow: its colour times its alpha) */
const BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uDir;
uniform float uFirst;
varying vec2 vUv;
void main() {
  vec3 sum = vec3(0.0);
  float ws = 0.0;
  for (int i = -8; i <= 8; i++) {
    float fi = float(i);
    float w = exp(-fi * fi / 32.0);
    vec4 s = texture2D(uSrc, vUv + uDir * fi);
    sum += (uFirst > 0.5 ? s.rgb * s.a : s.rgb) * w;
    ws += w;
  }
  gl_FragColor = vec4(sum / ws, 1.0);
}`;

/** the art pixels as exact squares of screen pixels, the glow soft over them, the corners dimmed */
const PRESENT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uArt;
uniform sampler2D uBloom;
uniform vec2 uArtSize;
uniform float uK;
uniform vec2 uOff;
uniform vec2 uSub;       // where the view is between whole art pixels (art pixels)
uniform vec2 uScreen;
uniform float uBloomAmt;
uniform float uVignette;
void main() {
  vec2 f = gl_FragCoord.xy + uOff + uSub * uK;
  ivec2 q = clamp(ivec2(floor(f / uK)), ivec2(0), ivec2(uArtSize) - 1);
  vec3 c = texelFetch(uArt, q, 0).rgb;
  vec3 b = texture2D(uBloom, f / (uK * uArtSize)).rgb * uBloomAmt;
  c = 1.0 - (1.0 - c) * (1.0 - clamp(b, 0.0, 1.0));
  vec2 v = gl_FragCoord.xy / uScreen - vec2(0.5, 0.55);
  v.x *= uScreen.x / uScreen.y;
  c *= 1.0 - uVignette * smoothstep(0.3, 0.85, length(v * vec2(1.25, 1.0)));
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * The world the cat lives in: a seamless paper backdrop that also takes its soft shadow, a soft
 * key light from the front left with a fill and a little back light, filmic tone mapping. The fur
 * shader does its own lighting, so the light directions and colours live in its uniforms; this
 * class keeps the shadow map and the floor in step with them.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly key = new THREE.DirectionalLight(0xffffff, 1);
  readonly floor: THREE.Mesh;
  private readonly floorMat: THREE.ShaderMaterial;
  private cats: Cat3D[] = [];
  readonly paper: THREE.Color;
  /** pixel art: the small render target the scene is drawn into, the pass that paints it (art),
   *  the glow blurred from it (bloom), and the pass that draws it on the screen */
  private pixel: {
    width: number; k: number; off: THREE.Vector2;
    /** the screen in art pixels, and the margin of art drawn round it (so it can slide by part
     *  of a pixel) */
    nominal: THREE.Vector2; margin: number;
    rt: THREE.WebGLRenderTarget; art: THREE.WebGLRenderTarget; bloomA: THREE.WebGLRenderTarget; bloomB: THREE.WebGLRenderTarget;
    quad: THREE.Mesh; scene: THREE.Scene; cam: THREE.Camera;
    mat: THREE.ShaderMaterial; blur: THREE.ShaderMaterial; present: THREE.ShaderMaterial;
  } | null = null;

  constructor(opts: StageOptions = {}, canvas?: HTMLCanvasElement) {
    // The fur writes partial alpha (alpha-to-coverage) - an opaque drawing buffer keeps the page
    // from showing through it. Pixel art draws its own exact squares: no antialiasing, and every
    // screen pixel of the phone's
    const cv = canvas ?? document.createElement('canvas');
    const aa = !opts.pixel;
    const context = cv.getContext('webgl2', { alpha: false, antialias: aa, preserveDrawingBuffer: true, powerPreference: 'high-performance' })!;
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, context, antialias: aa, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, opts.pixel ? 3 : 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = new URLSearchParams(location.search).get('tm') === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = opts.exposure ?? 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;   // we filter it ourselves
    this.paper = new THREE.Color().setStyle(opts.paper ?? '#f3efe9', THREE.SRGBColorSpace);
    this.scene.background = this.paper;
    this.camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.01, 40);

    const s = (opts.shadowSize ?? 0.9) / 2;
    this.key.castShadow = true;
    // (pixel art is drawn small: a quarter of the shadow map holds all it can show)
    const sm = opts.pixel ? 1024 : 2048;
    this.key.shadow.mapSize.set(sm, sm);
    Object.assign(this.key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: 6 });
    this.key.shadow.bias = 0;
    this.scene.add(this.key, this.key.target);

    this.floorMat = new THREE.ShaderMaterial({
      uniforms: {
        uPaper: { value: this.paper.clone() },
        uShadowMap: { value: null },
        uShadowMatrix: { value: this.key.shadow.matrix },
        uShadowOn: { value: 0 },
        uShadowSoft: { value: 0.012 },
        uShadowDark: { value: 0.8 },
        uCaps: { value: [] as THREE.Vector4[] },
        uPixel: { value: opts.pixel ? 1 : 0 },
      },
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      toneMapped: false,
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);
    if (opts.pixel) this.setupPixel(opts.pixel, opts.exposure ?? 1.15);
    addEventListener('resize', () => this.resize());
  }

  private setupPixel(width: number, exposure: number) {
    const target = (type: THREE.TextureDataType, filter: THREE.MagnificationTextureFilter, depth = false) => new THREE.WebGLRenderTarget(4, 4, {
      type, minFilter: filter, magFilter: filter, ...(depth ? { depthTexture: new THREE.DepthTexture(4, 4, THREE.FloatType) } : {}),
    });
    const rt = target(THREE.HalfFloatType, THREE.NearestFilter, true);
    const art = target(THREE.UnsignedByteType, THREE.LinearFilter);
    const bloomA = target(THREE.HalfFloatType, THREE.LinearFilter);
    const bloomB = target(THREE.HalfFloatType, THREE.LinearFilter);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: rt.texture }, uDepth: { value: rt.depthTexture }, uSize: { value: new THREE.Vector2() },
        uExposure: { value: exposure }, uNear: { value: this.camera.near }, uFar: { value: this.camera.far },
        uPalEye: { value: eyePalette() },
        uRampTex: { value: rampTexture() },
        uSteam: { value: new THREE.Vector4() }, uDetail: { value: 1 },
        uGlint: { value: new THREE.Vector4() }, uGlintK: { value: new THREE.Vector2() },
        uMotes: { value: Array.from({ length: 16 }, () => new THREE.Vector3()) },
        uNotes: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) },
        uBug: { value: new THREE.Vector4() }, uBugCol: { value: new THREE.Vector3(1, 1, 1) },
        uLaser: { value: new THREE.Vector3() },
        uStrA: { value: new THREE.Vector3() }, uStrB: { value: new THREE.Vector3() }, uStrSag: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uCatDull: { value: 0 },
        uTintSun: { value: new THREE.Vector3(1, 1, 1) },
        uTintShade: { value: new THREE.Vector3(1, 1, 1) },
        uTintLamp: { value: new THREE.Vector3(1, 1, 1) },
        uBeam: { value: 0 },
        uBeamCol: { value: new THREE.Vector3(1, 0.95, 0.8) },
        uProjInv: { value: new THREE.Matrix4() },
        uViewInv: { value: new THREE.Matrix4() },
        uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
        uLampPos: { value: new THREE.Vector3() },
        uLampInt: { value: 0 },
        ...roomLightUniforms(),
      },
      vertexShader: PIXEL_VERT, fragmentShader: ART_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
    });
    const blur = new THREE.ShaderMaterial({
      uniforms: { uSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uFirst: { value: 0 } },
      vertexShader: PIXEL_VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
    });
    const present = new THREE.ShaderMaterial({
      uniforms: {
        uArt: { value: art.texture }, uBloom: { value: bloomB.texture }, uArtSize: { value: new THREE.Vector2() },
        uK: { value: 1 }, uOff: { value: new THREE.Vector2() }, uSub: { value: new THREE.Vector2() }, uScreen: { value: new THREE.Vector2() },
        uBloomAmt: { value: 0.55 }, uVignette: { value: 0.16 },
      },
      vertexShader: PIXEL_VERT, fragmentShader: PRESENT_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
    });
    const scene = new THREE.Scene();
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const quad = new THREE.Mesh(tri, mat);
    quad.frustumCulled = false;
    scene.add(quad);
    this.pixel = { width, k: 1, off: new THREE.Vector2(), nominal: new THREE.Vector2(1, 1), margin: 1, rt, art, bloomA, bloomB, quad, scene, cam: new THREE.Camera(), mat, blur, present };
    this.sizePixel();
  }

  /** the art drawn this many pixels across from now on (as near as whole screen pixels allow) */
  setArtWidth(width: number) {
    if (!this.pixel || this.pixel.width === width) return;
    this.pixel.width = width;
    this.sizePixel();
  }

  /** art pixels are exact squares of k screen pixels: as near the asked width as that allows, the
   *  art a little bigger than the screen and centred on it */
  private sizePixel() {
    if (!this.pixel) return;
    const P = this.pixel;
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const k = Math.max(1, Math.round(buf.x / P.width));
    // a pixel of art more than the screen on every side
    const w = Math.ceil(buf.x / k) + 2 * P.margin, h = Math.ceil(buf.y / k) + 2 * P.margin;
    P.k = k;
    P.nominal.set(buf.x / k, buf.y / k);
    P.off.set((w * k - buf.x) / 2, (h * k - buf.y) / 2);
    P.rt.setSize(w, h);
    P.art.setSize(w, h);
    const bw = Math.ceil(w / 2), bh = Math.ceil(h / 2);
    P.bloomA.setSize(bw, bh);
    P.bloomB.setSize(bw, bh);
    P.mat.uniforms.uSize.value.set(w, h);
    // (186 across: a phone held upright, drawn at its coarsest)
    P.mat.uniforms.uDetail.value = Math.min(1.5, Math.max(1, P.width / 186));
    const u = P.present.uniforms;
    u.uArtSize.value.set(w, h);
    u.uK.value = k;
    u.uOff.value.copy(P.off);
    u.uScreen.value.copy(buf);
  }

  /** a second, small view drawn over a corner of the screen (the cat's own eyes: mind.ts): its
   *  camera, where on the screen (css px, from the top left), and what is left out of it (the cat:
   *  its eyes are inside its head). Drawn in the room's own pixels */
  inset: { cam: THREE.PerspectiveCamera; rect: { x: number; y: number; w: number; h: number }; hide: THREE.Object3D | null } | null = null;
  private insetRT: THREE.WebGLRenderTarget | null = null;
  private insetArt: THREE.WebGLRenderTarget | null = null;
  private insetPaint: THREE.ShaderMaterial | null = null;
  private insetView: { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial } | null = null;
  private drawInset() {
    const I = this.inset!, r = this.renderer, R = I.rect, cam = I.cam, P = this.pixel;
    // (as coarse as the room's own pixels)
    const css = P ? P.k / r.getPixelRatio() : 2;
    const w = Math.max(8, Math.round(R.w / css)), h = Math.max(4, Math.round(R.h / css));
    if (!this.insetRT) {
      this.insetRT = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: new THREE.DepthTexture(w, h, THREE.FloatType),
      });
      this.insetArt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      // (the room's materials draw what the paint pass makes into colour: the same pass, the same
      // light and weather, for this view)
      if (P) {
        const U = P.mat.uniforms;
        this.insetPaint = new THREE.ShaderMaterial({
          uniforms: {
            ...U, uColor: { value: this.insetRT.texture }, uDepth: { value: this.insetRT.depthTexture }, uSize: { value: new THREE.Vector2(w, h) },
            uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() }, uNear: { value: cam.near }, uFar: { value: cam.far }, uDetail: { value: 1 },
          },
          vertexShader: PIXEL_VERT, fragmentShader: ART_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
        });
      }
      // (as a cat sees: in blues and yellows, reds gone to olive, the colours weaker; and a little
      // dark round the edges, where its eyes are good for nothing but movement)
      const mat = new THREE.ShaderMaterial({
        uniforms: { uSrc: { value: null }, uRaw: { value: 0 }, uDepth: { value: this.insetRT.depthTexture } },
        vertexShader: PIXEL_VERT,
        fragmentShader: `
          uniform sampler2D uSrc; uniform float uRaw; uniform sampler2D uDepth; varying vec2 vUv;
          void main() {
            vec3 c = texture2D(uSrc, vUv).rgb;
            c = uRaw > 0.5 ? c * 1.8 / (1.0 + c * 1.8) : pow(c, vec3(2.2));
            // (nothing there: out past the front of the room, where you are, a dim warm dusk)
            if (texture2D(uDepth, vUv).r > 0.99999) c = mix(vec3(0.05, 0.035, 0.05), vec3(0.11, 0.08, 0.09), vUv.y);
            // (a dichromat's colours: what a deuteranope sees, near enough to a cat's)
            c = mat3(0.367322, 0.280085, -0.011820, 0.860646, 0.672501, 0.042940, -0.227968, 0.047413, 0.968881) * c;
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            c = mix(vec3(l), c, 0.75);
            vec2 d = vUv - 0.5;
            c *= 1.0 - 0.45 * smoothstep(0.25, 0.7, length(d * vec2(1.0, 0.6)));
            gl_FragColor = vec4(pow(max(c, 0.0), vec3(1.0 / 2.2)), 1.0);
          }`,
        depthTest: false, depthWrite: false, toneMapped: false,
      });
      const scene = new THREE.Scene();
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      quad.frustumCulled = false;
      scene.add(quad);
      this.insetView = { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
    }
    const resized = this.insetRT.width !== w || this.insetRT.height !== h;
    if (resized) {
      this.insetRT.setSize(w, h);
      this.insetArt!.setSize(w, h);
    }
    // (drawn afresh every other frame: half the cost, and the eyes none the worse for it)
    this.insetOdd = !this.insetOdd;
    if (this.insetOdd || resized) this.paintInset(cam, w, h);
    this.showInset();
  }
  private insetOdd = false;
  private paintInset(cam: THREE.PerspectiveCamera, w: number, h: number) {
    const I = this.inset!, r = this.renderer, P = this.pixel;
    const was = I.hide?.visible ?? false, shadows = r.shadowMap.autoUpdate;
    if (I.hide) I.hide.visible = false;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.insetRT);
    r.render(this.scene, cam);
    r.shadowMap.autoUpdate = shadows;
    if (I.hide) I.hide.visible = was;
    const V = this.insetView!;
    if (P && this.insetPaint) {
      const u = this.insetPaint.uniforms;
      u.uSize.value.set(w, h);
      u.uProjInv.value.copy(cam.projectionMatrixInverse);
      u.uViewInv.value.copy(cam.matrixWorld);
      u.uNear.value = cam.near;
      u.uFar.value = cam.far;
      const main = P.quad.material;
      P.quad.material = this.insetPaint;
      r.setRenderTarget(this.insetArt);
      r.render(P.scene, P.cam);
      P.quad.material = main;
      V.mat.uniforms.uSrc.value = this.insetArt!.texture;
      V.mat.uniforms.uRaw.value = 0;
    } else {
      V.mat.uniforms.uSrc.value = this.insetRT!.texture;
      V.mat.uniforms.uRaw.value = 1;
    }
  }
  private showInset() {
    const R = this.inset!.rect, r = this.renderer, V = this.insetView!;
    r.setRenderTarget(null);
    const size = r.getSize(new THREE.Vector2());
    r.setScissorTest(true);
    r.setScissor(R.x, size.y - R.y - R.h, R.w, R.h);
    r.setViewport(R.x, size.y - R.y - R.h, R.w, R.h);
    r.render(V.scene, V.cam);
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, size.y);
  }

  /** draw the scene: straight to the screen, or small and then as pixel art */
  private draw() {
    this.drawMain();
    if (this.inset) this.drawInset();
  }
  private drawMain() {
    if (!this.pixel) { this.renderer.render(this.scene, this.camera); return; }
    const P = this.pixel;
    const r = this.renderer;
    // the art is drawn a little wider than the screen: the same view, with a margin round it
    const cam = this.camera, n = P.nominal, mg = (P.rt.width - n.x) / 2, mgy = (P.rt.height - n.y) / 2;
    cam.setViewOffset(n.x, n.y, -mg - this.shiftPxX, -mgy + this.shiftPx, P.rt.width, P.rt.height);
    r.setRenderTarget(P.rt);
    r.render(this.scene, cam);
    const u = P.mat.uniforms;
    u.uProjInv.value.copy(cam.projectionMatrixInverse);
    u.uViewInv.value.copy(cam.matrixWorld);
    this.level();
    // paint it
    P.quad.material = P.mat;
    r.setRenderTarget(P.art);
    r.render(P.scene, P.cam);
    // what glows, blurred twice each way at half size
    P.quad.material = P.blur;
    const b = P.blur.uniforms;
    const bw = P.bloomA.width, bh = P.bloomA.height;
    const pass = (src: THREE.Texture, dst: THREE.WebGLRenderTarget, dx: number, dy: number, first: number) => {
      b.uSrc.value = src;
      b.uDir.value.set(dx / bw, dy / bh);
      b.uFirst.value = first;
      r.setRenderTarget(dst);
      r.render(P.scene, P.cam);
    };
    pass(P.art.texture, P.bloomA, 1, 0, 1);
    pass(P.bloomA.texture, P.bloomB, 0, 1, 0);
    pass(P.bloomB.texture, P.bloomA, 1, 0, 0);
    pass(P.bloomA.texture, P.bloomB, 0, 1, 0);
    // and on the screen
    P.quad.material = P.present;
    r.setRenderTarget(null);
    r.render(P.scene, P.cam);
  }

  /** the room's light (roomlight.ts) for the sunbeam in the air: the art pass shares its uniforms */
  useRoomLight(shared: Record<string, { value: unknown }>) {
    if (!this.pixel) return;
    const u = this.pixel.mat.uniforms;
    for (const k of ['uKeyDir', 'uLampPos', 'uLampInt', 'uWin', 'uWinBar', 'uWinZ']) if (shared[k]) u[k] = shared[k] as THREE.IUniform;
  }

  /** the colours of the hour, and how much the sunbeam shows */
  setDayLight(d: DayLight) {
    if (!this.pixel) return;
    const u = this.pixel.mat.uniforms;
    u.uTintSun.value.copy(d.tintSun);
    u.uTintShade.value.copy(d.tintShade);
    u.uTintLamp.value.copy(d.tintLamp);
    u.uBeam.value = 0.8 * d.beam;
    // (the colour of the light it is: sun, low sun, moon)
    const t = d.tintSun, tm = Math.max(t.x, t.y, t.z);
    u.uBeamCol.value.set(t.x / tm, t.y / tm, t.z / tm);
  }

  /** a world point in art pixels (x, y from the bottom left) */
  toArt(at: THREE.Vector3, out = new THREE.Vector2()) {
    const v = at.clone().project(this.camera);
    if (!this.pixel) return out.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    const P = this.pixel, n = P.nominal;
    return out.set((v.x * 0.5 + 0.5) * n.x + (P.rt.width - n.x) / 2, (v.y * 0.5 + 0.5) * n.y + (P.rt.height - n.y) / 2);
  }

  /** where the view is between whole art pixels: the camera is kept on the art's grid (so still
   *  things keep their pixels as it moves) and the finished picture slides by the rest */
  setSubPixel(x: number, y: number) {
    if (this.pixel) this.pixel.present.uniforms.uSub.value.set(x, y);
  }

  /** steam rising off a hot drink at a world point (amount 0 for none) */
  setSteam(at: THREE.Vector3 | null, amount = 1) {
    if (!this.pixel) return;
    const u = this.pixel.mat.uniforms.uSteam.value as THREE.Vector4;
    if (!at || amount <= 0) { u.set(0, 0, 0, 0); return; }
    const a = this.toArt(at);
    u.set(Math.floor(a.x), Math.floor(a.y), -at.clone().applyMatrix4(this.camera.matrixWorldInverse).z, amount);
  }

  /** a glint of sun on the floor: its middle, how wide (m), how bright (0: none) */
  setGlint(at: THREE.Vector3 | null, r = 0.05, bright = 1) {
    if (!this.pixel) return;
    const u = this.pixel.mat.uniforms.uGlint.value as THREE.Vector4, k = this.pixel.mat.uniforms.uGlintK.value as THREE.Vector2;
    if (!at || bright <= 0) { k.set(0, 0); return; }
    // (its outline on the floor as you see it: half widths across and up, from the floor's own
    // directions at it)
    const a = this.toArt(at), b = new THREE.Vector2(), c = new THREE.Vector2();
    this.toArt(at.clone().setX(at.x + r), b);
    this.toArt(at.clone().setZ(at.z + r), c);
    u.set(a.x, a.y, Math.max(1, Math.abs(b.x - a.x)), Math.max(1, Math.abs(c.y - a.y)));
    k.set(-at.clone().applyMatrix4(this.camera.matrixWorldInverse).z, bright);
  }

  /** dust motes: world points with a brightness each (up to 16) */
  setMotes(motes: { p: THREE.Vector3; b: number }[]) {
    if (!this.pixel) return;
    const u = this.pixel.mat.uniforms.uMotes.value as THREE.Vector3[];
    const a = new THREE.Vector2();
    for (let i = 0; i < u.length; i++) {
      const m = motes[i];
      if (!m || m.b <= 0) { u[i].set(0, 0, 0); continue; }
      this.toArt(m.p, a);
      u[i].set(a.x, a.y, m.b);
    }
  }

  /** music notes: world points with a brightness each (up to 4) */
  setNotes(notes: { p: THREE.Vector3; b: number }[]) {
    if (!this.pixel) return;
    const u = this.pixel.mat.uniforms.uNotes.value as THREE.Vector3[];
    const a = new THREE.Vector2();
    for (let i = 0; i < u.length; i++) {
      const m = notes[i];
      if (!m || m.b <= 0) { u[i].set(0, 0, 0); continue; }
      this.toArt(m.p, a);
      u[i].set(a.x - 2, a.y, m.b);
    }
  }

  /** the cat's coat (ginger, cream, silver, smoke): its colours in the pixel ramps */
  setCoat(coat: string) {
    if (this.pixel) setCoatRamps(this.pixel.mat.uniforms.uRampTex.value as THREE.DataTexture, coat);
  }

  /** a moth or a fly at a world point (null: none), its wings up or down, in a light of a colour */
  setBug(at: THREE.Vector3 | null, kind: 'moth' | 'fly' = 'moth', up = false, light?: THREE.Vector3) {
    if (!this.pixel) return;
    const u = this.pixel.mat.uniforms.uBug.value as THREE.Vector4;
    if (!at) { u.set(0, 0, 0, 0); return; }
    const a = this.toArt(at, new THREE.Vector2());
    const depth = -at.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
    u.set(a.x, a.y, depth, (kind === 'moth' ? 1 : 2) + (up ? 0.75 : 0.25));
    if (light) (this.pixel.mat.uniforms.uBugCol.value as THREE.Vector3).copy(light);
  }

  /** the red dot of a laser pointer, at a world point (null: off) */
  setLaser(at: THREE.Vector3 | null, bright = 1) {
    if (!this.pixel) return;
    const u = this.pixel.mat.uniforms.uLaser.value as THREE.Vector3;
    if (!at || bright <= 0) { u.set(0, 0, 0); return; }
    const a = this.toArt(at, new THREE.Vector2());
    u.set(a.x, a.y, bright);
  }

  /** a string from one world point to another, sagging so far at its middle (metres; null: none) */
  setString(a: THREE.Vector3 | null, b?: THREE.Vector3, sag = 0) {
    if (!this.pixel) return;
    const u = this.pixel.mat.uniforms;
    if (!a || !b) { (u.uStrSag.value as THREE.Vector2).set(0, 0); return; }
    const pa = this.toArt(a, new THREE.Vector2()), pb = this.toArt(b, new THREE.Vector2());
    const za = -a.clone().applyMatrix4(this.camera.matrixWorldInverse).z, zb = -b.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
    (u.uStrA.value as THREE.Vector3).set(pa.x, pa.y, za);
    (u.uStrB.value as THREE.Vector3).set(pb.x, pb.y, zb);
    // (metres to art pixels at that distance)
    const px = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * (za + zb) * 0.5) / this.pixelRows();
    (u.uStrSag.value as THREE.Vector2).set(sag / px, 1);
  }

  /** how much colour an ill cat's coat has lost (0 .. 1) */
  setCatDull(v: number) {
    if (this.pixel) this.pixel.mat.uniforms.uCatDull.value = v;
  }

  /** the pixel pass's clock (steam) */
  setTime(t: number) {
    if (this.pixel) this.pixel.mat.uniforms.uTime.value = t;
  }

  /** rows of art pixels (or of screen pixels when not pixel art) */
  pixelRows() {
    return this.pixel ? this.pixel.nominal.y : this.renderer.domElement.height;
  }

  add(cat: Cat3D) {
    this.cats.push(cat);
    this.scene.add(cat.group);
    // the floor takes the contact shadow of the first cat's capsules
    if (this.cats.length === 1) this.floorMat.uniforms.uCaps.value = cat.shared.uCaps.value;
    // light bounced off the floor onto the underside: a pale floor lights the paws and belly
    cat.shared.uGroundCol.value.copy(this.paper).multiplyScalar(0.42);
    // pixel art draws the coat as flat colour; the fur's own texture would only be noise
    if (this.pixel) cat.setPixelArt(true);
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.sizePixel();
    this.level();
  }

  /** the lens shifted (as an architect's camera has it): the camera kept level and the picture
   *  slid up or down instead of the camera tipped, so that upright things stay upright in the
   *  picture, as pixel art draws them (a tipped camera leans them in, and every leaning line is a
   *  line of steps). How far, in halves of the picture's height (positive: the picture shows what
   *  is below the level of the camera); whole art pixels in pixel art */
  private shift = 0;
  private shiftPx = 0;
  private shiftPxX = 0;
  setShift(s: number, sx = 0) {
    if (s === this.shift && sx === this.shiftX) return;
    this.shift = s;
    this.shiftX = sx;
    this.level();
  }
  /** (across, as the eye moves off to one side of the glass: of half the picture's width) */
  private shiftX = 0;

  /** the camera's own view (what rays and projections use) with the lens shifted */
  private level() {
    const cam = this.camera;
    const n = this.pixel ? this.pixel.nominal : this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const px = this.pixel ? Math.round((this.shift * n.y) / 2) : (this.shift * n.y) / 2;
    const qx = this.pixel ? Math.round((this.shiftX * n.x) / 2) : (this.shiftX * n.x) / 2;
    this.shiftPx = this.pixel ? px : 0;
    this.shiftPxX = this.pixel ? qx : 0;
    if (px === 0 && qx === 0) cam.clearViewOffset();
    else cam.setViewOffset(n.x, n.y, -qx, px, n.x, n.y);
  }

  render() {
    const cat = this.cats[0];
    if (cat) {
      // the key light's shadow follows the cat
      const c = cat.group.position;
      this.key.target.position.set(c.x, 0.1, c.z);
      this.key.position.copy(cat.shared.uKeyDir.value).multiplyScalar(2.5).add(this.key.target.position);
      this.key.target.updateMatrixWorld();
      cat.setPixel((2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.pixelRows(), this.camera.position);
    }
    this.draw();
    // the shadow map exists after the first frame; hand it to the shaders that filter it themselves
    const map = this.key.shadow.map?.texture ?? null;
    if (map && this.floorMat.uniforms.uShadowMap.value !== map) {
      this.floorMat.uniforms.uShadowMap.value = map;
      this.floorMat.uniforms.uShadowOn.value = 1;
      for (const k of this.cats) {
        k.shared.uShadowMap.value = map;
        k.shared.uShadowMatrix.value = this.key.shadow.matrix;
        k.shared.uShadowOn.value = 1;
      }
      this.draw();
    }
  }
}
