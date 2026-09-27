import type { Player, Plot, Quest } from "../types";

/**
 * Storage adapter interface for dual persistence (localStorage + PocketBase)
 */
export interface StorageAdapter {
  // Player
  savePlayer(player: Player): Promise<boolean>;
  loadPlayer(): Promise<Player | null>;

  // Plots
  savePlots(plots: Plot[]): Promise<boolean>;
  loadPlots(): Promise<Plot[]>;

  // Inventory
  saveInventory(inventory: Record<string, number>): Promise<boolean>;
  loadInventory(): Promise<Record<string, number>>;

  // Quests
  saveQuests(quests: Quest[]): Promise<boolean>;
  loadQuests(): Promise<Quest[]>;

  // Player ID
  getPlayerId(): string;
}
