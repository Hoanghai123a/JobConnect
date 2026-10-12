/**
 * Game Configuration - Phase 1
 * Canvas 900x550, Isometric Grid 4x3
 */

export const GAME_CONFIG = {
  // Canvas size - fixed landscape
  width: 900,
  height: 550,
  backgroundColor: "#87CEEB", // Sky blue

  // Isometric grid - Phase 10: 4x4 grid (16 plots)
  grid: {
    cols: 4, // 4 columns
    rows: 4, // 4 rows (mở rộng từ 3 → 4)
    tileWidth: 100, // Isometric tile width
    tileHeight: 50, // Isometric tile height
  },

  // Colors for placeholder graphics
  colors: {
    soil: 0xa67c52, // Brown soil
    soilDark: 0x8b6f47, // Darker brown
    soilPlanted: 0x6b5438, // Darker brown khi đã gieo hạt
    grass: 0x7cb342, // Green grass border
    highlight: 0xffffff, // White highlight
    sprout: 0x4caf50, // Green sprout (mầm cây)
    sproutDark: 0x2e7d32, // Dark green
  },

  // UI Top Bar
  ui: {
    topBarHeight: 80,
    topBarColor: 0x1a237e, // Dark blue
    topBarAlpha: 0.9,
    textColor: "#ffffff",
    goldColor: "#ffd700",
    expBarColor: 0x4caf50, // Green
    expBarBg: 0x263238, // Dark gray
  },

  // Game balance - Phase 11: Level & EXP System
  balance: {
    initialCoins: 100,
    initialLevel: 1,
    initialExp: 0,
    // Công thức EXP lên cấp: Level * 100 EXP
    getExpForLevel: (level: number) => level * 100,
    // Thưởng khi lên cấp
    levelUpCoinBonus: (level: number) => level * 50,
    // EXP thưởng
    expPerHarvest: 15, // EXP khi thu hoạch (ghi đè bởi crop config)
    expPerUnlock: 50, // EXP khi mở khóa ô đất
  },

  // Phase 10: Land Expansion - Giá mở khóa ô đất lũy tiến (4x4 = 16 ô)
  // Index 0-3: Miễn phí (4 ô ban đầu)
  // Index 4-15: Tăng dần (100 -> 2000💰)
  unlockCosts: [
    0, // Plot 0 (free)
    0, // Plot 1 (free)
    0, // Plot 2 (free)
    0, // Plot 3 (free)
    100, // Plot 4
    150, // Plot 5
    200, // Plot 6
    300, // Plot 7
    400, // Plot 8
    500, // Plot 9
    700, // Plot 10
    900, // Plot 11
    1100, // Plot 12
    1400, // Plot 13
    1700, // Plot 14
    2000, // Plot 15
  ],

  // Phase 15: Level requirements cho từng plot
  unlockLevels: [
    1, // Plot 0 (free, Lv1)
    1, // Plot 1 (free, Lv1)
    1, // Plot 2 (free, Lv1)
    1, // Plot 3 (free, Lv1)
    1, // Plot 4 (Lv1)
    2, // Plot 5 (Lv2)
    2, // Plot 6 (Lv2)
    2, // Plot 7 (Lv2)
    3, // Plot 8 (Lv3)
    3, // Plot 9 (Lv3)
    4, // Plot 10 (Lv4)
    4, // Plot 11 (Lv4)
    5, // Plot 12 (Lv5)
    5, // Plot 13 (Lv5)
    6, // Plot 14 (Lv6)
    7, // Plot 15 (Lv7)
  ],

  // Crop configurations - Phase 11: Level requirements
  crops: {
    carrot: {
      type: "carrot" as const,
      name: "Cà rốt",
      requiredLevel: 1, // Level 1
      stages: ["SEED", "STAGE1", "STAGE2", "STAGE3", "HARVEST"] as const,
      stageTime: 5, // 5 seconds per stage for testing
      harvestCoins: 15,
      harvestExp: 10,
      seedCost: 5,
    },
    wheat: {
      type: "wheat" as const,
      name: "Lúa mì",
      requiredLevel: 2, // Level 2
      stages: ["SEED", "STAGE1", "STAGE2", "STAGE3", "HARVEST"] as const,
      stageTime: 4,
      harvestCoins: 12,
      harvestExp: 8,
      seedCost: 3,
    },
    tomato: {
      type: "tomato" as const,
      name: "Cà chua",
      requiredLevel: 3, // Level 3
      stages: ["SEED", "STAGE1", "STAGE2", "STAGE3", "HARVEST"] as const,
      stageTime: 6,
      harvestCoins: 20,
      harvestExp: 15,
      seedCost: 8,
    },
  },

  // Phase 12: Quest System - Default quests
  defaultQuests: [
    {
      id: "quest_harvest_5",
      title: "Nông dân tập sự",
      desc: "Thu hoạch 5 cây trồng bất kỳ",
      targetType: "HARVEST" as const,
      target: 5,
      current: 0,
      rewardCoins: 50,
      rewardExp: 25,
      isCompleted: false,
      isClaimed: false,
    },
    {
      id: "quest_plant_10",
      title: "Gieo trồng cần mẫn",
      desc: "Trồng 10 cây trồng",
      targetType: "PLANT" as const,
      target: 10,
      current: 0,
      rewardCoins: 30,
      rewardExp: 20,
      isCompleted: false,
      isClaimed: false,
    },
    {
      id: "quest_unlock_2",
      title: "Mở rộng trang trại",
      desc: "Mở khóa 2 ô đất mới",
      targetType: "UNLOCK_PLOT" as const,
      target: 2,
      current: 0,
      rewardCoins: 100,
      rewardExp: 50,
      isCompleted: false,
      isClaimed: false,
    },
    {
      id: "quest_earn_200",
      title: "Tích lũy tài sản",
      desc: "Kiếm được 200 xu (bán nông sản)",
      targetType: "EARN_COINS" as const,
      target: 200,
      current: 0,
      rewardCoins: 50,
      rewardExp: 30,
      isCompleted: false,
      isClaimed: false,
    },
  ],

  // Asset paths - Tạm mapping 2 files có sẵn (seed + ready) vào 5 stages
  // Stage1-3 sẽ dùng lại seed/ready và scale khác nhau để tạo hiệu ứng grow
  assets: {
    crops: {
      carrot: {
        seed: "/game-assets/crops/carrot_seed.webp",
        stage1: "/game-assets/crops/carrot_seed.webp", // Tạm dùng seed, scale 1.2
        stage2: "/game-assets/crops/carrot_ready.webp", // Tạm dùng ready, scale 0.7
        stage3: "/game-assets/crops/carrot_ready.webp", // Tạm dùng ready, scale 0.9
        harvest: "/game-assets/crops/carrot_ready.webp",
      },
      wheat: {
        seed: "/game-assets/crops/potato_seed.webp", // Tạm dùng potato (màu vàng giống wheat)
        stage1: "/game-assets/crops/potato_seed.webp",
        stage2: "/game-assets/crops/potato_ready.webp",
        stage3: "/game-assets/crops/potato_ready.webp",
        harvest: "/game-assets/crops/potato_ready.webp",
      },
      tomato: {
        seed: "/game-assets/crops/tomato_seed.webp",
        stage1: "/game-assets/crops/tomato_seed.webp",
        stage2: "/game-assets/crops/tomato_ready.webp",
        stage3: "/game-assets/crops/tomato_ready.webp",
        harvest: "/game-assets/crops/tomato_ready.webp",
      },
    },
    ui: {
      coin: "/game-assets/ui/coin.png",
      star: "/game-assets/ui/star.png",
      exp: "/game-assets/ui/exp.png",
    },
  },

  // Phase 16: Daily Login Reward System
  dailyRewards: [
    {
      day: 1,
      coins: 50,
      description: "50💰",
    },
    {
      day: 2,
      seeds: { carrot: 5 },
      description: "5 Hạt Cà Rốt",
    },
    {
      day: 3,
      coins: 100,
      description: "100💰",
    },
    {
      day: 4,
      seeds: { tomato: 5 },
      description: "5 Hạt Cà Chua",
    },
    {
      day: 5,
      coins: 200,
      description: "200💰",
    },
    {
      day: 6,
      seeds: { wheat: 5 },
      description: "5 Hạt Lúa Mì",
    },
    {
      day: 7,
      coins: 500,
      seeds: { carrot: 10, wheat: 10, tomato: 10 },
      description: "500💰 + 10 Hạt Giống Mỗi Loại",
    },
  ],
};
