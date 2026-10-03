import * as THREE from 'three';
import { Cat3D } from '../cat3d/cat';
import { loadCatAsset } from '../cat3d/load';
import type { PoseName } from '../cat3d/pose';
import { MOODS, type MoodName } from '../cat3d/mood';
import { SmoothStage } from './stage';
import { Director } from './director';
import { subdividePN } from './subdivide';

/**
 * The smooth cat: the pixel cat's model, colours and gestures, drawn without pixels, sitting on a
 * cream paper backdrop and looking about. Touch or move a pointer over it and it watches.
 *
 * Query: ?still (draw only when asked: screenshots), ?pose=sit, ?mood=happy, ?az ?el ?d ?tx ?ty ?tz
 * (the camera about the point between the eyes), ?ss (finer pixels per screen pixel), ?line (the
 * outlines' width, CSS px), ?paper=f3efe9. window.lab offers the same calls as the pixel lab
 * (lab.html), so its screenshot tools work here too.
 */
async function main() {
  const q = new URLSearchParams(location.search);
  const num = (k: string, d: number) => (q.get(k) !== null ? +q.get(k)! : d);
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  const stage = new SmoothStage({
    paper: q.get('paper') ? '#' + q.get('paper') : undefined,
    ss: q.get('ss') ? +q.get('ss')! : undefined,
    line: q.get('line') ? +q.get('line')! : undefined,
    whisker: q.get('whisker') ? +q.get('whisker')! : undefined,
  }, canvas ?? undefined);
  if (!canvas) document.body.appendChild(stage.renderer.domElement);
  const { renderer, scene, camera: cam } = stage;

  // the pixel cat's own model, its flat triangles rounded into curved patches (?sub=1: as it is)
  // (a published Artifact serves no binary files: its page carries the model inside it, base64)
  const embedded = (window as unknown as { __CAT_MODEL__?: string }).__CAT_MODEL__;
  const asset = embedded ? await loadEmbedded(embedded) : await loadCatAsset('./cat3d/fri.bin');
  const sub = num('sub', 3);
  if (sub > 1) for (const k of Object.keys(asset.meshes)) asset.meshes[k] = subdividePN(asset.meshes[k], sub);
  const cat = new Cat3D(asset, { shells: 1, strands: 0 });
  stage.add(cat);
  cat.snap((q.get('pose') as PoseName | null) ?? 'sit');
  const mood = (q.get('mood') as MoodName | null) ?? 'neutral';
  if (MOODS[mood]) cat.motor.setMood(MOODS[mood], true);

  // the camera on the face: an orbit about the point between the eyes (eased after it, so the
  // head's own movements still show)
  // (unless asked, the distance keeps the head and chest in a narrow, tall screen too: back a
  // little, the eyes a little above the middle)
  const autoD = !q.has('d');
  const frameDist = () => 0.6 * Math.max(1, 0.86 / cam.aspect);
  let orbit = { az: num('az', 0), el: num('el', 0.12), d: autoD ? frameDist() : num('d', 0.6) };
  const offset = new THREE.Vector3(num('tx', 0), num('ty', -0.035), num('tz', 0));
  const lift = () => (autoD ? -0.12 * (orbit.d - 0.6) : 0);
  const aim = new THREE.Vector3();
  let aimSet = false;
  const eyesAt = () => {
    cat.group.updateMatrixWorld(true);
    return cat.body.eyes(new THREE.Vector3()).applyMatrix4(cat.group.matrixWorld);
  };
  const placeCam = (dt: number) => {
    const e = eyesAt();
    if (!aimSet || dt <= 0) { aim.copy(e); aimSet = true; } else aim.lerp(e, 1 - Math.exp(-dt * 1.6));
    if (autoD) orbit.d = frameDist();
    const c = aim.clone().add(offset);
    c.y += lift();
    cam.position.set(c.x + Math.sin(orbit.az) * Math.cos(orbit.el) * orbit.d, c.y + Math.sin(orbit.el) * orbit.d, c.z + Math.cos(orbit.az) * Math.cos(orbit.el) * orbit.d);
    cam.lookAt(c);
  };
  // lights set like a photographer's, relative to the camera: key up and to the left, fill opposite
  const keyAz = num('keyAz', -0.85), keyEl = num('keyEl', 0.65);
  const aimLights = () => {
    const az = orbit.az;
    const dir = (a: number, e: number) => new THREE.Vector3(Math.sin(az + a) * Math.cos(e), Math.sin(e), Math.cos(az + a) * Math.cos(e));
    cat.shared.uKeyDir.value.copy(dir(keyAz, keyEl));
    cat.shared.uFillDir.value.copy(dir(-keyAz * 0.9, 0.2));
    cat.shared.uRimDir.value.copy(dir(Math.PI - keyAz * 0.6, 0.5));
  };

  const still = q.has('still');
  const director = still && !q.has('demo') ? null : new Director(cat, () => cam.position);
  const lookCam = q.has('look');

  /** advance by `sec` in fixed steps (deterministic for screenshots) */
  const step = (sec: number, dt = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += dt) {
      if (lookCam) cat.motor.lookAt(cam.position, 1);
      director?.update(dt);
      cat.update(dt);
      placeCam(dt);
    }
  };
  const draw = () => {
    aimLights();
    stage.render();
  };
  step(num('t', 0.05));
  placeCam(0);

  // a finger or a pointer over the window: the cat watches it (a point on an upright plane just in
  // front of it); a tap flicks an ear toward it
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane();
  const toWorld = (ev: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), cam);
    const n = cam.getWorldDirection(new THREE.Vector3()).negate().setY(0).normalize();
    plane.setFromNormalAndCoplanarPoint(n, eyesAt().addScaledVector(n, 0.35));
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  };
  // a line of help low on the paper for a few seconds, gone at the first touch
  const hint = document.getElementById('hint');
  const hideHint = () => hint?.classList.remove('on');
  if (director) {
    const el = renderer.domElement;
    el.addEventListener('pointermove', (ev) => { const p = toWorld(ev); if (p) director.point(p); });
    el.addEventListener('pointerdown', (ev) => { hideHint(); const p = toWorld(ev); if (p) director.tap(p); });
  }

  const api = {
    THREE, scene, cam, renderer, cat, stage, step, draw, MOODS, director,
    view(az: number, el: number, dist: number, ty = -0.035, tz = 0, tx = 0) {
      orbit = { az, el, d: dist };
      offset.set(tx, ty, tz);
      placeCam(0);
    },
    render() { draw(); },
  };
  (window as unknown as { lab: typeof api }).lab = api;

  // a device that cannot keep up with the finer pixels (frames slower than about 40 a second, a
  // few seconds in) draws at the screen's own resolution instead
  let last = performance.now(), slow = 0, frames = 0;
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    step(dt, dt || 1 / 60);
    last = now;
    draw();
    if (++frames > 90 && stage.fine > 1) {
      slow = slow * 0.95 + (dt > 1 / 40 ? 0.05 : 0);
      if (slow > 0.6) stage.setFine(1);
    }
    requestAnimationFrame(loop);
  };
  if (still) draw();
  else loop();
  document.getElementById('stage')?.classList.add('on');
  document.getElementById('loading')?.classList.add('off');
  if (!still && hint) {
    setTimeout(() => hint.classList.add('on'), 1800);
    setTimeout(hideHint, 9000);
  }
  (window as unknown as { ready: boolean }).ready = true;
}
/** the model from the page itself: handed to the loader as if it had been fetched */
async function loadEmbedded(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const real = window.fetch;
  window.fetch = (async () => new Response(bytes)) as typeof fetch;
  try {
    return await loadCatAsset('embedded');
  } finally {
    window.fetch = real;
  }
}

main();
