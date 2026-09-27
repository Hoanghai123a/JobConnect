import type { StorageAdapter } from "./storageAdapter";
import type { Player, Plot, Quest } from "../types";
import { FarmPersistenceService } from "./farmPersistenceService";
import { pb } from "@/lib/pocketbase";

/**
 * PocketBase adapter for authenticated users
 * Wraps existing FarmPersistenceService
 */
export class PocketBaseAdapter implements StorageAdapter {
  private playerId: string | null = null;

  getPlayerId(): string {
    if (!this.playerId) {
      throw new Error("Player not initialized. Call loadPlayer first.");
    }
    return this.playerId;
  }

  async savePlayer(player: Player): Promise<boolean> {
    this.playerId = player.id;
    return FarmPersistenceService.savePlayer(player);
  }

  async loadPlayer(): Promise<Player | null> {
    if (!pb.authStore.isValid) {
      return null;
    }

    const data = await FarmPersistenceService.initPlayer();
    if (data) {
      this.playerId = data.player.id;
      return data.player;
    }

    return null;
  }

  async savePlots(plots: Plot[]): Promise<boolean> {
    // PocketBase updates plots individually via plantCrop/harvestCrop
    // This method is for bulk save (not used in current flow)
    return true;
  }

  async loadPlots(): Promise<Plot[]> {
    if (!pb.authStore.isValid) {
      return [];
    }

    const data = await FarmPersistenceService.initPlayer();
    return data?.plots || [];
  }

  async saveInventory(inventory: Record<string, number>): Promise<boolean> {
    // PocketBase updates inventory via updateInventory per crop
    // This method is for bulk save (not used in current flow)
    return true;
  }

  async loadInventory(): Promise<Record<string, number>> {
    if (!pb.authStore.isValid) {
      return {};
    }

    const data = await FarmPersistenceService.initPlayer();
    return data?.inventory || {};
  }

  async saveQuests(quests: Quest[]): Promise<boolean> {
    // PocketBase updates quests via updateQuestProgress/claimQuestReward
    // This method is for bulk save (not used in current flow)
    return true;
  }

  async loadQuests(): Promise<Quest[]> {
    if (!pb.authStore.isValid) {
      return [];
    }

    const data = await FarmPersistenceService.initPlayer();
    return data?.quests || [];
  }
}
