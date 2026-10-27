/* ============================================================================
   THE SIMULATION WORKER: what this module does when it runs inside the host's worker (TW_WORKER, set by the loader's
   stand-in, window.TWWorker). Nothing is drawn here: View keeps its no-op hooks, Srv posts to the window, and Sim
   runs on the worker's own clock, so the page's frames never wait for physics.
   Window -> worker:
     init                                  load physics; answered with ready
     session {hostId, online, code, epoch, rules, world?}   a fresh room (or solo game); epoch: the window's clock zero
     join {pid, d, joinOrder, pos?}        a player the window let in (bans, version and room size are checked there)
     leave {pid}   req {pid, m}   input {pid, inp}
     clients {n}                           how many players the window sends snapshots to (0: start the stream over)
     run {on}   serialize {id}   stats   probe (tests)
   Worker -> window:
     boot, ready
     out {to, m}         what the simulation says to players: to = a player id, 'all', or {except: id}
     ws {to, payload}    the whole world for one player who just joined
     world {payload}     the whole world again, for everyone (the host loaded a world)
     ban {pid}
     snap {net, key, buf}   net 0: a full picture after every simulated tick, for the window's own view;
                            net 1: the clients' stream at CFG.snapRate (deltas, keyframes every CFG.keyframeEvery)
     saved {id, world, rules}   stats {...} (also about once a second while running)
   ========================================================================== */
// Srv inside the worker: the same calls, posted to the window, which delivers them (to its own player and the others)
const WorkerSrv = {
  auth() { return true; }, isHost() { return true; }, online() { return SimWorker.online; }, hostId() { return SimWorker.hostId; },
  bcast(m) { SimWorker.out('all', m); }, bcastAll(m) { SimWorker.out('all', m); }, bcastExcept(pid, m) { SimWorker.out({ except: pid }, m); },
  sendTo(pid, m) { SimWorker.out(pid, m); }, notify(pid, text) { this.sendTo(pid, { t: 'note', text }); },
  sysChat(text, cls) { this.bcastAll({ t: 'chat', sys: 1, cls: cls || 'sys', text }); },
  sendPlayers() { this.bcastAll({ t: 'pl', list: Players.list(), host: SimWorker.hostId }); },
  sendRules() { this.bcastAll({ t: 'rules', rules: Rules }); },
  welcome(pid, spawn) { SimWorker.post({ t: 'ws', to: pid, payload: Object.assign(SimWorker.worldMsg(), { you: { spawn } }) }); },
  sendWorld() { SimWorker.post({ t: 'world', payload: SimWorker.worldMsg() }); },
  ban(pid) { SimWorker.post({ t: 'ban', pid }); },
  award(pid, kind, n) {
    const p = Players.map.get(String(pid).replace(/^p:/, '')); if (!p) return;
    this.sendTo(p.id, { t: 'xp', k: kind, n: n || 0 });
  },
};
const SimWorker = {
  online: false, hostId: 'host', code: '', epoch: 0, clients: 0, timer: 0, last: 0, acc: 0, steps: 0, stepMs: 0,
  snapT: 0, keyT: 0, statT: 0,
  boot() {
    Object.assign(View, VIEW_NONE); Object.assign(Srv, WorkerSrv);
    self.onmessage = e => this.recv(e.data);
    this.post({ t: 'boot' });
  },
  post(m, transfer) { self.postMessage(m, transfer || []); },
  out(to, m) { this.post({ t: 'out', to, m }); },
  worldMsg() { return { hostId: this.hostId, rules: Rules, players: Players.list(), world: World.serialize(), code: this.code }; },
  // the room's clock as the window counts it (Net.hostTime): seconds since the window's t0
  hostTime() { return (performance.timeOrigin + performance.now()) / 1000 - this.epoch; },
  async recv(m) {
    switch (m.t) {
      case 'init': await Phys.init(); Players.init(); this.post({ t: 'ready' }); break;
      case 'session':
        this.run(false); Sim.reset();
        this.online = !!m.online; this.hostId = m.hostId || 'host'; this.code = m.code || ''; this.clients = 0;
        this.epoch = m.epoch != null ? m.epoch : (performance.timeOrigin + performance.now()) / 1000;
        Object.assign(Rules, m.rules || {}); Env.update();
        if (m.world && World.validWorld(m.world)) World.load(m.world);
        break;
      case 'join': { const p = Auth.addPlayer(m.pid, m.d || {}, m.joinOrder | 0); if (m.pos) Players.setPos(p, new V3().fromArray(m.pos)); break; }
      case 'leave': Auth.removePlayer(m.pid); break;
      case 'req': Auth.handle(m.pid, m.m); break;
      case 'input': { const p = Players.map.get(m.pid); if (p) Auth.onInput(p, m.inp); break; }
      case 'clients': this.clients = m.n | 0; if (!this.clients) Sim.forgetSent(); break;
      case 'run': this.run(!!m.on); break;
      case 'serialize': this.post({ t: 'saved', id: m.id, world: World.serialize(), rules: Rules }); break;
      case 'stats': this.post(this.stats()); break;
      // tests: where every entity is
      case 'probe': this.post({ t: 'probe', ents: [...World.ents.values()].filter(e => e.body && e.d.k !== 'map').map(e => { const t = e.body.translation(); return [e.id, t.x, t.y, t.z, e.body.isSleeping() ? 1 : 0]; }) }); break;
    }
  },
  // the worker's clock: fixed steps against real time, the same catch-up limit and governor as the page's loop
  run(on) {
    clearInterval(this.timer); this.timer = 0; if (!on) return;
    this.last = performance.now(); this.acc = 0; this.snapT = 0; this.keyT = 0; this.statT = 0;
    this.timer = setInterval(() => this.tick(), 4);
  },
  tick() {
    const t = performance.now(), dt = Math.min(0.25, (t - this.last) / 1000); this.last = t; this.acc += dt;
    const sdt = Sim.stepDt, maxN = sdt > 1 / 45 ? 2 : 3; let n = 0;
    while (this.acc >= sdt && n < maxN) { Sim.step(sdt); this.acc -= sdt; n++; }
    if (n === maxN) this.acc = Math.min(this.acc, sdt);   // can't keep up: drop the backlog (the world runs slow) rather than spiral
    const ms = performance.now() - t; this.steps += n; this.stepMs += ms;
    Sim.govern(ms, dt, true);
    if (n) this.snap(false, true);
    // the clients' stream, on the same schedule as Net.update
    this.snapT -= dt; this.keyT -= dt;
    if (this.snapT <= 0) {
      this.snapT += 1 / CFG.snapRate; if (this.snapT < 0) this.snapT = 0;
      const key = this.keyT <= 0; if (key) this.keyT = CFG.keyframeEvery;
      if (this.online && this.clients) this.snap(true, key); else Sim.forgetSent();
    }
    this.statT += dt; if (this.statT >= 1) { this.statT = 0; this.post(this.stats()); }
  },
  snap(net, key) {
    const buf = Sim.snapshot(key, this.hostTime(), net);
    this.post({ t: 'snap', net: net ? 1 : 0, key: key ? 1 : 0, buf }, [buf]);
  },
  stats() {
    let awake = 0; for (const e of World.ents.values()) if (e.body && e.body.isDynamic() && !e.body.isSleeping()) awake++;
    const s = { t: 'stats', steps: this.steps, msPerStep: this.steps ? this.stepMs / this.steps : 0, stepHz: Math.round(1 / Sim.stepDt), physLvl: Sim.physLvl, load: Sim.physLoad, ents: World.ents.size, awake, players: Players.map.size };
    this.steps = 0; this.stepMs = 0; return s;
  },
};
