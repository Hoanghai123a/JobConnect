// Game types and interfaces

export interface Player {
  id: string;
  coins: number;
  level: number;
  exp: number;
  expToNextLevel: number;
}

export interface CropConfig {
  id: string;
  name: string;
  seedCost: number;
  sellPrice: number;
  growTime: number; // seconds
  expReward: number;
  unlockedAtLevel: number;
}

// Plot state types (5 states as per requirement)
export type PlotState =
  | "EMPTY"        // 1. Đất trống - bare tilled soil
  | "GROWING"      // 2. Đang phát triển - seedling → mature plant
  | "NEEDS_CARE"   // 3. Cần chăm sóc - pests, weeds, dry soil
  | "READY"        // 4. Chín / Thu hoạch - ripe with sparkle effect
  | "LOCKED";      // 5. Đất khóa - fenced, requires unlock

export interface Plot {
  id: number;
  x: number;
  y: number;
  crop: PlantedCrop | null;
  state: PlotState; // Current visual state
  needsCare?: CareType; // What care is needed (if state is NEEDS_CARE)
  isWatered?: boolean; // For soil moisture visual effect
}

// Care event types for NEEDS_CARE state
export type CareType = "WATER" | "PESTS" | "WEEDS";

export interface PlantedCrop {
  cropId: string;
  plotId: number;
  plantedAt: number; // timestamp
  harvestAt: number; // timestamp
  state: CropState;
  growthStage?: number; // 0-2 for seedling/mid/mature sprites
}

export type CropState = "GROWING" | "READY";

export interface GameState {
  player: Player;
  plots: Plot[];
  inventory: Record<string, number>; // cropId -> quantity
  quests: Quest[];
}

export type QuestType = "PLANT" | "HARVEST" | "SELL" | "BUY_SEED" | "EARN_COINS" | "GAIN_EXP";

export interface Quest {
  id: string;
  title: string;
  description: string;
  type: QuestType;
  target: number;
  progress: number;
  reward: {
    coins: number;
    exp: number;
  };
  claimed: boolean;
}
