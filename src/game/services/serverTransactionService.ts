import { pb } from "@/lib/pocketbase";

/**
 * Server Transaction Service
 * Client adapter cho server-side transaction APIs
 * Replaces direct PocketBase updates trong authenticated mode
 */

export interface TransactionResponse<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface BuySeedResponse {
  success: true;
  player: {
    coins: number;
    level: number;
  };
  inventory: {
    cropId: string;
    quantity: number;
  };
}

export interface PlantCropResponse {
  success: true;
  plot: {
    plotId: number;
    cropId: string;
    plantedAt: string;
    harvestAt: string;
  };
  inventory: {
    cropId: string;
    quantity: number;
  };
}

export interface HarvestCropResponse {
  success: true;
  rewards: {
    coins: number;
    exp: number;
    cropId: string;
  };
  player: {
    coins: number;
    exp: number;
    level: number;
    leveledUp: boolean;
  };
  inventory: {
    cropId: string;
    quantity: number;
  };
}

export interface SellCropResponse {
  success: true;
  earned: number;
  player: {
    coins: number;
  };
  inventory: {
    cropId: string;
    quantity: number;
  };
}

/**
 * Server Transaction Service
 * All methods call server APIs instead of direct PocketBase updates
 */
export const ServerTransactionService = {
  /**
   * Buy seed via server API
   */
  async buySeed(cropId: string): Promise<TransactionResponse<BuySeedResponse>> {
    try {
      const response = await fetch(`${pb.baseUrl}/api/farm/buy-seed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: pb.authStore.token,
        },
        body: JSON.stringify({ cropId }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error || "Giao dịch thất bại",
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error("Buy seed error:", error);
      return {
        success: false,
        error: "Không thể kết nối server",
      };
    }
  },

  /**
   * Plant crop via server API
   */
  async plantCrop(
    plotId: number,
    cropId: string,
  ): Promise<TransactionResponse<PlantCropResponse>> {
    try {
      const response = await fetch(`${pb.baseUrl}/api/farm/plant-crop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: pb.authStore.token,
        },
        body: JSON.stringify({ plotId, cropId }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error || "Không thể trồng",
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error("Plant crop error:", error);
      return {
        success: false,
        error: "Không thể kết nối server",
      };
    }
  },

  /**
   * Harvest crop via server API
   */
  async harvestCrop(plotId: number): Promise<TransactionResponse<HarvestCropResponse>> {
    try {
      const response = await fetch(`${pb.baseUrl}/api/farm/harvest-crop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: pb.authStore.token,
        },
        body: JSON.stringify({ plotId }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error || "Không thể thu hoạch",
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error("Harvest crop error:", error);
      return {
        success: false,
        error: "Không thể kết nối server",
      };
    }
  },

  /**
   * Sell crop via server API
   */
  async sellCrop(
    cropId: string,
    quantity: number,
  ): Promise<TransactionResponse<SellCropResponse>> {
    try {
      const response = await fetch(`${pb.baseUrl}/api/farm/sell-crop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: pb.authStore.token,
        },
        body: JSON.stringify({ cropId, quantity }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error || "Không thể bán",
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error("Sell crop error:", error);
      return {
        success: false,
        error: "Không thể kết nối server",
      };
    }
  },
};
