import * as THREE from 'three';
import { Cat3D } from '../cat3d/cat';
import { Stage } from '../cat3d/stage';
import { moodFromBrain } from '../cat3d/mood';
import { PointerInput, type Contact } from '../input/pointer';
import { MotionInput } from '../input/motion';
import { CatAudio } from '../audio/audio';
import { Haptic } from '../platform/haptics';
import { KeepAwake } from '../platform/awake';
import { GlassFog, fogOnGlass } from './glassfog';
import { Notifier, forecast } from '../platform/notify';
import { Hint } from '../ui/hint';
import { Firsts } from '../ui/firsts';
import { SlowWatch } from './pace';
import { Brain } from '../sim/brain';
import { loadState, newCat, saveState, type CatState } from '../sim/state';
import { stepLife, THRESH } from '../sim/life';
import { clamp } from '../util/math';
import { PixelAvatar } from './avatar';
import { Senses3D } from './senses';
import { Room } from './room';
import { rainAt } from '../cat3d/roomlight';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

// (the app built for a claude.ai Artifact carries the model in it, as a data: URL)
const MODEL: string = import.meta.env.VITE_CAT_MODEL ?? './cat3d/fri.bin';
/** built to be shown as a claude.ai Artifact (tools/artifact.mjs): a frame that allows no
 *  notifications, no motion sensors and no service worker */
const ARTIFACT = import.meta.env.VITE_ARTIFACT === '1';

/**
 * The window onto the pixel cat's room. The same life, brain, gestures and notifications as the
 * painted cat (app.ts); the body is the 3D cat drawn as pixel art, which the brain moves through
 * PixelAvatar, and whose feelings show in its eyes, ears, tail, fur and breath.
 */
export class PixelApp {
  readonly stage: Stage;
  readonly audio = new CatAudio();
  readonly haptic = new Haptic();
  /** the screen kept on while the radio plays (the room left open on a desk) */
  private readonly awake = new KeepAwake();
  /** when a finger was last on the screen at all (s, the page's clock) */
  private inputAt = 0;
  /** the radio playing and the room left open a long while, untouched (kept on while you work):
   *  now and then the cat comes to the glass for a moment of you (when it last did; how long
   *  untouched till it does again) */
  private nudgedAt = 0;
  private nudgeGap = (40 + Math.random() * 15) * 60;
  readonly notifier = new Notifier();
  readonly motion = new MotionInput();
  readonly hintUi: Hint;
  private readonly firstWords: Firsts;
  readonly input: PointerInput;
  readonly senses: Senses3D;
  readonly avatar: PixelAvatar;
  readonly room: Room;
  state: CatState;
  brain!: Brain;
  private last = 0;
  private visible = !document.hidden;
  private visibleOnce = false;
  private askNotify = false;
  private askMotion = false;
  private idleHintAt = 14;
  private saveIn = 10;
  private touchedAt = -1e9;
  private catDull = 0;
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
    this.firstWords = new Firsts(() => this.state.hints, this.hintUi);
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
    this.avatar.floorClear = (p, r) => this.room.floorClear(p, r);
    this.avatar.sunlitAt = (p) => this.room.sunlit(p);
    this.avatar.warmSpot = () => this.room.warmSpot();
    this.avatar.toys = {
      yarn: () => this.room.yarnAt(), kick: (d, v) => this.room.kickYarn(d, v),
      held: () => this.room.yarnHeld, pin: (sec, at) => this.room.pinYarn(sec, at), pinned: () => this.room.yarnPinned,
    };
    this.avatar.sillSpot = () => this.room.sillSpot();
    this.avatar.ground = {
      keepClear: (p, r) => this.room.keepClear(p, r),
      detour: (from, to, r) => this.room.detour(from, to, r),
      books: this.room.books,
      bump: (at, k) => this.room.bump(at, k),
      batLure: (v) => this.room.batLure(v),
      mouse: () => this.room.mouse,
      carry: (at, yaw) => this.room.carryMouse(at, yaw),
      hookMouse: (toward) => this.room.hookMouse(toward),
      pompom: () => this.room.pompom(),
      batPompom: (v) => this.room.batPompom(v),
      pinLure: (sec, at) => {
        this.room.pinLure(sec, at);
        // (a hand on the wand feels the paws have them)
        if (this.wandFinger) this.haptic.tap('medium');
      },
    };
    // the monstera knocked: its leaves rustle
    this.room.onRustle = (k) => this.audio.play('rustle', { gain: 0.08 + 0.18 * Math.min(1, k), pan: 0.5 });
    // the pompom batted: a soft tap of a paw on it
    this.room.onPompom = (k) => this.audio.play('thump', { gain: 0.03 + 0.05 * k, rate: 1.6, pan: Math.max(-0.8, Math.min(0.8, this.room.pompom().project(this.stage.camera).x * 0.8)) });
    // the toy mouse skids in under the radiator: a little knock against its foot, and the cat hears
    this.room.onMouseUnder = () => {
      this.audio.play('pencil', { gain: 0.05, rate: 0.6, pan: Math.max(-0.8, Math.min(0.8, this.room.mouse.p.clone().project(this.stage.camera).x * 0.8)) });
      this.avatar.hear(this.room.mouse.p.clone());
    };
    // the toy mouse coming down on the floor: a soft pat of felt
    this.room.onMouseLand = (k) => {
      if (k < 0.05) return;
      const pan = Math.max(-0.8, Math.min(0.8, this.room.mouse.p.clone().project(this.stage.camera).x * 0.8));
      this.audio.play('step', { gain: 0.05 + 0.12 * k, rate: 1.5, pan });
    };
    // the little bell on the wand's feathers; the feathers pulled out from under a paw (felt)
    this.room.onBell = (k) => this.audio.play('bell', { gain: 0.06 + 0.12 * k, pan: Math.max(-0.8, Math.min(0.8, this.room.lureAt().clone().project(this.stage.camera).x * 0.8)) });
    this.room.onLureFree = () => this.haptic.tap?.();
    // the mug pushed along the sill: a scrape of china; over the edge, a clink as it goes; in
    // pieces on the floor, a crash the cat jumps at (out of its sleep too), and you feel; swept up,
    // a soft brushing
    this.room.onMug = (what, at, k) => {
      const pan = Math.max(-0.8, Math.min(0.8, at.clone().project(this.stage.camera).x * 0.8));
      if (what === 'nudge') this.audio.play('pencil', { gain: 0.05 + 0.08 * k, rate: 0.75, pan });
      else if (what === 'tip') this.audio.play('pencil', { gain: 0.18, rate: 1.4, pan });
      else if (what === 'crash') {
        this.audio.play('shatter', { gain: 0.45 + 0.35 * k, pan });
        this.haptic.tap('heavy');
        // (a fright, unless the cat sent it over itself: then only a start)
        const own = this.avatar.crash(at);
        this.brain.thunder(own ? 0.3 : 0.85);
      } else this.audio.play('scoop', { gain: 0.3, rate: 1.3, pan });
    };
    this.avatar.boxSpot = () => this.room.boxSpot();
    this.avatar.outside = {
      birds: () => this.room.birds(),
      chirp: () => {
        this.audio.play('chirp', { gain: 0.45, pan: this.catPan() });
        if (this.avatar.doing !== 'stare') this.justNow.add('chatter');
      },
      sound: (name, gain) => this.audio.play(name, { gain, pan: this.catPan() }),
      bug: () => this.room.bugAt(),
      scareBug: (from) => this.room.scareBug(from),
      drop: (p) => this.room.setDrop(p),
      pencil: () => this.room.pencilWhere(),
      pushPencil: (dz, dx) => this.room.pushPencil(dz, dx),
      mug: () => this.room.mugWhere(),
      pushMug: (dz, dx) => this.room.pushMug(dz, dx),
    };
    // the pencil off the sill: a clack on the boards, quieter at each bounce; put back, a tap
    this.room.onPencil = (what, k) => {
      const p = this.room.pencil.getWorldPosition(new THREE.Vector3()).project(this.stage.camera);
      this.audio.play(what === 'hit' ? 'pencil' : 'step', { gain: what === 'hit' ? 0.12 + 0.5 * k : 0.3, rate: what === 'hit' ? 1 : 1.7, pan: Math.max(-0.8, Math.min(0.8, p.x * 0.8)) });
      if (what === 'hit' && k > 0.3) this.avatar.hear(this.room.pencil.getWorldPosition(new THREE.Vector3()));
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
    // (shown as a claude.ai Artifact, in its frame: no notifications to be had there, so the cat
    // never asks for them)
    if (ARTIFACT) this.state.notifyAsked = true;
    const away = Math.max(0, now - this.state.lastTick);
    stepLife(this.state, away, true);
    this.state.lastTick = now;
    this.state.stats.visits++;
    this.makeBrain();
    this.stage.setCoat(this.state.personality.coat);
    this.brain.wake(performance.now() / 1000, firstEver, away / 1000);
    this.avatar.settle();

    this.input = new PointerInput(canvas, {
      hitCat: (sx, sy, held) => !this.avatar.hidden && !!this.senses.hitNear(sx, sy, held ? 16 : 7),
      toP: (sx, sy) => [sx * this.senses.k, sy * this.senses.k],
      catTouchStart: (c) => { this.anchorTouch(c.sx, c.sy); this.brain.touchStart(c); },
      catTouchEnd: (c, tap) => { this.gestureEnd(); this.brain.touchEnd(c, tap); },
      glassTap: (x, y) => {
        this.gestureEnd();
        if (this.creditsOpen) { this.showCredits(false); return; }
        if (this.hitPrint(x, y)) { this.showCredits(true); return; }
        // the broken mug on the floor: tapped, swept up
        const mess = this.room.mess;
        if (mess && this.hitThing(mess, x, y, 30)) {
          this.room.sweepMug();
          this.haptic.tap?.();
          return;
        }
        // the toy mouse in under the radiator: a tap on it there (the radiator over it is seen to
        // further on, after the things on the sill) and a hand reaches in and flicks it out into
        // the room, and the cat is after it
        const M = this.room.mouse;
        if (M.under && this.hitThing(M.obj, x, y, 40)) { this.freeMouse(); return; }
        // the toy mouse: tapped, thrown into the room (somewhere on the floor beyond, in an arc),
        // and the cat may go after it (now and then too hard, at the radiator, in under which it
        // skids)
        if (M.state === 'floor' && this.hitThing(M.obj, x, y, 24)) {
          const wild = Math.random() < 0.15;
          const to = wild ? this.room.radiatorAim() : this.room.keepClear(new THREE.Vector3(-0.45 + 1.0 * Math.random(), 0, this.room.spots.bed.z - 0.35 - 0.25 * Math.random()), 0.06);
          const d = Math.hypot(to.x - M.p.x, to.z - M.p.z);
          this.room.tossMouse(to.clone().sub(M.p), Math.min(2.6, d / 0.34) * (wild ? 1.15 : 1));
          this.audio.play('pencil', { gain: 0.04, rate: 0.7 });
          this.haptic.tap?.();
          this.avatar.fetchNow();
          return;
        }
        // the pencil the cat pushed off the sill: tapped, it goes back up
        if (this.room.pencilDown && this.hitThing(this.room.pencil, x, y, 22)) {
          this.room.putPencilBack();
          this.haptic.tap?.();
          return;
        }
        // the lamp: a tap on its shade switches it, with a click
        if (this.hitThing(this.room.lampShade, x, y, 26)) {
          const on = this.room.switchLamp();
          this.audio.play('pencil', { gain: 0.09, rate: on ? 2.3 : 2.0, pan: -0.5 });
          this.avatar.hear(this.room.lampPos.clone());
          if (!on) this.avatar.lightsOut();
          else {
            const ck = this.clock();
            if (Room.dark(ck.getHours() + ck.getMinutes() / 60) > 0.6) this.avatar.lightsOn();
          }
          this.haptic.tap?.();
          return;
        }
        if (this.hitThing(this.room.radio, x, y, 24)) {
          this.audio.music(!this.audio.musicOn);
          this.avatar.hear(this.room.radio.getWorldPosition(new THREE.Vector3()));
          this.haptic.tap?.();
          return;
        }
        // the toy mouse in under the radiator: a tap on the radiator over it, and a hand reaches
        // in for it
        if (this.room.mouse.under && this.onRadiator(x, y)) { this.freeMouse(); return; }
        // (up on the sill seeing to the mug or the pencil: caught at it)
        if (this.avatar.caught()) return;
        this.brain.glassTap(x, y);
      },
      glassKnock: (x, y) => { this.gestureEnd(); if (!this.avatar.caught()) this.brain.knock(x, y); },
      pourStart: () => this.brain.pourStart(),
      pourEnd: () => { this.gestureEnd(); this.brain.pourEnd(); },
      // (a finger scrubbing the glass to shake the kibble is not one to play with)
      shake: (k) => { this.glassQuiet = 2; this.brain.kibble(k); },
      scoop: () => { this.gestureEnd(); this.brain.scoop(); },
      longHold: (_x, _y, onCat) => this.longHold(onCat),
      hover: (x, y) => {
        this.haptic.flush();
        this.brain.hover(x, y);
        this.fingerOnGlass(x, y);
        if (this.laser.held) return;
        // (with a mouse: the ball of wool, and the laser pointer, can be taken hold of)
        const over = this.hitThing(this.room.yarnBall, x, y, 14) || (this.room.pointer.visible && this.hitThing(this.room.pointer, x, y, 14));
        if (over !== this.overToy) { this.overToy = over; canvas.style.cursor = over ? 'grab' : ''; }
      },
      firstGesture: () => this.audio.start(),
      // the laser pointer in your hand: every finger on the glass is its red dot (a tap on the
      // pointer itself puts it down)
      takeAll: (x, y, id, kind) => {
        const L = this.laser;
        if (!L.held || this.creditsOpen) return false;
        L.lift = kind === 'mouse' ? 0 : kind === 'pen' ? 10 : 34;
        L.x0 = x;
        L.y0 = y;
        // (on the pointer in your hand, or where it lay on the sill: a tap puts it down there)
        const home = this.room.pointerHome.clone().project(this.stage.camera);
        const nearHome = Math.hypot((home.x * 0.5 + 0.5) * innerWidth - x, (-home.y * 0.5 + 0.5) * innerHeight - y) < 26;
        if (nearHome || this.hitThing(this.room.heldPointer, x, y, 26) || this.nearLength(this.room.heldPointer, -0.045, 0.045, x, y, 26)) { L.downOn = id; return true; }
        L.id = id;
        L.sx = x;
        L.sy = y;
        L.idle = 0;
        if (kind === 'mouse') canvas.style.cursor = 'none';
        // (the little click of its button)
        this.audio.play('pencil', { gain: 0.035, rate: 2.4 });
        return true;
      },
      // the laser pointer on the sill: taken up (and if the finger goes on, the dot is on);
      // the ball of wool: a finger on it rolls it about the floor for the cat; a tap flicks it
      grabToy: (x, y, id, kind) => {
        if (this.creditsOpen) return false;
        if (this.wandFinger) return false;
        if (!this.laser.held && this.room.pointer.visible && this.hitThing(this.room.pointer, x, y, 24)) {
          this.takeLaser(true);
          Object.assign(this.laser, { taking: id, x0: x, y0: y, lift: kind === 'mouse' ? 0 : kind === 'pen' ? 10 : 34 });
          return true;
        }
        // the feather wand: taken up by its feathers or its cane
        if (!this.hitThing(this.room.yarnBall, x, y, 26) && this.hitWand(x, y)) {
          this.wandFinger = { x, y, id };
          this.room.holdWand(true);
          this.aimWand(x, y);
          // (a jingle of its bell as it comes up: the cat knows that sound)
          this.audio.play('bell', { gain: 0.12 });
          this.avatar.perk(this.room.lureAt(), 0.3 + 0.4 * Math.max(0, this.state.trust));
          canvas.style.cursor = 'grabbing';
          if (!this.state.hints.wand) {
            this.state.hints.wand = 1;
            this.hintUi.show('깃털을 흔들어 보세요. 높이 들면 고양이가 뛰어올라요', 5000);
          }
          return true;
        }
        if (!this.hitThing(this.room.yarnBall, x, y, 26)) return false;
        // held where the finger took it, not snapped to the fingertip
        const at = this.floorPoint(x, y);
        if (!at) return false;
        this.toyFinger = { x, y, off: this.room.yarnAt().clone().sub(at).setY(0) };
        canvas.style.cursor = 'grabbing';
        return true;
      },
      dragToy: (x, y, id) => {
        const L = this.laser;
        if (L.held) {
          // (the finger that took it up, or that came down on it in your hand, shines it once it
          // moves off)
          if (id === L.taking || id === L.downOn) {
            if (Math.hypot(x - L.x0, y - L.y0) < 14) return;
            L.taking = L.downOn = -1;
            L.id = id;
          }
          if (id === L.id) { L.sx = x; L.sy = y; L.idle = 0; }
          return;
        }
        const wf = this.wandFinger;
        if (wf && wf.id === id) {
          wf.x = x;
          wf.y = y;
          return;
        }
        const f = this.toyFinger;
        const at = f && this.floorPoint(x, y);
        if (!f || !at) return;
        f.x = x;
        f.y = y;
        this.room.holdYarn(at.add(f.off));
      },
      releaseToy: (tap, id) => {
        const L = this.laser;
        if (L.held) {
          // (a finger on the pointer that has not gone off it to shine it puts it down, however
          // long it was there: on a busy phone a quick tap is not always quick)
          if (id === L.downOn) this.takeLaser(false);
          if (id === L.id) {
            L.id = -1;
            if (canvas.style.cursor === 'none') canvas.style.cursor = 'crosshair';
            // (a quick tap is a tap on the glass all the same, pointer in hand or not: the cat
            // hears it, and two are a knock, which wakes it)
            if (tap) {
              const now = performance.now();
              if (now - this.laserTap.t < 420 && Math.hypot(L.sx - this.laserTap.x, L.sy - this.laserTap.y) < 60) {
                this.brain.knock(L.sx, L.sy);
                this.laserTap.t = 0;
              } else {
                this.brain.glassTap(L.sx, L.sy);
                this.laserTap = { t: now, x: L.sx, y: L.sy };
              }
            }
            // (the first time the dot goes off: how to put the pointer down)
            if (!this.state.hints.laserDown && L.used > 4) {
              this.state.hints.laserDown = 1;
              this.hintUi.show('아래의 포인터를 톡 누르면 내려놓아요', 4500);
            }
          }
          if (id === L.taking) L.taking = -1;
          if (id === L.downOn) L.downOn = -1;
          this.gestureEnd();
          return;
        }
        const wf = this.wandFinger;
        if (wf && wf.id === id) {
          // let go: the wand falls where it is, its cane along the floor the way the hand was
          // (across the picture toward its bottom corner, where it shows)
          this.wandFinger = null;
          const tip = this.room.stringLine().a, hand = this.room.wandEnd;
          const dx = hand.x - tip.x, dz = hand.z - tip.z, d = Math.hypot(dx, dz) || 1;
          this.room.holdWand(false, new THREE.Vector3(tip.x + (dx / d) * 0.8, 0, tip.z + (dz / d) * 0.8));
          canvas.style.cursor = '';
          this.gestureEnd();
          return;
        }
        const f = this.toyFinger;
        this.toyFinger = null;
        this.room.holdYarn(null);
        canvas.style.cursor = this.overToy ? 'grab' : '';
        this.gestureEnd();
        if (tap && f) this.flickYarn(f.x, f.y);
      },
    });
    // (a finger on the glass wipes the mist off it where it goes)
    const wipe = (e: PointerEvent) => { if (e.pointerType !== 'mouse' || e.buttons) this.glassFog.wipe(e.clientX / innerWidth, e.clientY / innerHeight, e.pointerType === 'mouse' ? 0.03 : 0.045); };
    canvas.addEventListener('pointerdown', (e) => { this.audio.start(); this.awake.touched(); this.inputAt = performance.now() / 1000; wipe(e); });
    canvas.addEventListener('pointermove', (e) => { this.inputAt = performance.now() / 1000; wipe(e); }, { passive: true });
    this.audio.unlockOn(window);
    this.native();
    this.motion.onShake = (k) => this.brain.kibble(k);

    window.addEventListener('resize', () => { this.stage.resize(); this.frame3d(); });
    document.addEventListener('visibilitychange', () => this.onVisibility(!document.hidden));
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
  static artWidth(px = PixelApp.pxWanted()) {
    // about one and two thirds of the screen's points to an art pixel (on a phone of three screen
    // pixels to the point, five): fine enough for the cat's eyes and whiskers to be drawn with
    // some care, and still pixel art you can see the pixels of; on a tablet, or a phone on its
    // side, no finer than a phone held upright
    return Math.round(clamp(innerWidth / px, 315 / px, 546 / px));
  }
  /** the screen's points to an art pixel: as asked (?px=2.1, for comparison); or coarser on a
   *  phone that has been found not to keep up with the finer (and remembered for it) */
  private static pxWanted() {
    const asked = +(new URLSearchParams(location.search).get('px') ?? '');
    if (asked) return asked;
    try {
      if (localStorage.getItem(PixelApp.COARSE_KEY)) return PixelApp.COARSE;
    } catch { /* storage shut: as usual */ }
    return 1.7;
  }
  private static readonly COARSE = 2.1;
  private static readonly COARSE_KEY = 'cat-window.coarse';
  /** whether the phone keeps up with the picture (see SlowWatch): if not, the art drawn coarser */
  private readonly slowWatch = new SlowWatch();
  private keepUp(gapMs: number, busy: boolean) {
    if (!busy || !this.slowWatch.frame(gapMs) || new URLSearchParams(location.search).get('px')) return;
    this.stage.setArtWidth(PixelApp.artWidth(PixelApp.COARSE));
    try { localStorage.setItem(PixelApp.COARSE_KEY, '1'); } catch { /* not remembered, then */ }
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
    // (a level camera sees a little less of the floor before the bed than a tipped one: looked at
    // from a little lower, it sees as much)
    this.roomView.target.set(this.aim.x, 0.45, this.aim.z - 0.2);
    this.roomView.dir.set(0, Math.sin(el), Math.cos(el));
    this.roomView.dist = d;
    // close to the cat: a third of a metre across (and 0.6 m up and down) round its body
    this.closeDist = Math.max(0.18 / (tv * cam.aspect), 0.3 / tv);
    this.closeNow = this.closeDist;
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
  /** where the eye is off to the side of the glass, the phone tipped (metres; eased after it) */
  private readonly head = new THREE.Vector2();
  private headMoving = false;
  private readonly still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private closeDist = 1.5;
  /** how close it comes this time: no closer than keeps the cat's face on the screen */
  private closeNow = 1.5;
  private focus = 0;
  private focusT = 0;
  private focusHold = 0;
  private readonly catAim = new THREE.Vector3();

  /** the room view drifts sideways after the cat, so wherever it goes it stays in view */
  private panX = 0;
  private readonly tmpR = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpU = new THREE.Vector3();

  private placeCamera() {
    const cam = this.stage.camera;
    const f = this.focus * this.focus * (3 - 2 * this.focus);
    const rv = this.roomView;
    const target = rv.target.clone();
    target.x += this.panX;
    target.lerp(this.catAim, f);
    const dist = rv.dist + (this.closeNow - rv.dist) * f;
    const dir = rv.dir.clone().lerp(new THREE.Vector3(0, Math.sin(0.27), Math.cos(0.27)), f).normalize();
    // (from a little above, but with the camera level and the picture slid down to what it looks
    // at (stage.ts setShift): upright things stay upright, as pixel art draws them; as far off,
    // straight ahead, as the distance looked at was)
    const tvp = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const el = Math.atan2(dir.y, dir.z);
    cam.position.copy(target).addScaledVector(dir, dist / Math.cos(el));
    cam.rotation.set(0, 0, 0);
    // the phone tipped: as an eye moved off to the side of a window, the view through it shifts
    // (the room behind the glass the more the further back, the sky most of all) while the glass
    // itself stays put: the eye moved across and the lens shifted back to the same glass (not
    // close in on the cat, where the hand is)
    const hx = this.head.x * (1 - f), hy = this.head.y * (1 - f);
    let gx = 0, gy = 0;
    if ((hx || hy) && this.room) {
      cam.position.x += hx;
      cam.position.y += hy;
      const dg = Math.max(0.5, cam.position.z - (this.room.spots.bed.z + 0.45));
      gx = hx / (dg * tvp * cam.aspect);
      gy = hy / (dg * tvp);
    }
    cam.updateMatrixWorld();
    this.stage.setShift(Math.tan(el) / tvp + gy, gx);
    // coming in close round a spot on the cat touched: the view slid square to itself till that
    // spot is under the finger again (fully while the hand is on it or the view holds close; going
    // back out, less and less), so far that the middle of the cat stays well on the screen
    if (this.anchor && this.room) {
      const a = this.anchor, w = this.focusT === 1 ? 1 : f;
      const A = a.at;
      const q = A.clone().project(cam);
      const depth = cam.position.z - A.z;
      let dx = (a.nx - q.x) * depth * tvp * cam.aspect, dy = (a.ny - q.y) * depth * tvp;
      const lim = 0.7 * depth * tvp;
      dx = Math.max(-lim * cam.aspect, Math.min(lim * cam.aspect, dx));
      dy = Math.max(-lim, Math.min(lim, dy));
      // (and a little further, if that leaves the face off the screen: the fur slides a little
      // under the finger, rather than the face be lost)
      const e = this.tmpA.copy(this.eyesW).project(cam), dE = cam.position.z - this.eyesW.z;
      if (dE > 0.1) {
        const sx = dE * tvp * cam.aspect, sy = dE * tvp;
        const [fx, fy] = this.faceIn(e.x + dx / sx, e.y + dy / sy, sx, sy);
        dx += fx * sx;
        dy += fy * sy;
      }
      cam.position.x -= dx * w;
      cam.position.y -= dy * w;
      cam.updateMatrixWorld();
    }
    // keep the camera on the art's grid (an art pixel at the distance looked at), so the room's
    // pixels hold still as the view drifts, and let the finished picture slide by the rest
    const px = (2 * tvp * dist) / this.stage.pixelRows();
    const right = this.tmpR.setFromMatrixColumn(cam.matrixWorld, 0), up = this.tmpU.setFromMatrixColumn(cam.matrixWorld, 1);
    const rx = cam.position.dot(right), uy = cam.position.dot(up);
    const sx = Math.round(rx / px) * px, sy = Math.round(uy / px) * px;
    cam.position.addScaledVector(right, sx - rx).addScaledVector(up, sy - uy);
    cam.updateMatrixWorld();
    this.stage.setSubPixel((rx - sx) / px, (uy - sy) / px);
    // the sky through the window, in art pixels
    if (this.room) {
      // (the window faces the camera square: an art pixel is the same size all over it)
      this.room.setPixel(2 * tvp * (cam.position.z - this.room.skyZ) / this.stage.pixelRows());
      this.room.setView(cam.position.x);
    }
  }

  /** a hand on the cat brings the view in close; some seconds after the last, back out */
  /** the middle of the cat's body, wherever it lies */
  private bodyMiddle(out = new THREE.Vector3()) {
    const m = this.cat.motor;
    const fp = this.cat.footprint(m.targetPosture);
    const c = Math.cos(m.yaw), sn = Math.sin(m.yaw);
    return out.set(m.pos.x + fp.x * c + fp.z * sn, 0.11, m.pos.z - fp.x * sn + fp.z * c);
  }

  /** a finger come down on the cat, the view not yet close: it comes in round the spot touched,
   *  which stays under the finger (as under a pinch), rather than draw the cat to the middle of
   *  the screen from under it. Where on the body (from its middle), and where on the screen */
  private anchor: { bone: THREE.Object3D; local: THREE.Vector3; nx: number; ny: number; at: THREE.Vector3 } | null = null;
  private anchorTouch(sx: number, sy: number) {
    if (this.focus > 0.3) return;
    const nx = (sx / innerWidth) * 2 - 1, ny = -(sy / innerHeight) * 2 + 1;
    // (the very spot of fur under the finger, or near it)
    const hit = this.senses.hitNear(sx, sy);
    if (!hit) { this.anchor = null; return; }
    const at = hit.point.clone();
    // (the spot is on a bone, and goes with it as the cat shifts under the hand: sits up, settles)
    const bone = this.cat.byName.get(hit.bone);
    if (!bone) { this.anchor = null; return; }
    bone.updateWorldMatrix(true, false);
    const local = at.clone().applyMatrix4(new THREE.Matrix4().copy(bone.matrixWorld).invert());
    this.anchor = { bone, local, nx, ny, at };
  }

  /** the face (round the eyes, a hand's breadth across and a little more above them, for the
   *  ears) where the view would show it (ex, ey on the screen, -1 .. 1; sx, sy the world size of
   *  the screen's half there): how far to slide the picture to have it on (-1 .. 1 of the screen,
   *  no further than a little: beyond that it stays off) */
  private faceIn(ex: number, ey: number, sx: number, sy: number) {
    const m = 0.94, rx = 0.07 / sx, up = 0.08 / sy, down = 0.06 / sy;
    const mx = (0.15 * 2), my = (0.15 * 2 * innerWidth) / Math.max(1, innerHeight);
    const ox = Math.max(0, -m - (ex - rx)) - Math.max(0, ex + rx - m), oy = Math.max(0, -m - (ey - down)) - Math.max(0, ey + up - m);
    return [Math.max(-mx, Math.min(mx, ox)), Math.max(-my, Math.min(my, oy))];
  }

  /** how near the close view may come round a spot touched (its distance, at nearest closeDist)
   *  with the spot under the finger (or nearly) and the face on the screen: the camera where
   *  placeCamera puts it all the way in, worked out for a distance, and the nearest that fits
   *  found by halving */
  private nearest(a: { nx: number; ny: number; at: THREE.Vector3 }, eyes: THREE.Vector3) {
    const cam = this.stage.camera, tvp = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), asp = cam.aspect;
    const T = this.catAim, te = Math.tan(0.27), shift = te / tvp;
    const fits = (d: number) => {
      const cx = T.x, cy = T.y + d * te, cz = T.z + d, dA = cz - a.at.z;
      const lim = 0.7 * dA * tvp;
      const qx = (a.at.x - cx) / (dA * tvp * asp), qy = (a.at.y - cy) / (dA * tvp) + shift;
      const x = cx - Math.max(-lim * asp, Math.min(lim * asp, (a.nx - qx) * dA * tvp * asp));
      const y = cy - Math.max(-lim, Math.min(lim, (a.ny - qy) * dA * tvp));
      const dE = cz - eyes.z;
      if (dE < 0.1) return true;
      const sx = dE * tvp * asp, sy = dE * tvp;
      const ex = (eyes.x - x) / sx, ey = (eyes.y - y) / sy + shift;
      const [fx, fy] = this.faceIn(ex, ey, sx, sy);
      const [gx, gy] = this.faceIn(ex + fx, ey + fy, sx, sy);
      return Math.abs(gx) < 1e-4 && Math.abs(gy) < 1e-4;
    };
    let lo = this.closeDist, hi = Math.max(lo, this.roomView.dist);
    if (fits(lo)) return lo;
    if (!fits(hi)) return hi;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }
  /** where the cat's eyes are (world), for the close view */
  private readonly eyesW = new THREE.Vector3();

  private moveCamera(dt: number, touching: boolean) {
    if (touching) { this.focusT = 1; this.focusHold = 9; }
    else if ((this.focusHold -= dt) <= 0) this.focusT = 0;
    const m = this.cat.motor;
    // the middle of the body, wherever it lies; close in, as high as halfway up to its head (sat
    // up, the head is well above the middle of the body, and the view would have it at the top
    // and empty floor below)
    const want = this.bodyMiddle();
    const head = this.cat.byName.get('head');
    const aimAt = want.clone();
    if (head) aimAt.y = 0.5 * (want.y + Math.max(0.08, Math.min(0.36, head.getWorldPosition(this.tmpA).y)));
    if (this.focus < 0.01) this.catAim.copy(aimAt);
    else this.catAim.lerp(aimAt, 1 - Math.exp(-dt * 2.5));
    if (this.anchor) {
      const a = this.anchor;
      a.bone.updateWorldMatrix(true, false);
      a.at.lerp(this.tmpA.copy(a.local).applyMatrix4(a.bone.matrixWorld), 1 - Math.exp(-dt * 6));
      if (this.focusT === 0 && this.focus < 0.01) this.anchor = null;
    }
    // (in round a spot on its back or its flank, as near as that leaves its face on the screen:
    // its face is what answers the hand. Out again at once if the face would go off; in again
    // slowly as it comes back)
    this.cat.body.eyes(this.eyesW).applyMatrix4(this.cat.group.matrixWorld);
    const need = this.anchor ? this.nearest(this.anchor, this.eyesW) : this.closeDist;
    this.closeNow += (need - this.closeNow) * (1 - Math.exp(-dt * (need > this.closeNow ? 5 : 1.2)));
    if (this.focus < 0.01) this.closeNow = need;
    // the room view follows as the cat goes off toward an edge, a little ahead of it the way it is
    // walking (not when it is tearing about: it lags behind then, rather than swinging to and fro),
    // never past the room's ends
    // (and a little toward where its head is: rubbing along the lamp, its face was off the side
    // while the middle of it was still in view)
    // (at the scratching post, the post in the picture with it: it stands by the room's left end)
    const lead = want.x + 0.08 * Math.sin(m.yaw) + m.vel.x * 0.7 * (1 - m.zoom) + (this.avatar.doing === 'claw' ? -0.1 : 0);
    const off = lead - this.panX, dead = 0.07;
    const goal = Math.max(-0.66, Math.min(0.6, off > dead ? lead - dead : off < -dead ? lead + dead : this.panX));
    const L = this.laser, wf = this.wandFinger;
    const playing = this.avatar.doing === 'chase' || this.avatar.doing === 'tease';
    const tool = L.held && L.id >= 0 ? L.sx : wf ? wf.x : null;
    if (tool !== null && playing) {
      // the red dot on: the room holds still under the finger (else the dot would slide off with
      // it as the view went after the cat), unless the dot is held out near an edge, which takes
      // the view on that way
      const ex = (tool / innerWidth) * 2 - 1, edge = 0.7;
      if (Math.abs(ex) > edge) this.panX = Math.max(-0.66, Math.min(0.6, this.panX + Math.sign(ex) * ((Math.abs(ex) - edge) / (1 - edge)) * 0.45 * dt));
    }
    // (a little quicker after it when it is tearing about, so that it is not lost off the side)
    else this.panX += (goal - this.panX) * (1 - Math.exp(-dt * (1.8 + 1.2 * m.zoom)));
    const rate = this.focusT > this.focus ? 1.6 : 0.8;
    this.focus += Math.max(-rate * dt, Math.min(rate * dt, this.focusT - this.focus));
    // (the right edge tipped away from you is the eye gone off to the left of the glass; the top
    // tipped toward you, the eye gone up, looking down through it)
    const mo = this.motion, k = 1 - Math.exp(-dt * 6);
    const wx = this.still ? 0 : -0.14 * mo.tiltX, wy = this.still ? 0 : 0.08 * mo.tiltY;
    this.headMoving = Math.abs(wx - this.head.x) + Math.abs(wy - this.head.y) > 0.002;
    this.head.x += (wx - this.head.x) * k;
    this.head.y += (wy - this.head.y) * k;
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
      noseAt: (px, py) => this.senses.noseAt(px, py),
    });
    this.brain.onWantNotify = () => { this.askNotify = true; };
    this.brain.onWantMotion = () => { if (this.motion.canAsk && !ARTIFACT) this.askMotion = true; };
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
        <p>이 앱을 위해 뼈대를 새로 심고, 자세와 걸음, 입과 눈을 새로 만들고, 머리와 눈을 조금 크게 해서 픽셀아트로 다시 칠했어요(몸과 꼬리, 머리 뒤의 줄무늬는 새로 그렸어요). (원작자가 이 앱을 보증하는 것은 아니에요.)</p>
        <p>글자 <b>Galmuri</b> · 만든 이 <a href="https://github.com/quiple/galmuri" target="_blank" rel="noopener">이민서(quiple)</a><br>
        <a href="./fonts/OFL.txt" target="_blank" rel="noopener">SIL 오픈 폰트 라이선스 1.1</a>로 공유된 글꼴에서 이 앱이 쓰는 글자만 추려 이름을 바꿔(Window Pixel) 썼어요.</p>
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

  /** a finger (or the pointer) over the glass: where the cat sees it, on the glass just beyond
   *  where it would sit facing you, if that is low enough down for a cat to reach (stood up on its
   *  hind legs; higher, it only watches it go) */
  private readonly glassAt = new THREE.Vector3();
  private glassQuiet = 0;
  private fingerOnGlass(sx: number, sy: number) {
    if (!this.room || this.avatar.hidden || this.glassQuiet > 0) return;
    const ray = this.floorRay;
    ray.setFromCamera(new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1), this.stage.camera);
    const o = ray.ray.origin, d = ray.ray.direction, z = this.room.spots.bed.z + 0.45;
    if (Math.abs(d.z) < 1e-4) return;
    const t = (z - o.z) / d.z;
    if (t <= 0) return;
    const at = this.glassAt.set(o.x + d.x * t, o.y + d.y * t, z);
    if (at.y < 0.02 || at.y > 0.46) return;
    this.avatar.fingerOnGlass(at);
  }

  /** the toy mouse got out from under the radiator by a hand reaching in, flicked out into the
   *  room for the cat to go after */
  private freeMouse() {
    const M = this.room.mouse;
    this.room.hookMouse(new THREE.Vector3(M.p.x + (Math.random() - 0.5) * 0.4, 0, this.room.spots.bed.z));
    this.audio.play('pencil', { gain: 0.05, rate: 0.7 });
    this.haptic.tap?.();
    this.avatar.fetchNow();
  }

  /** is a screen point on the radiator (its front, or the gap under it) */
  private onRadiator(sx: number, sy: number) {
    const ray = this.floorRay;
    ray.setFromCamera(new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1), this.stage.camera);
    return this.room.radiatorAt(ray.ray);
  }

  /** is a thing in the room under a screen point (or near it: a finger is wider than it) */
  private hitThing(o: THREE.Object3D, sx: number, sy: number, near: number) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1), this.stage.camera);
    if (ray.intersectObject(o, true).length) return true;
    const p = o.getWorldPosition(new THREE.Vector3()).project(this.stage.camera);
    return Math.hypot((p.x * 0.5 + 0.5) * innerWidth - sx, (-p.y * 0.5 + 0.5) * innerHeight - sy) < near;
  }

  /** is a screen point within so many css px of a long thin thing as the screen shows it (from a
   *  to b along its own x): a fingertip is wider than it is, and comes down beside it as often as
   *  on it */
  private nearLength(o: THREE.Object3D, a: number, b: number, sx: number, sy: number, near: number) {
    o.updateWorldMatrix(true, false);
    const cam = this.stage.camera;
    const scr = (x: number) => {
      const p = o.localToWorld(new THREE.Vector3(x, 0, 0)).project(cam);
      return [(p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight];
    };
    const [ax, ay] = scr(a), [bx, by] = scr(b);
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(ax + dx * t - sx, ay + dy * t - sy) < near;
  }

  /** the laser pointer: taken up off the sill or not; the finger shining it (which, where, and how
   *  far above the fingertip the dot shows, so that it is not under the finger); the touch that
   *  took it up, or that came down on it in your hand (a tap there puts it down); where those
   *  began; how long since it was last shone and for how long all told; where the dot is */
  private readonly laser = {
    held: false, id: -1, sx: 0, sy: 0, lift: 0, taking: -1, downOn: -1, x0: 0, y0: 0, idle: 0, used: 0,
    hit: null as { p: THREE.Vector3; n: THREE.Vector3; on: 'floor' | 'bed' | 'sill' | 'books' | 'up' | 'out' | 'cat'; mug?: boolean } | null,
    /** on the cat itself: which part of it, and where */
    self: null as 'rear' | 'front' | 'side' | 'head' | null, selfAt: new THREE.Vector3(),
  };

  /** the last quick tap with the laser pointer in hand (a second one soon after is a knock) */
  private laserTap = { t: 0, x: 0, y: 0 };

  /** a finger holding the feather wand (where, which) */
  private wandFinger: { x: number; y: number; id: number } | null = null;

  /** is the feather wand under a screen point: its feathers (a finger is wider than they are), or
   *  its cane where it shows */
  private hitWand(sx: number, sy: number) {
    const [lure, rod] = this.room.wandParts;
    if (this.hitThing(lure, sx, sy, 30)) return true;
    const ray = new THREE.Raycaster();
    for (const [ox, oy] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) {
      ray.setFromCamera(new THREE.Vector2(((sx + ox) / innerWidth) * 2 - 1, -((sy + oy) / innerHeight) * 2 + 1), this.stage.camera);
      if (ray.intersectObject(rod, false).length) return true;
    }
    return false;
  }

  /** where the finger takes the wand: the feathers hang where the finger is, on the air in front of
   *  the bed (up the picture is up), or on the floor nearer you below that; the cane's tip above
   *  them, its other end in your hand just below the picture */
  private aimWand(sx: number, sy: number) {
    const cam = this.stage.camera, ray = this.floorRay;
    ray.setFromCamera(new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1), cam);
    const o = ray.ray.origin, d = ray.ray.direction;
    const zP = this.room.spots.bed.z + 0.25;
    const p = o.clone().addScaledVector(d, Math.abs(d.z) > 1e-4 ? (zP - o.z) / d.z : 3);
    if (p.y < 0 && d.y < -1e-4) p.copy(o).addScaledVector(d, -o.y / d.y);
    p.x = Math.max(-0.62, Math.min(0.72, p.x));
    p.y = Math.max(0, Math.min(0.85, p.y));
    p.z = Math.min(this.room.spots.bed.z + 0.6, p.z);
    // (the string's length above them: taut, so that they go where the finger goes, dragging over
    // the floor or swinging in the air)
    const tip = p.add(new THREE.Vector3(0, 0.27, 0));
    // (the hand off the bottom right corner: the cane comes in across the picture, not up it)
    const hand = Room.atDepth(cam, 1.05, -1, 1.5);
    hand.y -= 0.03;
    hand.applyMatrix4(cam.matrixWorld);
    this.room.aimWand(tip, hand);
  }

  /** how much of the bottom of the screen is the phone's own (the home bar), css px */
  private safeB = -1;
  private safeBottom() {
    if (this.safeB < 0) {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;bottom:0;height:0;padding-bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none';
      document.body.appendChild(probe);
      this.safeB = probe.getBoundingClientRect().height || 0;
      probe.remove();
      addEventListener('resize', () => { this.safeB = -1; }, { once: true });
    }
    return this.safeB;
  }

  /** how far along a ray it first meets the cat's body (its capsules), or -1; and which capsule
   *  that is (cat3d/cat.ts CAPS: 0 the hips .. 5 the head, 6-9 and 14-15 the forelegs and
   *  forepaws, 10-13 and 16-17 the hind legs and feet, 18-19 the tail) */
  private catPart = -1;
  private rayCat(ray: THREE.Ray, slack = 1) {
    const caps = this.cat.shared.uCaps.value as THREE.Vector4[];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), pr = new THREE.Vector3(), ps = new THREE.Vector3();
    let best = -1;
    this.catPart = -1;
    for (let i = 0; i + 1 < caps.length; i += 2) {
      const r = caps[i].w * slack;
      if (r <= 0) continue;
      a.set(caps[i].x, caps[i].y, caps[i].z);
      b.set(caps[i + 1].x, caps[i + 1].y, caps[i + 1].z);
      const d2 = ray.distanceSqToSegment(a, b, pr, ps);
      if (d2 > r * r) continue;
      const t = ray.origin.distanceTo(pr) - Math.sqrt(r * r - d2);
      if (best < 0 || t < best) { best = t; this.catPart = i / 2; }
    }
    return best;
  }

  /** the laser pointer taken up off the sill, or put back down on it */
  private takeLaser(up: boolean) {
    const L = this.laser;
    L.held = up;
    L.id = L.taking = L.downOn = -1;
    L.idle = 0;
    L.hit = null;
    this.room.takePointer(up);
    this.audio.play('pencil', { gain: 0.12, rate: up ? 1.5 : 1.25 });
    this.haptic.tap?.();
    // (the cat knows that sound)
    if (up) this.avatar.perk(this.room.pointerHome, 0.35 + 0.4 * Math.max(0, this.state.trust));
    this.canvas.style.cursor = up ? 'crosshair' : '';
    if (up && !this.state.hints.laser) {
      this.state.hints.laser = 1;
      this.hintUi.show('화면을 누른 채 움직이면 빨간 점이 따라가요', 5000);
    }
  }

  /** the dot where the finger points (on whatever it falls on first, the cat too); the pointer in
   *  your hand aimed at it; what the cat sees of it; and, a good while unused, the pointer put down */
  private readonly laserNdc = new THREE.Vector2();
  private shineLaser(dt: number) {
    const L = this.laser, cam = this.stage.camera;
    let dot: THREE.Vector3 | null = null;
    if (L.held) {
      L.idle += dt;
      L.hit = null;
      if (L.id >= 0) {
        L.used += dt;
        const sx = L.sx, sy = L.sy - L.lift;
        this.laserNdc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
        L.hit = this.room.laserHit(this.laserNdc, cam);
        if (L.hit && L.hit.on !== 'out') dot = L.hit.p;
        // (the cat in the way: the dot is on its coat (the capsules round its body are enough to
        // tell, a little fattened to the fur), and on which part of it: its own tail is a thing to
        // be had too)
        L.self = null;
        if (!this.avatar.hidden) {
          const ray = this.room.laserRay.ray;
          const t = this.rayCat(ray, 1.35);
          if (t > 0 && (!L.hit || L.hit.on === 'out' || t < ray.origin.distanceTo(L.hit.p))) {
            if (!dot) dot = ray.at(t, new THREE.Vector3());
            const i = this.catPart;
            L.self = i === 0 || (i >= 10 && i <= 13) || i >= 16 ? 'rear' : (i >= 6 && i <= 9) || i === 14 || i === 15 ? 'front' : i >= 4 ? 'head' : 'side';
            L.selfAt.copy(ray.at(t, L.selfAt));
          }
        }
      }
      this.room.holdPointer(cam, dot, dt, this.safeBottom() / Math.max(1, innerHeight));
      if (L.idle > 45 && L.id < 0 && L.taking < 0 && L.downOn < 0) this.takeLaser(false);
    }
    this.stage.setLaser(dot);
    const h = L.hit;
    this.avatar.laser = dot && h && h.on !== 'cat' && h.on !== 'out'
      ? { p: h.p, n: h.n, on: h.on, mug: h.mug, self: L.self ?? undefined, selfAt: L.self ? L.selfAt : undefined }
      : dot && L.self ? { p: L.selfAt, n: new THREE.Vector3(0, 1, 0), on: 'floor', self: L.self, selfAt: L.selfAt } : null;
    // the sun thrown across the floor off a window across the way: drawn there, watched, and, if
    // the cat has a mind to, chased as a dot is (not while there is a red one)
    const G = this.room.glint;
    this.stage.setGlint(G ? G.p : null, G?.r, G?.k ?? 0);
    this.avatar.glint = G && G.k > 0.2 && !dot ? G.p : null;
    if (!this.avatar.laser && this.avatar.chasingGlint && G) this.avatar.laser = { p: G.p, n: new THREE.Vector3(0, 1, 0), on: 'floor' };
    if (dot && this.brain.mode !== 'sleep' && this.brain.mode !== 'doze') this.brain.toy(L.sx, L.sy - L.lift, dt);
    // (shone for a while at a cat fast asleep: that it can be woken)
    const asleep = this.brain.mode === 'sleep' || this.brain.mode === 'doze';
    this.shoneAsleep = dot && asleep && !this.avatar.hidden ? this.shoneAsleep + dt : 0;
    if (this.shoneAsleep > 3 && !this.state.hints.laserSleep) {
      this.state.hints.laserSleep = 1;
      this.hintUi.show('고양이가 자고 있어요. 화면을 톡톡 두드려 깨워 보세요', 5000);
    }
  }
  private shoneAsleep = 0;

  /** a finger moving the ball of wool: where it is (css px), and where the ball is from the
   *  point on the floor under it */
  private toyFinger: { x: number; y: number; off: THREE.Vector3 } | null = null;
  private toyWasPinned = false;
  /** the hint given for this time it is asking you for a game */
  private askHinted = false;
  /** the prints of a paw on the glass, drying (fresh 1 .. 0), and the mist of a breath on it */
  private prints: { at: THREE.Vector3; age: number; fresh: number; mist?: boolean }[] = [];
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

  /** in the native app (iOS, Android): the back button closes the credits, or puts the app away
   *  (the cat is not quit, only left); going to the background saves, as the page hiding does */
  private native() {
    if (!Capacitor.isNativePlatform()) return;
    void CapApp.addListener('backButton', () => {
      if (this.creditsOpen) this.showCredits(false);
      else void CapApp.minimizeApp();
    });
    // (if the page has not already been told)
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive !== this.visible) this.onVisibility(isActive);
    });
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

  private onVisibility(visible = !document.hidden) {
    if (visible === this.visible && this.visibleOnce) return;
    this.visibleOnce = true;
    this.visible = visible;
    if (!this.visible) {
      this.persist(true);
      this.audio.suspend();
      return;
    }
    void this.notifier.cancel();
    // (back to the room: its time with you counts from now, not from the last touch before you
    // went, or the first thing on coming back would be the cat asking for you over its welcome)
    this.nudgedAt = performance.now() / 1000;
    const now = Date.now();
    const gap = now - this.state.lastTick;
    const wasAway = this.state.where === 'away';
    const wasAlive = this.state.alive;
    stepLife(this.state, Math.max(0, gap), true);
    this.state.lastTick = now;
    this.audio.resume();
    if (gap > 90_000 || wasAway !== (this.state.where === 'away') || wasAlive !== this.state.alive) {
      this.state.stats.visits++;
      this.brain.wake(performance.now() / 1000, false, gap / 1000);
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
    // (Esc: the laser pointer put down, the credits shut)
    if (k === 'escape') {
      if (this.laser.held) this.takeLaser(false);
      if (this.creditsOpen) this.showCredits(false);
      return;
    }
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
  /** your side of the glass misted over (a cold morning, a wet day; or as asked, ?mist=0.8), and
   *  whether it has been settled to the hour yet */
  private readonly mistOverride = new URLSearchParams(location.search).get('mist');
  readonly glassFog = new GlassFog();
  private fogSettled = false;

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
    // pixel art wants no more than 60 frames a second, and a cat asleep, or sat or lying still
    // where it is, with nobody touching anything, no more than 30 (on a 120 Hz screen, every other
    // frame or three in four are let go): the phone stays cool and its battery lasts, left open on
    // a desk all evening
    const m = this.cat.motor;
    const still = this.brain.mode === 'sleep' || (m.speed < 0.02 && Math.abs(m.yawRate) < 0.15 && !m.goal);
    const calm = still && !this.headMoving && nowMs / 1000 - this.touchedAt > 3 && !this.input.touching && this.room.yarnSpeed < 0.01;
    // (and left a long while with nobody at it, the radio on, the screen kept on: an ambient
    // picture on a desk, gentler still)
    const idle = calm && nowMs / 1000 - this.inputAt > 180;
    if (this.last && nowMs - this.last < 1000 / (idle ? 20 : calm ? 30 : 60) - 3) return;
    // (kept up with, while there is something moving to draw?)
    if (this.last) this.keepUp(nowMs - this.last, this.visible && !this.manual && !calm);
    const dt = Math.min(0.05, this.last ? (nowMs - this.last) / 1000 : 0.016);
    this.last = nowMs;
    if (this.visible && !this.manual) this.tick(dt, nowMs / 1000);
    this.stage.render();
  }

  /** one step of the cat's life, mind and body (also driven by tests in fixed steps) */
  tick(dt: number, now: number) {
    stepLife(this.state, dt * 1000, false);
    // the radio on and the room left open and untouched a long while: the cat comes for a moment
    // of you (dozing, it wakes for it, with a stretch; deep asleep, not this time)
    if (this.audio.musicOn && this.visible && now - Math.max(this.inputAt, this.nudgedAt) > this.nudgeGap) {
      const was = this.brain.mode;
      if (this.brain.rouse()) {
        if (was === 'doze' || was === 'sleep') this.avatar.wakeStretch();
        this.avatar.nudgeNow();
      }
      this.nudgedAt = now;
      this.nudgeGap = (40 + Math.random() * 15) * 60;
    }
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
    // (a finger resting on the glass is there for the cat, moving or not)
    this.glassQuiet = Math.max(0, this.glassQuiet - dt);
    const resting = this.input.onGlass();
    if (resting.length) this.fingerOnGlass(resting[0].sx, resting[0].sy);
    this.avatar.music = this.audio.musicPlaying;
    this.avatar.update(dt);
    const landed = this.avatar.pawLanded;
    // (its cheek rubbed on the glass at your finger: felt, a soft bump each time)
    if (this.avatar.nuzzled) {
      this.haptic.tapSoon('light');
      this.audio.play('thump', { gain: 0.07, rate: 0.8, pan: this.catPan() });
    }
    // (keeping time with the radio, when it is in the mood)
    this.cat.motor.beat = this.avatar.groove > 0.01 ? this.avatar.groove * this.audio.beat() : 0;
    this.cat.update(dt);
    // (its teeth on your finger, gently: felt, a little firmer than a lick)
    if (this.cat.motor.nibbled) {
      this.cat.motor.nibbled = false;
      this.haptic.tapSoon('medium');
      if (this.avatar.doing !== 'trap') this.justNow.add('bite');
    }
    // (its hind feet raking your hand, caught in its trap: each kick felt, and heard, softly)
    if (this.cat.motor.kicked) {
      this.cat.motor.kicked = false;
      this.haptic.tapSoon('light');
      this.audio.play('step', { gain: 0.12, rate: 0.9 + 0.3 * Math.random(), pan: this.catPan() });
    }
    // (its tongue on your finger: each lick felt, a little rasp, and heard, hardly)
    if (this.cat.motor.lickLanded) {
      this.cat.motor.lickLanded = false;
      this.haptic.tapSoon('light');
      this.audio.play('lick', { gain: 0.16, pan: this.catPan() });
    }
    // (a paw patted at the glass where your finger is: felt under it, heard, softly, and its print
    // left on the glass where the paw is, to dry)
    if (landed) {
      this.haptic.tapSoon('light');
      this.audio.play('thump', { gain: 0.2, pan: this.catPan() });
      this.cat.group.updateMatrixWorld();
      this.prints.push({ at: this.cat.body.reached[landed].clone().applyMatrix4(this.cat.group.matrixWorld), age: 0, fresh: 1 });
      if (this.prints.length > 4) this.prints.shift();
    }
    // (its nose to the glass: a breath of mist there, gone in a moment)
    const breath = this.avatar.takeBreath();
    if (breath) {
      // (where the breath meets the glass: a little below the mouth)
      this.prints.push({ at: breath.setY(breath.y - 0.012), age: 0, fresh: 0, mist: true });
      if (this.prints.length > 4) this.prints.shift();
    }
    if (this.prints.length) {
      for (const P of this.prints) {
        P.age += dt;
        P.fresh = P.mist ? Math.min(1, P.age / 0.2) * Math.sqrt(1 - Math.min(1, P.age / 2.2)) : P.age < 2.5 ? 1 : 1 - (P.age - 2.5) / 5;
      }
      this.prints = this.prints.filter((P) => P.fresh > 0);
      this.stage.setPrints(this.prints);
    }
    this.brushYarn(dt);
    // the weather: now and then a few hours of rain (or as asked, ?rain=1)
    const rain = this.rainOverride !== null ? +this.rainOverride : rainAt(clock);
    // (the glass misting on your side: settled to the hour at once the first time, after that
    // creeping back over where a finger wiped it)
    this.glassFog.level = this.mistOverride !== null ? +this.mistOverride : fogOnGlass(clock, rain);
    if (!this.fogSettled) { this.glassFog.settle(); this.fogSettled = true; }
    this.glassFog.update(dt);
    this.stage.setFog(this.glassFog);
    const dl = this.room.update(s, hour, dt, rain, clock);
    this.stage.setDayLight(dl);
    // the whiskers in the light the face is in: dimmer after dark, warm while the lamp is lit;
    // asleep, they lie back along the cheeks; and on a head lying on its side they would be drawn
    // as scratches across the face
    this.cat.setWhiskerLight(0.62 - 0.2 * dark, dl.lamp > 0.5 ? 0.8 * dark : 0);
    this.cat.whiskers.mesh.visible = this.brain.mode !== 'sleep' && this.cat.headUp() > 0.55;
    // in the small hours, the lamp off, its open eyes shine in the dark
    this.cat.setEyeShine(dl.lamp > 0.5 ? 0 : dark);
    // ill, its coat goes dull (and after it has gone, grey)
    this.catDull += (this.avatar.desatTarget - this.catDull) * (1 - Math.exp(-dt * 0.5));
    this.stage.setCatDull(this.catDull);
    this.audio.setRain(rain);
    // a bird outside: the cat's ear goes to it, and if it is awake, a glance at the window
    if (this.audio.setOutside(dt, { day: 1 - dark, hour, month: clock.getMonth(), rain })) this.avatar.hear(this.room.windowMiddle);
    this.avatar.rain = rain;
    this.avatar.snow = this.room.snowing;
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
    this.stage.setSteam(this.room.mugUp ? this.room.mugTop : null, 1);
    this.stage.setMotes(this.room.dust(dt, (1 - dark) * (1 - rain)));
    // a moth round the lamp, a fly at the window: their wings a blur of up and down
    const bug = this.room.bugAt();
    this.stage.setBug(bug?.p ?? null, bug?.kind, bug ? !bug.resting && Math.sin(now * (bug.kind === 'moth' ? 38 : 70)) > 0 : false,
      this.bugLight.set(1, 1, 1).lerp(new THREE.Vector3(1.15, 0.95, 0.75), dark));
    // the radio: its dial lit and notes rising while it plays; slower and softer at night (and the
    // screen kept on while it does, the page in sight)
    this.stage.setNotes(this.room.setRadio(this.audio.musicPlaying, dt));
    this.awake.set(this.audio.musicPlaying && this.visible);
    this.audio.setNight(dark);
    this.stage.setTime(now);
    this.hints(dt, contacts.length > 0);
    this.firsts(dt);
    this.moveCamera(dt, contacts.length > 0);
    this.shineLaser(dt);
    // the feather wand in the hand: the tip after the finger (the view may have moved under it);
    // its string drawn; the feathers for the cat, dangled or lying where it fell
    const wf = this.wandFinger;
    if (wf) this.aimWand(wf.x, wf.y);
    const sl = this.room.stringLine();
    this.stage.setString(sl.a, sl.b, sl.sag * 0.6);
    this.avatar.wand = { p: this.room.lureAt(), v: this.room.lureVel, held: this.room.wandHeld, pinned: this.room.lurePinned };
    if (wf && this.room.lureVel.length() > 0.08) this.brain.toy(wf.x, wf.y, dt);
    if ((this.saveIn -= dt) < 0) {
      this.saveIn = 10;
      this.persist(false);
    }
  }

  private radioHintIn = 25;
  private mistHintIn = 8;
  private lampHintIn = 40;

  private hints(dt: number, touching: boolean) {
    const s = this.state;
    // the first present: what it is, and that you can throw it for the cat
    if (this.avatar.presenting && !s.hints.gift && !touching) {
      s.hints.gift = 1;
      this.hintUi.show('선물을 물어 왔어요. 장난감 쥐를 톡 치면 던져 줄 수 있어요', 6000);
      return;
    }
    // asking you for a game at the glass, the first times: how to play it (once each time)
    const asking = this.avatar.asking;
    if (asking && !this.askHinted && (s.hints.ask ?? 0) < 2 && !touching && !this.input.touching) {
      this.askHinted = true;
      s.hints.ask = (s.hints.ask ?? 0) + 1;
      this.hintUi.show('고양이가 놀자고 해요. 유리에 손가락을 대고 천천히 움직여 보세요', 6000);
      return;
    }
    if (!asking) this.askHinted = false;
    // the first time it plays with its ball of wool: that you can roll it too
    if (this.avatar.doing === 'play' && !s.hints.yarnDrag && !touching && !this.toyFinger) {
      s.hints.yarnDrag = 1;
      this.hintUi.show('털실 공을 손가락으로 끌어 보세요. 고양이가 쫓아올 거예요', 5000);
      return;
    }
    // the first time the glass mists over well enough to draw on: that you can
    if (this.glassFog.level > 0.35 && !s.hints.mist && !touching && !this.input.touching && (this.mistHintIn -= dt) < 0) {
      s.hints.mist = 1;
      this.hintUi.show('유리에 김이 서렸어요. 손가락으로 그림을 그려 보세요', 5500);
      return;
    }
    // once the radio has played a while: how to switch it off
    if (this.audio.musicPlaying && !s.hints.radio && !touching && (this.radioHintIn -= dt) < 0) {
      s.hints.radio = 1;
      this.hintUi.show('창가의 라디오를 톡 누르면 음악을 끄고 켤 수 있어요', 5000);
      return;
    }
    // at night, once the radio's hint has been and a while has gone by: that the lamp switches
    if (this.room.lampLitNow && Room.dark(this.clock().getHours() + this.clock().getMinutes() / 60) > 0.8 && s.hints.radio && !s.hints.lamp && !touching && !this.input.touching && (this.lampHintIn -= dt) < 0) {
      s.hints.lamp = 1;
      this.hintUi.show('스탠드를 톡 누르면 불을 끄고 켤 수 있어요', 5000);
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
        // (where a cat that hardly knows you likes a hand best: its head, its cheeks)
        this.hintUi.show('고양이 머리나 볼을 손가락으로 살며시 쓰다듬어 보세요', 5500);
      }
      return;
    }
    // once it has been stroked a while: its toys, one at a time, while it is awake and nobody is
    // doing anything (the laser pointer on the sill, then the feather wand on the floor)
    const awake = this.brain.mode === 'rest' || this.brain.mode === 'alert';
    // (twice each at most: after that, they are yours to find)
    const nudge = (k: string) => !s.hints[k] && (s.hints[k + 'Nudge'] ?? 0) < 2;
    if (s.alive && awake && !this.avatar.hidden && s.stats.petSeconds > 8 && !this.laser.held && !this.wandFinger && (nudge('laser') || nudge('wand'))) {
      if ((this.toyHintIn -= dt) < 0) {
        this.toyHintIn = 240;
        const k = nudge('laser') ? 'laser' : 'wand';
        s.hints[k + 'Nudge'] = (s.hints[k + 'Nudge'] ?? 0) + 1;
        this.hintUi.show(k === 'laser' ? '창턱의 레이저 포인터를 톡 눌러 보세요' : '바닥의 깃털 낚싯대를 잡고 흔들어 보세요', 5000);
      }
    }
  }
  private toyHintIn = 40;

  /** what it has just done that FIRSTS has a word for (gathered over the frame) */
  private justNow = new Set<string>();
  private loafFor = 0;

  /** the first time it does each of the things in FIRSTS, a word on what it means */
  private firsts(dt: number) {
    const a = this.avatar, m = this.cat.motor, mode = this.brain.mode;
    const now = this.justNow;
    const asleep = mode === 'sleep' || mode === 'doze', doing = a.doing, phase = a.doingPhase;
    if (m.moment) { now.add(m.moment); m.moment = null; }
    if (m.slowBlinking && !asleep) now.add('blink');
    if (this.brain.purr > 0.45 && !asleep) now.add('purr');
    if (this.brain.purr > 0.3 && asleep) now.add('sleeppurr');
    if (a.kneading || doing === 'knead') now.add('knead');
    if (a.nuzzled) now.add('rub');
    if (m.posture === 'back' && asleep) now.add('back');
    if (doing === 'greet') now.add('greet');
    if (m.lipUpNow > 0.7) now.add('flehmen');
    // (at it, not on its way there)
    if (doing === 'claw' && (phase === 'rake' || phase === 'pull')) now.add('claw');
    if (doing === 'rub' && phase === 'rub') now.add('bunt');
    if (doing === 'stare') now.add('stare');
    if (doing === 'zoomies') now.add('zoomies');
    if (doing === 'snub') now.add('snub');
    if (doing === 'trap') now.add('trap');
    if (Math.abs(m.tilt) > 0.25) now.add('tilt');
    if (m.blep > 0.9 && !asleep) now.add('blep');
    // (a loaf: lying with its paws tucked under, awake and easy, a good while)
    this.loafFor = m.posture === 'loaf' && !asleep && !doing && m.speed < 0.02 ? this.loafFor + dt : 0;
    if (this.loafFor > 20) now.add('loaf');
    this.firstWords.update(dt, now, this.state.alive && !a.hidden && this.visible);
    now.clear();
  }
}

function localStorageHas() {
  try {
    return !!localStorage.getItem('cat-window.v1');
  } catch {
    return false;
  }
}
