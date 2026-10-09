/**
 * Quest Manager - Phase 7
 * Quản lý nhiệm vụ: cấu hình, tiến độ, phần thưởng
 */

import type { QuestConfig, QuestProgress, CropType } from "../types";

/** Danh sách tất cả nhiệm vụ có thể (xoay vòng) */
export const QUEST_POOL: QuestConfig[] = [
  {
    id: "harvest_carrot_5",
    type: "harvest",
    name: "Thu hoạch Cà rốt",
    description: "Thu hoạch 5 Cà rốt",
    target: 5,
    cropType: "carrot",
    rewardCoins: 50,
    rewardExp: 30,
  },
  {
    id: "harvest_wheat_8",
    type: "harvest",
    name: "Thu hoạch Lúa mì",
    description: "Thu hoạch 8 Lúa mì",
    target: 8,
    cropType: "wheat",
    rewardCoins: 60,
    rewardExp: 40,
  },
  {
    id: "harvest_tomato_3",
    type: "harvest",
    name: "Thu hoạch Cà chua",
    description: "Thu hoạch 3 Cà chua",
    target: 3,
    cropType: "tomato",
    rewardCoins: 80,
    rewardExp: 50,
  },
  {
    id: "coins_200",
    type: "coins",
    name: "Tích lũy Xu",
    description: "Tích lũy 200 Xu",
    target: 200,
    rewardCoins: 100,
    rewardExp: 60,
  },
  {
    id: "plant_any_10",
    type: "plant",
    name: "Gieo hạt",
    description: "Gieo 10 hạt bất kỳ",
    target: 10,
    rewardCoins: 40,
    rewardExp: 25,
  },
];

/**
 * Lấy nhiệm vụ tiếp theo dựa trên lịch sử đã hoàn thành
 * (xoay vòng theo thứ tự pool, bỏ qua các quest đã làm gần đây)
 */
export function getNextQuest(questHistory: string[]): QuestConfig {
  // Tìm quest đầu tiên chưa có trong 3 nhiệm vụ gần nhất
  const recent = questHistory.slice(-3);
  const next = QUEST_POOL.find((q) => !recent.includes(q.id));

  // Nếu đã làm hết pool gần đây, reset về quest đầu tiên
  return next || QUEST_POOL[0];
}

/**
 * Tạo QuestProgress mới từ config
 */
export function initQuestProgress(config: QuestConfig): QuestProgress {
  return {
    questId: config.id,
    current: 0,
    completed: false,
    claimed: false,
  };
}

/**
 * Cập nhật tiến độ nhiệm vụ
 * @returns true nếu vừa hoàn thành (chuyển từ chưa đủ → đủ target)
 */
export function updateQuestProgress(
  progress: QuestProgress,
  config: QuestConfig,
  amount: number = 1,
): boolean {
  const wasCompleted = progress.current >= config.target;
  progress.current = Math.min(progress.current + amount, config.target);
  const nowCompleted = progress.current >= config.target;

  if (nowCompleted && !progress.completed) {
    progress.completed = true;
    return true; // Vừa hoàn thành
  }

  return false;
}

/**
 * Lấy cấu hình nhiệm vụ theo ID
 */
export function getQuestConfig(questId: string): QuestConfig | undefined {
  return QUEST_POOL.find((q) => q.id === questId);
}
