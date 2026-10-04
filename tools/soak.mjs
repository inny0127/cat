// node tools/soak.mjs [minutes]: runs the pixel cat's life in fixed steps of game time with acts,
// hours and weather changing at random, and reports anything wrong (errors, NaN, a cat left up in
// the air or perched off the sill).
import { chromium } from 'playwright-core';
const minutes = +(process.argv[2] ?? 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await page.goto((process.env.REEL_BASE ?? 'http://localhost:5173/') + 'index.html?still');
await page.waitForFunction(() => window.__pcat, null, { timeout: 180000 });
const report = await page.evaluate(async (minutes) => {
  const app = window.__pcat;
  const acts = ['wander', 'sun', 'warm', 'play', 'sill', 'box', 'wash', 'zoomies', 'stare', 'sneeze', 'rub', 'scratch', 'window', 'groom', 'yawn', 'stretch', 'bed', 'greet', 'gift'];
  const issues = [];
  let t = 1, seen = {}, drag = null, drags = 0, errands = 0, laser = null, wand = null, laserUses = 0, wandUses = 0, returns = 0, tosses = 0;
  // a cat that wants to go somewhere and does not move
  let stillFor = 0, lastAct = '';
  const lastPos = { x: 0, z: 0 };
  const ev = (x, y, t) => ({ preventDefault() {}, pointerId: 9, clientX: x, clientY: y, timeStamp: t * 1000, pointerType: 'touch', pressure: 0.5, width: 20, height: 20, buttons: 1 });
  app.brain.toAwake('rest');
  app.state.trust = 0.6;
  app.room.boxOverride = true;
  const steps = Math.round(minutes * 60 / 0.05);
  for (let i = 0; i < steps; i++) {
    t += 0.05;
    if (i % 600 === 0) app.hourOverride = String(Math.floor(Math.random() * 24) + Math.random());
    if (i % 1500 === 0) app.rainOverride = Math.random() < 0.3 ? '1' : '0';
    if (i % 400 === 0 && Math.random() < 0.6) { const a = acts[Math.floor(Math.random() * acts.length)]; app.avatar.startAct(a); lastAct = `${a} at ${i}${app.avatar.trip ? ' (on a trip)' : ''}`; }
    if (i % 2000 === 1000 && Math.random() < 0.3) app.brain.toSleep(0.7);
    if (i % 900 === 450 && Math.random() < 0.5) app.room.letBugIn(Math.random() < 0.5 ? 'moth' : 'fly');
    // now and then off to the bowls or the box (and back when it has been away a while)
    if (i % 1100 === 700 && Math.random() < 0.6 && app.brain.mode !== 'away') { app.brain.leave(['eat', 'drink', 'litter'][Math.floor(Math.random() * 3)]); errands++; }
    if (app.brain.mode === 'away' && i % 400 === 0) app.state.awayUntil = Math.min(app.state.awayUntil, app.state.lastTick + 5000);
    if (i % 2000 === 1500) app.brain.toAwake('rest');
    // now and then the toy mouse is thrown (a tap on it, as a finger would)
    if (i % 700 === 350 && app.room.mouse.state === 'floor') {
      const q = app.room.mouse.p.clone().project(app.stage.camera);
      app.input.h.glassTap((q.x * 0.5 + 0.5) * innerWidth, (-q.y * 0.5 + 0.5) * innerHeight);
      tosses++;
    }
    // now and then the app is shut and opened again half an hour later (the cat says hello)
    if (i % 2600 === 1300 && app.brain.mode !== 'away') { app.onVisibility(false); app.state.lastTick -= 1800e3; app.onVisibility(true); returns++; }
    // now and then a finger takes the ball of wool and drags it about a few seconds
    if (i % 300 === 0 && !drag && !laser && !wand && Math.random() < 0.4) {
      const p = app.room.yarnAt().clone().project(app.stage.camera);
      const x = (p.x * 0.5 + 0.5) * innerWidth, y = (-p.y * 0.5 + 0.5) * innerHeight;
      drag = { x, y, until: i + 40 + Math.floor(Math.random() * 120), vx: 0, vy: 0 };
      app.input.down(ev(x, y, t));
    } else if (drag) {
      drag.vx += (Math.random() - 0.5) * 120; drag.vy += (Math.random() - 0.5) * 60;
      drag.vx *= 0.9; drag.vy *= 0.9;
      drag.x = Math.max(0, Math.min(innerWidth, drag.x + drag.vx * 0.05));
      drag.y = Math.max(0, Math.min(innerHeight, drag.y + drag.vy * 0.05));
      app.input.move(ev(drag.x, drag.y, t));
      if (i >= drag.until) { app.input.up(ev(drag.x, drag.y, t), false); drag = null; drags++; }
    }
    // now and then the laser pointer: taken off the sill, shone about (now and then on the mug,
    // or the sill), lifted off and put back down at times, and in the end put back
    const scr = (p) => { const q = p.clone().project(app.stage.camera); return [(q.x * 0.5 + 0.5) * innerWidth, (-q.y * 0.5 + 0.5) * innerHeight]; };
    if (i % 900 === 300 && !laser && !drag && !wand && Math.random() < 0.6) {
      const [x, y] = scr(app.room.pointerHome);
      app.input.down({ ...ev(x, y, t), pointerId: 11 });
      app.input.up({ ...ev(x, y, t + 0.05), pointerId: 11 }, false);
      laser = { until: i + 200 + Math.floor(Math.random() * 300), on: false, x: 195, y: 650, aim: null };
      laserUses++;
    } else if (laser) {
      if (!laser.on && Math.random() < 0.05) {
        laser.aim = Math.random() < 0.25 ? scr(app.room.mugTop) : Math.random() < 0.3 ? [100 + Math.random() * 200, 440 + Math.random() * 20] : null;
        app.input.down({ ...ev(laser.x, laser.y, t), pointerId: 12 }); laser.on = true;
      } else if (laser.on) {
        const [tx, ty] = laser.aim ?? [laser.x + (Math.random() - 0.5) * 80, laser.y + (Math.random() - 0.5) * 60];
        laser.x = Math.max(5, Math.min(innerWidth - 5, laser.x + (tx - laser.x) * 0.2));
        laser.y = Math.max(300, Math.min(innerHeight - 5, laser.y + (ty - laser.y) * 0.2));
        app.input.move({ ...ev(laser.x, laser.y, t), pointerId: 12 });
        if (Math.random() < 0.02) { app.input.up({ ...ev(laser.x, laser.y, t), pointerId: 12 }, false); laser.on = false; }
      }
      if (i >= laser.until) {
        if (laser.on) app.input.up({ ...ev(laser.x, laser.y, t), pointerId: 12 }, false);
        const [x, y] = scr(app.room.pointerHome);
        app.input.down({ ...ev(x, y, t), pointerId: 13 });
        app.input.up({ ...ev(x, y, t + 0.05), pointerId: 13 }, false);
        if (app.laser.held) issues.push(`the laser pointer not put back at ${i}`);
        laser = null;
      }
    }
    // and the feather wand: taken up by its feathers and dangled about a while, then dropped
    if (i % 1200 === 900 && !laser && !drag && !wand && Math.random() < 0.6) {
      const [x, y] = scr(app.room.lureAt());
      app.input.down({ ...ev(x, y, t), pointerId: 14 });
      wand = { x, y, until: i + 120 + Math.floor(Math.random() * 240), vx: 0, vy: 0, took: !!app.wandFinger };
      if (!wand.took) issues.push(`the wand not taken up at ${i} (${x.toFixed(0)},${y.toFixed(0)})`);
      wandUses++;
    } else if (wand) {
      wand.vx += (Math.random() - 0.5) * 160; wand.vy += (Math.random() - 0.5) * 160;
      wand.vx *= 0.9; wand.vy *= 0.9;
      wand.x = Math.max(5, Math.min(innerWidth - 5, wand.x + wand.vx * 0.05));
      wand.y = Math.max(380, Math.min(innerHeight - 5, wand.y + wand.vy * 0.05));
      app.input.move({ ...ev(wand.x, wand.y, t), pointerId: 14 });
      if (i >= wand.until) { app.input.up({ ...ev(wand.x, wand.y, t), pointerId: 14 }, false); wand = null; }
    }
    if (app.room.mess && Math.random() < 0.002) app.room.sweepMug();
    try { app.tick(0.05, t); } catch (e) { issues.push('tick: ' + e.message); break; }
    const lp = app.room.lureAt();
    if (![lp.x, lp.y, lp.z].every(Number.isFinite) || Math.abs(lp.x) > 2 || lp.y > 1.5 || lp.z > 2 || lp.z < -1) issues.push(`the feathers lost at ${i}: ${lp.x},${lp.y},${lp.z}`);
    const yp = app.room.yarnAt();
    const yb = app.room.yarnBounds;
    if (![yp.x, yp.z].every(Number.isFinite) || yp.x < yb.minX - 1e-3 || yp.x > yb.maxX + 1e-3 || yp.z < yb.minZ - 1e-3 || yp.z > yb.maxZ + 1e-3) issues.push(`yarn out at ${i}: ${yp.x},${yp.z}`);
    const m = app.cat.motor, c = app.cat;
    const d = app.avatar.doing;
    if (d) seen[d] = (seen[d] || 0) + 1;
    if (![m.pos.x, m.pos.z, m.yaw].every(Number.isFinite)) { issues.push(`NaN at ${i}`); break; }
    if (c.perch !== null && !(app.avatar.act && (app.avatar.act.name === 'sill' || app.avatar.act.name === 'chase'))) issues.push(`perched without the sill act at ${i}`);
    if (c.liftHold !== null && !(app.avatar.act && ['sill', 'box', 'chase', 'tease', 'startle'].includes(app.avatar.act.name))) issues.push(`held in the air without the sill or box act at ${i}`);
    if (app.room.mouse.state === 'mouth' && app.avatar.doing !== 'gift') issues.push(`the toy mouse left in a mouth at ${i}`);
    const mp = app.room.mouse.p;
    if (!Number.isFinite(mp.x + mp.y + mp.z) || mp.y < -0.01 || mp.y > 2) issues.push(`the toy mouse lost (${mp.x.toFixed(2)}, ${mp.y.toFixed(2)}, ${mp.z.toFixed(2)}) at ${i}`);
    if (Math.abs(m.pos.x) > 3 || Math.abs(m.pos.z) > 3) issues.push(`far away ${m.pos.x.toFixed(2)},${m.pos.z.toFixed(2)} at ${i}`);
    const moved = Math.hypot(m.pos.x - lastPos.x, m.pos.z - lastPos.z) > 0.002;
    lastPos.x = m.pos.x; lastPos.z = m.pos.z;
    const wants = (app.avatar.trip && !app.avatar.hidden && (!app.avatar.errand || app.avatar.errand.phase !== 'do'));
    stillFor = wants && !moved ? stillFor + 0.05 : 0;
    if (stillFor > 12) { issues.push(`stuck on a ${app.avatar.trip.kind} at ${i} (${app.avatar.errand ? app.avatar.errand.phase : ''}; act ${app.avatar.doing}, goal ${!!m.goal}, ${m.posture}, last act started ${lastAct})`); stillFor = -1e9; }
    if (i % 2400 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  app.stage.render();
  return { issues: issues.slice(0, 20), seen, drags, errands, laserUses, wandUses, returns, tosses, mug: app.room.mugUp ? 'up' : 'down', mode: app.brain.mode, doing: app.avatar.doing };
}, minutes);
console.log(JSON.stringify(report), 'errors:', errs.slice(0, 10));
await b.close();
