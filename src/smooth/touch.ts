import * as THREE from 'three';
import type { Cat3D } from '../cat3d/cat';
import { Senses3D, type Hit } from '../pixel/senses';

/**
 * What a finger touches on the smooth cat: the pixel cat's senses as they are (pixel/senses.ts:
 * which part of the body, which way the fur lies, where the head is), asked of the model as it was
 * made (some six thousand triangles, skinned to the same bones, never drawn) instead of the
 * rounded one that is drawn (nine times as many): finding the point under a finger on that one,
 * several times a frame, would take longer than the frame.
 */
export class SmoothSenses extends Senses3D {
  private readonly proxy: THREE.SkinnedMesh;
  private readonly ray2 = new THREE.Raycaster();
  private readonly ndc2 = new THREE.Vector2();

  constructor(private readonly body: Cat3D, private readonly cam: THREE.Camera, private readonly surface: HTMLElement, touchGeometry: THREE.BufferGeometry) {
    super(body, cam, surface);
    const drawn = body.meshes[0];
    this.proxy = new THREE.SkinnedMesh(touchGeometry, new THREE.MeshBasicMaterial());
    this.proxy.bind(drawn.skeleton, drawn.bindMatrix.clone());
    this.proxy.visible = false;
    this.proxy.frustumCulled = false;
    body.group.add(this.proxy);
  }

  /** the cat under a screen point (css px), or null (as Senses3D.hit, on the undrawn model) */
  override hit(sx: number, sy: number): Hit | null {
    if (!this.body.group.visible) return null;
    const r = this.surface.getBoundingClientRect();
    this.ndc2.set(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
    this.ray2.setFromCamera(this.ndc2, this.cam);
    const mesh = this.proxy;
    mesh.computeBoundingSphere();
    const best = this.ray2.intersectObject(mesh, false)[0];
    if (!best || !best.face) return null;
    const g = mesh.geometry;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const acc = new Map<number, number>();
    for (const v of [best.face.a, best.face.b, best.face.c]) {
      for (let c = 0; c < 4; c++) {
        const b = si.getComponent(v, c), w = sw.getComponent(v, c);
        acc.set(b, (acc.get(b) ?? 0) + w);
      }
    }
    let bi = 0, bw = -1;
    for (const [b, w] of acc) if (w > bw) { bw = w; bi = b; }
    const pa = mesh.getVertexPosition(best.face.a, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const pb = mesh.getVertexPosition(best.face.b, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const pc = mesh.getVertexPosition(best.face.c, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const normal = pb.sub(pa).cross(pc.sub(pa)).normalize();
    if (normal.dot(this.ray2.ray.direction) > 0) normal.negate();
    return { bone: this.body.bones[bi].name, point: best.point.clone(), normal };
  }
}
