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
// where this bit of coat is on the cat standing at rest (the stripes are laid out by it)
varying vec3 vRest;
// 0 the coat; 1 the inside of the mouth (aux: how deep in from the lips, the tongue's side);
// 2 a tooth (aux: its root)
attribute float reg;
attribute vec3 aux;
varying float vReg;
varying vec3 vAux;
uniform float uPuff;
uniform float uBonePuff[NBONES];
uniform float uBoneRib[NBONES];
uniform float uBreath;    // the ribcage's swell, metres
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
  // breathing: the ribs and belly swell and settle (more than the fur's, to be seen at all at a few
  // millimetres to the art pixel)
  if (reg < 0.5) {
    float rib = 0.0;
    for (int i = 0; i < 4; i++) rib += skinWeight[i] * uBoneRib[int(skinIndex[i])];
    transformed += normal * uBreath * 1.8 * rib;
  }
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vN = normalize(mat3(modelMatrix) * objectNormal);
  vWorld = wp.xyz;
  vUv = uv;
  vRest = position;
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
uniform float uGround;
${GRADE_GLSL}
${PIX_GLSL}
${ROOM_LIGHT_GLSL}
varying float vReg;
varying vec3 vAux;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
varying float vAO;
varying vec3 vRest;
${LIGHT_GLSL}
// a ginger tabby's stripes on the body and the tail, laid out as a pixel artist would draw them: a
// dark line along the spine, bands down the flanks from it a few centimetres apart, leaning back a
// little and now and then broken, bars across the thighs and rings round the tail (the painting's
// own stripes, at a few millimetres to the art pixel, come out as dabs). The head keeps its own.
float hashT(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
int tabby(int cls, vec3 P) {
  // (the top and back of the head are ginger all over: the painting's light tufts there come out
  // as white specks)
  if (cls == ${PIX.white} && P.z > 0.085 && P.z < 0.165 && P.y > 0.255) return ${PIX.ginger};
  if (cls != ${PIX.ginger} && cls != ${PIX.stripe} && cls != ${PIX.cream}) return cls;
  if (P.z > 0.085) return cls;
  bool band;
  if (P.z < -0.19) {
    // the tail: rings, closer together toward the tip
    float s = -(P.z + 0.19);
    band = fract(s / mix(0.026, 0.02, clamp(s / 0.2, 0.0, 1.0))) < 0.42;
  } else if (P.y < 0.165) {
    // the thighs and the lower flanks: bars across
    float ph = P.y / 0.024 + 0.4 * sin(P.z * 60.0);
    band = fract(ph) < 0.38 && hashT(vec2(floor(ph), sign(P.x))) > 0.25;
  } else {
    float th = atan(abs(P.x), P.y - 0.2);
    float ph = (P.z + 0.022 * th) / 0.03 + 0.22 * sin(th * 3.0 + P.z * 37.0) + 0.08 * sin(th * 7.0 - P.z * 90.0);
    float k = floor(ph);
    // (each band its own width, and now and then one broken partway down the flank)
    float wide = 0.3 + 0.16 * hashT(vec2(k, 3.0 + sign(P.x)));
    bool broken = hashT(vec2(k, sign(P.x))) > 0.7 && th > 0.6 + 0.6 * hashT(vec2(k, 7.0));
    band = (fract(ph) < wide && !broken) || th < 0.1;
  }
  if (!band) return cls == ${PIX.stripe} ? ${PIX.ginger} : cls;
  return cls == ${PIX.cream} ? ${PIX.ginger} : ${PIX.stripe};
}
void main() {
  if (uSolid > 0.5) {
    // pixel art: which material, and how much light, for the pixel pass to paint from its ramps
    vec3 Np = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
    int cls = vReg > 1.5 ? ${PIX.teeth} : vReg > 0.5 ? (vAux.y > 0.5 ? ${PIX.tongue} : ${PIX.mouth})
      : !gl_FrontFacing ? ${PIX.mouth} : tabby(pixClass(texture2D(uPixMap, vUv).rgb), vRest);
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
      lt.x *= mix(0.62, 1.24, smoothstep(-0.45, 0.75, dot(Np, normalize(vec3(-0.45, 0.8, 0.4)))));
      // and in its own shade low down, where it meets what it lies or stands on (the lower flanks
      // of a loaf, paws tucked under, the belly), as a form darkens toward the ground
      float under = 1.0 - smoothstep(-0.3, 0.6, Np.y);
      lt.x *= 1.0 - 0.5 * under * (1.0 - smoothstep(0.004, 0.085, vWorld.y - uGround));
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
      lt.x *= 1.0 - 0.4 * smoothstep(0.46, 0.14, ndv) * (1.0 - step(0.4, rim));
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
      uBoneRib: { value: bones.map((b) => ({ spine1: 0.75, spine2: 1, chest: 0.85, hips: 0.25 } as Record<string, number>)[b.name] ?? 0) },
      uJawOpen: { value: 0 }, uSnarl: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { NBONES: bones.length },
    // the inside of the mouth is seen from within
    side: THREE.DoubleSide,
  });
}
