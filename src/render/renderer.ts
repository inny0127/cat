import { FloatTexture, Program, compile, imageTexture, type GL } from './gl';
import * as S from './shaders';
import { Silhouette, vertexWeights, type LayerName, type RigData } from '../rig/rig';
import { globalPoint, headPoint, type Pose } from './pose';
import { clamp } from '../util/math';

interface LayerMesh {
  name: LayerName;
  x: number;
  y: number;
  w: number;
  h: number;
  vao: WebGLVertexArrayObject;
  count: number;
  tex: WebGLTexture;
  texW: number;
  texH: number;
}

/** CSS-pixel placement of painting space on screen: screen = P * scale + (ox, oy). */
export interface View {
  scale: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  dpr: number;
}

export interface EyeDraw {
  open: number;
  squint: number;
  pupil: number;
  gazeX: number; // local units (half eye widths)
  gazeY: number;
  alpha: number;
}

export interface Env {
  night: number; // 0 day .. 1 deep night
  time: number;
}

const FIELD_N = 150; // fur field resolution over the 600x600 painting

export class Renderer {
  readonly gl: GL;
  view: View = { scale: 1, ox: 0, oy: 0, w: 1, h: 1, dpr: 1 };
  private layers: LayerMesh[] = [];
  private layerProg: Program;
  private paperProg: Program;
  private shadowProg: Program;
  private eyeProg: Program;
  private shadowVao: WebGLVertexArrayObject;
  private eyeVao: WebGLVertexArrayObject;
  private eyeBuf: WebGLBuffer;
  private emptyVao: WebGLVertexArrayObject;
  private softTex: WebGLTexture;
  readonly field: FloatTexture;
  private paper: [number, number, number];
  private eyeAxes: { A: EyeFrame; B: EyeFrame };

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly rig: RigData,
    images: Record<LayerName, HTMLImageElement>,
    readonly sil: Silhouette,
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('webgl2');
    this.gl = gl;
    this.paper = rig.paper.map((v) => v / 255) as [number, number, number];
    this.layerProg = new Program(gl, compile(gl, S.LAYER_VS, S.LAYER_FS));
    this.paperProg = new Program(gl, compile(gl, S.FULL_VS, S.PAPER_FS));
    this.shadowProg = new Program(gl, compile(gl, S.SHADOW_VS, S.SHADOW_FS));
    this.eyeProg = new Program(gl, compile(gl, S.EYE_VS, S.EYE_FS));
    this.emptyVao = gl.createVertexArray()!;

    for (const name of rig.order) this.layers.push(this.buildLayer(name, images[name]));

    // soft shadow quad over the cat's footprint
    this.shadowVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.shadowVao);
    const sb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 100, 600, 100, 0, 540, 600, 540]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.softTex = this.buildSoftShadow();

    this.eyeVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.eyeVao);
    this.eyeBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.eyeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 4 * 4 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    this.field = new FloatTexture(gl, FIELD_N, FIELD_N);
    this.field.upload(new Float32Array(FIELD_N * FIELD_N * 4));
    this.eyeAxes = { A: eyeFrame(rig, 'A'), B: eyeFrame(rig, 'B') };
    this.resize();
  }

  private buildLayer(name: LayerName, img: HTMLImageElement): LayerMesh {
    const gl = this.gl;
    const info = this.rig.layers[name];
    const step = name === 'body' ? 4 : name === 'head' ? 3 : 2.5;
    const nx = Math.max(2, Math.ceil(info.w / step) + 1);
    const ny = Math.max(2, Math.ceil(info.h / step) + 1);
    const data = new Float32Array(nx * ny * 12);
    let k = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = info.x + (info.w * i) / (nx - 1);
        const y = info.y + (info.h * j) / (ny - 1);
        const w = vertexWeights(this.rig, this.sil, name, x, y);
        const [nxl, nyl] = this.sil.normal(x, y);
        data.set([x, y, ...w, nxl, nyl], k);
        k += 12;
      }
    }
    const idx = new Uint16Array((nx - 1) * (ny - 1) * 6);
    let m = 0;
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.set([a, b, c, b, d, c], m);
        m += 6;
      }
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const F = 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12 * F, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 12 * F, 2 * F);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 12 * F, 6 * F);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 12 * F, 10 * F);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return {
      name, x: info.x, y: info.y, w: info.w, h: info.h, vao, count: idx.length,
      tex: imageTexture(gl, img), texW: img.naturalWidth, texH: img.naturalHeight,
    };
  }

  /** Two blurs of the silhouette: wide ambient shadow (r) and tight contact shadow (g). */
  private buildSoftShadow(): WebGLTexture {
    const n = 300;
    const src = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) src[y * n + x] = this.sil.coverage(x * 2 + 1, y * 2 + 1);
    const wide = blur(src, n, 6);
    const tight = blur(src, n, 1.6);
    const px = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      px[i * 4] = clamp(wide[i]) * 255;
      px[i * 4 + 1] = clamp(tight[i]) * 255;
      px[i * 4 + 3] = 255;
    }
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    // the cat spans ~550 x 335 painting px around (305, 311)
    const scale = Math.min((w * 0.9) / 550, (h * 0.56) / 335, 2.4);
    const portrait = h > w;
    this.view = {
      scale,
      ox: w / 2 - 305 * scale,
      oy: h * (portrait ? 0.47 : 0.5) - 311 * scale,
      w, h, dpr,
    };
  }

  toP(sx: number, sy: number): [number, number] {
    const v = this.view;
    return [(sx - v.ox) / v.scale, (sy - v.oy) / v.scale];
  }

  toScreen(px: number, py: number): [number, number] {
    const v = this.view;
    return [px * v.scale + v.ox, py * v.scale + v.oy];
  }

  render(pose: Pose, eyeA: EyeDraw, eyeB: EyeDraw, field: Float32Array | null, env: Env, fieldSample: (x: number, y: number) => [number, number]) {
    const gl = this.gl;
    const v = this.view;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // paper
    const p = this.paperProg.use();
    p.f3('uPaper', this.paper[0], this.paper[1], this.paper[2]);
    p.f2('uRes', this.canvas.width, this.canvas.height);
    p.f1('uDim', env.night * 0.5);
    p.f3('uTint', 0.86, 0.9, 1.06);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (pose.alpha <= 0.001) return;
    if (field) this.field.upload(field);

    // P -> clip
    const sx = (2 * v.scale) / v.w, sy = (-2 * v.scale) / v.h;
    const ox = (2 * v.ox) / v.w - 1, oy = 1 - (2 * v.oy) / v.h;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // shadow follows the cat but stays on the floor
    const sh = this.shadowProg.use();
    sh.f4('uView', sx, sy, ox, oy);
    sh.f2('uOffset', pose.gx, Math.max(0, pose.gy));
    sh.f2('uShift', 5, 8);
    sh.f1('uStrength', pose.shadow * pose.alpha * (1 - env.night * 0.4));
    sh.f3('uColor', 0.32, 0.2, 0.17);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.softTex);
    sh.i1('uSoft', 0);
    gl.bindVertexArray(this.shadowVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const A = this.rig.anchors;
    const lp = this.layerProg.use();
    lp.f4('uView', sx, sy, ox, oy);
    lp.f4('uHead', pose.headAngle, pose.headX, pose.headY, 0);
    lp.f2('uHeadPivot', A.headPivot[0], A.headPivot[1]);
    lp.f4('uEarL', pose.earLAngle, pose.earLFold, A.earLPivot[0], A.earLPivot[1]);
    lp.f4('uEarR', pose.earRAngle, pose.earRFold, A.earRPivot[0], A.earRPivot[1]);
    const la = unit(A.earLTip[0] - A.earLPivot[0], A.earLTip[1] - A.earLPivot[1]);
    const ra = unit(A.earRTip[0] - A.earRPivot[0], A.earRTip[1] - A.earRPivot[1]);
    lp.f4('uEarAxes', la[0], la[1], ra[0], ra[1]);
    lp.f4('uTail', pose.tailAngle, 0, A.tailPivot[0], A.tailPivot[1]);
    lp.f4('uBreath', pose.breath * 0.016, A.breathCenter[0], A.breathCenter[1], 0);
    lp.f4('uPaw', pose.pawX, pose.pawY, pose.pawSqueeze, 0);
    lp.f2('uPawCenter', A.pawL[0], A.pawL[1]);
    lp.f4('uRipple', pose.rippleAmp, pose.ripplePhase, 0.075, 0);
    lp.f1('uPuff', pose.puff);
    lp.f4('uGlobal', pose.gx, pose.gy, pose.stretch, pose.gAngle);
    lp.f2('uGlobalPivot', A.body[0], A.body[1]);
    lp.f2('uStretchDir', pose.stretchDirX, pose.stretchDirY);
    lp.f4('uGrade', pose.desat, pose.dim + env.night * 0.32, env.night, pose.alpha);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.field.tex);
    lp.i1('uField', 1);
    lp.i1('uTex', 0);
    gl.activeTexture(gl.TEXTURE0);

    for (const L of this.layers) {
      lp.f4('uLayer', L.x, L.y, L.w, L.h);
      lp.f2('uTexel', 1 / L.texW, 1 / L.texH);
      const blurLen = Math.hypot(pose.blurX, pose.blurY);
      const samples = blurLen > 1.5 ? Math.min(24, Math.ceil(blurLen / 3) + 2) : 0;
      lp.f3('uBlur', pose.blurX / L.w, pose.blurY / L.h, samples);
      lp.f1('uFocus', (pose.focus * L.texW) / L.w);
      gl.bindTexture(gl.TEXTURE_2D, L.tex);
      gl.bindVertexArray(L.vao);
      gl.drawElements(gl.TRIANGLES, L.count, gl.UNSIGNED_SHORT, 0);
      if (L.name === 'head') {
        this.drawEye('A', pose, eyeA, sx, sy, ox, oy, env, fieldSample);
        this.drawEye('B', pose, eyeB, sx, sy, ox, oy, env, fieldSample);
        lp.use();
        gl.activeTexture(gl.TEXTURE0);
      }
    }
    gl.bindVertexArray(null);
  }

  private drawEye(
    which: 'A' | 'B', pose: Pose, e: EyeDraw, sx: number, sy: number, ox: number, oy: number,
    env: Env, fieldSample: (x: number, y: number) => [number, number],
  ) {
    if (e.open < 0.02 || pose.alpha < 0.01) return;
    const gl = this.gl;
    const f = this.eyeAxes[which];
    const [fx, fy] = fieldSample(f.c[0], f.c[1]);
    const corners: [number, number][] = [[-1.32, -0.62], [1.32, -0.62], [-1.32, 1.9], [1.32, 1.9]];
    const data = new Float32Array(16);
    corners.forEach(([lx, ly], i) => {
      const px = f.c[0] + (f.u[0] * lx + f.v[0] * ly) * f.hw;
      const py = f.c[1] + (f.u[1] * lx + f.v[1] * ly) * f.hw;
      const [qx, qy] = headPoint(this.rig, pose, px, py, fx, fy);
      data.set([qx * sx + ox, qy * sy + oy, lx, ly], i * 4);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.eyeBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    const ep = this.eyeProg.use();
    ep.f1('uOpen', e.open);
    ep.f1('uSquint', e.squint);
    ep.f1('uPupil', clamp(e.pupil + env.night * 0.35));
    ep.f2('uGaze', e.gazeX, e.gazeY);
    // light from the upper left of the room, expressed in the eye's own frame
    const ang = pose.headAngle + pose.gAngle;
    const L = [-0.55, -0.83];
    const u = rotv(f.u, ang), vv = rotv(f.v, ang);
    ep.f2('uLight', L[0] * u[0] + L[1] * u[1], L[0] * vv[0] + L[1] * vv[1]);
    ep.f1('uShade', (which === 'B' ? 0.16 : 0.0) + env.night * 0.25 + pose.dim * 0.5);
    ep.f1('uFore', which === 'B' ? 0.78 : 1.0);
    ep.f1('uPx', 1 / (f.hw * this.view.scale * this.view.dpr));
    ep.f1('uAlpha', e.alpha * pose.alpha);
    const des = pose.desat;
    const mixc = (c: number[]) => {
      const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
      return c.map((x) => x + (l - x) * des) as [number, number, number];
    };
    ep.f3('uIrisIn', ...mixc([0.66, 0.63, 0.27]));
    ep.f3('uIrisOut', ...mixc([0.86, 0.6, 0.2]));
    ep.f1('uWet', 1 - pose.dim * 0.8 - des * 0.5);
    gl.bindVertexArray(this.eyeVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Where an eye currently sits on screen (CSS px) and its frame, for gaze aiming. */
  eyeScreen(which: 'A' | 'B', pose: Pose): { x: number; y: number; u: [number, number]; v: [number, number] } {
    const f = this.eyeAxes[which];
    const [qx, qy] = headPoint(this.rig, pose, f.c[0], f.c[1] + 0);
    const [x, y] = this.toScreen(qx, qy);
    const ang = pose.headAngle + pose.gAngle;
    return { x, y, u: rotv(f.u, ang), v: rotv(f.v, ang) };
  }

  /** P position of the whole cat after the global (bolt) transform, for hit tests. */
  globalP(pose: Pose, x: number, y: number) {
    return globalPoint(this.rig, pose, x, y);
  }
}

interface EyeFrame {
  c: [number, number];
  u: [number, number];
  v: [number, number];
  hw: number;
}

function eyeFrame(rig: RigData, which: 'A' | 'B'): EyeFrame {
  const e = which === 'A' ? rig.anchors.eyeA : rig.anchors.eyeB;
  const u = unit(e.b[0] - e.a[0], e.b[1] - e.a[1]);
  let perp: [number, number] = [u[1], -u[0]];
  // "up" = towards the forehead (roughly up-left in this tucked pose)
  const faceUp: [number, number] = [-0.62, -0.78];
  if (perp[0] * faceUp[0] + perp[1] * faceUp[1] < 0) perp = [-perp[0], -perp[1]];
  const v = unit(perp[0] * 0.55 + faceUp[0] * 0.45, perp[1] * 0.55 + faceUp[1] * 0.45);
  const hw = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) / 2;
  // centre on the lid line midpoint
  const c: [number, number] = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
  return { c, u, v, hw };
}

function unit(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

function rotv(a: [number, number], ang: number): [number, number] {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [c * a[0] - s * a[1], s * a[0] + c * a[1]];
}

function blur(src: Float32Array, n: number, sigma: number) {
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(n * n);
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += src[y * n + clampI(x + i, n)] * k[i + r];
      tmp[y * n + x] = s;
    }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += tmp[clampI(y + i, n) * n + x] * k[i + r];
      out[y * n + x] = s;
    }
  return out;
}

const clampI = (v: number, n: number) => (v < 0 ? 0 : v >= n ? n - 1 : v);
