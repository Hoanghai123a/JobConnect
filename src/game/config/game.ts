/**
 * Game Configuration - Phase 1
 * Canvas 900x550, Isometric Grid 4x3
 */

export const GAME_CONFIG = {
  // Canvas size - fixed landscape
  width: 900,
  height: 550,
  backgroundColor: "#87CEEB", // Sky blue

  // Isometric grid
  grid: {
    cols: 4, // 4 columns
    rows: 3, // 3 rows
    tileWidth: 100,  // Isometric tile width
    tileHeight: 50,  // Isometric tile height
  },

  // Colors for placeholder graphics
  colors: {
    soil: 0xa67c52,      // Brown soil
    soilDark: 0x8b6f47,  // Darker brown
    soilPlanted: 0x6b5438, // Darker brown khi đã gieo hạt
    grass: 0x7cb342,     // Green grass border
    highlight: 0xffffff, // White highlight
    sprout: 0x4caf50,    // Green sprout (mầm cây)
    sproutDark: 0x2e7d32, // Dark green
  },

  // UI Top Bar
  ui: {
    topBarHeight: 80,
    topBarColor: 0x1a237e,     // Dark blue
    topBarAlpha: 0.9,
    textColor: "#ffffff",
    goldColor: "#ffd700",
    expBarColor: 0x4caf50,     // Green
    expBarBg: 0x263238,        // Dark gray
  },

  // Game balance
  balance: {
    initialCoins: 100,
    initialLevel: 1,
    expPerLevel: 100,
    coinsPerHarvest: 10,
    expPerHarvest: 15,
  },

  // Crop configurations
  crops: {
    carrot: {
      type: "carrot" as const,
      name: "Cà rốt",
      stages: ["SEED", "STAGE1", "STAGE2", "STAGE3", "HARVEST"] as const,
      stageTime: 5, // 5 seconds per stage for testing
      harvestCoins: 15,
      harvestExp: 10,
      seedCost: 5,
    },
    wheat: {
      type: "wheat" as const,
      name: "Lúa mì",
      stages: ["SEED", "STAGE1", "STAGE2", "STAGE3", "HARVEST"] as const,
      stageTime: 4,
      harvestCoins: 12,
      harvestExp: 8,
      seedCost: 3,
    },
    tomato: {
      type: "tomato" as const,
      name: "Cà chua",
      stages: ["SEED", "STAGE1", "STAGE2", "STAGE3", "HARVEST"] as const,
      stageTime: 6,
      harvestCoins: 20,
      harvestExp: 15,
      seedCost: 8,
    },
  },

  // Asset paths
  assets: {
    crops: {
      carrot: {
        seed: "/game-assets/crops/carrot/seed.png",
        stage1: "/game-assets/crops/carrot/stage1.png",
        stage2: "/game-assets/crops/carrot/stage2.png",
        stage3: "/game-assets/crops/carrot/stage3.png",
        harvest: "/game-assets/crops/carrot/harvest.png",
      },
      wheat: {
        seed: "/game-assets/crops/wheat/seed.png",
        stage1: "/game-assets/crops/wheat/stage1.png",
        stage2: "/game-assets/crops/wheat/stage2.png",
        stage3: "/game-assets/crops/wheat/stage3.png",
        harvest: "/game-assets/crops/wheat/harvest.png",
      },
      tomato: {
        seed: "/game-assets/crops/tomato/seed.png",
        stage1: "/game-assets/crops/tomato/stage1.png",
        stage2: "/game-assets/crops/tomato/stage2.png",
        stage3: "/game-assets/crops/tomato/stage3.png",
        harvest: "/game-assets/crops/tomato/harvest.png",
      },
    },
    ui: {
      coin: "/game-assets/ui/coin.png",
      star: "/game-assets/ui/star.png",
      exp: "/game-assets/ui/exp.png",
    },
  },
};
