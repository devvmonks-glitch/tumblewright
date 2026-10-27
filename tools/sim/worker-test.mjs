// Starts the game module the way the host's browser worker does (the loader's page stand-in, then the module, whose last
// line runs SimWorker.boot()) inside a Node worker thread, and drives it only through messages: init, a session, a
// player, spawn requests, then the worker's own clock. Checks the crates fell and settled on that clock.
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

let ok = true;
const check = (name, pass, detail) => { if (!pass) ok = false; console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? '  (' + detail + ')' : ''}`); };
const w = new Worker(entry), outs = new Map(), waiting = [];
w.on('error', e => { console.error('worker error:', e); process.exit(1); });
w.on('message', m => {
  if (m.t === 'out') { outs.set(m.m.t, (outs.get(m.m.t) || 0) + 1); return; }
  const i = waiting.findIndex(x => x.t === m.t); if (i >= 0) waiting.splice(i, 1)[0].res(m);
});
const next = t => new Promise(res => waiting.push({ t, res }));
const send = m => w.postMessage(m), sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('game module in a worker thread, driven by messages');
const t0 = Date.now(); await next('boot'); check('the module boots inside the worker', true, `${Date.now() - t0} ms to load`);
send({ t: 'init' }); await next('ready'); check('physics starts in the worker', true);
send({ t: 'session', hostId: 'host', online: false, rules: { env: 'plains' } });
send({ t: 'join', p: { id: 'host', name: 'Host', color: '#ff9f43', tier: 'medium', idx: 0, joinOrder: 0, lvl: 1 }, pos: [0, 0, 0] });
for (let i = 0; i < 12; i++) send({ t: 'req', pid: 'host', m: { t: 'spawn', item: 'crate', p: [8 + (i % 4) * 1.2, 4 + Math.floor(i / 4) * 1.2, -6], yaw: 0 } });
send({ t: 'probe' }); const before = await next('probe');
check('spawn requests reach the simulation', before.ents.length === 12 && (outs.get('add') || 0) >= 12, `${before.ents.length} crates, ${outs.get('add') || 0} 'add' messages posted to the window`);
send({ t: 'run', on: true }); await sleep(3000); send({ t: 'stats' }); const st = await next('stats');
await sleep(1500); send({ t: 'probe' }); const after = await next('probe'); await sleep(1000); send({ t: 'probe' }); const later = await next('probe'); send({ t: 'run', on: false });
const fell = after.ents.filter(a => { const b = before.ents.find(x => x[0] === a[0]); return b && a[2] < b[2] - 1; }).length;
const still = later.ents.filter(a => { const b = after.ents.find(x => x[0] === a[0]); return b && Math.hypot(a[1] - b[1], a[2] - b[2], a[3] - b[3]) < 0.05; }).length;
check('the worker steps on its own clock', st.steps >= 150 && st.steps <= 200, `${st.steps} steps in 3 s (${st.stepHz} Hz), ${st.msPerStep.toFixed(2)} ms per step, governor level ${st.physLvl}`);
check('crates fall and settle in the worker', fell >= 10 && later.ents.every(a => a[2] > -0.5) && still >= 11, `${fell}/12 fell, ${still}/12 at rest 4.5 s after the drop, ${later.ents.filter(a => a[4]).length} asleep`);
await w.terminate();
console.log(ok ? '\nWORKER OK' : '\nWORKER FAILED');
process.exit(ok ? 0 : 1);
