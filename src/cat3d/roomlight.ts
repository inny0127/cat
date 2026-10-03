import * as THREE from 'three';

/**
 * The light in the cat's room, shared by the room and the cat so they sit in the same air. A room
 * lit by one window is lit the way painters love: the sun comes through the opening in a sharp
 * shape and lies on the floor; the sky through the glass lights whatever faces it, strongly near
 * the window and less and less toward you; the sunlit floor throws a warm light back up; the room
 * behind you fills the shadows a little. At night it is the lamp's warm pool, the fairy lights
 * round the window, and a cool glow from the town outside. Things standing on the floor shade
 * what is close to them (the room's things as capsules, as the cat's body is).
 *
 * The shaders using this declare uKeyDir (toward the sun), uLampPos and uLampInt themselves.
 */
export const NOCC = 24;

export const ROOM_LIGHT_GLSL = /* glsl */ `
uniform float uSun;        // the sun's light through the window (0 once it is down)
uniform vec4 uWin;         // the window's opening: left, right, bottom, top
uniform vec3 uWinBar;      // its glazing bars: the upright's x, the cross bar's y, their half width
uniform float uWinZ;       // the window's wall, z; the room lies toward +z
uniform float uSkyI;       // light from the sky through the window
uniform vec4 uPatch;       // the sunlit patch of floor: x, z, its area and how bright it is
uniform float uAmb;        // light from all round
uniform float uFloorB;     // daylight thrown back off the floor onto the walls and sides of things
uniform vec4 uFill;        // light from the room behind you: its direction and strength
uniform vec4 uFairy;       // the fairy lights' wire: from x, to x, y, z
uniform float uFairyInt;
uniform vec4 uOcc[${2 * NOCC}];   // the room's things: capsules, a.xyz + radius, b.xyz + strength

// is a point in the sun: looking toward the sun from it, do you see out through the window
float sunThrough(vec3 P) {
  if (uKeyDir.z > -0.02) return 0.0;
  float t = (uWinZ - P.z) / uKeyDir.z;
  if (t < 0.0) return 0.0;
  vec2 q = P.xy + uKeyDir.xy * t;
  const float e = 0.004;
  float s = smoothstep(uWin.x - e, uWin.x + e, q.x) * smoothstep(uWin.y + e, uWin.y - e, q.x)
          * smoothstep(uWin.z - e, uWin.z + e, q.y) * smoothstep(uWin.w + e, uWin.w - e, q.y);
  // the glazing bars' shadows
  s *= smoothstep(uWinBar.z - e, uWinBar.z + e, abs(q.x - uWinBar.x));
  s *= smoothstep(uWinBar.z - e, uWinBar.z + e, abs(q.y - uWinBar.y));
  return s;
}

// the sky through the window, as nine small lights spread over the opening
float skyThrough(vec3 P, vec3 N) {
  float s = 0.0;
  for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) {
    vec3 W = vec3(mix(uWin.x, uWin.y, (float(i) + 0.5) / 3.0), mix(uWin.z, uWin.w, (float(j) + 0.5) / 3.0), uWinZ);
    vec3 d = W - P;
    float l2 = dot(d, d);
    float il = inversesqrt(l2 + 1e-5);
    s += max(dot(N, d) * il, 0.0) * max(-d.z * il, 0.0) / (l2 + 0.25);
  }
  return s * (uWin.y - uWin.x) * (uWin.w - uWin.z) / 9.0;
}

// the sunlit floor lights what is near it from below, warm
float patchLight(vec3 P, vec3 N) {
  vec3 d = vec3(uPatch.x, 0.0, uPatch.y) - P;
  float l2 = dot(d, d) + 0.06;
  float il = inversesqrt(l2);
  return uPatch.w * uPatch.z * max(dot(N, d) * il, 0.0) * max(-d.y * il, 0.0) / l2;
}

// the room's things shade the floor and walls close to them
float roomAO(vec3 P, vec3 N) {
  float vis = 1.0;
  for (int i = 0; i < ${NOCC}; i++) {
    vec4 A = uOcc[2 * i];
    vec4 B = uOcc[2 * i + 1];
    if (A.w <= 0.0) continue;
    vec3 ab = B.xyz - A.xyz;
    float t = clamp(dot(P - A.xyz, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
    vec3 d = A.xyz + ab * t - P;
    float l2 = max(dot(d, d), 1e-6);
    float cosT = dot(N, d) * inversesqrt(l2);
    vis *= 1.0 - B.w * clamp(cosT, 0.0, 1.0) * clamp(pow(A.w * A.w / l2, 0.75), 0.0, 1.0);
  }
  return vis;
}

// the light on a point: x all of it, y the share that is the lamp's and the fairy lights' (warm),
// z the share that is the sun's
vec3 roomLight(vec3 P, vec3 N, float shadow, float ao) {
  float sun = uSun * max(dot(N, uKeyDir), 0.0) * sunThrough(P) * shadow;
  float sky = uSkyI * skyThrough(P, N);
  float bounce = patchLight(P, N);
  float fill = uFill.w * (0.3 + 0.7 * max(dot(N, uFill.xyz), 0.0));
  float amb = uAmb * (0.8 + 0.2 * N.y) + uFloorB * (0.5 - 0.5 * N.y);
  // the lamp: a shade open below, so a pool of light under it and a softer glow all round
  vec3 toL = uLampPos - P;
  float dl = length(toL);
  vec3 Ld = toL / max(dl, 1e-4);
  float lamp = uLampInt * (0.3 + 0.7 * max(dot(N, Ld), 0.0)) * (0.35 + 0.65 * smoothstep(0.7, 0.95, Ld.y)) / (1.0 + dl * dl * 4.2);
  vec3 Q = vec3(clamp(P.x, uFairy.x, uFairy.y), uFairy.z, uFairy.w);
  vec3 dq = Q - P;
  float lq = dot(dq, dq);
  float fairy = uFairyInt * (0.4 + 0.6 * max(dot(N, dq) * inversesqrt(lq + 1e-5), 0.0)) / (1.0 + lq * 90.0);
  float warm = (lamp + fairy) * mix(1.0, ao, 0.5);
  float total = sun + (sky + bounce + fill + amb) * ao + warm;
  return vec3(total, warm / max(total, 1e-4), sun / max(total, 1e-4));
}
`;

/** the uniforms ROOM_LIGHT_GLSL reads (merged into the cat's shared uniforms) */
export function roomLightUniforms() {
  return {
    uSun: { value: 0 },
    uWin: { value: new THREE.Vector4(-0.34, 0.34, 0.36, 1.16) },
    uWinBar: { value: new THREE.Vector3(0, 0.856, 0.01) },
    uWinZ: { value: -0.57 },
    uSkyI: { value: 0 },
    uPatch: { value: new THREE.Vector4() },
    uAmb: { value: 0.3 },
    uFloorB: { value: 0 },
    uFill: { value: new THREE.Vector4(0, 0.35, 0.94, 0.15) },
    uFairy: { value: new THREE.Vector4(0, 0, -10, 0) },
    uFairyInt: { value: 0 },
    // (unused slots must be all zero: a Vector4 starts with w = 1, a metre-wide shade at the origin)
    uOcc: { value: Array.from({ length: 2 * NOCC }, () => new THREE.Vector4(0, 0, 0, 0)) },
  };
}

/** how the light is at an hour of the day: the sun's way across the sky, how strong each light is,
 *  and the colour the hour gives what the sun lights, what lies in shade, and the lamp's light */
export interface DayLight {
  /** toward the sun */
  keyDir: THREE.Vector3;
  sun: number;
  sky: number;
  amb: number;
  floorB: number;
  fill: number;
  lamp: number;
  fairy: number;
  tintSun: THREE.Vector3;
  tintShade: THREE.Vector3;
  tintLamp: THREE.Vector3;
  /** how much the light in the air shows (the sunbeam's haze) */
  beam: number;
}

const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

/** how much daylight is in the sky at an hour (0 night .. 1 day): from a while before the sun is
 *  up until a while after it has set */
export function skyDay(hour: number) {
  return ss(5.6, 7.4, hour) * (1 - ss(18.6, 20.3, hour));
}

/** the moon's phase on a date (0 new .. 0.5 full .. 1): an average month of the moon's, counted
 *  from a new moon of January 2000 (right to within a day or so) */
export function moonPhase(d: Date) {
  const p = ((d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5 / 29.530588853) % 1;
  return p < 0 ? p + 1 : p;
}

/** how much of the moon is lit on a date (0 new .. 1 full) */
export function moonLit(d: Date) {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * moonPhase(d));
}

/** how cloudy the sky is (0 clear .. 1 overcast): the same for everyone at the same time, drifting
 *  from one quarter of a day to the next; under rain, overcast */
export function cloudAt(d: Date, rain = 0) {
  const t = d.getTime() / 36e5 / 6;
  const b = Math.floor(t), f = t - b;
  const v = (i: number) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const e = f * f * (3 - 2 * f);
  return Math.max(0.2 + 0.6 * (v(b) + (v(b + 1) - v(b)) * e), rain);
}

/** a morning mist (0 .. 1): some days, more in spring and autumn; it gathers in the small hours,
 *  is thickest about sunrise and is gone by late morning; never under rain */
export function fogAt(d: Date, rain = 0) {
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  const x = Math.sin(day * 7.13 + 3.1) * 43758.5453, r = x - Math.floor(x);
  const m = d.getMonth();
  const chance = m === 2 || m === 3 || m === 4 || m === 8 || m === 9 || m === 10 ? 0.28 : 0.12;
  if (r > chance) return 0;
  const h = d.getHours() + d.getMinutes() / 60;
  // (how thick it is that day)
  const thick = 0.55 + 0.45 * (r / chance);
  return thick * ss(1, 4, h) * (1 - ss(8.6, 10.6, h)) * (1 - rain);
}

/** the light of the hour. The window looks south: the sun rises on the left, stands highest at
 *  midday and sets on the right, low and gold, its patch on the floor long and reaching into the
 *  room; after it, a pink dusk, then night. The lamp is lit as the sun goes down and
 *  put out after it is up again. moon: how much of the moon is lit tonight */
export function dayLight(hour: number, out?: DayLight, rain = 0, moon = 1, fog = 0): DayLight {
  const rise = 6.4, set = 19.1;
  const u = Math.max(0, Math.min(1, (hour - rise) / (set - rise)));
  const up = hour > rise && hour < set ? 1 : 0;
  // across the sky from the left to the right, highest at midday (as a painter would have it:
  // never so low that its patch on the floor leaves the room you see, so that morning and evening
  // it lies long across the floor toward you, the window's cross in it)
  const az = THREE.MathUtils.degToRad(-20 + 40 * u);
  const el = THREE.MathUtils.degToRad(up ? 24 + 26 * Math.pow(Math.sin(Math.PI * u), 0.7) : 24);
  // the sun through the window fades in after it rises and out before it sets
  const sun = ss(rise, rise + 0.8, hour) * (1 - ss(set - 0.9, set - 0.1, hour));
  // daylight in the sky: up before the sun and lingering after it
  const day = skyDay(hour);
  const night = 1 - day;
  // by night the moon, high in the left of the window, lays its own cool patch over the bed and
  // the floor to the right of it, away from the lamp's warm pool, the window's cross in it
  // (a full moon gives its whole light, a thin one only a little)
  const moonUp = ss(0.55, 0.9, night) * (1 - rain) * (0.35 + 0.65 * moon);
  const ma = sun > 0 ? 0 : 1;
  const mAz = THREE.MathUtils.degToRad(-15), mEl = THREE.MathUtils.degToRad(40);
  const keyDir = (out?.keyDir ?? new THREE.Vector3()).set(
    ma ? Math.sin(mAz) * Math.cos(mEl) : Math.sin(az) * Math.cos(el), ma ? Math.sin(mEl) : Math.sin(el),
    ma ? -Math.cos(mAz) * Math.cos(mEl) : -Math.cos(az) * Math.cos(el)).normalize();
  // how gold the light is: the first and last hours of the sun (none under rain clouds)
  const gold = Math.max(1 - ss(rise + 0.3, rise + 2.4, hour), ss(set - 2.6, set - 0.4, hour)) * up * (1 - rain);
  const dusk = Math.max(0, 1 - Math.abs(hour - 19.4) / 1.1) * (1 - up * 0.5);
  const tintSun = ma ? [0.86, 0.93, 1.1] : lerp3([1.07, 1.0, 0.88], [1.2, 0.88, 0.62], gold);
  // (in the gold hours the shade leans the other way, to violet)
  let tintShade = lerp3([1.0, 0.98, 1.0], [0.98, 0.9, 1.0], gold);
  tintShade = lerp3(tintShade, [0.94, 0.84, 1.0], dusk);
  // rain: a grey, blue-ish day
  tintShade = lerp3(tintShade, [0.9, 0.94, 1.04], rain * day);
  tintShade = lerp3(tintShade, [0.6, 0.63, 0.9], night * (1 - dusk * 0.5));
  const tintLamp = [1.14, 0.92, 0.7];
  const o = out ?? ({} as DayLight);
  // under rain the sun is hidden, the sky gives less light, and the lamp is lit even by day
  const dim = 1 - 0.3 * rain;
  o.keyDir = keyDir;
  // the light is the window's: bright near it and less and less toward you, the room behind you
  // giving back only a little; in the gold hours the sky dims and the room with it, and the low
  // sun is all the stronger for it
  // (in a mist the sun comes through soft and weak)
  o.sun = (ma ? 0.34 * moonUp : 0.8 * sun * (1 - rain) * (1 + 0.6 * gold)) * (1 - 0.65 * fog);
  o.sky = (0.9 * day + 0.12 * night) * (1 - 0.45 * rain) * (1 - 0.55 * gold);
  o.amb = (0.11 * day + 0.03) * dim * (1 - 0.5 * gold);
  o.floorB = 0.45 * day * dim;
  o.fill = (0.22 * day + 0.03) * dim * (1 - 0.5 * gold);
  const lit = Math.max(ss(set - 0.55, set - 0.4, hour), 1 - ss(rise + 0.3, rise + 0.45, hour));
  o.lamp = Math.max(2.0 * lit, 1.55 * rain);
  o.fairy = Math.max(0.5 * lit, 0.45 * rain);
  o.tintSun = (o.tintSun ?? new THREE.Vector3()).set(tintSun[0], tintSun[1], tintSun[2]);
  o.tintShade = (o.tintShade ?? new THREE.Vector3()).set(tintShade[0], tintShade[1], tintShade[2]);
  o.tintLamp = (o.tintLamp ?? new THREE.Vector3()).set(tintLamp[0], tintLamp[1], tintLamp[2]);
  // the beam shows in the air most when the sun is low and its light comes in long
  o.beam = ma ? 0.3 * moonUp : sun * (1 - rain) * (0.15 + 0.85 * Math.max(gold, 1 - Math.min(1, keyDir.y / 0.6)));
  return o;
}

/** is it raining (0 .. 1): now and then for a few hours, the same for everyone at the same time.
 *  Each three hours of each day has its own chance; the rain comes on and goes off over about
 *  twenty minutes either side */
export function rainAt(d: Date) {
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  const h = d.getHours() + d.getMinutes() / 60;
  const wet = (block: number) => {
    const x = Math.sin((day * 3.1 + block * 17.7) * 12.9898) * 43758.5453;
    return x - Math.floor(x) < 0.17 ? 1 : 0;
  };
  const b = Math.floor(h / 3), f = h / 3 - b;
  const now = wet(b), prev = wet(b - 1), next = wet(b + 1);
  // eased across the edges of the blocks (half way at the edge itself)
  const e = (t: number) => t * t * (3 - 2 * t);
  if (f < 0.11) return prev + (now - prev) * e(0.5 + 0.5 * f / 0.11);
  if (f > 0.89) return now + (next - now) * e(0.5 * (f - 0.89) / 0.11);
  return now;
}
