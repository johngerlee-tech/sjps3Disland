// 雲林縣斗六市溪洲國民小學 (SJES) 3D 校園資料庫
// 坐標基準：TWD97 原點 (E=204650, N=2626450)，+X 往東、+Z 往南、單位：公尺 (m)
// 依據：115年7月校園地形測繪成果圖 (S=1/800)、OpenStreetMap (way/496734200)、115學年度校舍配置圖

window.CAMPUS_DATA = {
  school: {
    name: "雲林縣斗六市溪洲國民小學",
    shortName: "溪洲國小",
    englishName: "Shijou Elementary School (SJES)",
    address: "640 雲林縣斗六市溪洲里萬年路 809 號",
    addressEn: "No. 809, Wannian Rd., Douliu City, Yunlin County, Taiwan",
    osmWayId: "496734200",
    coordinates: { lat: 23.7410, lon: 120.5551 }
  },

  // 測繪成果底圖對位參數 (供階段 1 空間位置與角度驗證)
  surveyOverlay: {
    x: 22.99,
    z: 11.82,
    w: 345.32,
    d: 244.17
  },

  // 分區快速視角
  zones: [
    { id: "all", name: "全校總覽", nameEn: "Overview", icon: "🏫", target: [8.53, 1.86, 29.06], camPos: [89.88, 49.78, 84.85] },
    { id: "front", name: "校門・前庭生態池", nameEn: "Front Plaza", icon: "💧", target: [28, 3, 36], camPos: [68, 42, 82] },
    { id: "quad", name: "校舍・中庭教學區", nameEn: "Courtyard & Wings", icon: "🏛️", target: [2, 4, 10], camPos: [25, 62, 74] },
    { id: "sports", name: "光電球場・PU跑道", nameEn: "Sports & Track", icon: "🎾", target: [-38, 3, 55], camPos: [-65, 68, 125] },
    { id: "agri", name: "食農・綠活網室菜園", nameEn: "Agri & Garden", icon: "🌱", target: [62, 3, -15], camPos: [92, 42, 32] }
  ],

  // 東西南北方位標籤
  cardinalMarkers: [
    { dir: "N", label: "北 N", labelEn: "North", sub: "後方綠地・遊戲場側", subEn: "Back Woods & Playground", x: -10, z: -48, color: "#E63946" },
    { dir: "S", label: "南 S", labelEn: "South", sub: "光電綜合球場南側", subEn: "South Perimeter", x: -15, z: 118, color: "#0077B6" },
    { dir: "E", label: "東 E", labelEn: "East", sub: "萬年路・校門側", subEn: "Wannian Rd. & Main Gate", x: 96, z: 25, color: "#D97706" },
    { dir: "W", label: "西 W", labelEn: "West", sub: "PU 跑道運動場側", subEn: "Athletic Track Side", x: -128, z: 32, color: "#2A9D8F" }
  ],

  // 校區外圍多邊形頂點 (OpenStreetMap way/496734200 實測經緯度轉 TWD97 相對座標)
  campusBoundary: [
    [-122.10, 23.99],
    [-76.61, 99.78],
    [-68.50, 98.20],
    [-46.00, 97.50],
    [-28.05, 109.65],
    [-11.40, 99.21],
    [-4.34, 108.17],
    [27.50, 76.00],
    [22.00, 60.50],
    [56.63, 44.89],
    [63.83, 35.79],
    [86.50, -13.50],
    [71.00, -29.00],
    [56.84, -30.66],
    [19.60, -34.31],
    [-8.62, -38.07],
    [-70.97, -4.46]
  ],

  // 周邊道路 (萬年路及鄰近道路)
  externalRoads: [
    {
      id: "rd_wannian",
      name: "萬年路",
      nameEn: "Wannian Rd.",
      width: 11,
      isPrimary: true,
      points: [
        [102.0, -45.0],
        [95.0, 15.0],
        [89.0, 58.0],
        [72.0, 96.0],
        [45.0, 128.0]
      ],
      labelPositions: [
        { x: 91, z: 34, text: "萬年路", textEn: "Wannian Rd." },
        { x: 66, z: 96, text: "萬年路", textEn: "Wannian Rd." }
      ]
    },
    {
      id: "rd_gate_approach",
      name: "校門引道",
      nameEn: "Entrance Lane",
      width: 8,
      isPrimary: false,
      points: [
        [87.7, 60.9],
        [53.0, 34.9]
      ],
      labelPositions: []
    },
    {
      id: "rd_north_canal",
      name: "北側水圳農路",
      nameEn: "North Farm Lane",
      width: 5,
      isPrimary: false,
      points: [
        [-138.0, 16.0],
        [-72.0, -22.0],
        [-20.0, -52.0]
      ],
      labelPositions: []
    }
  ],

  // 校內鋪面區域 (前庭廣場、中庭、運動場周邊磁磚道)
  plazas: [
    // 前庭廣場 (A棟南側到校門之間，拼色高壓磚地坪)
    { id: "front_plaza", x: 30.0, z: 35.0, w: 58.0, d: 28.0, rotY: 0.525, color: "#D6CFC4", paving: "interlock" },
    // A棟南側相鄰地坪（覆蓋原本青綠色草地為同款拼色高壓磚）
    { id: "front_plaza_a", x: 11.8, z: 31.6, w: 78.0, d: 13.2, rotY: 0.531, color: "#D6CFC4", paving: "interlock" },
    // 前庭圓形大樹草坪
    { id: "front_lawn", x: 41.0, z: 31.7, w: 14.5, d: 14.5, rotY: 0.525, color: "#5FA04E", isRound: true },
    // 西中庭綠地
    { id: "courtyard_w", x: -9.5, z: 13.5, w: 23.0, d: 17.5, rotY: 0.525, color: "#689F52" },
    // 東中庭 (含 3D 童趣彩繪地坪區)
    { id: "courtyard_e", x: 19.5, z: -2.0, w: 22.0, d: 17.5, rotY: 0.525, color: "#76A85E" },
    // 操場與D棟間磁磚步道
    { id: "track_walkway", x: -39.0, z: 26.0, w: 8.0, d: 38.0, rotY: 0.525, color: "#CBC3B8" },
    // 拼貼式高壓磚右側過去至食農教室、廚房前方及校門右側停車場之舊式紅色連鎖磚鋪面區（依「前庭紅色連鎖磚地坪的範圍.jpg」與實景照片精準對位：西側邊界與拼色高壓磚切齊；北側黃色劃記線以北通道保持青綠地，不鋪設紅磚）
    {
      id: "ne_plaza",
      paving: "red_interlock",
      color: "#B84A39",
      points: [
        [61.8, -3.0],
        [81.5, -6.5],
        [74.0, 11.5],
        [63.8, 33.0],
        [56.0, 22.0],
        [61.8, -3.0]
      ]
    }
  ],

  // 校園建築與場域量體 (rotY 統一約 +0.525 rad ≈ 30.1°，西南→東北走向)
  buildings: [
    // 1. 主要四棟校舍與中庭連廊 (A棟向東延伸銜接C棟)
    {
      id: "bldg_a",
      category: "teaching",
      zone: "quad",
      x: 12.48, z: 18.56, w: 63.13, d: 9.04, rotY: 0.531,
      floors: 2, floorHeight: 3.6,
      style: "wing_a",
      passages: [{ localX: 0.37, halfWidth: 2.5 }],
      colors: { wall: "#F2EAE1", accent: "#C85A32", roof: "#78A07C", solar: "#1E3A5F" }
    },
    {
      id: "bldg_b",
      category: "teaching",
      zone: "quad",
      x: -5.05, z: -5.15, w: 77.90, d: 10.15, rotY: 0.540,
      floors: 2, floorHeight: 3.6,
      style: "wing_b",
      passages: [{ localX: 3.4, halfWidth: 2.5 }],
      colors: { wall: "#F4F2ED", accent: "#3B82F6", roof: "#D8D6CF", solar: "#1E3A5F" }
    },
    {
      id: "bldg_c",
      category: "teaching",
      zone: "quad",
      x: 38.64, z: -9.50, w: 13.25, d: 28.24, rotY: 0.522,
      floors: 2, floorHeight: 3.6,
      style: "wing_c",
      colors: { wall: "#F5F2EB", accent: "#EAB308", roof: "#6E7681" }
    },
    {
      id: "bldg_d",
      category: "teaching",
      zone: "quad",
      x: -26.27, z: 24.69, w: 12.00, d: 18.41, rotY: 0.516,
      floors: 2, floorHeight: 3.6,
      style: "wing_d",
      colors: { wall: "#F4F1EA", accent: "#22C55E", roof: "#78A07C", solar: "#1E3A5F" }
    },
    {
      id: "corridor_mid",
      category: "facility",
      zone: "quad",
      x: 5.75, z: 6.36, w: 5.20, d: 20.90, rotY: 0.528,
      floors: 2, floorHeight: 3.6,
      style: "corridor",
      noCollide: true,
      colors: { wall: "#E5E2DA", accent: "#94A3B8", roof: "#CBD5E1", solar: "#1E3A5F" }
    },
    {
      id: "samba_wall",
      category: "landmark",
      zone: "quad",
      x: -41.5, z: 16.6, w: 6.2, d: 10.2, rotY: 0.540,
      floors: 1, floorHeight: 4.5,
      style: "samba",
      colors: { wall: "#F0FDF4", accent: "#EF4444" }
    },
    {
      id: "mural_courtyard",
      category: "landmark",
      zone: "quad",
      x: 26.5, z: -3.5, w: 7.6, d: 16.5, rotY: 0.522,
      floors: 1, floorHeight: 0.25,
      style: "mural3d",
      colors: { base: "#38BDF8", accent: "#FACC15" }
    },

    // 2. 光電綜合球場 (大跨距太陽能棚架)
    {
      id: "solar_court",
      category: "sport",
      zone: "sports",
      x: -6.5, z: 74.0, w: 53.5, d: 41.5, rotY: 0.525,
      floors: 1, floorHeight: 8.5,
      style: "solar_court",
      colors: { wall: "#CBD5E1", accent: "#1D4ED8", roof: "#1E3A5F" }
    },

    // 3. PU 跑道運動場 (地景場域)
    {
      id: "track_field",
      category: "sport",
      zone: "sports",
      x: -68.2, z: 41.8, w: 33.0, d: 71.0, rotY: 0.472,
      floors: 1, floorHeight: 0.3,
      style: "track",
      colors: { track: "#C14D3A", turf: "#5B9A49" }
    },

    // 4. 司令台與網球主題廁所
    {
      id: "stage_dream",
      category: "landmark",
      zone: "sports",
      x: -38.64, z: 34.70, w: 5.61, d: 6.86, rotY: 0.519,
      floors: 1, floorHeight: 3.8,
      style: "stage",
      colors: { wall: "#EDE8DF", wood: "#9A6B43", roof: "#64748B" }
    },
    {
      id: "tennis_toilet",
      category: "landmark",
      zone: "sports",
      x: -19.99, z: 37.63, w: 3.8, d: 9.04, rotY: 0.531,
      floors: 2, floorHeight: 3.6,
      style: "toilet",
      colors: { wall: "#FEF08A", accent: "#84CC16", roof: "#78A07C" }
    },

    // 5. 前庭入口意象 (圓形大樹草坪前緣、正對校門口) 與生態池
    {
      id: "eco_pond",
      category: "landmark",
      zone: "front",
      x: 14.27, z: 46.01, w: 14.0, d: 14.0, rotY: 0.525,
      floors: 1, floorHeight: 0.6,
      style: "pond",
      colors: { water: "#38BDF8", rim: "#C26D53", grass: "#4D8B3E" }
    },
    {
      id: "main_gate",
      category: "landmark",
      zone: "front",
      x: 43.2, z: 34.5, w: 6.5, d: 1.2, rotY: 0.531,
      floors: 1, floorHeight: 2.8,
      style: "gate",
      colors: { wall: "#8C5E3C", accent: "#EAB308", roof: "#475569" }
    },
    {
      id: "banana_compost",
      category: "landmark",
      zone: "sports",
      x: -58.5, z: 92.5, w: 12.0, d: 8.5, rotY: 0.525,
      floors: 1, floorHeight: 3.2,
      style: "banana",
      colors: { ground: "#27272A", leaf: "#4D9A36", sign: "#DC2626" }
    },

    // 6. 東北區：食農教室、廚房、綠活網室菜園（食農教室西側外牆與綠活網室菜園西側入口大致切齊）
    {
      id: "food_lab",
      category: "teaching",
      zone: "agri",
      x: 64.69, z: -11.12, w: 10.81, d: 13.43, rotY: 0.337,
      floors: 1, floorHeight: 3.6,
      style: "standard",
      colors: { wall: "#F3EFE6", accent: "#16A34A", roof: "#94A3B8" }
    },
    {
      id: "kitchen",
      category: "facility",
      zone: "agri",
      x: 73.79, z: -15.59, w: 14.97, d: 15.54, rotY: 0.620,
      floors: 1, floorHeight: 3.6,
      style: "standard",
      colors: { wall: "#E5E7EB", accent: "#64748B", roof: "#CBD5E1" }
    },
    {
      id: "green_garden",
      category: "landmark",
      zone: "agri",
      x: 65.63, z: -23.95, w: 12.8, d: 6.86, rotY: 0.337,
      floors: 1, floorHeight: 2.8,
      style: "greenhouse",
      colors: { wall: "#D1FAE5", accent: "#10B981", roof: "#E2E8F0" }
    },

    // 7. 遊戲場與停車鋼棚
    {
      id: "playground",
      category: "landmark",
      zone: "quad",
      x: -40.38, z: -7.94, w: 18.0, d: 11.0, rotY: 0.525,
      floors: 1, floorHeight: 2.5,
      style: "playground",
      colors: { ground: "#B45309", accent: "#F59E0B" }
    },
    {
      id: "shed_south",
      category: "facility",
      zone: "front",
      x: 33.76, z: 50.19, w: 28.24, d: 5.31, rotY: 0.530,
      floors: 1, floorHeight: 3.0,
      style: "shed",
      noCollide: true,
      colors: { wall: "#94A3B8", roof: "#90A488" }
    },
    {
      id: "shed_east",
      category: "facility",
      zone: "front",
      x: 67.53, z: 20.43, w: 23.20, d: 4.21, rotY: 1.121,
      floors: 1, floorHeight: 3.0,
      style: "shed",
      noCollide: true,
      colors: { wall: "#94A3B8", roof: "#90A488" }
    }
  ],

  // 校園樹木群簇區 (對齊最新空拍鳥瞰圖林帶分佈)
  treeClusters: [
    // 前庭圓環乳斑榕大樹
    { type: "single", x: 40.5, z: 31.2, scale: 1.55 },
    // 中庭景觀樹 (避開中廊與 3D 彩繪地坪)
    { type: "single", x: -4.5, z: 16.5, scale: 0.9 },
    { type: "single", x: -13.0, z: 19.5, scale: 0.85 },
    { type: "single", x: 17.5, z: 3.5, scale: 0.9 },
    // 北側後方濃密樹林帶 (沿 B 棟北側到遊戲場)
    { type: "band", x0: -68, z0: -4, x1: 28, z1: -36, count: 38, minS: 1.0, maxS: 1.55 },
    // 西側與西南側樹林帶 (沿 PU 跑道西側與西南圍牆)
    { type: "band", x0: -116, z0: 20, x1: -76, z1: 92, count: 30, minS: 0.95, maxS: 1.45 },
    // 南側圍牆樹林帶 (光電球場南側與香蕉園旁)
    { type: "band", x0: -70, z0: 94, x1: -12, z1: 110, count: 20, minS: 0.95, maxS: 1.4 },
    // 東南萬年路圍牆沿線樹帶
    { type: "band", x0: 12, z0: 70, x1: 64, z1: 44, count: 14, minS: 0.85, maxS: 1.2 },
    // 東北側食農菜園周邊綠樹（避開菜園西側出入口廣場）
    { type: "band", x0: 62, z0: -32, x1: 82, z1: -16, count: 8, minS: 0.85, maxS: 1.2 }
  ],

  // 校園實境漫步快速傳送起點
  walkSpawns: [
    { id: "gate", name: "📍 入口意象前", nameEn: "Entrance", x: 54.0, z: 39.0, yaw: 1.05 },
    { id: "front", name: "📍 A棟紅磚穿堂前", nameEn: "Wing A Portal", x: 18.7, z: 28.4, yaw: 0.53 },
    { id: "courtyard", name: "📍 東中庭 3D 彩繪地坪", nameEn: "East Courtyard", x: 20.0, z: 4.0, yaw: -0.5 },
    { id: "stage", name: "📍 司令台與操場", nameEn: "Stage & Track", x: -46.0, z: 36.0, yaw: 1.0 },
    { id: "court", name: "📍 光電球場＆香蕉園", nameEn: "Solar Court", x: -34.0, z: 62.0, yaw: 2.2 }
  ],

  // 校內步行導航節點 (貼合道路與廣場之避障 A* 路網)
  navNodes: {
    n_gate: [57.0, 41.0],
    n_landmark: [46.8, 35.2],
    n_gate_n: [45.5, 28.0],
    n_gate_s: [40.8, 39.5],
    n_plaza_e: [31.5, 26.5],
    n_plaza_s: [26.0, 43.0],
    n_pond_n: [17.0, 34.0],
    n_pond_s: [21.0, 56.0],
    n_pond_e: [22.5, 44.0],
    n_a_portal_s: [18.67, 28.38],
    n_a_portal_n: [9.5, 13.0],
    n_courtyard_w: [-6.0, 15.0],
    n_courtyard_e: [26.5, -3.5],
    n_c_corr_n: [28.98, -16.06],
    n_c_corr_m: [31.73, -11.30],
    n_c_corr_s: [34.40, -6.66],
    n_a_corr_mid: [14.32, 20.96],
    n_a_101: [-4.52, 32.02],
    n_a_103: [3.65, 27.22],
    n_a_104: [9.13, 24.01],
    n_a_104_s: [8.60, 31.00],
    n_a_105: [21.07, 16.99],
    n_a_106: [26.93, 13.55],
    n_a_107: [32.80, 10.11],
    n_a_105_s: [25.00, 23.80],
    n_a_106_s: [30.20, 20.50],
    n_a_107_s: [36.80, 17.80],
    n_b_corr_mid: [-0.31, -3.85],
    n_b_101: [-24.37, 10.57],
    n_b_103: [-11.72, 2.98],
    n_b_105: [7.88, -8.76],
    n_b_107: [16.93, -14.19],
    n_b_108: [22.98, -17.81],
    n_b_east: [28.0, -10.5],
    n_c_south: [41.15, 4.55],
    n_c_sw_plaza: [39.50, 11.20],
    n_c_stair_1f: [45.09, 2.36],
    n_c_corr_equip: [47.28, 1.11],
    n_c_exit_e: [53.20, -2.20],
    n_ne_plaza: [56.0, 4.0],
    n_food_lab: [65.76, -1.38],
    n_kitchen: [79.89, -4.50],
    n_garden_turn: [48.0, -18.5],
    n_garden: [51.8, -19.8],
    n_a_west_end: [-21.44, 41.97],
    n_toilet: [-18.48, 40.23],
    n_a_stair_w: [-11.80, 36.20],
    n_d_west_s: [-31.0, 39.5],
    n_d_west_n: [-38.35, 20.6],
    n_stage: [-42.5, 42.0],
    n_track: [-55.0, 38.0],
    n_samba: [-45.5, 19.5],
    n_playground: [-42.0, 2.0],
    n_court_n: [-24.0, 52.0],
    n_court_e: [15.5, 58.5],
    n_court_plaza: [-3.0, 49.5],
    n_banana: [-52.0, 84.0]
  },

  navEdges: [
    ["n_gate", "n_landmark"],
    ["n_landmark", "n_gate_n"],
    ["n_landmark", "n_gate_s"],
    ["n_landmark", "n_plaza_s"],
    ["n_pond_n", "n_court_plaza"],
    ["n_pond_s", "n_court_plaza"],
    ["n_court_plaza", "n_court_n"],
    ["n_court_plaza", "n_court_e"],
    ["n_gate_n", "n_plaza_e"],
    ["n_gate_n", "n_a_106_s"],
    ["n_gate_n", "n_a_107_s"],
    ["n_gate_n", "n_c_sw_plaza"],
    ["n_gate_n", "n_ne_plaza"],
    ["n_gate_s", "n_plaza_e"],
    ["n_gate_s", "n_plaza_s"],
    ["n_gate_s", "n_pond_e"],
    ["n_gate_s", "n_a_portal_s"],
    ["n_plaza_e", "n_pond_n"],
    ["n_plaza_e", "n_a_portal_s"],
    ["n_plaza_e", "n_a_105_s"],
    ["n_plaza_e", "n_a_106_s"],
    ["n_plaza_e", "n_a_107_s"],
    ["n_a_105_s", "n_a_106_s"],
    ["n_a_106_s", "n_a_107_s"],
    ["n_a_107_s", "n_c_sw_plaza"],
    ["n_c_sw_plaza", "n_c_south"],
    ["n_plaza_s", "n_pond_e"],
    ["n_plaza_s", "n_pond_s"],
    ["n_pond_e", "n_pond_s"],
    ["n_pond_e", "n_pond_n"],
    ["n_pond_n", "n_a_portal_s"],
    ["n_pond_s", "n_court_e"],
    ["n_a_portal_s", "n_a_corr_mid"],
    ["n_a_corr_mid", "n_a_portal_n"],
    ["n_a_101", "n_a_stair_w"],
    ["n_a_stair_w", "n_toilet"],
    ["n_toilet", "n_a_west_end"],
    ["n_a_101", "n_a_103"],
    ["n_a_103", "n_a_104"],
    ["n_a_104", "n_a_corr_mid"],
    ["n_a_corr_mid", "n_a_105"],
    ["n_a_105", "n_a_106"],
    ["n_a_106", "n_a_107"],
    ["n_a_107", "n_c_south"],
    ["n_a_portal_n", "n_courtyard_w"],
    ["n_a_portal_n", "n_courtyard_e"],
    ["n_a_portal_n", "n_b_corr_mid"],
    ["n_b_101", "n_b_103"],
    ["n_b_103", "n_b_corr_mid"],
    ["n_b_corr_mid", "n_b_105"],
    ["n_b_105", "n_b_107"],
    ["n_b_107", "n_b_108"],
    ["n_b_108", "n_b_east"],
    ["n_b_east", "n_c_corr_n"],
    ["n_c_corr_n", "n_c_corr_m"],
    ["n_c_corr_m", "n_c_corr_s"],
    ["n_c_corr_s", "n_c_south"],
    ["n_c_south", "n_c_stair_1f"],
    ["n_c_stair_1f", "n_c_corr_equip"],
    ["n_c_corr_equip", "n_c_exit_e"],
    ["n_c_exit_e", "n_food_lab"],
    ["n_c_exit_e", "n_ne_plaza"],
    ["n_ne_plaza", "n_food_lab"],
    ["n_food_lab", "n_kitchen"],
    ["n_ne_plaza", "n_garden_turn"],
    ["n_garden_turn", "n_garden"],
    ["n_a_west_end", "n_d_west_s"],
    ["n_a_west_end", "n_court_n"],
    ["n_a_west_end", "n_stage"],
    ["n_d_west_s", "n_d_west_n"],
    ["n_d_west_s", "n_stage"],
    ["n_d_west_n", "n_samba"],
    ["n_stage", "n_track"],
    ["n_stage", "n_samba"],
    ["n_samba", "n_playground"],
    ["n_court_n", "n_banana"],
    ["n_court_n", "n_court_e"]
  ],

  buildingNavNode: {
    main_gate: "n_landmark",
    eco_pond: "n_pond_e",
    corridor_mid: "n_a_portal_n",
    samba_wall: "n_samba",
    mural_courtyard: "n_courtyard_e",
    food_lab: "n_food_lab",
    kitchen: "n_kitchen",
    green_garden: "n_garden",
    playground: "n_playground",
    stage_dream: "n_stage",
    track_field: "n_track",
    tennis_toilet: "n_toilet",
    solar_court: "n_court_n",
    banana_compost: "n_banana"
  },

  roomNavTargets: [
    // A棟 1F (facingYaw: 0.531 面向 A 棟北側教室門牌)
    { id: "room_a104", parentId: "bldg_a", group: "🚪 A棟 1F 空間", groupEn: "🚪 Wing A 1F Rooms", name: "A棟 104 傳達室", nameEn: "Wing A 104 Reception", node: "n_a_104", facingYaw: 0.531 },
    { id: "room_a106", parentId: "bldg_a", group: "🚪 A棟 1F 空間", groupEn: "🚪 Wing A 1F Rooms", name: "A棟 106 校長室", nameEn: "Wing A 106 Principal's Office", node: "n_a_106", facingYaw: 0.531 },
    { id: "room_a105", parentId: "bldg_a", group: "🚪 A棟 1F 空間", groupEn: "🚪 Wing A 1F Rooms", name: "A棟 105 健康中心（保健室）", nameEn: "Wing A 105 Health Center", node: "n_a_105", facingYaw: 0.531 },
    { id: "room_a107", parentId: "bldg_a", group: "🚪 A棟 1F 空間", groupEn: "🚪 Wing A 1F Rooms", name: "A棟 107 夜光天使/綜(二)", nameEn: "Wing A 107 Night Angel / Multi-purpose", node: "n_a_107", facingYaw: 0.531 },
    { id: "room_a101", parentId: "bldg_a", group: "🚪 A棟 1F 空間", groupEn: "🚪 Wing A 1F Rooms", name: "A棟 101 六甲/六乙教室", nameEn: "Wing A 101-102 Grade 6", node: "n_a_101", facingYaw: 0.531 },
    { id: "room_a103", parentId: "bldg_a", group: "🚪 A棟 1F 空間", groupEn: "🚪 Wing A 1F Rooms", name: "A棟 103 自然教室", nameEn: "Wing A 103 Science Lab", node: "n_a_103", facingYaw: 0.531 },
    // B棟 1F (facingYaw: 0.540 面向 B 棟北側教室門牌)
    { id: "room_b108", parentId: "bldg_b", group: "🚪 B棟 1F 空間", groupEn: "🚪 Wing B 1F Rooms", name: "B棟 108 諮商室／校史室", nameEn: "Wing B 108 Counseling & History", node: "n_b_108", facingYaw: 0.540 },
    { id: "room_b107", parentId: "bldg_b", group: "🚪 B棟 1F 空間", groupEn: "🚪 Wing B 1F Rooms", name: "B棟 107 二乙教室", nameEn: "Wing B 107 Class 2B", node: "n_b_107", facingYaw: 0.540 },
    { id: "room_b105", parentId: "bldg_b", group: "🚪 B棟 1F 空間", groupEn: "🚪 Wing B 1F Rooms", name: "B棟 105 三甲／三乙教室", nameEn: "Wing B 105-106 Grade 3", node: "n_b_105", facingYaw: 0.540 },
    { id: "room_b103", parentId: "bldg_b", group: "🚪 B棟 1F 空間", groupEn: "🚪 Wing B 1F Rooms", name: "B棟 103 四甲／四乙教室", nameEn: "Wing B 103-104 Grade 4", node: "n_b_103", facingYaw: 0.540 },
    { id: "room_b101", parentId: "bldg_b", group: "🚪 B棟 1F 空間", groupEn: "🚪 Wing B 1F Rooms", name: "B棟 101 五甲／五乙教室", nameEn: "Wing B 101-102 Grade 5", node: "n_b_101", facingYaw: 0.540 },
    // C棟 1F (facingYaw: -1.0488 面向 C 棟東側教室門牌)
    { id: "room_c103", parentId: "bldg_c", group: "🚪 C棟 1F 空間", groupEn: "🚪 Wing C 1F Rooms", name: "C棟 103 二甲教室", nameEn: "Wing C 103 Class 2A", node: "n_c_corr_n", facingYaw: -1.0488 },
    { id: "room_c101", parentId: "bldg_c", group: "🚪 C棟 1F 空間", groupEn: "🚪 Wing C 1F Rooms", name: "C棟 101 一甲/一乙教室", nameEn: "Wing C 101-102 Grade 1", node: "n_c_corr_s", facingYaw: -1.0488 },
    // 二樓空間（僅加入圖書室、視聽教室兩組；視聽教室採 C 棟樓梯最短路徑直達）
    { id: "room_b2_lib", parentId: "bldg_b", group: "🚪 二樓空間", groupEn: "🚪 2F Rooms", name: "2F 圖書室", nameEn: "2F Library", node: "n_a_portal_s", is2F: true, dest2F: "library", facingYaw: -1.031 },
    { id: "room_c2_av", parentId: "bldg_c", group: "🚪 二樓空間", groupEn: "🚪 2F Rooms", name: "2F 視聽教室", nameEn: "2F Audiovisual Classroom", node: "n_c_stair_1f", is2F: true, dest2F: "av_hall", facingYaw: 0.522 }
  ]
};

// 合併每學年資料 (data/school-year.js 需先載入)
(function mergeSchoolYearData() {
  const D = window.CAMPUS_DATA;
  const Y = window.SCHOOL_YEAR_DATA;
  if (!Y) return;
  D.school.academicYear = Y.academicYear;
  D.celebration = Y.celebration;
  D.buildings.forEach(b => {
    const info = (Y.buildings || {})[b.id];
    if (info) Object.assign(b, info);
    b.name = b.name || b.id;
    b.nameEn = b.nameEn || b.name;
    b.summary = b.summary || "";
    b.summaryEn = b.summaryEn || b.summary;
    b.features = b.features || [];
    b.featuresEn = b.featuresEn || b.features;
  });
})();
