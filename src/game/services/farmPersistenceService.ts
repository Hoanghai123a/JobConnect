import { pb } from "@/lib/pocketbase";
import type { Player, Plot, Quest } from "../types";
import { DAILY_QUESTS } from "../config/quests";
import { GAME_CONFIG } from "../config/game";

/**
 * Farm Persistence Service
 * Handles all PocketBase interactions for farm game data
 * Server is the source of truth for economy
 */

interface FarmPlayerRecord {
  id: string;
  user: string;
  coins: number;
  level: number;
  exp: number;
  last_login: string;
}

interface FarmPlotRecord {
  id: string;
  player: string;
  plot_id: number;
  crop_id?: string;
  planted_at?: string;
  harvest_at?: string;
}

interface FarmInventoryRecord {
  id: string;
  player: string;
  crop_id: string;
  quantity: number;
}

interface FarmQuestRecord {
  id: string;
  player: string;
  quest_id: string;
  progress: number;
  claimed: boolean;
  reset_at: string;
}

export const FarmPersistenceService = {
  /**
   * Initialize or load player farm data
   * Creates farm_player record if doesn't exist
   */
  async initPlayer(): Promise<{
    player: Player;
    plots: Plot[];
    inventory: Record<string, number>;
    quests: Quest[];
  } | null> {
    try {
      if (!pb.authStore.isValid) {
        console.warn("User not authenticated");
        return null;
      }

      const userId = pb.authStore.model?.id;
      if (!userId) return null;

      // Try to get existing player
      let playerRecord: FarmPlayerRecord;
      try {
        playerRecord = await pb
          .collection("farm_players")
          .getFirstListItem<FarmPlayerRecord>(`user="${userId}"`);

        // Update last_login
        await pb.collection("farm_players").update(playerRecord.id, {
          last_login: new Date().toISOString(),
        });
      } catch (err) {
        // Create new player
        playerRecord = await pb.collection("farm_players").create<FarmPlayerRecord>({
          user: userId,
          coins: GAME_CONFIG.player.initialCoins,
          level: GAME_CONFIG.player.initialLevel,
          exp: GAME_CONFIG.player.initialExp,
          last_login: new Date().toISOString(),
        });

        // Initialize 12 empty plots
        const plotPromises = [];
        for (let i = 0; i < 12; i++) {
          plotPromises.push(
            pb.collection("farm_plots").create({
              player: playerRecord.id,
              plot_id: i,
            }),
          );
        }
        await Promise.all(plotPromises);

        // Initialize daily quests
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const questPromises = DAILY_QUESTS.map((quest) =>
          pb.collection("farm_quests").create({
            player: playerRecord.id,
            quest_id: quest.id,
            progress: 0,
            claimed: false,
            reset_at: tomorrow.toISOString(),
          }),
        );
        await Promise.all(questPromises);
      }

      // Load plots
      const plotRecords = await pb.collection("farm_plots").getFullList<FarmPlotRecord>({
        filter: `player="${playerRecord.id}"`,
        sort: "plot_id",
      });

      // Load inventory
      const invRecords = await pb.collection("farm_inventory").getFullList<FarmInventoryRecord>({
        filter: `player="${playerRecord.id}"`,
      });

      // Load quests
      const questRecords = await pb.collection("farm_quests").getFullList<FarmQuestRecord>({
        filter: `player="${playerRecord.id}"`,
      });

      // Transform to game format
      const player: Player = {
        id: playerRecord.id,
        coins: playerRecord.coins,
        level: playerRecord.level,
        exp: playerRecord.exp,
        expToNextLevel: 100 * Math.pow(1.5, playerRecord.level - 1),
      };

      const plots: Plot[] = plotRecords.map((rec) => ({
        id: rec.plot_id,
        x: rec.plot_id % 4,
        y: Math.floor(rec.plot_id / 4),
        crop: rec.crop_id
          ? {
              cropId: rec.crop_id,
              plantedAt: new Date(rec.planted_at!).getTime(),
              harvestAt: new Date(rec.harvest_at!).getTime(),
              state:
                new Date(rec.harvest_at!).getTime() <= Date.now()
                  ? ("READY" as const)
                  : ("GROWING" as const),
            }
          : null,
      }));

      const inventory = invRecords.reduce(
        (acc, rec) => {
          acc[rec.crop_id] = rec.quantity;
          return acc;
        },
        {} as Record<string, number>,
      );

      const quests: Quest[] = questRecords.map((rec) => {
        const template = DAILY_QUESTS.find((q) => q.id === rec.quest_id)!;
        return {
          id: rec.quest_id,
          title: template.title,
          description: template.description,
          type: template.type,
          target: template.target,
          progress: rec.progress,
          reward: template.reward,
          claimed: rec.claimed,
        };
      });

      return { player, plots, inventory, quests };
    } catch (error) {
      console.error("Failed to init player:", error);
      return null;
    }
  },

  /**
   * Save player stats (coins, level, exp)
   */
  async savePlayer(player: Player): Promise<boolean> {
    try {
      await pb.collection("farm_players").update(player.id, {
        coins: player.coins,
        level: player.level,
        exp: player.exp,
      });
      return true;
    } catch (error) {
      console.error("Failed to save player:", error);
      return false;
    }
  },

  /**
   * Plant crop on plot
   */
  async plantCrop(
    playerId: string,
    plotId: number,
    cropId: string,
    plantedAt: Date,
    harvestAt: Date,
  ): Promise<boolean> {
    try {
      const plotRecord = await pb
        .collection("farm_plots")
        .getFirstListItem<FarmPlotRecord>(`player="${playerId}" && plot_id=${plotId}`);

      await pb.collection("farm_plots").update(plotRecord.id, {
        crop_id: cropId,
        planted_at: plantedAt.toISOString(),
        harvest_at: harvestAt.toISOString(),
      });

      return true;
    } catch (error) {
      console.error("Failed to plant crop:", error);
      return false;
    }
  },

  /**
   * Harvest crop from plot
   */
  async harvestCrop(playerId: string, plotId: number): Promise<boolean> {
    try {
      const plotRecord = await pb
        .collection("farm_plots")
        .getFirstListItem<FarmPlotRecord>(`player="${playerId}" && plot_id=${plotId}`);

      await pb.collection("farm_plots").update(plotRecord.id, {
        crop_id: null,
        planted_at: null,
        harvest_at: null,
      });

      return true;
    } catch (error) {
      console.error("Failed to harvest crop:", error);
      return false;
    }
  },

  /**
   * Update inventory
   */
  async updateInventory(playerId: string, cropId: string, quantity: number): Promise<boolean> {
    try {
      // Try to find existing record
      try {
        const invRecord = await pb
          .collection("farm_inventory")
          .getFirstListItem<FarmInventoryRecord>(`player="${playerId}" && crop_id="${cropId}"`);

        const newQuantity = invRecord.quantity + quantity;

        if (newQuantity <= 0) {
          // Delete if quantity reaches 0
          await pb.collection("farm_inventory").delete(invRecord.id);
        } else {
          // Update quantity
          await pb.collection("farm_inventory").update(invRecord.id, {
            quantity: newQuantity,
          });
        }
      } catch {
        // Create new record
        if (quantity > 0) {
          await pb.collection("farm_inventory").create({
            player: playerId,
            crop_id: cropId,
            quantity,
          });
        }
      }

      return true;
    } catch (error) {
      console.error("Failed to update inventory:", error);
      return false;
    }
  },

  /**
   * Update quest progress
   */
  async updateQuestProgress(
    playerId: string,
    questId: string,
    progressDelta: number,
  ): Promise<boolean> {
    try {
      const questRecord = await pb
        .collection("farm_quests")
        .getFirstListItem<FarmQuestRecord>(`player="${playerId}" && quest_id="${questId}"`);

      await pb.collection("farm_quests").update(questRecord.id, {
        progress: questRecord.progress + progressDelta,
      });

      return true;
    } catch (error) {
      console.error("Failed to update quest progress:", error);
      return false;
    }
  },

  /**
   * Claim quest reward
   */
  async claimQuest(playerId: string, questId: string): Promise<boolean> {
    try {
      const questRecord = await pb
        .collection("farm_quests")
        .getFirstListItem<FarmQuestRecord>(`player="${playerId}" && quest_id="${questId}"`);

      await pb.collection("farm_quests").update(questRecord.id, {
        claimed: true,
      });

      return true;
    } catch (error) {
      console.error("Failed to claim quest:", error);
      return false;
    }
  },

  /**
   * Check and reset daily quests
   * Called on player init
   */
  async checkQuestReset(playerId: string): Promise<boolean> {
    try {
      const now = new Date();
      const questRecords = await pb.collection("farm_quests").getFullList<FarmQuestRecord>({
        filter: `player="${playerId}" && reset_at < "${now.toISOString()}"`,
      });

      if (questRecords.length === 0) return false;

      // Reset all expired quests
      const tomorrow = new Date();
      tomorrow.setHours(0, 0, 0, 0);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const updates = questRecords.map((rec) =>
        pb.collection("farm_quests").update(rec.id, {
          progress: 0,
          claimed: false,
          reset_at: tomorrow.toISOString(),
        }),
      );

      await Promise.all(updates);
      return true;
    } catch (error) {
      console.error("Failed to reset quests:", error);
      return false;
    }
  },
};
