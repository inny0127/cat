// GLSL ES 3.00 sources. Painting space ("P") is the 600x600 reference painting's pixel grid.

export const LAYER_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aRest;
layout(location = 1) in vec4 aWa;     // head, earL, earR, tail
layout(location = 2) in vec4 aWb;     // breath, paw, back, rim
layout(location = 3) in vec2 aNormal; // outward silhouette normal
layout(location = 4) in float aOcc;   // fur normally hidden under the head (body layer)

uniform vec4 uView;        // clip = P * xy + zw
uniform vec4 uLayer;       // layer origin (xy) and size (zw) in P
uniform vec4 uHead;        // angle, tx, ty
uniform vec2 uHeadPivot;
uniform vec4 uEarL;        // angle, fold, pivot.xy
uniform vec4 uEarR;
uniform vec4 uEarAxes;     // earL axis (xy), earR axis (zw), unit vectors base->tip
uniform vec4 uTail;        // angle, -, pivot.xy
uniform vec4 uBreath;      // scale, center.xy
uniform vec4 uPaw;         // dx, dy, squeeze
uniform vec2 uPawCenter;
uniform vec4 uRipple;      // amp, phase, wavenumber
uniform float uPuff;
uniform sampler2D uField;  // xy displacement (P px), z press shade, w ruffle
uniform vec4 uGlobal;      // tx, ty, stretch, angle
uniform vec2 uGlobalPivot;
uniform vec2 uStretchDir;

out vec2 vUv;
out float vShade;
out float vRuffle;
out float vOcc;

vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec2 ear(vec2 p, vec4 e, vec2 axis, float w) {
  vec2 q = p - e.zw;
  float along = dot(q, axis);
  q -= axis * along * e.y * 0.34 * w;           // flattening: the ear turns sideways, looks shorter
  q += vec2(-axis.y, axis.x) * along * e.y * 0.10 * w;
  return e.zw + rot(q, e.x * w);
}

void main() {
  vec2 p = aRest;
  p += aWb.x * (p - uBreath.yz) * uBreath.x;
  if (aWb.y > 0.0) p += aWb.y * ((uPawCenter - p) * uPaw.z + uPaw.xy);
  p.y += aWb.z * uRipple.x * sin(p.x * uRipple.z - uRipple.y);
  float jit = hash(floor(aRest * 0.45)) - 0.5;
  p += aNormal * aWb.w * uPuff * (3.2 + 2.4 * jit);
  if (aWa.y > 0.0) p = ear(p, uEarL, uEarAxes.xy, aWa.y);
  if (aWa.z > 0.0) p = ear(p, uEarR, uEarAxes.zw, aWa.z);
  if (aWa.w > 0.0) p = uTail.zw + rot(p - uTail.zw, uTail.x * aWa.w);
  if (aWa.x > 0.0) p = uHeadPivot + rot(p - uHeadPivot, uHead.x * aWa.x) + uHead.yz * aWa.x;

  vec4 f = texture(uField, aRest / 600.0);
  p += f.xy;
  vShade = f.z;
  vRuffle = f.w;
  vOcc = aOcc;

  vec2 g = p - uGlobalPivot;
  g += uStretchDir * dot(g, uStretchDir) * uGlobal.z;
  p = uGlobalPivot + rot(g, uGlobal.w) + uGlobal.xy;

  gl_Position = vec4(p * uView.xy + uView.zw, 0.0, 1.0);
  vUv = (aRest - uLayer.xy) / uLayer.zw;
}`;

export const LAYER_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in float vShade;
in float vRuffle;
in float vOcc;
uniform sampler2D uTex;
uniform float uOcc;     // how far the head is lifted off what it was lying on
uniform vec4 uCoat;     // saturation, tint rgb: the same painting as a different cat
uniform vec3 uBlur;     // motion blur vector in uv (xy), samples (z)
uniform vec2 uTexel;
uniform vec4 uGrade;    // desaturate, dim, warmth, alpha
uniform float uFocus;   // defocus radius in texels
out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  if (vRuffle > 0.002) {
    float h = hash(floor(uv / uTexel / 3.0));
    uv += (vec2(h, fract(h * 7.31)) - 0.5) * uTexel * 7.0 * vRuffle;
  }
  vec4 c;
  if (uBlur.z > 1.5) {
    c = vec4(0.0);
    for (int i = 0; i < 24; i++) {
      if (float(i) >= uBlur.z) break;
      float t = float(i) / (uBlur.z - 1.0) - 0.5;
      c += texture(uTex, uv + uBlur.xy * t);
    }
    c /= uBlur.z;
  } else if (uFocus > 0.5) {
    c = texture(uTex, uv) * 0.16;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5235988 + 0.3;
      float r = (i % 2 == 0) ? 1.0 : 0.55;
      c += texture(uTex, uv + vec2(cos(a), sin(a)) * uTexel * uFocus * r) * 0.07;
    }
  } else {
    c = texture(uTex, uv);
  }
  c.rgb *= 1.0 - 0.2 * clamp(vShade, 0.0, 1.0);
  c.rgb *= 1.0 - 0.5 * vOcc * uOcc;
  c.rgb += c.a * vec3(0.05, 0.045, 0.03) * vRuffle;
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  c.rgb = mix(c.rgb, vec3(l), uGrade.x);
  c.rgb *= vec3(1.0, 1.0 - 0.05 * uGrade.z, 1.0 - 0.1 * uGrade.z);
  c.rgb *= 1.0 - uGrade.y;
  o = c * uGrade.w;
}`;

export const FULL_VS = /* glsl */ `#version 300 es
precision highp float;
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;

export const PAPER_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec3 uPaper;
uniform vec2 uRes;
uniform float uDim;
uniform vec3 uTint;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 q = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 c = uPaper * mix(0.965, 1.0, smoothstep(1.15, 0.25, length(q)));
  c += (hash(gl_FragCoord.xy) - 0.5) * 0.010;
  c = mix(c, c * uTint, uDim);
  c *= 1.0 - 0.55 * uDim;
  o = vec4(c, 1.0);
}`;

export const SHADOW_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;   // P space
uniform vec4 uView;
uniform vec2 uOffset;
out vec2 vP;
void main() {
  vP = aPos;
  gl_Position = vec4((aPos + uOffset) * uView.xy + uView.zw, 0.0, 1.0);
}`;

export const SHADOW_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vP;
uniform sampler2D uSoft;    // blurred silhouette (r: wide, g: tight)
uniform vec2 uShift;        // light offset of the wide shadow
uniform float uStrength;
uniform vec3 uColor;
out vec4 o;
void main() {
  float wide = texture(uSoft, (vP - uShift) / 600.0).r;
  float tight = texture(uSoft, (vP - vec2(1.5, 3.0)) / 600.0).g;
  // only below the body's middle: it lies on the floor, lit from the upper left
  float floorMask = smoothstep(260.0, 380.0, vP.y);
  float a = (wide * 0.22 + tight * 0.30 * floorMask) * uStrength;
  o = vec4(uColor * a, a);
}`;

export const EYE_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aClip;
layout(location = 1) in vec2 aLocal;
out vec2 vL;
void main() { vL = aLocal; gl_Position = vec4(aClip, 0.0, 1.0); }`;

export const EYE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vL;
uniform float uOpen;
uniform float uSquint;
uniform float uPupil;
uniform vec2 uGaze;
uniform vec2 uLight;
uniform float uShade;
uniform float uFore;
uniform float uPx;
uniform float uAlpha;
uniform vec3 uIrisIn;
uniform vec3 uIrisOut;
uniform float uWet;
out vec4 o;

float hash(float n) { return fract(sin(n * 91.345) * 43758.5453); }
float vnoise(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }

void main() {
  if (uOpen < 0.02) discard;
  float x = vL.x, y = vL.y;
  float s = clamp(1.0 - x * x, 0.0, 1.0);
  float aa = max(uPx * 1.3, 0.035);

  float low = -0.17 * pow(s, 0.85) + uSquint * 0.42 * pow(s, 0.7);
  float lift = uOpen * 1.38;
  float up = low + lift * pow(s, 0.6) * (1.0 + 0.12 * x);

  float inside = smoothstep(low - aa, low + aa, y) * smoothstep(up + aa, up - aa, y);

  // eyeball
  vec2 ic = vec2(uGaze.x, 0.50 + uGaze.y);
  vec2 dv = (vL - ic) * vec2(1.0 / uFore, 1.0);
  float R = 0.97;
  float d = length(dv) / R;
  float ang = atan(dv.y, dv.x);
  vec3 iris = mix(uIrisIn, uIrisOut, smoothstep(0.18, 0.95, d));
  float str = vnoise(ang * 9.0 + d * 2.0) * 0.6 + vnoise(ang * 23.0 - d * 5.0) * 0.4;
  iris *= 0.82 + 0.34 * str;
  iris *= mix(1.0, 0.42, smoothstep(0.80, 1.0, d));          // limbal ring
  vec3 col = mix(iris, vec3(0.20, 0.13, 0.08), smoothstep(0.98, 1.06, d));
  // pupil: a vertical slit that opens into a disc
  vec2 pr = vec2(R * (0.06 + 0.70 * uPupil) * uFore, R * (0.86 - 0.10 * uPupil));
  float pd = length((vL - ic) / pr);
  col = mix(col, vec3(0.018, 0.016, 0.02), smoothstep(1.0 + aa * 4.0, 1.0 - aa * 4.0, pd));
  // shadow under the upper lid
  col *= 1.0 - 0.55 * smoothstep(0.45, 0.0, up - y);
  // wet highlights: the window (this screen) reflected, plus a soft spot
  vec2 hl = ic + uLight * 0.42;
  vec2 hq = abs(vL - hl) - vec2(0.13, 0.17);
  float win = smoothstep(0.07, 0.0, length(max(hq, 0.0)) + min(max(hq.x, hq.y), 0.0) - 0.03);
  float spot = smoothstep(0.10, 0.0, length(vL - (ic - uLight * 0.35)) - 0.02) * 0.35;
  col = mix(col, vec3(1.0, 0.98, 0.94), (win * 0.85 + spot) * uWet);
  // tear line along the lower lid
  col += vec3(0.25) * smoothstep(0.05, 0.0, abs(y - (low + 0.06))) * s * 0.35 * uWet;
  col *= 1.0 - uShade;

  // dark lid rims
  float rimUp = smoothstep(0.10 + aa, 0.02, abs(y - up - 0.035)) * smoothstep(0.0, 0.25, s);
  float rimLow = smoothstep(0.075 + aa, 0.01, abs(y - low + 0.01)) * smoothstep(0.0, 0.25, s);
  float rim = max(rimUp, rimLow * 0.85);
  vec3 rimCol = vec3(0.13, 0.085, 0.06);

  float a = max(inside, rim * smoothstep(0.02, 0.12, uOpen));
  vec3 c = mix(col, rimCol, clamp(rim, 0.0, 1.0));
  a *= uAlpha;
  o = vec4(c * a, a);
}`;
