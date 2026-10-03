import * as THREE from 'three';
import { AO_GLSL, LIGHT_GLSL } from './fur';
import { GRADE_GLSL } from './grade';
import { PIX, PIX_GLSL } from './pixclass';
import { ROOM_LIGHT_GLSL } from './roomlight';

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
// 0 the coat; 1 the inside of the mouth (aux: how deep in from the lips, the tongue's side);
// 2 a tooth (aux: its root)
attribute float reg;
attribute vec3 aux;
varying float vReg;
varying vec3 vAux;
uniform float uPuff;
uniform float uBonePuff[NBONES];
uniform float uJawOpen;
uniform float uSnarl;
${AO_GLSL}
void main() {
  vReg = reg;
  vAux = aux;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  // the teeth grow out of the gums as the mouth opens: shut, they would come through the lips
  if (reg > 1.5) transformed = aux + (transformed - aux) * clamp((uJawOpen - 0.03) * 6.0, 0.0, 1.0);
  // snarling, the upper lip draws up and back off the canines
  else if (reg < 0.5) transformed += vec3(0.0, 0.0028, -0.0012) * aux.z * uSnarl;
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
uniform sampler2D uPixMap;
uniform float uSolid;
uniform vec3 uRimDir;
uniform vec3 uLampPos;
uniform float uLampInt;
uniform float uDay;
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uFillDir;
uniform vec3 uFillCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform float uSpec;   // the hair shading below wants it declared
uniform float uJawOpen;
uniform float uRoomLit;
${GRADE_GLSL}
${PIX_GLSL}
${ROOM_LIGHT_GLSL}
varying float vReg;
varying vec3 vAux;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
varying float vAO;
${LIGHT_GLSL}
void main() {
  if (uSolid > 0.5) {
    // pixel art: which material, and how much light, for the pixel pass to paint from its ramps
    vec3 Np = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
    int cls = vReg > 1.5 ? ${PIX.teeth} : vReg > 0.5 ? (vAux.y > 0.5 ? ${PIX.tongue} : ${PIX.mouth})
      : !gl_FrontFacing ? ${PIX.mouth} : pixClass(texture2D(uPixMap, vUv).rgb);
    float shp = keyShadow(vWorld, Np);
    vec3 Vp = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - max(dot(Np, Vp), 0.0), 2.5) * max(dot(Np, uRimDir), 0.0) * shp;
    vec3 lt;
    if (uRoomLit > 0.5) {
      // in the room: the window, the sun through it, the lamp (roomlight.ts); the window behind
      // lights its edges only while there is daylight in it
      lt = roomLight(vWorld, Np, shp, mix(0.55, 1.0, vAO) * roomAO(vWorld, Np));
      rim *= clamp(uSkyI + uSun, 0.0, 1.0);
      // modelled as a painter models a figure, whatever the room's light: lighter where the body
      // turns up and toward you from the left, darker where it turns down and away
      lt.x *= mix(0.78, 1.14, smoothstep(-0.45, 0.75, dot(Np, normalize(vec3(-0.45, 0.8, 0.4)))));
    } else {
      float direct = smoothstep(-0.15, 0.55, dot(Np, uKeyDir)) * mix(0.25, 1.0, shp);
      // key, sky, fill, and the warm floor bouncing light up under the chin and belly
      float light = (direct * 0.56 + (Np.y * 0.5 + 0.5) * 0.28 + max(dot(Np, uFillDir), 0.0) * 0.2 + max(-Np.y, 0.0) * 0.14) * mix(0.3, 1.0, uDay);
      // the lamp at night
      vec3 toL = uLampPos - vWorld;
      float dl = length(toL);
      vec3 Ld = toL / dl;
      light += uLampInt * (0.3 + 0.7 * max(dot(Np, Ld), 0.0)) * (0.45 + 0.55 * smoothstep(0.1, 0.8, Ld.y)) / (1.0 + dl * dl * 2.6);
      lt = vec3(light * mix(0.55, 1.0, vAO), 0.0, 0.0);
    }
    // the mouth darkens toward the throat
    if (vReg > 0.5 && vReg < 1.5) lt.x *= mix(1.0, 0.15, smoothstep(0.3, 0.95, vAux.x));
    if (!gl_FrontFacing && vReg < 0.5) lt.x *= 0.5;
    // where the body turns away from you (the edge of a leg against the chest, of the head against
    // the shoulders) a shade darker in its own colour, as a pixel artist outlines a form from within;
    // not where the light from behind catches the edge
    if (uRoomLit > 0.5 && gl_FrontFacing) {
      float ndv = max(dot(Np, Vp), 0.0);
      lt.x *= 1.0 - 0.32 * smoothstep(0.34, 0.12, ndv) * (1.0 - step(0.4, rim));
    }
    gl_FragColor = pixOutLit(cls, lt, rim);
    return;
  }
  vec3 col = texture2D(uMap, vUv).rgb;
  // inside the mouth: the lips' skin, then pink gums and palate, the tongue a softer pink, dark
  // toward the throat; the teeth ivory
  if (vReg > 0.5 && vReg < 1.5) {
    float d = vAux.x;
    vec3 wall = mix(vec3(0.72, 0.36, 0.40), vec3(0.88, 0.50, 0.54), vAux.y);
    vec3 inside = mix(wall, vec3(0.20, 0.05, 0.07), smoothstep(0.35, 0.95, d));
    col = mix(col, inside, smoothstep(0.12, 0.3, d));
  } else if (vReg > 1.5) col = vec3(0.97, 0.94, 0.88);
  // the coat seen from inside is only ever seen through the open mouth: the inside of the cheeks
  else if (!gl_FrontFacing) col = vec3(0.45, 0.18, 0.21);
  vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
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

export function makeSkinMaterial(map: THREE.Texture, shared: Record<string, { value: unknown }>, bones: { name: string; pos: number[] }[], pixMap: THREE.Texture | null = null) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared, uMap: { value: map }, uPixMap: { value: pixMap ?? map }, uSolidGain: { value: 1.7 }, uSolidSat: { value: 1.3 },
      uBonePuff: { value: bones.map((b) => bristle(b.name)) },
      uJawOpen: { value: 0 }, uSnarl: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { NBONES: bones.length },
    // the inside of the mouth is seen from within
    side: THREE.DoubleSide,
  });
}
