import { useGameStore } from "../stores/gameStore";
import { CROPS } from "../config/crops";
import { QuestService } from "./questService";
import { AudioService } from "./audioService";
import { FarmPersistenceService } from "./farmPersistenceService";

/**
 * Economy service layer
 * Handles all economic transactions with validation
 */
export const EconomyService = {
  /**
   * Buy seed from shop
   * Validates: player has enough coins
   */
  buySeed(cropId: string): { success: boolean; error?: string } {
    const cropConfig = CROPS[cropId];
    if (!cropConfig) {
      return { success: false, error: "Crop không tồn tại" };
    }

    const store = useGameStore.getState();

    // Validate coins
    if (store.player.coins < cropConfig.seedCost) {
      return { success: false, error: "Không đủ xu" };
    }

    // Validate level
    if (store.player.level < cropConfig.unlockedAtLevel) {
      return { success: false, error: "Chưa đủ cấp" };
    }

    // Execute transaction
    const spent = store.spendCoins(cropConfig.seedCost);
    if (!spent) {
      return { success: false, error: "Giao dịch thất bại" };
    }

    store.addToInventory(cropId, 1);

    // Update quest progress
    QuestService.updateQuestProgress("BUY_SEED", 1);

    // Play sound effect
    AudioService.play("buy");

    // Persist to backend
    const playerId = store.player.id;
    FarmPersistenceService.updateInventory(playerId, cropId, 1);
    FarmPersistenceService.savePlayer(store.player);

    return { success: true };
  },

  /**
   * Sell harvested crop
   * Validates: player has crop in inventory
   */
  sellCrop(
    cropId: string,
    quantity: number = 1,
  ): { success: boolean; error?: string; earned?: number } {
    const cropConfig = CROPS[cropId];
    if (!cropConfig) {
      return { success: false, error: "Crop không tồn tại" };
    }

    const store = useGameStore.getState();

    // Validate inventory
    const currentQuantity = store.inventory[cropId] || 0;
    if (currentQuantity < quantity) {
      return { success: false, error: "Không đủ số lượng trong kho" };
    }

    // Prevent negative quantity
    if (quantity <= 0) {
      return { success: false, error: "Số lượng không hợp lệ" };
    }

    // Execute transaction
    const removed = store.removeFromInventory(cropId, quantity);
    if (!removed) {
      return { success: false, error: "Không thể bán" };
    }

    const earned = cropConfig.sellPrice * quantity;
    store.addCoins(earned);

    // Update quest progress
    QuestService.updateQuestProgress("SELL", quantity);
    QuestService.updateQuestProgress("EARN_COINS", earned);

    // Play sound effect
    AudioService.play("coin");

    // Persist to backend
    const playerId = useGameStore.getState().player.id;
    FarmPersistenceService.updateInventory(playerId, cropId, -quantity);
    FarmPersistenceService.savePlayer(useGameStore.getState().player);

    return { success: true, earned };
  },

  /**
   * Plant crop on plot
   * Validates: player has seed, plot is empty
   */
  plantCrop(plotId: number, cropId: string): { success: boolean; error?: string } {
    const cropConfig = CROPS[cropId];
    if (!cropConfig) {
      return { success: false, error: "Crop không tồn tại" };
    }

    const store = useGameStore.getState();
    const plot = store.plots.find((p) => p.id === plotId);

    // Validate plot exists
    if (!plot) {
      return { success: false, error: "Ô đất không tồn tại" };
    }

    // Validate plot is empty
    if (plot.crop !== null) {
      return { success: false, error: "Ô đất đã có cây" };
    }

    // Validate inventory
    const hasInInventory = (store.inventory[cropId] || 0) > 0;
    if (!hasInInventory) {
      return { success: false, error: "Không có hạt giống trong kho" };
    }

    // Execute transaction
    const removed = store.removeFromInventory(cropId, 1);
    if (!removed) {
      return { success: false, error: "Không thể trồng" };
    }

    store.plantCrop(plotId, cropId, cropConfig.growTime);

    // Update quest progress
    QuestService.updateQuestProgress("PLANT", 1);

    // Play sound effect
    AudioService.play("plant");

    // Persist to backend
    const playerId = store.player.id;
    const updatedPlot = store.plots.find((p) => p.id === plotId);
    if (updatedPlot?.crop) {
      const plantedAt = new Date(updatedPlot.crop.plantedAt);
      const harvestAt = new Date(updatedPlot.crop.harvestAt);
      FarmPersistenceService.plantCrop(playerId, plotId, cropId, plantedAt, harvestAt);
      FarmPersistenceService.updateInventory(playerId, cropId, -1);
    }

    return { success: true };
  },

  /**
   * Harvest crop and give rewards
   * Validates: crop is ready, prevents double harvest
   */
  harvestCrop(plotId: number): {
    success: boolean;
    error?: string;
    rewards?: { coins: number; exp: number; cropId: string };
  } {
    const store = useGameStore.getState();
    const plot = store.plots.find((p) => p.id === plotId);

    // Validate plot has crop
    if (!plot?.crop) {
      return { success: false, error: "Ô đất trống" };
    }

    // Validate crop is ready
    if (plot.crop.state !== "READY") {
      return { success: false, error: "Cây chưa lớn" };
    }

    // Execute harvest (this also prevents double harvest)
    const harvestedCrop = store.harvestCrop(plotId);
    if (!harvestedCrop) {
      return { success: false, error: "Không thể thu hoạch" };
    }

    const cropConfig = CROPS[harvestedCrop.cropId];
    if (!cropConfig) {
      return { success: false, error: "Crop không tồn tại" };
    }

    // Give rewards
    store.addCoins(cropConfig.sellPrice);
    store.addExp(cropConfig.expReward);
    store.addToInventory(harvestedCrop.cropId, 1);

    // Update quest progress
    QuestService.updateQuestProgress("HARVEST", 1);
    QuestService.updateQuestProgress("GAIN_EXP", cropConfig.expReward);

    // Play sound effect
    AudioService.play("harvest");

    // Persist to backend
    const playerId = store.player.id;
    FarmPersistenceService.harvestCrop(playerId, plotId);
    FarmPersistenceService.updateInventory(playerId, harvestedCrop.cropId, 1);
    FarmPersistenceService.savePlayer(store.player);

    return {
      success: true,
      rewards: {
        coins: cropConfig.sellPrice,
        exp: cropConfig.expReward,
        cropId: harvestedCrop.cropId,
      },
    };
  },
};
