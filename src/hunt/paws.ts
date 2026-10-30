import * as THREE from 'three';
import type { Cat } from './cat';

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

  constructor() {
    this.scene.add(this.light, this.key);
    this.key.position.set(0.3, 1, 0.4);
    const fur = new THREE.MeshLambertMaterial({ color: 0xe0913f, flatShading: true });
    const stripe = new THREE.MeshLambertMaterial({ color: 0xb8662a, flatShading: true });
    const sock = new THREE.MeshLambertMaterial({ color: 0xfaf3ea, flatShading: true });
    const bean = new THREE.MeshLambertMaterial({ color: 0xf2a0aa, flatShading: true });
    const claw = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const leg = (side: number) => {
      const g = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.12, 8), fur);
      arm.rotation.x = Math.PI / 2;
      arm.position.z = 0.065;
      g.add(arm);
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(new THREE.TorusGeometry(0.0205, 0.004, 4, 8, Math.PI), stripe);
        s.position.z = 0.03 + i * 0.03;
        s.rotation.z = Math.PI;
        g.add(s);
      }
      const paw = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), sock);
      paw.scale.set(0.026, 0.017, 0.03);
      paw.position.set(0, -0.004, 0.0);
      g.add(paw);
      // (the beans underneath: one big, four small)
      const big = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), bean);
      big.scale.set(1.2, 0.5, 1);
      big.position.set(0, -0.017, 0.004);
      g.add(big);
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 5, 4), bean);
        b.scale.set(1, 0.6, 1);
        b.position.set(-0.014 + i * 0.0093, -0.013, -0.018 + Math.abs(i - 1.5) * 0.003);
        g.add(b);
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.0025, 0.012, 4), claw);
        c.rotation.x = -Math.PI / 2;
        c.position.set(-0.014 + i * 0.0093, -0.006, -0.032);
        c.visible = false;
        g.add(c);
        this.claws.push(c);
      }
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
    this.scene.add(this.mouth);
  }

  /** the paws for this frame, by what the cat is doing; light: how lit the room is where it is */
  update(cat: Cat, aspect: number, light: number) {
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
    this.light.intensity = 0.6 + 1.6 * light;
    this.key.intensity = 0.4 + 1.4 * light;
    const t = cat.t, ph = cat.stride * Math.PI, run = Math.min(1, cat.speed / 2.5);
    const pose = (g: THREE.Group, x: number, y: number, z: number, rx: number, ry = 0, rz = 0) => {
      g.position.set(x, y, z);
      g.rotation.set(rx, ry, rz);
    };
    // (where they rest: low at either side, reaching a little ahead; nearer the middle on a narrow
    // screen, where the sides are close in)
    const sx = 0.05 * Math.min(1, 0.65 + 0.35 * aspect);
    for (const c of this.claws) c.visible = false;
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
      for (const c of this.claws.slice(4)) c.visible = a > 0.3;
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
