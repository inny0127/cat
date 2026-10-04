import * as THREE from 'three';
import { loadCatAsset, buildSkeleton, type CatAsset } from './load';
import { makeFurMaterials, NCAPS } from './fur';
import { makeSkinMaterial } from './skin';
import { makeStrands } from './strands';
import { makeEye, setLids, type CatEye } from './eye';
import { makeWhiskers, type Whiskers } from './whiskers';
import { makeTongue, poseTongue, type Tongue } from './tongue';
import { Kin } from './kin';
import { Body } from './body';
import { Tail } from './tail';
import { Stepper } from './stepper';
import { Motor } from './motor';
import { LEGS, POSES, SHOW_TURN, type Leg, type PoseName } from './pose';

export interface CatOptions {
  shells?: number;
  density?: number;
  /** how many guard hairs to draw (0: none; default all in the asset) */
  strands?: number;
}

const v = () => new THREE.Vector3();

type Cap = [string, [number, number, number], string, [number, number, number], number];
/** body parts as capsules (bone, offset, bone, offset, radius) for ambient occlusion */
const CAPS: Cap[] = [
  ['hips', [0, -0.01, -0.01], 'spine1', [0, -0.012, 0], 0.048],
  ['spine1', [0, -0.012, 0], 'spine2', [0, -0.018, 0], 0.05],
  ['spine2', [0, -0.018, 0], 'chest', [0, -0.026, 0], 0.055],
  ['chest', [0, -0.026, 0.01], 'neck1', [0, -0.012, 0], 0.044],
  ['neck1', [0, 0, 0], 'head', [0, 0.004, 0.0], 0.03],
  // inscribed in the skull and muzzle: an occluder must never poke out of the body it stands for
  ['head', [0, 0.018, 0.02], 'head', [0, 0.004, 0.058], 0.024],
  ['armL', [0, 0, 0], 'foreL', [0, 0, 0], 0.021], ['foreL', [0, 0, 0], 'wristL', [0, 0, 0], 0.014],
  ['armR', [0, 0, 0], 'foreR', [0, 0, 0], 0.021], ['foreR', [0, 0, 0], 'wristR', [0, 0, 0], 0.014],
  ['thighL', [0, -0.02, 0.012], 'shinL', [0, 0, 0], 0.03], ['shinL', [0, 0, 0], 'hockL', [0, 0, 0], 0.016],
  ['thighR', [0, -0.02, 0.012], 'shinR', [0, 0, 0], 0.03], ['shinR', [0, 0, 0], 'hockR', [0, 0, 0], 0.016],
  ['wristL', [0, 0, 0], 'handL', [0, -0.002, 0.02], 0.013], ['wristR', [0, 0, 0], 'handR', [0, -0.002, 0.02], 0.013],
  ['hockL', [0, 0, 0], 'footL', [0, -0.002, 0.022], 0.013], ['hockR', [0, 0, 0], 'footR', [0, -0.002, 0.022], 0.013],
  ['tail0', [0, 0, 0], 'tail4', [0, 0, 0], 0.016], ['tail4', [0, 0, 0], 'tail9', [0, 0, 0], 0.012],
];
/** the capsules before the tail's own two */
const TRUNK_CAPS = CAPS.length - 2;

/**
 * The whole 3D cat: furred skinned body, eyes, whiskers, and the motor/body/tail/stepper chain
 * that moves it. Put `group` in a scene, call update(dt) every frame.
 */
export class Cat3D {
  readonly group = new THREE.Group();
  readonly motor = new Motor();
  readonly stepper = new Stepper();
  readonly kin: Kin;
  readonly body: Body;
  readonly tail: Tail;
  readonly bones: THREE.Bone[];
  readonly byName: Map<string, THREE.Bone>;
  readonly shared: ReturnType<typeof makeFurMaterials>['shared'];
  readonly eyes: CatEye[] = [];
  readonly whiskers: Whiskers;
  readonly meshes: THREE.SkinnedMesh[] = [];
  /** the painted coat's material, for a painted model */
  private skin: THREE.ShaderMaterial | null = null;
  /** the model's attribution, as its licence asks */
  credit: string | null = null;
  /** its coat in flat material colours, for pixel art */
  private pixTexture: THREE.Texture | null = null;
  private painted: THREE.Texture | null = null;
  private readonly homeM: Record<Leg, THREE.Vector3> = { LF: v(), RF: v(), LH: v(), RH: v() };
  private readonly homeW: Record<Leg, THREE.Vector3> = { LF: v(), RF: v(), LH: v(), RH: v() };
  private readonly targ: Record<Leg, THREE.Vector3> = { LF: v(), RF: v(), LH: v(), RH: v() };
  private readonly planted = { LF: 1, RF: 1, LH: 1, RH: 1 };
  private readonly reachW = { LF: 0, RF: 0, LH: 0, RH: 0 };
  private readonly need = { hind: 0, front: 0 };
  private readonly drop = { hind: 0, front: 0 };
  private readonly flex = { LF: 0, RF: 0, LH: 0, RH: 0 };
  private readonly ground = { LF: 1, RF: 1, LH: 1, RH: 1 };
  private first = true;
  private readonly inv = new THREE.Matrix4();
  private readonly tmp = { a: v(), b: v(), q: new THREE.Quaternion() };
  /** the eyeball's radius (m) */
  private eyeRadius = 0.007;
  private breathT = 0;
  private readonly corrPoses: string[];
  strandUniforms: { uPx: { value: number }; uStrandWidth: { value: number }; uStrandLen: { value: number }; uStrandAlpha: { value: number } } | null = null;

  static async load(url: string, opts: CatOptions = {}) {
    return new Cat3D(await loadCatAsset(url), opts);
  }

  constructor(asset: CatAsset, opts: CatOptions) {
    const { skeleton, root, byName } = buildSkeleton(asset.bones);
    this.bones = skeleton.bones;
    this.byName = byName;
    this.kin = new Kin(asset.bones);
    this.body = new Body(this.kin);
    this.tail = new Tail(this.kin, this.kin.i('hips'));
    this.group.add(root);

    // a model with its own painted coat is drawn as one textured surface instead of fur
    const painted = asset.texture;
    this.painted = painted;
    this.credit = asset.credit;
    const shells = painted ? 1 : opts.shells ?? 24;
    const LMa = asset.landmarks;
    const { mats, shared, defines } = makeFurMaterials({ shells, density: opts.density ?? 2400 }, { ...LMa, head: LMa.head }, asset.correctives);
    this.corrPoses = asset.correctives?.poses ?? [];
    this.shared = shared;
    let skin: THREE.ShaderMaterial | null = null;
    if (painted) {
      skin = makeSkinMaterial(painted, shared as unknown as Record<string, { value: unknown }>, asset.bones, asset.pixTexture);
      this.pixTexture = asset.pixTexture;
      this.skin = skin;
      for (const geo of Object.values(asset.meshes)) {
        const m = new THREE.SkinnedMesh(geo, skin);
        m.bind(skeleton, new THREE.Matrix4());
        m.frustumCulled = false;
        m.castShadow = true;
        this.group.add(m);
        this.meshes.push(m);
      }
    }
    for (const [name, geo] of painted ? [] : Object.entries(asset.meshes)) {
      const n = name === 'body' ? shells : Math.max(4, Math.round(shells / 2));
      for (let i = 0; i < n; i++) {
        const m = new THREE.SkinnedMesh(geo, name === 'body' ? mats[i] : mats[Math.round((i / Math.max(1, n - 1)) * (shells - 1))]);
        m.bind(skeleton, new THREE.Matrix4());
        m.frustumCulled = false;
        m.castShadow = i === 0 && name === 'body';
        m.renderOrder = i;
        this.group.add(m);
        this.meshes.push(m);
      }
    }
    // guard hairs, one by one, over the shell coat
    if (!painted && asset.strands && opts.strands !== 0) {
      const st = makeStrands(asset.strands, shared as unknown as Record<string, { value: unknown }>, defines);
      if (opts.strands) st.geometry.instanceCount = Math.min(opts.strands, asset.strands.count);
      const m = new THREE.SkinnedMesh(st.geometry, st.material);
      m.bind(skeleton, new THREE.Matrix4());
      m.frustumCulled = false;
      m.renderOrder = shells + 1;
      this.group.add(m);
      this.strandUniforms = st.uniforms;
    }
    // eyes in the sockets and whiskers on the pads ride on the head bone
    const head = byName.get('head')!;
    const headRest = new THREE.Vector3(...asset.bones.find((b) => b.name === 'head')!.pos);
    const LM = asset.landmarks;
    this.eyeRadius = LM.eyeRadius;
    const v3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
    for (const [p, x, eu] of [[LM.eyeL, 1, LM.eyeEulerL], [LM.eyeR, -1, LM.eyeEulerR]] as const) {
      const e = makeEye(LM.eyeRadius, x, shared);
      if (LM.lidScale) {
        // plain sockets: the eye draws its lids itself, in the skin round it
        e.eyeMat.uniforms.uOwnLids.value = 1;
        e.eyeMat.uniforms.uLidScale.value.set(LM.lidScale[0], LM.lidScale[1]);
        if (LM.lidCol) e.eyeMat.uniforms.uLidCol.value.setRGB(LM.lidCol[0], LM.lidCol[1], LM.lidCol[2], THREE.SRGBColorSpace);
        const uv = x > 0 ? LM.lidUVL : LM.lidUVR;
        if (painted && skin && uv) {
          const u = e.eyeMat.uniforms;
          u.uLidMap.value = painted;
          u.uLidU.value.set(uv[0], uv[1], uv[2]);
          u.uLidV.value.set(uv[3], uv[4], uv[5]);
          u.uLidTex.value = 1;
          // the same grade as the coat, so a shut lid is the fur round it
          u.uSolidGain = skin.uniforms.uSolidGain;
          u.uSolidSat = skin.uniforms.uSolidSat;
        }
      }
      e.group.position.copy(v3(p).sub(headRest));
      e.group.rotation.set(eu[0], eu[1], eu[2]);
      head.add(e.group);
      const toEye = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(e.group.rotation)).transpose();
      (x > 0 ? shared.uEyeCL : shared.uEyeCR).value.copy(v3(p));
      (x > 0 ? shared.uEyeML : shared.uEyeMR).value.copy(toEye);
      setLids(e, shared.uLids.value, 1, 0);
      this.eyes.push(e);
    }
    // the point between the eyes, which the head aims when it looks at something
    this.body.eyeOffset.copy(v3(LM.eyeL)).add(v3(LM.eyeR)).multiplyScalar(0.5).sub(headRest);
    this.whiskers = makeWhiskers(v3(LM.padL), v3(LM.padR), v3(LM.eyeL), v3(LM.eyeR));
    this.whiskers.mesh.position.copy(headRest).negate();
    head.add(this.whiskers.mesh);
    // the tongue, on the jaw: its root back on the floor of the mouth, a little behind the lips
    const jaw = byName.get('jaw');
    const jawDef = asset.bones.find((b) => b.name === 'jaw');
    if (jaw && jawDef) {
      const nose = v3(LM.nose);
      this.tongue = makeTongue(new THREE.Vector3(0, nose.y - 0.0182, nose.z - 0.031), v3(jawDef.pos), shared as unknown as Record<string, { value: unknown }>);
      jaw.add(this.tongue.mesh);
    }
  }

  /** its tongue (on the jaw), if the model has a jaw */
  tongue: Tongue | null = null;

  /** a sigh: the next breath slow and deep */
  private sighT = -1;
  sigh() {
    this.sighT = 0;
  }

  /** one eye opened a little in its sleep (how far, and which: 0 the left, 1 the right) */
  peek = 0;
  peekEye = 0;

  /** how upright the head is: 1 level, 0 lying on its side, below 0 upside down */
  headUp() {
    return this.tmp.b.set(0, 1, 0).applyQuaternion(this.body.kin.wq[this.body.I.head]).y;
  }

  private readonly prints = new Map<string, { x: number; z: number; face: number }>();

  /**
   * Where the body's middle lies in a posture, and which way the face points, in the cat's own
   * frame (x to its left, z ahead of where it stood; the face as a heading, 0 straight ahead):
   * curled up, a cat lies well off to one side of where it stood, with its nose back by its tail.
   * Measured once, by holding each posture a moment. (The heading has the posture's SHOW_TURN in
   * it: put the "face" toward you and it lies with its best side to you.)
   */
  footprint(posture: PoseName) {
    if (!this.prints.size) {
      const { pos, yaw } = this.motor, keep = this.motor.posture;
      const x = pos.x, z = pos.z;
      const mesh = this.meshes[0], k = this.body.kin, head = this.body.I.head;
      const c = new THREE.Vector3(), f = new THREE.Vector3();
      for (const name of Object.keys(POSES) as PoseName[]) {
        this.place(0, 0, 0);
        this.snap(name);
        this.update(1 / 60);
        this.update(1 / 60);
        mesh.computeBoundingBox();
        mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld).getCenter(c);
        f.set(0, 0, 1).applyQuaternion(k.wq[head]);
        this.prints.set(name, { x: c.x, z: c.z, face: Math.atan2(f.x, f.z) + (SHOW_TURN[name] ?? 0) });
      }
      this.place(x, z, yaw);
      this.snap(keep);
      this.update(1 / 60);
    }
    return this.prints.get(posture)!;
  }

  /** place the cat (and its paws) without walking there */
  place(x: number, z: number, yaw: number) {
    this.motor.pos.set(x, 0, z);
    this.motor.yaw = yaw;
    this.first = true;
    this.tail.reset();
  }

  /** jump into a posture with the paws already where it wants them */
  snap(name: Parameters<Motor['snap']>[0]) {
    this.motor.snap(name);
    this.first = true;
    this.tail.reset();
  }

  /** how big the head is drawn (the ears, the eyes and the jaw with it) */
  headScale = 1;

  /** pixel art: flat coat colour, flat eyes, no whiskers (finer than an art pixel); the lids show
   *  the coat's materials as the coat does. And the head a little larger, as a pixel artist draws
   *  a cat: at a few dozen pixels across, the face is what has to read, its eyes a pixel or two
   *  more each way */
  setPixelArt(on: boolean) {
    this.shared.uSolid.value = on ? 1 : 0;
    this.headScale = on ? 1.15 : 1;
    for (const e of this.eyes) {
      e.eyeMat.uniforms.uFlat.value = on ? 1 : 0;
      // (drawn a few art pixels across, the eyes are made a little bigger, as a pixel artist would
      // draw them: room for the iris, the pupil and the light in them, not a squint)
      e.group.scale.setScalar(on ? 1.3 : 1);
      if (this.pixTexture && e.eyeMat.uniforms.uLidTex.value > 0.5) e.eyeMat.uniforms.uLidMap.value = on ? this.pixTexture : this.painted;
    }
    this.whiskers.setPixelArt(on);
  }

  /** how bright the whiskers are drawn in pixel art (0 .. 1): as the room's light goes down, they
   *  go down with it, rather than glow */
  setWhiskerLight(light: number, lamp = 0) {
    this.whiskers.setPixelArt(this.shared.uSolid.value > 0.5, light, lamp);
  }

  /** how much the skin of its back twitches (0 .. 1: under a hand it has had about enough of) */
  ripple = 0;
  private rippleAt = -1;
  private rippleIn = 0;

  /** how dark it is round the cat (0 .. 1): in the dark its eyes shine (pixel art) */
  setEyeShine(dark: number) {
    for (const e of this.eyes) e.eyeMat.uniforms.uTapetum.value = dark;
  }

  /** the camera's pixel size, for the whiskers */
  setPixel(px: number, eye?: THREE.Vector3) {
    this.whiskers.setPixel(px);
    if (this.strandUniforms) this.strandUniforms.uPx.value = px;
    // the eyes' highlight about an art pixel at least, wherever the cat is
    if (eye) {
      for (const e of this.eyes) {
        const at = e.group.getWorldPosition(this.tmp.a);
        const world = px * eye.distanceTo(at);
        e.eyeMat.uniforms.uGlint.value = Math.max(0.12, (0.55 * world) / this.eyeRadius);
      }
    }
  }

  /** the height of the floor at a point (a bed's cushion and rim), if it is not flat */
  groundAt: ((x: number, z: number) => number) | null = null;
  /** up on something (the windowsill): the floor is this high under every paw */
  perch: number | null = null;
  /** in the air (a jump): the body exactly this high, whatever is under it */
  liftHold: number | null = null;
  private lift = 0;

  update(dt: number) {
    const { motor, body, kin, stepper, group, tmp } = this;
    motor.gaitPhase = stepper.phase;
    motor.gait = stepper.signals;
    motor.update(dt);
    const p = motor.pose;

    // over a raised floor (a bed's cushion) the whole cat stands or lies that much higher: from
    // the floor under its planted paws, or under its middle when lying
    const perch = this.perch;
    const ground = perch !== null ? () => perch : this.groundAt;
    if (this.liftHold !== null) {
      this.lift = this.liftHold;
      stepper.ground = ground;
      stepper.lift = this.lift;
    } else if (ground) {
      let sum = 0, n = 0;
      for (const l of LEGS) {
        if (!this.planted[l]) continue;
        const F = stepper.feet[l];
        sum += ground(F.pos.x, F.pos.z);
        n++;
      }
      const want = perch !== null ? perch : n >= 2 ? sum / n : 0.8 * ground(motor.pos.x, motor.pos.z);
      this.lift += (want - this.lift) * (1 - Math.exp(-dt * 6));
      stepper.ground = ground;
      stepper.lift = this.lift;
    }
    group.position.copy(motor.pos);
    group.position.y += this.lift;
    group.rotation.set(0, motor.yaw, 0);
    group.updateMatrixWorld(true);
    this.shared.uGround.value = group.position.y;
    this.inv.copy(group.matrixWorld).invert();

    body.trunk(p);
    // never through the floor: lift the whole trunk if any part of it would go under
    const lift = body.floorLift();
    if (lift > 0) {
      p.hipY += lift;
      body.trunk(p);
    }
    if (motor.lookW > 0.01) {
      const target = tmp.a.copy(motor.gaze).applyMatrix4(this.inv);
      body.look(target, motor.lookW, p.headRoll);
    }
    // paws: where the pose wants them, then the stepper's say for planted ones
    for (const l of LEGS) {
      body.footTarget(p, l, this.homeM[l]);
      this.homeW[l].copy(this.homeM[l]).applyMatrix4(group.matrixWorld);
      this.planted[l] = p[l].planted >= 0.98 ? 1 : 0;
    }
    if (this.first) {
      stepper.reset(this.homeW);
      this.first = false;
    }
    // (tearing about, it bounds whenever it is going at any pace, round the turns too)
    stepper.eager = motor.zoom > 0.5;
    stepper.update(dt, this.homeW, this.planted, motor.vel, motor.yawRate, motor.pos, motor.yaw, motor.goal ? motor.wantSpeed : 0);
    body.scapLift.L = stepper.signals.scapL;
    body.scapLift.R = stepper.signals.scapR;
    for (const l of LEGS) {
      const F = stepper.feet[l];
      this.targ[l].copy(F.pos).applyMatrix4(this.inv);
      // (a paw held up off the floor may be bent back, its pads turned to what it reaches for)
      this.flex[l] = F.stepping ? F.flex : p[l].flex < 0 ? p[l].flex * (1 - p[l].planted) : Math.max(p[l].flex, F.flex);
      this.ground[l] = p[l].planted;
      // legs on the floor, and those coming down to it, must reach their paws
      this.reachW[l] = this.planted[l] ? (F.stepping ? Math.max(0, (F.s - 0.6) / 0.4) : 1) : 0;
    }
    // sink between the legs where they could not: the body rises and falls through the stride
    // from its own legs (quick to come down, easing back up)
    const need = body.reachDrop(this.targ, this.reachW, this.need);
    const ka = 1 - Math.exp(-dt * 30), kr = 1 - Math.exp(-dt * 8);
    this.drop.hind += (need.hind - this.drop.hind) * (need.hind > this.drop.hind ? ka : kr);
    this.drop.front += (need.front - this.drop.front) * (need.front > this.drop.front ? ka : kr);
    if (this.drop.hind > 1e-4 || this.drop.front > 1e-4) {
      p.hipY -= this.drop.hind;
      // the shoulders come down by tipping the spine, the head keeping its line
      const tip = (this.drop.front - this.drop.hind) / 0.26;
      p.chestPitch -= tip;
      p.neckPitch += tip;
      body.trunk(p);
      if (motor.lookW > 0.01) body.look(tmp.a.copy(motor.gaze).applyMatrix4(this.inv), motor.lookW, p.headRoll);
    }
    body.legsTo(p, this.targ, this.flex, this.ground);
    body.face(p, motor.twitch);
    for (let i = 0; i < this.tail.n; i++) this.tail.wave[i] = motor.tailWaveAt(i, this.tail.n);
    // body capsules first: the tail lies against them
    this.updateCaps();
    this.tail.update(dt, p, tmp.q.setFromEuler(group.rotation), group.position, 0, this.shared.uCaps.value, TRUNK_CAPS);
    this.updateCaps();
    kin.apply(this.bones);
    // its middle, where the room's light on the cat as a whole is taken (roomlight.ts)
    const mid = tmp.a.copy(kin.wp[kin.i('spine2')]).applyMatrix4(group.matrixWorld);
    const S = this.shared.uSubject.value;
    S.x = mid.x; S.y = mid.y; S.z = mid.z;
    this.byName.get('head')!.scale.setScalar(this.headScale);

    // face: the posture's own, moved by what the cat feels (mood.ts); a posture with the eyes
    // shut (asleep) keeps them shut
    const ey = motor.eyes;
    const c01 = (x: number) => Math.max(0, Math.min(1, x));
    const open = c01(p.eyeOpen + ey.open * Math.min(1, p.eyeOpen / 0.6)) * (1 - motor.blink);
    // (narrowed with pleasure, not annoyance: the eyes smile; and a slow blink, a cat's smile at
    // you, closes them in an arch too)
    const md = motor.mood;
    const smile = Math.max(c01((md.pleasure - 0.15) / 0.5) * (1 - c01(md.irritation * 2.5)) * (1 - md.fear), motor.slowBlinking ? motor.blink : 0);
    for (let i = 0; i < this.eyes.length; i++) {
      const e = this.eyes[i];
      // (asleep, one eye a little open to see what you are up to)
      setLids(e, this.shared.uLids.value, i === this.peekEye ? Math.max(open, this.peek * (1 - motor.blink)) : open, c01(p.squint + ey.squint), smile);
      e.eyeMat.uniforms.uPupil.value = c01(p.pupil + ey.pupil);
      e.eyeMat.uniforms.uShine.value = ey.shine;
    }
    this.aimEyes();
    this.whiskers.setSpread(p.whisker);
    // how much of each sculpted posture the body is in
    const cw = this.shared.uCorrW.value;
    cw.fill(0);
    for (const [name, wgt] of motor.postureWeights()) {
      const k = this.corrPoses.indexOf(name);
      if (k >= 0) cw[k] += wgt;
    }
    // (a sigh: one breath slower and deeper than the rest, in, and a long way out)
    const sg = this.sighT >= 0 ? Math.sin(Math.PI * Math.min(1, this.sighT / 3.2)) : 0;
    if (this.sighT >= 0 && (this.sighT += dt) > 3.2) this.sighT = -1;
    this.breathT += dt * (0.55 + 0.25 * (1 - p.breath)) * Math.max(0.3, motor.feel.breathRate) * (1 - 0.55 * sg);
    this.shared.uBreath.value = 0.0022 * p.breath * (1 + 1.6 * sg) * Math.sin(this.breathT * Math.PI * 2);
    this.shared.uPuff.value = p.puff;
    // the skin of its back twitching, overstimulated: a wave back along it every second or so
    // while it lasts, quick, a few millimetres high
    if (this.rippleAt < 0 && this.ripple > 0.05 && (this.rippleIn -= dt) <= 0) {
      this.rippleAt = 0;
      this.rippleIn = 0.4 + Math.random() * (1.2 - 0.6 * this.ripple);
    }
    if (this.rippleAt >= 0 && (this.rippleAt += dt / 0.32) > 1.3) this.rippleAt = -1;
    this.shared.uRipple.value = this.rippleAt >= 0 ? 0.0065 * Math.min(1, 0.4 + this.ripple) : 0;
    this.shared.uRippleAt.value = Math.max(0, this.rippleAt);
    if (this.tongue) poseTongue(this.tongue, p.tongue, p.tongueUp);
    if (this.skin) {
      this.skin.uniforms.uJawOpen.value = p.jaw;
      this.skin.uniforms.uSnarl.value = Math.max(motor.feel.snarl, motor.hissNow);
    }
  }

  /** world-space capsules round the body for the fur's and the floor's ambient occlusion */
  private updateCaps() {
    const { kin } = this;
    const caps = this.shared.uCaps.value;
    const M = this.group.matrixWorld;
    const a = this.tmp.a, b = this.tmp.b;
    for (let i = 0; i < Math.min(NCAPS, CAPS.length); i++) {
      const [b0, o0, b1, o1, r] = CAPS[i];
      const i0 = kin.i(b0), i1 = kin.i(b1);
      a.set(o0[0], o0[1], o0[2]).applyQuaternion(kin.wq[i0]).add(kin.wp[i0]).applyMatrix4(M);
      b.set(o1[0], o1[1], o1[2]).applyQuaternion(kin.wq[i1]).add(kin.wp[i1]).applyMatrix4(M);
      caps[2 * i].set(a.x, a.y, a.z, r);
      caps[2 * i + 1].set(b.x, b.y, b.z, 0);
    }
  }

  /** eyeballs turn toward the gaze point inside their lids */
  private aimEyes() {
    const g = this.motor.gaze;
    const w = this.tmp.b;
    for (const e of this.eyes) {
      e.group.updateWorldMatrix(true, false);
      const local = w.copy(g).applyMatrix4(this.tmp2.copy(e.group.matrixWorld).invert());
      const yaw = Math.max(-0.45, Math.min(0.45, Math.atan2(local.x, local.z)));
      const pitch = Math.max(-0.35, Math.min(0.35, Math.atan2(local.y, Math.hypot(local.x, local.z))));
      const k = this.motor.lookW > 0.05 ? 1 : 0.3;
      e.ball.rotation.set(-pitch * k, yaw * k, 0);
      // lid shading is worked out in the lid's frame, which the ball turns within
      e.eyeMat.uniforms.uGaze.value.setFromMatrix4(this.tmp3.makeRotationFromEuler(e.ball.rotation));
    }
  }
  private readonly tmp2 = new THREE.Matrix4();
  private readonly tmp3 = new THREE.Matrix4();
}
