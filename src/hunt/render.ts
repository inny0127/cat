import * as THREE from 'three';

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** the picture finished: a little exposure, the night's blue in the shade, the colours in a few
 *  steps with an ordered dither between them (as pixel art is), a vignette; listening, the world
 *  gone grey-blue; a white flash on a catch */
const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uSize;
uniform float uListen;
uniform float uFlash;
uniform float uDim;
uniform float uRed;
varying vec2 vUv;
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float b = 0.0;
  int x = int(q.x), y = int(q.y);
  int i = x + y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  for (int k = 0; k < 16; k++) if (k == i) b = float(m[k]);
  return (b + 0.5) / 16.0;
}
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  // (exposure, and a soft roll-off of the brightest)
  c *= 1.75;
  c = c / (1.0 + 0.3 * c);
  // (to the screen's own curve)
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  // (the shadows a night blue, the lights warm as they were)
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, c * vec3(0.78, 0.86, 1.18) + vec3(0.015, 0.02, 0.05), (1.0 - smoothstep(0.15, 0.6, l)) * 0.8);
  // listening: the room grey and blue, the sounds will show over it
  vec3 g = vec3(l) * vec3(0.55, 0.68, 0.95);
  c = mix(c, g, uListen * 0.85);
  // caught on the run of the night: a red edge
  vec2 d = vUv - 0.5;
  float vig = smoothstep(0.85, 0.25, length(d * vec2(1.1, 1.0)));
  c *= mix(0.55, 1.0, vig);
  c = mix(c, vec3(0.9, 0.15, 0.2), uRed * (1.0 - vig) * 0.8);
  c *= 1.0 - uDim;
  c = mix(c, vec3(1.0), uFlash);
  // (in steps, dithered)
  float steps = 11.0;
  c = floor(c * steps + bayer(gl_FragCoord.xy)) / steps;
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * Drawn small and blown up, every pixel a square of the screen's: the scene into a small picture,
 * the paws over it, then finished (post) onto a canvas just as small that the page stretches,
 * nearest pixel, over the whole screen. Whatever is to show through the walls (a sound heard) is
 * drawn last, over the finished picture.
 */
export class PixelView {
  readonly renderer: THREE.WebGLRenderer;
  private rt: THREE.WebGLRenderTarget;
  private post: THREE.ShaderMaterial;
  private postScene = new THREE.Scene();
  private postCam = new THREE.Camera();
  /** css pixels to a picture pixel */
  scale = 3;
  readonly size = new THREE.Vector2(1, 1);
  fx = { listen: 0, flash: 0, dim: 0, red: 0 };

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: true });
    this.post = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: this.rt.texture }, uSize: { value: new THREE.Vector2() }, uListen: { value: 0 }, uFlash: { value: 0 }, uDim: { value: 0 }, uRed: { value: 0 } },
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const q = new THREE.Mesh(tri, this.post);
    q.frustumCulled = false;
    this.postScene.add(q);
    canvas.style.imageRendering = 'pixelated';
    this.resize();
  }

  /** about 210 picture pixels across the screen's short side (at least two css px each) */
  resize() {
    const short = Math.min(innerWidth, innerHeight);
    const asked = +(new URLSearchParams(location.search).get('px') ?? '');
    this.scale = asked || Math.max(2, Math.min(6, Math.round(short / 210)));
    const w = Math.ceil(innerWidth / this.scale), h = Math.ceil(innerHeight / this.scale);
    this.size.set(w, h);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w * this.scale}px`;
    this.canvas.style.height = `${h * this.scale}px`;
    this.rt.setSize(w, h);
    this.post.uniforms.uSize.value.set(w, h);
  }

  get aspect() {
    return this.size.x / this.size.y;
  }

  /** the scene from the camera, the paws over it, finished; then the sounds over that */
  render(scene: THREE.Scene, camera: THREE.Camera, paws: THREE.Scene | null, pawCam: THREE.Camera | null, over: THREE.Scene | null) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x05060c, 1);
    r.clear(true, true, true);
    r.render(scene, camera);
    if (paws && pawCam) {
      r.clearDepth();
      r.render(paws, pawCam);
    }
    r.setRenderTarget(null);
    const u = this.post.uniforms;
    u.uListen.value = this.fx.listen;
    u.uFlash.value = this.fx.flash;
    u.uDim.value = this.fx.dim;
    u.uRed.value = this.fx.red;
    r.clear(true, true, true);
    r.render(this.postScene, this.postCam);
    if (over) r.render(over, camera);
  }
}
