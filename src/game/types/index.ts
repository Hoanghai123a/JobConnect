/**
 * Game Types - Phase 3
 */

export type PlotState = "EMPTY" | "PLANTED" | "GROWING" | "HARVEST";
export type GrowthStage = "SEED" | "STAGE1" | "STAGE2" | "STAGE3" | "HARVEST";
export type CropType = "carrot" | "wheat" | "tomato";

export interface Plot {
  gridX: number;
  gridY: number;
  state: PlotState;
  plantedAt?: number; // Timestamp khi trồng
  cropType?: CropType;
  growthStage?: GrowthStage;
  nextStageAt?: number; // Timestamp khi chuyển sang stage tiếp theo
}

export interface GameState {
  coins: number;
  level: number;
  exp: number;
  expToNextLevel: number;
  plots: Plot[];
}

export interface CropConfig {
  type: CropType;
  name: string;
  stages: GrowthStage[];
  stageTime: number; // Seconds per stage
  harvestCoins: number;
  harvestExp: number;
  seedCost: number;
}
