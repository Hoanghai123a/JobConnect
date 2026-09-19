import { useEffect, useState } from "react";
import { FarmPersistenceService } from "../services/farmPersistenceService";
import { useGameStore } from "../stores/gameStore";
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

      // Check authentication
      if (!pb.authStore.isValid) {
        setError("Vui lòng đăng nhập để chơi game");
        setLoading(false);
        return;
      }

      // Load farm data from PocketBase
      const farmData = await FarmPersistenceService.initPlayer();

      if (!farmData) {
        setError("Không thể tải dữ liệu nông trại");
        setLoading(false);
        return;
      }

      // Initialize Zustand store with loaded data
      const store = useGameStore.getState();

      // Set player data
      store.addCoins(farmData.player.coins - store.player.coins); // Adjust to loaded value
      store.addExp(farmData.player.exp - store.player.exp); // Adjust to loaded value

      // Set plots (merge loaded data with client state)
      const updatedPlots = store.plots.map((plot) => {
        const loadedPlot = farmData.plots.find((p) => p.id === plot.id);
        return loadedPlot || plot;
      });
      store.plots.forEach((_, i) => {
        if (updatedPlots[i]) {
          store.plots[i] = updatedPlots[i];
        }
      });

      // Set inventory
      Object.keys(farmData.inventory).forEach((cropId) => {
        const quantity = farmData.inventory[cropId];
        const current = store.inventory[cropId] || 0;
        if (quantity !== current) {
          store.addToInventory(cropId, quantity - current);
        }
      });

      // Set quests
      store.setQuests(farmData.quests);

      // Check quest reset
      await FarmPersistenceService.checkQuestReset(farmData.player.id);

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
