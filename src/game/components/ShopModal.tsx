import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGameStore } from "../stores/gameStore";
import { CROPS } from "../config/crops";
import { EconomyService } from "../services/economyService";
import { Coins } from "lucide-react";
import { toast } from "sonner";

interface ShopModalProps {
  open: boolean;
  onClose: () => void;
}

export const ShopModal = ({ open, onClose }: ShopModalProps) => {
  const { player } = useGameStore();

  const handleBuySeed = (cropId: string) => {
    const result = EconomyService.buySeed(cropId);

    if (result.success) {
      toast.success("Đã mua hạt giống!");
    } else {
      toast.error(result.error || "Không thể mua");
    }
  };

  const availableCrops = Object.values(CROPS).filter(
    (crop) => crop.unlockedAtLevel <= player.level,
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">🏪 Cửa hàng hạt giống</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
          {availableCrops.map((crop) => {
            const canAfford = player.coins >= crop.seedCost;

            return (
              <div
                key={crop.id}
                className="border rounded-lg p-3 flex flex-col gap-2 bg-gradient-to-br from-white to-gray-50 hover:shadow-md transition-all hover:scale-105"
              >
                <div className="text-3xl text-center">{crop.name}</div>
                <div className="text-sm text-center text-gray-600 font-medium">{crop.name}</div>
                <div className="flex items-center justify-center gap-1 text-sm text-yellow-700">
                  <Coins className="w-4 h-4" />
                  <span className="font-semibold">{crop.seedCost}</span>
                </div>
                <div className="text-xs text-center text-gray-500">
                  ⏱️ {crop.growTime}s • 🌟 {crop.expReward} XP
                </div>
                <Button
                  size="sm"
                  disabled={!canAfford}
                  onClick={() => handleBuySeed(crop.id)}
                  className="w-full transition-all hover:scale-105 active:scale-95"
                >
                  {canAfford ? "Mua" : "Không đủ xu"}
                </Button>
              </div>
            );
          })}
        </div>

        {availableCrops.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>Chưa có hạt giống nào khả dụng</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
