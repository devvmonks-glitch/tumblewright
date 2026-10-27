/* ============================================================================
   HOST OUTBOX: everything the host simulation says to players goes through Srv, and the simulation asks about the
   session (am I the host, am I online) only here. Today Srv forwards to Net in this window; in the host worker it will
   post to the window, which sends it on. The host's own player gets its messages the same way as everyone else.
   ========================================================================== */
const Srv = {
  auth() { return Net.auth(); }, isHost() { return Net.isHost; }, online() { return Net.online; }, hostId() { return Net.hostId; },
  bcast(m) { Net.bcast(m); }, bcastAll(m) { Net.bcastAll(m); }, bcastExcept(pid, m) { Net.bcastExcept(pid, m); },
  sendTo(pid, m) { Net.sendTo(pid, m); }, notify(pid, text) { Net.notify(pid, text); }, sysChat(text, cls) { Net.sysChat(text, cls); },
  sendPlayers() { Net.sendPlayers(); }, sendRules() { Net.sendRules(); },
  // a player who just joined: the whole world, the rules, who's here and where they spawn
  welcome(pid, spawn) { Net.send('ws', { hostId: Net.me, rules: Rules, players: Players.list(), world: World.serialize(), you: { spawn }, code: Net.code }, pid); },
  // the whole world again, to everyone already in the room (after the host loads a world)
  sendWorld() { for (const pid of Net.clientIds()) Net.send('ws', { hostId: Net.me, rules: Rules, players: Players.list(), world: World.serialize(), code: Net.code }, pid); },
  ban(pid) { Net.banned.add(pid); },
  // XP for player pid (an id or 'p:id'); each player keeps their own progress
  award(pid, kind, n) {
    if (!this.isHost()) return;
    const p = Players.map.get(String(pid).replace(/^p:/, '')); if (!p) return;
    this.sendTo(p.id, { t: 'xp', k: kind, n: n || 0 });
  },
};
