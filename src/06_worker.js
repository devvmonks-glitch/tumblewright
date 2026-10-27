/* ============================================================================
   THE SIMULATION WORKER: what this module does when it runs inside the host's worker (TW_WORKER, set by the loader's
   stand-in, window.TWWorker). Nothing is drawn here: View keeps its no-op hooks, Srv posts to the window, and Sim
   runs on the worker's own clock, so the page's frames never wait for physics.
   Window -> worker messages: init, session, join, leave, req, input, run, stats, probe.
   Worker -> window: boot, ready, out (what the simulation says to players: to = a player id, 'all', or except), stats.
   ========================================================================== */
// Srv inside the worker: the same calls, posted to the window, which delivers them (to its own player and the others)
const WorkerSrv = {
  auth() { return true; }, isHost() { return true; }, online() { return SimWorker.online; }, hostId() { return SimWorker.hostId; },
  bcast(m) { SimWorker.out('all', m); }, bcastAll(m) { SimWorker.out('all', m); }, bcastExcept(pid, m) { SimWorker.out({ except: pid }, m); },
  sendTo(pid, m) { SimWorker.out(pid, m); }, notify(pid, text) { this.sendTo(pid, { t: 'note', text }); },
  sysChat(text, cls) { this.bcastAll({ t: 'chat', sys: 1, cls: cls || 'sys', text }); },
  sendPlayers() { this.bcastAll({ t: 'pl', list: Net.playerList(), host: SimWorker.hostId }); },
  sendRules() { this.bcastAll({ t: 'rules', rules: Rules }); },
  sendWorld() { SimWorker.post({ t: 'world', rules: Rules, players: Net.playerList(), world: World.serialize() }); },
  ban(pid) { SimWorker.post({ t: 'ban', pid }); },
  award(pid, kind, n) {
    const p = Players.map.get(String(pid).replace(/^p:/, '')); if (!p) return;
    this.sendTo(p.id, { t: 'xp', k: kind, n: n || 0 });
  },
};
const SimWorker = {
  online: false, hostId: 'host', timer: 0, last: 0, acc: 0, steps: 0, stepMs: 0,
  boot() {
    Object.assign(View, VIEW_NONE); Object.assign(Srv, WorkerSrv);
    self.onmessage = e => this.recv(e.data);
    this.post({ t: 'boot' });
  },
  post(m, transfer) { self.postMessage(m, transfer || []); },
  out(to, m) { this.post({ t: 'out', to, m }); },
  async recv(m) {
    switch (m.t) {
      case 'init': await Phys.init(); Players.init(); this.post({ t: 'ready' }); break;
      // a fresh world for a room (or a solo game): who hosts, whether others can join, the rules and map
      case 'session': this.run(false); Sim.reset(); this.online = !!m.online; this.hostId = m.hostId || 'host'; Object.assign(Rules, m.rules || {}); Env.update(); break;
      case 'join': { const p = Players.add(Object.assign({}, m.p, { isLocal: false })); if (m.pos) Players.setPos(p, new V3().fromArray(m.pos)); break; }
      case 'leave': Players.remove(m.pid); break;
      case 'req': Auth.handle(m.pid, m.m); break;
      case 'input': { const p = Players.map.get(m.pid); if (p) Auth.onInput(p, m.inp); break; }
      case 'run': this.run(!!m.on); break;
      case 'stats': this.post(this.stats()); break;
      // tests: where every entity is
      case 'probe': this.post({ t: 'probe', ents: [...World.ents.values()].filter(e => e.body && e.d.k !== 'map').map(e => { const t = e.body.translation(); return [e.id, t.x, t.y, t.z, e.body.isSleeping() ? 1 : 0]; }) }); break;
    }
  },
  // the worker's clock: fixed steps against real time, the same catch-up limit and governor as the page's loop
  run(on) {
    clearInterval(this.timer); this.timer = 0; if (!on) return;
    this.last = performance.now(); this.acc = 0;
    this.timer = setInterval(() => this.tick(), 4);
  },
  tick() {
    const t = performance.now(), dt = Math.min(0.25, (t - this.last) / 1000); this.last = t; this.acc += dt;
    const sdt = Sim.stepDt, maxN = sdt > 1 / 45 ? 2 : 3; let n = 0;
    while (this.acc >= sdt && n < maxN) { Sim.step(sdt); this.acc -= sdt; n++; }
    if (n === maxN) this.acc = Math.min(this.acc, sdt);   // can't keep up: drop the backlog (the world runs slow) rather than spiral
    const ms = performance.now() - t; this.steps += n; this.stepMs += ms;
    Sim.govern(ms, dt, true);
  },
  stats() {
    let awake = 0; for (const e of World.ents.values()) if (e.body && e.body.isDynamic() && !e.body.isSleeping()) awake++;
    const s = { t: 'stats', steps: this.steps, msPerStep: this.steps ? this.stepMs / this.steps : 0, stepHz: Math.round(1 / Sim.stepDt), physLvl: Sim.physLvl, load: Sim.physLoad, ents: World.ents.size, awake, players: Players.map.size };
    this.steps = 0; this.stepMs = 0; return s;
  },
};
