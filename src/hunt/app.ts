import * as THREE from 'three';
import { World, HALF_X, HALF_Z } from './world';
import { PixelView } from './render';
import { Paws } from './paws';
import { Controls } from './input';
import { Hud } from './hud';
import { Sound } from './sound';
import { Hunt, LIVES, NIGHTS, loadSave, nightAt, nightOpen, saveSave, type Save } from './game';
import { PREY, type Prey } from './prey';
import { THINGS } from './things';
import { COATS, allStars, coatOf, coatOpen } from './coats';
import { reckon } from './journal';
import { lineClear, moveBody, type Body } from './physics';
import { Cat } from './cat';
import { Haptic } from '../platform/haptics';

type Mode = 'title' | 'play' | 'pause' | 'end';

/** the words for the sounds things make, written where they come from */
const WORDS: Record<string, string> = { chirp: '귀뚤귀뚤', squeak: '찍찍', flutter: '파닥', hop: '톡', zip: '스르륵', shatter: '와장창!', clatter: '달그락' };
/** the sky's colour as dawn comes */
const DAWN = new THREE.Color(0xb8a8d8);
/** where the bedside lamp is (put on when they wake) */
const BEDSIDE = new THREE.Vector3(2.32, 0.8, -3.25);
/** what each kind glows, heard through the walls */
const GLOW: Record<string, number> = { moth: 0xffe27a, cricket: 0x9cff8a, mouse: 0xffa8c0, spider: 0xc8a8ff };

/**
 * 밤사냥: you are the cat, it is the middle of the night, their person is asleep, and the flat is
 * yours to hunt in. Everything is seen from twenty centimetres up, drawn in big pixels.
 */
export class HuntApp {
  readonly view: PixelView;
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(75, 1, 0.02, 30);
  readonly world = new World();
  readonly paws = new Paws();
  readonly hud = new Hud();
  readonly sound = new Sound();
  readonly controls: Controls;
  private save: Save = loadSave();
  hunt: Hunt | null = null;
  private mode: Mode = 'title';
  private nightI = 0;
  private last = 0;
  private time = 0;
  /** heard through the walls: a glow for each thing, over the finished picture */
  private readonly over = new THREE.Scene();
  private glows: THREE.Sprite[] = [];
  /** where the pounce will come down, while the haunches wiggle: a paw mark there, and dots
   *  along the way of the leap (a ring on the floor would be a line seen from so low) */
  private readonly ring: THREE.Sprite;
  private readonly arc: THREE.Sprite[] = [];
  private readonly lamps: { light: THREE.PointLight; base: number; flicker: boolean }[] = [];
  private flash = 0;
  private red = 0;
  /** felt: a buzz (Android, the app), a tick (an iPhone's) */
  private readonly feel = new Haptic();
  /** the catch's moment held still (s left); the leap's rush (the view opening out, 0..1); the
   *  jolt of a landing (0..1) */
  private stop = 0;
  private kick = 0;
  /** the moonlight, as bright as the night has it (and lightning, a flash of it); when the thunder
   *  that goes with the lightning comes */
  private readonly moon: THREE.DirectionalLight;
  private moonBase = 2.4;
  /** the sky's glow all round (toward dawn, paler and brighter) */
  private readonly sky = new THREE.HemisphereLight(0x6c7ab8, 0x2a2232, 1.0);
  private thunderAt = Infinity;
  /** when they last woke (sat up, the bedside lamp on, a word, and down again) */
  private wokeAt = -99;
  private mumbled = true;
  /** how long a thing out of reach has been watched, still; the last chatter at one */
  private watchT = 0;
  private chatAt = -99;
  /** the last near miss said (not said again straight away) */
  private nearAt = -99;
  private dip = 0;
  private baseFov = 75;
  private tipStep = 0;
  /** driven by a test (?still): stepped by hand */
  private readonly manual = new URLSearchParams(location.search).has('still');

  constructor(readonly canvas: HTMLCanvasElement) {
    this.view = new PixelView(canvas);
    const S = this.scene;
    S.add(this.world.group);
    S.fog = new THREE.Fog(0x10142a, 4, 15);
    // the night's light: the sky's glow all round, the moon through the window, the lamps left on
    S.add(this.sky);
    const moon = this.moon = new THREE.DirectionalLight(0xa8bcff, 2.4);
    moon.position.copy(new THREE.Vector3(1.5, 0, 0).addScaledVector(this.world.moonDir, -9));
    moon.target.position.set(1.5, 0, 0);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    Object.assign(moon.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 20 });
    moon.shadow.bias = -0.002;
    S.add(moon, moon.target);
    for (const L of this.world.lamps) {
      const p = new THREE.PointLight(L.color, L.power * 1.8, L.reach * 1.3, 2);
      p.position.copy(L.at);
      S.add(p);
      this.lamps.push({ light: p, base: L.power * 1.8, flicker: !!L.flicker });
      if (L.power >= 0.9 && !L.flicker) this.motes(L.at, L.color, L.power);
    }
    this.ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: HuntApp.pawTex(), color: 0xffb8c8, transparent: true, depthWrite: false, fog: false }));
    this.ring.scale.setScalar(0.11);
    this.ring.visible = false;
    S.add(this.ring);
    for (let i = 0; i < 10; i++) {
      const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: HuntApp.dot(), color: 0xffd0dc, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
      d.scale.setScalar(0.025);
      d.visible = false;
      S.add(d);
      this.arc.push(d);
    }

    this.controls = new Controls(canvas, this.hud.btn);
    this.hud.onStart = (i) => this.start(i);
    this.hud.onPause = () => this.pause();
    this.hud.onChoice = (c) => this.choice(c);
    this.sound.muted = !!this.save.mute;
    this.paws.setCoat(coatOf(this.save));
    this.settings();
    this.sound.unlockOn(window);
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.pause(); this.sound.suspend(); } else this.sound.resume(); });
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.resize();
    this.menu();
    (window as unknown as { __hunt: HuntApp }).__hunt = this;
    requestAnimationFrame((t) => this.loop(t));
    const show = () => { canvas.classList.add('on'); document.getElementById('loading')?.classList.add('off'); };
    if (this.manual) { canvas.style.transition = 'none'; document.getElementById('loading')?.remove(); show(); }
    else requestAnimationFrame(() => requestAnimationFrame(show));
  }

  /** a wide view however the phone is held: not narrower across than about seventy degrees */
  private resize() {
    this.view.resize();
    const a = this.view.aspect;
    const hfov = 78 * Math.PI / 180;
    this.cam.fov = this.baseFov = THREE.MathUtils.clamp(2 * Math.atan(Math.tan(hfov / 2) / a) * 180 / Math.PI, 62, 100);
    this.cam.aspect = a;
    this.cam.updateProjectionMatrix();
  }

  // ----- the screens -----

  private menu() {
    this.mode = 'title';
    this.clearHunt();
    this.hunt = null;
    this.world.rain.visible = false;
    this.sound.rain(false);
    this.sound.music(false);
    this.moonBase = 2.4;
    this.hud.title(this.save);
    this.ring.visible = false;
    this.clearGlows();
  }

  start(i: number) {
    if (!nightOpen(this.save, i)) return;
    this.nightI = i;
    this.clearHunt();
    const N = nightAt(i);
    this.hunt = new Hunt(this.world, N, {
      caught: (p, pts, chain) => this.caught(p, pts, chain),
      gift: (pts) => {
        this.hud.toast(`+${pts}`, '집사에게 선물!');
        this.sound.play('gift', null, 0.6);
        this.flash = 0.6;
        this.feel.tap('heavy');
      },
      missed: (near) => {
        this.sound.play('miss', null, 0.3);
        if (near && this.time - this.nearAt > 4) { this.nearAt = this.time; this.hud.toast('아깝다!', ''); }
      },
      stirred: (woke) => {
        this.sound.play('grumble', this.world.sleeper.position, 0.9);
        const left = this.hunt?.night.endless ? ` (남은 목숨 ${Math.max(0, LIVES - (this.hunt?.wakes ?? 0))})` : '';
        if (woke) { this.hud.toast('-300', `집사가 깼어요! 쉿…${left}`); this.red = 1; this.feel.tap('heavy'); this.wokeAt = this.time; this.mumbled = false; }
        else this.hud.tip('으음… 집사가 뒤척여요. 침실에선 살금살금!', 2500);
      },
      sound: (name, at, gain) => this.heard(name, at, gain ?? 1),
      spawned: (p) => {
        this.scene.add(p.mesh);
        this.glows.push(this.glow(p.kind));
      },
      goal: (k, pts) => {
        this.hud.toast(`+${pts}`, `도전 성공! ${N.goals[k].text}`);
        this.sound.play('gift', null, 0.4, 1.2);
        this.feel.tap('medium');
        this.showGoals();
      },
      lightning: () => {
        this.flash = 0.45;
        this.thunderAt = this.time + 0.7 + Math.random() * 1.2;
        this.feel.tap('light');
      },
      crashed: (t, pts) => {
        this.hud.toast(`+${pts}`, `${THINGS[t.kind].name} ${THINGS[t.kind].sound === 'shatter' ? '와장창!' : '툭 떨어뜨렸다!'}`);
        this.feel.tap('medium');
        if (!this.save.knocked) {
          this.save.knocked = true;
          saveSave(this.save);
          this.hud.tip('물건을 떨어뜨리면 점수! 하지만 큰 소리에 사냥감이 도망가고 집사가 깰 수 있어요', 5000);
        }
      },
    });
    for (const p of this.hunt.prey) this.scene.add(p.mesh);
    for (const t of this.hunt.things) this.scene.add(t.mesh);
    // the night's own weather and moon
    const M = N.mods ?? {};
    this.moonBase = 2.4 * (M.moon ?? 1);
    this.world.rain.visible = !!M.rain;
    this.sound.rain(!!M.rain);
    this.showGoals();
    this.hud.card(N.name, N.goals.map((g) => g.text), N.endless ? '새벽이 오지 않는 밤 · ♥♥♥' : undefined);
    if (M.rain && !this.save.goals?.[N.id]) this.hud.tip('빗소리 덕분에 발소리가 잘 안 들려요. 번개가 칠 땐 조심!', 5000);
    this.glows = this.hunt.prey.map((p) => this.glow(p.kind));
    this.mode = 'play';
    this.tipStep = 0;
    this.hud.playing(this.controls.touchy || matchMedia('(pointer: coarse)').matches);
    this.sound.start();
    this.sound.music(true);
  }

  private showGoals() {
    const h = this.hunt;
    if (h) this.hud.goals(h.night.goals.map((g, k) => ({ text: g.text, done: h.goals[k] })));
  }

  /** dust in a lamp's light: a few dozen motes drifting slowly in the air round it, each a pixel */
  private readonly dust: { pts: THREE.Points; home: Float32Array; seed: Float32Array }[] = [];
  private motes(at: THREE.Vector3, color: number, power: number) {
    const n = Math.round(18 + 10 * power), home = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // (below the lamp, in the cone of its light, thinning out as they go)
      const r = Math.sqrt(Math.random()) * 0.7, a = Math.random() * Math.PI * 2, y = -Math.random() * Math.min(1.2, at.y - 0.1);
      home.set([at.x + Math.cos(a) * r * (0.4 - y * 0.5), at.y + y - 0.1, at.z + Math.sin(a) * r * (0.4 - y * 0.5)], i * 3);
      seed[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(home.slice(), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5), size: 1, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.dust.push({ pts, home, seed });
  }
  private drift() {
    const t = this.time;
    for (const D of this.dust) {
      const pos = D.pts.geometry.getAttribute('position') as THREE.BufferAttribute, a = pos.array as Float32Array;
      for (let i = 0; i < D.seed.length; i++) {
        const s = D.seed[i];
        a[i * 3] = D.home[i * 3] + Math.sin(t * 0.21 + s) * 0.06;
        a[i * 3 + 1] = D.home[i * 3 + 1] + Math.sin(t * 0.13 + s * 1.7) * 0.08;
        a[i * 3 + 2] = D.home[i * 3 + 2] + Math.cos(t * 0.17 + s * 0.6) * 0.06;
      }
      pos.needsUpdate = true;
    }
  }

  /** a thing's glow, seen through the walls while listening */
  private glow(kind: string) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: HuntApp.dot(), color: GLOW[kind], depthTest: false, depthWrite: false, transparent: true }));
    s.scale.setScalar(0.14);
    this.over.add(s);
    return s;
  }

  /** the last night's hunted and its things, out of the room */
  private clearHunt() {
    for (const p of this.hunt?.prey ?? []) this.scene.remove(p.mesh);
    for (const t of this.hunt?.things ?? []) this.scene.remove(t.mesh);
    this.clearGlows();
  }

  private pause() {
    if (this.mode !== 'play') return;
    this.mode = 'pause';
    this.hud.pause(this.save);
    this.hud.stick(null);
    this.hud.charge(null);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private choice(c: string) {
    if (c === 'resume') { this.mode = 'play'; this.hud.playing(this.controls.touchy || matchMedia('(pointer: coarse)').matches); }
    else if (c === 'retry') this.start(this.nightI);
    else if (c === 'menu') this.menu();
    else if (c === 'journal') this.hud.journal(this.save);
    else if (c === 'share') void this.share();
    else if (c === 'unshot') this.hud.shot(null);
    else if (c.startsWith('coat:')) {
      const k = COATS.find((x) => `coat:${x.id}` === c);
      if (!k) return;
      if (!coatOpen(this.save, k)) { this.hud.tip(`별 ${k.stars}개를 모으면 ${k.name} 털색이 열려요`, 3000); return; }
      this.save.coat = k.id;
      saveSave(this.save);
      this.paws.setCoat(k);
      this.hud.title(this.save);
    }
    else if (c === 'sound') {
      this.save.mute = !this.save.mute;
      saveSave(this.save);
      this.sound.setMuted(this.save.mute);
      if (this.mode === 'pause') this.hud.pause(this.save);
      else this.hud.title(this.save);
    } else if (c === 'look' || c === 'buzz') {
      if (c === 'look') this.save.look = ((this.save.look ?? 1) + 1) % 3;
      else this.save.still = !this.save.still;
      saveSave(this.save);
      this.settings();
      this.hud.pause(this.save);
    }
  }

  /** what is kept of the settings, put to use: the look's speed, buzzes on or off */
  private settings() {
    this.controls.sensitivity = 0.0065 * [0.65, 1, 1.5][this.save.look ?? 1];
    this.feel.off = !!this.save.still;
  }

  private finish() {
    const h = this.hunt!, N = h.night;
    const record = h.score > (this.save.best[N.id] ?? 0);
    const before = allStars(this.save);
    if (record) this.save.best[N.id] = h.score;
    this.save.stars[N.id] = Math.max(this.save.stars[N.id] ?? 0, h.stars);
    const goals = (this.save.goals ??= {});
    h.goals.forEach((d, k) => { if (d) goals[N.id] = (goals[N.id] ?? 0) | (1 << k); });
    saveSave(this.save);
    const after = allStars(this.save);
    const coats = COATS.filter((c) => before < c.stars && after >= c.stars).map((c) => c.name);
    const badges = reckon(this.save, { ...h.caught, gifts: h.gifts, knocked: h.knocked }, { stars: h.stars, wakes: h.wakes, best: h.best });
    saveSave(this.save);
    this.mode = 'end';
    this.sound.music(false);
    this.sound.play('alarm', null, 0.4);
    // (the last of the night's view, kept for a picture to show off with)
    this.draw();
    const shot = document.createElement('canvas');
    shot.width = this.canvas.width;
    shot.height = this.canvas.height;
    shot.getContext('2d')?.drawImage(this.canvas, 0, 0);
    this.night = { shot, name: N.name, when: N.endless ? `${h.lasted} 버팀` : '새벽 5시', score: h.score, stars: h.stars, record, caught: { ...h.caught } };
    this.hud.end({ name: N.name, when: N.endless ? `${h.lasted} 버팀` : '새벽 5시', score: h.score, stars: h.stars, record, caught: h.caught, gifts: h.gifts, best: h.best, wakes: h.wakes, i: this.nightI, next: nightOpen(this.save, this.nightI + 1), goals: N.goals.map((g, k) => ({ text: g.text, done: h.goals[k] })), knocked: h.knocked, coats, badges });
    this.hud.stick(null);
    this.hud.charge(null);
    this.ring.visible = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** the night just done, for its picture */
  private night: { shot: HTMLCanvasElement; name: string; when: string; score: number; stars: number; record: boolean; caught: Record<string, number> } | null = null;

  /** a picture of the night to show off with: its last view in big pixels, its name, stars, points
   *  and catches; handed to the phone's share sheet where there is one, else shown to be saved */
  private async share() {
    const L = this.night;
    if (!L) return;
    const S = 1080, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const sw = L.shot.width, sh = L.shot.height, side = Math.min(sw, sh);
    g.drawImage(L.shot, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, S, S);
    const fade = g.createLinearGradient(0, S * 0.45, 0, S);
    fade.addColorStop(0, 'rgba(10, 8, 24, 0)');
    fade.addColorStop(1, 'rgba(10, 8, 24, 0.92)');
    g.fillStyle = fade;
    g.fillRect(0, 0, S, S);
    const font = getComputedStyle(document.documentElement).getPropertyValue('--pixel-font') || 'sans-serif';
    const text = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left') => {
      g.font = `${size}px ${font}`;
      g.textAlign = align;
      g.fillStyle = 'rgba(20, 10, 40, 0.9)';
      g.fillText(s, x, y + size * 0.08);
      g.fillStyle = color;
      g.fillText(s, x, y);
    };
    text('밤사냥', 48, 96, 64, '#ffd27a');
    text(`${L.name} · ${L.when}`, S / 2, S - 380, 44, '#c8d4ff', 'center');
    g.font = `84px ${font}`;
    const stars = [0, 1, 2].map((k) => k < L.stars);
    stars.forEach((on, k) => text('★', S / 2 + (k - 1) * 96, S - 270, 84, on ? '#ffd27a' : '#3e3a66', 'center'));
    text(`${L.score.toLocaleString('ko-KR')}점${L.record ? ' · 최고 기록!' : ''}`, S / 2, S - 160, 72, '#f2ecff', 'center');
    const k = L.caught;
    text(`나방 ${k.moth} · 귀뚜라미 ${k.cricket} · 생쥐 ${k.mouse}${k.spider ? ` · 거미 ${k.spider}` : ''}`, S / 2, S - 80, 38, '#a9b0d8', 'center');
    const url = c.toDataURL('image/png');
    try {
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
      const file = blob && new File([blob], 'bamsanyang.png', { type: 'image/png' });
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '밤사냥', text: `${L.name} ${L.score.toLocaleString('ko-KR')}점!` });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
    this.hud.shot(url);
  }

  // ----- what happens -----

  private caught(p: Prey, pts: number, chain: number) {
    this.sound.play('catch', null, 0.6, 1 + 0.05 * Math.min(6, chain - 1));
    this.flash = 0.35;
    this.stop = 0.09;
    this.feel.tap('heavy');
    if (p.kind !== 'mouse') this.paws.pin(p.mesh, this.time);
    this.hud.toast(`+${pts}`, `${PREY[p.kind].name} 잡았다!${chain > 1 ? ` ${chain}연속!` : ''}`);
    if (p.kind === 'mouse' && this.nightI <= 1 && !this.save.best[NIGHTS[1].id]) this.hud.tip('생쥐를 물었어요! 침실의 집사 침대 위로 가져가면 선물 보너스', 5000);
  }

  /** woken: the bedside lamp on, them up on an elbow looking round, a mumble; then the lamp off
   *  and down again, six seconds on */
  private waking() {
    const w = this.time - this.wokeAt, on = w >= 0 && w < 6;
    const up = on ? Math.min(1, w / 0.5) * Math.min(1, (6 - w) / 0.8) : 0;
    const [, head, hair] = this.world.sleeper.children;
    head.position.set(0, 0.08 + 0.2 * up, -0.1 + 0.18 * up);
    hair.position.copy(head.position);
    head.rotation.y = hair.rotation.y = up * 0.6 * Math.sin(w * 1.4);
    const lamp = this.lamps.find((L) => L.light.position.distanceTo(BEDSIDE) < 0.1);
    if (lamp) lamp.light.intensity = lamp.base * (1 + 2.5 * up);
    if (on && w > 1.6 && !this.mumbled && this.hunt) {
      this.mumbled = true;
      const v = head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.25, 0)).project(this.cam);
      const R = this.canvas.getBoundingClientRect();
      if (v.z < 1 && Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9) this.hud.say('누구야…?', R.left + (v.x * 0.5 + 0.5) * R.width, R.top + (-v.y * 0.5 + 0.5) * R.height, false);
      else this.hud.tip('집사: 으음… 누구야…?', 2500);
    }
  }

  /** a thing out of reach (up high: a moth round its light) watched a while, still: the cat
   *  chatters at it, as cats do */
  private chattering(dt: number, h: Hunt) {
    const cat = h.cat;
    let seen = false;
    if (cat.speed < 0.2 && cat.doing !== 'pounce') {
      for (const p of h.prey) {
        if (p.state === 'hidden' || p.state === 'held' || !p.mesh.visible || p.pos.y - cat.body.y < 0.5) continue;
        const to = p.pos.clone().sub(cat.eye), d = to.length();
        if (d < 0.6 || d > 4 || to.normalize().dot(cat.fwd) < 0.96) continue;
        if (!lineClear(cat.eye.x, cat.eye.y, cat.eye.z, p.pos.x, p.pos.y, p.pos.z, this.world.boxes)) continue;
        seen = true;
        break;
      }
    }
    this.watchT = seen ? this.watchT + dt : 0;
    if (this.watchT > 1.2 && this.time - this.chatAt > 8) {
      this.chatAt = this.time;
      this.watchT = 0;
      this.sound.play('chatter', null, 0.5);
      this.hud.say('깍깍깍', innerWidth / 2, innerHeight * 0.62, false);
    }
  }

  /** a sound made: played where it was made; and, a thing's, written there on the screen */
  private heard(name: string, at: THREE.Vector3 | null, gain: number) {
    this.sound.play(name, at, gain);
    // (the cat's own: felt, and seen in the view)
    if (name === 'whoosh') { this.kick = 1; this.feel.tap('medium'); }
    else if (name === 'thud') { this.dip = Math.max(this.dip, Math.min(1, gain * 1.6)); if (gain > 0.3) this.feel.tap('light'); }
    else if (name === 'swish') this.feel.tap('light');
    const word = WORDS[name];
    if (!word || !at || this.mode !== 'play') return;
    const eye = this.hunt!.cat.eye;
    if (at.distanceTo(eye) > 7) return;
    const v = at.clone().add(new THREE.Vector3(0, 0.08, 0)).project(this.cam);
    const R = this.canvas.getBoundingClientRect();
    const behind = v.z > 1;
    if (!behind && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95) {
      this.hud.say(word, R.left + (v.x * 0.5 + 0.5) * R.width, R.top + (-v.y * 0.5 + 0.5) * R.height, false);
      return;
    }
    // (off to one side, or behind: written at the edge it is nearer)
    const right = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 0);
    const side = at.clone().sub(eye).dot(right) > 0 ? 1 : -1;
    this.hud.say(`${side < 0 ? '◀ ' : ''}${word}${side > 0 ? ' ▶' : ''}`, side > 0 ? innerWidth - 60 : 60, innerHeight * 0.45, true);
  }

  // ----- each frame -----

  private loop(nowMs: number) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, this.last ? (nowMs - this.last) / 1000 : 0.016);
    this.last = nowMs;
    if (!this.manual) this.tick(dt);
    this.draw();
  }

  /** one step of it all (also driven by tests in fixed steps) */
  tick(dt: number) {
    this.time += dt;
    const I = this.controls.read();
    const h = this.hunt;
    if (this.mode === 'play' && h) {
      // (a catch: a beat held nearly still)
      h.step(this.stop > 0 ? dt * 0.15 : dt, I);
      this.stop -= dt;
      if (h.over) this.finish();
      this.tips();
      this.chattering(dt, h);
    } else if (!h || this.mode === 'title') {
      // (the title: the room looked round slowly, from the rug)
      const c = this.idle;
      c.place(1.5, 0, 1.0, -2.2 + Math.sin(this.time * 0.08) * 1.1);
      c.update(0, { move: { x: 0, y: 0 }, look: { yaw: 0, pitch: 0.05 + Math.sin(this.time * 0.13) * 0.08 + 0.1 }, jump: false, crouch: false, release: false, listen: false }, this.world.boxes);
    }
    // the lights: the TV flickers
    for (const L of this.lamps) if (L.flicker) {
      const f = 0.7 + 0.3 * Math.sin(this.time * 7.3) * Math.sin(this.time * 2.1 + 1) + (Math.random() < 0.03 ? -0.3 : 0);
      L.light.intensity = L.base * f;
      this.world.screen.color.setHSL(0.6 + 0.04 * Math.sin(this.time * 0.7), 0.5, 0.35 + 0.15 * f);
    }
    // their breathing, under the blanket
    this.world.sleeper.scale.y = 1 + 0.03 * Math.sin(this.time * 1.3);
    this.waking();
    this.drift();
    if (Math.random() < dt * 0.15 && h && this.mode === 'play') this.sound.play('snore', this.world.sleeper.position, 0.35);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.red = Math.max(0, this.red - dt * 1.2);
    this.kick = Math.max(0, this.kick - dt * 1.8);
    // the moon (and a flash of lightning); the rain down the window; thunder after the flash; the
    // last twenty seconds, the first of the dawn
    const dawn = h && this.mode !== 'title' && !h.night.endless ? THREE.MathUtils.smoothstep(h.t, h.night.time - 20, h.night.time) : 0;
    this.moon.intensity = this.moonBase * (1 - 0.5 * dawn) + 14 * (h?.bolt ?? 0) ** 2;
    this.sky.intensity = 1 + 0.9 * dawn;
    this.sky.color.setHex(0x6c7ab8).lerp(DAWN, dawn);
    if (this.world.rain.visible) {
      this.world.rain.material.map!.offset.y += dt * 1.6;
      this.world.rain.material.color.setScalar(1 + 4 * (h?.bolt ?? 0));
    }
    if (this.time >= this.thunderAt) { this.thunderAt = Infinity; this.sound.play('thunder', null, 0.9); }
    this.dip = Math.max(0, this.dip - dt * 4);
  }
  /** the cat on the title (no night under way): only its eyes, looking round */
  private readonly idle = new Cat();

  private draw() {
    const h = this.hunt;
    const cat = h ? h.cat : this.idle;
    cat.aim(this.cam);
    // (the leap: the view opens out as it flies; a landing: a jolt down and back)
    const fov = this.baseFov + 10 * Math.sin(Math.min(1, this.kick) * Math.PI * 0.5) ** 2;
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    this.cam.position.y -= 0.03 * Math.sin(this.dip * Math.PI);
    this.cam.updateMatrixWorld();
    this.sound.listen(cat.eye, cat.fwd);
    // (the music's tension: a wiggle, or a thing near that is wary of the cat)
    let tense = 0;
    if (h && this.mode === 'play') {
      if (cat.doing === 'wiggle') tense = 0.6 + 0.4 * Math.min(1, cat.charge);
      for (const p of h.prey) if (p.state === 'wary' && p.pos.distanceTo(cat.eye) < 2) tense = Math.max(tense, 0.5);
    }
    this.sound.tension(tense);
    // the paws, lit as the room is where the cat is
    let lit = 0.25;
    for (const L of this.world.lamps) lit += (L.power * 0.12) / (1 + cat.eye.distanceToSquared(L.at) * 1.5);
    this.paws.update(cat, this.view.aspect, Math.min(1, lit), this.time);
    this.paws.mouth.visible = !!h?.held;
    this.hud.held(!!h?.held && this.mode === 'play');
    // listening: the world grey, the things heard glowing through it
    const listening = this.mode === 'play' && cat.doing === 'listen';
    this.view.fx.listen += ((listening ? 1 : 0) - this.view.fx.listen) * 0.2;
    this.view.fx.flash = this.flash;
    this.view.fx.red = this.red;
    let over: THREE.Scene | null = null;
    if (h && this.view.fx.listen > 0.05) {
      over = this.over;
      h.prey.forEach((p, i) => {
        const g = this.glows[i];
        const vis = p.state !== 'hidden' && p.state !== 'held' && p.mesh.visible && p.pos.distanceTo(cat.eye) < 9;
        g.visible = vis;
        if (!vis) return;
        g.position.copy(p.pos).add(new THREE.Vector3(0, 0.03, 0));
        const pulse = 1 + 0.25 * Math.sin(this.time * 6 + i);
        g.scale.setScalar((0.1 + 0.02 * p.pos.distanceTo(cat.eye)) * pulse);
        (g.material as THREE.SpriteMaterial).opacity = this.view.fx.listen;
      });
    }
    // the wiggle: where it will come down
    for (const d of this.arc) d.visible = false;
    if (h && this.mode === 'play' && cat.doing === 'wiggle') {
      const way = this.landing(cat);
      const at = way.at;
      this.ring.visible = !!at;
      if (at) this.ring.position.copy(at).add(new THREE.Vector3(0, 0.05, 0));
      // (the dots: every few steps of the leap, from a little way out)
      way.path.filter((_, k) => k % 3 === 2).slice(0, this.arc.length).forEach((p, k) => {
        const d = this.arc[k];
        d.visible = true;
        d.position.copy(p).add(new THREE.Vector3(0, 0.08, 0));
      });
      this.hud.charge(cat.charge);
    } else {
      this.ring.visible = false;
      this.hud.charge(null);
    }
    if (h && this.mode === 'play') {
      this.hud.bar(h.clock, h.left, h.score, h.chainLive);
      this.hud.stick(this.controls.stick);
      this.marks(h);
    } else this.hud.setMarks([]);
    this.view.render(this.scene, this.cam, this.paws.scene, this.paws.cam, over);
  }

  /** where a pounce let go now would come down (the leap followed through the room) */
  private landing(cat: Cat) {
    const b = cat.body;
    const p = THREE.MathUtils.clamp(cat.pitch + 0.32, 0.12, 1.25);
    const v = (2.4 + 3.6 * Math.min(1.25, cat.charge)) * Math.sqrt(cat.pace);
    const sy = Math.sin(cat.yaw), cy = Math.cos(cat.yaw);
    const s: Body = { x: b.x, y: b.y, z: b.z, vx: sy * Math.cos(p) * v, vy: Math.sin(p) * v + 1.2, vz: cy * Math.cos(p) * v, r: b.r, h: b.h, grounded: false, landed: 0 };
    const path: THREE.Vector3[] = [];
    for (let i = 0; i < 120; i++) {
      moveBody(s, this.world.boxes, 1 / 60);
      path.push(new THREE.Vector3(s.x, s.y, s.z));
      if (s.grounded && i > 2) return { at: new THREE.Vector3(s.x, s.y, s.z), path };
      if (Math.abs(s.x) > HALF_X || Math.abs(s.z) > HALF_Z) return { at: null, path };
    }
    return { at: null, path };
  }

  /** the ? and ! over the things on the screen */
  private marks(h: Hunt) {
    const R = this.canvas.getBoundingClientRect(), out: { x: number; y: number; k: 'q' | 'x' }[] = [];
    for (const p of h.prey) {
      if (!p.mesh.visible || (p.state !== 'wary' && !(p.state === 'flee' && p.t < 1.2))) continue;
      if (p.pos.distanceTo(h.cat.eye) > 7) continue;
      const v = p.pos.clone().add(new THREE.Vector3(0, PREY[p.kind].size * 2 + 0.04, 0)).project(this.cam);
      if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      out.push({ x: R.left + (v.x * 0.5 + 0.5) * R.width, y: R.top + (-v.y * 0.5 + 0.5) * R.height, k: p.state === 'flee' ? 'x' : 'q' });
    }
    this.hud.setMarks(out);
  }

  /** the first night's lessons, one after another */
  private tips() {
    const h = this.hunt!;
    if (this.nightI !== 0 || this.save.best[NIGHTS[0].id]) return;
    const touch = this.controls.touchy || matchMedia('(pointer: coarse)').matches;
    const lines = touch
      ? ['왼쪽을 끌어 걸어요. 살짝 밀면 살금살금, 소리가 안 나요', '오른쪽을 끌어 둘러봐요. 귀뚤귀뚤 소리 나는 쪽으로!', '덮치기를 꾹 누르면 씰룩씰룩, 놓으면 분홍 고리까지 덮쳐요', '귀를 누르고 있으면 사냥감이 벽 너머로도 보여요', '높은 곳의 나방은 점프로 올라가서 덮쳐요']
      : ['WASD로 걸어요 (C: 살금살금, Shift: 달리기). 클릭하면 마우스로 둘러봐요', '귀뚤귀뚤 소리 나는 쪽으로 가 봐요', '마우스를 꾹 누르면 씰룩씰룩, 놓으면 분홍 고리까지 덮쳐요', 'E를 누르고 있으면 사냥감이 벽 너머로도 보여요', '스페이스로 점프해서 높은 곳의 나방도 노려요'];
    const at = [0.5, 9, 18, 30, 44];
    if (this.tipStep < at.length && h.t >= at[this.tipStep]) {
      this.hud.tip(lines[this.tipStep], 7000);
      this.tipStep++;
    }
  }

  private clearGlows() {
    for (const g of this.glows) this.over.remove(g);
    this.glows = [];
  }

  private static pawT: THREE.Texture | null = null;
  /** a paw print, to mark where a pounce will land */
  private static pawTex() {
    if (HuntApp.pawT) return HuntApp.pawT;
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(8, 11, 4, 3.4, 0, 0, Math.PI * 2); g.fill();
    for (const [x, y] of [[3.5, 6], [6.5, 3.8], [9.5, 3.8], [12.5, 6]]) { g.beginPath(); g.arc(x, y, 1.7, 0, Math.PI * 2); g.fill(); }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    HuntApp.pawT = t;
    return t;
  }

  private static dotTex: THREE.Texture | null = null;
  /** a soft round glow, for a sound seen through a wall */
  private static dot() {
    if (HuntApp.dotTex) return HuntApp.dotTex;
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.9)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 16, 16);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    HuntApp.dotTex = t;
    return t;
  }
}
