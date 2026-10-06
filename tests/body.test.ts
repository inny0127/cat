import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Kin } from '../src/cat3d/kin';
import { Body } from '../src/cat3d/body';
import { POSES, LEGS, type PoseName } from '../src/cat3d/pose';
import type { BoneDef } from '../src/cat3d/load';

function bones(file: string): BoneDef[] {
  const buf = readFileSync(new URL('../public/cat3d/' + file, import.meta.url));
  const len = buf.readUInt32LE(0);
  return JSON.parse(buf.subarray(4, 4 + len).toString()).bones;
}

// the furred cat, and the painted model rigged with the same skeleton fitted into its body
describe.each(['cat.bin', 'fri.bin'])('body solver (%s)', (file) => {
  const kin = new Kin(bones(file));
  const body = new Body(kin);
  const flex = { LF: 0, RF: 0, LH: 0, RH: 0 };
  for (const name of Object.keys(POSES) as PoseName[]) {
    it(`reaches the paw targets in ${name}`, () => {
      const p = POSES[name];
      body.trunk(p);
      const targ = { LF: new THREE.Vector3(), RF: new THREE.Vector3(), LH: new THREE.Vector3(), RH: new THREE.Vector3() };
      const ground = { LF: 1, RF: 1, LH: 1, RH: 1 };
      for (const l of LEGS) {
        body.footTarget(p, l, targ[l]);
        ground[l] = 1 - p[l].frame;
        flex[l] = p[l].flex;
      }
      body.legsTo(p, targ, flex, ground);
      const errs = LEGS.map((l) => body.reached[l].distanceTo(targ[l]));
      const r = (v: THREE.Vector3) => v.toArray().map((x) => x.toFixed(3)).join(',');
      const I = body.I;
      console.log(name.padEnd(8), 'err', errs.map((e) => (e * 100).toFixed(1) + 'cm').join(' '),
        '| chest', r(kin.wp[I.chest]), 'head', r(kin.wp[I.head]), 'shoulderL', r(kin.wp[I.armL]), 'hipL', r(kin.wp[I.thighL]));
      // a paw may fall a little short when the pose asks for more reach than the leg has
      expect(Math.max(...errs)).toBeLessThan(0.03);
    });
  }
});

// looking at something as it goes round behind the cat: the head turns to it as far as it can
// over one shoulder, less and less as it goes behind, and so comes round to the other side without
// being whipped from one shoulder to the other
describe('the head turned to look', () => {
  const kin = new Kin(bones('fri.bin'));
  const body = new Body(kin);
  const headYaw = () => {
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(kin.wq[body.I.head]);
    return Math.atan2(f.x, f.z);
  };
  const lookAt = (a: number) => {
    body.trunk(POSES.loaf);
    const eye = body.eyes(new THREE.Vector3());
    body.look(new THREE.Vector3(eye.x + 1.5 * Math.sin(a), eye.y + 0.4, eye.z + 1.5 * Math.cos(a)), 1);
    return headYaw();
  };
  it('a thing round behind it, going across: no whip of the head', () => {
    let last = lookAt(-Math.PI / 2), most = 0;
    for (let a = -Math.PI / 2 - 0.02; a > -3 * Math.PI / 2; a -= 0.02) {
      const y = lookAt(a);
      most = Math.max(most, Math.abs(Math.atan2(Math.sin(y - last), Math.cos(y - last))));
      last = y;
    }
    expect(most).toBeLessThan(0.1);
  });
  it('straight behind it: the head as the pose has it; off to one side, turned to it', () => {
    body.trunk(POSES.loaf);
    const own = headYaw();
    expect(Math.abs(lookAt(Math.PI) - own)).toBeLessThan(0.05);
    expect(lookAt(1) - own).toBeGreaterThan(0.8);
    expect(lookAt(-1) - own).toBeLessThan(-0.8);
  });
});
