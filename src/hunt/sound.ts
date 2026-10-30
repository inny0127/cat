import type * as THREE from 'three';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** a sound made up, as samples (mono, at the given rate) */
type Make = (sr: number) => Float32Array;

function env(a: number, d: number, sr: number) {
  return (i: number) => Math.min(1, i / (a * sr)) * Math.exp(-i / (d * sr));
}

const MAKERS: Record<string, Make> = {
  // a cricket: a few quick pulses of a high, pure note
  chirp: (sr) => {
    const out = new Float32Array(Math.floor(0.36 * sr));
    const f = rnd(4200, 4700);
    for (let p = 0; p < 3; p++) {
      const at = Math.floor(p * 0.11 * sr), len = Math.floor(0.07 * sr);
      for (let i = 0; i < len; i++) {
        const t = i / sr, e = Math.sin((Math.PI * i) / len);
        out[at + i] += Math.sin(2 * Math.PI * f * t) * e * (0.6 + 0.4 * Math.sin(2 * Math.PI * 30 * t)) * 0.5;
      }
    }
    return out;
  },
  // a mouse: two short squeaks, gliding up
  squeak: (sr) => {
    const out = new Float32Array(Math.floor(0.3 * sr));
    for (const [at, f0] of [[0, 2600], [0.13, 3000]] as const) {
      const i0 = Math.floor(at * sr), len = Math.floor(0.08 * sr);
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const u = i / len, f = f0 + 900 * u;
        ph += (2 * Math.PI * f) / sr;
        out[i0 + i] += Math.sin(ph) * Math.sin(Math.PI * u) * 0.45;
      }
    }
    return out;
  },
  // wings: soft flaps of filtered noise
  flutter: (sr) => {
    const out = new Float32Array(Math.floor(0.25 * sr));
    let lp = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / sr;
      lp += (Math.random() * 2 - 1 - lp) * 0.2;
      out[i] = lp * Math.max(0, Math.sin(2 * Math.PI * 38 * t)) * (1 - t / 0.25) * 0.5;
    }
    return out;
  },
  hop: (sr) => {
    const out = new Float32Array(Math.floor(0.06 * sr));
    const e = env(0.001, 0.01, sr);
    for (let i = 0; i < out.length; i++) out[i] = (Math.random() * 2 - 1) * e(i) * 0.4;
    return out;
  },
  // the pounce: a rush of air
  whoosh: (sr) => {
    const out = new Float32Array(Math.floor(0.35 * sr));
    let lp = 0;
    for (let i = 0; i < out.length; i++) {
      const u = i / out.length;
      lp += (Math.random() * 2 - 1 - lp) * (0.05 + 0.25 * Math.sin(Math.PI * u));
      out[i] = lp * Math.sin(Math.PI * u) * 0.9;
    }
    return out;
  },
  // paws coming down: a soft thud
  thud: (sr) => {
    const out = new Float32Array(Math.floor(0.15 * sr));
    const e = env(0.002, 0.03, sr);
    let lp = 0;
    for (let i = 0; i < out.length; i++) {
      lp += (Math.random() * 2 - 1 - lp) * 0.08;
      out[i] = (Math.sin((2 * Math.PI * 70 * i) / sr) * 0.6 + lp * 1.5) * e(i);
    }
    return out;
  },
  // a little patter of a paw on the floor
  pat: (sr) => {
    const out = new Float32Array(Math.floor(0.04 * sr));
    const e = env(0.001, 0.008, sr);
    let lp = 0;
    for (let i = 0; i < out.length; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.3; out[i] = lp * e(i) * 0.5; }
    return out;
  },
  // the swat: a quick swish
  swish: (sr) => {
    const out = new Float32Array(Math.floor(0.14 * sr));
    let hp = 0, prev = 0;
    for (let i = 0; i < out.length; i++) {
      const u = i / out.length, n = Math.random() * 2 - 1;
      hp = 0.7 * (hp + n - prev);
      prev = n;
      out[i] = hp * Math.sin(Math.PI * u) * 0.5;
    }
    return out;
  },
  // a glass or a mug on the floor: a crack, shards ringing, bits skittering
  shatter: (sr) => {
    const out = new Float32Array(Math.floor(0.9 * sr));
    const e = env(0.001, 0.05, sr);
    let hp = 0, prev = 0;
    for (let i = 0; i < out.length; i++) {
      const n = Math.random() * 2 - 1;
      hp = 0.85 * (hp + n - prev);
      prev = n;
      out[i] = hp * e(i) * 0.9;
    }
    for (let k = 0; k < 14; k++) {
      const i0 = Math.floor(rnd(0, 0.5) * sr), f = rnd(2500, 6500), d = rnd(0.03, 0.12);
      for (let i = 0; i < out.length - i0; i++) {
        const t = i / sr;
        out[i0 + i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / d) * 0.12;
      }
    }
    return out;
  },
  // something hard and light off a shelf: a clack, a bounce, a roll
  clatter: (sr) => {
    const out = new Float32Array(Math.floor(0.6 * sr));
    for (const [at, g] of [[0, 0.8], [0.16, 0.45], [0.27, 0.25], [0.33, 0.12]] as const) {
      const i0 = Math.floor(at * sr), f = rnd(700, 1100);
      for (let i = 0; i < out.length - i0; i++) {
        const t = i / sr;
        out[i0 + i] += (Math.sin(2 * Math.PI * f * t) * 0.6 + (Math.random() * 2 - 1) * 0.5) * Math.exp(-t / 0.025) * g;
      }
    }
    return out;
  },
  // thunder far off: a crack, then a long low roll
  thunder: (sr) => {
    const out = new Float32Array(Math.floor(3 * sr));
    let lp = 0, lp2 = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / sr;
      lp += (Math.random() * 2 - 1 - lp) * 0.02;
      lp2 += (lp - lp2) * 0.05;
      const roll = Math.min(1, t / 0.08) * Math.exp(-t / 1.1) * (0.7 + 0.3 * Math.sin(t * 7 + Math.sin(t * 3) * 2));
      out[i] = lp2 * 9 * roll + (t < 0.06 ? (Math.random() * 2 - 1) * (1 - t / 0.06) * 0.3 : 0);
    }
    return out;
  },
  // the chatter at a thing out of reach: quick little clicks of the teeth
  chatter: (sr) => {
    const out = new Float32Array(Math.floor(0.7 * sr));
    for (let k = 0; k < 11; k++) {
      const i0 = Math.floor((k * 0.055 + rnd(-0.006, 0.006)) * sr), f = rnd(1800, 2400), a = 0.5 * (1 - k / 14);
      for (let i = 0; i < 0.03 * sr && i0 + i < out.length; i++) {
        const t = i / sr;
        out[i0 + i] += (Math.sin(2 * Math.PI * f * t) * 0.5 + (Math.random() * 2 - 1) * 0.5) * Math.exp(-t / 0.006) * a;
      }
    }
    return out;
  },
  // caught: a bright pop and a chime up
  catch: (sr) => {
    const out = new Float32Array(Math.floor(0.5 * sr));
    for (const [at, f] of [[0, 880], [0.07, 1320], [0.14, 1760]] as const) {
      const i0 = Math.floor(at * sr);
      for (let i = 0; i < out.length - i0; i++) {
        const t = i / sr;
        out[i0 + i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.12) * Math.min(1, t / 0.003) * 0.35;
      }
    }
    return out;
  },
  // the gift laid on the bed: a fanfare
  gift: (sr) => {
    const out = new Float32Array(Math.floor(1.2 * sr));
    [523, 659, 784, 1046, 1318].forEach((f, k) => {
      const i0 = Math.floor(k * 0.09 * sr);
      for (let i = 0; i < out.length - i0; i++) {
        const t = i / sr;
        out[i0 + i] += (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * Math.exp(-t / (k === 4 ? 0.4 : 0.15)) * Math.min(1, t / 0.004) * 0.25;
      }
    });
    return out;
  },
  // a miss: a dull flop
  miss: (sr) => {
    const out = new Float32Array(Math.floor(0.25 * sr));
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const u = i / out.length;
      ph += (2 * Math.PI * (220 - 120 * u)) / sr;
      out[i] = Math.sin(ph) * (1 - u) * 0.3;
    }
    return out;
  },
  // the person, stirring: a grumble
  grumble: (sr) => {
    const out = new Float32Array(Math.floor(0.7 * sr));
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const u = i / out.length, f = 110 + 25 * Math.sin(u * 9);
      ph += (2 * Math.PI * f) / sr;
      const s = Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph);
      out[i] = s * Math.sin(Math.PI * u) * 0.25;
    }
    return out;
  },
  // the person asleep: a slow breath in, out
  snore: (sr) => {
    const out = new Float32Array(Math.floor(1.6 * sr));
    let lp = 0;
    for (let i = 0; i < out.length; i++) {
      const u = i / out.length;
      lp += (Math.random() * 2 - 1 - lp) * 0.04;
      out[i] = (lp * 1.2 + 0.15 * Math.sin((2 * Math.PI * 85 * i) / sr)) * Math.pow(Math.sin(Math.PI * u), 2) * 0.35;
    }
    return out;
  },
  // the clock's alarm at dawn
  alarm: (sr) => {
    const out = new Float32Array(Math.floor(1.0 * sr));
    for (let i = 0; i < out.length; i++) {
      const t = i / sr, on = Math.floor(t * 8) % 2 === 0 ? 1 : 0;
      out[i] = (Math.sin(2 * Math.PI * 2000 * t) > 0 ? 0.18 : -0.18) * on;
    }
    return out;
  },
};

/**
 * The night's sounds, made up when first needed and placed in the room: a chirp from under the
 * table comes from under the table (as you turn, round you), so with ears (headphones) you can
 * hunt by sound. Starts on the first touch, as browsers want.
 */
export class Sound {
  ctx: AudioContext | null = null;
  private bank = new Map<string, AudioBuffer[]>();
  private out!: GainNode;
  muted = false;

  start() {
    if (this.ctx) { if (this.ctx.state !== 'running') void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.out.connect(comp).connect(ctx.destination);
    for (const [name, make] of Object.entries(MAKERS)) {
      const list: AudioBuffer[] = [];
      for (let k = 0; k < (name === 'chirp' || name === 'squeak' || name === 'pat' ? 3 : 1); k++) {
        const d = make(ctx.sampleRate);
        const b = ctx.createBuffer(1, d.length, ctx.sampleRate);
        b.copyToChannel(d as Float32Array<ArrayBuffer>, 0);
        list.push(b);
      }
      this.bank.set(name, list);
    }
    // (the hush of a flat at night: a low hum, very soft)
    const n = ctx.sampleRate * 2, hum = ctx.createBuffer(1, n, ctx.sampleRate), d = hum.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < n; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.01; d[i] = lp * 0.6 + 0.02 * Math.sin((2 * Math.PI * 50 * i) / ctx.sampleRate); }
    const src = ctx.createBufferSource();
    src.buffer = hum;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0.25;
    src.connect(g).connect(this.out);
    src.start();
    // (rain on the windows, for a rainy night: a hiss and the patter of drops, turned up when it rains)
    const rn = ctx.sampleRate * 3, rb = ctx.createBuffer(1, rn, ctx.sampleRate), rd = rb.getChannelData(0);
    let hp = 0, prev = 0;
    for (let i = 0; i < rn; i++) {
      const w = Math.random() * 2 - 1;
      hp = 0.6 * (hp + w - prev);
      prev = w;
      rd[i] = hp * 0.25;
    }
    for (let k = 0; k < 160; k++) {
      const i0 = Math.floor(Math.random() * (rn - 400)), a = 0.2 + Math.random() * 0.5;
      for (let i = 0; i < 300; i++) rd[i0 + i] += (Math.random() * 2 - 1) * a * Math.exp(-i / 40);
    }
    const rs = ctx.createBufferSource();
    rs.buffer = rb;
    rs.loop = true;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = this.raining ? 0.5 : 0;
    rs.connect(this.rainGain).connect(this.out);
    rs.start();
  }

  private rainGain: GainNode | null = null;
  private raining = false;
  /** the rain heard on the windows, or not */
  rain(on: boolean) {
    this.raining = on;
    if (this.rainGain && this.ctx) this.rainGain.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.4);
  }

  /** start on the first touch (and again after the app comes back) */
  unlockOn(target: EventTarget) {
    const go = () => { this.start(); if (this.ctx?.state === 'running') for (const t of ['pointerup', 'touchend', 'keydown', 'click']) target.removeEventListener(t, go, true); };
    for (const t of ['pointerup', 'touchend', 'keydown', 'click']) target.addEventListener(t, go, true);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  /** where the ears are, and the way the face is turned */
  listen(eye: THREE.Vector3, fwd: THREE.Vector3) {
    const ctx = this.ctx;
    if (!ctx) return;
    const L = ctx.listener;
    if (L.positionX) {
      const t = ctx.currentTime;
      L.positionX.setValueAtTime(eye.x, t);
      L.positionY.setValueAtTime(eye.y, t);
      L.positionZ.setValueAtTime(eye.z, t);
      L.forwardX.setValueAtTime(fwd.x, t);
      L.forwardY.setValueAtTime(fwd.y, t);
      L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(0, t);
      L.upY.setValueAtTime(1, t);
      L.upZ.setValueAtTime(0, t);
    } else {
      (L as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(eye.x, eye.y, eye.z);
      (L as unknown as { setOrientation: (...a: number[]) => void }).setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  /** a sound, from a place in the room (none: in your own head), so loud */
  play(name: string, at: THREE.Vector3 | null = null, gain = 1, rate = 1) {
    const ctx = this.ctx;
    const list = this.bank.get(name);
    if (!ctx || !list || this.muted) return;
    const src = ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate * rnd(0.96, 1.04);
    const g = ctx.createGain();
    g.gain.value = gain;
    let node: AudioNode = src.connect(g);
    if (at) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 0.4;
      p.rolloffFactor = 1.2;
      if (p.positionX) { p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z; }
      else (p as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(at.x, at.y, at.z);
      node = node.connect(p);
    }
    node.connect(this.out);
    src.start();
  }

  suspend() { void this.ctx?.suspend(); }
  resume() { if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume(); }
}
