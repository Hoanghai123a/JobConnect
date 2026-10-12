/**
 * Save Manager - Phase 5
 * Lưu/tải tiến trình bằng localStorage + tính tiến trình khi vắng mặt (offline)
 */

import { GAME_CONFIG } from "../config/game";
import type { CropType, GameState, GrowthStage, Plot, QuestProgress } from "../types";

const SAVE_KEY = "farm-game-save";
const SAVE_VERSION = 1;

interface SaveData {
  version: number;
  savedAt: number;
  state: GameState;
}

const CROP_TYPES = Object.keys(GAME_CONFIG.crops) as CropType[];
const GROWTH_STAGES: GrowthStage[] = ["SEED", "STAGE1", "STAGE2", "STAGE3", "HARVEST"];

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function saveGame(state: GameState): void {
  const data: SaveData = { version: SAVE_VERSION, savedAt: Date.now(), state };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (err) {
    // Quota đầy hoặc private mode - game vẫn chạy, chỉ không lưu được
    console.warn("⚠️ Không lưu được game:", err);
  }
}

/** Trả về state đã lưu (đã validate) hoặc null nếu chưa có / hỏng */
export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data?.version !== SAVE_VERSION || !data.state) return null;
    return sanitizeState(data.state);
  } catch (err) {
    console.warn("⚠️ Save bị hỏng, bắt đầu game mới:", err);
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

/**
 * localStorage do người dùng sửa được nên không tin dữ liệu:
 * số sai → null (game mới); ô đất sai → reset về EMPTY
 */
function sanitizeState(raw: GameState): GameState | null {
  const { cols, rows } = GAME_CONFIG.grid;
  const numbersOk = [raw.coins, raw.level, raw.exp, raw.expToNextLevel].every(
    (n) => isFiniteNumber(n) && n >= 0,
  );
  if (!numbersOk || !Array.isArray(raw.plots) || raw.plots.length !== cols * rows) return null;

  const plots: Plot[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const saved = raw.plots.find((p) => p?.gridX === col && p?.gridY === row);
      plots.push(sanitizePlot(saved, col, row));
    }
  }

  return {
    coins: raw.coins,
    level: Math.max(1, Math.floor(raw.level)),
    exp: raw.exp,
    expToNextLevel: raw.expToNextLevel,
    plots,
    currentQuest: raw.currentQuest || undefined,
    questHistory: Array.isArray(raw.questHistory) ? raw.questHistory : [],
    // Phase 12: Quest system - Initialize if missing
    quests: Array.isArray(raw.quests)
      ? raw.quests
      : GAME_CONFIG.defaultQuests.map((q) => ({ ...q })),
    // Phase 9: Inventory system
    storage: raw.storage || { carrot: 0, wheat: 0, tomato: 0 },
    seeds: raw.seeds || { carrot: 5, wheat: 5, tomato: 5 },
    storageCapacity: isFiniteNumber(raw.storageCapacity) ? raw.storageCapacity : 50,
    // Phase 16: Daily Login Reward System - Migrate old saves
    lastLoginDate: raw.lastLoginDate || undefined,
    loginStreak: isFiniteNumber(raw.loginStreak) ? Math.max(1, Math.min(7, raw.loginStreak)) : 1,
    dailyClaimedToday: raw.dailyClaimedToday || false,
  };
}

function sanitizePlot(p: Plot | undefined, gridX: number, gridY: number): Plot {
  const empty: Plot = { gridX, gridY, state: "EMPTY" };
  if (!p || !p.cropType || !CROP_TYPES.includes(p.cropType)) return empty;
  if (!p.growthStage || !GROWTH_STAGES.includes(p.growthStage)) return empty;

  if (p.state === "HARVEST" || p.growthStage === "HARVEST") {
    return {
      gridX,
      gridY,
      state: "HARVEST",
      cropType: p.cropType,
      growthStage: "HARVEST",
      plantedAt: p.plantedAt,
    };
  }
  if (p.state === "GROWING" && isFiniteNumber(p.nextStageAt)) {
    return {
      gridX,
      gridY,
      state: "GROWING",
      cropType: p.cropType,
      growthStage: p.growthStage,
      plantedAt: isFiniteNumber(p.plantedAt) ? p.plantedAt : undefined,
      nextStageAt: p.nextStageAt,
    };
  }
  return empty;
}

/**
 * Đẩy ô đất lên 1 stage. Mốc stage kế tiếp nối từ mốc cũ (không từ Date.now())
 * nên tổng thời gian lớn giống nhau dù chơi liên tục hay vắng mặt.
 * @returns true nếu vừa chín (HARVEST)
 */
export function advancePlotStage(plot: Plot): boolean {
  if (
    plot.state !== "GROWING" ||
    !plot.cropType ||
    !plot.growthStage ||
    plot.nextStageAt === undefined
  ) {
    return false;
  }
  const crop = GAME_CONFIG.crops[plot.cropType];
  const nextStage = crop.stages[crop.stages.indexOf(plot.growthStage) + 1];
  if (!nextStage) return false;

  plot.growthStage = nextStage;
  if (nextStage === "HARVEST") {
    plot.state = "HARVEST";
    plot.nextStageAt = undefined;
    return true;
  }
  plot.nextStageAt += crop.stageTime * 1000;
  return false;
}

/**
 * Nhảy cóc các ô đất theo thời gian đã trôi qua kể từ lần lưu cuối.
 * @returns số ô đất đã thay đổi stage
 */
export function applyOfflineProgress(state: GameState, now: number = Date.now()): number {
  let changed = 0;
  for (const plot of state.plots) {
    let advanced = false;
    // Giới hạn số vòng = số stage để không bao giờ lặp vô hạn với dữ liệu lạ
    for (let i = 0; i < GROWTH_STAGES.length; i++) {
      if (plot.state !== "GROWING" || plot.nextStageAt === undefined || plot.nextStageAt > now)
        break;
      advancePlotStage(plot);
      advanced = true;
    }
    if (advanced) changed++;
  }
  return changed;
}
