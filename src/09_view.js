/* ============================================================================
   VIEW: what you see and hear of the simulation. World and Players call the View hooks (no-ops next to World in
   04_physics_world.js); MeshView fills them in for the browser. Headless runs (tools/sim, the host worker) don't load
   this file, so nothing here may hold simulation state.
   ========================================================================== */
const MeshView = {
  groundMesh: null,
  init() {
    const gm = this.groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 175, 175).rotateX(-Math.PI / 2), Mats.get('ground'));
    const uv = gm.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 350, uv.getY(i) * 350);
    gm.userData.mt = 'ground'; gm.receiveShadow = true; R.scene.add(gm);
  },
  entAdded(e) {
    const d = e.d;
    e.mesh = buildVisual(d); e.mesh.position.fromArray(d.p); e.mesh.quaternion.fromArray(d.q);
    if (e.mesh.userData.editOnly) e.mesh.visible = Editor.active;
    R.scene.add(e.mesh);
  },
  entRemoved(e) {
    if (e.mesh) { R.scene.remove(e.mesh); }
    if (Tools.onEntRemoved) Tools.onEntRemoved(e.id);
  },
  // an entity's descriptor changed (painter, thrusters, freeze, map edits): rebuild its visual in place
  entPatched(e, patch) {
    const pos = e.mesh.position.clone(), quat = e.mesh.quaternion.clone();
    R.scene.remove(e.mesh);
    e.mesh = buildVisual(e.d);
    if (e.d.k === 'map' || 'p' in patch) { e.mesh.position.fromArray(e.d.p); e.mesh.quaternion.fromArray(e.d.q); }
    else { e.mesh.position.copy(pos); e.mesh.quaternion.copy(quat); }
    if (e.mesh.userData.editOnly) e.mesh.visible = Editor.active;
    R.scene.add(e.mesh);
    if (Editor.sel === e.id) Editor.reattach();
  },
  // swap every entity's visual (e.g. PS1 low-poly models <-> normal models on a tier change)
  rebuildEnts() {
    for (const e of World.ents.values()) {
      if (!e.mesh) continue;
      const m = buildVisual(e.d); m.position.copy(e.mesh.position); m.quaternion.copy(e.mesh.quaternion); m.visible = e.mesh.visible;
      R.scene.remove(e.mesh); R.scene.add(m); e.mesh = m; e._wounds = []; e._stumps = [];
    }
    for (const g of World.groups.values()) g._sevVis = 0;   // stumps get re-added by the gore pass
    if (Editor.sel) Editor.reattach();
  },
  conAdded(c) { if (c.t === 'rope' || c.t === 'spring') this.makeRopeVis(c); },
  conRemoved(c) { if (c.vis) { R.scene.remove(c.vis); c.vis = null; } },
  makeRopeVis(c) {
    const g = new THREE.Group(), N = 12;
    const geo = Geo.get('ropeseg', () => new THREE.CylinderGeometry(1, 1, 1, 6, 1, true));
    for (let i = 0; i < N; i++) { const m = matMesh(geo, c.t === 'spring' ? 'metal' : 'rubber', c.t === 'spring' ? '#fed330' : '#3a3026'); m.castShadow = false; g.add(m); }
    g.userData.pts = Array.from({ length: N + 1 }, () => new V3());
    c.vis = g; R.scene.add(g);
  },
  anchorWorld(id, local, out) {
    if (!id) return out.fromArray(local);
    const e = World.ents.get(id); if (!e || !e.mesh) return out.fromArray(local);
    return out.fromArray(local).applyQuaternion(e.mesh.quaternion).add(e.mesh.position);
  },
  updateRopes() {
    const pA = _v1, pB = _v2, mid = _v3;
    for (const c of World.cons.values()) {
      if (!c.vis) continue;
      this.anchorWorld(c.a, c.pa, pA); this.anchorWorld(c.b, c.pb, pB);
      const dist = pA.distanceTo(pB), slack = c.t === 'rope' ? Math.max(0, c.len - dist) : 0;
      mid.addVectors(pA, pB).multiplyScalar(0.5); mid.y -= slack * 0.6;
      const pts = c.vis.userData.pts, N = pts.length - 1, rad = c.t === 'spring' ? 0.035 : 0.022;
      for (let i = 0; i <= N; i++) { const t = i / N, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, cc = t * t; pts[i].set(a * pA.x + b * mid.x + cc * pB.x, a * pA.y + b * mid.y + cc * pB.y, a * pA.z + b * mid.z + cc * pB.z); }
      for (let i = 0; i < N; i++) {
        const m = c.vis.children[i], p0 = pts[i], p1 = pts[i + 1];
        _v4.subVectors(p1, p0); const L = _v4.length() || 0.0001;
        m.position.addVectors(p0, p1).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(UP, _v4.divideScalar(L)); m.scale.set(rad, L, rad);
      }
    }
  },
  playerAdded(p) { PlayerView.makeAvatar(p); PlayerView.makePlate(p); },
  playerLook(p) { PlayerView.refreshLook(p); },
  playerShow(p) { if (p.avatar) p.avatar.visible = !p.isLocal; },
  playerRemoved(p) {
    if (p.avatar) R.scene.remove(p.avatar);
    if (p.disgMesh) R.scene.remove(p.disgMesh);
    if (p.plate) p.plate.remove();
  },
  sound(name, pos, vol) { if (pos) Audio.at(name, pos, vol); else Audio.play(name, vol); },
  localFellOut() { Game.localFellOut(); },
};
Object.assign(View, MeshView);

// avatars and nameplates (moved out of Players: the simulation keeps the state, this draws it)
const PlayerView = {
  blobMat: null,
  makeAvatar(p) {
    if (Models.has('avatar')) {
      const g = Models.instance('avatar', 'plastic', p.color);
      const blob = new THREE.Mesh(Geo.get('av_blob', () => new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2)), PlayerView.blobMat || (PlayerView.blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })));
      PlayerView.blobMat.userData.outlineParameters = { visible: false }; blob.position.y = 0.03; blob.name = 'blob'; blob.renderOrder = 1;
      g.add(blob);
      p.avatar = g; g.visible = !p.isLocal; R.scene.add(g);
      return;
    }
    const g = new THREE.Group();
    const torso = matMesh(Geo.get('av_t', () => new THREE.CapsuleGeometry(0.27, 0.5, 6, 16)), 'plastic', p.color); torso.position.y = 1.08;
    const head = matMesh(Geo.get('av_h', () => new THREE.SphereGeometry(0.21, 24, 16)), 'plastic', p.color); head.position.y = 1.62;
    const visor = matMesh(Geo.get('av_v', () => new RoundedBoxGeometry(0.3, 0.13, 0.12, 2, 0.04)), 'metal', '#1b1f27'); visor.position.set(0, 1.64, -0.15);
    const pack = matMesh(Geo.get('av_p', () => new RoundedBoxGeometry(0.34, 0.4, 0.16, 2, 0.04)), 'plastic', '#2a2c31'); pack.position.set(0, 1.12, 0.26);
    const legL = matMesh(Geo.get('av_l', () => new THREE.CapsuleGeometry(0.09, 0.42, 4, 10).translate(0, -0.3, 0)), 'plastic', '#2a2c31'); legL.position.set(-0.12, 0.66, 0);
    const legR = legL.clone(); legR.position.x = 0.12;
    const gun = matMesh(Geo.get('av_g', () => new RoundedBoxGeometry(0.1, 0.12, 0.42, 2, 0.02)), 'metal', '#5b6270'); gun.position.set(0.26, 1.18, -0.3);
    head.name = 'head'; legL.name = 'legL'; legR.name = 'legR'; gun.name = 'gun'; torso.name = 'torso';
    // soft blob shadow so players stay grounded on the Low (no shadow-map) tier
    const blob = new THREE.Mesh(Geo.get('av_blob', () => new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2)), PlayerView.blobMat || (PlayerView.blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })));
    PlayerView.blobMat.userData.outlineParameters = { visible: false }; blob.position.y = 0.03; blob.name = 'blob'; blob.renderOrder = 1;
    g.add(torso, head, visor, pack, legL, legR, gun, blob);
    p.avatar = g; g.visible = !p.isLocal; R.scene.add(g);
  },
  refreshLook(p) {
    if (!p.avatar) return;
    for (const n of ['torso', 'head', 'legL', 'legR']) { const m = p.avatar.getObjectByName(n); if (m && (n !== 'head' || !m.parent || m.parent.name !== 'torso')) Models.recolor(m, 'plastic', n.startsWith('leg') && !Models.has('avatar') ? '#2a2c31' : p.color); }
    this.updatePlate(p, true);
  },
  makePlate(p) {
    const el = h('div', { class: 'nameplate' }); el.innerHTML = '<div class="nm"></div><div class="hb"><i></i></div>';
    $('#nameplates').append(el); p.plate = el; this.updatePlate(p, true);
  },
  updatePlate(p, full) {
    if (!p.plate) return;
    if (full || p._plateKey !== p.name + p.tier + p.color + (Net.hostId === p.id) + p.muted + p.lvl) {
      p._plateKey = p.name + p.tier + p.color + (Net.hostId === p.id) + p.muted + p.lvl;
      p.plate.querySelector('.nm').innerHTML = `<span class="lv${lvTier(p.lvl || 1)}">${p.lvl || 1}</span>${Net.hostId === p.id ? '👑' : ''}<span style="color:${esc(p.color)}">${esc(p.name)}</span>${tierBadge(p.tier)}${p.muted ? '🔇' : ''}`;
    }
    const hb = p.plate.querySelector('.hb i'); hb.style.width = p.hp + '%'; hb.style.background = p.hp > 50 ? '#4ade80' : p.hp > 25 ? '#fbbf24' : '#ef4444';
  },
  // Prop Hunt disguise: swap the body for the object's model (built from the same data as the real prop)
  disguise(p) {
    const D = !p.dead && Rules.mode === 'prophunt' ? p.disg : null, key = D ? JSON.stringify(D.d) : '';
    if (p._dk !== key) {
      p._dk = key;
      if (p.disgMesh) { R.scene.remove(p.disgMesh); p.disgMesh = null; }
      if (D) { try { p.disgMesh = buildVisual(D.d); p.disgMesh.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); R.scene.add(p.disgMesh); } catch (e) { p.disgMesh = null; } }
    }
    if (!p.disgMesh) return false;
    p.avatar.visible = false;
    p.disgMesh.position.set(p.renderPos.x, p.renderPos.y - D.b, p.renderPos.z); p.disgMesh.rotation.set(0, p.renderYaw, 0);
    return true;
  },
  updateAvatar(p, dt) {
    const a = p.avatar; if (!a) return;
    if (this.disguise(p)) return;
    const se = p.seat ? World.ents.get(p.seat) : null, seated = !!(se && se.mesh);
    a.visible = (!p.isLocal || seated) && !p.dead;   // your own body shows in the third-person vehicle camera
    if (!a.visible) { if (p.plate && !p.isLocal) p.plate.style.display = 'none'; return; }
    a.getObjectByName('blob').visible = R.path === 'ps1' && !seated;
    const head = a.getObjectByName('head'); head.rotation.x = p.pitch * 0.6;
    const gun = a.getObjectByName('gun'); gun.visible = !seated;
    if (seated) {   // sitting on the seat (hips on the cushion), turned and tilted with the vehicle, legs forward
      const sp = SIT_POSE[se.d.vis] || SIT_POSE[se.d.sh && se.d.sh.t] || SIT_POSE.seat;
      a.quaternion.copy(se.mesh.quaternion); if (sp[1]) a.quaternion.multiply(_q3.setFromAxisAngle(UP, sp[1]));
      a.position.copy(_v1.set(0, sp[0] + 0.08 - 0.72, 0.03).applyQuaternion(a.quaternion).add(se.mesh.position));
      a.getObjectByName('legL').rotation.x = 1.4; a.getObjectByName('legR').rotation.x = 1.4;
      return;
    }
    a.position.copy(p.renderPos); if (p.crouch) a.position.y -= 0.3;
    a.rotation.set(0, p.renderYaw, 0);
    const spd = Math.hypot(p.vel.x, p.vel.z);
    p.walkPhase += dt * spd * 2.2;
    const sw = Math.sin(p.walkPhase) * Math.min(1, spd / 4) * 0.6;
    a.getObjectByName('legL').rotation.x = sw; a.getObjectByName('legR').rotation.x = -sw;
    gun.rotation.x = p.pitch;
    const wcol = { physgun: '#4dd0e1', toolgun: '#fed330', pistol: '#5b6270', rifle: '#3d4a32', grenade: '#3d4a32', crowbar: '#c0392b' }[p.weapon] || '#5b6270';
    if (gun.userData.w !== p.weapon) {
      gun.userData.w = p.weapon;
      const W = WEAPON_MODEL[p.weapon], mk = 'wp_' + ((W && W.model) || p.weapon);
      if (W && Models.has(mk) && Models.has('avatar')) {
        // swap in the held weapon's model (its first-person hand is hidden; the avatar has its own hands)
        if (gun.userData.wm) gun.remove(gun.userData.wm);
        else gun.traverse(o => { if (o.isMesh) o.visible = false; });
        const wm = Models.instance(mk, W.t, W.c), hand = wm.getObjectByName(mk + '_hand');
        if (hand) hand.visible = false;
        wm.position.set(0, 0.03, -0.12); gun.add(wm); gun.userData.wm = wm;
      } else Models.recolor(gun, 'metal', wcol);
    }
  },
  updatePlates() {
    const cam = R.camera, W = innerWidth, H = innerHeight;
    for (const p of Players.map.values()) {
      if (!p.plate) continue;
      if (p.isLocal || p.dead || (Rules.mode === 'prophunt' && p.team === 'prop' && (Players.local || {}).team !== 'prop')) { p.plate.style.display = 'none'; continue; }
      _v1.copy(p.renderPos); _v1.y += 2.05;
      const dist = _v1.distanceTo(cam.position);
      _v1.project(cam);
      if (_v1.z > 1 || dist > 180) { p.plate.style.display = 'none'; continue; }
      p.plate.style.display = '';
      const sc = clamp(1.2 - dist / 120, 0.6, 1);
      p.plate.style.transform = `translate(${(_v1.x * 0.5 + 0.5) * W}px,${(-_v1.y * 0.5 + 0.5) * H}px) translate(-50%,-100%) scale(${sc})`;
      p.plate.style.left = '0'; p.plate.style.top = '0';
      const pr = Players.isProt(p); if (p._pr !== pr) { p._pr = pr; p.plate.classList.toggle('prot', pr); }
      this.updatePlate(p);
    }
  },
};
