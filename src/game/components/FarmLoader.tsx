import { useEffect, useState } from "react";
import { useGameStore } from "../stores/gameStore";
import { getStorageAdapter } from "../services/storageFactory";
import { FarmPersistenceService } from "../services/farmPersistenceService";
import { pb } from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface FarmLoaderProps {
  onLoaded: () => void;
  children: React.ReactNode;
}

export const FarmLoader = ({ onLoaded, children }: FarmLoaderProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFarm();
  }, []);

  const loadFarm = async () => {
    try {
      setLoading(true);
      setError(null);

      const adapter = getStorageAdapter();
      const isAuthenticated = pb.authStore.isValid;

      // Load player
      const player = await adapter.loadPlayer();
      if (!player) {
        setError("Không thể tải dữ liệu người chơi");
        setLoading(false);
        return;
      }

      // Load plots, inventory, quests
      const plots = await adapter.loadPlots();
      const inventory = await adapter.loadInventory();
      const quests = await adapter.loadQuests();

      // Initialize Zustand store with loaded data
      const store = useGameStore.getState();

      // Set player data
      store.addCoins(player.coins - store.player.coins);
      store.addExp(player.exp - store.player.exp);
      store.player.id = player.id;

      // Set plots (merge loaded data with client state)
      const updatedPlots = store.plots.map((plot) => {
        const loadedPlot = plots.find((p) => p.id === plot.id);
        return loadedPlot || plot;
      });
      store.plots.forEach((_, i) => {
        if (updatedPlots[i]) {
          store.plots[i] = updatedPlots[i];
        }
      });

      // Set inventory
      Object.keys(inventory).forEach((cropId) => {
        const quantity = inventory[cropId];
        const current = store.inventory[cropId] || 0;
        if (quantity !== current) {
          store.addToInventory(cropId, quantity - current);
        }
      });

      // Set quests
      store.setQuests(quests);

      // Check quest reset (authenticated mode only)
      if (isAuthenticated && player.id) {
        await FarmPersistenceService.checkQuestReset(player.id);
      }

      setLoading(false);
      onLoaded();
    } catch (err) {
      console.error("Farm load error:", err);
      setError("Lỗi khi tải dữ liệu nông trại");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-b from-green-100 to-green-200">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-green-600" />
          <p className="text-lg font-medium text-gray-700">Đang tải nông trại...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-b from-red-100 to-red-200">
        <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-lg">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-lg font-medium text-gray-800 mb-4">{error}</p>
          <Button onClick={loadFarm} className="w-full">
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
