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
  envKey() { return EnvView.key(); }, envBegin(Th) { return EnvView.begin(Th); }, envRemoveItem(it) { EnvView.removeItem(it); }, envTick(dt) { EnvView.tick(dt); },
  localFellOut() { Game.localFellOut(); },
  adminChanged() { UI.refreshScoreboard(); UI.refreshAdmin(); },
};
Object.assign(View, MeshView);

// The map's look. Env (05_maps_env.js) lays the map out and creates the colliders; it hands every visual piece to this
// builder in world coordinates (mirrored maps already flipped), in the same order as before the split.
const _em4 = new THREE.Matrix4(), _eq = new QT(), _ev = new V3(), _eone = new V3(1, 1, 1);
const EnvView = {
  group: null, mirrors: [], vis: null, batch: null,
  key() { return R.path; },   // the PS1 path has its own models: rebuild the map when it changes
  // a new map: clear the old decor, set sky, fog, light and the ground, then return the builder (null: nothing to decorate)
  begin(Th) {
    this.mirrors = []; if (R.dark) { R.dark = 0; R.applyLights(); }
    if (this.group) { R.scene.remove(this.group); this.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); this.group = null; }
    const sk = R.sky.material.uniforms, ts = R.toonSky.material.uniforms;
    if (Th.ground) {
      sk.zen.value.set(Th.zen); sk.hor.value.set(Th.hor); sk.gnd.value.set(Th.gnd); sk.sunAmt.value = Th.sunAmt;
      ts.top.value.set(Th.zen); ts.mid.value.set(Th.hor); ts.bot.value.set(Th.gnd);
      R.scene.fog = new THREE.Fog(Th.fog[0], Th.fog[1], Th.fog[2]);
      R.themeLight = { sun: Th.sun, hemi: Th.hemi };
    } else {
      sk.zen.value.setRGB(0.10, 0.27, 0.68); sk.hor.value.setRGB(0.56, 0.70, 0.86); sk.gnd.value.setRGB(0.30, 0.31, 0.29); sk.sunAmt.value = 1;
      ts.top.value.set('#5fb4ff'); ts.mid.value.set('#cfeaff'); ts.bot.value.set('#e9e4dc');
      R.scene.fog = null; R.themeLight = null;
    }
    R.applyLights(); R.rebakeEnv();
    const gt = Th.ground && Th.ground !== 'grid' ? 'ground_' + Th.ground : 'ground';
    View.groundMesh.material = Mats.get(gt); View.groundMesh.userData.mt = gt;
    if (!Th.ground) return null;
    this.group = new THREE.Group(); R.scene.add(this.group);
    this.vis = {}; this.batch = {};
    return this;
  },
  // static pieces are merged into one mesh per material (a building is hundreds of boxes)
  addVis(geo, mt, c, x, y, z, yaw) {
    const q = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(_em4.compose(_ev.set(x, y, z), _eq.setFromAxisAngle(UP, yaw || 0), _eone));
    const k = mt + '|' + (c || ''); (this.vis[k] || (this.vis[k] = { mt, c, gs: [] })).gs.push(q);
  },
  box(w, h, d, mt, c, x, y, z, yaw) { this.addVis(Geo.worldBox(w, h, d), mt, c, x, y, z, yaw); },
  ramp(w, h, d, mt, c, x, y, z, yaw) { this.addVis(Geo.wedge(w, h, d), mt, c, x, y, z, yaw); },
  water(x, y, z, w, d, dep) { this.group.add(Water.mesh(x, y, z, w, d, dep)); },
  // building box: sides tiled with a facade texture per window bay, flat roof; merged into one mesh per texture
  facade(x, y, z, w, h, d, tex, bayW, bayH, yaw) {
    const batch = this.batch, B = batch[tex] || (batch[tex] = { p: [], u: [], n: [] }), R0 = batch.roof || (batch.roof = { p: [], u: [], n: [] });
    const cs = Math.cos(yaw), sn = Math.sin(yaw), T = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
    const quad = (Bt, a, b2, c, d2, nrm, uw, vh) => { Bt.p.push(...a, ...b2, ...c, ...a, ...c, ...d2); Bt.u.push(0, 0, uw, 0, uw, vh, 0, 0, uw, vh, 0, vh); for (let i = 0; i < 6; i++) Bt.n.push(...nrm); };
    const hw = w / 2, hd = d / 2, rot = (nx, nz) => [nx * cs + nz * sn, 0, -nx * sn + nz * cs];
    quad(B, T(-hw, 0, hd), T(hw, 0, hd), T(hw, h, hd), T(-hw, h, hd), rot(0, 1), Math.max(1, Math.round(w / bayW)), Math.max(1, Math.round(h / bayH)));
    quad(B, T(hw, 0, -hd), T(-hw, 0, -hd), T(-hw, h, -hd), T(hw, h, -hd), rot(0, -1), Math.max(1, Math.round(w / bayW)), Math.max(1, Math.round(h / bayH)));
    quad(B, T(hw, 0, hd), T(hw, 0, -hd), T(hw, h, -hd), T(hw, h, hd), rot(1, 0), Math.max(1, Math.round(d / bayW)), Math.max(1, Math.round(h / bayH)));
    quad(B, T(-hw, 0, -hd), T(-hw, 0, hd), T(-hw, h, hd), T(-hw, h, -hd), rot(-1, 0), Math.max(1, Math.round(d / bayW)), Math.max(1, Math.round(h / bayH)));
    quad(R0, T(-hw, h, hd), T(hw, h, hd), T(hw, h, -hd), T(-hw, h, -hd), [0, 1, 0], w / 4, d / 4);
  },
  // terrain: Env made the heightened grid (and cut any holes); add texture coordinates, the sand blend and the meshes
  terrain(geo, S) {
    const P = geo.attributes.position, uv = geo.attributes.uv, cols = new Float32Array(P.count * 4);
    for (let i = 0; i < P.count; i++) { const px = P.getX(i), pz = P.getZ(i); uv.setXY(i, px / 4, pz / 4); cols.set([1, 1, 1, S(px, pz)], i * 4); }
    geo.computeVertexNormals();
    const grass = new THREE.Mesh(geo, Mats.get('ground_grass')); grass.receiveShadow = true; grass.userData.mt = 'ground_grass'; this.group.add(grass);
    const sg = geo.clone(); sg.setAttribute('color', new THREE.BufferAttribute(cols, 4));
    const sandMat = () => csmMat(new THREE.MeshStandardMaterial({ map: Tex.make('sand', true), vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.95, metalness: 0 }));
    const sand = new THREE.Mesh(sg, sandMat()); sand.userData.remat = sandMat;
    sand.material.userData.outlineParameters = { visible: false }; sand.receiveShadow = true; sand.renderOrder = 1; this.group.add(sand);
  },
  // a mirror (reflects the scene on Medium+, a dull silver panel on Low); only rendered when you're near it
  mirror(x, y, z, w, h, rotY) {
    const geo = new THREE.PlaneGeometry(w, h);
    const m = R.path === 'pbr' ? new Reflector(geo, { textureWidth: 1024, textureHeight: Math.round(1024 * h / w), color: 0xc4ccd0, clipBias: 0.003 })
      : new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#a9b6bb' }));
    m.position.set(x, y + h / 2, z); m.rotation.y = rotY; m.userData.mirror = 1; this.group.add(m); this.mirrors.push(m);
  },
  cyl(x, y, z, rad, h, c) { const m = matMesh(Geo.get(`cy${rad},${h},m`, () => new THREE.CylinderGeometry(rad * 0.8, rad, h, 16)), 'concrete', c, true); m.position.set(x, y + h / 2, z); m.castShadow = true; this.group.add(m); },
  // extruded outline (points [x, z]) from y0 to y1
  prism(pts, y0, y1, mt, c) {
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, curveSegments: 6 }).rotateX(Math.PI / 2);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);   // 1 texture = 2 m like the boxes
    const m = matMesh(geo, mt, c, true); m.position.y = y1; this.group.add(m);
  },
  // big lettering on a far hill, facing the middle of the map
  sign(text, x, y, z, w, h) {
    const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 300; const c2 = cv.getContext('2d');
    c2.font = 'bold 250px Arial, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillStyle = '#f4f4f0'; c2.fillText(text, 1024, 160, 2000);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.4, fog: true, side: THREE.DoubleSide }));
    m.material.userData.outlineParameters = { visible: false }; m.position.set(x, y, z); m.lookAt(0, y, 0); this.group.add(m);
  },
  // end of a hand-built map: merge the static pieces and the facades into one mesh per material
  finish() {
    const g = this.group, vis = this.vis, batch = this.batch;
    for (const k in vis) {
      const { mt, c, gs } = vis[k]; let n = 0, o = 0; for (const q of gs) n += q.attributes.position.count;
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
      for (const q of gs) { const A = q.attributes; P.set(A.position.array, o * 3); N.set(A.normal.array, o * 3); U.set(A.uv.array, o * 2); o += A.position.count; q.dispose(); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      const m = matMesh(geo, mt, c, true); if (mt === 'glass' || mt === 'neon') m.castShadow = false; g.add(m);
    }
    for (const k in batch) {
      const Bt = batch[k], geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(Bt.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(Bt.n, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(Bt.u, 2));
      const mt = 'ground_' + k, m = new THREE.Mesh(geo, Mats.get(mt)); m.castShadow = m.receiveShadow = true; m.userData.mt = mt; g.add(m);
    }
    this.vis = {}; this.batch = {};
  },
  road() {
    const geo = new THREE.PlaneGeometry(1400, 9).rotateX(-Math.PI / 2), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 1400 / 9);
    const road = new THREE.Mesh(geo, Mats.get('ground_road')); road.userData.mt = 'ground_road'; road.position.set(0, 0.02, ROAD_Z); road.receiveShadow = true; this.group.add(road);
  },
  // a deleted world object (delete gun): hide its instances
  removeItem(it) {
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const m of it.meshes) { m.setMatrixAt(it.idx, z); m.instanceMatrix.needsUpdate = true; }
  },
  // per frame: water animation + dark rooms (lights fade out while the camera is inside a dark zone)
  tick(dt) {
    Water.step(dt);
    for (const m of this.mirrors || []) m.visible = m.position.distanceTo(R.camera.position) < 22;
    const c = R.camera.position; let want = 0;
    for (const z of Env.zones) if (c.x > z[0] && c.x < z[1] && c.y > z[2] && c.y < z[3] && c.z > z[4] && c.z < z[5]) want = 1;
    const cur = R.dark || 0; if (cur === want) return;
    let k = cur + (want - cur) * (1 - Math.exp(-5 * dt)); if (Math.abs(k - want) < 0.004) k = want;
    R.dark = k; R.applyLights();
  },
  mountains(Th, rnd) { this.group.add(this.mountainMesh(Th, rnd)); },
  // a distant low-poly ring of ridges and peaks; snow caps where the theme has them, pre-hazed toward the fog colour
  mountainMesh(Th, rnd) {
    const NA = 150, radii = [320, 345, 372, 400, 432, 468, 510, 560, 640, 720], NR = radii.length;
    const ph = [0, 1, 2, 3, 4, 5].map(() => rnd() * 6.28);
    const pos = new Float32Array(NA * NR * 3), cols = new Float32Array(NA * NR * 3);
    const base = new THREE.Color(Th.mount), cap = Th.cap ? new THREE.Color(Th.cap) : null, fog = new THREE.Color(Th.fog[0]), c = new THREE.Color();
    const sm = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
      const a = (i + (j ? (rnd() - 0.5) * 0.6 : 0)) / NA * Math.PI * 2, r = radii[j] + (j && j < NR - 1 ? (rnd() - 0.5) * 18 : 0);
      // ridge line around the ring (a few octaves), sharpened into peaks
      let n = 0.5 + 0.22 * Math.sin(a * 3 + ph[0]) + 0.16 * Math.sin(a * 7 + ph[1]) + 0.1 * Math.sin(a * 13 + ph[2]) + 0.06 * Math.sin(a * 23 + ph[3]);
      n = clamp(n, 0.05, 1); n = n * n * (1.3 + 0.25 * Math.sin(a * 5 + ph[4]));
      const t = (r - 320) / 400, prof = sm(0, 0.35, t) * (1 - 0.3 * sm(0.55, 1, t));
      const h = j === 0 ? -3 : Math.max(0, Th.mountH * prof * (0.35 + n) + (rnd() - 0.5) * 9 * prof);
      const k = (j * NA + i) * 3; pos[k] = Math.cos(a) * r; pos[k + 1] = h; pos[k + 2] = Math.sin(a) * r;
      c.copy(base).multiplyScalar(0.8 + 0.3 * rnd());
      if (cap) c.lerp(cap, sm(Th.mountH * 0.5, Th.mountH * 0.62, h + (rnd() - 0.5) * 8));
      c.lerp(fog, (Th.haze ?? 1) * (0.35 + 0.25 * sm(380, 700, r))); cols.set([c.r, c.g, c.b], k);
    }
    const idx = [];
    for (let j = 0; j < NR - 1; j++) for (let i = 0; i < NA; i++) {
      const i2 = (i + 1) % NA, a0 = j * NA + i, a1 = j * NA + i2, b0 = (j + 1) * NA + i, b1 = (j + 1) * NA + i2;
      if ((i + j) & 1) idx.push(a0, a1, b0, a1, b1, b0); else idx.push(a0, b1, b0, a0, a1, b1);   // wound to face up / inward
    }
    let geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.setIndex(idx);
    geo = geo.toNonIndexed(); geo.computeVertexNormals();   // faceted: every triangle gets its own normal
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }));
    m.frustumCulled = false; m.userData.nw = true;
    return m;
  },
  // one InstancedMesh per mesh of a model (per material slot), using the tier's model set
  inst(name, list, mainType, mainColor) {
    const src = (R.path === 'ps1' && Models.srcPs1[name]) || Models.src[name], out = []; if (!src || !list.length) return out;
    src.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(src.matrixWorld).invert(), tmp = new THREE.Matrix4();
    src.traverse(o => {
      if (!o.isMesh) return;
      const sl = o.userData.slot, [t, c] = sl === 'main' ? [mainType, mainColor] : (SLOT_MATS[sl] || ['plastic', null]);
      const local = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), im = new THREE.InstancedMesh(o.geometry, Mats.get(t, c), list.length);
      list.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, local)));
      im.castShadow = im.receiveShadow = true; im.frustumCulled = false; im.userData.mt = t; im.userData.mc = c;
      this.group.add(im); out.push(im);
    });
    return out;
  },
};

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
