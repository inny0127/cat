import type { RigData } from '../rig/rig';
import { rot } from '../util/math';

/** Everything the renderer needs for one frame. Angles in radians, distances in painting px. */
export interface Pose {
  headAngle: number;
  headX: number;
  headY: number;
  earLAngle: number;
  earLFold: number;
  earRAngle: number;
  earRFold: number;
  tailAngle: number;
  breath: number;
  pawX: number;
  pawY: number;
  pawSqueeze: number;
  rippleAmp: number;
  ripplePhase: number;
  puff: number;
  // eyes (0 closed .. 1 wide open)
  eyeOpen: number;
  eyeOpenB: number;
  squint: number;
  pupil: number; // 0 slit .. 1 fully round
  gazeX: number; // -1..1 in screen space
  gazeY: number;
  // whole cat
  gx: number;
  gy: number;
  stretch: number;
  stretchDirX: number;
  stretchDirY: number;
  gAngle: number;
  alpha: number;
  blurX: number;
  blurY: number;
  focus: number; // defocus radius, painting px
  desat: number;
  dim: number;
  shadow: number;
}

export function restPose(): Pose {
  return {
    headAngle: 0, headX: 0, headY: 0,
    earLAngle: 0, earLFold: 0, earRAngle: 0, earRFold: 0,
    tailAngle: 0, breath: 0,
    pawX: 0, pawY: 0, pawSqueeze: 0,
    rippleAmp: 0, ripplePhase: 0, puff: 0,
    eyeOpen: 0, eyeOpenB: 0, squint: 0, pupil: 0.35, gazeX: 0, gazeY: 0,
    gx: 0, gy: 0, stretch: 0, stretchDirX: 1, stretchDirY: 0, gAngle: 0, alpha: 1, blurX: 0, blurY: 0, focus: 0,
    desat: 0, dim: 0, shadow: 1,
  };
}

/** CPU mirror of the vertex shader's head bone for a point with head weight w (no global move). */
export function headLocal(rig: RigData, pose: Pose, x: number, y: number, w = 1): [number, number] {
  const [px, py] = rig.anchors.headPivot;
  const [rx, ry] = rot(x - px, y - py, pose.headAngle * w);
  return [px + rx + pose.headX * w, py + ry + pose.headY * w];
}

/** Head bone, then the fur-field offset (dx, dy), then the whole-cat transform: as the shader does. */
export function headPoint(rig: RigData, pose: Pose, x: number, y: number, dx = 0, dy = 0, w = 1): [number, number] {
  const [hx, hy] = headLocal(rig, pose, x, y, w);
  return globalPoint(rig, pose, hx + dx, hy + dy);
}

export function globalPoint(rig: RigData, pose: Pose, x: number, y: number): [number, number] {
  const [cx, cy] = rig.anchors.body;
  let gx = x - cx, gy = y - cy;
  const along = gx * pose.stretchDirX + gy * pose.stretchDirY;
  gx += pose.stretchDirX * along * pose.stretch;
  gy += pose.stretchDirY * along * pose.stretch;
  const [qx, qy] = rot(gx, gy, pose.gAngle);
  return [cx + qx + pose.gx, cy + qy + pose.gy];
}
