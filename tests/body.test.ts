import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Kin } from '../src/cat3d/kin';
import { Body } from '../src/cat3d/body';
import { POSES, LEGS, type PoseName } from '../src/cat3d/pose';
import type { BoneDef } from '../src/cat3d/load';

function bones(): BoneDef[] {
  const buf = readFileSync(new URL('../public/cat3d/cat.bin', import.meta.url));
  const len = buf.readUInt32LE(0);
  return JSON.parse(buf.subarray(4, 4 + len).toString()).bones;
}

describe('body solver', () => {
  const kin = new Kin(bones());
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
