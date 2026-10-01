import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { EconomyService } from "./economyService.ts";
import { useGameStore } from "../stores/gameStore.ts";
import { CROPS } from "../config/crops.ts";

// Mock dependencies
const mockQuestService = {
  updateQuestProgress: mock.fn(),
};

const mockAudioService = {
  play: mock.fn(),
};

const mockStorageAdapter = {
  savePlayer: mock.fn(async () => true),
  savePlots: mock.fn(async () => true),
  saveInventory: mock.fn(async () => true),
  loadPlayer: mock.fn(async () => null),
  loadPlots: mock.fn(async () => []),
  loadInventory: mock.fn(async () => ({})),
  saveQuests: mock.fn(async () => true),
  loadQuests: mock.fn(async () => []),
  getPlayerId: mock.fn(() => "test-player-id"),
};

// Mock module imports
mock.module("./questService", () => ({
  QuestService: mockQuestService,
}));

mock.module("./audioService", () => ({
  AudioService: mockAudioService,
}));

mock.module("./storageFactory", () => ({
  getStorageAdapter: () => mockStorageAdapter,
}));

describe("EconomyService", () => {
  beforeEach(() => {
    // Reset game store to initial state
    useGameStore.setState({
      player: {
        id: "test-player",
        coins: 1000,
        level: 1,
        exp: 0,
      },
      plots: Array.from({ length: 12 }, (_, i) => ({
        id: i,
        crop: null,
      })),
      inventory: {},
      quests: [],
    });

    // Clear all mocks
    mockQuestService.updateQuestProgress.mock.resetCalls();
    mockAudioService.play.mock.resetCalls();
    mockStorageAdapter.savePlayer.mock.resetCalls();
    mockStorageAdapter.savePlots.mock.resetCalls();
    mockStorageAdapter.saveInventory.mock.resetCalls();
  });

  describe("buySeed", () => {
    it("should buy seed successfully with valid coins and level", () => {
      const result = EconomyService.buySeed("carrot");

      assert.strictEqual(result.success, true);
      assert.strictEqual(useGameStore.getState().player.coins, 980); // 1000 - 20
      assert.strictEqual(useGameStore.getState().inventory.carrot, 1);
    });

    it("should fail when player has insufficient coins", () => {
      useGameStore.setState({
        player: { id: "test", coins: 10, level: 1, exp: 0 },
      });

      const result = EconomyService.buySeed("carrot");

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Không đủ xu");
      assert.strictEqual(useGameStore.getState().player.coins, 10); // Unchanged
    });

    it("should fail when player level is too low", () => {
      const result = EconomyService.buySeed("dragon_fruit"); // Requires level 13

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Chưa đủ cấp");
    });

    it("should fail for invalid crop", () => {
      const result = EconomyService.buySeed("invalid_crop");

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Crop không tồn tại");
    });

    it("should update quest progress and play sound on success", () => {
      EconomyService.buySeed("carrot");

      assert.strictEqual(mockQuestService.updateQuestProgress.mock.callCount(), 1);
      assert.deepStrictEqual(mockQuestService.updateQuestProgress.mock.calls[0].arguments, [
        "BUY_SEED",
        1,
      ]);
      assert.strictEqual(mockAudioService.play.mock.callCount(), 1);
      assert.strictEqual(mockAudioService.play.mock.calls[0].arguments[0], "buy");
    });
  });

  describe("sellCrop", () => {
    beforeEach(() => {
      useGameStore.setState({
        inventory: { carrot: 5 },
      });
    });

    it("should sell crop successfully", () => {
      const result = EconomyService.sellCrop("carrot", 2);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.earned, 70); // 35 * 2
      assert.strictEqual(useGameStore.getState().inventory.carrot, 3);
      assert.strictEqual(useGameStore.getState().player.coins, 1070);
    });

    it("should fail when inventory quantity is insufficient", () => {
      const result = EconomyService.sellCrop("carrot", 10);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Không đủ số lượng trong kho");
    });

    it("should fail for invalid quantity", () => {
      const result = EconomyService.sellCrop("carrot", 0);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Số lượng không hợp lệ");
    });

    it("should fail for negative quantity", () => {
      const result = EconomyService.sellCrop("carrot", -1);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Số lượng không hợp lệ");
    });

    it("should update quest progress on successful sell", () => {
      EconomyService.sellCrop("carrot", 3);

      assert.strictEqual(mockQuestService.updateQuestProgress.mock.callCount(), 2);
      // First call: SELL quest
      assert.deepStrictEqual(mockQuestService.updateQuestProgress.mock.calls[0].arguments, [
        "SELL",
        3,
      ]);
      // Second call: EARN_COINS quest
      assert.deepStrictEqual(mockQuestService.updateQuestProgress.mock.calls[1].arguments, [
        "EARN_COINS",
        105, // 35 * 3
      ]);
    });
  });

  describe("plantCrop", () => {
    beforeEach(() => {
      useGameStore.setState({
        inventory: { carrot: 3 },
      });
    });

    it("should plant crop successfully", () => {
      const result = EconomyService.plantCrop(0, "carrot");

      assert.strictEqual(result.success, true);
      assert.strictEqual(useGameStore.getState().inventory.carrot, 2);

      const plot = useGameStore.getState().plots[0];
      assert.notStrictEqual(plot.crop, null);
      assert.strictEqual(plot.crop?.cropId, "carrot");
      assert.strictEqual(plot.crop?.state, "GROWING");
    });

    it("should fail when plot is occupied", () => {
      // Plant first crop
      EconomyService.plantCrop(0, "carrot");

      // Try to plant again on same plot
      const result = EconomyService.plantCrop(0, "carrot");

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Ô đất đã có cây");
    });

    it("should fail when seed not in inventory", () => {
      const result = EconomyService.plantCrop(0, "rice");

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Không có hạt giống trong kho");
    });

    it("should fail for invalid plot", () => {
      const result = EconomyService.plantCrop(99, "carrot");

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Ô đất không tồn tại");
    });

    it("should update quest progress on successful plant", () => {
      EconomyService.plantCrop(0, "carrot");

      assert.strictEqual(mockQuestService.updateQuestProgress.mock.callCount(), 1);
      assert.deepStrictEqual(mockQuestService.updateQuestProgress.mock.calls[0].arguments, [
        "PLANT",
        1,
      ]);
    });
  });

  describe("harvestCrop", () => {
    beforeEach(() => {
      // Setup: plant and make crop ready for harvest
      useGameStore.setState({
        inventory: { carrot: 1 },
        plots: [
          {
            id: 0,
            crop: {
              cropId: "carrot",
              plantedAt: Date.now() - 60000, // 1 minute ago
              harvestAt: Date.now() - 1000, // Ready (harvest time passed)
              state: "READY",
            },
          },
          ...Array.from({ length: 11 }, (_, i) => ({
            id: i + 1,
            crop: null,
          })),
        ],
      });
    });

    it("should harvest crop successfully", () => {
      const initialCoins = useGameStore.getState().player.coins;
      const result = EconomyService.harvestCrop(0);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.rewards?.cropId, "carrot");
      assert.strictEqual(result.rewards?.coins, 35);
      assert.strictEqual(result.rewards?.exp, 3);

      // Check player rewards
      const state = useGameStore.getState();
      assert.strictEqual(state.player.coins, initialCoins + 35);
      assert.strictEqual(state.player.exp, 3);
      assert.strictEqual(state.inventory.carrot, 2); // 1 + 1 from harvest

      // Check plot is now empty
      assert.strictEqual(state.plots[0].crop, null);
    });

    it("should fail when plot is empty", () => {
      const result = EconomyService.harvestCrop(1); // Empty plot

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Ô đất trống");
    });

    it("should fail when crop is not ready", () => {
      useGameStore.setState({
        plots: [
          {
            id: 0,
            crop: {
              cropId: "carrot",
              plantedAt: Date.now(),
              harvestAt: Date.now() + 30000, // Not ready yet
              state: "GROWING",
            },
          },
          ...Array.from({ length: 11 }, (_, i) => ({
            id: i + 1,
            crop: null,
          })),
        ],
      });

      const result = EconomyService.harvestCrop(0);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, "Cây chưa lớn");
    });

    it("should update quest progress on successful harvest", () => {
      EconomyService.harvestCrop(0);

      assert.strictEqual(mockQuestService.updateQuestProgress.mock.callCount(), 2);
      // First call: HARVEST quest
      assert.deepStrictEqual(mockQuestService.updateQuestProgress.mock.calls[0].arguments, [
        "HARVEST",
        1,
      ]);
      // Second call: GAIN_EXP quest
      assert.deepStrictEqual(mockQuestService.updateQuestProgress.mock.calls[1].arguments, [
        "GAIN_EXP",
        3,
      ]);
    });

    it("should prevent double harvest", () => {
      const firstHarvest = EconomyService.harvestCrop(0);
      assert.strictEqual(firstHarvest.success, true);

      // Try to harvest again
      const secondHarvest = EconomyService.harvestCrop(0);
      assert.strictEqual(secondHarvest.success, false);
      assert.strictEqual(secondHarvest.error, "Ô đất trống");
    });
  });

  describe("Economy validation edge cases", () => {
    it("should handle concurrent transactions safely", () => {
      useGameStore.setState({
        player: { id: "test", coins: 100, level: 1, exp: 0 },
      });

      // Buy two seeds concurrently (both should check same coin amount)
      const result1 = EconomyService.buySeed("carrot"); // 20 coins
      const result2 = EconomyService.buySeed("carrot"); // 20 coins

      const finalCoins = useGameStore.getState().player.coins;

      // Both should succeed or one should fail
      if (result1.success && result2.success) {
        assert.strictEqual(finalCoins, 60); // 100 - 20 - 20
      } else {
        assert.strictEqual(
          result1.success || result2.success,
          true,
          "At least one transaction should succeed",
        );
      }
    });

    it("should handle inventory overflow gracefully", () => {
      useGameStore.setState({
        inventory: { carrot: 999999 },
      });

      // Harvest should still add to inventory
      useGameStore.setState({
        plots: [
          {
            id: 0,
            crop: {
              cropId: "carrot",
              plantedAt: Date.now() - 60000,
              harvestAt: Date.now() - 1000,
              state: "READY",
            },
          },
          ...Array.from({ length: 11 }, (_, i) => ({
            id: i + 1,
            crop: null,
          })),
        ],
      });

      const result = EconomyService.harvestCrop(0);
      assert.strictEqual(result.success, true);
      assert.strictEqual(useGameStore.getState().inventory.carrot, 1000000);
    });
  });
});
