import * as THREE from 'three';

/**
 * Pixel art as a pixel artist would colour the cat: the coat is a handful of materials (white fur,
 * cream, ginger, the darker ginger of the stripes, pink skin, dark skin; the inside of the mouth,
 * the tongue, the teeth), and each is painted from its own short ramp of hand-picked colours,
 * shadows leaning cool and violet and lights warm and golden, instead of the lit colour being
 * snapped to whatever palette entry lies nearest. The cat's shaders write which material and how
 * much light into the small render target; the pixel pass (stage.ts) tidies that and paints it.
 */

/** the material keys in the pixel coat texture (tools/cat3d/fripouille.py: PIX_KEYS), display sRGB */
const KEYS = [[255, 255, 255], [255, 200, 120], [230, 120, 40], [130, 50, 10], [255, 140, 170], [20, 10, 10]];

export const PIX = { white: 0, cream: 1, ginger: 2, stripe: 3, pink: 4, dark: 5, mouth: 6, tongue: 7, teeth: 8 } as const;

/** five steps per material, deep shadow to highlight (display sRGB) */
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
];
export const NRAMP = RAMPS.length * 5;

/** the ramps as display-sRGB vectors, for a uniform array */
export function rampUniform() {
  return RAMPS.flat().map((h) => new THREE.Vector3(...new THREE.Color().setStyle(h, THREE.SRGBColorSpace).convertLinearToSRGB().toArray()));
}

/** GLSL: which material a (linear) colour from the pixel coat texture is, and packing the
 *  material, the light and the rim light into the render target (alpha 1 marks the cat) */
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
  return vec4((float(cls) + 0.5) / 16.0, clamp(light, 0.0, 1.0), clamp(rim, 0.0, 1.0), 1.0);
}
`;
