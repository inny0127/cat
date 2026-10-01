import * as THREE from 'three';
import { loadCatAsset, buildSkeleton } from './load';
import { makeFurMaterials } from './fur';
import { makeEye, setLids, type CatEye } from './eye';
import { makeWhiskers } from './whiskers';

// Development stage for the 3D cat: renders it with fur, lets tests pose bones.
async function main() {
  const q = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4ede6);
  const cam = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.01, 20);

  const asset = await loadCatAsset('./cat3d/cat.bin');
  const { skeleton, root, byName } = buildSkeleton(asset.bones);
  const cat = new THREE.Group();
  cat.add(root);
  scene.add(cat);
  const shells = +(q.get('shells') || 24);
  const { mats, shared } = makeFurMaterials({ shells, density: +(q.get('density') || 2400) });
  const meshes: THREE.SkinnedMesh[] = [];
  for (const [name, geo] of Object.entries(asset.meshes)) {
    const n = name === 'body' ? shells : Math.max(4, Math.round(shells / 2));
    for (let i = 0; i < n; i++) {
      const m = new THREE.SkinnedMesh(geo, name === 'body' ? mats[i] : mats[Math.round((i / Math.max(1, n - 1)) * (shells - 1))]);
      m.bind(skeleton, new THREE.Matrix4());
      m.frustumCulled = false;
      m.castShadow = i === 0 && name === 'body';
      m.renderOrder = i;
      cat.add(m);
      meshes.push(m);
    }
  }
  // eyes in the sockets and whiskers on the pads, children of the head bone
  const head = byName.get('head')!;
  const headW = head.getWorldPosition(new THREE.Vector3());
  const LM = asset.landmarks;
  const v3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
  const eyes: CatEye[] = [];
  for (const [p, x, eu] of [[LM.eyeL, 1, LM.eyeEulerL], [LM.eyeR, -1, LM.eyeEulerR]] as const) {
    const e = makeEye(LM.eyeRadius, x, shared.uLightDir.value);
    e.group.position.copy(v3(p).sub(headW));
    e.group.rotation.set(eu[0], eu[1], eu[2]);
    // the coat shader cuts the lid opening in the eye's frame
    const toEye = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(e.group.rotation)).transpose();
    (x > 0 ? shared.uEyeCL : shared.uEyeCR).value.copy(v3(p));
    (x > 0 ? shared.uEyeML : shared.uEyeMR).value.copy(toEye);
    head.add(e.group);
    setLids(e, shared.uLids.value, +(q.get('open') ?? 1), +(q.get('squint') ?? 0));
    eyes.push(e);
  }
  const whiskers = makeWhiskers(v3(LM.padL), v3(LM.padR), v3(LM.eyeL), v3(LM.eyeR));
  whiskers.mesh.position.copy(headW).negate();
  whiskers.setSpread(+(q.get('spread') ?? 0));
  head.add(whiskers.mesh);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.28 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.copy(shared.uLightDir.value).multiplyScalar(2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -0.5; sun.shadow.camera.right = 0.5; sun.shadow.camera.top = 0.5; sun.shadow.camera.bottom = -0.5;
  sun.shadow.radius = 6;
  scene.add(sun);

  const view = (az: number, el: number, dist: number, ty = 0.15, tz = 0) => {
    cam.position.set(Math.sin(az) * Math.cos(el) * dist, ty + Math.sin(el) * dist, tz + Math.cos(az) * Math.cos(el) * dist);
    cam.lookAt(0, ty, tz);
  };
  view(+(q.get('az') || 0.9), +(q.get('el') || 0.2), +(q.get('d') || 0.9), +(q.get('ty') || 0.15), +(q.get('tz') || 0));

  const draw = () => {
    whiskers.setPixel((2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / renderer.domElement.height);
    renderer.render(scene, cam);
  };
  const api = {
    THREE, scene, cam, renderer, byName, skeleton, view, shared, eyes, setLids, whiskers,
    pose(p: Record<string, [number, number, number]>) {
      for (const [k, v] of Object.entries(p)) byName.get(k)?.rotation.set(v[0], v[1], v[2]);
    },
    render() { draw(); },
  };
  (window as unknown as { lab: typeof api }).lab = api;
  // ?still renders only on request (screenshots under a software rasteriser)
  const loop = () => { draw(); requestAnimationFrame(loop); };
  if (q.has('still')) draw();
  else loop();
  (window as unknown as { ready: boolean }).ready = true;
}
main();
