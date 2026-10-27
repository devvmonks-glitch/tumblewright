
/* ============================================================================
   13. AUDIO (synthesized with WebAudio — no asset files) & FX
   ========================================================================== */
// ---- sound ------------------------------------------------------------------------------------------------------
// Every sound is a bank of recorded / synthesized variants (tools/sounds/build_sounds.mjs, embedded as #tw-sounds);
// a random variant plays with a little pitch / level variation so repeats never sound identical.
// Positional sounds: HRTF (High / Ultra) or equal-power panning, distance roll-off, air absorption (distant sounds lose
// their highs), speed-of-sound delay for loud far sounds, muffling through walls, and a reverb send whose room follows
// the listener (open air vs. indoors). Loops (engines, hums, wind, water) are handles updated every frame.
// SND: v volume, r full-volume radius (m), max range (m), rf roll-off, pv pitch variation, lim max voices, rv reverb send,
//      del speed-of-sound delay, occ muffle behind walls, bus ('ui' = dry, unpositioned)
const _av1 = new V3(), _av2 = new V3(), _av3 = new V3(), DOWN = new V3(0, -1, 0);
const ENG_LAYERS = [['eng0', 43.2], ['eng2', 65.1], ['eng5', 76.7]];   // car engine recordings and their firing frequency (Hz)
const SND_DEF = { v: 0.8, r: 2.5, max: 70, rf: 1, pv: 0.06, lim: 5, rv: 0.22, occ: 1 };
const SND = {
  pistol: { v: 1, r: 10, max: 600, rf: 0.75, pv: 0.03, lim: 6, rv: 0.35, del: 1 }, m1911: { v: 1, r: 10, max: 600, rf: 0.75, pv: 0.03, lim: 6, rv: 0.35, del: 1 },
  rifle: { v: 0.95, r: 11, max: 650, rf: 0.75, pv: 0.03, lim: 8, rv: 0.35, del: 1 }, ak: { v: 0.95, r: 11, max: 650, rf: 0.75, pv: 0.03, lim: 8, rv: 0.35, del: 1 },
  shotgun: { v: 1, r: 12, max: 650, rf: 0.75, pv: 0.03, lim: 4, rv: 0.4, del: 1 }, sniper: { v: 1, r: 14, max: 900, rf: 0.8, pv: 0.02, lim: 3, rv: 0.45, del: 1 },
  rocket_fire: { v: 1, r: 10, max: 500, rf: 0.9, pv: 0.04, lim: 3, rv: 0.4, del: 1 },
  boom: { v: 1.4, r: 18, max: 900, rf: 0.8, pv: 0.06, lim: 4, rv: 0.5, del: 1, occ: 0.4 }, boom_far: { v: 1.2, r: 40, max: 1400, rf: 0.6, pv: 0.06, lim: 3, rv: 0.6, del: 1, occ: 0.4 },
  debris: { v: 0.55, r: 6, max: 90, lim: 3 }, gun_dist: { v: 0.9, r: 60, max: 1400, rf: 0.5, lim: 6, rv: 0.5, del: 1, occ: 0.3 },
  casing: { v: 0.32, r: 1.5, max: 25, pv: 0.08, lim: 8, rv: 0.1 }, hull: { v: 0.4, r: 1.5, max: 25, lim: 4, rv: 0.1 },
  pump: { v: 0.55, r: 2, max: 30, lim: 2 }, bolt: { v: 0.55, r: 2, max: 30, lim: 2 }, draw: { v: 0.35, bus: 'ui' },
  ricochet: { v: 0.5, r: 3, max: 90, pv: 0.12, lim: 4 }, whiz: { v: 0.7, r: 2, max: 30, pv: 0.1, lim: 4, rv: 0.05, occ: 0 },
  swing: { v: 0.45, r: 2, max: 25, pv: 0.1, lim: 3 }, throw: { v: 0.5, r: 2, max: 25, lim: 3 }, pin: { v: 0.5, r: 2, max: 20, lim: 2 },
  nade_bounce: { v: 0.6, r: 3, max: 50, pv: 0.1, lim: 4 }, propcannon: { v: 0.8, r: 5, max: 120, lim: 3 }, rocket_loop: { v: 0.9, r: 6, max: 160, rf: 1.1 },
  bimp_concrete: { v: 0.55, r: 3, max: 80, pv: 0.1, lim: 6 }, bimp_metal: { v: 0.6, r: 3, max: 90, pv: 0.1, lim: 6 }, bimp_wood: { v: 0.55, r: 3, max: 70, pv: 0.1, lim: 6 },
  bimp_dirt: { v: 0.5, r: 3, max: 60, pv: 0.12, lim: 6 }, bimp_flesh: { v: 0.5, r: 3, max: 70, pv: 0.1, lim: 6 }, bimp_glass: { v: 0.55, r: 3, max: 70, lim: 4 },
  hit_wood: { v: 0.45, lim: 6 }, hit_wood_h: { v: 0.55, r: 4, max: 90, lim: 4 }, hit_metal: { v: 0.75, lim: 6 }, hit_metal_h: { v: 0.85, r: 4, max: 110, lim: 4 },
  hit_tin: { v: 0.55, lim: 5 }, hit_plastic: { v: 0.45, lim: 6 }, hit_stone: { v: 0.6, r: 3, max: 90, lim: 5 }, hit_glass: { v: 0.45, lim: 5 }, hit_glass_h: { v: 0.6, r: 3, max: 90, lim: 3 },
  hit_soft: { v: 0.4, lim: 5 }, hit_soft_h: { v: 0.55, r: 3, lim: 4 }, hit_body: { v: 0.6, r: 3, max: 80, lim: 5 }, punch: { v: 0.6, r: 3, lim: 4 }, bell: { v: 0.7, r: 4, max: 120, lim: 2, rv: 0.4 },
  break_wood: { v: 0.95, r: 5, max: 140, lim: 3, rv: 0.35 }, break_stone: { v: 1, r: 6, max: 160, lim: 3, rv: 0.4 }, break_glass: { v: 0.9, r: 5, max: 140, lim: 3, rv: 0.4 },
  crash: { v: 1, r: 6, max: 180, lim: 2, rv: 0.4 }, pop: { v: 0.8, r: 4, max: 90, lim: 4, rv: 0.35 }, boing: { v: 0.55, r: 3, max: 50, lim: 3 },
  step_grass: { v: 0.34, r: 1.5, max: 30, pv: 0.08, lim: 10, rv: 0.08 }, step_concrete: { v: 0.36, r: 1.5, max: 34, pv: 0.08, lim: 10, rv: 0.15 },
  step_wood: { v: 0.4, r: 1.5, max: 34, pv: 0.08, lim: 10 }, step_snow: { v: 0.36, r: 1.5, max: 30, pv: 0.08, lim: 10, rv: 0.08 }, step_sand: { v: 0.34, r: 1.5, max: 30, pv: 0.08, lim: 10, rv: 0.08 },
  step_carpet: { v: 0.3, r: 1.5, max: 25, pv: 0.08, lim: 10 }, step_metal: { v: 0.35, r: 1.5, max: 34, pv: 0.08, lim: 10 }, step_water: { v: 0.45, r: 1.5, max: 34, pv: 0.1, lim: 8 },
  cloth: { v: 0.3, r: 1.5, max: 15, lim: 3 }, land: { v: 0.55, r: 2, max: 35, lim: 4 },
  splash_s: { v: 0.65, r: 3, max: 60, pv: 0.1, lim: 5 }, splash_l: { v: 0.95, r: 5, max: 110, pv: 0.08, lim: 3, rv: 0.3 }, wave: { v: 0.35, r: 6, max: 40, lim: 2, rv: 0.1 },
  pain_m: { v: 0.42, r: 4, max: 90, pv: 0.07, lim: 4, rv: 0.3 }, death_m: { v: 0.5, r: 5, max: 110, pv: 0.05, lim: 3, rv: 0.35 }, pain_f: { v: 0.42, r: 4, max: 90, pv: 0.05, lim: 4, rv: 0.3 },
  death_f: { v: 0.5, r: 5, max: 110, pv: 0.05, lim: 3, rv: 0.35 }, scream: { v: 0.5, r: 6, max: 140, pv: 0.08, lim: 3, rv: 0.4 },
  z_groan: { v: 0.42, r: 4, max: 70, pv: 0.1, lim: 4, rv: 0.3 }, z_attack: { v: 0.5, r: 4, max: 80, pv: 0.08, lim: 3 }, z_pain: { v: 0.45, r: 4, max: 80, pv: 0.08, lim: 3 }, jumpscare: { v: 1, bus: 'ui' },
  gore_splat: { v: 0.45, r: 3, max: 70, pv: 0.1, lim: 5 }, gore_squish: { v: 0.4, r: 2.5, max: 50, pv: 0.12, lim: 5 }, gore_bone: { v: 0.5, r: 3, max: 60, pv: 0.1, lim: 4 }, gore_gib: { v: 0.6, r: 4, max: 90, lim: 3, rv: 0.3 },
  pg_grab: { v: 0.2, r: 2, max: 30, lim: 3 }, pg_drop: { v: 0.2, r: 2, max: 25, lim: 3 }, freeze: { v: 0.3, r: 2, max: 30, lim: 3 }, unfreeze: { v: 0.25, r: 2, max: 30, lim: 3 },
  tool_zap: { v: 0.3, r: 2, max: 40, lim: 4 }, delete_zap: { v: 0.35, r: 2, max: 50, lim: 4 },
  door_open: { v: 0.55, r: 3, max: 45, lim: 3 }, door_close: { v: 0.6, r: 3, max: 50, lim: 3 }, creak: { v: 0.5, r: 2, max: 25, lim: 2 }, bird: { v: 0.4, r: 8, max: 120, rf: 0.8, pv: 0.12, lim: 3, rv: 0.4, occ: 0.5 },
  ui: { v: 0.35, bus: 'ui' }, tick: { v: 0.3, bus: 'ui' }, switch: { v: 0.35, bus: 'ui' }, open: { v: 0.35, bus: 'ui' }, close: { v: 0.35, bus: 'ui' }, confirm: { v: 0.45, bus: 'ui' },
  error: { v: 0.4, bus: 'ui' }, undo: { v: 0.4, bus: 'ui' }, place: { v: 0.45, bus: 'ui' }, chat: { v: 0.35, bus: 'ui' }, notify: { v: 0.4, bus: 'ui' }, hitmark: { v: 0.28, bus: 'ui', pv: 0.03 }, kill: { v: 0.35, bus: 'ui' },
};
// which volume slider a sound belongs to (Settings > Audio)
const SND_CAT = [['ui', /^(ui|tick|switch|open|close|confirm|error|undo|place|chat|notify|hitmark|kill|draw)$/], ['gore', /^gore_/], ['voices', /^(pain_|death_|scream|z_|jumpscare)/],
  ['steps', /^(step_|cloth|land)/], ['vehicles', /^(eng\d|skid|motor|thruster|crash)/], ['tools', /^(pg_|freeze|unfreeze|tool_|delete_)/], ['amb', /^(amb_|bird|wave|water_loop)/],
  ['weapons', /^(pistol|m1911|rifle|ak|shotgun|sniper|gun_dist|rocket|boom|debris|casing|hull|pump|bolt|ricochet|whiz|swing|throw|pin|nade_|propcannon|bimp_)/], ['impacts', /./]];
const CAT_KEY = { weapons: 'volWeapons', impacts: 'volImpacts', steps: 'volSteps', voices: 'volVoices', gore: 'volGore', vehicles: 'volVehicles', tools: 'volTools', amb: 'volAmb', ui: 'volUI' };
const _catOf = {};
function sndVol(name) { const c = _catOf[name] || (_catOf[name] = SND_CAT.find(([, re]) => re.test(name))[0]); return Settings[CAT_KEY[c]] ?? 1; }
// sound bank for surfaces / materials: footsteps and impacts
const STEP_OF = { grass: 'step_grass', sand: 'step_sand', snow: 'step_snow', wood: 'step_wood', metal: 'step_metal', fabric: 'step_carpet', rubber: 'step_carpet', water: 'step_water' };
const HIT_OF = { wood: 'hit_wood', metal: 'hit_metal', concrete: 'hit_stone', stone: 'hit_stone', glass: 'hit_glass', rubber: 'hit_soft', fabric: 'hit_soft', plastic: 'hit_plastic', neon: 'hit_glass', dev: 'hit_plastic', body: 'hit_body', tin: 'hit_tin', grass: 'hit_soft', sand: 'hit_soft', snow: 'hit_soft', nade: 'nade_bounce' };
const BIMP_OF = { wood: 'bimp_wood', metal: 'bimp_metal', tin: 'bimp_metal', concrete: 'bimp_concrete', stone: 'bimp_concrete', glass: 'bimp_glass', neon: 'bimp_glass', body: 'bimp_flesh', grass: 'bimp_dirt', sand: 'bimp_dirt', snow: 'bimp_dirt', rubber: 'bimp_dirt', fabric: 'bimp_dirt', plastic: 'bimp_wood', dev: 'bimp_concrete' };
// map material key -> surface
function surfaceOf(mt) {
  if (!mt) return 'concrete';
  if (/grass/.test(mt)) return 'grass'; if (/sand/.test(mt)) return 'sand'; if (/snow/.test(mt)) return 'snow';
  if (/wood|plank/.test(mt)) return 'wood'; if (/metal|roof_metal|container/.test(mt)) return 'metal'; if (/glass/.test(mt)) return 'glass';
  if (/fabric|carpet|rubber/.test(mt)) return 'fabric'; if (/plastic/.test(mt)) return 'plastic';
  return 'concrete';   // tiles, plaster, brick, roof, grid, dev
}

const Audio = {
  ctx: null, master: null, buf: {}, last: {}, voices: [], loopsOn: new Set(), indoor: 0, envT: 0, amb: null, ambT: 3, ent: new Map(),
  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        const c = this.ctx = new AC({ latencyHint: 'interactive' });
        this.master = c.createGain(); this.setVolume();
        const comp = this.comp = c.createDynamicsCompressor(); comp.knee.value = 8; comp.attack.value = 0.002; comp.release.value = 0.22;
        this.master.connect(comp); comp.connect(c.destination); this.applyOptions();
        const bg = () => { this.bg = document.hidden || !document.hasFocus(); this.setVolume(); };
        addEventListener('blur', bg); addEventListener('focus', bg); document.addEventListener('visibilitychange', bg);
        this.sfx = c.createGain(); this.sfx.connect(this.master);
        this.uiBus = c.createGain(); this.uiBus.connect(this.master);
        this.ambLP = c.createBiquadFilter(); this.ambLP.type = 'lowpass'; this.ambLP.frequency.value = 20000; this.ambBus = c.createGain(); this.ambBus.connect(this.ambLP); this.ambLP.connect(this.master);
        // reverb: open air (long, sparse, dark tail) and indoor (short, dense, bright) rooms, crossfaded by the listener's surroundings
        this.rvIn = c.createGain();
        this.rvOut = c.createConvolver(); this.rvOut.buffer = this.impulse(2.2, 0.35, 5, 0.18); this.rvRoom = c.createConvolver(); this.rvRoom.buffer = this.impulse(0.9, 1, 22, 0.02);
        this.rvOutG = c.createGain(); this.rvRoomG = c.createGain(); this.rvRoomG.gain.value = 0;
        this.rvIn.connect(this.rvOut); this.rvIn.connect(this.rvRoom); this.rvOut.connect(this.rvOutG); this.rvRoom.connect(this.rvRoomG); this.rvOutG.connect(this.master); this.rvRoomG.connect(this.master);
        const len = c.sampleRate, b = c.createBuffer(1, len, len), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = b;
        this.loadSamples();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { }
  },
  // stereo impulse response: decaying noise that darkens over time, plus a few early reflections (walls, buildings)
  impulse(sec, bright, taps, pre) {
    const c = this.ctx, n = Math.round(sec * c.sampleRate), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / c.sampleRate, k = Math.exp(-6.9 * t / sec), a = Math.min(0.97, 0.25 + (1 - bright) * 0.5 + t / sec * 0.6);
        lp = lp * a + (Math.random() * 2 - 1) * (1 - a); d[i] = t < pre ? 0 : lp * k * 2.2;
      }
      for (let j = 0; j < taps; j++) { const i = Math.round((pre * 0.4 + Math.random() * pre * 1.6 + j * 0.004) * c.sampleRate); if (i < n) d[i] += (Math.random() < 0.5 ? -1 : 1) * 0.5 * Math.exp(-j / taps * 2); }
    }
    return b;
  },
  // decode the embedded banks; loop banks become seamless (crossfaded) loops
  loadSamples() {
    let pack = {}; try { pack = JSON.parse(document.getElementById('tw-sounds')?.textContent || '{}'); } catch (e) { return; }
    for (const [k, list] of Object.entries(pack)) {
      for (const b64 of Array.isArray(list) ? list : [list]) {
        try {
          const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          this.ctx.decodeAudioData(u.buffer).then(b => { (this.buf[k] || (this.buf[k] = [])).push(/_loop$|^eng\d$|^amb_/.test(k) ? this.makeLoop(b) : b); }, () => { });
        } catch (e) { }
      }
    }
  },
  makeLoop(b) {
    const sr = b.sampleRate, cut = Math.round(0.03 * sr), n = b.length - 2 * cut; if (n < sr * 0.2) return b;
    const xf = Math.min(Math.round(0.12 * sr), Math.round(n * 0.25)), out = this.ctx.createBuffer(1, n - xf, sr), s = b.getChannelData(0), d = out.getChannelData(0);
    for (let i = 0; i < n - xf; i++) d[i] = s[cut + i];
    for (let i = 0; i < xf; i++) { const k = i / xf; d[i] = s[cut + i] * Math.sqrt(k) + s[cut + n - xf + i] * Math.sqrt(1 - k); }
    return out;
  },
  setVolume() { if (this.master) this.master.gain.setTargetAtTime(this.bg && Settings.muteBg ? 0 : Settings.volume * 0.7 * (Settings.nightMode ? 1.5 : 1), this.ctx.currentTime, 0.05); },
  // options that change the output chain: mono downmix, night mode (loud sounds squashed, quiet ones lifted)
  applyOptions() {
    if (!this.comp) return;
    const m = !!Settings.monoAudio, cp = this.comp;
    try { cp.channelCount = m ? 1 : 2; cp.channelCountMode = m ? 'explicit' : 'clamped-max'; cp.channelInterpretation = 'speakers'; } catch (e) { }
    cp.threshold.value = Settings.nightMode ? -30 : -10; cp.ratio.value = Settings.nightMode ? 12 : 5;
    this.setVolume();
  },
  // a gunshot panned from your left to your right, to check headphones / speakers
  test3d() {
    this.ensure(); const cam = R.camera, r = _av1.set(1, 0, 0).applyQuaternion(cam.quaternion);
    [-1, 0, 1].forEach((s, i) => setTimeout(() => this.at('pistol', cam.position.clone().addScaledVector(r, s * 6).add(_av2.set(0, 0, 0)), 0.8), i * 550));
  },
  ok() { return this.ctx && this.ctx.state === 'running'; },
  pick(name) {
    const L = this.buf[name]; if (!L || !L.length) return null;
    let i = (Math.random() * L.length) | 0; if (L.length > 1 && i === this.last[name]) i = (i + 1) % L.length;
    this.last[name] = i; return L[i];
  },
  // voice limiting: at most `lim` of one sound and 48 in total; the oldest makes way
  claim(name, lim, end, stop) {
    const t = this.ctx.currentTime; this.voices = this.voices.filter(v => v.end > t);
    const same = this.voices.filter(v => v.n === name);
    if (same.length >= lim) { const o = same[0]; try { o.stop(); } catch (e) { } this.voices.splice(this.voices.indexOf(o), 1); }
    if (this.voices.length >= (Settings.maxVoices || 48)) { const o = this.voices.shift(); try { o.stop(); } catch (e) { } }
    this.voices.push({ n: name, end, stop });
  },
  // 2D sound (UI, your own gun, your own body)
  play(name, vol = 1, o = {}) {
    if (!this.ok()) return;
    if (!this.buf[name]) return this.synth(name, vol);
    if ((name === 'hitmark' && !Settings.hitSound) || (name === 'jumpscare' && !Settings.jumpscareSound)) return;
    const S = SND[name] || SND_DEF, b = this.pick(name); if (!b) return;
    vol *= sndVol(name); if (vol < 0.01) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0), s = c.createBufferSource(), g = c.createGain();
    s.buffer = b; s.playbackRate.value = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * (S.pv ?? SND_DEF.pv));
    g.gain.value = (S.v ?? SND_DEF.v) * vol * (0.9 + Math.random() * 0.2);
    s.connect(g); g.connect(S.bus === 'ui' ? this.uiBus : this.sfx);
    if (S.bus !== 'ui' && Settings.reverb > 0) { const sg = c.createGain(); sg.gain.value = (S.rv ?? SND_DEF.rv) * 0.6; g.connect(sg); sg.connect(this.rvIn); }
    s.start(t); this.claim(name, S.lim || SND_DEF.lim, t + b.duration / s.playbackRate.value, () => s.stop());
  },
  // positional sound at pos (world space). o: rate, delay, vol scale for far layers, ent (don't occlude with it)
  at(name, pos, vol = 1, o = {}) {
    if (!this.ok()) return;
    if (!pos) return this.play(name, vol, o);
    const S = Object.assign({}, SND_DEF, SND[name]), cam = R.camera.position, d = pos.distanceTo(cam);
    vol *= sndVol(name);
    if (d > S.max || vol < 0.02) return;
    if (!this.buf[name]) return this.synth(name, vol * clamp(1 - d / S.max, 0, 1));
    const b = this.pick(name); if (!b) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0) + (S.del && d > 25 && Settings.sosDelay ? d / 343 : 0);
    const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(), p = c.createPanner();
    s.buffer = b; s.playbackRate.value = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * S.pv);
    // walls between us muffle it (a single ray, only when it starts)
    let occ = 0;
    if (S.occ && Settings.occlusion && d > 2.5 && d < 140) { const dir = _av2.subVectors(pos, cam).normalize(), h = Phys.cast(cam, dir, d - 0.8, null, cc => { const id = Phys.colMap.get(cc.handle); return !(typeof id === 'string' || (o.ent && id === o.ent)); }); if (h) occ = S.occ; }
    const edge = S.max * 0.8, fall = d > edge ? 1 - (d - edge) / (S.max - edge) : 1;
    g.gain.value = S.v * vol * (0.9 + Math.random() * 0.2) * (1 - 0.45 * occ) * fall;
    f.type = 'lowpass'; f.frequency.value = (Settings.airAbsorb ? clamp(20000 * Math.exp(-d / 160), 1800, 20000) : 20000) * (occ ? 0.12 + 0.88 * (1 - occ) : 1); f.Q.value = 0.5;
    p.panningModel = this.hrtf() ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse'; p.refDistance = S.r; p.rolloffFactor = S.rf; p.maxDistance = 10000;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    s.connect(g); g.connect(f); f.connect(p); p.connect(this.sfx);
    if (Settings.reverb > 0) { const sg = c.createGain(); sg.gain.value = S.rv * clamp(0.5 + d / 60, 0.5, 1.6) * (1 - 0.3 * occ) * S.v * vol * fall / Math.max(1, (S.r + S.rf * Math.max(0, d - S.r)) / S.r) ** 0.5; f.connect(sg); sg.connect(this.rvIn); }
    s.start(t); this.claim(name, S.lim, t + b.duration / s.playbackRate.value, () => s.stop());
  },
  hrtf() { const m = Settings.audio3d; return m === 'on' || (m !== 'off' && R.path === 'pbr' && R.tier !== 'medium'); },
  // looping positional sound; returns { set(pos, vol, rate), stop() }
  loop(name, o = {}) {
    if (!this.ok()) return null;
    const b = this.pick(name); if (!b) return null;
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain(), S = Object.assign({}, SND_DEF, SND[name]);
    s.buffer = b; s.loop = true; s.playbackRate.value = o.rate || 1; g.gain.value = 0;
    let p = null;
    if (o.pos !== false) {
      p = c.createPanner(); p.panningModel = Settings.audio3d === 'on' ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = o.r || S.r; p.rolloffFactor = o.rf || S.rf; p.maxDistance = 10000;
      s.connect(g); g.connect(p); p.connect(o.bus || this.sfx);
    } else { s.connect(g); g.connect(o.bus || this.sfx); }
    s.start(c.currentTime, Math.random() * b.duration);
    const h = {
      set: (pos, vol, rate) => {
        const t = c.currentTime;
        if (p && pos) { p.positionX.setTargetAtTime(pos.x, t, 0.03); p.positionY.setTargetAtTime(pos.y, t, 0.03); p.positionZ.setTargetAtTime(pos.z, t, 0.03); }
        g.gain.setTargetAtTime(Math.max(0, vol) * (o.v ?? S.v) * sndVol(name), t, 0.06);
        if (rate) s.playbackRate.setTargetAtTime(rate, t, 0.05);
      },
      stop: () => { if (h.dead) return; h.dead = 1; this.loopsOn.delete(h); g.gain.setTargetAtTime(0, c.currentTime, 0.05); setTimeout(() => { try { s.stop(); g.disconnect(); } catch (e) { } }, 400); },
    };
    this.loopsOn.add(h); return h;
  },
  // fallback synth (sounds without a recording, and before the banks finish decoding)
  synth(name, vol) {
    const c = this.ctx, t = c.currentTime, out = c.createGain(); out.gain.value = vol; out.connect(this.sfx);
    const tone = (type, f0, f1, dur, peak) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05); };
    switch (name) {
      case 'hurt': tone('sawtooth', 160, 70, 0.2, 0.2); break;
      case 'jump': tone('sine', 220, 330, 0.08, 0.04); break;
      case 'grab': tone('sine', 300, 900, 0.12, 0.2); break;
    }
  },
  // a looping drone for one nextbot; louder the closer it is
  botLoop() {
    if (!this.ok()) return null;
    try {
      const c = this.ctx, g = c.createGain(); g.gain.value = 0; g.connect(this.sfx);
      const o1 = c.createOscillator(), o2 = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), f = c.createBiquadFilter(), n = c.createBufferSource(), ng = c.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 88 + Math.random() * 30; o2.frequency.value = o1.frequency.value * 1.51;
      lfo.frequency.value = 5 + Math.random() * 4; lg.gain.value = 22; lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
      f.type = 'bandpass'; f.frequency.value = 850; f.Q.value = 0.7; n.buffer = this.noise; n.loop = true; ng.gain.value = 0.35;
      o1.connect(f); o2.connect(f); n.connect(ng); ng.connect(f); f.connect(g);
      for (const x of [o1, o2, lfo, n]) x.start();
      return { dist: d => g.gain.setTargetAtTime(d > 75 ? 0 : Math.pow(1 - d / 75, 2) * 0.6 * (Settings.volVoices ?? 1), c.currentTime, 0.1), stop: () => { try { for (const x of [o1, o2, lfo, n]) x.stop(); g.disconnect(); } catch (e) { } } };
    } catch (e) { return null; }
  },
  // ---- game-level helpers -----------------------------------------------------------------------------------
  // a gunshot heard from pos: the close recording nearby, the distant one further out, a far-away crack beyond that
  gun(w, pos, local) {
    if (!this.ok()) return;
    const W2 = { m1911: 'm1911', ak: 'ak', pistol: 'pistol', rifle: 'rifle', shotgun: 'shotgun', sniper: 'sniper' }[w];
    if (!W2) { if (w === 'rocket') this.at('rocket_fire', pos); else if (w === 'propcannon') this.at('propcannon', pos); else if (w === 'crowbar') this.at('swing', pos); return; }
    const d = local ? 0 : pos.distanceTo(R.camera.position);
    if (local) this.play(W2, 1.3);
    else {
      const kFar = smooth01((d - 30) / 50), kDist = smooth01((d - 170) / 150);
      if (kFar < 1) this.at(W2, pos, 1 - kFar);
      if (kFar > 0 && kDist < 1 && this.buf[W2 + '_far']) this.at(W2 + '_far', pos, kFar * (1 - kDist) * 0.9, { rate: 1 });
      if (kDist > 0) this.at('gun_dist', pos, kDist);
    }
    // mechanics and brass when it's close enough to hear
    if (d < 25) {
      const foot = _av1.copy(pos); foot.y -= local ? 1.4 : 1.2;
      const at = (n, dl, v) => local ? this.play(n, v, { delay: dl }) : this.at(n, pos, v, { delay: dl });
      if (W2 === 'shotgun') { at('pump', 0.32, 1); this.at('hull', foot.clone(), 1, { delay: 0.75 + Math.random() * 0.2 }); }
      else if (W2 === 'sniper') { at('bolt', 0.5, 1); this.at('casing', foot.clone(), 1, { delay: 1.1 + Math.random() * 0.2 }); }
      else this.at('casing', foot.clone(), W2 === 'rifle' || W2 === 'ak' ? 0.7 : 1, { delay: 0.45 + Math.random() * 0.35 });
    }
  },
  // a bullet stopping at `end` (normal n): the surface decides the sound, sometimes it ricochets
  bulletHit(o, end, n) {
    if (!this.ok() || !n) return;
    const dir = _av1.subVectors(end, o), L = dir.length(); if (L < 0.01) return; dir.divideScalar(L);
    const h = Phys.cast(_av2.copy(end).addScaledVector(dir, -Math.min(0.5, L * 0.5)), dir, 1.0, null), surf = h ? this.surfaceAt(h) : 'concrete';   // trace just the last bit (not from inside the shooter)
    this.at(BIMP_OF[surf] || 'bimp_concrete', end);
    if ((surf === 'metal' || surf === 'concrete') && Math.random() < 0.18) this.at('ricochet', end, 0.8, { delay: 0.02 });
  },
  // bullets flying past your head crack and whizz
  flyby(o, end) {
    if (!this.ok()) return;
    const cam = R.camera.position, ab = _av1.subVectors(end, o), L2 = ab.lengthSq(); if (L2 < 1) return;
    const k = clamp(_av2.subVectors(cam, o).dot(ab) / L2, 0, 1), pt = o.clone().addScaledVector(ab, k), d = pt.distanceTo(cam);
    if (d < 3 && cam.distanceTo(o) > 6) this.at('whiz', pt, 1 - d / 4);
  },
  explosion(p, sc = 1) {
    const d = p.distanceTo(R.camera.position);
    if (d < 90) this.at('boom', p, Math.min(1.2, 0.8 + sc * 0.3)); if (d > 50) this.at('boom_far', p, smooth01((d - 50) / 60));
    if (d < 60) this.at('debris', p, 0.9, { delay: 0.35 + Math.random() * 0.2 });
  },
  // what surface a ray hit: an entity's material (NPC / player = body), a map piece, terrain or the theme's ground
  surfaceAt(h) {
    if (typeof h.id === 'string') return 'body';
    if (h.id > 0) { const e = World.ents.get(h.id); if (!e) return 'concrete'; if (e.d.k === 'part') return 'body'; if (e.d.k === 'nade') return 'metal'; if (e.d.vis === 'barrel' || e.d.vis === 'propane') return 'tin'; if (e.d.vis === 'melon') return 'fabric'; return surfaceOf(e.d.m); }
    const mt = Env.colMat.get(h.handle);
    if (mt === 'terrain') return Env.sandAt && Env.sandAt(h.point.x, h.point.z) > 0.5 ? 'sand' : 'grass';
    if (mt) return surfaceOf(mt);
    const th = THEMES[Rules.env]; return th && th.ground && th.ground !== 'grid' ? surfaceOf(th.ground) : 'concrete';
  },
  groundUnder(pos, excl) {
    const h = Phys.cast(_av3.set(pos.x, pos.y + 0.4, pos.z), DOWN, 1.4, null, excl);
    if (!h) return null;
    const w = Env.waterAt(pos.x, pos.z); if (w != null && h.point.y < w - 0.05 && pos.y < w + 0.1) return 'water';
    return this.surfaceAt(h);
  },
  // ---- per frame ----------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.ok()) return;
    const c = this.ctx, cam = R.camera, L = c.listener, t = c.currentTime;
    const f = _av1.set(0, 0, -1).applyQuaternion(cam.quaternion), u = _av2.set(0, 1, 0).applyQuaternion(cam.quaternion);
    if (L.positionX) {
      L.positionX.setTargetAtTime(cam.position.x, t, 0.02); L.positionY.setTargetAtTime(cam.position.y, t, 0.02); L.positionZ.setTargetAtTime(cam.position.z, t, 0.02);
      L.forwardX.setTargetAtTime(f.x, t, 0.02); L.forwardY.setTargetAtTime(f.y, t, 0.02); L.forwardZ.setTargetAtTime(f.z, t, 0.02);
      L.upX.setTargetAtTime(u.x, t, 0.02); L.upY.setTargetAtTime(u.y, t, 0.02); L.upZ.setTargetAtTime(u.z, t, 0.02);
    } else { L.setPosition(cam.position.x, cam.position.y, cam.position.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
    // room: a roof overhead + walls around = indoors (short bright reverb, muffled outdoor ambience); dark rooms go quieter still
    if ((this.envT -= dt) <= 0) {
      this.envT = 0.25;
      const o = cam.position, notMe = cc => typeof Phys.colMap.get(cc.handle) !== 'string';
      const roof = Phys.cast(o, UP, 30, null, notMe); let walls = 0;
      for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Phys.cast(o, _av3.set(x, 0, z), 14, null, notMe)) walls++;
      this.indoorT = roof && walls >= 3 ? 1 : roof && walls >= 2 ? 0.6 : 0;
    }
    this.indoor += ((this.indoorT || 0) - this.indoor) * Math.min(1, dt * 3);
    const rv = Settings.reverb ?? 1; this.rvOutG.gain.setTargetAtTime(0.9 * (1 - this.indoor) * rv, t, 0.1); this.rvRoomG.gain.setTargetAtTime(1.1 * this.indoor * rv, t, 0.1);
    this.ambLP.frequency.setTargetAtTime(this.indoor > 0.5 ? 900 : 20000, t, 0.3);
    this.ambBus.gain.setTargetAtTime((1 - 0.55 * this.indoor) * (1 - (R.dark || 0) * 0.6), t, 0.3);
    this.ambience(dt); this.movement(dt); this.impacts(dt); this.machines(dt);
  },
  // wind / city / lake beds per map, birdsong around you
  ambience(dt) {
    const th = Rules.env, AMB = { plains: [['amb_wind', 0.35]], desert: [['amb_windstrong', 0.3]], snow: [['amb_windstrong', 0.45]], construct: [['amb_city', 0.4], ['amb_wind', 0.16]], arena: [['amb_wind', 0.15]], flatgrass: [['amb_wind', 0.3]], bigcity: [['amb_city', 0.75], ['amb_wind', 0.12]] }[th] || [];
    if (!this.amb || this.amb.th !== th) {
      if (this.amb) for (const h of this.amb.h) h && h.stop();
      this.amb = { th, h: AMB.map(([n]) => this.loop(n, { pos: false, bus: this.ambBus, v: 1 })) };
      if (this.amb.h.some(h => !h)) { for (const h of this.amb.h) h && h.stop(); this.amb = null; return; }
      this.amb.h.forEach((h, i) => h.set(null, AMB[i][1]));
    }
    const cam = R.camera.position;
    if ((th === 'plains' || th === 'construct' || th === 'flatgrass' || th === 'bigcity') && (this.ambT -= dt) <= 0) {   // a bird somewhere in the trees
      this.ambT = 2.5 + Math.random() * 7;
      const a = Math.random() * 6.283, r = 25 + Math.random() * 45;
      this.at('bird', new V3(cam.x + Math.cos(a) * r, cam.y + 6 + Math.random() * 8, cam.z + Math.sin(a) * r), 0.6 + Math.random() * 0.4);
    }
    // the lake: lapping water from the nearest bit of shore, now and then a wave
    const w = Env.waters && Env.waters[0];
    if (w) {
      const px = clamp(cam.x, w.x0, w.x1), pz = clamp(cam.z, w.z0, w.z1), d = Math.hypot(px - cam.x, pz - cam.z, w.y - cam.y);
      if (!this.lake) this.lake = this.loop('water_loop', { r: 6, rf: 1.2, v: 0.5 });
      if (this.lake) this.lake.set(_av3.set(px, w.y, pz), d < 60 ? 1 : 0);
      if (d < 22 && (this.waveT = (this.waveT || 4) - dt) <= 0) { this.waveT = 3 + Math.random() * 5; this.at('wave', new V3(px, w.y, pz)); }
    } else if (this.lake) { this.lake.stop(); this.lake = null; }
  },
  // footsteps, landings, jumps and splashes for players and walking NPCs
  movement(dt) {
    for (const p of Players.map.values()) {
      const sst = p._snd || (p._snd = { py: p.renderPos.y, vy: 0, air: 0 });
      if ((sst.seat || 0) !== (p.seat || 0)) {
        const se = World.ents.get(p.seat || sst.seat); this.at('cloth', p.renderPos, 1);
        if (se && se.d.vis && /chair|couch/.test(se.d.vis)) this.at('creak', p.renderPos, 0.8);
        sst.seat = p.seat || 0;
      }
      if (p.dead || p.seat || p.noclip) { p._stepT = 0; continue; }
      const pos = p.renderPos, v = p.vel, hs = Math.hypot(v.x, v.z), st = p._snd || (p._snd = { py: pos.y, vy: 0, air: 0 });
      const vy = (pos.y - st.py) / Math.max(dt, 1e-3); st.py = pos.y;
      const grounded = p.isLocal ? p.grounded : Math.abs(vy) < 1.2;
      const excl = cc => Phys.colMap.get(cc.handle) !== 'p:' + p.id;
      if (!grounded) { st.air += dt; st.minVy = Math.min(st.minVy || 0, vy); }
      else {
        if (st.air > 0.25 && (st.minVy || 0) < -4) { const s = this.groundUnder(pos, excl); this.at(s === 'water' ? 'splash_s' : 'land', pos, clamp(-st.minVy / 12, 0.4, 1)); if (s && s !== 'water') this.at(STEP_OF[s] || 'step_concrete', pos, 1); }
        st.air = 0; st.minVy = 0;
        if (hs > 1.2) {
          const stride = p.crouch ? 0.9 : hs > 6 ? 1.9 : 1.45;
          p._stepT = (p._stepT || 0) + hs * dt;
          if (p._stepT > stride) { p._stepT = 0; const s = this.groundUnder(pos, excl); if (s) this.at(STEP_OF[s] || 'step_concrete', pos, (p.crouch ? 0.35 : hs > 6 ? 1 : 0.75) * (p.isLocal ? 0.8 : 1)); }
        }
      }
      // falling into the lake
      const w = Env.waterAt(pos.x, pos.z);
      if (w != null) { const inW = pos.y < w; if (inW && !st.inW && vy < -2) this.at(vy < -7 ? 'splash_l' : 'splash_s', new V3(pos.x, w, pos.z)); st.inW = inW; }
    }
    // NPCs: steps from the pelvis' walking speed
    for (const g of World.groups.values()) {
      if (g.t !== 'npc' || !g.parts) continue;
      const pe = World.ents.get(g.parts[0]); if (!pe || !pe.mesh) continue;
      const pos = pe.mesh.position, st = g._snd || (g._snd = { p: pos.clone(), t: 0 });
      if (pos.distanceTo(R.camera.position) > 35) { st.p.copy(pos); continue; }
      const hs = Math.hypot(pos.x - st.p.x, pos.z - st.p.z) / Math.max(dt, 1e-3), vy = (pos.y - st.p.y) / Math.max(dt, 1e-3); st.p.copy(pos);
      if (!g.alive || hs < 0.7 || hs > 9 || Math.abs(vy) > 1.5) continue;
      st.t += hs * dt;
      if (st.t > 1.3) { st.t = 0; const f = new V3(pos.x, pos.y - 0.9, pos.z), s = this.groundUnder(f, cc => { const id = Phys.colMap.get(cc.handle); return !(typeof id === 'number' && g.parts.includes(id)); }); if (s) this.at(STEP_OF[s] || 'step_concrete', f.clone(), 0.75); }
    }
  },
  // physics impacts heard on every peer: a sudden change in an object's (rendered) velocity is a hit
  impacts(dt) {
    if (dt <= 0) return;
    const cam = R.camera.position, grabbed = Tools.grab && Tools.grab.e, seen = this.ent;
    for (const e of World.ents.values()) {
      if (!e.mesh || e.d.k === 'map' || e.d.fz) continue;
      if (e.d.k === 'part') { const g = e.d.g && World.groups.get(e.d.g); if (!g || e.id !== g.parts[0] && e.id !== g.parts[1]) continue; }
      const pos = e.mesh.position;
      let s = seen.get(e.id); if (!s) { seen.set(e.id, s = { p: pos.clone(), v: new V3(), cd: 0.3, py: pos.y }); continue; }
      const nv = _av1.subVectors(pos, s.p).divideScalar(dt), jump = s.p.distanceToSquared(pos) > 25;
      const dv = _av2.subVectors(nv, s.v).length(), slowed = nv.lengthSq() < s.v.lengthSq() * 0.8;
      s.cd -= dt;
      // bodies: only a real landing (was falling, stopped), once per NPC every 0.3 s - not the standing balance wobble
      const grp = e.d.k === 'part' ? World.groups.get(e.d.g) : null, landed = !grp || (nv.y - s.v.y > 2.8 && dv > 3.2 && !(grp._hitT > now() - 0.3));
      if (!jump && s.cd <= 0 && dv > 2.6 && slowed && landed && e.id !== grabbed && pos.distanceTo(cam) < 80) {
        if (grp) grp._hitT = now();
        const wl = Env.waterAt(pos.x, pos.z); if (wl != null && pos.y < wl - 0.3) { s.p.copy(pos); s.v.copy(nv); s.py = pos.y; continue; }
        s.cd = 0.14;
        const k = clamp((dv - 2.2) / 9, 0.08, 1), heavy = dv > 7 || (e.body && e.body.mass && e.body.mass() > 60 && dv > 4);
        let surf = e.d.k === 'part' ? 'body' : e.d.k === 'nade' ? 'nade' : (e.d.vis === 'barrel' || e.d.vis === 'propane') ? 'tin' : e.d.vis === 'melon' ? 'fabric' : surfaceOf(e.d.m);
        if (e.d.veh) { this.at(dv > 9 ? 'crash' : 'hit_metal_h', pos, k, { ent: e.id }); if (dv > 12 && Math.random() < 0.5) this.at('break_glass', pos, 0.6, { ent: e.id }); }
        else {
          let bank = HIT_OF[surf] || 'hit_plastic';
          if (heavy && this.buf[bank + '_h']) bank += '_h';
          if (surf === 'body' && heavy && dv > 10) this.at('gore_squish', pos, 0.5, { ent: e.id });
          this.at(bank, pos, k, { ent: e.id, rate: e.d.k === 'prop' && e.body && e.body.mass && e.body.mass() < 2 ? 1.15 : 1 });
        }
      }
      // splashing into the lake
      const w = Env.waterAt(pos.x, pos.z);
      if (w != null && s.py >= w && pos.y < w && nv.y < -1.5) this.at(nv.y < -7 ? 'splash_l' : 'splash_s', new V3(pos.x, w, pos.z), clamp(-nv.y / 10, 0.3, 1));
      s.py = pos.y; s.p.copy(pos); s.v.copy(nv);
    }
    if (seen.size > World.ents.size + 64) for (const id of seen.keys()) if (!World.ents.has(id)) seen.delete(id);
  },
  // running machines: vehicles (engine + tyre squeal), motors, thrusters, rockets in flight, your physgun
  machines(dt) {
    const want = new Map();
    for (const id of World.vehicles) {
      const e = World.ents.get(id); if (!e || !e.mesh) continue;
      const V = VEH[e.d.veh]; if (!V) continue;
      const c = Vehicles.ctl.get(id), thr = c ? c.thr || 0 : e.vs ? e.vs[1 + V.w.length] || 0 : 0;
      let driven = false; for (const p of Players.map.values()) if (p.seat) { const cc = Auth.contraption(p.seat); if (cc && cc.veh === id) driven = true; }
      const spd = Math.abs(e._spd || 0), d = e.mesh.position.distanceTo(R.camera.position);
      if ((!driven && spd < 1) || d > 120) continue;
      // a 5-speed box: revs climb through each gear and drop on the shift
      const gearTop = [0, 7, 14, 22, 31, 99], g = gearTop.findIndex(x => spd < x), lo = gearTop[Math.max(0, g - 1)], hi = Math.min(gearTop[g], lo + 12);
      const rev = driven ? clamp(0.12 * Math.abs(thr) + clamp((spd - lo) / (hi - lo), 0, 1) * 0.88, 0, 1) : clamp(spd / 30, 0, 0.5);
      const f = 42 + 88 * rev, vol = (driven ? 0.6 + 0.4 * Math.abs(thr) : 0.3) * clamp(0.45 + spd / 25, 0.45, 1);
      const ws = ENG_LAYERS.map(([n, f0], i) => (i === 0 && f <= f0) || (i === ENG_LAYERS.length - 1 && f >= f0) ? 1 : Math.max(0, 1 - Math.abs(Math.log(f / f0)) / Math.log(1.45))), sum = ws.reduce((x, y) => x + y, 0) || 1;
      ENG_LAYERS.forEach(([n, f0], i) => { if (ws[i] > 0.01) want.set(n + id, { n, pos: e.mesh.position, vol: vol * Math.sqrt(ws[i] / sum), rate: f / f0, r: 5 }); });
      const right = _av1.set(1, 0, 0).applyQuaternion(e.mesh.quaternion), s = this.ent.get(id), lat = s ? Math.abs(s.v.dot(right)) : 0;
      if (lat > 4) want.set('skid' + id, { n: 'skid_loop', pos: e.mesh.position, vol: clamp((lat - 4) / 6, 0, 1), rate: 0.9 + lat / 40, r: 4 });
    }
    // motors spinning (from the constraint's part turning), thrusters firing, rockets flying
    for (const cn of World.cons.values()) {
      if (cn.t !== 'motor') continue;
      const e = World.ents.get(cn.a); if (!e || !e.mesh) continue;
      const s = this.ent.get(e.id) || {}, q = e.mesh.quaternion, pq = s.q || (s.q = q.clone()), ang = 2 * Math.acos(clamp(Math.abs(pq.dot(q)), 0, 1)) / Math.max(dt, 1e-3); s.q = pq.copy(q);
      this.ent.set(e.id, Object.assign(this.ent.get(e.id) || {}, s));
      if (ang > 1.5) want.set('mot' + cn.id, { n: 'motor_loop', pos: e.mesh.position, vol: clamp(ang / 12, 0.2, 1), rate: 0.5 + Math.min(ang, 30) / 16, r: 3 });
    }
    for (const e of World.ents.values()) {
      if (e.d.thr && e.mesh) { let on = 0; for (const g of e.mesh.children) { const f = g.userData.thr != null && g.getObjectByName('flame'); if (f && f.visible) on++; } if (on) want.set('thr' + e.id, { n: 'thruster_loop', pos: e.mesh.position, vol: Math.min(1, 0.5 + on * 0.25), rate: 1, r: 4 }); }
    }
    for (const id of World.rockets) { const e = World.ents.get(id); if (e && e.mesh) want.set('rk' + id, { n: 'rocket_loop', pos: e.mesh.position, vol: 1, rate: 1, r: 6 }); }
    if (Tools.grab && Tools.weapon === 'physgun') { const e = World.ents.get(Tools.grab.e), sp = e ? (this.ent.get(e.id) || {}).v : null; want.set('pg', { n: 'pg_loop', pos: R.camera.position.clone().add(_av3.set(0, -0.3, 0)), vol: 0.22 + (sp ? Math.min(0.25, sp.length() / 40) : 0), rate: 1 + (sp ? Math.min(0.4, sp.length() / 30) : 0), r: 2 }); }
    // start / update / stop
    const run = this.run || (this.run = new Map());
    for (const [k, w] of want) {
      let h = run.get(k); if (!h) { h = this.loop(w.n, { r: w.r }); if (!h) continue; run.set(k, h); }
      h.set(w.pos, w.vol, w.rate);
    }
    for (const [k, h] of run) if (!want.has(k)) { h.stop(); run.delete(k); }
  },
};
// particle points: round, and capped on screen so a burst right at the camera doesn't cover the view in squares
function ptsMat(o) {
  const m = new THREE.PointsMaterial(Object.assign({ transparent: true, depthWrite: false }, o));
  m.userData.outlineParameters = { visible: false };
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <fog_vertex>', 'gl_PointSize = min(gl_PointSize, 20.0); if (-mvPosition.z < 0.35) gl_PointSize = 0.0;\n#include <fog_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', 'if (length(gl_PointCoord - 0.5) > 0.5) discard;\n#include <clipping_planes_fragment>');
  };
  return m;
}
// crowbar swing, seconds since the click -> [rx, ry, rz, px, py, pz] added to the resting pose:
// a quick wind-up, a fast diagonal chop (the hit lands at SWING_HIT), a follow-through and an easy recovery
const SWING_KEYS = [
  [0, [0, 0, 0, 0, 0, 0], 'out'],
  [0.07, [0.4, -0.25, -0.2, 0.035, 0.05, 0.05], 'in'],
  [0.15, [-0.95, 0.75, 0.3, -0.1, -0.03, -0.04], 'out'],
  [0.23, [-1.1, 0.85, 0.38, -0.12, -0.06, -0.02], 'inout'],
  [0.46, [0, 0, 0, 0, 0, 0], ''],
];
const SWING_HIT = 0.12, SWING_REST = [0, 0, 0, 0, 0, 0];
// host physics quality levels, cheapest last (cost = rough relative CPU per second of simulation)
const PHYS_LEVELS = [{ dt: 1 / 60, it: 6, cost: 1 }, { dt: 1 / 60, it: 4, cost: 0.8 }, { dt: 1 / 30, it: 4, cost: 0.42 }];
const _swOut = [0, 0, 0, 0, 0, 0];
function swingPose(t) {
  if (t >= SWING_KEYS[SWING_KEYS.length - 1][0]) return SWING_REST;
  let i = 0; while (t > SWING_KEYS[i + 1][0]) i++;
  const [t0, a, ease] = SWING_KEYS[i], [t1, b] = SWING_KEYS[i + 1];
  let u = clamp((t - t0) / (t1 - t0), 0, 1);
  u = ease === 'in' ? u * u : ease === 'out' ? 1 - (1 - u) * (1 - u) : u * u * (3 - 2 * u);
  for (let j = 0; j < 6; j++) _swOut[j] = a[j] + (b[j] - a[j]) * u;
  return _swOut;
}
const FX = {
  list: [], beams: [], light: null, smokeTex: null,
  init() {
    this.light = new THREE.PointLight(0xffb060, 0, 18, 2); R.scene.add(this.light);
    const c = Tex.canvas(64, (x, s) => { const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); });
    this.smokeTex = new THREE.CanvasTexture(c);
  },
  beam(a, b, color, life, width) {
    let bm = this.beams.find(x => !x.mesh.visible);
    if (!bm) { bm = new Beam(color, width); this.beams.push(bm); }
    bm.w = width; bm.mesh.material.color.set(color); bm.mesh.material.opacity = 1; bm.set(a, _v4.addVectors(a, b).multiplyScalar(0.5).clone(), b); bm.mesh.visible = true;
    this.list.push({ t: 0, life, upd: (k) => { bm.mesh.material.opacity = 1 - k; }, end: () => { bm.mesh.visible = false; } });
  },
  tracer(a, b) { this.beam(a, b, 0xffd27a, 0.07, 0.018); },
  // muzzle flash: a hot core and an orange bloom for a couple of frames, a flicker of light, and smoke for big guns.
  // `at` is the viewmodel's muzzle (the flash rides along with the gun) or a world position (other players).
  muzzle(at, kind) {
    const big = kind === 'big', puff = kind === 'puff', obj = at.isObject3D ? at : null, wp = obj ? obj.getWorldPosition(new V3()) : at;
    if (!puff) for (const [col, sz, op] of [[0xfff2c8, big ? 0.2 : 0.13, 1], [0xff9a3c, big ? 0.55 : 0.34, 0.8]]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, rotation: Math.random() * Math.PI }));
      sp.material.userData.outlineParameters = { visible: false }; sp.renderOrder = 10;
      const s0 = sz * (0.8 + Math.random() * 0.4); sp.scale.setScalar(s0);
      if (obj) obj.add(sp); else { sp.position.copy(wp); R.scene.add(sp); }
      this.list.push({ t: 0, life: 0.06, upd: k => { sp.material.opacity = op * (1 - k); sp.scale.setScalar(s0 * (1 + k * 0.6)); }, end: () => { sp.removeFromParent(); sp.material.dispose(); } });
    }
    if (this.light.intensity < 2 && !puff) {   // shares the explosion light: only when no explosion is lighting things up
      this.light.position.copy(wp); this.light.intensity = big ? 9 : 6;
      this.list.push({ t: 0, life: 0.05, upd: k => { if (this.light.intensity <= 9) this.light.intensity = (big ? 9 : 6) * (1 - k); }, end: () => { if (this.light.intensity <= 9) this.light.intensity = 0; } });
    }
    if (big || puff) this.smoke(wp, puff ? 2 : 1, puff ? 0.35 : 0.18, 0.6, 0xcfcfcf);
  },
  zap(a, b) { this.beam(a, b, 0x9ff3ff, 0.12, 0.03); this.spark(b, null, 0x9ff3ff, 6); },
  spark(p, n, color, count) {
    count = count || 10;
    const pos = new Float32Array(count * 3), vel = [];
    for (let i = 0; i < count; i++) { pos.set([p.x, p.y, p.z], i * 3); const v = new V3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 4); if (n) v.addScaledVector(n, 2); vel.push(v); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = ptsMat({ color: color || 0xffc46b, size: 0.07, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; R.scene.add(pts);
    this.list.push({ t: 0, life: 0.35, upd: (k, dt) => { for (let i = 0; i < count; i++) { vel[i].y -= 9 * dt; pos[i * 3] += vel[i].x * dt; pos[i * 3 + 1] += vel[i].y * dt; pos[i * 3 + 2] += vel[i].z * dt; } g.attributes.position.needsUpdate = true; m.opacity = 1 - k; }, end: () => { R.scene.remove(pts); g.dispose(); m.dispose(); } });
  },
  poof(p) { this.smoke(p, 3, 0.6, 0.5, 0xdddddd); },
  smoke(p, n, size, life, color) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color, transparent: true, opacity: 0.5, depthWrite: false }));
      s.material.userData.outlineParameters = { visible: false };
      s.position.copy(p).add(new V3((Math.random() - 0.5) * size, Math.random() * size * 0.5, (Math.random() - 0.5) * size)); s.scale.setScalar(size); R.scene.add(s);
      const v = new V3((Math.random() - 0.5), Math.random() * 1.2 + 0.3, (Math.random() - 0.5));
      this.list.push({ t: 0, life, upd: (k, dt) => { s.position.addScaledVector(v, dt); s.scale.setScalar(size * (1 + k * 1.5)); s.material.opacity = 0.5 * (1 - k); }, end: () => { R.scene.remove(s); s.material.dispose(); } });
    }
  },
  // prop breaking: balloon pop, glass shatter, melon splat
  burst(p, kind, color) {
    if (kind === 'brick' || kind === 'wood' || kind === 'concrete') {   // dust + crumbs
      this.smoke(p, 6, 1.3, 0.9, kind === 'wood' ? 0x8a7458 : kind === 'brick' ? 0x9c7466 : 0x9a9a98); this.spark(p, null, kind === 'wood' ? 0xc8a070 : 0xb0a8a0, 18);
      Audio.at(kind === 'wood' ? 'break_wood' : 'break_stone', p); return;
    }
    if (kind === 'pop') { this.spark(p, null, new THREE.Color(color || '#ff5a5f').getHex(), 16); this.smoke(p, 2, 0.4, 0.3, 0xffffff); Audio.at('pop', p); }
    else if (kind === 'glass') { this.spark(p, null, 0xcdeeff, 22); Audio.at('break_glass', p); }
    else { this.spark(p, null, 0xe8413c, 24); this.smoke(p, 3, 0.5, 0.5, 0xd94a3a); Audio.at('gore_splat', p); }
  },
  // smoke trails behind rockets in flight
  trails(dt) {
    this.trailT = (this.trailT || 0) + dt; const puff = this.trailT > 0.02; if (puff) this.trailT = 0;
    for (const id of World.rockets) {
      const e = World.ents.get(id); if (!e || !e.mesh) continue;
      const f = e.mesh.getObjectByName('flame'); if (f) f.scale.set(1, 1, 0.7 + Math.random() * 0.6);
      if (puff) this.smoke(_v1.set(0, 0, 0.45).applyQuaternion(e.mesh.quaternion).add(e.mesh.position), 1, 0.35, 0.9, 0xb0b0b0);
    }
  },
  boom(p, sc = 1) {
    const flash = new THREE.Mesh(Geo.get('fxs', () => new THREE.SphereGeometry(1, 20, 14)), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.material.userData.outlineParameters = { visible: false };
    flash.position.copy(p); R.scene.add(flash);
    this.light.position.copy(p); this.light.intensity = 60;
    this.list.push({ t: 0, life: 0.35, upd: k => { flash.scale.setScalar((0.5 + k * 4) * Math.sqrt(sc)); flash.material.opacity = 0.9 * (1 - k); this.light.intensity = 60 * (1 - k); }, end: () => { R.scene.remove(flash); flash.material.dispose(); this.light.intensity = 0; } });
    this.spark(p, UP, 0xffa640, 40);
    this.smoke(p, Math.round(7 * sc), 1.4 * Math.sqrt(sc), 0.9, 0x777777);
    Audio.explosion(p, sc);
    if (Players.local) { const d = p.distanceTo(Players.local.renderPos); if (d < 18 * sc) Game.shake = Math.max(Game.shake, (1 - d / (18 * sc)) * 0.5); }
  },
  remote(m) {
    if (m.k === 'shot') {
      const o = new V3().fromArray(m.o), ends = Array.isArray(m.e[0]) ? m.e : [m.e];
      if (o.distanceTo(R.camera.position) > 1.5 && m.w !== 'crowbar') this.muzzle(_v1.fromArray(ends[0]).sub(o).normalize().multiplyScalar(0.7).add(o).clone(), ends.length > 1 || m.w === 'sniper' ? 'big' : 'small');
      ends.forEach((a, i) => { const e = new V3().fromArray(a); this.tracer(o, e); if (m.n) this.spark(e, new V3().fromArray(m.n)); else if (ends.length > 1) this.spark(e, null, null, 4); if (i < 3) Audio.bulletHit(o, e, m.n || ends.length > 1 ? UP : null); Audio.flyby(o, e); });
      Audio.gun(m.w, o);
    }
    else if (m.k === 'burst') this.burst(new V3().fromArray(m.p), m.n, m.c);
    else if (m.k === 'gore') Gore.hit(m);
    else if (m.k === 'sever') Gore.severFx(m.g, m.j);
    else if (m.k === 'slam') Gore.slam(m);
    else if (m.k === 'jumpscare') Bots.jumpscare(m.f | 0);
    else if (m.k === 'delfx') { const p = new V3().fromArray(m.p), s = m.s || 1; this.spark(p, UP, 0xff4a3d, 18 * s); this.smoke(p, 2 + s * 2, 0.6 * s, 0.5, 0x3a3a3a); Audio.at('pop', p, 0.5); }
    else if (m.k === 'gib') Gore.gib(m);
    else if (m.k === 'heal') Gore.heal(m.g);
    else if (m.k === 'spark') { const e = new V3().fromArray(m.e); this.spark(e, m.n ? new V3().fromArray(m.n) : null); Audio.at('bimp_metal', e); }
    else if (m.k === 'boom') this.boom(new V3().fromArray(m.p), m.s || 1);
    else if (m.k === 'sfx') Audio.at(m.n, new V3().fromArray(m.p));
  },
  update(dt) {
    this.trails(dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i]; f.t += dt; const k = Math.min(1, f.t / f.life);
      f.upd(k, dt); if (k >= 1) { f.end(); this.list.splice(i, 1); }
    }
  },
};

// floating damage numbers (only the shooter sees them); pellets from one shot add up, separate hits stack upward
const DmgNum = {
  list: [],
  add(m) {
    if (!Settings.dmgNums || Game.state !== 'playing') return;
    const t = now(), last = this.list.find(n => n.tg === m.g && t - n.t0 < 0.07 && !n.kill);
    if (last) {
      last.v += m.v; last.head = last.head || m.h; last.kill = m.k; last.t0 = t; last.pop = 0;
      last.pos.lerp(_v1.fromArray(m.p), 0.5); this.paint(last); return;
    }
    const d = document.createElement('div'), stack = this.list.filter(n => n.tg === m.g && n.age < 0.6).length;
    const n = { d, v: m.v, head: m.h, kill: m.k, tg: m.g, pos: new V3().fromArray(m.p), age: 0, pop: 0, t0: t, dx: (Math.random() - 0.5) * 40, dy: Math.min(stack, 4) * 22 };
    this.paint(n); $('#dmgNums').append(d); this.list.push(n);
    if (this.list.length > 30) { this.list[0].d.remove(); this.list.shift(); }
  },
  paint(n) { n.d.textContent = n.kill ? n.v + ' ✖' : n.v; n.d.className = 'dn' + (n.kill ? ' kill' : n.head ? ' head' : ''); },
  update(dt) {
    if (!this.list.length) return;
    const W = innerWidth, H = innerHeight;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i], life = n.kill ? 1.5 : 1.0; n.age += dt; n.pop += dt;
      if (n.age >= life) { n.d.remove(); this.list.splice(i, 1); continue; }
      _v1.copy(n.pos).project(R.camera);
      if (_v1.z > 1 || Math.abs(_v1.x) > 1.2 || Math.abs(_v1.y) > 1.2) { n.d.style.display = 'none'; continue; }
      const k = n.age / life, s = n.pop < 0.12 ? 1.45 - n.pop / 0.12 * 0.45 : 1;
      const x = (_v1.x * 0.5 + 0.5) * W + n.dx * k, y = (-_v1.y * 0.5 + 0.5) * H - 18 - n.dy - 55 * Math.sqrt(k);
      n.d.style.display = ''; n.d.style.opacity = k > 0.65 ? (1 - k) / 0.35 : 1;
      n.d.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${s.toFixed(3)})`;
    }
  },
  clear() { for (const n of this.list) n.d.remove(); this.list = []; },
};

// ---- Nextbots (client): camera-facing faces + a droning scream that gets louder as they close in ----
function drawBotFace(i) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320; const x = c.getContext('2d');
  const ell = (cx, cy, rx, ry, fill) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); };
  const g = x.createRadialGradient(128, 150, 20, 128, 160, 150); g.addColorStop(0, ['#efe6d6', '#d9d2c2', '#e6dccb', '#cfc9bd'][i]); g.addColorStop(1, '#8c8377');
  ell(128, 160, 118, 150, g); x.lineWidth = 6; x.strokeStyle = '#1a1512'; x.stroke();
  x.fillStyle = 'rgba(40,20,10,0.18)'; for (let k = 0; k < 40; k++) { x.beginPath(); x.arc(20 + Math.random() * 216, 30 + Math.random() * 260, 2 + Math.random() * 6, 0, 7); x.fill(); }   // blotches
  if (i === 0) {        // the grinner
    ell(84, 120, 30, 36, '#050505'); ell(172, 120, 30, 36, '#050505'); ell(90, 118, 5, 5, '#fff'); ell(166, 118, 5, 5, '#fff');
    x.beginPath(); x.moveTo(40, 200); x.quadraticCurveTo(128, 300, 216, 200); x.quadraticCurveTo(128, 250, 40, 200); x.fillStyle = '#3a0508'; x.fill();
    x.fillStyle = '#f4f0e6'; for (let k = 0; k < 11; k++) { const t = k / 10, px = 52 + t * 152, py = 205 + Math.sin(t * Math.PI) * 38; x.fillRect(px - 6, py - 4, 11, 16); }
  } else if (i === 1) { // the screamer
    ell(88, 118, 24, 34, '#050505'); ell(168, 118, 24, 34, '#050505');
    x.strokeStyle = '#6a0a0a'; x.lineWidth = 4; for (const ex of [88, 168]) { x.beginPath(); x.moveTo(ex, 150); x.lineTo(ex - 4, 210); x.stroke(); }
    ell(128, 238, 44, 58, '#080202'); ell(128, 250, 22, 26, '#3a0000');
  } else if (i === 2) { // the eye
    ell(128, 120, 64, 52, '#f6f2ea'); x.lineWidth = 5; x.strokeStyle = '#1a1512'; x.stroke(); ell(128, 124, 30, 30, '#6b0f0f'); ell(128, 124, 14, 14, '#050505'); ell(120, 116, 5, 5, '#fff');
    x.strokeStyle = '#8a1a1a'; x.lineWidth = 2; for (let k = 0; k < 8; k++) { x.beginPath(); x.moveTo(70 + k * 16, 80 + (k % 2) * 90); x.lineTo(100 + k * 8, 124); x.stroke(); }
    x.beginPath(); x.moveTo(60, 230); for (let k = 0; k <= 12; k++) x.lineTo(60 + k * 11.3, 230 + (k % 2 ? 22 : 0)); x.lineTo(196, 250); x.lineTo(60, 250); x.fillStyle = '#120404'; x.fill();
  } else {              // the stitched smile
    for (const ex of [88, 168]) { ell(ex, 122, 26, 26, '#140c0a'); ell(ex, 122, 6, 6, '#b3121a'); }
    x.strokeStyle = '#7a0d10'; x.lineWidth = 6; x.beginPath(); x.moveTo(44, 212); x.quadraticCurveTo(128, 272, 212, 212); x.stroke();
    x.lineWidth = 3; x.strokeStyle = '#2a0a08'; for (let k = 0; k < 12; k++) { const t = k / 11, px = 50 + t * 156, py = 214 + Math.sin(t * Math.PI) * 28; x.beginPath(); x.moveTo(px, py - 12); x.lineTo(px + 4, py + 12); x.stroke(); }
  }
  return c;
}
const Bots = {
  list: new Map(), tex: [], urls: [],
  face(i) { if (!this.tex[i]) { const c = drawBotFace(i); this.urls[i] = c.toDataURL(); this.tex[i] = new THREE.CanvasTexture(c); this.tex[i].colorSpace = THREE.SRGBColorSpace; } return this.tex[i]; },
  recv(list) {
    const seen = new Set();
    for (const [id, x, y, z, f] of list || []) {
      seen.add(id); let o = this.list.get(id);
      if (!o) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.face(f), fog: true })); s.scale.set(2.3, 2.9, 1); s.position.set(x, y + 1.45, z); R.scene.add(s); o = { s, f, snd: Audio.botLoop() }; this.list.set(id, o); }
      o.tx = x; o.ty = y; o.tz = z;
    }
    for (const id of [...this.list.keys()]) if (!seen.has(id)) this.drop(id);
  },
  drop(id) { const o = this.list.get(id); if (!o) return; R.scene.remove(o.s); o.s.material.dispose(); if (o.snd) o.snd.stop(); this.list.delete(id); },
  update(dt) {
    const k = 1 - Math.exp(-12 * dt), t = now();
    for (const o of this.list.values()) {
      const s = o.s; s.position.x += (o.tx - s.position.x) * k; s.position.z += (o.tz - s.position.z) * k;
      s.position.y += (o.ty + 1.45 + Math.sin(t * 9 + o.f) * 0.06 - s.position.y) * k;
      if (o.snd) o.snd.dist(s.position.distanceTo(R.camera.position));
    }
  },
  clear() { for (const id of [...this.list.keys()]) this.drop(id); },
  jumpscare(f) {
    this.face(f); const el = $('#jumpscare'); el.innerHTML = `<img src="${this.urls[f]}" alt="">`; el.classList.remove('hidden');
    Audio.play('jumpscare'); Game.shake = Math.max(Game.shake, 0.6);
    clearTimeout(this._js); this._js = setTimeout(() => el.classList.add('hidden'), 750);
  },
};

/* ---------------------------------------------------------------------------
   Gore visuals (cosmetic, per client): blood spray, splats that stick to the world and to props,
   wounds on body parts, stumps where limbs came off, drips and pools while an NPC bleeds.
   Settings.gore: 'off' | 'blood' (spray + splats) | 'full' (+ wounds, stumps). Host decides the physics.
   ------------------------------------------------------------------------- */
const Gore = {
  decals: [], wounds: [], tex: [], mats: [], woundMat: null, stumpMat: null, boneMat: null, drips: 0,
  on() { return Settings.gore !== 'off'; }, full() { return Settings.gore === 'full'; },
  col() { return Settings.bloodColor === 'green' ? '#2f5a08' : '#3a0202'; },
  init() {
    // splat textures: irregular blob + satellite droplets (white; tinted by the material)
    for (let v = 0; v < 4; v++) {
      const cv = Tex.canvas(128, (c, S) => {
        c.fillStyle = '#fff'; const cx = S / 2, cy = S / 2, R = S * 0.22;
        c.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = R * (0.75 + Math.random() * 0.45); i ? c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.fill();
        for (let i = 0; i < 16; i++) { const a = Math.random() * Math.PI * 2, d = R * (1.1 + Math.random() * 0.9), r = 1.5 + Math.random() * 5; c.beginPath(); c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, 7); c.fill(); }
        if (v % 2) { const a = Math.random() * Math.PI * 2; c.lineWidth = 7; c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * S * 0.45, cy + Math.sin(a) * S * 0.45); c.stroke(); }
      });
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; this.tex.push(t);
    }
    const w = Tex.canvas(64, (c, S) => { const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g.addColorStop(0, '#1a0000'); g.addColorStop(0.35, '#3a0303'); g.addColorStop(0.55, '#8a1010'); g.addColorStop(1, 'rgba(120,10,10,0)'); c.fillStyle = g; c.fillRect(0, 0, S, S); });
    this.woundTex = new THREE.CanvasTexture(w); this.woundTex.colorSpace = THREE.SRGBColorSpace;
    this.plane = new THREE.PlaneGeometry(1, 1); this.disc = new THREE.CircleGeometry(1, 16);
    this.rebuildMats();
  },
  rebuildMats() {
    const col = this.col(), green = Settings.bloodColor === 'green';
    for (const m of this.mats) m.dispose();
    this.mats = this.tex.map(t => { const m = new THREE.MeshStandardMaterial({ map: t, color: col, roughness: 0.85, metalness: 0, envMapIntensity: 0.05, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }); m.userData.outlineParameters = { visible: false }; return m; });
    this.woundMat = new THREE.MeshBasicMaterial({ map: this.woundTex, color: green ? '#7fbf40' : '#ffffff', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.stumpMat = new THREE.MeshStandardMaterial({ color: green ? '#3d6b12' : '#6e0b0b', roughness: 0.35 });
    this.boneMat = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.6 });
    for (const m of [this.woundMat, this.stumpMat, this.boneMat]) m.userData.outlineParameters = { visible: false };
    for (const d of this.decals) d.material = this.mats[d.userData.v % this.mats.length];
  },
  // flat blood decal on whatever surface is at p (sticks to props: parented to their mesh)
  splat(p, n, size, ent) {
    if (!this.on()) return;
    let d = this.decals.length >= 240 ? this.decals.shift() : null;
    const v = (Math.random() * 4) | 0;
    if (!d) { d = new THREE.Mesh(this.plane, this.mats[v]); d.renderOrder = 2; d.userData.v = v; } else { d.material = this.mats[v]; d.userData.v = v; }
    d.scale.setScalar(size); d.userData.full = size; d.userData.grow = 0;
    const q = _q1.setFromUnitVectors(_v1.set(0, 0, 1), n).multiply(_q2.setFromAxisAngle(_v2.set(0, 0, 1), Math.random() * 6.28));
    const host = ent && ent.mesh && ent.d.k !== 'map' ? ent.mesh : R.scene;
    if (d.parent) d.parent.remove(d);
    if (host === R.scene) { d.position.copy(p).addScaledVector(n, 0.004); d.quaternion.copy(q); }
    else { host.updateMatrixWorld(); d.position.copy(host.worldToLocal(p.clone().addScaledVector(n, 0.004))); d.quaternion.copy(host.getWorldQuaternion(_q3).invert().multiply(q)); }
    host.add(d); this.decals.push(d);
    return d;
  },
  // cast from p along dir; put a splat where it lands (never on NPC bodies or players)
  splatRay(p, dir, max, size) {
    const h = Phys.cast(p, dir, max, null, c => { const id = Phys.colMap.get(c.handle); if (typeof id !== 'number') return false; const e = World.ents.get(id); return !(e && e.d.k === 'part'); });
    if (h) { const e = typeof h.id === 'number' && h.id > 0 ? World.ents.get(h.id) : null; this.splat(h.point, h.normal, size, e); }
    return h;
  },
  spray(p, dir, s) {
    if (!this.on()) return;
    const n = Math.round(8 + 18 * s), pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos.set([p.x, p.y, p.z], i * 3); vel.push(new V3(dir.x + (Math.random() - 0.5) * 1.2, dir.y + Math.random() * 0.6, dir.z + (Math.random() - 0.5) * 1.2).multiplyScalar(2 + Math.random() * 4 * s)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = ptsMat({ color: this.col(), size: 0.06 });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; R.scene.add(pts);
    FX.list.push({ t: 0, life: 0.7, upd: (k, dt) => { for (let i = 0; i < n; i++) { vel[i].y -= 9.8 * dt; pos[i * 3] += vel[i].x * dt; pos[i * 3 + 1] += vel[i].y * dt; pos[i * 3 + 2] += vel[i].z * dt; } g.attributes.position.needsUpdate = true; m.opacity = 1 - k * k; }, end: () => { R.scene.remove(pts); g.dispose(); m.dispose(); } });
    // where the spray lands
    const k = Math.min(4, 1 + Math.round(s * 2));
    for (let i = 0; i < k; i++) this.splatRay(p, _v3.set(dir.x + (Math.random() - 0.5), dir.y - 0.6 - Math.random(), dir.z + (Math.random() - 0.5)).normalize(), 4, 0.25 + Math.random() * 0.35 * s);
    this.splatRay(p, _v3.set(0, -1, 0), 3, 0.3 + 0.25 * s);
  },
  // host event: a body part was hit
  hit(m) {
    if (!this.on()) return;
    const p = new V3().fromArray(m.p), d = new V3().fromArray(m.d || [0, 1, 0]).normalize(), s = m.s || 0.6;
    if (m.w !== 'crush' || s > 0.6) this.spray(p, m.w === 'blunt' || m.w === 'crush' ? d.clone().negate().add(_v4.set(0, 0.5, 0)).normalize() : d, s);
    if (m.w === 'bullet') this.splatRay(p, d, 3, 0.25 + 0.2 * s);   // exit spatter on the wall behind
    const e = m.e && World.ents.get(m.e);
    if (e && e.mesh && this.full() && m.lp) this.wound(e, new V3().fromArray(m.lp), new V3().fromArray(m.ln || [0, 0, 1]).normalize(), m.w === 'bullet' ? 0.028 + 0.012 * s : 0.05 + 0.03 * s);
    if (m.w === 'blast' || m.w === 'crush') Audio.at('gore_splat', p);
  },
  // a body slammed into something: a big smear where it hit, droplets thrown back up
  slam(m) {
    if (!this.on()) return;
    const p = new V3().fromArray(m.p), d = new V3().fromArray(m.d).normalize(), s = m.s || 0.6;
    const h = this.splatRay(p, d, 1.6, 0.45 + 0.45 * s);
    if (!h) this.splatRay(p, _v1.set(0, -1, 0), 2, 0.4 + 0.4 * s);
    for (let i = 0; i < 2 + s * 3; i++) this.splatRay(p, _v1.set(d.x + (Math.random() - 0.5) * 1.4, d.y + (Math.random() - 0.5) * 0.6, d.z + (Math.random() - 0.5) * 1.4).normalize(), 2, 0.12 + Math.random() * 0.25 * s);
    this.spray(p, _v2.copy(d).negate().add(_v3.set(0, 0.7, 0)).normalize(), s * 0.9);
    Audio.at('gore_splat', p); Audio.at('gore_bone', p, s > 0.8 ? 1 : 0.6);
  },
  // a part burst apart: chunks (flesh, clothing, bone) that bounce and leave blood where they land
  gib(m) {
    const p = new V3().fromArray(m.p), d = new V3().fromArray(m.d || [0, 1, 0]).normalize();
    Audio.at('gore_gib', p); Audio.at('gore_bone', p);
    if (!this.on()) return;
    this.spray(p, _v1.set(0, 1, 0), 2); this.spray(p, d, 1.6);
    FX.smoke(p, 4, 0.7, 0.6, new THREE.Color(this.col()).getHex());
    for (let i = 0; i < 6; i++) this.splatRay(p, _v1.set(Math.random() - 0.5, -0.4 - Math.random(), Math.random() - 0.5).normalize(), 3, 0.25 + Math.random() * 0.4);
    const gy = (Phys.cast(p.clone().add(_v1.set(0, 0.3, 0)), _v2.set(0, -1, 0), 6, null, c => { const id = Phys.colMap.get(c.handle); if (typeof id !== 'number') return false; const e = World.ents.get(id); return !(e && e.d.k === 'part'); }) || { point: { y: p.y - 1 } }).point.y;
    const cols = [m.c || '#c0392b', this.full() ? this.stumpMat.color.getStyle() : '#6e0b0b', this.full() ? '#efe6d2' : m.c, m.c2 || m.c, this.col()];
    const n = m.h ? 12 : 8, box = Geo.get('gibbox', () => new THREE.BoxGeometry(1, 1, 1));
    for (let i = 0; i < n; i++) { const sz = 0.03 + Math.random() * (m.h ? 0.06 : 0.05); this.chunk(p, d, box, sz * (0.7 + Math.random() * 0.6), sz * (0.7 + Math.random() * 0.6), sz * (0.7 + Math.random() * 0.6), cols[i % cols.length], gy, 1); }
    if (this.full()) {
      if (m.h) this.organ('brain', p, d, gy);                                   // head: brain
      if (m.o) { for (const o of ['heart', 'lung', 'lung', 'liver', 'stomach', 'kidney', 'kidney']) this.organ(o, p, d, gy); this.guts(null, p, d, gy); }   // torso: everything
    }
  },
  // one flying chunk: tumbles, bounces, leaves a splat where it first lands, fades after a while
  chunk(p, d, geo, sx, sy, sz, color, gy, spd) {
    const mesh = new THREE.Mesh(geo, Mats.get('plastic', color)); mesh.scale.set(sx, sy, sz); mesh.castShadow = true;
    mesh.position.copy(p).add(_v1.set((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15));
    R.scene.add(mesh);
    const v = new V3(d.x * 2 + (Math.random() - 0.5) * 6, 2 + Math.random() * 4.5, d.z * 2 + (Math.random() - 0.5) * 6).multiplyScalar(spd), w = new V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(18);
    let landed = 0, trail = 0;
    FX.list.push({ t: 0, life: 12, upd: (k, dt) => {
      if (landed < 3) {
        v.y -= 9.8 * dt; mesh.position.addScaledVector(v, dt); mesh.rotation.x += w.x * dt; mesh.rotation.y += w.y * dt; mesh.rotation.z += w.z * dt;
        if ((trail -= dt) <= 0 && landed === 0) { trail = 0.05; FX.spark(mesh.position, null, new THREE.Color(this.col()).getHex(), 1); }
        const floor = gy + Math.min(sx, sy, sz) / 2;
        if (mesh.position.y < floor) {
          mesh.position.y = floor;
          if (landed === 0) this.splat(_v1.set(mesh.position.x, gy, mesh.position.z), _v2.set(0, 1, 0), 0.12 + Math.random() * 0.16, null);
          landed++; v.y = Math.abs(v.y) * 0.3; v.x *= 0.5; v.z *= 0.5; w.multiplyScalar(0.4);
        }
      }
      if (k > 0.88) mesh.scale.multiplyScalar(1 - dt * 4);
    }, end: () => { R.scene.remove(mesh); } });
  },
  // organs: rounded, glossy, anatomically-ish coloured blobs (kept cartoony to match the blocky bodies)
  ORGANS: { heart: [0.075, 0.09, 0.065, '#7a1111'], lung: [0.08, 0.13, 0.055, '#d48a8a'], liver: [0.13, 0.055, 0.09, '#5c1a14'], stomach: [0.09, 0.07, 0.11, '#c98585'], kidney: [0.045, 0.065, 0.035, '#6e2020'], brain: [0.1, 0.075, 0.12, '#d8a6a0'] },
  organ(kind, p, d, gy) {
    const O = this.ORGANS[kind]; if (!O) return;
    this.chunk(p, d, Geo.get('organ', () => new THREE.SphereGeometry(0.5, 14, 10)), O[0] * 2, O[1] * 2, O[2] * 2, O[3], gy, 0.6);
  },
  // intestines: a floppy chain (verlet) that drapes over things; hangs from the torso when anchored
  guts(anchor, p, d, gy) {
    const NN = 16, L = 0.065, pts = [], prev = [], meshes = [], geo = Geo.get('gut', () => new THREE.SphereGeometry(0.034, 10, 8)), mat = Mats.get('plastic', '#c7787a');
    for (let i = 0; i < NN; i++) {
      const q = p.clone().add(_v1.set((Math.random() - 0.5) * 0.06, -i * L * 0.6, (Math.random() - 0.5) * 0.06)); pts.push(q);
      prev.push(q.clone().addScaledVector(d, -0.03 * Math.random()));
      const m = new THREE.Mesh(geo, mat); m.scale.set(1, 1, 1.35); m.castShadow = true; R.scene.add(m); meshes.push(m);
    }
    let drip = 0;
    FX.list.push({ t: 0, life: 16, upd: (k, dt) => {
      const a = anchor && anchor();
      for (let i = 0; i < NN; i++) {
        if (i === 0 && a) { pts[0].copy(a); prev[0].copy(a); continue; }
        const vx = (pts[i].x - prev[i].x) * 0.985, vy = (pts[i].y - prev[i].y) * 0.985, vz = (pts[i].z - prev[i].z) * 0.985;
        prev[i].copy(pts[i]); pts[i].x += vx; pts[i].y += vy - 9.8 * dt * dt; pts[i].z += vz;
        if (pts[i].y < gy + 0.03) { pts[i].y = gy + 0.03; prev[i].x = pts[i].x - vx * 0.5; prev[i].z = pts[i].z - vz * 0.5; }
      }
      for (let it = 0; it < 4; it++) for (let i = 1; i < NN; i++) {
        const p0 = pts[i - 1], p1 = pts[i], dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z, len = Math.hypot(dx, dy, dz) || 1e-4, df = (len - L) / len;
        if (i === 1 && a) { p1.x -= dx * df; p1.y -= dy * df; p1.z -= dz * df; }
        else { p0.x += dx * df * 0.5; p0.y += dy * df * 0.5; p0.z += dz * df * 0.5; p1.x -= dx * df * 0.5; p1.y -= dy * df * 0.5; p1.z -= dz * df * 0.5; }
      }
      meshes.forEach((m, i) => { m.position.copy(pts[i]); if (i) m.lookAt(pts[i - 1]); });
      if ((drip -= dt) <= 0 && k < 0.5) { drip = 0.4; FX.spark(pts[NN - 1], null, new THREE.Color(this.col()).getHex(), 1); }
      if (k > 0.9) meshes.forEach(m => m.scale.multiplyScalar(1 - dt * 3));
    }, end: () => meshes.forEach(m => R.scene.remove(m)) });
  },
  wound(e, lp, ln, size) {
    const list = e._wounds || (e._wounds = []);
    if (list.length >= 8) { const old = list.shift(); if (old.mesh.parent) old.mesh.parent.remove(old.mesh); }
    const w = new THREE.Mesh(this.disc, this.woundMat); w.renderOrder = 3; w.userData.gore = 1;
    w.position.copy(lp).addScaledVector(ln, 0.006); w.quaternion.setFromUnitVectors(_v1.set(0, 0, 1), ln); w.scale.setScalar(size);
    e.mesh.add(w); list.push({ mesh: w, lp: lp.clone(), ln: ln.clone() });
  },
  // stump caps + a bit of bone on both sides of a torn joint
  stump(g, jn) {
    const J = NPC_JOINTS[jn]; if (!J) return;
    for (const [pi, anchor] of [[J[0], J[2]], [J[1], J[3]]]) {
      const e = World.ents.get(g.parts[pi]); if (!e || !e.mesh) continue;
      const r = pi === 1 || pi === 0 ? 0.1 : pi === 2 ? 0.06 : 0.055;
      const cap = new THREE.Mesh(Geo.get('stump', () => new THREE.SphereGeometry(1, 14, 8)), this.full() ? this.stumpMat : Mats.get('plastic', '#2a2c31'));
      cap.scale.set(r, r * 0.45, r); cap.position.fromArray(anchor); cap.userData.gore = 2; e.mesh.add(cap);
      if (this.full() && pi > 2) { const b = new THREE.Mesh(Geo.get('bone', () => new THREE.CylinderGeometry(0.018, 0.022, 0.07, 8)), this.boneMat); b.position.fromArray(anchor); b.position.y += Math.sign(anchor[1] || 1) * 0.03; b.userData.gore = 2; e.mesh.add(b); }
      (e._stumps || (e._stumps = [])).push(new V3().fromArray(anchor));
    }
  },
  severFx(gid, jn) {
    const g = World.groups.get(gid), J = NPC_JOINTS[jn]; if (!g || !J || !this.on()) return;
    const e = World.ents.get(g.parts[J[1]]); if (!e || !e.mesh) return;
    const p = new V3().fromArray(J[3]).applyQuaternion(e.mesh.quaternion).add(e.mesh.position);
    this.spray(p, _v1.set(Math.random() - 0.5, 0.8, Math.random() - 0.5).normalize(), 1.6);
    Audio.at('gore_splat', p);
    if (jn === 'waist' && this.full()) {   // torn in half: guts hang out of the torso, the stomach drops
      const tor = World.ents.get(g.parts[1]), gy = (Phys.cast(p.clone().add(_v1.set(0, 0.3, 0)), _v2.set(0, -1, 0), 6, null, c => { const id = Phys.colMap.get(c.handle); if (typeof id !== 'number') return false; const e = World.ents.get(id); return !(e && e.d.k === 'part'); }) || { point: { y: p.y - 1 } }).point.y;
      this.guts(() => tor && tor.mesh && World.ents.has(tor.id) ? tor.mesh.localToWorld(new V3(0, -0.25, 0)) : null, p, new V3(0, -1, 0), gy);
      this.organ('stomach', p, new V3(0, 0.3, 0), gy);
    }
  },
  heal(gid) {
    const g = World.groups.get(gid); if (!g) return;
    for (const id of g.parts) { const e = World.ents.get(id); if (!e) continue; for (const w of e._wounds || []) if (w.mesh.parent) w.mesh.parent.remove(w.mesh); e._wounds = []; if (e.mesh) FX.spark(e.mesh.position, UP, 0x7dffb0, 6); }
  },
  // per frame: stumps for newly severed joints (also for late joiners), drips + growing pools while bleeding
  update(dt) {
    this.dripT = (this.dripT || 0) + dt;
    for (const g of World.groups.values()) {
      if (g.t !== 'npc') continue;
      const sev = g.sev || [];
      if ((g._sevVis || 0) < sev.length) { for (let i = g._sevVis || 0; i < sev.length; i++) this.stump(g, sev[i]); g._sevVis = sev.length; }
      if (!this.on() || !(g.bl > 0.2)) continue;
      // drips from wounds and stumps
      g._drip = (g._drip || 0) - dt;
      if (g._drip <= 0) {
        g._drip = clamp(1.2 / g.bl, 0.08, 1.5) * (0.6 + Math.random() * 0.8);
        const srcs = [];
        for (const id of g.parts) { const e = World.ents.get(id); if (!e || !e.mesh) continue; for (const w of e._wounds || []) srcs.push([e, w.lp]); for (const sp of e._stumps || []) srcs.push([e, sp]); }
        if (srcs.length) {
          const [e, lp] = srcs[(Math.random() * srcs.length) | 0], p = lp.clone().applyQuaternion(e.mesh.quaternion).add(e.mesh.position);
          FX.spark(p, null, new THREE.Color(this.col()).getHex(), 2);
          this.splatRay(p, _v1.set((Math.random() - 0.5) * 0.2, -1, (Math.random() - 0.5) * 0.2).normalize(), 3, 0.08 + Math.random() * 0.1);
        }
      }
      // a pool slowly spreads under a body that's lying still
      if (!g.alive) {
        const t = World.ents.get(g.parts[1]); if (!t || !t.mesh) continue;
        const still = g._tp && g._tp.distanceTo(t.mesh.position) < 0.6 * dt; (g._tp || (g._tp = new V3())).copy(t.mesh.position);   // wait until the body settles
        if (!still) continue;
        if (!g._pool || !g._pool.parent || g._pool.position.distanceTo(t.mesh.position) > 1.0) {
          const h = Phys.cast(_v1.copy(t.mesh.position).add(_v2.set(0, 0.2, 0)), _v3.set(0, -1, 0), 2.5, null, c => { const id = Phys.colMap.get(c.handle); if (typeof id !== 'number') return false; const e = World.ents.get(id); return !(e && e.d.k === 'part'); });
          g._pool = h ? this.splat(h.point, h.normal, 0.5, null) : null;
          if (g._pool) { g._pool.userData.poolMax = 2.2 + Math.random() * 0.9; }
        } else if (g._pool.scale.x < g._pool.userData.poolMax) g._pool.scale.setScalar(g._pool.scale.x + dt * 0.09 * Math.min(g.bl, 3));
      }
    }
  },
  clearAll() { for (const d of this.decals) if (d.parent) d.parent.remove(d); this.decals.length = 0; },
};

// ---- water: PBR = glossy surface with two scrolling wave normal maps, tinted by depth (clear and sandy at the shore,
// deep teal in the middle); PS1 = wobbling vertex waves and a scrolling nearest-filtered texture ----
const Water = {
  t: { value: 0 }, nt: null, psTex: null,
  step(dt) { this.t.value = (this.t.value + dt) % 1000; if (this.psTex) this.psTex.offset.set(this.t.value * 0.035, this.t.value * 0.02); },
  normTex() {                      // tileable wave normals from a sum of integer-frequency sines
    if (this.nt) return this.nt;
    const S = 256, W = [], dx = new Float32Array(S * S), dy = new Float32Array(S * S); let sd = 12345, mx = 0;
    const rn = () => (sd = sd * 16807 % 2147483647) / 2147483647;
    for (let k = 0; k < 22; k++) { const fx = Math.round((rn() - 0.5) * 16), fy = Math.round((rn() - 0.5) * 16), f = Math.hypot(fx, fy); if (f < 1) continue; W.push([fx, fy, Math.pow(f, -1.6), rn() * 6.283]); }
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      let a = 0, c = 0; const u = i / S, v = j / S;
      for (const [fx, fy, A, ph] of W) { const k = A * Math.cos(6.283185 * (fx * u + fy * v) + ph); a += k * fx; c += k * fy; }
      dx[j * S + i] = a; dy[j * S + i] = c; mx = Math.max(mx, Math.hypot(a, c));
    }
    const data = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) { const x = -dx[i] / mx * 1.4, y = -dy[i] / mx * 1.4, l = Math.hypot(x, y, 1); data.set([(x / l * 0.5 + 0.5) * 255, (y / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255, 255], i * 4); }
    const t = this.nt = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
    return t;
  },
  pbrMat() {
    const m = csmMat(new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, transparent: true, depthWrite: false, roughness: 0.06, metalness: 0, normalMap: this.normTex(), normalScale: new THREE.Vector2(0.32, 0.32), envMapIntensity: 0.75 }), sh => {
      sh.uniforms.uWT = this.t;
      // the line lives in an #include that three.js only expands after this hook, so inline the chunk first
      sh.fragmentShader = 'uniform float uWT;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps).replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        'vec3 mapN = normalize( ( texture2D( normalMap, vNormalMapUv + uWT * vec2( 0.016, 0.009 ) ).xyz * 2.0 - 1.0 ) + ( texture2D( normalMap, vNormalMapUv * 1.73 + uWT * vec2( -0.011, 0.019 ) ).xyz * 2.0 - 1.0 ) );');
    });
    m.customProgramCacheKey = () => 'water'; m.userData.outlineParameters = { visible: false };
    return m;
  },
  psMat() {
    if (!this.psTex) {
      const cv = Tex.canvas(64, (c, s) => {
        c.fillStyle = '#b4d0e4'; c.fillRect(0, 0, s, s);
        for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? 'rgba(225,242,255,.6)' : 'rgba(40,72,110,.35)'; const y0 = i * 6.4 + 2; for (let x = 0; x < s; x += 2) c.fillRect(x, Math.round(y0 + Math.sin((x + i * 11) / s * 12.566) * 2 + s) % s, 2, 1); }
      });
      const t = this.psTex = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    }
    const m = PS1.patch(new THREE.MeshLambertMaterial({ color: '#ffffff', map: this.psTex, vertexColors: true, transparent: true, depthWrite: false })), ps = m.onBeforeCompile;
    m.onBeforeCompile = sh => {
      sh.uniforms.uWT = this.t;
      sh.vertexShader = 'uniform float uWT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += 0.09 * sin(uWT * 1.6 + position.x * 0.45 + position.z * 0.3) + 0.06 * sin(uWT * 2.3 - position.z * 0.6);');
      ps(sh);
    };
    m.customProgramCacheKey = () => 'ps1water'; m.userData.outlineParameters = { visible: false };
    return m;
  },
  // a lake surface centred at (cx, y, cz); depthFn(worldX, worldZ) = water depth there (<= 0 under the shore)
  mesh(cx, y, cz, w, d, depthFn) {
    const ps = R.path === 'ps1', cs = ps ? 2 : 1, geo = new THREE.PlaneGeometry(w, d, Math.round(w / cs), Math.round(d / cs)).rotateX(-Math.PI / 2);
    const P = geo.attributes.position, uv = geo.attributes.uv, col = new Float32Array(P.count * 4), c = new THREE.Color();
    const sh = new THREE.Color(ps ? '#79c9c6' : '#4a9a92'), dp = new THREE.Color(ps ? '#2f76a8' : '#0d4258'), foam = new THREE.Color('#d9ece6'), us = ps ? 6 : 14;
    for (let i = 0; i < P.count; i++) {
      const wx = cx + P.getX(i), wz = cz + P.getZ(i), dep = depthFn(wx, wz), t = clamp(dep / 2.2, 0, 1);
      c.copy(sh).lerp(dp, Math.sqrt(t)); if (dep > 0 && dep < 0.35) c.lerp(foam, 0.45 * (1 - dep / 0.35));
      col.set([c.r, c.g, c.b, dep <= 0 ? 0 : ps ? 0.6 + 0.3 * t : 0.5 + 0.44 * Math.sqrt(t)], i * 4);
      uv.setXY(i, wx / us, wz / us);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const m = new THREE.Mesh(geo, ps ? this.psMat() : this.pbrMat()); m.position.set(cx, y, cz); m.renderOrder = 3; m.receiveShadow = false;
    m.userData.remat = () => (R.path === 'ps1' ? this.psMat() : this.pbrMat());
    return m;
  },
};
/* ---------------------------------------------------------------------------
   Spawn placement: a green hologram of the item follows your aim; click to place.
   ------------------------------------------------------------------------- */
const HOLO = {
  fill: null, line: null,
  mats() {
    if (!this.fill) {
      this.fill = new THREE.MeshBasicMaterial({ color: '#5dff9a', transparent: true, opacity: 0.22, depthWrite: false });
      this.line = new THREE.LineBasicMaterial({ color: '#8dffb8', transparent: true, opacity: 0.85 });
      this.bad = new THREE.MeshBasicMaterial({ color: '#ff5a4a', transparent: true, opacity: 0.22, depthWrite: false });
    }
  },
};

/* ============================================================================
   14. GAME CORE & MAIN LOOP
   ========================================================================== */
const AIM_ASSIST = [0, 0.55, 1, 1.45];   // Settings.aimAssist: off / low / standard / strong
const Game = {
  state: 'loading', viewmodel: null, detected: null, pendingWorld: null, aimSeat: 0, lockReleaseOk: false,
  acc: 0, last: 0, orbit: 0, shake: 0, punch: [0, 0], sway: [0, 0], drawT: 1, sprintK: 0, swingT: 9, moveInp: { mx: 0, my: 0, jump: false, sprint: false, up: 0 }, autoT: 20, hiddenTicker: null, bob: 0, fellT: 0,
  async boot() {
    const lt = $('#loadingText');
    try {
      Prog.load(); UI.init(); Input.init($('#c')); Social.init();
      lt.textContent = 'Starting renderer…'; R.init();
      lt.textContent = 'Loading physics engine…'; await Phys.init();
      Players.init(); View.init(); Tools.init(); Editor.init(); FX.init(); Gore.init();
      let tier = Settings.tier, first = false;
      if (!TIERS[tier]) {
        lt.textContent = 'Benchmarking your GPU…';
        await new Promise(r => setTimeout(r, 30));
        this.detected = R.detectTier(); tier = this.detected.tier; store.set('detected', this.detected); first = true;
      } else { this.detected = store.get('detected', null); R.gpuName = this.detected ? this.detected.gpu : ''; }
      R.tier = tier; R.resize();
      lt.textContent = 'Loading models…'; await Models.load();
      lt.textContent = 'Preparing spawn menu…'; Thumbs.generate();
      R.applyTier(tier, first);
      UI.buildSlots(); UI.refreshLobbyAvatar();
      this.buildViewmodel();
      this.startAttract();
      $('#loading').classList.add('hidden'); $('#lobby').classList.remove('hidden');
      try { if (window.TWUpdate && TWUpdate.bootOk) TWUpdate.bootOk(); } catch (e) { }   // tell the updater this version started fine
      UI.initUpdates();
      this.state = 'lobby'; UI.onTierChanged(R.tier);
      Owner.restore();
      if (GAME.discord) DiscordAct.start();   // launched from a voice channel: go straight into its room
      // crouch (Ctrl) + forward (W) is also the browser's close-tab shortcut: ask first while a game is running
      addEventListener('beforeunload', e => { if (this.state === 'playing' && Settings.confirmClose !== false && !GAME.discord) { e.preventDefault(); e.returnValue = ''; } });
      addEventListener('pointerdown', () => Audio.ensure(), true); addEventListener('keydown', () => Audio.ensure(), true);
      this.lastRaf = performance.now(); this.startWatchdog();
      $('#c').addEventListener('click', () => { if (this.state === 'playing' && !UI.open && !Editor.active) this.lock(); });
      this.last = performance.now(); requestAnimationFrame(t => this.frame(t));
    } catch (err) {
      console.error(err);
      lt.innerHTML = `<b style="color:var(--bad)">Could not start ${GAME.name}.</b><br>${esc(err.message || err)}<br><span class="muted">WebGL2 and a modern browser (Chrome, Edge, Firefox, Safari 16+) are required.</span>`;
    }
  },
  lock() {
    if (this.state !== 'playing' || UI.open || Editor.active || document.pointerLockElement || Input.device === 'pad') return;
    try { const r = $('#c').requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { }
  },
  // ---- attract mode behind the title screen ---------------------------------------------
  startAttract() {
    Net.startOffline(); World.clear(); for (const id of [...Players.map.keys()]) Players.remove(id);
    const S = (k, x, z, yaw) => Auth.spawnPrefab(ITEM_INDEX[k].pf(), new V3(x, 0, z), yaw || 0, 'sys');
    for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) Auth.spawnPrefab(ITEM_INDEX.crate.pf(), new V3(-4 + x * 0.82, y * 0.82, -2), 0, 'sys', { noLift: false });
    S('car', 3, 1, 0.6); S('npc', -1, 3); S('npc', 1.5, -3); S('barrel', -6, 2); S('barrel', -6.8, 2.5); S('ball', 0, 5); S('cone', 5, -2); S('cone', 5.6, -2.6); S('kart', -3, 7, 2.2);
    for (let i = 0; i < 8; i++) S('domino', 7 + i * 0.55, 4, Math.PI / 2);
    const mk = (key, p, yaw) => { const d = JSON.parse(JSON.stringify(ITEM_INDEX[key].d)); d.id = World.allocId(); d.k = 'map'; d.p = p; d.q = a4(new QT().setFromAxisAngle(UP, yaw || 0)); applyAdd({ ents: [d] }); };
    mk('ramp', [9, 0.75, -6], 0); mk('block', [9, 0.5, -10.5], 0); mk('light', [-8, 2.2, -4]);
  },
  // ---- room flow ---------------------------------------------------------------------
  profileName() { let n = ($('#inName').value || Settings.name || '').trim().slice(0, 18); if (!n) n = 'Player' + ((Math.random() * 900 + 100) | 0); Settings.name = n; $('#inName').value = n; saveSettings(); return n; },
  resetForPlay() { ZS.st = null; Rules.zs = null; PH.st = null; Rules.ph = null; World.clear(); for (const id of [...Players.map.keys()]) Players.remove(id); Editor.undo = []; Editor.redo = []; Object.assign(Rules, { combat: false, editPerm: 'all', propLimit: CFG.propLimit, allowNoclip: true, aimAssist: true, dismember: true, env: 'plains', envGone: [], mode: 'sandbox', bots: 3 }); $('#chatLog').innerHTML = ''; Auth.nades = []; Auth.corpses = []; },
  async createRoom(code0) {
    const name = this.profileName(); UI.lobbyStatus('Creating room…');
    const code = code0 || randCode();
    try { this.resetForPlay(); await Net.start(code, true); }
    catch (e) { UI.lobbyStatus('Could not reach the network (' + e.message + '). You can still Play Solo.', true); this.startAttract(); return; }
    Players.add({ id: Net.me, name, color: Settings.color, tier: R.tier, idx: 0, joinOrder: 0, isLocal: true, lvl: Prog.level().l });
    this.loadPending();
    try { history.replaceState(null, '', '#room=' + code); } catch (e) { }
    this.enterPlay(Auth.pickSpawn());
    UI.chat({ sys: 1, text: `Room ${fmtCode(code)} created. Share the code or invite link (Esc → Copy invite link).` });
    Net.sendPlayers();
  },
  // main menu "Play": join the busiest public room on our version that has space, else host a new one
  quickPlay() {
    if (GAME.discord) return DiscordAct.start();
    const r = [...Online.rooms.values()].filter(r => r.v === GAME.version && (r.n || 0) < (r.max || CFG.maxPlayers)).sort((a, b) => (b.n || 0) - (a.n || 0))[0];
    if (r) this.joinRoom(r.code); else { UI.lobbyStatus('No open public rooms right now, hosting one…'); this.createRoom(); }
  },
  async joinRoom(raw, retry) {
    const txt = String(raw || ''), link = txt.match(/room=([A-Z0-9]{6})/i);                 // a pasted invite link works too
    const code = (link ? link[1] : txt).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) return UI.lobbyStatus('Room codes have 6 characters, e.g. KX7-P2Q (or paste the invite link)', true);
    this.profileName(); UI.lobbyStatus('Connecting to room ' + fmtCode(code) + '…');
    try { this.resetForPlay(); await Net.start(code, false); }
    catch (e) { UI.lobbyStatus('Could not reach the network (' + e.message + ').', true); this.startAttract(); return; }
    this.state = 'joining';
    const started = now(), LIMIT = 45;
    const wait = () => {
      if (Net.ready || this.state !== 'joining') return;
      const t = now() - started;
      // found players but never got through to the host: reconnect once from scratch (fresh handshakes, relay included)
      if (!retry && t > 18 && Net.peers.size && !Net.gotHost) { Net.log('join-retry', { peers: Net.peers.size }); Net.leave(); this.state = 'lobby'; UI.lobbyStatus('Still connecting, retrying…'); setTimeout(() => this.joinRoom(code, true), 400); return; }
      if (t > LIMIT) {
        Net.log('join-timeout', { peers: Net.peers.size, gotHost: Net.gotHost });
        Net.leave(); this.state = 'lobby'; this.startAttract();
        UI.lobbyStatus((Net.peers.size || Net.gotHost ? 'Found the room but could not connect to the host. Ask them to check their connection, or try again.' : 'Could not find room ' + fmtCode(code) + '. Check the code, and that the host is still in the room.') + ' (Settings > Network > Copy network report)', true);
        return;
      }
      const stage = Net.gotHost ? 'Loading the world…' : Net.peers.size ? 'Found the room, connecting to the host…' : 'Looking for the room…';
      UI.lobbyStatus(`${stage} (${Math.ceil(LIMIT - t)}s)`);
      setTimeout(wait, 400);
    };
    wait();
  },
  startSolo() {
    const name = this.profileName();
    this.resetForPlay(); Net.startOffline();
    Players.add({ id: 'local', name, color: Settings.color, tier: R.tier, idx: 0, joinOrder: 0, isLocal: true, lvl: Prog.level().l });
    this.loadPending();
    this.enterPlay(Auth.pickSpawn());
    UI.chat({ sys: 1, text: 'Offline. Create a room from the main menu to play with others.' });
  },
  loadPending() { if (this.pendingWorld) { World.load(this.pendingWorld); if (this.pendingWorld.rules) Object.assign(Rules, this.pendingWorld.rules); this.pendingWorld = null; } },
  enterPlay(spawn) {
    this.state = 'playing';
    $('#lobby').classList.add('hidden'); $('#hud').classList.remove('hidden'); $('#chat').classList.remove('hidden');
    UI.closeMenu(); UI.lobbyStatus('');
    const me = Players.local;
    if (me) { Players.setPos(me, spawn || Auth.pickSpawn()); me.yaw = 0; me.pitch = -0.1; me.hp = 100; me.dead = false; me.seat = 0; }
    Tools.weapon = 'physgun'; this.buildViewmodel(); UI.refreshTool(); UI.refreshRoom(); UI.hideDeath();
    UI.chat({ sys: 1, text: Input.device === 'pad' ? 'Y spawn menu, LB radial menu, Menu controls.' : 'Q spawn menu, hold C radial menu, F1 controls.' });
    this.lock();
  },
  toLobby(silent) {
    UI.refreshProfile();
    DmgNum.clear(); Bots.clear(); Auth.bots = [];
    if (Editor.active) Editor.toggle(false);
    if (Net.online && !silent) this.autosave();
    Net.leave(); UI.closeMenu(); for (const n of UI.menus) $(UI.el(n)).classList.add('hidden'); UI.open = null;
    this.state = 'lobby'; Tools.grab = null; Tools.first = null;
    if (document.pointerLockElement) { this.lockReleaseOk = true; document.exitPointerLock(); }
    $('#hud').classList.add('hidden'); $('#chat').classList.add('hidden'); $('#lobby').classList.remove('hidden'); UI.showScoreboard(false);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
    this.startAttract();
  },
  kicked() { this.toLobby(true); UI.lobbyStatus('You were kicked from the room by the host.', true); },
  roomFull() { this.toLobby(true); UI.lobbyStatus('That room is full (10 players max).', true); },
  versionMismatch(v) {
    const code = Net.code; this.toLobby(true); const U = window.TWUpdate || {};
    if (/^https?:$/.test(location.protocol) && newerVer(v, GAME.version) && !/[?&]upd=/.test(location.search)) {
      UI.lobbyStatus(`The host is on a newer version (v${v}). Updating and rejoining…`);
      setTimeout(() => location.replace(location.pathname + '?upd=' + Date.now() + '#room=' + code), 700);
      return;
    }
    if (newerVer(GAME.version, v)) { UI.lobbyStatus(`The host is on an older version (v${v}, you have v${GAME.version}). Ask them to reload the game to update, then join again.`, true); return; }
    UI.lobbyStatus(`Version mismatch: the host is on v${v}, you're on v${GAME.version}. ` + (U.status === 'ready' ? 'Restart the game to install your update, then join again.' : 'Everyone in a room needs the same version.'), true);
  },
  autosave() { if (this.state !== 'playing') return; store.set('autosave', Object.assign(World.serialize(), { name: 'Autosave', saved: Date.now(), rules: Object.assign({}, Rules) })); },
  loadWorldChoice(d) {
    if (this.state === 'playing') { if (!Net.isHost) return UI.toast('Only the host can load worlds'); Admin.req('loadWorld', { world: d }); UI.closeMenu(); }
    else { this.pendingWorld = d; UI.closeMenu(); UI.lobbyStatus(`World "${d.name || 'world'}" loaded. Create a room or play solo to start it.`); }
  },
  hostLoadWorld(d) {
    if (!Save.validWorld(d)) return UI.toast('Invalid world');
    for (const p of Players.map.values()) { p.grab = null; if (p.seat) { p.seat = 0; Net.bcastAll({ t: 'seat', pid: p.id, e: 0 }); } }
    World.load(d); Auth.nades = []; Auth.corpses = [];
    for (const pid of Net.clientIds()) Net.send('ws', { hostId: Net.me, rules: Rules, players: Net.playerList(), world: World.serialize(), code: Net.code }, pid);
    Net.sysChat(`The host loaded "${String(d.name || 'world').slice(0, 40)}".`);
    for (const p of Players.map.values()) Auth.respawn(p);
  },
  setTier(k) {
    R.applyTier(k, true);
    const me = Players.local; if (me) me.tier = k;
    if (this.state === 'playing') Net.toHost({ t: 'tier', tier: k });
    UI.toast('Graphics: ' + TIERS[k].label + (k === 'low' ? ' (PS1 style)' : ''));
  },
  setFlySpeed(v) {
    Settings.flySpeed = +clamp(v, 0.25, 5).toFixed(2); saveSettings();
    const sn = $('#slotName'); sn.textContent = `Fly speed ${Settings.flySpeed.toFixed(2).replace(/0$/, '')}x`; sn.classList.add('show');
    clearTimeout(UI._sn); UI._sn = setTimeout(() => sn.classList.remove('show'), 1100);
  },
  toggleNoclip() {
    const me = Players.local; if (!me || me.seat) return;
    if (!me.noclip && !(Rules.allowNoclip && (!Rules.combat || canEdit(me)))) return UI.toast('Noclip is disabled by the host');
    me.noclip = !me.noclip; me.vel.set(0, 0, 0); UI.toast(me.noclip ? `Noclip on (fly speed ${Settings.flySpeed || 1}x, scroll to change)` : 'Noclip off');
  },
  teleport(p, respawn) {
    const me = Players.local; if (!me) return;
    Players.setPos(me, p);
    if (respawn) { me.dead = false; me.hp = 100; UI.hideDeath(); }
  },
  onSeat(e) {
    const me = Players.local; if (!me) return;
    me.seat = e; if (e) { Tools.release(); me.noclip = false; }
    UI.refreshTool(); Audio.play('switch');
  },
  localFellOut() { const t = now(); if (t - this.fellT < 1.5) return; this.fellT = t; Net.toHost({ t: 'respawnme' }); },
  spawnItem(key) {
    const me = Players.local; if (!me || this.state !== 'playing') return;
    if (Settings.spawnPreview && ITEM_INDEX[key] && ITEM_INDEX[key].pf) return this.beginPlace(key);
    const h = Tools.cast(40); const o = new V3(), d = new V3(); Tools.aim(o, d);
    const pt = h ? h.point.clone().addScaledVector(h.normal, 0.05) : o.addScaledVector(d, 6);
    if (pt.distanceTo(me.pos) > 40) pt.copy(me.pos).add(new V3(-Math.sin(me.yaw) * 4, 0.5, -Math.cos(me.yaw) * 4));
    Net.toHost({ t: 'spawn', item: key, p: a3(pt), yaw: me.yaw }); Prog.bump('spawns');
    if (ITEM_INDEX[key] && ['props', 'furniture', 'fun'].includes(ITEM_INDEX[key].cat)) store.set('recent', [key, ...store.get('recent', []).filter(k => k !== key)].slice(0, 6));
    Audio.play('place');
  },
  beginPlace(key) {
    this.cancelPlace(); HOLO.mats();
    const pf = ITEM_INDEX[key].pf(), g = new THREE.Group();
    for (const d of pf.ents) { const v = buildVisual(d); v.position.fromArray(d.p); v.quaternion.fromArray(d.q); g.add(v); }
    const meshes = []; g.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const o of meshes) {
      o.material = HOLO.fill; o.castShadow = o.receiveShadow = false; o.renderOrder = 5;
      const ln = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 35), HOLO.line); ln.renderOrder = 6; o.add(ln);
    }
    g.traverse(o => { if (o.material) o.material.userData.outlineParameters = { visible: false }; });
    R.scene.add(g);
    this.placing = { key, g, meshes, bottom: prefabBottom(pf), yaw: 0, ok: false, pt: new V3() };
    UI.hintKey = '';
  },
  cancelPlace() {
    const P = this.placing; if (!P) return;
    R.scene.remove(P.g); P.g.traverse(o => { if (o.isLineSegments) o.geometry.dispose(); });
    this.placing = null; UI.hintKey = '';
  },
  updatePlace(me) {
    const P = this.placing;
    if (me.seat || me.dead) return this.cancelPlace();
    const o = new V3(), d = new V3(); Tools.aim(o, d);
    const h = Phys.cast(o, d, 60, me.body, c => { const id = Phys.colMap.get(c.handle); return !(typeof id === 'string'); });
    const pt = h ? h.point.clone().addScaledVector(h.normal, 0.03) : o.clone().addScaledVector(d, 8);
    P.pt.copy(pt); P.ok = pt.distanceTo(me.pos) < 60;
    P.g.position.set(pt.x, pt.y - P.bottom + 0.03, pt.z); P.g.rotation.y = me.yaw + P.yaw;
    const mat = P.ok ? HOLO.fill : HOLO.bad; for (const m of P.meshes) if (m.material !== mat) m.material = mat;
    if (Input.hit('reload')) { P.yaw += Math.PI / 4; Audio.play('tick'); }
    if (Input.hit('alt')) { this.cancelPlace(); Audio.play('switch'); return; }
    if (Input.hit('fire') && P.ok) {
      Net.toHost({ t: 'spawn', item: P.key, p: a3(pt), yaw: me.yaw + P.yaw }); Prog.bump('spawns');
      if (ITEM_INDEX[P.key] && ITEM_INDEX[P.key].cat !== 'map') store.set('recent', [P.key, ...store.get('recent', []).filter(k => k !== P.key)].slice(0, 6));
      Audio.play('place');
      // stays selected (GoreBox style): keep clicking to place more, alt-fire puts it away
    }
  },
  // ---- input -------------------------------------------------------------------------
  buildInput() {
    const me = Players.local; if (!me) return null;
    const inp = { p: a3(me.pos), y: r4(me.yaw), x: r4(me.pitch), c: me.crouch ? 1 : 0, n: me.noclip ? 1 : 0, mv: [r4(this.moveInp.mx), r4(this.moveInp.my)], k: UI.open ? [] : Input.heldCodes().slice(0, 24), w: Tools.weapon, f: Tools.grab ? 1 : 0 };
    if (Tools.grab) inp.gd = r4(Tools.grab.dist);
    if (me.seat) {   // vehicle: handbrake / boost buttons + analog triggers
      inp.vb = (Input.down('jump') ? 1 : 0) | (Input.down('sprint') || Input.pb[PAD.B] ? 2 : 0);
      if (Input.device === 'pad') inp.tr = [r4(Input.trig[0]), r4(Input.trig[1])];
    }
    if (Tools.rot[0] || Tools.rot[1]) { inp.rd = [r4(Tools.rot[0]), r4(Tools.rot[1])]; Tools.rot = [0, 0]; }
    return inp;
  },
  handleInput(dt) {
    const me = Players.local; if (!me) return;
    const mi = this.moveInp; mi.mx = mi.my = mi.up = 0; mi.jump = mi.sprint = false; this.zoomed = false;
    if (UI.open === 'chat') return;
    if (Input.hit('netstats')) { Settings.showNet = !Settings.showNet; saveSettings(); }
    if (Input.hit('hints')) { Settings.showHints = !Settings.showHints; saveSettings(); }
    if (Input.hit('help') && UI.open !== 'help') UI.openMenu('help');
    UI.showScoreboard(Input.down('scoreboard') && !UI.open);
    if ((Input.kHit.has('Escape') && now() - (Input.lockLostAt || 0) > 0.35) || Input.padHit(PAD.MENU)) {
      if (UI.open) UI.back();
      else if (Editor.active && Editor.piece) Editor.arm(null);
      else if (Editor.active && Editor.sel) Editor.select(0);
      else UI.openMenu('pause');
      return;
    }
    if (UI.open === 'radial') return;
    if (UI.open) { if ((UI.open === 'spawn' && Input.hit('spawnMenu')) || (UI.open === 'inventory' && Input.hit('inventory'))) UI.closeMenu(); return; }
    if (Input.hit('spawnMenu')) { UI.openMenu('spawn'); return; }
    if (Input.hit('inventory')) { UI.openMenu('inventory'); return; }
    if (Input.hit('radial')) { UI.openRadial(); return; }
    if (Input.kHit.has(Settings.binds.chat) || Input.kHit.has('Enter')) { UI.openChat(); return; }
    if (Input.hit('editMode')) Editor.toggle();
    if (Input.hit('noclip') && !Editor.active) this.toggleNoclip();
    const ctrl = Input.keys.has('ControlLeft') || Input.keys.has('ControlRight');
    if (Input.hit('undo') && !ctrl && !Editor.active) Net.toHost({ t: 'undo' });
    // look
    const lookOK = Input.locked || (Editor.active && Input.mouse[2]);
    this.zoomed = !!(W_BY_ID[Tools.weapon].zoom && Input.down('alt') && !me.seat && !me.dead && !Editor.active);
    if (!Tools.rotating) {
      const inv = Settings.invertY ? -1 : 1, zk = R.camera.fov / Settings.fov;   // slower look while scoped
      const at = this.aimTarget(me), st = AIM_ASSIST[Settings.aimAssist | 0] || 0;
      const slow = at ? 1 - Math.min(0.6, 0.42 * st) * (1 - at.s) : 1;            // aim slowdown over a target
      if (lookOK) { me.yaw -= Input.dx * 0.0022 * Settings.sens * zk; me.pitch -= Input.dy * 0.0022 * Settings.sens * inv * zk; }
      me.yaw -= Input.axes[2] * 2.8 * Settings.padSens * dt * zk * slow; me.pitch -= Input.axes[3] * 2.1 * Settings.padSens * dt * inv * zk * slow;
      if (at) {
        const eye = R.camera.position, dx = at.pt.x - eye.x, dy = at.pt.y - eye.y, dz = at.pt.z - eye.z;
        let ey = Math.atan2(-dx, -dz) - me.yaw; while (ey > Math.PI) ey -= Math.PI * 2; while (ey < -Math.PI) ey += Math.PI * 2;
        const ep = Math.atan2(dy, Math.hypot(dx, dz)) - me.pitch;
        const active = Math.hypot(Input.axes[2], Input.axes[3]) > 0.12 || Math.hypot(Input.axes[0], Input.axes[1]) > 0.2;
        let k = 0;
        if (this.zoomed && !this._wasZoomed) k = 0.55 * Math.min(1, st);                       // scope-in snap
        else if (active) k = Math.min(0.5, st * 2.2 * (1 - 0.6 * at.s) * dt);                   // pull only while you're aiming/moving
        me.yaw += ey * k; me.pitch += ep * k * 0.85;
      }
      this._wasZoomed = this.zoomed;
      this.ownerAimbot(me, dt);
      if (me.seat) {   // chase camera settles behind the vehicle when you stop looking around
        if (Math.abs(Input.dx) + Math.abs(Input.dy) > 0 || Math.hypot(Input.axes[2], Input.axes[3]) > 0.15) this.lookT = now();
        const ve = this.seatVeh();
        if (ve && ve.mesh && now() - (this.lookT || 0) > 0.8 && Math.abs(ve._spd || 0) > 1.5) {
          const f = _v3.set(0, 0, -1).applyQuaternion(ve.mesh.quaternion);
          if (Math.hypot(f.x, f.z) > 0.3) {
            let d = Math.atan2(-f.x, -f.z) - me.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
            const k = 1 - Math.exp(-dt * 2.6); me.yaw += d * k; me.pitch += (-0.2 - me.pitch) * k;
          }
        }
      }
      me.pitch = clamp(me.pitch, -1.55, 1.55);
    }
    // movement
    const mv = Input.move(); mi.mx = mv.x; mi.my = mv.y;
    mi.jump = Input.down('jump'); mi.sprint = Input.down('sprint');
    if (Rules.mode === 'prophunt' && Rules.ph && Rules.ph.phase === 'hide' && me.team === 'hunter') { mi.mx = mi.my = 0; mi.jump = mi.sprint = false; }   // hunters wait, blind
    mi.up = (Input.down('jump') ? 1 : 0) - (Input.down('crouch') ? 1 : 0);
    me.crouch = !me.noclip && !me.seat && Input.down('crouch');
    if (Editor.active) { this.cancelPlace(); Editor.update(dt); }
    else if (this.placing) this.updatePlace(me);
    else {
      for (let i = 0; i < 12; i++) if (Input.kHit.has(HOTBAR_KEYS[i])) Hotbar.use(i);
      if (Input.wheel && me.noclip && !(Tools.grab && Tools.weapon === 'physgun')) this.setFlySpeed((Settings.flySpeed || 1) * (Input.wheel > 0 ? 1 / 1.25 : 1.25));   // wheel = fly speed while flying
      else if (Input.wheel && !(Tools.grab && Tools.weapon === 'physgun')) Hotbar.cycle(Input.wheel > 0 ? 1 : -1);
      if (Input.padHit(PAD.RIGHT)) Hotbar.cycle(1); if (Input.padHit(PAD.LEFT)) Hotbar.cycle(-1);
      if (Input.padHit(PAD.UP) && !Tools.grab && Tools.weapon === 'toolgun') Tools.cycleMode(1);
      Tools.update(dt);
    }
    // seats
    // what the crosshair is on (seat prompt, crosshair states, NPC name label)
    this.aimSeat = 0; this.aimSeatName = ''; this.aimSeatDrive = false; this.aimFull = false; this.aimEnt = null; this.aimHot = false; this.aimDist = Infinity; this.aimUse = null;
    if (!me.seat && !me.dead && !Editor.active) {
      const h = Tools.cast(120);
      if (h) {
        this.aimDist = h.dist;
        if (typeof h.id === 'number' && h.id > 0) { const e = World.ents.get(h.id); this.aimEnt = e || null; if (e && e.d.k === 'part') this.aimHot = true; if (e && h.dist < 5) this.pickSeat(e, me); if (e && e.d.door && h.dist < 4) this.aimUse = e; if (e && e.d.board && h.dist < 9) this.aimUse = e; }
        else if (typeof h.id === 'string') this.aimHot = true;
      }
      if (!this.aimSeat) this.nearbySeat(me);   // standing next to a vehicle counts too
    }
    if (me.seat && Input.hit('reload')) Net.toHost({ t: 'flip' });
    if (Input.hit('use') && !Editor.active && Rules.mode === 'prophunt' && me.team === 'prop' && !me.dead && this.aimEnt && this.aimDist < 9) Net.toHost({ t: 'disg', e: this.aimEnt.id });   // become this object
    else if (Input.hit('use') && !Editor.active) {
      if (me.seat) Net.toHost({ t: 'use' });
      else if (this.aimSeat) Net.toHost({ t: 'use', e: this.aimSeat });
      else if (this.aimUse && this.aimUse.d.door) Net.toHost({ t: 'door', e: this.aimUse.id });
      else if (this.aimUse && this.aimUse.d.board) UI.openPaint(this.aimUse);
    }
    if (Net.isHost) { const inp = this.buildInput(); if (inp) Auth.onInput(me, inp); }
  },
  // ---- getting in: aim anywhere at a vehicle / contraption (or stand next to one) -------------
  // Picks the driver seat if it's free, otherwise the free seat closest to you.
  seatsOf(id) {
    if (this._soVer !== World.consVer) { this._soVer = World.consVer; this._so = new Map(); }
    let list = this._so.get(id);
    if (!list) { list = [...World.connected(id)].filter(x => World.ents.has(x) && World.ents.get(x).d.seat); for (const x of list) this._so.set(x, list); this._so.set(id, list); }
    return list;
  },
  pickSeat(e, me) {
    const taken = new Set(); for (const p of Players.map.values()) if (p.seat) taken.add(p.seat);
    const free = this.seatsOf(e.id).filter(id => !taken.has(id)); if (!free.length) { this.aimFull = this.seatsOf(e.id).length > 0; return 0; }
    const drv = free.find(id => !World.ents.get(id).d.pas);
    const pick = drv || free.reduce((a, b) => World.ents.get(a).mesh.position.distanceToSquared(me.pos) <= World.ents.get(b).mesh.position.distanceToSquared(me.pos) ? a : b);
    this.aimSeat = pick; this.aimSeatDrive = !World.ents.get(pick).d.pas;
    const ve = [...World.connected(pick)].find(x => World.vehicles.has(x)); this.aimSeatName = ve ? World.ents.get(ve).d.n : '';
    return pick;
  },
  nearbySeat(me) {
    let best = null, bd = Infinity;
    for (const id of World.vehicles) {
      const e = World.ents.get(id), V = e && VEH[e.d.veh]; if (!e || !e.mesh || !V) continue;
      const rad = Math.max(...V.col.map(b => Math.max(Math.abs(b[3]) + b[0] / 2, Math.abs(b[5]) + b[2] / 2))) + 1.2;
      const d = Math.hypot(e.mesh.position.x - me.pos.x, e.mesh.position.z - me.pos.z);
      if (d < rad && d < bd && Math.abs(e.mesh.position.y - me.pos.y) < 3) { bd = d; best = e; }
    }
    if (best) this.pickSeat(best, me);
  },
  // the raycast-vehicle chassis the local player's seat is welded to (cached per seat / constraint change)
  seatVeh() {
    const me = Players.local; if (!me || !me.seat) return null;
    if (this._svSeat !== me.seat || this._svVer !== World.consVer) {
      this._svSeat = me.seat; this._svVer = World.consVer; this._sv = 0;
      for (const c of World.cons.values()) if (c.t === 'weld' && (c.a === me.seat || c.b === me.seat)) { const o = c.a === me.seat ? c.b : c.a; if (World.vehicles.has(o)) { this._sv = o; break; } }
    }
    return this._sv ? World.ents.get(this._sv) || null : null;
  },
  // ---- controller aim assist -----------------------------------------------------------------
  // Picks the live NPC (or, with combat on, player) closest to the crosshair inside a small cone,
  // with line of sight. Returns { pt, d, s } where s = 0 dead-centre .. 1 edge of the cone, or null.
  aimTarget(me) {
    const W = W_BY_ID[Tools.weapon];
    if (Input.device !== 'pad' || !Settings.aimAssist || Rules.aimAssist === false || !W || !(W.range || W.proj) || me.seat || me.dead || me.noclip || Editor.active || UI.open) return null;
    const eye = R.camera.position, cp = Math.cos(me.pitch), fwd = new V3(-Math.sin(me.yaw) * cp, Math.sin(me.pitch), -Math.cos(me.yaw) * cp);
    const maxD = Math.min(W.range || 80, this.zoomed ? 250 : 90), R0 = this.zoomed ? 0.7 : 1.1;
    let best = null, bestS = 1;
    const consider = (pt, kind, id) => {
      const dx = pt.x - eye.x, dy = pt.y - eye.y, dz = pt.z - eye.z, d = Math.hypot(dx, dy, dz);
      if (d < 0.8 || d > maxD) return;
      const cos = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d; if (cos < 0.95) return;
      const s = Math.acos(Math.min(1, cos)) / clamp(Math.atan(R0 / d), 0.025, 0.2);
      if (s < bestS) { bestS = s; best = { pt: new V3(pt.x, pt.y, pt.z), d, kind, id }; }
    };
    for (const g of World.groups.values()) {
      if (g.t !== 'npc' || !g.alive) continue;
      const e = World.ents.get(g.parts[1]); if (e && e.mesh) consider(e.mesh.position, 'g', g.id);   // torso
    }
    if (Rules.combat) for (const p of Players.map.values()) if (!p.isLocal && !p.dead) consider({ x: p.renderPos.x, y: p.renderPos.y + (p.crouch ? 0.95 : 1.25), z: p.renderPos.z }, 'p', p.id);
    if (!best) return null;
    const h = Phys.cast(eye, new V3().subVectors(best.pt, eye).normalize(), best.d + 0.5, me.body);   // line of sight
    if (h && h.dist < best.d - 0.6) {
      const ok = best.kind === 'p' ? h.id === 'p:' + best.id : (typeof h.id === 'number' && World.ents.has(h.id) && World.ents.get(h.id).d.g === best.id);
      if (!ok) return null;
    }
    best.s = bestS; return best;
  },
  // ---- owner aimbot --------------------------------------------------------------------------
  // Only for owners (the owner code unlocked on this device). Turns the view onto the target closest to the crosshair
  // inside Settings.aimbotFov: live NPCs, and other players when combat is on, with line of sight. Head or body.
  ownerAimbot(me, dt) {
    const W = W_BY_ID[Tools.weapon], mode = Settings.aimbot | 0;
    if (!Owner.key || !mode || !W || !(W.range || W.proj) || me.seat || me.dead || Editor.active || UI.open) return;
    if (mode === 1 && !Input.down('fire') && !Input.down('alt')) return;
    const eye = R.camera.position, cp = Math.cos(me.pitch), fwd = new V3(-Math.sin(me.yaw) * cp, Math.sin(me.pitch), -Math.cos(me.yaw) * cp);
    const maxD = Math.min(W.range || 300, 400), minCos = Math.cos(clamp(Settings.aimbotFov || 25, 2, 180) * Math.PI / 360), head = Settings.aimbotBone !== 'body';
    const cands = [];
    const consider = (pt, kind, id) => {
      const dx = pt.x - eye.x, dy = pt.y - eye.y, dz = pt.z - eye.z, d = Math.hypot(dx, dy, dz);
      if (d < 0.5 || d > maxD) return;
      const cos = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d; if (cos < minCos) return;
      cands.push({ pt: new V3(pt.x, pt.y, pt.z), d, kind, id, cos });
    };
    for (const g of World.groups.values()) {
      if (g.t !== 'npc' || !g.alive) continue;
      const e = (head && World.ents.get(g.parts[2])) || World.ents.get(g.parts[1]); if (e && e.mesh) consider(e.mesh.position, 'g', g.id);
    }
    if (Rules.combat) for (const p of Players.map.values()) if (!p.isLocal && !p.dead) consider({ x: p.renderPos.x, y: p.renderPos.y + (head ? 1.62 : 1.25) - (p.crouch ? 0.3 : 0), z: p.renderPos.z }, 'p', p.id);
    cands.sort((a, b) => b.cos - a.cos);
    let best = null;
    for (const c of cands.slice(0, 6)) {   // nearest to the crosshair that we can actually see
      const h = Phys.cast(eye, new V3().subVectors(c.pt, eye).normalize(), c.d + 0.5, me.body);
      if (h && h.dist < c.d - 0.3 && !(c.kind === 'p' ? h.id === 'p:' + c.id : (typeof h.id === 'number' && World.ents.has(h.id) && World.ents.get(h.id).d.g === c.id))) continue;
      best = c; break;
    }
    if (!best) return;
    const dx = best.pt.x - eye.x, dy = best.pt.y - eye.y, dz = best.pt.z - eye.z;
    let ey = Math.atan2(-dx, -dz) - me.yaw; while (ey > Math.PI) ey -= Math.PI * 2; while (ey < -Math.PI) ey += Math.PI * 2;
    const ep = Math.atan2(dy, Math.hypot(dx, dz)) - me.pitch;
    const sm = [0, 25, 12, 6][Settings.aimbotSmooth | 0], k = sm ? 1 - Math.exp(-sm * dt) : 1;   // instant / fast / medium / smooth
    me.yaw += ey * k; me.pitch = clamp(me.pitch + ep * k, -1.55, 1.55);
    R.camera.rotation.set(me.pitch, me.yaw, 0, 'YXZ'); R.camera.updateMatrixWorld();   // so a shot fired this frame goes where we now look
  },
  // ---- fixed 60 Hz step ----------------------------------------------------------------------
  fixedStep(dt) {
    Phys.sync();
    const me = Players.local;
    if (me && this.state === 'playing') {
      const en = !me.seat && !me.dead && !me.noclip; if (me._colOn !== en) { me.col.setEnabled(en); me._colOn = en; }   // noclip passes through everything
      if (me.seat) { const se = World.ents.get(me.seat); if (se && se.body) { const t = se.body.translation(); me.prevPos.copy(me.pos); me.pos.set(t.x, t.y + 0.3, t.z); } }
      Players.simLocal(me, dt, this.moveInp);
    }
    if (Net.isHost) {
      for (const p of Players.map.values()) if (!p.isLocal) Players.driveRemote(p, p.pos);
      Auth.step(dt);
      Phys.step();
      Auth.postStep();
      for (const e of World.ents.values()) {
        if (e.d.k === 'map' || !e.body) continue;
        e.prevP.copy(e.curP); e.prevQ.copy(e.curQ);
        if (e.body.isSleeping()) continue;
        const t = e.body.translation(), r = e.body.rotation(); e.curP.set(t.x, t.y, t.z); e.curQ.set(r.x, r.y, r.z, r.w);
      }
    } else {
      const rt = Net.renderTime();
      for (const e of World.ents.values()) {
        if (e.d.k === 'map' || !e.body || !e.buf.length) continue;
        const last = e.buf[e.buf.length - 1];
        if (rt > last.t + 0.3) { if (e.parked) continue; e.parked = true; }
        else e.parked = false;
        sampleBuf(e.buf, rt, _v1, _q1);
        e.body.setNextKinematicTranslation(_v1); e.body.setNextKinematicRotation(_q1);
      }
      for (const p of Players.map.values()) if (!p.isLocal) { if (p.buf.length) sampleBuf(p.buf, rt, p.renderPos, _q1); Players.driveRemote(p, p.renderPos); }
      Phys.step();
    }
  },
  // ---- visuals -------------------------------------------------------------------------------
  updateVisuals(dt, alpha) {
    const host = Net.isHost, rt = Net.renderTime();
    for (const e of World.ents.values()) {
      if (e.d.k === 'map' || !e.mesh) continue;
      if (host) { e.mesh.position.lerpVectors(e.prevP, e.curP, alpha); e.mesh.quaternion.slerpQuaternions(e.prevQ, e.curQ, alpha); }
      else if (e.buf.length && !e.parked) sampleBuf(e.buf, rt, e.mesh.position, e.mesh.quaternion);
      if (e.d.thr) {
        for (const g of e.mesh.children) {
          if (g.userData.thr == null) continue;
          let on = false; if (host) { const a = Auth.activeThr; for (let i = 0; i < a.length; i += 2) if (a[i] === e.id && a[i + 1] === g.userData.thr) on = true; } else on = Net.activeThr.has(e.id + ':' + g.userData.thr);
          const f = g.getObjectByName('flame'); f.visible = on; if (on) f.scale.set(1, 0.8 + Math.random() * 0.5, 1);
        }
      }
    }
    for (const p of Players.map.values()) {
      if (p.isLocal) p.renderPos.lerpVectors(p.prevPos, p.pos, alpha);
      else if (host) p.renderPos.lerp(p.pos, 1 - Math.exp(-18 * dt));
      if (!p.isLocal) {
        let yd = p.yaw - p.renderYaw; while (yd > Math.PI) yd -= Math.PI * 2; while (yd < -Math.PI) yd += Math.PI * 2; p.renderYaw += yd * (1 - Math.exp(-15 * dt));
        if (!host && p.buf.length > 1) { const a = p.buf[p.buf.length - 2], b = p.buf[p.buf.length - 1]; p.vel.subVectors(b.p, a.p).divideScalar(Math.max(0.02, b.t - a.t)); }
      } else p.renderYaw = p.yaw;
      if (p.seat) { const se = World.ents.get(p.seat); if (se && se.mesh) { p.renderPos.copy(se.mesh.position).add(_v1.set(0, -0.62, 0.05).applyQuaternion(se.mesh.quaternion)); } }
      PlayerView.updateAvatar(p, dt);
    }
    View.updateRopes();
    Vehicles.updateVisuals(dt);
    Gore.update(dt);
    Tools.updateBeams();
    FX.update(dt); Bots.update(dt); Env.tick(dt); Audio.update(dt);
    this.updateCamera(dt);
    DmgNum.update(dt);
    PlayerView.updatePlates();
  },
  updateCamera(dt) {
    const cam = R.camera, me = Players.local;
    if (this.state !== 'playing' || !me) {
      this.orbit += dt * 0.06;
      cam.position.set(Math.sin(this.orbit) * 16, 5.5 + Math.sin(this.orbit * 0.7) * 1.2, Math.cos(this.orbit) * 16);
      cam.lookAt(0, 1.2, 0); R.focus.set(0, 0, 0);
      if (this.viewmodel) this.viewmodel.visible = false;
      if (this.fovCur && this.fovCur !== Settings.fov) { this.fovCur = Settings.fov; R.setFov(Settings.fov); $('#scope').classList.remove('on'); }
      return;
    }
    const cp = Math.cos(me.pitch), dir = _v2.set(-Math.sin(me.yaw) * cp, Math.sin(me.pitch), -Math.cos(me.yaw) * cp);
    if (me.seat) {
      const se = World.ents.get(me.seat), ve = this.seatVeh(), V = ve && VEH[ve.d.veh], base = ve && ve.mesh ? ve.mesh : se && se.mesh;
      const target = base ? _v1.copy(base.position).add(_v3.set(0, V ? V.cam[1] : 1.3, 0)) : _v1.copy(me.renderPos);
      const dist = V ? V.cam[0] + Math.min(2.5, Math.abs(ve._spd || 0) * 0.06) : 6.5;
      cam.position.copy(target).addScaledVector(dir, -dist); cam.position.y = Math.max(cam.position.y, target.y - 1, 0.3);
      // keep the camera out of walls: only map geometry and the ground block it
      const back = _v4.subVectors(cam.position, target), bl = back.length();
      if (bl > 0.5) {
        back.divideScalar(bl);
        const h = Phys.cast(target, back, bl, null, c => { const id = Phys.colMap.get(c.handle); return id === 0 || (typeof id === 'number' && World.ents.has(id) && World.ents.get(id).d.k === 'map'); });
        if (h) cam.position.copy(target).addScaledVector(back, Math.max(0.6, h.dist - 0.3));
      }
      cam.lookAt(target);
    } else if (me.disg && !me.dead && Rules.mode === 'prophunt') {   // disguised: look at yourself from behind
      const target = _v1.copy(me.renderPos); target.y += Math.max(1.0, me.disg.s[1] + 0.5);
      cam.position.copy(target).addScaledVector(dir, -4.5);
      const back = _v4.subVectors(cam.position, target), bl = back.length(); back.divideScalar(bl || 1);
      const h = Phys.cast(target, back, bl, me.body, c => { const id = Phys.colMap.get(c.handle); return id === 0 || (typeof id === 'number' && World.ents.has(id) && World.ents.get(id).d.k === 'map'); });
      if (h) cam.position.copy(target).addScaledVector(back, Math.max(0.6, h.dist - 0.3));
      cam.lookAt(target);
    } else {
      const eh = me.crouch ? CFG.eye - 0.5 : CFG.eye;
      this.eyeH = lerp(this.eyeH || eh, eh, 1 - Math.exp(-14 * dt));
      cam.position.set(me.renderPos.x, me.renderPos.y + this.eyeH, me.renderPos.z);
      // landing: remember the fastest fall, dip the view when we touch down
      if (!me.grounded) this.airVy = Math.min(this.airVy || 0, me.vel.y);
      else { if (this.airVy < -4) this.land = Math.max(this.land || 0, clamp(-this.airVy / 14, 0.25, 1)); this.airVy = 0; }
      this.land = Math.max(0, (this.land || 0) - dt * 3.2);
      cam.position.y -= Math.sin(Math.min(1, this.land) * Math.PI) * 0.09 * this.land;
      // view punch from recoil: kicks the camera (not the aim) and springs back
      const pk = 1 - Math.exp(-(Tools.cool > 0 ? 6 : 9) * dt); this.punch[0] -= this.punch[0] * pk; this.punch[1] -= this.punch[1] * pk;   // recovers slower while you keep firing
      cam.rotation.set(me.pitch + this.punch[0], me.yaw + this.punch[1], 0, 'YXZ');
      if (me.dead) { cam.position.y = me.renderPos.y + 0.4; cam.rotation.z = 0.4; }
    }
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); cam.position.x += (Math.random() - 0.5) * this.shake * 0.4; cam.position.y += (Math.random() - 0.5) * this.shake * 0.4; }
    R.focus.copy(me.renderPos);
    // viewmodel bob / recoil
    // sniper scope: narrow the FOV, hide the viewmodel, show the scope overlay
    const fovT = this.zoomed && !me.seat ? Settings.fov / 4.5 : Settings.fov;
    this.fovCur = lerp(this.fovCur || Settings.fov, fovT, 1 - Math.exp(-18 * dt));
    if (Math.abs(this.fovCur - fovT) < 0.05) this.fovCur = fovT;
    if (Math.abs(cam.fov - this.fovCur) > 0.01) R.setFov(this.fovCur);
    const scoped = this.fovCur < Settings.fov * 0.55; $('#scope').classList.toggle('on', scoped);
    const vm = this.viewmodel;
    if (vm) {
      vm.visible = !me.seat && !me.dead && !Editor.active && !scoped && !(me.disg && Rules.mode === 'prophunt');
      const spd = Math.hypot(me.vel.x, me.vel.z), mv = Math.min(1, spd / 5); this.bob += dt * spd * (me.grounded ? 1.6 : 0.3);
      const k = Tools.kick, melee = Tools.weapon === 'crowbar', t = now();
      // sway: the gun lags behind where you look
      let dyaw = me.yaw - (this.lastYaw ?? me.yaw); while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      const dpitch = me.pitch - (this.lastPitch ?? me.pitch); this.lastYaw = me.yaw; this.lastPitch = me.pitch;
      const sk = 1 - Math.exp(-9 * dt), sdt = Math.max(dt, 1 / 240);
      this.sway[0] += (clamp(dyaw / sdt * 0.006, -0.035, 0.035) - this.sway[0]) * sk;
      this.sway[1] += (clamp(dpitch / sdt * 0.006, -0.03, 0.03) - this.sway[1]) * sk;
      // sprinting lowers and turns the gun in; drawing raises it from below
      const sprint = this.moveInp.sprint && me.grounded && spd > 4 && !Tools.grab && Tools.cool <= 0;
      this.sprintK += ((sprint ? 1 : 0) - this.sprintK) * (1 - Math.exp(-8 * dt));
      this.drawT = Math.min(1, this.drawT + dt / 0.28); const dr = Math.pow(1 - this.drawT, 2);
      const ld = Math.sin(Math.min(1, this.land || 0) * Math.PI) * (this.land || 0), br = Math.sin(t * 1.7) * 0.0025 * (1 - mv);
      this.swingT += dt; const sw = melee ? swingPose(this.swingT) : SWING_REST;
      const WM = Models.has('wp_' + Tools.weapon) && WEAPON_MODEL[Tools.weapon], VB = WM ? WM.vm : [0.26, -0.25, -0.48], VR = (WM && WM.vr) || [0, 0, 0], spr = melee ? 0.4 : 1;
      vm.position.set(
        VB[0] + Math.sin(this.bob) * 0.012 * mv + this.sway[0] - this.sprintK * 0.03 * spr + sw[3],
        VB[1] + Math.abs(Math.cos(this.bob)) * 0.012 * mv - this.sway[1] + br - ld * 0.04 - this.sprintK * 0.035 - dr * 0.22 + sw[4],
        VB[2] + (melee ? 0 : k * 0.07) + sw[5]);
      vm.rotation.set(
        VR[0] + (melee ? 0 : k * 0.18) - this.sway[1] * 1.6 - this.sprintK * 0.22 * spr - dr * 0.7 - ld * 0.06 + sw[0],
        VR[1] - this.sway[0] * 1.8 + this.sprintK * 0.55 * spr + sw[1],
        VR[2] + this.sway[0] * -2.2 + (melee ? 0 : (this.kickRoll || 0) * k) + sw[2]);
    }
  },
  buildViewmodel() {
    this.swingT = 9;
    if (!this.viewmodel) { this.viewmodel = new THREE.Group(); R.camera.add(this.viewmodel); }
    const vm = this.viewmodel; while (vm.children.length) vm.remove(vm.children[0]);
    const add = (geo, t, c, p, r) => { const m = matMesh(geo, t, c); m.castShadow = m.receiveShadow = false; if (p) m.position.set(...p); if (r) m.rotation.set(...r); vm.add(m); return m; };
    const B = (x, y, z, rad) => Geo.get(`vmb${x},${y},${z}`, () => new RoundedBoxGeometry(x, y, z, 2, rad || 0.01));
    const C = (r, len) => Geo.get(`vmc${r},${len}`, () => new THREE.CylinderGeometry(r, r, len, 16).rotateX(Math.PI / 2));
    const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; vm.add(muzzle);
    const WM = WEAPON_MODEL[Tools.weapon], mk = 'wp_' + ((WM && WM.model) || Tools.weapon);
    if (WM && Models.has(mk)) {
      const inst = Models.instance(mk, WM.t, WM.c), me = Players.local;
      inst.traverse(o => { if (!o.isMesh) return; o.castShadow = o.receiveShadow = false; if (o.userData.slot === 'sleeve') { const c = me ? me.color : Settings.color; o.material = Mats.get('plastic', c); o.userData.mt = 'plastic'; o.userData.mc = c; } });
      vm.add(inst); muzzle.position.fromArray(WM.muzzle);
      return;
    }
    switch (Tools.weapon) {
      case 'physgun':
        add(C(0.05, 0.42), 'metal', '#3a3f4b', [0, 0, -0.05]); add(B(0.08, 0.14, 0.12), 'plastic', '#2a2c31', [0, -0.09, 0.08]);
        add(C(0.058, 0.04), 'neon', '#4dd0e1', [0, 0, -0.12]); add(C(0.058, 0.04), 'neon', '#4dd0e1', [0, 0, 0.05]);
        for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; add(B(0.012, 0.012, 0.12), 'metal', '#c9ced6', [Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.3]); }
        muzzle.position.set(0, 0, -0.36); break;
      case 'toolgun':
        add(B(0.1, 0.13, 0.32, 0.02), 'plastic', '#fed330', [0, 0, -0.05]); add(B(0.07, 0.14, 0.08), 'plastic', '#2a2c31', [0, -0.11, 0.05]);
        add(B(0.07, 0.05, 0.002), 'neon', '#9ff3ff', [0, 0.02, 0.112]); add(C(0.02, 0.12), 'metal', '#c9ced6', [0, 0.02, -0.26]);
        muzzle.position.set(0, 0.02, -0.33); break;
      case 'pistol':
        add(B(0.05, 0.07, 0.22), 'metal', '#2a2c31', [0, 0, -0.05]); add(B(0.045, 0.13, 0.06), 'plastic', '#3a3026', [0, -0.08, 0.03], [0.25, 0, 0]);
        muzzle.position.set(0, 0.01, -0.17); break;
      case 'rifle':
        add(B(0.06, 0.09, 0.62), 'metal', '#3d4a32', [0, 0, -0.15]); add(B(0.05, 0.14, 0.06), 'metal', '#2a2c31', [0, -0.1, -0.1], [0.15, 0, 0]);
        add(B(0.055, 0.1, 0.2), 'plastic', '#2a2c31', [0, -0.03, 0.2]); add(C(0.014, 0.2), 'metal', '#2a2c31', [0, 0.015, -0.55]);
        muzzle.position.set(0, 0.015, -0.66); break;
      case 'grenade':
        add(Geo.get('vmg', () => new THREE.SphereGeometry(0.06, 16, 12)), 'metal', '#3d4a32', [0, 0, -0.05]); add(C(0.012, 0.05), 'metal', '#9aa0a8', [0, 0.06, -0.05], [Math.PI / 2, 0, 0]);
        muzzle.position.set(0, 0, -0.12); break;
      case 'crowbar':
        add(B(0.025, 0.025, 0.7), 'metal', '#c0392b', [0, 0.05, -0.25], [0.35, 0, 0]); add(B(0.025, 0.1, 0.025), 'metal', '#c0392b', [0, 0.2, -0.58]);
        muzzle.position.set(0, 0.2, -0.6); break;
    }
  },
  // ---- background-tab ticker (keeps the host simulating when its tab is hidden) -----------------
  // Keeps the simulation (and host snapshots) running when the tab is hidden or the window is
  // occluded and requestAnimationFrame stops firing. Worker timers are not throttled like page timers.
  startWatchdog() {
    if (this.hiddenTicker) return;
    try {
      const src = 'let iv=null;onmessage=e=>{clearInterval(iv);if(e.data>0)iv=setInterval(()=>postMessage(0),e.data)}';
      this.hiddenTicker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.hiddenTicker.onmessage = () => { if (performance.now() - this.lastRaf > 150) this.tick(false); };
      this.hiddenTicker.postMessage(1000 / 30);
    } catch (e) { setInterval(() => { if (performance.now() - this.lastRaf > 150) this.tick(false); }, 1000 / 30); }
  },
  // ---- main loop ----------------------------------------------------------------------------------
  tick(render) {
    const t = performance.now(); let dt = (t - this.last) / 1000; this.last = t;
    const frameMs = dt * 1000; dt = Math.min(dt, 0.1);
    Input.poll();
    if (this.state === 'playing' && render) this.handleInput(dt);
    this.acc += dt; let n = 0;
    const sdt = this.stepDt, maxN = sdt > 1 / 45 ? 2 : 3, tp = performance.now();
    while (this.acc >= sdt && n < maxN) { this.fixedStep(sdt); this.acc -= sdt; n++; }
    if (n === maxN) this.acc = Math.min(this.acc, sdt);   // can't keep up this frame: drop the backlog rather than spiral into ever longer frames
    this.governPhysics(performance.now() - tp, dt);
    Net.update(dt);
    if (this.state === 'playing' && Net.online) { this.autoT -= dt; if (this.autoT <= 0) { this.autoT = 20; this.autosave(); } }
    if (render) {
      Env.update();
      this.updateVisuals(dt, this.acc / this.stepDt);
      if (this.state === 'playing') UI.update(dt); else Nav.update(dt);
      R.render(dt);
      R.drsTick(frameMs);
    }
    Input.endFrame();
  },
  // ---- physics governor (host) ---------------------------------------------------------------
  // The host simulates everything, so on a slow CPU physics eats the frame and the host lags while clients are fine.
  // Every few seconds: if physics took over 30% of the time, step down (fewer solver iterations, then 30 steps/s
  // instead of 60); with plenty of headroom, step back up. Clients always run level 0 (they only follow snapshots).
  stepDt: 1 / 60, physLvl: 0, govMs: 0, govT: 0, govHold: 0,
  setPhysLevel(l) {
    const L = PHYS_LEVELS[l]; this.physLvl = l; this.stepDt = L.dt; this.govHold = 4;
    if (Phys.world) { Phys.world.timestep = L.dt; Phys.world.integrationParameters.numSolverIterations = L.it; }
  },
  governPhysics(ms, dt) {
    if (!Net.isHost || this.state !== 'playing') { if (this.physLvl) this.setPhysLevel(0); this.govMs = this.govT = 0; return; }
    this.govMs += ms; this.govT += dt; this.govHold -= dt;
    if (this.govT < 2) return;
    const load = this.govMs / (this.govT * 1000); this.govMs = this.govT = 0; this.physLoad = load;
    if (this.govHold > 0) return;
    if (load > 0.3 && this.physLvl < PHYS_LEVELS.length - 1) this.setPhysLevel(this.physLvl + 1);
    else if (this.physLvl > 0 && load * PHYS_LEVELS[this.physLvl - 1].cost / PHYS_LEVELS[this.physLvl].cost < 0.2) this.setPhysLevel(this.physLvl - 1);
  },
  frame() { requestAnimationFrame(() => this.frame()); this.lastRaf = performance.now(); if (!document.hidden) this.tick(true); },
};

// debug handle for testing from the console
window.TW = { Thumbs, WEAPON_MODEL, View, PlayerView, Social, PH, ZS, Prog, DiscordAct, Online, Owner, Hotbar, Audio, Models, Game, Net, World, Players, R, Auth, Tools, Editor, UI, Rules, Settings, Phys, Input, Admin, Save, FX, Mats, Vehicles, VEH, Gore, Env };
Game.boot();
</script>

