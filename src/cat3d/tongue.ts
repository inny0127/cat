import * as THREE from 'three';
import { PIX, PIX_GLSL } from './pixclass';
import { ROOM_LIGHT_GLSL } from './roomlight';

/**
 * The tongue: a little pink spoon of a thing that lives in the mouth and comes out to lick (the
 * nose after a boop, a paw to wash the face with, water lapped up, a finger held still). It rides
 * on the jaw: in, it lies behind the lips, out of sight; out, it slides forward past them, and its
 * tip curls up (to the nose, a finger) or down (lapping, a paw held below the chin).
 */
const VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform float uSolid;
uniform float uRoomLit;
uniform vec3 uKeyDir;
uniform vec3 uLampPos;
uniform float uLampInt;
${PIX_GLSL}
${ROOM_LIGHT_GLSL}
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  // (wet: a little more light on it than on the coat round it)
  vec3 lt = uRoomLit > 0.5 ? roomLight(vWorld, N, 1.0, 0.85) * vec3(1.12, 1.0, 1.0)
    : vec3(0.3 + 0.55 * max(dot(N, uKeyDir), 0.0), 0.0, 0.0);
  if (uSolid > 0.5) { gl_FragColor = pixOutLit(${PIX.tongue}, lt, 0.0); return; }
  gl_FragColor = vec4(vec3(0.86, 0.46, 0.5) * (0.35 + 0.8 * lt.x), 1.0);
}`;

export interface Tongue {
  mesh: THREE.Mesh;
  /** where its root lies in the jaw's frame, in */
  rest: THREE.Vector3;
}

/** the tongue, its root at `root` (the model's rest frame), on a jaw bone whose rest position is
 *  `jawRest`; lit as the coat is (the cat's shared uniforms) */
export function makeTongue(root: THREE.Vector3, jawRest: THREE.Vector3, shared: Record<string, { value: unknown }>): Tongue {
  // (about a centimetre and a half wide and two long, thin, rounded at the tip; its root at the
  // origin, lying along +z)
  const g = new THREE.SphereGeometry(1, 14, 8);
  g.scale(0.0072, 0.0022, 0.0105);
  g.translate(0, 0, 0.0105);
  const mat = new THREE.ShaderMaterial({ uniforms: { ...shared }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  const rest = root.clone().sub(jawRest);
  mesh.position.copy(rest);
  return { mesh, rest };
}

/** how far out it is (0 in .. 1 as far as it goes, about a centimetre and a half past the lips) and
 *  which way its tip curls (-1 down, lapping .. 1 up, to the nose) */
export function poseTongue(t: Tongue, out: number, up: number) {
  const o = Math.max(0, Math.min(1, out));
  t.mesh.visible = o > 0.02;
  if (!t.mesh.visible) return;
  t.mesh.position.set(t.rest.x, t.rest.y - 0.002 * o, t.rest.z + 0.016 * o);
  // (a rotation about x by a positive angle takes the tip down)
  t.mesh.rotation.x = -Math.max(-1, Math.min(1, up)) * 0.6 * o + 0.12 * o;
  // (spread and lengthened as it comes out)
  t.mesh.scale.set(0.85 + 0.15 * o, 1, 0.7 + 0.3 * o);
}
