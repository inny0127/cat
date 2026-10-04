import * as THREE from 'three';
import { Cat3D } from '../cat3d/cat';
import { loadCatAsset } from '../cat3d/load';
import type { PoseName } from '../cat3d/pose';
import { MOODS, type MoodName } from '../cat3d/mood';
import { EYE_LOOK, SmoothStage, setEyeLook } from './stage';
import { subdividePN } from './subdivide';
import { cleanCoat } from './coat';
import { SmoothApp } from './app';

/**
 * The smooth cat: the pixel cat's model, colours and life, drawn without pixels, at home on a
 * cream paper. It sleeps and wakes, washes, comes up to look at you, potters about, plays with its
 * ball of wool, and minds where and how it is touched.
 *
 * Query: ?still (the page draws only when asked: screenshots and reels drive it through
 * window.lab), ?pose=sit (with ?still: a puppet in that posture, no mind of its own, for the
 * comparison tools), ?mood=happy (the puppet's), ?ss (finer pixels per screen pixel), ?line (the
 * outlines' width, CSS px), ?whisker, ?paper=f3efe9, ?sub=1 (the model's own flat triangles),
 * ?specks (the coat as the pixel cat has it), ?eye ?deep ?recess ?rim ?glint (the eyes).
 */
async function main() {
  const q = new URLSearchParams(location.search);
  const num = (k: string, d: number) => (q.get(k) !== null ? +q.get(k)! : d);
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const stage = new SmoothStage({
    paper: q.get('paper') ? '#' + q.get('paper') : undefined,
    ss: q.get('ss') ? +q.get('ss')! : undefined,
    line: q.get('line') ? +q.get('line')! : undefined,
    whisker: q.get('whisker') ? +q.get('whisker')! : undefined,
  }, canvas);
  const { renderer, scene, camera: cam } = stage;

  // the pixel cat's own model, its flat triangles rounded into curved patches (?sub=1: as it is);
  // the model as it was made is kept for finding what a finger touches
  // (a published Artifact serves no binary files: its page carries the model inside it, base64)
  const embedded = (window as unknown as { __CAT_MODEL__?: string }).__CAT_MODEL__;
  const asset = embedded ? await loadEmbedded(embedded) : await loadCatAsset('./cat3d/fri.bin');
  const touchGeometry = asset.meshes.body;
  const sub = num('sub', 3);
  if (sub > 1) for (const k of Object.keys(asset.meshes)) asset.meshes[k] = subdividePN(asset.meshes[k], sub);
  // (its coat without the specks a pixel cat shows: ?specks keeps them)
  if (asset.pixTexture && !q.has('specks')) asset.pixTexture = cleanCoat(asset.pixTexture);
  const cat = new Cat3D(asset, { shells: 1, strands: 0 });
  stage.add(cat);
  const eyeLook = { scale: num('eye', EYE_LOOK.scale), deep: num('deep', EYE_LOOK.deep), recess: num('recess', EYE_LOOK.recess), rim: num('rim', EYE_LOOK.rim), glint: num('glint', EYE_LOOK.glint) };
  setEyeLook(cat, eyeLook);

  const still = q.has('still');
  const app = new SmoothApp(stage, cat, canvas, document.getElementById('hint') as HTMLDivElement, touchGeometry, still);
  // (a puppet for the comparison tools: a posture and a mood as asked, no mind of its own)
  const puppet = still && q.has('pose');
  if (puppet) {
    cat.place(0, 0, 0);
    cat.snap(q.get('pose') as PoseName);
    const mood = (q.get('mood') as MoodName | null) ?? 'neutral';
    if (MOODS[mood]) cat.motor.setMood(MOODS[mood], true);
    app.view = { az: num('az', 0), el: num('el', 0.12), d: num('d', 0.6), offset: new THREE.Vector3(num('tx', 0), num('ty', -0.035), num('tz', 0)) };
  }

  /** advance by `sec` in fixed steps (deterministic for screenshots and reels) */
  const step = (sec: number, dt = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += dt) {
      if (puppet) { cat.update(dt); app.place(); } else app.tick(dt);
    }
    if (sec <= 0) app.place();
  };
  step(0.05);

  const api = {
    THREE, scene, cam, renderer, cat, stage, app, step, MOODS,
    get avatar() { return app.avatar; },
    get brain() { return app.brain; },
    /** the camera as an orbit about the point between the eyes (null: back to following the cat) */
    view(az: number | null, el = 0.12, dist = 0.6, ty = -0.035, tz = 0, tx = 0) {
      app.view = az === null ? null : { az, el, d: dist, offset: new THREE.Vector3(tx, ty, tz) };
      app.place();
    },
    eyes(look: Partial<typeof eyeLook>) { Object.assign(eyeLook, look); setEyeLook(cat, eyeLook); },
    render() { stage.render(); },
  };
  (window as unknown as { lab: typeof api }).lab = api;

  // a device that cannot keep up with the finer pixels (frames slower than about 40 a second, a
  // few seconds in) draws at the screen's own resolution instead
  let last = performance.now(), slow = 0, frames = 0;
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (dt > 0) app.tick(dt);
    stage.render();
    if (++frames > 90 && stage.fine > 1) {
      slow = slow * 0.95 + (dt > 1 / 40 ? 0.05 : 0);
      if (slow > 0.6) stage.setFine(1);
    }
    requestAnimationFrame(loop);
  };
  // (screenshots: no fades, no words over the picture)
  if (still) {
    document.body.classList.add('still');
    stage.render();
  } else loop();
  canvas.classList.add('on');
  document.getElementById('loading')?.classList.add('off');
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
