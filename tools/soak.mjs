// node tools/soak.mjs [minutes] (SOAK_QUERY=px=2.1 for more of the query): runs the pixel cat's life in fixed steps of game time with acts,
// hours and weather changing at random, and reports anything wrong (errors, NaN, a cat left up in
// the air or perched off the sill, a still thing of the room's that moved).
import { chromium } from 'playwright-core';
const minutes = +(process.argv[2] ?? 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await page.goto((process.env.REEL_BASE ?? 'http://localhost:5173/') + 'index.html?still' + (process.env.SOAK_QUERY ? '&' + process.env.SOAK_QUERY : ''));
await page.waitForFunction(() => window.__pcat, null, { timeout: 180000 });
const report = await page.evaluate(async (minutes) => {
  const app = window.__pcat;
  const acts = ['wander', 'sun', 'warm', 'play', 'sill', 'box', 'wash', 'zoomies', 'stare', 'sneeze', 'rub', 'scratch', 'window', 'groom', 'yawn', 'stretch', 'bed', 'greet', 'gift', 'ask', 'tail', 'by you', 'claw', 'top', 'fish', 'pompom'];
  const issues = [];
  let t = 1, seen = {}, drag = null, drags = 0, errands = 0, laser = null, wand = null, laserUses = 0, wandUses = 0, returns = 0, tosses = 0, glass = null, glasses = 0;
  // a cat that wants to go somewhere and does not move
  let stillFor = 0, lastAct = '', legIssues = 0;
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
    // now and then a finger on the glass beside the cat, moved about slowly a few seconds (the cat
    // may come and pat at it), and lifted
    if (i % 1300 === 650 && !drag && !laser && !wand && !glass && Math.random() < 0.6) {
      const m = app.cat.motor, cam = app.stage.camera;
      const q = cam.position.clone().set(m.pos.x + (Math.random() < 0.5 ? -1 : 1) * 0.1, 0.12 + Math.random() * 0.25, app.room.spots.bed.z + 0.45).project(cam);
      glass = { x: (q.x * 0.5 + 0.5) * innerWidth, y: (-q.y * 0.5 + 0.5) * innerHeight, until: i + 120 + Math.floor(Math.random() * 100), k: 0 };
      if (app.input.h.hitCat(glass.x, glass.y, false) || glass.x < 0 || glass.x > innerWidth || glass.y < 0 || glass.y > innerHeight) glass = null;
      else { app.input.down(ev(glass.x, glass.y, t)); glasses++; }
    } else if (glass) {
      glass.k += 0.05;
      app.input.move(ev(glass.x + 22 * Math.sin(glass.k * 2.3), glass.y + 5 * Math.sin(glass.k * 3.9), t));
      if (i >= glass.until) { app.input.up(ev(glass.x, glass.y, t), false); glass = null; }
    }
    // now and then a finger takes the ball of wool and drags it about a few seconds
    if (i % 300 === 0 && !drag && !laser && !wand && !glass && Math.random() < 0.4) {
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
      // (put down already: a tap on the sill came down on where the pointer lies, the view having
      // moved round to the cat; that is a put-down, and an end of it)
      if (!app.laser.held) { if (laser.on) app.input.up({ ...ev(laser.x, laser.y, t), pointerId: 12 }, false); laser = null; }
      else if (!laser.on && Math.random() < 0.05) {
        laser.aim = Math.random() < 0.25 ? scr(app.room.mugTop) : Math.random() < 0.3 ? [100 + Math.random() * 200, 440 + Math.random() * 20] : null;
        app.input.down({ ...ev(laser.x, laser.y, t), pointerId: 12 }); laser.on = true;
      } else if (laser.on) {
        const [tx, ty] = laser.aim ?? [laser.x + (Math.random() - 0.5) * 80, laser.y + (Math.random() - 0.5) * 60];
        laser.x = Math.max(5, Math.min(innerWidth - 5, laser.x + (tx - laser.x) * 0.2));
        laser.y = Math.max(300, Math.min(innerHeight - 5, laser.y + (ty - laser.y) * 0.2));
        app.input.move({ ...ev(laser.x, laser.y, t), pointerId: 12 });
        if (Math.random() < 0.02) { app.input.up({ ...ev(laser.x, laser.y, t), pointerId: 12 }, false); laser.on = false; }
      }
      if (laser && i >= laser.until) {
        if (laser.on) app.input.up({ ...ev(laser.x, laser.y, t), pointerId: 12 }, false);
        const [x, y] = scr(app.room.pointerHome);
        app.input.down({ ...ev(x, y, t), pointerId: 13 });
        const L = app.laser, seen = `downOn ${L.downOn} id ${L.id} taking ${L.taking} at ${x.toFixed(0)},${y.toFixed(0)}`;
        app.input.up({ ...ev(x, y, t + 0.05), pointerId: 13 }, false);
        if (app.laser.held) issues.push(`the laser pointer not put back at ${i} (cat under the finger: ${app.input.h.hitCat(x, y, false)}; ${app.avatar.doing}; ${seen})`);
        laser = null;
      }
    }
    // and the feather wand: taken up by its feathers and dangled about a while, then dropped
    if (i % 1200 === 900 && !laser && !drag && !wand && Math.random() < 0.6) {
      const [x, y] = scr(app.room.lureAt());
      app.input.down({ ...ev(x, y, t), pointerId: 14 });
      wand = { x, y, until: i + 120 + Math.floor(Math.random() * 240), vx: 0, vy: 0, took: !!app.wandFinger, why: `laser ${app.laser.held} credits ${app.creditsOpen} yarn ${!!app.toyFinger}` };
      // (unless the ball of wool lies on its feathers: then the wool is what the finger takes, by design)
      if (!wand.took && !app.toyFinger) issues.push(`the wand not taken up at ${i} (${x.toFixed(0)},${y.toFixed(0)}; cat under the finger: ${app.input.h.hitCat(x, y, false)}; ${app.avatar.doing}; ${wand.why})`);
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
    if (c.perch !== null && !(app.avatar.act && ['sill', 'chase', 'top'].includes(app.avatar.act.name))) issues.push(`perched without the sill act at ${i}`);
    if (c.liftHold !== null && !(app.avatar.act && ['sill', 'box', 'chase', 'tease', 'startle', 'top'].includes(app.avatar.act.name))) issues.push(`held in the air without the sill or box act at ${i}`);
    if (app.room.mouse.state === 'mouth' && app.avatar.doing !== 'gift') issues.push(`the toy mouse left in a mouth at ${i}`);
    const mp = app.room.mouse.p;
    if (!Number.isFinite(mp.x + mp.y + mp.z) || mp.y < -0.01 || mp.y > 2) issues.push(`the toy mouse lost (${mp.x.toFixed(2)}, ${mp.y.toFixed(2)}, ${mp.z.toFixed(2)}) at ${i}`);
    if (Math.abs(m.pos.x) > 3 || Math.abs(m.pos.z) > 3) issues.push(`far away ${m.pos.x.toFixed(2)},${m.pos.z.toFixed(2)} at ${i}`);
    // (never in anything solid, the plant's pot, the lamp's foot, the books, the post, the box: its
    // chest and its hips, unless it means to be right up against it)
    if (!m.ghost && !app.avatar.hidden && i % 5 === 0) {
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
      for (const [cc, R] of app.room.solids()) for (const k of [0.11, -0.09]) {
        const d = Math.hypot(m.pos.x + fx * k - cc.x, m.pos.z + fz * k - cc.z) - (R + 0.075);
        if (d < -0.02 && issues.length < 40) issues.push(`in a solid thing (${cc.x.toFixed(2)},${cc.z.toFixed(2)}) by ${(-d * 100).toFixed(1)} cm at ${i} (act ${app.avatar.doing}${app.avatar.act?.phase ? '/' + app.avatar.act.phase : ''}, ${k > 0 ? 'chest' : 'hips'}, at ${m.pos.x.toFixed(2)},${m.pos.z.toFixed(2)} facing ${m.yaw.toFixed(2)}, ${m.posture})`);
      }
    }
    // (legs: a paw on the floor never across under the body to the other side, nor hanging off a
    // leg too short to reach it)
    if (!app.avatar.hidden && i % 3 === 0) {
      const kin = c.kin, body = c.body;
      for (const leg of ['LF', 'RF', 'LH', 'RH']) {
        if (!c.planted[leg] || c.stepper.feet[leg].stepping) continue;
        const L = body.legs[leg];
        const g = kin.wp[L.b[3]].clone().sub(kin.wp[L.girdle]).applyQuaternion(kin.wq[L.girdle].clone().invert());
        const across = g.x * L.side, miss = body.reached[leg].distanceTo(c.targ[leg]);
        const why = `act ${app.avatar.doing}${app.avatar.act?.phase ? '/' + app.avatar.act.phase : ''}, ${m.posture}, turning ${c.turnRate.toFixed(1)}, hips ${m.pose.hipYaw.toFixed(2)}/${m.pose.hipRoll.toFixed(2)}`;
        if (across < -0.05 && legIssues < 12) { legIssues++; issues.push(`${leg} across under the body by ${(-across * 100).toFixed(1)} cm at ${i} (${why})`); }
        if (miss > 0.05 && legIssues < 12) { legIssues++; issues.push(`${leg} short of its paw by ${(miss * 100).toFixed(1)} cm at ${i} (${why})`); }
      }
    }
    const moved = Math.hypot(m.pos.x - lastPos.x, m.pos.z - lastPos.z) > 0.002;
    lastPos.x = m.pos.x; lastPos.z = m.pos.z;
    const wants = (app.avatar.trip && !app.avatar.hidden && (!app.avatar.errand || app.avatar.errand.phase !== 'do'));
    stillFor = wants && !moved ? stillFor + 0.05 : 0;
    if (stillFor > 12) { issues.push(`stuck on a ${app.avatar.trip.kind} at ${i} (${app.avatar.errand ? app.avatar.errand.phase : ''}; act ${app.avatar.doing}, goal ${!!m.goal}, ${m.posture}, mind ${app.brain.mode}/${app.state.where}, last act started ${lastAct})`); stillFor = -1e9; }
    // the room's still things, merged into a few meshes, must never move or change
    if (i % 600 === 599) {
      app.stage.scene.updateMatrixWorld(true);
      const mv = app.room.stillMoved();
      if (mv.length) issues.push(`still things moved or changed at ${i}: ${mv.length} (${mv.slice(0, 3).map((o) => o.name || o.geometry.type).join(', ')})`);
    }
    if (i % 2400 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  app.stage.render();
  return { issues: issues.slice(0, 20), batch: app.room.batchCount, seen, drags, errands, laserUses, wandUses, returns, tosses, glasses, mug: app.room.mugUp ? 'up' : 'down', mode: app.brain.mode, doing: app.avatar.doing };
}, minutes);
console.log(JSON.stringify(report), 'errors:', errs.slice(0, 10));
await b.close();
