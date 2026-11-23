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

    walkZones.push({
      b,
      lxMin: lx0, lxMax: lx1,
      lzMin: lz0, lzMax: lz1,
      y0: dir > 0 ? y0 : y1,
      y1: dir > 0 ? y1 : y0,
      rampAxis: axis,
      isStair: true
    });
  }

  // 輔助：在群組內建立雙折迴轉樓梯（支援各校舍獨立梯寬設定：A、B、D棟皆為 1.8m 寬，C棟 1F 到轉折平台為 3.0m 寬，平台至 2F 為 1.8m 寬）
  function addUTurnStaircase(group, b, walkZones, colliders, opts) {
    const { lx0, lx1, lz0, lz1, y0, y1, dir1 = "-z", turn = "right", f1Width = 1.8, f2Width = 1.8, noBackWall = false } = opts;
    const midY = (y0 + y1) / 2;
    const landDepth = 1.35;
    const platMat = new THREE.MeshLambertMaterial({ color: 0xd6d3d1 });
    const parapetMat = new THREE.MeshLambertMaterial({ color: hexColor(b && b.colors && b.colors.wall, "#F2EAE1") });
    const railMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const wallH = 0.88;

    // 建立斜坡女兒牆（四角垂直的多邊形實體牆面，緊貼樓梯兩側斜坡上升；可自定義底邊高度 baseYStart/baseYEnd，避免女兒牆貫穿至 1F 開放空間）
    function makeSlopedParapetMesh(axis, len, yStart, yEnd, wallHeight, thick, baseYStart, baseYEnd) {
      const shape = new THREE.Shape();
      const byS = baseYStart !== undefined ? baseYStart : Math.min(y0, yStart);
      const byE = baseYEnd !== undefined ? baseYEnd : Math.min(y0, yEnd);
      // Shape 局部 X 為水平推進方向 (-len/2 .. +len/2)，Y 為世界高度
      shape.moveTo(-len / 2, byS);
      shape.lineTo(len / 2, byE);
      shape.lineTo(len / 2, yEnd + wallHeight);
      shape.lineTo(-len / 2, yStart + wallHeight);
      shape.closePath();
      const extrudeGeo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
      extrudeGeo.translate(0, 0, -thick / 2);
      if (axis === "z") {
        // 讓 Shape 的 X 軸對應局部 Z 軸 (-len/2 .. +len/2)，extrude depth 對應局部 X 軸
        extrudeGeo.rotateY(-Math.PI / 2);
      }
      const mesh = new THREE.Mesh(extrudeGeo, parapetMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    if (dir1 === "-z" || dir1 === "+z") {
      const isNorth = dir1 === "-z";
      const platZ0 = isNorth ? lz0 : lz1 - landDepth;
      const platZ1 = isNorth ? lz0 + landDepth : lz1;
      const fZ0 = isNorth ? platZ1 : lz0;
      const fZ1 = isNorth ? lz1 : platZ0;
      const fLen = fZ1 - fZ0;
      const fRise = midY - y0;
      const slopeLen = Math.hypot(fLen, fRise);
      const angle = Math.atan2(fRise, fLen);

      const f1OnWest = isNorth ? (turn === "right") : (turn !== "right");
      let f1Lx0, f1Lx1, f2Lx0, f2Lx1, midX, endX;
      if (f1OnWest) {
        f1Lx0 = lx0 + 0.02;
        f1Lx1 = lx0 + f1Width;
        f2Lx0 = lx0 + f1Width;
        f2Lx1 = lx0 + f1Width + f2Width - 0.02;
        midX = lx0 + f1Width;
        endX = lx0 + f1Width + f2Width;
      } else {
        f2Lx0 = lx0 + 0.02;
        f2Lx1 = lx0 + f2Width;
        f1Lx0 = lx0 + f2Width;
        f1Lx1 = lx0 + f2Width + f1Width - 0.02;
        midX = lx0 + f2Width;
        endX = lx0 + f2Width + f1Width;
      }
      const platX = (lx0 + endX) / 2;
      const platW = endX - lx0;
      const f1Dir = isNorth ? -1 : 1;
      const f2Dir = -f1Dir;

      addStaircase(group, b, walkZones, { lx0: f1Lx0, lx1: f1Lx1, lz0: fZ0, lz1: fZ1, axis: "z", dir: f1Dir, y0, y1: midY });

      const plat = new THREE.Mesh(new THREE.BoxGeometry(platW, midY - y0 + 0.16, landDepth), platMat);
      plat.position.set(platX, (y0 + midY) / 2, (platZ0 + platZ1) / 2);
      plat.castShadow = true; plat.receiveShadow = true;
      group.add(plat);
      walkZones.push({ b, lxMin: lx0, lxMax: endX, lzMin: platZ0, lzMax: platZ1, y0: midY, y1: midY, rampAxis: null, isStair: true, isLanding: true });

      addStaircase(group, b, walkZones, { lx0: f2Lx0, lx1: f2Lx1, lz0: fZ0, lz1: fZ1, axis: "z", dir: f2Dir, y0: midY, y1 });

      // 兩側斜坡實體女兒牆 + 轉折平台女兒牆 + 頂部扶手壓條 + 中央分隔實體矮牆與雙面扶手（兩梯段兩側皆有扶手防護，小人絕不失足跌落）
      // 1. 外側防護：西側 (lx0) 與東側 (endX) 斜坡女兒牆與上方金屬扶手
      const westDir = f1OnWest ? f1Dir : f2Dir;
      const westYLow = f1OnWest ? y0 : midY;
      const westYHigh = f1OnWest ? midY : y1;
      const westYAtFZ0 = westDir > 0 ? westYLow : westYHigh;
      const westYAtFZ1 = westDir > 0 ? westYHigh : westYLow;
      const pWest = makeSlopedParapetMesh("z", fLen, westYAtFZ0, westYAtFZ1, wallH, 0.12);
      pWest.position.set(lx0 + 0.05, 0, (fZ0 + fZ1) / 2);

      const eastDir = f1OnWest ? f2Dir : f1Dir;
      const eastYLow = f1OnWest ? midY : y0;
      const eastYHigh = f1OnWest ? y1 : midY;
      const eastYAtFZ0 = eastDir > 0 ? eastYLow : eastYHigh;
      const eastYAtFZ1 = eastDir > 0 ? eastYHigh : eastYLow;
      const pEast = makeSlopedParapetMesh("z", fLen, eastYAtFZ0, eastYAtFZ1, wallH, 0.12);
      pEast.position.set(endX - 0.05, 0, (fZ0 + fZ1) / 2);

      const rWest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, slopeLen), railMat);
      rWest.position.set(lx0 + 0.05, (westYLow + westYHigh) / 2 + wallH + 0.03, (fZ0 + fZ1) / 2);
      rWest.rotation.x = westDir > 0 ? -angle : angle;

      const rEast = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, slopeLen), railMat);
      rEast.position.set(endX - 0.05, (eastYLow + eastYHigh) / 2 + wallH + 0.03, (fZ0 + fZ1) / 2);
      rEast.rotation.x = eastDir > 0 ? -angle : angle;

      // 2. 中央 midX 處：設置兩梯段間之內側實體分隔牆與雙面扶手（Flight 1 與 Flight 2 內側皆有扶手，兩側雙重防護）
      const f2YLow = midY, f2YHigh = y1;
      const f2YAtFZ0 = f2Dir > 0 ? f2YLow : f2YHigh;
      const f2YAtFZ1 = f2Dir > 0 ? f2YHigh : f2YLow;
      const f1YLow = y0, f1YHigh = midY;
      const f1YAtFZ0 = f1Dir > 0 ? f1YLow : f1YHigh;
      const f1YAtFZ1 = f1Dir > 0 ? f1YHigh : f1YLow;

      const pInner = makeSlopedParapetMesh("z", fLen, f2YAtFZ0, f2YAtFZ1, wallH, 0.12, Math.min(f1YAtFZ0, f1YAtFZ1), Math.min(f1YAtFZ0, f1YAtFZ1));
      pInner.position.set(midX, 0, (fZ0 + fZ1) / 2);

      // Flight 2 內側扶手
      const rInnerF2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, slopeLen), railMat);
      rInnerF2.position.set(midX + (f1OnWest ? 0.08 : -0.08), (midY + y1) / 2 + wallH + 0.03, (fZ0 + fZ1) / 2);
      rInnerF2.rotation.x = f2Dir > 0 ? -angle : angle;

      // Flight 1 內側扶手（隨 Flight 1 爬升至轉折平台，小人兩側皆有完整扶手，絕不失足掉落）
      const rInnerF1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, slopeLen), railMat);
      rInnerF1.position.set(midX + (f1OnWest ? -0.08 : 0.08), (y0 + midY) / 2 + wallH + 0.03, (fZ0 + fZ1) / 2);
      rInnerF1.rotation.x = f1Dir > 0 ? -angle : angle;

      // 3. 轉折平台四周實體女兒牆與頂部金屬扶手（西側、東側、後側皆有女兒牆與扶手全面封閉防護）
      const pPlatW = new THREE.Mesh(new THREE.BoxGeometry(0.12, wallH + 0.15, landDepth), parapetMat);
      pPlatW.position.set(lx0 + 0.05, midY + wallH / 2, (platZ0 + platZ1) / 2);
      const rPlatW = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, landDepth), railMat);
      rPlatW.position.set(lx0 + 0.05, midY + wallH + 0.05, (platZ0 + platZ1) / 2);

      const pPlatE = new THREE.Mesh(new THREE.BoxGeometry(0.12, wallH + 0.15, landDepth), parapetMat);
      pPlatE.position.set(endX - 0.05, midY + wallH / 2, (platZ0 + platZ1) / 2);
      const rPlatE = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, landDepth), railMat);
      rPlatE.position.set(endX - 0.05, midY + wallH + 0.05, (platZ0 + platZ1) / 2);

      const backZ = isNorth ? lz0 + 0.06 : lz1 - 0.06;
      const pBack = noBackWall ? null : new THREE.Mesh(new THREE.BoxGeometry(platW, wallH + 0.15, 0.12), parapetMat);
      if (pBack) pBack.position.set(platX, midY + wallH / 2, backZ);
      const rBack = noBackWall ? null : new THREE.Mesh(new THREE.BoxGeometry(platW, 0.06, 0.10), railMat);
      if (rBack) rBack.position.set(platX, midY + wallH + 0.05, backZ);

      // 4. 2F 樓梯口旁（第一段下樓梯井上方開口處）女兒牆防護
      const openEdgeZ = isNorth ? lz1 - 0.06 : lz0 + 0.06;
      const guardW = f1Width;
      const guardX = (f1Lx0 + f1Lx1) / 2;
      const topGuard = new THREE.Mesh(new THREE.BoxGeometry(guardW, 0.85, 0.14), parapetMat);
      topGuard.position.set(guardX, y1 + 0.42, openEdgeZ);
      const topGuardRail = new THREE.Mesh(new THREE.BoxGeometry(guardW, 0.06, 0.08), railMat);
      topGuardRail.position.set(guardX, y1 + 1.05, openEdgeZ);

      [pWest, pEast, pInner, pPlatW, pPlatE, pBack, topGuard].filter(Boolean).forEach(m => { m.userData.isParapet = true; });
      [rWest, rEast, rInnerF2, rInnerF1, rPlatW, rPlatE, rBack, topGuardRail].filter(Boolean).forEach(m => { m.userData.isRail = true; });
      plat.userData.isStair = true;

      group.add(pWest, pEast, pInner, pPlatW, pPlatE, rWest, rEast, rInnerF2, rInnerF1, rPlatW, rPlatE, topGuard, topGuardRail);
      if (pBack) group.add(pBack);
      if (rBack) group.add(rBack);

      if (colliders) {
        // 樓梯外側牆體與中央分隔牆碰撞盒（精準貼合實體牆厚，不向隔壁校舍外溢，且中央分隔牆不侵入轉折平台）
        colliders.push({ b, lxMin: lx0 - 0.18, lxMax: lx0 + 0.12, lzMin: lz0 - 0.15, lzMax: lz1 + 0.15, floors: "both" });
        colliders.push({ b, lxMin: endX - 0.12, lxMax: endX + 0.18, lzMin: lz0 - 0.15, lzMax: lz1 + 0.15, floors: "both" });
        colliders.push({ b, lxMin: midX - 0.12, lxMax: midX + 0.12, lzMin: fZ0 + 0.12, lzMax: fZ1 - 0.12, floors: "both" });
        if (!noBackWall) {
          if (isNorth) {
            colliders.push({ b, lxMin: lx0 - 0.15, lxMax: endX + 0.15, lzMin: backZ - 0.22, lzMax: backZ + 0.14, floors: "both" });
          } else {
            colliders.push({ b, lxMin: lx0 - 0.15, lxMax: endX + 0.15, lzMin: backZ - 0.14, lzMax: backZ + 0.22, floors: "both" });
          }
        }
        colliders.push({ b, lxMin: f1Lx0, lxMax: f1Lx1, lzMin: openEdgeZ - 0.18, lzMax: openEdgeZ + 0.18, floors: "2" });
      }
    } else {
      // 東西向迴轉樓梯 (dir1 === "-x" 或 "+x"，如 A 棟中間玄關左右雙折樓梯：走上去 2F 兩側皆有實體女兒牆保護)
      const midZ = (lz0 + lz1) / 2;
      const isWest = dir1 === "-x";
      const platX0 = isWest ? lx0 : lx1 - landDepth;
      const platX1 = isWest ? lx0 + landDepth : lx1;
      const fX0 = isWest ? platX1 : lx0;
      const fX1 = isWest ? lx1 : platX0;
      const fLen = fX1 - fX0;
      const fRise = midY - y0;
      const slopeLen = Math.hypot(fLen, fRise);
      const angle = Math.atan2(fRise, fLen);

      const f1OnSouth = isWest ? (turn === "right") : (turn === "left");
      let f1Lz0, f1Lz1, f2Lz0, f2Lz1, midSplitZ, endZ;
      if (f1OnSouth) {
        f2Lz0 = lz0 + 0.02;
        f2Lz1 = lz0 + f2Width;
        f1Lz0 = lz0 + f2Width;
        f1Lz1 = lz0 + f2Width + f1Width - 0.02;
        midSplitZ = lz0 + f2Width;
        endZ = lz0 + f2Width + f1Width;
      } else {
        f1Lz0 = lz0 + 0.02;
        f1Lz1 = lz0 + f1Width;
        f2Lz0 = lz0 + f1Width;
        f2Lz1 = lz0 + f1Width + f2Width - 0.02;
        midSplitZ = lz0 + f1Width;
        endZ = lz0 + f1Width + f2Width;
      }
      const platZ = (lz0 + endZ) / 2;
      const platDepthZ = endZ - lz0;
      const f1Dir = isWest ? -1 : 1;
      const f2Dir = -f1Dir;

      addStaircase(group, b, walkZones, { lx0: fX0, lx1: fX1, lz0: f1Lz0, lz1: f1Lz1, axis: "x", dir: f1Dir, y0, y1: midY });

      const plat = new THREE.Mesh(new THREE.BoxGeometry(landDepth, midY - y0 + 0.16, platDepthZ), platMat);
      plat.position.set((platX0 + platX1) / 2, (y0 + midY) / 2, platZ);
      plat.castShadow = true; plat.receiveShadow = true;
      group.add(plat);
      walkZones.push({ b, lxMin: platX0, lxMax: platX1, lzMin: lz0, lzMax: endZ, y0: midY, y1: midY, rampAxis: null, isStair: true, isLanding: true });

      addStaircase(group, b, walkZones, { lx0: fX0, lx1: fX1, lz0: f2Lz0, lz1: f2Lz1, axis: "x", dir: f2Dir, y0: midY, y1 });

      // 南北兩外側與走上 2F 樓梯道兩側皆設置實體斜坡女兒牆（比照 cshow_4.jpg 實景水泥女兒牆 + 木質/金屬扶手壓條）
      const southDir = f1OnSouth ? f1Dir : f2Dir;
      const southYLow = f1OnSouth ? y0 : midY;
      const southYHigh = f1OnSouth ? midY : y1;
      const southYAtFX0 = southDir > 0 ? southYLow : southYHigh;
      const southYAtFX1 = southDir > 0 ? southYHigh : southYLow;
      const pSouth = makeSlopedParapetMesh("x", fLen, southYAtFX0, southYAtFX1, wallH, 0.12);
      pSouth.position.set((fX0 + fX1) / 2, 0, endZ - 0.05);

      const northDir = f1OnSouth ? f2Dir : f1Dir;
      const northYLow = f1OnSouth ? midY : y0;
      const northYHigh = f1OnSouth ? y1 : midY;
      const northYAtFX0 = northDir > 0 ? northYLow : northYHigh;
      const northYAtFX1 = northDir > 0 ? northYHigh : northYLow;
      const pNorth = f1OnSouth
        ? makeSlopedParapetMesh("x", fLen, northYAtFX0, northYAtFX1, wallH, 0.12, northYAtFX0, northYAtFX1)
        : makeSlopedParapetMesh("x", fLen, northYAtFX0, northYAtFX1, wallH, 0.12);
      pNorth.position.set((fX0 + fX1) / 2, 0, lz0 + 0.05);

      const f2YAtFX0 = f2Dir > 0 ? midY : y1;
      const f2YAtFX1 = f2Dir > 0 ? y1 : midY;
      const pInnerF2 = makeSlopedParapetMesh("x", fLen, f2YAtFX0, f2YAtFX1, wallH, 0.12);
      pInnerF2.position.set((fX0 + fX1) / 2, 0, midSplitZ);
      const rInnerF2 = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.06, 0.08), railMat);
      rInnerF2.position.set((fX0 + fX1) / 2, (midY + y1) / 2 + wallH + 0.03, midSplitZ);
      rInnerF2.rotation.z = f2Dir > 0 ? angle : -angle;

      const rInnerF1 = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.06, 0.08), railMat);
      rInnerF1.position.set((fX0 + fX1) / 2, (y0 + midY) / 2 + wallH + 0.03, midSplitZ + (f1OnSouth ? 0.08 : -0.08));
      rInnerF1.rotation.z = f1Dir > 0 ? angle : -angle;

      let soffit = null;
      if (f1OnSouth) {
        const soffitDepth = Math.abs(midSplitZ - lz0);
        soffit = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.08, soffitDepth), parapetMat);
        soffit.position.set((fX0 + fX1) / 2, (midY + y1) / 2 - 0.06, (lz0 + midSplitZ) / 2);
        soffit.rotation.z = f2Dir > 0 ? angle : -angle;
      }

      const pPlatS = new THREE.Mesh(new THREE.BoxGeometry(landDepth, wallH + 0.15, 0.12), parapetMat);
      pPlatS.position.set((platX0 + platX1) / 2, midY + wallH / 2, endZ - 0.05);
      const rPlatS = new THREE.Mesh(new THREE.BoxGeometry(landDepth, 0.06, 0.08), railMat);
      rPlatS.position.set((platX0 + platX1) / 2, midY + wallH + 0.05, endZ - 0.05);

      const pPlatN = new THREE.Mesh(new THREE.BoxGeometry(landDepth, wallH + 0.15, 0.12), parapetMat);
      pPlatN.position.set((platX0 + platX1) / 2, midY + wallH / 2, lz0 + 0.05);
      const rPlatN = new THREE.Mesh(new THREE.BoxGeometry(landDepth, 0.06, 0.08), railMat);
      rPlatN.position.set((platX0 + platX1) / 2, midY + wallH + 0.05, lz0 + 0.05);

      const backX = isWest ? lx0 + 0.06 : lx1 - 0.06;
      const pBack = new THREE.Mesh(new THREE.BoxGeometry(0.12, wallH + 0.15, platDepthZ), parapetMat);
      pBack.position.set(backX, midY + wallH / 2, platZ);

      const rSouth = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.06, 0.08), railMat);
      rSouth.position.set((fX0 + fX1) / 2, (southYLow + southYHigh) / 2 + wallH + 0.03, endZ - 0.05);
      rSouth.rotation.z = southDir > 0 ? angle : -angle;

      const rNorth = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.06, 0.08), railMat);
      rNorth.position.set((fX0 + fX1) / 2, (northYLow + northYHigh) / 2 + wallH + 0.03, lz0 + 0.05);
      rNorth.rotation.z = northDir > 0 ? angle : -angle;

      const rBack = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, platDepthZ), railMat);
      rBack.position.set(backX, midY + wallH + 0.05, platZ);

      [pSouth, pNorth, pInnerF2, pPlatS, pPlatN, pBack].forEach(m => { m.userData.isParapet = true; });
      [rInnerF2, rInnerF1, rSouth, rNorth, rPlatS, rPlatN, rBack].forEach(m => { m.userData.isRail = true; });
      plat.userData.isStair = true;
      if (soffit) soffit.userData.isParapet = true;

      group.add(pSouth, pNorth, pInnerF2, rInnerF2, rInnerF1, pPlatS, pPlatN, pBack, rSouth, rNorth, rPlatS, rPlatN, rBack);
      if (soffit) group.add(soffit);

      if (colliders) {
        if (f1OnSouth) {
          colliders.push({ b, lxMin: fX0 - 0.15, lxMax: fX1 + 0.15, lzMin: lz0 - 0.16, lzMax: lz0 + 0.08, floors: "both" });
          colliders.push({ b, lxMin: platX0 - 0.15, lxMax: platX1 + 0.15, lzMin: lz0 - 0.16, lzMax: lz0 + 0.08, floors: "both" });
          colliders.push({ b, lxMin: fX0 + 0.12, lxMax: fX1 - 0.12, lzMin: midSplitZ - 0.12, lzMax: midSplitZ + 0.12, floors: "both" });
        } else {
          colliders.push({ b, lxMin: lx0 - 0.15, lxMax: lx1 + 0.15, lzMin: lz0 - 0.16, lzMax: lz0 + 0.08, floors: "both" });
        }
        colliders.push({ b, lxMin: lx0 - 0.15, lxMax: lx1 + 0.15, lzMin: endZ - 0.08, lzMax: endZ + 0.22, floors: "both" });
        if (isWest) {
          colliders.push({ b, lxMin: backX - 0.22, lxMax: backX + 0.14, lzMin: lz0 - 0.15, lzMax: endZ + 0.15, floors: "both" });
        } else {
          colliders.push({ b, lxMin: backX - 0.14, lxMax: backX + 0.22, lzMin: lz0 - 0.15, lzMax: endZ + 0.15, floors: "both" });
        }
      }
    }
  }

  const doorPlaqueMatCache = {};
  function createDoorPlaqueMaterial(code, name) {
    const label = `${code ? code + " " : ""}${name || ""}`.trim();
    if (doorPlaqueMatCache[label]) return doorPlaqueMatCache[label];
    const cw = 320, ch = 80;
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");

    // 深青藍底色 + 暖金邊框
    ctx.fillStyle = "#0f3d3e";
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, cw - 8, ch - 8);

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let fontSize = 26;
    ctx.font = `bold ${fontSize}px "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
    while (ctx.measureText(label).width > cw - 24 && fontSize > 15) {
      fontSize -= 2;
      ctx.font = `bold ${fontSize}px "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
    }
    ctx.fillText(label, cw / 2, ch / 2 + 1);

    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    doorPlaqueMatCache[label] = mat;
    return mat;
  }

  // 建立半透明玻璃窗組件（含窗框、中梃與清透玻璃材質，呈現真實半透明玻璃質感）
  const sharedGlassMat = typeof THREE !== "undefined"
    ? new THREE.MeshPhongMaterial({
        color: 0x7dd3fc,
        emissive: 0x0369a1,
        emissiveIntensity: 0.18,
        specular: 0xffffff,
        shininess: 120,
        transparent: true,
        opacity: 0.42,
        depthWrite: false
      })
    : null;
  const sharedWinFrameMat = typeof THREE !== "undefined"
    ? new THREE.MeshLambertMaterial({ color: 0xe2e8f0 })
    : null;
  const sharedWinVoidMat = typeof THREE !== "undefined"
    ? new THREE.MeshLambertMaterial({ color: 0x1e293b, transparent: true, opacity: 0.32, depthWrite: false })
    : null;

  function createGlassWindowGroup(axis, winW, winH, facingSign) {
    const g = new THREE.Group();
    const isX = axis === "x";
    // 內層深色窗洞襯底 + 外層半透明清透玻璃 + 鋁白窗框與中梃
    const voidPane = new THREE.Mesh(
      new THREE.BoxGeometry(isX ? winW - 0.08 : 0.03, winH - 0.08, isX ? 0.03 : winW - 0.08),
      sharedWinVoidMat
    );
    if (isX) voidPane.position.z = facingSign * 0.025;
    else voidPane.position.x = facingSign * 0.025;

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(isX ? winW - 0.06 : 0.04, winH - 0.06, isX ? 0.04 : winW - 0.06),
      sharedGlassMat
    );
    if (isX) glass.position.z = facingSign * 0.055;
    else glass.position.x = facingSign * 0.055;

    // 上下窗框與中央直梃
    const topBar = new THREE.Mesh(
      new THREE.BoxGeometry(isX ? winW : 0.09, 0.06, isX ? 0.09 : winW),
      sharedWinFrameMat
    );
    topBar.position.y = winH / 2 - 0.03;
    if (isX) topBar.position.z = facingSign * 0.05;
    else topBar.position.x = facingSign * 0.05;

    const botBar = topBar.clone();
    botBar.position.y = -winH / 2 + 0.03;

    const midBar = new THREE.Mesh(
      new THREE.BoxGeometry(isX ? 0.06 : 0.09, winH, isX ? 0.09 : 0.06),
      sharedWinFrameMat
    );
    if (isX) midBar.position.z = facingSign * 0.055;
    else midBar.position.x = facingSign * 0.055;

    g.add(voidPane, glass, topBar, botBar, midBar);
    return g;
  }

  // 輔助：依 115 學年度校舍平面圖（班級分佈圖）精準建立各棟各層教室門、窗、公佈欄與 3D 門牌
  function addRoomBayElement(group, axis, wallCoord, facingSign, fy, item) {
    const doorMat = new THREE.MeshLambertMaterial({ color: item.isWC ? 0x0284c7 : 0x0f766e });
    const boardMat = new THREE.MeshLambertMaterial({ color: 0x38bdf8 });
    const pMat = (item.code || item.name) ? createDoorPlaqueMaterial(item.code, item.name) : null;

    const doorPos = item.doorPos;
    const plaquePos = item.plaquePos !== undefined ? item.plaquePos : doorPos;
    const winPos = item.winPos;
    const boardPos = item.boardPos;

    if (doorPos !== undefined && doorPos !== null) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(axis === "x" ? 0.95 : 0.12, 2.12, axis === "z" ? 0.95 : 0.12),
        doorMat
      );
      if (axis === "x") door.position.set(doorPos, fy + 1.08, wallCoord + facingSign * 0.05);
      else door.position.set(wallCoord + facingSign * 0.05, fy + 1.08, doorPos);
      group.add(door);
    }

    if (pMat && plaquePos !== undefined && plaquePos !== null) {
      const plaque = new THREE.Mesh(
        new THREE.BoxGeometry(axis === "x" ? 1.52 : 0.08, 0.38, axis === "z" ? 1.52 : 0.08),
        pMat
      );
      if (axis === "x") plaque.position.set(plaquePos, fy + 2.34, wallCoord + facingSign * 0.14);
      else plaque.position.set(wallCoord + facingSign * 0.14, fy + 2.34, plaquePos);
      // 供搜尋功能精準定位班級牌：門窗構圖中心（門與窗中點）及牆面朝外法線（群組區域座標）
      const doorRef = (doorPos !== undefined && doorPos !== null) ? doorPos : plaquePos;
      const frameMid = (winPos !== undefined && winPos !== null) ? (doorRef + winPos) / 2 : plaquePos;
      plaque.userData.roomPlaque = {
        code: item.code || "",
        name: item.name || "",
        floorY: fy,
        frameLocal: axis === "x" ? [frameMid, wallCoord + facingSign * 0.14] : [wallCoord + facingSign * 0.14, frameMid],
        normal: axis === "x" ? [0, facingSign] : [facingSign, 0]
      };
      group.add(plaque);
    }

    if (winPos !== undefined && winPos !== null) {
      const winW = item.winW || 2.5;
      const win = createGlassWindowGroup(axis, winW, 1.18, facingSign);
      if (axis === "x") win.position.set(winPos, fy + 1.62, wallCoord);
      else win.position.set(wallCoord, fy + 1.62, winPos);
      group.add(win);
    }

    if (boardPos !== undefined && boardPos !== null) {
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(axis === "x" ? 1.35 : 0.08, 0.88, axis === "z" ? 1.35 : 0.08),
        boardMat
      );
      if (axis === "x") board.position.set(boardPos, fy + 1.55, wallCoord + facingSign * 0.05);
      else board.position.set(wallCoord + facingSign * 0.05, fy + 1.55, boardPos);
      group.add(board);
    }
  }

  // 輔助：在背側牆面（A棟北側、B棟北側、C棟東側、D棟西側）建立與走廊側對齊之半透明玻璃窗（無門）
  function addBackWallWindows(group, axis, wallCoord, facingSign, floors, fh, winPositions, winW) {
    for (let f = 0; f < floors; f++) {
      const fy = f * fh;
      winPositions.forEach(pos => {
        const win = createGlassWindowGroup(axis, winW, 1.22, facingSign);
        if (axis === "x") win.position.set(pos, fy + 1.62, wallCoord);
        else win.position.set(wallCoord, fy + 1.62, pos);
        group.add(win);
      });
    }
  }

  function addCorridorWallDetails(group, len, wallCoord, axis, facingSign, floors, fh, accentMat, passages, bData) {
    const bid = bData ? bData.id : "";
    if (bid === "bldg_a") {
      // 依「A棟平面圖示意圖.pdf」排列：
      // 西端網球主題廁所/2F性別友善廁所 | 西側樓梯 (-30.85..-27.89) | A101..A104 / A201..A204 (-27.80..-2.13) | 中央穿堂 (-2.13..2.87，南側外突磚樓玄關含左右樓梯與圖書角/永續角) | A105..A107 + 東側廁所 (2.87..29.30)
      const f1Items = [
        { code: "101", name: "六甲教室", doorPos: -23.15, winPos: -25.80, winW: 2.5 },
        { code: "102", name: "六乙教室", doorPos: -19.80, winPos: -17.10, winW: 2.5 },
        { code: "103", name: "自然教室", doorPos: -12.00, winPos: -9.80, winW: 2.4 },
        { code: "104", name: "傳達室", doorPos: -5.65, winPos: -3.70, winW: 2.0 },
        { code: "105", name: "健康中心（保健室）", doorPos: 8.20, winPos: 10.40, winW: 2.4 },
        { code: "106", name: "校長室", doorPos: 15.00, winPos: 17.20, winW: 2.4 },
        { code: "107", name: "夜光天使/綜(二)", doorPos: 21.80, winPos: 24.00, winW: 2.4 },
        { code: "", name: "廁所", doorPos: 27.20, isWC: true }
      ];
      const f2Items = [
        { code: "201", name: "教具室", doorPos: -28.60, winPos: -24.60, winW: 2.8 },
        { code: "202-204", name: "辦公室", doorPos: -18.50, winPos: -14.80, winW: 3.6 },
        { code: "202-204", name: "辦公室", doorPos: -5.65, plaquePos: -11.20, winPos: -8.20, winW: 3.4 },
        { code: "205", name: "資訊教室(二)", doorPos: 8.20, winPos: 10.40, winW: 2.4 },
        { code: "206", name: "音樂教室", doorPos: 15.00, winPos: 17.20, winW: 2.4 },
        { code: "207", name: "資訊教室(一)", doorPos: 21.80, winPos: 24.00, winW: 2.4 },
        { code: "", name: "廁所", doorPos: 27.45, isWC: true }
      ];
      f1Items.forEach(it => addRoomBayElement(group, axis, wallCoord, facingSign, 0, it));
      if (floors > 1) f2Items.forEach(it => addRoomBayElement(group, axis, wallCoord, facingSign, fh, it));
      return;
    }

    if (bid === "bldg_b") {
      // B 棟（西 -> 東）：Wc 3/4 (-38.95..-35.15) | 西側樓梯 (-35.06..-32.10) | 101..104 / 201..204 (-32.00..-2.55) | 中央樓梯 (-2.48..0.48) & 中廊通道 (0.90..5.90) | 105..108 / 205..208 (5.90..34.10) | 資源回收室 (34.10..38.95)
      const f1Items = [
        { code: "Wc 3", name: "廁所", doorPos: -37.05, isWC: true },
        { code: "101", name: "五乙教室", doorPos: -26.35, winPos: -29.30, winW: 2.8, boardPos: -31.20 },
        { code: "102", name: "五甲教室", doorPos: -22.95, winPos: -20.00, winW: 2.8, boardPos: -18.10 },
        { code: "103", name: "四乙教室", doorPos: -11.60, winPos: -14.55, winW: 2.8, boardPos: -16.45 },
        { code: "104", name: "四甲教室", doorPos: -8.20, winPos: -5.25, winW: 2.8, boardPos: -3.35 },
        { code: "105", name: "三乙教室", doorPos: 11.25, winPos: 8.35, winW: 2.7, boardPos: 6.60 },
        { code: "106", name: "三甲教室", doorPos: 14.65, winPos: 17.55, winW: 2.7, boardPos: 19.30 },
        { code: "107", name: "二乙教室", doorPos: 23.50, winPos: 21.10, winW: 2.4, boardPos: 25.80 },
        { code: "108", name: "諮商室／校史室", doorPos: 30.55, winPos: 28.20, winW: 2.4, boardPos: 32.80 },
        { code: "", name: "資源回收室", doorPos: 36.50, isWC: true }
      ];
      const f2Items = [
        { code: "Wc 4", name: "廁所", doorPos: -37.05, isWC: true },
        { code: "201", name: "美勞教室", doorPos: -26.35, winPos: -29.30, winW: 2.8, boardPos: -31.20 },
        { code: "202", name: "社會教室", doorPos: -22.95, winPos: -20.00, winW: 2.8, boardPos: -18.10 },
        { code: "203", name: "英語教室", doorPos: -11.60, winPos: -14.55, winW: 2.8, boardPos: -16.45 },
        { code: "204", name: "綜合教室(一)", doorPos: -8.20, winPos: -5.25, winW: 2.8, boardPos: -3.35 },
        { code: "205", name: "E化教室", doorPos: 9.40, winPos: 11.60, winW: 2.5 }
      ];
      f1Items.forEach(it => addRoomBayElement(group, axis, wallCoord, facingSign, 0, it));
      if (floors > 1) {
        f2Items.forEach(it => addRoomBayElement(group, axis, wallCoord, facingSign, fh, it));
        // B棟 2F 206-208 圖書室範圍涵蓋走廊空間 (lx: 14.80..38.95, lz: -b.d/2..+b.d/2)，於走廊終點西側端牆 (lx = 14.80) 設置圖書室大門、側窗與門牌（參照 B棟校舍2F走廊由西向東移動之動態畫面.mov 後段影格）
        addRoomBayElement(group, "z", 14.80, -1, fh, {
          code: "206-208",
          name: "圖書室",
          doorPos: 3.15,
          plaquePos: 3.15,
          winPos: 4.18,
          winW: 1.05
        });
      }
      return;
    }

    if (bid === "bldg_c") {
      // 依「C棟平面圖示意圖.pdf」排列（北 -> 南）：
      // 1F 北至南 3 間教室 C103 二甲 (-14.12..-6.88) | C102 一乙 (-6.88..0.36) | C101 一甲 (0.36..12.42 外推切齊 A 棟走廊右側)
      const f1Items = [
        { code: "103", name: "二甲教室", doorPos: -10.50, winPos: -12.50, winW: 2.4, boardPos: -8.30 },
        { code: "102", name: "一乙教室", doorPos: -1.35, winPos: -4.10, winW: 2.4, boardPos: -5.90 },
        { code: "101", name: "一甲教室", doorPos: 2.05, winPos: 4.80, winW: 2.4, boardPos: 6.50 },
        { code: "", name: "", winPos: 9.50, winW: 2.4 }
      ];
      f1Items.forEach(it => addRoomBayElement(group, axis, wallCoord, facingSign, 0, it));
      return;
    }

    if (bid === "bldg_d") {
      // D 棟（北 -> 南）：北側 102 藝文教室 / 202 桌球室(二) (lz = -4.60) | 南側 101 體育室 / 201 桌球室(一) (lz = +4.60)
      const f1Items = [
        { code: "102", name: "藝文教室", doorPos: -4.60, winPos: -1.80, winW: 2.4 },
        { code: "101", name: "體育室", doorPos: 4.60, winPos: 1.80, winW: 2.4 }
      ];
      f1Items.forEach(it => addRoomBayElement(group, axis, wallCoord, facingSign, 0, it));
      if (floors > 1) {
        const f2Items = [
          { code: "202", name: "桌球室(二)", doorPos: -4.60, winPos: -1.80, winW: 2.4 },
          { code: "201", name: "桌球室(一)", doorPos: 4.60, winPos: 1.80, winW: 2.4 }
        ];
        f2Items.forEach(it => addRoomBayElement(group, axis, wallCoord, facingSign, fh, it));
      }
      return;
    }
  }

  // 建立「中庭中央連廊」(1F 風雨中廊 + 2F C-Show創客走廊)
  function buildCorridorMid(b, colliders, walkZones) {
    const group = new THREE.Group();
    const fh = b.floorHeight; // 3.6m
    const totalH = b.floors * fh;
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xe7e0d6 });
    const galleryFloorMat = new THREE.MeshLambertMaterial({ color: 0xd6cfc2 });
    const pillarMat = new THREE.MeshLambertMaterial({ color: hexColor(b.colors.wall, "#F4F2ED") });
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xe2e8f0 });
    const shadeMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const woodDeskMat = new THREE.MeshLambertMaterial({ color: 0xd97706 });
    const roofMat = new THREE.MeshLambertMaterial({ color: hexColor(b.colors.roof, "#78A07C") });

    // 1F 地板 & 2F C-Show創客走廊磨石子地板 & 屋頂
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

    // 1F~2F 結構柱列 (東西兩側各 6 根，劃分 5 個大窗格區間)
    const bayCount = 5;
    const zStart = -b.d / 2 + 0.45;
    const zEnd = b.d / 2 - 0.45;
    const baySpan = (zEnd - zStart) / bayCount;
    for (let i = 0; i <= bayCount; i++) {
      const cz = zStart + i * baySpan;
      [-b.w / 2 + 0.18, b.w / 2 - 0.18].forEach(cx => {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.30, totalH, 0.30), pillarMat);
        p.position.set(cx, totalH / 2, cz);
        p.castShadow = true;
        group.add(p);
        colliders.push({ b, lxMin: cx - 0.12, lxMax: cx + 0.12, lzMin: cz - 0.12, lzMax: cz + 0.12, floors: "both", isPillar: true });
      });
    }

    // 產生窗戶上各式學生創作貼圖（書法春聯、剪紙窗花、水彩畫、英語繪本小書、STEAM 創客海報）
    function createWindowCreationTexture(themeIdx) {
      return makeSignTexture(512, 320, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        // 半透明清透玻璃底色與鋁窗格線
        ctx.fillStyle = "rgba(186, 230, 253, 0.32)";
        ctx.fillRect(0, 0, w, h);
        // 上方灰色遮陽捲簾（還原 cshow_2.jpg 窗戶上半部捲簾）
        ctx.fillStyle = "rgba(148, 163, 184, 0.85)";
        ctx.fillRect(0, 0, w, 78);
        ctx.fillStyle = "#64748b";
        ctx.fillRect(0, 76, w, 4);
        // 鋁窗三分割直梃外框
        ctx.strokeStyle = "#f1f5f9";
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        for (let c = 1; c < 3; c++) {
          ctx.beginPath(); ctx.moveTo((w / 3) * c, 0); ctx.lineTo((w / 3) * c, h); ctx.stroke();
        }

        // 各扇窗玻璃上的多元學生創作
        for (let pane = 0; pane < 3; pane++) {
          const px = pane * (w / 3) + 22;
          const pw = w / 3 - 44;
          const kind = (themeIdx + pane) % 5;

          if (kind === 0) {
            // 1. 書法與招財進寶生肖春聯創作（還原 cshow_2.jpg / cshow_4.jpg 窗上宣紙作品）
            ctx.fillStyle = "#fffbeb";
            ctx.fillRect(px + 8, 94, pw - 16, 188);
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 4;
            ctx.strokeRect(px + 12, 98, pw - 24, 180);
            ctx.fillStyle = "#1e293b";
            ctx.font = "bold 28px serif";
            ctx.textAlign = "center";
            ctx.fillText("招財", px + pw / 2, 134);
            ctx.fillText("進寶", px + pw / 2, 168);
            // 可愛生肖紅橘插畫
            ctx.fillStyle = "#f97316";
            ctx.beginPath(); ctx.arc(px + pw / 2, 224, 24, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#fde047";
            ctx.beginPath(); ctx.arc(px + pw / 2, 228, 12, 0, Math.PI * 2); ctx.fill();
          } else if (kind === 1) {
            // 2. 傳統剪紙與繽紛窗花創作（還原 cshow_2.jpg 窗玻璃剪紙貼飾）
            ctx.fillStyle = "#fef2f2";
            ctx.fillRect(px + 10, 98, pw - 20, 176);
            const cutCol = ["#e11d48", "#d97706", "#2563eb"][pane % 3];
            ctx.fillStyle = cutCol;
            ctx.beginPath(); ctx.arc(px + pw / 2, 162, 34, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(px + pw / 2, 162, 12, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#0f172a";
            ctx.font = "bold 18px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("創意剪紙窗花", px + pw / 2, 235);
          } else if (kind === 2) {
            // 3. 學生校園水彩寫生與彩虹畫作
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(px + 4, 102, pw - 8, 170);
            ctx.fillStyle = "#38bdf8";
            ctx.fillRect(px + 10, 110, pw - 20, 75);
            ctx.fillStyle = "#4ade80";
            ctx.fillRect(px + 10, 185, pw - 20, 52);
            ctx.fillStyle = "#facc15";
            ctx.beginPath(); ctx.arc(px + 34, 136, 16, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#ef4444";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("溪洲之美寫生", px + pw / 2, 258);
          } else if (kind === 3) {
            // 4. 英語閱讀素養繪本小書 Kung Fu Abu（還原 cshow_3.jpg）
            ctx.fillStyle = "#f8fafc";
            ctx.fillRect(px + 6, 96, pw - 12, 182);
            ctx.strokeStyle = "#0284c7";
            ctx.lineWidth = 3;
            ctx.strokeRect(px + 10, 100, pw - 20, 174);
            ctx.fillStyle = "#0369a1";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Reading", px + pw / 2, 124);
            ctx.fillText("Literacy", px + pw / 2, 144);
            ctx.fillStyle = "#fb923c";
            ctx.fillRect(px + 20, 156, pw - 40, 48);
            ctx.fillStyle = "#334155";
            ctx.font = "bold 15px sans-serif";
            ctx.fillText("繪本小書創作", px + pw / 2, 232);
          } else {
            // 5. STEAM 創客與書法「大放異彩」聯展（還原 cshow_4.jpg）
            ctx.fillStyle = "#ecfdf5";
            ctx.fillRect(px + 6, 96, pw - 12, 182);
            ctx.fillStyle = "#059669";
            ctx.fillRect(px + 6, 96, pw - 12, 34);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("STEAM 創客", px + pw / 2, 119);
            ctx.fillStyle = "#1e293b";
            ctx.font = "bold 20px serif";
            ctx.fillText("大放異彩", px + pw / 2, 165);
            ctx.fillText("書法藝術", px + pw / 2, 198);
            ctx.fillStyle = "#8b5cf6";
            ctx.beginPath(); ctx.arc(px + pw / 2, 238, 18, 0, Math.PI * 2); ctx.fill();
          }
        }
      });
    }

    // 2F 東西兩側完整牆體（下段腰牆女兒牆 + 上段橫樑牆）與牆體上的半透明玻璃窗 + 學生創作展示
    [-1, 1].forEach(side => {
      const rx = side * (b.w / 2 - 0.14);
      // 1. 下段實體牆體（腰牆/女兒牆：fh .. fh + 1.08m）
      const lowerWall = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.08, b.d - 0.3), pillarMat);
      lowerWall.position.set(rx, fh + 0.54, 0);
      lowerWall.castShadow = true;
      lowerWall.receiveShadow = true;
      // 2. 上段實體門楣牆體（totalH - 0.42m .. totalH）
      const upperWall = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, b.d - 0.3), pillarMat);
      upperWall.position.set(rx, totalH - 0.21, 0);
      upperWall.castShadow = true;
      // 3. 窗台壓條
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, b.d - 0.25), frameMat);
      sill.position.set(rx, fh + 1.09, 0);
      group.add(lowerWall, upperWall, sill);

      // 4. 各窗格區間：半透明玻璃窗 + 窗面雙面學生多元創作展示 + 窗下斜坡展示桌/展板
      const winH = totalH - fh - 1.50; // 約 2.10m 高的大面積窗戶
      const winY = fh + 1.08 + winH / 2;
      for (let i = 0; i < bayCount; i++) {
        const az = zStart + (i + 0.5) * baySpan;
        const winW = baySpan - 0.32;

        // 半透明清透玻璃窗本體与鋁框
        const glassPane = new THREE.Mesh(new THREE.BoxGeometry(0.05, winH, winW), sharedGlassMat);
        glassPane.position.set(rx, winY, az);
        const topFrame = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.06, winW), frameMat);
        topFrame.position.set(rx, winY + winH / 2 - 0.03, az);
        const midMullion1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, winH, 0.06), frameMat);
        midMullion1.position.set(rx, winY, az - winW / 6);
        const midMullion2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, winH, 0.06), frameMat);
        midMullion2.position.set(rx, winY, az + winW / 6);
        group.add(glassPane, topFrame, midMullion1, midMullion2);

        // 窗戶上的學生多元創作（雙面顯示：走廊內外皆可清晰看見窗上的書法、剪紙、繪畫與繪本作品）
        const artTex = createWindowCreationTexture(i + (side > 0 ? 2 : 0));
        const artMat = new THREE.MeshLambertMaterial({ map: artTex, transparent: true, side: THREE.DoubleSide });
        const artPlaneIn = new THREE.Mesh(new THREE.PlaneGeometry(winW - 0.08, winH - 0.08), artMat);
        artPlaneIn.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        artPlaneIn.position.set(rx - side * 0.04, winY, az);
        const artPlaneOut = new THREE.Mesh(new THREE.PlaneGeometry(winW - 0.08, winH - 0.08), artMat);
        artPlaneOut.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        artPlaneOut.position.set(rx + side * 0.04, winY, az);
        group.add(artPlaneIn, artPlaneOut);

        // 走廊內側窗下：斜坡作品閱讀展示檯與綠底學生作品公佈欄（比照 cshow_2.jpg 與 cshow_3.jpg）
        const deskTop = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, winW * 0.72), woodDeskMat);
        deskTop.position.set(rx - side * 0.30, fh + 0.88, az);
        deskTop.rotation.z = side * 0.22;
        group.add(deskTop);
      }
    });

    // 在創客走廊南北兩側出入口（A棟2F端與B棟2F端）明顯標示「C-Show創客走廊」橫匾招牌與門柱牌（比照 cshow_1.jpg & cshow_3.jpg）
    const signTex = makeSignTexture(1024, 224, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#fef9c3");
      grad.addColorStop(0.5, "#e0f2fe");
      grad.addColorStop(1, "#dcfce7");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, w - 10, h - 10);

      // 下方草地綠帶與彩虹裝飾
      ctx.fillStyle = "#86efac";
      ctx.fillRect(10, h - 46, w - 20, 36);
      // 左側書本與放大鏡學生創客插畫
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(36, 128, 86, 22);
      ctx.fillStyle = "#2563eb";
      ctx.fillRect(42, 106, 82, 22);
      ctx.fillStyle = "#f97316";
      ctx.beginPath(); ctx.arc(155, 105, 24, 0, Math.PI * 2); ctx.fill();

      // 主標題：「C-Show創客走廊」與「C-SHOW GALLERY 創客藝廊」
      ctx.textAlign = "center";
      ctx.fillStyle = "#1e3a8a";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 6;
      ctx.font = "bold 64px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
      ctx.strokeText("C-Show創客走廊", w * 0.54, 78);
      ctx.fillText("C-Show創客走廊", w * 0.54, 78);

      ctx.fillStyle = "#b45309";
      ctx.font = "bold 30px sans-serif";
      ctx.fillText("C-SHOW GALLERY 創客藝廊 ・ 一個展示學生多元創作成果的人文藝術實驗場", w * 0.54, 134);

      ctx.fillStyle = "#be123c";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("Artistic Works  •  Reading Literacy  •  STEAM Education", w * 0.54, 188);
    });
    const signFaceMat = new THREE.MeshLambertMaterial({ map: signTex });
    const signEdgeMat = new THREE.MeshLambertMaterial({ color: 0xcbd5e1 });
    // BoxGeometry 6 面材質：[+X, -X, +Y, -Y, +Z(正面朝南), -Z(背面朝北)]，兩面皆顯示「C-Show創客走廊」
    const signMaterials = [signEdgeMat, signEdgeMat, signEdgeMat, signEdgeMat, signFaceMat, signFaceMat];

    // 南側出入口（銜接 A 棟 2F 走廊處）與北側出入口（銜接 B 棟 2F 走廊處）各設置雙面橫匾招牌與門側標示牌
    [
      { z: b.d / 2 - 1.55, sideZ: b.d / 2 - 0.15 },
      { z: -b.d / 2 + 1.55, sideZ: -b.d / 2 + 0.15 }
    ].forEach(ent => {
      // 出入口上方主橫匾招牌（走廊外側與內側雙面皆清晰可見「C-Show創客走廊」）
      const archBanner = new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.45, 0.82, 0.18), signMaterials);
      archBanner.position.set(0, totalH - 0.52, ent.z);
      archBanner.castShadow = true;
      group.add(archBanner);

      // 出入口最外緣門楣招牌（從 A 棟 / B 棟走廊或中庭鳥瞰皆可直接看到「C-Show創客走廊」）
      const outerBanner = new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.35, 0.68, 0.14), signMaterials);
      outerBanner.position.set(0, totalH - 0.42, ent.sideZ);
      group.add(outerBanner);

      // 出入口兩側門柱「C-Show創客走廊」門牌標示
      const entrancePlaqueMat = createDoorPlaqueMaterial("🎨", "C-Show創客走廊");
      [-b.w / 2 + 0.55, b.w / 2 - 0.55].forEach(px => {
        const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.38, 0.10), entrancePlaqueMat);
        plaque.position.set(px, fh + 2.35, ent.z);
        group.add(plaque);
      });
    });

    addSolarPanels(group, b.w, b.d, totalH + 0.35, 4, 1, 0.6, 1.2);

    // 2F 可行走樓板與兩側牆體碰撞
    walkZones.push({ b, lxMin: -b.w / 2, lxMax: b.w / 2, lzMin: -b.d / 2 - 0.8, lzMax: b.d / 2 + 0.8, y0: fh, y1: fh, rampAxis: null });
    colliders.push({ b, lxMin: -b.w / 2 - 0.15, lxMax: -b.w / 2 + 0.25, lzMin: -b.d / 2 + 0.4, lzMax: b.d / 2 - 0.4, floors: "2" });
    colliders.push({ b, lxMin: b.w / 2 - 0.25, lxMax: b.w / 2 + 0.15, lzMin: -b.d / 2 + 0.4, lzMax: b.d / 2 - 0.4, floors: "2" });
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

      // 1. 教室量體 (依 115 學校校舍平面圖留出西側/東側/中央雙折樓梯井與穿堂)
      const passage = (b.passages && b.passages[0]) || null;
      if (passage) {
        const pMin = passage.localX - passage.halfWidth;
        const pMax = passage.localX + passage.halfWidth;
        if (b.id === "bldg_a") {
          // 依「A棟平面圖示意圖.pdf」與 D 棟樓梯無縫對接規格：
          // 1F 網球主題廁所 / 2F 性別平等廁所 (-42.56..-35.76) | A棟西側樓梯 (-35.76..-32.16, 與 D 棟樓梯共用連通平台) | 西側教室 (-32.16..-2.13) | 中廊穿堂 (-2.13..2.87) | 東側教室 (2.87..29.15)
          const xStartL = -32.16, xEndL = pMin, leftW = xEndL - xStartL;
          // A 棟東端廁所東牆止於 lx_A = 29.15，與 C 棟 2F 視聽教室西側外牆 (lx_C = -6.625, 對應 lx_A = 30.14) 之間僅留約 1 米空間 (0.99m)
          const xStartR = pMax, xEndR = 29.15, rightW = xEndR - xStartR;
          const mL = new THREE.Mesh(new THREE.BoxGeometry(leftW, fh, roomD), wallMat);
          mL.position.set(xStartL + leftW / 2, fh / 2, roomCenterZ);
          mL.castShadow = true; mL.receiveShadow = true;
          mL.userData.isBuildingBody = true;
          const mR = new THREE.Mesh(new THREE.BoxGeometry(rightW, fh, roomD), wallMat);
          mR.position.set(xStartR + rightW / 2, fh / 2, roomCenterZ);
          mR.castShadow = true; mR.receiveShadow = true;
          mR.userData.isBuildingBody = true;
          const f2L = new THREE.Mesh(new THREE.BoxGeometry(leftW, fh, roomD), wallMat);
          f2L.position.set(xStartL + leftW / 2, fh + fh / 2, roomCenterZ);
          f2L.castShadow = true; f2L.receiveShadow = true;
          f2L.userData.isBuildingBody = true;
          const f2R = new THREE.Mesh(new THREE.BoxGeometry(rightW, fh, roomD), wallMat);
          f2R.position.set(xStartR + rightW / 2, fh + fh / 2, roomCenterZ);
          f2R.castShadow = true; f2R.receiveShadow = true;
          f2R.userData.isBuildingBody = true;
          const f2Lobby = new THREE.Mesh(new THREE.BoxGeometry(pMax - pMin + 0.4, 0.22, roomD + 0.3), floorMat);
          f2Lobby.position.set((pMin + pMax) / 2, fh - 0.05, roomCenterZ);
          group.add(mL, mR, f2L, f2R, f2Lobby);
          colliders.push({ b, lxMin: xStartL, lxMax: xEndL, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "both" });
          colliders.push({ b, lxMin: xStartR, lxMax: xEndR, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "both" });
          // 僅註冊中央穿堂過道 2F 平面，絕不覆蓋左右兩側玄關雙折樓梯井，確保下樓梯時能逐級向下不浮空
          walkZones.push({ b, lxMin: pMin - 0.12, lxMax: pMax + 0.12, lzMin: -b.d / 2 - 0.8, lzMax: b.d / 2 + 4.50, y0: fh, y1: fh, rampAxis: null });
        } else if (b.id === "bldg_b") {
          // B 棟：西端 Wc 3/4 (-38.95..-35.15) | 西側樓梯 (-35.06..-32.10) | 西側教室 101..104 / 201..204 (-32.00..-2.55) | 中央樓梯 (-2.48..0.48) | 中廊穿堂 (0.90..5.90) | 東側教室與資源回收室 (5.90..38.95)
          const wcW = 3.80;
          const wcBlock = new THREE.Mesh(new THREE.BoxGeometry(wcW, totalH, roomD), wallMat);
          wcBlock.position.set(-b.w / 2 + wcW / 2, totalH / 2, roomCenterZ);
          wcBlock.castShadow = true; wcBlock.receiveShadow = true;
          wcBlock.userData.isBuildingBody = true;
          group.add(wcBlock);
          colliders.push({ b, lxMin: -b.w / 2, lxMax: -b.w / 2 + wcW, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "both" });

          const xStartL = -32.00, xEndL = -2.55, leftW = xEndL - xStartL;
          const xStartR = pMax, xEndR = b.w / 2, rightW = xEndR - xStartR;
          const mL = new THREE.Mesh(new THREE.BoxGeometry(leftW, totalH, roomD), wallMat);
          mL.position.set(xStartL + leftW / 2, totalH / 2, roomCenterZ);
          mL.castShadow = true; mL.receiveShadow = true;
          mL.userData.isBuildingBody = true;
          const mR1 = new THREE.Mesh(new THREE.BoxGeometry(rightW, fh, roomD), wallMat);
          mR1.position.set(xStartR + rightW / 2, fh / 2, roomCenterZ);
          mR1.castShadow = true; mR1.receiveShadow = true;
          mR1.userData.isBuildingBody = true;
          // B 棟 2F 東側：205 E化教室 (pMin 0.90 .. 14.80) 維持標準教室深度 roomD，前方保留 2F 走廊；
          // 206-208 圖書室 (14.80 .. b.w/2 38.95) 範圍包含 2F 走廊空間（全深 b.d = 10.15m），由西向東走過 205 E化教室即正對圖書室西端入口門牌
          const libStartX = 14.80;
          const f2EClassStart = pMin;
          const f2EClassW = libStartX - f2EClassStart;
          const mR2E = new THREE.Mesh(new THREE.BoxGeometry(f2EClassW, fh, roomD), wallMat);
          mR2E.position.set(f2EClassStart + f2EClassW / 2, fh + fh / 2, roomCenterZ);
          mR2E.castShadow = true; mR2E.receiveShadow = true;
          mR2E.userData.isBuildingBody = true;

          const f2LibW = xEndR - libStartX;
          const mR2Lib = new THREE.Mesh(new THREE.BoxGeometry(f2LibW, fh, b.d), wallMat);
          mR2Lib.position.set(libStartX + f2LibW / 2, fh + fh / 2, 0);
          mR2Lib.castShadow = true; mR2Lib.receiveShadow = true;
          mR2Lib.userData.isBuildingBody = true;
          group.add(mL, mR1, mR2E, mR2Lib);
          // B 棟 2F 圖書室南側外牆 (lz = +b.d/2) 加設 2F 採光玻璃窗
          [17.8, 22.4, 27.0, 31.6, 36.0].forEach(wx => {
            addRoomBayElement(group, "x", b.d / 2, 1, fh, { winPos: wx, winW: 2.8 });
          });
          colliders.push({ b, lxMin: xStartL, lxMax: xEndL, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "both" });
          colliders.push({ b, lxMin: xStartR, lxMax: xEndR, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "1" });
          colliders.push({ b, lxMin: f2EClassStart, lxMax: libStartX, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "2" });
          colliders.push({ b, lxMin: libStartX, lxMax: xEndR, lzMin: -b.d / 2, lzMax: b.d / 2, floors: "2" });
        }
      } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, totalH, roomD), wallMat);
        body.position.set(0, totalH / 2, roomCenterZ);
        body.castShadow = true; body.receiveShadow = true;
        body.userData.isBuildingBody = true;
        group.add(body);
        colliders.push({ b, lxMin: -b.w / 2, lxMax: b.w / 2, lzMin: roomCenterZ - roomD / 2, lzMax: roomCenterZ + roomD / 2, floors: "both" });
      }

      // A 棟北側牆面與 B 棟北側牆面：改為跟南側牆面一樣各教室皆有獨立半透明玻璃窗（無門）
      const outWinZ = roomCenterZ - corrSign * (roomD / 2);
      if (b.id === "bldg_a") {
        addBackWallWindows(group, "x", outWinZ, -1, b.floors, fh, [-25.0, -19.2, -12.0, -5.6, 8.2, 15.0, 21.8, 27.2], 2.8);
      } else if (b.id === "bldg_b") {
        addBackWallWindows(group, "x", outWinZ, -1, b.floors, fh, [-37.0, -28.5, -21.0, -13.5, -6.0, 9.5, 16.5, 23.5, 30.5, 36.5], 3.0);
      } else {
        addBackWallWindows(group, "x", outWinZ, -1, b.floors, fh, [-b.w * 0.3, 0, b.w * 0.3], 2.8);
      }

      // 2. 透空 1F / 2F 走廊樓板 + 柱列 + 2F 欄杆 + 屋頂（A 棟西側延伸 4.20m 至 -35.76 銜接西側樓梯與網球/性平廁所，東側延伸 1.65m 與 C 棟走廊無縫銜接；B 棟 2F 走廊東端止於 lx = 14.80 圖書室入口）
      const westExt = b.id === "bldg_a" ? 4.20 : 0;
      const eastExt = b.id === "bldg_a" ? 1.65 : 0;
      const corrW = b.w + westExt + eastExt;
      const corrCenterX = (eastExt - westExt) / 2;
      const f1Floor = new THREE.Mesh(new THREE.BoxGeometry(corrW, 0.12, corrSize), floorMat);
      f1Floor.position.set(corrCenterX, 0.06, corrCenterZ);
      f1Floor.receiveShadow = true;
      const f2CorrMaxX = b.id === "bldg_b" ? 14.80 : (b.w / 2 + eastExt);
      const f2CorrMinX = -b.w / 2 - westExt;
      const f2CorrW = f2CorrMaxX - f2CorrMinX;
      const f2CorrCenterX = (f2CorrMinX + f2CorrMaxX) / 2;
      const f2Floor = new THREE.Mesh(new THREE.BoxGeometry(f2CorrW, 0.22, corrSize), floorMat);
      f2Floor.position.set(f2CorrCenterX, fh - 0.05, corrCenterZ);
      f2Floor.castShadow = true; f2Floor.receiveShadow = true;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(corrW + 0.6, 0.42, b.d + 0.6), roofMat);
      roof.position.set(corrCenterX, totalH + 0.21, 0);
      roof.castShadow = true; roof.receiveShadow = true;
      group.add(f1Floor, f2Floor, roof);

      // 走廊外緣柱列 (對齊教室隔間分界線，避開所有門牌正前方與樓梯開口)
      const pillarXs = b.id === "bldg_a"
        ? [-35.60, -32.16, -27.80, -15.15, -8.83, 12.60, 19.40, 25.60, 29.20]
        : (b.id === "bldg_b"
          ? [-38.40, -35.15, -31.30, -27.40, -17.28, -2.55, 14.80, 20.00, 27.05]
          : [-b.w / 2 + 0.8, 0, b.w / 2 - 0.8]);
      pillarXs.forEach(cx => {
        const cz = outerEdgeZ - corrSign * 0.2;
        const colH = (b.id === "bldg_b" && cx > 15.0) ? fh : totalH;
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.32, colH, 0.32), wallMat);
        col.position.set(cx, colH / 2, cz);
        col.castShadow = true;
        group.add(col);
        colliders.push({ b, lxMin: cx - 0.20, lxMax: cx + 0.20, lzMin: cz - 0.20, lzMax: cz + 0.20, floors: (b.id === "bldg_b" && cx > 15.0) ? "1" : "both", isPillar: true });
      });

      // 2F 走廊外緣女兒牆與欄杆
      const railSegs = b.id === "bldg_b"
        ? [[-b.w / 2, -30.45], [-27.40, 0.9], [5.9, 14.80]]
        : (b.id === "bldg_a"
          ? [[-b.w / 2 - westExt, -6.3], [7.0, b.w / 2 + eastExt]]
          : [[-b.w / 2, b.w / 2]]);
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
      // 2F 走廊端點欄杆防護（A 棟西端連通性平廁所 2F 走廊、東端連通 C 棟 2F 走廊，故無封閉端牆；B 棟僅封閉西端 -1）
      const endSides = b.id === "bldg_a" ? [] : (b.id === "bldg_b" ? [-1] : [-1, 1]);
      endSides.forEach(ex => {
        const endX = ex * (b.w / 2 - 0.1);
        const endZ = (wallFaceZ + outerEdgeZ) / 2;
        const endParapet = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, corrSize), wallMat);
        endParapet.position.set(endX, fh + 0.42, endZ);
        const endRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, corrSize), railMat);
        endRail.position.set(endX, fh + 1.05, endZ);
        group.add(endParapet, endRail);
        colliders.push({ b, lxMin: endX - 0.2, lxMax: endX + 0.2, lzMin: Math.min(wallFaceZ, outerEdgeZ), lzMax: Math.max(wallFaceZ, outerEdgeZ), floors: "2" });
      });
      if (b.id === "bldg_a" && eastExt > 0) {
        // A 棟 2F 走廊向東延伸銜接 C 棟段之北側女兒牆保護
        const extParapet = new THREE.Mesh(new THREE.BoxGeometry(eastExt + 0.2, 0.85, 0.16), wallMat);
        extParapet.position.set(b.w / 2 + eastExt / 2, fh + 0.42, wallFaceZ + 0.08);
        const extRail = new THREE.Mesh(new THREE.BoxGeometry(eastExt + 0.2, 0.06, 0.08), railMat);
        extRail.position.set(b.w / 2 + eastExt / 2, fh + 1.05, wallFaceZ + 0.08);
        group.add(extParapet, extRail);
      }
      if (b.id === "bldg_b") {
        // B 棟 2F 中央樓梯與創客走廊銜接處北側外緣女兒牆保護
        const bNorthGapW = 1.15;
        const bNorthParapet = new THREE.Mesh(new THREE.BoxGeometry(bNorthGapW, 0.85, 0.16), wallMat);
        bNorthParapet.position.set(0.75, fh + 0.42, -b.d / 2 + 0.15);
        const bNorthRail = new THREE.Mesh(new THREE.BoxGeometry(bNorthGapW, 0.06, 0.08), railMat);
        bNorthRail.position.set(0.75, fh + 1.05, -b.d / 2 + 0.15);
        group.add(bNorthParapet, bNorthRail);
      }

      // 走廊內牆門窗與班級牌
      addCorridorWallDetails(group, b.w, wallFaceZ, "x", corrSign, b.floors, fh, accentMat, b.passages, b);

      // 註冊 2F 走廊可行走平面（B 棟東端止於 lx = 14.80 圖書室入口前，邊界緊貼走廊壁面避免覆蓋樓梯斜坡區）
      walkZones.push({
        b,
        lxMin: -b.w / 2 - westExt - 0.6, lxMax: b.id === "bldg_b" ? 14.75 : (b.w / 2 + eastExt + 1.2),
        lzMin: Math.min(wallFaceZ, outerEdgeZ) - 0.05,
        lzMax: Math.max(wallFaceZ, outerEdgeZ) + 0.15,
        y0: fh, y1: fh, rampAxis: null
      });

      // 3. 樓梯配置（依「A棟平面圖示意圖.pdf」與「C棟平面圖示意圖.pdf」精準對位）
      if (b.id === "bldg_a") {
        const pMinA = passage ? (passage.localX - passage.halfWidth) : -2.13;
        const pMaxA = passage ? (passage.localX + passage.halfWidth) : 2.87;
        // 1 & 2. A 棟外突紅磚玄關左右兩側雙折樓梯 (lz: b.d/2 + 0.35 .. b.d/2 + 3.95，各梯段寬度皆精準為 1.8m)
        const stZ0 = b.d / 2 + 0.35;
        const stZ1 = b.d / 2 + 3.95;
        const midZ = (stZ0 + stZ1) / 2; // 樓梯中央共用圍牆位置
        addUTurnStaircase(group, b, walkZones, colliders, { lx0: pMinA - 4.05, lx1: pMinA - 0.05, lz0: stZ0, lz1: stZ1, y0: 0.08, y1: fh, dir1: "-x", turn: "right", f1Width: 1.8, f2Width: 1.8 });
        addUTurnStaircase(group, b, walkZones, colliders, { lx0: pMaxA + 0.05, lx1: pMaxA + 4.05, lz0: stZ0, lz1: stZ1, y0: 0.08, y1: fh, dir1: "+x", turn: "left", f1Width: 1.8, f2Width: 1.8 });

        // 依「A棟1F中廊玄關樓梯與外側空間共用圍牆(東側).png」、「A棟1F中間玄關樓梯旁與外側空間共用圍牆(西側).png」與「永續學習角.jpg」實景：
        // 1F 地面完全打通至樓梯中央 midZ 共用圍牆，將梯段下方寬敞空間（深度 1.75m、寬度 2.65m）全數納入永續角與閱讀角，空間大幅擴增！

        // 輔助椅子生成器
        function makeChair(cx, cz, color) {
          const chairG = new THREE.Group();
          const seatMat = new THREE.MeshLambertMaterial({ color });
          const legMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
          const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.04, 14), seatMat);
          seat.position.set(0, 0.38, 0);
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.38, 8), legMat);
          leg.position.set(0, 0.19, 0);
          const back = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.30, 0.03), seatMat);
          back.position.set(0, 0.53, 0.16);
          chairG.add(seat, leg, back);
          chairG.position.set(cx, 0, cz);
          return chairG;
        }

        // --- 左側（西側）：永續角（比照 永續學習角.jpg：6R 環保形象背板直接掛載於樓梯中央共用圍牆 midZ）---
        const ecoCenterX = (pMinA - 4.05 + 1.35 + pMinA - 0.05) / 2;
        const ecoWallTex = makeSignTexture(512, 320, (ctx, w, h) => {
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, "#0284c7"); grad.addColorStop(0.7, "#38bdf8"); grad.addColorStop(1, "#22c55e");
          ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = "#fef08a"; ctx.font = "bold 32px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("🌱 環保 6R ・ 全民綠生活", w / 2, 48);
          ctx.fillStyle = "#ffffff"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "left";
          ctx.fillText("🌿 Reduce   減少丟棄之垃圾量", 36, 100);
          ctx.fillText("🌿 Reuse    重複使用容器或產品", 36, 136);
          ctx.fillText("🌿 Recycle  回收使用再生產品", 36, 172);
          ctx.fillText("🌿 Repair   重視維修延長物品壽命", 36, 208);
          ctx.fillText("🌿 Refuse   拒用無環保觀念產品", 36, 244);
          ctx.fillText("🌿 Recovery 資源產生活用之再生", 36, 280);
        });
        const ecoBackdrop = new THREE.Mesh(new THREE.BoxGeometry(2.55, 1.65, 0.06), new THREE.MeshLambertMaterial({ map: ecoWallTex }));
        ecoBackdrop.position.set(ecoCenterX, 1.15, midZ - 0.04);
        const ecoPlaque = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.38, 0.06), createDoorPlaqueMaterial("🌱", "永續角"));
        ecoPlaque.position.set(ecoCenterX, 2.22, midZ - 0.04);
        const ecoTableGroup = new THREE.Group();
        const ecoTableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.08, 20), new THREE.MeshLambertMaterial({ color: 0xfacc15 }));
        ecoTableTop.position.set(0, 0.62, 0);
        const ecoTableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.58, 12), new THREE.MeshLambertMaterial({ color: 0x94a3b8 }));
        ecoTableLeg.position.set(0, 0.29, 0);
        ecoTableGroup.add(ecoTableTop, ecoTableLeg);
        ecoTableGroup.position.set(ecoCenterX, 0, 5.45);

        const ecoChair1 = makeChair(ecoCenterX - 0.65, 5.45, 0x16a34a);
        const ecoChair2 = makeChair(ecoCenterX + 0.65, 5.45, 0x16a34a);
        const ecoChair3 = makeChair(ecoCenterX, 5.45 - 0.65, 0x16a34a);
        const ecoChair4 = makeChair(ecoCenterX, 5.45 + 0.60, 0x16a34a);
        ecoChair4.rotation.y = Math.PI;

        const greenLifeDoorTex = makeSignTexture(256, 384, (ctx, w, h) => {
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 4; ctx.strokeRect(4, 4, w - 8, h - 8);
          ctx.fillStyle = "#16a34a"; ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("🌿 全民綠生活", w / 2, 48);
          ctx.fillStyle = "#0284c7"; ctx.font = "bold 18px sans-serif";
          ctx.fillText("節能減碳・永續校園", w / 2, 80);
          ctx.fillStyle = "#22c55e"; ctx.fillRect(24, 100, w - 48, 120);
          ctx.fillStyle = "#ffffff"; ctx.font = "bold 20px sans-serif";
          ctx.fillText("Green Life", w / 2, 145);
          ctx.font = "14px sans-serif"; ctx.fillText("Carbon Reduction", w / 2, 175);
          ctx.fillStyle = "#94a3b8"; ctx.beginPath(); ctx.arc(w - 32, h / 2, 8, 0, Math.PI * 2); ctx.fill();
        });
        const ecoDoor = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.70, 1.10), new THREE.MeshLambertMaterial({ map: greenLifeDoorTex }));
        ecoDoor.position.set(pMinA - 4.05 + 1.35 + 0.02, 0.93, 5.57);

        group.add(ecoBackdrop, ecoPlaque, ecoTableGroup, ecoChair1, ecoChair2, ecoChair3, ecoChair4, ecoDoor);

        // --- 右側（東側）：閱讀角（依照片「閱讀角牆面的壁貼參考示意圖.JPG」與「EMS的位置...JPG」精緻彩繪）---
        const readCenterX = (pMaxA + 0.05 + pMaxA + 4.05 - 1.35) / 2;

        // 閱讀角主牆彩繪（面朝走廊北側，包含「乘著閱讀的翅膀去冒險 Reading is an adventure that never ends.」、防盜白鋁窗、閱讀角圓形標誌與彩虹小書童壁貼）
        const readWallTex = makeSignTexture(512, 384, (ctx, w, h) => {
          ctx.fillStyle = "#7dd3fc"; ctx.fillRect(0, 0, w, h);
          // 頂部大標題
          ctx.fillStyle = "#f43f5e"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("乘著閱讀的翅膀去冒險", w / 2, 42);
          ctx.fillStyle = "#0284c7"; ctx.font = "bold 18px sans-serif";
          ctx.fillText("Reading is an adventure that never ends.", w / 2, 68);
          // 彩虹與草地地景
          ctx.beginPath();
          ctx.arc(140, 390, 160, Math.PI, 0, false);
          ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 14; ctx.stroke();
          ctx.beginPath();
          ctx.arc(140, 390, 146, Math.PI, 0, false);
          ctx.strokeStyle = "#f97316"; ctx.lineWidth = 14; ctx.stroke();
          ctx.beginPath();
          ctx.arc(140, 390, 132, Math.PI, 0, false);
          ctx.strokeStyle = "#eab308"; ctx.lineWidth = 14; ctx.stroke();
          ctx.beginPath();
          ctx.arc(140, 390, 118, Math.PI, 0, false);
          ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 14; ctx.stroke();
          ctx.beginPath();
          ctx.arc(140, 390, 104, Math.PI, 0, false);
          ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 14; ctx.stroke();

          // 閱讀小男孩（坐在彩虹上看書）
          ctx.fillStyle = "#1e293b"; ctx.beginPath(); ctx.arc(120, 240, 26, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#fecdd3"; ctx.beginPath(); ctx.arc(120, 245, 20, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#b91c1c"; ctx.fillRect(100, 266, 40, 32);

          // 右側跳躍小女孩與「閱讀角 Reading Corner」大標章
          ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(380, 155, 62, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 6; ctx.stroke();
          ctx.fillStyle = "#ef4444"; ctx.font = "bold 26px sans-serif";
          ctx.fillText("閱 讀 角", 380, 146);
          ctx.fillStyle = "#0284c7"; ctx.font = "bold 18px sans-serif";
          ctx.fillText("Reading Corner", 380, 175);

          // 飛舞書本與小鳥
          ctx.fillStyle = "#84cc16"; ctx.fillRect(400, 250, 36, 26);
          ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.arc(320, 260, 14, 0, Math.PI * 2); ctx.fill();
        });
        const readBackdrop = new THREE.Mesh(new THREE.BoxGeometry(2.55, 1.85, 0.06), new THREE.MeshLambertMaterial({ map: readWallTex }));
        readBackdrop.position.set(readCenterX, 1.25, midZ - 0.04);

        // 東側樓梯斜坡下方牆面壁貼（依「閱讀角牆面的壁貼參考示意圖.JPG」：小動物搭紙飛機、小孩乘書飛行、地球儀、蘋果、鉛筆與書籍插畫）
        const slopeWallTex = makeSignTexture(384, 384, (ctx, w, h) => {
          ctx.fillStyle = "#e0f2fe"; ctx.fillRect(0, 0, w, h);
          // 白色紙飛機與三隻可愛小動物 (小狗、小鼠、小貓)
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.moveTo(60, 150); ctx.lineTo(320, 90); ctx.lineTo(240, 190); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 3; ctx.stroke();
          // 動物頭像
          ctx.fillStyle = "#d97706"; ctx.beginPath(); ctx.arc(170, 95, 18, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#60a5fa"; ctx.beginPath(); ctx.arc(205, 90, 16, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#c084fc"; ctx.beginPath(); ctx.arc(240, 98, 16, 0, Math.PI * 2); ctx.fill();
          // 乘書飛行的小朋友
          ctx.fillStyle = "#be123c";
          ctx.beginPath(); ctx.moveTo(90, 220); ctx.lineTo(190, 200); ctx.lineTo(160, 260); ctx.lineTo(70, 250); ctx.closePath(); ctx.fill();
          // 地球儀、大紅蘋果、文具筆
          ctx.fillStyle = "#0284c7"; ctx.beginPath(); ctx.arc(270, 220, 28, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(270, 220, 32, -Math.PI / 2, Math.PI / 2); ctx.stroke();
          ctx.fillStyle = "#dc2626"; ctx.beginPath(); ctx.arc(310, 275, 26, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#15803d"; ctx.fillRect(308, 245, 6, 12);
          ctx.fillStyle = "#facc15"; ctx.fillRect(240, 240, 10, 70);
        });
        const slopeWall = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.85, 1.80), new THREE.MeshLambertMaterial({ map: slopeWallTex }));
        slopeWall.position.set(pMaxA + 4.05 - 1.35 - 0.02, 1.25, 5.80);

        // 實景天藍色圓桌與人體工學果綠色椅子（比照「閱讀角牆面的壁貼參考示意圖.JPG」實景）
        const readTableGroup = new THREE.Group();
        const readTableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.70, 0.08, 22), new THREE.MeshLambertMaterial({ color: 0x1d4ed8 }));
        readTableTop.position.set(0, 0.62, 0);
        const readTableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.58, 12), new THREE.MeshLambertMaterial({ color: 0x94a3b8 }));
        readTableLeg.position.set(0, 0.29, 0);
        readTableGroup.add(readTableTop, readTableLeg);
        readTableGroup.position.set(readCenterX, 0, 5.45);

        const readChair1 = makeChair(readCenterX - 0.68, 5.45, 0x4ade80);
        const readChair2 = makeChair(readCenterX + 0.68, 5.45, 0x4ade80);
        const readChair3 = makeChair(readCenterX, 5.45 - 0.68, 0x4ade80);
        const readChair4 = makeChair(readCenterX, 5.45 + 0.65, 0x4ade80);
        readChair4.rotation.y = Math.PI;

        // --- 核心修正：依「EMS保留一塊標示牌-退到後面的閱讀角的牆面上.png」指示：
        // 取消前緣外突懸掛之標示牌（原 emsPanel 與 emsGroup），退至後方閱讀角主牆面上，合併為一塊醒目清晰的「EMS 智慧能源管理系統」標示牌
        const emsSignTex = makeSignTexture(384, 480, (ctx, w, h) => {
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = "#0284c7"; ctx.lineWidth = 6; ctx.strokeRect(4, 4, w - 8, h - 8);

          // 頂部深藍標題橫幅：明顯的 EMS 智慧能源管理系統標章
          ctx.fillStyle = "#0f172a"; ctx.fillRect(6, 6, w - 12, 84);
          ctx.fillStyle = "#38bdf8"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("⚡ EMS 能源管理系統", w / 2, 42);
          ctx.font = "14px sans-serif"; ctx.fillStyle = "#94a3b8";
          ctx.fillText("Energy Management System", w / 2, 68);

          // 即時太陽能發電與校園能管數據
          ctx.fillStyle = "#f8fafc"; ctx.fillRect(16, 100, w - 32, 136);
          ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 2; ctx.strokeRect(16, 100, w - 32, 136);
          ctx.textAlign = "left";
          ctx.fillStyle = "#15803d"; ctx.font = "bold 17px sans-serif";
          ctx.fillText("🟢 即時發電：24.8 kW", 32, 132);
          ctx.fillStyle = "#b45309";
          ctx.fillText("🟡 校園用電：18.2 kW", 32, 168);
          ctx.fillStyle = "#0284c7";
          ctx.fillText("🔵 累積減碳：148.6 kg", 32, 204);
          ctx.fillStyle = "#16a34a"; ctx.fillRect(24, 218, w - 48, 14);
          ctx.fillStyle = "#ffffff"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("能源自給率 136% ・ 運轉良好", w / 2, 229);

          // 叫叫CD 心肺復甦與校園安全專區
          ctx.fillStyle = "#dc2626"; ctx.fillRect(16, 248, w - 32, 34);
          ctx.fillStyle = "#ffffff"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("叫叫CD ・ 急救流程與安全站", w / 2, 271);
          ctx.textAlign = "left"; ctx.fillStyle = "#1e293b"; ctx.font = "bold 14px sans-serif";
          ctx.fillText("1. 叫：確認意識呼吸", 28, 310);
          ctx.fillText("2. 叫：呼叫119取AED", 28, 340);
          ctx.fillText("3. C (CPR)：用力快壓胸口", 28, 370);
          ctx.fillText("4. D (AED)：開啟電擊去顫", 28, 400);

          ctx.fillStyle = "#64748b"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("溪洲國小 智慧校園 / 能源教育專區", w / 2, 452);
        });
        const cprSign = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.84, 0.03), new THREE.MeshLambertMaterial({ map: emsSignTex }));
        // 安裝於閱讀角後方牆面靠左側，面向走廊南側，清楚可見
        cprSign.position.set(readCenterX - 0.78, 1.25, midZ - 0.015);
        cprSign.userData.isSign = true;

        group.add(readBackdrop, slopeWall, readTableGroup, readChair1, readChair2, readChair3, readChair4, cprSign);

        // 註冊 1F 永續角與閱讀角加大空間之可行走平面 (y = 0.08m，無障礙自由步入)
        walkZones.push({
          b,
          lxMin: pMinA - 4.05 + 1.35, lxMax: pMinA - 0.05,
          lzMin: b.d / 2 - 0.10, lzMax: midZ - 0.15,
          y0: 0.08, y1: 0.08, rampAxis: null
        });
        walkZones.push({
          b,
          lxMin: pMaxA + 0.05, lxMax: pMaxA + 4.05 - 1.35,
          lzMin: b.d / 2 - 0.10, lzMax: midZ - 0.15,
          y0: 0.08, y1: 0.08, rampAxis: null
        });

        // 3. A 棟西側樓梯（lx: -35.76..-32.16，緊鄰網球/性平廁所東牆，且北側迴轉平台與 D 棟樓梯無縫連通，中間無女兒牆或扶手）
        addUTurnStaircase(group, b, walkZones, colliders, { lx0: -35.76, lx1: -32.16, lz0: -2.80, lz1: wallFaceZ, y0: 0.08, y1: fh, dir1: "-z", turn: "right", f1Width: 1.8, f2Width: 1.8, noBackWall: true });
      } else if (b.id === "bldg_b") {
        // 5. B 棟西側樓梯（梯寬各為 1.8m，總寬 3.6m）
        addUTurnStaircase(group, b, walkZones, colliders, { lx0: -35.70, lx1: -32.10, lz0: -b.d / 2 + 0.35, lz1: wallFaceZ, y0: 0.08, y1: fh, dir1: "-z", turn: "right", f1Width: 1.8, f2Width: 1.8 });
        // 4. B 棟中央樓梯（梯寬各為 1.8m，總寬 3.6m）
        addUTurnStaircase(group, b, walkZones, colliders, { lx0: -2.70, lx1: 0.90, lz0: -b.d / 2 + 0.35, lz1: wallFaceZ, y0: 0.08, y1: fh, dir1: "-z", turn: "right", f1Width: 1.8, f2Width: 1.8 });
      }
    } else if (b.id === "bldg_c") {
      // 依「C棟平面圖示意圖.pdf」與「影片/A棟校舍2F走廊(由中廊自西向東移動之動態畫面).mov」後面影格精準對位：
      // 1. C 棟 1F 西側有南北向走廊 (lx_C: -6.625..-3.525)，東側為 C103 二甲、C102 一乙、C101 一甲 (lx_C: -3.525..+6.625)
      // 2. C 棟 2F 視聽教室 (C201) 空間涵蓋 1F 走廊上方（全寬 b.w = 13.25m, lx_C: -6.625..+6.625, lz_C: -14.12..+12.42），
      //    因此 2F 視聽教室西側外牆 (lx_C = -6.625) 外並無走廊、不可走過去，且與西側 A 棟 2F 廁所東牆 (lx_A = 29.15) 僅相距約 1 米空間！
      // 3. 2F 視聽教室南牆 (lz_C = +12.42) 與 A 棟 2F 走廊北牆 (lz_A = +1.42) 共線，前方即為連通 A 棟 2F 走廊與 C 棟 2F 樓梯口之東西向走廊 (lz_C: +12.42..+15.52)
      const corrSign = -1;
      const roomW1F = b.w - corrSize;
      const roomCenterX1F = -corrSign * (corrSize / 2);
      const corrCenterX = corrSign * (b.w / 2 - corrSize / 2);
      const wallFaceX = corrSign * (b.w / 2 - corrSize);
      const outerEdgeX = corrSign * (b.w / 2);

      const roomZ0 = -b.d / 2;         // -14.12
      const roomZ1 = 12.42;            // 1F C101 南牆（依實景外推至切齊 A 棟走廊右側北牆）
      const roomZ1_2F = 12.42;         // 2F 視聽教室南牆（與 A 棟 2F 走廊北牆共線，緊鄰 A 棟 2F 東側廁所）
      const southJoinZ = 15.52;        // 與 A 棟 1F/2F 走廊南外緣共線 (走廊寬 3.10m: 12.42..15.52)
      const roomLenZ1F = roomZ1 - roomZ0;
      const roomCenterZ1F = (roomZ0 + roomZ1) / 2;
      const roomLenZ2F = roomZ1_2F - roomZ0;
      const roomCenterZ2F = (roomZ0 + roomZ1_2F) / 2;

      // 1. 1F 教室量體 (C103..C101，寬 roomW1F = 10.15m，西側保留 1F 走廊) + 2F 視聽教室 C201 量體 (全寬 b.w = 13.25m，涵蓋 1F 走廊上方，西側無 2F 走廊！)
      const body1F = new THREE.Mesh(new THREE.BoxGeometry(roomW1F, fh, roomLenZ1F), wallMat);
      body1F.position.set(roomCenterX1F, fh / 2, roomCenterZ1F);
      body1F.castShadow = true; body1F.receiveShadow = true;
      body1F.userData.isBuildingBody = true;
      const body2F = new THREE.Mesh(new THREE.BoxGeometry(b.w, fh, roomLenZ2F), wallMat);
      body2F.position.set(0, fh + fh / 2, roomCenterZ2F);
      body2F.castShadow = true; body2F.receiveShadow = true;
      body2F.userData.isBuildingBody = true;
      group.add(body1F, body2F);
      colliders.push({ b, lxMin: roomCenterX1F - roomW1F / 2, lxMax: roomCenterX1F + roomW1F / 2, lzMin: roomZ0, lzMax: roomZ1, floors: "1" });
      colliders.push({ b, lxMin: -b.w / 2, lxMax: b.w / 2, lzMin: roomZ0, lzMax: roomZ1_2F, floors: "2" });

      // C 棟東側外牆（1F & 2F）與 2F 視聽教室西側外牆 (lx = -b.w/2) 採光玻璃窗
      addBackWallWindows(group, "z", b.w / 2, 1, b.floors, fh, [-11.5, -8.5, -4.0, -1.0, 2.5, 5.5, 9.5], 2.2);
      addBackWallWindows(group, "z", -b.w / 2, -1, 1, fh, [-11.0, -6.5, -2.0, 2.5, 7.0], 2.2);
      group.children.slice(-5).forEach(w => { w.position.y += fh; });
      const bikeCanopy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, roomLenZ1F), roofMat);
      bikeCanopy.position.set(b.w / 2 + 1.1, fh - 0.1, roomCenterZ1F);
      group.add(bikeCanopy);

      // 2. 1F 走廊系統：
      // (1) 1F 西側南北向走廊 (lx: -6.625..-3.525, lz: -14.12..+15.52)
      // (2) 1F 南側東西向貫穿走廊 (lx: -6.625..+6.625, lz: 12.42..15.52，向西無縫連通 A 棟 1F 走廊，向東延伸直通食農教室！)
      const westTotalD = southJoinZ - roomZ0;
      const westCenterZ = (roomZ0 + southJoinZ) / 2;
      const f1FloorW = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.12, westTotalD), floorMat);
      f1FloorW.position.set(corrCenterX, 0.06, westCenterZ);
      f1FloorW.receiveShadow = true;

      const southSpanZ = southJoinZ - roomZ1; // 3.10m (12.42..15.52)
      const equipCenterZ = (roomZ1 + southJoinZ) / 2; // 13.97m
      // 1F 南側東西向走廊完整地坪：由西側 A 棟走廊延伸直通至東側出口，走廊中間零障礙！
      const f1FloorSouthCorr = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.8, 0.12, southSpanZ), floorMat);
      f1FloorSouthCorr.position.set(0.4, 0.06, equipCenterZ);
      f1FloorSouthCorr.receiveShadow = true;
      group.add(f1FloorW, f1FloorSouthCorr);

      // 走廊東側出口頂部結構樑 (lx = b.w/2, y: 2.45..fh)，地面至 2.45m 高度完全開放為通道出口，小人可沿走廊筆直走出去到食農教室
      const exitLintel = new THREE.Mesh(new THREE.BoxGeometry(0.24, fh - 2.45, southSpanZ), wallMat);
      exitLintel.position.set(b.w / 2, 2.45 + (fh - 2.45) / 2, equipCenterZ);
      group.add(exitLintel);

      // 走廊東側盡頭南緣短護牆（器材室東側 lx: 5.00..b.w/2 處）
      const exitSouthParapet = new THREE.Mesh(new THREE.BoxGeometry(b.w / 2 - 5.00, 0.85, 0.16), wallMat);
      exitSouthParapet.position.set((5.00 + b.w / 2) / 2, 0.42, southJoinZ);
      const exitSouthRail = new THREE.Mesh(new THREE.BoxGeometry(b.w / 2 - 5.00, 0.06, 0.08), railMat);
      exitSouthRail.position.set((5.00 + b.w / 2) / 2, 1.05, southJoinZ);
      group.add(exitSouthParapet, exitSouthRail);
      colliders.push({ b, lxMin: 4.90, lxMax: b.w / 2 + 0.1, lzMin: southJoinZ - 0.15, lzMax: southJoinZ + 0.15, floors: "1" });

      // 註冊 1F 西側南北向走廊與南側東西向直通走廊可行走平面（往東筆直走通至食農教室通道）
      walkZones.push({ b, lxMin: outerEdgeX - 0.2, lxMax: -b.w / 2 + corrSize + 0.2, lzMin: roomZ0 - 0.2, lzMax: southJoinZ + 0.2, y0: 0.08, y1: 0.08, rampAxis: null });
      walkZones.push({ b, lxMin: outerEdgeX - 0.2, lxMax: b.w / 2 + 1.2, lzMin: roomZ1 - 0.2, lzMax: southJoinZ + 0.2, y0: 0.08, y1: 0.08, rampAxis: null });

      // 4. 器材室（緊鄰 C 棟樓梯東側 lx: 1.16..5.00, lz: 15.52..19.10，依實景照「C棟樓梯旁器材室.JPG」精準建模）
      const equipW = 3.84;
      const equipCenterX = (1.16 + 5.00) / 2; // 3.08m
      const equipD = 3.58;
      const equipCenterZ_room = (southJoinZ + southJoinZ + equipD) / 2; // 17.31m
      const equipBody = new THREE.Mesh(new THREE.BoxGeometry(equipW, fh, equipD), wallMat);
      equipBody.position.set(equipCenterX, fh / 2, equipCenterZ_room);
      equipBody.castShadow = true; equipBody.receiveShadow = true;
      equipBody.userData.isBuildingBody = true;
      const equipRoof = new THREE.Mesh(new THREE.BoxGeometry(equipW + 0.1, 0.22, equipD + 0.1), roofMat);
      equipRoof.position.set(equipCenterX, fh + 0.11, equipCenterZ_room);
      group.add(equipBody, equipRoof);
      colliders.push({ b, lxMin: 1.16, lxMax: 5.00, lzMin: southJoinZ, lzMax: southJoinZ + equipD, floors: "1" });

      // 器材室北面朝向走廊（lz = southJoinZ = 15.52）實景立面：
      // 1) 鋁合金紗門 (lx = 1.95, 寬 1.05m, 高 2.25m)：上部菱格防蚊紗網、下部鋁金屬橫壓板、門把與頂部氣壓閉門器
      const screenDoorGroup = new THREE.Group();
      const doorFrameMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
      const doorMeshMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
      const doorPanelMat = new THREE.MeshLambertMaterial({ color: 0xcbd5e1 });
      const dFrame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.25, 0.08), doorFrameMat);
      const dMesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.04), doorMeshMat);
      dMesh.position.set(0, 0.45, 0.02);
      const dPanel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.04), doorPanelMat);
      dPanel.position.set(0, -0.55, 0.02);
      const dHandle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.08), new THREE.MeshLambertMaterial({ color: 0xe2e8f0 }));
      dHandle.position.set(0.38, -0.05, 0.05);
      const dCloser = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.08), doorFrameMat);
      dCloser.position.set(0, 1.10, 0.05);
      screenDoorGroup.add(dFrame, dMesh, dPanel, dHandle, dCloser);
      screenDoorGroup.position.set(1.95, 1.12, southJoinZ - 0.04);
      group.add(screenDoorGroup);

      // 2) 門上方實景金屬招牌空鐵架 (bracket)
      const bracketMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
      const bBarH = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.04), bracketMat);
      bBarH.position.set(1.55, 2.65, southJoinZ - 0.15);
      const bBarV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.04), bracketMat);
      bBarV.position.set(1.55, 2.80, southJoinZ - 0.04);
      group.add(bBarH, bBarV);

      // 門頭「器材室」標準金屬門牌
      const equipPlaque = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.30, 0.06), createDoorPlaqueMaterial("", "器材室"));
      equipPlaque.position.set(1.95, 2.45, southJoinZ - 0.05);
      equipPlaque.userData.isSign = true;
      group.add(equipPlaque);

      // 3) 四聯電燈開關面板 (lx = 2.65, y = 1.35)
      const switchPlate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.02), new THREE.MeshLambertMaterial({ color: 0xfef3c7 }));
      switchPlate.position.set(2.65, 1.35, southJoinZ - 0.02);
      group.add(switchPlate);

      // 4) 防盜鐵窗／格柵採光窗 (lx = 3.65, 寬 1.10m, 高 1.15m, 內嵌 6 枝直立鋁格柵挺)
      const winGroup = new THREE.Group();
      const winFrame = new THREE.Mesh(new THREE.BoxGeometry(1.10, 1.15, 0.14), new THREE.MeshLambertMaterial({ color: 0x475569 }));
      const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 1.01), sharedGlassMat);
      winGlass.position.z = 0.02;
      winGroup.add(winFrame, winGlass);
      for (let bx = -0.40; bx <= 0.40; bx += 0.16) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.05, 8), doorFrameMat);
        bar.position.set(bx, 0, 0.05);
        winGroup.add(bar);
      }
      winGroup.position.set(3.65, 1.62, southJoinZ - 0.02);
      group.add(winGroup);

      // 2F 僅有視聽教室南側直通走廊樓板 (f2FloorSame，全寬 b.w 銜接 A 棟 2F 走廊與 C 棟 2F 樓梯口；視聽教室西側外牆外無 2F 走廊樓板)
      const f2CorrD = southJoinZ - roomZ1_2F;
      const f2FloorSame = new THREE.Mesh(new THREE.BoxGeometry(b.w + 1.2, 0.22, f2CorrD), floorMat);
      f2FloorSame.position.set(-0.6, fh - 0.05, (roomZ1_2F + southJoinZ) / 2);
      f2FloorSame.castShadow = true; f2FloorSame.receiveShadow = true;

      // 2F 走廊外緣女兒牆與東端彩繪矮牆（南側留出 C 棟樓梯口 lx: -1.80..1.16）
      function addC2FParapet(x0, z0, x1, z1, customMat) {
        const isX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
        const len = isX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
        if (len < 0.2) return;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const p = new THREE.Mesh(new THREE.BoxGeometry(isX ? len : 0.16, 0.85, isX ? 0.16 : len), customMat || wallMat);
        p.position.set(cx, fh + 0.42, cz);
        const r = new THREE.Mesh(new THREE.BoxGeometry(isX ? len : 0.08, 0.06, isX ? 0.08 : len), railMat);
        r.position.set(cx, fh + 1.05, cz);
        group.add(p, r);
        colliders.push({
          b,
          lxMin: Math.min(x0, x1) - 0.18,
          lxMax: Math.max(x0, x1) + 0.18,
          lzMin: Math.min(z0, z1) - 0.18,
          lzMax: Math.max(z0, z1) + 0.18,
          floors: "2"
        });
      }
      const eastMuralTex = makeSignTexture(256, 96, (ctx, w, h) => {
        ctx.fillStyle = "#e0f2fe"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#86efac"; ctx.fillRect(0, h - 28, w, 28);
        ["#ef4444", "#f97316", "#eab308", "#ec4899", "#3b82f6"].forEach((c, idx) => {
          ctx.fillStyle = c;
          ctx.beginPath(); ctx.arc(32 + idx * 48, 48, 16, 0, Math.PI * 2); ctx.fill();
        });
      });
      // C 棟 2F 南側直通走廊南緣女兒牆（留出 C 棟樓梯口 lx: -3.64..1.16）與東端彩繪女兒牆
      addC2FParapet(outerEdgeX - 1.1, southJoinZ - 0.08, -3.64, southJoinZ - 0.08);
      addC2FParapet(1.16, southJoinZ - 0.08, b.w / 2 - 0.1, southJoinZ - 0.08);
      addC2FParapet(b.w / 2 - 0.1, roomZ1_2F, b.w / 2 - 0.1, southJoinZ, new THREE.MeshLambertMaterial({ map: eastMuralTex }));

      const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.42, westTotalD + 0.6), roofMat);
      roof.position.set(0, totalH + 0.21, westCenterZ);
      roof.castShadow = true; roof.receiveShadow = true;
      group.add(f1FloorW, f2FloorSame, roof);

      // 註冊 C 棟 2F 南端視聽教室前直通走廊可行走平面（與 A 棟 2F 走廊無縫連通，視聽教室西側外無 2F 走廊故不註冊西側 2F 行走區）
      walkZones.push({ b, lxMin: outerEdgeX - 1.4, lxMax: b.w / 2, lzMin: roomZ1_2F - 0.05, lzMax: southJoinZ - 0.05, y0: fh, y1: fh, rampAxis: null });

      // C 棟 1F 西側南北向走廊支撐柱列（僅 1F 高度 fh，上方即為 2F 視聽教室西側量體）
      [-13.5, -6.88, 0.36, 7.60, 11.20].forEach(cz => {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.32, fh, 0.32), wallMat);
        col.position.set(outerEdgeX - corrSign * 0.2, fh / 2, cz);
        col.castShadow = true;
        group.add(col);
        const cx = outerEdgeX - corrSign * 0.2;
        colliders.push({ b, lxMin: cx - 0.20, lxMax: cx + 0.20, lzMin: cz - 0.20, lzMax: cz + 0.20, floors: "1", isPillar: true });
      });

      addCorridorWallDetails(group, b.d, wallFaceX, "z", corrSign, 1, fh, accentMat, null, b);

      // C 棟 1F 南面牆公佈欄（依照片「C棟校舍1F南面牆公佈欄.JPG」：對面就是 C 棟樓梯與器材室，設置「溪洲國小健康專欄」大型彩繪公佈欄與左側紅色火警警鈴）
      const bulletinTex = makeSignTexture(768, 256, (ctx, w, h) => {
        ctx.fillStyle = "#86efac"; ctx.fillRect(0, 0, w, h);
        // 外框金屬邊
        ctx.strokeStyle = "#854d0e"; ctx.lineWidth = 10; ctx.strokeRect(5, 5, w - 10, h - 10);
        // 大標題與彩虹
        ctx.beginPath();
        ctx.arc(300, 320, 220, Math.PI, 0, false);
        ctx.strokeStyle = "rgba(244, 63, 94, 0.75)"; ctx.lineWidth = 12; ctx.stroke();
        ctx.beginPath();
        ctx.arc(300, 320, 206, Math.PI, 0, false);
        ctx.strokeStyle = "rgba(249, 115, 22, 0.75)"; ctx.lineWidth = 12; ctx.stroke();
        ctx.beginPath();
        ctx.arc(300, 320, 192, Math.PI, 0, false);
        ctx.strokeStyle = "rgba(234, 179, 8, 0.75)"; ctx.lineWidth = 12; ctx.stroke();

        ctx.fillStyle = "#0284c7"; ctx.fillRect(180, 24, 400, 48);
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 32px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("溪 洲 國 小 健 康 專 欄", 380, 58);

        // 各項宣導海報插畫與森巴鼓人偶
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(40, 85, 120, 140);
        ctx.fillRect(180, 85, 130, 140);
        ctx.fillRect(330, 85, 110, 140);
        ctx.fillRect(460, 85, 100, 140);
        ctx.fillRect(580, 85, 140, 140);

        ctx.fillStyle = "#1e293b"; ctx.font = "bold 15px sans-serif";
        ctx.fillText("保護兒少", 100, 110);
        ctx.fillText("視力保健", 245, 110);
        ctx.fillText("行政中立", 385, 110);
        ctx.fillText("健康飲食", 510, 110);
        ctx.fillText("森巴活力", 650, 110);
      });
      const bulletinBoard = new THREE.Mesh(new THREE.BoxGeometry(4.20, 1.35, 0.05), new THREE.MeshLambertMaterial({ map: bulletinTex }));
      bulletinBoard.position.set(0.60, 1.55, roomZ1 + 0.03);
      group.add(bulletinBoard);

      // 左側火警警報器與火警警鈴 (紅色立體圓盒與指示燈)
      const fireAlarmG = new THREE.Group();
      const fireBox = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.32, 0.06), new THREE.MeshLambertMaterial({ color: 0xdc2626 }));
      const fireBell = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), new THREE.MeshLambertMaterial({ color: 0xb91c1c }));
      fireBell.rotation.x = Math.PI / 2;
      fireBell.position.set(0, -0.06, 0.04);
      const fireLamp = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), new THREE.MeshLambertMaterial({ color: 0xfef08a }));
      fireLamp.position.set(0, 0.08, 0.04);
      fireAlarmG.add(fireBox, fireBell, fireLamp);
      fireAlarmG.position.set(-1.85, 1.50, roomZ1 + 0.04);
      group.add(fireAlarmG);

      // C 棟 1F 樓梯正下方地面為走廊地板延伸（寬度擴大為 4.8m 全覆蓋，比照「打x劃記處沒有紅磚.png」實景非紅磚地坪）
      const stairFloor = new THREE.Mesh(new THREE.BoxGeometry(1.16 - (-3.64), 0.10, 3.65), floorMat);
      stairFloor.position.set((-3.64 + 1.16) / 2, 0.05, southJoinZ + 3.65 / 2);
      stairFloor.receiveShadow = true;
      group.add(stairFloor);

      // 3. C 棟雙折樓梯：位於連續走廊南側 (lx: -3.64..1.16, lz: 15.52..19.10)
      // 依使用者指示：1F 到迴轉平台那段 3 米寬 (Flight 1)，迴轉平台往上到 2F 那段為 1.8 米寬 (Flight 2)
      addUTurnStaircase(group, b, walkZones, colliders, {
        lx0: -3.64, lx1: 1.16,
        lz0: southJoinZ, lz1: southJoinZ + 3.58,
        y0: 0.08, y1: fh, dir1: "+z", turn: "right",
        f1Width: 3.0, f2Width: 1.8
      });

      // --- C 棟 1-2 樓樓梯的南側牆立面建模（依照片「C棟1-2樓樓梯的南側牆(牆上有乳白色鋁格柵及透明PC板).JPG」實景精確還原）---
      const stairTowerSouthZ = southJoinZ + 3.58; // 19.10m
      const southFacadeG = new THREE.Group();

      // 白色磁磚材質
      const whiteTileTex = makeSignTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 2;
        for (let x = 0; x <= w; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let y = 0; y <= h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      });
      whiteTileTex.wrapS = whiteTileTex.wrapT = THREE.RepeatWrapping;
      whiteTileTex.repeat.set(2, 4);
      const towerTileMat = new THREE.MeshLambertMaterial({ map: whiteTileTex });
      const pcPanelMat = new THREE.MeshPhongMaterial({ color: 0xf1f5f9, specular: 0xffffff, shininess: 80, transparent: true, opacity: 0.68 });
      const whiteAlumMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });

      // 4 根垂直貫穿 1F~2F 的白磁磚結構主柱
      const pColsX = [-3.70, -1.80, 1.16, 5.00];
      pColsX.forEach(px => {
        const pCol = new THREE.Mesh(new THREE.BoxGeometry(0.38, totalH, 0.38), towerTileMat);
        pCol.position.set(px, totalH / 2, stairTowerSouthZ);
        pCol.castShadow = true;
        southFacadeG.add(pCol);
        colliders.push({ b, lxMin: px - 0.20, lxMax: px + 0.20, lzMin: stairTowerSouthZ - 0.20, lzMax: stairTowerSouthZ + 0.20, floors: "both", isPillar: true });
      });

      // 1) 左側區間（lx: -3.70..-1.80，1F 拱門通道 + 2F 圓拱白鋁格柵採光窗）
      const leftBayW = 1.90;
      const leftBayMidX = (-3.70 + -1.80) / 2;
      // 1F 拱門通道上部實體樑
      const archSpandrel = new THREE.Mesh(new THREE.BoxGeometry(leftBayW, 0.95, 0.24), towerTileMat);
      archSpandrel.position.set(leftBayMidX, 2.65, stairTowerSouthZ);
      // 2F 圓拱採光窗（乳白色鋁格柵 + 半透明 PC 採光板）
      const archWinGroup = new THREE.Group();
      const archWinFrame = new THREE.Mesh(new THREE.BoxGeometry(leftBayW - 0.1, 2.45, 0.14), whiteAlumMat);
      const archWinPC = new THREE.Mesh(new THREE.PlaneGeometry(leftBayW - 0.2, 2.30), pcPanelMat);
      archWinPC.position.z = 0.08;
      archWinGroup.add(archWinFrame, archWinPC);
      // 窗內直立與橫向乳白鋁格柵
      for (let gx = -0.65; gx <= 0.65; gx += 0.42) {
        const vBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.25, 8), whiteAlumMat);
        vBar.position.set(gx, 0, 0.09);
        archWinGroup.add(vBar);
      }
      for (let gy = -0.80; gy <= 0.80; gy += 0.55) {
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(leftBayW - 0.25, 0.035, 0.035), whiteAlumMat);
        hBar.position.set(0, gy, 0.09);
        archWinGroup.add(hBar);
      }
      archWinGroup.position.set(leftBayMidX, fh + 1.45, stairTowerSouthZ);
      southFacadeG.add(archSpandrel, archWinGroup);

      // 2) 中央梯背區間（lx: -1.80..1.16，梯階仰角傾斜白磁磚外牆 + 無障礙標誌 ♿ + 斜角乳白格柵透明PC窗）
      const midBayW = 2.96;
      const midBayMidX = (-1.80 + 1.16) / 2;
      // 中央倒V字型階梯下部造型飾牆（附無障礙停車/通用標誌 ♿）
      const handicapTex = makeSignTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#0284c7"; ctx.lineWidth = 6; ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = "#0284c7"; ctx.beginPath(); ctx.arc(w / 2, 38, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(w / 2 - 6, 56, 12, 36);
        ctx.beginPath(); ctx.arc(w / 2, 78, 26, Math.PI * 0.1, Math.PI * 1.3); ctx.lineWidth = 8; ctx.stroke();
      });
      const midWallSolid = new THREE.Mesh(new THREE.BoxGeometry(midBayW, 1.85, 0.22), towerTileMat);
      midWallSolid.position.set(midBayMidX, 1.35, stairTowerSouthZ);
      const handicapSign = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.04), new THREE.MeshLambertMaterial({ map: handicapTex }));
      handicapSign.position.set(midBayMidX, 1.75, stairTowerSouthZ + 0.12);
      southFacadeG.add(midWallSolid, handicapSign);

      // 中央 2F 梯間白鋁格柵採光窗
      const midWinGroup = new THREE.Group();
      const midWinFrame = new THREE.Mesh(new THREE.BoxGeometry(midBayW - 0.1, 2.60, 0.14), whiteAlumMat);
      const midWinPC = new THREE.Mesh(new THREE.PlaneGeometry(midBayW - 0.2, 2.45), pcPanelMat);
      midWinPC.position.z = 0.08;
      midWinGroup.add(midWinFrame, midWinPC);
      for (let gx = -1.10; gx <= 1.10; gx += 0.52) {
        const vBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.40, 8), whiteAlumMat);
        vBar.position.set(gx, 0, 0.09);
        midWinGroup.add(vBar);
      }
      for (let gy = -0.90; gy <= 0.90; gy += 0.60) {
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(midBayW - 0.25, 0.035, 0.035), whiteAlumMat);
        hBar.position.set(0, gy, 0.09);
        midWinGroup.add(hBar);
      }
      midWinGroup.position.set(midBayMidX, fh + 1.45, stairTowerSouthZ);
      southFacadeG.add(midWinGroup);

      // 3) 右側區間（lx: 1.16..5.00，1F 右下角落器材室圓拱防盜窗 + 2F 圓拱白鋁格柵採光窗）
      const rightBayW = 3.84;
      const rightBayMidX = (1.16 + 5.00) / 2;
      // 1F 器材室南外牆
      const rightWall1F = new THREE.Mesh(new THREE.BoxGeometry(rightBayW, fh, 0.24), towerTileMat);
      rightWall1F.position.set(rightBayMidX, fh / 2, stairTowerSouthZ);
      rightWall1F.castShadow = true;
      // 1F 器材室圓拱防盜格柵採光窗
      const equipArchWin = new THREE.Group();
      const eaFrame = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 0.12), new THREE.MeshLambertMaterial({ color: 0x475569 }));
      const eaGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.10, 1.10), sharedGlassMat);
      eaGlass.position.z = 0.02;
      equipArchWin.add(eaFrame, eaGlass);
      for (let bx = -0.42; bx <= 0.42; bx += 0.16) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.10, 8), new THREE.MeshLambertMaterial({ color: 0x94a3b8 }));
        bar.position.set(bx, 0, 0.05);
        equipArchWin.add(bar);
      }
      equipArchWin.position.set(rightBayMidX + 0.40, 1.35, stairTowerSouthZ + 0.10);

      // 2F 器材室上方圓拱採光窗
      const rightWinGroup = new THREE.Group();
      const rightWinFrame = new THREE.Mesh(new THREE.BoxGeometry(rightBayW - 0.2, 2.45, 0.14), whiteAlumMat);
      const rightWinPC = new THREE.Mesh(new THREE.PlaneGeometry(rightBayW - 0.3, 2.30), pcPanelMat);
      rightWinPC.position.z = 0.08;
      rightWinGroup.add(rightWinFrame, rightWinPC);
      for (let gx = -1.40; gx <= 1.40; gx += 0.55) {
        const vBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.25, 8), whiteAlumMat);
        vBar.position.set(gx, 0, 0.09);
        rightWinGroup.add(vBar);
      }
      for (let gy = -0.80; gy <= 0.80; gy += 0.55) {
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(rightBayW - 0.35, 0.035, 0.035), whiteAlumMat);
        hBar.position.set(0, gy, 0.09);
        rightWinGroup.add(hBar);
      }
      rightWinGroup.position.set(rightBayMidX, fh + 1.45, stairTowerSouthZ);
      southFacadeG.add(rightWall1F, equipArchWin, rightWinGroup);

      // 南立面頂部女兒牆與封簷飾帶
      const towerTopParapet = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.65, 0.42), towerTileMat);
      towerTopParapet.position.set(0.65, totalH + 0.32, stairTowerSouthZ);
      southFacadeG.add(towerTopParapet);

      group.add(southFacadeG);

      // A 棟 2F 東側廁所東牆與 C 棟 2F 視聽教室西側外牆之間僅約 1 米空間 (1.05m)，設置馬賽克鯨魚洗手台矮牆與 2F 防護碰撞（禁止在 2F 往北穿出）
      const whaleSinkTex = makeSignTexture(256, 160, (ctx, w, h) => {
        ctx.fillStyle = "#38bdf8"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#86efac"; ctx.fillRect(0, h - 42, w, 42);
        ctx.fillStyle = "#2563eb";
        ctx.beginPath(); ctx.arc(w * 0.55, h * 0.52, 46, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#fde047";
        ctx.beginPath(); ctx.arc(w * 0.52, h * 0.32, 18, 0, Math.PI * 2); ctx.fill();
      });
      const mosaicWall = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.85, 0.32), new THREE.MeshLambertMaterial({ map: whaleSinkTex }));
      mosaicWall.position.set(outerEdgeX - 0.54, fh + 0.95, roomZ1_2F + 0.16);
      group.add(mosaicWall);
      colliders.push({ b, lxMin: outerEdgeX - 1.25, lxMax: outerEdgeX + 0.05, lzMin: roomZ1_2F - 0.35, lzMax: roomZ1_2F + 0.32, floors: "2" });

      // 視聽教室 C201 雙開白門、門牌與白板長桌（緊鄰 A 棟 2F 東側廁所與 1 米洗手台空間，位於同一條 2F 走廊北牆 lz = roomZ1_2F = +12.42）
      addRoomBayElement(group, "x", roomZ1_2F, 1, fh, { code: "", name: "視聽教室", doorPos: -4.45, plaquePos: -4.45, winPos: -1.65, winW: 2.3, boardPos: 1.15 });
      addRoomBayElement(group, "x", roomZ1_2F, 1, fh, { winPos: 4.10, winW: 2.3 });
    } else {
      // D 棟：1F 東西兩側皆有走廊；2F 為東側走廊 (+X)，西側 (-X) 為小陽台開放空間
      const roomW = b.w - corrSize * 2;
      const corrCenterXE = b.w / 2 - corrSize / 2;
      const corrCenterXW = -b.w / 2 + corrSize / 2;
      const wallFaceXE = b.w / 2 - corrSize;
      const wallFaceXW = -b.w / 2 + corrSize;
      const outerEdgeXE = b.w / 2;
      const outerEdgeXW = -b.w / 2;

      // 1. 中央教室量體 (1F & 2F，南端留出 1.8m 作為 D 棟南側迴轉樓梯上至 2F 後右前方偏轉進入 D 棟 2F 走廊之玄關平台)
      const roomSouthZ = b.d / 2 - 1.85;
      const roomLenD = roomSouthZ - (-b.d / 2);
      const roomCenterZD = (-b.d / 2 + roomSouthZ) / 2;
      const body = new THREE.Mesh(new THREE.BoxGeometry(roomW, totalH, roomLenD), wallMat);
      body.position.set(0, totalH / 2, roomCenterZD);
      body.castShadow = true; body.receiveShadow = true;
      body.userData.isBuildingBody = true;
      group.add(body);
      colliders.push({ b, lxMin: -roomW / 2, lxMax: roomW / 2, lzMin: -b.d / 2, lzMax: roomSouthZ, floors: "both" });

      // 2. 1F 東西側走廊樓板 + 2F 東側走廊樓板（北端延伸 2.2m 與 B 棟 1F/2F 走廊無縫銜接；南端包含樓梯口轉折平台）
      const northExtD = 2.2;
      const corrTotalD = b.d + northExtD;
      const corrCenterZD = -northExtD / 2;
      const f1FloorE = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.12, corrTotalD), floorMat);
      f1FloorE.position.set(corrCenterXE, 0.06, corrCenterZD);
      f1FloorE.receiveShadow = true;
      const f1FloorW = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.12, b.d), floorMat);
      f1FloorW.position.set(corrCenterXW, 0.06, 0);
      f1FloorW.receiveShadow = true;
      const f1SouthLanding = new THREE.Mesh(new THREE.BoxGeometry(roomW + corrSize, 0.12, 1.95), floorMat);
      f1SouthLanding.position.set(corrSize / 2, 0.06, b.d / 2 - 0.92);
      const f2FloorE = new THREE.Mesh(new THREE.BoxGeometry(corrSize, 0.22, corrTotalD), floorMat);
      f2FloorE.position.set(corrCenterXE, fh - 0.05, corrCenterZD);
      f2FloorE.castShadow = true; f2FloorE.receiveShadow = true;
      const f2SouthLanding = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.22, 1.95), floorMat);
      f2SouthLanding.position.set(wallFaceXE - 0.98, fh - 0.05, b.d / 2 - 0.92);
      const roofW = roomW + corrSize + 0.6;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.42, corrTotalD + 4.2), roofMat);
      roof.position.set(corrSize / 2, totalH + 0.21, 0.8);
      roof.castShadow = true; roof.receiveShadow = true;
      group.add(f1FloorE, f1FloorW, f1SouthLanding, f2FloorE, f2SouthLanding, roof);

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
        colliders.push({ b, lxMin: outerEdgeXE - 0.32, lxMax: outerEdgeXE - 0.08, lzMin: cz - 0.20, lzMax: cz + 0.20, floors: "both", isPillar: true });
        colliders.push({ b, lxMin: outerEdgeXW + 0.08, lxMax: outerEdgeXW + 0.32, lzMin: cz - 0.20, lzMax: cz + 0.20, floors: "1", isPillar: true });
      }

      // 2F 東側走廊全段外側女兒牆防護（北端精準對齊 B 棟 2F 走廊南側女兒牆轉角 lz = -b.d/2 - 0.55，徹底消除伸入 B 棟 2F 走廊之突出女兒牆且轉角不留缺口）
      const rz0 = -b.d / 2 - 0.55;
      const rz1 = b.d / 2;
      const rd = rz1 - rz0;
      const parapetE = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, rd), wallMat);
      parapetE.position.set(outerEdgeXE - 0.1, fh + 0.42, (rz0 + rz1) / 2);
      const topRailE = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, rd), railMat);
      topRailE.position.set(outerEdgeXE - 0.1, fh + 1.05, (rz0 + rz1) / 2);
      group.add(parapetE, topRailE);
      colliders.push({ b, lxMin: outerEdgeXE - 0.25, lxMax: outerEdgeXE + 0.25, lzMin: rz0, lzMax: rz1, floors: "2" });

      // D 棟 2F 樓梯出口左側（西側 lx = 1.00，與樓梯西側牆體同一平面）連續實牆＋狹小儲物間門（無多餘女兒牆或扶手），
      // 以及東半段第一梯段上方臨空側（lx: 3.05..outerEdgeXE, lz = b.d/2 - 0.08）女兒牆防護
      const dStairWallLen = b.d / 2 - roomSouthZ;
      const dStairWallMidZ = (roomSouthZ + b.d / 2) / 2;
      const dStorageWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, fh, dStairWallLen), wallMat);
      dStorageWall.position.set(1.00, fh + fh / 2, dStairWallMidZ);
      dStorageWall.castShadow = true; dStorageWall.receiveShadow = true;
      const dStorageDoor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.05, 0.82), new THREE.MeshLambertMaterial({ color: 0x64748b }));
      dStorageDoor.position.set(1.06, fh + 1.025, dStairWallMidZ);
      group.add(dStorageWall, dStorageDoor);
      colliders.push({ b, lxMin: 0.88, lxMax: 1.08, lzMin: roomSouthZ, lzMax: b.d / 2 + 0.05, floors: "2" });

      const dSouthDropW = outerEdgeXE - 3.05;
      const dSouthDropMidX = (3.05 + outerEdgeXE) / 2;
      const dSouthDropParapet = new THREE.Mesh(new THREE.BoxGeometry(dSouthDropW, 0.85, 0.16), wallMat);
      dSouthDropParapet.position.set(dSouthDropMidX, fh + 0.42, b.d / 2 - 0.08);
      const dSouthDropRail = new THREE.Mesh(new THREE.BoxGeometry(dSouthDropW, 0.06, 0.08), railMat);
      dSouthDropRail.position.set(dSouthDropMidX, fh + 1.05, b.d / 2 - 0.08);
      group.add(dSouthDropParapet, dSouthDropRail);
      colliders.push({ b, lxMin: 3.05, lxMax: outerEdgeXE + 0.1, lzMin: b.d / 2 - 0.22, lzMax: b.d / 2 + 0.12, floors: "2" });

      // 7. D 棟南側盡頭迴轉樓梯（各段 1.8m，南側迴轉平台與 A 棟西側樓梯直接連通無女兒牆隔斷）
      addUTurnStaircase(group, b, walkZones, colliders, {
        lx0: 0.95, lx1: 4.55,
        lz0: b.d / 2 - 0.05, lz1: b.d / 2 + 3.65,
        y0: 0.08, y1: fh, dir1: "+z", turn: "right",
        f1Width: 1.8, f2Width: 1.8, noBackWall: true
      });

      addCorridorWallDetails(group, b.d, wallFaceXE, "z", 1, b.floors, fh, accentMat, null, b);
      // D 棟西側牆面（1F & 2F）：改為跟 D 棟東側牆面一樣皆有半透明玻璃窗
      addBackWallWindows(group, "z", wallFaceXW, -1, b.floors, fh, [-5.6, -2.0, 2.0, 5.6], 2.3);

      // 註冊 2F 東側走廊（含北端銜接 B 棟段與南端樓梯出口右偏轉平台）與西側小陽台可行走平面
      walkZones.push({
        b,
        lxMin: 1.05, lxMax: outerEdgeXE + 0.3,
        lzMin: -b.d / 2 - northExtD - 0.6, lzMax: b.d / 2 - 0.08,
        y0: fh, y1: fh, rampAxis: null
      });
      walkZones.push({
        b,
        lxMin: outerEdgeXW - 0.2, lxMax: wallFaceXW + 0.4,
        lzMin: -balcD / 2 + 0.2, lzMax: balcD / 2 - 0.2,
        y0: fh, y1: fh, rampAxis: null
      });
    }

    // A 棟特色：向外（南側 +Z）突出於走廊之外的紅磚正門穿堂牌樓（磚樓 lz: b.d/2 .. b.d/2 + 4.50）
    if (b.id === "bldg_a") {
      const portalX = (b.passages && b.passages[0]) ? b.passages[0].localX : 0.37;
      const pFrontZ = b.d / 2 + 4.50;
      const pDepth = 4.80;
      const pMidZ = b.d / 2 + pDepth / 2;
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

      // 外突磚樓 1F/2F 玄關樓板、屋頂與東西兩側紅磚外牆（包覆玄關雙折樓梯，樓梯北牆直接作為永續角與閱讀角後牆，無多餘隔牆或空隙）
      const pFloor1 = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.12, pDepth), floorMat);
      pFloor1.position.set(portalX, 0.06, pMidZ);
      const pFloor2 = new THREE.Mesh(new THREE.BoxGeometry(13.0, 0.22, 0.42), floorMat);
      pFloor2.position.set(portalX, fh - 0.05, b.d / 2 + 0.18);
      const pFloor2Mid = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.22, pDepth), floorMat);
      pFloor2Mid.position.set(portalX, fh - 0.05, pMidZ);
      const pRoof = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.42, pDepth + 0.55), roofMat);
      pRoof.position.set(portalX, totalH + 0.21, pMidZ);
      group.add(pFloor1, pFloor2, pFloor2Mid, pRoof);

      // A 棟中間玄關樓梯走上 2F 後之兩側與中央平台四周女兒牆保護（直接對齊樓梯北牆 lz = b.d/2 + 0.35，僅留出左右雙折樓梯 2F 出口）
      function addPortal2FParapet(x0, z0, x1, z1) {
        const isX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
        const len = isX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
        if (len < 0.15) return;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const p = new THREE.Mesh(new THREE.BoxGeometry(isX ? len : 0.16, 0.88, isX ? 0.16 : len), wallMat);
        p.position.set(cx, fh + 0.44, cz);
        const r = new THREE.Mesh(new THREE.BoxGeometry(isX ? len : 0.08, 0.06, isX ? 0.08 : len), railMat);
        r.position.set(cx, fh + 1.05, cz);
        group.add(p, r);
        colliders.push({
          b,
          lxMin: Math.min(x0, x1) - 0.18,
          lxMax: Math.max(x0, x1) + 0.18,
          lzMin: Math.min(z0, z1) - 0.18,
          lzMax: Math.max(z0, z1) + 0.18,
          floors: "2"
        });
      }
      // 1. 2F 走廊南緣與玄關左右樓梯北牆共面之女兒牆 (lz = b.d/2 + 0.35) 及兩端回折接回 A 棟 2F 走廊女兒牆
      addPortal2FParapet(-6.30, b.d / 2, -6.30, b.d / 2 + 0.35);
      addPortal2FParapet(-6.30, b.d / 2 + 0.35, portalX - 2.55, b.d / 2 + 0.35);
      addPortal2FParapet(portalX + 2.55, b.d / 2 + 0.35, 7.00, b.d / 2 + 0.35);
      addPortal2FParapet(7.00, b.d / 2, 7.00, b.d / 2 + 0.35);
      // 2. 玄關 2F 中央平台左右兩側緊鄰第一段下樓梯井之女兒牆（依「A棟中央玄關樓梯上二樓女兒牆不要超出扶手位置.png」指示：起點退至樓梯中央中分線 lz = b.d/2 + 2.20 後方，絕不超出扶手佔到樓梯行經動線）與南側正門上方女兒牆
      addPortal2FParapet(portalX - 2.52, b.d / 2 + 2.20, portalX - 2.52, pFrontZ - 0.15);
      addPortal2FParapet(portalX + 2.52, b.d / 2 + 2.20, portalX + 2.52, pFrontZ - 0.15);
      addPortal2FParapet(portalX - 2.52, pFrontZ - 0.15, portalX + 2.52, pFrontZ - 0.15);
      // 左右兩側樓梯端牆（西側與東側樓梯向下/向上走面對之牆面）：改為「乳白色 3D 鋁格柵 ＋ 透明 PC 板」，可透視看到外側校園景致
      const louverMat = new THREE.MeshLambertMaterial({ color: 0xf7f4eb }); // 乳白色鋁格柵材質
      const pcBoardMat = new THREE.MeshPhongMaterial({
        color: 0xeef7ff,
        specular: 0xffffff,
        shininess: 95,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const screenZ0 = b.d / 2 + 0.28;
      const screenZ1 = pFrontZ - 0.25;
      const screenSpanZ = screenZ1 - screenZ0;
      const screenMidZ = (screenZ0 + screenZ1) / 2;
      [-6.56, 6.56].forEach(sx => {
        const wallX = portalX + sx;
        const outSign = sx < 0 ? -1 : 1;

        // 1. 外側透明 PC 防雨採光板（覆蓋整面，小人於室內可清晰透視看到外側樹木與校園景致）
        const pcPanel = new THREE.Mesh(new THREE.BoxGeometry(0.02, totalH - 0.12, screenSpanZ), pcBoardMat);
        pcPanel.position.set(wallX + outSign * 0.06, totalH / 2, screenMidZ);
        group.add(pcPanel);

        // 2. 乳白色鋁合金四周結構外框與垂直主柱、水平粗格柵橫挺（依實景僅保留粗格柵主框骨架，去除細格柵條）
        const frameThick = 0.08;
        const topH = new THREE.Mesh(new THREE.BoxGeometry(frameThick, 0.08, screenSpanZ), louverMat);
        topH.position.set(wallX, totalH - 0.04, screenMidZ);
        const botH = new THREE.Mesh(new THREE.BoxGeometry(frameThick, 0.08, screenSpanZ), louverMat);
        botH.position.set(wallX, 0.04, screenMidZ);
        const midFloorH = new THREE.Mesh(new THREE.BoxGeometry(frameThick, 0.10, screenSpanZ), louverMat);
        midFloorH.position.set(wallX, fh, screenMidZ);
        group.add(topH, botH, midFloorH);

        // 水平粗格柵結構橫挺（依實況現況僅保留粗格柵主框骨架，拿掉中間 3 枝細格柵條，確保明朗通透）
        [screenZ0 + 0.04, screenZ0 + screenSpanZ * 0.33, screenZ0 + screenSpanZ * 0.67, screenZ1 - 0.04].forEach(cz => {
          const vCol = new THREE.Mesh(new THREE.BoxGeometry(frameThick, totalH - 0.08, 0.08), louverMat);
          vCol.position.set(wallX, totalH / 2, cz);
          group.add(vCol);
        });

        colliders.push({
          b,
          lxMin: wallX - 0.18,
          lxMax: wallX + 0.18,
          lzMin: screenZ0 - 0.1,
          lzMax: screenZ1 + 0.1,
          floors: "both"
        });
      });

      // 左右兩側整高紅磚主牆柱 (1F+2F，位於外突磚樓最南端立面 pFrontZ)
      [-4.45, 4.45].forEach(ox => {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(3.9, totalH, 0.55), brickMat);
        pier.position.set(portalX + ox, totalH / 2, pFrontZ);
        pier.castShadow = true;
        group.add(pier);
        colliders.push({ b, lxMin: portalX + ox - 1.95, lxMax: portalX + ox + 1.95, lzMin: pFrontZ - 0.3, lzMax: pFrontZ + 0.3, floors: "both" });
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
        new THREE.BoxGeometry(13.2, 0.72, 0.75),
        [whiteTileMat, whiteTileMat, whiteTileMat, whiteTileMat, new THREE.MeshLambertMaterial({ map: topBeamTex }), whiteTileMat]
      );
      topBeam.position.set(portalX, totalH + 0.05, pFrontZ);
      topBeam.castShadow = true;
      group.add(topBeam);

      // 四根白色立柱框邊（左右外側 + 中央門洞兩側，貫穿 1F/2F）
      [-6.4, -2.5, 2.5, 6.4].forEach(px => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, totalH, 0.72), whiteTileMat);
        post.position.set(portalX + px, totalH / 2, pFrontZ);
        post.castShadow = true;
        group.add(post);
      });

      // 1F 門楣白框與電子跑馬燈
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.44, 0.72), whiteTileMat);
      lintel.position.set(portalX, fh - 0.16, pFrontZ);
      group.add(lintel);
      const ledTex = makeSignTexture(512, 64, (ctx, w, h) => {
        ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fde047"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("★ 歡迎蒞臨雲林縣溪洲國小 115 學年度校慶 ★", w / 2, 41);
      });
      const ledSign = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.36, 0.08), new THREE.MeshBasicMaterial({ map: ledTex }));
      ledSign.position.set(portalX, fh - 0.22, pFrontZ + 0.38);
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
      const banner = new THREE.Mesh(new THREE.BoxGeometry(4.65, 1.0, 0.12), new THREE.MeshLambertMaterial({ map: bannerTex }));
      banner.position.set(portalX, fh + 0.65, pFrontZ + 0.34);
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
      badgeL.position.set(portalX - 4.45, totalH * 0.65, pFrontZ + 0.32);
      const badgeR = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.3, 0.1), new THREE.MeshLambertMaterial({ map: rightBadgeTex }));
      badgeR.position.set(portalX + 4.45, totalH * 0.65, pFrontZ + 0.32);
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
      noticeBoard.position.set(portalX + 4.45, 2.05, pFrontZ + 0.34);
      group.add(noticeBoard);

      // 左右各 3 座白綠陶瓷花盆
      const potBodyMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
      const potRimMat = new THREE.MeshLambertMaterial({ color: 0x16a34a });
      [-5.6, -4.45, -3.3, 3.3, 4.45, 5.6].map(ox => portalX + ox).forEach(px => {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.45, 10), potBodyMat);
        pot.position.set(px, 0.22, pFrontZ + 0.55);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.25, 0.12, 10), potRimMat);
        rim.position.set(px, 0.44, pFrontZ + 0.55);
        group.add(pot, rim);
      });

      addSolarPanels(group, b.w, b.d, totalH + 0.45, 2, 16, 2.5, 1.2);
    }

    if (b.id === "bldg_b") {
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

    // 繪製東南側小籃球練習場 (東西座向，東西兩端皆有禁區與籃球架)
    const mx = 545, my = 720, mw = 400, ml = 210;
    ctx.fillStyle = "#3a7d52";
    ctx.fillRect(mx, my, mw, ml);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(mx, my, mw, ml);
    ctx.beginPath();
    ctx.moveTo(mx + mw / 2, my); ctx.lineTo(mx + mw / 2, my + ml);
    ctx.stroke();
    ctx.fillStyle = "#9e3b33";
    ctx.fillRect(mx, my + (ml - 70) / 2, 80, 70);
    ctx.strokeRect(mx, my + (ml - 70) / 2, 80, 70);
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
    // 東南側小籃球場西側端與東側端各一組籃球架（底線置中對齊端線與禁區中央）
    const smallCourtMidZ = 12.50;
    addHoop(1.25, smallCourtMidZ, Math.PI / 2);
    addHoop(22.82, smallCourtMidZ, -Math.PI / 2);

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

  // 築夢溪洲司令台 (依「影片/彩繪司令台的周邊動態畫面.mov」精準建模：背牆向左右兩側延伸至台階外緣、四階彩虹台階緊鄰背牆與台座，且可沿台階走上司令台上方站立)
  function buildStage(b, colliders, walkZones) {
    const group = new THREE.Group();
    const stageH = 1.0;
    const stepColors = [0x9333ea, 0x22c55e, 0xf97316, 0xef4444]; // 紫 -> 綠 -> 橘 -> 紅 四階彩虹梯
    const stepDepthX = 0.40;
    const stepWidthZ = 1.05;
    const stairSpanX = stepColors.length * stepDepthX; // 1.60m
    const backWallThick = 0.42;
    const backWallX = b.w / 2 - backWallThick / 2;
    // 台階後段平台 (topLanding) 與四階彩虹階梯位於司令台東後段，緊貼延伸之彩繪背牆與主台座側面
    const topLandDepthX = 1.05;
    const stairEndX = b.w / 2 - backWallThick - topLandDepthX;
    const stairStartX = stairEndX - stairSpanX;
    const totalFullD = b.d + stepWidthZ * 2;

    const blueMat = new THREE.MeshLambertMaterial({ color: 0x38bdf8 });
    const ledgeMat = new THREE.MeshLambertMaterial({ color: 0x7dd3fc });
    // 主舞台台座
    const base = new THREE.Mesh(new THREE.BoxGeometry(b.w, stageH, b.d), blueMat);
    base.position.y = stageH / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    // 前緣與兩側淺藍女兒矮唇台度 (高出舞台面 0.16m，上方擺放花盆)
    const frontLip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, b.d), ledgeMat);
    frontLip.position.set(-b.w / 2 + 0.14, stageH + 0.08, 0);
    group.add(base, frontLip);

    // 舞台正面 3D 立體彩色圓球與泡泡裝飾
    const decorSpheres = [
      [-2.1, 0.48, 0.26, 0x22c55e],
      [-0.6, 0.50, 0.36, 0xdc2626],
      [1.1, 0.46, 0.32, 0xfacc15],
      [2.4, 0.52, 0.22, 0x22c55e]
    ];
    decorSpheres.forEach(([dz, dy, r, col]) => {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 14), new THREE.MeshLambertMaterial({ color: col }));
      sp.scale.set(0.35, 1, 1);
      sp.position.set(-b.w / 2 - 0.02, dy, dz);
      group.add(sp);
    });

    // 屋頂延伸涵蓋兩側彩虹階梯與延伸背牆
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 0.8, 0.32, totalFullD + 0.4),
      new THREE.MeshLambertMaterial({ color: hexColor(b.colors.roof) })
    );
    roof.position.y = b.floorHeight;
    roof.castShadow = true;
    group.add(roof);

    // 黃色雙立柱（上方帶綠葉彩繪環，並註冊實體碰撞，防止小人於司令台上方穿模走入立柱內）
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
    const vineMat = new THREE.MeshLambertMaterial({ color: 0x4d7c0f });
    [-b.d / 2 + 0.45, b.d / 2 - 0.45].forEach(pz => {
      const px = -b.w / 2 + 0.45;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, b.floorHeight - stageH, 12), pillarMat);
      p.position.set(px, stageH + (b.floorHeight - stageH) / 2, pz);
      p.castShadow = true;
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.55, 12), vineMat);
      vine.position.set(px, b.floorHeight - 0.42, pz);
      group.add(p, vine);
      if (colliders) {
        colliders.push({
          b,
          lxMin: px - 0.26,
          lxMax: px + 0.26,
          lzMin: pz - 0.26,
          lzMax: pz + 0.26,
          floors: "both",
          isPillar: true
        });
      }
    });

    // 彩繪背牆向左右（南北）兩側延伸至兩側台階外緣 (totalFullD)，讓台階緊鄰牆面與台座
    const muralTex = makeSignTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = "#86efac"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#4ade80";
      ctx.beginPath(); ctx.arc(110, 240, 95, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#facc15";
      ctx.beginPath(); ctx.arc(260, 245, 85, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath(); ctx.arc(410, 240, 90, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#ef4444"; ctx.fillRect(35, 105, 65, 105);
      ctx.fillStyle = "#fde047"; ctx.fillRect(35, 105, 65, 24);
      ctx.fillStyle = "#f97316"; ctx.fillRect(412, 110, 62, 100);
      ctx.fillStyle = "#fef08a"; ctx.fillRect(412, 110, 62, 22);
      ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.arc(195, 130, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(178, 158, 34, 62);
      ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(315, 126, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(298, 154, 34, 64);
      ctx.fillStyle = "#065f46"; ctx.font = "bold 36px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("築夢溪洲", w / 2, 54);
    });
    const plainWallMat = new THREE.MeshLambertMaterial({ color: 0xd1fae5 });
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(backWallThick, b.floorHeight - stageH, totalFullD),
      [plainWallMat, new THREE.MeshLambertMaterial({ map: muralTex }), plainWallMat, plainWallMat, plainWallMat, plainWallMat]
    );
    back.position.set(backWallX, stageH + (b.floorHeight - stageH) / 2, 0);
    back.castShadow = true;
    // 背牆下方延伸至兩側台階後方之基座牆體
    const backBase = new THREE.Mesh(new THREE.BoxGeometry(backWallThick, stageH, totalFullD), blueMat);
    backBase.position.set(backWallX, stageH / 2, 0);
    group.add(back, backBase);

    // 司令台南北兩側四階彩虹階梯 + 頂部踏入平台 + 側邊矮護牆與後方不鏽鋼護欄（緊貼台座與延伸背牆，無縫可走上司令台）
    const railMetalMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    [-1, 1].forEach(sideZ => {
      const sz = sideZ * (b.d / 2 + stepWidthZ / 2);
      // 階梯前段至舞台前緣之側邊延伸台度
      const frontSideLen = stairStartX - (-b.w / 2);
      if (frontSideLen > 0.2) {
        const sideLip = new THREE.Mesh(new THREE.BoxGeometry(frontSideLen, 0.16, 0.24), ledgeMat);
        sideLip.position.set(-b.w / 2 + frontSideLen / 2, stageH + 0.08, sideZ * (b.d / 2 - 0.12));
        group.add(sideLip);
      }

      // 階梯頂部銜接舞台之藍底平台 (stairEndX .. b.w/2 - backWallThick)
      const topLand = new THREE.Mesh(new THREE.BoxGeometry(topLandDepthX, stageH, stepWidthZ), blueMat);
      topLand.position.set(stairEndX + topLandDepthX / 2, stageH / 2, sz);
      topLand.castShadow = true;
      topLand.receiveShadow = true;
      // 階梯外側淺藍斜矮牆與後方不鏽鋼欄杆（比照實景影片 00:15~00:23）
      const sideCheek = new THREE.Mesh(new THREE.BoxGeometry(stairSpanX + topLandDepthX, stageH * 0.55, 0.12), blueMat);
      sideCheek.position.set(stairStartX + (stairSpanX + topLandDepthX) / 2, stageH * 0.275, sideZ * (b.d / 2 + stepWidthZ - 0.06));
      const guardRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, stepWidthZ), railMetalMat);
      guardRail.position.set(b.w / 2 - backWallThick - 0.05, stageH + 0.42, sz);
      group.add(topLand, sideCheek, guardRail);

      stepColors.forEach((sc, i) => {
        const sh = (stageH / stepColors.length) * (i + 1);
        const sx = stairStartX + (i + 0.5) * stepDepthX;
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(stepDepthX, sh, stepWidthZ),
          new THREE.MeshLambertMaterial({ color: sc })
        );
        step.position.set(sx, sh / 2, sz);
        step.castShadow = true;
        step.receiveShadow = true;
        group.add(step);
      });

      // 註冊南北兩側彩虹台階斜坡行走區 (自西 stairStartX 往東 stairEndX 拾級而上至 y = stageH)
      if (walkZones) {
        walkZones.push({
          b,
          lxMin: stairStartX - 0.25,
          lxMax: stairEndX + 0.15,
          lzMin: Math.min(sideZ * (b.d / 2 - 0.15), sideZ * (b.d / 2 + stepWidthZ + 0.1)),
          lzMax: Math.max(sideZ * (b.d / 2 - 0.15), sideZ * (b.d / 2 + stepWidthZ + 0.1)),
          y0: 0.08,
          y1: stageH + 0.02,
          rampAxis: "x"
        });
      }
    });

    // 註冊司令台上方整個舞台平面與兩側頂部平台之可行走區 (y = stageH + 0.02 = 1.02m)，讓小人可走上司令台上方站立
    if (walkZones) {
      walkZones.push({
        b,
        lxMin: -b.w / 2 + 0.25,
        lxMax: b.w / 2 - backWallThick - 0.15,
        lzMin: -b.d / 2 - stepWidthZ,
        lzMax: b.d / 2 + stepWidthZ,
        y0: stageH + 0.02,
        y1: stageH + 0.02,
        rampAxis: null
      });
    }

    // 註冊司令台背牆與前緣碰撞（留出兩側彩虹台階入口，使小人只能從兩側台階上下司令台，不會直接穿過正面高台牆）
    if (colliders) {
      // 東側彩繪背牆阻擋
      colliders.push({ b, lxMin: b.w / 2 - backWallThick - 0.1, lxMax: b.w / 2 + 0.1, lzMin: -totalFullD / 2, lzMax: totalFullD / 2, floors: "both" });
      // 西側正面前緣高台阻擋
      colliders.push({ b, lxMin: -b.w / 2 - 0.15, lxMax: -b.w / 2 + 0.22, lzMin: -b.d / 2, lzMax: b.d / 2, floors: "both" });
      // 南北兩側前段（台階入口以西）高台側緣阻擋
      colliders.push({ b, lxMin: -b.w / 2, lxMax: stairStartX - 0.1, lzMin: -b.d / 2 - 0.15, lzMax: -b.d / 2 + 0.18, floors: "both" });
      colliders.push({ b, lxMin: -b.w / 2, lxMax: stairStartX - 0.1, lzMin: b.d / 2 - 0.18, lzMax: b.d / 2 + 0.15, floors: "both" });
    }

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

    // 正面 (+Z) 校名主牌（僅單面 PlaneGeometry 朝向 +Z 校門口，背面不可見，學校名稱加粗字體白邊）
    const titleTex = makeSignTexture(512, 160, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.font = "bold 62px serif"; ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 16;
      ctx.strokeText("溪洲國民小學", w / 2, 74);
      ctx.strokeStyle = "#1e3a8a"; ctx.lineWidth = 6;
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

    // 球場側綠色網格圍籬（依指示中央打開 3.4 米通道，讓小人可自由靠近香蕉園與落葉堆肥樹穴）
    const fenceMat = new THREE.MeshLambertMaterial({ color: 0x16a34a, transparent: true, opacity: 0.72 });
    const wingW = (b.w - 3.4) / 2;
    [-b.w / 2 + wingW / 2, b.w / 2 - wingW / 2].forEach(fx => {
      const fencePart = new THREE.Mesh(new THREE.BoxGeometry(wingW, 1.35, 0.08), fenceMat);
      fencePart.position.set(fx, 0.7, -b.d / 2 + 0.06);
      group.add(fencePart);
    });

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

  // 網球主題廁所 (A 棟西端相連一體之主題建築，南側外牆與 A 棟六甲六乙南側外牆同線連成一體，南側 1F 走廊往西直通操場跑道並設外側階梯)
  function buildToilet(b, colliders, walkZones) {
    const group = new THREE.Group();
    const fh = b.floorHeight;
    const corrSize = 3.1;
    const roomD = b.d - corrSize;
    const roomCenterZ = -corrSize / 2;
    const wallFaceZ = b.d / 2 - corrSize;
    const corrCenterZ = b.d / 2 - corrSize / 2;

    // 1. 1F 網球主題廁所 & 2F 性別平等廁所（西側牆體為同一道外牆，東側牆體緊鄰 A 棟西側樓梯，北緣與 A 棟齊平）
    const totalH = (b.floors || 2) * fh;
    const toiletW = b.w;
    const body1F = new THREE.Mesh(
      new THREE.BoxGeometry(toiletW, fh, roomD),
      new THREE.MeshLambertMaterial({ color: hexColor(b.colors.wall, "#FEF08A") })
    );
    body1F.position.set(0, fh / 2, roomCenterZ);
    body1F.castShadow = true; body1F.receiveShadow = true;
    body1F.userData.isBuildingBody = true;

    const body2F = new THREE.Mesh(
      new THREE.BoxGeometry(toiletW, fh, roomD),
      new THREE.MeshLambertMaterial({ color: 0xf2eae1 })
    );
    body2F.position.set(0, fh + fh / 2, roomCenterZ);
    body2F.castShadow = true; body2F.receiveShadow = true;
    body2F.userData.isBuildingBody = true;
    group.add(body1F, body2F);

    if (colliders) {
      colliders.push({ b, lxMin: -b.w / 2, lxMax: b.w / 2, lzMin: -b.d / 2, lzMax: wallFaceZ, floors: "both" });
    }

    // 1F 網球主題廁所朝南走廊側門面、網球裝飾與立體球體標誌
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 2.25, 0.14),
      new THREE.MeshLambertMaterial({ color: 0x334155 })
    );
    door.position.set(0.45, 1.12, wallFaceZ + 0.06);
    group.add(door);

    const signBand = new THREE.Mesh(
      new THREE.BoxGeometry(toiletW - 0.4, 0.55, 0.12),
      new THREE.MeshLambertMaterial({ color: hexColor(b.colors.accent, "#84CC16") })
    );
    signBand.position.set(0, fh - 0.55, wallFaceZ + 0.06);
    group.add(signBand);

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 16, 16),
      new THREE.MeshLambertMaterial({ color: 0xa3e635 })
    );
    ball.position.set(-1.05, 2.55, wallFaceZ + 0.35);
    group.add(ball);

    // 2F 性別平等廁所朝南走廊門面與門牌
    const door2F = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 2.20, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x0f766e })
    );
    door2F.position.set(0.35, fh + 1.10, wallFaceZ + 0.05);
    const plaque2F = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.30, 0.06),
      createDoorPlaqueMaterial("Wc 2", "性別友善廁所")
    );
    plaque2F.position.set(0.35, fh + 2.48, wallFaceZ + 0.08);
    plaque2F.userData.isSign = true;
    plaque2F.userData.roomPlaque = {
      code: "Wc 2",
      name: "性別友善廁所",
      floorY: fh,
      frameLocal: [0.35, wallFaceZ + 0.08],
      normal: [0, 1]
    };
    group.add(door2F, plaque2F);

    // 西側外牆面對操場之採光玻璃窗（1F + 2F）
    const winMat = new THREE.MeshPhongMaterial({ color: 0x818cf8, transparent: true, opacity: 0.5, shininess: 80 });
    [0, fh].forEach(wyOff => {
      [-1.2, 1.2].forEach(wz => {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 1.8), winMat);
        win.position.set(-b.w / 2 - 0.02, wyOff + 2.1, roomCenterZ + wz);
        group.add(win);
      });
    });

    // 2. 南側貫穿走廊（1F 地板 + 2F 走廊樓板 + 2F 女兒牆與欄杆 + 屋頂 + 外緣柱，與 A 棟 1F/2F 無縫連通）
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xe7e0d6 });
    const roofMat = new THREE.MeshLambertMaterial({ color: hexColor(b.colors.roof, "#78A07C") });
    const railMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const wall2FMat = new THREE.MeshLambertMaterial({ color: 0xf2eae1 });
    const f1Floor = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, 0.12, corrSize),
      floorMat
    );
    f1Floor.position.set(0, 0.06, corrCenterZ);
    f1Floor.receiveShadow = true;

    const f2Floor = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, 0.22, corrSize),
      floorMat
    );
    f2Floor.position.set(0, fh - 0.05, corrCenterZ);
    f2Floor.castShadow = true; f2Floor.receiveShadow = true;

    // 2F 走廊南緣與西端女兒牆與欄杆（東側開放無縫接 A 棟 2F 走廊）
    const f2ParapetS = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.85, 0.16), wall2FMat);
    f2ParapetS.position.set(0, fh + 0.42, b.d / 2 - 0.1);
    const f2RailS = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.06, 0.08), railMat);
    f2RailS.position.set(0, fh + 1.05, b.d / 2 - 0.1);

    const f2ParapetW = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, corrSize), wall2FMat);
    f2ParapetW.position.set(-b.w / 2 + 0.1, fh + 0.42, corrCenterZ);
    const f2RailW = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, corrSize), railMat);
    f2RailW.position.set(-b.w / 2 + 0.1, fh + 1.05, corrCenterZ);

    if (colliders) {
      colliders.push({ b, lxMin: -b.w / 2, lxMax: b.w / 2, lzMin: b.d / 2 - 0.25, lzMax: b.d / 2 + 0.25, floors: "2" });
      colliders.push({ b, lxMin: -b.w / 2 - 0.2, lxMax: -b.w / 2 + 0.25, lzMin: wallFaceZ, lzMax: b.d / 2, floors: "2" });
    }

    // 屋頂（覆蓋 2F 性別平等廁所與走廊上方，與 A 棟屋頂齊平連成一線）
    const fullRoof = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 0.4, 0.42, b.d + 0.4),
      roofMat
    );
    fullRoof.position.set(0, totalH + 0.21, 0);
    fullRoof.castShadow = true; fullRoof.receiveShadow = true;
    group.add(f1Floor, f2Floor, f2ParapetS, f2RailS, f2ParapetW, f2RailW, fullRoof);

    // 走廊南緣立柱（1F+2F 貫通，對齊 A 棟南側走廊立柱線，南側外牆完全連成一線）
    const pillarMat = new THREE.MeshLambertMaterial({ color: hexColor(b.colors.wall, "#FEF08A") });
    [-b.w / 2 + 0.35].forEach(px => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.32, totalH, 0.32), pillarMat);
      col.position.set(px, totalH / 2, b.d / 2 - 0.2);
      col.castShadow = true;
      group.add(col);
      if (colliders) {
        colliders.push({ b, lxMin: px - 0.20, lxMax: px + 0.20, lzMin: b.d / 2 - 0.35, lzMax: b.d / 2 - 0.05, floors: "both", isPillar: true });
      }
    });

    // 3. 西側外側樓梯（自走廊階梯拾級而下面對操場跑道方向）
    const stepMat = new THREE.MeshLambertMaterial({ color: 0xd6d3d1 });
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.08, corrSize), stepMat);
    step1.position.set(-b.w / 2 - 0.20, 0.04, corrCenterZ);
    step1.receiveShadow = true;
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.04, corrSize + 0.2), stepMat);
    step2.position.set(-b.w / 2 - 0.58, 0.02, corrCenterZ);
    step2.receiveShadow = true;
    group.add(step1, step2);

    if (walkZones) {
      // 1F 走廊
      walkZones.push({
        b,
        lxMin: -b.w / 2 - 0.9, lxMax: b.w / 2 + 0.5,
        lzMin: wallFaceZ, lzMax: b.d / 2 + 0.2,
        y0: 0.08, y1: 0.08, rampAxis: null
      });
      // 2F 性別平等廁所前方走廊
      walkZones.push({
        b,
        lxMin: -b.w / 2 + 0.2, lxMax: b.w / 2 + 0.5,
        lzMin: wallFaceZ - 0.05, lzMax: b.d / 2 + 0.15,
        y0: fh, y1: fh, rampAxis: null
      });
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

      // 牆面 3D 白色窗框與半透明玻璃窗
      const winFrameMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
      [-3.3, 0.2].forEach(wz => {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.05, 2.8), winFrameMat);
        frame.position.set(b.w / 2 - 0.16, 2.35, wz);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.85, 2.55), sharedGlassMat);
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
      // 東中庭南北向 3D 童趣彩繪遊戲地坪（參照空拍視頻 scratch/mural_aerial_05~15 重建）
      const cw = 1024, ch = 2048;
      const muralTex = makeSignTexture(cw, ch, (ctx, w, h) => {
        // 基底柔和天空水藍
        ctx.fillStyle = "#38bdf8"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#bae6fd"; ctx.fillRect(16, 16, w - 32, h - 32);

        // --- 1. 南端 (y: 1580..2020)：3D 懸浮鋼琴白黑鍵與投射立體陰影 ---
        ctx.fillStyle = "rgba(15, 23, 42, 0.28)";
        ctx.fillRect(w * 0.12, 1660, w * 0.76, 310);
        const keyCount = 14;
        const kw = (w * 0.74) / keyCount;
        for (let k = 0; k < keyCount; k++) {
          const kx = w * 0.13 + k * kw;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(kx, 1640, kw - 4, 300);
          ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 3;
          ctx.strokeRect(kx, 1640, kw - 4, 300);
          ctx.fillStyle = "rgba(203, 213, 225, 0.45)";
          ctx.fillRect(kx, 1910, kw - 4, 30);
        }
        const blackIndices = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12];
        blackIndices.forEach(bi => {
          const bx = w * 0.13 + (bi + 0.68) * kw;
          ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
          ctx.fillRect(bx + 8, 1640, kw * 0.65, 190);
          ctx.fillStyle = "#1e293b";
          ctx.fillRect(bx, 1640, kw * 0.65, 185);
          ctx.fillStyle = "#475569";
          ctx.fillRect(bx + 2, 1642, kw * 0.65 - 4, 18);
        });
        const noteColors = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"];
        for (let n = 0; n < 8; n++) {
          const nx = w * 0.18 + (n % 4) * (w * 0.20) + (n > 3 ? 35 : 0);
          const ny = 1580 + (n % 2) * 45;
          ctx.fillStyle = noteColors[n % noteColors.length];
          ctx.beginPath(); ctx.arc(nx, ny, 16, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(nx + 10, ny - 32, 5, 32);
          ctx.fillRect(nx + 10, ny - 32, 18, 6);
        }

        // --- 2. 中南段 (y: 1120..1560)：感官手足印跳躍路徑與大同心圓彩環 ---
        const ringColors = ["#f43f5e", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#818cf8"];
        ringColors.forEach((rc, rIdx) => {
          ctx.strokeStyle = rc; ctx.lineWidth = 14;
          ctx.beginPath(); ctx.arc(w * 0.5, 1340, 175 - rIdx * 20, 0, Math.PI * 2); ctx.stroke();
        });
        const hops = [
          { x: w * 0.32, y: 1510, col: "#ec4899", type: "foot" },
          { x: w * 0.68, y: 1510, col: "#ec4899", type: "foot" },
          { x: w * 0.50, y: 1430, col: "#f59e0b", type: "hand" },
          { x: w * 0.32, y: 1350, col: "#10b981", type: "foot" },
          { x: w * 0.68, y: 1350, col: "#10b981", type: "foot" },
          { x: w * 0.50, y: 1250, col: "#3b82f6", type: "hand" },
          { x: w * 0.35, y: 1170, col: "#8b5cf6", type: "foot" },
          { x: w * 0.65, y: 1170, col: "#8b5cf6", type: "foot" }
        ];
        hops.forEach(hp => {
          ctx.fillStyle = hp.col;
          ctx.beginPath(); ctx.arc(hp.x, hp.y, 38, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5; ctx.stroke();
          ctx.fillStyle = "#ffffff";
          if (hp.type === "foot") {
            ctx.beginPath(); ctx.ellipse(hp.x, hp.y + 4, 12, 18, 0, 0, Math.PI * 2); ctx.fill();
            for (let t = -2; t <= 2; t++) {
              ctx.beginPath(); ctx.arc(hp.x + t * 5.5, hp.y - 18, 3.2, 0, Math.PI * 2); ctx.fill();
            }
          } else {
            ctx.beginPath(); ctx.arc(hp.x, hp.y + 5, 14, 0, Math.PI * 2); ctx.fill();
            for (let f = -2; f <= 2; f++) {
              ctx.beginPath(); ctx.ellipse(hp.x + f * 6.5, hp.y - 14, 3.5, 9, f * 0.18, 0, Math.PI * 2); ctx.fill();
            }
          }
        });

        // --- 3. 中段 (y: 750..1100)：3D 懸浮琉璃能量彈珠 ---
        const orbs = [
          { x: w * 0.28, y: 920, r: 64, c1: "#67e8f9", c2: "#0284c7" },
          { x: w * 0.72, y: 940, r: 58, c1: "#86efac", c2: "#16a34a" },
          { x: w * 0.50, y: 830, r: 76, c1: "#fde047", c2: "#d97706" },
          { x: w * 0.35, y: 1040, r: 46, c1: "#f472b6", c2: "#db2777" },
          { x: w * 0.65, y: 1050, r: 48, c1: "#a78bfa", c2: "#7c3aed" }
        ];
        orbs.forEach(orb => {
          ctx.fillStyle = "rgba(15, 23, 42, 0.26)";
          ctx.beginPath(); ctx.ellipse(orb.x + 22, orb.y + orb.r + 14, orb.r * 0.85, orb.r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
          const grad = ctx.createRadialGradient(orb.x - orb.r * 0.35, orb.y - orb.r * 0.35, orb.r * 0.1, orb.x, orb.y, orb.r);
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(0.3, orb.c1);
          grad.addColorStop(0.85, orb.c2);
          grad.addColorStop(1, "#0f172a");
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2); ctx.fill();
        });

        // --- 4. 中北段 (y: 350..740)：100 數表跳格子多彩方格矩陣 ---
        const gridCols = 10, gridRows = 10;
        const cellW = (w * 0.82) / gridCols;
        const cellH = 360 / gridRows;
        const gridX0 = w * 0.09, gridY0 = 360;
        const palette = ["#fecdd3", "#fed7aa", "#fef08a", "#d9f99d", "#a7f3d0", "#bae6fd", "#c7d2fe", "#e9d5ff", "#fbcfe8"];
        for (let r = 0; r < gridRows; r++) {
          for (let c = 0; c < gridCols; c++) {
            const num = r * 10 + c + 1;
            const cx = gridX0 + c * cellW;
            const cy = gridY0 + r * cellH;
            ctx.fillStyle = palette[(r + c) % palette.length];
            ctx.fillRect(cx, cy, cellW - 2, cellH - 2);
            ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
            ctx.strokeRect(cx, cy, cellW - 2, cellH - 2);
            ctx.fillStyle = "#1e293b"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
            ctx.fillText(String(num), cx + cellW / 2 - 1, cy + cellH / 2 + 5);
          }
        }
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("百 數 表 跳 格 子", w * 0.5, 345);

        // --- 5. 北端 (y: 30..320)：正八方紅白相間羅盤星與目標靶心 ---
        const starX = w * 0.5, starY = 175, starR = 135;
        [starR + 25, starR + 10].forEach(rr => {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.75)"; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(starX, starY, rr, 0, Math.PI * 2); ctx.stroke();
        });
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2 - Math.PI / 2;
          const angMid = ang + (Math.PI / 8);
          const angNext = ang + (Math.PI / 4);
          const rLong = starR;
          const rShort = starR * 0.38;

          ctx.fillStyle = "#ef4444";
          ctx.beginPath();
          ctx.moveTo(starX, starY);
          ctx.lineTo(starX + Math.cos(ang) * rLong, starY + Math.sin(ang) * rLong);
          ctx.lineTo(starX + Math.cos(angMid) * rShort, starY + Math.sin(angMid) * rShort);
          ctx.closePath(); ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.moveTo(starX, starY);
          ctx.lineTo(starX + Math.cos(angMid) * rShort, starY + Math.sin(angMid) * rShort);
          ctx.lineTo(starX + Math.cos(angNext) * rLong, starY + Math.sin(angNext) * rLong);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.arc(starX, starY, 20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("N", starX, starY - starR - 8);
        ctx.fillText("S", starX, starY + starR + 22);
        ctx.fillText("E", starX + starR + 18, starY + 6);
        ctx.fillText("W", starX - starR - 18, starY + 6);
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

    // 食農教室 (3D 亮檸檬黃外牆 + 實體白框雙開玻璃門 + 手繪感食農教室書法字樣與牆面彩繪) + 西側堆肥示範區
    if (b.id === "food_lab") {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, b.floorHeight, b.d),
        new THREE.MeshLambertMaterial({ color: 0xd9e845 })
      );
      body.position.y = b.floorHeight / 2;
      body.castShadow = true; body.receiveShadow = true;
      body.userData.isBuildingBody = true;
      group.add(body);

      // 南面正門彩繪牆與字樣
      const muralTex = makeSignTexture(512, 256, (ctx, w, h) => {
        ctx.fillStyle = "#d9e845"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#14532d"; ctx.font = "bold 46px serif"; ctx.textAlign = "center";
        ctx.fillText("食農教室", w / 2, 62);
        ctx.font = "bold 18px sans-serif";
        ctx.fillText("從土地到餐桌   讓永續成日常", w / 2, 94);
        ctx.fillStyle = "#f97316"; ctx.beginPath(); ctx.arc(430, 66, 24, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#92400e"; ctx.fillRect(365, 168, 110, 32);
        ctx.fillStyle = "#16a34a"; ctx.fillRect(370, 152, 100, 18);
        ctx.fillStyle = "#f472b6"; ctx.beginPath(); ctx.arc(72, 195, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(118, 210, 14, 0, Math.PI * 2); ctx.fill();
      });
      const signFront = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.94, b.floorHeight * 0.94), new THREE.MeshLambertMaterial({ map: muralTex }));
      signFront.position.set(0, b.floorHeight / 2, b.d / 2 + 0.02);
      group.add(signFront);

      // 雙開半透明玻璃門與側窗
      const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.25, 0.14), new THREE.MeshLambertMaterial({ color: 0xf8fafc }));
      doorFrame.position.set(-0.3, 1.12, b.d / 2 + 0.05);
      [-0.55, 0.55].forEach(dx => {
        const pane = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.98, 0.18), sharedGlassMat);
        pane.position.set(-0.3 + dx, 1.12, b.d / 2 + 0.06);
        group.add(pane);
      });
      group.add(doorFrame);
      addBackWallWindows(group, "z", b.w / 2, 1, 1, b.floorHeight, [-3.2, 2.8], 2.2);

      // --- 堆肥示範區（依照片 堆肥示範區.JPG 建模：食農教室西側空地寬約5m，南北向延伸至北側牆面）---
      // 1. 食農教室西側外牆學童環保分類與食農種植彩繪壁畫
      const compostMuralTex = makeSignTexture(512, 256, (ctx, w, h) => {
        ctx.fillStyle = "#84cc16"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fef08a"; ctx.beginPath(); ctx.arc(75, 55, 26, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#15803d"; ctx.fillRect(0, h * 0.65, w, h * 0.35);
        ctx.fillStyle = "#78350f"; ctx.fillRect(w * 0.72, h * 0.28, 24, h * 0.42);
        ctx.fillStyle = "#16a34a"; ctx.beginPath(); ctx.arc(w * 0.74, h * 0.25, 52, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#15803d"; ctx.fillRect(w * 0.34, h * 0.45, 36, 48);
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("♻️", w * 0.34 + 18, h * 0.45 + 32);
        ctx.fillStyle = "#14532d"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "left";
        ctx.fillText("食農教育・堆肥示範區", 30, 45);
        ctx.font = "bold 16px sans-serif";
        ctx.fillText("生熟廚餘資源化・落葉歸根土壤肥", 30, 75);
      });
      const westMuralMesh = new THREE.Mesh(new THREE.PlaneGeometry(b.d * 0.85, b.floorHeight * 0.88), new THREE.MeshLambertMaterial({ map: compostMuralTex }));
      westMuralMesh.rotation.y = -Math.PI / 2;
      westMuralMesh.position.set(-b.w / 2 - 0.03, b.floorHeight / 2, 0);
      group.add(westMuralMesh);

      // 2. 淡黃色浪板雙開工具棚（高 2.4m，寬 1.9m，深 0.8m）
      const shedMat = new THREE.MeshLambertMaterial({ color: 0xfef08a });
      const shed = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.4, 1.9), shedMat);
      shed.position.set(-b.w / 2 - 0.65, 1.2, 1.8);
      shed.castShadow = true;
      group.add(shed);

      // 3. 圓形透氣植生發酵堆肥袋（10 個圓袋排成弧列，貼有標示圖貼）
      const bagMat = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
      const mulchFillMat = new THREE.MeshLambertMaterial({ color: 0x78350f });
      const bagOffsets = [
        [-2.2, 3.8], [-3.2, 3.6], [-4.2, 3.3],
        [-1.8, 1.8], [-2.8, 1.6], [-3.8, 1.3],
        [-1.6, -0.6], [-2.6, -0.8], [-3.6, -1.1], [-2.4, -2.8]
      ];
      bagOffsets.forEach(([dx, dz]) => {
        const bagX = -b.w / 2 + dx;
        const bagZ = dz;
        const bagMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.42, 0.52, 12), bagMat);
        bagMesh.position.set(bagX, 0.26, bagZ);
        bagMesh.castShadow = true;
        const mulchMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 12), mulchFillMat);
        mulchMesh.position.set(bagX, 0.50, bagZ);
        group.add(bagMesh, mulchMesh);
      });

      // 4. 亮橘色斗六市清潔隊廚餘回收桶
      const orangeBinMat = new THREE.MeshLambertMaterial({ color: 0xf97316 });
      const orangeBin = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.75, 0.42), orangeBinMat);
      orangeBin.position.set(-b.w / 2 - 0.8, 0.375, -2.2);
      orangeBin.castShadow = true;
      group.add(orangeBin);

      // 5. 堆肥示範區解說立牌
      const compostSignTex = makeSignTexture(256, 128, (ctx, w, h) => {
        ctx.fillStyle = "#15803d"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("堆肥示範區", w / 2, 42);
        ctx.font = "bold 14px sans-serif";
        ctx.fillText("落葉廚餘・有機循環", w / 2, 78);
      });
      const cSign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.65, 0.08), new THREE.MeshLambertMaterial({ map: compostSignTex }));
      cSign.position.set(-b.w / 2 - 2.8, 0.95, 4.2);
      cSign.rotation.y = Math.PI / 4;
      group.add(cSign);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.5, 0.35, b.d + 0.5), new THREE.MeshLambertMaterial({ color: hexColor(b.colors.roof) }));
      roof.position.y = b.floorHeight + 0.18;
      group.add(roof);
      return group;
    }

    // 學校廚房（依照片 學校廚房.JPG 建模：洗石子外觀、雙根羅馬圓柱拱門門廊、微弧階梯拱頂門額、內凹不銹鋼捲門、白色瓷磚橫紋方柱列、屋頂不銹鋼水塔與採光通風棚）
    if (b.id === "kitchen") {
      const stoneWashMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
      const whiteTileBandMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
      const stainlessMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.75 });

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, b.floorHeight, b.d),
        stoneWashMat
      );
      body.position.y = b.floorHeight / 2;
      body.castShadow = true; body.receiveShadow = true;
      body.userData.isBuildingBody = true;
      group.add(body);

      // 正面 (南側 lz = b.d / 2) 雙根羅馬圓柱門廊與階梯微弧拱頂門額
      const porticoW = 5.6;
      const porticoD = 2.4;
      const porticoZ = b.d / 2 + porticoD / 2;

      // 門廊基座台階 (洗石子地坪)
      const porticoBase = new THREE.Mesh(new THREE.BoxGeometry(porticoW + 0.4, 0.22, porticoD + 0.4), stoneWashMat);
      porticoBase.position.set(0, 0.11, porticoZ);
      porticoBase.receiveShadow = true;
      group.add(porticoBase);

      // 兩側羅馬圓柱（方底座 + 圓柱身 + 柱頭）
      [-porticoW * 0.35, porticoW * 0.35].forEach(colX => {
        const baseBox = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.85), stoneWashMat);
        baseBox.position.set(colX, 0.44, b.d / 2 + porticoD - 0.45);
        baseBox.castShadow = true;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.32, 2.35, 16), stoneWashMat);
        col.position.set(colX, 1.84, b.d / 2 + porticoD - 0.45);
        col.castShadow = true;
        const capBox = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.25, 0.82), stoneWashMat);
        capBox.position.set(colX, 3.12, b.d / 2 + porticoD - 0.45);
        capBox.castShadow = true;
        group.add(baseBox, col, capBox);
      });

      // 階梯微弧拱頂門額（洗石子飾面，中央微弧起拱）
      const entablature = new THREE.Mesh(new THREE.BoxGeometry(porticoW + 0.4, 0.95, porticoD + 0.2), stoneWashMat);
      entablature.position.set(0, b.floorHeight + 0.25, porticoZ);
      entablature.castShadow = true;
      const pedimentArch = new THREE.Mesh(new THREE.CylinderGeometry(porticoW * 0.52, porticoW * 0.52, porticoD + 0.18, 16, 1, false, 0, Math.PI), stoneWashMat);
      pedimentArch.rotation.z = Math.PI / 2;
      pedimentArch.rotation.y = Math.PI / 2;
      pedimentArch.position.set(0, b.floorHeight + 0.72, porticoZ);
      pedimentArch.scale.set(0.18, 1, 1);
      group.add(entablature, pedimentArch);

      // 內凹入口不銹鋼橫條波浪捲門
      const doorRecess = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.45, 0.15), stainlessMat);
      doorRecess.position.set(0, 1.34, b.d / 2 + 0.08);
      group.add(doorRecess);

      // 兩側條紋方柱（洗石子方柱間隔白色小方磁磚橫紋）
      [-b.w * 0.38, -b.w * 0.22, b.w * 0.22, b.w * 0.38].forEach(px => {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.95, b.floorHeight, 0.55), stoneWashMat);
        pillar.position.set(px, b.floorHeight / 2, b.d / 2 + 0.25);
        pillar.castShadow = true;
        group.add(pillar);
        for (let wy = 0.6; wy <= b.floorHeight - 0.5; wy += 0.52) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.16, 0.58), whiteTileBandMat);
          band.position.set(px, wy, b.d / 2 + 0.25);
          group.add(band);
        }
      });

      // 兩側內嵌防盜鐵窗
      [-b.w * 0.30, b.w * 0.30].forEach(wx => {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.45, 0.12), new THREE.MeshLambertMaterial({ color: 0x1e293b }));
        win.position.set(wx, 1.85, b.d / 2 + 0.05);
        group.add(win);
      });

      // 屋頂女兒牆與不銹鋼圓柱水塔
      const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.4, 0.55, b.d + 0.4), stoneWashMat);
      roof.position.y = b.floorHeight + 0.28;
      group.add(roof);

      // 屋頂不銹鋼水塔（金屬支撐架 + 不銹鋼圓柱儲水塔）
      const tankStand = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.75, 1.6), new THREE.MeshLambertMaterial({ color: 0x64748b }));
      tankStand.position.set(-b.w * 0.32, b.floorHeight + 0.92, -b.d * 0.25);
      const tankMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.65, 16), stainlessMat);
      tankMesh.position.set(-b.w * 0.32, b.floorHeight + 2.12, -b.d * 0.25);
      tankMesh.castShadow = true;
      group.add(tankStand, tankMesh);

      // 屋頂排風採光雙坡天窗
      const ventRoof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.85, 5.2), new THREE.MeshLambertMaterial({ color: 0x94a3b8 }));
      ventRoof.position.set(b.w * 0.18, b.floorHeight + 0.98, -b.d * 0.15);
      group.add(ventRoof);

      if (colliders) {
        colliders.push({ b, lxMin: -b.w / 2, lxMax: b.w / 2, lzMin: -b.d / 2, lzMax: b.d / 2, floors: "both" });
        colliders.push({ b, lxMin: -porticoW / 2, lxMax: porticoW / 2, lzMin: b.d / 2, lzMax: b.d / 2 + porticoD, floors: "1" });
      }
      return group;
    }

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.floorHeight, b.d),
      new THREE.MeshLambertMaterial({ color: hexColor(b.colors.wall) })
    );
    body.position.y = b.floorHeight / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.isBuildingBody = true;
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

    // 學校邊界圍牆（依指示：從球場西側過去到操場跑道西側草坪邊緣，一直延伸到北側圍牆，改為透空式的鐵絲網及欄杆，約3米間距；其餘邊界為實體圍牆）
    const bPts = data.campusBoundary || [];
    if (bPts.length > 2) {
      const wallGroup = new THREE.Group();
      const wallH = 1.5;
      const wallThick = 0.28;
      const wallBodyMat = new THREE.MeshLambertMaterial({ color: 0xede9e0 });
      const wallBaseMat = new THREE.MeshLambertMaterial({ color: 0xb45345 });
      const wallCapMat = new THREE.MeshLambertMaterial({ color: 0x3b6e35 });

      // 透空式菱格鐵絲網材質
      const chainLinkTex = makeSignTexture(128, 128, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(71, 85, 105, 0.75)";
        ctx.lineWidth = 2.5;
        for (let x = -w; x <= w * 2; x += 16) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke();
        }
      });
      chainLinkTex.wrapS = chainLinkTex.wrapT = THREE.RepeatWrapping;

      for (let i = 0; i < bPts.length; i++) {
        const p1 = bPts[i];
        const p2 = bPts[(i + 1) % bPts.length];
        const dx = p2[0] - p1[0];
        const dz = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dz);
        if (segLen < 0.1) continue;
        const midX = (p1[0] + p2[0]) / 2;
        const midZ = (p1[1] + p2[1]) / 2;
        const rotY = Math.atan2(-dz, dx);

        // 大門口兩側圍牆緊鄰兩側門柱外緣，兩側門柱 (南側 [57.5, 44.5]、北側 [63.5, 36.5]) 及中間通道完全不設圍牆
        const isMainGateOpening =
          (Math.hypot(p1[0] - 56.63, p1[1] - 44.89) < 1.5 && Math.hypot(p2[0] - 63.83, p2[1] - 35.79) < 1.5) ||
          (Math.hypot(p2[0] - 56.63, p2[1] - 44.89) < 1.5 && Math.hypot(p1[0] - 63.83, p1[1] - 35.79) < 1.5);
        if (isMainGateOpening) continue;

        // 香蕉園落葉循環示範區通道保持開放（依指示打開圍牆，讓小人可自由靠近與觀察）
        const isBananaGardenOpening = Math.hypot(midX - (-58.5), midZ - 92.5) < 7.5;
        if (isBananaGardenOpening) continue;

        // 從球場西側過去到操場跑道西側草坪邊緣，一直延伸到北側圍牆 (邊界線段 0, 16, 15, 14, 13, 12)
        const isWireMeshSeg = [0, 16, 15, 14, 13, 12].includes(i);
        if (isWireMeshSeg) {
          // 1. 低矮水泥底座 (高 0.22m)
          const curb = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.22, 0.18), new THREE.MeshLambertMaterial({ color: 0x94a3b8 }));
          curb.position.set(midX, 0.11, midZ);
          curb.rotation.y = rotY;
          wallGroup.add(curb);

          // 2. 上下兩道水平鋼管橫挺
          [0.32, 1.72].forEach(ry => {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.04, 0.04), new THREE.MeshLambertMaterial({ color: 0x475569 }));
            rail.position.set(midX, ry, midZ);
            rail.rotation.y = rotY;
            wallGroup.add(rail);
          });

          // 3. 透空式菱格鐵絲網面 (透明可看穿至校外田園綠地)
          const curMeshTex = chainLinkTex.clone();
          curMeshTex.repeat.set(Math.max(1, segLen * 1.2), 2.2);
          const wireMeshMat = new THREE.MeshLambertMaterial({
            map: curMeshTex,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
          });
          const wireMesh = new THREE.Mesh(new THREE.PlaneGeometry(segLen, 1.40), wireMeshMat);
          wireMesh.position.set(midX, 1.02, midZ);
          wireMesh.rotation.y = rotY;
          wallGroup.add(wireMesh);

          // 4. 約 3 米間距之鍍鋅鋼管立柱 (直徑 0.08m, 高 1.80m)
          const postCount = Math.max(1, Math.round(segLen / 3.0));
          const postStep = segLen / postCount;
          for (let pIdx = 0; pIdx <= postCount; pIdx++) {
            const offset = -segLen / 2 + pIdx * postStep;
            const px = midX + Math.cos(rotY) * offset;
            const pz = midZ - Math.sin(rotY) * offset;
            const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 1.80, 8), new THREE.MeshLambertMaterial({ color: 0x334155 }));
            pipe.position.set(px, 0.90, pz);
            pipe.castShadow = true;
            wallGroup.add(pipe);
          }
          continue;
        }

        const wBody = new THREE.Mesh(new THREE.BoxGeometry(segLen, wallH - 0.38, wallThick), wallBodyMat);
        wBody.position.set(midX, 0.30 + (wallH - 0.38) / 2, midZ);
        wBody.rotation.y = rotY;
        wBody.castShadow = true;
        wBody.receiveShadow = true;

        const wBase = new THREE.Mesh(new THREE.BoxGeometry(segLen + 0.04, 0.30, wallThick + 0.04), wallBaseMat);
        wBase.position.set(midX, 0.15, midZ);
        wBase.rotation.y = rotY;

        const wCap = new THREE.Mesh(new THREE.BoxGeometry(segLen + 0.06, 0.08, wallThick + 0.08), wallCapMat);
        wCap.position.set(midX, wallH - 0.04, midZ);
        wCap.rotation.y = rotY;

        wallGroup.add(wBody, wBase, wCap);

        // 僅在一般圍牆轉角處建立轉角柱；大門口兩端已緊鄰南側門柱與北側門柱，絕不重複生成多餘轉角柱
        const isNearGatePillar = Math.hypot(p1[0] - 56.63, p1[1] - 44.89) < 1.5 || Math.hypot(p1[0] - 63.83, p1[1] - 35.79) < 1.5;
        if (!isNearGatePillar) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, wallH + 0.08, 0.42), wallBaseMat);
          post.position.set(p1[0], (wallH + 0.08) / 2, p1[1]);
          post.castShadow = true;
          wallGroup.add(post);
        }
      }
      scene.add(wallGroup);
    }

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

    // 建立舊式紅色連鎖磚貼圖（用於拼貼式高壓磚右側、校門右側停車場、食農教室與廚房前方廣場）
    function makeRedInterlockBrickTexture(repeatScale) {
      const tex = makeSignTexture(512, 512, (ctx, w, h) => {
        ctx.fillStyle = "#5c342b";
        ctx.fillRect(0, 0, w, h);
        const rows = 16;
        const cols = 8;
        const rowH = h / rows;
        const colW = w / cols;
        const redShades = ["#b84a39", "#a93f30", "#c25443", "#9c392b", "#b24636", "#c65b4a", "#a33c2e", "#ba4d3c"];
        for (let r = 0; r < rows; r++) {
          const offset = (r % 2) * (colW * 0.5);
          for (let c = -1; c <= cols; c++) {
            const x = c * colW + offset;
            const y = r * rowH;
            const shade = redShades[((r * 5 + c * 3) & 7)];
            ctx.fillStyle = shade;
            // 工字型舊式紅色連鎖磚塊與企口縫線
            ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);
            ctx.fillStyle = "rgba(255, 220, 210, 0.14)";
            ctx.fillRect(x + 3, y + 3, colW - 6, 3);
          }
        }
      });
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const rep = repeatScale || 0.42;
      tex.repeat.set(rep, rep);
      tex.rotation = 0.525;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 4;
      return tex;
    }

    (data.plazas || []).forEach(pz => {
      let mesh;
      if (pz.points && Array.isArray(pz.points)) {
        const mat = pz.paving === "red_interlock"
          ? new THREE.MeshLambertMaterial({ map: makeRedInterlockBrickTexture(0.42) })
          : new THREE.MeshLambertMaterial({ color: hexColor(pz.color) });
        mesh = createFlatPolygonMesh(pz.points, 0.036, mat);
        scene.add(mesh);
        return;
      }
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
      } else if (pz.paving === "red_interlock") {
        const tex = makeRedInterlockBrickTexture(1);
        tex.rotation = 0;
        tex.repeat.set(Math.max(1, pz.w / 2.4), Math.max(1, pz.d / 2.4));
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(pz.w, 0.065, pz.d),
          new THREE.MeshLambertMaterial({ map: tex })
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
        grp = buildStage(b, colliders, walkZones);
      } else if (b.style === "pond") {
        grp = buildEcoPond(b, colliders);
      } else if (b.style === "gate") {
        grp = buildGate(b, colliders);
      } else if (b.style === "toilet") {
        grp = buildToilet(b, colliders, walkZones);
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

    // 6. 百年老茄苳樹 (校樹) 專屬真實立體建模（依照片 大茄冬樹.JPG 建立：紅磚花台、解說立牌、粗壯雙主幹、高12m茂盛樹冠）
    const bischofiaG = new THREE.Group();
    const bx = 33.66, bz = 15.80;

    // 1. 低矮紅磚石材花台 (長 2.6m, 寬 2.4m, 高 0.38m)
    const planterTex = makeSignTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#831843"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#9f1239";
      for (let y = 0; y < h; y += 18) {
        ctx.fillRect(0, y, w, 15);
        ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1.5; ctx.strokeRect(0, y, w, 15);
      }
    });
    const planterBox = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.38, 2.4), new THREE.MeshLambertMaterial({ map: planterTex }));
    planterBox.position.set(bx, 0.19, bz);
    planterBox.castShadow = true; planterBox.receiveShadow = true;
    const soilMesh = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.05, 2.15), new THREE.MeshLambertMaterial({ color: 0x3f2e1e }));
    soilMesh.position.set(bx, 0.36, bz);
    soilMesh.receiveShadow = true;
    bischofiaG.add(planterBox, soilMesh);

    // 2. 解說傾斜立牌（斜置於花台前方）
    const signTexB = makeSignTexture(256, 160, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#166534"; ctx.fillRect(0, 0, w, 36);
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("校樹・百年茄苳", w / 2, 25);
      ctx.fillStyle = "#1e293b"; ctx.font = "bold 13px sans-serif";
      ctx.fillText("學名：Bischofia javanica", w / 2, 60);
      ctx.fillText("別名：重陽木、秋楓", w / 2, 85);
      ctx.fillText("樹高：約 12 公尺", w / 2, 110);
      ctx.fillText("溪洲國小鎮校之寶", w / 2, 135);
    });
    const bischofiaSign = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.04), new THREE.MeshLambertMaterial({ map: signTexB }));
    bischofiaSign.position.set(bx + 0.85, 0.58, bz + 1.15);
    bischofiaSign.rotation.x = -0.42;
    bischofiaG.add(bischofiaSign);

    // 3. 蒼勁粗壯分叉雙主幹（深裂灰褐深邃樹皮）
    const barkMat = new THREE.MeshLambertMaterial({ color: 0x452b1b });
    const mainTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.78, 3.2, 10), barkMat);
    mainTrunk.position.set(bx, 1.6, bz);
    mainTrunk.castShadow = true;
    bischofiaG.add(mainTrunk);

    // 左右兩大雙叉主幹
    const branchL = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.48, 4.2, 8), barkMat);
    branchL.position.set(bx - 0.45, 4.4, bz - 0.12);
    branchL.rotation.z = 0.18; branchL.rotation.x = -0.10;
    branchL.castShadow = true;

    const branchR = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.50, 4.6, 8), barkMat);
    branchR.position.set(bx + 0.42, 4.6, bz + 0.15);
    branchR.rotation.z = -0.16; branchR.rotation.x = 0.12;
    branchR.castShadow = true;
    bischofiaG.add(branchL, branchR);

    // 4. 高達 12 米的多層次翠綠濃密巨大樹冠
    const leafMatDark = new THREE.MeshLambertMaterial({ color: 0x1e3a1e });
    const leafMatMid = new THREE.MeshLambertMaterial({ color: 0x2d5a27 });
    const leafMatLight = new THREE.MeshLambertMaterial({ color: 0x3d7e35 });

    const crownClusters = [
      { x: bx - 0.6, y: 7.2, z: bz - 0.3, r: 2.8, mat: leafMatDark },
      { x: bx + 0.7, y: 7.5, z: bz + 0.4, r: 3.1, mat: leafMatMid },
      { x: bx, y: 8.8, z: bz, r: 3.6, mat: leafMatLight },
      { x: bx - 0.8, y: 9.8, z: bz + 0.2, r: 2.9, mat: leafMatMid },
      { x: bx + 0.6, y: 10.2, z: bz - 0.2, r: 3.0, mat: leafMatLight },
      { x: bx, y: 11.4, z: bz, r: 2.3, mat: leafMatLight }
    ];
    crownClusters.forEach(cc => {
      const leafMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(cc.r, 1), cc.mat);
      leafMesh.position.set(cc.x, cc.y, cc.z);
      leafMesh.castShadow = true;
      bischofiaG.add(leafMesh);
    });

    scene.add(bischofiaG);
    extraWorldColliders.push({ x: bx, z: bz, r: 1.45 });

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
