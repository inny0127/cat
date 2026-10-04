// node tools/touch_e2e.mjs: every gesture through real touch events, in a phone-sized, touch-
// emulating browser (CDP touch events, so the page sees pointerType 'touch' pointer events as on a
// phone): the radio, the print (credits), a long press (water), petting the cat (does it stay under
// the finger as the view comes in close), the laser pointer (taken off the sill, shone, lifted, put
// down with a tap on it in hand) and the feather wand (taken up, dangled, let go). Prints what
// happened and exits non-zero if anything did not. REEL_BASE=http://localhost:4173/ for a build.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto((process.env.REEL_BASE ?? 'http://localhost:5173/') + 'index.html');
await page.waitForFunction(() => window.__pcat, null, { timeout: 180000 });
await page.waitForTimeout(1500);
const cdp = await ctx.newCDPSession(page);
// (each event stamped with the time a finger would have made it: a software-rendered page takes
// them in slowly, as a phone does not, and a tap would read as a long press)
let clock = Date.now() / 1000;
const touch = (type, x, y, dt = 0.05) => {
  clock = Math.max(clock + dt, Date.now() / 1000 - 5);
  return cdp.send('Input.dispatchTouchEvent', { type, timestamp: clock, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 0.5 }] });
};
const tap = async (x, y) => { clock = Date.now() / 1000; await touch('touchStart', x, y, 0); await touch('touchEnd', x, y, 0.06); await page.waitForTimeout(900); };
const drag = async (pts, ms = 60) => {
  clock = Date.now() / 1000;
  await touch('touchStart', pts[0][0], pts[0][1], 0);
  for (const [x, y] of pts.slice(1)) { await page.waitForTimeout(ms); await touch('touchMove', x, y, ms / 1000); }
};
const at = (expr) => page.evaluate((e) => {
  const app = window.__pcat, V = app.cat.motor.pos.constructor;
  const o = eval(e), p = (o.isVector3 ? o.clone() : o.getWorldPosition(new V())).project(app.stage.camera);
  return [(p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight];
}, expr);
const get = (fn) => page.evaluate(fn);
const results = [];
const check = (what, ok, detail = '') => results.push([what, ok, detail]);

// (a first touch somewhere empty: the sound starts with it)
await tap(30, 300);
await page.waitForTimeout(1200);

// the radio, on and off again
const music0 = await get(() => window.__pcat.audio.musicOn);
const [rx, ry] = await at('app.room.radio');
await tap(rx, ry);
check('the radio switched by a tap', (await get(() => window.__pcat.audio.musicOn)) === !music0);
await tap(rx, ry);

// the print: the credits, shut again by a tap anywhere
const [px, py] = await at('app.room.print');
await tap(px, py);
check('the credits opened from the print', await get(() => window.__pcat.creditsOpen));
await tap(195, 140);
check('the credits shut by a tap', !(await get(() => window.__pcat.creditsOpen)));

// a long press on an empty bit of floor: water poured
const w0 = await get(() => window.__pcat.state.water);
clock = Date.now() / 1000;
await touch('touchStart', 60, 770, 0);
await page.waitForTimeout(2200);
await touch('touchEnd', 60, 770, 2.2);
await page.waitForTimeout(500);
const w1 = await get(() => window.__pcat.state.water);
check('a long press poured water', w1 > w0 + 0.03, `${w0.toFixed(2)} -> ${w1.toFixed(2)}`);

// petting: a finger down on the middle of the cat and stroked a while; it should stay on the cat
// as the view comes in close
const [cx, cy] = await get(() => {
  const app = window.__pcat;
  const p = app.cat.motor.pos.clone();
  p.y = 0.12;
  const q = p.project(app.stage.camera);
  const sx = (q.x * 0.5 + 0.5) * innerWidth, sy = (-q.y * 0.5 + 0.5) * innerHeight;
  const hits = [];
  for (let dx = -90; dx <= 90; dx += 4) for (let dy = -60; dy <= 60; dy += 4) if (app.senses.hitNear(sx + dx, sy + dy, 0)) hits.push([sx + dx, sy + dy]);
  if (!hits.length) return [sx, sy];
  const mx = hits.reduce((s, h) => s + h[0], 0) / hits.length, my = hits.reduce((s, h) => s + h[1], 0) / hits.length;
  hits.sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my));
  return hits[0];
});
clock = Date.now() / 1000;
await touch('touchStart', cx, cy, 0);
let onCat = 0;
const lost = [];
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(80);
  const x = cx + 8 * Math.sin(i * 0.5);
  await touch('touchMove', x, cy, 0.08);
  const s = await page.evaluate(([x, y]) => {
    const a = window.__pcat, an = a.anchor;
    let p = null;
    if (an) { const q = an.at.clone().project(a.stage.camera); p = [Math.round((q.x * 0.5 + 0.5) * innerWidth), Math.round((-q.y * 0.5 + 0.5) * innerHeight)]; }
    return { on: a.input.onCat().length > 0, at: p, focus: +a.focus.toFixed(2), mode: a.brain.mode, doing: a.avatar.doing, posture: a.cat.motor.targetPosture, finger: [Math.round(x), Math.round(y)] };
  }, [x, cy]);
  if (s.on) onCat++;
  else lost.push(s);
}
await touch('touchEnd', cx, cy, 0.08);
const focus = await get(() => window.__pcat.focus);
check('petting: the cat stayed under the finger', onCat >= 20, `${onCat}/24, view ${focus.toFixed(2)} of the way in`);
if (lost.length && process.env.VERBOSE) console.log(JSON.stringify(lost));
// (the close view lets go nine seconds of the page's time after the hand, a minute and more of
// a software-rendered page's: let it go now, and wait for the room again, the cat back in its bed
// asleep, out of the way of the toys)
await get(() => { const a = window.__pcat; a.focusHold = 0; a.brain.toSleep(0.9); a.avatar.startAct('bed'); });
await page.waitForFunction(() => window.__pcat.focus < 0.05, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1000);
if (process.env.VERBOSE) console.log('before the toys:', JSON.stringify(await get(() => { const a = window.__pcat; return { focus: a.focus, focusT: a.focusT, contacts: a.input.contacts.size, mode: a.brain.mode }; })));

// the laser pointer: tapped on the sill, taken up; shone over the floor; lifted; a tap on it in
// hand puts it back
const [lx, ly] = await at('app.room.pointerHome');
await tap(lx, ly);
check('the laser pointer taken up', await get(() => window.__pcat.laser.held));
await drag([[150, 720], [170, 715], [200, 705], [230, 700], [250, 698]]);
await page.waitForTimeout(600);
check('the red dot shining', await get(() => !!window.__pcat.avatar.laser));
await touch('touchEnd', 250, 698);
await page.waitForTimeout(1500);
const [hx, hy] = await at('app.room.heldPointer.localToWorld(app.room.heldPointer.position.clone().set(0.035, 0, 0))');
await tap(hx, hy);
check('the laser pointer put down by a tap on it', !(await get(() => window.__pcat.laser.held)));

// the wand: taken up by its feathers, dangled, let go
await page.waitForTimeout(300);
const [fx, fy] = await at('app.room.lureAt()');
if (process.env.VERBOSE) console.log('wand:', JSON.stringify(await page.evaluate(([x, y]) => { const a = window.__pcat; return { contacts: [...a.input.contacts.values()].map((c) => [Math.round(c.sx), Math.round(c.sy), c.onCat, c.startedOnCat]), focusT: a.focusT, hold: +a.focusHold.toFixed(1), at: [Math.round(x), Math.round(y)], hitWand: a.hitWand(x, y), yarn: a.hitThing(a.room.yarnBall, x, y, 26), cat: !!a.senses.hitNear(x, y), laser: a.laser.held, focus: +a.focus.toFixed(2), credits: a.creditsOpen, mess: a.room.mess ?? null }; }, [fx, fy])));
await drag([[fx, fy], [fx + 10, fy - 20], [fx + 30, fy - 60], [fx + 10, fy - 90], [fx - 20, fy - 60]], 80);
await page.waitForTimeout(600);
check('the wand taken up and dangled', await get(() => window.__pcat.room.wandHeld));
await touch('touchEnd', fx - 20, fy - 60);
await page.waitForTimeout(600);
check('the wand let go', !(await get(() => window.__pcat.room.wandHeld)));

check('no errors on the page', errs.length === 0, errs.join(' | ').slice(0, 300));
for (const [what, ok, detail] of results) console.log(ok ? 'ok  ' : 'FAIL', what.padEnd(46), detail);
await b.close();
process.exit(results.every((r) => r[1]) ? 0 : 1);
