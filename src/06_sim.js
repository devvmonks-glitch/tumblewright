/* ============================================================================
   HOST SIMULATION: one fixed step of the authoritative world (game logic + physics), the physics governor and
   the snapshots clients get. The window's game loop calls these while hosting; the host worker will call them
   on its own clock. Nothing here touches the page: what players see arrives through Srv (and, for the
   host's own window, View).
   ========================================================================== */
// ---- snapshot encoding (the host packs, clients unpack in Net.onSnap) ------------
const SNAP_BODY = 2 + 6 + 4, SNAP_PLAYER = 1 + 6 + 2 + 2 + 1 + 1 + 1 + 2 + 6;
function packQuat(q) {
  const a = [q.x, q.y, q.z, q.w]; let mi = 0;
  for (let i = 1; i < 4; i++) if (Math.abs(a[i]) > Math.abs(a[mi])) mi = i;
  const s = a[mi] < 0 ? -1 : 1; let out = mi << 30, sh = 20;
  for (let i = 0; i < 4; i++) { if (i === mi) continue; const v = clamp(a[i] * s, -0.7072, 0.7072); out |= Math.round((v / 0.7072 * 0.5 + 0.5) * 1023) << sh; sh -= 10; }
  return out >>> 0;
}
function unpackQuat(u, out) {
  const mi = u >>> 30, a = [0, 0, 0, 0]; let sh = 20, sum = 0;
  for (let i = 0; i < 4; i++) { if (i === mi) continue; const v = (((u >>> sh) & 1023) / 1023 - 0.5) * 2 * 0.7072; a[i] = v; sum += v * v; sh -= 10; }
  a[mi] = Math.sqrt(Math.max(0, 1 - sum));
  return out.set(a[0], a[1], a[2], a[3]).normalize();
}
const i16 = v => clamp(Math.round(v * 100), -32767, 32767);
// host physics quality levels, cheapest last (cost = rough relative CPU per second of simulation)
const PHYS_LEVELS = [{ dt: 1 / 60, it: 6, cost: 1 }, { dt: 1 / 60, it: 4, cost: 0.8 }, { dt: 1 / 30, it: 4, cost: 0.42 }];
const Sim = {
  seq: 0,
  // one host step: remote players' capsules follow their reported positions, then game logic, the physics engine and
  // the poses visuals interpolate between
  step(dt) {
    Phys.sync();
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
  },
  // a fresh room / solo game: empty world, no players, default rules
  reset() {
    ZS.st = null; Rules.zs = null; PH.st = null; Rules.ph = null; World.clear(); for (const id of [...Players.map.keys()]) Players.remove(id);
    Object.assign(Rules, { combat: false, editPerm: 'all', propLimit: CFG.propLimit, allowNoclip: true, aimAssist: true, dismember: true, env: 'plains', envGone: [], mode: 'sandbox', bots: 3 });
    Auth.nades = []; Auth.corpses = [];
  },
  // ---- physics governor ----------------------------------------------------------------------------------
  // The host simulates everything, so on a slow CPU physics eats the frame and the host lags while clients are fine.
  // Every few seconds: if physics took over 30% of the time, step down (fewer solver iterations, then 30 steps/s
  // instead of 60); with plenty of headroom, step back up. Clients always run level 0 (they only follow snapshots).
  stepDt: 1 / 60, physLvl: 0, physLoad: 0, govMs: 0, govT: 0, govHold: 0,
  setPhysLevel(l) {
    const L = PHYS_LEVELS[l]; this.physLvl = l; this.stepDt = L.dt; this.govHold = 4;
    if (Phys.world) { Phys.world.timestep = L.dt; Phys.world.integrationParameters.numSolverIterations = L.it; }
  },
  // ms = time the physics steps took this frame; hosting = this window runs a game as host
  govern(ms, dt, hosting) {
    if (!hosting) { if (this.physLvl) this.setPhysLevel(0); this.govMs = this.govT = 0; return; }
    this.govMs += ms; this.govT += dt; this.govHold -= dt;
    if (this.govT < 2) return;
    const load = this.govMs / (this.govT * 1000); this.govMs = this.govT = 0; this.physLoad = load;
    if (this.govHold > 0) return;
    if (load > 0.3 && this.physLvl < PHYS_LEVELS.length - 1) this.setPhysLevel(this.physLvl + 1);
    else if (this.physLvl > 0 && load * PHYS_LEVELS[this.physLvl - 1].cost / PHYS_LEVELS[this.physLvl].cost < 0.2) this.setPhysLevel(this.physLvl - 1);
  },
  // the binary snapshot for clients: bodies that moved (all of them on a keyframe), players, firing thrusters
  snapshot(key, hostTime) {
    const bodies = [];
    for (const e of World.ents.values()) {
      if (e.d.k === 'map' || !e.body) continue;
      const t = e.body.translation(), r = e.body.rotation();
      _v1.set(t.x, t.y, t.z); _q1.set(r.x, r.y, r.z, r.w);
      if (!key && _v1.distanceToSquared(e.sentP) < 1e-6 && Math.abs(_q1.dot(e.sentQ)) > 0.999995) continue;
      e.sentP.copy(_v1); e.sentQ.copy(_q1); bodies.push(e);
    }
    const players = [...Players.map.values()];
    const thr = Auth.activeThr, nThr = thr.length / 2;
    const buf = new ArrayBuffer(16 + bodies.length * SNAP_BODY + players.length * SNAP_PLAYER + nThr * 3);
    const dv = new DataView(buf); let o = 0;
    dv.setUint8(o, 1); o++; dv.setUint8(o, key ? 1 : 0); o++; dv.setUint16(o, this.seq = (this.seq + 1) & 0xffff); o += 2;
    dv.setFloat64(o, hostTime); o += 8;
    dv.setUint16(o, bodies.length); o += 2; dv.setUint8(o, players.length); o++; dv.setUint8(o, nThr); o++;
    for (const e of bodies) {
      dv.setUint16(o, e.id); o += 2;
      dv.setInt16(o, i16(e.sentP.x)); dv.setInt16(o + 2, i16(e.sentP.y)); dv.setInt16(o + 4, i16(e.sentP.z)); o += 6;
      dv.setUint32(o, packQuat(e.sentQ)); o += 4;
    }
    for (const p of players) {
      dv.setUint8(o, p.idx); o++;
      dv.setInt16(o, i16(p.pos.x)); dv.setInt16(o + 2, i16(p.pos.y)); dv.setInt16(o + 4, i16(p.pos.z)); o += 6;
      let y = p.yaw % (Math.PI * 2); if (y > Math.PI) y -= Math.PI * 2; if (y < -Math.PI) y += Math.PI * 2;
      dv.setInt16(o, Math.round(y * 10000)); dv.setInt16(o + 2, Math.round(clamp(p.pitch, -1.6, 1.6) * 10000)); o += 4;
      dv.setUint8(o, clamp(Math.round(p.hp), 0, 255)); o++;
      dv.setUint8(o, (p.dead ? 1 : 0) | (p.seat ? 2 : 0) | (p.crouch ? 4 : 0) | (p.noclip ? 8 : 0) | (p.beamEnd && p.grab ? 16 : 0) | (p.firing ? 32 : 0) | (p.protUntil && now() < p.protUntil ? 64 : 0)); o++;
      dv.setUint8(o, W_BY_ID[p.weapon] ? W_BY_ID[p.weapon].idx : 0); o++;
      dv.setUint16(o, clamp(Math.round(p.ping || 0), 0, 65535)); o += 2;
      const b = p.beamEnd || p.pos; dv.setInt16(o, i16(b.x)); dv.setInt16(o + 2, i16(b.y)); dv.setInt16(o + 4, i16(b.z)); o += 6;
    }
    for (let i = 0; i < thr.length; i += 2) { dv.setUint16(o, thr[i]); dv.setUint8(o + 2, thr[i + 1]); o += 3; }
    return buf;
  },
  // nobody to send to: the next snapshot will carry every body again
  forgetSent() { for (const e of World.ents.values()) e.sentP.set(1e9, 0, 0); },
};
