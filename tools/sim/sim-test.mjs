// Headless simulation test: runs the game's host simulation in Node with no page and no renderer.
//   cd tools/sim && npm install && node sim-test.mjs [--strict] [--json] [--browser-view]
// 1. builds the game module from src/ (bundle.mjs) and loads it against a stand-in browser (env.mjs)
// 2. plays a scripted solo session (props, NPCs, a car) at 60 Hz and at the governor's 30 Hz level, and checks the physics
// 3. lists every call the simulation makes into presentation code (renderer, UI, audio, effects, DOM). That list is the
//    to-do list for splitting the simulation out (phase 1); --strict fails while it is not empty.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sim, setClock, ghost } from './env.mjs';
import { buildSimBundle, staticCoupling, PRESENTATION } from './bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), OUT = join(HERE, '.out');
const STRICT = process.argv.includes('--strict'), JSON_OUT = process.argv.includes('--json');
// by default the View hooks stay no-ops, the way the host worker will run; --browser-view keeps the mesh code (09_view.js)
const BROWSER_VIEW = process.argv.includes('--browser-view');

mkdirSync(OUT, { recursive: true });
const { code, where } = buildSimBundle();
const bundlePath = join(OUT, 'sim.mjs'); writeFileSync(bundlePath, code);

// ---- recording presentation calls ------------------------------------------------------------------
Error.stackTraceLimit = 60;
const touches = new Map(), failures = new Map(), bundleUrl = pathToFileURL(bundlePath).href;
const presentationFns = new Set(), PASS_THROUGH = new Set(['$', '$$']);   // DOM query helpers: report whoever called them
let depth = 0;   // inside a presentation call: what it does in turn is its own business
function callerOf(stack) {
  for (const ln of stack.split('\n').slice(1)) {
    const m = ln.match(/at (?:async )?(?:(.+?) \()?(file:\/\/\/.+?):(\d+):\d+\)?$/);
    if (!m || m[2] !== bundleUrl) continue;
    const w = where(+m[3]), fn = (m[1] || '').replace(/^Object\./, '').replace(/^new /, '');
    if (PASS_THROUGH.has(w.decl)) continue;
    if (PRESENTATION.includes(w.decl) || presentationFns.has(w.decl)) return null;   // presentation calling presentation
    const name = !fn || fn === w.decl ? w.decl : fn.includes('.') ? fn : `${w.decl}.${fn}`;
    return { name, at: `${w.file}:${w.line}` };
  }
  return null;
}
function record(sym) {
  if (depth > 0) return;
  const c = callerOf(new Error().stack); if (!c) return;
  const k = c.name + '\u0000' + sym, t = touches.get(k) || { caller: c.name, sym, n: 0, at: c.at }; t.n++; touches.set(k, t);
}
sim.onTouch = what => record(what);
function wrapFn(sym, f) {
  return function (...a) {
    record(sym); depth++;
    try { const r = f.apply(this, a); return r; }
    catch (e) { failures.set(sym, (failures.get(sym) || 0) + 1); return ghost(sym); }   // headless: a presentation call that needs the page
    finally { depth--; }
  };
}
// each presentation object is swapped for a proxy: methods are wrapped, property reads recorded, and state the page
// would have set up (R.sky, R.renderer, ...) answers with a ghost instead of undefined
function presentationProxy(name, target) {
  const cache = new Map();
  return new Proxy(target, {
    get(t, k) {
      if (typeof k === 'symbol') return Reflect.get(t, k);
      const has = k in t, v = t[k];
      if (typeof v === 'function') { let w = cache.get(k); if (!w || w.__f !== v) { w = wrapFn(`${name}.${k}`, v); w.__f = v; cache.set(k, w); } return w; }
      record(`${name}.${k}`);
      return !has && v === undefined ? ghost(`${name}.${k}`) : v;
    },
  });
}
function instrument(mods) {
  mods.__proxyObjects(presentationProxy);
  mods.__instrument((n, f) => { presentationFns.add(n); return wrapFn(n + '()', f); });
}

// ---- run ----------------------------------------------------------------------------------------------
const results = [], log = (...a) => { if (!JSON_OUT) console.log(...a); };
let ok = true;
const check = (name, pass, detail) => { results.push({ name, pass, detail }); if (!pass) ok = false; log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? '  (' + detail + ')' : ''}`); };

const mods = await import(pathToFileURL(bundlePath).href);
const { Phys, World, Players, Auth, Net, Game, Rules, Env, THREE, R, View, VIEW_NONE } = mods;
R.scene = new THREE.Scene(); R.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 2000);   // shared code still adds meshes to these
instrument(mods);
if (!BROWSER_VIEW) Object.assign(View, VIEW_NONE);   // nothing is drawn: entities get no meshes, players no avatars

let clock = 1; setClock(clock);
await Phys.init(); Players.init(); View.init();

function startSession(level) {
  Game.resetForPlay(); Net.startOffline();
  Players.add({ id: 'local', name: 'Sim', color: '#ff9f43', tier: 'medium', idx: 0, joinOrder: 0, isLocal: true, lvl: 1 });
  const me = Players.local; Players.setPos(me, Auth.pickSpawn()); me.yaw = 0; me.pitch = 0; me.hp = 100; me.dead = false; me.seat = 0;
  Game.state = 'playing'; Env.update(); Game.setPhysLevel(level);
  return me;
}
// steps the host simulation; watch(t) is called every ~0.1 s of simulated time
function run(seconds, watch) {
  const dt = Game.stepDt, n = Math.round(seconds / dt), every = Math.max(1, Math.round(0.1 / dt)); let ms = 0;
  for (let i = 0; i < n; i++) {
    clock += dt; setClock(clock); const t0 = process.hrtime.bigint(); Game.fixedStep(dt); ms += Number(process.hrtime.bigint() - t0) / 1e6;
    if (watch && i % every === 0) watch((i + 1) * dt);
  }
  return ms / n;
}
const speedOf = b => { const v = b.linvel(); return Math.hypot(v.x, v.y, v.z); };
const spawn = (item, x, y, z) => Auth.handle('local', { t: 'spawn', item, p: [x, y, z], yaw: 0 });
const bodyUp = b => { const r = b.rotation(); return 1 - 2 * (r.x * r.x + r.z * r.z); };

for (const level of [0, 2]) {
  log(`\nsession at ${level ? '30 Hz (governor level 2)' : '60 Hz'}`);
  const me = startSession(level), base = me.pos.clone();
  const before = new Set(World.ents.keys());
  const kinds = ['crate', 'barrel', 'ball', 'plank', 'melon', 'cone'];
  for (let i = 0; i < 60; i++) spawn(kinds[i % kinds.length], base.x + 20 + (i % 6) * 1.2, base.y + 1 + Math.floor(i / 6) * 1.1, base.z);
  for (let i = 0; i < 6; i++) spawn('npc', base.x - 20 + i * 3, base.y + 0.5, base.z - 6);
  spawn('car', base.x, base.y + 1.5, base.z + 18);
  let topSpeed = 0;   // after the drop (2 s): a body this fast means the solver blew something apart
  const msPerStep = run(10, t => { if (t > 2) for (const e of World.ents.values()) if (e.body && e.d.k !== 'map' && !e.body.isSleeping()) topSpeed = Math.max(topSpeed, speedOf(e.body)); });
  const fresh = [...World.ents.values()].filter(e => !before.has(e.id) && e.body);
  const props = fresh.filter(e => e.d.k !== 'part' && !e.d.veh && e.d.k !== 'map'), groups = [...World.groups.values()].filter(g => g.t === 'npc');
  const car = fresh.find(e => e.d.veh);
  check('everything spawned', props.length >= 60 && groups.length === 6 && !!car, `${props.length} props, ${groups.length} NPCs, car ${car ? 'yes' : 'no'}`);
  // round props keep rolling (the engine has no rolling resistance), so only boxy ones are expected to stop
  const round = e => ['ball', 'cyl', 'cone'].includes(e.d.sh.t) || ['melon', 'barrel', 'cone', 'ball'].includes(e.d.vis);
  const boxy = props.filter(e => !round(e)), asleep = props.filter(e => e.body.isSleeping()).length;
  const still = boxy.filter(e => speedOf(e.body) < 0.15).length, rolling = props.filter(e => round(e) && speedOf(e.body) >= 0.15).length;
  const lowest = Math.min(...props.map(e => e.body.translation().y));
  check('boxy props come to rest', still >= boxy.length * 0.95, `${still}/${boxy.length} still after 10 s; ${asleep}/${props.length} of all props asleep, ${rolling} round ones still rolling`);
  if (process.argv.includes('--why')) { const mv = {}; for (const e of props) if (speedOf(e.body) >= 0.15) { const k = (e.d.vis || e.d.sh.t) + ' ' + speedOf(e.body).toFixed(1); mv[k] = (mv[k] || 0) + 1; } log('    still moving:', JSON.stringify(mv)); }
  check('nothing falls through the ground', lowest > -0.5, `lowest y ${lowest.toFixed(2)}`);
  check('nothing gets blown apart', topSpeed < 30, `fastest body after the drop ${topSpeed.toFixed(1)} m/s`);
  const standing = groups.filter(g => { const e = World.ents.get(g.parts[0]); return e && e.body && e.body.translation().y > 0.8; }).length;
  check('NPCs stay on their feet', standing === groups.length, `${standing}/${groups.length} standing`);
  if (car) { const v = car.body.linvel(); check('car rests upright', bodyUp(car.body) > 0.9 && Math.hypot(v.x, v.y, v.z) < 0.5, `up ${bodyUp(car.body).toFixed(2)}, speed ${Math.hypot(v.x, v.y, v.z).toFixed(2)}`); }
  log(`  ${msPerStep.toFixed(2)} ms per step in Node (${fresh.length} bodies)`);
}

// ---- coupling report ------------------------------------------------------------------------------------
const list = [...touches.values()].sort((a, b) => a.caller.localeCompare(b.caller) || b.n - a.n);
const byCaller = new Map(); for (const t of list) { if (!byCaller.has(t.caller)) byCaller.set(t.caller, []); byCaller.get(t.caller).push(t); }
const stat = staticCoupling(), clean = list.length === 0 && stat.length === 0;
writeFileSync(join(OUT, 'coupling.json'), JSON.stringify({ results, touches: list, static: stat, failures: Object.fromEntries(failures) }, null, 2));
if (JSON_OUT) console.log(JSON.stringify({ ok, results, touches: list.length, static: stat.length }));
else {
  console.log(`\nSimulation -> presentation calls: ${list.length} distinct, from ${byCaller.size} places`);
  for (const [caller, ts] of byCaller) console.log(`  ${caller.padEnd(28)} ${ts[0].at.padEnd(26)} ${ts.map(t => `${t.sym}${t.n > 1 ? ' ×' + t.n : ''}`).join(', ')}`);
  if (failures.size) console.log(`\nPresentation calls that failed without a page (absorbed): ${[...failures.keys()].join(', ')}`);
  console.log(`\nSimulation code using presentation-side names (static, whole source): ${stat.length} modules`);
  for (const s of stat) console.log(`  ${s.sim.padEnd(28)} ${s.at.padEnd(26)} ${s.uses.join(', ')}`);
  console.log(`\n${ok ? 'PHYSICS OK' : 'PHYSICS FAILED'}${STRICT ? (clean ? ', coupling clean' : ', coupling not clean (--strict)') : ''}`);
}
process.exit(ok && (!STRICT || clean) ? 0 : 1);
