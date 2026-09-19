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

export interface Plot {
  id: number;
  x: number;
  y: number;
  crop: PlantedCrop | null;
}

export interface PlantedCrop {
  cropId: string;
  plotId: number;
  plantedAt: number; // timestamp
  harvestAt: number; // timestamp
  state: CropState;
}

export type CropState = "EMPTY" | "GROWING" | "READY";

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
