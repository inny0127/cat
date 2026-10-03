import * as THREE from 'three';
import { AO_GLSL, LIGHT_GLSL } from './fur';
import { GRADE_GLSL } from './grade';

/**
 * A painted (textured) coat for a model that brings its own colours instead of the procedural fur:
 * one skinned surface lit by the same lights, shadow and body occlusion as the fur. In pixel art
 * (uSolid) it is two soft tones of the painted colour under the key light, as the fur is.
 */
const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
varying float vAO;
varying float vMouth;
uniform float uPuff;
uniform float uBonePuff[NBONES];
uniform float uJawZ;
${AO_GLSL}
void main() {
  // where the lower jaw blends into the head in front of the hinge: the lips. When the jaw opens
  // these faces stretch, and they are drawn as the inside of the mouth
  float wj = 0.0;
  for (int i = 0; i < 4; i++) wj += int(skinIndex[i]) == JAW ? skinWeight[i] : 0.0;
  vMouth = 4.0 * wj * (1.0 - wj) * step(uJawZ + 0.008, position.z);
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  // fur on end: a painted coat has no hairs to raise, so the body swells a little instead, most
  // along the back and the tail (the bottle-brush), least on the face and paws, and unevenly, as
  // raised fur is
  if (uPuff > 0.001) {
    float pm = 0.0;
    for (int i = 0; i < 4; i++) pm += skinWeight[i] * uBonePuff[int(skinIndex[i])];
    float rough = fract(sin(dot(position, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    transformed += objectNormal * uPuff * pm * (0.0035 + 0.003 * rough);
  }
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vN = normalize(mat3(modelMatrix) * objectNormal);
  vWorld = wp.xyz;
  vUv = uv;
  vAO = capsuleAO(wp.xyz, vN);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
#include <packing>
uniform sampler2D uMap;
uniform float uSolid;
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uFillDir;
uniform vec3 uFillCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform float uSpec;   // the hair shading below wants it declared
uniform float uJawOpen;
${GRADE_GLSL}
varying float vMouth;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
varying float vAO;
${LIGHT_GLSL}
void main() {
  vec3 col = texture2D(uMap, vUv).rgb;
  vec3 N = normalize(vN);
  float sh = keyShadow(vWorld, N);
  vec3 c;
  if (uSolid > 0.5) {
    col = gradePaint(col);
    // as the fur's pixel-art coat: 0.87 undoes the exposure the pixel pass applies
    float lit = smoothstep(0.3, 0.6, dot(N, uKeyDir) * 0.5 + 0.5) * mix(0.55, 1.0, sh);
    c = col * mix(0.64, 1.0, lit) * mix(0.82, 1.0, vAO) * 0.87;
  } else {
    float wrap = clamp((dot(N, uKeyDir) + 0.3) / 1.3, 0.0, 1.0);
    vec3 amb = mix(uGroundCol, uSkyCol, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
    c = col * (uKeyCol * 0.3183 * wrap * sh + uFillCol * 0.3183 * max(dot(N, uFillDir), 0.0) + amb * 1.4) * vAO;
  }
  // the open mouth (the hiss): dark pink, deeper toward the back
  float mouth = clamp(uJawOpen * 4.0, 0.0, 1.0) * smoothstep(0.25, 0.7, vMouth);
  c = mix(c, vec3(0.26, 0.05, 0.06) * (uSolid > 0.5 ? 1.0 : 0.6), mouth);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** how much each bone's coat stands up when the cat bristles */
function bristle(name: string) {
  if (name.startsWith('tail')) return 1.7;
  if (/^(hips|spine|chest)/.test(name)) return 1;
  if (name.startsWith('neck') || name.startsWith('scap')) return 0.8;
  if (name.startsWith('thigh') || name.startsWith('arm')) return 0.6;
  if (name === 'head') return 0.35;
  if (/^(shin|fore)/.test(name)) return 0.3;
  if (name === 'jaw') return 0.2;
  if (/^(hock|wrist)/.test(name)) return 0.15;
  return 0;   // ears, paws, the root
}

export function makeSkinMaterial(map: THREE.Texture, shared: Record<string, { value: unknown }>, bones: { name: string; pos: number[] }[]) {
  const jaw = bones.findIndex((b) => b.name === 'jaw');
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared, uMap: { value: map }, uSolidGain: { value: 1.7 }, uSolidSat: { value: 1.3 },
      uBonePuff: { value: bones.map((b) => bristle(b.name)) },
      uJawZ: { value: jaw >= 0 ? bones[jaw].pos[2] : 1e3 }, uJawOpen: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { NBONES: bones.length, JAW: jaw },
  });
}
