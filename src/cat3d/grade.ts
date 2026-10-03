/** the painting's colours for pixel art: lifted out of its baked shade (its white is a mid grey),
 *  a little richer, and whites kept a warm, rosy white so the palette reads them as white fur */
export const GRADE_GLSL = /* glsl */ `
uniform float uSolidGain;
uniform float uSolidSat;
vec3 gradePaint(vec3 col) {
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float mx = max(col.r, max(col.g, col.b));
  float sat = (mx - min(col.r, min(col.g, col.b))) / max(mx, 1e-4);
  col = max(mix(vec3(l), col, uSolidSat), 0.0) * uSolidGain;
  return col * mix(vec3(1.0), vec3(1.04, 0.975, 0.965), smoothstep(0.3, 0.08, sat));
}
`;
