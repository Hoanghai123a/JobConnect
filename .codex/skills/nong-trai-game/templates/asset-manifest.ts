export const GAME_ASSETS = {
  farmer: {
    idle: "/assets/characters/farmer_idle.png",
    walk: "/assets/characters/farmer_walk.png",
    harvest: "/assets/characters/farmer_harvest.png",
    water: "/assets/characters/farmer_water.png",
  },

  crops: {
    carrot: {
      seed: "/assets/crops/carrot_seed.png",
      stage1: "/assets/crops/carrot_stage_1.png",
      stage2: "/assets/crops/carrot_stage_2.png",
      stage3: "/assets/crops/carrot_stage_3.png",
      ready: "/assets/crops/carrot_ready.png",
      harvest: "/assets/crops/carrot_harvest.png",
    },
    rice: {
      seed: "/assets/crops/rice_seed.png",
      stage1: "/assets/crops/rice_stage_1.png",
      stage2: "/assets/crops/rice_stage_2.png",
      stage3: "/assets/crops/rice_stage_3.png",
      ready: "/assets/crops/rice_ready.png",
      harvest: "/assets/crops/rice_harvest.png",
    },
    corn: {
      seed: "/assets/crops/corn_seed.png",
      stage1: "/assets/crops/corn_stage_1.png",
      stage2: "/assets/crops/corn_stage_2.png",
      stage3: "/assets/crops/corn_stage_3.png",
      ready: "/assets/crops/corn_ready.png",
      harvest: "/assets/crops/corn_harvest.png",
    },
  },

  tiles: {
    grass: "/assets/tiles/grass.png",
    soil: "/assets/tiles/soil.png",
    soilWatered: "/assets/tiles/soil_watered.png",
    soilLocked: "/assets/tiles/soil_locked.png",
    path: "/assets/tiles/path.png",
    water: "/assets/tiles/water.png",
    fence: "/assets/tiles/fence.png",
  },

  buildings: {
    farmhouse: "/assets/buildings/farmhouse.png",
    barn: "/assets/buildings/barn.png",
    shop: "/assets/buildings/shop.png",
    warehouse: "/assets/buildings/warehouse.png",
    questBoard: "/assets/buildings/quest_board.png",
  },

  items: {
    fertilizer: "/assets/items/fertilizer.png",
    wateringCan: "/assets/items/watering_can.png",
    coin: "/assets/items/coin.png",
  },

  effects: {
    harvestSparkle: "/assets/effects/harvest_sparkle.png",
    coinPopup: "/assets/effects/coin_popup.png",
    expPopup: "/assets/effects/exp_popup.png",
    planting: "/assets/effects/planting_effect.png",
    water: "/assets/effects/water_effect.png",
    levelUp: "/assets/effects/level_up.png",
    unlock: "/assets/effects/unlock.png",
  },
} as const;
