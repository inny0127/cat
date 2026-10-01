import * as THREE from 'three';

/**
 * Shell fur. The same skinned body is drawn N times, each shell pushed out along the skinned
 * normal; a 3D strand field decides which texels belong to a hair at that height. Strands are
 * combed toward the tail and sag with gravity, coloured by a procedural ginger-tabby coat that
 * lives in rest-pose space so it moves with the skin.
 */

const COMMON = /* glsl */ `
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

// --- where on the body are we (rest pose, metres; +z forward, +y up)
const vec3 HC = vec3(0.0, 0.240, 0.163);
const vec3 EYE = vec3(0.0195, 0.005, 0.036);   // socket centre, relative to HC (x mirrored)
float eyeDist(vec3 h) { return length((h - vec3(sign(h.x) * EYE.x, EYE.y, EYE.z)) * vec3(0.85, 1.15, 1.0)); }
float isHead(vec3 p) { return smoothstep(0.065, 0.045, length((p - HC) * vec3(1.0, 1.0, 0.9))); }
float isTail(vec3 p) { return smoothstep(-0.19, -0.22, p.z) * smoothstep(0.03, 0.02, abs(p.x)); }
float isLeg(vec3 p) { return smoothstep(0.118, 0.09, p.y) * (1.0 - isTail(p)); }
float isFace(vec3 p) { vec3 h = p - HC; return isHead(p) * smoothstep(0.012, 0.03, h.z); }

// nose leather: a rounded triangle pointing down, seen from the front
float noseSD(vec3 h) { return sdTriIso(vec2(h.x, h.y + 0.0196), vec2(0.0052, 0.0072)) - 0.0010; }
float lipY(float ax) { return -0.0250 - 0.85 * ax + 26.0 * ax * ax; }

// eyelids: the skin sphere round each eyeball is part of the body; the opening is cut here.
// d is the direction from the eyeball centre in the eye's frame (+z out of the eye). Returns how
// far outside the opening we are (negative inside it), in units of the ball radius.
uniform vec4 uLids;   // upper and lower edge, left eye then right
uniform vec3 uEyeCL;  // eyeball centres, rest pose
uniform vec3 uEyeCR;
uniform mat3 uEyeML;  // rest space -> eye frame
uniform mat3 uEyeMR;
float lidEdge(vec3 d, float side) {
  if (d.z < 0.0) return 1.0;
  vec2 ul = side > 0.0 ? uLids.xy : uLids.zw;
  float xo = d.x * side;
  float up = ul.x - 0.9 * d.x * d.x + 0.12 * xo;
  float lo = ul.y + 0.95 * d.x * d.x + 0.16 * xo;
  return max(d.y - up, lo - d.y);
}
// for a point on the body: x = lid edge distance (1 away from the eyes), y = distance to the eyeball centre
vec2 lidAt(vec3 p) {
  float side = sign(p.x);
  vec3 o = p - (side > 0.0 ? uEyeCL : uEyeCR);
  float r = length(o);
  if (r > 0.016) return vec2(1.0, r);
  vec3 d = (side > 0.0 ? uEyeML : uEyeMR) * (o / r);
  return vec2(lidEdge(d, side), r);
}

float faceBare(vec3 p) {
  vec3 h = p - HC;
  float nose = smoothstep(0.0006, -0.0003, noseSD(h)) * step(0.036, h.z);
  return nose;
}

// how much the hair lies down along the skin (0 standing .. 1 flat)
float lie(vec3 p) {
  float l = 0.55;
  l = mix(l, 0.8, isHead(p));
  l = mix(l, 0.65, isLeg(p));
  l = mix(l, 0.3, isTail(p));
  return l;
}

float furLength(vec3 p, float reg) {
  if (reg > 0.5) return reg > 1.5 ? 0.0034 : 0.0068;   // outer ear; long furnishings inside
  vec3 h = p - HC;
  float L = 0.0072;
  L = mix(L, 0.0045, isHead(p));                                             // crown, back of the head
  L = mix(L, 0.0032, isFace(p));                                             // short and sleek on the face
  L = mix(L, 0.0058, isFace(p) * smoothstep(0.028, 0.042, abs(h.x)) * smoothstep(0.01, -0.012, h.y)); // cheek ruff
  L = mix(L, 0.0015, smoothstep(0.009, 0.005, abs(h.x)) * smoothstep(0.012, 0.004, h.y) * smoothstep(-0.016, -0.01, h.y) * step(0.028, h.z)); // nose bridge
  L = mix(L, 0.0026, smoothstep(0.015, 0.009, length((h - vec3(0.0, -0.034, 0.033)) * vec3(0.8, 1.0, 1.0)))); // chin
  L = mix(L, 0.0045, isLeg(p));
  L = mix(L, 0.0030, smoothstep(0.035, 0.02, p.y));          // paws
  L = mix(L, 0.0100, isTail(p));
  L = mix(L, 0.0105, smoothstep(0.03, 0.0, length((p - vec3(0.0, 0.16, 0.10)) * vec3(1.0, 0.8, 1.3)) - 0.03)); // chest ruff
  L = mix(L, 0.0020, smoothstep(0.017, 0.009, length((h - vec3(0.0, -0.021, 0.044)) * vec3(0.8, 1.0, 1.0))));  // muzzle
  L *= 1.0 - faceBare(p);
  // lids: very short fur that starts a little way back from the bare margin
  vec2 la = lidAt(p);
  L = mix(L, 0.0015 * smoothstep(0.14, 0.45, la.x), smoothstep(0.0145, 0.0122, la.y));
  return L;
}

vec3 combDir(vec3 p, float reg) {
  vec3 h = p - HC;
  if (reg > 0.5) return normalize(vec3(sign(p.x) * 0.45, 1.0, -0.15));    // ears: toward the tip
  // body: neck to tail; legs: down; tail: along it
  vec3 d = vec3(0.0, -0.35, -1.0);
  d = mix(d, vec3(0.0, -1.0, -0.15), isLeg(p));
  d = mix(d, normalize(vec3(0.0, -0.11, -0.27)), isTail(p));
  // head: from the nose up over the skull, back over the cheeks, out from the muzzle, down the chin
  vec3 hd = vec3(0.0, 0.5, -1.0);
  hd = mix(hd, vec3(sign(h.x) * 0.7, -0.35, -1.0), smoothstep(0.012, 0.03, abs(h.x)) * smoothstep(0.012, -0.004, h.y));
  hd = mix(hd, vec3(sign(h.x) * 1.0, -0.15, -0.25), smoothstep(0.03, 0.04, h.z) * smoothstep(0.004, -0.006, h.y));
  hd = mix(hd, vec3(0.0, -1.0, -0.7), smoothstep(-0.018, -0.026, h.y));
  d = mix(d, hd, isHead(p));
  // lids: away from the opening, up over the upper lid and down under the lower one
  vec2 la = lidAt(p);
  float eh = h.y - 0.005;
  d = mix(d, vec3(sign(h.x) * 0.4, eh > 0.0 ? 1.0 : -1.0, -0.3), smoothstep(0.0145, 0.0122, la.y));
  return normalize(d);
}

float whiteMask(vec3 p) {
  float w = 0.0;
  w = max(w, smoothstep(0.045, 0.03, length((p - vec3(0.0, 0.135, 0.095)) * vec3(1.1, 0.75, 1.0))));   // bib
  w = max(w, smoothstep(0.118, 0.10, p.y) * smoothstep(-0.13, -0.07, p.z) * (1.0 - isLeg(p) * 0.6)); // belly
  w = max(w, smoothstep(0.034, 0.022, p.y));                                                           // paws
  vec3 h = p - HC;
  w = max(w, smoothstep(0.016, 0.009, length((h - vec3(0.0, -0.034, 0.033)) * vec3(0.8, 1.1, 1.0)))); // chin
  w = max(w, smoothstep(0.0035, 0.0015, abs(h.y - lipY(abs(h.x)) + 0.0012)) * smoothstep(0.014, 0.01, abs(h.x)) * step(0.03, h.z) * 0.8); // white lips
  w = max(w, smoothstep(-0.425, -0.445, p.z) * isTail(p));                                              // tail tip
  return clamp(w, 0.0, 1.0);
}

vec3 coat(vec3 p, float reg) {
  // ginger tabby, written in sRGB like a painter's palette
  vec3 ginger = vec3(0.88, 0.55, 0.25);
  vec3 cream = vec3(0.97, 0.80, 0.56);
  vec3 rust = vec3(0.62, 0.27, 0.08);
  vec3 white = vec3(0.97, 0.95, 0.91);
  vec3 h = p - HC;
  float n = fbm(p * 18.0);
  // countershading: paler underneath, a warmer saddle along the back
  vec3 base = mix(ginger, cream, clamp(smoothstep(0.19, 0.10, p.y) * 0.75 + (n - 0.5) * 0.35, 0.0, 1.0));
  base = mix(base, ginger * vec3(0.92, 0.82, 0.75), smoothstep(0.2, 0.235, p.y) * (1.0 - isHead(p)) * 0.6);
  // mackerel stripes down the flanks from the spine
  float body = (1.0 - isHead(p)) * (1.0 - isLeg(p)) * (1.0 - isTail(p));
  float s = sin(p.z * 135.0 + fbm(p * 11.0) * 7.0 + abs(p.x) * 26.0 - (0.23 - p.y) * 40.0);
  float stripe = smoothstep(0.25, 0.85, s) * smoothstep(0.11, 0.2, p.y) * body * (0.65 + 0.35 * fbm(p * 30.0));
  stripe = max(stripe, smoothstep(0.012, 0.004, abs(p.x)) * smoothstep(0.2, 0.235, p.y) * body * 0.9); // dorsal line
  // rings round the legs and the tail
  float legR = smoothstep(0.3, 0.85, sin(p.y * 150.0 + n * 3.0)) * isLeg(p) * smoothstep(0.035, 0.06, p.y);
  float tailR = smoothstep(0.2, 0.85, sin(length(p.zy - vec2(-0.196, 0.2)) * 95.0 + n * 2.0)) * isTail(p);
  // forehead: thin lines fanning back from between the eyes over the crown (the "M")
  float fx = h.x * (1.0 + 25.0 * max(0.0, 0.03 - h.z)) + (fbm(p * 90.0) - 0.5) * 0.0025;
  float fore = smoothstep(0.55, 0.95, sin(fx * 880.0 + 1.57)) * smoothstep(0.011, 0.022, h.y + 0.15 * h.z) * smoothstep(0.02, 0.011, abs(h.x)) * isHead(p);
  fore *= 0.6 + 0.4 * smoothstep(0.03, -0.01, h.z);
  // two lines back from the outer corner of each eye across the cheek
  float c1 = smoothstep(0.0016, 0.0005, abs(h.y - 0.001 - 0.22 * (h.z - 0.03)));
  float c2 = smoothstep(0.0018, 0.0006, abs(h.y + 0.010 - 0.45 * (h.z - 0.02) - 60.0 * (h.z - 0.02) * (h.z - 0.02)));
  float cheek = max(c1, c2 * 0.8) * smoothstep(0.024, 0.032, abs(h.x)) * smoothstep(0.035, 0.02, h.z) * isHead(p);
  // pale spectacles round the eyes and a pale muzzle
  float spect = smoothstep(0.0175, 0.0135, eyeDist(h)) * isHead(p);
  float muzzle = smoothstep(0.022, 0.012, length((h - vec3(0.0, -0.021, 0.04)) * vec3(0.75, 1.0, 1.0)));
  // a dark tear line from the inner corner of each eye down beside the nose
  float tear = smoothstep(0.0013, 0.0004, abs(abs(h.x) - (0.0112 + 0.33 * h.y))) * smoothstep(0.001, -0.002, h.y) * smoothstep(-0.013, -0.008, h.y) * step(0.025, h.z);
  float darkAmt = max(max(stripe, legR * 0.85), max(tailR, max(fore, max(cheek * 0.85, tear * 0.7))));
  vec3 c = mix(base, cream, max(spect * 0.7, muzzle * 0.75));
  c = mix(c, rust, darkAmt * 0.9);
  c = mix(c, white, whiteMask(p));
  // nose leather with nostrils, the groove below it and the mouth
  if (h.z > 0.036) {
    float nd = noseSD(h);
    float nose = smoothstep(0.0004, -0.0003, nd);
    vec3 leather = mix(vec3(0.86, 0.55, 0.52), vec3(0.72, 0.40, 0.38), smoothstep(-0.003, 0.0, nd));
    vec2 q = vec2(abs(h.x) - 0.0024, h.y + 0.0168);
    q = mat2(0.82, -0.57, 0.57, 0.82) * q;
    float nostril = smoothstep(1.15, 0.8, length(q / vec2(0.0015, 0.00055)));
    leather = mix(leather, vec3(0.22, 0.10, 0.09), nostril);
    leather = mix(leather, vec3(0.45, 0.22, 0.2), smoothstep(0.00045, 0.0001, abs(h.x)) * smoothstep(-0.0168, -0.0195, h.y));
    c = mix(c, leather, nose);
    float ax = abs(h.x);
    float philtrum = smoothstep(0.0007, 0.0002, ax) * step(lipY(0.0), h.y) * step(h.y, -0.0200);
    float mouth = smoothstep(0.0009, 0.0002, abs(h.y - lipY(ax))) * smoothstep(0.012, 0.009, ax);
    c = mix(c, vec3(0.30, 0.17, 0.14), max(philtrum, mouth) * 0.9);
  }
  if (reg > 1.5) c = mix(c, rust, 0.3);                    // back of the ear
  if (reg > 0.5 && reg < 1.5) c = vec3(0.93, 0.74, 0.70);  // inner ear skin
  return lin(c);
}
`;

const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
attribute float reg;
uniform float uShell;     // 0 root .. 1 tip
uniform vec3 uGravity;    // world space, scaled
uniform vec3 uWind;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vT;
varying vec3 vView;
varying float vH;
varying float vReg;
varying float vL;
${COMMON}
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec3 n = normalize(objectNormal);
  float L = furLength(position, reg);
  float h = uShell * L;
  vec3 comb = combDir(position, reg);
  float lay = lie(position);
  #ifdef USE_SKINNING
    comb = (skinMatrix * vec4(comb, 0.0)).xyz;
  #endif
  comb = normalize(comb - n * dot(comb, n));
  // hair leaves the skin at an angle, lies along the comb and droops; the further out, the more it bends
  vec3 g = inverse(mat3(modelMatrix)) * (uGravity + uWind);
  transformed += n * h * (1.0 - 0.6 * lay) + comb * L * (lay * 0.9 * uShell + 0.7 * uShell * uShell) + g * L * uShell * uShell * 0.5;
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vRest = position;
  vN = normalize(mat3(modelMatrix) * n);
  vT = normalize(mat3(modelMatrix) * comb);
  vView = cameraPosition - wp.xyz;
  vH = uShell;
  vReg = reg;
  vL = L;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
}`;

const FRAG = /* glsl */ `
uniform float uShell;
uniform vec3 uLightDir;    // towards the light, world
uniform vec3 uLightCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform float uDensity;
uniform float uDebug;
varying vec3 vRest;
varying vec3 vN;
varying vec3 vT;
varying vec3 vView;
varying float vH;
varying float vReg;
varying float vL;
${COMMON}
void main() {
  // the eye opening is cut out of the lids
  float lidE = vReg < 0.5 ? lidAt(vRest).x : 1.0;
  if (lidE < 0.0) discard;
  // strands: one per small 3D cell, thinning toward the tip
  vec3 q = vRest * uDensity;
  vec3 cell = floor(q);
  vec3 jit = hash33(cell);
  float d = length(fract(q) - (0.25 + jit * 0.5));
  float thick = 0.6 * pow(1.0 - vH, 0.8) * (0.7 + 0.6 * jit.z);
  bool innerEar = vReg > 0.5 && vReg < 1.5;
  if (innerEar) thick *= step(jit.y, 0.3) * 0.7;   // sparse, fine furnishings over pink skin
  if (uShell > 0.001 && (d > thick || lidE < 0.14)) discard;
  float strandShade = 0.85 + 0.3 * jit.x;

  vec3 col = coat(vRest, vReg) * strandShade;
  if (innerEar && uShell > 0.001) col = lin(vec3(0.96, 0.91, 0.84)) * strandShade;
  col *= mix(1.0, 1.12, smoothstep(0.55, 1.0, vH));   // paler tips
  col = mix(lin(vec3(0.13, 0.07, 0.05)), col, smoothstep(0.05, 0.11, lidE));   // dark lid margin
  vec3 N = normalize(vN), V = normalize(vView), L = normalize(uLightDir), T = normalize(vT);
  // Kajiya-Kay: hair lit by its tangent, softened by the skin normal
  float diff = clamp(dot(N, L) * 0.6 + 0.4, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float th = dot(T, H);
  float spec1 = pow(sqrt(max(0.0, 1.0 - th * th)), 90.0);
  float th2 = dot(normalize(T + N * 0.25), H);
  float spec2 = pow(sqrt(max(0.0, 1.0 - th2 * th2)), 24.0);
  // self-shadowing deep in the coat; bare skin and sparse ear hair are open to the light
  float ao = mix(1.0, mix(0.32, 1.0, pow(vH, 0.7)), smoothstep(0.0006, 0.0025, vL));
  if (innerEar) ao = mix(0.78, 1.0, vH);
  vec3 amb = mix(uGroundCol, uSkyCol, N.y * 0.5 + 0.5);
  vec3 c = col * (amb * 0.55 + uLightCol * diff * 0.85) * ao;
  c += uLightCol * (spec1 * 0.10 + spec2 * 0.06 * col) * vH;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  c += col * rim * 0.25 * vH;
  if (uDebug > 0.5) c = uDebug < 1.5 ? vec3(vL / 0.008) : (uDebug < 2.5 ? N * 0.5 + 0.5 : vec3(fract(vRest * 100.0)));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export interface FurOptions {
  shells: number;
  density: number;
}

export function makeFurMaterials(opts: FurOptions) {
  const shared = {
    uLightDir: { value: new THREE.Vector3(-0.5, 0.8, 0.6).normalize() },
    uLightCol: { value: new THREE.Color(1.0, 0.95, 0.86) },
    uSkyCol: { value: new THREE.Color(0.85, 0.88, 0.95) },
    uGroundCol: { value: new THREE.Color(0.55, 0.45, 0.38) },
    uGravity: { value: new THREE.Vector3(0, -0.35, 0) },
    uWind: { value: new THREE.Vector3(0, 0, 0) },
    uDensity: { value: opts.density },
    uDebug: { value: 0 },
    uLids: { value: new THREE.Vector4(0.62, -0.5, 0.62, -0.5) },
    uEyeCL: { value: new THREE.Vector3() },
    uEyeCR: { value: new THREE.Vector3() },
    uEyeML: { value: new THREE.Matrix3() },
    uEyeMR: { value: new THREE.Matrix3() },
  };
  const mats: THREE.ShaderMaterial[] = [];
  for (let i = 0; i < opts.shells; i++) {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...shared, uShell: { value: opts.shells > 1 ? i / (opts.shells - 1) : 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: i === 0 ? THREE.FrontSide : THREE.DoubleSide,
    });
    mats.push(m);
  }
  return { mats, shared };
}
