// Builds every map with an older commit's source and with the working copy, and compares what the simulation gets:
// every map collider (shape, size, position, rotation, material) plus the delete-gun items, water areas and dark zones.
//   node compare-maps.mjs <git ref>      e.g. node compare-maps.mjs HEAD
// The working copy runs twice: with no view at all (as the host worker will) and with the browser view.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { ghost, setClock, installPage } from './env.mjs';
import { buildSimBundle } from './bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..'), OUT = join(HERE, '.out');
const ref = process.argv[2] || 'HEAD';
installPage();   // the older code builds visuals inline: give it the fake page
mkdirSync(OUT, { recursive: true });
const refDir = join(OUT, 'ref-src'); rmSync(refDir, { recursive: true, force: true }); mkdirSync(refDir, { recursive: true });
execSync(`git archive ${ref} src | tar -x -C "${refDir.replace(/\\/g, '/')}"`, { cwd: ROOT, stdio: 'inherit', shell: 'bash' });

const r = x => Math.round(x * 1000) / 1000;
async function fingerprints(label, srcDir, headless) {
  const file = join(OUT, `maps-${label}.mjs`); writeFileSync(file, buildSimBundle(srcDir).code);
  const M = await import(pathToFileURL(file).href);
  M.R.scene = new M.THREE.Scene(); M.R.camera = new M.THREE.PerspectiveCamera();
  // presentation objects answer missing page state with ghosts (the older code builds visuals inline)
  // and presentation calls that need a real page fail quietly
  const absorb = (n, f) => function (...a) { try { return f.apply(this, a); } catch (e) { return ghost(n); } };
  M.__proxyObjects((n, t) => new Proxy(t, {
    get(o, k) {
      if (typeof k === 'symbol') return o[k];
      const v = o[k]; if (typeof v === 'function') return absorb(`${n}.${k}`, v);
      return v == null ? ghost(`${n}.${String(k)}`) : v;
    },
  }));
  M.__instrument((n, f) => absorb(n, f));
  if (headless && M.VIEW_NONE) Object.assign(M.View, M.VIEW_NONE);
  setClock(1); await M.Phys.init(); if (M.View) M.View.init();   // the browser view's ground (a no-op headless)
  const out = {};
  for (const name of Object.keys(M.THEMES)) {
    M.Rules.env = name; M.Rules.envGone = []; M.Env.apply(name);
    const E = M.Env, cols = E.cols.map(c => {
      const S = c.shape, t = c.translation(), q = c.rotation();
      const dims = S.halfExtents ? [S.halfExtents.x, S.halfExtents.y, S.halfExtents.z] : S.radius != null ? [S.radius, S.halfHeight ?? 0] : S.vertices ? [S.vertices.length, S.vertices.reduce((a, b) => a + b, 0)] : S.heights ? [S.nrows, S.ncols, S.heights.reduce((a, b) => a + b, 0)] : [];
      return [c.shapeType(), ...[t.x, t.y, t.z, q.x, q.y, q.z, q.w, ...dims].map(r), E.colMat.get(c.handle) || ''].join(',');
    });
    out[name] = {
      cols, items: Object.entries(E.items).map(([id, it]) => `${id}:${it.pos.join(',')}:${it.col ? 'c' : '-'}`),
      waters: E.waters.map(w => [w.x0, w.x1, w.z0, w.z1, w.y].map(r).join(',')), zones: E.zones.map(z => z.map(r).join(',')),
      ground: E.groundAt ? [0, 10, -20, 33].map(v => r(E.groundAt(v, v * 0.7))).join(',') : '', sand: E.sandAt ? r(E.sandAt(5, 5)) : '',
    };
  }
  return out;
}

const before = await fingerprints('ref', join(refDir, 'src'), false);
const runs = { 'no view (headless)': await fingerprints('now-headless', join(ROOT, 'src'), true), 'browser view': await fingerprints('now-view', join(ROOT, 'src'), false) };
let same = true;
for (const [label, now] of Object.entries(runs)) {
  console.log(`\n${ref} vs working copy, ${label}:`);
  for (const name of Object.keys(before)) {
    const a = before[name], b = now[name], diffs = [];
    for (const k of Object.keys(a)) { const x = JSON.stringify(a[k]), y = JSON.stringify(b && b[k]); if (x !== y) diffs.push(k); }
    if (diffs.length) same = false;
    console.log(`  ${name.padEnd(10)} ${a.cols.length} colliders, ${a.items.length} items, ${a.waters.length} water, ${a.zones.length} zones  ${diffs.length ? 'DIFFERENT: ' + diffs.join(', ') : 'identical'}`);
  }
}
console.log(same ? '\nALL MAPS IDENTICAL' : '\nMAPS DIFFER');
process.exit(same ? 0 : 1);
