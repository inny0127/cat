import * as THREE from 'three';
import { Cat3D } from '../cat3d/cat';
import { Stage } from '../cat3d/stage';
import { moodFromBrain } from '../cat3d/mood';
import { PointerInput, type Contact } from '../input/pointer';
import { MotionInput } from '../input/motion';
import { CatAudio } from '../audio/audio';
import { Haptic } from '../platform/haptics';
import { Notifier, forecast } from '../platform/notify';
import { Hint } from '../ui/hint';
import { Brain } from '../sim/brain';
import { loadState, newCat, saveState, type CatState } from '../sim/state';
import { stepLife, nightness, THRESH } from '../sim/life';
import { clamp } from '../util/math';
import { PixelAvatar } from './avatar';
import { Senses3D } from './senses';
import { Room } from './room';

const MODEL = './cat3d/fri.bin';

/**
 * The window onto the pixel cat's room. The same life, brain, gestures and notifications as the
 * painted cat (app.ts); the body is the 3D cat drawn as pixel art, which the brain moves through
 * PixelAvatar, and whose feelings show in its eyes, ears, tail, fur and breath.
 */
export class PixelApp {
  readonly stage: Stage;
  readonly audio = new CatAudio();
  readonly haptic = new Haptic();
  readonly notifier = new Notifier();
  readonly motion = new MotionInput();
  readonly hintUi: Hint;
  readonly input: PointerInput;
  readonly senses: Senses3D;
  readonly avatar: PixelAvatar;
  readonly room: Room;
  state: CatState;
  brain!: Brain;
  private last = 0;
  private visible = !document.hidden;
  private askNotify = false;
  private askMotion = false;
  private idleHintAt = 14;
  private saveIn = 10;
  private touchedAt = -1e9;
  private readonly aim = new THREE.Vector3(0, 0.12, 0.05);

  static async create(canvas: HTMLCanvasElement, hint: HTMLDivElement) {
    const cat = await Cat3D.load(MODEL, {});
    return new PixelApp(canvas, hint, cat);
  }

  constructor(readonly canvas: HTMLCanvasElement, hintEl: HTMLDivElement, readonly cat: Cat3D) {
    this.stage = new Stage({ pixel: PixelApp.artWidth(), paper: '#f4eee4', shadowSize: 2.6 }, canvas);
    this.stage.add(cat);
    this.hintUi = new Hint(hintEl);
    this.senses = new Senses3D(cat, this.stage.camera, canvas);
    this.frame3d();
    this.avatar = new PixelAvatar(cat, { x: 0, z: 0.05, yaw: 0 }, this.halfWidth() + 0.25,
      (sx, sy, out) => this.senses.screenToWorld(sx, sy, out), () => this.stage.camera.position);
    this.room = new Room(cat.shared as unknown as Record<string, { value: unknown }>, { bed: new THREE.Vector3(0, 0, 0.05) });
    this.stage.scene.add(this.room.group);
    // the room has a floor of its own
    this.stage.floor.visible = false;
    this.avatar.spots = this.room.spots;
    this.frame3d();

    const now = Date.now();
    const firstEver = !localStorageHas();
    this.state = loadState(now);
    stepLife(this.state, Math.max(0, now - this.state.lastTick), true);
    this.state.lastTick = now;
    this.state.stats.visits++;
    this.makeBrain();
    this.brain.wake(performance.now() / 1000, firstEver);
    this.avatar.settle();

    this.input = new PointerInput(canvas, {
      hitCat: (sx, sy) => !this.avatar.hidden && !!this.senses.hitNear(sx, sy),
      toP: (sx, sy) => [sx * this.senses.k, sy * this.senses.k],
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

    window.addEventListener('resize', () => { this.stage.resize(); this.frame3d(); });
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.persist(true));
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    (window as unknown as { __pcat: PixelApp }).__pcat = this;
    requestAnimationFrame((t) => this.loop(t));
  }

  /** art pixels across the screen: about two css px each on a phone */
  static artWidth() {
    return Math.round(clamp(innerWidth / 2.1, 150, 260));
  }

  /** half the width of the room seen at the cat's bed (metres) */
  private halfWidth() {
    const cam = this.stage.camera;
    const d = cam.position.distanceTo(this.aim);
    return Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * d * cam.aspect;
  }

  /** the view into the room: the bed low in the middle, the window above it, a little from above
   *  and from far off (nearly flat, as pixel art is drawn). A phone held upright sees the room as
   *  wide as the bed and its neighbours and as tall as the window; a wide screen, as tall */
  private frame3d() {
    const cam = this.stage.camera;
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const el = THREE.MathUtils.degToRad(17);
    // far enough to see a metre across at the bed, and 1.7 m up and down
    const d = Math.max(0.52 / (tv * cam.aspect), 0.85 / tv);
    const t = new THREE.Vector3(this.aim.x, 0.47, this.aim.z - 0.25);
    cam.position.set(t.x, t.y + d * Math.sin(el), t.z + d * Math.cos(el));
    cam.lookAt(t);
    // the brain's touch speeds are in the painted cat's pixels: about 600 across the window
    this.senses.k = 600 / Math.max(1, innerWidth);
    // the sun comes in through the window from up on the left and lies on the floor; a soft fill
    // from the room behind you; the window lights the cat's edges
    this.cat.shared.uKeyDir.value.set(-0.42, 0.62, -0.66).normalize();
    this.cat.shared.uFillDir.value.set(0.3, 0.35, 0.9).normalize();
    this.cat.shared.uRimDir.value.set(-0.2, 0.5, -0.85).normalize();
    // the sky through the window, in art pixels
    if (this.room) {
      const px = 2 * tv * cam.position.distanceTo(this.room.spots.bed) / this.stage.pixelRows();
      this.room.setPixel(px);
    }
  }

  private makeBrain() {
    this.brain = new Brain(this.state, this.avatar, this.audio, this.haptic, this.hintUi, {
      zoneAt: (px, py) => this.senses.zoneAt(px, py),
      grainAt: (px, py) => this.senses.grainAt(px, py),
      headScreen: () => this.senses.headScreen(),
      viewW: () => innerWidth,
      motionShake: this.motion.supported,
      earSide: (px, py) => this.senses.earSide(px, py),
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

  private longHold(onCat: boolean) {
    const r = this.brain.longHold(onCat);
    if (r === 'adopt') {
      const gen = this.state.generation + 1;
      const hints = this.state.hints;
      this.state = newCat(Date.now(), gen);
      this.state.hints = hints;
      this.state.notifyAsked = true;
      this.makeBrain();
      this.avatar.alive = true;
      this.avatar.arrive(() => this.audio.play('trill', { gain: 0.6 }));
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

  /** ?still: the page only draws; whoever drives it (tests, reels) calls tick() */
  private readonly manual = new URLSearchParams(location.search).has('still');
  /** ?hour=21: the room's clock, for looking at the evening by day */
  private readonly hourOverride = new URLSearchParams(location.search).get('hour');

  private clock() {
    const d = new Date();
    if (this.hourOverride !== null) d.setHours(+this.hourOverride, 0, 0, 0);
    return d;
  }

  private loop(nowMs: number) {
    const dt = Math.min(0.05, this.last ? (nowMs - this.last) / 1000 : 0.016);
    this.last = nowMs;
    if (this.visible && !this.manual) this.tick(dt, nowMs / 1000);
    this.stage.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  /** one step of the cat's life, mind and body (also driven by tests in fixed steps) */
  tick(dt: number, now: number) {
    stepLife(this.state, dt * 1000, false);
    if (!this.state.alive && this.brain.mode !== 'dead' && this.brain.mode !== 'gone') this.brain.wake(now, false);
    const contacts: Contact[] = this.avatar.hidden ? [] : this.input.onCat();
    this.brain.update(dt, now, contacts);
    // what it feels shows in its eyes, ears, tail, fur and breath
    const s = this.state;
    const sick = s.alive ? clamp((THRESH.sick - s.health) / THRESH.sick * 1.6) : 1;
    const clock = this.clock();
    const night = nightness(clock.getTime());
    const mood = moodFromBrain(this.brain, sick, s.trust, night);
    this.cat.motor.setMood(mood, true);
    this.avatar.mode = this.brain.mode;
    this.avatar.mood = mood;
    if (contacts.length) this.touchedAt = now;
    this.avatar.touched = now - this.touchedAt < 4;
    this.avatar.update(dt);
    this.cat.update(dt);
    this.room.update(s, night, clock.getHours() + clock.getMinutes() / 60, dt);
    // at night the lamp has a halo; the tea on the books steams; by day dust turns in the sun
    this.stage.setGlow(night > 0.5 ? this.room.lampPos.clone().add(new THREE.Vector3(0, 0.05, 0)) : null, 0.42);
    this.stage.setSteam(this.room.mugTop, 1);
    this.stage.setMotes(this.room.dust(dt, 1 - night));
    this.stage.setTime(now);
    this.hints(dt, contacts.length > 0);
    if ((this.saveIn -= dt) < 0) {
      this.saveIn = 10;
      this.persist(false);
    }
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
