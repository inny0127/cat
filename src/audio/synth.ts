// Offline sample synthesis for every sound the cat (and its world) makes. No recordings: each
// generator builds a Float32Array at the context's sample rate once, at startup.

const rnd = (lo = 0, hi = 1) => lo + Math.random() * (hi - lo);
const noise = () => Math.random() * 2 - 1;

/** RBJ biquad, enough for offline shaping */
class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(private sr: number, type: 'lp' | 'hp' | 'bp', f: number, q = 0.707) {
    this.set(type, f, q);
  }
  set(type: 'lp' | 'hp' | 'bp', f: number, q = 0.707) {
    const w = (2 * Math.PI * Math.min(f, this.sr * 0.45)) / this.sr;
    const cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cs) / a0; this.a2 = (1 - al) / a0;
  }
  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function filter(buf: Float32Array, sr: number, type: 'lp' | 'hp' | 'bp', f: number, q = 0.707) {
  const b = new Biquad(sr, type, f, q);
  for (let i = 0; i < buf.length; i++) buf[i] = b.run(buf[i]);
  return buf;
}

function normalize(buf: Float32Array, peak = 0.8) {
  let m = 0;
  for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] *= peak / m;
  return buf;
}

function fade(buf: Float32Array, sr: number, inS = 0.005, outS = 0.02) {
  const a = Math.floor(inS * sr), b = Math.floor(outS * sr);
  for (let i = 0; i < a && i < buf.length; i++) buf[i] *= i / a;
  for (let i = 0; i < b && i < buf.length; i++) buf[buf.length - 1 - i] *= i / b;
  return buf;
}

// ------------------------------------------------------------------ purring
/**
 * A purr is the larynx snapping open and shut ~25 times a second on both the in- and the
 * out-breath (slightly lower and softer breathing in). Each snap is a short noisy pulse that the
 * chest resonates. Built from whole breaths so it loops without a seam.
 */
export function purr(sr: number, minSeconds = 8): Float32Array {
  const breaths: { inh: number; exh: number; gapA: number; gapB: number }[] = [];
  let total = 0;
  while (total < minSeconds) {
    const b = { inh: rnd(0.95, 1.25), exh: rnd(1.25, 1.65), gapA: rnd(0.05, 0.12), gapB: rnd(0.08, 0.2) };
    breaths.push(b);
    total += b.inh + b.exh + b.gapA + b.gapB;
  }
  const out = new Float32Array(Math.ceil(total * sr));
  const air = new Float32Array(out.length);
  let t = 0;
  const pulse = (at: number, amp: number, body: number) => {
    const i0 = Math.floor(at * sr);
    const len = Math.floor(0.022 * sr);
    const tn = 0.0035 * sr, tb = 0.007 * sr;
    const ph = Math.random() * Math.PI * 2;
    for (let k = 0; k < len && i0 + k < out.length; k++) {
      const n = noise() * Math.exp(-k / tn) * 0.7;
      const s = Math.sin(ph + (2 * Math.PI * body * k) / sr) * Math.exp(-k / tb);
      out[i0 + k] += amp * (n + s);
    }
  };
  for (const b of breaths) {
    for (const phase of ['inh', 'exh'] as const) {
      const dur = b[phase];
      const f0 = phase === 'inh' ? rnd(21.5, 23.5) : rnd(24.5, 27);
      const amp = phase === 'inh' ? 0.55 : 1;
      const body = phase === 'inh' ? rnd(62, 75) : rnd(82, 98);
      let tp = t;
      while (tp < t + dur) {
        const x = (tp - t) / dur;
        const env = Math.pow(Math.sin(Math.PI * x), 0.55);
        pulse(tp, amp * env * rnd(0.8, 1.15), body);
        tp += 1 / (f0 * rnd(0.96, 1.04));
      }
      // breath air
      const i0 = Math.floor(t * sr), i1 = Math.floor((t + dur) * sr);
      for (let i = i0; i < i1 && i < air.length; i++) {
        const x = (i - i0) / (i1 - i0);
        air[i] = noise() * Math.sin(Math.PI * x) * (phase === 'inh' ? 0.05 : 0.035);
      }
      t += dur + (phase === 'inh' ? b.gapA : b.gapB);
    }
  }
  filter(out, sr, 'lp', 950, 0.6);
  filter(out, sr, 'lp', 1400, 0.7);
  filter(out, sr, 'hp', 38, 0.7);
  filter(air, sr, 'lp', 1500, 0.7);
  for (let i = 0; i < out.length; i++) out[i] += air[i];
  return normalize(out, 0.85);
}

// ------------------------------------------------------------------ voice
/** formant-filtered pulse train with time-varying pitch and vowel */
function voice(
  sr: number, dur: number,
  f0: (x: number) => number,
  formants: (x: number) => [number, number, number],
  env: (x: number) => number,
  opts: { breath?: number; am?: (x: number, t: number) => number; lp?: number } = {},
) {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const f1 = new Biquad(sr, 'bp', 800, 6), f2 = new Biquad(sr, 'bp', 1800, 8), f3 = new Biquad(sr, 'bp', 3200, 10);
  let phase = 0;
  let jit = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n, t = i / sr;
    if (i % 64 === 0) {
      const [a, b, c] = formants(x);
      f1.set('bp', a, 5); f2.set('bp', b, 7); f3.set('bp', c, 9);
      jit = jit * 0.7 + rnd(-1, 1) * 0.3;
    }
    const f = f0(x) * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t) + 0.006 * jit);
    phase += f / sr;
    if (phase >= 1) phase -= 1;
    // soft glottal pulse: fast close, slower open
    const g = phase < 0.6 ? Math.sin((Math.PI * phase) / 0.6) ** 2 : 0;
    const src = g - 0.35 + noise() * (opts.breath ?? 0.08);
    let y = f1.run(src) * 1.0 + f2.run(src) * 0.55 + f3.run(src) * 0.22;
    y *= env(x) * (opts.am ? opts.am(x, t) : 1);
    out[i] = y;
  }
  if (opts.lp) filter(out, sr, 'lp', opts.lp, 0.7);
  filter(out, sr, 'hp', 120, 0.7);
  return fade(normalize(out, 0.8), sr, 0.004, 0.03);
}

/** "mi-a-ow": nasal onset, pitch rising and falling, vowel opening then rounding */
export function meow(sr: number, kind: 'ask' | 'soft' | 'plead' = 'ask') {
  const base = kind === 'plead' ? rnd(560, 650) : kind === 'soft' ? rnd(520, 600) : rnd(480, 560);
  const dur = kind === 'soft' ? rnd(0.38, 0.5) : kind === 'plead' ? rnd(0.8, 1.05) : rnd(0.55, 0.75);
  const rise = kind === 'plead' ? 0.42 : 0.3;
  return voice(
    sr, dur,
    (x) => base * (1 + rise * Math.pow(Math.sin(Math.PI * Math.min(1, x * 1.15)), 1.3) - 0.18 * x),
    (x) => {
      const open = Math.sin(Math.PI * Math.min(1, x * 1.25));
      const f1 = x < 0.1 ? 380 : 650 + 550 * open - 200 * Math.max(0, x - 0.7) / 0.3;
      const f2 = x < 0.1 ? 1500 : 1700 + 500 * open - 650 * Math.max(0, x - 0.6) / 0.4;
      return [f1, f2, 3300];
    },
    (x) => Math.min(1, x / 0.08) * (x > 0.75 ? Math.max(0, 1 - (x - 0.75) / 0.25) : 1),
    { breath: kind === 'plead' ? 0.12 : 0.07, lp: 5200 },
  );
}

/** closed-mouth greeting: a rolled, rising "mrrrp" */
export function trill(sr: number) {
  const base = rnd(300, 360);
  return voice(
    sr, rnd(0.24, 0.34),
    (x) => base * (1 + 0.55 * Math.min(1, x * 1.4) - 0.2 * Math.max(0, x - 0.75) / 0.25),
    () => [520, 1250, 2600],
    (x) => Math.min(1, x / 0.1) * Math.max(0, Math.min(1, (1 - x) / 0.2)),
    { breath: 0.05, lp: 2400, am: (_x, t) => 0.45 + 0.55 * Math.max(0, Math.sin(2 * Math.PI * 27 * t)) },
  );
}

/** short chirp/chatter */
export function chirp(sr: number) {
  const base = rnd(700, 900);
  return voice(
    sr, rnd(0.09, 0.13),
    (x) => base * (1 + 0.3 * Math.sin(Math.PI * x)),
    () => [900, 1900, 3200],
    (x) => Math.sin(Math.PI * x),
    { breath: 0.05, lp: 4500 },
  );
}

export function hiss(sr: number) {
  const dur = rnd(0.85, 1.15);
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const hp = new Biquad(sr, 'hp', 1600, 0.7);
  const b1 = new Biquad(sr, 'bp', 4200, 0.9), b2 = new Biquad(sr, 'bp', 7200, 1.2);
  let lfo = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (i % 256 === 0) lfo = lfo * 0.6 + rnd(-1, 1) * 0.4;
    const spit = t < 0.04 ? Math.exp(-t / 0.012) * 1.6 : 0;
    const env = Math.min(1, t / 0.025) * (t < dur - 0.18 ? 1 - 0.35 * (t / dur) : Math.max(0, (dur - t) / 0.18) * 0.65);
    const x = hp.run(noise());
    out[i] = (b1.run(x) * 1.2 + b2.run(x) * 0.8 + x * 0.25) * env * (1 + 0.15 * lfo) + noise() * spit * 0.5;
  }
  return fade(normalize(out, 0.75), sr, 0.002, 0.05);
}

export function growl(sr: number) {
  const dur = rnd(1.2, 1.8);
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  let phase = 0;
  let next = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n, t = i / sr;
    const env = Math.min(1, x / 0.15) * Math.min(1, (1 - x) / 0.2);
    const f = 105 + 25 * x + 6 * Math.sin(2 * Math.PI * 4 * t);
    phase += f / sr;
    if (phase > 1) phase -= 1;
    const saw = (phase * 2 - 1) * 0.5;
    let pulse = 0;
    if (t >= next) next = t + 1 / rnd(28, 36);
    const since = t - (next - 1 / 32);
    pulse = Math.exp(-Math.max(0, since) / 0.006) * noise();
    out[i] = (saw * (0.6 + 0.4 * Math.sin(2 * Math.PI * 31 * t)) + pulse * 0.8) * env;
  }
  filter(out, sr, 'lp', 520, 0.8);
  filter(out, sr, 'lp', 900, 0.7);
  filter(out, sr, 'hp', 60, 0.7);
  return fade(normalize(out, 0.7), sr);
}

// ------------------------------------------------------------------ world sounds
function clicks(out: Float32Array, sr: number, at: number, count: number, spread: number, lo: number, hi: number, amp: number, decay = 0.0025) {
  for (let c = 0; c < count; c++) {
    const t0 = at + Math.random() * spread;
    const i0 = Math.floor(t0 * sr);
    const len = Math.floor(rnd(0.003, 0.009) * sr);
    const bp = new Biquad(sr, 'bp', rnd(lo, hi), rnd(2, 5));
    const a = amp * rnd(0.3, 1);
    for (let k = 0; k < len && i0 + k < out.length; k++) {
      out[i0 + k] += bp.run(noise()) * a * Math.exp(-k / (decay * sr)) * 3;
    }
  }
}

function ping(out: Float32Array, sr: number, at: number, f: number, amp: number, decay: number) {
  const i0 = Math.floor(at * sr);
  const len = Math.floor(decay * 5 * sr);
  for (let k = 0; k < len && i0 + k < out.length; k++) {
    out[i0 + k] += Math.sin((2 * Math.PI * f * k) / sr) * amp * Math.exp(-k / (decay * sr));
  }
}

/** kibble poured into a ceramic bowl */
export function kibblePour(sr: number, dur = 1.4) {
  const out = new Float32Array(Math.floor((dur + 0.4) * sr));
  const steps = 60;
  for (let s = 0; s < steps; s++) {
    const x = s / steps;
    const density = Math.sin(Math.PI * Math.min(1, x * 1.2)) ** 0.7;
    clicks(out, sr, x * dur, Math.floor(density * 9), dur / steps, 1800, 6500, 0.9 * density);
    if (Math.random() < 0.18 * density) ping(out, sr, x * dur + Math.random() * 0.02, rnd(1350, 1900), 0.05, 0.08);
  }
  return fade(normalize(out, 0.7), sr);
}

/** one shake of the kibble box: a dense rattle */
export function kibbleShake(sr: number) {
  const out = new Float32Array(Math.floor(0.3 * sr));
  clicks(out, sr, 0.0, 40, 0.16, 1500, 5500, 0.8, 0.0018);
  clicks(out, sr, 0.04, 14, 0.12, 800, 2200, 0.5, 0.003);
  return fade(normalize(out, 0.6), sr, 0.002, 0.05);
}

/** water from a jug: bubbles whose pitch rises as the bowl fills (loopable 2 s) */
export function waterPour(sr: number) {
  const dur = 2.0;
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const bed = new Float32Array(n);
  for (let i = 0; i < n; i++) bed[i] = noise();
  filter(bed, sr, 'bp', 1600, 0.6);
  filter(bed, sr, 'lp', 3000, 0.7);
  for (let i = 0; i < n; i++) out[i] = bed[i] * 0.18;
  const bubbles = Math.floor(dur * 110);
  for (let b = 0; b < bubbles; b++) {
    const t0 = Math.random() * (dur - 0.06);
    const f0 = rnd(380, 1500);
    const tau = rnd(0.012, 0.035);
    const i0 = Math.floor(t0 * sr);
    const len = Math.floor(tau * 4 * sr);
    let ph = 0;
    const a = rnd(0.05, 0.25);
    for (let k = 0; k < len && i0 + k < n; k++) {
      const tt = k / sr;
      ph += (f0 * (1 + 2.2 * (tt / tau) * 0.3)) / sr;
      out[i0 + k] += Math.sin(2 * Math.PI * ph) * a * Math.exp(-tt / tau);
    }
  }
  // crossfade the ends so it loops
  const xf = Math.floor(0.08 * sr);
  for (let i = 0; i < xf; i++) {
    const w = i / xf;
    out[i] = out[i] * w + out[n - xf + i] * (1 - w);
  }
  return normalize(out.subarray(0, n - xf).slice(), 0.6);
}

/** dragging a scoop through litter, lifting it, sand trickling back */
export function litterScoop(sr: number) {
  const dur = 1.0;
  const out = new Float32Array(Math.floor(dur * sr));
  const swish = new Float32Array(out.length);
  for (let i = 0; i < swish.length; i++) {
    const t = i / sr;
    const env = t < 0.45 ? Math.sin((Math.PI * t) / 0.45) : 0;
    swish[i] = noise() * env;
  }
  filter(swish, sr, 'bp', 2400, 0.5);
  for (let i = 0; i < out.length; i++) out[i] = swish[i] * 0.5;
  for (let s = 0; s < 30; s++) clicks(out, sr, s * 0.015, 8, 0.015, 2500, 9000, 0.35, 0.0012);
  // tap on the bin
  ping(out, sr, 0.62, 180, 0.4, 0.03);
  clicks(out, sr, 0.62, 10, 0.03, 600, 2000, 0.4);
  for (let s = 0; s < 14; s++) clicks(out, sr, 0.66 + s * 0.02, 4, 0.02, 3000, 9000, 0.25 * (1 - s / 14), 0.001);
  return fade(normalize(out, 0.6), sr);
}

/** one bite of dry food, heard from the next room */
export function crunch(sr: number) {
  const out = new Float32Array(Math.floor(0.16 * sr));
  clicks(out, sr, 0, 26, 0.09, 700, 3800, 0.9, 0.002);
  ping(out, sr, 0.0, rnd(90, 130), 0.25, 0.02);
  return fade(normalize(out, 0.6), sr);
}

/** one lap of the tongue at the water bowl */
export function lap(sr: number) {
  const out = new Float32Array(Math.floor(0.07 * sr));
  clicks(out, sr, 0, 6, 0.02, 1200, 3200, 0.6, 0.003);
  const f = rnd(650, 1050);
  const i0 = Math.floor(0.012 * sr);
  for (let k = 0; k < 0.04 * sr && i0 + k < out.length; k++) {
    const tt = k / sr;
    out[i0 + k] += Math.sin(2 * Math.PI * f * (1 + 3 * tt) * tt) * 0.5 * Math.exp(-tt / 0.009);
  }
  return fade(normalize(out, 0.5), sr);
}

/** the cat raking litter in its box */
export function scratch(sr: number) {
  const out = new Float32Array(Math.floor(0.22 * sr));
  for (let s = 0; s < 12; s++) clicks(out, sr, s * 0.012, 10, 0.012, 1800, 7000, 0.5 * Math.sin((Math.PI * s) / 12), 0.0015);
  const sw = new Float32Array(out.length);
  for (let i = 0; i < sw.length; i++) sw[i] = noise() * Math.sin((Math.PI * i) / sw.length);
  filter(sw, sr, 'bp', 3000, 0.6);
  for (let i = 0; i < out.length; i++) out[i] += sw[i] * 0.3;
  return fade(normalize(out, 0.5), sr);
}

/** claws scrabbling on a wooden floor, then gone */
export function scrabble(sr: number) {
  const out = new Float32Array(Math.floor(0.7 * sr));
  for (let s = 0; s < 9; s++) {
    const t = s * rnd(0.045, 0.07);
    clicks(out, sr, t, 3, 0.012, 2500, 6000, 0.9 * (1 - s / 10), 0.0012);
    ping(out, sr, t + 0.005, rnd(70, 110), 0.35 * (1 - s / 10), 0.018);
  }
  return fade(normalize(out, 0.6), sr);
}

/** a soft landing / settling thump */
export function thump(sr: number) {
  const out = new Float32Array(Math.floor(0.2 * sr));
  ping(out, sr, 0, rnd(60, 80), 0.8, 0.035);
  const nz = new Float32Array(out.length);
  for (let i = 0; i < nz.length; i++) nz[i] = noise() * Math.exp(-i / (0.012 * sr));
  filter(nz, sr, 'lp', 500, 0.7);
  for (let i = 0; i < out.length; i++) out[i] += nz[i] * 0.6;
  return fade(normalize(out, 0.6), sr, 0.001, 0.03);
}

/** a padded step on the floor */
export function step(sr: number) {
  const out = new Float32Array(Math.floor(0.09 * sr));
  ping(out, sr, 0, rnd(80, 120), 0.5, 0.015);
  clicks(out, sr, 0.002, 2, 0.01, 1500, 3500, 0.12, 0.002);
  return fade(normalize(out, 0.4), sr, 0.001, 0.02);
}

// ------------------------------------------------------------------ rain
/**
 * Rain heard from indoors: a soft wash of noise with its highs muffled by the glass, the patter of
 * drops on the pane and the sill (bright little ticks, a few heavier taps). Loops without a seam.
 */
export function rain(sr: number, seconds = 6): Float32Array {
  const n = Math.floor(seconds * sr);
  const d = new Float32Array(n);
  // the wash: two bands of noise, gently swelling
  const lo = new Biquad(sr, 'lp', 900), mid = new Biquad(sr, 'bp', 2200, 0.6);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const swell = 0.8 + 0.2 * Math.sin((2 * Math.PI * t) / seconds) * Math.sin((6 * Math.PI * t) / seconds);
    d[i] = (lo.run(noise()) * 0.5 + mid.run(noise()) * 0.18) * swell;
  }
  // drops: ticks on the glass, taps on the sill
  const tick = (at: number, amp: number, f: number, dec: number) => {
    const bp = new Biquad(sr, 'bp', f, 2.5);
    const len = Math.floor(dec * 6 * sr);
    for (let i = 0; i < len; i++) {
      const j = (at + i) % n;
      d[j] += bp.run(noise()) * amp * Math.exp(-i / (dec * sr));
    }
  };
  for (let k = 0; k < seconds * 26; k++) tick(Math.floor(rnd(0, n)), rnd(0.05, 0.22), rnd(2500, 6000), rnd(0.002, 0.006));
  for (let k = 0; k < seconds * 3; k++) tick(Math.floor(rnd(0, n)), rnd(0.15, 0.35), rnd(500, 900), rnd(0.008, 0.02));
  return normalize(d, 0.5);
}

/** thunder: a long low roll that rumbles as it goes, swelling and dying away; near, it opens with
 *  a crack */
export function thunder(sr: number, near = false) {
  const dur = rnd(4.5, 7.5);
  const n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  const lo = new Biquad(sr, 'lp', near ? 420 : 240), sub = new Biquad(sr, 'lp', 80);
  const p1 = rnd(0, 6), p2 = rnd(0, 6), f1 = rnd(1.6, 2.8), f2 = rnd(4, 6.5);
  let brown = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    brown = brown * 0.996 + noise() * 0.08;
    const env = (1 - Math.exp(-t / (near ? 0.03 : 0.35))) * Math.exp(-t / (dur * 0.32));
    // rolling: the loudness swells and falls as the sound comes in from further along the bolt
    const roll = 0.55 + 0.45 * Math.sin(t * f1 + p1 + Math.sin(t * 0.6) * 2) * (0.6 + 0.4 * Math.sin(t * f2 + p2));
    d[i] = (lo.run(brown) * 1.4 + sub.run(noise()) * 2.2) * env * roll;
  }
  if (near) {
    // the crack: a tearing burst at the start, bright then quickly dull
    const hp = new Biquad(sr, 'hp', 300), lp = new Biquad(sr, 'lp', 2600);
    const len = Math.floor(0.35 * sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const tear = Math.random() < 0.3 ? noise() : noise() * 0.3;
      d[i] += lp.run(hp.run(tear)) * 1.6 * Math.exp(-t / 0.09);
    }
  }
  return normalize(fade(d, sr, 0.005, 0.8), 0.9);
}

/** a small bird outside: a few quick high chips ("tsip, tsip, tsip"), each falling a little */
export function birdChip(sr: number) {
  const count = 2 + Math.floor(rnd(0, 3)), gap = rnd(0.09, 0.16), len = rnd(0.035, 0.06), f0 = rnd(3800, 5200);
  const n = Math.floor((count * gap + 0.1) * sr);
  const d = new Float32Array(n);
  for (let k = 0; k < count; k++) {
    const at = Math.floor(k * gap * rnd(0.9, 1.1) * sr), m = Math.floor(len * sr);
    const fk = f0 * rnd(0.97, 1.03);
    let ph = 0;
    for (let i = 0; i < m && at + i < n; i++) {
      const x = i / m;
      ph += (2 * Math.PI * fk * (1 + 0.28 * (1 - x))) / sr;
      d[at + i] += Math.sin(ph) * Math.pow(Math.sin(Math.PI * x), 0.6) * (1 - 0.3 * k / count);
    }
  }
  return normalize(d, 0.5);
}

/** a bird's little song: a run of notes stepping up and down, slurred, ending in a trill */
export function birdSong(sr: number) {
  const notes: [number, number][] = [];
  let f = rnd(2600, 3600);
  const count = 4 + Math.floor(rnd(0, 5));
  for (let k = 0; k < count; k++) {
    f = Math.max(2000, Math.min(5200, f * (Math.random() < 0.5 ? rnd(1.05, 1.3) : rnd(0.78, 0.96))));
    notes.push([f, rnd(0.05, 0.12)]);
  }
  const trill = rnd(0.18, 0.32), tf = f * rnd(1.1, 1.3);
  const total = notes.reduce((a, [, l]) => a + l + 0.025, 0) + trill + 0.1;
  const n = Math.floor(total * sr);
  const d = new Float32Array(n);
  let at = 0, ph = 0;
  for (let k = 0; k < notes.length; k++) {
    const [fk, l] = notes[k];
    const next = k + 1 < notes.length ? notes[k + 1][0] : tf;
    const m = Math.floor(l * sr);
    for (let i = 0; i < m && at + i < n; i++) {
      const x = i / m;
      // slurring toward the next note at the end of each, with a little vibrato
      const fi = fk + (next - fk) * Math.max(0, (x - 0.7) / 0.3) ** 2;
      ph += (2 * Math.PI * fi * (1 + 0.012 * Math.sin(2 * Math.PI * 28 * (at + i) / sr))) / sr;
      d[at + i] += Math.sin(ph) * Math.pow(Math.sin(Math.PI * x), 0.5);
    }
    at += m + Math.floor(0.025 * sr);
  }
  const m = Math.floor(trill * sr);
  for (let i = 0; i < m && at + i < n; i++) {
    const x = i / m, t = i / sr;
    ph += (2 * Math.PI * tf * (1 + 0.18 * Math.sin(2 * Math.PI * 24 * t))) / sr;
    d[at + i] += Math.sin(ph) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 24 * t)) * Math.sin(Math.PI * x) * 0.8;
  }
  return normalize(d, 0.45);
}

/** crickets on a summer night: a few of them, each chirping its own rhythm (a seamless loop) */
export function crickets(sr: number, seconds = 8) {
  const n = Math.floor(seconds * sr);
  const d = new Float32Array(n);
  for (let c = 0; c < 4; c++) {
    const f = rnd(4300, 5400), every = rnd(0.5, 0.95), pulses = 3 + Math.floor(rnd(0, 2)), rate = rnd(26, 34), amp = rnd(0.3, 1);
    const plen = Math.floor(0.02 * sr);
    for (let s0 = rnd(0, every); s0 < seconds; s0 += every * rnd(0.96, 1.04)) {
      for (let p = 0; p < pulses; p++) {
        const at = Math.floor((s0 + p / rate) * sr);
        for (let i = 0; i < plen; i++) {
          const j = (at + i) % n;
          d[j] += Math.sin((2 * Math.PI * f * (at + i)) / sr) * Math.sin((Math.PI * i) / plen) * amp;
        }
      }
    }
  }
  return normalize(d, 0.4);
}
