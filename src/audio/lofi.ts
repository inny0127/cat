/**
 * A radio in the cat's room playing lofi: soft electric-piano chords in jazzy voicings, a round
 * bass, lazy swung drums under a blanket of low-pass, the crackle of a record and a little tape
 * wobble. All of it is made here, as it plays: the chords walk through a few progressions, the
 * drums vary and now and then drop out, and a few notes of melody come and go. At night it slows
 * and goes softer.
 */

const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const noise = () => Math.random() * 2 - 1;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// chords as [bass, voicing] in C (moved to the key below): rootless voicings round middle C
type Chord = [number, number[]];
const PROGS: Chord[][] = [
  // ii - V - I - vi
  [[38, [53, 57, 60, 64]], [43, [53, 59, 64, 69]], [36, [52, 55, 59, 62]], [45, [55, 59, 60, 64]]],
  // IV - iii - ii - I, falling
  [[41, [52, 57, 60, 64]], [40, [50, 55, 59, 62]], [38, [48, 53, 57, 60]], [36, [47, 52, 55, 59]]],
  // vi - ii - V - I
  [[45, [55, 60, 64, 67]], [38, [53, 57, 60, 64]], [43, [53, 57, 59, 64]], [36, [52, 55, 59, 62]]],
  // IV - iv - iii - vi: the borrowed minor four, bittersweet
  [[41, [52, 57, 60, 64]], [41, [51, 56, 60, 62]], [40, [50, 55, 59, 62]], [45, [55, 59, 60, 64]]],
];
const KEY = -2;                         // B flat
const PENTA = [0, 2, 4, 7, 9];          // the melody's notes (major pentatonic, from the key)

// sixteen steps a bar
const KICKS = [
  [1, 0, 0, 0, 0, 0, 0, 0.55, 0, 0, 0.8, 0, 0, 0, 0, 0],
  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0.6, 0, 0, 0, 0, 0],
  [1, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0.85, 0, 0, 0, 0, 0],
];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.22];
const HATS = [0.7, 0, 0.32, 0.12, 0.6, 0, 0.32, 0.18, 0.7, 0, 0.32, 0.12, 0.6, 0, 0.36, 0.22];

export class Lofi {
  private readonly out: GainNode;
  private readonly keys: GainNode;
  private readonly bassBus: GainNode;
  private readonly drums: GainNode;
  private readonly verbSend: GainNode;
  private readonly wow: GainNode;
  private readonly samples: Record<'kick' | 'snare' | 'hat' | 'ohat' | 'vinyl', AudioBuffer>;
  private vinylSrc: AudioBufferSourceNode | null = null;
  private timer = 0;
  private step = 0;
  private bar = 0;
  private nextAt = 0;
  private prog = 0;
  private motif: { at: number; deg: number; len: number }[] = [];
  private night = 0;
  playing = false;
  /** when its beats fall (the audio clock, a little ahead of now as they are scheduled), and how
   *  hard each is (a kick on it, a snare, or only the hats) */
  private beats: { at: number; k: number }[] = [];

  constructor(private readonly ctx: AudioContext, dest: AudioNode) {
    const c = ctx;
    this.out = c.createGain();
    this.out.gain.value = 0;
    // the whole of it dusty: the top rolled off
    const dust = c.createBiquadFilter();
    dust.type = 'lowpass';
    dust.frequency.value = 6500;
    this.out.connect(dust).connect(dest);
    // a dark room's reverb
    const verb = c.createConvolver();
    verb.buffer = this.impulse(2.4);
    this.verbSend = c.createGain();
    this.verbSend.gain.value = 0.3;
    const verbOut = c.createGain();
    verbOut.gain.value = 0.55;
    this.verbSend.connect(verb).connect(verbOut).connect(this.out);
    // the piano: warm, a slow tremolo swaying it between the ears
    this.keys = c.createGain();
    this.keys.gain.value = 1;
    const keysLp = c.createBiquadFilter();
    keysLp.type = 'lowpass';
    keysLp.frequency.value = 2600;
    keysLp.Q.value = 0.4;
    const keysHp = c.createBiquadFilter();
    keysHp.type = 'highpass';
    keysHp.frequency.value = 110;
    const pan = c.createStereoPanner();
    const panLfo = c.createOscillator();
    panLfo.frequency.value = 3.2;
    const panDepth = c.createGain();
    panDepth.gain.value = 0.35;
    panLfo.connect(panDepth).connect(pan.pan);
    panLfo.start();
    this.keys.connect(keysHp).connect(keysLp).connect(pan);
    pan.connect(this.out);
    pan.connect(this.verbSend);
    this.bassBus = c.createGain();
    this.bassBus.gain.value = 1;
    const bassLp = c.createBiquadFilter();
    bassLp.type = 'lowpass';
    bassLp.frequency.value = 420;
    this.bassBus.connect(bassLp).connect(this.out);
    this.drums = c.createGain();
    this.drums.gain.value = 0.5;
    const drumLp = c.createBiquadFilter();
    drumLp.type = 'lowpass';
    drumLp.frequency.value = 3800;
    const sat = c.createWaveShaper();
    sat.curve = this.softClip();
    this.drums.connect(drumLp).connect(sat).connect(this.out);
    const drumVerb = c.createGain();
    drumVerb.gain.value = 0.12;
    drumLp.connect(drumVerb).connect(this.verbSend);
    // tape: a slow wow and a quicker flutter in the pitch of the piano
    this.wow = c.createGain();
    this.wow.gain.value = 1;
    const wowLfo = c.createOscillator();
    wowLfo.frequency.value = 0.35;
    const wowDepth = c.createGain();
    wowDepth.gain.value = 7;
    wowLfo.connect(wowDepth).connect(this.wow);
    const flLfo = c.createOscillator();
    flLfo.frequency.value = 5.3;
    const flDepth = c.createGain();
    flDepth.gain.value = 1.6;
    flLfo.connect(flDepth).connect(this.wow);
    wowLfo.start();
    flLfo.start();
    const sr = c.sampleRate;
    this.samples = { kick: this.buf(kick(sr)), snare: this.buf(snare(sr)), hat: this.buf(hat(sr, 0.025)), ohat: this.buf(hat(sr, 0.12)), vinyl: this.buf(vinyl(sr)) };
  }

  /** start playing (fading in), or stop (fading out) */
  set(on: boolean) {
    const c = this.ctx;
    if (on === this.playing) return;
    this.playing = on;
    const g = this.out.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setValueAtTime(g.value, c.currentTime);
    if (on) {
      g.linearRampToValueAtTime(0.3, c.currentTime + 3);
      if (!this.vinylSrc) {
        const v = c.createBufferSource();
        v.buffer = this.samples.vinyl;
        v.loop = true;
        const vg = c.createGain();
        vg.gain.value = 0.16;
        v.connect(vg).connect(this.out);
        v.start();
        this.vinylSrc = v;
      }
      this.bar = 0;
      this.step = 0;
      this.nextAt = c.currentTime + 0.1;
      if (!this.timer) this.timer = window.setInterval(() => this.schedule(), 30);
    } else {
      g.linearRampToValueAtTime(0, c.currentTime + 1.5);
      window.setTimeout(() => {
        if (this.playing) return;
        clearInterval(this.timer);
        this.timer = 0;
        this.vinylSrc?.stop();
        this.vinylSrc = null;
      }, 1700);
    }
  }

  /** schedule the first `seconds` all at once (rendering it offline, for a listen) */
  offline(seconds: number) {
    this.playing = true;
    this.out.gain.value = 0.3;
    const v = this.ctx.createBufferSource();
    v.buffer = this.samples.vinyl;
    v.loop = true;
    const vg = this.ctx.createGain();
    vg.gain.value = 0.16;
    v.connect(vg).connect(this.out);
    v.start(0);
    this.nextAt = 0.05;
    while (this.nextAt < seconds) {
      const s16 = 60 / this.bpm / 4;
      const swing = this.step % 2 === 1 ? 0.2 * s16 : 0;
      this.play(this.step, this.nextAt + swing, s16);
      this.nextAt += s16;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  /** the beat now: 1 as it falls, dying away over the next fifth of a second or so, times how hard
   *  it is (0 between beats, and while it is not playing) */
  pulse() {
    if (!this.playing) return 0;
    const now = this.ctx.currentTime;
    let last: { at: number; k: number } | null = null;
    for (const b of this.beats) if (b.at <= now) last = b;
    return last ? last.k * Math.exp(-(now - last.at) / 0.11) : 0;
  }

  /** night: slower, softer */
  setNight(n: number) {
    this.night = n;
  }

  private get bpm() {
    return 76 - 6 * this.night;
  }

  private schedule() {
    const c = this.ctx;
    while (this.nextAt < c.currentTime + 0.2) {
      const s16 = 60 / this.bpm / 4;
      // swung sixteenths, a lazy feel
      const swing = this.step % 2 === 1 ? 0.2 * s16 : 0;
      this.play(this.step, this.nextAt + swing, s16);
      this.nextAt += s16;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  private play(step: number, t: number, s16: number) {
    const bar = this.bar;
    // a new progression now and then, every eight bars
    if (step === 0 && bar % 8 === 0) {
      this.prog = Math.random() < 0.6 ? this.prog : Math.floor(Math.random() * PROGS.length);
      if (bar % 16 === 0) this.makeMotif();
    }
    const chords = PROGS[this.prog];
    const [bass, voicing] = chords[bar % 4];
    const soft = 1 - 0.35 * this.night;
    const hum = () => rnd(-0.006, 0.006);
    // the first two bars the piano alone; a bar with no drums every so often
    const drumsIn = bar >= 2 && !(bar % 16 === 15 && step >= 8);
    if (step === 0) {
      // the chord, rolled a little, held over the bar; a softer touch again later in some bars
      const vel = rnd(0.5, 0.68) * soft;
      voicing.forEach((m, i) => this.ep(t + i * 0.014 + hum(), m + KEY, vel * (1 - i * 0.05), s16 * (Math.random() < 0.5 ? 16 : 10)));
      if (Math.random() < 0.45) {
        const at = Math.random() < 0.5 ? 6 : 10;
        voicing.forEach((m, i) => { if (i > 0) this.ep(t + at * s16 + i * 0.01 + hum(), m + KEY, vel * 0.55, s16 * 4); });
      }
      // the bass: the root, then the root or its fifth again, and a step toward the next chord
      this.bassNote(t + hum(), bass + KEY, 0.55 * soft, s16 * 6);
      const again = Math.random() < 0.5 ? 7 : 10;
      this.bassNote(t + again * s16 + hum(), bass + KEY + (Math.random() < 0.3 ? 7 : 0), 0.4 * soft, s16 * 4);
      if (Math.random() < 0.35) {
        const next = chords[(bar + 1) % 4][0];
        this.bassNote(t + 14 * s16 + hum(), next + KEY + (Math.random() < 0.5 ? 1 : -1), 0.3 * soft, s16 * 2);
      }
      // a few notes of the tune on the first and third bars of a phrase
      if ((bar % 4 === 0 || bar % 4 === 2) && bar >= 4) {
        for (const n of this.motif) {
          if (bar % 4 === 2 && Math.random() < 0.3) continue;
          const note = this.melodyNote(n.deg + (bar % 4 === 2 && n === this.motif[this.motif.length - 1] ? -1 : 0), voicing);
          this.ep(t + n.at * s16 + hum(), note + KEY, 0.42 * soft, n.len * s16, true);
        }
      }
    }
    // (the beats, for whatever keeps time with them)
    if (step % 4 === 0) {
      this.beats.push({ at: t, k: drumsIn ? (KICKS[(bar >> 1) % KICKS.length][step] || SNARE[step] ? 1 : 0.6) : 0.35 });
      if (this.beats.length > 8) this.beats.shift();
    }
    if (drumsIn) {
      const k = KICKS[(bar >> 1) % KICKS.length][step];
      if (k) this.hit('kick', t + hum(), k * 0.9 * soft);
      const sn = SNARE[step];
      if (sn) this.hit('snare', t + hum() + 0.008, sn * 0.55 * soft * (sn < 1 ? rnd(0.6, 1) : 1));
      const h = HATS[step];
      if (h && Math.random() > 0.08) this.hit(step === 14 && bar % 4 === 3 ? 'ohat' : 'hat', t + hum(), h * 0.22 * soft * rnd(0.75, 1.1));
    }
  }

  /** a short tune for the phrase: a few notes, where in the bar and how long */
  private makeMotif() {
    const n = 2 + Math.floor(Math.random() * 3);
    const at = [0, 3, 4, 6, 8, 10, 11, 12].sort(() => Math.random() - 0.5).slice(0, n).sort((a, b) => a - b);
    let deg = Math.floor(rnd(5, 9));
    this.motif = at.map((a, i) => {
      deg += i === 0 ? 0 : Math.round(rnd(-2, 2));
      return { at: a, deg, len: i === n - 1 ? 6 : Math.max(2, (at[i + 1] ?? 16) - a) };
    });
  }

  /** a note of the melody: a degree of the pentatonic scale, kept to the notes of the chord's mood */
  private melodyNote(deg: number, voicing: number[]) {
    const oct = Math.floor(deg / 5), d = ((deg % 5) + 5) % 5;
    let m = 60 + 12 * oct + PENTA[d];
    // avoid a semitone's clash with the chord
    if (voicing.some((v) => Math.abs(((m - v) % 12 + 12) % 12) === 1 || Math.abs(((v - m) % 12 + 12) % 12) === 1)) m += 2;
    return Math.min(84, Math.max(64, m));
  }

  /** an electric piano note: a soft sine body under a short bell of a tine */
  private ep(t: number, midi: number, vel: number, dur: number, lead = false) {
    const c = this.ctx;
    const f = mtof(midi);
    const car = c.createOscillator();
    car.frequency.value = f;
    const mod = c.createOscillator();
    mod.frequency.value = f;
    const mg = c.createGain();
    mg.gain.setValueAtTime(f * (0.9 + 1.4 * vel), t);
    mg.gain.exponentialRampToValueAtTime(f * 0.18, t + 1.1);
    mod.connect(mg).connect(car.frequency);
    const tine = c.createOscillator();
    tine.frequency.value = f * 14;
    const tg = c.createGain();
    tg.gain.setValueAtTime(f * (lead ? 1.2 : 2.2) * vel, t);
    tg.gain.exponentialRampToValueAtTime(f * 0.01, t + 0.06);
    tine.connect(tg).connect(car.frequency);
    this.wow.connect(car.detune);
    const amp = c.createGain();
    const peak = (lead ? 0.15 : 0.12) * vel;
    const end = t + dur;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.004);
    amp.gain.setTargetAtTime(peak * 0.25, t + 0.004, midi < 55 ? 2.2 : 1.5);
    amp.gain.setTargetAtTime(0, end, 0.12);
    car.connect(amp).connect(this.keys);
    if (lead) amp.connect(this.verbSend);
    const stop = end + 0.7;
    for (const o of [car, mod, tine]) { o.start(t); o.stop(stop); }
    car.onended = () => { this.wow.disconnect(car.detune); amp.disconnect(); };
  }

  private bassNote(t: number, midi: number, vel: number, dur: number) {
    const c = this.ctx;
    const f = mtof(midi);
    const o = c.createOscillator();
    o.frequency.value = f;
    const o2 = c.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f;
    const g2 = c.createGain();
    g2.gain.value = 0.25;
    const amp = c.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.42 * vel, t + 0.018);
    amp.gain.setTargetAtTime(0.22 * vel, t + 0.02, 0.5);
    amp.gain.setTargetAtTime(0, t + dur, 0.07);
    o.connect(amp);
    o2.connect(g2).connect(amp);
    amp.connect(this.bassBus);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.5); o2.stop(t + dur + 0.5);
    o.onended = () => amp.disconnect();
  }

  private hit(name: 'kick' | 'snare' | 'hat' | 'ohat', t: number, vel: number) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.samples[name];
    s.playbackRate.value = rnd(0.98, 1.02);
    const g = c.createGain();
    g.gain.value = vel;
    s.connect(g).connect(this.drums);
    s.start(t);
    s.onended = () => g.disconnect();
  }

  private buf(data: Float32Array) {
    const b = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    return b;
  }

  /** a room's echo: two channels of noise dying away, the highs first */
  private impulse(seconds: number) {
    const sr = this.ctx.sampleRate, n = Math.floor(seconds * sr);
    const b = this.ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const k = 0.15 + 0.8 * (t / seconds);
        lp += (noise() - lp) * (1 - k);
        d[i] = lp * Math.pow(1 - t / seconds, 2.2) * 0.5;
      }
    }
    return b;
  }

  private softClip() {
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(1.6 * x) / Math.tanh(1.6);
    }
    return curve;
  }
}

/** a soft, round kick: a sine falling in pitch, a little click on top */
function kick(sr: number) {
  const n = Math.floor(0.5 * sr), d = new Float32Array(n);
  let ph = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 46 + 75 * Math.exp(-t / 0.032);
    ph += (2 * Math.PI * f) / sr;
    const body = Math.sin(ph) * Math.exp(-t / 0.2) * (1 - Math.exp(-t / 0.0015));
    lp += (noise() - lp) * 0.3;
    d[i] = Math.tanh(1.4 * (body + lp * 0.25 * Math.exp(-t / 0.003))) * 0.9;
  }
  return d;
}

/** a dusty snare: a band of noise over a short low tone */
function snare(sr: number) {
  const n = Math.floor(0.35 * sr), d = new Float32Array(n);
  let b1 = 0, b2 = 0, lp = 0, ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // a crude band-pass: the difference of two low-passes
    const x = noise();
    b1 += (x - b1) * 0.35;
    b2 += (x - b2) * 0.08;
    const band = (b1 - b2) * Math.exp(-t / 0.085);
    ph += (2 * Math.PI * 185) / sr;
    const tone = Math.sin(ph) * Math.exp(-t / 0.05) * 0.45;
    const v = band * 1.4 + tone;
    lp += (v - lp) * 0.55;
    d[i] = lp * (1 - Math.exp(-t / 0.001));
  }
  return d;
}

/** a hat: high noise, closed (short) or open */
function hat(sr: number, decay: number) {
  const n = Math.floor((decay * 5 + 0.02) * sr), d = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const x = noise();
    lp += (x - lp) * 0.65;
    d[i] = (x - lp) * Math.exp(-t / decay) * 0.7;
  }
  return d;
}

/** a record's surface: a faint hiss, and crackles and pops scattered through it (it loops) */
function vinyl(sr: number) {
  const n = Math.floor(4 * sr), d = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const x = noise();
    lp += (x - lp) * 0.2;
    d[i] = (x - lp) * 0.012 + lp * 0.004;
  }
  // pops: a few a second, each a tiny decaying click
  const pops = Math.floor(4 * rnd(7, 10));
  for (let k = 0; k < pops; k++) {
    const at = Math.floor(rnd(0, n - sr * 0.01));
    const a = rnd(0.05, 0.35) * (Math.random() < 0.15 ? 2 : 1);
    const len = Math.floor(sr * rnd(0.0004, 0.0025));
    for (let i = 0; i < len; i++) d[at + i] += a * noise() * Math.exp(-i / (len * 0.3));
  }
  return d;
}
