/* ---------------------------------------------------------------------------
   Map themes: sky, fog, lighting, ground and a decorated world around the play area.
   Decor is generated from a seed (identical on every peer), drawn with instancing and
   given static colliders. The host picks the theme (Rules.env).
   ------------------------------------------------------------------------- */
const THEMES = {
  plains: { label: 'Plains', ground: 'grass', zen: '#6f7c89', hor: '#b9c0c6', gnd: '#5d6650', sunAmt: 0.25, sun: 0.7, hemi: 1.9, fog: ['#adb5bb', 70, 430], tree: 'pine', treeCol: '#2f4a33', trees: 280, rockCol: '#7b7e79', road: true, boxes: true, mount: '#5c6a5c', cap: '#e4e9ec', mountH: 120 },
  desert: { label: 'Desert', ground: 'sand', zen: '#7fa6c6', hor: '#e1d4ba', gnd: '#b89a6c', sunAmt: 1.0, sun: 1.0, hemi: 1.3, fog: ['#dbcdb1', 110, 500], tree: 'palm', treeCol: '#557b35', trees: 90, rockCol: '#ae8963', road: true, boxes: true, mount: '#b08a62', mountH: 70 },
  snow: { label: 'Snow', ground: 'snow', zen: '#8894a1', hor: '#d8dfe5', gnd: '#cfd8df', sunAmt: 0.15, sun: 0.55, hemi: 2.2, fog: ['#d5dce2', 50, 360], tree: 'pine_snow', treeCol: '#2c4436', trees: 250, rockCol: '#8b929a', road: false, boxes: false, mount: '#7d8791', cap: '#eef2f5', mountH: 140 },
  void: { label: 'Void (grid)', ground: null },
  construct: { label: 'Construct', ground: 'grass', zen: '#3f8fd8', hor: '#c2e1f6', gnd: '#6f7a5f', sunAmt: 0.9, sun: 1.05, hemi: 1.3, fog: ['#c8def0', 260, 900], mount: '#5d8c48', mountH: 55, build: 'construct', flip: 1, treeCol: '#3f6b35',
    spawns: [[-7, 4.3, 33], [-3, 4.3, 33], [-11, 4.3, 33], [-7, 4.3, 29], [-7, 4.3, 37]], botSpawns: [[-50, 8.6, 70], [0, 4, -40], [30, 4, 0], [-50, 4, -20]] },
  flatgrass: { label: 'Flatgrass', ground: 'grass', zen: '#3b7fd4', hor: '#b9d6f0', gnd: '#5d7a45', sunAmt: 1.0, sun: 1.1, hemi: 1.25, fog: ['#c3daf0', 700, 2400], haze: 0.3, mount: '#4f7d3c', mountH: 60, build: 'flatgrass',
    spawns: [[0, 5.1, 0], [3, 5.1, 3], [-3, 5.1, 3], [3, 5.1, -3], [-3, 5.1, -3]], botSpawns: [[40, 0, 40], [-40, 0, -40], [60, 0, -20], [-60, 0, 20]] },
  bigcity: { label: 'Big City', ground: 'grass', zen: '#4a86c9', hor: '#c8d6e2', gnd: '#6a7060', sunAmt: 0.85, sun: 1.0, hemi: 1.3, fog: ['#c9d3dc', 420, 1700], haze: 0.45, mount: '#4f7446', mountH: 70, build: 'bigcity',
    spawns: [[-29, 0.3, -29], [-26, 0.3, -29], [-32, 0.3, -29], [-29, 0.3, -26], [-29, 0.3, -32]], botSpawns: [[29, 0.3, 29], [-87, 0.3, 29], [29, 0.3, -87], [87, 0.3, -29]] },
  arena: { label: 'Arena', ground: 'grid', zen: '#3668c9', hor: '#a4c7ee', gnd: '#5a6070', sunAmt: 1.0, sun: 1.1, hemi: 1.25, fog: ['#bcd0e8', 220, 900], build: 'arena',
    spawns: [[-29, 0.2, -5], [-29, 0.2, 0], [-29, 0.2, 5], [29, 0.2, -5], [29, 0.2, 0], [29, 0.2, 5]], botSpawns: [[0, 0, -15], [0, 0, 15], [-18, 0, 0], [18, 0, 0]] },
};
// ---- hand-built maps: original layouts in the spirit of a classic sandbox test map and an arena shooter map ----
// b(x, y, z, w, h, d, material, colour, yaw) = static box (y = its bottom); r(...) = ramp rising toward -Z; water(x, y, z, w, d)
const MAPS = {
  // gm_construct, laid out from a fan-made site plan of the original + reference screenshots (all geometry and textures
  // are our own). Coordinates are before the map flip. A 150 x 210 m walled field at 4 m; the upper field (8.5 m) across
  // the back, with a retaining edge by the garage and a grass hill over the dark room. Lake + beach + a wide water platform
  // on one side, the roofed building (two bays) with stairs to its roof, then the balcony tower (TWR-02). The garage sits in
  // the upper field's edge; the white room is down the stairs on its left, the dark room through a corridor on its right, and
  // a tunnel from the entrance by TWR-02 links them (plus the mirror room). Two tall towers on pillars: TWR-01 in the far
  // corner, TWR-03 behind the garage. Every piece is laid so no two surfaces overlap in the same plane (no z-fighting).
  construct(b, r, water, X) {
    const WH = '#e9ebec', CC = '#a9a7a1', GL = '#8fa6b3', MT = '#8a8d90', DK = '#26282b', WPm = 'ground_wplaster';
    const PL = [[0, 1.6, 'ground_plasterred'], [1.6, 99, 'ground_plaster']], PLAIN = [[0, 99, 'ground_plaster']], WP = [[0, 99, WPm]], BR = [[0, 99, 'ground_brick']], CO = [[0, 99, 'concrete', '#9b9994']];
    // straight wall from (x0,z0) to (x1,z1) along x or z: bottom y, height h, thickness t; holes [s0, s1, y0, y1, glass?]
    const wallH = (x0, z0, x1, z1, y, h, t, holes, bands, fl) => {
      const ax = z0 === z1, L = Math.abs(ax ? x1 - x0 : z1 - z0), sg = Math.sign(ax ? x1 - x0 : z1 - z0);
      const at = s => [ax ? x0 + sg * s : x0, ax ? z0 : z0 + sg * s];
      const cs = [...new Set([0, L, ...holes.flatMap(o => [o[0], o[1]])])].sort((a, c) => a - c);
      for (let i = 0; i < cs.length - 1; i++) {
        const s0 = cs[i], s1 = cs[i + 1], m = (s0 + s1) / 2, len = s1 - s0; if (len < 1e-3) continue;
        let solid = [[0, h]];
        for (const o of holes) if (o[0] < m && m < o[1]) solid = solid.flatMap(([a, c]) => [[a, Math.min(c, o[2])], [Math.max(a, o[3]), c]]).filter(([a, c]) => c - a > 1e-3);
        const [cx, cz] = at(m);
        for (const [a, c] of solid) for (const [ba, bb, mt, col] of bands) {
          const lo = Math.max(a, ba), hi = Math.min(c, bb); if (hi - lo > 1e-3) b(cx, y + lo, cz, ax ? len : t, hi - lo, ax ? t : len, mt, col, 0, fl);
        }
      }
      for (const o of holes) if (o[4]) { const [cx, cz] = at((o[0] + o[1]) / 2), len = o[1] - o[0]; b(cx, y + o[2], cz, ax ? len : 0.06, o[3] - o[2], ax ? 0.06 : len, 'glass', GL); }
    };
    // box from corner coordinates
    const bx = (x0, x1, y0, y1, z0, z1, mt, c, fl) => b((x0 + x1) / 2, Math.min(y0, y1), (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), mt, c, 0, fl);
    const banded = (x0, x1, z0, z1, y0, y1) => { bx(x0, x1, y0, y0 + 1.6, z0, z1, 'ground_plasterred'); bx(x0, x1, y0 + 1.6, y1, z0, z1, 'ground_plaster'); };
    // stairs: yaw 0 rises toward -z, PI toward +z, PI/2 toward -x, -PI/2 toward +x (invisible ramp collider + visible steps)
    const stairs = (cx, y, cz, w, rise, run, n, c, yaw = 0) => {
      r(cx, y, cz, w, rise, run, 'plastic', c, yaw, 2);
      const s = Math.sin(yaw), co = Math.cos(yaw);
      for (let k = 0; k < n; k++) { const lz = run / 2 - (k + 0.5) * run / n; b(cx + lz * s, y, cz + lz * co, w, (k + 1) * rise / n, run / n, 'plastic', c, yaw, 1); }
    };
    const tiles = (x0, x1, z0, z1, y = 4) => bx(x0, x1, y, y + 0.12, z0, z1, 'ground_tiles');
    const light = (x, y, z, w, d) => bx(x - w / 2, x + w / 2, y - 0.06, y, z - d / 2, z + d / 2, 'neon', '#fff1c9', 1);

    // ---- terrain ----------------------------------------------------------------------------------------------
    const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const LX = 9.6, LZ = 26.7;   // lake: x < LX, z > LZ (up to the water platform and the front wall)
    const lakeOut = (x, z) => { const dx = x - LX, dz = LZ - z; return dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz); };   // > 0 = outside the water
    const wob = (x, z) => 1.8 * Math.sin(z * 0.13) + 1.2 * Math.sin(x * 0.21 + 1);
    const inHall = (x, z) => x >= -14 && x <= 28 && z >= -70 && z <= -48, inT2 = (x, z) => x <= -48 && z >= -78 && z <= -48;
    X.terrain(152, 212, 2, (x, z) => {                                                     // grid points on even coordinates (edges below rely on it)
      if (inHall(x, z) || inT2(x, z)) return 4;
      if (z <= -50 && x < 35) return 8.5;                                                  // upper field behind the retaining edge
      if (x >= 35 && z < -39) return 4 + 4.5 * smooth((-39 - z) / 13);                      // the hill up to the upper field (over the dark room)
      if (x >= -53 && x <= -53 + 9 && z >= 64 && z <= 72) return 1;                          // the inlet in the water platform
      const o = lakeOut(x, z); if (x < -52 || o > 14) return 4;
      return o > 0 ? 3.1 + 0.9 * smooth(o / 12) : 3.1 - 2.4 * smooth(-o / 8);
    }, (x, z) => { if (x < -52 || z < 5) return 0; const o = lakeOut(x, z); return 1 - smooth((o - 7 - wob(x, z)) / 3); },
    (x, z) => (x > -72 && x < -66 && z > -52 && z < -44) || (x > -16 && x < -14 && z > -58 && z < -52) || (x > 28 && x < 30 && z > -62 && z < -56));   // holes: tunnel entrance, the garage's side passages
    water(-26, 3.1, 64.5, 72, 81);

    // ---- outer walls: plaster over a red band, dark cap; they rise from the upper field at the back -------------
    const wall = (x0, x1, z0, z1, g, top) => { bx(x0, x1, 0, g, z0, z1, 'ground_plaster'); bx(x0, x1, g, g + 1.6, z0, z1, 'ground_plasterred'); bx(x0, x1, g + 1.6, top, z0, z1, 'ground_plaster'); bx(x0 - 0.2, x1 + 0.2, top, top + 0.35, z0 - 0.2, z1 + 0.2, 'ground_roof'); };
    wall(-76, 76, 105, 106, 4, 14); wall(-76, 76, -106, -105, 8.5, 17); wall(-76, -75, -105, 105, 4, 15); wall(75, 76, -105, 105, 4, 15);

    // ---- water platform (with its inlet) and the stairs up onto the roofed building ---------------------------
    bx(-75, -53, 0, 4.4, 8, 64, 'ground_tiles'); bx(-75, -62, 0, 4.4, 64, 72, 'ground_tiles'); bx(-75, -53, 0, 4.4, 72, 105, 'ground_tiles');
    stairs(-71.25, 4.4, 0.2, 4.5, 5.52, 15.6, 22, '#c9c7c0');                               // quay -> roof (9.92)
    bx(-68.9, -68.7, 4.4, 5.4, -8, 8, 'metal', MT, 1);                                     // handrail

    // ---- the roofed building: two garage bays and an office, flat roof you can walk on ----------------------------
    {
      const y = 4, H = 5.5, X0 = -75, X1 = -58, Z0 = -8, Z1 = -42;
      wallH(-58.25, Z0, -58.25, Z1, y, H, 0.5, [[7, 11.5, 0, 3.8], [14.5, 19, 0, 3.8], [23, 24.4, 0, 2.3], [27, 29, 2.6, 3.3, 1], [29.6, 31.6, 2.6, 3.3, 1]], PL);
      wallH(X0, Z0 - 0.25, -58.5, Z0 - 0.25, y, H, 0.5, [], PL); wallH(X0, Z1 + 0.25, -58.5, Z1 + 0.25, y, H, 0.5, [], PL);
      bx(X0, -57.6, 9.5, 9.92, -7.6, -42.4, 'ground_roof'); bx(-57.6, -57.4, 9.3, 10.0, -7.6, -42.4, 'ground_plaster', null, 1);
      bx(X0, -58.5, 4, 4.08, -8.5, -41.5, 'concrete', '#8d8b86');
      const frame = (zc, w, h) => { const c = '#9c9a94'; bx(-58, -57.7, 4, 4 + h + 0.3, zc + w / 2, zc + w / 2 + 0.4, 'concrete', c); bx(-58, -57.7, 4, 4 + h + 0.3, zc - w / 2 - 0.4, zc - w / 2, 'concrete', c); bx(-58, -57.7, 4 + h, 4 + h + 0.3, zc - w / 2, zc + w / 2, 'concrete', c); };
      frame(-17.25, 4.5, 3.8); frame(-24.75, 4.5, 3.8); frame(-31.7, 1.4, 2.3);
      wallH(X0, -21.25, -58.5, -21.25, y, H, 0.5, [[4, 5.4, 0, 2.3]], PLAIN);               // between the bays
      wallH(X0, -30.75, -58.5, -30.75, y, H, 0.5, [[4, 5.4, 0, 2.3]], PLAIN);               // office
      light(-66, 9.44, -14, 6, 0.5); light(-66, 9.44, -26, 6, 0.5); light(-66, 9.44, -36, 4, 0.5);
      tiles(-58, -51, -8, -44);
    }

    // ---- TWR-02, the white balcony tower: 9 floors, switchback stairs, rooms, corner balconies, roof ----------------
    {
      const x0 = -74, x1 = -50, z0 = -55, z1 = -75, FH = 3.2, yF = i => 4.3 + FH * i, SL = '#d6d5cf', W = x1 - x0, D = z0 - z1, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const la = x0 + 0.3, lb = la + 2.2, lc = lb + 2.0, s0 = z0 - 3.5, s1 = s0 - 8;      // stair lanes (x) and run (z)
      bx(x0 - 0.3, x1 + 0.3, 4, 4.3, z1 - 0.3, z0 + 0.3, 'concrete', '#c4c3bd');
      for (let i = 1; i <= 9; i++) {                                                      // floor slabs around the stairwell hole
        const y = yF(i) - 0.3, hx = i === 9 ? lb : lc;
        bx(x0 - 0.25, x1 + 0.25, y, y + 0.3, s0, z0 + 0.25, 'concrete', SL); bx(x0 - 0.25, x1 + 0.25, y, y + 0.3, z1 - 0.25, s1, 'concrete', SL);
        bx(x0 - 0.25, la, y, y + 0.3, s1, s0, 'concrete', SL); bx(hx, x1 + 0.25, y, y + 0.3, s1, s0, 'concrete', SL);
        const fm = i === 9 ? 'ground_roof' : 'ground_tiles', yt = yF(i);                   // floor finish, just above the slab
        bx(x0 + 0.3, x1 - 0.3, yt, yt + 0.02, s0, z0 - 0.3, fm, null, 1); bx(x0 + 0.3, x1 - 0.3, yt, yt + 0.02, z1 + 0.3, s1, fm, null, 1); bx(hx, x1 - 0.3, yt, yt + 0.02, s1, s0, fm, null, 1);
      }
      for (let i = 0; i < 9; i++) {
        const y = yF(i), h = FH - 0.3, bands = i ? WP : [[0, 99, 'concrete', '#c9c8c2']];
        const win = (n, bw, door) => { const o = []; for (let k = 0; k < n; k++) o.push(door && door[k] ? [k * bw + (bw - door[k]) / 2, k * bw + (bw + door[k]) / 2, 0, i ? 2.4 : 2.6] : [k * bw + 0.4, k * bw + bw - 0.4, 0.8, 2.5, 1]); return o; };
        // the long faces run the full width; the short faces fit between them (no overlapping corners)
        wallH(x0, z0 - 0.15, x1, z0 - 0.15, y, h, 0.3, win(8, W / 8, i ? null : { 3: 3 }), bands);
        wallH(x0, z1 + 0.15, x1, z1 + 0.15, y, h, 0.3, win(8, W / 8, i ? { 7: 2.2 } : null), bands);
        wallH(x1 - 0.15, z0 - 0.3, x1 - 0.15, z1 + 0.3, y, h, 0.3, win(6, (D - 0.6) / 6, i ? { 5: 2.2 } : { 2: 3 }), bands);
        wallH(x0 + 0.15, z0 - 0.3, x0 + 0.15, z1 + 0.3, y, h, 0.3, win(6, (D - 0.6) / 6), bands);
        if (i % 2 === 0) r((la + lb) / 2, y, (s0 + s1) / 2, lb - la, FH, 8, 'concrete', '#cfcdc6'); else r((lb + lc) / 2, y, (s0 + s1) / 2, lc - lb, FH, 8, 'concrete', '#cfcdc6', Math.PI);
        bx(lb - 0.06, lb + 0.06, y, y + h, s1, s0, WPm);
        if (i) {
          bx(lc + 0.01, lc + 0.11, y, y + 1.0, s1, s0, 'metal', MT);
          wallH(x1 - 9, z0 - 0.3, x1 - 9, z1 + 0.3, y, h, 0.2, [[1.8, 3.2, 0, 2.2], [D - 3.9, D - 2.5, 0, 2.2]], WP);
          wallH(x1 - 8.9, cz, x1 - 0.3, cz, y, h, 0.2, [[2, 3.4, 0, 2.2]], WP);
          bx(x1 + 0.25, x1 + 1.8, y - 0.3, y, z1 - 0.25, z1 + 4.6, WPm); bx(x1 + 1.65, x1 + 1.8, y, y + 1, z1 - 1.65, z1 + 4.6, WPm); bx(x1 + 0.25, x1 + 1.65, y, y + 1, z1 + 4.45, z1 + 4.6, WPm);
          bx(x1 - 5.6, x1 + 1.8, y - 0.3, y, z1 - 1.8, z1 - 0.25, WPm); bx(x1 - 5.6, x1 + 1.8, y, y + 1, z1 - 1.8, z1 - 1.65, WPm); bx(x1 - 5.6, x1 - 5.45, y, y + 1, z1 - 1.65, z1 - 0.25, WPm);
        }
      }
      const yR = yF(9);
      bx(x0 - 0.25, x1 + 0.25, yR, yR + 1, z0 + 0.05, z0 + 0.25, WPm); bx(x0 - 0.25, x1 + 0.25, yR, yR + 1, z1 - 0.25, z1 - 0.05, WPm);
      bx(x0 - 0.25, x0 - 0.05, yR, yR + 1, z1 - 0.05, z0 + 0.05, WPm); bx(x1 + 0.05, x1 + 0.25, yR, yR + 1, z1 - 0.05, z0 + 0.05, WPm);
      bx(lb + 0.01, lb + 0.11, yR, yR + 1, s1, s0, 'metal', MT); bx(la + 0.02, lb, yR, yR + 1, s0 + 0.01, s0 + 0.11, 'metal', MT);
      bx(cx - 1.75, cx + 1.75, yR, yR + 2.4, cz + 1, cz + 4.5, WPm); bx(cx - 1.95, cx + 1.95, yR + 2.4, yR + 2.6, cz + 0.8, cz + 4.7, 'ground_roof');
      tiles(-64, -48, -54, -50); tiles(-75, -48, -78, -54); tiles(-64, -58, -50, -44);
    }

    // ---- the upper field's edge: retaining walls, the ramp up on the left of the garage, white stairs on its right ----
    banded(-46, -14, -50, -48, 4, 8.52); banded(28, 35, -50, -48, 4, 8.52);
    banded(-48, -46, -80, -50, 4, 8.52); banded(-75, -48, -80, -78, 4, 8.52);              // around TWR-02's plot
    r(-32, 4, -46, 4, 4.5, 28, 'concrete', CC, -Math.PI / 2); r(-32, 4, -43.85, 0.3, 5.5, 28, 'ground_plaster', null, -Math.PI / 2);
    bx(-18, -14, 4, 8.52, -48, -44, 'concrete', CC);                                       // landing at the top of the ramp
    stairs(30.5, 4, -43, 4, 4.52, 10, 15, WH);                                             // field -> upper field
    tiles(-51, 28, -44, -40); tiles(-46, -14, -70, -50, 8.5);                              // the covered way; the upper paving

    // ---- the garage: sunk into the upper field; big framed opening, side door, doors to the white / dark rooms ----
    {
      const y = 4, H = 4.5;
      wallH(-14, -50.25, 28, -50.25, y, H, 0.5, [[15, 27, 0, 3.4], [34, 35.4, 0, 2.3]], BR);
      wallH(-13.75, -50.5, -13.75, -69.5, y, H, 0.5, [[3.5, 5.5, 0, 2.4]], BR);            // west: door to the white room stairs
      wallH(27.75, -50.5, 27.75, -69.5, y, H, 0.5, [[7.5, 9.5, 0, 2.4]], BR);              // east: door to the dark room corridor
      wallH(-14, -69.75, 28, -69.75, y, H, 0.5, [], BR);
      bx(-14, 28, 8.5, 8.9, -70, -50, 'ground_roof');
      const DF = '#4d4f52'; bx(0.3, 1, 4, 7.8, -50, -49.7, 'concrete', DF); bx(13, 13.7, 4, 7.8, -50, -49.7, 'concrete', DF); bx(0.3, 13.7, 7.4, 7.8, -49.7, -49.4, 'concrete', DF);
      bx(-13.5, 27.5, 4, 4.1, -69.5, -50.5, 'ground_tiles');
      for (const x of [-2, 7, 16]) for (const z of [-57, -63]) bx(x - 0.3, x + 0.3, 4.1, 8.5, z - 0.3, z + 0.3, 'concrete', '#b5b3ad');
      wallH(-13.5, -65, 27.5, -65, 4.1, 4.4, 0.3, [[9, 11, 0, 2.4], [30, 32, 0, 2.4]], PLAIN);
      for (const x of [-6, 3, 12, 21]) bx(x - 1.5, x + 1.5, 8.9, 9.15, -63, -57, 'glass', '#5d7482', 1);
      for (const x of [-6, 7, 20]) light(x, 8.5, -56, 3, 0.4);
      // earth fill around the sunk garage (hides the terrain's slope), cut for the two side passages
      const fill = (x0, x1, z0, z1, y0 = 4) => bx(x0, x1, y0, 8.52, z0, z1, 'ground_grass');
      fill(-16, -14, -52, -50); fill(-16, -14, -72, -58); fill(-16, -14, -58, -52, 7.2);
      fill(28, 30, -56, -50); fill(28, 30, -72, -62); fill(28, 30, -62, -56, 7.2);
      fill(-14, 28, -72, -70);
    }

    // ---- the white room: down the stairs through the garage's left wall; glowing white walls, floor and ceiling ----
    {
      const x0 = -44, x1 = -17, z0 = -52, z1 = -68, f = 0.5, top = 8.2;
      bx(-16.5, -14, 3.9, 4.0, -56, -54, 'concrete', CC); bx(-16.5, -14, 6.9, 7.2, -56, -54, 'concrete', CC);   // passage from the garage
      bx(-16.5, -14, 4, 6.9, -54, -53.7, 'ground_plaster'); bx(-16.5, -14, 4, 6.9, -56.3, -56, 'ground_plaster');
      wallH(x0, z0 + 0.25, x1, z0 + 0.25, f, top - f, 0.5, [], PLAIN); wallH(x0, z1 - 0.25, x1, z1 - 0.25, f, top - f, 0.5, [[14, 18, 0, 2.6]], PLAIN);
      wallH(x0 - 0.25, z0 + 0.5, x0 - 0.25, z1 - 0.5, f, top - f, 0.5, [], PLAIN); wallH(x1 + 0.25, z0 + 0.5, x1 + 0.25, z1 - 0.5, f, top - f, 0.5, [[2.5, 4.5, 3.5, 5.9]], PLAIN);
      bx(x0 - 0.5, x1 + 0.5, f - 0.3, f, z1 - 0.5, z0 + 0.5, 'concrete', '#cfcfcf'); bx(x0 - 0.5, x1 + 0.5, top, top + 0.25, z1 - 0.5, z0 + 0.5, 'concrete', '#cfcfcf');
      bx(x1 - 3, x1, 3.7, 4.0, -53, -57, 'concrete', '#dcdcdc');                              // landing, then stairs down along the wall
      stairs(x1 - 1.5, f, -61, 3, 3.5, 8, 14, '#dcdcdc', Math.PI);
      const lw = (a, c, y0, y1, d0, d1) => bx(a, c, y0, y1, d0, d1, 'neon', '#a8a8a8', 1);
      lw(x0, x1, f, f + 0.03, z1, z0); lw(x0, x1, top - 0.04, top, z1, z0);
      lw(x0, x0 + 0.04, f, top, z1, z0); lw(x1 - 0.04, x1, f, top, z0 - 0.02, z0 - 2); lw(x1 - 0.04, x1, f, top, z0 - 4, z1);
      lw(x1 - 0.04, x1, f, 3.7, z0 - 2, z0 - 4); lw(x1 - 0.04, x1, 6.4, top, z0 - 2, z0 - 4);
      lw(x0, x1, f, top, z0 - 0.04, z0); lw(x0, -30, f, top, z1, z1 + 0.04); lw(-26, x1, f, top, z1, z1 + 0.04); lw(-30, -26, 3.1, top, z1, z1 + 0.04);
    }

    // ---- the tunnels: the entrance by TWR-02 goes down under everything to the dark room, with branches ------------
    {
      const f = 0.5, c0 = 3.7, T = 'concrete', TC = '#6f6e6a';
      const tube = (x0, x1, z0, z1) => { bx(x0, x1, f - 0.3, f, z0, z1, T, TC); bx(x0, x1, c0, c0 + 0.25, z0, z1, T, TC); };
      r(-69, f, -49, 4, 3.5, 10, T, CC, Math.PI);                                              // entrance ramp (4 m at z -44 down to the tunnel)
      bx(-74, -71, f, 4.25, -54, -44, T, '#8f8d88'); bx(-67, -64, f, 4.25, -52, -44, T, '#8f8d88');   // trench walls (they also hide the hole's edge)
      tube(-71, -67, -52, -79); tube(-71, 35.5, -79, -83);
      bx(-71.5, -71, f, c0, -54, -83.5, 'ground_plaster'); bx(-67, -66.5, f, c0, -52, -79, 'ground_plaster');
      bx(-71, 35.5, f, c0, -83.5, -83, 'ground_plaster');
      bx(-66.5, -30, f, c0, -78.5, -79, 'ground_plaster'); bx(-26, 35.5, f, c0, -78.5, -79, 'ground_plaster');
      for (let x = -62; x < 34; x += 9) light(x, c0, -81, 0.5, 2.4);
      for (let z = -58; z > -80; z -= 9) light(-69, c0, z, 2.4, 0.5);
      // branch up to the white room (and the mirror room off it)
      tube(-30, -26, -68.5, -78.5); bx(-30.5, -30, f, c0, -68.5, -71, 'ground_plaster'); bx(-30.5, -30, f, c0, -73, -78.5, 'ground_plaster'); bx(-30.5, -30, 3.1, c0, -71, -73, 'ground_plaster');
      bx(-26, -25.5, f, c0, -68.5, -78.5, 'ground_plaster');
      light(-28, c0, -73.5, 0.5, 2.4);
      // the mirror room: a mirror wall (see Env: X.mirror) and a door in the branch's wall
      bx(-44, -30.5, f - 0.3, f, -78.5, -68.5, T, '#7c7b77'); bx(-44, -30.5, c0, c0 + 0.25, -78.5, -68.5, T, '#7c7b77');
      bx(-44.5, -44, f, c0, -68.5, -78.5, 'ground_plaster');
      X.mirror(-43.98, f + 0.2, -73.5, 8, 3);
      light(-37, c0, -73.5, 4, 0.5);
    }

    // ---- the dark room: under the upper field, through the corridor on the garage's right (and the tunnel) -----------
    {
      const x0 = 36, x1 = 74, z0 = -54, z1 = -92, f = 0.5, top = 8.1, K = '#141414';
      wallH(x0 - 0.25, z0, x0 - 0.25, z1, f, top - f, 0.5, [[4, 7, 0, 3.2], [25, 29, 0, 3.2]], [[0, 99, 'concrete', K]]);
      wallH(x1 + 0.25, z0, x1 + 0.25, z1, f, top - f, 0.5, [], [[0, 99, 'concrete', K]]);
      wallH(x0 - 0.5, z0 + 0.25, x1 + 0.5, z0 + 0.25, f, top - f, 0.5, [], [[0, 99, 'concrete', K]]); wallH(x0 - 0.5, z1 - 0.25, x1 + 0.5, z1 - 0.25, f, top - f, 0.5, [], [[0, 99, 'concrete', K]]);
      bx(x0 - 0.5, x1 + 0.5, f - 0.3, f, z1 - 0.5, z0 + 0.5, 'concrete', '#1b1b1b'); bx(x0 - 0.5, x1 + 0.5, top, top + 0.25, z1 - 0.5, z0 + 0.5, 'concrete', K);
      X.zone(x0, x1, f, top, z1, z0);
      // corridor from the garage's east door: along +x, stairs down to the dark room's floor
      bx(28, 30.5, 3.7, 4.0, -60.3, -57.7, 'concrete', CC);
      stairs(33, f, -59, 2.6, 3.5, 5, 10, '#77756f', Math.PI / 2);
      bx(28, 35.5, f, 6.9, -57.7, -57.4, 'concrete', '#55534f'); bx(28, 35.5, f, 6.9, -60.6, -60.3, 'concrete', '#55534f');
      bx(28, 35.5, 6.9, 7.2, -60.6, -57.4, 'concrete', '#55534f');
    }

    // ---- TWR-03 behind the garage and TWR-01 in the far corner: tall towers standing on pillars ----------------------
    const pillared = (x0, x1, z0, z1, y, lift, h, tex, bay, bayH) => {
      const P = 3, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      for (const [px, pz] of [[x0, z0], [x1 - P, z0], [x0, z1 - P], [x1 - P, z1 - P]]) bx(px, px + P, y, y + lift - 0.4, pz, pz + P, 'concrete', '#bdbcb6');
      bx(cx - 3, cx + 3, y, y + lift - 0.4, cz - 3, cz + 3, 'ground_wplaster');             // stair core
      bx(x0, x1, y + lift - 0.4, y + lift, z0, z1, 'concrete', '#b0afa9');                   // underside
      X.facade(cx, y + lift, cz, x1 - x0, h, z1 - z0, tex, bay, bayH, true);
    };
    pillared(-2, 30, -102, -76, 8.5, 8, 70, 'facade_t', 4, 3.1);
    pillared(45, 73, 67, 102, 4, 7, 56, 'facade_a2', 3.2, 3);
    tiles(40, 75, 62, 105);

    // ---- skyline: apartment blocks, chimneys, a tree line, green hills (the mountain ring) ----
    const rnd = X.rnd, fac = ['facade_a1', 'facade_a2', 'facade_a3', 'facade_a4', 'facade_a1', 'facade_w', 'facade_t'];
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2, rr = 150 + rnd() * 150, x = Math.cos(a) * rr, z = Math.sin(a) * rr * 1.2;
      if (Math.abs(x) < 110 && Math.abs(z) < 135) continue;
      const tall = rnd() < 0.2, w = 14 + rnd() * 16, d = 11 + rnd() * 10, h = tall ? 45 + rnd() * 45 : 14 + rnd() * 26;
      X.facade(x, 0, z, w, h, d, fac[(rnd() * fac.length) | 0], 3.2, 3, false, rnd() * Math.PI);
    }
    for (const [x, z] of [[-150, -265], [-138, -270], [-126, -262], [185, -235]]) X.cyl(x, 0, z, 2.6, 58, '#6e5f53');
    for (let i = 0; i < 150; i++) {
      const side = i % 4, t = rnd() * 2 - 1, off = 84 + rnd() * 24;
      const [x, z] = side === 0 ? [t * 90, off + 30] : side === 1 ? [t * 90, -off - 30] : side === 2 ? [off, t * 120] : [-off, t * 120];
      X.tree(x, z, 0.9 + rnd() * 0.8);
    }
  },
  // gm_flatgrass: endless flat grass; in the middle the raised brick platform (rounded corners, concrete top, a trim ledge,
  // a passage straight through it and a sealed secret room with a doll), a "FLATTYWOOD" sign on the hills and a city far off.
  flatgrass(b, r, water, X) {
    const S = 32, H = 4.4, R0 = 5, P = 6, PH = 3;          // platform size, brick height, corner radius, passage width / height
    const bx = (x0, x1, y0, y1, z0, z1, mt, c, fl) => b((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, mt, c, 0, fl);
    const hs = S / 2, hp = P / 2;
    // looks: rounded prisms (lower halves either side of the passage, the part above the passage, the ledge, the concrete top)
    const rr = (x0, x1, z0, z1, rad, corners) => {   // rounded rectangle outline; corners = which of [x0z0, x1z0, x1z1, x0z1] are round
      const pts = [], arc = (cx, cz, a0) => { for (let i = 0; i <= 6; i++) { const a = a0 + i / 6 * Math.PI / 2; pts.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]); } };
      corners[0] ? arc(x0 + rad, z0 + rad, Math.PI) : pts.push([x0, z0]); corners[1] ? arc(x1 - rad, z0 + rad, Math.PI * 1.5) : pts.push([x1, z0]);
      corners[2] ? arc(x1 - rad, z1 - rad, 0) : pts.push([x1, z1]); corners[3] ? arc(x0 + rad, z1 - rad, Math.PI / 2) : pts.push([x0, z1]);
      return pts;
    };
    X.prism(rr(-hs, -hp, -hs, hs, R0, [1, 0, 0, 1]), 0, PH, 'ground_brick'); X.prism(rr(hp, hs, -hs, hs, R0, [0, 1, 1, 0]), 0, PH, 'ground_brick');
    X.prism(rr(-hs, hs, -hs, hs, R0, [1, 1, 1, 1]), PH, H, 'ground_brick');
    X.prism(rr(-hs - 0.15, hs + 0.15, -hs - 0.15, hs + 0.15, R0 + 0.15, [1, 1, 1, 1]), 2.1, 2.45, 'concrete', '#8f8a82', true);   // trim ledge
    X.prism(rr(-hs - 0.45, hs + 0.45, -hs - 0.45, hs + 0.45, R0 + 0.45, [1, 1, 1, 1]), H, H + 0.5, 'concrete', '#c9c7c1');
    // collision: boxes + corner posts matching the rounded blocks, hollow around the secret room, open through the passage
    const room = [-hs + 3, -hs + 9, -3, 3], c = hs - R0;       // secret room inside the -x half (x0, x1, z0, z1), 2.6 m tall
    bx(-hs, -hs + 3, 0, PH, -c, c, 'plastic', null, 2); bx(-hs + 3, -c, 0, PH, -c, -3, 'plastic', null, 2); bx(-hs + 3, -c, 0, PH, 3, c, 'plastic', null, 2);
    bx(-c, -hp, 0, PH, -hs, -3, 'plastic', null, 2); bx(-c, -hp, 0, PH, 3, hs, 'plastic', null, 2); bx(room[0], room[1], 2.6, PH, -3, 3, 'plastic', null, 2);
    bx(room[1], -hp, 0, 2.6, -3, 3, 'plastic', null, 2);
    bx(hp, c, 0, PH, -hs, hs, 'plastic', null, 2); bx(c, hs, 0, PH, -c, c, 'plastic', null, 2);
    bx(-hs, hs, PH, H + 0.5, -c, c, 'plastic', null, 2); bx(-c, c, PH, H + 0.5, -hs, -c, 'plastic', null, 2); bx(-c, c, PH, H + 0.5, c, hs, 'plastic', null, 2);
    for (const [cx, cz] of [[-c, -c], [c, -c], [c, c], [-c, c]]) X.post(cx, 0, cz, R0, H + 0.5);
    // inside the secret room: plain walls, a single bulb, a doll sitting against the wall
    const iw = '#d8d2c4';
    bx(room[0], room[1], 0, 0.02, room[2], room[3], 'concrete', '#8d8a84', 1); bx(room[0], room[1], 2.58, 2.6, room[2], room[3], 'concrete', iw, 1);
    bx(room[0], room[0] + 0.02, 0, 2.6, room[2], room[3], 'concrete', iw, 1); bx(room[1] - 0.02, room[1], 0, 2.6, room[2], room[3], 'concrete', iw, 1);
    bx(room[0] + 0.02, room[1] - 0.02, 0, 2.6, room[2], room[2] + 0.02, 'concrete', iw, 1); bx(room[0] + 0.02, room[1] - 0.02, 0, 2.6, room[3] - 0.02, room[3], 'concrete', iw, 1);
    bx(-hs + 5.8, -hs + 6.2, 2.4, 2.56, -0.2, 0.2, 'neon', '#fff3c4', 1);
    const dx = room[0] + 0.45;   // the doll
    bx(dx - 0.2, dx + 0.2, 0.02, 0.18, -0.25, 0.25, 'fabric', '#b3485a', 1); bx(dx - 0.14, dx + 0.14, 0.18, 0.58, -0.17, 0.17, 'fabric', '#b3485a', 1); bx(dx - 0.13, dx + 0.13, 0.58, 0.84, -0.13, 0.13, 'fabric', '#e6c7a8', 1);
    bx(dx + 0.12, dx + 0.52, 0.02, 0.12, -0.16, -0.04, 'fabric', '#6a4d3a', 1); bx(dx + 0.12, dx + 0.52, 0.02, 0.12, 0.04, 0.16, 'fabric', '#6a4d3a', 1);
    // distant landmarks: the sign on the hills, a city far off
    X.sign('FLATTYWOOD', 0, 40, -330, 230, 34);
    const rnd = X.rnd;
    for (let i = 0; i < 40; i++) { const a = -0.5 + rnd() * 1.0 + Math.PI / 2, rr2 = 380 + rnd() * 120, x = Math.cos(a) * rr2, z = Math.sin(a) * rr2; const tall = rnd() < 0.3; X.facade(x, 0, z, 14 + rnd() * 18, tall ? 50 + rnd() * 60 : 18 + rnd() * 30, 12 + rnd() * 12, ['facade_a1', 'facade_a2', 'facade_a4', 'facade_w', 'facade_t'][(rnd() * 5) | 0], 3.2, 3, false, rnd() * Math.PI); }
  },
  // gm_bigcity: a dense grid of blocky buildings (brown, tan, grey; taller downtown), streets with lanes and crosswalks,
  // sidewalks and street lights, a park in the middle; hills around it.
  bigcity(b, r, water, X) {
    const N = 7, BL = 44, ST = 14, PITCH = BL + ST, HALF = N * PITCH / 2, rnd = X.rnd;
    const bx = (x0, x1, y0, y1, z0, z1, mt, c, fl) => b((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, mt, c, 0, fl);
    const edge = i => -HALF + i * PITCH;                        // west / north edge of block row i (streets are between blocks)
    // asphalt for the whole grid, then sidewalks (blocks raised 0.15), lane dashes, crosswalks, lights
    bx(-HALF - ST, HALF + ST, 0, 0.02, -HALF - ST, HALF + ST, 'ground_asphalt');
    const tex = ['facade_a1', 'facade_a2', 'facade_a3', 'facade_a4', 'facade_a3', 'facade_a1', 'facade_w', 'facade_t'];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x0 = edge(i) + ST / 2, z0 = edge(j) + ST / 2, x1 = x0 + BL, z1 = z0 + BL, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      bx(x0, x1, 0.02, 0.17, z0, z1, 'ground_tiles');           // sidewalk slab
      const d = Math.hypot(cx, cz) / HALF, park = i === 3 && j === 3;
      if (park) {                                                 // the park: grass, trees, paths, benches
        bx(x0 + 3, x1 - 3, 0.17, 0.25, z0 + 3, z1 - 3, 'ground_grass');
        bx(cx - 1.5, cx + 1.5, 0.25, 0.27, z0 + 3, z1 - 3, 'ground_tiles', null, 1); bx(x0 + 3, x1 - 3, 0.25, 0.27, cz - 1.5, cz + 1.5, 'ground_tiles', null, 1);
        for (let k = 0; k < 14; k++) { const tx = x0 + 6 + rnd() * (BL - 12), tz = z0 + 6 + rnd() * (BL - 12); if (Math.abs(tx - cx) > 3 && Math.abs(tz - cz) > 3) X.tree(tx, tz, 0.8 + rnd() * 0.5); }
        for (const [bxx, bzz] of [[cx + 4, cz + 4], [cx - 4, cz - 4], [cx + 4, cz - 4], [cx - 4, cz + 4]]) { bx(bxx - 1, bxx + 1, 0.25, 0.7, bzz - 0.3, bzz + 0.3, 'wood', '#7a5a3a'); }
        continue;
      }
      // split the block into 1-4 lots, each a building (a few left as plazas / parking)
      const lots = rnd() < 0.3 ? [[x0, x1, z0, z1]] : rnd() < 0.5 ? [[x0, cx, z0, z1], [cx, x1, z0, z1]] : [[x0, cx, z0, cz], [cx, x1, z0, cz], [x0, cx, cz, z1], [cx, x1, cz, z1]];
      for (const [a0, a1, c0, c1] of lots) {
        if (rnd() < 0.08) { bx(a0 + 2, a1 - 2, 0.17, 0.19, c0 + 2, c1 - 2, 'concrete', '#6c6d70', 1); continue; }   // empty lot / parking
        const w = a1 - a0 - 4, dd = c1 - c0 - 4, down = 1 - d;
        const h = down > 0.55 && rnd() < 0.6 ? 70 + rnd() * 70 : 12 + rnd() * (28 + down * 40);
        const t = h > 65 ? (rnd() < 0.5 ? 'facade_t' : 'facade_w') : tex[(rnd() * tex.length) | 0];
        X.facade((a0 + a1) / 2, 0.17, (c0 + c1) / 2, w, h, dd, t, 3.2, 3, true);
        if (h > 40 && rnd() < 0.5) X.facade((a0 + a1) / 2, 0.17 + h, (c0 + c1) / 2, w * 0.55, 6 + rnd() * 10, dd * 0.55, t, 3.2, 3, true);   // setback crown
      }
      // street lights on the block corners
      for (const [lx, lz] of [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1]]) { bx(lx - 0.1, lx + 0.1, 0.17, 6.2, lz - 0.1, lz + 0.1, 'metal', '#4a4d52'); bx(lx - 0.35, lx + 0.35, 6.2, 6.4, lz - 0.35, lz + 0.35, 'neon', '#fff1c9', 1); }
    }
    // lane dashes (not through the intersections) and zebra crossings on every side of every intersection
    const inX = k => { const m = ((k + HALF) % PITCH + PITCH) % PITCH; return m < ST / 2 + 3.5 || m > PITCH - ST / 2 - 0.5; };
    for (let i = 0; i <= N; i++) {
      const s = edge(i);
      for (let k = -HALF + ST / 2; k < HALF - ST / 2; k += 6) if (!inX(k)) { bx(s - 0.1, s + 0.1, 0.02, 0.03, k, k + 3, 'plastic', '#e0b83a', 1); bx(k, k + 3, 0.02, 0.03, s - 0.1, s + 0.1, 'plastic', '#e0b83a', 1); }
      for (let j = 0; j <= N; j++) {
        const t = edge(j), W2 = ST / 2 - 0.8;
        for (let q = 0; q < 8; q++) {
          const o = -W2 + q * (2 * W2 / 8) + 0.3;
          for (const sd of [-1, 1]) {
            bx(s + o, s + o + 0.8, 0.02, 0.03, t + sd * (ST / 2 + 0.5) - (sd < 0 ? 2.5 : 0), t + sd * (ST / 2 + 0.5) + (sd > 0 ? 2.5 : 0), 'plastic', '#e9e9e4', 1);   // across the street along z
            bx(s + sd * (ST / 2 + 0.5) - (sd < 0 ? 2.5 : 0), s + sd * (ST / 2 + 0.5) + (sd > 0 ? 2.5 : 0), 0.02, 0.03, t + o, t + o + 0.8, 'plastic', '#e9e9e4', 1);   // across the street along x
          }
        }
      }
    }
    // outskirts: grass beyond the grid, a few far towers
    for (let i = 0; i < 30; i++) { const a = rnd() * Math.PI * 2, rr2 = HALF + 90 + rnd() * 120; X.facade(Math.cos(a) * rr2, 0, Math.sin(a) * rr2, 16 + rnd() * 14, 20 + rnd() * 50, 14 + rnd() * 12, tex[(rnd() * tex.length) | 0], 3.2, 3, false, rnd() * Math.PI); }
  },
  arena(b, r) {
    const W = '#e6e8ec', GR = '#a3a9b3', RED = '#d64541', BLU = '#2e86de';
    b(0, 0, 0, 68, 0.05, 40, 'concrete', '#d5d8dd');
    b(-22, 0.05, 0, 22, 0.02, 38, 'plastic', '#e8b4b1'); b(22, 0.05, 0, 22, 0.02, 38, 'plastic', '#b3cdea');
    b(0, 0, -20.5, 70, 6, 1, 'concrete', W); b(0, 0, 20.5, 70, 6, 1, 'concrete', W); b(-34.5, 0, 0, 1, 6, 42, 'concrete', W); b(34.5, 0, 0, 1, 6, 42, 'concrete', W);
    // centre: raised platform with ramps and a low wall on top
    b(0, 0, 0, 8, 1.5, 8, 'concrete', GR); r(0, 0, 6, 3, 1.5, 4, 'concrete', GR); r(0, 0, -6, 3, 1.5, 4, 'concrete', GR, Math.PI); b(0, 1.5, 0, 3.2, 1.1, 0.4, 'concrete', W);
    for (const s of [-1, 1]) {        // everything else mirrored for the two teams
      const T = s < 0 ? RED : BLU;
      for (const z of [-10, 10]) b(s * 10, 0, z * s, 0.6, 2.2, 6, 'concrete', GR);
      b(s * 16, 0, 0, 1.2, 1.2, 1.2, 'plastic', T); b(s * 18, 0, 7, 2, 1.1, 1, 'plastic', T); b(s * 18, 0, -7, 2, 1.1, 1, 'plastic', T);
      b(s * 24, 0, 12, 1.2, 1.2, 1.2, 'plastic', T); b(s * 24, 0, -12, 1.2, 1.2, 1.2, 'plastic', T); b(s * 22, 0, 0, 1, 1.8, 4, 'concrete', GR);
      b(s * 27, 0, -14, 6, 3, 5, 'concrete', GR); r(s * 27, 0, -8.5, 3, 3, 6, 'concrete', GR); b(s * 27, 3, -16.4, 6, 1, 0.2, 'metal', T);   // sniper perch
      b(s * 27, 0, 14, 6, 3, 5, 'concrete', GR); r(s * 27, 0, 8.5, 3, 3, 6, 'concrete', GR, Math.PI); b(s * 27, 3, 16.4, 6, 1, 0.2, 'metal', T);
      for (const z of [-15, 15]) b(s * 5, 0, z, 1, 6, 1, 'concrete', W);
      b(s * 33.8, 2, 0, 0.2, 2, 8, 'plastic', T);                             // team banner on the end wall
    }
  },
};
const ROAD_Z = 46;
const Env = {
  key: '', group: null, cols: [], items: {}, colItem: new Map(), goneN: 0, zones: [], colMat: new Map(), waters: [], sandAt: null,
  // water surface height at (x, z), or null when there's no water there
  waterAt(x, z) { for (const w of this.waters) if (x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1 && w.dep(x, z) > 0) return w.y; return null; },
  // debug (set window.TW_ZCHECK before loading a map): coplanar, overlapping faces of different materials that the camera
  // can see = z-fighting. Faces resting on the ground or pressed against another box are ignored.
  zscan() {
    const B = this.dbgBoxes || [], G = this.groundAt, out = [], eps = 0.003;
    const covered = (ax, f, plane, cu, cv, skip) => { const u = (ax + 1) % 3, v = (ax + 2) % 3; for (const c of B) { if (skip.includes(c)) continue; const t = f === 'mx' ? Math.abs(c.mn[ax] - plane) < eps : Math.abs(c.mx[ax] - plane) < eps; if (t && cu > c.mn[u] - eps && cu < c.mx[u] + eps && cv > c.mn[v] - eps && cv < c.mx[v] + eps) return true; } return false; };
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j]; if (a.k === b.k) continue;
      let sep = false; for (let ax = 0; ax < 3; ax++) if (a.mn[ax] > b.mx[ax] + eps || b.mn[ax] > a.mx[ax] + eps) { sep = true; break; } if (sep) continue;
      for (let ax = 0; ax < 3; ax++) for (const f of ['mn', 'mx']) {
        if (Math.abs(a[f][ax] - b[f][ax]) > eps) continue;
        const u = (ax + 1) % 3, v = (ax + 2) % 3, lu = Math.max(a.mn[u], b.mn[u]), hu = Math.min(a.mx[u], b.mx[u]), lv = Math.max(a.mn[v], b.mn[v]), hv = Math.min(a.mx[v], b.mx[v]);
        if (hu - lu <= 0.02 || hv - lv <= 0.02) continue;
        const cu = (lu + hu) / 2, cv = (lv + hv) / 2, plane = a[f][ax], c = [0, 0, 0]; c[ax] = plane; c[u] = cu; c[v] = cv;
        if (ax === 1 && f === 'mn' && G && G(c[0], c[2]) >= plane - 0.01) continue;
        if (covered(ax, f, plane, cu, cv, [a, b])) continue;
        out.push({ f: 'xyz'[ax] + (f === 'mn' ? '-' : '+'), a: a.k, b: b.k, at: c.map(x => +x.toFixed(1)).join(','), area: +((hu - lu) * (hv - lv)).toFixed(2) });
      }
    }
    return out;
  },
  // per frame: water animation + dark rooms (lights fade out while the camera is inside a dark zone)
  tick(dt) {
    Water.step(dt);
    for (const m of this.mirrors || []) m.visible = m.position.distanceTo(R.camera.position) < 22;
    const c = R.camera.position; let want = 0;
    for (const z of this.zones) if (c.x > z[0] && c.x < z[1] && c.y > z[2] && c.y < z[3] && c.z > z[4] && c.z < z[5]) want = 1;
    const cur = R.dark || 0; if (cur === want) return;
    let k = cur + (want - cur) * (1 - Math.exp(-5 * dt)); if (Math.abs(k - want) < 0.004) k = want;
    R.dark = k; R.applyLights();
  },
  update() {
    const name = THEMES[Rules.env] ? Rules.env : 'plains', k = name + '|' + R.path;
    if (k !== this.key) return this.apply(name);
    const gone = Rules.envGone || [];                                  // deleted world objects (delete gun)
    if (gone.length < this.goneN) return this.apply(name);
    for (; this.goneN < gone.length; this.goneN++) this.removeItem(gone[this.goneN]);
  },
  removeItem(id) {
    const it = this.items[id]; if (!it) return;
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const m of it.meshes) { m.setMatrixAt(it.idx, z); m.instanceMatrix.needsUpdate = true; }
    if (it.col) { this.colItem.delete(it.col.handle); Phys.colMap.delete(it.col.handle); Phys.world.removeCollider(it.col, false); Phys.qDirty = true; this.cols = this.cols.filter(c => c !== it.col); }
    delete this.items[id];
  },
  // after this.inst(): remember which instance of which meshes each item is
  reg(meshes, ids) { ids.forEach(([id, col, pos], i) => { this.items[id] = { meshes: meshes || [], idx: i, col, pos }; }); },
  apply(name) {
    const Th = THEMES[name]; this.key = name + '|' + R.path;
    this.items = {}; this.colItem = new Map(); this.zones = []; this.mirrors = []; this.colMat = new Map(); this.waters = []; this.sandAt = null; if (R.dark) { R.dark = 0; R.applyLights(); } const gone = new Set(Rules.envGone || []); this.goneN = (Rules.envGone || []).length; let nid = 0;
    if (this.group) { R.scene.remove(this.group); this.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); this.group = null; }
    for (const c of this.cols) { Phys.colMap.delete(c.handle); Phys.world.removeCollider(c, false); } if (this.cols.length) Phys.qDirty = true; this.cols = [];
    // sky, fog, light
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
    if (View.groundMesh) { View.groundMesh.material = Mats.get(gt); View.groundMesh.userData.mt = gt; }   // no ground mesh headless
    if (!Th.ground) return;
    // ---- decor ----
    const g = this.group = new THREE.Group(); R.scene.add(g);
    let seed = 0; for (const ch of name) seed = seed * 31 + ch.charCodeAt(0) >>> 0;
    const rnd = () => { seed = seed + 0x6D2B79F5 >>> 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const clearOf = (x, z, r) => Math.hypot(x, z) > r && !(Th.road && Math.abs(z - ROAD_Z) < 8) && Math.abs(x) < 330 && Math.abs(z) < 330;
    const M = (x, y, z, yaw, sx, sy, sz) => new THREE.Matrix4().compose(new V3(x, y, z), new QT().setFromAxisAngle(UP, yaw), new V3(sx, sy ?? sx, sz ?? sx));
    const C = RAPIER.ColliderDesc, col = (d, x, y, z, yaw, mt) => { d.setTranslation(x, y, z); if (yaw) { const q = new QT().setFromAxisAngle(UP, yaw); d.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }); } const c = Phys.world.createCollider(d, Phys.ground); Phys.colMap.set(c.handle, 0); this.cols.push(c); if (mt) this.colMat.set(c.handle, mt); return c; };
    const item = (x, y, z, c) => { const id = nid++; if (c) this.colItem.set(c.handle, id); return [id, c, [r4(x), r4(y), r4(z)]]; };
    if (Th.build) {   // hand-built map: static boxes / ramps / water, no forest
      const F = Th.flip ? -1 : 1;
      const put = (m, x, y, z, yaw, mt, c) => { x *= F; z *= F; yaw = (yaw || 0) + (F < 0 ? Math.PI : 0); if (yaw) m.rotation.y = yaw; m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; m.userData.mt = mt; m.userData.mc = c; g.add(m); };
      // static pieces are merged into one mesh per material (a building is hundreds of boxes)
      const vis = {}, _m4 = new THREE.Matrix4(), _q = new QT(), _one = new V3(1, 1, 1);
      const addVis = (geo, mt, c, x, y, z, yaw) => {
        const q = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(_m4.compose(new V3(x * F, y, z * F), _q.setFromAxisAngle(UP, (yaw || 0) + (F < 0 ? Math.PI : 0)), _one));
        const k = mt + '|' + (c || ''); (vis[k] || (vis[k] = { mt, c, gs: [] })).gs.push(q);
      };
      // fl: 1 = no collider (decoration), 2 = no visual (invisible collider)
      const dbg = window.TW_ZCHECK ? (this.dbgBoxes = []) : null;   // debug: every visible box (world AABB) for the z-fighting scan
      const b = (x, y, z, w, h, d, mt, c, yaw, fl) => {
        if (dbg && !(fl & 2)) { const q = Math.abs(Math.sin((yaw || 0))) > 0.7, hw = (q ? d : w) / 2, hd = (q ? w : d) / 2; dbg.push({ mn: [x * F - hw, y, z * F - hd], mx: [x * F + hw, y + h, z * F + hd], k: mt + '|' + (c || '') }); }
        if (!(fl & 2)) addVis(Geo.worldBox(w, h, d), mt, c, x, y + h / 2, z, yaw); if (!(fl & 1)) col(C.cuboid(w / 2, h / 2, d / 2), x * F, y + h / 2, z * F, (yaw || 0) + (F < 0 ? Math.PI : 0), mt);
      };
      const r = (x, y, z, w, h, d, mt, c, yaw, fl) => { if (!(fl & 2)) addVis(Geo.wedge(w, h, d), mt, c, x, y + h / 2, z, yaw); if (!(fl & 1)) for (const cd of Phys.colliderDescs({ sh: { t: 'ramp', s: [w, h, d] } })) col(cd, x * F, y + h / 2, z * F, (yaw || 0) + (F < 0 ? Math.PI : 0), mt); };
      const water = (x, y, z, w, d) => {
        const dep = (wx, wz) => y - (X.ground ? X.ground(wx, wz) : -9);
        g.add(Water.mesh(x * F, y, z * F, w, d, dep)); this.waters.push({ x0: x * F - w / 2, x1: x * F + w / 2, z0: z * F - d / 2, z1: z * F + d / 2, y, dep });
      };
      const batch = {}, treeM = [];
      const X = {
        rnd,
        // building box: sides tiled with a facade texture per window bay, flat roof; merged into one mesh per texture
        facade: (x, y, z, w, h, d, tex, bayW, bayH, solid, yaw) => {
          x *= F; z *= F; yaw = (yaw || 0) + (F < 0 ? Math.PI : 0);
          const B = batch[tex] || (batch[tex] = { p: [], u: [], n: [] }), R0 = batch.roof || (batch.roof = { p: [], u: [], n: [] });
          const cs = Math.cos(yaw), sn = Math.sin(yaw), T = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
          const quad = (Bt, a, b2, c, d2, nrm, uw, vh) => { Bt.p.push(...a, ...b2, ...c, ...a, ...c, ...d2); Bt.u.push(0, 0, uw, 0, uw, vh, 0, 0, uw, vh, 0, vh); for (let i = 0; i < 6; i++) Bt.n.push(...nrm); };
          const hw = w / 2, hd = d / 2, rot = (nx, nz) => [nx * cs + nz * sn, 0, -nx * sn + nz * cs];
          quad(B, T(-hw, 0, hd), T(hw, 0, hd), T(hw, h, hd), T(-hw, h, hd), rot(0, 1), Math.max(1, Math.round(w / bayW)), Math.max(1, Math.round(h / bayH)));
          quad(B, T(hw, 0, -hd), T(-hw, 0, -hd), T(-hw, h, -hd), T(hw, h, -hd), rot(0, -1), Math.max(1, Math.round(w / bayW)), Math.max(1, Math.round(h / bayH)));
          quad(B, T(hw, 0, hd), T(hw, 0, -hd), T(hw, h, -hd), T(hw, h, hd), rot(1, 0), Math.max(1, Math.round(d / bayW)), Math.max(1, Math.round(h / bayH)));
          quad(B, T(-hw, 0, -hd), T(-hw, 0, hd), T(-hw, h, hd), T(-hw, h, -hd), rot(-1, 0), Math.max(1, Math.round(d / bayW)), Math.max(1, Math.round(h / bayH)));
          quad(R0, T(-hw, h, hd), T(hw, h, hd), T(hw, h, -hd), T(-hw, h, -hd), [0, 1, 0], w / 4, d / 4);
          if (solid) col(C.cuboid(w / 2, h / 2, d / 2), x, y + h / 2, z, yaw, 'ground_plaster');
        },
        // heightfield terrain (w × d m, cell size c) + a sand layer blended in by sandFn (0..1)
        terrain: (w, d, c, hf, sandFn, hole) => {
          const q = v => Math.round(v * 1000) / 1000;   // grid points exactly on boundaries (x = -14.000002 is -14)
          const nx = Math.round(w / c), nz = Math.round(d / c), H = (x, z) => hf(F * q(x), F * q(z)), S = (x, z) => sandFn(F * q(x), F * q(z));
          X.ground = H; this.groundAt = H;
          const geo = new THREE.PlaneGeometry(w, d, nx, nz).rotateX(-Math.PI / 2), P = geo.attributes.position, uv = geo.attributes.uv, cols = new Float32Array(P.count * 4);
          for (let i = 0; i < P.count; i++) { const px = P.getX(i), pz = P.getZ(i); P.setY(i, H(px, pz)); uv.setXY(i, px / 4, pz / 4); cols.set([1, 1, 1, S(px, pz)], i * 4); }
          if (hole) {   // cut the holed cells out and collide with the triangles themselves
            const idx = geo.index.array, keep = [];
            for (let t = 0; t < idx.length; t += 3) { let cx = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += P.getX(idx[t + k]); cz += P.getZ(idx[t + k]); } if (!hole(F * cx / 3, F * cz / 3)) keep.push(idx[t], idx[t + 1], idx[t + 2]); }
            geo.setIndex(keep);
            const flags = RAPIER.TriMeshFlags ? RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES : undefined;
            col(C.trimesh(new Float32Array(P.array), new Uint32Array(keep), flags), 0, 0, 0, 0, 'terrain');
          } else {
            const hs = new Float32Array((nx + 1) * (nz + 1));
            for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) hs[i * (nz + 1) + j] = H(-w / 2 + i * c, -d / 2 + j * c);   // column-major: rows run along z
            col(C.heightfield(nz, nx, hs, { x: w, y: 1, z: d }), 0, 0, 0, 0, 'terrain');
          }
          this.sandAt = S;
          geo.computeVertexNormals();
          const grass = new THREE.Mesh(geo, Mats.get('ground_grass')); grass.receiveShadow = true; grass.userData.mt = 'ground_grass'; g.add(grass);
          const sg = geo.clone(); sg.setAttribute('color', new THREE.BufferAttribute(cols, 4));
          const sandMat = () => csmMat(new THREE.MeshStandardMaterial({ map: Tex.make('sand', true), vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.95, metalness: 0 }));
          const sand = new THREE.Mesh(sg, sandMat()); sand.userData.remat = sandMat;
          sand.material.userData.outlineParameters = { visible: false }; sand.receiveShadow = true; sand.renderOrder = 1; g.add(sand);
        },
        // a mirror (reflects the scene on Medium+, a dull silver panel on Low); only rendered when you're near it
        mirror: (x, y, z, w, h) => {
          const geo = new THREE.PlaneGeometry(w, h);
          const m = R.path === 'pbr' ? new Reflector(geo, { textureWidth: 1024, textureHeight: Math.round(1024 * h / w), color: 0xc4ccd0, clipBias: 0.003 })
            : new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#a9b6bb' }));
          m.position.set(x * F, y + h / 2, z * F); m.rotation.y = Math.PI / 2 + (F < 0 ? Math.PI : 0); m.userData.mirror = 1; g.add(m); this.mirrors.push(m);
        },
        cyl: (x, y, z, rad, h, c) => { const m = matMesh(Geo.get(`cy${rad},${h},m`, () => new THREE.CylinderGeometry(rad * 0.8, rad, h, 16)), 'concrete', c, true); m.position.set(x * F, y + h / 2, z * F); m.castShadow = true; g.add(m); },
        tree: (x, z, s) => treeM.push(M(x * F, 0, z * F, rnd() * 6.28, s)),
        // extruded outline (points [x, z]) from y0 to y1, looks only (collide with boxes / posts)
        prism: (pts, y0, y1, mt, c) => {
          const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x * F, z * F)));
          const geo = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, curveSegments: 6 }).rotateX(Math.PI / 2);
          const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);   // 1 texture = 2 m like the boxes
          const m = matMesh(geo, mt, c, true); m.position.y = y1; g.add(m);
        },
        post: (x, y, z, rad, h) => col(C.cylinder(h / 2, rad), x * F, y + h / 2, z * F, 0, 'concrete'),
        // big lettering on a far hill, facing the middle of the map
        sign: (text, x, y, z, w, h) => {
          const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 300; const c2 = cv.getContext('2d');
          c2.font = 'bold 250px Arial, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillStyle = '#f4f4f0'; c2.fillText(text, 1024, 160, 2000);
          const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.4, fog: true, side: THREE.DoubleSide }));
          m.material.userData.outlineParameters = { visible: false }; m.position.set(x * F, y, z * F); m.lookAt(0, y, 0); g.add(m);
        },
        // a dark room: lights fade out while the camera is inside this box
        zone: (x0, x1, y0, y1, z0, z1) => this.zones.push([Math.min(x0 * F, x1 * F), Math.max(x0 * F, x1 * F), y0, y1, Math.min(z0 * F, z1 * F), Math.max(z0 * F, z1 * F)]),
      };
      MAPS[Th.build](b, r, water, X);
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
      if (treeM.length) this.inst(Th.tree || 'pine', treeM, 'fabric', Th.treeCol || '#2f4a33');
      if (Th.mount) g.add(this.mountains(Th, rnd));
      return;
    }
    // trees: a few near the middle, most of them as a forest further out
    const trees = [], treeIds = [];
    for (let i = 0; i < Th.trees; i++) {
      const r = i < 14 ? 30 + rnd() * 18 : 45 + Math.pow(rnd(), 0.7) * 280, a = rnd() * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!clearOf(x, z, 28)) continue;
      const sc = 0.75 + rnd() * 0.75, mt = M(x, 0, z, rnd() * 6.28, sc);
      if (gone.has(nid)) { nid++; continue; }
      trees.push(mt); treeIds.push(item(x, 2 * sc, z, col(C.cylinder(2.2 * sc, 0.3 * sc), x, 2.2 * sc, z, 0, 'wood')));
    }
    this.reg(this.inst(Th.tree, trees, 'fabric', Th.treeCol), treeIds);
    // rocks and boulders
    const rocks = [], rockIds = [];
    for (let i = 0; i < 80; i++) {
      const r = 26 + Math.pow(rnd(), 0.8) * 290, a = rnd() * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!clearOf(x, z, 24)) continue;
      const sc = 0.35 + Math.pow(rnd(), 2) * 2.4, mt = M(x, 0.15 * sc, z, rnd() * 6.28, sc);
      if (gone.has(nid)) { nid++; continue; }
      rocks.push(mt); rockIds.push(item(x, 0.4 * sc, z, col(C.ball(0.72 * sc), x, 0.1 * sc, z, 0, 'concrete')));
    }
    this.reg(this.inst('rock', rocks, 'concrete', Th.rockCol), rockIds);
    // shipping container stacks along the road
    if (Th.boxes) {
      const colors = ['#a8452f', '#2f6aa0', '#3f7a4a', '#c28a2c', '#6d6f72'], byColor = {}, byColorIds = {};
      for (let i = 0; i < 9; i++) {
        const x = -150 + i * 36 + (rnd() - 0.5) * 12, z = ROAD_Z + (i % 2 ? -1 : 1) * (13 + rnd() * 6), yaw = (rnd() - 0.5) * 0.3, n = 1 + (rnd() < 0.45 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const c = colors[(rnd() * colors.length) | 0], y = 1.3 + k * 2.6, mt = M(x, y, z, yaw + (k ? (rnd() - 0.5) * 0.2 : 0), 1);
          if (gone.has(nid)) { nid++; continue; }
          (byColor[c] || (byColor[c] = [])).push(mt); (byColorIds[c] || (byColorIds[c] = [])).push(item(x, y, z, col(C.cuboid(3.0, 1.3, 1.22), x, y, z, yaw, 'metal')));
        }
      }
      for (const c in byColor) this.reg(this.inst('container', byColor[c], 'metal', c), byColorIds[c]);
    }
    // distant mountain range: one continuous ring-shaped heightfield around the map (no colliders)
    g.add(this.mountains(Th, rnd));
    // road
    if (Th.road) {
      const geo = new THREE.PlaneGeometry(1400, 9).rotateX(-Math.PI / 2), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 1400 / 9);
      const road = new THREE.Mesh(geo, Mats.get('ground_road')); road.userData.mt = 'ground_road'; road.position.set(0, 0.02, ROAD_Z); road.receiveShadow = true; g.add(road);
    }
  },
  // one InstancedMesh per mesh of a model (per material slot), using the tier's model set
  // a low-poly ring of ridges and peaks; snow caps where the theme has them, pre-hazed toward the fog colour
  mountains(Th, rnd) {
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
