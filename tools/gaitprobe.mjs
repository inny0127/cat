// node tools/gaitprobe.mjs out.json "<setup js>" seconds [dt]
// Steps the lab cat in fixed time and records the paws, hips, chest, head and tail tip in world
// space every step (for plotting the gait).
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const [out, setup, secArg = '4', dtArg = '0.0167'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 200, height: 150 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => { if (m.type() === 'log') console.log(m.text()); });
await page.goto('http://localhost:5173/lab.html?still&model=fri');
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
const rec = await page.evaluate(([setup, sec, dt]) => {
  const L = window.lab, THREE = L.THREE, cat = L.cat;
  eval(setup);
  const k = cat.body.kin, I = cat.body.I;
  const names = ['handL', 'handR', 'footL', 'footR', 'hips', 'chest', 'head', 'scapL', 'scapR'];
  const tail = []; for (let i = 0; ; i++) { try { k.i('tail' + i); tail.push('tail' + i); } catch { break; } }
  const v = new THREE.Vector3();
  const rows = [];
  for (let t = 0; t < sec; t += dt) {
    cat.update(dt);
    cat.group.updateMatrixWorld(true);
    const r = { t, yaw: cat.motor.yaw, speed: cat.motor.speed, phase: cat.stepper.phase, duty: cat.stepper.duty, freq: cat.stepper.freq };
    for (const n of [...names, tail[tail.length - 1]]) {
      v.copy(k.wp[k.i(n)]).applyMatrix4(cat.group.matrixWorld);
      r[n] = [v.x, v.y, v.z];
    }
    const end = { LF: 'handL', RF: 'handR', LH: 'footL', RH: 'footR' };
    for (const l of ['LF', 'RF', 'LH', 'RH']) {
      const F = cat.stepper.feet[l]; r['st' + l] = F.stepping ? 1 : 0; r['fl' + l] = F.flex;
      v.copy(k.wp[k.i(end[l])]).applyMatrix4(cat.group.matrixWorld);
      r['err' + l] = v.distanceTo(F.pos);
      r['want' + l] = [F.pos.x, F.pos.y, F.pos.z];
    }
    if (rows.length === 0) {
      const lens = {}; for (const l of ['LF', 'LH']) lens[l] = cat.body.legs[l].len;
      console.log('leg lengths', JSON.stringify(lens));
    }
    rows.push(r);
  }
  return rows;
}, [setup, +secArg, +dtArg]);
writeFileSync(out, JSON.stringify(rec));
console.log('rows', rec.length);
await b.close();
