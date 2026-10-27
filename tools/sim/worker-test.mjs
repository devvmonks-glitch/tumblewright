// Starts the game module the way the host's browser worker does (the loader's page stand-in, then the module, whose last
// line runs SimWorker.boot()) inside a Node worker thread, and drives it only through the window <-> worker protocol
// (06_worker.js): a session, players joining and leaving, spawn requests, a remote player's input, both snapshot
// streams, a save and the stats. Checks the crates fell and settled on the worker's own clock.
//   node worker-test.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { buildSimBundle, workerShimSource } from './bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), OUT = join(HERE, '.out');
mkdirSync(OUT, { recursive: true });
const bundle = join(OUT, 'worker-sim.mjs'); writeFileSync(bundle, buildSimBundle(undefined, { keepBoot: true, worker: true }).code);
// the worker thread: a browser worker's globals (self, location, postMessage / onmessage), the game's stand-in, the module
const entry = join(OUT, 'worker-entry.mjs');
writeFileSync(entry, `import { parentPort } from 'node:worker_threads';
Object.assign(globalThis, { self: globalThis, location: { search: '', hash: '', hostname: 'localhost', href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:' }, addEventListener() { }, removeEventListener() { } });
globalThis.postMessage = (m, transfer) => parentPort.postMessage(m, transfer);
parentPort.on('message', data => { if (self.onmessage) self.onmessage({ data }); });
${workerShimSource()}
await import(${JSON.stringify(pathToFileURL(bundle).href)});
`);

// ---- the snapshot format (Sim.snapshot / Net.onSnap) ----
function decode(buf) {
  const dv = new DataView(buf); let o = 0;
  const s = { ver: dv.getUint8(0), key: dv.getUint8(1), seq: dv.getUint16(2), time: dv.getFloat64(4), bodies: [], players: [] };
  const nb = dv.getUint16(12), np = dv.getUint8(14); o = 16;
  for (let i = 0; i < nb; i++, o += 12) s.bodies.push({ id: dv.getUint16(o), p: [dv.getInt16(o + 2) / 100, dv.getInt16(o + 4) / 100, dv.getInt16(o + 6) / 100] });
  for (let i = 0; i < np; i++, o += 22) s.players.push({ idx: dv.getUint8(o), p: [dv.getInt16(o + 1) / 100, dv.getInt16(o + 3) / 100, dv.getInt16(o + 5) / 100], yaw: dv.getInt16(o + 7) / 10000 });
  return s;
}

let ok = true;
const check = (name, pass, detail) => { if (!pass) ok = false; console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? '  (' + detail + ')' : ''}`); };
const w = new Worker(entry), log = [], waiting = [];
w.on('error', e => { console.error('worker error:', e); process.exit(1); });
w.on('message', m => {
  if (m.t === 'snap') m.s = decode(m.buf);
  log.push(m);
  const i = waiting.findIndex(x => x.t === m.t); if (i >= 0) waiting.splice(i, 1)[0].res(m);
});
const next = t => new Promise(res => waiting.push({ t, res }));
const send = m => w.postMessage(m), sleep = ms => new Promise(r => setTimeout(r, ms));
const since = (i, f) => log.slice(i).filter(f);
const outs = (i, t) => since(i, m => m.t === 'out' && m.m.t === t);
const probe = async () => { send({ t: 'probe' }); return (await next('probe')).ents; };

console.log('game module in a worker thread, driven by messages');
const t0 = Date.now(); await next('boot'); check('the module boots inside the worker', true, `${Date.now() - t0} ms to load`);
send({ t: 'init' }); await next('ready'); check('physics starts in the worker', true);
const epoch = (performance.timeOrigin + performance.now()) / 1000;
send({ t: 'session', hostId: 'host', online: true, code: 'TEST', epoch, rules: { env: 'plains' } });

// ---- joins: the host's own player, then a client ----
let mark = log.length;
send({ t: 'join', pid: 'host', d: { name: 'Host', color: '#ff9f43', tier: 'medium', lvl: 3 }, joinOrder: 0 });
send({ t: 'join', pid: 'c1', d: { name: '<b>Bob</b>', color: 'red', tier: 'low', lvl: 5 }, joinOrder: 1 });
await probe();
const ws = since(mark, m => m.t === 'ws'), pl = outs(mark, 'pl'), chat = outs(mark, 'chat').map(m => m.m.text);
const wsC = ws.find(m => m.to === 'c1'), bob = wsC && wsC.payload.players.find(p => p.id === 'c1');
check('each joiner gets the world, rules and a spawn', ws.length === 2 && wsC && wsC.payload.code === 'TEST' && wsC.payload.hostId === 'host' && Array.isArray(wsC.payload.you.spawn) && Array.isArray(wsC.payload.world.ents),
  `${ws.length} ws messages, spawn ${wsC && wsC.payload.you.spawn.map(v => v.toFixed(1))}`);
check('joins are checked and announced', bob && bob.name === 'bBob/b' && bob.color === '#ff9f43' && bob.idx === 2 && pl.length === 2 && pl[1].to === 'all' && pl[1].m.list.length === 2 && chat.includes('bBob/b joined the room') && chat.some(t => /Low graphics/.test(t)),
  `name "${bob && bob.name}", idx ${bob && bob.idx}, ${pl.length} player lists, chat: ${chat.join(' | ')}`);

// ---- spawns ----
mark = log.length;
for (let i = 0; i < 12; i++) send({ t: 'req', pid: 'host', m: { t: 'spawn', item: 'crate', p: [8 + (i % 4) * 1.2, 4 + Math.floor(i / 4) * 1.2, -6], yaw: 0 } });
const before = await probe();
check('spawn requests reach the simulation', before.length === 12 && outs(mark, 'add').length >= 12, `${before.length} crates, ${outs(mark, 'add').length} 'add' messages posted to the window`);

// ---- running: both snapshot streams and the periodic stats ----
mark = log.length;
send({ t: 'clients', n: 1 }); send({ t: 'run', on: true }); await sleep(3000);
const snaps = since(mark, m => m.t === 'snap'), view = snaps.filter(m => !m.net), net = snaps.filter(m => m.net);
const stats = since(mark, m => m.t === 'stats'), steps = stats.reduce((a, s) => a + s.steps, 0);
check('the worker steps on its own clock', stats.length >= 2 && steps >= 100, `${stats.length} stats messages, ${steps} steps reported (${stats[0] && stats[0].stepHz} Hz, governor level ${stats[0] && stats[0].physLvl})`);
check('the window gets a full picture every tick', view.length >= 150 && view.every(m => m.key && m.s.key && m.s.bodies.length === 12 && m.s.players.length === 2),
  `${view.length} in 3 s, ${view[0] && view[0].s.bodies.length} bodies each`);
const keys = net.filter(m => m.s.key), seqOk = net.every((m, i) => !i || m.s.seq === ((net[i - 1].s.seq + 1) & 0xffff));
check('the clients\' stream runs at the snapshot rate with keyframes', net.length >= 55 && net.length <= 65 && net[0].s.key && keys.length >= 2 && keys.length <= 3 && seqOk,
  `${net.length} in 3 s, ${keys.length} keyframes, sequence ${seqOk ? 'unbroken' : 'BROKEN'}`);
const ht = net[net.length - 1].s.time, wall = (performance.timeOrigin + performance.now()) / 1000 - epoch;
check('snapshots carry the room clock', Math.abs(ht - wall) < 0.5, `host time ${ht.toFixed(2)} s, window clock ${wall.toFixed(2)} s`);

// ---- a remote player's input moves them (after the 1.5 s spawn grace) ----
const sp = wsC.payload.you.spawn, to = [sp[0] + 1, sp[1], sp[2] + 0.5];
for (let i = 0; i < 4; i++) { send({ t: 'input', pid: 'c1', inp: { p: to, y: 1.2, x: 0, mv: [0, 0], k: [] } }); await sleep(40); }
mark = log.length; await sleep(200);
const me = since(mark, m => m.t === 'snap' && !m.net).pop().s.players.find(p => p.idx === 2);
check('a remote player\'s input moves them', me && Math.hypot(me.p[0] - to[0], me.p[2] - to[2]) < 0.3 && Math.abs(me.yaw - 1.2) < 0.01, `at ${me && me.p.map(v => v.toFixed(2))}, yaw ${me && me.yaw.toFixed(2)}`);

// ---- settled: deltas carry nothing, the window's picture still carries everything ----
await sleep(1500); mark = log.length; await sleep(800);
const quiet = since(mark, m => m.t === 'snap' && m.net && !m.s.key);
check('deltas leave out bodies at rest', quiet.length >= 5 && quiet.every(m => m.s.bodies.length === 0), `${quiet.length} deltas, bodies in each: ${[...new Set(quiet.map(m => m.s.bodies.length))].join(',')}`);
send({ t: 'clients', n: 0 }); await sleep(150); mark = log.length; send({ t: 'clients', n: 1 }); await sleep(120);
const back = since(mark, m => m.t === 'snap' && m.net)[0];
check('a new audience gets every body again', back && back.s.bodies.length === 12, `${back && back.s.bodies.length} bodies in the first snapshot (keyframe ${back && back.s.key})`);
const after = await probe(); await sleep(1000); const later = await probe();
const fell = after.filter(a => { const b = before.find(x => x[0] === a[0]); return b && a[2] < b[2] - 1; }).length;
const still = later.filter(a => { const b = after.find(x => x[0] === a[0]); return b && Math.hypot(a[1] - b[1], a[2] - b[2], a[3] - b[3]) < 0.05; }).length;
check('crates fall and settle in the worker', fell >= 10 && later.every(a => a[2] > -0.5) && still >= 11, `${fell}/12 fell, ${still}/12 at rest, ${later.filter(a => a[4]).length} asleep`);

// ---- leaving, saving ----
mark = log.length; send({ t: 'leave', pid: 'c1' }); await probe();
const pl2 = outs(mark, 'pl');
check('leaving is announced', pl2.length === 1 && pl2[0].m.list.length === 1 && outs(mark, 'chat').some(m => m.m.text === 'bBob/b left the room'));
send({ t: 'serialize', id: 7 }); const saved = await next('saved');
check('a save comes back from the worker', saved.id === 7 && saved.world.ents.filter(e => e.k !== 'map').length === 12 && saved.rules.env === 'plains', `${saved.world.ents.length} entities saved`);
send({ t: 'run', on: false });
await w.terminate();
console.log(ok ? '\nWORKER OK' : '\nWORKER FAILED');
process.exit(ok ? 0 : 1);
