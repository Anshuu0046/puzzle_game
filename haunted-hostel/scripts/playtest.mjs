// Automated playthrough of all five chapters (and the bad + secret endings) using the debug API.
// Usage: node scripts/playtest.mjs [baseUrl]   (dev server or `vite preview`)
// Writes screenshots to screenshots/play-*.png and exits non-zero on any failure or page error.
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5174/';
const exe = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: exe,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const errors = [];
let page;
let shotN = 0;

async function open(query = '') {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(`${BASE}?autostart&debug${query}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForFunction(() => document.querySelector('.menu'), null, { timeout: 60000 });
  await page.evaluate(() => {
    window.__hh.world.lift.speed = 4;
    window.__hh.dbg.sim(4);
  });
}

const run = (js) => page.evaluate(js);
const info = () => run('__hh.dbg.info()');
async function until(js, timeout = 120000, label = js) {
  try {
    await page.waitForFunction(js, null, { timeout, polling: 250 });
  } catch {
    const i = await info();
    throw new Error(`Timed out waiting for: ${label}\nstate: ${JSON.stringify(i)}`);
  }
}
async function shot(name) {
  shotN++;
  // Render one real frame (the simulation otherwise runs headless-fast without drawing).
  await page.evaluate(() => {
    const s = __hh.simOnly;
    __hh.simOnly = 0;
    __hh.update(0.016);
    __hh.dbg.frame();
    __hh.simOnly = s;
  });
  await page.screenshot({ path: `screenshots/play-${String(shotN).padStart(2, '0')}-${name}.png` });
}
async function clickText(sel, text) {
  await page.evaluate(
    ([s, t]) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim() === t);
      if (!el) throw new Error(`no ${s} with text ${t}`);
      el.click();
    },
    [sel, text],
  );
}
async function closeDoc() {
  await until('document.querySelectorAll(".docview").length === 1', 20000, 'document open');
  await clickText('.doc-nav button', 'CLOSE');
  await until('__hh.mode === "play" && !document.querySelector(".docview")', 20000, 'back to play');
}
async function dial(code, expectOpen = true) {
  await until('document.querySelectorAll(".dials").length === 1', 20000, 'code lock');
  for (let i = 0; i < code.length; i++) {
    const n = Number(code[i]);
    for (let k = 0; k < n; k++) await page.evaluate((idx) => document.querySelectorAll('.dial')[idx].querySelector('button').click(), i);
  }
  await clickText('.puzzle button', 'TRY');
  if (!expectOpen) {
    await page.waitForTimeout(500);
    await clickText('.puzzle button', 'STEP BACK');
  }
  await until('__hh.mode === "play" && !document.querySelector(".puzzle")', 20000, 'lock closed');
}
const step = (name) => console.log(`\n▶ ${name}`);
const expectState = async (cond, label) => {
  const ok = await run(cond);
  if (!ok) throw new Error(`Expectation failed: ${label}\nstate: ${JSON.stringify(await info())}`);
  console.log(`  ✓ ${label}`);
};

try {
  await open();
  await shot('menu');

  // ------------------------------------------------------------- Chapter 1
  step('Chapter 1 — arrival');
  await run('__hh.newGame()');
  await until('__hh.mode === "play"');
  await expectState('__hh.dbg.info().chapter === 1 && __hh.dbg.info().objective === "obj.enter"', 'chapter 1 starts at the gate');
  await shot('gate');
  await run('__hh.dbg.act("gate")');
  await page.waitForTimeout(1500);
  await run('__hh.dbg.tp(18, 0, 20, 0)');
  await page.waitForTimeout(800);
  await run('__hh.dbg.tp(18, 0, 6.5, 0)');
  await shot('porch');
  await run('__hh.dbg.tp(17.5, 0, 3.0, 0)');
  await until('__hh.dbg.info().objective === "obj.security"', 20000);
  await run('__hh.dbg.tpPoint("security", Math.PI)');
  await until('__hh.dbg.info().objective === "obj.roomKey"', 20000);
  await shot('security-room');
  await run('__hh.dbg.act("keyboard")');
  await expectState('__hh.dbg.info().inventory.includes("key_214") && __hh.dbg.info().inventory.includes("key_electrical")', 'took keys');
  await run('__hh.dbg.act("diya")');
  await run('__hh.dbg.act("battery_security")');
  await run('__hh.dbg.act("note_breakers")');
  await closeDoc();
  // Electrical room.
  const elec = await run('__hh.dbg.doorCenter("electrical")');
  await run(`__hh.dbg.tp(${elec[0]}, 0, -0.4, 0)`);
  await run('__hh.dbg.act("door:electrical")');
  await page.waitForTimeout(300);
  await run('__hh.dbg.act("door:electrical")');
  await page.waitForTimeout(1500);
  await run('__hh.dbg.tpPoint("electrical", 0)');
  await shot('electrical-room');
  await run('__hh.dbg.act("breakers")');
  await until('document.querySelector(".breaker-panel")', 20000);
  await shot('breaker-puzzle');
  // Wrong order first: trips.
  for (const idx of [0, 2]) await page.evaluate((i) => document.querySelectorAll('.breaker')[i].click(), idx);
  await expectState('document.querySelector(".breaker-status").textContent.includes("TRIPPED")', 'wrong order trips the panel');
  for (const idx of [0, 3, 1, 2]) await page.evaluate((i) => document.querySelectorAll('.breaker')[i].click(), idx);
  await until('__hh.mode === "play"', 20000);
  await expectState('__hh.dbg.info().flags.includes("power") && __hh.dbg.info().objective === "obj.reachRoom"', 'power restored');
  await page.waitForTimeout(2500);
  await run('__hh.dbg.tp(9, 0, 0, -Math.PI/2)');
  await shot('gf-corridor-lit');
  // The lift ride: stops at the floor that doesn't exist.
  await run('__hh.dbg.tpPoint("liftG", 0)');
  await run('__hh.dbg.act("liftCallG")');
  await until('__hh.world.lift.state === "open"', 60000, 'lift open at G');
  await run('__hh.dbg.tp(1.65, 0, 2.5, 0)');
  await page.waitForTimeout(400);
  await run('__hh.world.lift.go("2")');
  await until('__hh.world.lift.current === "3" && __hh.world.lift.state === "open"', 120000, 'lift stops at 3');
  await run('__hh.dbg.lookAt(1.65, 11.4, 0.2)');
  await shot('lift-floor-three');
  await until('__hh.world.lift.current === "2" && __hh.world.lift.state === "open"', 120000, 'lift continues to 2');
  await expectState('__hh.dbg.info().player[1] > 6.5', 'player rode the lift to the second floor');
  // Room 214.
  const d214 = await run('__hh.dbg.doorCenter("room214")');
  await run(`__hh.dbg.tp(${d214[0]}, 6.8, 0.5, Math.PI)`);
  await shot('second-floor-corridor');
  await run('__hh.dbg.act("door:room214")');
  await page.waitForTimeout(200);
  await run('__hh.dbg.act("door:room214")');
  await page.waitForTimeout(1500);
  await run('__hh.dbg.tpPoint("room214", Math.PI)');
  await until('__hh.dbg.info().chapter === 2', 30000, 'chapter 2');
  await shot('room-214');

  // ------------------------------------------------------------- Chapter 2
  step('Chapter 2 — the empty floor');
  await expectState('__hh.dbg.info().objective === "obj.knock"', 'investigate knocking');
  const d217 = await run('__hh.dbg.doorCenter("room217")');
  await run(`__hh.dbg.tp(${d217[0]}, 6.8, 0.3, Math.PI)`);
  await until('__hh.dbg.info().objective === "obj.into217"', 20000);
  await shot('door-217-sealed');
  await run('__hh.dbg.act("door:room217")');
  await run('__hh.dbg.tpPoint("room218", 0)');
  await page.waitForTimeout(1500);
  await run('__hh.dbg.tpPoint("room216", 0)');
  await run('__hh.dbg.act("note216")');
  await closeDoc();
  await until('__hh.dbg.info().objective === "obj.wardenKey"', 20000);
  await run('__hh.dbg.tp(23.4, 0, -0.5, Math.PI)');
  await until('__hh.world.doors.get("warden").isOpen', 30000, 'warden door opens by itself');
  await page.waitForTimeout(2500);
  await run('__hh.dbg.tpPoint("warden", -Math.PI/2)');
  await until('__hh.dbg.info().objective === "obj.cabinetCode"', 20000);
  await shot('warden-office');
  await run('__hh.dbg.act("keycabinet")');
  await dial('1111', false);
  await expectState('!__hh.dbg.info().flags.includes("cabinetOpen")', 'wrong code rejected');
  await run('__hh.dbg.act("keycabinet")');
  await dial('1411');
  await expectState('__hh.dbg.info().inventory.includes("key_217")', 'got the 217 key');
  await run(`__hh.dbg.tp(${d217[0]}, 6.8, 0.3, Math.PI)`);
  await run('__hh.dbg.act("door:room217")');
  await page.waitForTimeout(200);
  await run('__hh.dbg.act("door:room217")');
  await until('__hh.dbg.info().objective === "obj.search217"', 20000);
  await run('__hh.dbg.tpPoint("room217", Math.PI)');
  await page.waitForTimeout(1000);
  await shot('room-217');
  await run('__hh.dbg.act("id_card")');
  await run('__hh.dbg.act("photo")');
  await run('__hh.dbg.act("diary")');
  await shot('diary');
  for (let i = 0; i < 5; i++) await clickText('.doc-nav button', '›');
  await closeDoc();
  await until('__hh.dbg.info().chapter === 3', 30000, 'chapter 3');

  // ------------------------------------------------------------- Chapter 3
  step('Chapter 3 — something is here');
  await page.waitForTimeout(1500);
  await run('__hh.dbg.tp(15, 6.8, 0, -Math.PI/2)');
  await page.waitForTimeout(2500);
  await shot('corridor-apparition');
  await run('__hh.dbg.tpPoint("bathroom", Math.PI)');
  await page.waitForTimeout(500);
  await run('(() => { const m = __hh.mirror.position; __hh.dbg.lookAt(m.x, m.y, m.z); })()');
  await until('__hh.dbg.info().scares.includes("mirror")', 20000, 'mirror scare');
  await page.waitForTimeout(300);
  await shot('mirror-scare');
  await run('__hh.dbg.tpPoint("cctv-view", -Math.PI/2)');
  await run('__hh.dbg.act("cctv")');
  await until('__hh.mode === "cctv"', 20000);
  await shot('cctv');
  for (const cam of [5, 4, 1]) {
    await run(`__hh.cctv.select(${cam})`);
    await until(`__hh.cctv.puzzle.step > ${[5, 4, 1].indexOf(cam)} || __hh.cctv.puzzle.solved`, 60000, `cctv step ${cam}`);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1200);
  await shot('cctv-behind-you');
  await until('__hh.dbg.info().inventory.includes("cctv_recording")', 90000, 'cctv recording');
  await run('__hh.cctv.hide()');
  await until('__hh.dbg.info().chapter === 4', 30000, 'chapter 4');

  // ------------------------------------------------------------- Chapter 4
  step('Chapter 4 — the truth');
  await run('__hh.dbg.godMode(true)');
  await run('__hh.dbg.tpPoint("study", -Math.PI/2)');
  await run('__hh.dbg.act("blackboard")');
  await expectState('__hh.dbg.info().objective === "obj.records"', 'cipher found');
  await shot('study-room');
  await run('__hh.dbg.tp(31.5, 10.2, -0.8, Math.PI)');
  await run('__hh.dbg.act("dupatta")');
  await shot('terrace');
  await run('__hh.dbg.tp(2.4, 10.2, -0.6, Math.PI)');
  await run('__hh.dbg.act("bricks")');
  await shot('bricked-landing');
  await run('__hh.dbg.tpPoint("warden", -Math.PI/2)');
  await run('__hh.dbg.act("door:recordsInner")');
  await dial('2709');
  await expectState('__hh.dbg.info().flags.includes("recordsOpen")', 'records room opened');
  await page.waitForTimeout(1500);
  await run('__hh.dbg.tpPoint("records", Math.PI)');
  await shot('records-room');
  await run('__hh.dbg.act("newspaper")');
  await closeDoc();
  await run('__hh.dbg.act("final_evidence")');
  await closeDoc();
  await until('__hh.dbg.info().chapter === 5', 30000, 'chapter 5');

  // ------------------------------------------------------------- Chapter 5
  step('Chapter 5 — escape');
  await run('__hh.dbg.sim(1)');
  await shot('blackout');
  await run('__hh.dbg.tpPoint("security", Math.PI)');
  await until('["INVESTIGATE","CHASE","SEARCH","RETREAT"].includes(__hh.dbg.info().ai)', 60000, 'ghost hunts after the blackout');
  await run('__hh.dbg.sim(0)');
  await run(
    '__hh.dbg.tp(9, 0, 0, Math.PI / 2); __hh.ai.placeAt(new __hh.player.pos.constructor(4, 0, 0.1), -Math.PI / 2, "IDLE"); __hh.ai.forceChase(__hh.player.pos)',
  );
  await run('(() => { for (let i = 0; i < 6; i++) __hh.update?.(0.05); })()');
  await run('(() => { const g = __hh.ghost.pos; __hh.dbg.lookAt(g.x, g.y + 1.5, g.z); __hh.player.applyCamera(1); })()');
  await shot('chase');
  await run('__hh.dbg.sim(4)');
  // Save during the hunt is blocked; hide in a cupboard.
  await run('__hh.dbg.tpPoint("security", Math.PI)');
  await until('__hh.ai.debug === "player safe" && __hh.dbg.info().ai !== "CHASE"', 30000, 'security room is a safe room');
  console.log('  ✓ security room is a safe room');
  await run('__hh.dbg.godMode(true)');
  await run('__hh.dbg.act("hide:security-almirah")');
  await page.waitForTimeout(1500);
  await expectState('__hh.hiding.hidden', 'hidden in the almirah');
  await shot('hiding');
  await run('__hh.hiding.leave()');
  await page.waitForTimeout(1200);
  await run('__hh.dbg.tpPoint("room217", Math.PI)');
  await run('__hh.dbg.act("ritual")');
  await until('__hh.dbg.info().flags.includes("ritualDone")', 20000, 'ritual');
  await page.waitForTimeout(2500);
  await shot('ritual');
  await until('__hh.dbg.info().objective === "obj.escape"', 30000);
  await expectState('__hh.world.lift.forcePower === true', 'secret: lift waits after the ritual');
  await run('__hh.dbg.godMode(true)');
  await run('__hh.dbg.tp(18, 0, 20, 0)');
  await page.waitForTimeout(800);
  await run('__hh.dbg.tp(18, 0, 33.5, Math.PI)');
  await until('__hh.dbg.info().mode === "ending"', 30000, 'good ending');
  await page.waitForTimeout(4500);
  await shot('ending-good');
  await page.close();

  // ------------------------------------------------------------- Bad ending
  step('Bad ending — caught');
  await open();
  await run('__hh.newGame()');
  await until('__hh.mode === "play"');
  await run('__hh.dbg.tp(9, 0, 0, Math.PI/2)');
  await run(
    '__hh.ai.placeAt(new __hh.player.pos.constructor(6, 0, 0), Math.PI/2, "IDLE"); __hh.ai.aggression = 1; __hh.ai.forceChase(__hh.player.pos)',
  );
  await until('__hh.dbg.info().mode === "caught" || __hh.dbg.info().mode === "ending"', 60000, 'caught');
  await shot('caught');
  await until('__hh.dbg.info().ending === "bad"', 30000);
  await page.waitForTimeout(4500);
  await shot('ending-bad');
  await page.close();

  // ------------------------------------------------------------- Secret ending (from a save)
  step('Secret ending — floor three');
  await open();
  await run('__hh.newGame()');
  await until('__hh.mode === "play"');
  await run(
    `(() => { const d = __hh.dbg; ['power','blackout','sawBricks','sawDupatta'].forEach(d.flag); ['id_card','photo','diary','diya','final_evidence'].forEach(d.give); })()`,
  );
  await run('__hh.dbg.setChapter(5)');
  await run('__hh.dbg.tpPoint("room217", Math.PI)');
  await page.waitForTimeout(500);
  await run('__hh.dbg.act("ritual")');
  await until('__hh.world.lift.forcePower === true', 30000, 'lift invites');
  await run('__hh.dbg.godMode(true)');
  await until('__hh.world.lift.state === "open" && __hh.world.lift.current === "2"', 60000);
  await run('__hh.dbg.tp(1.65, 6.8, 2.5, 0)');
  await page.waitForTimeout(400);
  await run('__hh.world.lift.go("3")');
  await until('__hh.world.lift.current === "3" && __hh.world.lift.state === "open"', 120000, 'arrives at 3');
  await page.waitForTimeout(1500);
  await run('__hh.dbg.lookAt(1.3, 9.9, 0.55)');
  await shot('secret-remains');
  await run('__hh.dbg.act("herPhone")');
  await until('__hh.dbg.info().ending === "secret"', 30000);
  await page.waitForTimeout(4500);
  await shot('ending-secret');
} catch (e) {
  console.error('\n✗ PLAYTEST FAILED:', e.message);
  if (page) await page.screenshot({ path: 'screenshots/play-failure.png' }).catch(() => {});
  errors.push(e.message);
}
await browser.close();
const real = errors.filter((e) => !/KHR_parallel_shader_compile|GPU stall|WebGL: INVALID_VALUE|Autoplay/.test(e));
if (real.length) {
  console.error('\nErrors:\n' + real.join('\n'));
  process.exit(1);
}
console.log('\n✓ Playtest passed');
