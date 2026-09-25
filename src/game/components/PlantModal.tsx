import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGameStore } from "../stores/gameStore";
import { CROPS } from "../config/crops";
import { EconomyService } from "../services/economyService";
import { Coins, Sprout } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface PlantModalProps {
  open: boolean;
  onClose: () => void;
  plotId: number | null;
}

export const PlantModal = ({ open, onClose, plotId }: PlantModalProps) => {
  const { player, plots, inventory } = useGameStore();
  const [processing, setProcessing] = useState(false);

  if (plotId === null) return null;

  const plot = plots.find((p) => p.id === plotId);
  if (!plot) return null;

  const hasCrop = plot.crop !== null;
  const cropReady = plot.crop?.state === "READY";

  const handlePlant = (cropId: string) => {
    setProcessing(true);

    const result = EconomyService.plantCrop(plotId, cropId);

    if (result.success) {
      toast.success("Đã trồng cây!");

      // Trigger particle effect in Phaser scene
      const farmScene = (window as any).phaserGame?.scene?.getScene("FarmScene");
      if (farmScene && typeof farmScene.triggerPlantEffect === "function") {
        farmScene.triggerPlantEffect(plotId);
      }

      setTimeout(() => {
        setProcessing(false);
        onClose();
      }, 300);
    } else {
      toast.error(result.error || "Không thể trồng");
      setProcessing(false);
    }
  };

  const handleHarvest = () => {
    setProcessing(true);

    const result = EconomyService.harvestCrop(plotId);

    if (result.success && result.rewards) {
      toast.success(`Thu hoạch! +${result.rewards.coins} xu, +${result.rewards.exp} XP`);

      // Trigger particle effect in Phaser scene
      const farmScene = (window as any).phaserGame?.scene?.getScene("FarmScene");
      if (farmScene && typeof farmScene.triggerHarvestEffect === "function") {
        farmScene.triggerHarvestEffect(plotId, result.rewards.coins);
      }

      setTimeout(() => {
        setProcessing(false);
        onClose();
      }, 300);
    } else {
      toast.error(result.error || "Không thể thu hoạch");
      setProcessing(false);
    }
  };

  const availableSeeds = Object.values(CROPS).filter(
    (crop) => crop.unlockedAtLevel <= player.level && (inventory[crop.id] || 0) > 0,
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {hasCrop ? (cropReady ? "🌾 Thu hoạch" : "🌱 Đang lớn") : "🌱 Trồng cây"}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {/* Plot info */}
          <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg mb-4">
            <p className="text-sm text-gray-700">
              <strong>Ô đất #{plotId}</strong>
            </p>
            {hasCrop && plot.crop && (
              <div className="mt-2">
                <p className="text-sm text-gray-600">
                  Trạng thái:{" "}
                  <span className="font-semibold">
                    {plot.crop.state === "GROWING" ? "Đang lớn" : "Sẵn sàng thu hoạch"}
                  </span>
                </p>
                {plot.crop.state === "GROWING" && (
                  <p className="text-xs text-gray-500 mt-1">
                    Thời gian còn lại: {Math.ceil((plot.crop.harvestAt - Date.now()) / 1000)}s
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Harvest action */}
          {hasCrop && cropReady && (
            <div className="space-y-3">
              <Button
                onClick={handleHarvest}
                disabled={processing}
                className="w-full h-auto py-4 transition-all hover:scale-105 active:scale-95"
                size="lg"
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-lg font-semibold">Thu hoạch ngay</span>
                  <span className="text-sm opacity-90">Nhận xu và kinh nghiệm</span>
                </div>
              </Button>
            </div>
          )}

          {/* Plant action */}
          {!hasCrop && (
            <div>
              {availableSeeds.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {availableSeeds.map((crop) => (
                    <div
                      key={crop.id}
                      className="border rounded-lg p-3 flex flex-col gap-2 bg-gradient-to-br from-white to-gray-50 hover:shadow-md transition-all hover:scale-105"
                    >
                      <div className="text-3xl text-center">{crop.name}</div>
                      <div className="text-sm text-center text-gray-600 font-medium">
                        {crop.name}
                      </div>
                      <div className="text-xs text-center text-gray-500">
                        ⏱️ {crop.growTime}s • 🌟 {crop.expReward} XP
                      </div>
                      <div className="text-xs text-center text-gray-500">
                        Có: {inventory[crop.id] || 0} hạt
                      </div>
                      <Button
                        size="sm"
                        disabled={processing}
                        onClick={() => handlePlant(crop.id)}
                        className="w-full transition-all hover:scale-105 active:scale-95"
                      >
                        <Sprout className="w-4 h-4 mr-1" />
                        Trồng
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Sprout className="w-16 h-16 mx-auto mb-3 text-gray-300" />
                  <p>Không có hạt giống</p>
                  <p className="text-sm mt-1">Hãy mua hạt giống từ cửa hàng!</p>
                  <Button onClick={onClose} className="mt-4">
                    Đến cửa hàng
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Growing state - just info */}
          {hasCrop && !cropReady && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-5xl mb-3">🌱</div>
              <p>Cây đang lớn...</p>
              <p className="text-sm mt-1">Hãy quay lại sau!</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
