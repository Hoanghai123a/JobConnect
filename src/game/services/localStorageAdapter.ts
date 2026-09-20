import type { StorageAdapter } from "./storageAdapter";
import type { Player, Plot, Quest } from "../types";
import { GAME_CONFIG } from "../config/game";
import { DAILY_QUESTS } from "../config/quests";

/**
 * LocalStorage adapter for offline/guest play
 * Data isolated per device, no sync to server
 */
export class LocalStorageAdapter implements StorageAdapter {
  private playerId: string;

  constructor() {
    this.playerId = this.getOrCreatePlayerId();
  }

  getPlayerId(): string {
    return this.playerId;
  }

  async savePlayer(player: Player): Promise<boolean> {
    try {
      const key = `farm_game_player_${this.playerId}`;
      localStorage.setItem(key, JSON.stringify(player));
      this.updateLastPlayed();
      return true;
    } catch (error) {
      console.error("Failed to save player to localStorage:", error);
      return false;
    }
  }

  async loadPlayer(): Promise<Player | null> {
    try {
      const key = `farm_game_player_${this.playerId}`;
      const data = localStorage.getItem(key);

      if (!data) {
        return this.createDefaultPlayer();
      }

      return JSON.parse(data);
    } catch (error) {
      console.error("Failed to load player from localStorage:", error);
      return null;
    }
  }

  async savePlots(plots: Plot[]): Promise<boolean> {
    try {
      const key = `farm_game_plots_${this.playerId}`;
      localStorage.setItem(key, JSON.stringify(plots));
      this.updateLastPlayed();
      return true;
    } catch (error) {
      console.error("Failed to save plots to localStorage:", error);
      return false;
    }
  }

  async loadPlots(): Promise<Plot[]> {
    try {
      const key = `farm_game_plots_${this.playerId}`;
      const data = localStorage.getItem(key);

      if (!data) {
        return [];
      }

      return JSON.parse(data);
    } catch (error) {
      console.error("Failed to load plots from localStorage:", error);
      return [];
    }
  }

  async saveInventory(inventory: Record<string, number>): Promise<boolean> {
    try {
      const key = `farm_game_inventory_${this.playerId}`;
      localStorage.setItem(key, JSON.stringify(inventory));
      this.updateLastPlayed();
      return true;
    } catch (error) {
      console.error("Failed to save inventory to localStorage:", error);
      return false;
    }
  }

  async loadInventory(): Promise<Record<string, number>> {
    try {
      const key = `farm_game_inventory_${this.playerId}`;
      const data = localStorage.getItem(key);

      if (!data) {
        return {};
      }

      return JSON.parse(data);
    } catch (error) {
      console.error("Failed to load inventory from localStorage:", error);
      return {};
    }
  }

  async saveQuests(quests: Quest[]): Promise<boolean> {
    try {
      const key = `farm_game_quests_${this.playerId}`;
      localStorage.setItem(key, JSON.stringify(quests));
      this.updateLastPlayed();
      return true;
    } catch (error) {
      console.error("Failed to save quests to localStorage:", error);
      return false;
    }
  }

  async loadQuests(): Promise<Quest[]> {
    try {
      const key = `farm_game_quests_${this.playerId}`;
      const data = localStorage.getItem(key);

      if (!data) {
        return this.createDefaultQuests();
      }

      const quests = JSON.parse(data);
      return this.resetQuestsIfNeeded(quests);
    } catch (error) {
      console.error("Failed to load quests from localStorage:", error);
      return this.createDefaultQuests();
    }
  }

  private getOrCreatePlayerId(): string {
    try {
      const metadata = localStorage.getItem("farm_game_metadata");
      if (metadata) {
        const parsed = JSON.parse(metadata);
        return parsed.playerId;
      }

      const newId = `guest_${this.generateUUID()}`;
      localStorage.setItem(
        "farm_game_metadata",
        JSON.stringify({
          playerId: newId,
          createdAt: new Date().toISOString(),
          mode: "offline",
          lastPlayed: new Date().toISOString(),
        })
      );

      return newId;
    } catch (error) {
      console.error("Failed to get/create playerId:", error);
      return `guest_${Date.now()}`;
    }
  }

  private updateLastPlayed(): void {
    try {
      const metadata = JSON.parse(localStorage.getItem("farm_game_metadata") || "{}");
      metadata.lastPlayed = new Date().toISOString();
      localStorage.setItem("farm_game_metadata", JSON.stringify(metadata));
    } catch (error) {
      console.error("Failed to update lastPlayed:", error);
    }
  }

  private createDefaultPlayer(): Player {
    const level = GAME_CONFIG.player.initialLevel;
    return {
      id: this.playerId,
      coins: GAME_CONFIG.player.initialCoins,
      level,
      exp: GAME_CONFIG.player.initialExp,
      expToNextLevel: this.calculateExpForLevel(level),
    };
  }

  private createDefaultQuests(): Quest[] {
    const now = new Date();
    const resetAt = new Date(now);
    resetAt.setHours(24, 0, 0, 0);

    return DAILY_QUESTS.map((config) => ({
      id: config.id,
      title: config.title,
      description: config.description,
      type: config.type,
      target: config.target,
      progress: 0,
      claimed: false,
      reward: config.reward,
      resetAt: resetAt.toISOString(),
    }));
  }

  private resetQuestsIfNeeded(quests: Quest[]): Quest[] {
    const now = new Date();
    const needsReset = quests.some((quest) => {
      const resetAt = new Date(quest.resetAt);
      return now >= resetAt;
    });

    if (needsReset) {
      return this.createDefaultQuests();
    }

    return quests;
  }

  private calculateExpForLevel(level: number): number {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  }

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
