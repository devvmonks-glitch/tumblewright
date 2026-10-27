// A stand-in browser for running the game module in Node (installPage). Nothing renders: every page / DOM access returns a "ghost"
// (callable, any property, sets ignored) and is reported to onTouch(), so the harness can list what the simulation still
// reaches for. The clock is driven by the harness (setClock) so timers in game logic follow simulated time.
export const sim = { clock: 0, onTouch: null };

export function ghost(path) {
  const f = function () { };
  return new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then' || k === Symbol.iterator) return undefined;   // not a promise, not iterable
      if (k === 'length') return 0;
      return ghost(path + '.' + String(k));
    },
    apply() { return ghost(path + '()'); },
    construct() { return ghost('new ' + path); },
    set() { return true }, has() { return true }, deleteProperty() { return true },
  });
}
const touch = (what) => { if (sim.onTouch) sim.onTouch(what); };

const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); },
  clear: () => store.clear(), key: i => [...store.keys()][i] ?? null, get length() { return store.size; },
};
const document = {
  // the module reads a few <meta> tags at load: a page without them answers null, like a real one
  querySelector(sel) { if (/^meta\[/.test(sel)) return null; touch(`document.querySelector(${sel})`); return ghost(`$(${sel})`); },
  querySelectorAll(sel) { touch(`document.querySelectorAll(${sel})`); return []; },
  getElementById(id) { touch(`document.getElementById(${id})`); return ghost(`#${id}`); },
  createElement(tag) { touch(`document.createElement(${tag})`); return ghost(`<${tag}>`); },
  addEventListener() { touch('document.addEventListener'); }, removeEventListener() { },
  get hidden() { return false; }, get visibilityState() { return 'visible'; }, hasFocus: () => true,
  get body() { touch('document.body'); return ghost('document.body'); }, get head() { touch('document.head'); return ghost('document.head'); },
};

const G = globalThis;
// the test's clock, always (game timers follow simulated time)
Object.defineProperty(G, 'performance', { value: { now: () => sim.clock * 1000, mark() { }, measure() { } }, configurable: true, writable: true });
// the fake page (ghost DOM that records touches); the worker mode runs with the game's own stand-in instead
export function installPage() {
Object.defineProperty(G, 'localStorage', { value: localStorage, configurable: true, writable: true });
Object.assign(G, {
  window: G, self: G, document,
  location: { search: '', hash: '', hostname: 'localhost', href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:' },
  history: { replaceState() { }, pushState() { } },
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener() { }, removeEventListener() { }, dispatchEvent() { return true; },
  requestAnimationFrame() { return 0; }, cancelAnimationFrame() { },
  matchMedia: () => ({ matches: false, addEventListener() { }, removeEventListener() { } }),
  getComputedStyle: () => ghost('computedStyle'),
  Image: function () { return ghost('Image'); },
  CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
});
}

export function setClock(t) { sim.clock = t; }
// the same "random" numbers every run, so results don't depend on luck (mulberry32)
let seed = 0x7c3a91;
Math.random = () => { seed = seed + 0x6D2B79F5 >>> 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
