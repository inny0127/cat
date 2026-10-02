import * as THREE from 'three';
import { COMMON, AO_GLSL, LIGHT_GLSL } from './fur';
import type { StrandRoots } from './load';

/**
 * Guard hairs drawn one by one over the shell coat. Shells give the dense coat its colour and
 * depth; at the outline and up close it is the long guard hairs standing out of it, each catching
 * the light on its own, that read as fur. Each hair is a camera-facing ribbon following the same
 * growth law as the shells (out of the skin, along the flow, drooping), skinned with its root's
 * bones and carried by the posture correctives at its root. Hairs thinner than a pixel are drawn a
 * pixel wide and correspondingly transparent.
 */

const SEGMENTS = 6;

const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
attribute float strandU;
attribute float strandSide;
attribute vec3 rootPos;
attribute vec3 rootNrm;
attribute float rootVid;
attribute float rootSeed;
attribute float rootReg;
attribute vec3 rootAux;
uniform highp sampler2D uCorr;
uniform float uCorrW[NCORR];
uniform vec3 uGravity;
uniform vec3 uWind;
uniform float uPuff;
uniform float uPx;
uniform float uStrandWidth;
uniform float uStrandLen;
${AO_GLSL}
varying vec3 vCol;
varying vec3 vT;
varying vec3 vN;
varying vec3 vView;
varying vec3 vWorld;
varying float vU;
varying float vAlpha;
varying float vAO;
${COMMON}
void main() {
  vec3 p0 = rootPos;
  vec3 corrP = vec3(0.0), corrN = vec3(0.0);
  #if NCORR > 0
  int vid = int(rootVid + 0.5);
  ivec2 tc = ivec2(vid % CORRW, vid / CORRW);
  for (int k = 0; k < NCORR; k++) {
    float wk = uCorrW[k];
    if (wk > 0.002 && rootVid >= 0.0) {
      corrP += wk * texelFetch(uCorr, tc + ivec2(0, 2 * k * CORRROWS), 0).xyz;
      corrN += wk * texelFetch(uCorr, tc + ivec2(0, (2 * k + 1) * CORRROWS), 0).xyz;
    }
  }
  #endif
  float r1 = fract(rootSeed * 7.31), r2 = fract(rootSeed * 13.7), r3 = fract(rootSeed * 31.3);
  // ear furnishings (rootReg 1) grow from the inner skin of the ear, across its opening
  bool ear = rootReg > 0.5;
  float puff = ear ? 0.0 : uPuff * (1.0 - isFace(p0));
  float L = furLength(p0, rootReg, rootAux) * (ear ? (rootReg < 1.5 ? 1.45 : 1.6) : GUARD) * uStrandLen * (0.7 + 0.6 * r1) * (1.0 + puff * (0.7 + 1.1 * isTail(p0)));
  vec3 n = normalize(rootNrm + corrN);
  vec3 comb = combDir(p0, rootReg);
  comb = normalize(comb - n * dot(comb, n));
  // each guard hair leans its own way a little, and stands a little prouder than the coat
  vec3 jb = normalize(cross(n, comb));
  comb = normalize(comb + jb * (r2 - 0.5) * 0.7);
  float lay = ear ? (rootReg < 1.5 ? 0.3 + 0.35 * r3 : 0.45 + 0.3 * r3) : lie(p0) * (0.6 + 0.4 * r3) * (1.0 - puff * 0.75);
  float s = strandU;
  vec3 rise = n * (1.0 - 0.6 * lay);
  vec3 pos = p0 + corrP + (rise * s + comb * (lay * 0.9 * s + 0.7 * s * s)) * L;
  vec3 tan = rise + comb * (lay * 0.9 + 1.4 * s);

  vec3 objectNormal = n;
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  vec3 transformed = pos;
  #include <skinning_vertex>
  vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  wp += (uGravity + uWind) * 0.5 * s * s * L;
  vec3 wt = normalize(mat3(modelMatrix) * (skinMatrix * vec4(tan, 0.0)).xyz + (uGravity + uWind) * s * 0.5);
  vec3 wn = normalize(mat3(modelMatrix) * objectNormal);

  // a ribbon turned to the camera; never thinner than about half a pixel, fading instead
  vec3 toCam = cameraPosition - wp;
  float dist = length(toCam);
  vec3 side = normalize(cross(wt, toCam) + 1e-6);
  float w = uStrandWidth * (1.0 - 0.8 * s);
  float ww = max(w, 0.55 * uPx * dist);
  // a guard hair is buried in the coat for the first half of its length: only the part that
  // stands out of the coat is drawn (the shells draw the rest)
  vAlpha = (w / ww) * step(0.0004, L) * (ear ? 1.0 : smoothstep(0.32, 0.6, s));
  wp += side * strandSide * ww * 0.5;

  vec3 col = (ear && rootReg < 1.5 ? lin(vec3(0.97, 0.91, 0.8)) : coat(p0, rootReg)) * (ear ? 0.7 + 0.45 * r2 : 1.0);
  // what shows of a guard hair is its tip, bleached toward cream
  vec3 paleTip = mix(min(col * vec3(1.35, 1.45, 1.5), vec3(1.0)), lin(vec3(0.98, 0.88, 0.66)), 0.35);
  vCol = mix(col, paleTip, smoothstep(0.35, 0.95, s) * (0.55 + 0.45 * r3)) * (0.85 + 0.35 * r2);
  vT = wt;
  vN = wn;
  vWorld = wp;
  vView = cameraPosition - wp;
  vU = s;
  vAO = capsuleAO(wp, wn);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = /* glsl */ `
#include <packing>
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uFillDir;
uniform vec3 uFillCol;
uniform vec3 uRimDir;
uniform vec3 uRimCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform float uRough;
uniform float uSpec;
uniform float uStrandAlpha;
${LIGHT_GLSL}
varying vec3 vCol;
varying vec3 vT;
varying vec3 vN;
varying vec3 vView;
varying vec3 vWorld;
varying float vU;
varying float vAlpha;
varying float vAO;
void main() {
  float a = vAlpha * uStrandAlpha * (1.0 - smoothstep(0.75, 1.0, vU));
  if (a < 0.004) discard;
  vec3 T = normalize(vT), N = normalize(vN), V = normalize(vView);
  float sh = keyShadow(vWorld, N);
  vec3 absorb = vCol * vCol;
  vec3 c = uKeyCol * sh * hairLight(T, N, V, uKeyDir, absorb, uRough, sh);
  c += uFillCol * hairLight(T, N, V, uFillDir, absorb, uRough, 1.0);
  c += uRimCol * hairLight(T, N, V, uRimDir, absorb, uRough, 1.0);
  vec3 amb = mix(uGroundCol, uSkyCol, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
  c += amb * vCol;
  // the root end sits down in the coat's shade
  c *= vAO * mix(0.6, 1.0, smoothstep(0.3, 0.6, vU));
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makeStrands(roots: StrandRoots, shared: Record<string, { value: unknown }>, defines: Record<string, string | number>) {
  const base = new THREE.InstancedBufferGeometry();
  const u: number[] = [], side: number[] = [], idx: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    for (const sd of [-1, 1]) { u.push(i / SEGMENTS); side.push(sd); }
    if (i < SEGMENTS) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  // a dummy position keeps three.js happy; the shader builds every vertex from the root
  base.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(u.length * 3), 3));
  base.setAttribute('strandU', new THREE.Float32BufferAttribute(u, 1));
  base.setAttribute('strandSide', new THREE.Float32BufferAttribute(side, 1));
  base.setIndex(idx);
  base.setAttribute('rootPos', new THREE.InstancedBufferAttribute(roots.pos, 3));
  base.setAttribute('rootNrm', new THREE.InstancedBufferAttribute(roots.nrm, 3));
  base.setAttribute('skinIndex', new THREE.InstancedBufferAttribute(roots.jnt, 4));
  base.setAttribute('skinWeight', new THREE.InstancedBufferAttribute(roots.wgt, 4));
  base.setAttribute('rootVid', new THREE.InstancedBufferAttribute(roots.vid, 1));
  base.setAttribute('rootSeed', new THREE.InstancedBufferAttribute(roots.seed, 1));
  base.setAttribute('rootReg', new THREE.InstancedBufferAttribute(roots.reg, 1));
  base.setAttribute('rootAux', new THREE.InstancedBufferAttribute(roots.aux, 3));
  base.instanceCount = roots.count;
  base.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.15, 0), 0.6);

  const local = {
    uPx: { value: 0.001 },
    uStrandWidth: { value: 0.00009 },
    uStrandLen: { value: 1.0 },
    uStrandAlpha: { value: 1.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...shared, ...local },
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return { geometry: base, material: mat, uniforms: local };
}
