import * as THREE from 'three';

/**
 * Pixel art as a pixel artist would colour it: everything in the picture is one of a few dozen
 * materials (the cat's white fur, cream, ginger, the darker ginger of its stripes, its pink and
 * dark skin, the inside of its mouth, its tongue and teeth; the room's plaster, painted panelling,
 * floorboards, rug, bed, leaves, pots, books, metal, curtains...), and each is painted from its own
 * short ramp of hand-picked colours, shadows leaning cool and violet, lights warm and golden, all
 * from one palette so the room and the cat belong together. The shaders write which material and
 * how much light into the small render target; the pixel pass (stage.ts) tidies that and paints it.
 *
 * In the render target: r = material, g = light (0..1), b = which light it is in (whole part: 1 the
 * lamp's, 2 the sun's) plus rim light (the cat) or glow (the room), a = what it is: 1 the cat, 0.5
 * the room, 0.75 the irises (their own colours, snapped to the eyes' palette), 0.15 a colour to show
 * as it is (the sky outside), 0.2 the same but glowing (a light bulb).
 */

/** the material keys in the pixel coat texture (tools/cat3d/fripouille.py: PIX_KEYS), display sRGB */
const KEYS = [[255, 255, 255], [255, 200, 120], [230, 120, 40], [130, 50, 10], [255, 140, 170], [20, 10, 10]];

export const PIX = {
  // the cat
  white: 0, cream: 1, ginger: 2, stripe: 3, pink: 4, dark: 5, mouth: 6, tongue: 7, teeth: 8,
  // the room
  wall: 9, panel: 10, floor: 11, floorDark: 12, rug: 13, rugCream: 14, bed: 15, fleece: 16, leaf: 17,
  pot: 18, shade: 19, metal: 20, paint: 21, curtain: 22, bookRed: 23, bookBlue: 24, bookMustard: 25,
  brown: 26, water: 27, redBowl: 28, sand: 29, paper: 30, ink: 31,
} as const;
export type Material = keyof typeof PIX;

/** five steps per material, deep shadow to highlight (display sRGB), in material order */
export const RAMPS: string[][] = [
  ['#8b7f96', '#bdb2c0', '#e3dbdb', '#f7f0e8', '#fffbf3'],   // white fur: lavender in shadow, warm in the light
  ['#7b5160', '#b9806f', '#e2ac82', '#f6cf9b', '#ffebc2'],   // cream
  ['#5e2f3a', '#9a4434', '#cf6a32', '#ec9447', '#f9bd6c'],   // ginger
  ['#42222f', '#6c2f30', '#9c4329', '#c15e2c', '#dc8240'],   // the stripes
  ['#74405a', '#ab5f78', '#da8b9a', '#f3b0b0', '#ffd6cc'],   // pink skin: ears, nose, pads
  ['#1d1420', '#2c1d27', '#42292f', '#5d3a3a', '#7c534c'],   // dark skin, the lids' margin
  ['#2b1020', '#4c182c', '#77283d', '#a6424f', '#cf6f72'],   // the inside of the mouth
  ['#5f2a43', '#96475e', '#c96f82', '#e898a0', '#ffc3bf'],   // the tongue
  ['#7d7590', '#b2abb8', '#ddd8d8', '#f6f2ea', '#ffffff'],   // teeth
  ['#3b3150', '#634a68', '#94687a', '#c99486', '#ebbf9f'],   // the wall's dusty peach plaster
  ['#2c3341', '#3f5250', '#5e7a68', '#88a487', '#b7cca8'],   // sage-green panelling
  ['#33283a', '#57383f', '#86554a', '#b67c5c', '#dba878'],   // honey floorboards
  ['#2a2133', '#472e38', '#6c4340', '#95634f', '#bb8862'],   // the darker boards and the gaps
  ['#272844', '#353d63', '#4d5c8a', '#7186b0', '#a3b4d4'],   // the rug's dusty indigo
  ['#4d4258', '#7e6f7c', '#b4a198', '#dbc9b2', '#f3e6cc'],   // the rug's cream
  ['#21283b', '#2c4452', '#3f6670', '#62908f', '#93b9aa'],   // the bed's muted teal
  ['#4a4155', '#76687a', '#a99a9c', '#d4c4b6', '#efe3d0'],   // its oatmeal fleece
  ['#1c2733', '#24413c', '#356544', '#5a8e4f', '#8fb86a'],   // leaves
  ['#3c2433', '#683339', '#9c4f43', '#c97552', '#e8a173'],   // terracotta
  ['#4f4252', '#857266', '#bfa385', '#ead2a6', '#fff4d6'],   // the lamp's linen shade
  ['#16131d', '#2a2230', '#46383d', '#6b5548', '#97795c'],   // dark bronze
  ['#40435a', '#6e7189', '#a7a8bb', '#d8d7e0', '#f8f6f1'],   // white paint, china
  ['#2f2440', '#4f3657', '#78526f', '#a67b8f', '#d4a9b2'],   // dusty mauve curtains
  ['#33182a', '#5a2232', '#8a3238', '#b6503f', '#d87b55'],   // a red book
  ['#1f2238', '#2b3654', '#3f5679', '#5f80a0', '#8fb0c3'],   // a blue one
  ['#3d2a2e', '#6b4a33', '#a17b3d', '#cfa84a', '#ead27a'],   // a mustard one
  ['#2c1d25', '#4b2c2b', '#734431', '#9c653d', '#c58f55'],   // brown: kibble, wood
  ['#1f2c45', '#2b4767', '#3f6f92', '#62a0bd', '#a2d2df'],   // water
  ['#3a1a2a', '#652636', '#97384a', '#c25b62', '#e48d85'],   // the red bowl
  ['#4b4152', '#7a6c72', '#ab9b92', '#d3c3ad', '#ece0c8'],   // litter
  ['#8a8090', '#b8adb4', '#ddd3cf', '#efe8e0', '#f7f2ea'],   // paper (the lab's backdrop)
  ['#120e16', '#1c1621', '#2a2130', '#3a2e3e', '#4c3d4f'],   // ink: wire, the darkest things
];
export const NMAT = 32;

/** the ramps as a texture: x the step (0..4), y the material; raw display sRGB */
export function rampTexture() {
  const data = new Uint8Array(5 * NMAT * 4);
  RAMPS.forEach((ramp, m) => ramp.forEach((hex, i) => {
    const c = parseInt(hex.slice(1), 16);
    const o = (m * 5 + i) * 4;
    data[o] = (c >> 16) & 255;
    data[o + 1] = (c >> 8) & 255;
    data[o + 2] = c & 255;
    data[o + 3] = 255;
  }));
  const tex = new THREE.DataTexture(data, 5, NMAT, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** GLSL: which material a (linear) colour from the pixel coat texture is, and packing a material,
 *  its light and a third value (rim light, glow) for the cat (alpha 1) or the room (alpha 0.5) */
export const PIX_GLSL = /* glsl */ `
const vec3 PIX_KEYS[${KEYS.length}] = vec3[](${KEYS.map((k) => `vec3(${k.map((x) => (x / 255).toFixed(4)).join(', ')})`).join(', ')});
int pixClass(vec3 lin) {
  vec3 s = pow(max(lin, 0.0), vec3(1.0 / 2.2));
  int best = 0;
  float bd = 1e9;
  for (int i = 0; i < ${KEYS.length}; i++) {
    vec3 e = s - PIX_KEYS[i];
    float d = dot(e, e);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
vec4 pixOut(int cls, float light, float rim) {
  return vec4((float(cls) + 0.5) / ${NMAT}.0, clamp(light, 0.0, 1.0), clamp(rim, 0.0, 1.0), 1.0);
}
vec4 pixRoom(int cls, float light, float glow) {
  return vec4((float(cls) + 0.5) / ${NMAT}.0, clamp(light, 0.0, 1.0), clamp(glow, 0.0, 1.0), 0.5);
}
// ... and with the light's kind (roomlight.ts: all of it, the lamp's share, the sun's share): the
// third value's whole part says which light the pixel is in, 1 the lamp's, 2 the sun's (or the
// moon's); only a light that is really there counts (in the dark, a faint lamp's share of almost
// nothing would colour a blot)
float pixLights(vec3 lt) {
  return (lt.y > 0.5 && lt.x * lt.y > 0.05 ? 1.0 : 0.0) + (lt.z > 0.4 && lt.x * lt.z > 0.05 ? 2.0 : 0.0);
}
vec4 pixOutLit(int cls, vec3 lt, float rim) {
  return vec4((float(cls) + 0.5) / ${NMAT}.0, clamp(lt.x, 0.0, 1.0), pixLights(lt) + clamp(rim, 0.0, 0.99), 1.0);
}
vec4 pixRoomLit(int cls, vec3 lt, float glow) {
  return vec4((float(cls) + 0.5) / ${NMAT}.0, clamp(lt.x, 0.0, 1.0), pixLights(lt) + clamp(glow, 0.0, 0.99), 0.5);
}
`;
