import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Cat } from './cat';
import type { Coat } from './coats';

/** how long a catch is held under the paws (s) */
const PIN = 0.75;

/**
 * Your own front paws, at the bottom of the view: ginger forelegs, white socks, pink beans. They
 * step as you walk (one, then the other), tread as the haunches wiggle, reach out together in a
 * pounce, and one sweeps across, claws out, in a swat. Drawn in a scene of their own, over the room
 * (never into a wall), lit about as the room is.
 */
export class Paws {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(62, 1, 0.005, 2);
  private readonly L: THREE.Group;
  private readonly R: THREE.Group;
  private readonly claws: THREE.Object3D[] = [];
  private readonly light = new THREE.HemisphereLight(0xb8c4ff, 0x302838, 1.6);
  private readonly key = new THREE.DirectionalLight(0xffe0c0, 1.4);
  /** what is held in the mouth (a mouse), shown under the nose */
  readonly mouth = new THREE.Group();
  /** a moth or a cricket just caught, pinned under both paws a moment (then gone in a gulp) */
  private readonly pinned = new THREE.Group();
  private pinAt = -1e9;
  /** each leg's own materials (a calico's differ side to side), the beans' */
  private readonly mats: { fur: THREE.MeshLambertMaterial; stripe: THREE.MeshLambertMaterial; sock: THREE.MeshLambertMaterial; rings: THREE.Object3D[] }[] = [];
  private readonly bean = new THREE.MeshLambertMaterial({ color: 0xf2a0aa, flatShading: true });
  /** whiskers, at the corners of the eye: swept back at ease, forward when it means business */
  private readonly whiskers = new THREE.Group();
  private readonly whiskerMat = new THREE.LineBasicMaterial({ color: 0xf4f0e8, transparent: true, opacity: 0.6 });
  private whiskerFwd = 0;

  constructor() {
    this.scene.add(this.light, this.key);
    this.key.position.set(0.3, 1, 0.4);
    const bean = this.bean;
    const claw = new THREE.MeshLambertMaterial({ color: 0xffffff });
    // (each piece placed, then the pieces of a colour merged: a few draws a leg, not a dozen)
    const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(sx, sy, sz)));
    const leg = (side: number) => {
      const g = new THREE.Group();
      const fur = new THREE.MeshLambertMaterial({ color: 0xe0913f, flatShading: true });
      const stripe = new THREE.MeshLambertMaterial({ color: 0xb8662a, flatShading: true });
      const sock = new THREE.MeshLambertMaterial({ color: 0xfaf3ea, flatShading: true });
      g.add(new THREE.Mesh(at(new THREE.CylinderGeometry(0.016, 0.019, 0.12, 8), 0, 0, 0.065, Math.PI / 2), fur));
      const rings = new THREE.Mesh(mergeGeometries([0, 1, 2].map((i) => at(new THREE.TorusGeometry(0.0205, 0.004, 4, 8, Math.PI), 0, 0, 0.03 + i * 0.03, 0, Math.PI))), stripe);
      g.add(rings);
      this.mats.push({ fur, stripe, sock, rings: [rings] });
      g.add(new THREE.Mesh(at(new THREE.SphereGeometry(1, 9, 7), 0, -0.004, 0, 0, 0, 0.026, 0.017, 0.03), sock));
      // (the beans underneath: one big, four small; and the claws, out only now and then)
      const beans = [at(new THREE.SphereGeometry(0.009, 6, 5), 0, -0.017, 0.004, 0, 0, 1.2, 0.5, 1)];
      const claws: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        beans.push(at(new THREE.SphereGeometry(0.0045, 5, 4), -0.014 + i * 0.0093, -0.013, -0.018 + Math.abs(i - 1.5) * 0.003, 0, 0, 1, 0.6, 1));
        claws.push(at(new THREE.ConeGeometry(0.0025, 0.012, 4), -0.014 + i * 0.0093, -0.006, -0.032, -Math.PI / 2));
      }
      g.add(new THREE.Mesh(mergeGeometries(beans), bean));
      const c = new THREE.Mesh(mergeGeometries(claws), claw);
      c.visible = false;
      g.add(c);
      this.claws.push(c);
      g.scale.setScalar(0.85);
      g.userData.side = side;
      this.scene.add(g);
      return g;
    };
    this.L = leg(-1);
    this.R = leg(1);
    // the mouse in the mouth: held by the scruff, hanging, its ears up, its tail down
    const grey = new THREE.MeshLambertMaterial({ color: 0x9a96a0, flatShading: true });
    const pink = new THREE.MeshLambertMaterial({ color: 0xf0a8b0, flatShading: true, side: THREE.DoubleSide });
    const mb = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), grey);
    mb.scale.set(0.014, 0.022, 0.012);
    mb.position.y = -0.012;
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), grey);
    head.scale.set(0.01, 0.011, 0.012);
    head.position.set(0, 0.012, 0.006);
    const ear1 = new THREE.Mesh(new THREE.CircleGeometry(0.0065, 8), pink);
    ear1.position.set(-0.009, 0.02, 0.004);
    const ear2 = ear1.clone();
    ear2.position.x = 0.009;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.002, 4, 3), pink);
    nose.position.set(0, 0.008, 0.018);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.002, 0.05, 4), pink);
    tail.position.set(0.004, -0.05, 0);
    tail.rotation.z = 0.2;
    this.mouth.add(mb, head, ear1, ear2, nose, tail);
    this.mouth.position.set(0, -0.042, -0.1);
    this.mouth.visible = false;
    this.scene.add(this.mouth, this.pinned);
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(side * 0.012, -0.034, -0.03);
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k < 3; k++) pts.push(new THREE.Vector3(0, -k * 0.003, 0), new THREE.Vector3(side * 0.075, 0.014 - k * 0.013, -0.025 + k * 0.004));
      g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), this.whiskerMat));
      g.userData.side = side;
      this.whiskers.add(g);
    }
    this.scene.add(this.whiskers);
  }

  /** the coat the paws are in */
  setCoat(c: Coat) {
    this.mats.forEach((m, i) => {
      const p = (i === 1 && c.right) || c.left;
      m.fur.color.setHex(p.fur);
      m.sock.color.setHex(p.sock);
      if (p.stripe !== null) m.stripe.color.setHex(p.stripe);
      for (const r of m.rings) r.visible = p.stripe !== null;
    });
    this.bean.color.setHex(c.bean);
  }

  /** a thing caught: a copy of it, a few centimetres across, under the paws; now: the app's clock */
  pin(thing: THREE.Object3D, now: number) {
    this.pinned.clear();
    const m = thing.clone();
    m.visible = true;
    // (not a spider's thread: only the thing itself)
    const lines: THREE.Object3D[] = [];
    m.traverse((o) => { if (o instanceof THREE.Line) lines.push(o); });
    for (const o of lines) o.removeFromParent();
    m.position.set(0, 0, 0);
    m.rotation.set(0, Math.PI / 2, 0);
    m.scale.setScalar(1);
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
    const k = 0.05 / Math.max(size.x, size.z, 1e-4);
    m.scale.setScalar(k);
    m.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-k);
    this.pinned.add(m);
    this.pinAt = now;
  }

  /** the paws for this frame, by what the cat is doing; light: how lit the room is where it is */
  update(cat: Cat, aspect: number, light: number, now: number) {
    // (on a narrow screen the view opens up and down, and the paws go smaller, lower and nearer in,
    // so both still show whole; the poses below are for a wide one)
    this.cam.fov = THREE.MathUtils.clamp(2 * Math.atan(Math.tan(35 * Math.PI / 180) / aspect) * 180 / Math.PI, 62, 95);
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
    this.light.intensity = 0.6 + 1.6 * light;
    this.key.intensity = 0.4 + 1.4 * light;
    this.whiskerMat.color.setScalar(0.3 + 0.6 * light);
    this.pose(cat, now - this.pinAt);
    const halfH = Math.tan(this.cam.fov * Math.PI / 360) * 0.11, halfW = halfH * aspect;
    const ax = Math.min(1, halfW / 0.1), drop = halfH - 0.066;
    const f = THREE.MathUtils.clamp(halfW / 0.12 * 1.2, 0.5, 1);
    for (const g of [this.L, this.R, this.mouth, this.pinned, this.whiskers]) {
      g.position.x *= ax;
      g.position.y -= drop * 0.6;
      g.scale.multiplyScalar(f);
    }
  }

  private pose(cat: Cat, pinned: number) {
    const t = cat.t, ph = cat.stride * Math.PI, run = Math.min(1, cat.speed / 2.5);
    const pose = (g: THREE.Group, x: number, y: number, z: number, rx: number, ry = 0, rz = 0) => {
      g.position.set(x, y, z);
      g.rotation.set(rx, ry, rz);
    };
    // (where they rest: low at either side, reaching a little ahead)
    const sx = 0.05;
    for (const c of this.claws) c.visible = false;
    for (const g of [this.L, this.R]) g.scale.setScalar(0.85);
    this.mouth.position.set(0, -0.042, -0.1);
    this.mouth.scale.setScalar(1);
    // (the whiskers: forward on the hunt, half so listening, back at ease; and a twitch now and then)
    const intent = cat.doing === 'wiggle' || cat.doing === 'pounce' ? 1 : cat.doing === 'listen' ? 0.5 : 0;
    this.whiskerFwd += (intent - this.whiskerFwd) * 0.15;
    this.whiskers.position.set(0, 0, 0);
    this.whiskers.scale.setScalar(1);
    for (const w of this.whiskers.children) {
      const side = w.userData.side as number;
      const twitch = Math.max(0, Math.sin(t * 1.7 + side) * Math.sin(t * 5.3)) * 0.12;
      w.rotation.y = side * (-0.25 + 0.75 * this.whiskerFwd + twitch);
      w.rotation.z = -side * 0.08 * Math.sin(t * 2.2);
    }
    // a catch: both paws come down on it together, claws in it; it kicks a little, and is gone
    this.pinned.visible = pinned < PIN;
    if (pinned < PIN) {
      const u = Math.min(1, pinned / 0.07), gone = Math.max(0, (pinned - (PIN - 0.18)) / 0.18);
      this.pinned.position.set(0, -0.056, -0.2);
      this.pinned.rotation.set(0, Math.sin(pinned * 40) * 0.25 * (1 - gone), Math.sin(pinned * 31) * 0.15 * (1 - gone));
      this.pinned.scale.setScalar(1 - gone);
      pose(this.L, -0.03 + 0.008 * u, -0.046 - 0.008 * u, -0.15, 0.3 + 0.25 * u, 0, 0.2 * u);
      pose(this.R, 0.03 - 0.008 * u, -0.046 - 0.008 * u, -0.15, 0.3 + 0.25 * u, 0, -0.2 * u);
      for (const c of this.claws) c.visible = u > 0.5;
      return;
    }
    this.mouth.rotation.z = Math.sin(cat.stride * Math.PI) * 0.25 * Math.min(1, cat.speed);
    this.mouth.rotation.x = Math.sin(t * 2) * 0.1;
    if (cat.doing === 'pounce') {
      // (both out ahead, reaching, beans showing as they come round to land)
      const u = Math.min(1, t / 0.18);
      for (const g of [this.L, this.R]) {
        const s = g.userData.side as number;
        pose(g, s * (sx + 0.012 * u), -0.05 + 0.03 * u, -0.11 - 0.06 * u, 0.25 + 0.65 * u, 0, -s * 0.25 * u);
      }
      for (const c of this.claws) c.visible = u > 0.6;
      return;
    }
    if (cat.doing === 'swat') {
      // (the right paw: up, across and down, claws out)
      const u = Math.min(1, t / 0.3), a = Math.sin(Math.PI * u);
      pose(this.L, -sx, -0.056, -0.11, 0.1);
      pose(this.R, sx - 0.06 * u, -0.054 + 0.04 * a, -0.115 - 0.04 * a, 0.2 + 0.7 * a, 0, 0.6 * a);
      this.claws[1].visible = a > 0.3;
      return;
    }
    if (cat.doing === 'wiggle') {
      // (low and gathered, treading faster as it winds up)
      const k = Math.min(1, cat.charge);
      const tread = Math.sin(t * (10 + 10 * k));
      pose(this.L, -sx + 0.008, -0.062 + 0.006 * Math.max(0, tread), -0.11, 0.05);
      pose(this.R, sx - 0.008, -0.062 + 0.006 * Math.max(0, -tread), -0.11, 0.05);
      return;
    }
    // walking: one paw forward and up as the other goes back; at rest, a breath
    const amp = cat.body.grounded ? Math.min(1, cat.speed / 0.8) : 0.2;
    const air = !cat.body.grounded;
    for (const g of [this.L, this.R]) {
      const s = g.userData.side as number, p = ph + (s > 0 ? Math.PI : 0);
      const fwd = Math.cos(p) * (0.018 + 0.02 * run) * amp, lift = Math.max(0, Math.sin(p)) * (0.012 + 0.012 * run) * amp;
      const breath = Math.sin(t * 2.2) * 0.0015;
      pose(g, s * sx, (air ? -0.05 : -0.058) + lift + breath, -0.11 - fwd - (air ? 0.02 : 0), 0.08 + lift * 4 + (air ? 0.3 : 0));
    }
    if (cat.doing === 'listen') {
      this.L.position.y -= 0.01;
      this.R.position.y -= 0.01;
    }
  }
}
