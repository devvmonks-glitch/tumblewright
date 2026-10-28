// Headless simulation test: runs the game's host simulation in Node with no page and no renderer.
//   cd tools/sim && npm install && node sim-test.mjs [--strict] [--json] [--browser-view]
// 1. builds the game module from src/ (bundle.mjs) and loads it against a stand-in browser (env.mjs)
// 2. plays a scripted solo session (props, NPCs, a car) at 60 Hz and at the governor's 30 Hz level, and checks the physics
// 3. lists every call the simulation makes into presentation code (renderer, UI, audio, effects, DOM). That list is the
//    to-do list for splitting the simulation out (phase 1); --strict fails while it is not empty.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainThread, Worker } from 'node:worker_threads';
import { sim, setClock, ghost, installPage } from './env.mjs';
import { buildSimBundle, staticCoupling, workerShimSource, PRESENTATION, BOUNDARY } from './bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), OUT = join(HERE, '.out');
const STRICT = process.argv.includes('--strict'), JSON_OUT = process.argv.includes('--json');
// by default the View hooks stay no-ops, the way the host worker will run; --browser-view keeps the mesh code (09_view.js)
const BROWSER_VIEW = process.argv.includes('--browser-view');
// --worker: run this whole test again inside a real worker thread, with only what a browser worker has plus the game's own
// page stand-in (11_loader.html) and the worker's Srv: any leftover page access fails there
const IN_WORKER = process.argv.includes('--in-worker');
if (process.argv.includes('--worker') && isMainThread) {
  const w = new Worker(new URL(import.meta.url), { argv: process.argv.slice(2).filter(a => a !== '--worker').concat('--in-worker') });
  w.on('error', e => { console.error(e); process.exit(1); }); w.on('exit', c => process.exit(c));
  await new Promise(() => { });   // the worker reports and decides the exit code
}
if (IN_WORKER) {
  Object.assign(globalThis, { self: globalThis, location: { search: '', hash: '', hostname: 'localhost', href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:' }, addEventListener() { }, removeEventListener() { }, postMessage() { } });   // a browser worker's globals
  (0, eval)(workerShimSource());
} else installPage();

mkdirSync(OUT, { recursive: true });
const { code, where } = buildSimBundle(undefined, { worker: IN_WORKER });
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
    if (PRESENTATION.includes(w.decl) || presentationFns.has(w.decl) || BOUNDARY.includes(w.decl)) return null;   // presentation calling presentation, or the adapters
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
const { Phys, World, Players, Auth, Net, Sim, Rules, Env, THREE, R, View, VIEW_NONE, Srv, WorkerSrv, SimWorker } = mods;
R.scene = new THREE.Scene(); R.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 2000);   // shared code still adds meshes to these
const outs = new Map();   // worker mode: what the simulation posted to the window, by message type
if (IN_WORKER) {
  Object.assign(View, VIEW_NONE); Object.assign(Srv, WorkerSrv);   // exactly what SimWorker.boot() sets up
  SimWorker.post = m => { const k = m.t === 'out' ? m.m.t : m.t; outs.set(k, (outs.get(k) || 0) + 1); };
} else {
  instrument(mods);
  if (!BROWSER_VIEW) Object.assign(View, VIEW_NONE);   // nothing is drawn: entities get no meshes, players no avatars
}

let clock = 1; setClock(clock);
await Phys.init(); Players.init(); View.init();

function startSession(level) {
  Sim.reset(); Net.startOffline();
  Players.add({ id: 'local', name: 'Sim', color: '#ff9f43', tier: 'medium', idx: 0, joinOrder: 0, isLocal: true, lvl: 1 });
  const me = Players.local; Players.setPos(me, Auth.pickSpawn()); me.yaw = 0; me.pitch = 0; me.hp = 100; me.dead = false; me.seat = 0;
  Env.update(); Sim.setPhysLevel(level);
  return me;
}
// steps the host simulation the way the host worker will: Sim.step only, no game loop; watch(t) every ~0.1 s of simulated time
function run(seconds, watch) {
  const dt = Sim.stepDt, n = Math.round(seconds / dt), every = Math.max(1, Math.round(0.1 / dt)); let ms = 0;
  for (let i = 0; i < n; i++) {
    clock += dt; setClock(clock); const t0 = process.hrtime.bigint(); Sim.step(dt); ms += Number(process.hrtime.bigint() - t0) / 1e6;
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

// ---- sandbox session: the requests players send (tools, weapons, a car), ragdolls, save and load -----------
// Every request goes through Auth.handle like a real one; each check looks at what it did to the world.
{
  log('\nsandbox session at 60 Hz: tools, weapons, ragdolls, a car, save and load');
  const { CFG } = mods, V = THREE.Vector3, errors = [];
  const me = startSession(0), base = me.pos.clone(), ox = base.x + 15, oz = base.z, gy = base.y + 0.5;
  Players.add({ id: 'bob', name: 'Bob', color: '#45aaf2', tier: 'medium', idx: 1, joinOrder: 1, lvl: 1 });   // a remote player in the room
  Players.setPos(Players.map.get('bob'), base.clone().add(new V(-4, 0, 4)));
  const act = (what, fn) => { try { return fn(); } catch (e) { errors.push(`${what}: ${e.message}`); } };
  const send = m => act(m.t + (m.m ? ':' + m.m : ''), () => Auth.handle('local', m));
  const spawnGet = (item, x, y, z) => { const before = new Set(World.ents.keys()); send({ t: 'spawn', item, p: [x, y, z], yaw: 0 }); return [...World.ents.values()].filter(e => !before.has(e.id)); };
  const newGroup = (item, x, y, z) => { const before = new Set(World.groups.keys()); send({ t: 'spawn', item, p: [x, y, z], yaw: 0 }); return [...World.groups.values()].find(g => !before.has(g.id)); };
  const pos = e => { const t = e.body.translation(); return new V(t.x, t.y, t.z); };
  const at = (e, lp = [0, 0, 0], n = [0, 1, 0]) => ({ e: e.id, lp, n, pt: pos(e).add(new V(...lp)).toArray() });
  const input = o => act('input', () => Auth.onInput(me, Object.assign({ y: me.yaw, x: me.pitch, mv: [0, 0], k: [] }, o)));
  const eye = () => new V(me.pos.x, me.pos.y + CFG.eye, me.pos.z);
  const aimAt = p => { const d = p.clone().sub(eye()); me.yaw = Math.atan2(-d.x, -d.z); me.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); return d.normalize(); };
  const sane = () => [...World.ents.values()].every(e => { if (!e.body) return true; const t = e.body.translation(); return isFinite(t.x + t.y + t.z) && Math.abs(t.x) < 2000 && Math.abs(t.z) < 2000 && t.y > -50 && t.y < 2000; });
  const between = (k, a, b) => [...World.cons.values()].find(c => c.t === k && ((c.a === a.id && c.b === b.id) || (c.a === b.id && c.b === a.id)));

  // weld: two crates side by side, then shove one: they move as one
  const [wa] = spawnGet('crate', ox, gy, oz), [wb] = spawnGet('crate', ox + 1, gy, oz); run(1);
  send({ t: 'tool', m: 'weld', a: at(wa, [0.4, 0, 0], [1, 0, 0]), b: at(wb, [-0.4, 0, 0], [-1, 0, 0]), o: {} });
  const weld = between('weld', wa, wb), w0 = pos(wa).distanceTo(pos(wb));
  wa.body.applyImpulse({ x: 0, y: 6 * wa.body.mass(), z: 3 * wa.body.mass() }, true); run(2);
  check('weld holds two crates together', !!(weld && weld.j) && Math.abs(pos(wa).distanceTo(pos(wb)) - w0) < 0.05, `apart by ${w0.toFixed(2)} m, then ${pos(wa).distanceTo(pos(wb)).toFixed(2)} m after a shove`);

  // rope: two crates 2 m apart, rope 1.5x that distance (len is a multiplier, like the tool's slider); yanking one away is stopped by it
  const [ra] = spawnGet('crate', ox, gy, oz + 5), [rb] = spawnGet('crate', ox + 2, gy, oz + 5); run(0.5);
  send({ t: 'tool', m: 'rope', a: at(ra), b: at(rb), o: { len: 1.5, rigid: 1 } });
  const rope = between('rope', ra, rb); rb.body.applyImpulse({ x: 12 * rb.body.mass(), y: 2 * rb.body.mass(), z: 0 }, true);
  let ropeMax = 0; run(2, () => { ropeMax = Math.max(ropeMax, pos(ra).distanceTo(pos(rb))); });
  check('rope holds at its length', !!(rope && rope.j) && ropeMax < rope.len + 0.5, `rope ${rope ? rope.len.toFixed(1) : '?'} m, crates got at most ${ropeMax.toFixed(2)} m apart`);

  // physics gun: grab a crate, pull it to 3 m in front of you, freeze it, unfreeze it
  const [pg] = spawnGet('crate', ox, gy, oz - 5); run(0.5);
  const dir = aimAt(pos(pg)); send({ t: 'grab', e: pg.id, lp: [0, 0, 0], dist: 3 }); run(1.5);
  const held = eye().addScaledVector(dir, 3).distanceTo(pos(pg));
  send({ t: 'freeze' }); const frozen = !!pg.d.fz && pg.body.isFixed();
  send({ t: 'unfreeze', e: pg.id }); const thawed = !pg.d.fz && pg.body.isDynamic();
  check('physics gun holds, freezes and unfreezes', held < 0.5 && frozen && thawed, `held ${held.toFixed(2)} m from the aim point; frozen ${frozen}, unfrozen ${thawed}`);
  me.yaw = 0; me.pitch = 0; run(1);

  // thruster: on the side of a crate; holding its key pushes it
  const [th] = spawnGet('crate', ox + 5, gy, oz - 5); run(0.5); const th0 = pos(th);
  send({ t: 'tool', m: 'thruster', a: at(th, [0, 0, 0.4], [0, 0, 1]), o: { f: 12, key: 'KeyF' } });
  input({ k: ['KeyF'] }); run(1.5); input({ k: [] }); run(0.5);
  check('thruster pushes while its key is held', pos(th).distanceTo(th0) > 1, `moved ${pos(th).distanceTo(th0).toFixed(1)} m`);

  // dynamite: planted on a crate, goes off on its key and throws what's next to it
  const [dc] = spawnGet('crate', ox + 9, gy, oz), [dn] = spawnGet('crate', ox + 10.2, gy, oz); run(0.5);
  const beforeDyn = new Set(World.ents.keys());
  send({ t: 'tool', m: 'dynamite', a: at(dc, [0, 0.4, 0]), o: { pow: 1, key: 'KeyX' } });
  const dyn = [...World.ents.values()].find(e => !beforeDyn.has(e.id)); run(0.3);
  let thrown = 0; input({ k: ['KeyX'] }); run(1, () => { thrown = Math.max(thrown, World.ents.has(dn.id) ? speedOf(dn.body) : 0); }); input({ k: [] });
  check('dynamite goes off on its key', !!dyn && !World.ents.has(dyn.id) && thrown > 2, `charge ${dyn ? (World.ents.has(dyn.id) ? 'still there' : 'gone') : 'not planted'}, neighbour thrown at ${thrown.toFixed(1)} m/s`);

  // grenade: thrown, explodes after its fuse
  const nadeDir = aimAt(new V(ox + 6, base.y, oz + 10)); send({ t: 'nade', o: eye().toArray(), d: nadeDir.toArray() });
  const nades0 = Auth.nades.length; run(3.2);
  check('grenade explodes after its fuse', nades0 === 1 && Auth.nades.length === 0, `${nades0} thrown, ${Auth.nades.length} left after 3.2 s`);
  me.yaw = 0; me.pitch = 0;

  // pistol: shoot an NPC until it dies; it goes limp and stays in one piece
  const victim = newGroup('npc', ox, gy, oz + 12); run(2);
  let shots = 0;
  while (victim && victim.alive && shots < 40) {
    const torso = World.ents.get(victim.parts[1]); if (!torso) break;
    const d = aimAt(pos(torso)); send({ t: 'fire', w: 'pistol', o: eye().toArray(), d: d.toArray(), i: 0.1 }); shots++; run(0.25);
  }
  run(2);
  const limp = victim && victim.parts.map(id => World.ents.get(id)).filter(Boolean);
  check('pistol shots kill an NPC, which ragdolls', !!victim && !victim.alive && limp.length >= 10 && limp.every(e => e.body && e.body.isDynamic()), `${shots} shots; ${limp ? limp.length : 0} parts, all dynamic: ${!!limp && limp.every(e => e.body && e.body.isDynamic())}`);
  me.yaw = 0; me.pitch = 0;

  // SMG: the host counts the magazine (no shots when it's empty or mid-reload), damage falls off with range
  const { W_BY_ID, wDmg } = mods, SMG = W_BY_ID.smg, smgDir = new V(0, 0, -1).toArray();
  let fired = 0; const smgShot = () => { const n0 = me.ammo ? me.ammo.smg ?? SMG.mag : SMG.mag; send({ t: 'fire', w: 'smg', o: eye().toArray(), d: smgDir, i: 0.1 }); if ((me.ammo.smg ?? SMG.mag) < n0) fired++; };
  for (let i = 0; i < SMG.mag + 8; i++) { smgShot(); run(SMG.rate + 0.01); }
  const magFired = fired; fired = 0;
  send({ t: 'reload', w: 'smg' }); smgShot(); const midReload = fired; run(SMG.rl); smgShot();
  check('SMG: magazine and reload are enforced by the host', magFired === SMG.mag && midReload === 0 && fired === 1, `${magFired} of ${SMG.mag + 8} shots went off, ${midReload} during the reload, ${fired} after it`);
  check('SMG: damage falls off with range', wDmg(SMG, 5) === SMG.dmg && Math.abs(wDmg(SMG, 80) - SMG.dmg * SMG.fall[2]) < 1e-9 && wDmg(SMG, 25) < SMG.dmg && wDmg(W_BY_ID.rifle, 200) === W_BY_ID.rifle.dmg,
    `${wDmg(SMG, 5)} at 5 m, ${wDmg(SMG, 25).toFixed(1)} at 25 m, ${wDmg(SMG, 80)} at 80 m`);

  // slide: a sliding player's hitbox is lower (a shot at chest height passes over), and it comes back when they stop
  const bob = Players.map.get('bob'), chest = bob.pos.clone().add(new V(0, 1.4, 0)), so = chest.clone().add(new V(6, 0, 0)), sd = new V(-1, 0, 0);
  const hitBob = () => { const r = Auth.hitscan(me, W_BY_ID.rifle, so, sd.clone()); return !!(r.h && r.h.id === 'p:bob'); };
  const standHit = hitBob(); bob.slide = true; const slideHit = hitBob(), slideLow = (() => { const r = Auth.hitscan(me, W_BY_ID.rifle, so.clone().setY(bob.pos.y + 0.6), sd.clone()); return !!(r.h && r.h.id === 'p:bob'); })(); bob.slide = false;
  check('a sliding player has a lower hitbox', standHit && !slideHit && slideLow && hitBob(), `chest-high shot hits standing ${standHit}, sliding ${slideHit}; low shot hits sliding ${slideLow}`);

  // knockdown: a hit with stun drops an NPC; it gets back up
  const faller = newGroup('npc', ox - 8, gy, oz + 12); run(2);
  act('knockdown', () => Auth.damageGroup(faller.id, 5, 2)); let wentDown = false;
  run(10, () => { if (faller.state === 'down') wentDown = true; });
  const head = World.ents.get(faller.parts[0]);
  check('a knocked-down NPC gets back up', wentDown && !!faller.alive && !!head && pos(head).y > 0.8, `went down: ${wentDown}, alive: ${!!faller.alive}, height ${head ? pos(head).y.toFixed(2) : '?'}`);

  // car: get in, drive forward, steer, get out
  const carEnts = spawnGet('car', base.x - 14, base.y + 1.5, base.z); run(2);
  const chassis = carEnts.find(e => e.d.veh), seat = carEnts.find(e => e.d.seat && !e.d.pas);
  Players.setPos(me, pos(seat).add(new V(1.8, 0, 0))); send({ t: 'use', e: seat.id }); const seated = me.seat === seat.id;
  const fwd = () => new V(0, 0, -1).applyQuaternion(chassis.body.rotation()), yawOf = () => { const f = fwd(); return Math.atan2(f.x, f.z); };
  const c0 = pos(chassis), f0 = fwd(); input({ mv: [0, 1] }); run(3);
  const forward = pos(chassis).sub(c0).dot(f0), y0 = yawOf(); input({ mv: [1, 1] }); run(2); let turned = Math.abs(yawOf() - y0); if (turned > Math.PI) turned = 2 * Math.PI - turned;
  input({ mv: [0, 0] }); run(2); send({ t: 'use' });
  check('car: get in, drive, steer, get out', seated && forward > 5 && turned > 0.3 && me.seat === 0 && bodyUp(chassis.body) > 0.8, `seated ${seated}, drove ${forward.toFixed(1)} m, turned ${(turned * 57.3).toFixed(0)}°, upright ${bodyUp(chassis.body).toFixed(2)}`);
  Players.setPos(me, base); me.yaw = 0; me.pitch = 0;

  // painter: wood to metal changes its mass; delete gun removes a prop and a tree
  const [pc] = spawnGet('crate', ox - 4, gy, oz - 5); run(0.5); const m0 = pc.body.mass();
  send({ t: 'tool', m: 'paint', a: at(pc), o: { m: 'metal', c: '#ff3030' } }); const m1 = pc.body.mass();
  send({ t: 'del', e: pc.id }); const propGone = !World.ents.has(pc.id); run(0.2);   // the delete gun has a short cooldown
  const treeId = +Object.keys(Env.items)[0]; send({ t: 'del', env: treeId }); act('env', () => Env.update()); const treeGone = !Env.items[treeId];
  check('painter and delete gun', pc.d.m === 'metal' && m1 > m0 * 2 && propGone && treeGone, `mass ${m0.toFixed(1)} -> ${m1.toFixed(1)} kg, prop deleted ${propGone}, tree deleted ${treeGone}`);

  // save and load: the same world comes back, welds still hold, nothing blows up
  run(1); const saved = World.serialize(), n = [saved.ents.length, saved.cons.length, saved.groups.length];
  act('loadWorld', () => Auth.loadWorld(saved, me));
  const back = [World.ents.size, World.cons.size, World.groups.size], weld2 = World.cons.get(weld.id);
  let after = 0; run(3, t => { if (t > 0.5) for (const e of World.ents.values()) if (e.body && e.body.isDynamic() && !e.body.isSleeping()) after = Math.max(after, speedOf(e.body)); });
  const wa2 = World.ents.get(wa.id), wb2 = World.ents.get(wb.id);
  check('save and load', back.join() === n.join() && !!(weld2 && weld2.j) && Math.abs(pos(wa2).distanceTo(pos(wb2)) - w0) < 0.05 && after < 30,
    `${n.join('/')} ents/constraints/groups saved, ${back.join('/')} after loading; weld ${weld2 && weld2.j ? 'holds' : 'lost'}; fastest body ${after.toFixed(1)} m/s`);
  check('every body stays in the world, no errors', sane() && errors.length === 0, errors.length ? errors.join('; ') : `${World.ents.size} entities, positions all finite`);
}

// ---- worker mode: no coupling report (nothing was instrumented: a page access would have failed outright) ----
if (IN_WORKER) {
  log(`\nInside a worker thread, with the game's own page stand-in. Posted to the window: ${[...outs].map(([k, n]) => `${k} ×${n}`).join(', ')}`);
  log(`\n${ok ? 'PHYSICS OK in a worker' : 'PHYSICS FAILED in a worker'}`);
  process.exit(ok ? 0 : 1);
}

// ---- coupling report ------------------------------------------------------------------------------------
const list =[...touches.values()].sort((a, b) => a.caller.localeCompare(b.caller) || b.n - a.n);
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
