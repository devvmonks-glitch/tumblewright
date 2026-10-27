// Assembles the game module from src/ the same way tools/build.mjs does, for running headless in Node.
//   buildSimBundle() -> { code, where(line) }   (where() maps a bundle line back to "src/<part>:<line>")
// The module's own imports stay as written ('three', 'three/addons/...', '@dimforge/rapier3d-compat') and resolve from
// tools/sim/node_modules. The trailing Game.boot() is removed, and the module exports its top-level objects plus an
// __instrument() hook that can swap the presentation functions declared at the top level.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), SRC = join(ROOT, 'src');

// modules that belong to the page: the simulation should not call them (Editor / Admin / Prog are listed because the
// host-side parts that live in them have to move out)
// Net is the window's connection to the other players: host code talks to it only through Srv (06_srv.js)
export const PRESENTATION = ['Net', 'R', 'UI', 'Audio', 'FX', 'Gore', 'DmgNum', 'Tools', 'Editor', 'Admin', 'Prog', 'Input', 'Hotbar', 'Thumbs', 'Nav', 'Models', 'Mats', 'Tex', 'Geo', 'Bots', 'Social', 'Online', 'DiscordAct', 'BoardTex', 'HOLO', 'MeshView', 'PlayerView'];
// top-level functions that only build visuals / DOM; the harness wraps them to see who calls them
export const PRESENTATION_FNS = ['buildVisual', 'matMesh', 'csmMat', 'ptsMat', 'addVehicleWheels', 'addNpcWeapon', 'rocketFlame', 'buildThruster', 'boardTexture', 'boardFace', 'drawBotFace', 'h', 'downloadJSON', 'pickJSON'];

// ---- static check: which top-level names does simulation code use that are declared on the presentation side? -----
// Catches data reads (tables, constants) and code paths the scripted run never reaches.
export const SIM_DECLS = ['Phys', 'Ent', 'World', 'Players', 'Player', 'Vehicles', 'Auth', 'Rules', 'ZS', 'PH', 'Env', 'MAPS', 'THEMES', 'canEdit', 'applyAdd', 'applyRem'];
// the adapters between the simulation and the page: allowed to call across (View -> MeshView in the browser, Srv -> Net)
export const BOUNDARY = ['View', 'VIEW_NONE', 'Srv'];
export const PRESENTATION_FILES = ['03_renderer.js', '08_social.js', '09_ui.js', '09_view.js', '10_game.js'];   // everything declared in these is presentation
export function staticCoupling() {
  const parts = readdirSync(SRC).filter(f => /^\d\d_.*\.js$/.test(f)).sort(), decls = [], owner = new Map();
  for (const f of parts) {
    const L = readFileSync(join(SRC, f), 'utf8').replace(/\r\n/g, '\n').split('\n'), starts = [];
    L.forEach((l, i) => { const m = l.match(/^(?:const|let|class|function|async function) ([A-Za-z_$][\w$]*)/); if (m) starts.push([i, m[1]]); });
    starts.forEach(([i, n], k) => { const j = k + 1 < starts.length ? starts[k + 1][0] : L.length; decls.push({ f, n, body: L.slice(i, j).join('\n'), line: i + 1 }); owner.set(n, f); });
  }
  const isPres = n => PRESENTATION_FILES.includes(owner.get(n)) || PRESENTATION.includes(n) || PRESENTATION_FNS.includes(n);
  const out = [];
  for (const d of decls) {
    if (!SIM_DECLS.includes(d.n) || isPres(d.n)) continue;
    const code = d.body.replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*/g, '');   // strings and comments don't count
    // a name the code declares itself (const h = ..., (h) =>, a parameter) is a local, not the top-level one
    const local = w => new RegExp(`(?:\\b(?:const|let|var)\\s+(?:[\\w$]+\\s*=[^,;]*,\\s*)*|[,(]\\s*)${w.replace(/\$/g, '\\$')}\\s*(?:=|,|\\)|=>|;)`).test(code);
    // identifiers not after a dot (s.h is a property)
    const used = [...new Set(code.match(/(?<![.\w$])[A-Za-z_$][\w$]*\b/g) || [])].filter(w => w !== d.n && owner.has(w) && isPres(w) && !local(w)).sort();
    if (used.length) out.push({ sim: d.n, at: `${d.f}:${d.line}`, uses: used.map(w => `${w} (${owner.get(w)})`) });
  }
  return out;
}

export function buildSimBundle(src = SRC) {   // src: another copy of src/ (e.g. an older commit) to compare against
  const parts = readdirSync(src).filter(f => /^\d\d_.*\.(html|js)$/.test(f)).sort();
  // line ranges of each part inside the concatenated page
  const ranges = []; let html = '', line = 1;
  for (const f of parts) {
    const t = readFileSync(join(src, f), 'utf8').replace(/\r\n/g, '\n');
    ranges.push({ f, start: line }); html += t; line += t.split('\n').length - 1;
  }
  const open = '<script id="tw-main" type="text/tw-module">', i0 = html.indexOf(open);
  if (i0 < 0) throw new Error('tw-main module not found');
  const body0 = i0 + open.length, body1 = html.indexOf('</script>', body0);
  const firstLine = html.slice(0, body0).split('\n').length;   // page line of the module's first line
  let code = html.slice(body0, body1);
  // don't start the game: keep the line count so stack traces still map
  if (!/^Game\.boot\(\);$/m.test(code)) throw new Error('Game.boot() not found at the end of the module');
  code = code.replace(/^Game\.boot\(\);$/m, '/* Game.boot() removed by the sim harness */');
  const objs = [...code.matchAll(/^const ([A-Za-z_$][\w$]*) = \{/gm)].map(m => m[1]);
  const fns = PRESENTATION_FNS.filter(n => new RegExp(`^function ${n}\\(`, 'm').test(code));
  // presentation objects become reassignable (in this copy only) so the harness can put a recording proxy in their place
  const pres = PRESENTATION.filter(n => objs.includes(n));
  for (const n of pres) code = code.replace(new RegExp(`^const ${n} = \\{`, 'm'), `let ${n} = {`);
  // export every top-level name, so the harness can reach anything (View, VIEW_NONE, tables, ...)
  const names = [...code.matchAll(/^(?:const|let|class|function|async function) ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  code += `\n// ---- added by tools/sim/bundle.mjs ----\nexport { ${[...new Set([...names, 'THREE', 'RAPIER'])].join(', ')} };\n` +
    `export function __instrument(wrap) { ${fns.map(n => `${n} = wrap('${n}', ${n});`).join(' ')} }\n` +
    `export function __proxyObjects(make) { ${pres.map(n => `${n} = make('${n}', ${n});`).join(' ')} }\n`;
  // top-level declarations by line, so a stack frame can be named after the module it is in
  const decls = []; code.split('\n').forEach((l, i) => { const m = l.match(/^(?:const|let|class|function|async function) ([A-Za-z_$][\w$]*)/); if (m) decls.push([i + 1, m[1]]); });
  const where = ln => {
    const pl = firstLine + ln - 1; let r = ranges[0]; for (const x of ranges) if (x.start <= pl) r = x;
    let d = null; for (const [l, n] of decls) { if (l > ln) break; d = n; }
    return { file: r.f, line: pl - r.start + 1, decl: d };
  };
  return { code, where };
}
