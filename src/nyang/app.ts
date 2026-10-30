import * as THREE from 'three';
import { Cat3D } from '../cat3d/cat';
import { Stage } from '../cat3d/stage';
import type { Material } from '../cat3d/pixclass';
import { skyDay } from '../cat3d/roomlight';
import { CatAudio } from '../audio/audio';
import { Haptic } from '../platform/haptics';
import { roomMaterial } from '../pixel/room';
import { LivingRoom, type Top } from './set';
import { KINDS, Props, type Prop } from './props';
import { Kitty } from './kitty';
import { LEVELS, Round, dailyLevel, loadSave, saveSave, unlocked, type Level } from './round';
import { NyangUi } from './ui';
import { COATS, WEAR, choose } from './closet';
import { makeWear } from '../cat3d/wear';
import { buyUp, upLevel, type Upgrade } from './upgrades';

// (the app built for a claude.ai Artifact carries the model in it, as a data: URL)
const MODEL: string = import.meta.env.VITE_CAT_MODEL ?? './cat3d/fri.bin';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type Mode = 'title' | 'closet' | 'count' | 'play' | 'home' | 'end';

/**
 * 냥아치: the cat has the living room to itself until its people come home, and you are the cat.
 * A tap on a thing and the cat goes for it (up onto whatever it is on, by way of whatever it has
 * to jump onto first) and paws it till it goes over the edge; a tap anywhere else and it goes
 * there. Points for everything brought down (more for what breaks, more again in a quick run of
 * them), stars for enough of them before the key turns in the lock.
 */
export class NyangApp {
  static async create(canvas: HTMLCanvasElement) {
    const cat = await Cat3D.load(MODEL, {});
    return new NyangApp(canvas, cat);
  }

  readonly stage: Stage;
  readonly set: LivingRoom;
  readonly props: Props;
  readonly kitty: Kitty;
  readonly ui = new NyangUi();
  readonly audio = new CatAudio();
  readonly haptic = new Haptic();
  private save = loadSave();
  private round: Round | null = null;
  private level = 0;
  private mode: Mode = 'title';
  private modeT = 0;
  private count = 0;
  /** the view: where along the room it looks (m), where it is going to, whether it goes after the
   *  cat, how far off it is (m), and a shake when something breaks */
  private camX = 0;
  private camWant = 0;
  private follow = true;
  private dist = 3;
  private shake = 0;
  private hour = 14;
  private rain = 0;
  /** the room being played (or shown) */
  private L: Level = LEVELS[0];
  private last = 0;
  private time = 0;
  private steps = 0;
  /** driven by a test (?still): no frames of its own, stepped by hand */
  private readonly manual = new URLSearchParams(location.search).has('still');
  private readonly mats = new Map<string, THREE.Material>();
  private readonly ray = new THREE.Raycaster();
  private readonly tmpR = new THREE.Vector3();
  private readonly tmpU = new THREE.Vector3();
  private readonly roomCaps: THREE.Vector4[];
  private readonly paint: (m: Material, tone?: number, pattern?: number) => THREE.Material;
  /** how far the cat's shade reaches onto the room, of how far its own body's does */
  capsK = 0.2;

  constructor(readonly canvas: HTMLCanvasElement, readonly cat: Cat3D) {
    this.stage = new Stage({ pixel: NyangApp.artWidth(), paper: '#2b2433', shadowSize: 3.6 }, canvas);
    this.stage.add(cat);
    this.stage.floor.visible = false;
    const lights = cat.shared as unknown as Record<string, { value: unknown }>;
    cat.shared.uRoomLit.value = 1;
    this.stage.useRoomLight(lights);
    // (the room is shaded by the cat close by it, but less than its own body is: up on the sofa
    // against the wall, not a great dark disc on the wall behind it)
    const caps = cat.shared.uCaps.value as THREE.Vector4[];
    this.roomCaps = caps.map((v) => v.clone());
    const roomLights = { ...lights, uCaps: { value: this.roomCaps } };
    cat.shared.uFillDir.value.set(0.3, 0.35, 0.9).normalize();
    cat.shared.uRimDir.value.set(-0.2, 0.5, -0.85).normalize();
    this.set = new LivingRoom(roomLights);
    this.stage.scene.add(this.set.group);
    // (the things on the furniture, in the room's own materials: one of each kind, shared)
    this.paint = (m: Material, tone = 0, pattern = 0) => {
      const key = `${m}/${tone}/${pattern}`;
      let mat = this.mats.get(key);
      if (!mat) this.mats.set(key, (mat = roomMaterial(roomLights, m, { tone, pattern })));
      return mat;
    };
    this.props = new Props(this.paint, (x, z, below) => this.set.topAt(x, z, below));
    this.stage.scene.add(this.props.group);
    this.kitty = new Kitty(cat, this.set, this.props);
    this.kitty.sound = (name, gain) => this.audio.play(name, { gain, pan: this.pan(cat.motor.pos.x) });
    this.props.onDown = (p, broke, at) => this.knocked(p, broke, at);
    this.props.onBump = (p, sp) => { if (sp > 0.6) this.audio.play(KINDS[p.kind].fragile ? 'pencil' : 'thump', { gain: Math.min(0.5, sp * 0.18), pan: this.pan(p.group.position.x) }); };
    this.props.onTip = (p) => { if (p.kind === 'plant' || p.kind === 'vase') this.audio.play('rustle', { gain: 0.2, pan: this.pan(p.group.position.x) }); };

    this.ui.onPlay = (i) => this.start(i);
    this.ui.onMenu = () => this.menu();
    this.ui.onCloset = (open) => this.closet(open);
    this.ui.onPick = (id) => this.pick(id);
    this.ui.onUp = (id) => this.upgrade(id);
    this.wear();
    this.input();
    this.audio.unlockOn(window);
    this.audio.music(true);
    this.frame();
    this.menu();
    window.addEventListener('resize', () => { this.stage.resize(); this.stage.setArtWidth(NyangApp.artWidth()); this.frame(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.audio.suspend(); else this.audio.resume(); });
    // (Safari's own pinch would zoom the page)
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    (window as unknown as { __nyang: NyangApp }).__nyang = this;
    requestAnimationFrame((t) => this.loop(t));
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

  /** art pixels across the screen: about two css px each on a phone, no finer on a wide screen */
  static artWidth() {
    const px = +(new URLSearchParams(location.search).get('px') ?? '') || 1.7;
    return Math.round(clamp(innerWidth / px, 315 / px, 620 / px));
  }

  // ----- the view -----

  /** a phone held upright sees the room as tall as its tallest things and follows the cat along
   *  it; a wide screen sees the whole of it */
  private frame() {
    const cam = this.stage.camera;
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    this.dist = Math.max(0.7 / tv, Math.min(1.78 / (tv * cam.aspect), 1.0 / tv));
    this.place();
  }

  /** half the room's width seen at its middle (m) */
  private halfWidth() {
    const cam = this.stage.camera;
    return Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * this.dist * cam.aspect;
  }
  /** how far along the view can go either way (to the room's ends; nowhere, if it is all in view) */
  private camRange(): [number, number] {
    const h = this.halfWidth(), lo = -1.72 + h, hi = 1.76 - h;
    return lo > hi ? [(lo + hi) / 2, (lo + hi) / 2] : [lo, hi];
  }
  /** metres across the room's middle to a css pixel */
  private mPerPx() {
    return (2 * this.halfWidth()) / innerWidth;
  }

  /** how far the view has come in close on the cat (the wardrobe open: 1), and is going to */
  private focus = 0;
  private focusT = 0;

  private place() {
    const cam = this.stage.camera;
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const el = THREE.MathUtils.degToRad(19);
    const target = new THREE.Vector3(this.camX, 0.6, -0.12);
    // (close on the cat, it in the top of the picture, the wardrobe under it)
    const f = this.focus * this.focus * (3 - 2 * this.focus);
    const m = this.cat.motor.pos;
    target.lerp(new THREE.Vector3(m.x, (this.kitty.on?.h ?? 0) - 0.13, m.z), f);
    const dist = this.dist + (0.58 / tv - this.dist) * f;
    // (a level camera, from a little above, its picture slid down to what it looks at: upright
    // things stay upright, as pixel art draws them)
    cam.position.set(target.x, target.y + dist * Math.tan(el), target.z + dist);
    cam.rotation.set(0, 0, 0);
    if (this.shake > 0) {
      const k = this.shake * this.shake * 0.02;
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
    }
    cam.updateMatrixWorld();
    this.stage.setShift(Math.tan(el) / tv, 0);
    // (on the art's grid, the rest slid: the room's pixels hold still as the view goes along)
    const px = (2 * tv * dist) / this.stage.pixelRows();
    const right = this.tmpR.setFromMatrixColumn(cam.matrixWorld, 0), up = this.tmpU.setFromMatrixColumn(cam.matrixWorld, 1);
    const rx = cam.position.dot(right), uy = cam.position.dot(up);
    const sx = Math.round(rx / px) * px, sy = Math.round(uy / px) * px;
    cam.position.addScaledVector(right, sx - rx).addScaledVector(up, sy - uy);
    cam.updateMatrixWorld();
    this.stage.setSubPixel((rx - sx) / px, (uy - sy) / px);
    this.kitty.you.copy(cam.position);
  }

  /** where a world point is on the screen (css px) */
  private toScreen(p: THREE.Vector3) {
    const v = p.clone().project(this.stage.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, on: v.z < 1 };
  }
  /** left and right in the sound of a thing across the view */
  private pan(x: number) {
    return clamp((x - this.camX) / Math.max(0.5, this.halfWidth()), -0.8, 0.8);
  }

  // ----- the finger -----

  private down: { id: number; x: number; cam: number; moved: boolean } | null = null;
  private input() {
    const surface = this.haptic.surface(this.canvas);
    surface.addEventListener('pointerdown', (e) => {
      if (this.down) return;
      this.down = { id: e.pointerId, x: e.clientX, cam: this.camX, moved: false };
    });
    surface.addEventListener('pointermove', (e) => {
      const d = this.down;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 12) d.moved = true;
      if (d.moved) {
        // (a finger drawn across: the view goes with it, and stays where it is taken)
        this.follow = false;
        const [lo, hi] = this.camRange();
        this.camWant = this.camX = clamp(d.cam - dx * this.mPerPx(), lo, hi);
      }
    });
    const up = (e: PointerEvent) => {
      const d = this.down;
      if (!d || e.pointerId !== d.id) return;
      this.down = null;
      if (!d.moved && e.type === 'pointerup') {
        this.haptic.lifted();
        this.tap(e.clientX, e.clientY);
      }
    };
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);
  }

  /** a tap: at a thing (the cat goes for it), or a spot on a top or the floor (it goes there) */
  tap(x: number, y: number) {
    if (this.mode !== 'play' && this.mode !== 'count') return;
    this.tapped = true;
    const nip = this.nip;
    if (nip) {
      const s = this.toScreen(nip.at);
      if (Math.hypot(s.x - x, s.y - y) < 34) {
        this.kitty.tell({ to: nip.at.clone(), top: nip.top });
        this.ui.mark(s.x, s.y, true);
        this.follow = true;
        this.haptic.tap('light');
        return;
      }
    }
    const prop = this.propAt(x, y);
    if (prop) {
      this.kitty.tell({ prop });
      const K = KINDS[prop.kind], s = this.toScreen(prop.group.position.clone().setY(prop.group.position.y + K.h / 2));
      this.ui.mark(s.x, s.y, true);
    } else {
      const spot = this.spotAt(x, y);
      if (!spot) return;
      this.kitty.tell(spot);
      this.ui.mark(x, y, false);
    }
    this.follow = true;
    this.haptic.tap('light');
  }

  /** the thing nearest a screen point, standing on something and within a fingertip of it */
  private propAt(x: number, y: number): Prop | null {
    let best: Prop | null = null, bd = Infinity;
    const mpp = this.mPerPx();
    for (const p of this.props.list) {
      if (!p.on || p.state === 'broken' || p.state === 'fall') continue;
      const K = KINDS[p.kind], c = this.toScreen(p.group.position.clone().setY(p.group.position.y + K.h / 2));
      const d = Math.hypot(c.x - x, c.y - y) - Math.max(K.r, K.h / 2) / mpp;
      if (d < 22 && d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** the top (or the floor) under a screen point, and the spot on it */
  private spotAt(x: number, y: number): { to: THREE.Vector3; top: Top | null } | null {
    this.ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), this.stage.camera);
    const r = this.ray.ray, o = r.origin, d = r.direction;
    let best: { to: THREE.Vector3; top: Top | null } | null = null, bt = Infinity;
    for (const T of this.set.tops) {
      // (its top, or its front: either means up there)
      if (Math.abs(d.y) > 1e-5) {
        const t = (T.h - o.y) / d.y, p = r.at(t, new THREE.Vector3());
        if (t > 0 && t < bt && p.x > T.x0 - 0.03 && p.x < T.x1 + 0.03 && p.z > T.z0 - 0.03 && p.z < T.z1 + 0.05) { bt = t; best = { to: p, top: T }; }
      }
      if (Math.abs(d.z) > 1e-5) {
        const t = (T.z1 - o.z) / d.z, p = r.at(t, new THREE.Vector3());
        if (t > 0 && t < bt && p.x > T.x0 && p.x < T.x1 && p.y > Math.max(0, T.h - 0.45) && p.y < T.h) { bt = t; best = { to: new THREE.Vector3(p.x, T.h, T.z1 - 0.08), top: T }; }
      }
    }
    if (d.y < -1e-5) {
      const t = -o.y / d.y;
      if (t > 0 && t < bt) best = { to: r.at(t, new THREE.Vector3()), top: null };
    }
    return best;
  }

  // ----- the rounds -----

  /** the rooms to choose from; the room laid out behind them, the cat sat in it */
  private menu() {
    this.mode = 'title';
    this.focusT = 0;
    this.dropNip();
    this.frenzy = 0;
    this.kitty.pace = 1;
    this.ui.frenzy(0);
    this.ui.point(null);
    this.modeT = 0;
    this.round = null;
    let i = 0;
    while (i + 1 < LEVELS.length && unlocked(this.save, i + 1)) i++;
    this.lay(i);
    this.kitty.place(0.42, 0.42, Math.PI * 0.1);
    this.ui.showTitle(this.save);
  }

  /** the wardrobe opened (the view close on the cat, sat facing you) or shut */
  private closet(open: boolean) {
    this.mode = open ? 'closet' : 'title';
    this.focusT = open ? 1 : 0;
    if (open) {
      this.kitty.place(this.cat.motor.pos.x, this.cat.motor.pos.z, 0);
      this.ui.showCloset(this.save);
    } else this.ui.showTitle(this.save);
  }

  /** a thing chosen in the wardrobe: bought if need be, and put on (or off) */
  private pick(id: string) {
    const got = choose(this.save, id);
    if (got === 'poor') {
      this.ui.deny(id);
      this.audio.play('thump', { gain: 0.25 });
      this.haptic.tap('medium');
      return;
    }
    if (got === 'bought') this.audio.play('fanfare', { gain: 0.4 });
    else this.audio.play('pencil', { gain: 0.15 });
    this.haptic.tap('light');
    saveSave(this.save);
    this.wear();
    this.ui.showCloset(this.save);
    // (a look down at itself, and up at you)
    this.cat.motor.lookAt(this.cat.motor.pos.clone().setY(0.02), 1);
    setTimeout(() => this.cat.motor.lookAt(this.kitty.you, 1), 600);
  }

  /** a step of an upgrade bought */
  private upgrade(id: string) {
    const got = buyUp(this.save, id as Upgrade['id']);
    if (got !== 'bought') {
      this.ui.deny(id);
      this.audio.play('thump', { gain: 0.25 });
      this.haptic.tap('medium');
      return;
    }
    this.audio.play('fanfare', { gain: 0.4, rate: 1.1 });
    this.haptic.tap('light');
    saveSave(this.save);
    this.ui.showCloset(this.save);
  }

  /** the cat dressed as the wardrobe says: its coat, and what it has on */
  private readonly wearing: THREE.Object3D[] = [];
  private wear() {
    const s = this.save;
    this.stage.setCoat((COATS.find((c) => c.id === s.coat) ?? COATS[0]).coat);
    for (const o of this.wearing) {
      o.removeFromParent();
      o.traverse((m) => { if (m instanceof THREE.Mesh) m.geometry.dispose(); });
    }
    this.wearing.length = 0;
    const sk = this.cat.meshes[0]?.skeleton;
    for (const id of [s.neck, s.head]) {
      const it = WEAR.find((w) => w.id === id);
      if (!it?.look || !sk) continue;
      const w = makeWear(it.look, it.color ?? 'bookRed', (m, t) => this.paint(m, t));
      const bone = this.cat.byName.get(w.bone), i = sk.bones.findIndex((b) => b.name === w.bone);
      if (!bone || i < 0) continue;
      // (made where it goes on the cat at rest: less where the bone is at rest)
      const rest = new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert());
      const holder = new THREE.Group();
      holder.position.copy(rest).negate();
      holder.add(w.obj);
      bone.add(holder);
      this.wearing.push(holder);
    }
  }

  /** the things put out on the furniture for a room, and its hour */
  private lay(i: number) {
    const L = this.L = i < LEVELS.length ? LEVELS[i] : dailyLevel(new Date());
    this.level = i;
    this.hour = L.hour;
    this.rain = L.rain ?? 0;
    this.props.clear();
    for (const [kind, top, x, z] of L.props) this.props.place(kind, this.set.tops.find((T) => T.id === top) ?? null, x, z);
  }

  /** a round begun: the room laid out afresh, the cat in the middle, the count down */
  start(i: number) {
    this.focusT = 0;
    this.lay(i);
    this.kitty.place(0.42, 0.42, Math.PI);
    this.round = new Round(this.L);
    this.mode = 'count';
    this.modeT = 0;
    this.count = 0;
    this.follow = true;
    this.steps = 0;
    this.dropNip();
    this.nipAt = [15, 45, 75].filter((t) => t < this.L.time - 12);
    this.frenzy = 0;
    this.kitty.pace = 1;
    this.tapped = false;
    // (as strong, as quick, as keen as the upgrades have made it)
    const up = this.save.up;
    this.kitty.power = 1 + 0.15 * upLevel(up, 'paw');
    this.kitty.legs = 1 + 0.08 * upLevel(up, 'legs');
    this.round.gap = 3.2 + 0.4 * upLevel(up, 'focus');
    this.ui.frenzy(0);
    this.ui.startRound();
    this.ui.show(this.round, 0, this.L.props.length);
    this.audio.start();
  }

  /** a thing come down: the points, popped up where it landed, a sound and a jolt */
  private knocked(p: Prop, broke: boolean, at: THREE.Vector3) {
    const pan = this.pan(at.x);
    this.audio.play(broke ? 'shatter' : 'thump', { gain: broke ? 0.75 : 0.45, pan });
    if (broke) this.shake = Math.max(this.shake, 0.8);
    const r = this.round;
    if (this.mode !== 'play' || !r) return;
    const got = r.down(KINDS[p.kind].pts, broke);
    const s = this.toScreen(at.clone().setY(at.y + 0.1));
    this.ui.pop(clamp(s.x, 40, innerWidth - 40), clamp(s.y, 90, innerHeight - 60), got, `${KINDS[p.kind].name}${broke ? ' 와장창!' : ''}`, broke || r.combo >= 3);
    this.audio.play('coin', { gain: 0.22, delay: 0.06, rate: 1 + 0.06 * Math.min(6, r.combo - 1) });
    this.haptic.tapSoon(broke ? 'medium' : 'light');
    if (r.combo === 5 || r.combo === 8) this.ui.big(`${r.combo}연속!`);
    // (into the book: the first of a kind brings a few coins)
    const b = this.save.book[p.kind] ??= [0, 0];
    if (b[0] === 0) {
      this.save.coins += 30;
      this.ui.tip(`도감에 새로 올랐어요: ${KINDS[p.kind].name} (+30냥)`, 2600);
      this.audio.play('heart', { gain: 0.4, delay: 0.15 });
    }
    b[0]++;
    if (broke) b[1]++;
  }

  /** catnip: a sprig of it put down somewhere now and then in a round (when, still to come), where
   *  it lies, and how long the frenzy it brings has yet to run (s) */
  private nip: { mesh: THREE.Group; at: THREE.Vector3; top: Top | null; t: number } | null = null;
  private nipAt: number[] = [];
  private frenzy = 0;
  /** whether a tap has been made this round (till then, on the first round, a finger shows where) */
  private tapped = true;

  private catnip(dt: number) {
    const r = this.round!;
    // (a sprig put down: on a clear bit of floor in view, or on a top)
    if (!this.nip && this.nipAt.length && r.t >= this.nipAt[0]) {
      this.nipAt.shift();
      this.putNip();
    }
    const n = this.nip;
    if (n) {
      n.t += dt;
      n.mesh.rotation.y += dt * 1.5;
      n.mesh.scale.setScalar(1 + 0.12 * Math.sin(n.t * 6));
      const m = this.cat.motor.pos;
      if (this.kitty.on === n.top && Math.hypot(m.x - n.at.x, m.z - n.at.z) < 0.16) {
        // (eaten: the frenzy)
        this.dropNip();
        this.frenzy = 8 + 2 * upLevel(this.save.up, 'nose');
        r.boost = 2;
        this.kitty.pace = 1.5;
        this.ui.big('캣닢 타임!');
        this.audio.play('trill', { gain: 0.6 });
        this.audio.play('fanfare', { gain: 0.35, rate: 1.2 });
        this.haptic.tapSoon('medium');
      } else if (n.t > 14) this.dropNip();
    }
    if (this.frenzy > 0) {
      this.frenzy -= dt;
      if (this.frenzy <= 0) { this.frenzy = 0; r.boost = 1; this.kitty.pace = 1; }
    }
    this.ui.frenzy(this.frenzy);
    // (the very first round: a finger over the nearest thing, till a tap)
    if (!this.tapped && this.level === 0 && !this.save.best[LEVELS[0].id]) {
      const c = this.cat.motor.pos;
      let best: Prop | null = null, bd = Infinity;
      for (const p of this.props.list) {
        if (!p.on || p.state === 'broken') continue;
        const s = this.toScreen(p.group.position);
        if (s.x < 30 || s.x > innerWidth - 30) continue;
        const d = p.group.position.distanceTo(c);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) {
        const s = this.toScreen(best.group.position.clone().setY(best.group.position.y + KINDS[best.kind].h + 0.03));
        this.ui.point(s.x, s.y);
      } else this.ui.point(null);
    } else this.ui.point(null);
  }

  /** a sprig of catnip put down where the cat can get to it, in view */
  private putNip() {
    const [lo, hi] = [this.camX - this.halfWidth() * 0.7, this.camX + this.halfWidth() * 0.7];
    let at: THREE.Vector3 | null = null;
    for (let k = 0; k < 40 && !at; k++) {
      const x = lo + Math.random() * (hi - lo), z = -0.1 + Math.random() * 0.75;
      if (this.kitty.clearAt(x, z) && this.cat.motor.pos.distanceTo(new THREE.Vector3(x, 0, z)) > 0.35) at = new THREE.Vector3(x, 0, z);
    }
    if (!at) return;
    const g = new THREE.Group();
    const leaf = this.paint('leaf', 0.15);
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4, l = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), leaf);
      l.scale.set(1.3, 0.35, 0.7);
      l.position.set(Math.cos(a) * 0.025, 0.012 + 0.006 * (i % 3), Math.sin(a) * 0.025);
      l.rotation.y = -a;
      l.castShadow = true;
      g.add(l);
    }
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), this.paint('pink', 0.2));
    flower.position.y = 0.03;
    g.add(flower);
    g.position.copy(at);
    this.stage.scene.add(g);
    this.nip = { mesh: g, at, top: null, t: 0 };
    this.ui.tip(`캣닢이 떨어졌어요! 눌러서 먹으면 ${8 + 2 * upLevel(this.save.up, 'nose')}초 동안 점수 2배!`, 3500);
    this.audio.play('rustle', { gain: 0.3, pan: this.pan(at.x) });
  }

  private dropNip() {
    const n = this.nip;
    if (!n) return;
    this.stage.scene.remove(n.mesh);
    n.mesh.traverse((m) => { if (m instanceof THREE.Mesh) m.geometry.dispose(); });
    this.nip = null;
  }

  /** the round over: what it came to, kept, and the card */
  private finish() {
    const r = this.round!, L = this.L;
    const record = r.score > (this.save.best[L.id] ?? 0);
    if (record) this.save.best[L.id] = r.score;
    this.save.stars[L.id] = Math.max(this.save.stars[L.id] ?? 0, r.stars);
    const coins = Math.round(r.score / 50) + 10 * r.stars;
    this.save.coins += coins;
    saveSave(this.save);
    this.ui.showEnd(r, this.level, record, coins, L.props.length, this.level + 1 < LEVELS.length && unlocked(this.save, this.level + 1));
    if (r.stars) this.audio.play('fanfare', { gain: 0.5 });
    this.mode = 'end';
    this.modeT = 0;
  }

  /** how many things still standing are off the screen to the left, and to the right */
  private offscreen(): [number, number] {
    let l = 0, rt = 0;
    for (const p of this.props.list) {
      if (!p.on || p.state === 'broken' || p.state === 'fall') continue;
      const s = this.toScreen(p.group.position);
      if (s.x < 0) l++;
      else if (s.x > innerWidth) rt++;
    }
    return [l, rt];
  }

  // ----- each frame -----

  private loop(nowMs: number) {
    requestAnimationFrame((t) => this.loop(t));
    if (this.last && nowMs - this.last < 1000 / 60 - 3) return;
    const dt = Math.min(0.05, this.last ? (nowMs - this.last) / 1000 : 0.016);
    this.last = nowMs;
    if (!this.manual && !document.hidden) this.tick(dt);
    this.stage.render();
  }

  /** one step of everything (also driven by tests in fixed steps) */
  tick(dt: number) {
    this.time += dt;
    this.modeT += dt;
    const r = this.round;
    if (this.mode === 'count' && r) {
      // 3, 2, 1, go
      const n = Math.floor(this.modeT / 0.8);
      if (n >= this.count && this.count < 4) {
        this.count++;
        this.ui.big(n < 3 ? `${3 - n}` : '시작!');
        this.audio.play(n < 3 ? 'beep' : 'beepGo', { gain: 0.35 });
        if (n === 3) {
          this.mode = 'play';
          this.modeT = 0;
          if (!this.save.best[LEVELS[0].id]) this.ui.tip('물건을 톡 누르면 고양이가 가서 떨어뜨려요. 옆으로 밀면 방을 둘러봐요', 6000);
        }
      }
    } else if (this.mode === 'play' && r) {
      const over = r.step(dt);
      // (their steps on the stair, the last seconds: nearer and nearer)
      if (r.left < 8 && r.left > 0) {
        if (this.steps === 0) this.ui.tip('집사 발소리가 들려요! 서둘러요!', 3000);
        const due = Math.floor((8 - r.left) / 0.55);
        if (due >= this.steps) { this.steps = due + 1; this.audio.play('step', { gain: 0.25 + 0.06 * due, far: true, rate: 0.7 }); }
      }
      // (everything down already: done, and the time left is worth points)
      const left = this.props.list.some((p) => p.on && p.state !== 'broken') || this.props.list.some((p) => p.state === 'fall');
      if (!left && !over) {
        const bonus = Math.ceil(r.left) * 30;
        r.score += bonus;
        r.over = true;
        this.ui.big('싹 다 엎었다!');
        this.ui.pop(innerWidth / 2, innerHeight * 0.55, bonus, '남은 시간 보너스', true);
        this.audio.play('fanfare', { gain: 0.5 });
      }
      if (r.over) {
        this.mode = 'home';
        this.modeT = 0;
        this.ui.home();
        this.audio.play('door', { gain: 0.7 });
        this.dropNip();
        this.frenzy = 0;
        this.kitty.pace = 1;
        this.ui.frenzy(0);
        this.ui.point(null);
        const st = r.stars;
        setTimeout(() => this.ui.say(st >= 3 ? '내 꽃병…! 내 찻주전자…!!' : st === 2 ? '야!!! 이게 다 뭐야!!' : st === 1 ? '…뭐야 이거. 너지?' : '어? 오늘은 얌전했네?'), 1100);
        this.kitty.tell({ to: this.cat.motor.pos.clone(), top: this.kitty.on });
      }
      this.ui.show(r, r.downs, this.L.props.length);
      this.ui.edges(...this.offscreen());
      this.catnip(dt);
    } else if (this.mode === 'home' && this.modeT > 3.4) this.finish();

    // the room, its light, and the cat in it
    const d = this.set.update(dt, this.hour, this.rain, new Date());
    this.audio.setRain(this.mode === 'title' || this.mode === 'closet' ? 0 : this.rain * 0.8);
    this.stage.setDayLight(d);
    const dark = 1 - skyDay(this.hour);
    this.cat.setWhiskerLight(0.62 - 0.2 * dark, d.lamp > 0.5 ? 0.8 * dark : 0);
    this.cat.setEyeShine(0);
    this.kitty.update(dt);
    this.cat.update(dt);
    const caps = this.cat.shared.uCaps.value as THREE.Vector4[];
    for (let i = 0; i < caps.length; i++) {
      this.roomCaps[i].copy(caps[i]);
      if (i % 2 === 0) this.roomCaps[i].w *= this.capsK;
    }
    this.props.step(dt);

    // the view: after the cat (a little ahead of where it is going), or where a finger took it;
    // on the title, drifting along the room
    const [lo, hi] = this.camRange();
    if (this.mode === 'title' || this.mode === 'end') this.camWant = (lo + hi) / 2 + ((hi - lo) / 2) * Math.sin(this.time * 0.12);
    else if (this.follow) this.camWant = this.cat.motor.pos.x;
    this.camWant = clamp(this.camWant, lo, hi);
    this.camX += (this.camWant - this.camX) * (1 - Math.exp(-dt * (this.down?.moved ? 30 : 3)));
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.focus += (this.focusT - this.focus) * (1 - Math.exp(-dt * 4));
    this.place();
  }
}
