import * as THREE from 'three';
import { roomLightUniforms } from './roomlight';
import type { Correctives } from './load';
import { LID_GLSL } from './eye';

/**
 * Shell fur. The same skinned body is drawn N times, each shell pushed out along the skinned
 * normal; a 3D strand field decides which texels belong to a hair at that height. Strands are
 * combed toward the tail and sag with gravity, coloured by a procedural ginger-tabby coat that
 * lives in rest-pose space so it moves with the skin.
 */

/** capsules used for the body's ambient occlusion */
export const NCAPS = 20;
/** guard hairs are this much longer than the coat's nominal length */
const GUARD_LEN = 1.45;

/** where on the body, coat colour, fur length and flow: shared by the shells and the strands */
export const COMMON = /* glsl */ `
uniform float uSolid;   // 1: pixel art - flat colour, and only the markings that read at that size
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i), n100 = hash13(i + vec3(1,0,0)), n010 = hash13(i + vec3(0,1,0)), n110 = hash13(i + vec3(1,1,0));
  float n001 = hash13(i + vec3(0,0,1)), n101 = hash13(i + vec3(1,0,1)), n011 = hash13(i + vec3(0,1,1)), n111 = hash13(i + vec3(1,1,1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float fbm(vec3 p) { return vnoise(p) * 0.5 + vnoise(p * 2.03) * 0.3 + vnoise(p * 4.1) * 0.2; }

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }   // palette is written in sRGB
float sdTriIso(vec2 p, vec2 q) {   // apex at the origin, base at y = q.y (iq)
  p.x = abs(p.x);
  vec2 a = p - q * clamp(dot(p, q) / dot(q, q), 0.0, 1.0);
  vec2 b = p - q * vec2(clamp(p.x / q.x, 0.0, 1.0), 1.0);
  float s = -sign(q.y);
  vec2 d = min(vec2(dot(a, a), s * (p.x * q.y - p.y * q.x)), vec2(dot(b, b), s * (p.y - q.y)));
  return -sqrt(d.x) * sign(d.y);
}

// --- where on the body are we (rest pose, metres; +z forward, +y up); anatomy defines come from the asset
const vec3 HC = HEAD_C;
const vec3 EYE = vec3(0.0145, 0.0029, 0.0381);  // front of the eye, relative to HC (x mirrored)
float eyeDist(vec3 h) { return length((h - vec3(sign(h.x) * EYE.x, EYE.y, EYE.z)) * vec3(0.85, 1.15, 1.0)); }
// head-local coordinates in the head's own units (the sculpt draws the head HEADS times larger)
vec3 hl(vec3 p) { return (p - HC) / HEADS; }
float isHead(vec3 p) { return smoothstep(0.065, 0.045, length(hl(p) * vec3(1.0, 1.0, 0.9))); }
// position along the tail: 0 at its root, 1 at the tip; and how close to its line we are
float tailT(vec3 p) { return dot(p - TAIL0, TAILV) / dot(TAILV, TAILV); }
float isTail(vec3 p) {
  float t = tailT(p);
  float off = length(p - (TAIL0 + TAILV * clamp(t, 0.0, 1.0)));
  return smoothstep(0.0, 0.08, t) * smoothstep(0.034, 0.024, off);
}
float isLeg(vec3 p) { return smoothstep(LEGTOP, LEGTOP - 0.03, p.y) * (1.0 - isTail(p)); }
float isFace(vec3 p) { vec3 h = hl(p); return isHead(p) * smoothstep(0.012, 0.03, h.z); }

// nose leather: a rounded triangle pointing down, seen from the front
float noseSD(vec3 h) { return sdTriIso(vec2(h.x, h.y + 0.0268), vec2(0.0052, 0.0090)) - 0.0008; }
float lipY(float ax) { return -0.0335 - 0.85 * ax + 26.0 * ax * ax; }

// eyelids: the skin sphere round each eyeball is part of the body; the opening is cut here.
// d is the direction from the eyeball centre in the eye's frame (+z out of the eye). Returns how
// far outside the opening we are (negative inside it), in units of the ball radius.
uniform vec4 uLids;   // upper and lower edge, left eye then right
uniform vec3 uEyeCL;  // eyeball centres, rest pose
uniform vec3 uEyeCR;
uniform mat3 uEyeML;  // rest space -> eye frame
uniform mat3 uEyeMR;
${LID_GLSL}
float lidEdge(vec3 d, float side) {
  if (d.z < 0.0) return 1.0;
  vec2 ul = side > 0.0 ? uLids.xy : uLids.zw;
  vec2 c = lidCurves(d.x, d.x * side, ul);
  float a = d.y - c.x, b = c.y - d.y;
  // never open past the front of the eyeball
  b = max(b, 0.42 - d.z);
  float k = 0.06;
  float hk = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
  float e = mix(b, a, hk) + k * hk * (1.0 - hk);
  return max(e, abs(d.x) - LID_XC);
}
// for a point on the body: x = lid edge distance (1 away from the eyes), y = distance to the eyeball
// centre, z = 1 on the upper lid, 0 on the lower
vec3 lidAt(vec3 p) {
  float side = sign(p.x);
  vec3 o = p - (side > 0.0 ? uEyeCL : uEyeCR);
  float r = length(o);
  if (r > EYER * 1.6 * HEADS) return vec3(1.0, r / HEADS, 0.0);
  vec3 d = (side > 0.0 ? uEyeML : uEyeMR) * (o / r);
  vec2 c = lidCurves(d.x, d.x * side, side > 0.0 ? uLids.xy : uLids.zw);
  return vec3(lidEdge(d, side), r / HEADS, step(0.5 * (c.x + c.y), d.y));
}

float faceBare(vec3 p) {
  vec3 h = hl(p);
  float nose = smoothstep(0.0006, -0.0003, noseSD(h)) * step(0.038, h.z);
  return nose;
}

// how much the hair lies down along the skin (0 standing .. 1 flat)
float lie(vec3 p) {
  // a cat's coat is long hair lying low: thick in volume, never standing up
  float l = 0.8;
  l = mix(l, 0.82, isHead(p));
  l = mix(l, 0.75, isLeg(p));
  l = mix(l, 0.5, isTail(p));
  return l;
}

float furLength(vec3 p, float reg, vec3 aux) {
  // outer ear: short; inside: long furnishings growing from the edge nearer the midline and low down
  if (reg > 0.5) return reg > 1.5 ? 0.0032 : max(0.0105 * (0.25 + 0.75 * smoothstep(0.55, -0.6, aux.y)) * smoothstep(0.92, 0.4, aux.x), 0.0024);
  vec3 h = hl(p);
  // lengths of the coat proper; guard hairs are GUARD times longer (a shorthair's back: ~2 cm)
  float L = 0.0125;
  L = mix(L, 0.0062, isHead(p));                                             // crown, back of the head
  L = mix(L, 0.0036, isFace(p));                                             // short and sleek on the face
  L = mix(L, 0.0075, isFace(p) * smoothstep(0.024, 0.034, abs(h.x)) * smoothstep(0.01, -0.012, h.y)); // cheek ruff
  L = mix(L, 0.0015, smoothstep(0.009, 0.005, abs(h.x)) * smoothstep(0.012, 0.004, h.y) * smoothstep(-0.019, -0.013, h.y) * step(0.036, h.z)); // nose bridge
  L = mix(L, 0.0026, smoothstep(0.015, 0.009, length((h - vec3(0.0, -0.040, 0.026)) * vec3(0.8, 1.0, 1.0)))); // chin
  L = mix(L, 0.0068, isLeg(p));
  L = mix(L, 0.0036, smoothstep(0.035, 0.02, p.y));          // paws
  L = mix(L, 0.0125, isTail(p));
  L = mix(L, 0.0165, smoothstep(0.03, 0.0, length((p - (BIB + vec3(0.0, -0.008, 0.004))) * vec3(1.0, 0.8, 1.3)) - 0.03)); // chest ruff
  L = mix(L, 0.0020, smoothstep(0.017, 0.009, length((h - vec3(0.0, -0.026, 0.044)) * vec3(0.8, 1.0, 1.0))));  // muzzle
  L *= 1.0 - faceBare(p);
  // lids: very short fur that starts a little way back from the bare margin
  vec3 la = lidAt(p);
  L = mix(L, 0.0016 * smoothstep(0.05, 0.22, la.x), smoothstep(EYER * 1.45, EYER * 1.12, la.y));
  return L;
}

vec3 combDir(vec3 p, float reg) {
  vec3 h = hl(p);
  if (reg > 0.5) return normalize(vec3(sign(p.x) * (reg < 1.5 ? 1.0 : 0.45), reg < 1.5 ? 0.3 : 1.0, reg < 1.5 ? 0.15 : -0.15));    // ears: furnishings out across the opening; outside toward the tip
  // body: neck to tail; legs: down; tail: along it
  vec3 d = vec3(0.0, -0.35, -1.0);
  d = mix(d, vec3(0.0, -1.0, -0.15), isLeg(p));
  d = mix(d, normalize(TAILV), isTail(p));
  // head: from the nose up over the skull, back over the cheeks, out from the muzzle, down the chin
  vec3 hd = vec3(0.0, 0.5, -1.0);
  hd = mix(hd, vec3(sign(h.x) * 0.7, -0.35, -1.0), smoothstep(0.012, 0.03, abs(h.x)) * smoothstep(0.012, -0.004, h.y));
  hd = mix(hd, vec3(sign(h.x) * 1.0, -0.15, -0.25), smoothstep(0.03, 0.04, h.z) * smoothstep(0.004, -0.006, h.y));
  hd = mix(hd, vec3(0.0, -1.0, -0.7), smoothstep(-0.011, -0.019, h.y));
  d = mix(d, hd, isHead(p));
  // lids: away from the opening, up over the upper lid and down under the lower one
  vec3 la = lidAt(p);
  float eh = h.y - 0.005;
  d = mix(d, normalize(d + vec3(sign(h.x) * 0.5, 0.25 * clamp(eh / 0.004, -1.0, 1.0), -0.2)), smoothstep(EYER * 1.45, EYER * 1.12, la.y));
  // hair never lies perfectly parallel: let the flow wander a little, more on the body than the face
  vec3 wander = vec3(vnoise(p * 70.0), vnoise(p * 70.0 + 19.1), vnoise(p * 70.0 + 37.3)) - 0.5;
  d = normalize(d) + wander * mix(0.55, 0.2, isFace(p));
  return normalize(d);
}

float whiteMask(vec3 p) {
  float w = 0.0;
  // bib: from the chin down the throat to the chest between the forelegs
  vec3 A = HC + vec3(0.0, -0.034, 0.024) * HEADS, B = BIB + vec3(0.0, -0.02, -0.012);
  vec3 ab = B - A;
  vec3 q = A + ab * clamp(dot(p - A, ab) / dot(ab, ab), 0.0, 1.0);
  w = max(w, smoothstep(0.03, 0.016, length((p - q) * vec3(1.0, 1.25, 1.0))) * 0.85);
  w = max(w, smoothstep(0.034, 0.018, length((p - BIB - vec3(0.0, 0.03, 0.0)) * vec3(1.15, 0.6, 1.0))) * 0.75);
  w = max(w, smoothstep(BELLYY - 0.002, BELLYY - 0.02, p.y) * smoothstep(-0.14, -0.08, p.z) * smoothstep(0.034, 0.022, abs(p.x)) * (1.0 - isLeg(p))); // belly
  w = max(w, smoothstep(0.03, 0.018, p.y) * 0.45);                                                     // pale toes
  vec3 h = hl(p);
  w = max(w, smoothstep(0.009, 0.003, length((h - vec3(0.0, -0.040, 0.026)) * vec3(0.8, 1.1, 1.0))) * 0.6); // chin
  w = max(w, smoothstep(0.0025, 0.001, abs(h.y - lipY(abs(h.x)) + 0.0014)) * smoothstep(0.011, 0.007, abs(h.x)) * step(0.033, h.z) * 0.35); // pale lips

  return clamp(w, 0.0, 1.0);
}

vec3 coat(vec3 p, float reg) {
  // ginger tabby, written in sRGB; sampled from reference photographs
  vec3 ginger = vec3(0.89, 0.58, 0.33);
  vec3 cream = vec3(0.98, 0.87, 0.72);
  vec3 rust = vec3(0.6, 0.23, 0.06);
  vec3 white = vec3(0.95, 0.93, 0.9);
  vec3 h = hl(p);
  float n = fbm(p * 18.0);
  // countershading: paler underneath, a warmer saddle along the back
  vec3 base = mix(ginger, cream, clamp(smoothstep(BACKY - 0.07, BELLYY - 0.01, p.y) * 0.75 + (n - 0.5) * 0.35, 0.0, 1.0));
  base = mix(base, ginger * vec3(0.92, 0.82, 0.75), smoothstep(BACKY - 0.06, BACKY - 0.025, p.y) * (1.0 - isHead(p)) * 0.6);
  float body = (1.0 - isHead(p)) * (1.0 - isLeg(p)) * (1.0 - isTail(p));
  // mackerel stripes: wavy lines about 2.5 cm apart running down the flanks from the spine,
  // unevenly spaced, thick and thin, breaking into dashes low on the side
  vec3 wp = p + (vec3(fbm(p * 7.0), fbm(p * 7.0 + 5.2), fbm(p * 7.0 + 9.7)) - 0.5) * 0.03;
  float phase = wp.z * 230.0 * (0.8 + 0.4 * fbm(p * 3.0 + 1.7)) + fbm(wp * 4.0) * 7.0 + (fbm(wp * 13.0 + 2.3) - 0.5) * 5.0 + abs(wp.x) * 25.0 - (BACKY - 0.03 - wp.y) * 40.0;
  float s = cos(phase);
  float width = 0.18 + 0.5 * fbm(p * 15.0 + 7.0);
  float onSide = smoothstep(BELLYY - 0.01, BACKY - 0.08, p.y);
  float breakup = smoothstep(0.3, 0.55, fbm(p * 28.0 + 3.0) + 0.25 * onSide);
  // soft bands rather than painted lines: the dark band takes up nearly half of each period
  float stripe = smoothstep(0.25 - 0.6 * width, 0.75, s) * onSide * body * (0.45 + 0.55 * breakup);
  // necklaces: broken bands round the front of the chest and throat
  vec3 nk = p - vec3(0.0, 0.205, 0.06);
  float tN = dot(nk, vec3(0.0, 0.33, 0.944)) + (fbm(p * 22.0) - 0.5) * 0.012;
  float under = smoothstep(0.012, -0.012, dot(nk, vec3(0.0, 0.944, -0.33)));
  float neckl = smoothstep(0.2, 0.8, cos(tN * 270.0)) * smoothstep(0.02, 0.034, tN) * smoothstep(0.1, 0.075, tN) * under
              * (1.0 - isHead(p)) * smoothstep(0.3, 0.5, fbm(p * 30.0 + 11.0) + 0.15);
  // a darker line of fused stripes down the spine (on the back only, not the throat below it)
  float dorsal = smoothstep(BACKY - 0.04 + 0.45 * max(p.z - 0.04, 0.0), BACKY - 0.008 + 0.45 * max(p.z - 0.04, 0.0), p.y);
  float spine = smoothstep(0.016, 0.005, abs(wp.x)) * dorsal;
  stripe = max(stripe, (spine * 0.8 + smoothstep(0.022, 0.008, abs(wp.x)) * dorsal * max(s, 0.0) * 0.35) * body);
  // rings round the legs and the tail
  float legR = smoothstep(0.62, 0.95, sin(p.y * 190.0 + n * 3.0)) * isLeg(p) * smoothstep(0.035, 0.07, p.y) * smoothstep(0.3, 0.55, fbm(p * 40.0));
  float tailR = smoothstep(0.2, 0.85, sin(tailT(p) * 27.0 + n * 2.0)) * isTail(p);
  // forehead "M": unbroken wavy lines that start just above the eyes and run back over the crown,
  // the inner ones close to the midline; measured as an angle up and over the skull
  float th = atan(h.y - 0.004, h.z + 0.012);
  float ax = abs(h.x) + (fbm(p * 55.0) - 0.5) * 0.0036 + (fbm(p * 150.0) - 0.5) * 0.0012;
  float lw = 0.0011 + 0.0017 * fbm(p * 35.0 + 4.0);
  float m0 = smoothstep(lw * 0.7, lw * 0.2, ax) * smoothstep(0.45, 0.62, th);
  float m1 = smoothstep(lw, lw * 0.35, abs(ax - (0.0040 + 0.0030 * max(th - 0.2, 0.0)))) * smoothstep(0.1, 0.2, th);
  float m2 = smoothstep(lw * 1.1, lw * 0.35, abs(ax - (0.0094 + 0.0042 * max(th - 0.25, 0.0)))) * smoothstep(0.24, 0.36, th) * smoothstep(2.0, 1.5, th);
  float m3 = smoothstep(lw * 1.1, lw * 0.35, abs(ax - (0.0156 + 0.0048 * max(th - 0.35, 0.0)))) * smoothstep(0.36, 0.5, th) * smoothstep(1.9, 1.4, th);
  float fore = max(max(m0 * 0.55, m1), max(m2 * 0.9, m3 * 0.8));
  fore *= isHead(p) * smoothstep(2.6, 1.9, th) * (0.65 + 0.35 * fbm(p * 80.0)) * smoothstep(0.3, 0.5, fbm(p * 38.0 + 2.0) + 0.12);
  // a line back from the outer corner of each eye, and a second one lower that curves down the cheek
  float wob = (fbm(p * 120.0) - 0.5) * 0.0018;
  float c1w = mix(0.0019, 0.0011, smoothstep(0.012, 0.03, h.z));
  float c1 = smoothstep(c1w, c1w * 0.35, abs(h.y - 0.0055 + 0.12 * (0.033 - h.z) + wob)) * smoothstep(0.036, 0.031, h.z) * smoothstep(0.006, 0.02, h.z);
  float c2 = smoothstep(0.0022, 0.0008, abs(h.y + 0.0135 + 0.5 * (0.03 - h.z) - 40.0 * (0.03 - h.z) * (0.03 - h.z) + wob)) * smoothstep(0.034, 0.025, h.z) * smoothstep(0.0, 0.012, h.z);
  float cheek = max(c1, c2 * 0.85) * smoothstep(0.019, 0.024, abs(h.x)) * isHead(p);
  // pale round the eyes, down the bridge of the nose and over the whisker pads
  float spect = smoothstep(0.0135, 0.0098, eyeDist(h)) * isHead(p);
  float bridge = smoothstep(0.0085, 0.003, abs(h.x) - 0.25 * max(h.y, 0.0)) * smoothstep(0.013, 0.006, h.y) * smoothstep(-0.019, -0.014, h.y) * smoothstep(0.03, 0.038, h.z);
  float muzzle = smoothstep(0.012, 0.006, length((h - vec3(sign(h.x) * 0.0085, -0.029, 0.040)) * vec3(1.0, 1.15, 1.0))) * smoothstep(-0.020, -0.025, h.y);
  // a dark tear line from the inner corner of each eye down beside the nose
  float tear = smoothstep(0.0009, 0.0002, abs(abs(h.x) - (0.0082 + 0.33 * h.y))) * smoothstep(0.001, -0.002, h.y) * smoothstep(-0.013, -0.008, h.y) * step(0.025, h.z);
  float darkAmt = max(legR * 0.5, max(tailR * 0.7, max(fore * 0.9, cheek * 0.9)));
  // rows of dark follicles on the whisker pads
  {
    vec3 q = h - vec3(sign(h.x) * 0.0095, -0.0285, 0.042);
    vec2 g = vec2(abs(h.x) * 620.0, (h.y + 0.0285) * 560.0 + 0.5);
    vec2 cell = fract(g) - 0.5;
    float dots = smoothstep(0.26, 0.12, length(cell)) * smoothstep(0.009, 0.005, length(q * vec3(0.8, 1.3, 1.0))) * step(0.036, h.z);
    darkAmt = max(darkAmt, dots * 0.55 * (1.0 - uSolid));
  }
  // pale spectacles, and a pale band under each eye above the whisker pads
  float underEye = smoothstep(0.012, 0.004, length((h - vec3(sign(h.x) * 0.0145, -0.0095, 0.036)) * vec3(0.8, 1.4, 1.0)));
  vec3 c = mix(base, cream, max(max(spect * 0.75, underEye * 0.35), bridge * 0.8));
  c = mix(c, white * vec3(1.0, 0.95, 0.88), muzzle * 0.6);
  // the coat's own stripes are a deeper ginger, not a different colour
  vec3 deep = vec3(0.74, 0.37, 0.13);
  c = mix(c, deep, stripe * 0.85);
  c = mix(c, rust, darkAmt);
  c = mix(c, white, whiteMask(p));
  c = mix(c, deep * vec3(1.05, 1.1, 1.2), neckl * 0.3);
  // nose leather with nostrils, the groove below it and the mouth
  if (h.z > 0.033) {
    float nd = noseSD(h);
    float nose = smoothstep(0.0004, -0.0003, nd);
    vec3 leather = mix(vec3(0.8, 0.44, 0.37), vec3(0.5, 0.24, 0.19), smoothstep(-0.002, 0.0, nd));
    // the freckles ginger cats get on the nose
    leather = mix(leather, vec3(0.36, 0.18, 0.14), smoothstep(0.9, 0.95, vnoise(h * 3200.0)) * smoothstep(-0.0008, -0.003, nd) * 0.7);
    vec2 q = vec2(abs(h.x) - 0.0026, h.y + 0.0236);
    q = mat2(0.82, -0.57, 0.57, 0.82) * q;
    float nostril = smoothstep(1.15, 0.8, length(q / vec2(0.0015, 0.00055)));
    leather = mix(leather, vec3(0.22, 0.10, 0.09), nostril * (1.0 - uSolid));
    leather = mix(leather, vec3(0.45, 0.22, 0.2), smoothstep(0.00045, 0.0001, abs(h.x)) * smoothstep(-0.0235, -0.027, h.y));
    c = mix(c, leather, nose);
    float ax = abs(h.x);
    float philtrum = smoothstep(0.0007, 0.0002, ax) * step(lipY(0.0), h.y) * step(h.y, -0.028);
    float mouth = smoothstep(0.0009, 0.0002, abs(h.y - lipY(ax))) * smoothstep(0.012, 0.009, ax);
    c = mix(c, vec3(0.42, 0.26, 0.2), max(philtrum * 0.45, mouth * 0.12));
  }
  if (reg > 1.5) c = mix(c, rust, 0.15);                   // back of the ear
  if (reg > 0.5 && reg < 1.5) c = vec3(0.93, 0.68, 0.58);  // inner ear skin
  return lin(c);
}
`;

/** ambient occlusion from capsules round the body and from the floor (world space) */
export const AO_GLSL = /* glsl */ `
uniform vec4 uCaps[${2 * NCAPS}];   // capsules round the body (world): a.xyz + radius, b.xyz
// ambient occlusion from the body's own limbs and trunk (as capsules) and from the floor
float capsuleAO(vec3 p, vec3 n) {
  float vis = 1.0;
  for (int i = 0; i < ${NCAPS}; i++) {
    vec4 A = uCaps[2 * i];
    vec3 B = uCaps[2 * i + 1].xyz;
    vec3 ab = B - A.xyz;
    float t = clamp(dot(p - A.xyz, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
    vec3 d = A.xyz + ab * t - p;
    float l2 = max(dot(d, d), 1e-6);
    float cosT = dot(n, d) * inversesqrt(l2);
    float occ = clamp(cosT, 0.0, 1.0) * clamp(pow(A.w * A.w / l2, 0.75), 0.0, 1.0);
    vis *= 1.0 - 0.7 * occ;
  }
  float hgt = max(p.y, 0.0);
  vis *= 1.0 - 0.4 * clamp(0.5 - 0.5 * n.y, 0.0, 1.0) * exp(-hgt / 0.03);
  return vis;
}
`;

/** the key light's soft shadow, and hair scattering */
export const LIGHT_GLSL = /* glsl */ `
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn;
uniform float uShadowSoft;
const vec2 POISSON[12] = vec2[](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
  vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));

float keyShadow(vec3 wp, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sc = uShadowMatrix * vec4(wp + n * 0.003, 1.0);
  sc.xyz /= sc.w;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float sum = 0.0;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 16.0) * uShadowSoft;
    float a = fi * 2.39996 + ign * 6.2832;
    float d = unpackRGBAToDepth(texture2D(uShadowMap, sc.xy + vec2(cos(a), sin(a)) * r));
    sum += smoothstep(sc.z - 0.003, sc.z - 0.0005, d);
  }
  return sum / 16.0;
}

// Marschner hair scattering, after Karis, "Physically Based Hair Shading in Unreal" (2016)
float hairG(float B, float th) { return exp(-0.5 * th * th / (B * B)) / (2.5066283 * B); }
float hairF(float c) { return 0.0465 + 0.9535 * pow(1.0 - c, 5.0); }
vec3 hairLight(vec3 T, vec3 N, vec3 V, vec3 L, vec3 base, float rough, float shadow) {
  float VoL = dot(V, L);
  float sinL = clamp(dot(T, L), -1.0, 1.0);
  float sinV = clamp(dot(T, V), -1.0, 1.0);
  float cosThetaD = cos(0.5 * abs(asin(sinV) - asin(sinL)));
  vec3 Lp = L - sinL * T;
  vec3 Vp = V - sinV * T;
  float cosPhi = dot(Lp, Vp) * inversesqrt(dot(Lp, Lp) * dot(Vp, Vp) + 1e-4);
  float cosHalfPhi = sqrt(clamp(0.5 + 0.5 * cosPhi, 0.0, 1.0));
  float B0 = max(rough * rough, 0.02);
  const float sh = 0.035;
  vec3 S = vec3(0.0);
  // R: white cuticle highlight, shifted toward the root
  float sa = sin(-2.0 * sh), ca = cos(-2.0 * sh);
  float shift = 2.0 * sa * (ca * cosHalfPhi * sqrt(1.0 - sinV * sinV) + sa * sinV);
  S += uSpec * vec3(hairG(B0 * 1.4142 * cosHalfPhi, sinL + sinV - shift) * 0.25 * cosHalfPhi * hairF(sqrt(clamp(0.5 + 0.5 * VoL, 0.0, 1.0))));
  // TT: light through the hair, glows when lit from behind
  float np = 1.19 / cosThetaD + 0.36 * cosThetaD;
  float a = 1.0 / np;
  float h = cosHalfPhi * (1.0 + a * (0.6 - 0.8 * cosPhi));
  float f = hairF(cosThetaD * sqrt(clamp(1.0 - h * h, 0.0, 1.0)));
  vec3 Tp = pow(base, vec3(0.5 * sqrt(clamp(1.0 - h * h * a * a, 0.0, 1.0)) / cosThetaD));
  S += hairG(B0 * 0.5, sinL + sinV - sh) * exp(-3.65 * cosPhi - 3.98) * (1.0 - f) * (1.0 - f) * Tp;
  // TRT: coloured second highlight toward the tip
  float f2 = hairF(cosThetaD * 0.5);
  S += hairG(B0 * 2.0, sinL + sinV - 4.0 * sh) * exp(17.0 * cosPhi - 16.78) * (1.0 - f2) * (1.0 - f2) * f2 * pow(base, vec3(0.8 / cosThetaD));
  // multiple scattering between hairs: soft, bright, coloured. A coat scatters like a surface, so
  // it follows the skin's normal (the form) more than any single hair's
  float kajiya = 1.0 - abs(sinL);
  vec3 fakeN = normalize(V - T * sinV);
  vec3 Nm = normalize(mix(fakeN, N, 0.8));
  float NoL = clamp((dot(Nm, L) + 0.35) / 1.82, 0.0, 1.0);
  float luma = dot(base, vec3(0.3, 0.59, 0.11));
  vec3 tint = pow(base / max(luma, 1e-4), vec3(1.0 - shadow));
  S += sqrt(base) * (0.3183 * mix(NoL, kajiya * NoL * 1.5, 0.2)) * tint;
  return S;
}
`;

const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
attribute float reg;
attribute vec3 aux;
uniform highp sampler2D uCorr;      // pose correctives (see load.ts)
uniform float uCorrW[NCORR];
uniform float uBreath;    // ribcage expansion, metres
uniform float uPuff;      // 0..1 fur on end
uniform float uShell;     // 0 root .. 1 tip
uniform vec3 uGravity;    // world space, scaled
uniform vec3 uWind;
varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vN;
varying vec3 vT;
varying vec3 vView;
varying vec3 vWorld;
varying float vH;
varying float vReg;
varying float vL;
varying float vAO;
varying vec3 vAux;
${COMMON}
${AO_GLSL}
void main() {
  #include <beginnormal_vertex>
  // the posture's own sculpted shape, added to the bind pose before skinning (body only)
  vec3 corrP = vec3(0.0);
  #if NCORR > 0
  if (reg < 0.5) {
    ivec2 tc = ivec2(gl_VertexID % CORRW, gl_VertexID / CORRW);
    for (int k = 0; k < NCORR; k++) {
      float wk = uCorrW[k];
      if (wk > 0.002) {
        corrP += wk * texelFetch(uCorr, tc + ivec2(0, 2 * k * CORRROWS), 0).xyz;
        objectNormal += wk * texelFetch(uCorr, tc + ivec2(0, (2 * k + 1) * CORRROWS), 0).xyz;
      }
    }
  }
  #endif
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  transformed += corrP;
  // breathing swells the ribs and belly before the skin is moved by the bones
  float rib = smoothstep(0.12, 0.02, length((position - RIBS) * vec3(1.1, 1.0, 0.8)));
  transformed += normal * uBreath * rib * (reg < 0.5 ? 1.0 : 0.0);
  #include <skinning_vertex>
  vec3 n = normalize(objectNormal);
  float puff = uPuff * (1.0 - isFace(position)) * (reg < 0.5 ? 1.0 : 0.3);
  float L = furLength(position, reg, aux) * (1.0 + puff * (0.7 + 1.1 * isTail(position))) * GUARD;
  vec3 comb = combDir(position, reg);
  float lay = lie(position) * (1.0 - puff * 0.75);
  #ifdef USE_SKINNING
    comb = (skinMatrix * vec4(comb, 0.0)).xyz;
  #endif
  comb = normalize(comb - n * dot(comb, n));
  // each hair leaves the skin at an angle, lies along the comb and droops: P(s), and its tangent dP/ds
  float s = uShell;
  vec3 g = inverse(mat3(modelMatrix)) * (uGravity + uWind);
  vec3 rise = n * (1.0 - 0.6 * lay);
  transformed += (rise * s + comb * (lay * 0.9 * s + 0.7 * s * s) + g * 0.5 * s * s) * L;
  vec3 tang = rise + comb * (lay * 0.9 + 1.4 * s) + g * s;
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vRest = position;
  vRestN = normal;
  vAux = aux;
  vN = normalize(mat3(modelMatrix) * n);
  vT = normalize(mat3(modelMatrix) * tang);
  vWorld = wp.xyz;
  vView = cameraPosition - wp.xyz;
  vH = s;
  vReg = reg;
  vL = L;
  vAO = capsuleAO(wp.xyz, vN);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
#include <packing>
uniform float uShell;
uniform vec3 uKeyDir;      // towards the key light, world
uniform vec3 uKeyCol;
uniform vec3 uFillDir;
uniform vec3 uFillCol;
uniform vec3 uRimDir;
uniform vec3 uRimCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform float uDensity;
uniform float uClumpDensity;
uniform float uClump;
uniform float uRough;
uniform float uSpec;
uniform float uDebug;
varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vN;
varying vec3 vT;
varying vec3 vView;
varying vec3 vWorld;
varying float vH;
varying float vReg;
varying float vL;
varying float vAO;
varying vec3 vAux;
${COMMON}

// nearest jittered point of a 3D grid (searching the 8 cells round the sample)
vec3 nearestSeed(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  vec3 o = step(0.5, f) - 1.0;
  float best = 1e9;
  vec3 bp = vec3(0.0);
  for (int k = 0; k < 8; k++) {
    float fk = float(k);
    vec3 c = o + vec3(mod(fk, 2.0), mod(floor(fk * 0.5), 2.0), floor(fk * 0.25));
    vec3 pt = c + 0.15 + 0.7 * hash33(i + c);
    vec3 d = pt - f;
    float dd = dot(d, d);
    if (dd < best) { best = dd; bp = i + pt; }
  }
  return bp;
}

// One population of hairs with roots on a jittered 3D grid. Each hair is a dot drawn out along the
// flow and shrinking toward its tip; the shells' copies of it join into one stroke.
struct Hair { float cov; float t; float guard; vec3 cell; };
Hair hairPop(vec3 rest, vec3 comb, float density, float stretch, float rScale, float guardFrac, float shortLen, float h, float fwRest) {
  Hair o;
  // a lying hair crosses the coat at a shallow angle, moving far along the flow from one shell to
  // the next: its cell is drawn out along the flow so each shell shows a dash long enough to join
  // the next shell's, and the hair reads as a line rather than a row of dots
  vec3 qr = rest * density;
  qr -= comb * dot(qr, comb) * (1.0 - 1.0 / HAIR_E);
  o.cell = floor(qr);
  vec3 jit = hash33(o.cell);
  vec3 off = fract(qr) - (0.2 + jit * 0.6);
  off -= comb * dot(off, comb) * stretch;
  float d = length(off);
  o.guard = step(1.0 - guardFrac, jit.y);
  float own = o.guard > 0.5 ? 1.0 : (shortLen + 0.25 * jit.z) / GUARD;
  o.t = h / own;
  if (o.t > 1.0) { o.cov = 0.0; return o; }
  float r = rScale * pow(1.0 - o.t, 0.35) * (0.75 + 0.5 * jit.z) * (o.guard > 0.5 ? 0.6 : 1.0);
  // anti-aliased edge; once hairs are smaller than a pixel, their average coverage instead
  float fw = fwRest * density;
  float cov = smoothstep(r + 0.6 * fw, r - 0.6 * fw, d);
  float avg = clamp(3.1416 * r * r * 0.9, 0.0, 1.0);
  o.cov = mix(cov, avg, smoothstep(0.6, 1.6, fw));
  return o;
}

${LIGHT_GLSL}

void main() {
  float fwRest = length(fwidth(vRest));
  float H = max(vH, uSolid);
  // the eye opening is cut out of the lids
  vec3 lidI = vReg < 0.5 ? lidAt(vRest) : vec3(1.0, 1.0, 0.0);
  float lidE = lidI.x;
  if (lidE < 0.0) discard;
  bool innerEar = vReg > 0.5 && vReg < 1.5;

  // --- which hair is here: strands gather into clumps toward their tips
  float alpha = 1.0;
  vec3 seed = vec3(0.0);
  float strandShade = 1.0;
  vec3 hairJit = vec3(0.0);
  float paleHair = 0.0;
  float lockTilt = 0.0;
  float guard = 0.0;
  float hairT = 0.0;
  float tuftShade = 1.0;
  float tuftPale = 0.0;
  if (uShell > 0.001) {
    if (lidE < 0.05 || vL < 0.0002) discard;   // bare skin has no hair to draw
    // locks: hair of a lock shares its shade; the pattern is drawn out along the hair flow
    vec3 comb = combDir(vRest, vReg);
    // streaks: noise averaged along the hair flow, so locks run with the fur wherever it turns
    vec3 lp = vRest * uClumpDensity * (1.0 + 1.3 * isFace(vRest));
    float ln = 0.0, ln2 = 0.0, lpart = 0.0;
    for (int k = -2; k <= 2; k++) {
      vec3 q = lp + comb * (float(k) * 1.1);
      ln += vnoise(q);
      ln2 += vnoise(q * 2.3 + 13.0);
      lpart += vnoise(q * 1.9 + 7.0);
    }
    ln = clamp((ln / 5.0 - 0.5) * 1.9 + 0.5, 0.0, 1.0);
    ln2 = clamp((ln2 / 5.0 - 0.5) * 1.9 + 0.5, 0.0, 1.0);
    lpart = (lpart / 5.0 - 0.5) * 2.3 + 0.5;
    lockTilt = (ln - 0.5) * 2.0 + (ln2 - 0.5);
    // partings: thin dark lines where neighbouring locks separate and the undercoat shows
    float part = smoothstep(0.08, 0.0, abs(ln - 0.5)) * 0.7 + smoothstep(0.06, 0.0, abs(lpart - 0.5)) * 0.4;
    seed = vec3(ln, ln2, part);
    // clumps: hairs gather toward a tuft centre as they rise, leaving gaps between tufts. Find the
    // tuft this spot belongs to (cells drawn out along the flow) and undo the gathering in the skin's
    // plane to find which hair's root lands here.
    vec3 rn = normalize(vRestN);
    vec3 cx = vRest * uClumpDensity * mix(0.6, 1.0, isFace(vRest));
    cx -= comb * dot(cx, comb) * 0.6;
    vec3 cc = nearestSeed(cx);
    vec3 dc = (cx - cc) / (uClumpDensity * mix(0.6, 1.0, isFace(vRest)));
    dc -= rn * dot(dc, rn);
    float kc = uClump * smoothstep(0.15, 1.0, H) * (innerEar ? 0.2 : 1.0) * smoothstep(0.002, 0.005, vL);
    // two populations: coarse guard and awn hairs, thinner where the coat is short, and a fine
    // down three times denser that carries the texture close up
    vec3 restA = vRest + dc * (kc / (1.0 - kc));
    vec3 restB = vRest + dc * (0.5 * kc / (1.0 - 0.5 * kc));
    float shortCoat = smoothstep(0.0075, 0.0035, vL);
    Hair A = hairPop(restA, comb, uDensity, 0.62, mix(0.56, 0.3, shortCoat), 0.2, 0.82, H, fwRest);
    Hair B = hairPop(restB, comb, uDensity * 3.0, 0.8, mix(0.36, 0.46, shortCoat), 0.0, 0.7, H, fwRest);
    if (innerEar) { A.cov *= step(hash33(A.cell).y, 0.4) * 0.9; B.cov *= 0.12; }
    alpha = 1.0 - (1.0 - A.cov) * (1.0 - B.cov);
    // hairs finer than a pixel are drawn as their average, but that average still gathers into
    // tufts: each tuft narrows toward its tip, leaving gaps that show the shadowed coat below
    float cdens = uClumpDensity * mix(0.6, 1.0, isFace(vRest));
    float avgW = smoothstep(0.6, 1.6, fwRest * uDensity) * (innerEar ? 0.0 : 1.0);
    float tuftR = (0.6 / cdens) * (1.0 - 0.8 * kc);
    float tuftMask = smoothstep(tuftR + fwRest, tuftR - fwRest, length(dc));
    alpha = mix(alpha, min(1.0, alpha / max(1.0 - 0.8 * kc, 0.25)) * tuftMask, avgW);
    if (alpha < 0.02) discard;
    // each tuft has its own shade, and some tufts are bleached paler toward their tips
    vec3 tj = hash33(cc + 71.0);
    tuftShade = mix(1.0, 0.78 + 0.44 * tj.x, smoothstep(0.1, 0.6, H) * (innerEar ? 0.0 : 1.0));
    tuftPale = step(0.55, tj.y) * smoothstep(0.45, 0.95, H) * (innerEar ? 0.0 : 1.0);
    bool useA = A.cov >= B.cov;
    vec3 cell = useA ? A.cell : B.cell + 1000.0;
    vec3 jit = hash33(cell);
    guard = useA ? A.guard : 0.0;
    hairT = useA ? A.t : B.t;
    // each hair and each lock catches the light a little differently; once hairs are smaller than
    // a pixel their differences average out rather than sparkle
    float resolved = 1.0 - smoothstep(0.6, 1.8, fwRest * (useA ? uDensity : uDensity * 3.0));
    strandShade = mix(1.0, 0.72 + 0.56 * jit.x * jit.x, resolved);
    hairJit = (hash33(cell + 17.0) - 0.5) * 0.5 * resolved;
    paleHair = mix(0.3, step(0.7, hash13(cell + 3.0)), resolved);
  }

  // --- colour: the coat at the tips, paler undercoat at the roots, clump-to-clump variation
  vec3 tip = coat(vRest, vReg);
  // undercoat: paler, toward cream at the root; guard hairs carry the coat colour, bleached at the tip
  // pale hair is a warm cream, never grey: tint toward it multiplicatively so the hue holds
  vec3 creamL = lin(vec3(0.98, 0.84, 0.6));
  vec3 under = mix(tip, creamL * (0.6 + 0.4 * dot(tip, vec3(0.33))), 0.22);
  vec3 col = mix(under, tip, guard);
  // tips are paler than the hair below them: the coat looks frosted where the light catches it
  col = mix(col, min(col * vec3(1.32, 1.36, 1.3), vec3(1.0)), smoothstep(0.55, 1.0, hairT) * (0.4 + 0.4 * guard));
  col = mix(mix(tip, under, 0.6), col, smoothstep(0.0, 0.3, H));
  // ginger coats mix deep orange hairs with paler cream ones
  col = mix(col, min(col * vec3(1.25, 1.32, 1.4), vec3(1.0)), paleHair * (0.3 + 0.5 * isFace(vRest)) * smoothstep(0.2, 0.7, H));
  col *= strandShade * tuftShade * (0.7 + 0.45 * seed.x + 0.15 * seed.y) * (1.0 - 0.45 * seed.z * (1.0 - 0.4 * H));
  col = mix(col, min(col * vec3(1.3, 1.42, 1.5), lin(vec3(0.99, 0.9, 0.7))), tuftPale * 0.75);
  float earCup = 1.0;
  if (innerEar) {
    // skin: pink, deepening into shadow down in the funnel and toward the middle
    float deep = (1.0 - smoothstep(0.0, 0.55, vAux.x)) * (1.0 - abs(vAux.y));
    col = mix(lin(vec3(0.66, 0.42, 0.32)), lin(vec3(0.26, 0.13, 0.09)), deep);
    // toward the tip and the outer edge the inside of the ear carries short ginger fur
    float rim = max(smoothstep(0.7, 0.92, vAux.x), smoothstep(0.35, 0.75, vAux.y));
    col = mix(col, tip * 0.85, rim);
    earCup = mix(0.6, 0.2, deep);
    // furnishings: long cream hairs, mostly from the inner edge and the lower half; they stand out
    // of the cup into the light
    if (uShell > 0.001) { col = mix(lin(vec3(0.95, 0.86, 0.72)), tip, rim) * strandShade; earCup = mix(earCup, 1.0, smoothstep(0.2, 0.8, H)); }
  }
  if (uSolid > 0.5) { col = innerEar ? mix(lin(vec3(0.96, 0.72, 0.66)), tip, max(smoothstep(0.75, 0.95, vAux.x), smoothstep(0.45, 0.8, vAux.y))) : tip; earCup = 1.0; }
  float lidW = mix(1.0, mix(1.8, 4.5, lidI.z), uSolid);
  col = mix(lin(vec3(0.08, 0.045, 0.03)), col, smoothstep(0.015 * lidW, 0.05 * lidW, lidE));   // dark lid margin

  vec3 N = normalize(vN), V = normalize(vView), T = normalize(vT + hairJit * smoothstep(0.1, 0.6, H));
  // locks are little ridges: tilt the normal across the flow so they catch the light in streaks
  vec3 Bn = normalize(cross(N, T) + 1e-5);
  float lockAmt = smoothstep(0.0015, 0.004, vL);
  N = normalize(N + Bn * lockTilt * 0.45 * lockAmt);
  // each lock's hairs also point a little their own way, so the sheen breaks into streaks
  T = normalize(T + (Bn * (seed.y - 0.5) * 0.9 + N * (seed.x - 0.5) * 0.7) * lockAmt);
  // light reaching into the coat: deeper hairs see less of it
  float depthL = mix(0.36, 1.0, pow(H, 0.6));
  float furDepth = mix(1.0, depthL, smoothstep(0.0006, 0.0025, vL));
  if (innerEar) furDepth = mix(0.85, 1.0, H);
  float sh = keyShadow(vWorld, N);
  // near the root the hair's own direction matters less than the skin under it
  vec3 Ts = normalize(mix(N, T, smoothstep(0.0, 0.25, H)));
  vec3 c = vec3(0.0);
  float bareSkin = 1.0 - smoothstep(0.0, 0.0005, vL);
  vec3 absorb = col * col;
  vec3 keyHair = hairLight(Ts, N, V, uKeyDir, absorb, uRough, sh);
  vec3 keySkin = col * 0.3183 * clamp((dot(N, uKeyDir) + 0.2) / 1.2, 0.0, 1.0);
  c += uKeyCol * sh * mix(keyHair, keySkin, bareSkin);
  c += uFillCol * hairLight(Ts, N, V, uFillDir, absorb, uRough, 1.0);
  c += uRimCol * hairLight(Ts, N, V, uRimDir, absorb, uRough, 1.0);
  // sky and floor bounce
  vec3 amb = mix(uGroundCol, uSkyCol, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
  float lum = max(dot(col, vec3(0.3, 0.59, 0.11)), 1e-4);
  vec3 warm = col * pow(col / lum, vec3(0.35));
  c += amb * warm * (0.8 + 0.2 * H);
  c *= furDepth * vAO * earCup;
  // pixel art: two soft tones of flat colour under the key light; the palette does the rest
  // (0.87 undoes the exposure the pixel pass applies, so the lit side is the coat's own colour)
  if (uSolid > 0.5) {
    float lit = smoothstep(0.3, 0.6, dot(normalize(vN), uKeyDir) * 0.5 + 0.5) * mix(0.55, 1.0, sh);
    c = col * mix(0.64, 1.0, lit) * mix(0.82, 1.0, vAO) * 0.87;
  }
  // ears are thin: light from behind glows through them
  if (vReg > 0.5 && uSolid < 0.5) {
    float thin = 1.0 - 0.7 * smoothstep(0.0, 0.5, 1.0 - vAux.x) * (1.0 - abs(vAux.y));
    float back = max(dot(-N, uKeyDir), 0.0);
    c += uKeyCol * sh * lin(vec3(0.95, 0.45, 0.32)) * back * thin * 0.15;
  }

  if (uDebug > 0.5) {
    if (uDebug < 1.5) c = vec3(vL / 0.008);
    else if (uDebug < 2.5) c = N * 0.5 + 0.5;
    else if (uDebug < 3.5) c = vec3(vAO);
    else if (uDebug < 4.5) c = vec3(sh);
    else if (uDebug < 5.5) c = col;
    else if (uDebug < 6.5) c = uKeyCol * sh * keyHair;
    else if (uDebug < 7.5) c = amb * col;
    else if (uDebug < 8.5) c = vec3(alpha);
    else c = lin(vec3(0.80, 0.48, 0.22));
  }
  gl_FragColor = vec4(c, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface FurOptions {
  shells: number;
  density: number;
}

export interface Anatomy {
  headScale?: number;
  eyeRadius: number;
  head: number[]; tailBase: number[]; tailVec: number[]; legTop: number; backY: number; bellyY: number; bib: number[]; ribs: number[];
}

const v3 = (a: number[]) => `vec3(${a.map((x) => x.toFixed(5)).join(', ')})`;

export function makeFurMaterials(opts: FurOptions, an: Anatomy, corr: Correctives | null = null) {
  const defines = {
    NCORR: corr ? corr.poses.length : 0,
    CORRW: corr ? corr.width : 1,
    CORRROWS: corr ? corr.rows : 1,
    GUARD: GUARD_LEN.toFixed(3),
    HAIR_E: '3.5',
    EYER: (an.eyeRadius / (an.headScale ?? 1)).toFixed(5),
    HEADS: (an.headScale ?? 1).toFixed(4),
    HEAD_C: v3(an.head), TAIL0: v3(an.tailBase), TAILV: v3(an.tailVec),
    LEGTOP: an.legTop.toFixed(4), BACKY: an.backY.toFixed(4), BELLYY: an.bellyY.toFixed(4), BIB: v3(an.bib), RIBS: v3(an.ribs),
  };
  const shared = {
    uKeyDir: { value: new THREE.Vector3(-0.55, 0.75, 0.6).normalize() },
    uKeyCol: { value: new THREE.Color(1.0, 0.97, 0.93).multiplyScalar(3.2) },
    uFillDir: { value: new THREE.Vector3(0.8, 0.25, 0.45).normalize() },
    uFillCol: { value: new THREE.Color(0.95, 0.95, 1.0).multiplyScalar(0.3) },
    uRimDir: { value: new THREE.Vector3(0.3, 0.55, -0.8).normalize() },
    uRimCol: { value: new THREE.Color(1.0, 0.97, 0.92).multiplyScalar(0.5) },
    uSkyCol: { value: new THREE.Color(0.34, 0.34, 0.35) },
    uGroundCol: { value: new THREE.Color(0.22, 0.2, 0.18) },
    uGravity: { value: new THREE.Vector3(0, -0.35, 0) },
    uWind: { value: new THREE.Vector3(0, 0, 0) },
    uDensity: { value: opts.density },
    uClumpDensity: { value: 260 },
    uClump: { value: 0.7 },
    uRough: { value: 0.46 },
    uSpec: { value: 0.85 },
    uDebug: { value: 0 },
    uSolid: { value: 0 },
    uBreath: { value: 0 },
    uPuff: { value: 0 },
    uLids: { value: new THREE.Vector4(0.62, -0.5, 0.62, -0.5) },
    uEyeCL: { value: new THREE.Vector3() },
    uEyeCR: { value: new THREE.Vector3() },
    uEyeML: { value: new THREE.Matrix3() },
    uEyeMR: { value: new THREE.Matrix3() },
    uCaps: { value: Array.from({ length: 2 * NCAPS }, () => new THREE.Vector4(0, -10, 0, 0)) },
    uShadowMap: { value: null as THREE.Texture | null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uShadowOn: { value: 0 },
    uShadowSoft: { value: 0.006 },
    // the room's lamp (a warm point light, off by day) and how much daylight there is
    uLampPos: { value: new THREE.Vector3(0, 1, 0) },
    uLampInt: { value: 0 },
    uDay: { value: 1 },
    // pixel art in the cat's room: lit by the room's light (roomlight.ts)
    uRoomLit: { value: 0 },
    // the height of what the cat lies, sits or stands on (the floor, the bed, the sill)
    uGround: { value: 0 },
    ...roomLightUniforms(),
    uCorr: { value: corr ? corr.texture : null },
    uCorrW: { value: new Array(Math.max(1, corr ? corr.poses.length : 1)).fill(0) as number[] },
  };
  const mats: THREE.ShaderMaterial[] = [];
  for (let i = 0; i < opts.shells; i++) {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...shared, uShell: { value: opts.shells > 1 ? i / (opts.shells - 1) : 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: i === 0 ? THREE.FrontSide : THREE.DoubleSide,
      // shells are blended in order, skin first: soft where hairs are finer than a pixel
      transparent: i > 0,
      depthWrite: i === 0,
      defines,
    });
    mats.push(m);
  }
  return { mats, shared, defines };
}
