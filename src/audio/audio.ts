import * as S from './synth';
import { Lofi } from './lofi';
import { clamp, pick, rand } from '../util/math';

type Bank = Record<string, AudioBuffer[]>;

export interface PlayOpts {
  gain?: number;
  pan?: number;
  far?: boolean; // off-screen: muffled and quieter
  out?: boolean; // outside the window: through the glass
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
  private outside!: GainNode;
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
      // (suspended, or on iOS 'interrupted' by a call or the app going to the background: only a
      // touch can start it again)
      if (this.ctx.state !== 'running') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    // on iOS: a room's sounds, not a music player's: they mix with whatever else is playing and
    // keep quiet with the phone's silent switch, as a game's do
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) {
      try { session.type = 'ambient'; } catch { /* not settable here */ }
    }
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
    // the world outside, heard through the glass
    this.outside = ctx.createGain();
    this.outside.gain.value = 0.6;
    const glass = ctx.createBiquadFilter();
    glass.type = 'lowpass';
    glass.frequency.value = 4200;
    this.outside.connect(glass).connect(this.master);
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

  private birdIn = 4;
  private crickSrc: AudioBufferSourceNode | null = null;
  private crickGain: GainNode | null = null;
  /** the world outside the window: birds by day (most at dawn and in spring), crickets on summer
   *  and early autumn nights; rain quiets both */
  setOutside(dt: number, o: { day: number; hour: number; month: number; rain: number }): 'bird' | null {
    const ctx = this.ctx;
    if (!ctx || !this.ready || this.muted) return null;
    let heard: 'bird' | null = null;
    const spring = o.month >= 2 && o.month <= 6 ? 1 : o.month >= 7 && o.month <= 9 ? 0.6 : 0.25;
    const dawn = Math.exp(-(((o.hour - 6.8) / 1.4) ** 2));
    const birdy = o.day * (1 - o.rain) * spring * (0.5 + dawn);
    if (birdy > 0.08 && (this.birdIn -= dt) <= 0) {
      this.birdIn = rand(5, 16) / (0.4 + birdy);
      this.play(Math.random() < 0.6 ? 'birdChip' : 'birdSong', { out: true, gain: rand(0.1, 0.24) * Math.min(1, birdy + 0.3), pan: rand(-0.8, 0.8), rate: rand(0.94, 1.08) });
      heard = 'bird';
    }
    const crick = (1 - o.day) * (1 - o.rain) * (o.month >= 5 && o.month <= 9 ? 1 : 0);
    if (crick > 0.05 && !this.crickSrc) {
      const src = ctx.createBufferSource();
      src.buffer = this.bank.crickets[0];
      src.loop = true;
      this.crickGain = ctx.createGain();
      this.crickGain.gain.value = 0;
      src.connect(this.crickGain).connect(this.outside);
      src.start();
      this.crickSrc = src;
    }
    if (this.crickGain) this.crickGain.gain.setTargetAtTime(0.09 * crick, ctx.currentTime, 2);
    if (crick <= 0.05 && this.crickSrc && this.crickGain && this.crickGain.gain.value < 0.002) {
      this.crickSrc.stop();
      this.crickSrc.disconnect();
      this.crickSrc = null;
    }
    return heard;
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
      ['rugScratch', () => S.rugScratch(sr), 3],
      ['thump', () => S.thump(sr), 2],
      ['pencil', () => S.pencil(sr), 3],
      ['shatter', () => S.shatter(sr), 2],
      ['bell', () => S.bell(sr), 4],
      ['step', () => S.step(sr), 4],
      ['rain', () => S.rain(sr), 1],
      ['birdChip', () => S.birdChip(sr), 4],
      ['birdSong', () => S.birdSong(sr), 4],
      ['crickets', () => S.crickets(sr), 1],
      ['thunder', () => S.thunder(sr), 2],
      ['sneeze', () => S.sneeze(sr), 3],
      ['yawn', () => S.yawn(sr), 3],
      ['sigh', () => S.sigh(sr), 3],
      ['thunderNear', () => S.thunder(sr, true), 2],
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
    node.connect(o.out ? this.outside : o.far ? this.far : this.near);
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

  /** Safari lets sound start only from the end of a touch (or a click, a key), not its start:
   *  every such event starts it, until it is running */
  unlockOn(target: EventTarget) {
    const go = () => {
      this.start();
      if (this.ctx?.state === 'running') for (const t of ['touchend', 'pointerup', 'click', 'keydown']) target.removeEventListener(t, go, true);
    };
    for (const t of ['touchend', 'pointerup', 'click', 'keydown']) target.addEventListener(t, go, true);
  }
}

function readMusic() {
  try {
    return localStorage.getItem('cat-window.music') !== '0';
  } catch {
    return true;
  }
}
