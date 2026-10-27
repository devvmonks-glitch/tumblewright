
/* ============================================================================
   10. NETWORKING — Trystero (WebRTC P2P over public Nostr relays, no backend)
   Host-authoritative: host simulates physics, clients send inputs + requests,
   host broadcasts binary snapshots (only moved bodies, quantized) at 20 Hz.
   Every peer is meshed so host migration needs no reconnection.
   ========================================================================== */
// ---- where the authoritative simulation runs -----------------------------------------------------------------
// The room host's window simulates the world itself (LocalLink) or, later, hands it to a worker. Everything the window
// asks of the authority goes through Net.link: players' requests and inputs, joins and leaves, stepping, snapshots,
// taking over as host. Clients have no use for it: their authority is the host, over the network.
const LocalLink = {
  local: true,   // the simulation lives in this window (Net.auth() is true for its room host)
  request(pid, m) { Auth.handle(pid, m); },
  input(pid, inp) { const p = Players.map.get(pid); if (p) Auth.onInput(p, inp); },
  // a player was let into the room (Net checked bans, version and room size): add them and send them the world
  join(pid, d, joinOrder) {
    const used = new Set([...Players.map.values()].map(p => p.idx)); let idx = 1; while (used.has(idx)) idx++;
    const name = String(d.name || 'Player').replace(/[<>]/g, '').slice(0, 18) || 'Player';
    const p = Players.add({ id: pid, name, color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#ff9f43', tier: TIERS[d.tier] ? d.tier : 'medium', idx, joinOrder, lvl: clamp(d.lvl | 0, 1, 999) });
    const sp = Auth.pickSpawn(); p.pos.copy(sp); p.tpGrace = now() + 1.5;
    Net.send('ws', { hostId: Net.me, rules: Rules, players: Net.playerList(), world: World.serialize(), you: { spawn: a3(sp) }, code: Net.code }, pid);
    Srv.sendPlayers();
    Srv.sysChat(`${p.name} joined the room`);
    if (p.tier === 'low') Srv.sysChat(`${p.name} is on Low graphics (PS1 style).`, 'tier');
  },
  leave(pid) {
    const p = Players.map.get(pid); if (!p) return;
    if (p.seat) Auth.resetMotors(p.seat);
    Players.remove(pid); Srv.sendPlayers(); Srv.sysChat(`${p.name} left the room`);
  },
  // this window just became the room host: its copy of the world becomes the real one
  promote(oldHost) {
    Players.remove(oldHost);
    for (const lp of Net.lastPlayers) {
      if (lp.id === oldHost || lp.id === Net.me || !Net.peers.has(lp.id)) { if (lp.id !== Net.me && Players.map.has(lp.id) && !Net.peers.has(lp.id)) Players.remove(lp.id); continue; }
      const p = Players.add(lp); if (p.buf.length) p.pos.copy(p.buf[p.buf.length - 1].p);
    }
    World.promote();
    for (const g of World.groups.values()) g.stun = 1;
    for (const pid of Net.clientIds()) Net.send('ws', { hostId: Net.me, rules: Rules, players: Net.playerList(), world: World.serialize(), migrated: 1, code: Net.code }, pid);
    Srv.sendPlayers();
    Srv.sysChat(`${Players.local ? Players.local.name : 'A player'} is now the host.`);
  },
  step(dt) { Sim.step(dt); },
  govern(ms, dt, hosting) { Sim.govern(ms, dt, hosting); },
  snapshot(key, hostTime) { return Sim.snapshot(key, hostTime); },
  forgetSent() { Sim.forgetSent(); },
  reset() { Sim.reset(); },
};
const NOSTR_RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.snort.social', 'wss://offchain.pub', 'wss://bucket.coracle.social'];

// Trystero logs an abrupt peer disconnect (e.g. a closed tab) as console.error; we handle it via
// onPeerLeave/host migration, so report it as info instead of an error.
{ const ce = console.error.bind(console); console.error = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('Trystero peer error')) console.info('[net] peer connection closed', a[1] && a[1].errorDetail || ''); else ce(...a); }; }
const Net = {
  online: false, isHost: true, me: 'local', hostId: 'local', rooms: [], via: new Map(), code: '', A: {}, T: null,
  peers: new Map(), lastPlayers: [], joinCounter: 0, banned: new Set(), pending: [], ready: false,
  stats: { inB: 0, outB: 0, inRate: 0, outRate: 0, snaps: 0, snapRate: 0, bodies: 0, jitter: 0, t: 0, lastSnap: 0 },
  snapT: 0, keyT: 0, inT: 0, pingT: 0, offset: null, interp: CFG.interpDelay, t0: now(), hostConfirmed: true, migrateTimer: null,
  activeThr: new Set(), link: LocalLink,
  // isHost: this window is the room host (the role). auth(): the world is simulated in this window
  auth() { return this.isHost && this.link.local; },
  hostTime() { return now() - this.t0; },
  // the host time remote objects are drawn at. It follows (local time + clock offset - interp delay) but never jumps:
  // it runs up to 15% fast or slow to catch up, and only snaps after a big change (joining, a long stall)
  renderTime() { return this.offset == null ? 0 : this.rt ?? now() + this.offset - this.interp; },
  tickClock(dt) {
    if (this.offset == null) { this.rt = null; return; }
    const target = now() + this.offset - this.interp;
    if (this.rt == null || Math.abs(target - this.rt) > 0.25) this.rt = target;
    else this.rt += dt * (1 + clamp((target - this.rt) * 4, -0.15, 0.15));
  },
  // Cloudflare TURN credentials from the site's /api/turn: players whose routers block direct connections go
  // through the relay instead of failing to join. Fetched ahead of time (see UI.init) and cached for a few hours.
  // ---- diagnostics: a join timeline + per-connection details, copied from the pause menu / Settings > Network ----
  diag: [], diagT0: 0,
  log(ev, o) { this.diag.push(Object.assign({ t: +(now() - this.diagT0).toFixed(2), ev }, o || {})); if (this.diag.length > 250) this.diag.shift(); },
  // which kinds of connection this network allows: host (LAN), srflx (direct over the internet), relay (via TURN)
  probeIce(servers) {
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, ...servers] }), n = { host: 0, srflx: 0, relay: 0, prflx: 0 }, t0 = now();
      let done = false; const fin = () => { if (done) return; done = true; this.log('ice-probe', Object.assign({ ms: Math.round((now() - t0) * 1000) }, n)); try { pc.close(); } catch (e) { } };
      pc.onicecandidate = e => { if (!e.candidate) return fin(); const m = / typ (\w+)/.exec(e.candidate.candidate); if (m && m[1] in n) n[m[1]]++; };
      pc.createDataChannel('probe'); pc.createOffer().then(o => pc.setLocalDescription(o)).catch(fin); setTimeout(fin, 6000);
    } catch (e) { this.log('ice-probe', { error: String(e && e.message || e) }); }
  },
  async report() {
    const peers = [], pcs = [];
    (this.rooms || []).forEach((r, ri) => { const m = r.getPeers ? r.getPeers() : {}; for (const [pid, pc] of Object.entries(m)) pcs.push([pid, pc, r.kind, this.via.get(pid) === ri]); });
    for (const [pid, pc, kind, used] of pcs) {
      const o = { p: pid.slice(0, 6), service: kind, used, isHost: pid === this.hostId, name: (Players.map.get(pid) || {}).name, conn: pc.connectionState, ice: pc.iceConnectionState };
      try {
        const st = await pc.getStats();
        st.forEach(s => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') { const l = st.get(s.localCandidateId), r = st.get(s.remoteCandidateId); o.via = `${l && l.candidateType}/${l && l.protocol} -> ${r && r.candidateType}/${r && r.protocol}`; o.rttMs = Math.round((s.currentRoundTripTime || 0) * 1000); } });
      } catch (e) { }
      peers.push(o);
    }
    return JSON.stringify({ game: 'v' + GAME.version, when: new Date().toISOString(), page: location.protocol === 'file:' ? 'downloaded copy' : location.host, online: this.online, isHost: this.isHost, room: this.code, relayOn: !!this.relayOn, joined: this.ready, players: Players.map.size, peers, log: this.diag }, null, 1);
  },
  async relayServers() {
    if (this._ice && now() - this._iceT < 3 * 3600) return this._ice;
    if (this._iceP) return this._iceP;
    this._iceP = (async () => {
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(GAME.discord ? '/api/turn' : GAME.site + 'api/turn', { signal: ctl.signal, cache: 'no-store' }); clearTimeout(to);
        const j = r.ok ? await r.json() : null, list = j && Array.isArray(j.iceServers) ? j.iceServers.filter(s => s && s.urls) : [];
        if (list.length) { this._ice = list; this._iceT = now(); }
        return list;
      } catch (e) { return []; } finally { this._iceP = null; }
    })();
    return this._iceP;
  },
  // Finding each other (signaling) runs on two services at once: public Nostr relays, and our Supabase project's
  // realtime channel (GAME.supa). Some networks block Nostr; whichever service connects two players first wins.
  async libs() {
    if (this._libs) return this._libs;
    await DiscordAct.boot();
    const tryImport = (spec, ms) => Promise.race([import(spec), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    const [nostr, supa] = await Promise.allSettled([GAME.discord ? Promise.reject(new Error('Nostr relays are unreachable from Discord')) : tryImport('trystero', 15000), GAME.supa ? tryImport('trystero/supabase', 15000) : Promise.reject(new Error('off'))]);
    const out = [];
    if (nostr.status === 'fulfilled') out.push({ kind: 'nostr', T: nostr.value });
    if (supa.status === 'fulfilled' && (!out.length || supa.value.selfId === out[0].T.selfId)) out.push({ kind: 'supabase', T: supa.value });
    if (!out.length) throw new Error('Could not load networking library (offline?)');
    return (this._libs = out);
  },
  // ---- lifecycle ----------------------------------------------------------------
  startOffline() { this.online = false; this.isHost = true; this.me = 'local'; this.hostId = 'local'; this.code = 'SOLO'; this.ready = true; },
  async start(code, asHost) {
    const [L, relay] = await Promise.all([this.libs(), this.relayServers()]);
    this.me = L[0].T.selfId; this.relayOn = relay.length > 0; this.gotHost = false;
    this.diag = []; this.diagT0 = now(); this.errT = 0;
    this.log('start', { asHost, room: code, via: L.map(l => l.kind).join('+'), relayServers: relay.length, ua: navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90) });
    this.probeIce(relay); this.code = code; this.isHost = asHost; this.hostId = asHost ? this.me : null; this.online = true; this.ready = asHost;
    this.peers.clear(); this.pending = []; this.banned.clear(); this.offset = this.rt = null; this.joinCounter = 0; this.hostConfirmed = true;
    const turn = relay.slice();
    if (Settings.turnUrl) turn.push({ urls: Settings.turnUrl.split(',').map(s => s.trim()).filter(Boolean), username: Settings.turnUser || undefined, credential: Settings.turnPass || undefined });
    const relays = (Settings.relays || '').split(',').map(x => x.trim()).filter(Boolean);
    const H = {
      hi: (d, pid) => this.onHi(pid, typeof d === 'string' ? JSON.parse(d) : d),
      ev: (d, pid) => this.onEv(pid, typeof d === 'string' ? JSON.parse(d) : d),
      ws: (d, pid) => this.onWorldState(pid, typeof d === 'string' ? JSON.parse(d) : d),
      in: (d, pid) => { if (!this.isHost) return; if (Players.map.has(pid) && !this.banned.has(pid)) this.link.input(pid, typeof d === 'string' ? JSON.parse(d) : d); },
      st: (d, pid) => { if (!this.isHost && pid === this.hostId) this.onSnap(d); },
    };
    this.rooms = []; this.via = new Map(); this.A = {};
    L.forEach(({ kind, T }, i) => {
      const cfg = kind === 'supabase' ? { appId: GAME.supa.url, relayConfig: { supabaseKey: GAME.supa.key } }
        : { appId: GAME.appId, relayConfig: Object.assign({ warnOnRelayFailure: false }, relays[0] !== 'default' ? { urls: relays.length ? relays : NOSTR_RELAYS } : {}) };
      if (turn.length) cfg.turnConfig = turn;
      let room;
      try { room = T.joinRoom(cfg, 'tw-room-' + code, { onJoinError: e => this.onJoinErr(e, kind) }); }
      catch (e) { this.log('room-fail', { via: kind, err: String(e && e.message || e) }); return; }
      room.kind = kind; const ri = this.rooms.push(room) - 1;
      // a message is sent once, on the service that player is connected through; accept it from any service
      for (const [name, fn] of Object.entries(H)) {
        const act = room.makeAction(name);
        act.onMessage = (data, meta) => { const pid = meta && meta.peerId; this.countIn(data); try { fn(data, pid); } catch (err) { console.warn('net handler', name, err); } };
        (this.A[name] || (this.A[name] = []))[ri] = act;
      }
      room.onPeerJoin = pid => {
        if (this.via.has(pid)) { this.log('peer-also', { p: pid.slice(0, 6), via: kind }); return; }       // already connected through the other service
        this.via.set(pid, ri); this.log('peer-connected', { p: pid.slice(0, 6), via: kind });
        this.peers.set(pid, { ping: 0 }); this.send('hi', this.hello(), pid);
      };
      room.onPeerLeave = pid => {
        if (this.via.get(pid) !== ri) return;
        const alt = this.rooms.findIndex((r, j) => j !== ri && r.getPeers && r.getPeers()[pid]);
        if (alt >= 0) { this.via.set(pid, alt); this.log('peer-switched', { p: pid.slice(0, 6), to: this.rooms[alt].kind }); return; }   // still reachable the other way
        this.via.delete(pid); this.log('peer-left', { p: pid.slice(0, 6), via: kind }); this.onPeerLeave(pid);
      };
    });
    if (!this.rooms.length) { this.online = false; throw new Error('could not open the room'); }
    // record whether the public relays actually connected (some networks block them)
    setTimeout(() => {
      const nl = L.find(l => l.kind === 'nostr'), socks = nl && nl.T.getRelaySockets ? nl.T.getRelaySockets() : null;
      if (socks) this.log('nostr-relays', Object.fromEntries(Object.entries(socks).map(([u, ws]) => [u.replace(/^wss:\/\//, ''), ['connecting', 'open', 'closing', 'closed'][ws && ws.readyState] || '?'])));
    }, 4000);
  },
  onJoinErr(e, kind) {
    const pid = e && e.peerId; this.log('conn-fail', { p: pid ? pid.slice(0, 6) : '?', via: kind, toHost: pid === this.hostId, err: e && e.error });
    if (Game.state !== 'playing' || now() - this.errT < 20 || (pid && this.via.has(pid))) return;   // fine if the other service got through
    // client <-> client links don't matter for play (everything goes through the host), so stay quiet about those
    if (this.isHost) { this.errT = now(); UI.toast('Someone is trying to join but their connection keeps failing. Retrying…'); }
    else if (pid === this.hostId) { this.errT = now(); UI.toast('Connection to the host dropped. Retrying…'); }
  },
  leave() {
    if (this.migrateTimer) { clearTimeout(this.migrateTimer); this.migrateTimer = null; }
    if (Online.listed) Online.listRoom(null);
    for (const r of this.rooms || []) { try { r.leave(); } catch (e) { } }
    this.rooms = []; if (this.via) this.via.clear(); this.online = false; this.isHost = true; this.hostId = this.me = 'local'; this.peers.clear(); this.ready = false;
  },
  hello() { return { name: Settings.name, color: Settings.color, tier: R.tier, host: this.isHost, v: GAME.version, lvl: Prog.level().l }; },
  // ---- sending --------------------------------------------------------------------
  countIn(d) { this.stats.inB += typeof d === 'string' ? d.length : (d && d.byteLength) || 64; },
  send(action, data, target) {
    if (!this.online || !this.rooms || !this.rooms.length) return;
    const payload = (data instanceof ArrayBuffer) ? data : JSON.stringify(data, (k, v) => (k === 'j' || (k === 'vis' && v && typeof v === 'object')) ? undefined : v);   // drop joint handles + rope meshes, keep entity model names
    const ids = target ? (Array.isArray(target) ? target : [target]) : [...this.via.keys()], by = new Map();
    for (const id of ids) { const ri = this.via.get(id); if (ri === undefined) continue; if (!by.has(ri)) by.set(ri, []); by.get(ri).push(id); }
    this.stats.outB += (typeof payload === 'string' ? payload.length : payload.byteLength) * ids.length;
    for (const [ri, list] of by) { try { const r = this.A[action][ri].send(payload, { target: list }); if (r && r.catch) r.catch(() => { }); } catch (e) { } }
  },
  clientIds() { return [...this.peers.keys()].filter(id => Players.map.has(id) && !this.banned.has(id)); },
  bcast(m) { if (this.online && this.isHost) { const ids = this.clientIds(); if (ids.length) this.send('ev', m, ids); } },
  bcastAll(m) { this.onEv(this.me, m, true); this.bcast(m); },
  bcastExcept(pid, m) {
    if (pid !== this.me) this.onEv(this.me, m, true);
    if (this.online && this.isHost) { const ids = this.clientIds().filter(id => id !== pid); if (ids.length) this.send('ev', m, ids); }
  },
  sendTo(pid, m) { if (pid === this.me) this.onEv(this.me, m, true); else if (this.online) this.send('ev', m, pid); },
  toHost(m) { if (this.isHost) this.link.request(this.me, m); else if (this.hostId) this.send('ev', m, this.hostId); },
  notify(pid, text) { this.sendTo(pid, { t: 'note', text }); },
  sysChat(text, cls) { this.bcastAll({ t: 'chat', sys: 1, cls: cls || 'sys', text }); },
  playerList() {
    return [...Players.map.values()].map(p => ({ id: p.id, name: p.name, color: p.color, tier: p.tier, idx: p.idx, joinOrder: p.joinOrder, kills: p.kills, deaths: p.deaths, canEdit: p.canEdit, muted: p.muted, lvl: p.lvl || 1, team: p.team || null, disg: p.disg || null }));
  },
  sendPlayers() { this.bcastAll({ t: 'pl', list: this.playerList(), host: this.me }); if (this.isHost) Online.updateRoom(); },
  sendRules() { this.bcastAll({ t: 'rules', rules: Rules }); if (this.isHost) Online.updateRoom(); },
  // ---- peers ------------------------------------------------------------------------
  onHi(pid, d) {
    const peer = this.peers.get(pid) || {}; peer.hello = d; this.peers.set(pid, peer);
    this.log('hello', { p: pid.slice(0, 6), name: String(d.name || '').slice(0, 18), host: !!d.host, v: d.v });
    if (this.isHost) {
      if (this.banned.has(pid)) { this.send('ev', { t: 'kick' }, pid); return; }
      if (d.v && d.v !== GAME.version) {
        this.send('ev', { t: 'ver', v: GAME.version }, pid);
        if (newerVer(d.v, GAME.version)) UI.chat({ sys: 1, text: `${String(d.name || 'A player').slice(0, 18)} tried to join with a newer version (v${d.v}). Update the game (reload the page), then create the room again.` });
        return;
      }
      if (Players.map.has(pid)) return;
      if (Players.map.size >= CFG.maxPlayers) { this.send('ev', { t: 'full' }, pid); return; }
      this.link.join(pid, d, ++this.joinCounter);
    } else if (d.host) {
      this.gotHost = true;
      if (!this.hostId || !this.hostConfirmed) { this.hostId = pid; }
    }
  },
  onPeerLeave(pid) {
    this.peers.delete(pid);
    if (this.isHost) this.link.leave(pid);
    else if (pid === this.hostId) this.migrate(pid);
  },
  // ---- host migration -----------------------------------------------------------
  migrate(oldHost) {
    const old = this.lastPlayers.find(p => p.id === oldHost);
    const cands = this.lastPlayers.filter(p => p.id !== oldHost && (p.id === this.me || this.peers.has(p.id))).sort((a, b) => a.joinOrder - b.joinOrder);
    UI.chat({ sys: 1, text: `Host ${old ? old.name : ''} left — migrating host…` });
    Game.autosave();
    if (!cands.length || cands[0].id === this.me) return this.promote(oldHost);
    this.hostId = cands[0].id; this.hostConfirmed = false;
    if (this.migrateTimer) clearTimeout(this.migrateTimer);
    this.migrateTimer = setTimeout(() => { if (!this.hostConfirmed) UI.showHostLeft(); }, 10000);
  },
  promote(oldHost) {
    this.isHost = true; this.hostId = this.me; this.hostConfirmed = true;
    this.joinCounter = Math.max(0, ...this.lastPlayers.map(p => p.joinOrder || 0));
    this.link.promote(oldHost);
    Online.updateRoom();
    UI.refreshRoom();
  },
  // ---- world state & events ---------------------------------------------------------
  onWorldState(pid, s) {
    if (this.auth()) return;
    this.log('world', { p: pid.slice(0, 6), ents: s.world && s.world.ents ? s.world.ents.length : 0, migrated: !!s.migrated });
    if (this.hostId && pid !== this.hostId && !(s.migrated && s.hostId === pid)) return;
    this.hostId = pid; this.hostConfirmed = true;
    if (this.migrateTimer) { clearTimeout(this.migrateTimer); this.migrateTimer = null; }
    Object.assign(Rules, s.rules || {});
    World.load(s.world);
    for (const e of World.ents.values()) e.buf.length = 0;
    this.applyPlayers(s.players || []);
    this.offset = this.rt = null;
    const first = !this.ready; this.ready = true;
    if (first) Game.enterPlay(s.you && s.you.spawn ? new V3().fromArray(s.you.spawn) : null);
    else if (s.migrated) UI.chat({ sys: 1, text: 'New host. World resynced.' });
    const q = this.pending; this.pending = []; for (const [f, m] of q) this.onEv(f, m);
    UI.refreshRoom();
  },
  onEv(from, m, local) {
    if (!m || !m.t) return;
    if (this.isHost && !local) { if (!this.banned.has(from)) this.link.request(from, m); return; }
    if (!local && from !== this.hostId) { if (m.t === 'kick' && from === this.hostId) Game.kicked(); return; }
    if (!this.ready && !local) { this.pending.push([from, m]); return; }
    const me = Players.local;
    switch (m.t) {
      case 'add': applyAdd(m); break;
      case 'rem': applyRem(m); break;
      case 'upd': if (m.list) for (const [id, pt] of m.list) World.patch(id, pt); else World.patch(m.e, m.patch); break;
      case 'grp': { const g = World.groups.get(m.id); if (g) Object.assign(g, m.patch); break; }
      case 'pl': this.applyPlayers(m.list); Owner.hello(); break;
      case 'ownerChal': Owner.onChal(m.n); break;
      case 'ownerOk': Owner.onOk(); break;
      case 'rules': Object.assign(Rules, m.rules); UI.refreshTool(); UI.refreshRoom(); if (!canEdit(me) && Editor.active) Editor.toggle(false); break;
      case 'chat': UI.chat(m); break;
      case 'note': UI.toast(m.text); break;
      case 'fx': FX.remote(m); break;
      case 'vs': Vehicles.recv(m); break;
      case 'tp': Game.teleport(new V3().fromArray(m.p), m.respawn); break;
      case 'xp': Prog.onXp(m); break;
      case 'kb': if (me && !me.noclip) { me.kb = new V3().fromArray(m.v); me.grounded = false; } break;
      case 'hurt': if (me) { me.hp = m.hp; UI.damageFlash(m.f); } break;
      case 'hm': UI.hitmarker(); break;
      case 'dn': DmgNum.add(m); UI.hitmarker(m.k ? 'kill' : m.h ? 'head' : ''); break;
      case 'bots': Bots.recv(m.b); break;
      case 'seat': { const p = Players.map.get(m.pid); if (p) { p.seat = m.e; if (p.isLocal) Game.onSeat(m.e); } break; }
      case 'kill': UI.killfeed(m); if (m.v === this.me && me) { me.dead = true; me.hp = 0; Audio.play('death_m', 0.8); } break;
      case 'kick': Game.kicked(); break;
      case 'full': Game.roomFull(); break;
      case 'ver': Game.versionMismatch(m.v); break;
      case 'clear': break;
    }
  },
  applyPlayers(list) {
    this.lastPlayers = list;
    if (!this.auth()) {
      const ids = new Set(list.map(p => p.id));
      for (const id of [...Players.map.keys()]) if (!ids.has(id) && id !== this.me) Players.remove(id);
      for (const e of list) { const p = Players.add(Object.assign({}, e, { isLocal: e.id === this.me })); p.canEdit = !!e.canEdit; p.muted = !!e.muted; }
    }
    for (const p of Players.map.values()) PlayerView.updatePlate(p, true);
    UI.refreshRoom(); UI.refreshScoreboard();
  },
  // ---- snapshots ------------------------------------------------------------------------
  onSnap(buf) {
    if (!this.ready || !buf) return;
    const dv = buf instanceof ArrayBuffer ? new DataView(buf) : ArrayBuffer.isView(buf) ? new DataView(buf.buffer, buf.byteOffset, buf.byteLength) : null;
    if (!dv || dv.byteLength < 16) return; let o = 0;
    if (dv.getUint8(o) !== 1) return; o += 4;
    const t = dv.getFloat64(o); o += 8;
    const nb = dv.getUint16(o); o += 2; const np = dv.getUint8(o); o++; const nt = dv.getUint8(o); o++;
    const sample = t - now();
    if (this.offset == null) this.offset = sample;
    else { const dev = sample - this.offset; this.stats.jitter = this.stats.jitter * 0.9 + Math.abs(dev) * 0.1; this.offset += dev > 0 ? dev * 0.3 : dev * 0.02; }
    this.interp = clamp(0.07 + this.stats.jitter * 2.5, 0.08, 0.3);
    this.stats.snaps++; this.stats.bodies = nb;
    for (let i = 0; i < nb; i++) {
      const id = dv.getUint16(o); o += 2;
      const p = new V3(dv.getInt16(o) / 100, dv.getInt16(o + 2) / 100, dv.getInt16(o + 4) / 100); o += 6;
      const q = unpackQuat(dv.getUint32(o), new QT()); o += 4;
      const e = World.ents.get(id); if (e && e.d.k !== 'map') pushSample(e.buf, t, p, q);
    }
    for (let i = 0; i < np; i++) {
      const idx = dv.getUint8(o); o++;
      const pos = new V3(dv.getInt16(o) / 100, dv.getInt16(o + 2) / 100, dv.getInt16(o + 4) / 100); o += 6;
      const yaw = dv.getInt16(o) / 10000, pitch = dv.getInt16(o + 2) / 10000; o += 4;
      const hp = dv.getUint8(o); o++; const fl = dv.getUint8(o); o++; const w = dv.getUint8(o); o++; const ping = dv.getUint16(o); o += 2;
      const be = new V3(dv.getInt16(o) / 100, dv.getInt16(o + 2) / 100, dv.getInt16(o + 4) / 100); o += 6;
      const p = Players.byIdx(idx); if (!p) continue;
      p.hp = hp; p.ping = ping;
      const wasDead = p.dead; p.dead = !!(fl & 1); p.prot = !!(fl & 64);
      if (p.isLocal) { if (wasDead && !p.dead) UI.hideDeath(); if (!wasDead && p.dead) UI.showDeath(); continue; }
      p.crouch = !!(fl & 4); p.noclip = !!(fl & 8); p.firing = !!(fl & 32); p.weapon = (WEAPONS[w] || WEAPONS[0]).id;
      p.beamEnd = (fl & 16) ? be : null;
      _q1.setFromAxisAngle(UP, yaw);
      pushSample(p.buf, t, pos, _q1.clone()); p.yaw = yaw; p.pitch = pitch;
    }
    this.activeThr.clear();
    for (let i = 0; i < nt; i++) { this.activeThr.add(dv.getUint16(o) + ':' + dv.getUint8(o + 2)); o += 3; }
  },
  // ---- per-frame --------------------------------------------------------------------------
  update(dt) {
    const s = this.stats; s.t += dt;
    if (s.t >= 1) { s.inRate = s.inB / s.t; s.outRate = s.outB / s.t; s.snapRate = s.snaps / s.t; s.inB = s.outB = s.snaps = 0; s.t = 0; }
    if (!this.online || !this.ready) return;
    if (!this.auth()) this.tickClock(dt);
    if (this.isHost) {
      this.snapT -= dt; this.keyT -= dt;
      if (this.snapT <= 0) {
        this.snapT += 1 / CFG.snapRate; if (this.snapT < 0) this.snapT = 0;
        const key = this.keyT <= 0; if (key) this.keyT = CFG.keyframeEvery;
        if (this.clientIds().length) this.send('st', this.link.snapshot(key, this.hostTime()), this.clientIds());
        else this.link.forgetSent();
      }
    } else {
      this.inT -= dt;
      if (this.inT <= 0) {
        this.inT += 1 / CFG.inputRate; if (this.inT < 0) this.inT = 0;
        // standing still sends nothing new: skip repeats, but keep a 4/s heartbeat (rotation deltas are always sent, they are used up)
        const inp = Game.buildInput(), s = inp && JSON.stringify(inp);
        if (inp && (inp.rd || s !== this.lastIn || now() - this.lastInT > 0.25)) { this.lastIn = s; this.lastInT = now(); this.send('in', inp, this.hostId); }
      }
    }
    this.pingT -= dt;
    if (this.pingT <= 0) {
      this.pingT = 2;
      const targets = this.isHost ? this.clientIds() : (this.hostId && this.peers.has(this.hostId) ? [this.hostId] : []);
      for (const pid of targets) { const r = this.rooms && this.rooms[this.via.get(pid)]; if (!r) continue; r.ping(pid).then(ms => {
        if (this.isHost) { const p = Players.map.get(pid); if (p) p.ping = ms; }
        else { const me = Players.local; if (me) me.ping = ms; }
      }).catch(() => { }); }
    }
  },
};

/* ============================================================================
   Online services on the game's Supabase project: the public room list (live presence: a room shows while its
   host is in it) and community addons (dupes / worlds in the `addons` table; slur filter enforced by the server,
   mirrored here so people get told straight away).
   ========================================================================== */
const BAD_LONG = /(n+i+g+g+(e+r+|a+|u+h+)|f+a+g+g*o+t+|w+e+t+b+a+c+k+|r+a+g+h+e+a+d+|t+o+w+e+l+h+e+a+d+|b+e+a+n+e+r+|k+i+k+e+s?$|t+r+a+n+n+(y|i+e+))/;
const BAD_SHORT = /(^|[^a-z])(fags?|spics?|coons?|pakis?|gooks?|dykes?|chinks?|kikes?|retards?|retarded)($|[^a-z])/;
function cleanText(t) {
  const s = String(t || '').toLowerCase().replace(/[013457@$!|]/g, c => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', '$': 's', '!': 'i', '|': 'i' }[c]));
  return !BAD_LONG.test(s.replace(/[^a-z]/g, '')) && !BAD_SHORT.test(s);
}
/* ============================================================================
   Discord Activity: everyone who launches the game in the same voice channel lands in the same room.
   The room code comes from Discord's instance id; a presence channel on Supabase picks who hosts
   (whoever arrived first) and tells late arrivals there is a host to join.
   Developer Portal URL mappings needed: "/" -> the site, "/supabase" -> the Supabase project host.
   ========================================================================== */
const modeLabel = (m = Rules.mode) => ({ nextbot: 'Nextbot chase', zombies: 'Zombie survival', prophunt: 'Prop hunt' })[m] || 'Sandbox';
const DiscordAct = {
  sdk: null, _p: null, ch: null, busy: false,
  boot() {
    if (!GAME.discord) return Promise.resolve(null);
    return this._p || (this._p = (async () => {
      const { DiscordSDK, patchUrlMappings } = await import('@discord/embedded-app-sdk');
      patchUrlMappings([{ prefix: '/supabase', target: new URL(GAME.supa.url).host }]);   // fetch + WebSocket go through Discord's proxy
      this.sdk = new DiscordSDK(GAME.discord.clientId);
      await this.sdk.ready();
      return this.sdk;
    })().catch(e => { console.warn('Discord SDK', e); return null; }));
  },
  code() {   // the same 6-character room code for everyone in this Activity instance
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let h = 2166136261, s = '';
    for (const c of GAME.discord.instance) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    for (let i = 0; i < 6; i++) { h = Math.imul(h ^ (h >>> 15), 2246822507) ^ i; s += A[(h >>> 0) % A.length]; }
    return s;
  },
  async start() {
    if (this.busy || Game.state !== 'lobby') return; this.busy = true;
    const code = this.code(), since = this._since || (this._since = Date.now()), k = Online.key;
    UI.lobbyStatus('Joining the game in your voice channel…');
    try {
      const c = await Online.client();
      if (!this.ch) {
        const ch = this.ch = c.channel('tw-di-' + code, { config: { presence: { key: k } } });
        await new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error('matchmaking did not answer')), 12000);
          ch.subscribe(st => { if (st === 'SUBSCRIBED') { clearTimeout(t); res(); } });
        });
        setInterval(() => this.track(code), 4000);   // keep "who hosts" current, also after a host migration
      }
      await this.ch.track({ k, since, hosting: false });
      const members = () => Object.values(this.ch.presenceState()).flat().filter(m => m && m.k);
      const t0 = now();
      await new Promise(r => setTimeout(r, 1500));   // let presence sync
      for (;;) {
        const ms = members();
        if (ms.some(m => m.hosting && m.k !== k)) { this.busy = false; return Game.joinRoom(code); }
        const first = ms.sort((a, b) => a.since - b.since || (a.k < b.k ? -1 : 1))[0];
        if (!first || first.k === k || now() - t0 > 12) break;   // we arrived first (or nobody stepped up): host it
        await new Promise(r => setTimeout(r, 500));
      }
      await Game.createRoom(code);
      this.track(code);
    } catch (e) {
      UI.lobbyStatus('Could not set up the voice channel game (' + (e.message || e) + '). Press Play to try again.', true);
    }
    this.busy = false;
  },
  track(code) { if (this.ch) this.ch.track({ k: Online.key, since: this._since || (this._since = Date.now()), hosting: Net.online && Net.isHost && Net.code === code }).catch(() => { }); },
};
const Online = {
  sb: null, lobby: null, rooms: new Map(), key: Math.random().toString(36).slice(2, 10), listed: null, onRooms: null, trackT: null,
  async client() {
    if (!GAME.supa) throw new Error('Online features are off in this copy');
    await DiscordAct.boot();
    if (!this.sb) { const { createClient } = await import('@supabase/supabase-js'); this.sb = createClient(GAME.supa.url, GAME.supa.key, { auth: { persistSession: true, storageKey: 'tw-auth', autoRefreshToken: true, detectSessionInUrl: true } }); }
    return this.sb;
  },
  async watchRooms() {
    if (this.lobby) return;
    try {
      const c = await this.client(), ch = this.lobby = c.channel('tw-lobby', { config: { presence: { key: this.key } } });
      ch.on('presence', { event: 'sync' }, () => {
        const st = ch.presenceState(); this.rooms.clear();
        for (const k in st) for (const m of st[k]) if (m && /^[A-Z0-9]{6}$/.test(m.code || '')) this.rooms.set(m.code, m);
        if (this.onRooms) this.onRooms();
      });
      ch.subscribe(st => { this.live = st === 'SUBSCRIBED'; if (this.onRooms) this.onRooms(); if (st === 'SUBSCRIBED' && this.listed) ch.track(this.listed).catch(() => { }); });
    } catch (e) { this.lobby = null; }
  },
  // host: put the room in the list (or take it out with null); rapid changes are batched
  listRoom(info) {
    this.listed = info; clearTimeout(this.trackT);
    this.trackT = setTimeout(async () => { await this.watchRooms(); const ch = this.lobby; if (!ch) return; try { if (this.listed) await ch.track(this.listed); else await ch.untrack(); } catch (e) { } }, info ? 400 : 0);
  },
  roomInfo() {
    if (!Net.online || !Net.isHost || !Settings.publicRoom || GAME.discord) return null;   // Activity rooms stay private to the voice channel
    return { code: Net.code, host: String(Settings.name || 'Player').slice(0, 18), n: Players.map.size, max: CFG.maxPlayers, map: (THEMES[Rules.env] || {}).label || '', mode: modeLabel(), v: GAME.version };
  },
  updateRoom() { this.listRoom(this.roomInfo()); },
  async addons(q, sort) {
    const c = await this.client();
    let r = c.from('addons').select('id,name,author,description,kind,objects,downloads,game_version,created_at').limit(60);
    if (q) r = r.ilike('name', '%' + q.replace(/[%_,()]/g, '') + '%');
    r = sort === 'popular' ? r.order('downloads', { ascending: false }) : r.order('created_at', { ascending: false });
    const { data, error } = await r; if (error) throw error; return data || [];
  },
  async addonData(id) {
    const c = await this.client(), { data, error } = await c.from('addons').select('data,name,kind').eq('id', id).single(); if (error) throw error;
    c.rpc('addon_downloaded', { addon_id: id }).then(() => { }, () => { });
    return data;
  },
  async upload(a) {
    const c = await this.client(), { error } = await c.from('addons').insert(a);
    if (error) throw new Error(/row-level security/i.test(error.message) ? 'That name, author or description isn\'t allowed.' : error.message);
  },
};

