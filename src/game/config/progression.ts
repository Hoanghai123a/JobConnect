import type { CropConfig } from "../types";

/**
 * Plot unlock configuration
 * Defines how many plots are available at each level
 */
export const PLOT_UNLOCKS: Record<number, number> = {
  1: 4, // Level 1: 4 plots
  2: 6, // Level 2: 6 plots
  3: 8, // Level 3: 8 plots
  4: 10, // Level 4: 10 plots
  5: 12, // Level 5: 12 plots
  6: 16, // Level 6: 16 plots (changed from 12 to support more plots)
};

/**
 * Get number of unlocked plots for a given level
 */
export const getUnlockedPlotsCount = (level: number): number => {
  // Find the highest level <= player level
  const levels = Object.keys(PLOT_UNLOCKS)
    .map(Number)
    .sort((a, b) => b - a);

  for (const lvl of levels) {
    if (level >= lvl) {
      return PLOT_UNLOCKS[lvl];
    }
  }

  return 4; // Default to 4 plots if below level 1
};
