import * as THREE from 'three';
import type { Cat3D } from '../cat3d/cat';
import { NMAT, PIX, PIX_GLSL, rampTexture } from '../cat3d/pixclass';

/**
 * The smooth cat's stage: the pixel cat's colours and drawing without the pixels.
 *
 * The pixel stage (src/cat3d/stage.ts) draws the scene small, every surface writing which material
 * it is and how much light is on it, and paints each art pixel from that material's hand-picked
 * ramp. This stage keeps every part of that but the pixel: the same surfaces write the same
 * materials and light, here at the screen's own resolution (and finer, to smooth the edges), and the
 * paint pass lays the same ramps on as clean bands of flat colour whose edges are drawn, not
 * stepped; no dithering, no square pixels. The outlines a pixel artist draws (the shadow side of the
 * figure, a line where one form passes in front of another, the lit top edge) are drawn as thin
 * lines of the same colours.
 *
 * Kept apart from the pixel stage on purpose: this file is the smooth cat's alone.
 */

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// the seamless paper backdrop: its material and light, as the pixel stage's floor writes them
const FLOOR_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FLOOR_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn;
uniform float uShadowSoft;
uniform vec4 uCaps[40];
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
${PIX_GLSL}
void main() {
  float sh = 1.0;
  if (uShadowOn > 0.5) {
    vec4 sc = uShadowMatrix * vec4(vWorld, 1.0);
    sc.xyz /= sc.w;
    if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) {
      float a = hash(gl_FragCoord.xy) * 6.2832;
      float sum = 0.0;
      for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / 16.0) * uShadowSoft;
        float t = fi * 2.39996 + a;
        float d = unpackRGBAToDepth(texture2D(uShadowMap, sc.xy + vec2(cos(t), sin(t)) * r));
        sum += step(sc.z - 0.002, d);
      }
      sh = sum / 16.0;
    }
  }
  // contact shadow: how much of the sky the body hides from this bit of floor
  float vis = 1.0;
  for (int i = 0; i < 20; i++) {
    vec4 A = uCaps[2 * i];
    vec3 B = uCaps[2 * i + 1].xyz;
    vec3 ab = B - A.xyz;
    float t = clamp(dot(vWorld - A.xyz, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
    vec3 d = A.xyz + ab * t - vWorld;
    float l2 = max(dot(d, d), 1e-6);
    float cosT = d.y * inversesqrt(l2);
    vis *= 1.0 - 0.8 * clamp(cosT, 0.0, 1.0) * clamp(A.w * A.w / l2, 0.0, 1.0);
  }
  gl_FragColor = pixRoom(${PIX.paper}, mix(0.4, 0.9, sh) * mix(0.55, 1.0, vis), 0.25);
}`;

/** the irises keep a palette of their own (they write colour, alpha 0.75), as in pixel art */
const PAL_EYE = ['#ecd98a', '#c4c25a', '#8a8a36', '#4f5222', '#121010', '#ffffff'];
const eyePalette = () => PAL_EYE.map((h) => new THREE.Vector3(...new THREE.Color().setStyle(h, THREE.SRGBColorSpace).convertLinearToSRGB().toArray()));

const PAINT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform sampler2D uRampTex;
uniform vec2 uSize;
uniform float uExposure;
uniform float uNear;
uniform float uFar;
uniform vec3 uPalEye[${PAL_EYE.length}];
uniform vec3 uTintSun;
uniform vec3 uTintShade;
uniform vec3 uTintLamp;
uniform int uLine;       // the outlines' width, in pixels of this target
uniform float uSoft;     // how soft the edge between two bands is, in pixels of this target

// Khronos PBR Neutral, as the pixel stage applies it to the irises
vec3 neutral(vec3 c) {
  c *= uExposure;
  float x = min(c.r, min(c.g, c.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= offset;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < 0.76) return c;
  float d = 0.24;
  float np = 1.0 - d * d / (peak + d - 0.76);
  c *= np / peak;
  float g = 1.0 - 1.0 / (0.15 * (peak - np) + 1.0);
  return mix(c, vec3(np), g);
}
vec3 toSRGB(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 oklab(vec3 c) {
  c = toLin(c);
  vec3 lms = mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005) * c;
  lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
  return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662, -0.0040720468, 0.4505937099, -0.8086757660) * lms;
}
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
ivec2 inside(ivec2 q) { return clamp(q, ivec2(0), ivec2(uSize) - 1); }
vec3 snapEye(vec3 c) {
  vec3 q = oklab(c);
  float best = 1e9; vec3 r = c;
  for (int i = 0; i < ${PAL_EYE.length}; i++) {
    vec3 e = oklab(uPalEye[i]) - q;
    float d = dot(e * vec3(1.0, 1.4, 1.4), e);
    if (d < best) { best = d; r = uPalEye[i]; }
  }
  return r;
}
vec3 ramp(int m, int step) { return texelFetch(uRampTex, ivec2(clamp(step, 0, 4), m), 0).rgb; }

// where a light falls along a ramp: step i covers [i - 0.5, i + 0.5) (the pixel stage's bands)
const float TH[4] = float[](0.16, 0.32, 0.52, 0.76);
float stepPos(float L) {
  if (L < TH[0]) return L / TH[0] - 0.5;
  if (L >= TH[3]) return 4.0 + (L - TH[3]) / (1.0 - TH[3]) * 0.5;
  for (int i = 0; i < 3; i++) if (L >= TH[i] && L < TH[i + 1]) return float(i + 1) + (L - TH[i]) / (TH[i + 1] - TH[i]) - 0.5;
  return 4.0;
}

// the colour of a material at a place along its ramp: flat bands, and where two meet, a clean
// edge a pixel or so wide (w: how far along the ramp the light moves across a pixel)
vec3 bands(int m, float s, float w) {
  float f = s + 0.5;
  float k = floor(f + 0.5);
  float e = clamp(w * uSoft, 0.002, 0.45);
  return mix(ramp(m, int(k) - 1), ramp(m, int(k)), smoothstep(k - e, k + e, f));
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 src = texelFetch(uColor, p, 0);
  float depth = texelFetch(uDepth, p, 0).r;
  // where the light falls along the ramp, and how fast that changes from pixel to pixel (taken
  // before anything branches, so the derivative is good)
  float s = stepPos(src.g);
  float slope = fwidth(s);
  int kind = depth >= 0.99999 ? 0 : src.a > 0.9 ? 1 : (src.a > 0.4 && src.a < 0.6) ? 2 : 0;
  vec3 col;
  if (kind == 0) {
    if (depth >= 0.99999) col = toSRGB(src.rgb);
    // the irises in their own palette, in the colour of the hour
    else if (src.a > 0.7 && src.a < 0.8) col = clamp(snapEye(toSRGB(neutral(src.rgb))) * uTintShade, 0.0, 1.0);
    else col = src.rgb;
  } else {
    int mat = int(src.r * ${NMAT}.0);
    float L = src.g;
    float B0 = src.b;
    int code = int(floor(B0 + 1e-3));
    float third = B0 - float(code);
    float wl = float(code / 6) / 5.0, ws = float(code - (code / 6) * 6) / 5.0;
    // the cat: the light catching an edge from behind lifts it a step or two
    bool rimLit = kind == 1 && third > 0.4;
    if (kind == 1) s += smoothstep(0.38, 0.42, third) + smoothstep(0.68, 0.72, third);
    // the lines a pixel artist draws, here a line's width: the cat's outline below and to the
    // right, against whatever is behind it, a step darker in its own colours (never down to a
    // ramp's deepest step, which would read as a black line)
    ivec2 dn = inside(p + ivec2(0, -uLine)), rt = inside(p + ivec2(uLine, 0)), up = inside(p + ivec2(0, uLine)), lf = inside(p + ivec2(-uLine, 0));
    float dDn = texelFetch(uDepth, dn, 0).r, dRt = texelFetch(uDepth, rt, 0).r;
    bool catDn = dDn < 0.99999 && texelFetch(uColor, dn, 0).a > 0.9;
    bool catRt = dRt < 0.99999 && texelFetch(uColor, rt, 0).a > 0.9;
    float shift = 0.0;
    if (!rimLit && kind == 1 && (!catDn || !catRt) && s >= 1.5) shift = -1.0;
    // just behind something nearer (a leg across the chest, an ear against the head): a line in
    // this colour's own shade
    float w = 1.0 / lin(depth);
    float wUp = 1.0 / lin(texelFetch(uDepth, up, 0).r);
    float front = max(max(1.0 / lin(texelFetch(uDepth, lf, 0).r), 1.0 / lin(dRt)), max(wUp, 1.0 / lin(dDn))) - w;
    if (front > 0.035 * w && w > 0.25) { if (s >= 1.5) shift = -1.0; }
    // the top edge of a thing against what lies behind it catches the window's light: a line a
    // step lighter
    else if (shift == 0.0 && w > 0.25 && w - wUp > 0.035 * w && L > 0.2) shift = 1.0;
    col = bands(mat, s + shift, slope);
    // the colour of the light it is in: the lamp's, the sun's (the moon's), the shade's
    vec3 tint = uTintShade * max(0.0, 1.0 - wl - ws) + uTintLamp * wl + uTintSun * ws;
    if (rimLit) tint = mix(tint, uTintSun, 0.85);
    col = clamp(col * tint, 0.0, 1.0);
    // richer, as the pixel stage grades it: a little more colour in the lights and middle tones,
    // the darks a little deeper
    float lu = dot(col, vec3(0.299, 0.587, 0.114));
    float chroma = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
    col = clamp(mix(vec3(lu), col, 1.0 + 0.22 * smoothstep(0.12, 0.45, lu) * (1.0 - smoothstep(0.3, 0.7, chroma))), 0.0, 1.0);
    col = col * col * (3.0 - 2.0 * col) * 0.35 + col * 0.65;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

/** the finished painting on the screen: each screen pixel the average of the finer pixels under it
 *  (in linear light, so thin bright things like whiskers keep their weight), the corners dimmed */
const PRESENT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uPaint;
uniform vec2 uScreen;
uniform int uSS;
uniform float uVignette;
vec3 toSRGB(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * uSS;
  vec3 c = vec3(0.0);
  for (int y = 0; y < 3; y++) for (int x = 0; x < 3; x++) {
    if (x < uSS && y < uSS) c += toLin(texelFetch(uPaint, p + ivec2(x, y), 0).rgb);
  }
  c = toSRGB(c / float(uSS * uSS));
  vec2 v = gl_FragCoord.xy / uScreen - vec2(0.5, 0.55);
  v.x *= uScreen.x / uScreen.y;
  c *= 1.0 - uVignette * smoothstep(0.3, 0.85, length(v * vec2(1.25, 1.0)));
  gl_FragColor = vec4(c, 1.0);
}`;

export interface SmoothStageOptions {
  /** the backdrop's colour (display sRGB) */
  paper?: string;
  exposure?: number;
  /** metres covered by the key light's shadow */
  shadowSize?: number;
  /** how many finer pixels each way to every screen pixel (default: 2, or 1 on a big screen) */
  ss?: number;
  /** the outlines' width, in CSS pixels */
  line?: number;
  /** the whiskers' width, in CSS pixels */
  whisker?: number;
}

export class SmoothStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly key = new THREE.DirectionalLight(0xffffff, 1);
  readonly floor: THREE.Mesh;
  readonly paper: THREE.Color;
  private readonly floorMat: THREE.ShaderMaterial;
  private cats: Cat3D[] = [];
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly paintRT: THREE.WebGLRenderTarget;
  private readonly quad: THREE.Mesh;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.Camera();
  private readonly paintMat: THREE.ShaderMaterial;
  private readonly presentMat: THREE.ShaderMaterial;
  private ss = 2;
  private askSS: number | undefined;
  private readonly lineCss: number;
  private readonly whiskerCss: number;

  constructor(opts: SmoothStageOptions = {}, canvas?: HTMLCanvasElement) {
    const cv = canvas ?? document.createElement('canvas');
    // (the edges are smoothed by drawing finer than the screen; the canvas itself needs none)
    const context = cv.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' })!;
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, context, antialias: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;   // filtered in the shaders
    this.paper = new THREE.Color().setStyle(opts.paper ?? '#f3efe9', THREE.SRGBColorSpace);
    this.scene.background = this.paper;
    this.camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.01, 40);
    this.askSS = opts.ss;
    this.lineCss = opts.line ?? 1.25;
    this.whiskerCss = opts.whisker ?? 1.1;

    const s = (opts.shadowSize ?? 0.9) / 2;
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: 6 });
    this.key.shadow.bias = 0;
    this.scene.add(this.key, this.key.target);

    this.floorMat = new THREE.ShaderMaterial({
      uniforms: {
        uShadowMap: { value: null },
        uShadowMatrix: { value: this.key.shadow.matrix },
        uShadowOn: { value: 0 },
        uShadowSoft: { value: 0.012 },
        uCaps: { value: [] as THREE.Vector4[] },
      },
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      toneMapped: false,
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);

    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(4, 4, THREE.FloatType),
    });
    this.paintRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.paintMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this.rt.texture }, uDepth: { value: this.rt.depthTexture }, uSize: { value: new THREE.Vector2() },
        uExposure: { value: opts.exposure ?? 1.15 }, uNear: { value: this.camera.near }, uFar: { value: this.camera.far },
        uPalEye: { value: eyePalette() },
        uRampTex: { value: rampTexture() },
        uTintSun: { value: new THREE.Vector3(1, 1, 1) },
        uTintShade: { value: new THREE.Vector3(1, 1, 1) },
        uTintLamp: { value: new THREE.Vector3(1, 1, 1) },
        uLine: { value: 2 },
        uSoft: { value: 0.7 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: PAINT_FRAG,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.presentMat = new THREE.ShaderMaterial({
      uniforms: { uPaint: { value: this.paintRT.texture }, uScreen: { value: new THREE.Vector2() }, uSS: { value: 2 }, uVignette: { value: 0.16 } },
      vertexShader: QUAD_VERT, fragmentShader: PRESENT_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(tri, this.paintMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.size();
    addEventListener('resize', () => this.resize());
  }

  /** how many finer pixels each way to a screen pixel */
  get fine() {
    return this.ss;
  }

  /** draw this many finer pixels each way to a screen pixel (1: the screen's own) */
  setFine(ss: number) {
    this.askSS = ss;
    this.size();
  }

  /** the finer target: twice the screen each way unless the screen is big already */
  private size() {
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.ss = this.askSS ?? (buf.x * buf.y > 2.2e6 ? 1 : 2);
    const w = buf.x * this.ss, h = buf.y * this.ss;
    this.rt.setSize(w, h);
    this.paintRT.setSize(w, h);
    this.paintMat.uniforms.uSize.value.set(w, h);
    // (a CSS pixel is this many pixels of the finer target)
    const unit = this.renderer.getPixelRatio() * this.ss;
    this.paintMat.uniforms.uLine.value = Math.max(1, Math.round(this.lineCss * unit));
    this.presentMat.uniforms.uScreen.value.copy(buf);
    this.presentMat.uniforms.uSS.value = this.ss;
  }

  /** the size of a pixel of the finer target, at a distance of one metre */
  private pixelAngle() {
    return (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.rt.height;
  }

  add(cat: Cat3D) {
    this.cats.push(cat);
    this.scene.add(cat.group);
    if (this.cats.length === 1) this.floorMat.uniforms.uCaps.value = cat.shared.uCaps.value;
    cat.shared.uGroundCol.value.copy(this.paper).multiplyScalar(0.42);
    // every surface writes its material and its light, as for pixel art (the head and eyes drawn
    // a little larger, as the pixel cat has them)
    cat.setPixelArt(true);
    smoothEyes(cat);
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.size();
  }

  private draw() {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    this.quad.material = this.paintMat;
    r.setRenderTarget(this.paintRT);
    r.render(this.quadScene, this.quadCam);
    this.quad.material = this.presentMat;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  render() {
    const cat = this.cats[0];
    if (cat) {
      // the key light's shadow follows the cat
      const c = cat.group.position;
      this.key.target.position.set(c.x, 0.1, c.z);
      this.key.position.copy(cat.shared.uKeyDir.value).multiplyScalar(2.5).add(this.key.target.position);
      this.key.target.updateMatrixWorld();
      // the whiskers: a fine line of so many CSS pixels
      cat.setPixel(this.pixelAngle() * this.whiskerCss * this.renderer.getPixelRatio() * this.ss);
    }
    this.draw();
    // the shadow map exists after the first frame; hand it to the shaders that filter it themselves
    const map = this.key.shadow.map?.texture ?? null;
    if (map && this.floorMat.uniforms.uShadowMap.value !== map) {
      this.floorMat.uniforms.uShadowMap.value = map;
      this.floorMat.uniforms.uShadowOn.value = 1;
      for (const k of this.cats) {
        k.shared.uShadowMap.value = map;
        k.shared.uShadowMatrix.value = this.key.shadow.matrix;
        k.shared.uShadowOn.value = 1;
      }
      this.draw();
    }
  }
}

/**
 * The eyes as pixel art draws them hold a few pixel-art habits that only make sense at a few
 * pixels across: a pupil slit exactly one art pixel wide and a square spark of light. Drawn
 * smooth, the slit keeps a width of its own (a narrow spindle, as a cat's is by day) and the spark
 * is round. The eye shader is shared with the pixel cat, so it is changed here, on this cat's own
 * copy, and the file is left as it is.
 */
function smoothEyes(cat: Cat3D) {
  for (const e of cat.eyes) {
    const m = e.eyeMat;
    const before = m.fragmentShader;
    m.fragmentShader = m.fragmentShader
      // the slit: never narrower than a sliver of the iris (it was one art pixel)
      .replace('vec2 q = ip / vec2(mix(0.5 * pxI, max(0.5 * pxI, 0.42), open), 0.46 + 0.1 * uPupil);',
        'vec2 q = ip / vec2(mix(max(0.5 * pxI, 0.075), max(0.5 * pxI, 0.42), open), 0.46 + 0.1 * uPupil);')
      // ... pointed at both ends, as a cat's slit is (it was a bar)
      .replace('float pupil = open < 0.5 ? step(abs(q.x), 1.0) * step(abs(q.y), 1.0) : step(length(q), 1.0);',
        'float pupil = open < 0.5 ? step(abs(q.x), 1.0 - q.y * q.y) * step(abs(q.y), 1.0) : step(length(q), 1.0);')
      // the sparks of light round, not square
      .replace('float glint = max(step(max(gq.x, gq.y), 0.12) * step(0.3, uShine), step(max(gq2.x, gq2.y), 0.05) * step(0.75, uShine));',
        'float glint = max(step(length(gq), 0.12) * step(0.3, uShine), step(length(gq2), 0.05) * step(0.75, uShine));');
    if (m.fragmentShader === before) console.warn('smooth eyes: the eye shader has changed; the eyes are drawn as pixel art draws them');
    m.needsUpdate = true;
  }
}
