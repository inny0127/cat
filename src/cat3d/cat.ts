import * as THREE from 'three';
import { loadCatAsset, buildSkeleton, type CatAsset } from './load';
import { makeFurMaterials, NCAPS } from './fur';
import { makeSkinMaterial } from './skin';
import { makeStrands } from './strands';
import { makeEye, setLids, type CatEye } from './eye';
import { makeWhiskers, type Whiskers } from './whiskers';
import { Kin } from './kin';
import { Body } from './body';
import { Tail } from './tail';
import { Stepper } from './stepper';
import { Motor } from './motor';
import { LEGS, type Leg } from './pose';

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
  private readonly homeM: Record<Leg, THREE.Vector3> = { LF: v(), RF: v(), LH: v(), RH: v() };
  private readonly homeW: Record<Leg, THREE.Vector3> = { LF: v(), RF: v(), LH: v(), RH: v() };
  private readonly targ: Record<Leg, THREE.Vector3> = { LF: v(), RF: v(), LH: v(), RH: v() };
  private readonly planted = { LF: 1, RF: 1, LH: 1, RH: 1 };
  private readonly flex = { LF: 0, RF: 0, LH: 0, RH: 0 };
  private readonly ground = { LF: 1, RF: 1, LH: 1, RH: 1 };
  private first = true;
  private readonly inv = new THREE.Matrix4();
  private readonly tmp = { a: v(), b: v(), q: new THREE.Quaternion() };
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
    const shells = painted ? 1 : opts.shells ?? 24;
    const LMa = asset.landmarks;
    const { mats, shared, defines } = makeFurMaterials({ shells, density: opts.density ?? 2400 }, { ...LMa, head: LMa.head }, asset.correctives);
    this.corrPoses = asset.correctives?.poses ?? [];
    this.shared = shared;
    let skin: THREE.ShaderMaterial | null = null;
    if (painted) {
      skin = makeSkinMaterial(painted, shared as unknown as Record<string, { value: unknown }>, asset.bones);
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

  /** pixel art: flat coat colour, flat eyes, no whiskers (finer than an art pixel) */
  setPixelArt(on: boolean) {
    this.shared.uSolid.value = on ? 1 : 0;
    for (const e of this.eyes) e.eyeMat.uniforms.uFlat.value = on ? 1 : 0;
    this.whiskers.mesh.visible = !on;
  }

  /** the camera's pixel size, for the whiskers */
  setPixel(px: number) {
    this.whiskers.setPixel(px);
    if (this.strandUniforms) this.strandUniforms.uPx.value = px;
  }

  update(dt: number) {
    const { motor, body, kin, stepper, group, tmp } = this;
    motor.gaitPhase = stepper.phase;
    motor.update(dt);
    const p = motor.pose;

    group.position.copy(motor.pos);
    group.rotation.set(0, motor.yaw, 0);
    group.updateMatrixWorld(true);
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
    stepper.update(dt, this.homeW, this.planted, motor.vel, motor.yawRate, motor.pos);
    for (const l of LEGS) {
      this.targ[l].copy(stepper.feet[l].pos).applyMatrix4(this.inv);
      this.flex[l] = Math.max(p[l].flex, stepper.feet[l].flex);
      this.ground[l] = p[l].planted;
    }
    body.legsTo(p, this.targ, this.flex, this.ground);
    body.face(p, motor.twitch);
    for (let i = 0; i < this.tail.n; i++) this.tail.wave[i] = motor.tailWaveAt(i, this.tail.n);
    // body capsules first: the tail lies against them
    this.updateCaps();
    this.tail.update(dt, p, tmp.q.setFromEuler(group.rotation), group.position, 0, this.shared.uCaps.value, TRUNK_CAPS);
    this.updateCaps();
    kin.apply(this.bones);

    // face: the posture's own, moved by what the cat feels (mood.ts); a posture with the eyes
    // shut (asleep) keeps them shut
    const ey = motor.eyes;
    const c01 = (x: number) => Math.max(0, Math.min(1, x));
    const open = c01(p.eyeOpen + ey.open * Math.min(1, p.eyeOpen / 0.6)) * (1 - motor.blink);
    for (const e of this.eyes) {
      setLids(e, this.shared.uLids.value, open, c01(p.squint + ey.squint));
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
    this.breathT += dt * (0.55 + 0.25 * (1 - p.breath)) * Math.max(0.3, motor.feel.breathRate);
    this.shared.uBreath.value = 0.0022 * p.breath * Math.sin(this.breathT * Math.PI * 2);
    this.shared.uPuff.value = p.puff;
    if (this.skin) this.skin.uniforms.uJawOpen.value = p.jaw;
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
