// 溪洲國小 3D 校園導覽主控制器 (Stage 1: 鳥瞰初版模型)

(function () {
  const D = window.CAMPUS_DATA;
  const canvas = document.getElementById("campusCanvas");
  const labelsOverlay = document.getElementById("labelsOverlay");
  const detailDrawer = document.getElementById("detailDrawer");
  const compassDial = document.getElementById("compassDial");

  let lang = "zh"; // 'zh' | 'en'
  let showSurvey = false;
  let selectedBuildingId = null;

  // --- 1. Three.js 場景、燈光與渲染器 ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcce7f7);
  scene.fog = new THREE.FogExp2(0xcce7f7, 0.0014);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.5, 1200);

  // 燈光
  const hemiLight = new THREE.HemisphereLight(0xfef9ef, 0x8fb376, 0.72);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff5e4, 0.9);
  sunLight.position.set(85, 130, 75);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 20;
  sunLight.shadow.camera.far = 360;
  const sc = 150;
  sunLight.shadow.camera.left = -sc;
  sunLight.shadow.camera.right = sc;
  sunLight.shadow.camera.top = sc;
  sunLight.shadow.camera.bottom = -sc;
  scene.add(sunLight);

  // 建立 3D 校園
  const built = window.buildShijouCampus(scene, D);
  const loadEl = document.getElementById("loadingOverlay");
  if (loadEl) setTimeout(() => loadEl.classList.add("fade-out"), 380);

  // --- 2. 軌道相機狀態與飛航動畫 ---
  const initZone = (D.zones && D.zones[0]) || { target: [-2, 2, 18], camPos: [125, 102, 115] };
  const initDx = initZone.camPos[0] - initZone.target[0];
  const initDy = initZone.camPos[1] - initZone.target[1];
  const initDz = initZone.camPos[2] - initZone.target[2];
  const initH = Math.hypot(initDx, initDz);
  const camState = {
    target: new THREE.Vector3(initZone.target[0], initZone.target[1], initZone.target[2]),
    yaw: Math.atan2(initDx, initDz),
    pitch: Math.atan2(initDy, initH),
    dist: Math.hypot(initH, initDy)
  };
  let flyAnim = null;

  function applyCamera() {
    camState.pitch = Math.max(0.08, Math.min(1.48, camState.pitch));
    camState.dist = Math.max(6, Math.min(380, camState.dist));
    const hDist = camState.dist * Math.cos(camState.pitch);
    const vDist = camState.dist * Math.sin(camState.pitch);
    camera.position.set(
      camState.target.x + hDist * Math.sin(camState.yaw),
      camState.target.y + vDist,
      camState.target.z + hDist * Math.cos(camState.yaw)
    );
    camera.lookAt(camState.target);

    if (compassDial) {
      const deg = (camState.yaw * 180) / Math.PI;
      compassDial.style.transform = `rotate(${deg}deg)`;
    }
  }

  function flyTo(targetArr, camPosArr, durationMs = 750) {
    const startTarget = camState.target.clone();
    const startYaw = camState.yaw;
    const startPitch = camState.pitch;
    const startDist = camState.dist;

    const endTarget = new THREE.Vector3(targetArr[0], targetArr[1], targetArr[2]);
    const dx = camPosArr[0] - endTarget.x;
    const dy = camPosArr[1] - endTarget.y;
    const dz = camPosArr[2] - endTarget.z;
    const endDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const endPitch = Math.asin(Math.max(-0.99, Math.min(0.99, dy / endDist)));
    let endYaw = Math.atan2(dx, dz);

    // 最短路徑角度插值
    let diffYaw = endYaw - startYaw;
    while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
    while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;

    flyAnim = {
      t0: performance.now(),
      dur: durationMs,
      startTarget, endTarget,
      startYaw, diffYaw,
      startPitch, endPitch,
      startDist, endDist
    };
  }

  // 初始化最佳全覽視角
  (function initView() {
    const z0 = D.zones[0];
    flyTo(z0.target, z0.camPos, 10);
  })();

  // --- 3. 滑鼠 / 鍵盤 / 觸控互動 ---
  let dragMode = null; // 'pan' | 'rot'
  let lastX = 0, lastY = 0, downX = 0, downY = 0;

  function panByPixels(dx, dy) {
    const scale = camState.dist * 0.0014;
    const cosY = Math.cos(camState.yaw);
    const sinY = Math.sin(camState.yaw);
    // 右移 (dx>0) -> target 往畫面左方移動
    camState.target.x -= (dx * cosY + dy * sinY) * scale;
    camState.target.z -= (-dx * sinY + dy * cosY) * scale;
  }

  canvas.addEventListener("contextmenu", e => e.preventDefault());

  canvas.addEventListener("mousedown", e => {
    flyAnim = null;
    lastX = downX = e.clientX;
    lastY = downY = e.clientY;
    dragMode = walkMode ? "walk_look" : (e.button === 2 ? "rot" : "pan");
  });

  window.addEventListener("mousemove", e => {
    if (!dragMode) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    if (dragMode === "walk_look") {
      walkState.yaw -= dx * 0.006;
      walkState.pitch = Math.max(-0.55, Math.min(0.65, walkState.pitch + dy * 0.004));
      return;
    }

    if (dragMode === "pan") {
      panByPixels(dx, dy);
    } else {
      camState.yaw -= dx * 0.006;
      camState.pitch += dy * 0.005;
    }
    applyCamera();
  });

  window.addEventListener("mouseup", e => {
    if (dragMode && Math.hypot(e.clientX - downX, e.clientY - downY) < 5 && e.button === 0) {
      pickBuildingAt(e.clientX, e.clientY);
    }
    dragMode = null;
  });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    flyAnim = null;
    if (walkMode && (!guidedWalk || guidedWalk.paused)) {
      walkFollowDist = Math.max(1.5, Math.min(28, walkFollowDist * (e.deltaY > 0 ? 1.12 : 0.89)));
      return;
    }
    camState.dist *= e.deltaY > 0 ? 1.1 : 0.9;
    applyCamera();
  }, { passive: false });

  // 觸控手勢 (單指平移、雙指縮放與旋轉)
  let touchPrev = null;
  canvas.addEventListener("touchstart", e => {
    flyAnim = null;
    if (e.touches.length === 1) {
      touchPrev = { mode: "one", x: e.touches[0].clientX, y: e.touches[0].clientY, sx: e.touches[0].clientX, sy: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      touchPrev = {
        mode: "two",
        dist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
        ang: Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX),
        cy: (t0.clientY + t1.clientY) / 2
      };
    }
  }, { passive: true });

  canvas.addEventListener("touchmove", e => {
    if (!touchPrev) return;
    e.preventDefault();
    if (touchPrev.mode === "one" && e.touches.length === 1) {
      const dx = e.touches[0].clientX - touchPrev.x;
      const dy = e.touches[0].clientY - touchPrev.y;
      touchPrev.x = e.touches[0].clientX;
      touchPrev.y = e.touches[0].clientY;
      panByPixels(dx, dy);
    } else if (touchPrev.mode === "two" && e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const ang = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX);
      const cy = (t0.clientY + t1.clientY) / 2;

      camState.dist *= touchPrev.dist / Math.max(10, dist);
      camState.yaw += (ang - touchPrev.ang);
      camState.pitch += (cy - touchPrev.cy) * 0.004;

      touchPrev.dist = dist;
      touchPrev.ang = ang;
      touchPrev.cy = cy;
    }
    applyCamera();
  }, { passive: false });

  canvas.addEventListener("touchend", e => {
    if (touchPrev && touchPrev.mode === "one" && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      if (Math.hypot(t.clientX - touchPrev.sx, t.clientY - touchPrev.sy) < 8) {
        pickBuildingAt(t.clientX, t.clientY);
      }
    }
    touchPrev = null;
  });

  // WASD / 方向鍵移動與空白鍵跳躍
  const keys = {};
  window.addEventListener("keydown", e => {
    keys[e.key.toLowerCase()] = true;
    const tag = (e.target && e.target.tagName) || "";
    if (walkMode && !guidedWalk && (e.code === "Space" || e.key === " ") && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
      e.preventDefault();
      if (!walkState.jumping) {
        walkState.vy = 6.2;
        walkState.jumping = true;
      }
    }
  });
  window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

  // --- 4. Raycasting 點選建築與右側面板 ---
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundHitPt = new THREE.Vector3();

  function pickBuildingAt(clientX, clientY) {
    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(built.clickableMeshes, false);

    // 校園漫步模式下點擊地面或球場／跑道可直接走過去
    if (walkMode && !guidedWalk) {
      if (hits.length === 0 || (hits[0].point && Math.abs(hits[0].point.y - walkState.y) < 0.85 &&
          ["track_field", "solar_court", "mural_courtyard", "banana_compost"].includes(hits[0].object.userData.buildingId))) {
        const pt = hits.length > 0 ? hits[0].point : (raycaster.ray.intersectPlane(groundPlane, groundHitPt) ? groundHitPt : null);
        if (pt && !isBlocked(pt.x, pt.z, walkState.y)) {
          clickWalkTarget = { x: pt.x, z: pt.z };
          return;
        }
      }
    }

    if (hits.length > 0) {
      const bid = hits[0].object.userData.buildingId;
      if (bid) selectBuilding(bid);
    }
  }

  function selectBuilding(bid, floorKey = null, highlightCode = null, skipFly = false) {
    const b = D.buildings.find(item => item.id === bid);
    if (!b) return;
    selectedBuildingId = bid;

    if (!skipFly) {
      const dist = Math.max(38, Math.max(b.w, b.d) * 1.35);
      flyTo([b.x, 2, b.z], [b.x + dist * 0.25, dist * 0.65, b.z + dist * 0.72], 700);
    }
    renderDetailDrawer(b, floorKey, highlightCode);
  }

  function parseYoutubeEmbed(url) {
    if (!url) return null;
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{6,})/);
    return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0` : null;
  }

  function renderDetailDrawer(b, initFloor = null, highlightCode = null, tourOverride = null) {
    if (!b && !tourOverride) {
      detailDrawer.hidden = true;
      return;
    }
    const title = tourOverride ? (lang === "en" ? tourOverride.titleEn : tourOverride.titleZh) : (lang === "en" ? b.nameEn : b.name);
    const summary = tourOverride ? (lang === "en" ? tourOverride.descEn : tourOverride.descZh) : (lang === "en" ? b.summaryEn : b.summary);
    const feats = b ? (lang === "en" ? b.featuresEn : b.features) : [];
    const photos = (tourOverride && tourOverride.photos) || (b && b.photos) || [];
    const embedUrl = parseYoutubeEmbed((tourOverride && tourOverride.youtubeUrl) || (b && b.youtubeUrl));

    let mediaTabsHtml = "";
    if (photos.length > 0 && embedUrl) {
      mediaTabsHtml = `
        <div class="media-tabs">
          <button type="button" class="media-tab active" data-mtab="photos">${lang === "en" ? "📷 Photos" : "📷 實景照片"}</button>
          <button type="button" class="media-tab" data-mtab="video">${lang === "en" ? "🎬 Video" : "🎬 實景影片"}</button>
        </div>
      `;
    }

    let galleryHtml = "";
    if (photos.length > 0) {
      galleryHtml = `
        <div class="photo-gallery" id="drawerPhotoPane">
          <div class="photo-main-wrap" id="drawerMainPhotoWrap" title="${lang === "en" ? "Click to zoom" : "點擊放大圖片"}">
            <img id="drawerMainImg" src="${photos[0]}" alt="${title}">
            <span class="photo-count-badge" id="drawerPhotoBadge">1 / ${photos.length}</span>
          </div>
          ${photos.length > 1 ? `
            <div class="photo-thumbs">
              ${photos.map((p, idx) => `<img class="photo-thumb ${idx === 0 ? "active" : ""}" src="${p}" data-idx="${idx}" alt="">`).join("")}
            </div>
          ` : ""}
        </div>
      `;
    }

    const videoHtml = embedUrl ? `
      <div class="video-embed-wrap" id="drawerVideoPane" ${photos.length > 0 ? "hidden" : ""}>
        <iframe src="${embedUrl}" title="${title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div>
    ` : "";

    let floorsHtml = "";
    if (b && b.floorsData) {
      const floorKeys = Object.keys(b.floorsData);
      const activeFk = (initFloor && b.floorsData[initFloor]) ? initFloor : floorKeys[0];
      floorsHtml = `
        <div class="floor-tabs" id="drawerFloorTabs">
          ${floorKeys.map(fk => `<button type="button" class="floor-tab ${fk === activeFk ? "active" : ""}" data-fk="${fk}">${fk === "B1" ? "B1" : fk + "F"}</button>`).join("")}
        </div>
        <div class="rooms-grid" id="drawerRoomsGrid"></div>
      `;
    }

    detailDrawer.innerHTML = `
      <div class="drawer-head">
        <h2>${title}</h2>
        <button type="button" class="close-btn" id="closeDrawerBtn">✕</button>
      </div>
      ${mediaTabsHtml}
      ${galleryHtml}
      ${videoHtml}
      <p class="drawer-summary">${summary}</p>
      <div class="tag-row">
        ${feats.map(f => `<span class="feat-tag">${f}</span>`).join("")}
      </div>
      ${floorsHtml}
    `;
    detailDrawer.hidden = false;

    detailDrawer.querySelectorAll(".media-tab").forEach(btn => {
      btn.onclick = () => {
        detailDrawer.querySelectorAll(".media-tab").forEach(t => t.classList.remove("active"));
        btn.classList.add("active");
        const isVid = btn.dataset.mtab === "video";
        const pp = document.getElementById("drawerPhotoPane");
        const vp = document.getElementById("drawerVideoPane");
        if (pp) pp.hidden = isVid;
        if (vp) vp.hidden = !isVid;
      };
    });

    document.getElementById("closeDrawerBtn").onclick = () => {
      selectedBuildingId = null;
      detailDrawer.hidden = true;
    };

    // 照片切換與燈箱放大
    if (photos.length > 0) {
      const mainImg = document.getElementById("drawerMainImg");
      const badge = document.getElementById("drawerPhotoBadge");
      document.getElementById("drawerMainPhotoWrap").onclick = () => {
        document.getElementById("lightboxImg").src = mainImg.src;
        document.getElementById("photoLightbox").hidden = false;
      };
      detailDrawer.querySelectorAll(".photo-thumb").forEach(th => {
        th.onclick = () => {
          const i = Number(th.dataset.idx);
          mainImg.src = photos[i];
          badge.textContent = `${i + 1} / ${photos.length}`;
          detailDrawer.querySelectorAll(".photo-thumb").forEach(t => t.classList.remove("active"));
          th.classList.add("active");
        };
      });
    }

    if (b && b.floorsData) {
      const floorKeys = Object.keys(b.floorsData);
      const activeFk = (initFloor && b.floorsData[initFloor]) ? initFloor : floorKeys[0];
      const showFloor = fk => {
        const rooms = b.floorsData[fk] || [];
        document.getElementById("drawerRoomsGrid").innerHTML = rooms.map(r => `
          <div class="room-chip type-${r.type || "common"} ${highlightCode && r.code === highlightCode ? "highlight" : ""}">
            <small>${r.code}</small>
            ${lang === "en" ? (r.nameEn || r.name) : r.name}
          </div>
        `).join("");
      };
      showFloor(activeFk);
      detailDrawer.querySelectorAll(".floor-tab").forEach(btn => {
        btn.onclick = () => {
          detailDrawer.querySelectorAll(".floor-tab").forEach(t => t.classList.remove("active"));
          btn.classList.add("active");
          showFloor(btn.dataset.fk);
        };
      });
    }
  }

  document.getElementById("photoLightbox").onclick = () => {
    document.getElementById("photoLightbox").hidden = true;
  };

  // --- 5. 浮動標籤 (建物、方位、道路) ---
  const labelEls = [];
  function rebuildLabels() {
    labelsOverlay.innerHTML = "";
    labelEls.length = 0;

    // 建物標籤
    D.buildings.forEach(b => {
      if (b.id === "shed_south" || b.id === "shed_east") return; // 次要鋼棚不佔標籤空間
      const el = document.createElement("button");
      el.type = "button";
      el.className = "label-3d";
      el.textContent = lang === "en" ? b.nameEn : b.name;
      el.onclick = () => selectBuilding(b.id);
      labelsOverlay.appendChild(el);
      labelEls.push({
        el,
        b,
        pos: new THREE.Vector3(b.x, b.floors * b.floorHeight + 2.0, b.z)
      });
    });

    // 東西南北方位
    (D.cardinalMarkers || []).forEach(c => {
      const el = document.createElement("div");
      el.className = "label-3d cardinal";
      el.textContent = lang === "en" ? c.labelEn : `${c.label} ・ ${c.sub}`;
      labelsOverlay.appendChild(el);
      labelEls.push({ el, isAmbient: true, pos: new THREE.Vector3(c.x, 2.5, c.z) });
    });

    // 道路標籤
    (D.externalRoads || []).forEach(rd => {
      (rd.labelPositions || []).forEach(lp => {
        const el = document.createElement("div");
        el.className = "label-3d road";
        el.textContent = lang === "en" ? lp.textEn : lp.text;
        labelsOverlay.appendChild(el);
        labelEls.push({ el, isAmbient: true, pos: new THREE.Vector3(lp.x, 1.5, lp.z) });
      });
    });
  }

  function updateLabels() {
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    const walking = walkMode && !guidedWalk;
    for (let i = 0; i < labelEls.length; i++) {
      const item = labelEls[i];
      if (walking) {
        if (item.isAmbient || !item.b) {
          item.el.style.display = "none";
          continue;
        }
        const { lx, lz } = toBuildingLocal(item.b, walkState.x, walkState.z);
        const edgeDist = Math.hypot(
          Math.max(0, Math.abs(lx) - item.b.w / 2),
          Math.max(0, Math.abs(lz) - item.b.d / 2)
        );
        if (edgeDist > 14) {
          item.el.style.display = "none";
          continue;
        }
      }
      v.copy(item.pos).project(camera);
      if (v.z > 1) {
        item.el.style.display = "none";
      } else {
        item.el.style.display = "block";
        item.el.style.left = ((v.x * 0.5 + 0.5) * w) + "px";
        item.el.style.top = ((-v.y * 0.5 + 0.5) * h) + "px";
      }
    }
  }

  // --- 6. 分區按鈕、雙語切換、測繪圖層開關 ---
  function renderZones() {
    const list = document.getElementById("zoneList");
    if (!list) return;
    list.innerHTML = D.zones.map((z, idx) => `
      <button type="button" class="zone-btn ${idx === 0 ? "active" : ""}" data-zid="${z.id}">
        ${z.icon} ${lang === "en" ? z.nameEn : z.name}
      </button>
    `).join("");

    list.querySelectorAll(".zone-btn").forEach(btn => {
      btn.onclick = () => {
        list.querySelectorAll(".zone-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const z = D.zones.find(item => item.id === btn.dataset.zid);
        if (walkMode) {
          exitWalkMode();
          if (z && z.id !== "all") flyTo(z.target, z.camPos, 750);
        } else if (z) {
          flyTo(z.target, z.camPos, 750);
        }
      };
    });
  }

  function refreshLanguageUI() {
    document.getElementById("brandTitle").textContent = lang === "en" ? D.school.englishName : `${D.school.name} 3D 校園導覽`;
    document.getElementById("brandSub").textContent = lang === "en"
      ? D.school.addressEn
      : D.school.address;
    document.getElementById("zonesHeading").textContent = lang === "en" ? "Campus Zones" : "📍 校園分區視角";
    document.getElementById("startTourBtn").textContent = lang === "en" ? "🚩 Highlight Tour" : "🚩 特色導覽";
    document.getElementById("resetOverviewBtn").textContent = lang === "en" ? "🏠 Overview" : "🏠 全校總覽";
    document.getElementById("campusSearchInput").placeholder = lang === "en"
      ? "Search class, office, Samba, pond, garden..."
      : "搜尋班級、處室、森巴、生態池、香蕉園...";
    document.getElementById("surveyToggleBtn").textContent = showSurvey
      ? (lang === "en" ? "📐 Hide Survey" : "📐 隱藏測繪底圖")
      : (lang === "en" ? "📐 Survey Overlay" : "📐 測繪對位圖層");
    document.getElementById("langToggleBtn").textContent = lang === "en" ? "🌐 中文" : "🌐 EN";
    document.getElementById("compassCap").textContent = lang === "en" ? "North Up" : "正北朝上";

    renderZones();
    rebuildLabels();
    if (tourActive) {
      showTourStop(tourIdx, false);
    } else if (selectedBuildingId) {
      const b = D.buildings.find(item => item.id === selectedBuildingId);
      if (b) renderDetailDrawer(b);
    }
    if (typeof populateNavSelects === "function") populateNavSelects();
    if (typeof renderWalkSpawns === "function") renderWalkSpawns();
  }

  // --- 6b. 智慧搜尋 ---
  const searchInput = document.getElementById("campusSearchInput");
  const searchResults = document.getElementById("searchResults");
  const searchIndex = [];
  D.buildings.forEach(b => {
    searchIndex.push({
      label: b.name, labelEn: b.nameEn,
      keywords: [b.name, b.nameEn, ...(b.features || []), ...(b.featuresEn || [])].join(" ").toLowerCase(),
      sub: "建築 / 場域", subEn: "Facility",
      bid: b.id, fk: null, code: null
    });
    if (b.floorsData) {
      Object.entries(b.floorsData).forEach(([fk, rooms]) => {
        rooms.forEach(r => {
          searchIndex.push({
            label: `${r.code} ${r.name}`, labelEn: `${r.code} ${r.nameEn || r.name}`,
            keywords: [r.code, r.name, r.nameEn || "", ...(r.aliases || []), b.name].join(" ").toLowerCase(),
            sub: `${b.name} ${fk === "B1" ? "B1" : fk + "F"}`,
            subEn: `${b.nameEn} ${fk === "B1" ? "B1" : fk + "F"}`,
            bid: b.id, fk, code: r.code
          });
        });
      });
    }
  });

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { searchResults.hidden = true; return; }
    const hits = searchIndex.filter(item => item.keywords.includes(q)).slice(0, 10);
    if (hits.length === 0) {
      searchResults.innerHTML = `<li style="cursor:default;color:#64748b;">${lang === "en" ? "No match found" : "找不到相符結果"}</li>`;
    } else {
      searchResults.innerHTML = hits.map((h, i) => `
        <li data-idx="${i}">
          <span>${lang === "en" ? h.labelEn : h.label}</span>
          <small>${lang === "en" ? h.subEn : h.sub}</small>
        </li>
      `).join("");
      searchResults.querySelectorAll("li[data-idx]").forEach(li => {
        li.onclick = () => {
          const h = hits[Number(li.dataset.idx)];
          stopTour();
          selectBuilding(h.bid, h.fk, h.code);
          searchResults.hidden = true;
          searchInput.blur();
        };
      });
    }
    searchResults.hidden = false;
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".search-box")) searchResults.hidden = true;
  });

  // --- 6c. 校慶亮點自動巡航導覽 ---
  const tourStops = window.CAMPUS_TOUR_STOPS || [];
  let tourActive = false;
  let tourPlaying = true;
  let tourIdx = 0;
  let tourTimer = null;
  const tourBar = document.getElementById("tourControlBar");

  function showTourStop(idx, doFly = true) {
    if (!tourStops.length) return;
    tourIdx = (idx + tourStops.length) % tourStops.length;
    const st = tourStops[tourIdx];
    const b = D.buildings.find(item => item.id === st.buildingId);
    selectedBuildingId = st.buildingId;
    if (doFly) flyTo(st.target, st.camPos, 950);
    renderDetailDrawer(b, null, null, st);

    document.getElementById("tourStepTitle").textContent = lang === "en" ? st.titleEn : st.titleZh;
    document.getElementById("tourStepCounter").textContent = lang === "en"
      ? `Stop ${tourIdx + 1} / ${tourStops.length}`
      : `第 ${tourIdx + 1} / ${tourStops.length} 站`;
    document.getElementById("tourPrevBtn").textContent = lang === "en" ? "◀ Prev" : "◀ 上一站";
    document.getElementById("tourNextBtn").textContent = lang === "en" ? "Next ▶" : "下一站 ▶";
    document.getElementById("tourPlayBtn").textContent = tourPlaying
      ? (lang === "en" ? "⏸ Pause" : "⏸ 暫停輪播")
      : (lang === "en" ? "▶ Auto Play" : "▶ 自動輪播");
  }

  function scheduleTourNext() {
    clearInterval(tourTimer);
    if (tourActive && tourPlaying) {
      tourTimer = setInterval(() => showTourStop(tourIdx + 1, true), 6500);
    }
  }

  function startTour() {
    if (!tourStops.length) return;
    if (walkMode) {
      walkMode = false;
      guidedWalk = null;
      clickWalkTarget = null;
      walkState.vy = 0;
      walkState.jumping = false;
      walkerGroup.visible = false;
      document.getElementById("walkHudBar").hidden = true;
      document.getElementById("guideControlBar").hidden = true;
      document.getElementById("walkModeBtn").classList.remove("active");
      document.getElementById("walkJoystick").classList.remove("visible");
      const miniWrap = document.getElementById("minimapWrap");
      if (miniWrap) miniWrap.classList.remove("visible");
    }
    tourActive = true;
    tourPlaying = true;
    tourBar.hidden = false;
    document.getElementById("startTourBtn").classList.add("active");
    showTourStop(0, true);
    scheduleTourNext();
  }

  function stopTour() {
    tourActive = false;
    clearInterval(tourTimer);
    tourBar.hidden = true;
    document.getElementById("startTourBtn").classList.remove("active");
  }

  document.getElementById("startTourBtn").onclick = () => {
    if (tourActive) stopTour(); else startTour();
  };
  document.getElementById("tourPrevBtn").onclick = () => { showTourStop(tourIdx - 1, true); scheduleTourNext(); };
  document.getElementById("tourNextBtn").onclick = () => { showTourStop(tourIdx + 1, true); scheduleTourNext(); };
  document.getElementById("tourPlayBtn").onclick = () => {
    tourPlaying = !tourPlaying;
    showTourStop(tourIdx, false);
    scheduleTourNext();
  };
  // --- 6d. 校內步行路線規劃 (A*) ---
  const navStartSel = document.getElementById("navStartSelect");
  const navEndSel = document.getElementById("navEndSelect");
  const navInfoBox = document.getElementById("navInfoBox");
  const navRouteGroup = new THREE.Group();
  scene.add(navRouteGroup);
  let activeRoutePts = null;

  function populateNavSelects() {
    const targets = Object.keys(D.buildingNavNode || {}).map(bid => D.buildings.find(b => b.id === bid)).filter(Boolean);
    const curS = navStartSel.value || "main_gate";
    const curE = navEndSel.value || "solar_court";
    const opts = targets.map(b => `<option value="${b.id}">${lang === "en" ? b.nameEn : b.name}</option>`).join("");
    navStartSel.innerHTML = opts;
    navEndSel.innerHTML = opts;
    navStartSel.value = curS;
    navEndSel.value = curE;
  }

  function findShortestPath(startNode, endNode) {
    const nodes = D.navNodes || {};
    const adj = {};
    Object.keys(nodes).forEach(k => { adj[k] = []; });
    (D.navEdges || []).forEach(([a, b]) => {
      if (!nodes[a] || !nodes[b]) return;
      const dist = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]);
      adj[a].push({ id: b, w: dist });
      adj[b].push({ id: a, w: dist });
    });

    const open = new Set([startNode]);
    const cameFrom = {};
    const gScore = { [startNode]: 0 };
    const fScore = { [startNode]: Math.hypot(nodes[startNode][0] - nodes[endNode][0], nodes[startNode][1] - nodes[endNode][1]) };

    while (open.size > 0) {
      let cur = null;
      let bestF = Infinity;
      open.forEach(n => {
        const f = fScore[n] ?? Infinity;
        if (f < bestF) { bestF = f; cur = n; }
      });
      if (cur === endNode) {
        const path = [cur];
        while (cameFrom[cur]) { cur = cameFrom[cur]; path.unshift(cur); }
        return path;
      }
      open.delete(cur);
      (adj[cur] || []).forEach(nb => {
        const tg = (gScore[cur] ?? Infinity) + nb.w;
        if (tg < (gScore[nb.id] ?? Infinity)) {
          cameFrom[nb.id] = cur;
          gScore[nb.id] = tg;
          fScore[nb.id] = tg + Math.hypot(nodes[nb.id][0] - nodes[endNode][0], nodes[nb.id][1] - nodes[endNode][1]);
          open.add(nb.id);
        }
      });
    }
    return null;
  }

  let routeArrows = [];
  let routeCurve = null;

  function clearNavRoute() {
    while (navRouteGroup.children.length) navRouteGroup.remove(navRouteGroup.children[0]);
    navInfoBox.hidden = true;
    activeRoutePts = null;
    routeArrows = [];
    routeCurve = null;
  }

  function computeTurnHints(pts, startBid) {
    const hints = [];
    // 若從入口意象出發，以來賓面對學校（西北方）為初始朝向
    let prevDx = null, prevDz = null;
    if (startBid === "main_gate") {
      prevDx = -0.86; prevDz = -0.51;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const v2x = pts[i + 1].x - pts[i].x, v2z = pts[i + 1].z - pts[i].z;
      if (prevDx !== null) {
        const cross = prevDx * v2z - prevDz * v2x;
        const dot = prevDx * v2x + prevDz * v2z;
        const ang = Math.atan2(cross, dot);
        if (Math.abs(ang) > 0.35) {
          hints.push(ang < 0 ? (lang === "en" ? "Turn Left" : "左轉") : (lang === "en" ? "Turn Right" : "右轉"));
        }
      }
      prevDx = v2x; prevDz = v2z;
    }
    return hints;
  }

  // 局部網格 A* 避障繞行：確保導引線與帶路路線自動繞過樹木、門柱、看板與建物障礙
  function findGridDetour(ax, az, bx, bz) {
    const step = 1.0;
    const pad = 12;
    const minX = Math.floor(Math.min(ax, bx) - pad);
    const maxX = Math.ceil(Math.max(ax, bx) + pad);
    const minZ = Math.floor(Math.min(az, bz) - pad);
    const maxZ = Math.ceil(Math.max(az, bz) + pad);
    const sx = Math.round(ax), sz = Math.round(az);
    const gx = Math.round(bx), gz = Math.round(bz);
    const key = (x, z) => `${x},${z}`;
    const open = new Set([key(sx, sz)]);
    const came = {};
    const gMap = { [key(sx, sz)]: 0 };
    const fMap = { [key(sx, sz)]: Math.hypot(gx - sx, gz - sz) };
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    let iter = 0;

    while (open.size > 0 && iter++ < 2800) {
      let cur = null, bestF = Infinity;
      open.forEach(k => { const f = fMap[k] ?? Infinity; if (f < bestF) { bestF = f; cur = k; } });
      if (!cur) break;
      const [cx, cz] = cur.split(",").map(Number);
      if (Math.hypot(cx - gx, cz - gz) <= 1.2) {
        const res = [];
        let c = cur;
        while (c && came[c]) {
          const [px, pz] = c.split(",").map(Number);
          res.unshift(new THREE.Vector3(px, 0.25, pz));
          c = came[c];
        }
        return res;
      }
      open.delete(cur);
      for (let i = 0; i < dirs.length; i++) {
        const nx = cx + dirs[i][0] * step;
        const nz = cz + dirs[i][1] * step;
        if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
        const nk = key(nx, nz);
        if ((nx !== gx || nz !== gz) && isBlocked(nx, nz, 0)) continue;
        const tg = (gMap[cur] ?? Infinity) + Math.hypot(dirs[i][0], dirs[i][1]);
        if (tg < (gMap[nk] ?? Infinity)) {
          came[nk] = cur;
          gMap[nk] = tg;
          fMap[nk] = tg + Math.hypot(gx - nx, gz - nz);
          open.add(nk);
        }
      }
    }
    return null;
  }

  function resolveObstacleFreePts(rawPts) {
    if (!rawPts || rawPts.length < 2) return rawPts;
    const out = [rawPts[0].clone()];
    for (let i = 0; i < rawPts.length - 1; i++) {
      const a = rawPts[i], b = rawPts[i + 1];
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      const samples = Math.max(2, Math.ceil(dist / 0.75));
      let hit = false;
      for (let s = 1; s < samples; s++) {
        const t = s / samples;
        if (isBlocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0)) { hit = true; break; }
      }
      if (hit) {
        const detour = findGridDetour(a.x, a.z, b.x, b.z);
        if (detour && detour.length > 0) {
          detour.forEach(p => {
            const prev = out[out.length - 1];
            if (Math.hypot(p.x - prev.x, p.z - prev.z) > 1.2) out.push(p);
          });
        }
      }
      const prev = out[out.length - 1];
      if (Math.hypot(b.x - prev.x, b.z - prev.z) > 0.5) out.push(b.clone());
    }
    return out;
  }

  document.getElementById("runNavBtn").onclick = () => {
    const sBid = navStartSel.value, eBid = navEndSel.value;
    const sNode = D.buildingNavNode[sBid], eNode = D.buildingNavNode[eBid];
    if (!sNode || !eNode) return;
    clearNavRoute();
    const pathIds = findShortestPath(sNode, eNode);
    if (!pathIds || pathIds.length < 2) {
      navInfoBox.hidden = false;
      navInfoBox.textContent = lang === "en" ? "Same location or no path." : "起終點相同或無連通路徑。";
      return;
    }

    const rawPts = pathIds.map(id => new THREE.Vector3(D.navNodes[id][0], 0.25, D.navNodes[id][1]));
    const pts = resolveObstacleFreePts(rawPts);
    activeRoutePts = pts;

    // 低調淺灰色細導引線 (避免太顯眼)
    routeCurve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.15);
    const tubeGeo = new THREE.TubeGeometry(routeCurve, pts.length * 12, 0.22, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.72 });
    navRouteGroup.add(new THREE.Mesh(tubeGeo, tubeMat));

    // 動態前進箭頭
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
    const arrowGeo = new THREE.ConeGeometry(0.45, 1.05, 8);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowCount = Math.max(4, Math.min(16, Math.floor(routeCurve.getLength() / 8)));
    for (let i = 0; i < arrowCount; i++) {
      const m = new THREE.Mesh(arrowGeo, arrowMat);
      navRouteGroup.add(m);
      routeArrows.push({ mesh: m, offset: i / arrowCount });
    }

    // 起終點標記柱
    [[pts[0], 0x22c55e], [pts[pts.length - 1], 0xef4444]].forEach(([p, col]) => {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.18, 2.8, 12), new THREE.MeshLambertMaterial({ color: col }));
      pin.position.set(p.x, 1.6, p.z);
      navRouteGroup.add(pin);
    });

    let totalDist = 0;
    for (let i = 1; i < pts.length; i++) totalDist += pts[i].distanceTo(pts[i - 1]);
    const secs = Math.round(totalDist / 1.3);
    const turns = computeTurnHints(pts, sBid);
    const turnStr = turns.length
      ? `${lang === "en" ? "Turns" : "轉彎指引"}：${turns.slice(0, 5).join(" → ")}${turns.length > 5 ? " ..." : ""}`
      : (lang === "en" ? "Go straight" : "直行即可抵達");

    const sB = D.buildings.find(x => x.id === sBid);
    const eB = D.buildings.find(x => x.id === eBid);
    const sLabel = sB ? (lang === "en" ? sB.nameEn : sB.name) : sBid;
    const eLabel = eB ? (lang === "en" ? eB.nameEn : eB.name) : eBid;

    navInfoBox.hidden = false;
    navInfoBox.innerHTML = `
      <div>${lang === "en" ? "Distance" : "步行距離"}：<b>${Math.round(totalDist)} m</b>（約 ${secs} ${lang === "en" ? "sec" : "秒"}）</div>
      <div style="font-size:0.72rem;color:#475569;margin-top:2px;">${turnStr}</div>
      <button type="button" class="pill-btn active" id="guideWalkBtn" style="margin-top:6px;width:100%;padding:5px;">🚶 ${lang === "en" ? "Simulate Auto-Guide" : "模擬自動帶路"}</button>
    `;
    document.getElementById("guideWalkBtn").onclick = () => startGuidedWalk(pts, sLabel, eLabel, totalDist, secs, eBid);
  };
  document.getElementById("clearNavBtn").onclick = clearNavRoute;

  // --- 6e. 校園實境漫步系統 (森巴鼓隊卡通人物 + 第三/第一人稱 + 碰撞檢測 + 點擊地面行走) ---
  let walkMode = false;
  let walkFirstPerson = false;
  let walkGender = "boy";
  let walkFollowDist = 5.5;
  let clickWalkTarget = null;
  let guidedWalk = null;
  const walkState = { x: 54, z: 39, y: 0, vy: 0, jumping: false, yaw: 1.05, pitch: 0.08, stepPhase: 0 };

  const walkerGroup = new THREE.Group();
  const walkerParts = {};
  function buildWalkerAvatar() {
    while (walkerGroup.children.length) walkerGroup.remove(walkerGroup.children[0]);
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xf5cba7 });
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x1e1b18 });
    const jerseyMat = new THREE.MeshLambertMaterial({ color: 0xdc2626 }); // 森巴紅黃球衣
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
    const collarBlue = new THREE.MeshLambertMaterial({ color: 0x0284c7 });
    const collarOrg = new THREE.MeshLambertMaterial({ color: 0xf97316 });
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });

    // 頭部與擬真五官 (眼、眉、鼻、口)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skinMat);
    head.position.y = 1.42;
    head.castShadow = true;
    walkerGroup.add(head);

    const eyeW = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const pupilM = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    [-0.075, 0.075].forEach(ex => {
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), eyeW);
      sclera.position.set(ex, 1.44, -0.19);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), pupilM);
      pupil.position.set(ex, 1.44, -0.215);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.02), hairMat);
      brow.position.set(ex, 1.50, -0.20);
      walkerGroup.add(sclera, pupil, brow);
    });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), new THREE.MeshLambertMaterial({ color: 0xe5a882 }));
    nose.position.set(0, 1.40, -0.22);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.02), new THREE.MeshLambertMaterial({ color: 0xbe123c }));
    mouth.position.set(0, 1.33, -0.205);
    walkerGroup.add(nose, mouth);

    // 髮型 (男生短髮 / 女生馬尾長髮) + 森巴羽毛帽
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.225, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
    hairBack.position.set(0, 1.44, 0.02);
    walkerGroup.add(hairBack);
    if (walkGender === "girl") {
      const ponytail = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.035, 0.34, 8), hairMat);
      ponytail.position.set(0, 1.32, 0.22);
      ponytail.rotation.x = 0.4;
      walkerGroup.add(ponytail);
    }

    // 森巴帽與羽飾
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.12, 14), collarBlue);
    cap.position.set(0, 1.58, 0);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.18), jerseyMat);
    visor.position.set(0, 1.53, -0.20);
    const feather1 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 6), new THREE.MeshLambertMaterial({ color: 0x38bdf8 }));
    feather1.position.set(-0.04, 1.72, 0.02);
    feather1.rotation.z = 0.22;
    const feather2 = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 6), collarOrg);
    feather2.position.set(0.05, 1.70, 0.03);
    feather2.rotation.z = -0.25;
    walkerGroup.add(cap, visor, feather1, feather2);

    // 身體：紅黃森巴鼓隊服 + 藍橘領飾
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.24), jerseyMat);
    torso.position.y = 0.96;
    torso.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.1, 0.25), stripeMat);
    stripe.position.y = 0.88;
    stripe.rotation.z = 0.28;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.27, 0.14, 12), collarOrg);
    collar.position.y = 1.16;
    const collarRim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 6, 14), collarBlue);
    collarRim.rotation.x = Math.PI / 2;
    collarRim.position.y = 1.12;
    walkerGroup.add(torso, stripe, collar, collarRim);

    // 女生百褶運動裙
    if (walkGender === "girl") {
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.29, 0.22, 12), pantsMat);
      skirt.position.y = 0.64;
      walkerGroup.add(skirt);
    }

    // 雙臂與雙腳
    const armGeo = new THREE.BoxGeometry(0.11, 0.42, 0.11);
    walkerParts.armL = new THREE.Mesh(armGeo, skinMat);
    walkerParts.armL.position.set(-0.28, 0.95, 0);
    walkerParts.armR = new THREE.Mesh(armGeo, skinMat);
    walkerParts.armR.position.set(0.28, 0.95, 0);
    walkerGroup.add(walkerParts.armL, walkerParts.armR);

    const legGeo = new THREE.BoxGeometry(0.14, 0.52, 0.14);
    walkerParts.legL = new THREE.Mesh(legGeo, pantsMat);
    walkerParts.legL.position.set(-0.11, 0.34, 0);
    walkerParts.legR = new THREE.Mesh(legGeo, pantsMat);
    walkerParts.legR.position.set(0.11, 0.34, 0);
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.22), shoeMat);
    shoeL.position.set(0, -0.26, -0.03);
    walkerParts.legL.add(shoeL);
    walkerParts.legR.add(shoeL.clone());
    walkerGroup.add(walkerParts.legL, walkerParts.legR);

    walkerGroup.visible = false;
    scene.add(walkerGroup);
  }
  buildWalkerAvatar();

  function toBuildingLocal(b, wx, wz) {
    const dx = wx - b.x;
    const dz = wz - b.z;
    const c = Math.cos(b.rotY || 0);
    const s = Math.sin(b.rotY || 0);
    return { lx: dx * c - dz * s, lz: dx * s + dz * c };
  }

  function isBlocked(nx, nz, curY = 0) {
    const curFloor = curY > 2.0 ? "2" : "1";
    const cols = built.colliders || [];
    const pad = 0.26;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      if (col.floors !== "both" && col.floors !== curFloor) continue;
      const { lx, lz } = toBuildingLocal(col.b, nx, nz);
      if (lx >= col.lxMin - pad && lx <= col.lxMax + pad && lz >= col.lzMin - pad && lz <= col.lzMax + pad) {
        return true;
      }
    }
    if (curY < 2.8) {
      const trees = built.treeColliders || [];
      for (let i = 0; i < trees.length; i++) {
        const tc = trees[i];
        if (Math.hypot(nx - tc.x, nz - tc.z) < tc.r) return true;
      }
      const extras = built.extraWorldColliders || [];
      for (let i = 0; i < extras.length; i++) {
        const ec = extras[i];
        if (Math.hypot(nx - ec.x, nz - ec.z) < ec.r) return true;
      }
    }
    if (curY < 2.0) {
      for (let i = 0; i < D.buildings.length; i++) {
        const b = D.buildings[i];
        if (b.noCollide || (b.style && b.style.startsWith("wing_")) || b.style === "corridor" ||
            b.style === "track" || b.style === "mural3d" || b.style === "banana" || b.style === "toilet" ||
            b.style === "samba" || b.style === "playground" || b.style === "gate" || b.style === "pond" || b.style === "solar_court") {
          continue;
        }
        const { lx, lz } = toBuildingLocal(b, nx, nz);
        if (Math.abs(lx) < b.w / 2 + 0.22 && Math.abs(lz) < b.d / 2 + 0.22) {
          return true;
        }
      }
    }
    return false;
  }

  function getWalkElevation(wx, wz, curY) {
    const zones = built.walkZones || [];
    let bestY = null;
    let bestDiff = Infinity;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const { lx, lz } = toBuildingLocal(z.b, wx, wz);
      if (lx < z.lxMin - 0.35 || lx > z.lxMax + 0.35 || lz < z.lzMin - 0.35 || lz > z.lzMax + 0.35) continue;
      let ty = z.y0;
      if (z.rampAxis === "x") {
        const t = Math.max(0, Math.min(1, (lx - z.lxMin) / (z.lxMax - z.lxMin)));
        ty = z.y0 + (z.y1 - z.y0) * t;
      } else if (z.rampAxis === "z") {
        const t = Math.max(0, Math.min(1, (lz - z.lzMin) / (z.lzMax - z.lzMin)));
        ty = z.y0 + (z.y1 - z.y0) * t;
      }
      const diff = Math.abs(ty - curY);
      if (diff <= 1.45 && diff < bestDiff) {
        bestDiff = diff;
        bestY = ty;
      }
    }
    return bestY !== null ? bestY : 0;
  }

  function isInsideCorridorRoof(wx, wz) {
    for (let i = 0; i < D.buildings.length; i++) {
      const b = D.buildings[i];
      if (!((b.style && b.style.startsWith("wing_")) || b.style === "corridor")) continue;
      const { lx, lz } = toBuildingLocal(b, wx, wz);
      if (Math.abs(lx) < b.w / 2 + 0.6 && Math.abs(lz) < b.d / 2 + 0.6) return true;
    }
    return false;
  }

  function enterWalkMode(spawn) {
    stopTour();
    walkMode = true;
    flyAnim = null;
    if (spawn) {
      walkState.x = spawn.x; walkState.z = spawn.z; walkState.y = spawn.y || 0; walkState.yaw = spawn.yaw || 0;
    } else {
      walkState.y = getWalkElevation(walkState.x, walkState.z, walkState.y);
    }
    document.getElementById("walkHudBar").hidden = false;
    document.getElementById("walkModeBtn").classList.add("active");
    document.getElementById("walkJoystick").classList.add("visible");
    const miniWrap = document.getElementById("minimapWrap");
    if (miniWrap && !guidedWalk && minimapEnabled) miniWrap.classList.add("visible");
    walkerGroup.visible = !walkFirstPerson;
  }

  function exitWalkMode() {
    walkMode = false;
    guidedWalk = null;
    walkState.vy = 0;
    walkState.jumping = false;
    walkerGroup.visible = false;
    clickWalkTarget = null;
    document.getElementById("walkHudBar").hidden = true;
    document.getElementById("guideControlBar").hidden = true;
    document.getElementById("walkModeBtn").classList.remove("active");
    document.getElementById("walkJoystick").classList.remove("visible");
    const miniWrap = document.getElementById("minimapWrap");
    if (miniWrap) miniWrap.classList.remove("visible");
    const z0 = D.zones[0];
    flyTo(z0.target, z0.camPos, 650);
  }

  function stopGuidedWalk() {
    guidedWalk = null;
    document.getElementById("guideControlBar").hidden = true;
    exitWalkMode();
  }

  function startGuidedWalk(pts, startLabel, endLabel, totalDist, secs, endBid) {
    clickWalkTarget = null;
    enterWalkMode({ x: pts[0].x, z: pts[0].z, yaw: Math.atan2(pts[0].x - pts[1].x, pts[0].z - pts[1].z) });
    document.getElementById("walkHudBar").hidden = true; // 模擬帶路時顯示專用帶路面板
    guidedWalk = {
      pts, idx: 1, totalDist: totalDist || 1, traveled: 0,
      paused: false, speed: 1, topView: false, endBid: endBid || null
    };
    const bar = document.getElementById("guideControlBar");
    bar.hidden = false;
    document.getElementById("guideRouteTitle").textContent = `${startLabel} → ${endLabel}`;
    document.getElementById("guideRouteMeta").textContent = lang === "en"
      ? `Est. ${Math.round(totalDist)} m ・ ~${secs} sec`
      : `預估步行距離約 ${Math.round(totalDist)} 公尺 ・ 步行時間約 ${secs} 秒`;
    document.getElementById("guidePauseBtn").textContent = lang === "en" ? "⏸ Pause" : "⏸ 暫停帶路";
    document.getElementById("guideSpeedBtn").textContent = "⚡ 1x";
    document.getElementById("guideTopViewBtn").classList.remove("active");
    document.getElementById("guideProgressFill").style.width = "0%";
  }

  document.getElementById("guidePauseBtn").onclick = () => {
    if (!guidedWalk) return;
    guidedWalk.paused = !guidedWalk.paused;
    document.getElementById("guidePauseBtn").textContent = guidedWalk.paused
      ? (lang === "en" ? "▶ Resume" : "▶ 繼續帶路")
      : (lang === "en" ? "⏸ Pause" : "⏸ 暫停帶路");
  };
  document.getElementById("guideSpeedBtn").onclick = () => {
    if (!guidedWalk) return;
    guidedWalk.speed = guidedWalk.speed === 1 ? 2 : 1;
    document.getElementById("guideSpeedBtn").textContent = guidedWalk.speed === 2 ? "⚡ 2x 快速" : "⚡ 1x 正常";
  };
  document.getElementById("guideTopViewBtn").onclick = () => {
    if (!guidedWalk) return;
    guidedWalk.topView = !guidedWalk.topView;
    document.getElementById("guideTopViewBtn").classList.toggle("active", guidedWalk.topView);
  };
  document.getElementById("guideCloseBtn").onclick = stopGuidedWalk;

  document.getElementById("walkModeBtn").onclick = () => {
    if (walkMode) exitWalkMode(); else enterWalkMode((D.walkSpawns || [])[0]);
  };
  document.getElementById("exitWalkBtn").onclick = exitWalkMode;
  document.getElementById("charBoyBtn").onclick = () => {
    walkGender = "boy"; buildWalkerAvatar(); walkerGroup.visible = walkMode && !walkFirstPerson;
    document.getElementById("charBoyBtn").classList.add("active");
    document.getElementById("charGirlBtn").classList.remove("active");
  };
  document.getElementById("charGirlBtn").onclick = () => {
    walkGender = "girl"; buildWalkerAvatar(); walkerGroup.visible = walkMode && !walkFirstPerson;
    document.getElementById("charGirlBtn").classList.add("active");
    document.getElementById("charBoyBtn").classList.remove("active");
  };
  let minimapEnabled = true;
  function syncMinimapVisibility() {
    const miniWrap = document.getElementById("minimapWrap");
    const miniBtn = document.getElementById("walkMinimapBtn");
    if (miniWrap) {
      miniWrap.classList.toggle("visible", walkMode && !guidedWalk && minimapEnabled);
    }
    if (miniBtn) miniBtn.classList.toggle("active", minimapEnabled);
  }
  const miniCloseBtn = document.getElementById("minimapCloseBtn");
  if (miniCloseBtn) {
    miniCloseBtn.onclick = () => { minimapEnabled = false; syncMinimapVisibility(); };
  }
  const walkMiniBtn = document.getElementById("walkMinimapBtn");
  if (walkMiniBtn) {
    walkMiniBtn.onclick = () => { minimapEnabled = !minimapEnabled; syncMinimapVisibility(); };
  }

  document.getElementById("walkCamModeBtn").onclick = () => {
    walkFirstPerson = !walkFirstPerson;
    walkerGroup.visible = walkMode && !walkFirstPerson;
    document.getElementById("walkCamModeBtn").textContent = walkFirstPerson
      ? (lang === "en" ? "👁️ 1st Person" : "👁️ 第一人稱")
      : (lang === "en" ? "🎥 3rd Person" : "🎥 第三人稱");
  };

  function renderWalkSpawns() {
    const box = document.getElementById("walkSpawnBtns");
    if (!box) return;
    box.innerHTML = (D.walkSpawns || []).map(sp => `
      <button type="button" class="walk-chip" data-spid="${sp.id}">${lang === "en" ? sp.nameEn : sp.name}</button>
    `).join("");
    box.querySelectorAll(".walk-chip").forEach(btn => {
      btn.onclick = () => {
        guidedWalk = null;
        const sp = D.walkSpawns.find(s => s.id === btn.dataset.spid);
        if (sp) enterWalkMode(sp);
      };
    });
  }

  // 平板／手機左下角虛擬輪盤事件（支援觸控與滑鼠拖曳）
  const joyEl = document.getElementById("walkJoystick");
  const joyKnob = document.getElementById("walkJoyKnob");
  const joyInput = { fwd: 0, turn: 0 };
  let joyActive = false;
  function updateJoyFromPoint(clientX, clientY) {
    const rect = joyEl.getBoundingClientRect();
    let dx = clientX - (rect.left + rect.width / 2);
    let dy = clientY - (rect.top + rect.height / 2);
    const maxR = 32;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) { dx = dx * maxR / dist; dy = dy * maxR / dist; }
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    joyInput.fwd = -dy / maxR;
    joyInput.turn = -dx / maxR;
  }
  function resetJoy() {
    joyActive = false;
    joyKnob.style.transform = "";
    joyInput.fwd = 0; joyInput.turn = 0;
  }
  joyEl.addEventListener("pointerdown", e => {
    e.preventDefault();
    joyActive = true;
    if (joyEl.setPointerCapture) joyEl.setPointerCapture(e.pointerId);
    updateJoyFromPoint(e.clientX, e.clientY);
  });
  joyEl.addEventListener("pointermove", e => {
    if (!joyActive) return;
    e.preventDefault();
    updateJoyFromPoint(e.clientX, e.clientY);
  });
  joyEl.addEventListener("pointerup", resetJoy);
  joyEl.addEventListener("pointercancel", resetJoy);

  populateNavSelects();
  renderWalkSpawns();

  document.getElementById("resetOverviewBtn").onclick = () => {
    if (walkMode) { exitWalkMode(); return; }
    const z0 = D.zones[0];
    flyTo(z0.target, z0.camPos, 700);
  };
  document.getElementById("compassResetBtn").onclick = () => {
    flyTo([camState.target.x, camState.target.y, camState.target.z],
      [camState.target.x, camState.target.y + camState.dist * Math.sin(camState.pitch), camState.target.z + camState.dist * Math.cos(camState.pitch)],
      500);
  };
  document.getElementById("surveyToggleBtn").onclick = () => {
    showSurvey = !showSurvey;
    built.surveyGroup.visible = showSurvey;
    document.getElementById("surveyToggleBtn").classList.toggle("active", showSurvey);
    refreshLanguageUI();
  };
  document.getElementById("langToggleBtn").onclick = () => {
    lang = lang === "zh" ? "en" : "zh";
    refreshLanguageUI();
  };

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- 7. 小地圖 (Minimap) ---
  const miniCanvas = document.getElementById("minimapCanvas");
  const miniCtx = miniCanvas ? miniCanvas.getContext("2d") : null;
  const miniBounds = { xMin: -135, xMax: 105, zMin: -58, zMax: 122 };
  function worldToMini(wx, wz) {
    const mx = ((wx - miniBounds.xMin) / (miniBounds.xMax - miniBounds.xMin)) * miniCanvas.width;
    const my = ((wz - miniBounds.zMin) / (miniBounds.zMax - miniBounds.zMin)) * miniCanvas.height;
    return [mx, my];
  }
  function renderMinimap() {
    if (!miniCtx || !walkMode) return;
    const w = miniCanvas.width, h = miniCanvas.height;
    miniCtx.clearRect(0, 0, w, h);
    miniCtx.fillStyle = "#e6e4dd";
    miniCtx.fillRect(0, 0, w, h);

    if (D.campusBoundary && D.campusBoundary.length > 2) {
      miniCtx.beginPath();
      D.campusBoundary.forEach(([bx, bz], i) => {
        const [mx, my] = worldToMini(bx, bz);
        if (i === 0) miniCtx.moveTo(mx, my); else miniCtx.lineTo(mx, my);
      });
      miniCtx.closePath();
      miniCtx.fillStyle = "#bfe3a6";
      miniCtx.fill();
      miniCtx.strokeStyle = "#94a3b8";
      miniCtx.lineWidth = 1;
      miniCtx.stroke();
    }

    (D.buildings || []).forEach(b => {
      if (b.style === "gate" || b.style === "mural3d") return;
      const [mx, my] = worldToMini(b.x, b.z);
      miniCtx.save();
      miniCtx.translate(mx, my);
      miniCtx.rotate(-(b.rotY || 0));
      const bw = Math.max(3, (b.w / (miniBounds.xMax - miniBounds.xMin)) * w);
      const bd = Math.max(3, (b.d / (miniBounds.zMax - miniBounds.zMin)) * h);
      miniCtx.fillStyle = b.style === "track" ? "#c14d3a" : b.style === "pond" ? "#38bdf8" : b.style === "solar_court" ? "#3b82f6" : "#64748b";
      miniCtx.fillRect(-bw / 2, -bd / 2, bw, bd);
      miniCtx.restore();
    });

    if (activeRoutePts && activeRoutePts.length > 1) {
      miniCtx.beginPath();
      activeRoutePts.forEach((p, i) => {
        const [mx, my] = worldToMini(p.x, p.z);
        if (i === 0) miniCtx.moveTo(mx, my); else miniCtx.lineTo(mx, my);
      });
      miniCtx.strokeStyle = "#f97316";
      miniCtx.lineWidth = 2;
      miniCtx.stroke();
    }

    const px = walkMode ? walkState.x : camState.target.x;
    const pz = walkMode ? walkState.z : camState.target.z;
    const pyaw = walkMode ? walkState.yaw : camState.yaw;
    const [mx, my] = worldToMini(px, pz);

    miniCtx.save();
    miniCtx.translate(mx, my);
    miniCtx.rotate(-pyaw);
    miniCtx.beginPath();
    miniCtx.moveTo(0, 0);
    miniCtx.arc(0, 0, 16, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42);
    miniCtx.closePath();
    miniCtx.fillStyle = "rgba(37, 99, 235, 0.28)";
    miniCtx.fill();
    miniCtx.restore();

    miniCtx.beginPath();
    miniCtx.arc(mx, my, 4, 0, Math.PI * 2);
    miniCtx.fillStyle = "#ef4444";
    miniCtx.fill();
    miniCtx.strokeStyle = "#fff";
    miniCtx.lineWidth = 1.5;
    miniCtx.stroke();
  }

  if (miniCanvas) {
    miniCanvas.addEventListener("click", e => {
      const rect = miniCanvas.getBoundingClientRect();
      const rx = (e.clientX - rect.left) / rect.width;
      const ry = (e.clientY - rect.top) / rect.height;
      const wx = miniBounds.xMin + rx * (miniBounds.xMax - miniBounds.xMin);
      const wz = miniBounds.zMin + ry * (miniBounds.zMax - miniBounds.zMin);
      if (walkMode && !guidedWalk) {
        if (!isBlocked(wx, wz, walkState.y)) {
          walkState.x = wx; walkState.z = wz;
          walkState.y = getWalkElevation(wx, wz, walkState.y);
          clickWalkTarget = null;
        }
      } else {
        flyTo([wx, 2, wz], [wx + 18, Math.max(38, camState.dist * 0.55), wz + 28], 550);
      }
    });
  }

  // --- 8. 後台管理編輯系統 (方案 B：Firebase 免費雲端 + 真實 Google 帳號登入，未設定時自動降級本機模式) ---
  const ADMIN_DATA_KEY = "sjes_admin_override_v1";
  const ADMIN_USERS_KEY = "sjes_admin_users_v1";
  const defaultAdmins = [
    { name: "溪洲國小系統管理員", email: "johngerlee@gmail.com" },
  ];

  let fbAuth = null, fbDb = null, fbReady = false;
  (function initFirebase() {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.enabled || !cfg.apiKey || typeof firebase === "undefined") return;
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      fbAuth = firebase.auth();
      fbDb = firebase.firestore();
      fbReady = true;
      // 啟動時從 Firestore 載入全校即時最新資料
      fbDb.collection("campus").doc("schoolYearOverrides").get().then(doc => {
        if (doc.exists && doc.data()) {
          const ov = doc.data();
          localStorage.setItem(ADMIN_DATA_KEY, JSON.stringify(ov));
          D.buildings.forEach(b => { if (ov[b.id]) Object.assign(b, ov[b.id]); });
          populateNavSelects();
        }
      }).catch(() => {});
      fbDb.collection("campus").doc("adminUsers").get().then(doc => {
        if (doc.exists && Array.isArray(doc.data().list) && doc.data().list.length) {
          localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(doc.data().list));
        }
      }).catch(() => {});
    } catch (e) { console.warn("Firebase init skipped:", e); }
  })();

  function loadAdmins() {
    try {
      const raw = localStorage.getItem(ADMIN_USERS_KEY);
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
    } catch (_) {}
    return defaultAdmins.slice();
  }
  function saveAdminsList(arr) {
    localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(arr));
    if (fbReady && fbDb) {
      fbDb.collection("campus").doc("adminUsers").set({ list: arr }).catch(e => alert("雲端同步失敗：" + e.message));
    }
  }
  function applyAdminOverrides() {
    try {
      const raw = localStorage.getItem(ADMIN_DATA_KEY);
      if (!raw) return;
      const ov = JSON.parse(raw);
      D.buildings.forEach(b => {
        if (ov[b.id]) Object.assign(b, ov[b.id]);
      });
    } catch (_) {}
  }
  applyAdminOverrides();

  let adminAuthedUser = null;
  let adminTab = "rooms";
  let adminBid = "bldg_a";
  const adminModal = document.getElementById("adminModal");
  const adminDialog = document.getElementById("adminDialog");

  function saveBuildingOverride(b) {
    try {
      const raw = localStorage.getItem(ADMIN_DATA_KEY);
      const ov = raw ? JSON.parse(raw) : {};
      ov[b.id] = {
        name: b.name, nameEn: b.nameEn,
        summary: b.summary, summaryEn: b.summaryEn,
        photos: b.photos || [],
        youtubeUrl: b.youtubeUrl || "",
        floorsData: b.floorsData || null
      };
      localStorage.setItem(ADMIN_DATA_KEY, JSON.stringify(ov));
      if (fbReady && fbDb) {
        fbDb.collection("campus").doc("schoolYearOverrides").set({ [b.id]: ov[b.id] }, { merge: true })
          .catch(e => alert("雲端寫入失敗（請檢查 Firestore 權限）：" + e.message));
      }
      if (selectedBuildingId === b.id && !detailDrawer.hidden) renderDetailDrawer(b);
      populateNavSelects();
    } catch (err) {
      alert("儲存失敗（可能照片過大超過瀏覽器容量）：" + err.message);
    }
  }

  function renderAdminModal() {
    const admins = loadAdmins();
    if (!adminAuthedUser) {
      adminDialog.innerHTML = `
        <div class="admin-header">
          <h3 style="margin:0;">⚙️ 校園導覽後台登入 ${fbReady ? "(Firebase 雲端版)" : "(尚未填入 Firebase 金鑰・本機預覽)"}</h3>
          <button type="button" class="close-btn" id="adminCloseBtn">✕</button>
        </div>
        ${fbReady ? `
          <p style="font-size:0.84rem;color:#475569;margin:0 0 12px;">請使用已授權之 Google 帳號登入後台，編輯後將即時同步至全校訪客：</p>
          <button type="button" class="pill-btn active" id="googleSignInBtn" style="width:100%;margin-bottom:10px;">🔐 使用 Google 帳號登入 (Firebase Auth)</button>
        ` : `
          <p style="font-size:0.82rem;color:#475569;margin:0 0 10px;">目前尚未於 <code>data/firebase-config.js</code> 啟用 Firebase，暫以本機管理者測試模式登入（預設：<code>${admins[0].email}</code>）：</p>
          <div class="admin-field">
            <label>Google 帳號 Email</label>
            <input type="email" id="adminLoginEmail" value="${admins[0].email}" placeholder="example@gmail.com">
          </div>
          <button type="button" class="pill-btn active" id="adminLoginSubmit" style="width:100%;">登入後台管理</button>
        `}
      `;
      document.getElementById("adminCloseBtn").onclick = () => { adminModal.hidden = true; };
      if (fbReady) {
        document.getElementById("googleSignInBtn").onclick = () => {
          const provider = new firebase.auth.GoogleAuthProvider();
          fbAuth.signInWithPopup(provider).then(res => {
            const em = (res.user.email || "").toLowerCase();
            const found = loadAdmins().find(a => a.email.toLowerCase() === em);
            if (!found) {
              fbAuth.signOut();
              alert(`帳號 ${em} 不在管理者白名單中！請先由現任管理者於後台新增您的 Google 帳號。`);
              return;
            }
            adminAuthedUser = { name: res.user.displayName || found.name, email: em };
            renderAdminModal();
          }).catch(err => alert("Google 登入失敗：" + err.message));
        };
      } else {
        document.getElementById("adminLoginSubmit").onclick = () => {
          const em = document.getElementById("adminLoginEmail").value.trim().toLowerCase();
          const found = loadAdmins().find(a => a.email.toLowerCase() === em);
          if (!found) { alert("此 Google 帳號未在管理者名單中！"); return; }
          adminAuthedUser = found;
          renderAdminModal();
        };
      }
      return;
    }

    const b = D.buildings.find(x => x.id === adminBid) || D.buildings[0];
    let bodyHtml = "";

    if (adminTab === "rooms") {
      const fKeys = b.floorsData ? Object.keys(b.floorsData) : ["1"];
      const roomsHtml = fKeys.map(fk => `
        <div style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <strong>${fk === "B1" ? "B1" : fk + "F"} 空間清單</strong>
            <button type="button" class="walk-chip admin-add-room" data-fk="${fk}">＋ 新增空間</button>
          </div>
          ${(b.floorsData && b.floorsData[fk] ? b.floorsData[fk] : []).map((r, idx) => `
            <div class="admin-room-row">
              <input class="ar-code" data-fk="${fk}" data-idx="${idx}" value="${r.code || ""}" placeholder="編號">
              <input class="ar-name" data-fk="${fk}" data-idx="${idx}" value="${r.name || ""}" placeholder="中文名稱">
              <input class="ar-nameEn" data-fk="${fk}" data-idx="${idx}" value="${r.nameEn || ""}" placeholder="English">
              <select class="ar-type" data-fk="${fk}" data-idx="${idx}">
                ${["class6","class5","class4","class3","class2","class1","office","special","sport","common"].map(t => `<option value="${t}" ${r.type === t ? "selected" : ""}>${t}</option>`).join("")}
              </select>
              <button type="button" class="close-btn admin-del-room" data-fk="${fk}" data-idx="${idx}">✕</button>
            </div>
          `).join("")}
        </div>
      `).join("");

      bodyHtml = `
        <div class="admin-field">
          <label>選擇校舍 / 場域</label>
          <select id="adminBldgSel">
            ${D.buildings.map(item => `<option value="${item.id}" ${item.id === b.id ? "selected" : ""}>${item.name}</option>`).join("")}
          </select>
        </div>
        <div class="admin-grid">
          <div class="admin-field"><label>場域名稱（中文）</label><input id="abName" value="${b.name}"></div>
          <div class="admin-field"><label>場域名稱（English）</label><input id="abNameEn" value="${b.nameEn}"></div>
        </div>
        <div class="admin-field"><label>場域簡介</label><textarea id="abSummary" rows="2">${b.summary}</textarea></div>
        ${roomsHtml}
        <button type="button" class="pill-btn active" id="adminSaveBldgBtn" style="margin-top:12px;width:100%;">💾 儲存校舍與教室變更</button>
      `;
    } else if (adminTab === "media") {
      const photos = b.photos || [];
      bodyHtml = `
        <div class="admin-field">
          <label>選擇校舍 / 場域</label>
          <select id="adminBldgSel">
            ${D.buildings.map(item => `<option value="${item.id}" ${item.id === b.id ? "selected" : ""}>${item.name}</option>`).join("")}
          </select>
        </div>
        <div class="admin-field">
          <label>YouTube 導覽影片網址</label>
          <input id="abYoutube" value="${b.youtubeUrl || ""}" placeholder="https://youtu.be/...">
        </div>
        <div class="admin-field">
          <label>上傳實景照片（自動壓縮儲存）</label>
          <input type="file" id="abPhotoUpload" accept="image/*" multiple>
        </div>
        <div>
          ${photos.map((src, i) => `
            <div class="admin-photo-row">
              <img class="admin-photo-thumb" src="${src}">
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${src.startsWith("data:") ? "已上傳圖片 #" + (i + 1) : src}</span>
              <button type="button" class="close-btn admin-del-photo" data-idx="${i}">刪除</button>
            </div>
          `).join("") || "<p style='font-size:0.8rem;color:#64748b;'>尚無照片</p>"}
        </div>
        <button type="button" class="pill-btn active" id="adminSaveMediaBtn" style="margin-top:12px;width:100%;">💾 儲存影片與照片</button>
      `;
    } else if (adminTab === "admins") {
      bodyHtml = `
        <p style="font-size:0.82rem;color:#475569;margin-top:0;">編輯可登入後台的管理者名稱與 Google 帳號：</p>
        ${admins.map((a, i) => `
          <div style="display:grid;grid-template-columns:1fr 1.3fr 40px;gap:6px;margin-bottom:8px;">
            <input class="adm-name" data-idx="${i}" value="${a.name}" placeholder="管理者名稱">
            <input class="adm-email" data-idx="${i}" value="${a.email}" placeholder="Google Email">
            <button type="button" class="close-btn adm-del" data-idx="${i}">✕</button>
          </div>
        `).join("")}
        <button type="button" class="walk-chip" id="admAddBtn">＋ 新增管理者</button>
        <button type="button" class="pill-btn active" id="admSaveBtn" style="margin-top:12px;width:100%;">💾 儲存管理者名單</button>
      `;
    } else {
      bodyHtml = `
        <p style="font-size:0.84rem;color:#334155;">修改內容已即時儲存在本機瀏覽器。若要同步至全校網站（GitHub Pages），請匯出新版 <code>school-year.js</code> 覆蓋 <code>data/school-year.js</code>：</p>
        <button type="button" class="pill-btn active" id="adminExportBtn" style="width:100%;margin-bottom:10px;">⬇️ 匯出 school-year.js</button>
        <button type="button" class="pill-btn" id="adminResetBtn" style="width:100%;color:#dc2626;">🗑️ 清除本機修改（還原預設）</button>
      `;
    }

    adminDialog.innerHTML = `
      <div class="admin-header">
        <h3 style="margin:0;">⚙️ 校園導覽後台（${adminAuthedUser.name}）</h3>
        <button type="button" class="close-btn" id="adminCloseBtn">✕</button>
      </div>
      <div class="admin-tabs">
        <button type="button" class="walk-chip ${adminTab === "rooms" ? "active" : ""}" data-atab="rooms">🏫 校舍與教室</button>
        <button type="button" class="walk-chip ${adminTab === "media" ? "active" : ""}" data-atab="media">📷 照片與影片</button>
        <button type="button" class="walk-chip ${adminTab === "admins" ? "active" : ""}" data-atab="admins">👤 管理者帳號</button>
        <button type="button" class="walk-chip ${adminTab === "export" ? "active" : ""}" data-atab="export">📦 匯出更新</button>
      </div>
      ${bodyHtml}
    `;

    document.getElementById("adminCloseBtn").onclick = () => { adminModal.hidden = true; };
    adminDialog.querySelectorAll("[data-atab]").forEach(btn => {
      btn.onclick = () => { adminTab = btn.dataset.atab; renderAdminModal(); };
    });
    const bSel = document.getElementById("adminBldgSel");
    if (bSel) bSel.onchange = () => { adminBid = bSel.value; renderAdminModal(); };

    if (adminTab === "rooms") {
      adminDialog.querySelectorAll(".admin-add-room").forEach(btn => {
        btn.onclick = () => {
          b.floorsData = b.floorsData || { 1: [] };
          b.floorsData[btn.dataset.fk] = b.floorsData[btn.dataset.fk] || [];
          b.floorsData[btn.dataset.fk].push({ code: "NEW", name: "新空間", nameEn: "New Room", type: "special" });
          renderAdminModal();
        };
      });
      adminDialog.querySelectorAll(".admin-del-room").forEach(btn => {
        btn.onclick = () => {
          b.floorsData[btn.dataset.fk].splice(Number(btn.dataset.idx), 1);
          renderAdminModal();
        };
      });
      document.getElementById("adminSaveBldgBtn").onclick = () => {
        b.name = document.getElementById("abName").value.trim() || b.name;
        b.nameEn = document.getElementById("abNameEn").value.trim() || b.nameEn;
        b.summary = document.getElementById("abSummary").value.trim();
        if (b.floorsData) {
          adminDialog.querySelectorAll(".ar-code").forEach(inp => {
            const r = b.floorsData[inp.dataset.fk][Number(inp.dataset.idx)];
            if (r) r.code = inp.value.trim();
          });
          adminDialog.querySelectorAll(".ar-name").forEach(inp => {
            const r = b.floorsData[inp.dataset.fk][Number(inp.dataset.idx)];
            if (r) r.name = inp.value.trim();
          });
          adminDialog.querySelectorAll(".ar-nameEn").forEach(inp => {
            const r = b.floorsData[inp.dataset.fk][Number(inp.dataset.idx)];
            if (r) r.nameEn = inp.value.trim();
          });
          adminDialog.querySelectorAll(".ar-type").forEach(sel => {
            const r = b.floorsData[sel.dataset.fk][Number(sel.dataset.idx)];
            if (r) r.type = sel.value;
          });
        }
        saveBuildingOverride(b);
        alert("已儲存「" + b.name + "」變更！");
      };
    } else if (adminTab === "media") {
      adminDialog.querySelectorAll(".admin-del-photo").forEach(btn => {
        btn.onclick = () => {
          b.photos.splice(Number(btn.dataset.idx), 1);
          saveBuildingOverride(b);
          renderAdminModal();
        };
      });
      document.getElementById("abPhotoUpload").onchange = e => {
        const files = Array.from(e.target.files || []);
        b.photos = b.photos || [];
        files.forEach(file => {
          const reader = new FileReader();
          reader.onload = ev => {
            const img = new Image();
            img.onload = () => {
              const maxW = 960;
              const scale = Math.min(1, maxW / img.width);
              const cv = document.createElement("canvas");
              cv.width = Math.round(img.width * scale);
              cv.height = Math.round(img.height * scale);
              cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
              b.photos.push(cv.toDataURL("image/jpeg", 0.78));
              saveBuildingOverride(b);
              renderAdminModal();
            };
            img.src = ev.target.result;
          };
          reader.readAsDataURL(file);
        });
      };
      document.getElementById("adminSaveMediaBtn").onclick = () => {
        b.youtubeUrl = document.getElementById("abYoutube").value.trim();
        saveBuildingOverride(b);
        alert("已儲存照片與影片設定！");
      };
    } else if (adminTab === "admins") {
      document.getElementById("admAddBtn").onclick = () => {
        const arr = loadAdmins();
        arr.push({ name: "新管理者", email: "" });
        localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(arr));
        renderAdminModal();
      };
      adminDialog.querySelectorAll(".adm-del").forEach(btn => {
        btn.onclick = () => {
          const arr = loadAdmins();
          if (arr.length <= 1) return alert("至少需保留一位管理者！");
          arr.splice(Number(btn.dataset.idx), 1);
          localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(arr));
          renderAdminModal();
        };
      });
      document.getElementById("admSaveBtn").onclick = () => {
        const arr = loadAdmins();
        adminDialog.querySelectorAll(".adm-name").forEach(inp => { arr[Number(inp.dataset.idx)].name = inp.value.trim(); });
        adminDialog.querySelectorAll(".adm-email").forEach(inp => { arr[Number(inp.dataset.idx)].email = inp.value.trim(); });
        saveAdminsList(arr);
        alert("已更新管理者名單！");
      };
    } else {
      document.getElementById("adminExportBtn").onclick = () => {
        const outObj = {
          academicYear: window.SCHOOL_YEAR_DATA.academicYear,
          celebration: window.SCHOOL_YEAR_DATA.celebration,
          buildings: {}
        };
        D.buildings.forEach(item => {
          outObj.buildings[item.id] = {
            name: item.name, nameEn: item.nameEn,
            summary: item.summary, summaryEn: item.summaryEn,
            features: item.features, featuresEn: item.featuresEn,
            photos: item.photos, youtubeUrl: item.youtubeUrl,
            floorsData: item.floorsData
          };
        });
        const blob = new Blob([`window.SCHOOL_YEAR_DATA = ${JSON.stringify(outObj, null, 2)};\n`], { type: "application/javascript" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "school-year.js";
        a.click();
      };
      document.getElementById("adminResetBtn").onclick = () => {
        if (confirm("確定清除本機後台修改並還原預設？")) {
          localStorage.removeItem(ADMIN_DATA_KEY);
          location.reload();
        }
      };
    }
  }

  document.getElementById("adminBtn").onclick = () => {
    adminModal.hidden = false;
    renderAdminModal();
  };

  // --- 9. 主動畫迴圈 ---
  function animate(now) {
    requestAnimationFrame(animate);

    // 動態路線前進箭頭
    if (routeCurve && routeArrows.length > 0) {
      const tBase = (now * 0.00018) % 1;
      routeArrows.forEach(a => {
        const u = (a.offset + tBase) % 1;
        const p = routeCurve.getPointAt(u);
        const pNext = routeCurve.getPointAt(Math.min(1, u + 0.01));
        a.mesh.position.set(p.x, 0.52, p.z);
        a.mesh.lookAt(pNext.x, 0.52, pNext.z);
      });
    }

    if (walkMode) {
      let fwd = joyInput.fwd;
      let turn = joyInput.turn * 0.04;
      let strafe = 0;
      if (keys["w"] || keys["arrowup"]) fwd += 1;
      if (keys["s"] || keys["arrowdown"]) fwd -= 0.7;
      if (keys["a"]) strafe -= 0.85;
      if (keys["d"]) strafe += 0.85;
      if (keys["arrowleft"]) turn += 0.045;
      if (keys["arrowright"]) turn -= 0.045;

      // 點擊地面自動行走
      if (clickWalkTarget && !guidedWalk) {
        if (Math.abs(fwd) > 0.1 || Math.abs(strafe) > 0.1 || Math.abs(turn) > 0.01) {
          clickWalkTarget = null;
        } else {
          const dx = clickWalkTarget.x - walkState.x, dz = clickWalkTarget.z - walkState.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.7) {
            clickWalkTarget = null;
          } else {
            walkState.yaw = Math.atan2(-dx, -dz);
            fwd = 1;
          }
        }
      }

      // 模擬自動帶路 (鳥瞰跟隨 + 即將抵達切換垂直俯瞰)
      if (guidedWalk && !guidedWalk.paused && guidedWalk.idx < guidedWalk.pts.length) {
        const tgt = guidedWalk.pts[guidedWalk.idx];
        const dx = tgt.x - walkState.x, dz = tgt.z - walkState.z;
        const d = Math.hypot(dx, dz);
        const arriveR = guidedWalk.idx === guidedWalk.pts.length - 1 ? 1.35 : 0.95;
        if (d < arriveR) {
          guidedWalk.idx++;
          if (guidedWalk.idx >= guidedWalk.pts.length) {
            const destBid = guidedWalk.endBid;
            document.getElementById("guideProgressFill").style.width = "100%";
            guidedWalk = null;
            clearNavRoute();
            document.getElementById("guideControlBar").hidden = true;
            // 保持人物站立於定點並轉向面對目的地正面，鏡頭切換為人物背後視角
            walkMode = true;
            walkFirstPerson = false;
            walkFollowDist = 6.5;
            walkState.pitch = 0.06;
            walkerGroup.visible = true;
            document.getElementById("walkModeBtn").classList.add("active");
            document.getElementById("walkHudBar").hidden = false;
            document.getElementById("walkJoystick").classList.add("visible");
            const miniWrap = document.getElementById("minimapWrap");
            if (miniWrap && minimapEnabled) miniWrap.classList.add("visible");
            const destB = destBid ? D.buildings.find(item => item.id === destBid) : null;
            if (destB) {
              const fdx = destB.x - walkState.x, fdz = destB.z - walkState.z;
              if (Math.hypot(fdx, fdz) > 0.2) walkState.yaw = Math.atan2(-fdx, -fdz);
              selectedBuildingId = destB.id;
              renderDetailDrawer(destB);
            }
          }
        } else {
          let steerYaw = Math.atan2(-dx, -dz);
          const probeDist = Math.max(0.65, 0.22 * guidedWalk.speed * 2.5);
          const tryOffsets = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.85, -1.85];
          for (let oi = 0; oi < tryOffsets.length; oi++) {
            const testYaw = steerYaw + tryOffsets[oi];
            const px = walkState.x - Math.sin(testYaw) * probeDist;
            const pz = walkState.z - Math.cos(testYaw) * probeDist;
            if (!isBlocked(px, pz, walkState.y)) {
              steerYaw = testYaw;
              break;
            }
          }
          walkState.yaw = steerYaw;
          fwd = guidedWalk.speed;
        }
      }

      walkState.yaw += turn;
      const moveSpd = 0.22 * fwd;
      const strafeSpd = 0.22 * strafe;
      if (Math.abs(moveSpd) > 0.005 || Math.abs(strafeSpd) > 0.005) {
        const oldX = walkState.x, oldZ = walkState.z;
        const nx = walkState.x - Math.sin(walkState.yaw) * moveSpd + Math.cos(walkState.yaw) * strafeSpd;
        const nz = walkState.z - Math.cos(walkState.yaw) * moveSpd - Math.sin(walkState.yaw) * strafeSpd;
        if (!isBlocked(nx, walkState.z, walkState.y)) walkState.x = nx;
        if (!isBlocked(walkState.x, nz, walkState.y)) walkState.z = nz;
        const movedStep = Math.hypot(walkState.x - oldX, walkState.z - oldZ);
        if (guidedWalk && !guidedWalk.paused) {
          if (movedStep < 0.01) {
            guidedWalk.stuckCount = (guidedWalk.stuckCount || 0) + 1;
            if (guidedWalk.stuckCount > 30) {
              // 若仍受阻，推進至下一路徑點避免卡死
              guidedWalk.stuckCount = 0;
              guidedWalk.idx++;
            }
          } else {
            guidedWalk.stuckCount = 0;
          }
          guidedWalk.traveled += movedStep;
          const pct = Math.min(100, (guidedWalk.traveled / guidedWalk.totalDist) * 100);
          document.getElementById("guideProgressFill").style.width = pct.toFixed(1) + "%";
        }
        const groundY = getWalkElevation(walkState.x, walkState.z, walkState.y);
        if (!walkState.jumping) {
          walkState.y += (groundY - walkState.y) * 0.35;
          if (Math.abs(groundY - walkState.y) < 0.01) walkState.y = groundY;
        }
        walkState.stepPhase += 0.22 * Math.max(1, Math.abs(fwd), Math.abs(strafe));
        if (walkerParts.legL) {
          walkerParts.legL.rotation.x = Math.sin(walkState.stepPhase) * 0.55;
          walkerParts.legR.rotation.x = -Math.sin(walkState.stepPhase) * 0.55;
          if (walkerParts.armL) {
            walkerParts.armL.rotation.x = -Math.sin(walkState.stepPhase) * 0.45;
            walkerParts.armR.rotation.x = Math.sin(walkState.stepPhase) * 0.45;
          }
        }
      } else if (walkerParts.legL) {
        walkerParts.legL.rotation.x = 0;
        walkerParts.legR.rotation.x = 0;
        if (walkerParts.armL) { walkerParts.armL.rotation.x = 0; walkerParts.armR.rotation.x = 0; }
      }

      // 空白鍵跳躍垂直物理（重力與落地）
      if (walkState.jumping) {
        const dt = 0.016;
        walkState.vy -= 18.0 * dt;
        walkState.y += walkState.vy * dt;
        const landY = getWalkElevation(walkState.x, walkState.z, walkState.y);
        if (walkState.y <= landY) {
          walkState.y = landY;
          walkState.vy = 0;
          walkState.jumping = false;
        }
      }

      walkerGroup.position.set(walkState.x, walkState.y, walkState.z);
      walkerGroup.rotation.y = walkState.yaw;

      if (guidedWalk) {
        const rem = Math.max(0, guidedWalk.totalDist - guidedWalk.traveled);
        const wantTop = guidedWalk.topView || rem < 14;
        const tgtPitch = wantTop ? 1.46 : 0.84;
        const tgtDist = wantTop ? 36 : 42;
        camState.pitch += (tgtPitch - camState.pitch) * 0.08;
        camState.dist += (tgtDist - camState.dist) * 0.08;
        camState.target.set(walkState.x, walkState.y + 1.2, walkState.z);
        applyCamera();
      } else if (walkFirstPerson) {
        camera.position.set(walkState.x, walkState.y + 1.62, walkState.z);
        camera.lookAt(
          walkState.x - Math.sin(walkState.yaw) * 10,
          walkState.y + 1.62 - Math.sin(walkState.pitch) * 6,
          walkState.z - Math.cos(walkState.yaw) * 10
        );
      } else {
        const indoor = walkState.y > 0.2 || isInsideCorridorRoof(walkState.x, walkState.z);
        const followDist = indoor ? Math.min(walkFollowDist, 2.8) : walkFollowDist;
        const camH = indoor ? (walkState.y + 2.15 + walkState.pitch * 1.4) : (walkState.y + 2.6 + followDist * 0.25 + walkState.pitch * 3.0);
        const camOrigin = new THREE.Vector3(walkState.x, walkState.y + 1.45, walkState.z);
        const camDesired = new THREE.Vector3(
          walkState.x + Math.sin(walkState.yaw) * followDist,
          camH,
          walkState.z + Math.cos(walkState.yaw) * followDist
        );
        const camDir = camDesired.clone().sub(camOrigin);
        const maxCamDist = camDir.length();
        if (maxCamDist > 0.2) {
          camDir.normalize();
          raycaster.set(camOrigin, camDir);
          raycaster.far = maxCamDist;
          const camHits = raycaster.intersectObjects(built.clickableMeshes, false);
          raycaster.far = Infinity;
          for (let hi = 0; hi < camHits.length; hi++) {
            const h = camHits[hi];
            if (h.distance > 0.25 && h.distance < maxCamDist - 0.25 && h.point.y > walkState.y + 0.35) {
              const safeDist = Math.max(0.75, h.distance - 0.32);
              camDesired.copy(camOrigin).addScaledVector(camDir, safeDist);
              camDesired.y = Math.max(camDesired.y, walkState.y + 1.45);
              break;
            }
          }
        }
        camera.position.copy(camDesired);
        camera.lookAt(
          walkState.x - Math.sin(walkState.yaw) * 2.5,
          walkState.y + 1.35 - Math.sin(walkState.pitch) * 2.5,
          walkState.z - Math.cos(walkState.yaw) * 2.5
        );
      }
      if (compassDial) compassDial.style.transform = `rotate(${(walkState.yaw * 180) / Math.PI}deg)`;
    } else {
      // 飛航插值
      if (flyAnim) {
        const p = Math.min(1, (now - flyAnim.t0) / flyAnim.dur);
        const ease = 1 - Math.pow(1 - p, 3);
        camState.target.lerpVectors(flyAnim.startTarget, flyAnim.endTarget, ease);
        camState.yaw = flyAnim.startYaw + flyAnim.diffYaw * ease;
        camState.pitch = flyAnim.startPitch + (flyAnim.endPitch - flyAnim.startPitch) * ease;
        camState.dist = flyAnim.startDist + (flyAnim.endDist - flyAnim.startDist) * ease;
        applyCamera();
        if (p >= 1) flyAnim = null;
      }

      // WASD 移動
      const spd = 0.7;
      let moved = false;
      const sinY = Math.sin(camState.yaw), cosY = Math.cos(camState.yaw);
      if (keys["w"] || keys["arrowup"]) { camState.target.x -= sinY * spd; camState.target.z -= cosY * spd; moved = true; }
      if (keys["s"] || keys["arrowdown"]) { camState.target.x += sinY * spd; camState.target.z += cosY * spd; moved = true; }
      if (keys["a"] || keys["arrowleft"]) { camState.target.x -= cosY * spd; camState.target.z += sinY * spd; moved = true; }
      if (keys["d"] || keys["arrowright"]) { camState.target.x += cosY * spd; camState.target.z -= sinY * spd; moved = true; }
      if (moved) applyCamera();
    }

    updateLabels();
    renderMinimap();
    renderer.render(scene, camera);
  }

  refreshLanguageUI();
  applyCamera();
  requestAnimationFrame(animate);
})();
