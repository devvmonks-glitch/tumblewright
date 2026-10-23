
/* ============================================================================
   GAME MODES (host) + PROGRESSION (each player, saved on their own device)
   ========================================================================== */
// ---- Zombie Survival -------------------------------------------------------------------------
// Build between waves, then hold out. Players who go down stay down until the wave is cleared;
// everyone down = game over, and it starts again from wave 1. The host runs it; Rules.zs carries
// the state to everyone (wave, phase, seconds left, zombies left).
const ZS = {
  PREP0: 30, PREP: 20, OVER: 12, MAXALIVE: 14,
  st: null, best: 0,
  start() {
    this.clearZombies(true);
    this.st = { wave: 0, phase: 'prep', t: this.PREP0, toSpawn: 0, ids: new Set(), spawnT: 0 };
    Rules.combat = true;
    for (const p of Players.map.values()) if (p.dead) Auth.respawn(p);
    Net.sysChat(`Zombie Survival! Build your defences: the first wave comes in ${this.PREP0} seconds.`);
    this.publish();
  },
  stop() { this.clearZombies(true); this.st = null; Rules.zs = null; },
  publish() {
    const s = this.st;
    Rules.zs = s ? { wave: s.wave, phase: s.phase, t: Math.max(0, Math.ceil(s.t)), left: s.toSpawn + s.ids.size, best: this.best } : null;
    Net.sendRules();
  },
  step(dt) {
    if (Rules.mode !== 'zombies') return;
    const s = this.st; if (!s) return this.start();   // e.g. we just became host after a migration
    s.t -= dt; this._pub = (this._pub || 0) - dt;
    for (const gid of s.ids) {   // wave zombies that died since last step: credit whoever hit them last
      const g = World.groups.get(gid);
      if (!g || !g.alive) { s.ids.delete(gid); if (g && g._lastBy) Prog.award(g._lastBy, 'zkill'); }
    }
    if (s.phase === 'prep') { if (s.t <= 0) this.nextWave(); }
    else if (s.phase === 'wave') {
      s.spawnT -= dt;
      if (s.toSpawn > 0 && s.spawnT <= 0 && s.ids.size < this.MAXALIVE) { if (this.spawnZombie()) s.toSpawn--; s.spawnT = Math.max(0.35, 1.6 - s.wave * 0.1); }
      if (![...Players.map.values()].some(p => !p.dead)) this.gameOver();
      else if (s.toSpawn === 0 && s.ids.size === 0) this.waveCleared();
    } else if (s.phase === 'over' && s.t <= 0) return this.start();
    if (this._pub <= 0) { this._pub = 1; this.publish(); }
  },
  nextWave() {
    const s = this.st; s.wave++; s.phase = 'wave'; s.toSpawn = 4 + s.wave * 3; s.spawnT = 0;
    Net.sysChat(`Wave ${s.wave}: ${s.toSpawn} zombies incoming!`); this.publish();
  },
  waveCleared() {
    const s = this.st; s.phase = 'prep'; s.t = this.PREP; this.best = Math.max(this.best, s.wave);
    this.clearZombies(false);   // tidy up this wave's bodies
    for (const p of Players.map.values()) { if (p.dead) Auth.respawn(p); Prog.award(p.id, 'wave', s.wave); }
    Net.sysChat(`Wave ${s.wave} cleared! Next wave in ${this.PREP} seconds.`); this.publish();
  },
  gameOver() {
    const s = this.st, n = s.wave - 1; s.phase = 'over'; s.t = this.OVER;
    Net.sysChat(`Everyone is down. You survived ${n} wave${n === 1 ? '' : 's'}. Restarting in ${this.OVER} seconds.`); this.publish();
  },
  // a zombie on solid ground 18-30 m from a random living player (or at one of the map's bot spawns)
  spawnZombie() {
    const ps = [...Players.map.values()].filter(p => !p.dead), th = THEMES[Rules.env];
    const c = ps.length ? ps[(Math.random() * ps.length) | 0].pos : new V3();
    let pos = null;
    for (let k = 0; k < 10 && !pos; k++) {
      const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 12, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (Math.abs(x) > CFG.worldHalf - 5 || Math.abs(z) > CFG.worldHalf - 5) continue;
      const h = Phys.cast(new V3(x, c.y + 25, z), new V3(0, -1, 0), 60);
      if (h && h.normal.y > 0.7 && Math.abs(h.point.y - c.y) < 8 && !(typeof h.id === 'string')) pos = h.point;
    }
    if (!pos && th && th.botSpawns) { const b = th.botSpawns[(Math.random() * th.botSpawns.length) | 0]; pos = new V3(b[0], b[1], b[2]); }
    if (!pos) return false;
    const r = Auth.spawnPrefab(npcPrefab('zombie'), pos, Math.random() * Math.PI * 2, 'sys');
    const e = r && World.ents.get(r.ents[0]), g = e && World.groups.get(e.d.g);
    if (!g) return false;
    g.zs = 1; g.hp = Math.round(100 * (1 + 0.12 * (this.st.wave - 1)));   // tougher every wave
    this.st.ids.add(g.id);
    return true;
  },
  clearZombies(all) {
    const ids = [];
    for (const g of World.groups.values()) if (g.zs && (all || !g.alive)) ids.push(...g.parts.filter(id => World.ents.has(id)));
    if (ids.length) Auth.removeEnts(ids);
  },
};

// ---- Prop Hunt ---------------------------------------------------------------------------------
// Props press E on any small object to become it; hunters are blind for the hide phase, then have
// HUNT seconds to find them. Shooting the wrong object costs hunters health. Teams rotate each round.
const PH_SCATTER = ['crate', 'crate_s', 'crate_l', 'barrel', 'drum', 'cone', 'tire', 'chair', 'table', 'pallet', 'melon', 'tv', 'bookshelf', 'fridge', 'couch', 'cblock', 'ball', 'beachball', 'vending', 'dumpster'];
const PH = {
  HIDE: 30, HUNT: 180, END: 8,
  st: null, spawned: [],
  start() {
    this.scatter();
    Rules.combat = true; this.st = null;
    Net.sysChat('Prop Hunt! Props: press E on an object to become it. Hunters: find them, but wrong guesses hurt.');
    this.newRound();
  },
  stop() {
    this.st = null; Rules.ph = null;
    for (const p of Players.map.values()) { p.team = null; p.disg = null; if (p.dead) Auth.respawn(p); }
    const ids = this.spawned.filter(id => World.ents.has(id)); if (ids.length) Auth.removeEnts(ids); this.spawned = [];
    Net.sendPlayers();
  },
  // hiding spots: a spread of everyday objects around the spawn area
  scatter() {
    const c = Auth.pickSpawn();
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 30, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      const h = Phys.cast(new V3(x, c.y + 20, z), new V3(0, -1, 0), 50);
      if (!h || h.normal.y < 0.7 || Math.abs(h.point.y - c.y) > 6) continue;
      const it = ITEM_INDEX[PH_SCATTER[(Math.random() * PH_SCATTER.length) | 0]]; if (!it || !it.pf) continue;
      const res = Auth.spawnPrefab(it.pf(), h.point, Math.random() * Math.PI * 2, 'sys');
      if (res) this.spawned.push(...res.ents);
    }
  },
  publish() {
    const s = this.st, ps = [...Players.map.values()];
    Rules.ph = s ? { phase: s.phase, t: Math.max(0, Math.ceil(s.t)), round: s.round || 0, left: ps.filter(p => p.team === 'prop' && !p.dead).length, win: s.win || null } : null;
    Net.sendRules();
  },
  newRound() {
    const ps = [...Players.map.values()], round = ((this.st && this.st.round) || 0) + 1;
    for (const p of ps) { p.disg = null; if (p.dead) Auth.respawn(p); p.hp = 100; }
    if (ps.length < 2) { for (const p of ps) p.team = 'prop'; this.st = { phase: 'wait', t: 0, round: round - 1 }; Net.sendPlayers(); return this.publish(); }
    const nH = Math.max(1, Math.round(ps.length / 3));   // about a third hunt; whoever hunted least goes first
    ps.sort((a, b) => (a.phH || 0) - (b.phH || 0) || Math.random() - 0.5)
      .forEach((p, i) => { p.team = i < nH ? 'hunter' : 'prop'; if (p.team === 'hunter') p.phH = (p.phH || 0) + 1; });
    this.st = { phase: 'hide', t: this.HIDE, round };
    Net.sendPlayers(); Net.sysChat(`Round ${round}: props have ${this.HIDE} seconds to hide.`); this.publish();
  },
  step(dt) {
    if (Rules.mode !== 'prophunt') return;
    const s = this.st; if (!s) return this.start();
    s.t -= dt; this._pub = (this._pub || 0) - dt;
    const ps = [...Players.map.values()];
    for (const p of ps) if (!p.team) { p.team = s.phase === 'hide' ? 'prop' : 'hunter'; Net.sendPlayers(); }   // joined mid-round
    if (s.phase === 'wait') { if (ps.length >= 2) return this.newRound(); }
    else if (s.phase === 'hide') { if (s.t <= 0) { s.phase = 'hunt'; s.t = this.HUNT; Net.sysChat('Ready or not, here come the hunters!'); this.publish(); } }
    else if (s.phase === 'hunt') {
      const props = ps.filter(p => p.team === 'prop'), hunters = ps.filter(p => p.team === 'hunter' && !p.dead);
      if (!props.some(p => !p.dead)) this.end('hunter');
      else if (!hunters.length || s.t <= 0) this.end('prop');
    } else if (s.phase === 'end' && s.t <= 0) return this.newRound();
    if (this._pub <= 0) { this._pub = 1; this.publish(); }
  },
  end(win) {
    const s = this.st; s.phase = 'end'; s.t = this.END; s.win = win;
    for (const p of Players.map.values()) if (p.team === win) Prog.award(p.id, 'phwin', win === 'prop' && !p.dead ? 60 : 40);
    Net.sysChat(win === 'hunter' ? 'Hunters win! Every prop was found.' : 'Props win! The hunters ran out of time.'); this.publish();
  },
  live() { return Rules.mode === 'prophunt' && this.st && (this.st.phase === 'hide' || this.st.phase === 'hunt'); },
  // a prop asks to become entity eid
  disguise(p, eid) {
    if (!this.live() || p.team !== 'prop' || p.dead) return;
    const e = World.ents.get(eid); if (!e || !e.mesh || e.d.k === 'part' || e.d.veh || e.d.sh.t === 'spawn') return;
    if (e.mesh.position.distanceTo(p.pos) > 9) return;
    const box = new THREE.Box3().setFromObject(e.mesh), s = box.getSize(new V3());
    if (Math.max(s.x, s.y, s.z) > 3.2 || Math.max(s.x, s.y, s.z) < 0.15) return Net.notify(p.id, 'Too big or too small to hide as.');
    const d = {}; for (const k of ['sh', 'm', 'c', 'c2', 'vis', 'hc']) if (e.d[k] !== undefined) d[k] = e.d[k];
    p.disg = { d, s: [r4(s.x), r4(s.y), r4(s.z)], b: r4(box.min.y - e.mesh.position.y) };
    Net.sendPlayers();
  },
  // host hit test size for a disguised player: a capsule roughly the object's size
  hitShape(v) {
    const s = v.disg.s, r = clamp(Math.max(s[0], s[2]) / 2, 0.15, 1.3), h = Math.max(s[1], r * 2);
    return { r, y0: v.pos.y + r, y1: v.pos.y + h - r };
  },
};

// ---- Progression: XP, levels, unlocks and daily challenges --------------------------------------
// Kept on this device (no accounts yet). The host tells each player what they earned ('xp' messages);
// levels are shown to everyone on nameplates.
const UNLOCK_COLORS = [
  { lvl: 3, c: '#c0c6cc', name: 'Steel' }, { lvl: 5, c: '#e8b923', name: 'Gold' }, { lvl: 8, c: '#7fffd4', name: 'Aqua' },
  { lvl: 12, c: '#ff4fa3', name: 'Neon pink' }, { lvl: 16, c: '#1a1a1a', name: 'Midnight' }, { lvl: 20, c: '#fffaf0', name: 'Pearl' },
];
const TITLES = [[1, 'Rookie'], [5, 'Builder'], [10, 'Survivor'], [15, 'Veteran'], [20, 'Elite'], [30, 'Legend']];
const XP_FOR = { zkill: 10, pkill: 25, npc: 5 };
const DAILY_POOL = [
  { id: 'zkills', text: n => `Kill ${n} zombies`, n: [15, 25, 40] },
  { id: 'wave', text: n => `Reach wave ${n} in Zombie Survival`, n: [3, 5, 7], max: true },
  { id: 'pkills', text: n => `Get ${n} player kills`, n: [3, 5, 8] },
  { id: 'mins', text: n => `Play for ${n} minutes`, n: [10, 20, 30] },
  { id: 'mpmins', text: n => `Play ${n} minutes in a room with others`, n: [10, 15, 25] },
  { id: 'spawns', text: n => `Spawn ${n} things`, n: [20, 40, 60] },
  { id: 'phwins', text: n => `Win ${n} Prop Hunt round${n === 1 ? '' : 's'}`, n: [1, 2, 3] },
];
const Prog = {
  d: null,
  load() {
    this.d = Object.assign({ xp: 0, stats: {}, day: '', daily: [], dp: {}, done: {} }, store.get('profile', {}));
    this.rollDaily();
  },
  save() { store.set('profile', this.d); },
  today() { const t = new Date(); return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`; },
  // three challenges per day, the same for everyone on that date
  rollDaily() {
    const day = this.today(); if (this.d.day === day && this.d.daily.length) return;
    let h = 0; for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const pool = DAILY_POOL.slice(), out = [];
    while (out.length < 3 && pool.length) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; const c = pool.splice(h % pool.length, 1)[0]; out.push({ id: c.id, n: c.n[(h >>> 8) % c.n.length] }); }
    Object.assign(this.d, { day, daily: out, dp: {}, done: {} }); this.save();
  },
  level(xp = this.d ? this.d.xp : 0) { let l = 1, need = 100; while (xp >= need) { xp -= need; l++; need = 100 + (l - 1) * 50; } return { l, into: xp, need }; },
  title(l = this.level().l) { let t = TITLES[0][1]; for (const [n, s] of TITLES) if (l >= n) t = s; return t; },
  gain(n, why) {
    if (!(n > 0)) return;
    const before = this.level().l; this.d.xp += Math.round(n); this.save();
    UI.xpPop(n, why);
    const after = this.level().l;
    if (after > before) {
      const un = UNLOCK_COLORS.filter(u => u.lvl > before && u.lvl <= after).map(u => u.name + ' colour');
      UI.toast(`Level ${after}! ${this.title(after)}` + (un.length ? ` · Unlocked: ${un.join(', ')}` : ''), 'military_tech'); Audio.play('confirm');
      if (Net.online && !Net.isHost) Net.toHost({ t: 'lvl', v: after });
      else { const me = Players.local; if (me) { me.lvl = after; Net.sendPlayers(); } }
      UI.refreshProfile();
    }
  },
  // a stat moved: lifetime stats + today's challenges
  bump(id, v = 1, isMax) {
    const s = this.d.stats; s[id] = isMax ? Math.max(s[id] || 0, v) : (s[id] || 0) + v;
    this.rollDaily();
    const c = this.d.daily.find(x => x.id === id);
    if (c && !this.d.done[id]) {
      this.d.dp[id] = isMax ? Math.max(this.d.dp[id] || 0, v) : (this.d.dp[id] || 0) + v;
      if (this.d.dp[id] >= c.n) { this.d.done[id] = 1; this.save(); UI.toast(`Daily challenge done: ${DAILY_POOL.find(p => p.id === id).text(c.n)}`, 'task_alt'); this.gain(100, 'Daily challenge'); }
    }
    this.save();
  },
  // host: tell player pid (an id or 'p:id') what they earned
  award(pid, kind, n) {
    if (!Net.isHost) return;
    const p = Players.map.get(String(pid).replace(/^p:/, '')); if (!p) return;
    const m = { t: 'xp', k: kind, n: n || 0 };
    if (p.isLocal) this.onXp(m); else Net.sendTo(p.id, m);
  },
  onXp(m) {
    if (m.k === 'zkill') { this.bump('zkills'); this.gain(XP_FOR.zkill, 'Zombie'); }
    else if (m.k === 'pkill') { this.bump('pkills'); this.gain(XP_FOR.pkill, 'Player kill'); }
    else if (m.k === 'phwin') { this.bump('phwins'); this.gain(m.n || 40, 'Round won'); }
    else if (m.k === 'wave') { this.bump('wave', m.n, true); this.gain(20 + 10 * (m.n | 0), `Wave ${m.n | 0} survived`); }
  },
  // called every frame while playing: playtime XP each minute (more with other people)
  tick(dt) {
    this._acc = (this._acc || 0) + dt; if (this._acc < 60) return; this._acc -= 60;
    const mp = Net.online && Players.map.size > 1;
    this.bump('mins'); if (mp) this.bump('mpmins');
    this.gain(mp ? 6 : 3, mp ? 'Playing together' : 'Playtime');
  },
};
