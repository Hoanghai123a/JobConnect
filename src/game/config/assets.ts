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
    carrot_seed: "/game-assets/crops/carrot_seed.png",
    carrot_growing: "/game-assets/crops/carrot_growing.png",
    carrot_ready: "/game-assets/crops/carrot_ready.png",
    rice_seed: "/game-assets/crops/rice_seed.png",
    rice_growing: "/game-assets/crops/rice_growing.png",
    rice_ready: "/game-assets/crops/rice_ready.png",
    corn_seed: "/game-assets/crops/corn_seed.png",
    corn_growing: "/game-assets/crops/corn_growing.png",
    corn_ready: "/game-assets/crops/corn_ready.png",
    potato_seed: "/game-assets/crops/potato_seed.png",
    potato_growing: "/game-assets/crops/potato_growing.png",
    potato_ready: "/game-assets/crops/potato_ready.png",
    tomato_seed: "/game-assets/crops/tomato_seed.png",
    tomato_growing: "/game-assets/crops/tomato_growing.png",
    tomato_ready: "/game-assets/crops/tomato_ready.png",
    strawberry_seed: "/game-assets/crops/strawberry_seed.png",
    strawberry_growing: "/game-assets/crops/strawberry_growing.png",
    strawberry_ready: "/game-assets/crops/strawberry_ready.png",
    watermelon_seed: "/game-assets/crops/watermelon_seed.png",
    watermelon_growing: "/game-assets/crops/watermelon_growing.png",
    watermelon_ready: "/game-assets/crops/watermelon_ready.png",
    pumpkin_seed: "/game-assets/crops/pumpkin_seed.png",
    pumpkin_growing: "/game-assets/crops/pumpkin_growing.png",
    pumpkin_ready: "/game-assets/crops/pumpkin_ready.png",
    sunflower_seed: "/game-assets/crops/sunflower_seed.png",
    sunflower_growing: "/game-assets/crops/sunflower_growing.png",
    sunflower_ready: "/game-assets/crops/sunflower_ready.png",
    dragon_fruit_seed: "/game-assets/crops/dragon_fruit_seed.png",
    dragon_fruit_growing: "/game-assets/crops/dragon_fruit_growing.png",
    dragon_fruit_ready: "/game-assets/crops/dragon_fruit_ready.png",
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
