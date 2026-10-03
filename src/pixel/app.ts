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
import { stepLife, THRESH } from '../sim/life';
import { clamp } from '../util/math';
import { PixelAvatar } from './avatar';
import { Senses3D } from './senses';
import { Room } from './room';
import { rainAt } from '../cat3d/roomlight';

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
  private themeColor = '';
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
    // the cat is lit by the room's own light, and the sunbeam in the air is drawn from it
    this.cat.shared.uRoomLit.value = 1;
    this.stage.useRoomLight(cat.shared as unknown as Record<string, { value: unknown }>);
    // the room has a floor of its own
    this.stage.floor.visible = false;
    this.avatar.spots = this.room.spots;
    this.avatar.feel = (sx, sy) => this.senses.hitNear(sx, sy);
    this.cat.groundAt = (x, z) => this.room.groundAt(x, z);
    this.avatar.sunSpot = () => this.room.sunSpot();
    this.avatar.sunlitAt = (p) => this.room.sunlit(p);
    this.avatar.warmSpot = () => this.room.warmSpot();
    this.avatar.toys = {
      yarn: () => this.room.yarnAt(), kick: (d, v) => this.room.kickYarn(d, v),
      held: () => this.room.yarnHeld, pin: (sec, at) => this.room.pinYarn(sec, at), pinned: () => this.room.yarnPinned,
    };
    this.avatar.sillSpot = () => this.room.sillSpot();
    this.avatar.boxSpot = () => this.room.boxSpot();
    this.avatar.outside = {
      birds: () => this.room.birds(),
      chirp: () => this.audio.play('chirp', { gain: 0.45, pan: this.catPan() }),
      sound: (name, gain) => this.audio.play(name, { gain, pan: this.catPan() }),
      bug: () => this.room.bugAt(),
      scareBug: (from) => this.room.scareBug(from),
      drop: (p) => this.room.setDrop(p),
    };
    // thunder after a flash of lightning: heard through the glass, the louder the nearer; the cat
    // starts at it and looks to the window, and a near clap may send it to cover
    // a shooting star: an idle cat awake looks up at the window
    this.room.onMeteor = () => this.avatar.see(this.room.meteorAt);
    // a bird come down on the ledge outside: it is seen
    this.room.onVisitor = () => { const v = this.room.visitorAt(); if (v) this.avatar.see(v); };
    this.room.onThunder = (loud) => {
      this.audio.play(loud > 0.6 ? 'thunderNear' : 'thunder', { out: true, gain: 0.3 + 0.6 * loud, pan: (Math.random() - 0.5) * 0.6 });
      this.brain?.thunder(loud);
      this.avatar.thunder(loud, this.room.windowMiddle);
    };
    // its paws on the boards: soft, and softer still for a shuffle of the feet; on the rug a
    // muffled pat, on the bed all but nothing
    this.cat.stepper.onLand = (leg, settle) => {
      if (this.avatar.hidden) return;
      const p = this.pawW.copy(this.cat.body.reached[leg]).applyMatrix4(this.cat.group.matrixWorld);
      const on = this.room.surfaceAt(p.x, p.z);
      const k = on === 'boards' ? 1 : on === 'rug' ? 0.45 : 0.15;
      this.audio.play('step', { gain: (settle ? 0.04 : 0.09) * k, pan: this.catPan(), rate: on === 'boards' ? 1.15 : 0.85 });
    };
    this.frame3d();

    const now = Date.now();
    const firstEver = !localStorageHas();
    this.state = loadState(now);
    stepLife(this.state, Math.max(0, now - this.state.lastTick), true);
    this.state.lastTick = now;
    this.state.stats.visits++;
    this.makeBrain();
    this.stage.setCoat(this.state.personality.coat);
    this.brain.wake(performance.now() / 1000, firstEver);
    this.avatar.settle();

    this.input = new PointerInput(canvas, {
      hitCat: (sx, sy) => !this.avatar.hidden && !!this.senses.hitNear(sx, sy),
      toP: (sx, sy) => [sx * this.senses.k, sy * this.senses.k],
      catTouchStart: (c) => this.brain.touchStart(c),
      catTouchEnd: (c, tap) => { this.gestureEnd(); this.brain.touchEnd(c, tap); },
      glassTap: (x, y) => {
        this.gestureEnd();
        if (this.creditsOpen) { this.showCredits(false); return; }
        if (this.hitPrint(x, y)) { this.showCredits(true); return; }
        if (this.hitThing(this.room.radio, x, y, 24)) {
          this.audio.music(!this.audio.musicOn);
          this.avatar.hear(this.room.radio.getWorldPosition(new THREE.Vector3()));
          this.haptic.tap?.();
          return;
        }
        this.brain.glassTap(x, y);
      },
      glassKnock: (x, y) => { this.gestureEnd(); this.brain.knock(x, y); },
      pourStart: () => this.brain.pourStart(),
      pourEnd: () => { this.gestureEnd(); this.brain.pourEnd(); },
      shake: (k) => this.brain.kibble(k),
      scoop: () => { this.gestureEnd(); this.brain.scoop(); },
      longHold: (_x, _y, onCat) => this.longHold(onCat),
      hover: (x, y) => {
        this.brain.hover(x, y);
        // (with a mouse: the ball of wool can be taken hold of)
        const over = this.hitThing(this.room.yarnBall, x, y, 14);
        if (over !== this.overToy) { this.overToy = over; canvas.style.cursor = over ? 'grab' : ''; }
      },
      firstGesture: () => this.audio.start(),
      // the ball of wool: a finger on it rolls it about the floor for the cat; a tap flicks it
      grabToy: (x, y) => {
        if (this.creditsOpen || !this.hitThing(this.room.yarnBall, x, y, 26)) return false;
        // held where the finger took it, not snapped to the fingertip
        const at = this.floorPoint(x, y);
        if (!at) return false;
        this.toyFinger = { x, y, off: this.room.yarnAt().clone().sub(at).setY(0) };
        canvas.style.cursor = 'grabbing';
        return true;
      },
      dragToy: (x, y) => {
        const f = this.toyFinger;
        const at = f && this.floorPoint(x, y);
        if (!f || !at) return;
        f.x = x;
        f.y = y;
        this.room.holdYarn(at.add(f.off));
      },
      releaseToy: (tap) => {
        const f = this.toyFinger;
        this.toyFinger = null;
        this.room.holdYarn(null);
        canvas.style.cursor = this.overToy ? 'grab' : '';
        this.gestureEnd();
        if (tap && f) this.flickYarn(f.x, f.y);
      },
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
    // once the first frames are drawn, the room comes up out of the colour of its wall (driven by
    // a test or a reel: there at once)
    const show = () => {
      canvas.classList.add('on');
      document.getElementById('loading')?.classList.add('off');
    };
    if (this.manual) {
      canvas.style.transition = 'none';
      document.getElementById('loading')?.remove();
      show();
    } else requestAnimationFrame(() => requestAnimationFrame(show));
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
    const el = THREE.MathUtils.degToRad(16);
    // the cat by its window: as wide as the window at the bed (the curtains, the lamp and the
    // plant at the edges), from the bed up to the top of the window, a little from above
    const d = Math.max(0.37 / (tv * cam.aspect), 0.66 / tv);
    this.roomView.target.set(this.aim.x, 0.5, this.aim.z - 0.2);
    this.roomView.dir.set(0, Math.sin(el), Math.cos(el));
    this.roomView.dist = d;
    // close to the cat: a third of a metre across (and 0.6 m up and down) round its body
    this.closeDist = Math.max(0.18 / (tv * cam.aspect), 0.3 / tv);
    this.placeCamera();
    // the brain's touch speeds are in the painted cat's pixels: about 600 across the window
    this.senses.k = 600 / Math.max(1, innerWidth);
    // the window behind lights the cat's edges (the sun's way across the sky is the room's: it
    // follows the hour)
    this.cat.shared.uFillDir.value.set(0.3, 0.35, 0.9).normalize();
    this.cat.shared.uRimDir.value.set(-0.2, 0.5, -0.85).normalize();
  }

  /** where the view is: the whole room, or (touching the cat) close on it, easing between */
  private readonly roomView = { target: new THREE.Vector3(), dir: new THREE.Vector3(0, 0.3, 1), dist: 3 };
  private closeDist = 1.5;
  private focus = 0;
  private focusT = 0;
  private focusHold = 0;
  private readonly catAim = new THREE.Vector3();

  /** the room view drifts sideways after the cat, so wherever it goes it stays in view */
  private panX = 0;
  private readonly tmpR = new THREE.Vector3();
  private readonly tmpU = new THREE.Vector3();

  private placeCamera() {
    const cam = this.stage.camera;
    const f = this.focus * this.focus * (3 - 2 * this.focus);
    const rv = this.roomView;
    const target = rv.target.clone();
    target.x += this.panX;
    target.lerp(this.catAim, f);
    const dist = rv.dist + (this.closeDist - rv.dist) * f;
    const dir = rv.dir.clone().lerp(new THREE.Vector3(0, Math.sin(0.27), Math.cos(0.27)), f).normalize();
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    // keep the camera on the art's grid (an art pixel at the distance looked at), so the room's
    // pixels hold still as the view drifts, and let the finished picture slide by the rest
    const tvp = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const px = (2 * tvp * dist) / this.stage.pixelRows();
    const right = this.tmpR.setFromMatrixColumn(cam.matrixWorld, 0), up = this.tmpU.setFromMatrixColumn(cam.matrixWorld, 1);
    const rx = cam.position.dot(right), uy = cam.position.dot(up);
    const sx = Math.round(rx / px) * px, sy = Math.round(uy / px) * px;
    cam.position.addScaledVector(right, sx - rx).addScaledVector(up, sy - uy);
    cam.updateMatrixWorld();
    this.stage.setSubPixel((rx - sx) / px, (uy - sy) / px);
    // the sky through the window, in art pixels
    if (this.room) {
      const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
      this.room.setPixel(2 * tv * cam.position.distanceTo(this.room.spots.bed.clone().setZ(this.room.spots.bed.z - 0.62)) / this.stage.pixelRows());
      this.room.setView(cam.position.x);
    }
  }

  /** a hand on the cat brings the view in close; some seconds after the last, back out */
  private moveCamera(dt: number, touching: boolean) {
    if (touching) { this.focusT = 1; this.focusHold = 9; }
    else if ((this.focusHold -= dt) <= 0) this.focusT = 0;
    const m = this.cat.motor;
    // the middle of the body, wherever it lies
    const fp = this.cat.footprint(m.targetPosture);
    const c = Math.cos(m.yaw), sn = Math.sin(m.yaw);
    const want = new THREE.Vector3(m.pos.x + fp.x * c + fp.z * sn, 0.11, m.pos.z - fp.x * sn + fp.z * c);
    if (this.focus < 0.01) this.catAim.copy(want);
    else this.catAim.lerp(want, 1 - Math.exp(-dt * 2.5));
    // the room view follows as the cat goes off toward an edge, a little ahead of it the way it is
    // walking (not when it is tearing about: it lags behind then, rather than swinging to and fro),
    // never past the room's ends
    const lead = want.x + m.vel.x * 0.7 * (1 - m.zoom);
    const off = lead - this.panX, dead = 0.07;
    const goal = Math.max(-0.3, Math.min(0.46, off > dead ? lead - dead : off < -dead ? lead + dead : this.panX));
    this.panX += (goal - this.panX) * (1 - Math.exp(-dt * 1.8));
    const rate = this.focusT > this.focus ? 1.6 : 0.8;
    this.focus += Math.max(-rate * dt, Math.min(rate * dt, this.focusT - this.focus));
    this.placeCamera();
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

  /** the credits: the 3D cat is someone's model, shared under CC BY 4.0, changed for this app */
  private creditsOpen = false;
  private showCredits(on: boolean) {
    const el = document.getElementById('credits');
    if (!el) return;
    if (on && !el.childElementCount) {
      el.innerHTML = `
        <h2>창가의 고양이</h2>
        <p>고양이 3D 모델 <b>“3d modelling my cat: Fripouille”</b><br>
        만든 이 <a href="https://sketchfab.com/guillaume.bolis.neko" target="_blank" rel="noopener">guillaume bolis</a> ·
        <a href="https://sketchfab.com/3d-models/3d-modelling-my-cat-fripouille-0ab14bf98e754f8d90fe1bf1c84ca66c" target="_blank" rel="noopener">원본</a><br>
        <a href="https://creativecommons.org/licenses/by/4.0/deed.ko" target="_blank" rel="noopener">CC BY 4.0</a> 라이선스로 공유된 모델이에요.</p>
        <p>이 앱을 위해 뼈대를 새로 심고, 자세와 걸음, 입과 눈을 새로 만들고, 머리를 조금 크게 해서 픽셀아트로 다시 칠했어요. (원작자가 이 앱을 보증하는 것은 아니에요.)</p>
        <p class="small">방, 그림, 소리는 이 앱을 위해 만들었어요. 아무 곳이나 누르면 닫혀요.</p>`;
      el.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).tagName !== 'A') this.showCredits(false); });
    }
    this.creditsOpen = on;
    el.classList.toggle('on', on);
  }

  /** where the cat is across the screen, for its sounds (-1 left .. 1 right, kept toward the middle) */
  private catPan() {
    const p = this.cat.motor.pos.clone().project(this.stage.camera);
    return Math.max(-1, Math.min(1, p.x)) * 0.6;
  }

  /** is a thing in the room under a screen point (or near it: a finger is wider than it) */
  private hitThing(o: THREE.Object3D, sx: number, sy: number, near: number) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1), this.stage.camera);
    if (ray.intersectObject(o, true).length) return true;
    const p = o.getWorldPosition(new THREE.Vector3()).project(this.stage.camera);
    return Math.hypot((p.x * 0.5 + 0.5) * innerWidth - sx, (-p.y * 0.5 + 0.5) * innerHeight - sy) < near;
  }

  /** a finger moving the ball of wool: where it is (css px), and where the ball is from the
   *  point on the floor under it */
  private toyFinger: { x: number; y: number; off: THREE.Vector3 } | null = null;
  private toyWasPinned = false;
  private readonly bugLight = new THREE.Vector3();

  /** a paw walking into the ball of wool sends it rolling on a little, the way the cat is going
   *  and out from under its feet (it is a ball on the floor, not a ghost of one; play has its own
   *  ways with it) */
  private brushYarn(dt: number) {
    this.yarnBrush = Math.max(0, this.yarnBrush - dt);
    const m = this.cat.motor, R = this.room;
    if (this.yarnBrush > 0 || m.speed < 0.06 || this.avatar.hidden || this.avatar.doing === 'play' || R.yarnHeld || R.yarnPinned || R.yarnSpeed > 0.15) return;
    const y = R.yarnAt(), M = this.cat.group.matrixWorld;
    for (const leg of ['LF', 'RF', 'LH', 'RH'] as const) {
      const p = this.pawW.copy(this.cat.body.reached[leg]).applyMatrix4(M);
      const dx = y.x - p.x, dz = y.z - p.z, d = Math.max(Math.hypot(dx, dz), 1e-3);
      if (d > 0.058 || p.y > 0.07) continue;
      // (on ahead, and off to the side of the cat's path it is on, so it is not walked over again)
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
      const side = Math.sign((y.x - m.pos.x) * fz - (y.z - m.pos.z) * fx) || (Math.random() < 0.5 ? -1 : 1);
      R.kickYarn(new THREE.Vector3(0.7 * fx + side * fz, 0, 0.7 * fz - side * fx), Math.min(0.65, 0.25 + 0.6 * m.speed));
      this.yarnBrush = 0.5;
      return;
    }
  }
  private yarnBrush = 0;
  private readonly pawW = new THREE.Vector3();
  private overToy = false;
  private readonly floorRay = new THREE.Raycaster();

  /** the point on the floor (at the height of the ball's middle) under a screen point; up on the
   *  wall, the floor's far edge below it; below the room, its near edge */
  private floorPoint(sx: number, sy: number) {
    const ray = this.floorRay;
    ray.setFromCamera(new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1), this.stage.camera);
    const o = ray.ray.origin, d = ray.ray.direction, h = 0.045;
    const B = this.room.yarnBounds;
    const at = (t: number) => new THREE.Vector3(o.x + d.x * t, h, o.z + d.z * t);
    let p = d.y < -1e-4 ? at((h - o.y) / d.y) : null;
    if (Math.abs(d.z) < 1e-4) return p;
    if (!p || p.z < B.minZ) p = at((B.minZ - o.z) / d.z).setZ(B.minZ);
    else if (p.z > B.maxZ) p = at((B.maxZ - o.z) / d.z).setZ(B.maxZ);
    p.x = Math.max(B.minX, Math.min(B.maxX, p.x));
    return p;
  }

  /** a flick of the ball of wool: it rolls off away from the finger, and the cat may be after it */
  private flickYarn(x: number, y: number) {
    const b = this.room.yarnAt().clone().project(this.stage.camera);
    const dx = x - (b.x * 0.5 + 0.5) * innerWidth, dy = y - (-b.y * 0.5 + 0.5) * innerHeight;
    const d = Math.hypot(dx, dy);
    const dir = d > 4 ? new THREE.Vector3(-dx / d, 0, -dy / d) : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5);
    this.room.kickYarn(dir, 0.55);
    this.haptic.tap?.();
    this.avatar.playNow();
  }

  /** is the little print on the sill under a screen point */
  private hitPrint(sx: number, sy: number) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1), this.stage.camera);
    const hits = ray.intersectObject(this.room.print, true);
    if (hits.length) return true;
    // a finger is wider than the print: near it counts
    const p = this.room.print.getWorldPosition(new THREE.Vector3()).project(this.stage.camera);
    const dx = (p.x * 0.5 + 0.5) * innerWidth - sx, dy = (-p.y * 0.5 + 0.5) * innerHeight - sy;
    return Math.hypot(dx, dy) < 26;
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
      this.stage.setCoat(this.state.personality.coat);
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
  /** ?rain=1: rain now (0: none) */
  private readonly rainOverride = new URLSearchParams(location.search).get('rain');

  /** ?date=2027-01-15: the room's day of the year, for looking at another season */
  private readonly dateOverride = new URLSearchParams(location.search).get('date');

  private clock() {
    const d = this.dateOverride ? new Date(this.dateOverride + 'T12:00:00') : new Date();
    if (this.hourOverride !== null) {
      const h = +this.hourOverride;
      d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    }
    return d;
  }

  private loop(nowMs: number) {
    requestAnimationFrame((t) => this.loop(t));
    // pixel art wants no more than 60 frames a second, and a cat asleep with nobody touching it
    // no more than 30 (on a 120 Hz screen, every other frame or three in four are let go): the
    // phone stays cool and its battery lasts, left open on a desk all evening
    const calm = this.brain.mode === 'sleep' && nowMs / 1000 - this.touchedAt > 3 && this.room.yarnSpeed < 0.01;
    if (this.last && nowMs - this.last < 1000 / (calm ? 30 : 60) - 3) return;
    const dt = Math.min(0.05, this.last ? (nowMs - this.last) / 1000 : 0.016);
    this.last = nowMs;
    if (this.visible && !this.manual) this.tick(dt, nowMs / 1000);
    this.stage.render();
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
    const hour = clock.getHours() + clock.getMinutes() / 60;
    // the room's own light: dark outside after sunset (not the cat's bedtime); the lamp keeps it
    // from being quite dark, but the pupils open in it
    const dark = Room.dark(hour);
    const mood = moodFromBrain(this.brain, sick, s.trust, 0.75 * dark);
    this.cat.motor.setMood(mood, true);
    this.avatar.mode = this.brain.mode;
    this.avatar.mood = mood;
    if (contacts.length) this.touchedAt = now;
    this.avatar.hands = contacts;
    this.avatar.touched = now - this.touchedAt < 4;
    // the ball of wool under a finger: the cat's eyes go to it, and moving it keeps it up and is
    // company; caught under its paws, the finger feels it
    const f = this.toyFinger, moving = this.room.yarnSpeed > 0.06;
    this.avatar.lure = f || moving ? this.room.yarnAt() : null;
    this.avatar.lureMoving = moving;
    if (f && moving) this.brain.toy(f.x, f.y, dt);
    const pinned = !!f && this.room.yarnPinned;
    if (pinned && !this.toyWasPinned) this.haptic.tap('medium');
    this.toyWasPinned = pinned;
    // a bird on the ledge outside: watched; and gone the moment the cat comes up to the glass
    const mp = this.cat.motor.pos, win = this.room.windowMiddle;
    this.room.visitorOk = this.avatar.hidden || !(mp.z < win.z + 0.36 && Math.abs(mp.x - win.x) < 0.5);
    this.avatar.visitor = this.avatar.hidden ? null : this.room.visitorAt();
    this.avatar.update(dt);
    this.cat.update(dt);
    this.brushYarn(dt);
    // the weather: now and then a few hours of rain (or as asked, ?rain=1)
    const rain = this.rainOverride !== null ? +this.rainOverride : rainAt(clock);
    const dl = this.room.update(s, hour, dt, rain, clock);
    this.stage.setDayLight(dl);
    // the whiskers in the light the face is in: dimmer after dark, warm while the lamp is lit;
    // asleep, they lie back along the cheeks; and on a head lying on its side they would be drawn
    // as scratches across the face
    this.cat.setWhiskerLight(0.62 - 0.2 * dark, dl.lamp > 0.5 ? 0.8 * dark : 0);
    this.cat.whiskers.mesh.visible = this.brain.mode !== 'sleep' && this.cat.headUp() > 0.55;
    this.audio.setRain(rain);
    // a bird outside: the cat's ear goes to it, and if it is awake, a glance at the window
    if (this.audio.setOutside(dt, { day: 1 - dark, hour, month: clock.getMonth(), rain })) this.avatar.hear(this.room.windowMiddle);
    this.avatar.rain = rain;
    this.avatar.night = dark;
    // (the moon's light is never strong enough to hide from)
    this.avatar.glare = dark > 0.5 ? 0 : dl.sun;
    // the phone's bar the colour of the wall at the top of the room
    const tc = dark > 0.5 ? '#3b3150' : '#c99486';
    if (tc !== this.themeColor) {
      this.themeColor = tc;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tc);
    }
    // the tea on the books steams; by day dust turns in the sun
    this.stage.setSteam(this.room.mugTop, 1);
    this.stage.setMotes(this.room.dust(dt, (1 - dark) * (1 - rain)));
    // a moth round the lamp, a fly at the window: their wings a blur of up and down
    const bug = this.room.bugAt();
    this.stage.setBug(bug?.p ?? null, bug?.kind, bug ? !bug.resting && Math.sin(now * (bug.kind === 'moth' ? 38 : 70)) > 0 : false,
      this.bugLight.set(1, 1, 1).lerp(new THREE.Vector3(1.15, 0.95, 0.75), dark));
    // the radio: its dial lit and notes rising while it plays; slower and softer at night
    this.stage.setNotes(this.room.setRadio(this.audio.musicPlaying, dt));
    this.audio.setNight(dark);
    this.stage.setTime(now);
    this.hints(dt, contacts.length > 0);
    this.moveCamera(dt, contacts.length > 0);
    if ((this.saveIn -= dt) < 0) {
      this.saveIn = 10;
      this.persist(false);
    }
  }

  private radioHintIn = 25;

  private hints(dt: number, touching: boolean) {
    const s = this.state;
    // the first time it plays with its ball of wool: that you can roll it too
    if (this.avatar.doing === 'play' && !s.hints.yarnDrag && !touching && !this.toyFinger) {
      s.hints.yarnDrag = 1;
      this.hintUi.show('털실 공을 손가락으로 끌어 보세요. 고양이가 쫓아올 거예요', 5000);
      return;
    }
    // once the radio has played a while: how to switch it off
    if (this.audio.musicPlaying && !s.hints.radio && !touching && (this.radioHintIn -= dt) < 0) {
      s.hints.radio = 1;
      this.hintUi.show('창가의 라디오를 톡 누르면 음악을 끄고 켤 수 있어요', 5000);
      return;
    }
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
