import { Renderer } from './render/renderer';
import { Silhouette, imageData, loadImage, loadRig, type LayerName, type RigData } from './rig/rig';
import { FurField } from './rig/furField';
import { Animator } from './rig/animator';
import { PointerInput, type Contact } from './input/pointer';
import { MotionInput } from './input/motion';
import { CatAudio } from './audio/audio';
import { Haptic } from './platform/haptics';
import { Notifier, forecast } from './platform/notify';
import { Hint } from './ui/hint';
import { Brain } from './sim/brain';
import { zoneAt } from './sim/zones';
import { loadState, newCat, saveState, type CatState } from './sim/state';
import { stepLife, nightness } from './sim/life';
import { headLocal } from './render/pose';
import { clamp } from './util/math';
import { Debug } from './ui/debug';

const ASSETS = './assets/';

export class App {
  readonly renderer: Renderer;
  readonly anim = new Animator();
  readonly field: FurField;
  readonly audio = new CatAudio();
  readonly haptic = new Haptic();
  readonly notifier = new Notifier();
  readonly motion = new MotionInput();
  readonly hintUi: Hint;
  readonly input: PointerInput;
  state: CatState;
  brain!: Brain;
  private last = 0;
  private frozen = false;
  private visible = !document.hidden;
  private askNotify = false;
  private askMotion = false;
  private idleHintAt = 14;
  private saveIn = 10;
  private debug: Debug | null = null;

  static async create(canvas: HTMLCanvasElement, hint: HTMLDivElement) {
    const rig = await loadRig(ASSETS);
    const names = rig.order;
    const [imgs, silImg] = await Promise.all([
      Promise.all(names.map((n) => loadImage(ASSETS + rig.layers[n].file))),
      loadImage(ASSETS + 'silhouette.png'),
    ]);
    const images = Object.fromEntries(names.map((n, i) => [n, imgs[i]])) as Record<LayerName, HTMLImageElement>;
    const sil = new Silhouette(imageData(silImg));
    return new App(canvas, hint, rig, images, sil);
  }

  constructor(
    readonly canvas: HTMLCanvasElement,
    hintEl: HTMLDivElement,
    readonly rig: RigData,
    images: Record<LayerName, HTMLImageElement>,
    readonly sil: Silhouette,
  ) {
    this.renderer = new Renderer(canvas, rig, images, sil);
    this.field = new FurField(rig.polys.head);
    this.hintUi = new Hint(hintEl);

    const now = Date.now();
    const firstEver = !localStorageHas();
    this.state = loadState(now);
    // whatever happened while the window was closed
    stepLife(this.state, Math.max(0, now - this.state.lastTick), true);
    this.state.lastTick = now;
    this.state.stats.visits++;
    this.makeBrain();
    this.brain.wake(performance.now() / 1000, firstEver);
    this.renderer.setCoat(this.state.personality.coat);

    this.input = new PointerInput(canvas, {
      hitCat: (sx, sy) => this.hitCat(sx, sy),
      toP: (sx, sy) => this.toP(sx, sy),
      catTouchStart: (c) => this.brain.touchStart(c),
      catTouchEnd: (c, tap) => { this.gestureEnd(); this.brain.touchEnd(c, tap); },
      glassTap: (x, y) => { this.gestureEnd(); this.brain.glassTap(x, y); },
      glassKnock: (x, y) => { this.gestureEnd(); this.brain.knock(x, y); },
      pourStart: () => this.brain.pourStart(),
      pourEnd: () => { this.gestureEnd(); this.brain.pourEnd(); },
      shake: (k) => this.brain.kibble(k),
      scoop: () => { this.gestureEnd(); this.brain.scoop(); },
      longHold: (_x, _y, onCat) => this.longHold(onCat),
      hover: (x, y) => this.brain.hover(x, y),
      firstGesture: () => this.audio.start(),
    });
    canvas.addEventListener('pointerdown', () => this.audio.start());
    this.motion.onShake = (k) => this.brain.kibble(k);

    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.persist(true));
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });
    canvas.addEventListener('webglcontextrestored', () => location.reload());

    if (new URLSearchParams(location.search).has('debug')) this.debug = new Debug(this);
    (window as unknown as { __cat: App }).__cat = this;
    requestAnimationFrame((t) => this.frame(t));
  }

  private makeBrain() {
    this.brain = new Brain(this.state, this.anim, this.audio, this.haptic, this.hintUi, {
      zoneAt: (px, py) => zoneAt(this.rig, px, py),
      grainAt: (px, py) => this.field.grainAt(px, py),
      headScreen: () => {
        const [x, y] = headLocal(this.rig, this.anim.pose, 150, 300);
        return { x: this.renderer.toScreen(x, y)[0], y: this.renderer.toScreen(x, y)[1] };
      },
      viewW: () => this.renderer.view.w,
      motionShake: this.motion.supported,
    });
    this.brain.onWantNotify = () => { this.askNotify = true; };
    this.brain.onWantMotion = () => { if (this.motion.canAsk) this.askMotion = true; };
  }

  /** permission prompts must come from inside a tap */
  private gestureEnd() {
    this.audio.start();
    if (this.askNotify) {
      this.askNotify = false;
      this.state.notifyAsked = true;
      void this.notifier.ask();
    }
    if (this.askMotion) {
      this.askMotion = false;
      void this.motion.ask();
    }
  }

  private toP(sx: number, sy: number): [number, number] {
    const [px, py] = this.renderer.toP(sx, sy);
    return [px - this.anim.pose.gx, py - this.anim.pose.gy];
  }

  private hitCat(sx: number, sy: number) {
    if (this.anim.hidden || this.anim.pose.alpha < 0.5) return false;
    const [px, py] = this.toP(sx, sy);
    // fingertips are wide: count a near miss as touching the fur
    return this.sil.distance(px, py) > -18 / Math.max(0.3, this.renderer.view.scale) * 0.35;
  }

  private longHold(onCat: boolean) {
    const r = this.brain.longHold(onCat);
    if (r === 'adopt') {
      const gen = this.state.generation + 1;
      const hints = this.state.hints;
      this.state = newCat(Date.now(), gen);
      this.state.hints = hints;
      this.state.notifyAsked = true;
      this.makeBrain();
      this.renderer.setCoat(this.state.personality.coat);
      this.anim.alive = true;
      this.anim.arrive(() => this.audio.play('trill', { gain: 0.6 }));
      this.brain.wake(performance.now() / 1000, false);
      this.persist(false);
    } else if (r === 'goodbye') {
      this.persist(false);
    }
  }

  private onVisibility() {
    this.visible = !document.hidden;
    if (!this.visible) {
      this.persist(true);
      this.audio.suspend();
      return;
    }
    void this.notifier.cancel();
    const now = Date.now();
    const gap = now - this.state.lastTick;
    const wasAway = this.state.where === 'away';
    const wasAlive = this.state.alive;
    stepLife(this.state, Math.max(0, gap), true);
    this.state.lastTick = now;
    this.audio.resume();
    if (gap > 90_000 || wasAway !== (this.state.where === 'away') || wasAlive !== this.state.alive) {
      this.state.stats.visits++;
      this.brain.wake(performance.now() / 1000, false);
    }
  }

  private persist(schedule: boolean) {
    this.state.lastVisitAt = Date.now();
    saveState(this.state);
    if (schedule) void this.notifier.schedule(forecast(this.state, Date.now()));
  }

  private keys = new Set<string>();
  private key(e: KeyboardEvent, down: boolean) {
    const k = e.key.toLowerCase();
    if (down && this.keys.has(k)) return;
    if (down) this.keys.add(k); else this.keys.delete(k);
    if (!down) {
      if (k === 'w') this.brain.pourEnd();
      return;
    }
    this.audio.start();
    if (k === 'f') this.brain.kibble(0.9);
    else if (k === 'w') this.brain.pourStart();
    else if (k === 'l' || k === 's') this.brain.scoop();
  }

  freeze(on = true) {
    this.frozen = on;
  }

  private frame(nowMs: number) {
    const dt = Math.min(0.05, this.last ? (nowMs - this.last) / 1000 : 0.016);
    this.last = nowMs;
    if (!this.frozen && this.visible) this.tick(dt, nowMs / 1000);
    this.renderer.render(
      this.anim.pose, this.anim.eyeA, this.anim.eyeB, this.field.take(),
      { night: nightness(Date.now()) * 0.85, time: nowMs / 1000 },
      (x, y) => this.field.sample(x, y),
    );
    requestAnimationFrame((t) => this.frame(t));
  }

  private tick(dt: number, now: number) {
    // the body keeps living in real time; errands are the brain's call while we watch
    stepLife(this.state, dt * 1000, false);
    if (!this.state.alive && this.brain.mode !== 'dead' && this.brain.mode !== 'gone') this.brain.wake(now, false);

    const contacts: Contact[] = this.anim.hidden ? [] : this.input.onCat();
    const scale = this.renderer.view.scale;
    for (const c of contacts) {
      const radius = 17 / scale;
      this.field.touch(c.px, c.py, c.vx, c.vy, radius, c.press, 1, dt);
    }
    this.brain.update(dt, now, contacts);
    this.aimEyes();
    this.anim.update(dt);
    this.field.step(dt);
    this.hints(dt, contacts.length > 0);
    if ((this.saveIn -= dt) < 0) {
      this.saveIn = 10;
      this.persist(false);
    }
    this.debug?.update();
  }

  /** turn the screen-space gaze target into an offset of the irises */
  private aimEyes() {
    const t = this.anim.gazeTarget;
    if (!t) {
      this.anim.gazeLocal = { x: 0, y: 0 };
      return;
    }
    const e = this.renderer.eyeScreen('A', this.anim.pose);
    const dx = t.x - e.x, dy = t.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = clamp(d / 240) * 0.3;
    this.anim.gazeLocal = {
      x: ((dx * e.u[0] + dy * e.u[1]) / d) * k,
      y: ((dx * e.v[0] + dy * e.v[1]) / d) * k,
    };
  }

  private hints(dt: number, touching: boolean) {
    const s = this.state;
    if (touching || this.input.touching) {
      this.idleHintAt = 1e9;
      return;
    }
    if (s.stats.petSeconds < 4 && s.alive && s.where === 'bed' && !s.hints.pet) {
      this.idleHintAt -= dt;
      if (this.idleHintAt < 0) {
        s.hints.pet = 1;
        this.hintUi.show('손가락으로 살며시 쓰다듬어 보세요', 5000);
      }
    }
  }
}

function localStorageHas() {
  try {
    return !!localStorage.getItem('cat-window.v1');
  } catch {
    return false;
  }
}
