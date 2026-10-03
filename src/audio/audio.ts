import * as S from './synth';
import { Lofi } from './lofi';
import { clamp, pick, rand } from '../util/math';

type Bank = Record<string, AudioBuffer[]>;

export interface PlayOpts {
  gain?: number;
  pan?: number;
  far?: boolean; // off-screen: muffled and quieter
  rate?: number;
  delay?: number;
}

/**
 * All sound lives here. The context starts on the first touch (browsers require a gesture).
 * Sounds from beyond the window (eating, the litter box) go through a muffled "far" bus.
 */
export class CatAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private near!: GainNode;
  private far!: GainNode;
  private bank: Bank = {};
  private purrSrc: AudioBufferSourceNode | null = null;
  private purrGain!: GainNode;
  private pourSrc: AudioBufferSourceNode | null = null;
  private pourGain!: GainNode;
  private pourFilter!: BiquadFilterNode;
  private ready = false;
  muted = false;
  /** the radio in the room (lofi.ts) */
  private lofi: Lofi | null = null;
  /** is the radio on (kept between visits; on unless it was switched off) */
  musicOn = readMusic();

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.near = ctx.createGain();
    this.near.connect(this.master);
    this.far = ctx.createGain();
    this.far.gain.value = 0.55;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1700;
    this.far.connect(lp).connect(this.master);
    this.purrGain = ctx.createGain();
    this.purrGain.gain.value = 0;
    this.purrGain.connect(this.near);
    this.pourGain = ctx.createGain();
    this.pourGain.gain.value = 0;
    this.pourFilter = ctx.createBiquadFilter();
    this.pourFilter.type = 'peaking';
    this.pourFilter.frequency.value = 900;
    this.pourFilter.gain.value = 4;
    this.pourGain.connect(this.pourFilter).connect(this.near);
    // build the sample bank in small slices so the first frame isn't blocked
    void this.build();
    this.lofi = new Lofi(ctx, this.master);
    this.lofi.set(this.musicOn && !this.muted);
  }

  /** switch the radio on or off */
  music(on: boolean) {
    this.musicOn = on;
    try { localStorage.setItem('cat-window.music', on ? '1' : '0'); } catch { /* private mode */ }
    this.lofi?.set(on && !this.muted);
  }

  /** is the radio playing now */
  get musicPlaying() {
    return !!this.lofi?.playing;
  }

  /** night: the radio slower and softer */
  setNight(n: number) {
    this.lofi?.setNight(n);
  }

  private rainSrc: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  /** rain on the window (0 .. 1) */
  setRain(level: number) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    if (level > 0.01 && !this.rainSrc) {
      const src = ctx.createBufferSource();
      src.buffer = this.bank.rain[0];
      src.loop = true;
      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      src.connect(this.rainGain).connect(this.master);
      src.start();
      this.rainSrc = src;
    }
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(this.muted ? 0 : 0.32 * Math.max(0, Math.min(1, level)), ctx.currentTime, 1.5);
    if (level <= 0.01 && this.rainSrc && this.rainGain && this.rainGain.gain.value < 0.003) {
      this.rainSrc.stop();
      this.rainSrc.disconnect();
      this.rainSrc = null;
    }
  }

  private async build() {
    const sr = this.ctx!.sampleRate;
    const make = (fn: () => Float32Array) => {
      const data = fn();
      const b = this.ctx!.createBuffer(1, data.length, sr);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      return b;
    };
    const jobs: [string, () => Float32Array, number][] = [
      ['purr', () => S.purr(sr), 2],
      ['trill', () => S.trill(sr), 3],
      ['meow', () => S.meow(sr, 'ask'), 3],
      ['meowSoft', () => S.meow(sr, 'soft'), 2],
      ['meowPlead', () => S.meow(sr, 'plead'), 2],
      ['chirp', () => S.chirp(sr), 2],
      ['hiss', () => S.hiss(sr), 2],
      ['growl', () => S.growl(sr), 2],
      ['kibblePour', () => S.kibblePour(sr), 1],
      ['kibbleShake', () => S.kibbleShake(sr), 3],
      ['water', () => S.waterPour(sr), 1],
      ['scoop', () => S.litterScoop(sr), 2],
      ['crunch', () => S.crunch(sr), 4],
      ['lap', () => S.lap(sr), 4],
      ['scratch', () => S.scratch(sr), 3],
      ['scrabble', () => S.scrabble(sr), 2],
      ['thump', () => S.thump(sr), 2],
      ['step', () => S.step(sr), 4],
      ['rain', () => S.rain(sr), 1],
    ];
    for (const [name, fn, count] of jobs) {
      this.bank[name] = [];
      for (let i = 0; i < count; i++) {
        this.bank[name].push(make(fn));
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    this.ready = true;
  }

  get isReady() {
    return this.ready;
  }

  /** play a sound from the bank; how long it lasts (s), 0 if it was not played */
  play(name: string, o: PlayOpts = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.ready || this.muted) return 0;
    const list = this.bank[name];
    if (!list?.length) return 0;
    const src = ctx.createBufferSource();
    src.buffer = pick(list);
    src.playbackRate.value = (o.rate ?? 1) * rand(0.97, 1.03);
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    let node: AudioNode = src.connect(g);
    if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      node = node.connect(p);
    }
    node.connect(o.far ? this.far : this.near);
    src.start(ctx.currentTime + (o.delay ?? 0));
    return src.buffer.duration / src.playbackRate.value;
  }

  /** a sequence of the same sound, e.g. chewing or lapping, spread over `seconds` */
  series(name: string, count: number, every: number, o: PlayOpts = {}) {
    for (let i = 0; i < count; i++) this.play(name, { ...o, delay: (o.delay ?? 0) + i * every * rand(0.8, 1.25) });
  }

  /** purr level 0..1, smoothed */
  setPurr(level: number) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    if (level > 0.01 && !this.purrSrc) {
      const src = ctx.createBufferSource();
      src.buffer = pick(this.bank.purr);
      src.loop = true;
      src.playbackRate.value = rand(0.96, 1.04);
      src.connect(this.purrGain);
      src.start();
      this.purrSrc = src;
    }
    const target = this.muted ? 0 : clamp(level) * 0.75;
    this.purrGain.gain.setTargetAtTime(target, ctx.currentTime, 0.35);
    if (level <= 0.01 && this.purrSrc && this.purrGain.gain.value < 0.005) {
      this.purrSrc.stop();
      this.purrSrc.disconnect();
      this.purrSrc = null;
    }
  }

  /** water keeps pouring while the finger is held */
  pour(on: boolean, fill = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    if (on && !this.pourSrc) {
      const src = ctx.createBufferSource();
      src.buffer = this.bank.water[0];
      src.loop = true;
      src.connect(this.pourGain);
      src.start();
      this.pourSrc = src;
    }
    // the bowl's resonance climbs as it fills
    this.pourFilter.frequency.setTargetAtTime(700 + fill * 900, ctx.currentTime, 0.2);
    this.pourGain.gain.setTargetAtTime(on && !this.muted ? 0.55 : 0, ctx.currentTime, on ? 0.05 : 0.12);
    if (!on && this.pourSrc) {
      const s = this.pourSrc;
      this.pourSrc = null;
      setTimeout(() => { try { s.stop(); s.disconnect(); } catch { /* already stopped */ } }, 600);
    }
  }

  suspend() {
    void this.ctx?.suspend();
  }
  resume() {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
  }
}

function readMusic() {
  try {
    return localStorage.getItem('cat-window.music') !== '0';
  } catch {
    return true;
  }
}
