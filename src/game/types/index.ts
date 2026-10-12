/**
 * Game Types - Phase 7: Quest System
 */

export type PlotState = "LOCKED" | "EMPTY" | "PLANTED" | "GROWING" | "HARVEST"; // Phase 10: LOCKED state
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

// === Quest System Types (Phase 12) ===

export type QuestTargetType = "HARVEST" | "PLANT" | "UNLOCK_PLOT" | "EARN_COINS";

export interface Quest {
  id: string;
  title: string;
  desc: string;
  targetType: QuestTargetType;
  target: number; // Mục tiêu cần đạt
  current: number; // Tiến độ hiện tại
  rewardCoins: number;
  rewardExp: number;
  isCompleted: boolean; // Đã hoàn thành chưa
  isClaimed: boolean; // Đã nhận thưởng chưa
}

// === Quest System Types (Phase 7 - Old, can be deprecated) ===

export type QuestType = "harvest" | "coins" | "plant";

export interface QuestConfig {
  id: string;
  type: QuestType;
  name: string;
  description: string;
  target: number; // Số lượng cần đạt
  cropType?: CropType; // Chỉ dùng cho quest harvest/plant
  rewardCoins: number;
  rewardExp: number;
}

export interface QuestProgress {
  questId: string;
  current: number; // Tiến độ hiện tại
  completed: boolean; // Đã hoàn thành chưa
  claimed: boolean; // Đã nhận thưởng chưa
}

// === Inventory System Types (Phase 9) ===

export interface CropInventory {
  carrot: number;
  wheat: number;
  tomato: number;
}

export interface SeedInventory {
  carrot: number;
  wheat: number;
  tomato: number;
}

export interface GameState {
  coins: number;
  level: number;
  exp: number;
  expToNextLevel: number;
  plots: Plot[];
  currentQuest?: QuestProgress; // Phase 7: Old quest system (deprecated)
  questHistory: string[]; // Phase 7: Old quest system (deprecated)
  quests: Quest[]; // Phase 12: New quest system
  // Phase 9: Inventory
  storage: CropInventory; // Nông sản thu hoạch
  seeds: SeedInventory; // Hạt giống sở hữu
  storageCapacity: number; // Sức chứa kho tối đa
  // Phase 16: Daily Login Reward System
  lastLoginDate?: string; // YYYY-MM-DD format
  loginStreak?: number; // 1-7 (7 ngày liên tiếp, sau đó reset về 1)
  dailyClaimedToday?: boolean; // Đã nhận thưởng hôm nay chưa
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

// === Daily Login Reward System (Phase 16) ===

export interface DailyReward {
  day: number; // 1-7
  coins?: number;
  seeds?: Partial<SeedInventory>; // { carrot: 5, wheat: 10 }
  description: string;
}
