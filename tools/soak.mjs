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
  const acts = ['wander', 'sun', 'play', 'sill', 'window', 'groom', 'yawn', 'stretch', 'bed'];
  const issues = [];
  let t = 1, seen = {}, drag = null, drags = 0;
  const ev = (x, y, t) => ({ preventDefault() {}, pointerId: 9, clientX: x, clientY: y, timeStamp: t * 1000, pointerType: 'touch', pressure: 0.5, width: 20, height: 20, buttons: 1 });
  app.brain.toAwake('rest');
  app.state.trust = 0.6;
  const steps = Math.round(minutes * 60 / 0.05);
  for (let i = 0; i < steps; i++) {
    t += 0.05;
    if (i % 600 === 0) app.hourOverride = String(Math.floor(Math.random() * 24) + Math.random());
    if (i % 1500 === 0) app.rainOverride = Math.random() < 0.3 ? '1' : '0';
    if (i % 400 === 0 && Math.random() < 0.6) { const a = acts[Math.floor(Math.random() * acts.length)]; app.avatar.startAct(a); }
    if (i % 2000 === 1000 && Math.random() < 0.3) app.brain.toSleep(0.7);
    if (i % 900 === 450 && Math.random() < 0.5) app.room.letBugIn(Math.random() < 0.5 ? 'moth' : 'fly');
    if (i % 2000 === 1500) app.brain.toAwake('rest');
    // now and then a finger takes the ball of wool and drags it about a few seconds
    if (i % 300 === 0 && !drag && Math.random() < 0.4) {
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
    try { app.tick(0.05, t); } catch (e) { issues.push('tick: ' + e.message); break; }
    const yp = app.room.yarnAt();
    const yb = app.room.yarnBounds;
    if (![yp.x, yp.z].every(Number.isFinite) || yp.x < yb.minX - 1e-3 || yp.x > yb.maxX + 1e-3 || yp.z < yb.minZ - 1e-3 || yp.z > yb.maxZ + 1e-3) issues.push(`yarn out at ${i}: ${yp.x},${yp.z}`);
    const m = app.cat.motor, c = app.cat;
    const d = app.avatar.doing;
    if (d) seen[d] = (seen[d] || 0) + 1;
    if (![m.pos.x, m.pos.z, m.yaw].every(Number.isFinite)) { issues.push(`NaN at ${i}`); break; }
    if (c.perch !== null && !(app.avatar.act && app.avatar.act.name === 'sill')) issues.push(`perched without the sill act at ${i}`);
    if (c.liftHold !== null && !(app.avatar.act && app.avatar.act.name === 'sill')) issues.push(`held in the air without the sill act at ${i}`);
    if (Math.abs(m.pos.x) > 3 || Math.abs(m.pos.z) > 3) issues.push(`far away ${m.pos.x.toFixed(2)},${m.pos.z.toFixed(2)} at ${i}`);
    if (i % 2400 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  app.stage.render();
  return { issues: issues.slice(0, 20), seen, drags, mode: app.brain.mode, doing: app.avatar.doing };
}, minutes);
console.log(JSON.stringify(report), 'errors:', errs.slice(0, 10));
await b.close();
