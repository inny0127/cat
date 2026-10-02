import * as THREE from 'three';
import { Cat3D } from './cat';
import { Stage } from './stage';
import type { PoseName } from './pose';

// Development stage for the 3D cat: renders it with fur and lets scripts drive it in fixed steps.
async function main() {
  const q = new URLSearchParams(location.search);
  const stage = new Stage({ paper: q.get('paper') ? '#' + q.get('paper') : undefined, exposure: q.get('exp') ? +q.get('exp')! : undefined });
  const { renderer, scene, camera: cam } = stage;
  document.body.appendChild(renderer.domElement);

  const cat = await Cat3D.load('./cat3d/cat.bin', { shells: +(q.get('shells') || 32), density: +(q.get('density') || 2600), strands: q.get('strands') ? +q.get('strands')! : undefined });
  stage.add(cat);

  let skel: THREE.SkeletonHelper | null = null;
  if (q.has('skel')) {
    skel = new THREE.SkeletonHelper(cat.group);
    (skel.material as THREE.LineBasicMaterial).depthTest = false;
    scene.add(skel);
  }

  // camera orbit around a point, optionally following the cat
  const aimAt = new THREE.Vector3(+(q.get('tx') || 0), +(q.get('ty') || 0.15), +(q.get('tz') || 0));
  let orbit = { az: +(q.get('az') || 0.9), el: +(q.get('el') || 0.2), d: +(q.get('d') || 0.9) };
  let follow = q.has('follow');
  const view = (az: number, el: number, dist: number, ty = 0.15, tz = 0, tx = 0) => {
    orbit = { az, el, d: dist };
    aimAt.set(tx, ty, tz);
    placeCam();
  };
  // ?aim=head keeps the camera on the face (offsets in tx/ty/tz are added to the point between the eyes)
  const aimHead = q.get('aim') === 'head';
  const placeCam = () => {
    let c = follow ? new THREE.Vector3(cat.motor.pos.x, 0, cat.motor.pos.z).add(aimAt) : aimAt;
    if (aimHead) {
      cat.group.updateMatrixWorld(true);
      c = cat.body.eyes(new THREE.Vector3()).applyMatrix4(cat.group.matrixWorld).add(aimAt);
    }
    cam.position.set(c.x + Math.sin(orbit.az) * Math.cos(orbit.el) * orbit.d, c.y + Math.sin(orbit.el) * orbit.d, c.z + Math.cos(orbit.az) * Math.cos(orbit.el) * orbit.d);
    cam.lookAt(c);
  };
  if (q.get('fov')) { cam.fov = +q.get('fov')!; cam.updateProjectionMatrix(); }
  placeCam();

  const pose = q.get('pose') as PoseName | null;
  if (pose) cat.snap(pose);
  if (q.has('look')) cat.motor.lookAt(cam.position, 1);

  // lights are set relative to the camera like a photographer's: key up and to one side, fill opposite
  const keyAz = +(q.get('keyAz') ?? -0.85), keyEl = +(q.get('keyEl') ?? 0.65);
  const aimLights = () => {
    const az = orbit.az;
    const dir = (a: number, e: number) => new THREE.Vector3(Math.sin(az + a) * Math.cos(e), Math.sin(e), Math.cos(az + a) * Math.cos(e));
    cat.shared.uKeyDir.value.copy(dir(keyAz, keyEl));
    cat.shared.uFillDir.value.copy(dir(-keyAz * 0.9, 0.2));
    cat.shared.uRimDir.value.copy(dir(Math.PI - keyAz * 0.6, 0.5));
  };
  const draw = () => {
    placeCam();
    aimLights();
    stage.render();
  };
  /** advance the simulation by `sec` in fixed steps (deterministic for screenshots) */
  const step = (sec: number, dt = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += dt) cat.update(dt);
  };
  step(+(q.get('t') || 0.05));

  const api = {
    THREE, scene, cam, renderer, cat, stage, view, step, draw,
    get follow() { return follow; }, set follow(v: boolean) { follow = v; },
    shared: cat.shared,
    render() { draw(); },
  };
  (window as unknown as { lab: typeof api }).lab = api;
  // ?still renders only on request (screenshots under a software rasteriser)
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    cat.update(Math.min(0.05, (now - last) / 1000));
    last = now;
    draw();
    requestAnimationFrame(loop);
  };
  if (q.has('still')) draw();
  else loop();
  (window as unknown as { ready: boolean }).ready = true;
}
main();
