import { useGameStore } from "../stores/gameStore";
import type { QuestType } from "../types";
import { FarmPersistenceService } from "./farmPersistenceService";

export class QuestService {
  /**
   * Update quest progress for a specific quest type
   */
  static updateQuestProgress(type: QuestType, amount: number = 1) {
    const store = useGameStore.getState();
    const updatedQuests = store.quests.map((quest) => {
      // Only update unclaimed quests of matching type
      if (quest.type === type && !quest.claimed) {
        const newProgress = Math.min(quest.progress + amount, quest.target);

        // Persist to backend
        const playerId = store.player.id;
        FarmPersistenceService.updateQuestProgress(playerId, quest.id, amount);

        return {
          ...quest,
          progress: newProgress,
        };
      }
      return quest;
    });

    store.setQuests(updatedQuests);
  }

  /**
   * Claim a completed quest and grant rewards
   */
  static claimQuest(questId: string): {
    success: boolean;
    error?: string;
    rewards?: { coins: number; exp: number };
  } {
    const store = useGameStore.getState();
    const quest = store.quests.find((q) => q.id === questId);

    // Validation
    if (!quest) {
      return { success: false, error: "Nhiệm vụ không tồn tại" };
    }

    if (quest.claimed) {
      return { success: false, error: "Nhiệm vụ đã được nhận thưởng" };
    }

    if (quest.progress < quest.target) {
      return { success: false, error: "Nhiệm vụ chưa hoàn thành" };
    }

    // Mark as claimed
    const updatedQuests = store.quests.map((q) => (q.id === questId ? { ...q, claimed: true } : q));
    store.setQuests(updatedQuests);

    // Grant rewards
    store.addCoins(quest.reward.coins);
    store.addExp(quest.reward.exp);

    // Persist to backend
    const playerId = store.player.id;
    FarmPersistenceService.claimQuest(playerId, questId);
    FarmPersistenceService.savePlayer(store.player);

    return {
      success: true,
      rewards: quest.reward,
    };
  }

  /**
   * Check if a quest is completed (but not claimed)
   */
  static isQuestCompleted(questId: string): boolean {
    const store = useGameStore.getState();
    const quest = store.quests.find((q) => q.id === questId);
    return quest ? quest.progress >= quest.target && !quest.claimed : false;
  }

  /**
   * Get count of claimable quests
   */
  static getClaimableCount(): number {
    const store = useGameStore.getState();
    return store.quests.filter((q) => q.progress >= q.target && !q.claimed).length;
  }
}
