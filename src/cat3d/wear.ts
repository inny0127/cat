import * as THREE from 'three';
import type { Material } from './pixclass';
import type { Look } from '../game/shop';

/** the model's own points, at rest (x the cat's left, y up, z forward): its neck and the top of its
 *  head between the ears (fri.bin: bones neck1, neck2, head, earL, earR) */
const NECK1 = new THREE.Vector3(0, 0.2067, 0.0749);
const HEAD = new THREE.Vector3(0, 0.2402, 0.1293);
/** along the neck, up and forward */
const NECK_AXIS = HEAD.clone().sub(NECK1).normalize();
/** round the neck just behind the head, where a collar sits */
const COLLAR = new THREE.Vector3(0, 0.212, 0.113);
const COLLAR_R = 0.047;

/**
 * Something for the cat to wear, made in the model's own space at rest, and the bone it rides on
 * (the app hangs it there, less the bone's own place at rest): round its neck a collar with a
 * bell, or a bandana; on its head a bow, a flower, a little knitted cap with a bobble, a crown. Of
 * the room's own materials (paint: a material and how light), so that it is painted as the room
 * is.
 */
export function makeWear(look: Look, color: Material, paint: (m: Material, tone?: number) => THREE.Material): { bone: 'neck2' | 'head'; obj: THREE.Group } {
  const g = new THREE.Group();
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, at: THREE.Vector3) => {
    const o = new THREE.Mesh(geo, m);
    o.position.copy(at);
    g.add(o);
    return o;
  };
  // (the ring round the neck, square to it)
  const ringTilt = -Math.atan2(NECK_AXIS.y, NECK_AXIS.z);
  const down = new THREE.Vector3(0, -NECK_AXIS.z, NECK_AXIS.y);
  if (look === 'collar' || look === 'bandana') {
    const band = mesh(new THREE.TorusGeometry(COLLAR_R, look === 'collar' ? 0.0052 : 0.0065, 6, 20), paint(color, 0.05), COLLAR);
    band.rotation.x = ringTilt;
    if (look === 'collar') {
      // (a little gold bell at the front, hanging)
      const at = COLLAR.clone().addScaledVector(down, COLLAR_R + 0.006);
      mesh(new THREE.SphereGeometry(0.0085, 8, 6), paint('bookMustard', 0.25), at);
      mesh(new THREE.TorusGeometry(0.003, 0.0012, 4, 8), paint('bookMustard', 0.1), at.clone().addScaledVector(down, -0.008));
    } else {
      // (the cloth: a triangle tied at the throat, its point down over the chest)
      const tri = new THREE.Shape();
      tri.moveTo(-0.034, 0);
      tri.lineTo(0.034, 0);
      tri.lineTo(0, -0.048);
      tri.closePath();
      const cloth = mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.004, bevelEnabled: false }), paint(color, 0.08), COLLAR.clone().addScaledVector(down, COLLAR_R - 0.004));
      // (lying on the chest: square to the neck, leaning out a little)
      cloth.rotation.x = ringTilt + Math.PI / 2 - 0.35;
      cloth.position.z += 0.004;
    }
    return { bone: 'neck2', obj: g };
  }
  if (look === 'bow') {
    // (on the left ear's root, a little in and forward: two loops and the knot)
    const at = new THREE.Vector3(0.038, 0.297, 0.172);
    for (const s of [-1, 1]) {
      const lobe = mesh(new THREE.SphereGeometry(0.013, 8, 6), paint(color, 0.08), at.clone().add(new THREE.Vector3(0.0135 * s, 0.003 * s, 0)));
      lobe.scale.set(1.15, 0.8, 0.45);
      lobe.rotation.z = 0.35 * s;
    }
    mesh(new THREE.SphereGeometry(0.0068, 6, 5), paint(color, -0.1), at.clone().add(new THREE.Vector3(0, 0, 0.003)));
    g.rotation.set(0, 0, 0);
    return { bone: 'head', obj: g };
  }
  if (look === 'flower') {
    // (behind the right ear's root: five petals round a heart)
    const at = new THREE.Vector3(-0.039, 0.296, 0.17), n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = mesh(new THREE.SphereGeometry(0.009, 6, 5), paint(color, 0.12), at.clone().add(new THREE.Vector3(Math.cos(a) * 0.0105, Math.sin(a) * 0.0105, 0)));
      p.scale.set(1, 1, 0.5);
    }
    mesh(new THREE.SphereGeometry(0.0065, 6, 5), paint('bookRed', 0.15), at.clone().add(new THREE.Vector3(0, 0, 0.004)));
    return { bone: 'head', obj: g };
  }
  if (look === 'beanie') {
    // (a little knitted cap between the ears, its brim rolled, a bobble on top)
    const at = new THREE.Vector3(0, 0.272, 0.157);
    const cap = mesh(new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint(color, 0.05), at);
    cap.scale.set(1.12, 0.82, 1.08);
    const brim = mesh(new THREE.TorusGeometry(0.0315, 0.006, 5, 18), paint(color, -0.08), at.clone().add(new THREE.Vector3(0, 0.001, 0)));
    brim.rotation.x = Math.PI / 2;
    brim.scale.set(1.1, 1.05, 1);
    mesh(new THREE.SphereGeometry(0.0095, 8, 6), paint('paint', 0.3), at.clone().add(new THREE.Vector3(0, 0.026, -0.002)));
    g.rotation.x = -0.12;
    return { bone: 'head', obj: g };
  }
  // the crown: a gold band with five points, a red stone at its front
  const at = new THREE.Vector3(0, 0.292, 0.163);
  const band = mesh(new THREE.CylinderGeometry(0.019, 0.017, 0.012, 10, 1, true), paint(color, 0.2), at);
  (band.material as THREE.Material).side = THREE.DoubleSide;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    mesh(new THREE.ConeGeometry(0.0045, 0.011, 4), paint(color, 0.25), at.clone().add(new THREE.Vector3(Math.cos(a) * 0.018, 0.011, Math.sin(a) * 0.018)));
  }
  mesh(new THREE.SphereGeometry(0.0035, 6, 5), paint('bookRed', 0.2), at.clone().add(new THREE.Vector3(0, 0, 0.019)));
  g.rotation.x = -0.15;
  return { bone: 'head', obj: g };
}
