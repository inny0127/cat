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
${AO_GLSL}
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
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
${GRADE_GLSL}
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
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makeSkinMaterial(map: THREE.Texture, shared: Record<string, { value: unknown }>) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uMap: { value: map }, uSolidGain: { value: 1.7 }, uSolidSat: { value: 1.3 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}
