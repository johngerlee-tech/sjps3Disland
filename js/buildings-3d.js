// 溪洲國小 3D 校園程序化建築與地景建模 (Stage 1: 鳥瞰初版模型)

(function () {
  function hexColor(hex, fallback) {
    return new THREE.Color(hex || fallback || "#E5E7EB");
  }

  const sharedTexLoader = typeof THREE !== "undefined" ? new THREE.TextureLoader() : null;
  function loadPhotoMat(url, extraOpts) {
    if (!sharedTexLoader) return new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const tex = sharedTexLoader.load(encodeURI(url));
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return new THREE.MeshLambertMaterial(Object.assign({ map: tex }, extraOpts || {}));
  }

  // 2D 點陣列建立水平地面形狀 (XZ 平面)
  function createFlatPolygonMesh(pointsXZ, y, material) {
    const shape = new THREE.Shape();
    pointsXZ.forEach((p, idx) => {
      // Shape 在 XY 平面，旋轉 -PI/2 後 X -> X, Y -> -Z
      if (idx === 0) shape.moveTo(p[0], -p[1]);
      else shape.lineTo(p[0], -p[1]);
    });
    shape.closePath();
    const geom = new THREE.ShapeGeometry(shape);
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.y = y;
    mesh.receiveShadow = true;
    return mesh;
  }

  // 建立道路折線帶
  function buildRoadStrip(points, width, y, color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: hexColor(color) });
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i], p2 = points[i + 1];
      const dx = p2[0] - p1[0], dz = p2[1] - p1[1];
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.01) continue;
      const geo = new THREE.BoxGeometry(len, 0.06, width);
      const seg = new THREE.Mesh(geo, mat);
      seg.position.set((p1[0] + p2[0]) / 2, y, (p1[1] + p2[1]) / 2);
      seg.rotation.y = Math.atan2(-dz, dx);
      seg.receiveShadow = true;
      group.add(seg);

      // 轉角圓補
      const capGeo = new THREE.CylinderGeometry(width / 2, width / 2, 0.06, 16);
      const cap = new THREE.Mesh(capGeo, mat);
      cap.position.set(p1[0], y, p1[1]);
      cap.receiveShadow = true;
      group.add(cap);
    }
    return group;
  }

  // 加上太陽能光電板陣列到屋頂
  function addSolarPanels(parent, w, d, roofY, rows, cols, padX, padZ) {
    const panelMat = new THREE.MeshPhongMaterial({
      color: 0x162d4c,
      specular: 0x60a5fa,
      shininess: 65
    });
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xcbd5e1 });
    const usableW = w - padX * 2;
    const usableD = d - padZ * 2;
    const pw = usableW / cols - 0.35;
    const pd = usableD / rows - 0.35;
    if (pw <= 0.3 || pd <= 0.3) return;

    const pGeo = new THREE.BoxGeometry(pw, 0.1, pd);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = -usableW / 2 + (c + 0.5) * (usableW / cols);
        const pz = -usableD / 2 + (r + 0.5) * (usableD / rows);
        const m = new THREE.Mesh(pGeo, panelMat);
        m.position.set(px, roofY + 0.14, pz);
        m.castShadow = true;
        parent.add(m);
      }
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(usableW, 0.06, usableD), frameMat);
    base.position.y = roofY + 0.05;
    parent.add(base);
  }

  // 輔助：在群組內建立 3D 樓梯並註冊斜坡行走區
  function addStaircase(group, b, walkZones, opts) {
    // opts: { lx0, lx1, lz0, lz1, axis: 'x'|'z', dir: 1|-1, y0, y1 }
    const { lx0, lx1, lz0, lz1, axis, dir, y0, y1 } = opts;
    const steps = 12;
    const stepMat = new THREE.MeshLambertMaterial({ color: 0xd6d3d1 });
    const railMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const spanX = lx1 - lx0;
    const spanZ = lz1 - lz0;
    const cx = (lx0 + lx1) / 2;
    const cz = (lz0 + lz1) / 2;

    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const stepH = (y1 - y0) / steps;
      const sy = y0 + (i + 0.5) * stepH;
      let sx = cx, sz = cz, sw = spanX, sd = spanZ;
      if (axis === "x") {
        sw = spanX / steps;
        sx = dir > 0 ? lx0 + t * spanX : lx1 - t * spanX;
      } else {
        sd = spanZ / steps;
        sz = dir > 0 ? lz0 + t * spanZ : lz1 - t * spanZ;
      }
      const step = new THREE.Mesh(new THREE.BoxGeometry(sw, sy - y0 + stepH * 0.5, sd), stepMat);
      step.position.set(sx, (y0 + sy) / 2, sz);
      step.castShadow = true;
      step.receiveShadow = true;
      group.add(step);
    }

    // 斜向扶手
    const len = axis === "x" ? spanX : spanZ;
    const rise = y1 - y0;
    const slopeLen = Math.hypot(len, rise);
    const angle = Math.atan2(rise, len);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(axis === "x" ? slopeLen : 0.06, 0.06, axis === "z" ? slopeLen : 0.06), railMat);
    rail.position.set(cx, (y0 + y1) / 2 + 0.85, cz);
    if (axis === "x") rail.rotation.z = dir > 0 ? angle : -angle;
    else rail.rotation.x = dir > 0 ? -angle : angle;
    group.add(rail);

    walkZones.push({
      b,
      lxMin: lx0, lxMax: lx1,
      lzMin: lz0, lzMax: lz1,
      y0: dir > 0 ? y0 : y1,
      y1: dir > 0 ? y1 : y0,
      rampAxis: axis
    });
  }

  // 輔助：在群組內建立南北向迴轉樓梯（南側走廊進入向北上行 -> 北側迴轉平台 -> 右後轉彎向南上至 2F，最外側設扶手與碰撞）
  function addUTurnStaircase(group, b, walkZones, colliders, opts) {
    const { lx0, lx1, lz0, lz1, y0, y1 } = opts;
    const midX = (lx0 + lx1) / 2;
    const midZ = lz0 + 1.5; // 北側迴轉平台 z: [lz0, midZ]
    const midY = (y0 + y1) / 2;
    const flightW = (lx1 - lx0) / 2 - 0.1;

    // 第一段：西半側 (lx0..midX-0.06)，由南 (lz1) 向北 (midZ) 上行至 midY
    addStaircase(group, b, walkZones, {
      lx0: lx0 + 0.08, lx1: midX - 0.06,
      lz0: midZ, lz1,
      axis: "z", dir: -1, y0, y1: midY
    });

    // 北側迴轉平台
    const platMat = new THREE.MeshLambertMaterial({ color: 0xd6d3d1 });
    const plat = new THREE.Mesh(new THREE.BoxGeometry(lx1 - lx0, midY - y0 + 0.16, midZ - lz0), platMat);
    plat.position.set(midX, (y0 + midY) / 2, (lz0 + midZ) / 2);
    plat.castShadow = true; plat.receiveShadow = true;
    group.add(plat);
    walkZones.push({ b, lxMin: lx0, lxMax: lx1, lzMin: lz0, lzMax: midZ, y0: midY, y1: midY, rampAxis: null });

    // 第二段：東半側 (midX+0.06..lx1)，由北 (midZ) 向南 (lz1) 右後轉彎上行至 y1 (2F)
    addStaircase(group, b, walkZones, {
      lx0: midX + 0.06, lx1: lx1 - 0.08,
      lz0: midZ, lz1,
      axis: "z", dir: 1, y0: midY, y1
    });

    // 最外側與中央分隔扶手＋防越界碰撞牆
    const railMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const fLen = lz1 - midZ;
    const fRise = midY - y0;
    const slopeLen = Math.hypot(fLen, fRise);
    const angle = Math.atan2(fRise, fLen);

    // 外側西扶手（上行坡）
    const rWest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, slopeLen), railMat);
    rWest.position.set(lx0 + 0.05, (y0 + midY) / 2 + 0.85, (midZ + lz1) / 2);
    rWest.rotation.x = angle;
    // 外側東扶手（下行側轉上 2F 坡）
    const rEast = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, slopeLen), railMat);
    rEast.position.set(lx1 - 0.05, (midY + y1) / 2 + 0.85, (midZ + lz1) / 2);
    rEast.rotation.x = -angle;
    // 北側迴轉平台後扶手
    const rBack = new THREE.Mesh(new THREE.BoxGeometry(lx1 - lx0, 0.06, 0.06), railMat);
    rBack.position.set(midX, midY + 0.85, lz0 + 0.05);
    // 中央分隔扶手
    const rMid = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, fLen), railMat);
    rMid.position.set(midX, (y0 + y1) / 2 + 0.25, (midZ + lz1) / 2);
    group.add(rWest, rEast, rBack, rMid);

    // 註冊扶手界線碰撞，防止人物超出扶手或橫跨中央分隔
    if (colliders) {
      colliders.push({ b, lxMin: lx0 - 0.25, lxMax: lx0 + 0.06, lzMin: lz0 - 0.2, lzMax: lz1, floors: "both" });
      colliders.push({ b, lxMin: lx1 - 0.06, lxMax: lx1 + 0.25, lzMin: lz0 - 0.2, lzMax: lz1, floors: "both" });
      colliders.push({ b, lxMin: lx0 - 0.2, lxMax: lx1 + 0.2, lzMin: lz0 - 0.25, lzMax: lz0 + 0.06, floors: "both" });
      colliders.push({ b, lxMin: midX - 0.06, lxMax: midX + 0.06, lzMin: midZ + 0.15, lzMax: lz1, floors: "both" });
    }
    void flightW;
  }

  // 輔助：在教室走廊牆面加入門、窗、公佈欄與班級牌 (避開 1F 穿堂通道)
  function addCorridorWallDetails(group, len, wallCoord, axis, facingSign, floors, fh, accentMat, passages) {
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x0f766e });
    const winMat = new THREE.MeshPhongMaterial({ color: 0xf1f5f9, specular: 0xffffff, shininess: 70, transparent: true, opacity: 0.55 });
    const boardMat = new THREE.MeshLambertMaterial({ color: 0x38bdf8 });
    const plaqueMat = new THREE.MeshLambertMaterial({ color: 0xfef3c7 });
    const bay = 7.0;
    const count = Math.max(1, Math.floor((len - 4) / bay));
    const start = -((count - 1) * bay) / 2;

    for (let f = 0; f < floors; f++) {
      const fy = f * fh;
      for (let i = 0; i < count; i++) {
        const pos = start + i * bay;
        if (f === 0 && passages && passages.some(p => Math.abs(pos - p.localX) < p.halfWidth + 2.8)) {
          continue;
        }
        const door = new THREE.Mesh(
          new THREE.BoxGeometry(axis === "x" ? 0.95 : 0.12, 2.15, axis === "z" ? 0.95 : 0.12),
          doorMat
        );
        const win = new THREE.Mesh(
          new THREE.BoxGeometry(axis === "x" ? 3.2 : 0.1, 1.15, axis === "z" ? 3.2 : 0.1),
          winMat
        );
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(axis === "x" ? 1.5 : 0.08, 0.9, axis === "z" ? 1.5 : 0.08),
          boardMat
        );
        const plaque = new THREE.Mesh(
          new THREE.BoxGeometry(axis === "x" ? 0.7 : 0.35, 0.24, axis === "z" ? 0.7 : 0.35),
          plaqueMat
        );

        if (axis === "x") {
          door.position.set(pos - 1.8, fy + 1.12, wallCoord + facingSign * 0.05);
          win.position.set(pos + 0.7, fy + 1.65, wallCoord + facingSign * 0.04);
          board.position.set(pos + 3.2, fy + 1.55, wallCoord + facingSign * 0.05);
          plaque.position.set(pos - 1.8, fy + 2.45, wallCoord + facingSign * 0.22);
        } else {
          door.position.set(wallCoord + facingSign * 0.05, fy + 1.12, pos - 1.8);
          win.position.set(wallCoord + facingSign * 0.04, fy + 1.65, pos + 0.7);
          board.position.set(wallCoord + facingSign * 0.05, fy + 1.55, pos + 3.2);
          plaque.position.set(wallCoord + facingSign * 0.22, fy + 2.45, pos - 1.8);
        }
        group.add(door, win, board, plaque);
      }
    }
  }

  // 建立「中庭中央連廊」(1F 風雨中廊 + 2F C-Show 創客藝廊)
  function buildCorridorMid(b, colliders, walkZones) {
    const group = new THREE.Group();
    const fh = b.floorHeight; // 3.6m
    const totalH = b.floors * fh;
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xe7e0d6 });
    const galleryFloorMat = new THREE.MeshLambertMaterial({ color: 0xd6b88d });
    const pillarMat = new THREE.MeshLambertMaterial({ color: hexColor(b.colors.wall, "#F4F2ED") });
    const railMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const roofMat = new THREE.MeshLambertMaterial({ color: hexColor(b.colors.roof, "#78A07C") });

    // 1F 地板 & 2F 創客藝廊地板 & 屋頂
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.12, b.d), floorMat);
    f1.position.y = 0.06;
    f1.receiveShadow = true;
    const f2 = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.22, b.d), galleryFloorMat);
    f2.position.y = fh - 0.05;
    f2.castShadow = true;
    f2.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.4, 0.35, b.d + 0.4), roofMat);
    roof.position.y = totalH + 0.15;
    roof.castShadow = true;
    group.add(f1, f2, roof);

    // 柱列 (兩側各 4 根)
    const cols = [-b.d * 0.38, -b.d * 0.13, b.d * 0.13, b.d * 0.38];
    cols.forEach(cz => {
      [-b.w / 2 + 0.22, b.w / 2 - 0.22].forEach(cx => {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.32, totalH, 0.32), pillarMat);
        p.position.set(cx, totalH / 2, cz);
        p.castShadow = true;
        group.add(p);
        colliders.push({ b, lxMin: cx - 0.18, lxMax: cx + 0.18, lzMin: cz - 0.18, lzMax: cz + 0.18, floors: "both" });
      });
    });

    // 2F 東西兩側欄杆 + 創客藝廊展示畫框 (貼齊欄杆外側，保持走道完全暢通)
    const artColors = [0xf43f5e, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6];
    [-1, 1].forEach(side => {
      const rx = side * (b.w / 2 - 0.14);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, b.d - 0.4), pillarMat);
      wall.position.set(rx, fh + 0.48, 0);
      group.add(wall);
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, b.d - 0.2), railMat);
      topRail.position.set(rx, fh + 1.05, 0);
      group.add(topRail);

      for (let i = 0; i < 4; i++) {
        const az = -b.d * 0.33 + i * (b.d * 0.22);
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.78, 1.35),
          new THREE.MeshLambertMaterial({ color: artColors[(i + (side > 0 ? 2 : 0)) % artColors.length] })
        );
        frame.position.set(rx - side * 0.06, fh + 1.75, az);
        group.add(frame);
      }
    });

    addSolarPanels(group, b.w, b.d, totalH + 0.35, 4, 1, 0.6, 1.2);

    // 2F 可行走樓板與兩側欄杆碰撞
    walkZones.push({ b, lxMin: -b.w / 2, lxMax: b.w / 2, lzMin: -b.d / 2 - 0.8, lzMax: b.d / 2 + 0.8, y0: fh, y1: fh, rampAxis: null });
    colliders.push({ b, lxMin: -b.w / 2 - 0.15, lxMax: -b.w / 2 + 0.2, lzMin: -b.d / 2 + 0.4, lzMax: b.d / 2 - 0.4, floors: "2" });
    colliders.push({ b, lxMin: b.w / 2 - 0.2, lxMax: b.w / 2 + 0.15, lzMin: -b.d / 2 + 0.4, lzMax: b.d / 2 - 0.4, floors: "2" });
    return group;
  }

  // 建立透空走廊校舍 (A / B / C / D 棟：後方教室實牆 + 前方透空 1F/2F 走廊 + 樓梯)
  function buildTeachingWing(b, colliders, walkZones) {
    if (b.style === "corridor") return buildCorridorMid(b, colliders, walkZones);

    const group = new THREE.Group();
    const fh = b.floorHeight;
    const totalH = b.floors * fh;
    const wallMat = new THREE.MeshLambertMaterial({ color: hexColor(b.colors.wall, "#F3EFE6") });
    const accentMat = new THREE.MeshLambertMaterial({ color: hexColor(b.colors.accent, "#C85A32") });
    const roofMat = new THREE.MeshLambertMaterial({ color: hexColor(b.colors.roof, "#94A3B8") });
    const winMat = new THREE.MeshPhongMaterial({ color: 0xf1f5f9, specular: 0xffffff, shininess: 70, transparent: true, opacity: 0.55 });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xe7e0d6 });
    const railMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });

    const isLongX = b.w >= b.d;
    const corrSize = 3.1; // 走廊寬度 3.1m

    if (isLongX) {
      // A 棟走廊在南側 (+Z, 前庭側)，B 棟走廊亦在南側 (+Z, 中庭側)
      const corrSign = 1;
      const roomD = b.d - corrSize;
      const roomCenterZ = -corrSign * (corrSize / 2);
      const corrCenterZ = corrSign * (b.d / 2 - corrSize / 2);
      const wallFaceZ = corrSign * (b.d / 2 - corrSize);
      const outerEdgeZ = corrSign * (b.d / 2);

      // 1. 教室量體 (若有 1F 穿堂通道則分段建立 1F 教室 + 完整 2F 教室)
      const passage = (b.passages && b.passages[0]) || null;
      if (passage) {
        const pMin = passage.localX - passage.halfWidth;
        const pMax = passage.localX + passage.halfWidth;
        // A 棟西側保留 4.4m、東側保留 6.0m；B 棟西側保留 5.2m（樓梯退縮至與教室切齊，不擋走廊通道）
        const westInset = b.id === "bldg_a" ? 4.4 : (b.id === "bldg_b" ? 5.2 : 0);
        const eastInset = b.id === "bldg_a" ? 6.0 : 0;
        const xStartL = -b.w / 2 + westInset;
        const xEndR = b.w / 2 - eastInset;
        const midStairInset = b.id === "bldg_b" ? 4.6 : 0;
        const leftW = pMin - midStairInset - xStartL;
        const rightW = xEndR - pMax;
        if (b.id === "bldg_a") {
          const endW = new THREE.Mesh(new THREE.BoxGeometry(0.6, totalH, roomD), wallMat);
          endW.position.set(-b.w / 2 + 0.3, totalH / 2, roomCenterZ);
          const endE = new THREE.Mesh(new THREE.BoxGeometry(0.6, totalH, roomD), wallMat);
          endE.position.set(b.w / 2 - 2.0, totalH / 2, roomCenterZ);
          endW.castShadow = true; endE.castShadow = true;
          group.add(endW, endE);
          colliders.push({ b, lxMin: -b.w / 2, lxMax: -b.w / 2 + 0.6, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "both" });
          colliders.push({ b, lxMin: b.w / 2 - 2.3, lxMax: b.w / 2 - 1.7, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "both" });
        }
        if (leftW > 0.2) {
          const mL = new THREE.Mesh(new THREE.BoxGeometry(leftW, fh, roomD), wallMat);
          mL.position.set(xStartL + leftW / 2, fh / 2, roomCenterZ);
          mL.castShadow = true; mL.receiveShadow = true;
          group.add(mL);
          colliders.push({ b, lxMin: xStartL, lxMax: xStartL + leftW, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "both" });
        }
        if (rightW > 0.2) {
          const mR = new THREE.Mesh(new THREE.BoxGeometry(rightW, fh, roomD), wallMat);
          mR.position.set(pMax + rightW / 2, fh / 2, roomCenterZ);
          mR.castShadow = true; mR.receiveShadow = true;
          group.add(mR);
          colliders.push({ b, lxMin: pMax, lxMax: xEndR, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "both" });
        }
        // 2F 整排教室 (橫跨穿堂上方；A 棟中央穿堂上方保留連通創客藝廊的 2F 穿廊)
        if (b.id === "bldg_a") {
          const f2L = new THREE.Mesh(new THREE.BoxGeometry(leftW, fh, roomD), wallMat);
          f2L.position.set(xStartL + leftW / 2, fh + fh / 2, roomCenterZ);
          f2L.castShadow = true; f2L.receiveShadow = true;
          const f2R = new THREE.Mesh(new THREE.BoxGeometry(rightW, fh, roomD), wallMat);
          f2R.position.set(pMax + rightW / 2, fh + fh / 2, roomCenterZ);
          f2R.castShadow = true; f2R.receiveShadow = true;
          const f2Lobby = new THREE.Mesh(new THREE.BoxGeometry(pMax - pMin, 0.22, roomD), floorMat);
          f2Lobby.position.set((pMin + pMax) / 2, fh - 0.05, roomCenterZ);
          group.add(f2L, f2R, f2Lobby);
          walkZones.push({ b, lxMin: pMin - 0.5, lxMax: pMax + 0.5, lzMin: roomCenterZ - roomD / 2 - 0.8, lzMax: roomCenterZ + roomD / 2 + 0.5, y0: fh, y1: fh, rampAxis: null });
        } else {
          const f2Room = new THREE.Mesh(new THREE.BoxGeometry(b.w, fh, roomD), wallMat);
          f2Room.position.set(0, fh + fh / 2, roomCenterZ);
          f2Room.castShadow = true; f2Room.receiveShadow = true;
          group.add(f2Room);
          colliders.push({ b, lxMin: pMin, lxMax: pMax, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "2" });
        }
      } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, totalH, roomD), wallMat);
        body.position.set(0, totalH / 2, roomCenterZ);
        body.castShadow = true; body.receiveShadow = true;
        group.add(body);
        colliders.push({ b, lxMin: -b.w / 2, lxMax: b.w / 2, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "both" });
      }

      // 教室外牆窗帶 (1F 若有穿堂則左右分段建立，避免藍色窗帶橫跨穿堂阻擋視線)
      const outWinZ = roomCenterZ - corrSign * (roomD / 2 + 0.02);
      for (let f = 0; f < b.floors; f++) {
        const wy = f * fh + fh * 0.56;
        if (f === 0 && passage) {
          const pMin = passage.localX - passage.halfWidth;
          const pMax = passage.localX + passage.halfWidth;
          const lw = Math.max(0, pMin - (-b.w / 2 + 1.5));
          const rw = Math.max(0, (b.w / 2 - 1.5) - pMax);
          if (lw > 0.5) {
            const wL = new THREE.Mesh(new THREE.BoxGeometry(lw, 1.35, 0.08), winMat);
            wL.position.set(-b.w / 2 + 1.5 + lw / 2, wy, outWinZ);
            group.add(wL);
          }
          if (rw > 0.5) {
            const wR = new THREE.Mesh(new THREE.BoxGeometry(rw, 1.35, 0.08), winMat);
            wR.position.set(pMax + rw / 2, wy, outWinZ);
            group.add(wR);
          }
        } else {
          const outWin = new THREE.Mesh(new THREE.BoxGeometry(b.w - 3.0, 1.35, 0.08), winMat);
          outWin.position.set(0, wy, outWinZ);
          group.add(outWin);
        }
      }

      // 2. 透空 1F / 2F 走廊樓板 + 柱列 + 2F 欄杆 + 屋頂
      const f1Floor = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.12, corrSize), floorMat);
      f1Floor.position.set(0, 0.06, corrCenterZ);
      f1Floor.receiveShadow = true;
      const f2Floor = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.22, corrSize), floorMat);
      f2Floor.position.set(0, fh - 0.05, corrCenterZ);
      f2Floor.castShadow = true; f2Floor.receiveShadow = true;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.42, b.d + 0.6), roofMat);
      roof.position.set(0, totalH + 0.21, 0);
      roof.castShadow = true; roof.receiveShadow = true;
      group.add(f1Floor, f2Floor, roof);

      // 走廊外緣柱列 (避開穿堂門口並註冊柱體碰撞)
      const colStep = 6.5;
      for (let cx = -b.w / 2 + 0.8; cx <= b.w / 2 - 0.5; cx += colStep) {
        if (passage && Math.abs(cx - passage.localX) < passage.halfWidth + 0.6) continue;
        const cz = outerEdgeZ - corrSign * 0.2;
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.32, totalH, 0.32), wallMat);
        col.position.set(cx, totalH / 2, cz);
        col.castShadow = true;
        group.add(col);
        colliders.push({ b, lxMin: cx - 0.18, lxMax: cx + 0.18, lzMin: cz - 0.18, lzMax: cz + 0.18, floors: "both" });
      }

      // 2F 走廊外緣女兒牆與欄杆 (B 棟留出中央連廊口 0.9..5.9；A/B 棟全段及兩端外側皆設欄杆防護)
      const railSegs = b.id === "bldg_b"
        ? [[-b.w / 2, 0.9], [5.9, b.w / 2]]
        : [[-b.w / 2, b.w / 2]];
      railSegs.forEach(([x0, x1]) => {
        if (x1 - x0 < 1.0) return;
        const rw = x1 - x0;
        const rx = (x0 + x1) / 2;
        const parapet = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.85, 0.16), wallMat);
        parapet.position.set(rx, fh + 0.42, outerEdgeZ - corrSign * 0.1);
        const topRail = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.06, 0.08), railMat);
        topRail.position.set(rx, fh + 1.05, outerEdgeZ - corrSign * 0.1);
        group.add(parapet, topRail);
        colliders.push({ b, lxMin: x0, lxMax: x1, lzMin: outerEdgeZ - 0.25, lzMax: outerEdgeZ + 0.25, floors: "2" });
      });
      // 2F 走廊東西兩端封閉欄杆防護
      [-1, 1].forEach(ex => {
        const endX = ex * (b.w / 2 - 0.1);
        const endZ = (wallFaceZ + outerEdgeZ) / 2;
        const endParapet = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, corrSize), wallMat);
        endParapet.position.set(endX, fh + 0.42, endZ);
        const endRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, corrSize), railMat);
        endRail.position.set(endX, fh + 1.05, endZ);
        group.add(endParapet, endRail);
        colliders.push({ b, lxMin: endX - 0.2, lxMax: endX + 0.2, lzMin: Math.min(wallFaceZ, outerEdgeZ), lzMax: Math.max(wallFaceZ, outerEdgeZ), floors: "2" });
      });

      // 走廊內牆門窗與班級牌
      addCorridorWallDetails(group, b.w, wallFaceZ, "x", corrSign, b.floors, fh, accentMat, b.passages);

      // 註冊 2F 走廊可行走平面
      walkZones.push({
        b,
        lxMin: -b.w / 2 - 1.2, lxMax: b.w / 2 + 1.2,
        lzMin: Math.min(wallFaceZ, outerEdgeZ) - 0.4,
        lzMax: Math.max(wallFaceZ, outerEdgeZ) + 0.4,
        y0: fh, y1: fh, rampAxis: null
      });

      // 3. 樓梯配置
      const stZ0 = wallFaceZ;
      const stZ1 = wallFaceZ + 1.5;
      if (b.id === "bldg_a") {
        const portalX = passage ? passage.localX : 7.5;
        // A 棟：東西側為南北向迴轉樓梯（南側走廊進入向北至迴轉區再右後轉彎向南上 2F）+ 穿堂兩側樓梯
        addUTurnStaircase(group, b, walkZones, colliders, { lx0: -b.w / 2 + 0.65, lx1: -b.w / 2 + 4.35, lz0: -b.d / 2 + 0.35, lz1: wallFaceZ, y0: 0.08, y1: fh });
        addStaircase(group, b, walkZones, { lx0: portalX - 6.5, lx1: portalX - 2.7, lz0: stZ0, lz1: stZ1, axis: "x", dir: 1, y0: 0.08, y1: fh });
        addStaircase(group, b, walkZones, { lx0: portalX + 2.7, lx1: portalX + 6.5, lz0: stZ0, lz1: stZ1, axis: "x", dir: -1, y0: 0.08, y1: fh });
        addUTurnStaircase(group, b, walkZones, colliders, { lx0: b.w / 2 - 5.95, lx1: b.w / 2 - 2.35, lz0: -b.d / 2 + 0.35, lz1: wallFaceZ, y0: 0.08, y1: fh });
      } else if (b.id === "bldg_b") {
        // B 棟：西側與中央穿堂旁樓梯皆退縮至與教室牆面切齊 (lz <= wallFaceZ)，不佔用走廊通道
        const bPMin = passage ? (passage.localX - passage.halfWidth) : 0.9;
        addStaircase(group, b, walkZones, { lx0: -b.w / 2 + 0.5, lx1: -b.w / 2 + 5.0, lz0: wallFaceZ - 1.6, lz1: wallFaceZ, axis: "x", dir: -1, y0: 0.08, y1: fh });
        addStaircase(group, b, walkZones, { lx0: bPMin - 4.5, lx1: bPMin - 0.1, lz0: wallFaceZ - 1.6, lz1: wallFaceZ, axis: "x", dir: 1, y0: 0.08, y1: fh });
      }
    } else if (b.id === "bldg_c") {
      // C 棟：1F 西側為走廊 (-X 側)，2F 為視聽教室（無西側走廊，走廊上方亦為視聽教室）
      const corrSign = -1;
      const roomW1F = b.w - corrSize;
      const roomCenterX1F = -corrSign * (corrSize / 2);
      const corrCenterX = corrSign * (b.w / 2 - corrSize / 2);
      const wallFaceX = corrSign * (b.w / 2 - corrSize);
      const outerEdgeX = corrSign * (b.w / 2);

      // 1. 1F 教室量體 + 2F 視聽教室（含西側上方全寬）
      const body1F = new THREE.Mesh(new THREE.BoxGeometry(roomW1F, fh, b.d), wallMat);
      body1F.position.set(roomCenterX1F, fh / 2, 0);
      body1F.castShadow = true; body1F.receiveShadow = true;
      const body2F = new THREE.Mesh(new THREE.BoxGeometry(b.w, fh, b.d), wallMat);
      body2F.position.set(0, fh + fh / 2, 0);
      body2F.castShadow = true; body2F.receiveShadow = true;
      group.add(body1F, body2F);
      colliders.push({ b, lxMin: roomCenterX1F - roomW1F / 2, lxMax: roomCenterX1F + roomW1F / 2, lzMin: -b.d / 2, lzMax: b.d / 2, floors: "1" });
      colliders.push({ b, lxMin: -b.w / 2, lxMax: b.w / 2, lzMin: -b.d / 2, lzMax: b.d / 2, floors: "2" });

      // 東側外牆 1F/2F 窗帶 + 西側 2F 視聽教室外牆窗帶
      for (let f = 0; f < b.floors; f++) {
        const wy = f * fh + fh * 0.56;
        const outWinE = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.35, b.d - 3.0), winMat);
        outWinE.position.set(b.w / 2 + 0.02, wy, 0);
        group.add(outWinE);
      }
      const outWinW2F = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.35, b.d - 3.0), winMat);
      outWinW2F.position.set(-b.w / 2 - 0.02, fh + fh * 0.56, 0);
      group.add(outWinW2F);

      // 2. 1F 西側走廊樓板 + 1F 柱列 + 屋頂
      const f1Floor = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.12, b.d), floorMat);
      f1Floor.position.set(corrCenterX, 0.06, 0);
      f1Floor.receiveShadow = true;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.42, b.d + 0.6), roofMat);
      roof.position.set(0, totalH + 0.21, 0);
      roof.castShadow = true; roof.receiveShadow = true;
      group.add(f1Floor, roof);

      for (let cz = -b.d / 2 + 1.0; cz <= b.d / 2 - 0.8; cz += 6.5) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.32, fh, 0.32), wallMat);
        col.position.set(outerEdgeX - corrSign * 0.2, fh / 2, cz);
        col.castShadow = true;
        group.add(col);
        const cx = outerEdgeX - corrSign * 0.2;
        colliders.push({ b, lxMin: cx - 0.18, lxMax: cx + 0.18, lzMin: cz - 0.18, lzMax: cz + 0.18, floors: "1" });
      }

      addCorridorWallDetails(group, b.d, wallFaceX, "z", corrSign, 1, fh, accentMat);
      // C 棟西側走廊保持暢通（樓梯位於自 C 棟走廊右轉銜接 A 棟走道後隨即右轉之 A 棟東側迴轉梯）
    } else {
      // D 棟：1F 東西兩側皆有走廊；2F 為東側走廊 (+X)，西側 (-X) 為小陽台開放空間
      const roomW = b.w - corrSize * 2;
      const corrCenterXE = b.w / 2 - corrSize / 2;
      const corrCenterXW = -b.w / 2 + corrSize / 2;
      const wallFaceXE = b.w / 2 - corrSize;
      const wallFaceXW = -b.w / 2 + corrSize;
      const outerEdgeXE = b.w / 2;
      const outerEdgeXW = -b.w / 2;

      // 1. 中央教室量體 (1F & 2F)
      const body = new THREE.Mesh(new THREE.BoxGeometry(roomW, totalH, b.d), wallMat);
      body.position.set(0, totalH / 2, 0);
      body.castShadow = true; body.receiveShadow = true;
      group.add(body);
      colliders.push({ b, lxMin: -roomW / 2, lxMax: roomW / 2, lzMin: -b.d / 2, lzMax: b.d / 2, floors: "both" });

      // 2. 1F 東西側走廊樓板 + 2F 東側走廊樓板 + 屋頂（涵蓋教室與東側走廊，西側 2F 陽台露天開放）
      const f1FloorE = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.12, b.d), floorMat);
      f1FloorE.position.set(corrCenterXE, 0.06, 0);
      f1FloorE.receiveShadow = true;
      const f1FloorW = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.12, b.d), floorMat);
      f1FloorW.position.set(corrCenterXW, 0.06, 0);
      f1FloorW.receiveShadow = true;
      const f2FloorE = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.22, b.d), floorMat);
      f2FloorE.position.set(corrCenterXE, fh - 0.05, 0);
      f2FloorE.castShadow = true; f2FloorE.receiveShadow = true;
      const roofW = roomW + corrSize + 0.6;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.42, b.d + 0.6), roofMat);
      roof.position.set(corrSize / 2, totalH + 0.21, 0);
      roof.castShadow = true; roof.receiveShadow = true;
      group.add(f1FloorE, f1FloorW, f2FloorE, roof);

      // 1F 西側走廊遮簷（小陽台以外區段）+ 2F 西側小陽台開放空間與三面欄杆
      const balcD = Math.min(14.0, b.d - 6.0);
      const sideCanopyD = (b.d - balcD) / 2;
      const balcSlab = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.22, balcD), floorMat);
      balcSlab.position.set(corrCenterXW, fh - 0.05, 0);
      balcSlab.castShadow = true; balcSlab.receiveShadow = true;
      group.add(balcSlab);
      [-1, 1].forEach(sz => {
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.14, sideCanopyD), roofMat);
        canopy.position.set(corrCenterXW, fh - 0.04, sz * (balcD / 2 + sideCanopyD / 2));
        canopy.castShadow = true;
        group.add(canopy);
        const endParapet = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.85, 0.16), wallMat);
        endParapet.position.set(corrCenterXW, fh + 0.42, sz * (balcD / 2 - 0.08));
        const endRail = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.06, 0.08), railMat);
        endRail.position.set(corrCenterXW, fh + 1.05, sz * (balcD / 2 - 0.08));
        group.add(endParapet, endRail);
        colliders.push({ b, lxMin: outerEdgeXW, lxMax: wallFaceXW, lzMin: sz * (balcD / 2) - 0.2, lzMax: sz * (balcD / 2) + 0.2, floors: "2" });
      });
      const balcParapetW = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, balcD), wallMat);
      balcParapetW.position.set(outerEdgeXW + 0.1, fh + 0.42, 0);
      const balcRailW = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, balcD), railMat);
      balcRailW.position.set(outerEdgeXW + 0.1, fh + 1.05, 0);
      group.add(balcParapetW, balcRailW);
      colliders.push({ b, lxMin: outerEdgeXW - 0.25, lxMax: outerEdgeXW + 0.25, lzMin: -balcD / 2, lzMax: balcD / 2, floors: "2" });

      // 東側柱列 (1F~2F 撐屋頂) 與西側柱列 (1F 撐陽台/遮簷)
      for (let cz = -b.d / 2 + 1.0; cz <= b.d / 2 - 0.8; cz += 6.5) {
        const colE = new THREE.Mesh(new THREE.BoxGeometry(0.32, totalH, 0.32), wallMat);
        colE.position.set(outerEdgeXE - 0.2, totalH / 2, cz);
        colE.castShadow = true;
        const colW = new THREE.Mesh(new THREE.BoxGeometry(0.32, fh, 0.32), wallMat);
        colW.position.set(outerEdgeXW + 0.2, fh / 2, cz);
        colW.castShadow = true;
        group.add(colE, colW);
        colliders.push({ b, lxMin: outerEdgeXE - 0.38, lxMax: outerEdgeXE - 0.02, lzMin: cz - 0.18, lzMax: cz + 0.18, floors: "both" });
        colliders.push({ b, lxMin: outerEdgeXW + 0.02, lxMax: outerEdgeXW + 0.38, lzMin: cz - 0.18, lzMax: cz + 0.18, floors: "1" });
      }

      // 2F 東側走廊全段外側與南北兩端欄杆防護
      const rz0 = -b.d / 2;
      const rz1 = b.d / 2;
      const rd = rz1 - rz0;
      const parapetE = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, rd), wallMat);
      parapetE.position.set(outerEdgeXE - 0.1, fh + 0.42, 0);
      const topRailE = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, rd), railMat);
      topRailE.position.set(outerEdgeXE - 0.1, fh + 1.05, 0);
      group.add(parapetE, topRailE);
      colliders.push({ b, lxMin: outerEdgeXE - 0.25, lxMax: outerEdgeXE + 0.25, lzMin: rz0, lzMax: rz1, floors: "2" });
      [-1, 1].forEach(ez => {
        const endZ = ez * (b.d / 2 - 0.1);
        const endParapet = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.85, 0.16), wallMat);
        endParapet.position.set(corrCenterXE, fh + 0.42, endZ);
        const endRail = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.06, 0.08), railMat);
        endRail.position.set(corrCenterXE, fh + 1.05, endZ);
        group.add(endParapet, endRail);
        colliders.push({ b, lxMin: wallFaceXE, lxMax: outerEdgeXE, lzMin: endZ - 0.2, lzMax: endZ + 0.2, floors: "2" });
      });

      addCorridorWallDetails(group, b.d, wallFaceXE, "z", 1, b.floors, fh, accentMat);
      addCorridorWallDetails(group, b.d, wallFaceXW, "z", -1, 1, fh, accentMat);
      const westBalcWin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.35, balcD - 2.0), winMat);
      westBalcWin.position.set(wallFaceXW - 0.02, fh + fh * 0.56, 0);
      group.add(westBalcWin);

      // 註冊 2F 東側走廊與西側小陽台可行走平面
      walkZones.push({
        b,
        lxMin: wallFaceXE - 0.4, lxMax: outerEdgeXE + 0.4,
        lzMin: -b.d / 2 - 1.2, lzMax: b.d / 2 + 1.2,
        y0: fh, y1: fh, rampAxis: null
      });
      walkZones.push({
        b,
        lxMin: outerEdgeXW - 0.2, lxMax: wallFaceXW + 0.4,
        lzMin: -balcD / 2 + 0.2, lzMax: balcD / 2 - 0.2,
        y0: fh, y1: fh, rampAxis: null
      });
    }

    // A 棟特色：擬真紅磚正門穿堂牌樓（比照 A棟校舍-2.jpg：1F/2F 中央透空、紅磚白縫磁磚、校徽五育徽、看板與花盆）& 屋頂光電板
    if (b.id === "bldg_a") {
      const portalX = (b.passages && b.passages[0]) ? b.passages[0].localX : 7.5;
      const brickTex = makeSignTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = "#c85a3a";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(248, 250, 252, 0.72)";
        ctx.lineWidth = 2;
        for (let y = 0; y <= h; y += 16) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          const off = ((y / 16) % 2) * 24;
          for (let x = off; x <= w; x += 48) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 16); ctx.stroke();
          }
        }
      });
      brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping;
      brickTex.repeat.set(2.5, 4.5);
      const brickMat = new THREE.MeshLambertMaterial({ map: brickTex });
      const whiteTileMat = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });

      // 左右兩側整高紅磚主牆柱 (1F+2F)
      [-4.2, 4.2].forEach(ox => {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(3.6, totalH, 0.9), brickMat);
        pier.position.set(portalX + ox, totalH / 2, b.d / 2 + 0.35);
        pier.castShadow = true;
        group.add(pier);
      });

      // 頂部橫向白磁磚額枋 + 「雲林縣斗六市溪洲國民小學」校名
      const topBeamTex = makeSignTexture(1024, 96, (ctx, w, h) => {
        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 2;
        for (let x = 0; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        ctx.fillStyle = "#334155";
        ctx.font = "bold 44px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("雲  林  縣  斗  六  市  溪  洲  國  民  小  學", w / 2, h / 2 + 2);
      });
      const topBeam = new THREE.Mesh(
        new THREE.BoxGeometry(12.8, 0.72, 1.05),
        [whiteTileMat, whiteTileMat, whiteTileMat, whiteTileMat, new THREE.MeshLambertMaterial({ map: topBeamTex }), whiteTileMat]
      );
      topBeam.position.set(portalX, totalH + 0.05, b.d / 2 + 0.35);
      topBeam.castShadow = true;
      group.add(topBeam);

      // 四根白色立柱框邊（左右外側 + 中央門洞兩側，貫穿 1F/2F）
      [-6.15, -2.35, 2.35, 6.15].forEach(px => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, totalH, 1.06), whiteTileMat);
        post.position.set(portalX + px, totalH / 2, b.d / 2 + 0.35);
        post.castShadow = true;
        group.add(post);
      });

      // 1F 門楣白框與電子跑馬燈
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.05, 0.44, 1.05), whiteTileMat);
      lintel.position.set(portalX, fh - 0.16, b.d / 2 + 0.35);
      group.add(lintel);
      const ledTex = makeSignTexture(512, 64, (ctx, w, h) => {
        ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fde047"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("★ 歡迎蒞臨雲林縣溪洲國小 115 學年度校慶 ★", w / 2, 41);
      });
      const ledSign = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.36, 0.08), new THREE.MeshBasicMaterial({ map: ledTex }));
      ledSign.position.set(portalX, fh - 0.22, b.d / 2 + 0.88);
      group.add(ledSign);

      // 2F 中央穿堂上方「健康 活潑 快樂 感恩」彩色橫幅
      const bannerTex = makeSignTexture(512, 112, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, "#fb923c"); g.addColorStop(0.5, "#fde047"); g.addColorStop(1, "#38bdf8");
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#991b1b"; ctx.font = "bold 38px serif"; ctx.textAlign = "center";
        ctx.fillText("健康    活潑    快樂    感恩", w / 2, 48);
        ctx.fillStyle = "#1e293b"; ctx.font = "bold 18px sans-serif";
        ctx.fillText("Healthy     Lively     Happy     Thankful", w / 2, 82);
        const dotColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6"];
        for (let i = 0; i < 10; i++) {
          ctx.fillStyle = dotColors[i % dotColors.length];
          ctx.beginPath(); ctx.arc(28 + i * 50, 100, 10, 0, Math.PI * 2); ctx.fill();
        }
      });
      const banner = new THREE.Mesh(new THREE.BoxGeometry(4.55, 1.0, 0.12), new THREE.MeshLambertMaterial({ map: bannerTex }));
      banner.position.set(portalX, fh + 0.65, b.d / 2 + 0.84);
      group.add(banner);

      // 左側五育圓徽 & 右側溪洲校徽（白色浮雕圓牌）
      const leftBadgeTex = makeSignTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = "#c85a3a"; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = 8;
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
          ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * 56, h / 2 + Math.sin(a) * 56, 40, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(w / 2, h / 2, 34, 0, Math.PI * 2); ctx.stroke();
      });
      const rightBadgeTex = makeSignTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = "#c85a3a"; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(w / 2, h / 2 - 12, 76, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(w / 2, h / 2 - 12, 50, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#f8fafc"; ctx.font = "bold 36px serif"; ctx.textAlign = "center";
        ctx.fillText("溪洲", w / 2, h / 2);
        ctx.font = "bold 16px sans-serif";
        ctx.fillText("Shijou Elementary School", w / 2, h - 22);
      });
      const badgeL = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.3, 0.1), new THREE.MeshLambertMaterial({ map: leftBadgeTex }));
      badgeL.position.set(portalX - 4.2, totalH * 0.65, b.d / 2 + 0.82);
      const badgeR = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.3, 0.1), new THREE.MeshLambertMaterial({ map: rightBadgeTex }));
      badgeR.position.set(portalX + 4.2, totalH * 0.65, b.d / 2 + 0.82);
      group.add(badgeL, badgeR);

      // 右側紅磚牆下方公佈欄
      const noticeTex = makeSignTexture(256, 128, (ctx, w, h) => {
        ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#e2e8f0"; ctx.fillRect(10, 10, w - 20, h - 20);
        ["#fecaca", "#fef08a", "#fca5a5", "#bfdbfe"].forEach((c, idx) => {
          ctx.fillStyle = c; ctx.fillRect(20 + idx * 56, 20, 44, 86);
        });
      });
      const noticeBoard = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.05, 0.18), new THREE.MeshLambertMaterial({ map: noticeTex }));
      noticeBoard.position.set(portalX + 4.2, 2.05, b.d / 2 + 0.84);
      group.add(noticeBoard);

      // 左右各 3 座白綠陶瓷花盆
      const potBodyMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
      const potRimMat = new THREE.MeshLambertMaterial({ color: 0x16a34a });
      [-5.4, -4.2, -3.0, 3.0, 4.2, 5.4].map(ox => portalX + ox).forEach(px => {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.45, 10), potBodyMat);
        pot.position.set(px, 0.22, b.d / 2 + 1.05);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.25, 0.12, 10), potRimMat);
        rim.position.set(px, 0.44, b.d / 2 + 1.05);
        group.add(pot, rim);
      });

      addSolarPanels(group, b.w, b.d, totalH + 0.45, 2, 16, 2.5, 1.2);
    }

    if (b.id === "bldg_b") {
      // B 棟 2F 專科教室標示牌（對應創客藝廊右側前兩間：左側美勞教室、右側社會教室）
      const wallFaceZ = b.d / 2 - corrSize;
      [
        { lx: 10.5, label: "美勞教室", bg: "#fef3c7", fg: "#9a3412" },
        { lx: 17.5, label: "社會教室", bg: "#e0f2fe", fg: "#075985" }
      ].forEach(rm => {
        const sTex = makeSignTexture(256, 72, (ctx, w, h) => {
          ctx.fillStyle = rm.bg; ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = rm.fg; ctx.lineWidth = 4; ctx.strokeRect(4, 4, w - 8, h - 8);
          ctx.fillStyle = rm.fg; ctx.font = "bold 36px sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(rm.label, w / 2, h / 2 + 2);
        });
        const signMesh = new THREE.Mesh(
          new THREE.BoxGeometry(2.4, 0.65, 0.12),
          new THREE.MeshLambertMaterial({ map: sTex })
        );
        signMesh.position.set(rm.lx, fh + 2.65, wallFaceZ + 0.12);
        group.add(signMesh);
      });

      const sub = new THREE.Group();
      sub.position.x = b.w * 0.22;
      addSolarPanels(sub, b.w * 0.48, b.d, totalH + 0.45, 2, 8, 1.5, 1.2);
      group.add(sub);
    }

    if (b.id === "bldg_d") {
      const sub = new THREE.Group();
      sub.position.set(corrSize / 2, 0, b.d * 0.2);
      addSolarPanels(sub, b.w - corrSize, b.d * 0.45, totalH + 0.45, 3, 2, 1.4, 1.0);
      group.add(sub);
    }

    return group;
  }

  // 建立光電綜合球場 (人物可走入，西側2面藍底網球場＋東側1面紅綠籃球場＋東南小練習場)
  function buildSolarCourt(b, colliders) {
    const group = new THREE.Group();
    const h = b.floorHeight;

    // 1. 高解析度球場地坪 CanvasTexture
    const cw = 1024, ch = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");

    // 橄欖綠與紅磚外框底色
    ctx.fillStyle = "#5c6b3c";
    ctx.fillRect(0, 0, cw * 0.5, ch);
    ctx.fillStyle = "#9e3b33";
    ctx.fillRect(cw * 0.5, 0, cw * 0.5, ch);

    // 繪製西側兩面天藍色網球場 (南北向)
    function drawTennisCourt(x0, y0, w, l) {
      ctx.fillStyle = "#3b82b6";
      ctx.fillRect(x0, y0, w, l);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.strokeRect(x0, y0, w, l);
      // 雙打邊線與發球區
      const inset = w * 0.12;
      ctx.strokeRect(x0 + inset, y0, w - inset * 2, l);
      const srv = l * 0.22;
      ctx.beginPath();
      ctx.moveTo(x0 + inset, y0 + srv); ctx.lineTo(x0 + w - inset, y0 + srv);
      ctx.moveTo(x0 + inset, y0 + l - srv); ctx.lineTo(x0 + w - inset, y0 + l - srv);
      ctx.moveTo(x0 + w / 2, y0 + srv); ctx.lineTo(x0 + w / 2, y0 + l - srv);
      ctx.stroke();
      // 黃色輔助線 (對應實景照片)
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 3;
      ctx.strokeRect(x0 + 10, y0 + 18, w - 20, l - 36);
    }
    drawTennisCourt(58, 90, 175, 820);
    drawTennisCourt(275, 90, 175, 820);

    // 繪製東側主籃球場 (南北向：森林綠內場 + 紅磚禁區)
    const bx = 545, by = 90, bw = 270, bl = 580;
    ctx.fillStyle = "#3a7d52";
    ctx.fillRect(bx, by, bw, bl);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.strokeRect(bx, by, bw, bl);
    // 中線與中圈
    ctx.beginPath();
    ctx.moveTo(bx, by + bl / 2); ctx.lineTo(bx + bw, by + bl / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx + bw / 2, by + bl / 2, 34, 0, Math.PI * 2);
    ctx.stroke();
    // 南北紅磚禁區與三分線
    const keyW = 86, keyH = 110;
    ctx.fillStyle = "#9e3b33";
    ctx.fillRect(bx + (bw - keyW) / 2, by, keyW, keyH);
    ctx.strokeRect(bx + (bw - keyW) / 2, by, keyW, keyH);
    ctx.fillRect(bx + (bw - keyW) / 2, by + bl - keyH, keyW, keyH);
    ctx.strokeRect(bx + (bw - keyW) / 2, by + bl - keyH, keyW, keyH);
    ctx.beginPath(); ctx.arc(bx + bw / 2, by + 35, 105, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx + bw / 2, by + bl - 35, 105, Math.PI + 0.15, Math.PI * 2 - 0.15); ctx.stroke();

    // 繪製東南側小籃球練習場 (東西座向)
    const mx = 545, my = 720, mw = 400, ml = 210;
    ctx.fillStyle = "#3a7d52";
    ctx.fillRect(mx, my, mw, ml);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(mx, my, mw, ml);
    ctx.fillStyle = "#9e3b33";
    ctx.fillRect(mx + mw - 80, my + (ml - 70) / 2, 80, 70);
    ctx.strokeRect(mx + mw - 80, my + (ml - 70) / 2, 80, 70);

    const floorTex = new THREE.CanvasTexture(canvas);
    floorTex.anisotropy = 8;
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(b.w - 0.6, b.d - 0.6),
      new THREE.MeshLambertMaterial({ map: floorTex })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.08;
    base.receiveShadow = true;
    group.add(base);

    // 2. 西側兩座 3D 網球網 & 綠色對打練習牆
    const netMat = new THREE.MeshLambertMaterial({ color: 0x1e293b, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
    const bandMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    [-b.w * 0.33, -b.w * 0.12].forEach(nx => {
      const nw = b.w * 0.17;
      const net = new THREE.Mesh(new THREE.PlaneGeometry(nw, 0.95), netMat);
      net.position.set(nx, 0.55, 0);
      const topBand = new THREE.Mesh(new THREE.BoxGeometry(nw, 0.08, 0.06), bandMat);
      topBand.position.set(nx, 1.03, 0);
      group.add(net, topBand);
      if (colliders) {
        colliders.push({ b, lxMin: nx - nw / 2, lxMax: nx + nw / 2, lzMin: -0.15, lzMax: 0.15, floors: "1" });
      }
    });
    const hitWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 2.6, b.d * 0.55),
      new THREE.MeshLambertMaterial({ color: 0x15803d })
    );
    hitWall.position.set(-b.w / 2 + 0.6, 1.3, -b.d * 0.1);
    group.add(hitWall);
    if (colliders) {
      colliders.push({ b, lxMin: -b.w / 2 + 0.4, lxMax: -b.w / 2 + 0.8, lzMin: -b.d * 0.1 - b.d * 0.275, lzMax: -b.d * 0.1 + b.d * 0.275, floors: "1" });
    }

    // 3. 東側籃球架 (主球場南北各 1 + 東南練習場東側 1)
    function addHoop(hx, hz, rotY) {
      const hg = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 3.2, 8), new THREE.MeshLambertMaterial({ color: 0x1d4ed8 }));
      pole.position.y = 1.6;
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 0.08), new THREE.MeshLambertMaterial({ color: 0xf8fafc }));
      board.position.set(0, 3.05, 0.45);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 8, 16), new THREE.MeshLambertMaterial({ color: 0xea580c }));
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, 2.85, 0.75);
      hg.add(pole, board, rim);
      hg.position.set(hx, 0.08, hz);
      hg.rotation.y = rotY;
      group.add(hg);
      if (colliders) {
        colliders.push({ b, lxMin: hx - 0.2, lxMax: hx + 0.2, lzMin: hz - 0.2, lzMax: hz + 0.2, floors: "1" });
      }
    }
    addHoop(b.w * 0.16, -b.d * 0.36, 0);
    addHoop(b.w * 0.16, b.d * 0.15, Math.PI);
    addHoop(b.w * 0.44, b.d * 0.32, -Math.PI / 2);

    // 4. 鋼骨支撐柱 (僅柱心註冊細小碰撞，人物可自由走進球場)
    const colMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
    const colGeo = new THREE.CylinderGeometry(0.28, 0.28, h, 8);
    [-b.w / 2 + 1.5, -b.w / 6, b.w / 6, b.w / 2 - 1.5].forEach(cx => {
      [-b.d / 2 + 1.5, b.d / 2 - 1.5].forEach(cz => {
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(cx, h / 2, cz);
        col.castShadow = true;
        group.add(col);
        if (colliders) {
          colliders.push({ b, lxMin: cx - 0.32, lxMax: cx + 0.32, lzMin: cz - 0.32, lzMax: cz + 0.32, floors: "1" });
        }
      });
    });

    // 半透明鋼構頂棚 + 太陽能板
    const roofBase = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, 0.35, b.d),
      new THREE.MeshLambertMaterial({ color: 0xe2e8f0 })
    );
    roofBase.position.y = h;
    roofBase.castShadow = true;
    roofBase.receiveShadow = true;
    group.add(roofBase);

    addSolarPanels(group, b.w, b.d, h + 0.18, 6, 8, 1.5, 1.5);
    return group;
  }

  // 建立 PU 跑道運動場 (含 6 跑道白線、100m 直線衝刺道、道牙與中央草皮)
  function buildTrackField(b) {
    const group = new THREE.Group();
    const R_out = 16.2;
    const lanes = 6;
    const laneW = 1.05;
    const R_in = R_out - lanes * laneW; // 9.9m
    const straight = 38.0;
    const halfL = straight / 2; // 19.0m

    // 1. 高解析度 CanvasTexture (1024x2048 對應 36m x 72m，等比 28.44 px/m)
    const W = 36.0;
    const D = 72.0;
    const cw = 1024;
    const ch = 2048;
    const s = cw / W; // px per meter (exact 1:1)
    const cx0 = cw / 2;
    const cy0 = ch / 2;

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, cw, ch);

    function toX(x) { return cx0 + x * s; }
    function toY(z) { return cy0 + z * s; }
    function stadiumPath(r) {
      ctx.beginPath();
      ctx.arc(toX(0), toY(-halfL), r * s, Math.PI, 0, false);
      ctx.lineTo(toX(r), toY(halfL));
      ctx.arc(toX(0), toY(halfL), r * s, 0, Math.PI, false);
      ctx.closePath();
    }

    // 1a. 紅磚色 PU 跑道底 (橢圓 + 東側 100m 直線延伸道)
    ctx.fillStyle = b.colors.track || "#C14D3A";
    stadiumPath(R_out);
    ctx.fill();

    // 東側 100m 直線道 (南端起跑區至北端緩衝區)
    const chuteSouth = halfL + 15.2; // z = +34.2
    const chuteNorth = -halfL - 9.0; // z = -28.0
    ctx.fillRect(
      toX(R_in),
      toY(chuteNorth),
      (R_out - R_in) * s,
      (chuteSouth - chuteNorth) * s
    );

    // 1b. 中央翠綠草皮
    ctx.fillStyle = b.colors.turf || "#5B9A49";
    stadiumPath(R_in);
    ctx.fill();

    // 草皮淡淡割草條紋
    ctx.save();
    stadiumPath(R_in);
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let z = -30; z < 30; z += 4) {
      ctx.fillRect(toX(-R_in), toY(z), R_in * 2 * s, 2 * s);
    }
    ctx.restore();

    // 1c. 6 條跑道白線 (含內外邊線共 7 條)
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = Math.max(1.8, 0.08 * s);
    for (let i = 0; i <= lanes; i++) {
      const r = R_in + i * laneW;
      stadiumPath(r);
      ctx.stroke();
    }

    // 東側 100m 直線延長道白線 (實線直通南北端)
    for (let i = 0; i <= lanes; i++) {
      const lx = R_in + i * laneW;
      ctx.beginPath();
      ctx.moveTo(toX(lx), toY(chuteNorth));
      ctx.lineTo(toX(lx), toY(chuteSouth));
      ctx.stroke();
    }

    // 南端 100m 起跑線與 1~6 跑道編號
    const startZ = chuteSouth - 1.4;
    ctx.lineWidth = Math.max(2.4, 0.12 * s);
    ctx.beginPath();
    ctx.moveTo(toX(R_in), toY(startZ));
    ctx.lineTo(toX(R_out), toY(startZ));
    ctx.stroke();

    // 終點線 (東側直道中央略偏北)
    const finishZ = -halfL + 4.0;
    ctx.beginPath();
    ctx.moveTo(toX(R_in), toY(finishZ));
    ctx.lineTo(toX(R_out), toY(finishZ));
    ctx.stroke();

    // 接力區黃色標記線
    ctx.strokeStyle = "#F4C430";
    ctx.lineWidth = Math.max(1.5, 0.06 * s);
    [-halfL, 0, halfL].forEach(zMark => {
      ctx.beginPath();
      ctx.moveTo(toX(R_in), toY(zMark));
      ctx.lineTo(toX(R_out), toY(zMark));
      ctx.stroke();
    });

    // 跑道數字 1~6 (白字)
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${Math.round(0.75 * s)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < lanes; i++) {
      const lx = R_in + (i + 0.5) * laneW;
      ctx.fillText(String(i + 1), toX(lx), toY(startZ - 1.1));
    }

    // 1d. 內圈混凝土道牙白邊
    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth = Math.max(3.5, 0.22 * s);
    stadiumPath(R_in - 0.12);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    const trackPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshLambertMaterial({ map: tex, transparent: true })
    );
    trackPlane.rotation.x = -Math.PI / 2;
    trackPlane.position.y = 0.08;
    trackPlane.receiveShadow = true;
    group.add(trackPlane);

    return group;
  }

  // 輔助：快速產生文字/彩繪 CanvasTexture
  function makeSignTexture(cw, ch, drawFn) {
    const cv = document.createElement("canvas");
    cv.width = cw; cv.height = ch;
    const ctx = cv.getContext("2d");
    drawFn(ctx, cw, ch);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  }

  // 築夢溪洲司令台 (3D 幾何建模：天藍泡泡舞台裙＋立體彩球＋黃色綠葉雙柱＋向量繪製築夢溪洲壁畫)
  function buildStage(b) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, 1.0, b.d),
      new THREE.MeshLambertMaterial({ color: 0x38bdf8 })
    );
    base.position.y = 0.5;
    base.castShadow = true;
    group.add(base);

    // 舞台正面 3D 立體彩色圓球與泡泡裝飾
    const decorSpheres = [
      [-1.8, 0.52, 0.28, 0x22c55e],
      [-0.2, 0.5, 0.36, 0xdc2626],
      [1.6, 0.52, 0.28, 0xfacc15],
      [2.6, 0.54, 0.22, 0x22c55e]
    ];
    decorSpheres.forEach(([dz, dy, r, col]) => {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 14), new THREE.MeshLambertMaterial({ color: col }));
      sp.scale.set(0.35, 1, 1);
      sp.position.set(-b.w / 2 - 0.02, dy, dz);
      group.add(sp);
    });

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 0.6, 0.32, b.d + 0.6),
      new THREE.MeshLambertMaterial({ color: hexColor(b.colors.roof) })
    );
    roof.position.y = b.floorHeight;
    roof.castShadow = true;
    group.add(roof);

    // 黃色雙立柱（上方帶綠葉彩繪環）
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
    const vineMat = new THREE.MeshLambertMaterial({ color: 0x4d7c0f });
    [-b.d / 2 + 0.45, b.d / 2 - 0.45].forEach(pz => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, b.floorHeight - 1.0, 12), pillarMat);
      p.position.set(-b.w / 2 + 0.45, 1.0 + (b.floorHeight - 1.0) / 2, pz);
      p.castShadow = true;
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.55, 12), vineMat);
      vine.position.set(-b.w / 2 + 0.45, b.floorHeight - 0.42, pz);
      group.add(p, vine);
    });

    // 乾淨手繪感向量彩繪背牆（森巴鼓、網球拍、跑跳學童與彩色山丘）
    const muralTex = makeSignTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = "#86efac"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#4ade80";
      ctx.beginPath(); ctx.arc(110, 240, 95, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#facc15";
      ctx.beginPath(); ctx.arc(260, 245, 85, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath(); ctx.arc(410, 240, 90, Math.PI, 0); ctx.fill();
      // 左右森巴大鼓
      ctx.fillStyle = "#ef4444"; ctx.fillRect(45, 115, 55, 95);
      ctx.fillStyle = "#fde047"; ctx.fillRect(45, 115, 55, 22);
      ctx.fillStyle = "#f97316"; ctx.fillRect(412, 120, 52, 90);
      ctx.fillStyle = "#fef08a"; ctx.fillRect(412, 120, 52, 20);
      // 人物剪影色塊
      ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.arc(195, 130, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(178, 158, 34, 62);
      ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(315, 126, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(298, 154, 34, 64);
      ctx.fillStyle = "#065f46"; ctx.font = "bold 36px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("築夢溪洲", w / 2, 54);
    });
    const plainWallMat = new THREE.MeshLambertMaterial({ color: 0xd1fae5 });
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, b.floorHeight - 1.0, b.d - 0.6),
      [plainWallMat, new THREE.MeshLambertMaterial({ map: muralTex }), plainWallMat, plainWallMat, plainWallMat, plainWallMat]
    );
    back.position.set(b.w / 2 - 0.4, 1.0 + (b.floorHeight - 1.0) / 2, 0);
    back.castShadow = true;
    group.add(back);

    // 兩側彩虹階梯
    [0x9333ea, 0x22c55e, 0xf97316].forEach((sc, i) => {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32 * (3 - i), 0.7), new THREE.MeshLambertMaterial({ color: sc }));
      step.position.set(0.4, (0.32 * (3 - i)) / 2, b.d / 2 + 0.35 + i * 0.45);
      group.add(step);
    });
    return group;
  }

  // 光電水循環生態池
  function buildEcoPond(b, colliders) {
    const group = new THREE.Group();
    const lawn = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, 0.1, b.d),
      new THREE.MeshLambertMaterial({ color: hexColor(b.colors.grass) })
    );
    lawn.position.y = 0.05;
    lawn.receiveShadow = true;
    group.add(lawn);

    // 白磁磚外牆＋紅磚池緣（參照 光電水循環生態池.JPG）
    const whiteWall = new THREE.Mesh(
      new THREE.CylinderGeometry(4.45, 4.55, 0.34, 28),
      new THREE.MeshLambertMaterial({ color: 0xe2e8f0 })
    );
    whiteWall.position.y = 0.17;
    group.add(whiteWall);

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 4.5, 0.12, 28),
      new THREE.MeshLambertMaterial({ color: 0xb94a38 })
    );
    rim.position.y = 0.36;
    group.add(rim);

    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(3.95, 3.95, 0.38, 28),
      new THREE.MeshPhongMaterial({ color: 0x3b7a57, specular: 0xffffff, shininess: 85 })
    );
    water.position.y = 0.22;
    group.add(water);

    // 中央假山石堆＋錦鯉噴水雕像＋青蛙擺飾＋白花盆
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
    [[0, 0.65, 0, 1.4], [-0.9, 0.45, 0.6, 0.85], [0.95, 0.48, -0.4, 0.9], [0.2, 0.5, 0.95, 0.75]].forEach(([rx, ry, rz, rs]) => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), rockMat);
      rock.position.set(rx, ry, rz);
      rock.scale.set(1.15, 0.72, 1.0);
      group.add(rock);
    });
    // 假山頂部橘紅錦鯉噴水雕像
    const koi = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.8, 10), new THREE.MeshLambertMaterial({ color: 0xf97316 }));
    koi.position.set(0, 1.45, 0);
    group.add(koi);
    // 右側綠色青蛙雕像
    const frog = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), new THREE.MeshLambertMaterial({ color: 0x22c55e }));
    frog.position.set(1.15, 0.68, 0.8);
    group.add(frog);

    // 池畔黃色禁止戲水告示牌
    const warnPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), new THREE.MeshLambertMaterial({ color: 0x94a3b8 }));
    warnPost.position.set(3.2, 0.55, 3.6);
    const warnBoard = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.05), new THREE.MeshLambertMaterial({ color: 0xfacc15 }));
    warnBoard.position.set(3.2, 1.05, 3.6);
    group.add(warnPost, warnBoard);

    // 西側光電水循環系統看板（向量繪製太陽能水循環吉祥物看板＋太陽能板屋頂）
    const mascotTex = makeSignTexture(256, 384, (ctx, w, h) => {
      ctx.fillStyle = "#fde68a"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#38bdf8"; ctx.fillRect(14, 14, w - 28, h - 28);
      ctx.fillStyle = "#22c55e"; ctx.beginPath(); ctx.arc(w / 2, 165, 68, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fef3c7"; ctx.beginPath(); ctx.arc(w / 2, 150, 44, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1e3a8a"; ctx.fillRect(w / 2 - 38, 86, 76, 26);
      ctx.fillStyle = "#1e293b"; ctx.beginPath(); ctx.arc(w / 2 - 14, 146, 5, 0, Math.PI * 2); ctx.arc(w / 2 + 14, 146, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#22c55e"; ctx.fillRect(w / 2 - 42, 225, 84, 90);
      ctx.fillStyle = "#0ea5e9"; ctx.beginPath(); ctx.arc(w / 2, 268, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("光電水循環", w / 2, h - 26);
    });
    const signBackMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const solarSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 1.75, 1.25),
      [new THREE.MeshLambertMaterial({ map: mascotTex }), signBackMat, signBackMat, signBackMat, signBackMat, signBackMat]
    );
    solarSign.position.set(-4.9, 1.28, 1.2);
    group.add(solarSign);

    const miniSolar = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.08, 1.45),
      new THREE.MeshPhongMaterial({ color: 0x1e3a5f, specular: 0x93c5fd })
    );
    miniSolar.position.set(-4.9, 2.22, 1.2);
    miniSolar.rotation.z = 0.25;
    group.add(miniSolar);

    // 池旁第二組小型太陽能集電板
    const subSolar = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.06, 0.95),
      new THREE.MeshPhongMaterial({ color: 0x1e3a5f, specular: 0x93c5fd })
    );
    subSolar.position.set(-2.5, 1.05, -3.5);
    subSolar.rotation.x = 0.45;
    group.add(subSolar);

    // 外圍放射狀白色踏步石
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 1.1), stoneMat);
      st.position.set(Math.cos(ang) * 5.6, 0.11, Math.sin(ang) * 5.6);
      st.rotation.y = -ang;
      group.add(st);
    }

    if (colliders) {
      // 生態池水體邊緣與西側光電看板不可穿越
      colliders.push({ b, lxMin: -4.2, lxMax: 4.2, lzMin: -4.2, lzMax: 4.2, floors: "1" });
      colliders.push({ b, lxMin: -5.2, lxMax: -4.6, lzMin: 0.5, lzMax: 1.9, floors: "1" });
    }

    return group;
  }

  // 入口意象（3D 實木直立格柵＋波浪五線譜＋立體森巴鼓＋立體網球拍＋波浪彩帶，僅面對校門口一面有圖樣）
  function buildGate(b, colliders) {
    const group = new THREE.Group();
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x7c5233 });
    const darkWoodMat = new THREE.MeshLambertMaterial({ color: 0x5c3b22 });

    // 14 根獨立 3D 實木格柵柱（前後兩側可見真實木條縫隙，背面與側面素面無圖樣）
    for (let i = 0; i < 14; i++) {
      const sx = -2.9 + i * (5.8 / 13);
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.25, 0.14), woodMat);
      slat.position.set(sx, 1.72, 0);
      slat.castShadow = true;
      group.add(slat);
    }
    // 背後兩道水平支撐鋼架＋雙立柱腳架
    [1.15, 2.35].forEach(ry => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.1, 0.12), darkWoodMat);
      rail.position.set(0, ry, -0.08);
      group.add(rail);
    });
    [-2.0, 2.0].forEach(px => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.5, 0.24), darkWoodMat);
      post.position.set(px, 0.75, -0.04);
      group.add(post);
    });

    // 正面 (+Z) 校名主牌（僅單面 PlaneGeometry 朝向 +Z 校門口，背面不可見）
    const titleTex = makeSignTexture(512, 160, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#1e3a8a"; ctx.lineWidth = 8;
      ctx.font = "bold 62px serif"; ctx.textAlign = "center";
      ctx.strokeText("溪洲國民小學", w / 2, 74);
      ctx.fillStyle = "#1d4ed8"; ctx.fillText("溪洲國民小學", w / 2, 74);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(92, 92, w - 184, 24);
      ctx.fillStyle = "#1e293b"; ctx.font = "bold 17px sans-serif";
      ctx.fillText("Shi Jou Elementary School", w / 2, 110);
      ctx.fillStyle = "#dc2626"; ctx.font = "bold 22px sans-serif";
      ctx.fillText("健康 ♥ 活潑 ♥ 快樂 ♥ 感恩", w / 2, 144);
    });
    const titlePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 1.35),
      new THREE.MeshLambertMaterial({ map: titleTex, transparent: true })
    );
    titlePlane.position.set(-0.2, 1.82, 0.1);
    group.add(titlePlane);

    // 正面頂端波浪五線譜音符條
    const staffMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const noteColors = [0xef4444, 0x8b5cf6, 0x22c55e, 0x3b82f6, 0xf97316];
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.26, 0.06), staffMat);
      const sx = -2.75 + i * 1.1;
      const sy = 2.82 + Math.sin(i * 0.9) * 0.12;
      seg.position.set(sx, sy, 0.11);
      seg.rotation.z = Math.cos(i * 0.9) * 0.12;
      group.add(seg);
      const note = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), new THREE.MeshLambertMaterial({ color: noteColors[i % noteColors.length] }));
      note.position.set(sx, sy + 0.1, 0.16);
      group.add(note);
    }

    // 正面左側兩座 3D 立體森巴鼓
    const drumTop = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.26, 0.42, 14), new THREE.MeshLambertMaterial({ color: 0x84cc16 }));
    drumTop.position.set(-2.95, 2.55, 0.18);
    const drumMid = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.48, 14), new THREE.MeshLambertMaterial({ color: 0xdc2626 }));
    drumMid.position.set(-3.15, 1.32, 0.2);
    group.add(drumTop, drumMid);

    // 正面右側 3D 立體網球拍
    const racketRim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 10, 20), new THREE.MeshLambertMaterial({ color: 0x3b82f6 }));
    racketRim.position.set(2.35, 1.9, 0.16);
    const racketHandle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.85, 0.1), new THREE.MeshLambertMaterial({ color: 0xc2410c }));
    racketHandle.position.set(2.8, 1.25, 0.16);
    racketHandle.rotation.z = 0.65;
    group.add(racketRim, racketHandle);

    // 正面底部黃紅藍波浪 SJES 彩帶（單面朝 +Z）
    const waveTex = makeSignTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = "#facc15"; ctx.fillRect(0, 12, w, 34);
      ctx.fillStyle = "#ef4444"; ctx.fillRect(0, 46, w, 34);
      ctx.fillStyle = "#0ea5e9"; ctx.fillRect(0, 80, w, 36);
      ["S", "J", "E", "S"].forEach((ch, idx) => {
        const cx = 85 + idx * 105;
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(cx, 62, 26, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ["#d97706", "#0284c7", "#dc2626", "#db2777"][idx];
        ctx.font = "bold 30px serif"; ctx.textAlign = "center"; ctx.fillText(ch, cx, 73);
      });
    });
    const waveStrip = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.95), new THREE.MeshLambertMaterial({ map: waveTex }));
    waveStrip.position.set(0, 0.88, 0.12);
    group.add(waveStrip);

    if (colliders) {
      colliders.push({ b, lxMin: -3.2, lxMax: 3.2, lzMin: -0.35, lzMax: 0.35, floors: "1" });
    }
    return group;
  }

  // 香蕉園落葉循環示範區（參照 香蕉園落葉循環示範區-實景02.png：黑色抑草蓆 + 兩區落葉堆肥樹穴 + 香蕉樹叢 + 綠色圍籬 + 實景告示牌）
  function buildBananaGarden(b) {
    const group = new THREE.Group();
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, 0.1, b.d),
      new THREE.MeshLambertMaterial({ color: 0x27272a })
    );
    pad.position.y = 0.05;
    pad.receiveShadow = true;
    group.add(pad);

    // 兩條長條形落葉堆肥樹穴（金黃枯葉鋪面）
    const mulchMat = new THREE.MeshLambertMaterial({ color: 0xa16207 });
    [-2.1, 1.9].forEach(mz => {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(b.w - 1.6, 0.06, 2.6), mulchMat);
      bed.position.set(0, 0.12, mz);
      bed.receiveShadow = true;
      group.add(bed);
    });

    // 茂密香蕉樹叢（多片寬大下垂香蕉葉）
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x65a30d });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x4d9a36 });
    [[-4.0, -2.1], [-1.2, -2.1], [1.6, -2.1], [4.0, -2.1], [-3.2, 1.9], [0.2, 1.9], [3.5, 1.9]].forEach(([bx, bz], idx) => {
      const h = 1.9 + (idx % 3) * 0.4;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, h, 8), stemMat);
      stem.position.set(bx, h / 2, bz);
      stem.castShadow = true;
      group.add(stem);

      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2 + idx * 0.4;
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.05, 0.46), leafMat);
        leaf.position.set(bx + Math.cos(ang) * 0.72, h + 0.05, bz + Math.sin(ang) * 0.72);
        leaf.rotation.y = -ang;
        leaf.rotation.z = -0.32;
        leaf.castShadow = true;
        group.add(leaf);
      }
    });

    // 球場側綠色網格圍籬
    const fence = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, 1.35, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x16a34a, transparent: true, opacity: 0.72 })
    );
    fence.position.set(0, 0.7, -b.d / 2 + 0.06);
    group.add(fence);

    // 向量繪製「落葉循環示範區」告示牌
    const signTex = makeSignTexture(256, 160, (ctx, w, h) => {
      ctx.fillStyle = "#fef2f2"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#dc2626"; ctx.fillRect(0, 0, w, 46);
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("落葉循環示範區", w / 2, 32);
      ctx.fillStyle = "#166534"; ctx.font = "bold 20px sans-serif";
      ctx.fillText("自然堆肥・生態永續", w / 2, 92);
      ctx.fillStyle = "#991b1b"; ctx.font = "bold 18px sans-serif";
      ctx.fillText("禁止停車・愛護作物", w / 2, 132);
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.1), new THREE.MeshLambertMaterial({ map: signTex }));
    sign.position.set(0, 0.85, b.d / 2 - 0.35);
    group.add(sign);
    return group;
  }

  // 網球主題廁所 (緊鄰 A 棟西側樓梯並排，北側為廁所量體、南側為可東西貫穿通行之走廊)
  function buildToilet(b, colliders) {
    const group = new THREE.Group();
    const fh = b.floorHeight;
    const corrSize = 3.1;
    const roomD = b.d - corrSize;
    const roomCenterZ = -corrSize / 2;
    const wallFaceZ = b.d / 2 - corrSize;
    const corrCenterZ = b.d / 2 - corrSize / 2;

    // 1. 北側廁所主體（鮮黃牆面＋綠屋頂，並註冊本體碰撞）
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, fh, roomD),
      new THREE.MeshLambertMaterial({ color: hexColor(b.colors.wall, "#FEF08A") })
    );
    body.position.set(0, fh / 2, roomCenterZ);
    body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    if (colliders) {
      colliders.push({ b, lxMin: -b.w / 2, lxMax: b.w / 2, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "1" });
    }

    // 廁所朝南走廊側門面與網球立體標誌
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 2.25, 0.14),
      new THREE.MeshLambertMaterial({ color: 0x334155 })
    );
    door.position.set(0, 1.12, wallFaceZ + 0.06);
    group.add(door);

    const signBand = new THREE.Mesh(
      new THREE.BoxGeometry(b.w - 0.6, 0.55, 0.12),
      new THREE.MeshLambertMaterial({ color: hexColor(b.colors.accent, "#84CC16") })
    );
    signBand.position.set(0, fh - 0.55, wallFaceZ + 0.06);
    group.add(signBand);

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 16),
      new THREE.MeshLambertMaterial({ color: 0xa3e635 })
    );
    ball.position.set(-2.1, 2.55, wallFaceZ + 0.35);
    group.add(ball);

    // 2. 南側透空走廊（地板＋屋頂＋外緣柱，可從東側 A 棟走廊直通西側外面）
    const f1Floor = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, 0.12, corrSize),
      new THREE.MeshLambertMaterial({ color: 0xe7e0d6 })
    );
    f1Floor.position.set(0, 0.06, corrCenterZ);
    f1Floor.receiveShadow = true;
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 0.3, 0.38, b.d + 0.3),
      new THREE.MeshLambertMaterial({ color: hexColor(b.colors.roof, "#65A30D") })
    );
    roof.position.set(0, fh + 0.19, 0);
    roof.castShadow = true;
    group.add(f1Floor, roof);

    const col = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, fh, 0.32),
      new THREE.MeshLambertMaterial({ color: 0xfef08a })
    );
    col.position.set(-b.w / 2 + 0.3, fh / 2, b.d / 2 - 0.2);
    col.castShadow = true;
    group.add(col);
    if (colliders) {
      colliders.push({ b, lxMin: -b.w / 2 + 0.12, lxMax: -b.w / 2 + 0.48, lzMin: b.d / 2 - 0.38, lzMax: b.d / 2 - 0.02, floors: "1" });
    }

    return group;
  }

  // 溫室 / 停車鋼棚 / 遊戲場 / 一般單層建物
  function buildSimpleFacility(b, colliders) {
    const group = new THREE.Group();
    if (b.style === "shed") {
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, 0.22, b.d),
        new THREE.MeshLambertMaterial({ color: hexColor(b.colors.roof) })
      );
      roof.position.y = b.floorHeight;
      roof.castShadow = true;
      group.add(roof);
      const pMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
      const posts = Math.max(2, Math.round(b.w / 6));
      for (let i = 0; i < posts; i++) {
        const px = -b.w / 2 + 1 + (i / (posts - 1)) * (b.w - 2);
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, b.floorHeight, 8), pMat);
        p.position.set(px, b.floorHeight / 2, 0);
        group.add(p);
      }
      return group;
    }

    if (b.style === "greenhouse") {
      // 綠活網室菜園（3D 鍍鋅鋼管骨架＋白色防蟲網室＋西側黑鐵網格吊盆架＋菜園小約定看板＋高架菜圃）
      const gh = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, b.floorHeight, b.d),
        new THREE.MeshLambertMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.45 })
      );
      gh.position.y = b.floorHeight / 2;
      gh.castShadow = true;
      group.add(gh);

      // 四角與中段鍍鋅鋼管立柱
      const pipeMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
      [-b.w / 2, 0, b.w / 2].forEach(px => {
        [-b.d / 2, b.d / 2].forEach(pz => {
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, b.floorHeight, 8), pipeMat);
          pipe.position.set(px, b.floorHeight / 2, pz);
          group.add(pipe);
        });
      });

      // 西側網室出入口（與道路相鄰、面向 C 棟）：黑鐵網格架、吊盆與「溪洲綠活菜園」向量看板
      const gridTex = makeSignTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#475569"; ctx.lineWidth = 3;
        for (let i = 0; i <= w; i += 16) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
        }
      });
      const gridMat = new THREE.MeshLambertMaterial({ map: gridTex });
      [-2.0, 2.0].forEach(gz => {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 1.4), gridMat);
        rack.position.set(-b.w / 2 - 0.04, 1.4, gz);
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.25, 8), new THREE.MeshLambertMaterial({ color: 0x334155 }));
        pot.position.set(-b.w / 2 - 0.18, 1.05, gz);
        const fern = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), new THREE.MeshLambertMaterial({ color: 0x65a30d }));
        fern.position.set(-b.w / 2 - 0.2, 1.32, gz);
        group.add(rack, pot, fern);
      });
      const gardenSignTex = makeSignTexture(256, 192, (ctx, w, h) => {
        ctx.fillStyle = "#f0fdf4"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#16a34a"; ctx.fillRect(0, 0, w, 46);
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("溪洲綠活菜園", w / 2, 32);
        ctx.fillStyle = "#1e293b"; ctx.font = "bold 18px sans-serif";
        ctx.fillText("菜園小約定", w / 2, 74);
        ctx.fillStyle = "#475569"; ctx.font = "14px sans-serif";
        ctx.fillText("1. 愛護作物・小心行走", w / 2, 106);
        ctx.fillText("2. 工具歸位・維持整潔", w / 2, 132);
        ctx.fillText("3. 友善共享・開放體驗", w / 2, 158);
      });
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.65), new THREE.MeshLambertMaterial({ map: gardenSignTex }));
      banner.rotation.y = -Math.PI / 2;
      banner.position.set(-b.w / 2 - 0.06, 1.45, 0);
      group.add(banner);

      for (let bx = -b.w * 0.34; bx <= b.w * 0.34; bx += b.w * 0.22) {
        const bed = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, b.d * 0.72), new THREE.MeshLambertMaterial({ color: 0x78350f }));
        bed.position.set(bx, 0.24, 0);
        const crop = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.22, b.d * 0.65), new THREE.MeshLambertMaterial({ color: 0x22c55e }));
        crop.position.set(bx, 0.56, 0);
        group.add(bed, crop);
      }
      return group;
    }

    if (b.style === "playground") {
      // 北側遊戲場（對照實景：深灰紅安全地墊 + 藍色溜滑梯塔 + 綠色拱頂蓬 + 黃色雙滑梯 + 紅色鞦韆架）
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, 0.14, b.d),
        new THREE.MeshLambertMaterial({ color: hexColor(b.colors.ground) })
      );
      pad.position.y = 0.07;
      pad.receiveShadow = true;
      group.add(pad);

      const tower = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.5, 2.6), new THREE.MeshLambertMaterial({ color: 0x0ea5e9 }));
      tower.position.set(-2.5, 1.25, 0);
      tower.castShadow = true;
      // 綠色弧形拱頂蓬
      const canopy = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 2.8, 14, 1, false, 0, Math.PI), new THREE.MeshLambertMaterial({ color: 0x65a30d }));
      canopy.rotation.z = Math.PI / 2;
      canopy.rotation.y = Math.PI / 2;
      canopy.position.set(-2.5, 2.75, 0);
      group.add(tower, canopy);

      [-0.85, 0.85].forEach(sz => {
        const slide = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 0.9), new THREE.MeshLambertMaterial({ color: 0xfacc15 }));
        slide.position.set(0.6, 1.15, sz);
        slide.rotation.z = -0.45;
        slide.castShadow = true;
        group.add(slide);
      });

      // 東側鞦韆架
      const swingMat = new THREE.MeshLambertMaterial({ color: 0xef4444 });
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 8), swingMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(5.2, 2.5, 0);
      group.add(bar);
      [3.3, 7.1].forEach(sx => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8), swingMat);
        leg.position.set(sx, 1.3, 0);
        group.add(leg);
      });
      if (colliders) {
        colliders.push({ b, lxMin: -4.1, lxMax: -0.9, lzMin: -1.3, lzMax: 1.3, floors: "1" });
        colliders.push({ b, lxMin: -0.9, lxMax: 2.3, lzMin: -1.3, lzMax: 1.3, floors: "1" });
        colliders.push({ b, lxMin: 3.1, lxMax: 3.5, lzMin: -0.35, lzMax: 0.35, floors: "1" });
        colliders.push({ b, lxMin: 6.9, lxMax: 7.3, lzMin: -0.35, lzMax: 0.35, floors: "1" });
      }
      return group;
    }

    if (b.style === "samba") {
      // 3D 鼓動森巴彩繪牆及鋼琴彩繪地坪（立體白框雙窗＋手繪感向量壁畫＋鋼琴鍵彩繪地板）
      const floorTex = makeSignTexture(256, 512, (ctx, w, h) => {
        ctx.fillStyle = "#38bdf8"; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 12; i++) {
          ctx.fillStyle = i % 2 === 0 ? "#fef9c3" : "#1e293b";
          ctx.fillRect(18, 12 + i * 41, 108, 36);
        }
        ctx.fillStyle = "#f43f5e"; ctx.beginPath(); ctx.arc(185, 130, 48, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.arc(178, 270, 44, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#22c55e"; ctx.beginPath(); ctx.arc(190, 405, 42, 0, Math.PI * 2); ctx.fill();
      });
      const floor = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.1, b.d), new THREE.MeshLambertMaterial({ map: floorTex }));
      floor.position.y = 0.05;
      floor.receiveShadow = true;
      group.add(floor);

      const wallTex = makeSignTexture(512, 256, (ctx, w, h) => {
        ctx.fillStyle = "#fefce8"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#4ade80"; ctx.fillRect(0, 0, w, 62);
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("鼓動森巴・築夢溪洲", 145, 42);
        ctx.fillStyle = "#86efac"; ctx.beginPath(); ctx.arc(360, 58, 70, 0, Math.PI); ctx.fill();
        ctx.fillStyle = "#ef4444"; ctx.font = "bold 24px sans-serif";
        ctx.fillText("一起 38 吧", 105, 170);
        ctx.fillStyle = "#0ea5e9";
        ctx.fillText("織網好食光", 385, 210);
        ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.arc(95, 215, 28, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3b82f6"; ctx.beginPath(); ctx.arc(415, 155, 26, 0, Math.PI * 2); ctx.fill();
      });
      // 牆體僅覆蓋 B 棟教室西側端牆 (lz: -b.d/2 .. 2.0)，南側 3.1m 走廊保持開放可直通 PU 跑道運動場
      const wallMaxZ = 2.0;
      const wallD = b.d / 2 + wallMaxZ;
      const wallCenterZ = (-b.d / 2 + wallMaxZ) / 2;
      const plainWallMat = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 4.4, wallD),
        [plainWallMat, new THREE.MeshLambertMaterial({ map: wallTex }), plainWallMat, plainWallMat, plainWallMat, plainWallMat]
      );
      wall.position.set(b.w / 2 - 0.16, 2.2, wallCenterZ);
      wall.castShadow = true;
      group.add(wall);

      // 牆面 3D 白色窗框與玻璃窗
      const winFrameMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
      const winGlassMat = new THREE.MeshPhongMaterial({ color: 0xf1f5f9, specular: 0xffffff, shininess: 70, transparent: true, opacity: 0.55 });
      [-3.3, 0.2].forEach(wz => {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.05, 2.8), winFrameMat);
        frame.position.set(b.w / 2 - 0.16, 2.35, wz);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.85, 2.55), winGlassMat);
        glass.position.set(b.w / 2 - 0.16, 2.35, wz);
        group.add(frame, glass);
      });
      wall.castShadow = true;
      group.add(wall);
      if (colliders) {
        colliders.push({ b, lxMin: b.w / 2 - 0.4, lxMax: b.w / 2 + 0.1, lzMin: -b.d / 2, lzMax: wallMaxZ, floors: "1" });
      }
      return group;
    }

    if (b.style === "mural3d") {
      // 東中庭南北向 3D 童趣彩繪遊戲地坪
      const muralTex = makeSignTexture(256, 512, (ctx, w, h) => {
        ctx.fillStyle = "#38bdf8"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#86efac"; ctx.fillRect(20, 20, w - 40, h - 40);
        ctx.fillStyle = "#facc15";
        for (let y = 50; y < h - 60; y += 64) {
          ctx.fillRect(w / 2 - 36, y, 72, 44);
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4; ctx.strokeRect(w / 2 - 36, y, 72, 44);
        }
        ctx.fillStyle = "#f472b6"; ctx.beginPath(); ctx.arc(w / 2, 70, 32, 0, Math.PI * 2); ctx.fill();
      });
      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(b.w, b.d),
        new THREE.MeshLambertMaterial({ map: muralTex })
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.08;
      pad.receiveShadow = true;
      group.add(pad);
      return group;
    }

    // 食農教室 (3D 亮檸檬黃外牆 + 實體白框雙開玻璃門 + 手繪感食農教室書法字樣與牆面彩繪) & 廚房
    if (b.id === "food_lab") {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, b.floorHeight, b.d),
        new THREE.MeshLambertMaterial({ color: 0xd9e845 })
      );
      body.position.y = b.floorHeight / 2;
      body.castShadow = true; body.receiveShadow = true;
      group.add(body);

      const muralTex = makeSignTexture(512, 256, (ctx, w, h) => {
        ctx.fillStyle = "#d9e845"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#14532d"; ctx.font = "bold 46px serif"; ctx.textAlign = "center";
        ctx.fillText("食農教室", w / 2, 62);
        ctx.font = "bold 18px sans-serif";
        ctx.fillText("從土地到餐桌   讓永續成日常", w / 2, 94);
        // 右側太陽與菜圃插畫
        ctx.fillStyle = "#f97316"; ctx.beginPath(); ctx.arc(430, 66, 24, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#92400e"; ctx.fillRect(365, 168, 110, 32);
        ctx.fillStyle = "#16a34a"; ctx.fillRect(370, 152, 100, 18);
        // 下方小花與綠葉
        ctx.fillStyle = "#f472b6"; ctx.beginPath(); ctx.arc(72, 195, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(118, 210, 14, 0, Math.PI * 2); ctx.fill();
      });
      const signFront = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.94, b.floorHeight * 0.94), new THREE.MeshLambertMaterial({ map: muralTex }));
      signFront.position.set(0, b.floorHeight / 2, b.d / 2 + 0.02);
      group.add(signFront);

      // 3D 立體白框雙開玻璃門
      const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.25, 0.14), new THREE.MeshLambertMaterial({ color: 0xf8fafc }));
      doorFrame.position.set(-0.3, 1.12, b.d / 2 + 0.05);
      const glassMat = new THREE.MeshPhongMaterial({ color: 0xf1f5f9, specular: 0xffffff, shininess: 75, transparent: true, opacity: 0.55 });
      [-0.55, 0.55].forEach(dx => {
        const pane = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.98, 0.16), glassMat);
        pane.position.set(-0.3 + dx, 1.12, b.d / 2 + 0.06);
        group.add(pane);
      });
      group.add(doorFrame);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.5, 0.35, b.d + 0.5), new THREE.MeshLambertMaterial({ color: hexColor(b.colors.roof) }));
      roof.position.y = b.floorHeight + 0.18;
      group.add(roof);
      return group;
    }

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.floorHeight, b.d),
      new THREE.MeshLambertMaterial({ color: hexColor(b.colors.wall) })
    );
    body.position.y = b.floorHeight / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 0.5, 0.35, b.d + 0.5),
      new THREE.MeshLambertMaterial({ color: hexColor(b.colors.roof) })
    );
    roof.position.y = b.floorHeight + 0.18;
    group.add(roof);
    return group;
  }

  // 主建構函式：建立完整溪洲國小 3D 場景物件
  window.buildShijouCampus = function (scene, data) {
    const clickableMeshes = [];
    const buildingGroups = {};
    const colliders = [];
    const walkZones = [];

    // 1. 校外大地 & 校界草地
    const worldGround = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshLambertMaterial({ color: 0xe6e4dd })
    );
    worldGround.rotation.x = -Math.PI / 2;
    worldGround.position.y = -0.05;
    worldGround.receiveShadow = true;
    scene.add(worldGround);

    const campusLawn = createFlatPolygonMesh(
      data.campusBoundary,
      0.0,
      new THREE.MeshLambertMaterial({ color: 0x90be6d })
    );
    scene.add(campusLawn);

    // 校界圍牆線
    const borderPts = data.campusBoundary.map(p => new THREE.Vector3(p[0], 0.35, p[1]));
    borderPts.push(borderPts[0].clone());
    const borderLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(borderPts),
      new THREE.LineBasicMaterial({ color: 0x3b6e35 })
    );
    scene.add(borderLine);

    // 2. 測繪對位圖層 (預設隱藏，可一鍵打開驗證位置與角度)
    const surveyGroup = new THREE.Group();
    surveyGroup.visible = false;
    if (window.SURVEY_REF_DATAURL && data.surveyOverlay) {
      const img = new Image();
      img.onload = function () {
        const tex = new THREE.Texture(img);
        tex.needsUpdate = true;
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(data.surveyOverlay.w, data.surveyOverlay.d),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.72 })
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(data.surveyOverlay.x, 0.15, data.surveyOverlay.z);
        surveyGroup.add(plane);
      };
      img.src = window.SURVEY_REF_DATAURL;
    }
    scene.add(surveyGroup);

    // 3. 周邊道路與校內廣場（萬年路主幹道高於校門引道，蓋住疊合處）
    (data.externalRoads || []).forEach(rd => {
      scene.add(buildRoadStrip(rd.points, rd.width, rd.isPrimary ? 0.025 : 0.01, rd.isPrimary ? "#64748b" : "#94a3b8"));
    });
    function makeInterlockBrickTexture(wMeters, dMeters) {
      const tex = makeSignTexture(512, 512, (ctx, w, h) => {
        ctx.fillStyle = "#b8c0cc";
        ctx.fillRect(0, 0, w, h);
        const grid = 8; // 8x8 正方形高壓磚，避免過密產生移動閃爍殘影
        const cell = w / grid;
        const shades = ["#e2e8f0", "#cbd5e1", "#94a3b8", "#4b5563", "#cbd5e1", "#e2e8f0", "#94a3b8", "#64748b"];
        for (let r = 0; r < grid; r++) {
          let c = 0;
          let runIdx = 0;
          while (c < grid) {
            const runLen = 1 + ((r * 3 + runIdx * 5) % 3);
            const col = shades[(r * 3 + runIdx * 2) % shades.length];
            for (let k = 0; k < runLen && c < grid; k++, c++) {
              ctx.fillStyle = col;
              ctx.fillRect(c * cell + 2, r * cell + 2, cell - 4, cell - 4);
            }
            runIdx++;
          }
        }
      });
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(Math.max(1, wMeters / 4), Math.max(1, dMeters / 4));
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 4;
      return tex;
    }

    (data.plazas || []).forEach(pz => {
      let mesh;
      if (pz.isRound) {
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(pz.w / 2, pz.w / 2, 0.09, 28),
          new THREE.MeshLambertMaterial({ color: hexColor(pz.color) })
        );
      } else if (pz.paving === "interlock") {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(pz.w, 0.07, pz.d),
          new THREE.MeshLambertMaterial({ map: makeInterlockBrickTexture(pz.w, pz.d) })
        );
        mesh.rotation.y = pz.rotY || 0;
      } else {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(pz.w, 0.07, pz.d),
          new THREE.MeshLambertMaterial({ color: hexColor(pz.color) })
        );
        mesh.rotation.y = pz.rotY || 0;
      }
      mesh.position.set(pz.x, pz.id === "front_plaza_a" ? 0.052 : 0.04, pz.z);
      mesh.receiveShadow = true;
      scene.add(mesh);
    });

    // 校門兩側擬真門柱 (萬年路入口兩側，比照 校門口兩側樓柱.JPG)
    const extraWorldColliders = [];
    const pillarTileTex = makeSignTexture(128, 256, (ctx, w, h) => {
      ctx.fillStyle = "#f1f5f9"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 2;
      for (let x = 0; x <= w; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y <= h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    });
    const pillarTileMat = new THREE.MeshLambertMaterial({ map: pillarTileTex });
    const capMat = new THREE.MeshLambertMaterial({ color: 0xb45345 });

    // 北側高門柱（白格磁磚＋深褐花崗岩直書校名牌＋頂端森巴鼓）
    {
      const gx = 63.5, gz = 36.5;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 3.5, 1.35), pillarTileMat);
      body.position.y = 1.75; body.castShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.24, 1.55), capMat);
      cap.position.y = 3.62;
      const plaqueTex = makeSignTexture(128, 384, (ctx, w, h) => {
        ctx.fillStyle = "#5c261d"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#eab308"; ctx.font = "bold 24px serif"; ctx.textAlign = "center";
        "斗六市溪洲國民小學".split("").forEach((ch, idx) => ctx.fillText(ch, w * 0.65, 42 + idx * 36));
        ctx.font = "bold 20px serif";
        "雲林縣".split("").forEach((ch, idx) => ctx.fillText(ch, w * 0.3, 46 + idx * 32));
      });
      const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.75, 0.08), new THREE.MeshLambertMaterial({ map: plaqueTex }));
      plaque.position.set(0, 1.65, 0.7);
      // 頂端大型森巴鼓
      const drumTop = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.68, 0.22, 20), new THREE.MeshLambertMaterial({ color: 0x1e3a8a }));
      drumTop.position.y = 4.22;
      const drumMid = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.52, 0.24, 20), new THREE.MeshLambertMaterial({ color: 0xdc2626 }));
      drumMid.position.y = 3.99;
      const drumBot = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.42, 0.18, 20), new THREE.MeshLambertMaterial({ color: 0xfacc15 }));
      drumBot.position.y = 3.80;
      g.add(body, cap, plaque, drumTop, drumMid, drumBot);
      g.position.set(gx, 0, gz);
      g.rotation.y = 1.05;
      scene.add(g);
      extraWorldColliders.push({ x: gx, z: gz, r: 0.95 });
    }

    // 南側警衛小門柱（白格磁磚＋紅磚檐帽＋小拱門）
    {
      const gx = 57.5, gz = 44.5;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.25, 1.45), pillarTileMat);
      body.position.y = 1.125; body.castShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 1.65), capMat);
      cap.position.y = 2.36;
      const archDoor = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.65, 0.12), new THREE.MeshLambertMaterial({ color: 0x334155 }));
      archDoor.position.set(0, 0.85, 0.72);
      g.add(body, cap, archDoor);
      g.position.set(gx, 0, gz);
      g.rotation.y = 1.05;
      scene.add(g);
      extraWorldColliders.push({ x: gx, z: gz, r: 1.05 });
    }

    // 4. 所有建築與場域
    data.buildings.forEach(b => {
      let grp;
      if (b.style && b.style.startsWith("wing_") || b.style === "corridor") {
        grp = buildTeachingWing(b, colliders, walkZones);
      } else if (b.style === "solar_court") {
        grp = buildSolarCourt(b, colliders);
      } else if (b.style === "track") {
        grp = buildTrackField(b);
      } else if (b.style === "stage") {
        grp = buildStage(b);
      } else if (b.style === "pond") {
        grp = buildEcoPond(b, colliders);
      } else if (b.style === "gate") {
        grp = buildGate(b, colliders);
      } else if (b.style === "toilet") {
        grp = buildToilet(b, colliders);
      } else if (b.style === "banana") {
        grp = buildBananaGarden(b);
      } else {
        grp = buildSimpleFacility(b, colliders);
      }

      grp.position.set(b.x, 0, b.z);
      grp.rotation.y = b.rotY || 0;
      grp.userData.buildingId = b.id;

      grp.traverse(obj => {
        if (obj.isMesh) {
          obj.userData.buildingId = b.id;
          clickableMeshes.push(obj);
        }
      });

      scene.add(grp);
      buildingGroups[b.id] = grp;
    });

    // 5. InstancedMesh 批次產生低多邊形樹木 (確定性分布)
    let seed = 1151212;
    function rand() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }
    const treePositions = [];
    (data.treeClusters || []).forEach(c => {
      if (c.type === "single") {
        treePositions.push({ x: c.x, z: c.z, s: c.scale || 1 });
      } else if (c.type === "band") {
        for (let i = 0; i < c.count; i++) {
          const t = rand();
          const jitterX = (rand() - 0.5) * 14;
          const jitterZ = (rand() - 0.5) * 14;
          const x = c.x0 + (c.x1 - c.x0) * t + jitterX;
          const z = c.z0 + (c.z1 - c.z0) * t + jitterZ;
          const s = c.minS + rand() * (c.maxS - c.minS);
          treePositions.push({ x, z, s });
        }
      }
    });

    if (treePositions.length > 0) {
      const count = treePositions.length;
      const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 6);
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7c5338 });
      const crownGeo = new THREE.DodecahedronGeometry(1.9, 0);
      const crownMat = new THREE.MeshLambertMaterial({ color: 0x4b8b3b });

      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
      const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
      trunks.castShadow = true;
      crowns.castShadow = true;

      const dummy = new THREE.Object3D();
      treePositions.forEach((tp, idx) => {
        dummy.position.set(tp.x, 1.1 * tp.s, tp.z);
        dummy.scale.set(tp.s, tp.s, tp.s);
        dummy.updateMatrix();
        trunks.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(tp.x, 3.1 * tp.s, tp.z);
        dummy.rotation.y = idx * 0.7;
        dummy.scale.set(tp.s, tp.s * 1.1, tp.s);
        dummy.updateMatrix();
        crowns.setMatrixAt(idx, dummy.matrix);
      });
      scene.add(trunks);
      scene.add(crowns);
    }

    const treeColliders = treePositions.map(tp => ({ x: tp.x, z: tp.z, r: 0.42 * tp.s + 0.25 }));

    return {
      clickableMeshes,
      buildingGroups,
      surveyGroup,
      colliders,
      walkZones,
      treeColliders,
      extraWorldColliders
    };
  };
})();
