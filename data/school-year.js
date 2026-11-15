// 雲林縣斗六市溪洲國民小學 (SJES) 3D 校園導覽 — 每學年更新資料
// 換學年或新增實景影片時只需修改這個檔案：
//   1. academicYear：學年度
//   2. celebration：校慶日期與標語
//   3. buildings：各建築與特色場域之中英文名稱、簡介、youtubeUrl (選填 YouTube 連結) 與各樓層空間配置
//      (教室排列方向：東西向 A/B 棟皆由西南端/靠操場端 → 東北端排列；南北向 C/D 棟由北 → 南排列)

window.SCHOOL_YEAR_DATA = {
  academicYear: "115",
  celebration: {
    date: "115/12/12",
    titleZh: "115 學年度校慶暨外賓導覽",
    titleEn: "Academic Year 115 School Anniversary & Campus Tour"
  },

  buildings: {
    bldg_a: {
      name: "A棟校舍",
      nameEn: "Building A (South Wing)",
      summary: "學校核心行政與六年級教學大樓（地上 2 層＋地下防空避難室）。正門紅磚立面鑲嵌大型「溪洲」校徽與「健康・活潑・快樂・感恩」願景標語，屋頂設有太陽能光電板。",
      summaryEn: "Core administration and Grade 6 building (2F + B1 shelter). Features the iconic red-brick facade with the school emblem and rooftop solar panels.",
      features: ["校徽紅磚正門立面", "1F 六年級與行政核心", "屋頂太陽能光電板"],
      featuresEn: ["Iconic Emblem Facade", "Admin & Grade 6 (1F)", "Rooftop Solar Panels"],
      photos: ["assets/photos/bldg_a_1.jpg", "assets/photos/bldg_a_2.jpg", "assets/photos/eco_corner_1.jpg"],
      youtubeUrl: "https://youtu.be/lShHcg0aKFo",
      // 由西南端（靠操場側）→ 東北端（靠C棟側）排列
      floorsData: {
        1: [
          { code: "101", name: "六甲教室", nameEn: "Class 6A", type: "class6" },
          { code: "102", name: "六乙教室", nameEn: "Class 6B", type: "class6" },
          { code: "103", name: "自然教室", nameEn: "Science Lab", type: "special" },
          { code: "104", name: "傳達室", nameEn: "Reception / Security", type: "office" },
          { code: "105", name: "健康中心（保健室）", nameEn: "Health Center", type: "office", aliases: ["保健室", "健康中心"] },
          { code: "106", name: "校長室", nameEn: "Principal's Office", type: "office" },
          { code: "107", name: "綜合教室(一)／夜光天使", nameEn: "Multi-purpose Room 1", type: "special" }
        ],
        2: [
          { code: "201", name: "教具室", nameEn: "Teaching Aids Room", type: "special" },
          { code: "202-204", name: "教師辦公室", nameEn: "Faculty Office", type: "office" },
          { code: "205", name: "資訊教室(二)", nameEn: "Computer Lab 2", type: "special" },
          { code: "206", name: "音樂教室", nameEn: "Music Room", type: "special" },
          { code: "207", name: "資訊教室(一)", nameEn: "Computer Lab 1", type: "special" }
        ],
        B1: [
          { code: "B1", name: "防空避難室（不開放內部導覽）", nameEn: "Air-raid Shelter (Exterior only)", type: "common" }
        ]
      }
    },

    bldg_b: {
      name: "B棟校舍",
      nameEn: "Building B (North Wing)",
      summary: "中、高年級與專科教學大樓（地上 2 層）。二樓設有圖書室、社會教室、美勞教室、英語與 E 化教室，一樓包含二至五年級教室與諮商室、校史室。",
      summaryEn: "Teaching wing (2F) housing Grades 2–5 classrooms, Library, Art Room, Social Studies Room, English Room, and School History Room.",
      features: ["2F 英語・美勞・社會專科教室", "2F 學校圖書室", "1F 校史室與諮商室"],
      featuresEn: ["Art, Music & Social Studies Labs", "School Library (2F)", "History & Counseling Room"],
      youtubeUrl: "https://youtu.be/Nubrc4uJ10E",
      photos: ["assets/photos/bldg_b_art.jpg", "assets/photos/bldg_b_social.jpg"],
      // 由西南端（靠操場側）→ 東北端（靠C棟側）排列
      floorsData: {
        1: [
          { code: "101", name: "五乙教室", nameEn: "Class 5B", type: "class5" },
          { code: "102", name: "五甲教室", nameEn: "Class 5A", type: "class5" },
          { code: "103", name: "四乙教室", nameEn: "Class 4B", type: "class4" },
          { code: "104", name: "四甲教室", nameEn: "Class 4A", type: "class4" },
          { code: "105", name: "三乙教室", nameEn: "Class 3B", type: "class3" },
          { code: "106", name: "三甲教室", nameEn: "Class 3A", type: "class3" },
          { code: "107", name: "二乙教室", nameEn: "Class 2B", type: "class2" },
          { code: "108", name: "諮商室／校史室", nameEn: "Counseling & History Room", type: "office", aliases: ["校史室", "諮商室"] }
        ],
        2: [
          { code: "201", name: "美勞教室", nameEn: "Art Classroom", type: "special" },
          { code: "202", name: "社會教室", nameEn: "Social Studies Room", type: "special" },
          { code: "203", name: "英語教室", nameEn: "English Classroom", type: "special" },
          { code: "204", name: "綜合教室(二)", nameEn: "Multi-purpose Room 2", type: "special" },
          { code: "205", name: "E化教室", nameEn: "Smart Classroom", type: "special" },
          { code: "206-208", name: "圖書室", nameEn: "School Library", type: "special" }
        ]
      }
    },

    bldg_c: {
      name: "C棟校舍",
      nameEn: "Building C (East Wing)",
      summary: "低年級與視聽活動空間（地上 2 層），緊鄰東中庭 3D 童趣彩繪地坪與資源回收室。",
      summaryEn: "Lower-grade classrooms (Grades 1–2) and Audiovisual Room (2F), adjacent to the East Courtyard 3D mural.",
      features: ["1F 一、二年級教室", "2F 視聽教室", "緊鄰東中庭 3D 彩繪地坪"],
      featuresEn: ["Grades 1 & 2 (1F)", "Audiovisual Room (2F)", "Next to 3D Floor Mural"],
      // 由北 → 南排列
      floorsData: {
        1: [
          { code: "103", name: "二甲教室", nameEn: "Class 2A", type: "class2" },
          { code: "102", name: "一乙教室", nameEn: "Class 1B", type: "class1" },
          { code: "101", name: "一甲教室", nameEn: "Class 1A", type: "class1" }
        ],
        2: [
          { code: "201-203", name: "視聽教室", nameEn: "Audiovisual Hall", type: "special" }
        ]
      }
    },

    bldg_d: {
      name: "D棟校舍",
      nameEn: "Building D (West Wing)",
      summary: "體育與藝文專科翼樓（地上 2 層），面向操場與築夢溪洲司令台，北側外牆繪有「鼓動森巴」彩繪牆。",
      summaryEn: "Sports & Arts Wing (2F) facing the athletic track and Dream Stage, featuring the Samba Drum mural on its north wall.",
      features: ["1F 體育室・藝文教室", "2F 桌球室(一)・(二)", "北側「鼓動森巴」彩繪牆"],
      featuresEn: ["PE & Arts Rooms (1F)", "Table Tennis Rooms (2F)", "Samba Drum Mural"],
      // 由南 → 北或北 → 南，依配置圖由北端往南為 202/102 -> 201/101
      floorsData: {
        1: [
          { code: "102", name: "藝文教室", nameEn: "Arts & Culture Room", type: "special" },
          { code: "101", name: "體育室", nameEn: "PE Equipment & Office", type: "office" }
        ],
        2: [
          { code: "202", name: "桌球室(二)", nameEn: "Table Tennis Room 2", type: "sport" },
          { code: "201", name: "桌球室(一)", nameEn: "Table Tennis Room 1", type: "sport" }
        ]
      }
    },

    corridor_mid: {
      name: "創客藝廊",
      nameEn: "Maker Gallery (Central Walkway 2F)",
      summary: "連接 A 棟與 B 棟的二層風雨連廊，2 樓打造為「創客藝廊」，是一個展示學生多元創作成果與閱讀素養的人文藝術實驗場；屋頂裝設太陽能光電板。",
      summaryEn: "Two-story covered bridge connecting Buildings A and B. The 2F houses 'Maker Gallery', an artistic and reading literacy showcase for student creations.",
      features: ["2F 創客藝廊", "學生多元創作展區", "屋頂太陽能光電板"],
      featuresEn: ["Maker Gallery (2F)", "Student Creations Showcase", "Solar Panel Roof"],
      photos: ["assets/photos/cshow_1.jpg", "assets/photos/cshow_2.jpg", "assets/photos/cshow_3.jpg", "assets/photos/cshow_4.jpg"],
      youtubeUrl: "https://youtu.be/NkKXx5uAjh0"
    },

    samba_wall: {
      name: "鼓動森巴彩繪牆",
      nameEn: "Samba Drum Mural & Piano Floor",
      summary: "繪於 B 棟校舍西側盡頭外牆（司令台旁）的「鼓動森巴・築夢溪洲」社區地圖彩繪牆，地面搭配彩色鋼琴鍵盤彩繪地坪，展現溪洲森巴鼓樂隊與在地社區文化。",
      summaryEn: "Colorful community map mural on the west end wall of Building B beside the Stage, paired with a rainbow piano-key floor celebrating the school's Samba drum team.",
      features: ["B 棟西側盡頭大型社區彩繪牆", "彩色鋼琴鍵盤地坪"],
      featuresEn: ["Community Map Mural (Wing B West)", "Piano-Key Floor Art"],
      photos: ["assets/photos/samba_1.jpg", "assets/photos/samba_2.jpg", "assets/photos/samba_3.jpg"]
    },

    mural_courtyard: {
      name: "3D彩繪遊戲地坪",
      nameEn: "3D Interactive Courtyard Mural",
      summary: "位於東中庭 C 棟校舍西側的 3D 立體彩繪遊戲地坪，結合童趣插畫與互動跳格遊戲，是孩子們下課最愛的遊戲基地。",
      summaryEn: "Interactive 3D floor painting in the east courtyard next to Building C, inviting students to jump and play during recess.",
      features: ["東中庭 3D 立體地坪", "互動遊戲與打卡點"],
      featuresEn: ["3D Floor Illusion Art", "Interactive Play Zone"],
      photos: ["assets/photos/mural_3d_1.jpg", "assets/photos/mural_3d_2.jpg"]
    },

    solar_court: {
      name: "光電綜合球場",
      nameEn: "Solar Canopy Sports Court",
      summary: "結合太陽能發電屋頂與多元運動場地的綠能地標，內部包含標準網球場與籃球場，是溪洲國小發展網球特色與永續能源的代表設施。",
      summaryEn: "A flagship green-energy sports complex topped with solar panels, housing indoor tennis and basketball courts.",
      features: ["大型太陽能光電頂棚", "標準網球場", "標準籃球場"],
      featuresEn: ["Large Solar Canopy", "Tennis Courts", "Basketball Court"],
      photos: ["assets/photos/court_tennis.jpg", "assets/photos/court_basket.jpg"]
    },

    track_field: {
      name: "PU 跑道運動場",
      nameEn: "PU Athletic Track & Field",
      summary: "紅褐色 PU 跑道與中央翠綠草皮，東北側延伸 100 公尺直線衝刺道，緊鄰築夢溪洲司令台，是校慶運動會的主場地。",
      summaryEn: "Red PU running track with a 100m sprint straightaway and natural turf field—the main venue for Sports Day.",
      features: ["PU 跑道與 100m 直道", "中央草皮運動場", "校慶運動會主場地"],
      featuresEn: ["PU Track & 100m Sprint", "Central Turf Field", "Anniversary Venue"],
      photos: ["assets/photos/track_1.jpg", "assets/photos/track_2.jpg"]
    },

    stage_dream: {
      name: "築夢溪洲司令台",
      nameEn: "Dream Shijou Stage",
      summary: "面向 PU 跑道運動場的特色司令台，背牆繪有活力十足的網球與鼓樂童趣壁畫，旁有升旗台，是校慶運動會的主舞台。",
      summaryEn: "Open-air assembly stage overlooking the track, featuring lively tennis & music murals and hosting Sports Day ceremonies.",
      features: ["網球與鼓樂彩繪背牆", "面向運動場典禮舞台"],
      featuresEn: ["Painted Mural Backdrop", "Ceremony Stage"],
      photos: ["assets/photos/stage_1.jpg", "assets/photos/stage_2.jpg", "assets/photos/stage_3.jpg"]
    },

    tennis_toilet: {
      name: "網球主題廁所",
      nameEn: "Tennis-Themed Restroom (Wing A West End)",
      summary: "位於 A 棟校舍西側末端的創意主題廁所，緊鄰操場與光電綜合球場，內部與牆面融入鮮黃色調與網球揮拍造型彩繪，展現溪洲國小網球特色。",
      summaryEn: "Creative themed restroom integrated at the west end of Building A, facing the track and solar courts with vibrant tennis-themed artwork.",
      features: ["位於 A 棟西側末端", "網球揮拍主題彩繪", "鄰近運動場與球場"],
      featuresEn: ["West End of Building A", "Tennis Art Motif", "Near Track & Courts"],
      photos: ["assets/photos/toilet_1.jpg"]
    },

    eco_pond: {
      name: "光電水循環生態池",
      nameEn: "Solar-Powered Eco Pond",
      summary: "位於前庭廣場西側的圓形生態水池，利用太陽能光電驅動水循環與過濾系統，營造豐富的水生植物與魚類生態環境。",
      summaryEn: "Circular eco-pond in the front plaza driven by solar-powered water circulation, supporting aquatic plants and fish.",
      features: ["太陽能水循環系統", "永續生態教育場域"],
      featuresEn: ["Solar Water Circulation", "Ecological Learning Spot"],
      photos: ["assets/photos/pond_1.jpg", "assets/photos/pond_2.jpg", "assets/photos/pond_3.jpg"]
    },

    main_gate: {
      name: "入口意象",
      nameEn: "Entrance Landmark",
      summary: "位於前庭圓形大樹草坪前緣、正對校門口的迎賓地標牆，融合「森巴鼓樂（五線譜＋鼓）」與「網球拍」造型，展現「溪洲國民小學 SJES・健康・活潑・快樂・感恩」學校願景。",
      summaryEn: "Welcome landmark at the front edge of the circular lawn facing the main gate, featuring Samba drums, musical notes, and a tennis racket with the SJES vision.",
      features: ["正對校門口・乳斑榕草坪前緣", "SJES 鼓樂與網球入口意象", "前庭拼貼藝術地坪"],
      featuresEn: ["Facing Main Gate", "SJES Music & Tennis Landmark", "Front Plaza Mosaic"],
      photos: ["assets/photos/gate_landmark_1.jpg", "assets/photos/mosaic_1.jpg", "assets/photos/mosaic_2.jpg", "assets/photos/mosaic_3.jpg"]
    },

    banana_compost: {
      name: "香蕉園落葉循環示範區",
      nameEn: "Banana Garden & Leaf Composting Zone",
      summary: "位於光電綜合球場西側、PU 跑道東南側的永續循環示範場域，將校園落葉收集堆肥後滋養香蕉園，讓學童實地觀察自然資源循環再生。",
      summaryEn: "Sustainability demonstration zone west of the Solar Court where fallen campus leaves are composted to nourish banana trees.",
      features: ["落葉堆肥循環再利用", "校園香蕉園生態示範", "永續環境教育場域"],
      featuresEn: ["Leaf Composting Cycle", "Banana Garden", "Sustainability Education"],
      photos: ["assets/photos/banana_1.jpg", "assets/photos/banana_2.jpg", "assets/photos/banana_sign.jpg"]
    },

    food_lab: {
      name: "食農教室",
      nameEn: "Food & Agri-Education Room",
      summary: "鄰近廚房與綠活網室菜園的食農教育專屬空間，讓學童從產地到餐桌體驗農耕與烹飪樂趣。",
      summaryEn: "Dedicated hands-on classroom next to the Organic Garden and Kitchen for farm-to-table learning.",
      features: ["產地到餐桌實作教學", "緊鄰綠活網室菜園與廚房"],
      featuresEn: ["Farm-to-Table Learning", "Adjacent to Garden & Kitchen"],
      photos: ["assets/photos/food_lab_1.jpg"]
    },

    kitchen: {
      name: "學校廚房",
      nameEn: "School Kitchen",
      summary: "供應全校營養午餐之現代化廚房設施（衛生管制區僅展示外觀）。",
      summaryEn: "Central school kitchen preparing daily nutritious lunches (exterior view only).",
      features: ["營養午餐中央廚房"],
      featuresEn: ["School Lunch Kitchen"]
    },

    green_garden: {
      name: "綠活網室菜園",
      nameEn: "Green Living & Greenhouse Garden",
      summary: "位於校園東北隅的有機菜園與溫室網室，搭配學校永續環境課程，培育各類季節蔬果。",
      summaryEn: "Organic vegetable garden and netted greenhouse at the northeast corner for sustainability courses.",
      features: ["溫室網室栽培", "有機食農教育菜園"],
      featuresEn: ["Netted Greenhouse", "Organic Garden"],
      photos: ["assets/photos/garden_1.jpg", "assets/photos/garden_2.jpg"]
    },

    playground: {
      name: "兒童遊戲場",
      nameEn: "North Playground",
      summary: "位於 B 棟北側大樹林蔭下的兒童遊樂設施區，配備黃藍雙滑梯與攀爬遊具，讓學童在綠意包圍中安心遊玩。",
      summaryEn: "Shaded children's playground nestled under mature trees behind Building B, featuring slides and climbing structures.",
      features: ["林蔭遊戲設施區", "溜滑梯與攀爬架"],
      featuresEn: ["Shaded Play Area", "Slides & Climbers"],
      photos: ["assets/photos/playground_1.jpg", "assets/photos/playground_2.jpg"]
    },

    shed_south: {
      name: "南側停車鋼棚",
      nameEn: "South Parking Canopy",
      summary: "位於前庭廣場南側圍牆旁的教職員停車鋼棚。",
      summaryEn: "Covered parking canopy along the south perimeter of the front plaza.",
      features: ["教職員停車遮陽棚"],
      featuresEn: ["Covered Parking"]
    },

    shed_east: {
      name: "東側停車鋼棚",
      nameEn: "East Parking Canopy",
      summary: "位於校門口北側的停車鋼棚。",
      summaryEn: "Covered parking canopy north of the main gate.",
      features: ["入口側停車鋼棚"],
      featuresEn: ["Gate-side Parking"]
    }
  }
};
