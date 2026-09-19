import { create } from "zustand";
import type { Player, Plot, PlantedCrop, Quest } from "../types";
import { GAME_CONFIG } from "../config/game";
import { calculateExpForLevel, getUnlockedPlotsCount, CROPS } from "../config/crops";
import { showLevelUpNotification } from "../utils/notifications";
import { DAILY_QUESTS } from "../config/quests";
import { AudioService } from "../services/audioService";

interface GameStore {
  // Player state
  player: Player;

  // Farm state
  plots: Plot[];

  // Inventory (cropId -> quantity)
  inventory: Record<string, number>;

  // Quests
  quests: Quest[];

  // Helpers
  getUnlockedPlotsCount: () => number;
  isPlotUnlocked: (plotId: number) => boolean;

  // Actions
  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  addExp: (amount: number) => void;
  addToInventory: (cropId: string, quantity: number) => void;
  removeFromInventory: (cropId: string, quantity: number) => boolean;
  plantCrop: (plotId: number, cropId: string, growTime: number) => void;
  harvestCrop: (plotId: number) => PlantedCrop | null;
  updateCropStates: () => void;
  setQuests: (quests: Quest[]) => void;
  resetGame: () => void;
}

// Initialize plots
const initializePlots = (): Plot[] => {
  const plots: Plot[] = [];
  const { plotsX, plotsY } = GAME_CONFIG.farm;

  for (let y = 0; y < plotsY; y++) {
    for (let x = 0; x < plotsX; x++) {
      plots.push({
        id: y * plotsX + x,
        x,
        y,
        crop: null,
      });
    }
  }

  return plots;
};

export const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  player: {
    id: "player-1",
    coins: GAME_CONFIG.player.initialCoins,
    level: GAME_CONFIG.player.initialLevel,
    exp: GAME_CONFIG.player.initialExp,
    expToNextLevel: calculateExpForLevel(GAME_CONFIG.player.initialLevel),
  },

  plots: initializePlots(),

  inventory: {},

  quests: DAILY_QUESTS.map((quest) => ({ ...quest })),

  // Helpers
  getUnlockedPlotsCount: () => {
    const { player } = get();
    return getUnlockedPlotsCount(player.level);
  },

  isPlotUnlocked: (plotId) => {
    const { player } = get();
    const unlockedCount = getUnlockedPlotsCount(player.level);
    return plotId < unlockedCount;
  },

  // Actions
  addCoins: (amount) =>
    set((state) => ({
      player: { ...state.player, coins: state.player.coins + amount },
    })),

  spendCoins: (amount) => {
    const { player } = get();
    if (player.coins < amount) return false;

    set((state) => ({
      player: { ...state.player, coins: state.player.coins - amount },
    }));
    return true;
  },

  addExp: (amount) =>
    set((state) => {
      let newExp = state.player.exp + amount;
      let newLevel = state.player.level;
      let expToNextLevel = state.player.expToNextLevel;
      const oldLevel = state.player.level;

      // Level up loop
      while (newExp >= expToNextLevel) {
        newExp -= expToNextLevel;
        newLevel++;
        expToNextLevel = calculateExpForLevel(newLevel);
      }

      // Check for level-up and show notification
      if (newLevel > oldLevel) {
        const oldPlotsCount = getUnlockedPlotsCount(oldLevel);
        const newPlotsCount = getUnlockedPlotsCount(newLevel);
        const newPlots = newPlotsCount - oldPlotsCount;

        // Find newly unlocked crops
        const newlyUnlockedCrops = Object.values(CROPS)
          .filter((crop) => crop.unlockedAtLevel === newLevel)
          .map((crop) => crop.name);

        showLevelUpNotification(newLevel, {
          crops: newlyUnlockedCrops,
          plots: newPlots,
        });

        // Play level-up sound
        AudioService.play("levelUp");

        // Trigger level-up particle effect in Phaser
        const farmScene = (window as any).phaserGame?.scene?.getScene("FarmScene");
        if (farmScene && typeof farmScene.triggerLevelUpEffect === "function") {
          farmScene.triggerLevelUpEffect();
        }
      }

      return {
        player: {
          ...state.player,
          exp: newExp,
          level: newLevel,
          expToNextLevel,
        },
      };
    }),

  addToInventory: (cropId, quantity) =>
    set((state) => ({
      inventory: {
        ...state.inventory,
        [cropId]: (state.inventory[cropId] || 0) + quantity,
      },
    })),

  removeFromInventory: (cropId, quantity) => {
    const { inventory } = get();
    if (!inventory[cropId] || inventory[cropId] < quantity) return false;

    set((state) => ({
      inventory: {
        ...state.inventory,
        [cropId]: state.inventory[cropId] - quantity,
      },
    }));
    return true;
  },

  plantCrop: (plotId, cropId, growTime) => {
    const { isPlotUnlocked } = get();

    // Check if plot is unlocked
    if (!isPlotUnlocked(plotId)) {
      console.warn(`Plot ${plotId} is locked`);
      return;
    }

    set((state) => {
      const now = Date.now();
      const plots = state.plots.map((plot) => {
        if (plot.id === plotId) {
          return {
            ...plot,
            crop: {
              cropId,
              plotId,
              plantedAt: now,
              harvestAt: now + growTime * 1000,
              state: "GROWING" as const,
            },
          };
        }
        return plot;
      });

      return { plots };
    });
  },

  harvestCrop: (plotId) => {
    const { plots } = get();
    const plot = plots.find((p) => p.id === plotId);

    if (!plot?.crop || plot.crop.state !== "READY") return null;

    const harvestedCrop = plot.crop;

    set((state) => ({
      plots: state.plots.map((p) => {
        if (p.id === plotId) {
          return { ...p, crop: null };
        }
        return p;
      }),
    }));

    return harvestedCrop;
  },

  updateCropStates: () =>
    set((state) => {
      const now = Date.now();
      const plots = state.plots.map((plot) => {
        if (plot.crop && plot.crop.state === "GROWING") {
          if (now >= plot.crop.harvestAt) {
            return {
              ...plot,
              crop: { ...plot.crop, state: "READY" as const },
            };
          }
        }
        return plot;
      });

      return { plots };
    }),

  setQuests: (quests) => set({ quests }),

  resetGame: () =>
    set({
      player: {
        id: "player-1",
        coins: GAME_CONFIG.player.initialCoins,
        level: GAME_CONFIG.player.initialLevel,
        exp: GAME_CONFIG.player.initialExp,
        expToNextLevel: calculateExpForLevel(GAME_CONFIG.player.initialLevel),
      },
      plots: initializePlots(),
      inventory: {},
      quests: DAILY_QUESTS.map((quest) => ({ ...quest })),
    }),
}));
