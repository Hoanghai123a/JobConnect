// Asset manifest - centralized asset registry
// DO NOT hardcode asset paths in game code

export interface AssetManifest {
  characters: Record<string, string>;
  crops: Record<string, string>;
  tiles: Record<string, string>;
  buildings: Record<string, string>;
  items: Record<string, string>;
  effects: Record<string, string>;
  ui: Record<string, string>;
  sounds: Record<string, string>;
}

// Placeholder paths - will be replaced with actual assets
export const ASSETS: AssetManifest = {
  characters: {
    farmer: "/game-assets/characters/farmer.png",
  },
  crops: {
    // 15 crops × 2 states (seed, ready) = 30 WebP sprites
    carrot_seed: "/game-assets/crops/carrot_seed.webp",
    carrot_ready: "/game-assets/crops/carrot_ready.webp",
    rice_seed: "/game-assets/crops/rice_seed.webp",
    rice_ready: "/game-assets/crops/rice_ready.webp",
    lettuce_seed: "/game-assets/crops/lettuce_seed.webp",
    lettuce_ready: "/game-assets/crops/lettuce_ready.webp",
    corn_seed: "/game-assets/crops/corn_seed.webp",
    corn_ready: "/game-assets/crops/corn_ready.webp",
    potato_seed: "/game-assets/crops/potato_seed.webp",
    potato_ready: "/game-assets/crops/potato_ready.webp",
    tomato_seed: "/game-assets/crops/tomato_seed.webp",
    tomato_ready: "/game-assets/crops/tomato_ready.webp",
    strawberry_seed: "/game-assets/crops/strawberry_seed.webp",
    strawberry_ready: "/game-assets/crops/strawberry_ready.webp",
    pumpkin_seed: "/game-assets/crops/pumpkin_seed.webp",
    pumpkin_ready: "/game-assets/crops/pumpkin_ready.webp",
    chili_seed: "/game-assets/crops/chili_seed.webp",
    chili_ready: "/game-assets/crops/chili_ready.webp",
    watermelon_seed: "/game-assets/crops/watermelon_seed.webp",
    watermelon_ready: "/game-assets/crops/watermelon_ready.webp",
    grape_seed: "/game-assets/crops/grape_seed.webp",
    grape_ready: "/game-assets/crops/grape_ready.webp",
    eggplant_seed: "/game-assets/crops/eggplant_seed.webp",
    eggplant_ready: "/game-assets/crops/eggplant_ready.webp",
    sunflower_seed: "/game-assets/crops/sunflower_seed.webp",
    sunflower_ready: "/game-assets/crops/sunflower_ready.webp",
    dragon_fruit_seed: "/game-assets/crops/dragon_fruit_seed.webp",
    dragon_fruit_ready: "/game-assets/crops/dragon_fruit_ready.webp",
    golden_ginger_seed: "/game-assets/crops/golden_ginger_seed.webp",
    golden_ginger_ready: "/game-assets/crops/golden_ginger_ready.webp",
  },
  tiles: {
    grass: "/game-assets/tiles/grass.png",
    dirt: "/game-assets/tiles/dirt.png",
    plot_empty: "/game-assets/tiles/plot_empty.png",
  },
  buildings: {
    barn: "/game-assets/buildings/barn.png",
    shop: "/game-assets/buildings/shop.png",
  },
  items: {
    coin: "/game-assets/items/coin.png",
    seed_bag: "/game-assets/items/seed_bag.png",
  },
  effects: {
    sparkle: "/game-assets/effects/sparkle.png",
    harvest: "/game-assets/effects/harvest.png",
  },
  ui: {
    button_primary: "/game-assets/ui/button_primary.png",
    panel: "/game-assets/ui/panel.png",
  },
  sounds: {
    plant: "/game-assets/sounds/plant.mp3",
    harvest: "/game-assets/sounds/harvest.mp3",
    coin: "/game-assets/sounds/coin.mp3",
    buy: "/game-assets/sounds/buy.mp3",
    levelUp: "/game-assets/sounds/level_up.mp3",
    questComplete: "/game-assets/sounds/quest_complete.mp3",
    click: "/game-assets/sounds/click.mp3",
  },
};

// Asset loading helper
export const getAssetPath = (category: keyof AssetManifest, key: string): string => {
  const asset = ASSETS[category]?.[key];
  if (!asset) {
    console.warn(`Asset not found: ${category}/${key}`);
    return "/game-assets/placeholder.png";
  }
  return asset;
};
