import * as THREE from 'three';
import type { Cat3D } from '../cat3d/cat';
import { moodFromBrain } from '../cat3d/mood';
import { PointerInput, type Contact } from '../input/pointer';
import { CatAudio } from '../audio/audio';
import { Haptic } from '../platform/haptics';
import { Hint } from '../ui/hint';
import { Brain } from '../sim/brain';
import { newCat, type CatState } from '../sim/state';
import { PixelAvatar, type Spot } from '../pixel/avatar';
import type { SmoothStage } from './stage';
import { SmoothSenses } from './touch';
import { Yarn } from './yarn';

/** the smooth cat's own save: never the pixel cat's (cat-window.v1) */
const KEY = 'cat-smooth.v1';
/** where it lives on its paper: the middle, facing you */
const HOME: Spot = { x: 0, z: 0, yaw: 0 };
/** gone off in a huff, it is back within this long (the pixel cat may stay away twenty minutes) */
const AWAY_MAX = 40_000;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * The smooth cat at home on its cream paper: the pixel cat's whole life with it, but the room.
 * The brain (sim/brain.ts) is its mind (its moods, its trust in you, what it makes of a hand on
 * each part of it); PixelAvatar and its acts (pixel/avatar.ts, pixel/behave.ts) are its body's
 * doings (sleeping in naps, a yawn and a stretch on waking, washing, scratching, coming up to the
 * glass to look at you, pottering about, the zoomies, playing with its ball of wool); the pointer
 * (input/pointer.ts) is your hand. Its needs are always met here (there are no bowls on the paper),
 * so it never goes hungry and never leaves on an errand; a huff, it does, and it comes back.
 */
export class SmoothApp {
  readonly audio = new CatAudio();
  readonly haptic = new Haptic();
  readonly hint: Hint;
  readonly senses: SmoothSenses;
  readonly avatar: PixelAvatar;
  readonly yarn: Yarn;
  readonly input: PointerInput;
  readonly state: CatState;
  readonly brain: Brain;
  /** the first time on this device: it is awake, to say hello */
  private readonly fresh: boolean;
  private touchedAt = -1e9;
  private saveIn = 10;
  private clock = 0;
  private petHintIn = 12;

  constructor(readonly stage: SmoothStage, readonly cat: Cat3D, readonly canvas: HTMLCanvasElement, hintEl: HTMLDivElement,
    touchGeometry: THREE.BufferGeometry, readonly manual: boolean) {
    // (no radio on the paper; and the pixel cat's setting for it is left alone)
    this.audio.musicOn = false;
    this.hint = new Hint(hintEl);
    this.senses = new SmoothSenses(cat, stage.camera, canvas, touchGeometry);
    this.frame();
    this.avatar = new PixelAvatar(cat, HOME, 1.6, (sx, sy, out) => this.senses.screenToWorld(sx, sy, out), () => stage.camera.position);
    this.avatar.feel = (sx, sy) => this.senses.hitNear(sx, sy);
    this.yarn = new Yarn(stage.scene, cat.shared as unknown as Record<string, { value: unknown }>, new THREE.Vector3(0.3, 0, 0.28));
    this.avatar.toys = this.yarn.toys();
    this.avatar.outside = {
      birds: () => null,
      chirp: () => this.audio.play('chirp', { gain: 0.45, pan: this.catPan() }),
      sound: (name, gain) => this.audio.play(name, { gain, pan: this.catPan() }),
    };
    // its paws on the paper: a soft pat
    cat.stepper.onLand = (_leg, settle) => {
      if (this.avatar.hidden) return;
      this.audio.play('step', { gain: (settle ? 0.04 : 0.09) * 0.6, pan: this.catPan(), rate: 0.95 });
    };

    const loaded = loadState(Date.now());
    this.state = loaded.state;
    this.fresh = loaded.fresh;
    keepFed(this.state, Date.now());
    this.state.stats.visits++;
    this.brain = new Brain(this.state, this.avatar, this.audio, this.haptic, this.hint, {
      zoneAt: (px, py) => this.senses.zoneAt(px, py),
      grainAt: (px, py) => this.senses.grainAt(px, py),
      headScreen: () => this.senses.headScreen(),
      viewW: () => innerWidth,
      motionShake: false,
      earSide: (px, py) => this.senses.earSide(px, py),
    });
    this.brain.wake(0, false);
    if (this.fresh) {
      // (the first time: up and looking at you, not asleep)
      this.brain.mode = 'alert';
      this.brain.sleepDepth = 0;
    }
    // (the body told what the mind wants before it is put in place: sitting up, not lying down
    // to get straight up again)
    this.brain.update(1e-3, 0, []);
    this.avatar.settle();

    this.input = new PointerInput(canvas, {
      hitCat: (sx, sy) => !this.avatar.hidden && !!this.senses.hitNear(sx, sy),
      toP: (sx, sy) => [sx * this.senses.k, sy * this.senses.k],
      catTouchStart: (c) => this.brain.touchStart(c),
      catTouchEnd: (c, tap) => { this.audio.start(); this.brain.touchEnd(c, tap); },
      glassTap: (x, y) => { this.audio.start(); this.brain.glassTap(x, y); },
      glassKnock: (x, y) => { this.audio.start(); this.brain.knock(x, y); },
      // (no bowls, no box: feeding and the litter are not done here)
      pourStart: () => {},
      pourEnd: () => {},
      shake: () => {},
      scoop: () => {},
      longHold: (_x, _y, onCat) => { this.brain.longHold(onCat); },
      hover: (x, y) => {
        this.brain.hover(x, y);
        const over = this.overYarn(x, y, 14);
        if (over !== this.overToy) { this.overToy = over; canvas.style.cursor = over ? 'grab' : ''; }
      },
      firstGesture: () => this.audio.start(),
      // the ball of wool: a finger on it rolls it about the paper for the cat; a tap flicks it
      grabToy: (x, y) => {
        if (!this.overYarn(x, y, 26)) return false;
        const at = this.floorPoint(x, y);
        if (!at) return false;
        this.toyFinger = { x, y, off: this.yarn.at().clone().sub(at).setY(0) };
        canvas.style.cursor = 'grabbing';
        return true;
      },
      dragToy: (x, y) => {
        const f = this.toyFinger;
        const at = f && this.floorPoint(x, y);
        if (!f || !at) return;
        f.x = x;
        f.y = y;
        this.yarn.holdAt(at.add(f.off));
      },
      releaseToy: (tap) => {
        const f = this.toyFinger;
        this.toyFinger = null;
        this.yarn.holdAt(null);
        canvas.style.cursor = this.overToy ? 'grab' : '';
        this.audio.start();
        if (tap && f) this.flickYarn(f.x, f.y);
      },
    });
    canvas.addEventListener('pointerdown', () => this.audio.start());
    addEventListener('resize', () => this.frame());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.save(); this.audio.suspend(); } else this.audio.resume();
    });
    addEventListener('pagehide', () => this.save());
  }

  // ------------------------------------------------------------------ the view

  /** set by the lab for stills: an orbit about the point between the eyes instead of the follow */
  view: { az: number; el: number; d: number; offset: THREE.Vector3 } | null = null;
  private wideDist = 1;
  private closeDist = 0.5;
  private focus = 0;
  private focusT = 0;
  private focusHold = 0;
  private readonly catAim = new THREE.Vector3(0, 0.12, 0);
  private readonly follow = new THREE.Vector3(0, 0.12, 0);
  private aimSet = false;

  /** how far off the view stands: wide, the cat with room round it to walk about (80 cm across
   *  on a wide screen, half a metre on a phone held upright, where it would be too small to pet
   *  otherwise); close, its head and shoulders */
  private frame() {
    const cam = this.stage.camera;
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const half = cam.aspect >= 1 ? 0.4 : 0.28;
    this.wideDist = Math.max(half / (tv * cam.aspect), 0.3 / tv);
    this.closeDist = Math.max(0.15 / (tv * cam.aspect), 0.2 / tv);
  }

  /** a hand on the cat brings the view in close; some seconds after the last, back out. The wide
   *  view goes after the cat, a little behind it, but not off its paper: it can walk out of sight */
  private moveCamera(dt: number, touching: boolean) {
    const cam = this.stage.camera, m = this.cat.motor;
    if (this.view) {
      this.cat.group.updateMatrixWorld(true);
      const e = this.cat.body.eyes(new THREE.Vector3()).applyMatrix4(this.cat.group.matrixWorld);
      const V = this.view, c = e.add(V.offset);
      cam.position.set(c.x + Math.sin(V.az) * Math.cos(V.el) * V.d, c.y + Math.sin(V.el) * V.d, c.z + Math.cos(V.az) * Math.cos(V.el) * V.d);
      cam.lookAt(c);
      this.aimLights(V.az);
      return;
    }
    if (touching) { this.focusT = 1; this.focusHold = 9; }
    else if ((this.focusHold -= dt) <= 0) this.focusT = 0;
    // the middle of the body, wherever it lies
    const fp = this.cat.footprint(m.targetPosture);
    const c = Math.cos(m.yaw), s = Math.sin(m.yaw);
    const away = this.avatar.hidden || this.brain.mode === 'leaving' || this.brain.mode === 'away' || this.brain.mode === 'arriving';
    const want = away ? new THREE.Vector3(HOME.x, 0.12, HOME.z) : new THREE.Vector3(m.pos.x + fp.x * c + fp.z * s, 0.12, m.pos.z - fp.x * s + fp.z * c);
    // close, the view is on the head and shoulders: between the middle of the body and the eyes
    this.cat.group.updateMatrixWorld(true);
    const eyes = this.cat.body.eyes(new THREE.Vector3()).applyMatrix4(this.cat.group.matrixWorld);
    const close = away ? want.clone() : want.clone().lerp(eyes, 0.6);
    if (!this.aimSet || dt <= 0) { this.catAim.copy(close); this.follow.copy(want); this.aimSet = true; }
    else this.catAim.lerp(close, 1 - Math.exp(-dt * 2.5));
    // (a little slack before it moves, and never past the paper's edges)
    const lead = new THREE.Vector3(want.x + m.vel.x * 0.35, 0.12, want.z + m.vel.z * 0.2);
    const dead = 0.06;
    for (const k of ['x', 'z'] as const) {
      const off = lead[k] - this.follow[k];
      const goal = off > dead ? lead[k] - dead : off < -dead ? lead[k] + dead : this.follow[k];
      this.follow[k] += (goal - this.follow[k]) * (1 - Math.exp(-dt * (2.4 + 1.6 * m.zoom + 4 * m.speed)));
    }
    this.follow.x = Math.max(-0.5, Math.min(0.5, this.follow.x));
    this.follow.z = Math.max(-0.4, Math.min(0.7, this.follow.z));
    const rate = this.focusT > this.focus ? 1.6 : 0.8;
    this.focus += Math.max(-rate * dt, Math.min(rate * dt, this.focusT - this.focus));
    const f = ease(this.focus);
    const target = this.follow.clone().lerp(this.catAim, f);
    const dist = this.wideDist + (this.closeDist - this.wideDist) * f;
    const el = 0.2 + 0.05 * f;
    cam.position.set(target.x, target.y + Math.sin(el) * dist, target.z + Math.cos(el) * dist);
    cam.lookAt(target);
    this.aimLights(0);
  }

  /** lights set like a photographer's, from the camera: the key up and to the left, fill opposite */
  private aimLights(az: number) {
    const dir = (a: number, e: number) => new THREE.Vector3(Math.sin(az + a) * Math.cos(e), Math.sin(e), Math.cos(az + a) * Math.cos(e));
    this.cat.shared.uKeyDir.value.copy(dir(-0.85, 0.65));
    this.cat.shared.uFillDir.value.copy(dir(0.77, 0.2));
    this.cat.shared.uRimDir.value.copy(dir(Math.PI + 0.51, 0.5));
  }

  /** finger speeds are in the painted cat's pixels: its body about 290 of them long, as the pixel
   *  cat's is on a phone */
  private scaleTouch() {
    const cam = this.stage.camera, m = this.cat.motor;
    const a = new THREE.Vector3(m.pos.x - 0.225, 0.12, m.pos.z).project(cam);
    const b = new THREE.Vector3(m.pos.x + 0.225, 0.12, m.pos.z).project(cam);
    const px = Math.hypot((b.x - a.x) * 0.5 * innerWidth, (b.y - a.y) * 0.5 * innerHeight);
    if (px > 20) this.senses.k = 290 / px;
  }

  /** where the cat is across the screen, for its sounds (-1 left .. 1 right, kept toward the middle) */
  private catPan() {
    const p = this.cat.motor.pos.clone().project(this.stage.camera);
    return Math.max(-1, Math.min(1, p.x)) * 0.6;
  }

  // ------------------------------------------------------------------ the ball of wool

  private toyFinger: { x: number; y: number; off: THREE.Vector3 } | null = null;
  private toyWasPinned = false;
  private overToy = false;
  private yarnBrush = 0;
  private readonly floorRay = new THREE.Raycaster();
  private readonly pawW = new THREE.Vector3();

  /** is the ball under a screen point, or near it (a finger is wider than it) */
  private overYarn(sx: number, sy: number, near: number) {
    const r = this.canvas.getBoundingClientRect();
    const p = this.yarn.at().clone().project(this.stage.camera);
    const x = r.left + (p.x * 0.5 + 0.5) * r.width, y = r.top + (-p.y * 0.5 + 0.5) * r.height;
    const tv = Math.tan(THREE.MathUtils.degToRad(this.stage.camera.fov) / 2);
    const rad = (0.045 / (tv * this.stage.camera.position.distanceTo(this.yarn.at()))) * r.height * 0.5;
    return Math.hypot(x - sx, y - sy) < rad + near;
  }

  /** the point on the paper (at the height of the ball's middle) under a screen point */
  private floorPoint(sx: number, sy: number) {
    const r = this.canvas.getBoundingClientRect();
    this.floorRay.setFromCamera(new THREE.Vector2(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1), this.stage.camera);
    const o = this.floorRay.ray.origin, d = this.floorRay.ray.direction, h = 0.045;
    if (d.y > -1e-4) return null;
    const t = (h - o.y) / d.y;
    const B = this.yarn.bounds;
    return new THREE.Vector3(Math.max(B.minX, Math.min(B.maxX, o.x + d.x * t)), h, Math.max(B.minZ, Math.min(B.maxZ, o.z + d.z * t)));
  }

  /** a flick of the ball: it rolls off away from the finger, and the cat may be after it */
  private flickYarn(x: number, y: number) {
    const r = this.canvas.getBoundingClientRect();
    const b = this.yarn.at().clone().project(this.stage.camera);
    const dx = x - (r.left + (b.x * 0.5 + 0.5) * r.width), dy = y - (r.top + (-b.y * 0.5 + 0.5) * r.height);
    const d = Math.hypot(dx, dy);
    const dir = d > 4 ? new THREE.Vector3(-dx / d, 0, -dy / d) : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5);
    this.yarn.kick(dir, 0.55);
    this.haptic.tap?.();
    this.avatar.playNow();
  }

  /** a paw walking into the ball sends it rolling on a little, out from under its feet */
  private brushYarn(dt: number) {
    this.yarnBrush = Math.max(0, this.yarnBrush - dt);
    const m = this.cat.motor, Y = this.yarn;
    if (this.yarnBrush > 0 || m.speed < 0.06 || this.avatar.hidden || this.avatar.doing === 'play' || Y.held || Y.isPinned || Y.speed > 0.15) return;
    const y = Y.at(), M = this.cat.group.matrixWorld;
    for (const leg of ['LF', 'RF', 'LH', 'RH'] as const) {
      const p = this.pawW.copy(this.cat.body.reached[leg]).applyMatrix4(M);
      const dx = y.x - p.x, dz = y.z - p.z, d = Math.max(Math.hypot(dx, dz), 1e-3);
      if (d > 0.058 || p.y > 0.07) continue;
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
      const side = Math.sign((y.x - m.pos.x) * fz - (y.z - m.pos.z) * fx) || (Math.random() < 0.5 ? -1 : 1);
      Y.kick(new THREE.Vector3(0.7 * fx + side * fz, 0, 0.7 * fz - side * fx), Math.min(0.65, 0.25 + 0.6 * m.speed));
      this.yarnBrush = 0.5;
      return;
    }
  }

  // ------------------------------------------------------------------ a frame

  /** one step of its mind and body (driven by the page's clock, or by a test in fixed steps) */
  tick(dt: number) {
    this.clock += dt;
    const now = this.clock;
    const s = this.state;
    keepFed(s, this.manual ? s.lastTick + dt * 1000 : Date.now());
    // (off in a huff: back before long)
    if (s.where === 'away' && s.awayUntil - s.lastTick > AWAY_MAX) s.awayUntil = s.lastTick + rand(20_000, AWAY_MAX);
    const contacts: Contact[] = this.avatar.hidden ? [] : this.input.onCat();
    this.brain.update(dt, now, contacts);
    // what it feels shows in its eyes, ears, tail, fur and breath
    const mood = moodFromBrain(this.brain, 0, s.trust, 0);
    this.cat.motor.setMood(mood, true);
    this.avatar.mode = this.brain.mode;
    this.avatar.mood = mood;
    if (contacts.length) this.touchedAt = now;
    this.avatar.hands = contacts;
    this.avatar.touched = now - this.touchedAt < 4;
    // the ball under a finger, or rolling: its eyes go to it; moving it keeps it up and is company;
    // caught under its paws, the finger feels it
    const f = this.toyFinger, moving = this.yarn.speed > 0.06;
    this.avatar.lure = f || moving ? this.yarn.at() : null;
    this.avatar.lureMoving = moving;
    if (f && moving) this.brain.toy(f.x, f.y, dt);
    const pinned = !!f && this.yarn.isPinned;
    if (pinned && !this.toyWasPinned) this.haptic.tap('medium');
    this.toyWasPinned = pinned;
    this.avatar.update(dt);
    this.cat.update(dt);
    // (gone, it leaves no shade on the paper: its body's capsules are put away under the floor)
    if (this.avatar.hidden) for (const c of this.cat.shared.uCaps.value) c.set(0, -10, 0, 0);
    this.brushYarn(dt);
    this.yarn.update(dt);
    // asleep, or its head on its side, the whiskers lie back along its cheeks out of sight
    this.cat.whiskers.mesh.visible = this.brain.mode !== 'sleep' && this.cat.headUp() > 0.55;
    this.hints(dt, contacts.length > 0);
    this.moveCamera(dt, contacts.length > 0);
    this.scaleTouch();
    if ((this.saveIn -= dt) < 0) {
      this.saveIn = 10;
      this.save();
    }
  }

  /** the camera, with no time passing (a still asked for by the lab) */
  place() {
    this.moveCamera(0, false);
  }

  private hints(dt: number, touching: boolean) {
    const s = this.state;
    if (this.avatar.doing === 'play' && !s.hints.yarnDrag && !touching && !this.toyFinger) {
      s.hints.yarnDrag = 1;
      this.hint.show('털실 공을 손가락으로 끌어 보세요. 고양이가 쫓아올 거예요', 5000);
      return;
    }
    if (touching || this.input.touching) {
      this.petHintIn = 1e9;
      // after a first good while of petting: where it likes it and where it does not
      if (s.stats.petSeconds > 6 && !s.hints.zones) {
        s.hints.zones = 1;
        this.brain.later(2.5, () => this.hint.show('턱·볼·머리는 좋아하고, 배·꼬리·발은 싫어해요. 털 결대로 천천히 쓰다듬어 주세요', 6500));
      }
      return;
    }
    if (s.stats.petSeconds < 4 && !s.hints.pet && !this.avatar.hidden && (this.petHintIn -= dt) < 0) {
      s.hints.pet = 1;
      this.hint.show('손가락으로 살며시 쓰다듬어 보세요', 5000);
    }
  }

  save() {
    s_save(this.state);
  }
}

// ------------------------------------------------------------------ its own save

function loadState(now: number): { state: CatState; fresh: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as CatState;
      if (s && s.v === 1) return { state: { ...newCat(now), ...s, lastTick: now }, fresh: false };
    }
  } catch {
    /* private mode, blocked or corrupt: start fresh */
  }
  const s = newCat(now, 1);
  // (it knows you a little: a hand on its head is welcome from the start)
  s.trust = 0.42;
  // (and there is nothing to be told about: it never needs feeding here)
  s.notifyAsked = true;
  return { state: s, fresh: true };
}

function s_save(s: CatState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: it lives on in memory */
  }
}

/** its needs met: fed, watered, a clean box; well. The clock runs on, for coming back from a huff */
function keepFed(s: CatState, now: number) {
  s.hunger = 0;
  s.thirst = 0;
  s.bladder = 0;
  s.food = 1;
  s.water = 1;
  s.litter = 0;
  s.health = 1;
  s.alive = true;
  s.lastTick = now;
}
