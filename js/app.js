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

  const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.15, 1200);

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
  const initZone = (D.zones && D.zones[0]) || { target: [8.53, 1.86, 29.06], camPos: [89.88, 49.78, 84.85] };
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
    const minPitch = (typeof walkMode !== "undefined" && walkMode) ? -0.25 : 0.08;
    const minDist = (typeof walkMode !== "undefined" && walkMode) ? 0.42 : 6;
    camState.pitch = Math.max(minPitch, Math.min(1.48, camState.pitch));
    camState.dist = Math.max(minDist, Math.min(380, camState.dist));
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
  let isUserOrbiting = false;
  let walkOrbitVelYaw = 0, walkOrbitVelPitch = 0;
  let lastX = 0, lastY = 0, downX = 0, downY = 0;

  function panByPixels(dx, dy) {
    const scale = camState.dist * 0.0014;
    const cosY = Math.cos(camState.yaw);
    const sinY = Math.sin(camState.yaw);
    const dX = -(dx * cosY + dy * sinY) * scale;
    const dZ = -(-dx * sinY + dy * cosY) * scale;
    camState.target.x += dX;
    camState.target.z += dZ;
    if (walkMode && !guidedWalk) {
      const nx = walkState.x + dX;
      const nz = walkState.z + dZ;
      if (!isBlocked(nx, walkState.z, walkState.y)) walkState.x = nx;
      if (!isBlocked(walkState.x, nz, walkState.y)) walkState.z = nz;
      walkState.y = getWalkElevation(walkState.x, walkState.z, walkState.y);
    }
  }

  canvas.addEventListener("contextmenu", e => e.preventDefault());

  canvas.addEventListener("mousedown", e => {
    flyAnim = null;
    lastX = downX = e.clientX;
    lastY = downY = e.clientY;
    // 漫步模式下所有視角皆以小人為中心，按住左鍵或右鍵拖曳皆可 360 度環顧四週（未按滑鼠鍵移動游標時不旋轉）
    // 鳥瞰模式下按住左鍵拖曳平移，按住右鍵拖曳旋轉
    dragMode = walkMode ? "rot" : (e.button === 2 ? "rot" : "pan");
    if (walkMode) isUserOrbiting = true;
  });

  window.addEventListener("mousemove", e => {
    if (!dragMode) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    if (dragMode === "pan") {
      panByPixels(dx, dy);
      if (!walkMode) applyCamera();
      return;
    }

    if (walkMode) {
      if (walkFirstPerson) {
        walkState.yaw -= dx * 0.006;
        walkState.pitch = Math.max(-0.55, Math.min(0.65, walkState.pitch + dy * 0.004));
      } else {
        walkOrbitVelYaw -= dx * 0.0055;
        walkOrbitVelPitch += dy * 0.0045;
      }
      return;
    }

    camState.yaw -= dx * 0.006;
    camState.pitch += dy * 0.005;
    applyCamera();
  });

  window.addEventListener("mouseup", e => {
    if (dragMode && Math.hypot(e.clientX - downX, e.clientY - downY) < 5 && e.button === 0) {
      pickBuildingAt(e.clientX, e.clientY);
    }
    isUserOrbiting = false;
    dragMode = null;
  });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    flyAnim = null;
    if (walkMode && (!guidedWalk || guidedWalk.paused)) {
      walkFollowDist = Math.max(2.2, Math.min(48, walkFollowDist * (e.deltaY > 0 ? 1.12 : 0.89)));
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
      if (walkMode) isUserOrbiting = true;
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
      if (walkMode) {
        walkOrbitVelYaw -= dx * 0.0055;
        walkOrbitVelPitch += dy * 0.0045;
        return;
      }
      panByPixels(dx, dy);
    } else if (touchPrev.mode === "two" && e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const ang = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX);
      const cy = (t0.clientY + t1.clientY) / 2;

      if (walkMode) {
        walkFollowDist = Math.max(2.2, Math.min(48, walkFollowDist * (touchPrev.dist / Math.max(10, dist))));
      } else {
        camState.dist *= touchPrev.dist / Math.max(10, dist);
        camState.yaw += (ang - touchPrev.ang);
        camState.pitch += (cy - touchPrev.cy) * 0.004;
      }

      touchPrev.dist = dist;
      touchPrev.ang = ang;
      touchPrev.cy = cy;
    }
    if (!walkMode) applyCamera();
  }, { passive: false });

  canvas.addEventListener("touchend", e => {
    if (touchPrev && touchPrev.mode === "one" && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      if (Math.hypot(t.clientX - touchPrev.sx, t.clientY - touchPrev.sy) < 8) {
        pickBuildingAt(t.clientX, t.clientY);
      }
    }
    isUserOrbiting = false;
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

    // 校園漫步模式下：點擊任何水平地面、走廊樓板、樓梯、廣場或球場皆可「隨點隨走」自動走過去（點擊垂直牆面或門牌則開啟建築資訊）
    if (walkMode && !guidedWalk) {
      if (hits.length === 0) {
        if (raycaster.ray.intersectPlane(groundPlane, groundHitPt) && !isBlocked(groundHitPt.x, groundHitPt.z, walkState.y)) {
          clickWalkTarget = { x: groundHitPt.x, z: groundHitPt.z };
          return;
        }
      } else {
        const hit = hits[0];
        const isHorizontalSurface = (hit.face && hit.face.normal.y > 0.55) || (hit.point && Math.abs(hit.point.y - walkState.y) < 0.35);
        const sameFloorArea = hit.point && Math.abs(hit.point.y - walkState.y) < 1.85;
        if (isHorizontalSurface && sameFloorArea && !isBlocked(hit.point.x, hit.point.z, walkState.y)) {
          clickWalkTarget = { x: hit.point.x, z: hit.point.z };
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
    const isGuiding = !!(walkMode && guidedWalk);
    const walking = walkMode && !guidedWalk;
    for (let i = 0; i < labelEls.length; i++) {
      const item = labelEls[i];
      if (walking || isGuiding) {
        if (item.isAmbient || !item.b) {
          item.el.style.display = "none";
          continue;
        }
        const { lx, lz } = toBuildingLocal(item.b, walkState.x, walkState.z);
        const edgeDist = Math.hypot(
          Math.max(0, Math.abs(lx) - item.b.w / 2),
          Math.max(0, Math.abs(lz) - item.b.d / 2)
        );
        const isDest = isGuiding && guidedWalk.endBid && item.b.id === guidedWalk.endBid;
        if (edgeDist > (isGuiding ? (isDest ? 28 : 14) : 14)) {
          item.el.style.display = "none";
          continue;
        }
      }
      v.copy(item.pos).project(camera);
      if (v.z > 1 || (isGuiding && (Math.abs(v.x) > 0.92 || Math.abs(v.y) > 0.92))) {
        item.el.style.display = "none";
      } else {
        if (isGuiding && item.b && !(guidedWalk.endBid && item.b.id === guidedWalk.endBid)) {
          // 自動帶路時：檢測小人眼睛/鏡頭視線是否被建築主體遮擋，看不到就隱藏標籤
          const eyePos = new THREE.Vector3(walkState.x, walkState.y + 1.5, walkState.z);
          const dir = new THREE.Vector3().subVectors(item.pos, eyePos);
          const dist = dir.length();
          let occluded = false;
          if (dist > 2.0 && built && built.clickableMeshes) {
            dir.divideScalar(dist);
            camObsRay.set(eyePos, dir);
            camObsRay.near = 0.5;
            camObsRay.far = Math.max(0.6, dist - 2.0);
            const hits = camObsRay.intersectObjects(built.clickableMeshes, false);
            for (let hi = 0; hi < hits.length; hi++) {
              const ho = hits[hi].object;
              if (ho.userData && ho.userData.isBuildingBody && ho.userData.buildingId !== item.b.id) {
                occluded = true;
                break;
              }
            }
          }
          if (occluded) {
            item.el.style.display = "none";
            continue;
          }
        }
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

  function resolveNavTarget(id) {
    const rm = (D.roomNavTargets || []).find(r => r.id === id);
    if (rm) {
      return {
        id: rm.id,
        node: rm.node,
        parentId: rm.parentId,
        label: lang === "en" ? rm.nameEn : rm.name,
        isRoom: true,
        is2F: !!rm.is2F,
        dest2F: rm.dest2F || null,
        facingYaw: typeof rm.facingYaw === "number" ? rm.facingYaw : null
      };
    }
    if (id === "corridor_mid") {
      const b = D.buildings.find(x => x.id === id);
      return {
        id: "corridor_mid",
        node: "n_a_portal_s",
        parentId: "bldg_a",
        label: lang === "en" ? (b ? b.nameEn : "2F C-Show Maker Corridor") : (b ? b.name : "2F C-Show 創客走廊"),
        isRoom: false,
        is2F: true,
        dest2F: "maker_corr",
        facingYaw: 0.531
      };
    }
    const b = D.buildings.find(x => x.id === id);
    const node = (D.buildingNavNode || {})[id];
    if (b && node) {
      return { id: b.id, node, parentId: b.id, label: lang === "en" ? b.nameEn : b.name, isRoom: false, is2F: false, dest2F: null, facingYaw: null };
    }
    return null;
  }

  // 建立二樓導航專屬 3D 階梯與走廊路徑點（C-Show 創客走廊、圖書室、視聽教室）
  function build2FPathWaypoints(dest2F) {
    const bA = D.buildings.find(item => item.id === "bldg_a");
    const bB = D.buildings.find(item => item.id === "bldg_b");
    const bC = D.buildings.find(item => item.id === "bldg_c");
    if (!bA || !bB || !bC) return [];
    const pt = (b, lx, lz, y) => {
      const w = toBuildingWorld(b, lx, lz);
      return new THREE.Vector3(w.x, y, w.z);
    };
    // 依使用者指示：由 A 棟中央紅磚玄關左側（西側）雙折樓梯拾級而上至 2F 玄關平台
    const stairWestUpPts = [
      pt(bA, -1.80, 7.57, 0.20),
      pt(bA, -2.95, 7.57, 0.25),
      pt(bA, -5.50, 7.57, 1.75),
      pt(bA, -5.50, 5.77, 1.84),
      pt(bA, -2.65, 5.77, 3.45),
      pt(bA, -1.70, 5.77, 3.60),
      pt(bA, -1.20, 3.80, 3.60)
    ];

    if (dest2F === "maker_corr") {
      // 走 A 棟中央玄關左側樓梯上到 2F，停在 2F 創客走廊入口處並面對創客走廊停止
      return [
        ...stairWestUpPts,
        pt(bA, 0.37, 1.45, 3.60)
      ];
    }
    if (dest2F === "library") {
      // 經由 2F C-Show 創客走廊直通 B 棟 2F 走廊，往東走過 205 E化教室後停在 206-208 圖書室正門門牌前
      return [
        ...stairWestUpPts,
        pt(bA, 0.37, 0.00, 3.50),
        pt(bB, 3.40, 3.15, 3.65),
        pt(bB, 9.50, 3.15, 3.65),
        pt(bB, 13.05, 3.15, 3.65)
      ];
    }
    if (dest2F === "av_hall") {
      // 依使用者指示採 C 棟走廊最短路線：經由 C 棟 1F 走廊直接由 C 棟 1-2F 雙折樓梯登上 2F，直達 2F 視聽教室門前
      // Flight 1 (3m寬, lx: -1.84..1.16) 中心線 -0.34；Flight 2 (1.8m寬, lx: -3.64..-1.84) 中心線 -2.74
      return [
        pt(bC, -0.34, 15.52, 0.08),
        pt(bC, -0.34, 17.30, 0.95),
        pt(bC, -0.34, 18.42, 1.84),
        pt(bC, -2.74, 18.42, 1.84),
        pt(bC, -2.74, 17.30, 2.72),
        pt(bC, -2.74, 15.52, 3.60),
        pt(bC, -4.45, 13.95, 3.60)
      ];
    }
    return stairWestUpPts;
  }

  function populateNavSelects() {
    const targets = Object.keys(D.buildingNavNode || {}).map(bid => D.buildings.find(b => b.id === bid)).filter(Boolean);
    const curS = navStartSel.value || "main_gate";
    const curE = navEndSel.value || "solar_court";
    const bOpts = targets.map(b => `<option value="${b.id}">${lang === "en" ? b.nameEn : b.name}</option>`).join("");
    let html = `<optgroup label="${lang === "en" ? "🏫 Campus Landmarks" : "🏫 校園建築與特色景點"}">${bOpts}</optgroup>`;

    const rooms = D.roomNavTargets || [];
    const groups = [];
    const byGroup = {};
    rooms.forEach(r => {
      const gLabel = lang === "en" ? (r.groupEn || r.group) : r.group;
      if (!byGroup[gLabel]) { byGroup[gLabel] = []; groups.push(gLabel); }
      byGroup[gLabel].push(r);
    });
    groups.forEach(gLabel => {
      const rOpts = byGroup[gLabel].map(r => `<option value="${r.id}">${lang === "en" ? r.nameEn : r.name}</option>`).join("");
      html += `<optgroup label="${gLabel}">${rOpts}</optgroup>`;
    });

    navStartSel.innerHTML = html;
    navEndSel.innerHTML = html;
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

  function isSegmentBlocked(a, b) {
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const samples = Math.max(2, Math.ceil(dist / 0.65));
    for (let s = 1; s < samples; s++) {
      const t = s / samples;
      if (isBlocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0)) return true;
    }
    return false;
  }

  function resolveObstacleFreePts(rawPts, keepFinalApproach = false) {
    if (!rawPts || rawPts.length < 2) return rawPts;
    // 直線視線拉直優化（String-Pulling）：沿既定路網節點走最短最快直線路徑，絕不產生格點繞路
    const simplified = [rawPts[0].clone()];
    const lockFrom = (keepFinalApproach && rawPts.length >= 3) ? rawPts.length - 2 : rawPts.length - 1;
    let curIdx = 0;
    while (curIdx < lockFrom) {
      let nextIdx = curIdx + 1;
      for (let j = lockFrom; j > curIdx + 1; j--) {
        if (!isSegmentBlocked(rawPts[curIdx], rawPts[j])) {
          nextIdx = j;
          break;
        }
      }
      simplified.push(rawPts[nextIdx].clone());
      curIdx = nextIdx;
    }
    for (let k = lockFrom + 1; k < rawPts.length; k++) {
      simplified.push(rawPts[k].clone());
    }
    return simplified;
  }

  document.getElementById("runNavBtn").onclick = () => {
    const sInfo = resolveNavTarget(navStartSel.value);
    const eInfo = resolveNavTarget(navEndSel.value);
    if (!sInfo || !eInfo || sInfo.id === eInfo.id) {
      navInfoBox.hidden = false;
      navInfoBox.textContent = lang === "en" ? "Same location or no path." : "起終點相同或無連通路徑。";
      return;
    }
    const sBid = sInfo.parentId, eBid = eInfo.parentId;
    clearNavRoute();
    const pathIds = findShortestPath(sInfo.node, eInfo.node);
    if ((!pathIds || pathIds.length < 2) && !sInfo.is2F && !eInfo.is2F) {
      navInfoBox.hidden = false;
      navInfoBox.textContent = lang === "en" ? "Same location or no path." : "起終點相同或無連通路徑。";
      return;
    }

    const baseIds = (pathIds && pathIds.length >= 1) ? pathIds : [sInfo.node];
    const rawPts = baseIds.map(id => new THREE.Vector3(D.navNodes[id][0], 0.25, D.navNodes[id][1]));
    let pts = rawPts.length >= 2 ? resolveObstacleFreePts(rawPts, !!eInfo.isRoom && !eInfo.is2F) : rawPts.slice();
    if (sInfo.is2F) {
      const downPts = build2FPathWaypoints(sInfo.dest2F).slice().reverse();
      pts = [...downPts, ...pts];
    }
    if (eInfo.is2F) {
      const upPts = build2FPathWaypoints(eInfo.dest2F);
      pts = [...pts, ...upPts];
    }
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

    // 起終點標記柱（依指示隱藏定位用柱體，不干擾畫面）
    const startPin = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.18, 2.8, 12), new THREE.MeshLambertMaterial({ color: 0x22c55e }));
    startPin.position.set(pts[0].x, 1.6, pts[0].z);
    startPin.userData.isStartPin = true;
    startPin.visible = false;

    const endPin = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.18, 2.8, 12), new THREE.MeshLambertMaterial({ color: 0xef4444 }));
    endPin.position.set(pts[pts.length - 1].x, 1.6, pts[pts.length - 1].z);
    endPin.userData.isEndPin = true;
    endPin.visible = false;

    navRouteGroup.add(startPin, endPin);

    let totalDist = 0;
    for (let i = 1; i < pts.length; i++) totalDist += pts[i].distanceTo(pts[i - 1]);
    const secs = Math.round(totalDist / 1.3);
    const turns = computeTurnHints(pts, sBid);
    const turnStr = turns.length
      ? `${lang === "en" ? "Turns" : "轉彎指引"}：${turns.slice(0, 5).join(" → ")}${turns.length > 5 ? " ..." : ""}`
      : (lang === "en" ? "Go straight" : "直行即可抵達");

    const sLabel = sInfo.label;
    const eLabel = eInfo.label;

    navInfoBox.hidden = false;
    navInfoBox.innerHTML = `
      <button type="button" class="pill-btn active" id="guideWalkBtn" style="margin-bottom:6px;width:100%;padding:5px;">🚶 ${lang === "en" ? "Simulate Auto-Guide" : "模擬自動帶路"}</button>
      <div>${lang === "en" ? "Distance" : "步行距離"}：<b>${Math.round(totalDist)} m</b>（約 ${secs} ${lang === "en" ? "sec" : "秒"}）</div>
      <div style="font-size:0.72rem;color:#475569;margin-top:2px;">${turnStr}</div>
    `;
    document.getElementById("guideWalkBtn").onclick = () => startGuidedWalk(pts, sLabel, eLabel, totalDist, secs, eBid, eInfo);
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

  // 漫步鏡頭跟隨、防遮擋遲滯鎖定與鍵盤方向鎖定狀態
  const UP_AXIS = new THREE.Vector3(0, 1, 0);
  const camOffset = new THREE.Vector3();
  const desiredWalkTarget = new THREE.Vector3();
  const moveDeltaVec = new THREE.Vector3();
  const lockedKeyFwd = new THREE.Vector3(0, 0, -1);
  const lockedKeyRight = new THREE.Vector3(1, 0, 0);
  const moveDirVec = new THREE.Vector3();
  let lastKeySig = "";
  let autoOrbitActive = false;
  let autoOrbitBuilding = null;
  let camAzVel = 0;
  let walkZoomTween = null;
  let lastAnimNow = performance.now();

  const OCCLUDABLE_STYLES = new Set(["wing_a", "wing_b", "wing_c", "wing_d", "corridor", "toilet", "kitchen", "food_lab", "stage", "solar_court", "samba", "gate"]);
  let buildingMatCache = null;
  let meshMatCache = null;

  function ensureBuildingMatCache() {
    if (buildingMatCache) return buildingMatCache;
    buildingMatCache = {};
    meshMatCache = new Map();
    const seenMats = new Set();
    const groups = built.buildingGroups || {};
    Object.keys(groups).forEach(bid => {
      const entries = [];
      const localSeen = new Set();
      groups[bid].traverse(obj => {
        if (!obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const cloned = mats.map(m => {
          if (seenMats.has(m)) {
            const c = m.clone();
            seenMats.add(c);
            return c;
          }
          seenMats.add(m);
          return m;
        });
        obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
        const meshEntries = [];
        cloned.forEach(m => {
          const entry = {
            mat: m,
            origOpacity: m.opacity !== undefined ? m.opacity : 1.0,
            origTransparent: !!m.transparent,
            origDepthWrite: m.depthWrite !== undefined ? m.depthWrite : true
          };
          meshEntries.push(entry);
          if (!localSeen.has(m)) {
            localSeen.add(m);
            entries.push(entry);
          }
        });
        meshMatCache.set(obj, meshEntries);
      });
      buildingMatCache[bid] = entries;
    });
    return buildingMatCache;
  }

  function segmentHitsBuildingOBB(b, p0x, p0y, p0z, p1x, p1y, p1z) {
    const a = toBuildingLocal(b, p0x, p0z);
    const c = toBuildingLocal(b, p1x, p1z);
    const bH = b.floors ? b.floors * (b.floorHeight || 3.4) : (b.h || 4.0);
    const hw = b.w * 0.5 + 0.8, hd = b.d * 0.5 + (b.id === "bldg_a" ? 4.2 : 0.8);
    const dx = c.lx - a.lx, dy = p1y - p0y, dz = c.lz - a.lz;
    let tmin = 0.02, tmax = 0.98;
    const slabs = [
      [a.lx, dx, -hw, hw],
      [p0y, dy, 0.05, bH + 0.6],
      [a.lz, dz, -hd, hd]
    ];
    for (let i = 0; i < 3; i++) {
      const [o, d, minB, maxB] = slabs[i];
      if (Math.abs(d) < 1e-6) {
        if (o < minB || o > maxB) return false;
      } else {
        let t1 = (minB - o) / d;
        let t2 = (maxB - o) / d;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return false;
      }
    }
    return true;
  }

  function findOccludingBuildings(px, py, pz, cx, cy, cz) {
    const hits = [];
    for (let i = 0; i < D.buildings.length; i++) {
      const b = D.buildings[i];
      if (!OCCLUDABLE_STYLES.has(b.style)) continue;
      if (segmentHitsBuildingOBB(b, px, py, pz, cx, cy, cz)) hits.push(b);
    }
    return hits;
  }

  const occRayOrigin = new THREE.Vector3();
  const occRayTarget = new THREE.Vector3();
  const occRayDir = new THREE.Vector3();
  const camBackRayOrigin = new THREE.Vector3();
  const camBackRayDir = new THREE.Vector3();
  let culledLensMeshes = new Set();
  let smoothCamLiftY = 0;

  // 清除鏡頭與小人之間視線上的單一遮擋網格隱藏狀態（不改變材質透明度，完全無半透明殘影）
  function restoreCulledLensMeshes() {
    if (culledLensMeshes.size === 0) return;
    culledLensMeshes.forEach(m => { m.visible = true; });
    culledLensMeshes.clear();
  }

  // 當攝影機跟隨小人進入室內、走廊或上下樓梯時，保持固定舒適距離（小人不會忽大忽小），
  // 若鏡頭正後方恰有單一薄牆、欄杆或柱子擋在「鏡頭 → 小人」連線上，僅暫時剔除該擋住鏡頭的網格，
  // 讓小人與室內外周邊環境皆以 100% 實體清晰呈現（零半透明殘影、零畫面晃動）
  function updateCameraLineOfSightCulling(camPos, charX, charY, charZ) {
    restoreCulledLensMeshes();
    const heights = [0.45, 0.85, 1.20, 1.48];
    for (let i = 0; i < heights.length; i++) {
      occRayOrigin.copy(camPos);
      occRayTarget.set(charX, charY + heights[i], charZ);
      occRayDir.subVectors(occRayTarget, occRayOrigin);
      const dist = occRayDir.length();
      if (dist < 0.35) continue;
      occRayDir.divideScalar(dist);

      // 正向檢測鏡頭與小人之間的連線（距離小於 dist - 0.22m 代表位於小人背後與鏡頭之間，絕不影響小人前方的任何牆面與景物）
      raycaster.set(occRayOrigin, occRayDir);
      raycaster.near = 0.05;
      raycaster.far = Math.max(0.1, dist - 0.22);
      const hitsFwd = raycaster.intersectObjects(built.clickableMeshes, false);
      for (let h = 0; h < hitsFwd.length; h++) {
        const hit = hitsFwd[h];
        // 絕不隱藏腳下地板、樓板與階梯踏面（僅在屋頂/天花板位於小人上方 hit.point.y > charY + 1.15 且擋住鳥瞰視線時才暫時隱藏）
        if (hit.face && Math.abs(hit.face.normal.y) > 0.65) {
          if (hit.point.y <= charY + 1.15) continue;
          hit.object.visible = false;
          culledLensMeshes.add(hit.object);
          continue;
        }
        if (hit.object.position.y < 0.16 && hit.point.y < charY + 0.35) continue;
        // 絕不隱藏主要校舍建築物本體量體（避免整棟建築消失導致穿透看到室內或遠方窗框；若在 D 棟樓梯則透視遮擋的廁所量體）
        if (hit.object.userData && hit.object.userData.isBuildingBody) {
          if (isInWingDEastCorridorOrStair(charX, charZ) && hit.object.userData.buildingId === "tennis_toilet") {
            hit.object.visible = false;
            culledLensMeshes.add(hit.object);
            continue;
          }
          continue;
        }
        if (hit.object.geometry && hit.object.geometry.parameters) {
          const p = hit.object.geometry.parameters;
          if (p.width > 1.8 && p.depth > 1.8) continue;
          if (p.height > 2.0 && (p.width > 1.8 || p.depth > 1.8)) continue;
        }
        hit.object.visible = false;
        culledLensMeshes.add(hit.object);
      }
    }
    raycaster.near = 0.1;
    raycaster.far = Infinity;
  }

  // 攝影機室內/走廊防穿牆碰撞 (SpringArm 相機彈簧臂)：
  // 檢測從目標點（小人胸口中心）往後方預計鏡頭位置之連線，若背後有實體牆面/柱子，自動將鏡頭縮進室內，絕不穿透出戶外或外牆後方
  const camObsRay = new THREE.Raycaster();
  const camObsDir = new THREE.Vector3();
  function clampCameraObstruction(targetPos, desiredCamPos, minDistance = 1.05) {
    if (!built || !built.clickableMeshes) return;
    camObsDir.subVectors(desiredCamPos, targetPos);
    const desiredDist = camObsDir.length();
    if (desiredDist < minDistance + 0.15) return;
    camObsDir.normalize();

    camObsRay.set(targetPos, camObsDir);
    camObsRay.near = 0.25;
    camObsRay.far = desiredDist;
    const hits = camObsRay.intersectObjects(built.clickableMeshes, false);
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (h.object.userData && (h.object.userData.isSign || h.object.userData.isParapet || h.object.userData.isStair || h.object.userData.isRail)) continue;
      if (isInWingDEastCorridorOrStair(targetPos.x, targetPos.z) && h.object.userData && h.object.userData.buildingId === "tennis_toilet") continue;
      // 忽略地板與平天花板水平面
      if (h.face && Math.abs(h.face.normal.y) > 0.70) continue;
      // 忽略女兒牆、樓梯欄杆矮牆與扶手（高度小於 1.55m，外側為開放空間，由 updateCameraLineOfSightCulling 自動透視，不壓迫鏡頭距離）
      let meshH = 0;
      if (h.object.geometry && h.object.geometry.parameters && typeof h.object.geometry.parameters.height === "number") {
        meshH = h.object.geometry.parameters.height;
      } else if (h.object.geometry) {
        if (!h.object.geometry.boundingBox) h.object.geometry.computeBoundingBox();
        if (h.object.geometry.boundingBox) {
          meshH = h.object.geometry.boundingBox.max.y - h.object.geometry.boundingBox.min.y;
        }
      }
      if (meshH > 0 && meshH < 1.55) continue;
      // 忽略走廊細小支撐柱（寬與深均小於 0.55m，由 updateCameraLineOfSightCulling 自動透視，確保停止視角維持中景不放大）
      if (h.object.geometry && h.object.geometry.parameters) {
        const gp = h.object.geometry.parameters;
        if (typeof gp.width === "number" && typeof gp.depth === "number" && gp.width <= 0.55 && gp.depth <= 0.55) continue;
      }
      // 遇到實體牆壁/柱子/端牆：縮小鏡頭距離，讓鏡頭保持在牆壁內側前方（保留 0.22m 安全空間）
      const clampedDist = Math.max(minDistance, h.distance - 0.22);
      if (clampedDist < desiredDist) {
        desiredCamPos.copy(targetPos).addScaledVector(camObsDir, clampedDist);
        break;
      }
    }
  }

  function updateBuildingOcclusionOpacity() {
    restoreCulledLensMeshes();
  }

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

  function toBuildingWorld(b, lx, lz) {
    const c = Math.cos(b.rotY || 0);
    const s = Math.sin(b.rotY || 0);
    return {
      x: b.x + lx * c + lz * s,
      z: b.z - lx * s + lz * c
    };
  }

  // 檢查座標 (nx, nz) 是否位於校園 1.5m 邊界外牆內側（且距離任一圍牆邊線至少 margin 公尺，防範小人不小心走出校外）
  function isInsideCampusBoundary(nx, nz, margin = 0.45) {
    // 若位於香蕉園落葉循環示範區通道，豁免邊界最短距離阻擋，讓小人可自由靠近
    if (Math.hypot(nx - (-58.5), nz - 92.5) < 7.2) return true;
    const poly = D.campusBoundary;
    if (!poly || poly.length < 3) return true;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1];
      const xj = poly[j][0], zj = poly[j][1];
      const intersect = ((zi > nz) !== (zj > nz)) && (nx < (xj - xi) * (nz - zi) / ((zj - zi) || 1e-9) + xi);
      if (intersect) inside = !inside;

      // 若為校門口通道區段 (南側門柱外緣 [56.63, 44.89] 至 北側門柱外緣 [63.83, 35.79])，豁免邊界圍牆最短距離阻擋，使通道保持開放通暢
      const isGateSeg =
        (Math.hypot(xi - 56.63, zi - 44.89) < 1.5 && Math.hypot(xj - 63.83, zj - 35.79) < 1.5) ||
        (Math.hypot(xj - 56.63, zj - 44.89) < 1.5 && Math.hypot(xi - 63.83, zi - 35.79) < 1.5);
      if (isGateSeg) continue;

      // 計算點到圍牆線段之最短距離，確保無法貼穿 1.5m 邊界外牆
      const vx = xj - xi, vz = zj - zi;
      const lenSq = vx * vx + vz * vz;
      if (lenSq > 1e-4) {
        const t = Math.max(0, Math.min(1, ((nx - xi) * vx + (nz - zi) * vz) / lenSq));
        const px = xi + t * vx, pz = zi + t * vz;
        if (Math.hypot(nx - px, nz - pz) < margin) return false;
      }
    }
    return inside;
  }

  function isBlocked(nx, nz, curY = 0) {
    if (!isInsideCampusBoundary(nx, nz, 0.45)) return true;

    // 若位於 D 棟南端迴轉樓梯區內，豁免網球廁所跨棟重疊碰撞，確保 D 棟樓梯上下行完全暢通
    const bD = D.buildings.find(item => item.id === "bldg_d");
    let inDStairZone = false;
    if (bD) {
      const dLoc = toBuildingLocal(bD, nx, nz);
      if (dLoc.lx >= 0.85 && dLoc.lx <= 4.65 && dLoc.lz >= 8.90 && dLoc.lz <= 13.0) {
        inDStairZone = true;
      }
    }

    // 全校樓梯嚴格幾何邊界保護（curY: 0.30 ~ 3.55m 階梯過渡區）：
    // 嚴禁穿透外側牆體、女兒牆欄杆與階梯分隔牆，徹底根除出模掉入其他建築物或卡在外部窗沿之問題
    const bA = D.buildings.find(item => item.id === "bldg_a");
    if (bA && curY >= 0.30 && curY <= 3.55) {
      const aLoc = toBuildingLocal(bA, nx, nz);
      // 1. A 棟西側樓梯 + D 棟南側連通樓梯 (lx_A: -35.76 .. -32.16, lz_A: -5.17 .. 1.42，共用連通迴轉平台無北牆隔斷)
      if (aLoc.lx >= -36.50 && aLoc.lx <= -31.50 && aLoc.lz >= -5.30 && aLoc.lz <= 2.20) {
        if (aLoc.lx < -35.68) return true; // 西側緊鄰網球/性平廁所之共用外牆
        if (aLoc.lx > -32.22) return true; // 東側緊鄰 A 棟教室之外牆
        if (aLoc.lz >= -1.35) {
          if (curY < 1.50 && aLoc.lx > -34.02) return true; // A棟 Flight 1 下半段 (不可跨牆)
          if (curY > 2.15 && aLoc.lx < -33.90) return true; // A棟 Flight 2 上半段 (平台銜接區暢通無阻)
        }
      }
      // 2. A 棟中央玄關西側雙折樓梯 (lx: -6.23 .. -2.23, lz: 4.87 .. 8.47)
      if (aLoc.lx >= -7.20 && aLoc.lx <= -1.80 && aLoc.lz >= 4.20 && aLoc.lz <= 9.20) {
        if (aLoc.lz < 4.88) return true; // 北側外緣女兒牆/扶手（嚴格防穿模）
        if (aLoc.lz > 8.46) return true; // 南側外緣女兒牆/扶手
        if (aLoc.lx < -6.18) return true; // 迴轉平台西側背牆
        if (aLoc.lx >= -4.85) {
          if (curY < 1.50 && aLoc.lz < 6.72) return true; // Flight 1 下半段
          if (curY > 2.15 && aLoc.lz > 6.62) return true; // Flight 2 上半段（平台轉向 1.50~2.15 暢通無阻）
        }
      }
      // 3. A 棟中央玄關東側雙折樓梯 (pMaxA = 2.87 -> lx: 2.92 .. 6.92, lz: 4.87 .. 8.47)
      if (aLoc.lx >= 2.50 && aLoc.lx <= 7.40 && aLoc.lz >= 4.20 && aLoc.lz <= 9.20) {
        if (aLoc.lz < 4.88) return true; // 北側外緣女兒牆/扶手
        if (aLoc.lz > 8.46) return true; // 南側外緣女兒牆/扶手
        if (aLoc.lx > 6.86) return true; // 迴轉平台東側背牆
        if (aLoc.lx <= 5.55) {
          if (curY < 1.50 && aLoc.lz < 6.72) return true;
          if (curY > 2.15 && aLoc.lz > 6.62) return true;
        }
      }
    }

    const bB = D.buildings.find(item => item.id === "bldg_b");
    if (bB && curY >= 0.30 && curY <= 3.55) {
      const bLoc = toBuildingLocal(bB, nx, nz);
      // B 棟西側樓梯 (lx: -35.70 .. -32.10, lz: -4.17 .. 1.42)
      if (bLoc.lx >= -36.50 && bLoc.lx <= -31.00 && bLoc.lz >= -5.00 && bLoc.lz <= 2.20) {
        if (bLoc.lx < -35.65 || bLoc.lx > -32.15 || bLoc.lz < -4.12) return true;
      }
      // B 棟中央樓梯 (lx: -2.70 .. 0.90, lz: -4.17 .. 1.42)
      if (bLoc.lx >= -3.50 && bLoc.lx <= 1.80 && bLoc.lz >= -5.00 && bLoc.lz <= 2.20) {
        if (bLoc.lx < -2.65 || bLoc.lx > 0.85 || bLoc.lz < -4.12) return true;
      }
    }

    const bC = D.buildings.find(item => item.id === "bldg_c");
    if (bC && curY >= 0.30 && curY <= 3.55) {
      const cLoc = toBuildingLocal(bC, nx, nz);
      // C 棟雙折樓梯 (lx: -3.64 .. 1.16, lz: 15.52 .. 19.10)
      if (cLoc.lx >= -4.50 && cLoc.lx <= 2.00 && cLoc.lz >= 14.80 && cLoc.lz <= 20.0) {
        if (cLoc.lx < -3.60 || cLoc.lx > 1.12 || cLoc.lz > 19.05) return true;
      }
    }

    const curFloor = curY > 1.60 ? "2" : "1";
    const cols = built.colliders || [];
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      if (inDStairZone && col.b.id === "tennis_toilet") continue;
      if (col.floors !== "both" && col.floors !== curFloor) continue;
      const { lx, lz } = toBuildingLocal(col.b, nx, nz);
      if (col.isPillar) {
        // 柱體碰撞採用圓形半徑與適當緩衝 (pr + 0.35m)，確保小人從任何角度走近立柱時外緣緊貼停住，徹底杜絕穿模
        const cx = (col.lxMin + col.lxMax) / 2;
        const cz = (col.lzMin + col.lzMax) / 2;
        const pr = Math.max((col.lxMax - col.lxMin) / 2, (col.lzMax - col.lzMin) / 2);
        if (Math.hypot(lx - cx, lz - cz) < pr + 0.35) {
          return true;
        }
        continue;
      }
      const pad = 0.22;
      if (lx >= col.lxMin - pad && lx <= col.lxMax + pad && lz >= col.lzMin - pad && lz <= col.lzMax + pad) {
        return true;
      }
    }
    if (curY < 2.8) {
      const trees = built.treeColliders || [];
      for (let i = 0; i < trees.length; i++) {
        const tc = trees[i];
        if (Math.hypot(nx - tc.x, nz - tc.z) < tc.r * 0.85) return true;
      }
      const extras = built.extraWorldColliders || [];
      for (let i = 0; i < extras.length; i++) {
        const ec = extras[i];
        if (Math.hypot(nx - ec.x, nz - ec.z) < ec.r * 0.85) return true;
      }
    }
    if (curY < 2.0) {
      for (let i = 0; i < D.buildings.length; i++) {
        const b = D.buildings[i];
        if (b.noCollide || (b.style && b.style.startsWith("wing_")) || b.style === "corridor" ||
            b.style === "track" || b.style === "mural3d" || b.style === "banana" || b.style === "toilet" ||
            b.style === "samba" || b.style === "playground" || b.style === "gate" || b.style === "pond" ||
            b.style === "solar_court" || b.style === "stage") {
          continue;
        }
        const { lx, lz } = toBuildingLocal(b, nx, nz);
        if (Math.abs(lx) < b.w / 2 + 0.20 && Math.abs(lz) < b.d / 2 + 0.20) {
          return true;
        }
      }
    }
    return false;
  }

  // 高齡友善智慧移動解算器：
  // 1. 全角度切線滑牆與自動繞柱（解決 30° 斜向校舍因世界 X/Z 分軸碰撞造成的斜推走歪與撞柱卡死）
  // 2. 走廊與樓梯智慧直線導正 + 走廊中線防撞導引（稍微走偏時自動順著走廊方向導正並遠離柱列）
  const SLIDE_ANGLES = [0.22, -0.22, 0.44, -0.44, 0.68, -0.68, 0.92, -0.92, 1.18, -1.18, 1.42, -1.42];
  function moveWalkerSmoothly(stepX, stepZ, curY, dt, isUserTurning) {
    const stepLen = Math.hypot(stepX, stepZ);
    if (stepLen < 1e-5) return 0;

    // A. 先嘗試原方向直接前進
    const directX = walkState.x + stepX;
    const directZ = walkState.z + stepZ;
    let movedX = walkState.x, movedZ = walkState.z;
    let slideDeflect = 0;
    let didMove = false;

    if (!isBlocked(directX, directZ, curY)) {
      movedX = directX;
      movedZ = directZ;
      didMove = true;
    } else {
      // B. 若前方受阻（如斜擦牆面、欄杆或柱子），沿切線角度陣列自動尋找最順暢的滑動方向，絕不卡死或亂彈
      const baseHeading = Math.atan2(-stepX, -stepZ);
      for (let i = 0; i < SLIDE_ANGLES.length; i++) {
        const da = SLIDE_ANGLES[i];
        const testYaw = baseHeading + da;
        const scale = Math.max(0.45, Math.cos(da));
        const tx = walkState.x - Math.sin(testYaw) * stepLen * scale;
        const tz = walkState.z - Math.cos(testYaw) * stepLen * scale;
        if (!isBlocked(tx, tz, curY)) {
          movedX = tx;
          movedZ = tz;
          slideDeflect = da;
          didMove = true;
          break;
        }
      }
    }

    if (!didMove) return 0;
    walkState.x = movedX;
    walkState.z = movedZ;

    // 若因擦撞柱子或牆面產生切線滑動，溫和順向微調朝向，協助使用者自然繞過障礙
    if (Math.abs(slideDeflect) > 0.01 && !isUserTurning && !guidedWalk) {
      const nudge = THREE.MathUtils.clamp(slideDeflect * 0.14, -0.04, 0.04);
      walkState.yaw += nudge;
      camState.yaw += nudge;
    }

    // C. 走廊與連廊智慧直線導正 & 走廊中線防撞柱輔助（僅在未主動轉彎且正向行走時啟動）
    if (!isUserTurning && !guidedWalk && !clickWalkTarget) {
      applyCorridorLaneAssist(dt);
    }

    return Math.hypot(walkState.x - (directX - stepX), walkState.z - (directZ - stepZ));
  }

  function normalizeAngleDiff(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function applyCorridorLaneAssist(dt) {
    for (let i = 0; i < D.buildings.length; i++) {
      const b = D.buildings[i];
      if (!((b.style && b.style.startsWith("wing_")) || b.style === "corridor")) continue;
      const { lx, lz } = toBuildingLocal(b, walkState.x, walkState.z);
      const rot = b.rotY || 0;

      // 1. A 棟與 B 棟東西向長走廊 (走廊位於南側 lz: 1.42 .. b.d/2)
      if (b.id === "bldg_a" || b.id === "bldg_b") {
        const wallZ = b.d / 2 - 3.1;
        const outerZ = b.d / 2;
        if (lx >= -b.w / 2 - 0.5 && lx <= b.w / 2 + 1.5 && lz >= wallZ - 0.15 && lz <= outerZ + 0.25) {
          // 走廊軸向為局部 +X (yaw = rot - PI/2) 或局部 -X (yaw = rot + PI/2)
          const axisYawPos = rot - Math.PI / 2;
          const axisYawNeg = rot + Math.PI / 2;
          const dPos = normalizeAngleDiff(axisYawPos - walkState.yaw);
          const dNeg = normalizeAngleDiff(axisYawNeg - walkState.yaw);
          const bestDiff = Math.abs(dPos) < Math.abs(dNeg) ? dPos : dNeg;

          // 若行進角度與走廊直線方向夾角在 24 度 (0.42 rad) 內，自動平滑導正為直線，並溫和推向走廊中央安全線 (避開外緣柱列)
          if (Math.abs(bestDiff) < 0.42) {
            const alignStep = bestDiff * Math.min(1, 4.2 * dt);
            walkState.yaw += alignStep;
            camState.yaw += alignStep;

            // 走廊安全中線約在 wallZ + 1.45m（遠離 outerZ - 0.2m 的柱列與 wallZ 牆面）
            const safeCenterZ = wallZ + 1.45;
            const latErr = safeCenterZ - lz;
            if (Math.abs(latErr) > 0.25) {
              const newLz = lz + THREE.MathUtils.clamp(latErr * 2.2 * dt, -0.04, 0.04);
              const wPt = toBuildingWorld(b, lx, newLz);
              if (!isBlocked(wPt.x, wPt.z, walkState.y)) {
                walkState.x = wPt.x;
                walkState.z = wPt.z;
              }
            }
          }
          return;
        }
      }

      // 2. C-Show 創客走廊 / 中央風雨連廊 (南北向 lz: -b.d/2 .. +b.d/2, 寬度 lx: -b.w/2 .. +b.w/2)
      if (b.id === "corridor_mid") {
        if (Math.abs(lx) <= b.w / 2 - 0.1 && Math.abs(lz) <= b.d / 2 - 0.8) {
          const axisYawNorth = rot;
          const axisYawSouth = rot + Math.PI;
          const dN = normalizeAngleDiff(axisYawNorth - walkState.yaw);
          const dS = normalizeAngleDiff(axisYawSouth - walkState.yaw);
          const bestDiff = Math.abs(dN) < Math.abs(dS) ? dN : dS;
          if (Math.abs(bestDiff) < 0.42) {
            const alignStep = bestDiff * Math.min(1, 4.5 * dt);
            walkState.yaw += alignStep;
            camState.yaw += alignStep;
            if (Math.abs(lx) > 0.35) {
              const newLx = lx * (1 - Math.min(0.5, 2.2 * dt));
              const wPt = toBuildingWorld(b, newLx, lz);
              if (!isBlocked(wPt.x, wPt.z, walkState.y)) {
                walkState.x = wPt.x;
                walkState.z = wPt.z;
              }
            }
          }
          return;
        }
      }

      // 3. C 棟與 D 棟南北向走廊
      if (b.id === "bldg_c" || b.id === "bldg_d") {
        if (Math.abs(lx) <= b.w / 2 + 0.2 && Math.abs(lz) <= b.d / 2 + 1.0) {
          const axisYawNorth = rot;
          const axisYawSouth = rot + Math.PI;
          const dN = normalizeAngleDiff(axisYawNorth - walkState.yaw);
          const dS = normalizeAngleDiff(axisYawSouth - walkState.yaw);
          const bestDiff = Math.abs(dN) < Math.abs(dS) ? dN : dS;
          if (Math.abs(bestDiff) < 0.38) {
            const alignStep = bestDiff * Math.min(1, 4.0 * dt);
            walkState.yaw += alignStep;
            camState.yaw += alignStep;
            // D 棟東側走廊安全中線導引（1F/2F 上樓與下樓時平穩保持在走廊/梯道中央）
            if (b.id === "bldg_d" && lx > 1.35) {
              const goingSouth = Math.abs(dS) < Math.abs(dN);
              const safeX = (walkState.y > 2.0 && goingSouth && lz > 3.5) ? 2.22 : 4.25;
              const latErr = safeX - lx;
              if (Math.abs(latErr) > 0.22) {
                const newLx = lx + THREE.MathUtils.clamp(latErr * 2.4 * dt, -0.045, 0.045);
                const wPt = toBuildingWorld(b, newLx, lz);
                if (!isBlocked(wPt.x, wPt.z, walkState.y)) {
                  walkState.x = wPt.x;
                  walkState.z = wPt.z;
                }
              }
            }
          }
          return;
        }
      }
    }
  }

  function isInWingAPortalStairs(wx, wz) {
    const bA = D.buildings.find(item => item.id === "bldg_a");
    if (!bA) return false;
    const { lx, lz } = toBuildingLocal(bA, wx, wz);
    return lx >= -6.75 && lx <= 7.15 && lz >= 3.60 && lz <= 10.60;
  }

  function isInWingDEastCorridorOrStair(wx, wz) {
    const bD = D.buildings.find(item => item.id === "bldg_d");
    if (bD) {
      const { lx, lz } = toBuildingLocal(bD, wx, wz);
      if (lx >= 0.85 && lx <= bD.w / 2 + 0.45 && lz >= -bD.d / 2 - 2.4 && lz <= bD.d / 2 + 5.8) return true;
    }
    const bA = D.buildings.find(item => item.id === "bldg_a");
    if (bA) {
      const { lx, lz } = toBuildingLocal(bA, wx, wz);
      if (lx >= -36.50 && lx <= -31.50 && lz >= -5.50 && lz <= 2.50) return true;
    }
    return false;
  }

  function isAvatarInStairZone(wx, wz) {
    if (isInWingAPortalStairs(wx, wz)) return true;
    const bD = D.buildings.find(item => item.id === "bldg_d");
    if (bD) {
      const { lx, lz } = toBuildingLocal(bD, wx, wz);
      if (lx >= 1.15 && lx <= 4.85 && lz >= bD.d / 2 - 0.8 && lz <= bD.d / 2 + 4.1) return true;
    }
    const zones = (built && built.walkZones) || [];
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (!z.isStair) continue;
      const { lx, lz } = toBuildingLocal(z.b, wx, wz);
      const margin = 0.35;
      if (lx >= z.lxMin - margin && lx <= z.lxMax + margin && lz >= z.lzMin - margin && lz <= z.lzMax + margin) {
        return true;
      }
    }
    return false;
  }

  let wasOnFloor2ForStair = false;
  let isDescendingStairs = false;

  function getWalkElevation(wx, wz, curY) {
    const zones = built.walkZones || [];
    // 優先匹配斜坡／樓梯台階區 (rampAxis !== null)，避免在 2F 樓梯口下樓時被鄰接的 2F 走廊平面鎖在半空中
    let bestRampY = null;
    let bestRampDiff = Infinity;
    let bestFlatY = null;
    let bestFlatDiff = Infinity;

    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const { lx, lz } = toBuildingLocal(z.b, wx, wz);
      const isRamp = !!z.rampAxis;
      const margin = isRamp ? 0.14 : 0.22;
      if (lx < z.lxMin - margin || lx > z.lxMax + margin || lz < z.lzMin - margin || lz > z.lzMax + margin) continue;
      let ty = z.y0;
      if (z.rampAxis === "x") {
        const t = Math.max(0, Math.min(1, (lx - z.lxMin) / (z.lxMax - z.lxMin)));
        ty = z.y0 + (z.y1 - z.y0) * t;
      } else if (z.rampAxis === "z") {
        const t = Math.max(0, Math.min(1, (lz - z.lzMin) / (z.lzMax - z.lzMin)));
        ty = z.y0 + (z.y1 - z.y0) * t;
      }
      const diff = Math.abs(ty - curY);
      if (isRamp) {
        if (diff <= 1.55 && diff < bestRampDiff) {
          bestRampDiff = diff;
          bestRampY = ty;
        }
      } else {
        if (diff <= 1.45 && diff < bestFlatDiff) {
          bestFlatDiff = diff;
          bestFlatY = ty;
        }
      }
    }
    if (bestRampY !== null) return bestRampY;
    return bestFlatY !== null ? bestFlatY : 0;
  }

  function isInsideCorridorRoof(wx, wz) {
    for (let i = 0; i < D.buildings.length; i++) {
      const b = D.buildings[i];
      if (!((b.style && b.style.startsWith("wing_")) || b.style === "corridor")) continue;
      const { lx, lz } = toBuildingLocal(b, wx, wz);
      const minExtraZ = b.id === "bldg_d" ? 2.4 : 0.6;
      const extraZ = b.id === "bldg_a" ? 4.2 : (b.id === "bldg_c" ? 5.2 : (b.id === "bldg_d" ? 4.1 : 0.6));
      const extraX = b.id === "bldg_a" ? 2.0 : 0.6;
      if (Math.abs(lx) < b.w / 2 + extraX && lz > -b.d / 2 - minExtraZ && lz < b.d / 2 + extraZ) return true;
    }
    return false;
  }

  function enterWalkMode(spawn) {
    stopTour();
    walkMode = true;
    flyAnim = null;
    if (spawn) {
      walkState.x = spawn.x; walkState.z = spawn.z;
      walkState.y = typeof spawn.y === "number" ? spawn.y : getWalkElevation(spawn.x, spawn.z, 0);
      walkState.yaw = spawn.yaw || 0;
    } else {
      walkState.y = getWalkElevation(walkState.x, walkState.z, walkState.y);
    }
    autoOrbitActive = false;
    autoOrbitBuilding = null;
    camAzVel = 0;
    lastKeySig = "";
    walkZoomTween = null;
    walkOrbitVelYaw = 0;
    walkOrbitVelPitch = 0;
    smoothCamLiftY = 0;
    walkFollowDist = 3.5;
    wasOnFloor2ForStair = (walkState.y >= 2.85);
    isDescendingStairs = false;
    camState.target.set(walkState.x, walkState.y + 1.38, walkState.z);
    camState.yaw = walkState.yaw;
    camState.pitch = 0.20;
    camState.dist = walkFollowDist;
    applyCamera();
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
    autoOrbitActive = false;
    autoOrbitBuilding = null;
    camAzVel = 0;
    lastKeySig = "";
    walkZoomTween = null;
    isUserOrbiting = false;
    updateBuildingOcclusionOpacity(new Set(), 1.0);
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

  function startGuidedWalk(pts, startLabel, endLabel, totalDist, secs, endBid, endInfo) {
    clickWalkTarget = null;
    enterWalkMode({ x: pts[0].x, z: pts[0].z, y: pts[0].y, yaw: Math.atan2(pts[0].x - pts[1].x, pts[0].z - pts[1].z) });
    document.getElementById("walkHudBar").hidden = true; // 模擬帶路時顯示專用帶路面板
    if (navRouteGroup) {
      navRouteGroup.traverse(obj => {
        if (obj.userData && obj.userData.isStartPin) obj.visible = false;
      });
    }
    guidedWalk = {
      pts, idx: 1, totalDist: totalDist || 1, traveled: 0,
      paused: false, speed: 1, topView: false, endBid: endBid || null,
      isRoom: !!(endInfo && endInfo.isRoom),
      is2F: !!(endInfo && endInfo.is2F),
      enteredBuilding: false,
      facingYaw: (endInfo && typeof endInfo.facingYaw === "number") ? endInfo.facingYaw : null
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
    const rawFwd = -dy / maxR;
    const rawTurn = -dx / maxR;
    // 高齡友善搖桿直線死區：往前或往後推時，若左右偏移小於 28%，自動鎖定為直線行走不偏斜
    joyInput.fwd = Math.abs(rawFwd) < 0.12 ? 0 : rawFwd;
    if (Math.abs(rawTurn) < 0.26) {
      joyInput.turn = 0;
    } else {
      const normT = (Math.abs(rawTurn) - 0.26) / 0.74;
      joyInput.turn = Math.sign(rawTurn) * normT * Math.pow(normT, 0.35) * 0.78;
    }
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
  let adminAuthStatusMsg = "";
  function verifyGoogleAdminUser(user) {
    if (!user) return false;
    const em = (user.email || "").toLowerCase();
    const found = loadAdmins().find(a => a.email.toLowerCase() === em);
    if (!found) {
      if (fbAuth) fbAuth.signOut().catch(() => {});
      adminAuthStatusMsg = `帳號 <strong>${em}</strong> 不在後台指定管理者名單中，請選擇其他已授權的 Google 帳號。`;
      return false;
    }
    adminAuthStatusMsg = "";
    adminAuthedUser = { name: user.displayName || found.name, email: em };
    return true;
  }
  function startGoogleAdminSignIn() {
    if (!fbReady || !fbAuth) return;
    adminAuthStatusMsg = "正在導引至 Google 帳號認證畫面，請選擇要登入的 Google 帳號…";
    renderAdminModal();
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    fbAuth.signInWithPopup(provider).then(res => {
      verifyGoogleAdminUser(res.user);
      renderAdminModal();
    }).catch(err => {
      if (err && (err.code === "auth/popup-blocked" || err.code === "auth/cancelled-popup-request")) {
        fbAuth.signInWithRedirect(provider);
        return;
      }
      if (err && err.code === "auth/unauthorized-domain") {
        adminAuthStatusMsg = `目前網域 <code>${location.hostname}</code> 尚未加入 Firebase 授權網域。<br>請至 Firebase Console（<code>${window.FIREBASE_CONFIG.projectId}</code>）→ Authentication → Settings → Authorized domains 新增 <code>${location.hostname}</code>。`;
      } else if (err && err.code === "auth/popup-closed-by-user") {
        adminAuthStatusMsg = "您已關閉 Google 登入視窗，請點擊下方按鈕重新選擇 Google 帳號。";
      } else {
        adminAuthStatusMsg = `Google 登入失敗：${err ? err.message : "未知錯誤"}`;
      }
      renderAdminModal();
    });
  }
  (function initFirebase() {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.enabled || !cfg.apiKey || typeof firebase === "undefined") return;
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      fbAuth = firebase.auth();
      fbDb = firebase.firestore();
      fbReady = true;
      fbAuth.getRedirectResult().then(res => {
        if (res && res.user) {
          verifyGoogleAdminUser(res.user);
          adminModal.hidden = false;
          renderAdminModal();
        }
      }).catch(err => {
        if (err && err.code) {
          adminAuthStatusMsg = err.code === "auth/unauthorized-domain"
            ? `目前網域 <code>${location.hostname}</code> 尚未加入 Firebase 授權網域，請至 Firebase Console → Authentication → Settings → Authorized domains 新增 <code>${location.hostname}</code>。`
            : `Google 認證失敗：${err.message}`;
        }
      });
      // 啟動時從 Firestore 載入全校即時最新資料
      fbDb.collection("campus").doc("schoolYearOverrides").get().then(doc => {
        if (doc.exists && doc.data()) {
          const ov = doc.data();
          sanitizeOverrideRooms(ov);
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
  function sanitizeOverrideRooms(ov) {
    if (!ov || typeof ov !== "object") return;
    Object.values(ov).forEach(bOv => {
      if (!bOv || !bOv.floorsData) return;
      Object.values(bOv.floorsData).forEach(list => {
        if (!Array.isArray(list)) return;
        list.forEach(r => {
          if (r && (r.name === "綜合教室(一)／夜光天使" || r.name === "綜合教室(一)/夜光天使" || r.name === "夜光天使/綜(一)")) {
            r.name = "夜光天使/綜(二)";
          }
        });
      });
    });
  }
  function applyAdminOverrides() {
    try {
      const raw = localStorage.getItem(ADMIN_DATA_KEY);
      if (!raw) return;
      const ov = JSON.parse(raw);
      sanitizeOverrideRooms(ov);
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
          <p style="font-size:0.84rem;color:#475569;margin:0 0 12px;">${adminAuthStatusMsg || "請使用已授權之 Google 帳號登入後台，編輯後將即時同步至全校訪客："}</p>
          <button type="button" class="pill-btn active" id="googleSignInBtn" style="width:100%;margin-bottom:10px;">🔐 選擇 Google 帳號登入認證</button>
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
        document.getElementById("googleSignInBtn").onclick = startGoogleAdminSignIn;
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
    if (fbReady && !adminAuthedUser) {
      if (fbAuth && fbAuth.currentUser && verifyGoogleAdminUser(fbAuth.currentUser)) {
        renderAdminModal();
      } else {
        startGoogleAdminSignIn();
      }
      return;
    }
    renderAdminModal();
  };

  // --- 9. 主動畫迴圈 ---
  function updateWalkOrbitControls(dt, now) {
    if (Math.abs(walkOrbitVelYaw) > 1e-5 || Math.abs(walkOrbitVelPitch) > 1e-5) {
      camState.yaw += walkOrbitVelYaw;
      camState.pitch += walkOrbitVelPitch;
      const damp = Math.exp(-18 * dt);
      walkOrbitVelYaw *= damp;
      walkOrbitVelPitch *= damp;
      if (Math.abs(walkOrbitVelYaw) < 1e-5) walkOrbitVelYaw = 0;
      if (Math.abs(walkOrbitVelPitch) < 1e-5) walkOrbitVelPitch = 0;
    }
    const indoor = walkState.y > 0.2 || isInsideCorridorRoof(walkState.x, walkState.z);
    if (walkZoomTween) {
      const p = Math.min(1, (now - walkZoomTween.t0) / walkZoomTween.dur);
      const ease = 1 - Math.pow(1 - p, 3);
      walkFollowDist = walkZoomTween.startDist + (walkZoomTween.endDist - walkZoomTween.startDist) * ease;
      if (p >= 1) walkZoomTween = null;
    }
    // 室內/走廊平滑限制俯仰角，避免進入走廊瞬間角度跳動並確保攝影機位於天花板下方跟隨小人；若為下樓高處鳥瞰則開放鳥瞰俯仰角 (1.30)
    // 若在樓梯仰角跟拍區，開放低角度仰拍 (minPitch = -0.15)
    const inStairArea = isInWingAPortalStairs(walkState.x, walkState.z) || isInWingDEastCorridorOrStair(walkState.x, walkState.z) || isAvatarInStairZone(walkState.x, walkState.z);
    const maxPitch = isDescendingStairs ? 1.30 : (indoor ? 0.34 : 1.25);
    const minPitch = (inStairArea && !isDescendingStairs) ? -0.15 : (walkMode ? -0.08 : 0.06);
    if (camState.pitch > maxPitch) {
      camState.pitch += (maxPitch - camState.pitch) * (1 - Math.exp(-8 * dt));
    } else if (camState.pitch < minPitch) {
      camState.pitch = minPitch;
    }
  }

  // 全校樓梯行走嚴格包絡面防護夾緊器（雙重防穿模）：
  // 在小人攀爬樓梯與平台期間 (0.30m <= y <= 3.55m)，嚴格夾緊小人於安全梯道與轉折平台內，絕不碰到牆體或扶手穿模
  function clampAvatarToStairEnclosure() {
    if (walkState.y < 0.30 || walkState.y > 3.55) return;
    const bA = D.buildings.find(item => item.id === "bldg_a");
    if (bA) {
      const aLoc = toBuildingLocal(bA, walkState.x, walkState.z);
      // 1. A 棟西側樓梯 + D 棟南側連通樓梯 (lx_A: -35.76 .. -32.16, lz_A: -5.17 .. 1.42，共用迴轉平台可直通 D 棟樓梯)
      if (aLoc.lx >= -36.50 && aLoc.lx <= -31.50 && aLoc.lz >= -5.20 && aLoc.lz <= 1.80) {
        let nLx = THREE.MathUtils.clamp(aLoc.lx, -35.62, -32.28);
        let nLz = aLoc.lz;
        if (nLz >= -1.35) {
          if (walkState.y < 1.50) nLx = Math.min(-34.06, nLx);
          else if (walkState.y > 2.15) nLx = Math.max(-33.86, nLx);
        }
        if (Math.abs(nLx - aLoc.lx) > 1e-4) {
          const w = toBuildingWorld(bA, nLx, nLz);
          walkState.x = w.x; walkState.z = w.z;
        }
        return;
      }
      // 2. A 棟中央玄關西側雙折樓梯 (lx: -6.23 .. -2.23, lz: 4.87 .. 8.47)
      if (aLoc.lx >= -6.80 && aLoc.lx <= -1.80 && aLoc.lz >= 4.40 && aLoc.lz <= 8.90) {
        let nLz = THREE.MathUtils.clamp(aLoc.lz, 4.96, 8.38);
        let nLx = Math.max(-6.12, aLoc.lx);
        if (nLx >= -4.85) {
          if (walkState.y < 1.50) nLz = Math.max(6.75, nLz);
          else if (walkState.y > 2.15) nLz = Math.min(6.58, nLz);
        }
        if (Math.abs(nLx - aLoc.lx) > 1e-4 || Math.abs(nLz - aLoc.lz) > 1e-4) {
          const w = toBuildingWorld(bA, nLx, nLz);
          walkState.x = w.x; walkState.z = w.z;
        }
        return;
      }
      // 3. A 棟中央玄關東側雙折樓梯 (pMaxA = 2.87 -> lx: 2.92 .. 6.92, lz: 4.87 .. 8.47)
      if (aLoc.lx >= 2.50 && aLoc.lx <= 7.30 && aLoc.lz >= 4.40 && aLoc.lz <= 8.90) {
        let nLz = THREE.MathUtils.clamp(aLoc.lz, 4.96, 8.38);
        let nLx = Math.min(6.80, aLoc.lx);
        if (nLx <= 5.55) {
          if (walkState.y < 1.50) nLz = Math.max(6.75, nLz);
          else if (walkState.y > 2.15) nLz = Math.min(6.58, nLz);
        }
        if (Math.abs(nLx - aLoc.lx) > 1e-4 || Math.abs(nLz - aLoc.lz) > 1e-4) {
          const w = toBuildingWorld(bA, nLx, nLz);
          walkState.x = w.x; walkState.z = w.z;
        }
        return;
      }
    }
  }

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, Math.max(0.001, (now - lastAnimNow) / 1000));
    lastAnimNow = now;

    // 規格 1：先結算軌道控制（阻尼、縮放、仰角限制），再執行人物移動與跟隨鏡頭
    if (walkMode && !walkFirstPerson && !guidedWalk) {
      updateWalkOrbitControls(dt, now);
    }

    // 動態路線前進箭頭
    if (routeCurve && routeArrows.length > 0) {
      const tBase = (now * 0.00018) % 1;
      routeArrows.forEach(a => {
        const u = (a.offset + tBase) % 1;
        const p = routeCurve.getPointAt(u);
        const pNext = routeCurve.getPointAt(Math.min(1, u + 0.01));
        a.mesh.position.set(p.x, p.y + 0.27, p.z);
        a.mesh.lookAt(pNext.x, pNext.y + 0.27, pNext.z);
      });
    }

    if (walkMode) {
      const prevWalkX = walkState.x, prevWalkZ = walkState.z;
      let fwd = joyInput.fwd;
      let turn = joyInput.turn * 0.028;
      let strafe = 0;

      // 判定是否從 2F 往下走樓梯（包含下到迴轉平台與下到 1F 地面）
      const inStairNow = isAvatarInStairZone(walkState.x, walkState.z);
      if (walkState.y >= 2.85) {
        wasOnFloor2ForStair = true;
        isDescendingStairs = false;
      } else if (walkState.y <= 0.18) {
        // 小人已下到 1F 地面，解除下樓鳥瞰，回復正常攝影機視角
        wasOnFloor2ForStair = false;
        isDescendingStairs = false;
      } else if (wasOnFloor2ForStair && inStairNow) {
        isDescendingStairs = true;
      }

      // WASD 之 W/S 與方向鍵 上/下 為前進後退；A/D 與方向鍵 左/右 為漸進式柔和左轉右轉（短按微調不轉過頭、長按順暢轉彎）
      if (!guidedWalk) {
        if (keys["w"] || keys["arrowup"]) fwd += 1;
        if (keys["s"] || keys["arrowdown"]) fwd -= 0.75;
        const turnLeft = !!(keys["a"] || keys["arrowleft"]);
        const turnRight = !!(keys["d"] || keys["arrowright"]);
        if (turnLeft || turnRight) {
          walkState.turnHold = Math.min(1.0, (walkState.turnHold || 0) + dt * 2.2);
          const turnRate = 0.015 + 0.015 * walkState.turnHold;
          if (turnLeft) turn += turnRate;
          if (turnRight) turn -= turnRate;
        } else {
          walkState.turnHold = 0;
        }
      }
      const isUserTurning = Math.abs(turn) > 1e-4;
      const useLockedKeyBasis = false;
      const curKeySig = "";

      // 點擊地面／走廊／樓梯自動尋路行走（具備自動繞柱與避障能力）
      if (clickWalkTarget && !guidedWalk) {
        if (curKeySig.length > 0 || Math.abs(fwd) > 0.1 || Math.abs(strafe) > 0.1 || isUserTurning) {
          clickWalkTarget = null;
        } else {
          const dx = clickWalkTarget.x - walkState.x, dz = clickWalkTarget.z - walkState.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.55) {
            clickWalkTarget = null;
          } else {
            let targetYaw = Math.atan2(-dx, -dz);
            const probeDist = Math.min(d * 0.85, 0.55);
            if (isBlocked(walkState.x - Math.sin(targetYaw) * probeDist, walkState.z - Math.cos(targetYaw) * probeDist, walkState.y)) {
              for (let oi = 0; oi < SLIDE_ANGLES.length; oi++) {
                const ty = targetYaw + SLIDE_ANGLES[oi];
                if (!isBlocked(walkState.x - Math.sin(ty) * probeDist, walkState.z - Math.cos(ty) * probeDist, walkState.y)) {
                  targetYaw = ty;
                  break;
                }
              }
            }
            const yawDiff = normalizeAngleDiff(targetYaw - walkState.yaw);
            walkState.yaw += yawDiff * Math.min(1, 10 * dt);
            camState.yaw += yawDiff * Math.min(1, 4.5 * dt);
            fwd = Math.min(1, Math.max(0.45, d * 0.7));
          }
        }
      }

      const inStairFollowZone = isInWingAPortalStairs(walkState.x, walkState.z) || isInWingDEastCorridorOrStair(walkState.x, walkState.z) || inStairNow;

      // 模擬自動帶路 (鳥瞰跟隨 + 即將抵達切換垂直俯瞰)
      if (guidedWalk && !guidedWalk.paused && guidedWalk.idx < guidedWalk.pts.length) {
        const tgt = guidedWalk.pts[guidedWalk.idx];
        const dx = tgt.x - walkState.x, dz = tgt.z - walkState.z;
        const d = Math.hypot(dx, dz);
        const isLastPt = guidedWalk.idx === guidedWalk.pts.length - 1;
        const arriveR = isLastPt ? 0.35 : 0.75;
        if (d < arriveR) {
          if (isLastPt) {
            walkState.x = tgt.x;
            walkState.z = tgt.z;
            walkState.y = getWalkElevation(walkState.x, walkState.z, walkState.y);
          }
          guidedWalk.idx++;
          if (guidedWalk.idx >= guidedWalk.pts.length) {
            const destBid = guidedWalk.endBid;
            const destIsRoom = guidedWalk.isRoom;
            const destFacingYaw = guidedWalk.facingYaw;
            document.getElementById("guideProgressFill").style.width = "100%";
            guidedWalk = null;
            clearNavRoute();
            document.getElementById("guideControlBar").hidden = true;
            // 保持人物站立於定點並轉向面對目的地門牌正面，鏡頭切換為人物背後清晰視角
            walkMode = true;
            walkFirstPerson = false;
            walkFollowDist = destIsRoom ? 3.25 : 6.5;
            walkState.pitch = 0.06;
            walkerGroup.visible = true;
            document.getElementById("walkModeBtn").classList.add("active");
            document.getElementById("walkHudBar").hidden = false;
            document.getElementById("walkJoystick").classList.add("visible");
            const miniWrap = document.getElementById("minimapWrap");
            if (miniWrap && minimapEnabled) miniWrap.classList.add("visible");
            const destB = destBid ? D.buildings.find(item => item.id === destBid) : null;
            if (typeof destFacingYaw === "number") {
              walkState.yaw = destFacingYaw;
            } else if (destB) {
              const fdx = destB.x - walkState.x, fdz = destB.z - walkState.z;
              if (Math.hypot(fdx, fdz) > 0.2) walkState.yaw = Math.atan2(-fdx, -fdz);
            }
            if (destB && !destIsRoom) {
              selectedBuildingId = destB.id;
              renderDetailDrawer(destB);
            } else {
              detailDrawer.hidden = true;
            }
            const arriveIndoor = walkState.y > 0.2 || isInsideCorridorRoof(walkState.x, walkState.z);
            camState.target.set(walkState.x, walkState.y + (arriveIndoor ? 1.38 : 1.0), walkState.z);
            camState.yaw = walkState.yaw;
            camState.pitch = destIsRoom ? 0.08 : 0.28;
            camState.dist = walkFollowDist;
            applyCamera();
            clampCameraObstruction(camState.target, camera.position, 1.05);
          }
        } else {
          // 順暢朝向目標路徑點行進，不產生大幅偏航或折返擺動
          const steerYaw = Math.atan2(-dx, -dz);
          walkState.yaw = steerYaw;

          // 帶路速度：
          // 平地（操場、庭院、走廊、風雨連廊等）：100% 全速順暢前進（支援 1x 正常與 2x 快速，絕不延遲拖慢）
          // 階梯段：僅在人物實際位於樓梯且爬升高度差大於 0.15m 時，稍微調至 0.82x 速度，步態穩健從容自然
          const onActualStairs = (inStairNow && walkState.y > 0.18) || (Math.abs(tgt.y - walkState.y) > 0.15 && walkState.y > 0.18);
          const stairSpeedFactor = onActualStairs ? 0.82 : 1.0;
          const baseSpeed = guidedWalk.speed * stairSpeedFactor;
          fwd = (isLastPt && d < 0.95) ? Math.min(baseSpeed, 0.70) : baseSpeed;
        }
      }

      const frameScale = dt * 60;
      turn *= frameScale;
      walkState.yaw += turn;
      if (walkMode && !walkFirstPerson && !guidedWalk && Math.abs(turn) > 1e-5) {
        camState.yaw += turn;
      }

      // 若老師剛用滑鼠旋轉了觀看方向，按下前進 (W / ↑ / 搖桿往前) 時，讓小人平滑朝向畫面正前方前進（「看哪裡就往哪裡走」，直覺不走歪）
      // 在樓梯與轉向梯道跟拍區中，小人自由轉向行進，攝影機在後方跟隨跟拍，不強行把小人拉回舊鏡頭視角
      if (!guidedWalk && !clickWalkTarget && !walkFirstPerson && fwd > 0.05 && !isUserOrbiting && !inStairFollowZone) {
        const camDiff = normalizeAngleDiff(camState.yaw - walkState.yaw);
        if (Math.abs(camDiff) > 0.005) {
          walkState.yaw += camDiff * Math.min(1, 10 * dt);
        }
      }

      const moveSpd = 0.185 * fwd * frameScale;
      const strafeSpd = 0.185 * strafe * frameScale;
      let worldDx = 0, worldDz = 0;
      let isMovingNow = false;
      if (Math.abs(moveSpd) > 0.004 || Math.abs(strafeSpd) > 0.004) {
        worldDx = -Math.sin(walkState.yaw) * moveSpd + Math.cos(walkState.yaw) * strafeSpd;
        worldDz = -Math.cos(walkState.yaw) * moveSpd - Math.sin(walkState.yaw) * strafeSpd;
        isMovingNow = true;
      }

      if (isMovingNow) {
        const movedStep = moveWalkerSmoothly(worldDx, worldDz, walkState.y, dt, isUserTurning);
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
        walkState.stepPhase += 0.22 * frameScale * Math.max(1, Math.abs(fwd), Math.abs(strafe));
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

      // 樓梯防護夾緊（確保小人絕對不越界出模）
      clampAvatarToStairEnclosure();

      walkerGroup.position.set(walkState.x, walkState.y, walkState.z);
      walkerGroup.rotation.y = walkState.yaw;

      if (navRouteGroup) {
        // 依使用者指示：定位柱體（紅色終點柱、綠色起點柱）僅作內部計算，完全隱藏不呈現在使用者畫面中
        navRouteGroup.traverse(obj => {
          if (obj.userData && (obj.userData.isStartPin || obj.userData.isEndPin)) obj.visible = false;
        });
      }

      if (guidedWalk) {
        const nowInsideBuilding = walkState.y > 0.15 || isInsideCorridorRoof(walkState.x, walkState.z);
        if (nowInsideBuilding) guidedWalk.enteredBuilding = true;
        if (guidedWalk.enteredBuilding && !guidedWalk.topView) {
          // 進入建築物後：攝影機自動切換為水平視角跟隨小人後方拍攝，直到抵達並面對目的地教室門牌
          // 走 A 棟中廊玄關樓梯或 D 棟樓梯時改為由下而上仰視中景跟拍 (3.25m, 仰角約 -11.5°)，緊貼小人背後，轉向時零盲區，可清楚看見小人與迴轉平台；
          // 若由 2F 往下走樓梯，自動切換為高處鳥瞰視角 (俯角 ~67.6°、距離 5.2m)，直到下到 1F 地面
          const inStairGuide = isInWingAPortalStairs(walkState.x, walkState.z) || isInWingDEastCorridorOrStair(walkState.x, walkState.z) || inStairNow;
          const onLandingGuide = inStairGuide && walkState.y >= 1.50 && walkState.y <= 2.15;
          let targetDistGuide = inStairGuide ? 3.85 : 2.65;
          let targetPitchGuide = inStairGuide ? (onLandingGuide ? 0.22 : -0.10) : 0.12;
          let targetYGuide = inStairGuide ? 1.15 : 1.38;
          if (isDescendingStairs) {
            if (walkState.y >= 1.30) {
              // 下樓梯至迴轉平台：高處鳥瞰俯拍，完整看清小人、平台與往 1F 階梯路徑，絕不放大貼背
              targetPitchGuide = 0.94;
              targetDistGuide = 5.4;
              targetYGuide = 0.72;
            } else {
              // 已進入往 1F 的下半段階梯：平滑轉為微俯跟拍
              targetPitchGuide = 0.40;
              targetDistGuide = 4.0;
              targetYGuide = 1.05;
            }
          }
          const yawDiff = normalizeAngleDiff(walkState.yaw - camState.yaw);
          const guideYawSpeed = onLandingGuide ? 2.2 : (inStairGuide ? 4.8 : 7.5);
          camState.yaw += yawDiff * Math.min(1, guideYawSpeed * dt);
          camState.pitch += (targetPitchGuide - camState.pitch) * (1 - Math.exp(-7 * dt));
          camState.dist += (targetDistGuide - camState.dist) * (1 - Math.exp(-7 * dt));
          desiredWalkTarget.set(walkState.x, walkState.y + targetYGuide, walkState.z);
          camState.target.lerp(desiredWalkTarget, 1 - Math.exp(-14 * dt));
          applyCamera();
          clampCameraObstruction(camState.target, camera.position, inStairGuide ? 2.4 : 1.05);

          if (!isDescendingStairs) {
            const camGroundY = getWalkElevation(camera.position.x, camera.position.z, walkState.y);
            const minClearance = inStairGuide ? 0.30 : 1.15;
            const neededLift = Math.max(0, (camGroundY + minClearance) - camera.position.y);
            const maxCeilingLift = Math.max(0, (walkState.y + 3.22) - camera.position.y);
            const targetLift = Math.min(neededLift, maxCeilingLift);
            smoothCamLiftY += (targetLift - smoothCamLiftY) * (1 - Math.exp(-10 * dt));
            if (smoothCamLiftY > 0.005) {
              camera.position.y += smoothCamLiftY;
              camera.lookAt(camState.target);
            }
          } else {
            smoothCamLiftY = 0;
            if (camera.position.y > 6.65) {
              camera.position.y = 6.65;
              camera.lookAt(camState.target);
            }
          }
          updateCameraLineOfSightCulling(camera.position, walkState.x, walkState.y, walkState.z);
        } else {
          restoreCulledLensMeshes();
          const rem = Math.max(0, guidedWalk.totalDist - guidedWalk.traveled);
          const wantTop = guidedWalk.topView || (!guidedWalk.isRoom && rem < 14);
          const tgtPitch = wantTop ? 1.46 : 0.84;
          const tgtDist = wantTop ? 36 : 42;
          camState.pitch += (tgtPitch - camState.pitch) * 0.08;
          camState.dist += (tgtDist - camState.dist) * 0.08;
          camState.target.set(walkState.x, walkState.y + 1.2, walkState.z);
          applyCamera();
        }
      } else if (walkFirstPerson) {
        restoreCulledLensMeshes();
        camera.position.set(walkState.x, walkState.y + 1.62, walkState.z);
        camera.lookAt(
          walkState.x - Math.sin(walkState.yaw) * 10,
          walkState.y + 1.62 - Math.sin(walkState.pitch) * 6,
          walkState.z - Math.cos(walkState.yaw) * 10
        );
      } else {
        const indoor = walkState.y > 0.2 || isInsideCorridorRoof(walkState.x, walkState.z);
        const inDEast = isInWingDEastCorridorOrStair(walkState.x, walkState.z);
        const inAStairs = isInWingAPortalStairs(walkState.x, walkState.z);
        const inStairFollow = inAStairs || inDEast || inStairNow;
        const onLandingFree = inStairFollow && walkState.y >= 1.50 && walkState.y <= 2.15;

        // 樓梯最佳跟拍邏輯：
        // 1. 迴轉平台轉向時放緩鏡頭旋轉 (followRate = 2.2)，不急貼小人背後放大，維持穩定比例看清路徑與平台；
        // 2. 下樓至迴轉平台 (y >= 1.30m) 採用高處鳥瞰俯拍 (pitch 0.94, dist 5.4m)，進入往 1F 下半段 (y < 1.30m) 再平順轉回後方微俯跟拍；
        // 3. 遮擋屋頂與薄牆由 updateCameraLineOfSightCulling 自動透視隱藏，確保小人永遠清晰可見。
        if (inStairFollow && !isUserOrbiting) {
          const followDiff = normalizeAngleDiff(walkState.yaw - camState.yaw);
          const followRate = onLandingFree ? 2.2 : (isDescendingStairs && walkState.y >= 1.30 ? 2.6 : 4.8);
          camState.yaw += followDiff * Math.min(1, followRate * dt);
          let targetPitch;
          if (isDescendingStairs) {
            targetPitch = walkState.y >= 1.30 ? 0.94 : 0.40;
          } else {
            targetPitch = onLandingFree ? 0.22 : -0.10;
          }
          camState.pitch += (targetPitch - camState.pitch) * (1 - Math.exp(-7 * dt));
        }

        // 1. 永遠以小人中心高度為穩定視角中心，維持穩定比例與視野
        moveDeltaVec.set(walkState.x - prevWalkX, 0, walkState.z - prevWalkZ);
        camState.target.add(moveDeltaVec);
        const targetCenterY = (isDescendingStairs && walkState.y >= 1.30) ? 0.72 : (inStairFollow ? 1.15 : 1.38);
        desiredWalkTarget.set(walkState.x, walkState.y + targetCenterY, walkState.z);
        camState.target.lerp(desiredWalkTarget, 1 - Math.exp(-14 * dt));

        // 2. 若原本處於遠景總覽距離，開始移動時觸發一次性平滑飛近 Tween
        if ((isMovingNow || moveDeltaVec.lengthSq() > 1e-5) && walkFollowDist > 34 && !walkZoomTween) {
          walkZoomTween = { t0: now, dur: 650, startDist: walkFollowDist, endDist: 3.5 };
        }

        // 3. 攝影機跟隨距離（維持穩定中遠景，不放大貼背）
        let targetDist;
        if (isDescendingStairs) {
          targetDist = walkState.y >= 1.30 ? 5.4 : 4.0;
        } else if (inStairFollow) {
          targetDist = onLandingFree ? 4.0 : 3.85;
        } else if (indoor) {
          targetDist = Math.min(Math.max(2.55, walkFollowDist), 2.95);
        } else {
          targetDist = Math.max(2.6, walkFollowDist);
        }

        const distLerpRate = targetDist < camState.dist ? (1 - Math.exp(-12 * dt)) : (1 - Math.exp(-8 * dt));
        camState.dist += (targetDist - camState.dist) * distLerpRate;

        applyCamera();
        clampCameraObstruction(camState.target, camera.position, inStairFollow ? 2.4 : 1.05);

        // 4. 上下樓梯防穿階平滑抬升：梯道仰角跟拍時維持貼近地面 (~0.30m)，防相機沉入台階，同時絕不把鏡頭推高到 2F 樓板或天花板
        if (!isDescendingStairs) {
          const camGroundY = getWalkElevation(camera.position.x, camera.position.z, walkState.y);
          const minClearance = inStairFollow ? 0.30 : 1.15;
          const neededLift = Math.max(0, (camGroundY + minClearance) - camera.position.y);
          const maxCeilingLift = Math.max(0, (walkState.y + 3.22) - camera.position.y);
          const targetLift = Math.min(neededLift, maxCeilingLift);
          smoothCamLiftY += (targetLift - smoothCamLiftY) * (1 - Math.exp(-10 * dt));
          if (smoothCamLiftY > 0.005) {
            camera.position.y += smoothCamLiftY;
            camera.lookAt(camState.target);
          }
        } else {
          smoothCamLiftY = 0;
          if (camera.position.y > 6.65) {
            camera.position.y = 6.65;
            camera.lookAt(camState.target);
          }
        }

        // 5. 確保攝影機在室內跟著小人移動時，不會被鏡頭正後方的單一薄牆或欄杆擋住小人（且全場景 100% 實體無半透明殘影）
        updateCameraLineOfSightCulling(camera.position, walkState.x, walkState.y, walkState.z);
      }
      if (compassDial) compassDial.style.transform = `rotate(${((walkFirstPerson ? walkState.yaw : camState.yaw) * 180) / Math.PI}deg)`;
    } else {
      updateBuildingOcclusionOpacity(new Set(), dt);
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
