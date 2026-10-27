
/* ============================================================================
   8. EDITOR (collaborative map building: place / move / rotate / scale, undo/redo)
   ========================================================================== */
const Editor = {
  active: false, sel: 0, piece: null, snap: true, mode: 'translate', tc: null, undo: [], redo: [], padMode: 'move', placeYaw: 0,
  ray: new THREE.Raycaster(), ghost: null, before: null,
  init() {
    const tc = this.tc = new TransformControls(R.camera, R.renderer.domElement);
    tc.setTranslationSnap(0.5); tc.setRotationSnap(THREE.MathUtils.degToRad(15)); tc.setScaleSnap(0.25); tc.setSize(0.9);
    const helper = tc.getHelper(); helper.traverse(o => { if (o.material) o.material.userData.outlineParameters = { visible: false }; });
    R.scene.add(helper); tc.enabled = false; helper.visible = false;
    tc.addEventListener('dragging-changed', e => { if (e.value) this.dragStart(); else this.dragEnd(); });
    R.renderer.domElement.addEventListener('pointerdown', e => {
      if (!this.active || e.button !== 0 || UI.open) return;
      setTimeout(() => { if (!this.tc.dragging && !this.tc.axis) this.pickScreen(e.clientX, e.clientY); }, 0);
    });
    this.ghost = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4dd0e1, depthTest: false, transparent: true, opacity: 0.9 }));
    this.ghost.renderOrder = 998; this.ghost.visible = false; this.ghost.material.userData.outlineParameters = { visible: false };
    R.scene.add(this.ghost);
  },
  toggle(on) {
    if (on === undefined) on = !this.active;
    const me = Players.local;
    if (on && !canEdit(me)) { UI.toast('The host hasn\'t allowed you to edit the map.'); return; }
    this.active = on;
    for (const e of World.ents.values()) if (e.mesh && e.mesh.userData.editOnly) e.mesh.visible = on;
    if (on) { Tools.release(); Game.lockReleaseOk = true; if (document.pointerLockElement) document.exitPointerLock(); if (me) me.noclip = true; }
    else { this.select(0); this.arm(null); if (me) me.noclip = false; Game.lock(); }
    this.tc.enabled = on; this.tc.getHelper().visible = on;
    UI.refreshEdit(); UI.refreshTool();
    Audio.play('switch');
  },
  arm(key) {
    this.piece = key && ITEM_INDEX[key] && ITEM_INDEX[key].cat === 'map' ? key : null;
    if (this.piece) { this.select(0); const d = ITEM_INDEX[key].d; this.ghost.geometry.dispose(); this.ghost.geometry = new THREE.EdgesGeometry(d.sh.t === 'ramp' ? Geo.wedge(...d.sh.s) : new THREE.BoxGeometry(...this.dims(d.sh))); }
    this.ghost.visible = !!this.piece;
    UI.refreshEdit();
  },
  dims(sh) { if (sh.s) return sh.s; if (sh.t === 'light') return [0.4, 0.4, 0.4]; if (sh.t === 'spawn') return [1.2, 0.1, 1.2]; return [1, 1, 1]; },
  select(id) {
    this.sel = id; this.reattach(); UI.refreshEdit();
  },
  reattach() {
    this.tc.detach();
    const e = World.ents.get(this.sel);
    if (e && this.active && e.d.k === 'map') {
      this.tc.attach(e.mesh);
      this.tc.setMode(this.mode); this.tc.setSpace(this.mode === 'translate' ? 'world' : 'local');
      const noScale = e.d.sh.t === 'light' || e.d.sh.t === 'spawn';
      this.tc.showX = this.tc.showY = this.tc.showZ = !(noScale && this.mode === 'scale');
    } else if (this.sel && !e) this.sel = 0;
  },
  setMode(m) { this.mode = m; this.reattach(); UI.refreshEdit(); },
  setSnap(on) {
    this.snap = on;
    this.tc.setTranslationSnap(on ? 0.5 : null); this.tc.setRotationSnap(on ? THREE.MathUtils.degToRad(15) : null); this.tc.setScaleSnap(on ? 0.25 : null);
    UI.refreshEdit(); UI.toast('Grid snap ' + (on ? 'ON' : 'OFF'));
  },
  // screen-space pick (mouse) or crosshair pick (gamepad)
  pickScreen(x, y) {
    this.ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), R.camera);
    this.pickRay();
  },
  castPlacement() {
    const meshes = []; for (const e of World.ents.values()) if (e.mesh && (e.d.k === 'map' || e.d.k === 'prop')) meshes.push(e.mesh);
    meshes.push(View.groundMesh);
    const hits = this.ray.intersectObjects(meshes, true);
    for (const h of hits) {
      let o = h.object; while (o && o.parent && o.parent !== R.scene) o = o.parent;
      const ent = [...World.ents.values()].find(e => e.mesh === o);
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : UP.clone();
      return { point: h.point, normal: n, ent };
    }
    return null;
  },
  pickRay() {
    const h = this.castPlacement(); if (!h) return;
    if (this.piece) { this.place(this.piece, h.point, h.normal); return; }
    if (h.ent && h.ent.d.k === 'map') this.select(h.ent.id); else this.select(0);
  },
  snapV(v, s) { return this.snap ? Math.round(v / s) * s : v; },
  placeTransform(key, point, normal) {
    const d = ITEM_INDEX[key].d, dims = this.dims(d.sh);
    const p = point.clone();
    p.x = this.snapV(p.x, 0.5); p.z = this.snapV(p.z, 0.5);
    const up = normal && normal.y > 0.5;
    p.y = (up ? point.y : this.snapV(point.y, 0.25)) + dims[1] / 2;
    if (normal && !up) p.addScaledVector(new V3(normal.x, 0, normal.z).normalize(), Math.max(dims[0], dims[2]) / 2);
    const yaw = this.placeYaw;
    return { p, q: new QT().setFromAxisAngle(UP, yaw) };
  },
  place(key, point, normal) {
    const it = ITEM_INDEX[key]; if (!it) return;
    const tr = this.placeTransform(key, point, normal);
    const d = JSON.parse(JSON.stringify(it.d)); d.k = 'map'; d.p = a3(tr.p); d.q = a4(tr.q); d.id = this.newId();
    this.op({ op: 'add', d }, { op: 'del', id: d.id });
    Audio.play('place');
  },
  newId() { let id; do { id = 40000 + ((Math.random() * 25000) | 0); } while (World.ents.has(id)); return id; },
  op(doOp, undoOp) { Net.toHost(Object.assign({ t: 'edit' }, doOp)); if (undoOp) { this.undo.push([doOp, undoOp]); if (this.undo.length > 100) this.undo.shift(); this.redo.length = 0; } },
  doUndo() { const u = this.undo.pop(); if (!u) return UI.toast('Nothing to undo'); Net.toHost(Object.assign({ t: 'edit' }, u[1])); this.redo.push(u); UI.toast('Undo'); },
  doRedo() { const u = this.redo.pop(); if (!u) return UI.toast('Nothing to redo'); Net.toHost(Object.assign({ t: 'edit' }, u[0])); this.undo.push(u); UI.toast('Redo'); },
  del() {
    const e = World.ents.get(this.sel); if (!e) return;
    const d = JSON.parse(JSON.stringify(e.d));
    this.op({ op: 'del', id: e.id }, { op: 'add', d }); this.select(0); Audio.play('delete_zap');
  },
  duplicate() {
    const e = World.ents.get(this.sel); if (!e) return;
    const d = JSON.parse(JSON.stringify(e.d)); d.id = this.newId(); d.p = [d.p[0] + (this.snap ? 1 : 0.8), d.p[1], d.p[2]];
    this.op({ op: 'add', d }, { op: 'del', id: d.id }); setTimeout(() => this.select(d.id), 150);
  },
  dragStart() { const e = World.ents.get(this.sel); this.before = e ? JSON.parse(JSON.stringify(e.d)) : null; },
  dragEnd() {
    const e = World.ents.get(this.sel); if (!e || !this.before) return;
    const m = e.mesh, after = { p: a3(m.position), q: a4(m.quaternion) };
    if (e.d.sh.s && (m.scale.x !== 1 || m.scale.y !== 1 || m.scale.z !== 1)) {
      after.sh = Object.assign({}, e.d.sh, { s: e.d.sh.s.map((v, i) => clamp(+(v * [m.scale.x, m.scale.y, m.scale.z][i]).toFixed(3), 0.1, 200)) });
    }
    m.scale.set(1, 1, 1);
    const b = this.before, beforeP = { p: b.p, q: b.q, sh: b.sh };
    this.op({ op: 'set', id: e.id, d: after }, { op: 'set', id: e.id, d: beforeP });
    this.before = null;
  },
  nudge(dx, dy, dz, rot, sc) {
    const e = World.ents.get(this.sel); if (!e) return;
    const d = e.d, p = new V3().fromArray(d.p).add(new V3(dx, dy, dz)), q = new QT().fromArray(d.q);
    if (rot) q.premultiply(new QT().setFromAxisAngle(UP, rot));
    const after = { p: a3(p), q: a4(q) };
    if (sc && d.sh.s) after.sh = Object.assign({}, d.sh, { s: d.sh.s.map(v => clamp(+(v * sc).toFixed(3), 0.1, 200)) });
    this.op({ op: 'set', id: e.id, d: after }, { op: 'set', id: e.id, d: { p: d.p, q: d.q, sh: d.sh } });
  },
  // per-frame editor input (called by Game when edit mode is active)
  update(dt) {
    if (!this.active) return;
    const pad = Input.device === 'pad';
    if (pad || Input.locked) this.ray.setFromCamera(new THREE.Vector2(0, 0), R.camera);
    else this.ray.setFromCamera(new THREE.Vector2(Input.mx / innerWidth * 2 - 1, -(Input.my / innerHeight) * 2 + 1), R.camera);
    // ghost preview of armed piece
    if (this.piece) {
      const h = this.castPlacement();
      if (h) { const tr = this.placeTransform(this.piece, h.point, h.normal); this.ghost.position.copy(tr.p); this.ghost.quaternion.copy(tr.q); this.ghost.visible = true; }
      else this.ghost.visible = false;
    } else this.ghost.visible = false;
    const k = Input.keys, ctrl = k.has('ControlLeft') || k.has('ControlRight');
    if (Input.kHit.has('Digit1')) this.setMode('translate');
    if (Input.kHit.has('Digit2')) this.setMode('rotate');
    if (Input.kHit.has('Digit3')) this.setMode('scale');
    if (Input.hit('snap')) this.setSnap(!this.snap);
    if (Input.kHit.has('Delete') || Input.kHit.has('Backspace')) this.del();
    if (ctrl && Input.kHit.has('KeyZ')) this.doUndo();
    if (ctrl && Input.kHit.has('KeyY')) this.doRedo();
    if (ctrl && Input.kHit.has('KeyD')) this.duplicate();
    if (Input.kHit.has('KeyR') && !ctrl) { if (this.piece) this.placeYaw += Math.PI / 2; else this.nudge(0, 0, 0, THREE.MathUtils.degToRad(15)); }
    // gamepad editing: RT place/select, LT delete, RB rotate, X cycles d-pad mode, d-pad nudges
    if (pad) {
      if (Input.padHit(PAD.RT)) this.pickRay();
      if (Input.padHit(PAD.LT)) { if (this.piece) this.arm(null); else this.del(); }
      if (Input.padHit(PAD.RB)) { if (this.piece) this.placeYaw += Math.PI / 2; else this.nudge(0, 0, 0, THREE.MathUtils.degToRad(15)); }
      if (Input.padHit(PAD.X)) { this.padMode = { move: 'height', height: 'scale', scale: 'move' }[this.padMode]; UI.toast('D-pad: ' + this.padMode); UI.refreshEdit(); }
      const st = this.snap ? 0.5 : 0.25, f = new V3(), rgt = new V3();
      R.camera.getWorldDirection(f); f.y = 0; f.normalize(); rgt.crossVectors(f, UP);
      const ax = Math.abs(f.x) > Math.abs(f.z) ? new V3(Math.sign(f.x), 0, 0) : new V3(0, 0, Math.sign(f.z));
      const ar = Math.abs(rgt.x) > Math.abs(rgt.z) ? new V3(Math.sign(rgt.x), 0, 0) : new V3(0, 0, Math.sign(rgt.z));
      const dir = Input.padHit(PAD.UP) ? 1 : Input.padHit(PAD.DOWN) ? -1 : 0, side = Input.padHit(PAD.RIGHT) ? 1 : Input.padHit(PAD.LEFT) ? -1 : 0;
      if (dir || side) {
        if (this.padMode === 'move') this.nudge(ax.x * dir * st + ar.x * side * st, 0, ax.z * dir * st + ar.z * side * st);
        else if (this.padMode === 'height') this.nudge(0, dir * 0.25, 0, side * THREE.MathUtils.degToRad(15));
        else this.nudge(0, 0, 0, 0, dir > 0 || side > 0 ? 1.25 : 0.8);
      }
    }
  },
  // ---- host side ----------------------------------------------------------------
};

/* ============================================================================
   11. SAVE / LOAD (worlds + dupes in localStorage and as JSON files)
   ========================================================================== */
const Save = {
  worlds() { return store.get('worlds', {}); },
  dupes() { return store.get('dupes', {}); },
  saveWorld(name) {
    name = (name || '').trim() || 'World ' + new Date().toLocaleString();
    const data = Object.assign(World.serialize(), { name, saved: Date.now(), rules: Object.assign({}, Rules) });
    const all = this.worlds(); all[name] = data;
    if (store.set('worlds', all)) UI.toast('World saved: ' + name); else UI.toast('Browser storage is full. Use Download instead.');
    return data;
  },
  deleteWorld(name) { const all = this.worlds(); delete all[name]; store.set('worlds', all); },
  saveDupe(name, data) {
    if (!data) return UI.toast('Copy a contraption with the Duplicator first');
    name = (name || data.name || 'Contraption').trim();
    const all = this.dupes(); all[name] = Object.assign({}, data, { name, saved: Date.now() });
    if (store.set('dupes', all)) UI.toast('Dupe saved: ' + name); else UI.toast('Storage full');
  },
  deleteDupe(name) { const all = this.dupes(); delete all[name]; store.set('dupes', all); },
  validWorld(d) { return World.validWorld(d); }, validDupe(d) { return World.validDupe(d); },
};

/* ============================================================================
   Host admin actions: the UI's requests (the host carries them out in Auth.adminAction)
   ========================================================================== */
const Admin = {
  req(a, extra) { Net.toHost(Object.assign({ t: 'admin', a }, extra || {})); },
};

/* ---------------------------------------------------------------------------
   Owner access: whoever knows the owner code can use the host settings in any room.
   #tw-owner (tools/owner/owner.json) holds a public key and the matching private key encrypted with the code.
   The owner's browser decrypts it locally; the host sends a one-time challenge, the owner signs it, the host checks the
   signature. The code never leaves the owner's device and a signature can't be replayed (new nonce, bound to the room
   and the player).
   ------------------------------------------------------------------------- */
const Owner = {
  key: null, ok: false, okHost: null, busy: false,
  cfg() { try { const o = JSON.parse(document.getElementById('tw-owner').textContent || 'null'); return o && o.ct && o.pub ? o : null; } catch (e) { return null; } },
  b64(u8) { let s = ''; for (const c of u8) s += String.fromCharCode(c); return btoa(s); },
  unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); },
  // unlock with the code (throws on a wrong one); optionally remember the key on this device
  async unlock(code, remember) {
    const o = this.cfg(); if (!o) throw new Error('Owner access is not set up in this copy of the game.');
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code.trim().normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    const aes = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: this.unb64(o.salt), iterations: o.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    let txt; try { txt = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.unb64(o.iv) }, aes, this.unb64(o.ct))); } catch (e) { throw new Error('Wrong owner code.'); }
    await this.use(JSON.parse(txt));
    if (remember) store.set('ownerKey', txt);
  },
  async use(jwk) { this.key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']); this.ok = false; this.hello(); },
  async restore() { const s = store.get('ownerKey', null); if (s && this.cfg()) { try { await this.use(JSON.parse(s)); } catch (e) { store.set('ownerKey', null); } } },
  forget() { this.key = null; this.ok = false; store.set('ownerKey', null); UI.refreshOwner(); },
  // ask the host for a challenge (on unlock, and whenever we (re)connect to a host)
  hello() {
    if (!this.key || !Net.online || Net.isHost || !Net.hostId) return;
    if (this.okHost !== Net.hostId) this.ok = false;
    if (!this.ok) Net.toHost({ t: 'ownerHello' });
  },
  async onChal(n) {
    if (!this.key || typeof n !== 'string') return;
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.key, new TextEncoder().encode(`tw-owner|${Net.code}|${Net.me}|${n}`));
    Net.toHost({ t: 'ownerProof', sig: this.b64(new Uint8Array(sig)) });
  },
  onOk() { this.ok = true; this.okHost = Net.hostId; UI.toast('Owner access: you can use the host settings.', 'ok'); UI.refreshOwner(); if (UI.open === 'pause') UI.buildPause(); },
  // host side
  hostHello(p) {
    const t = now(); if (p._ownT && t - p._ownT < 2) return; p._ownT = t;
    if (!this.cfg()) return Net.notify(p.id, 'Owner access is not set up in the host\'s copy of the game.');
    const n = this.b64(crypto.getRandomValues(new Uint8Array(18))); p._ownN = { n, t }; Net.sendTo(p.id, { t: 'ownerChal', n });
  },
  async hostProof(p, m) {
    const c = p._ownN; p._ownN = null;
    if (!c || now() - c.t > 30 || typeof m.sig !== 'string' || m.sig.length > 200) return;
    try {
      const pub = await crypto.subtle.importKey('jwk', this.cfg().pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, this.unb64(m.sig), new TextEncoder().encode(`tw-owner|${Net.code}|${p.id}|${c.n}`));
      if (!ok) return Net.notify(p.id, 'Owner check failed.');
      p.owner = true; Net.sendTo(p.id, { t: 'ownerOk' }); Net.sysChat(`${p.name} has owner access.`);
    } catch (e) { Net.notify(p.id, 'Owner check failed.'); }
  },
};
