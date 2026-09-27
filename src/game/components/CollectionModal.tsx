import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookMarked, Lock } from "lucide-react";
import { CROPS } from "../config/crops";
import { useGameStore } from "../stores/gameStore";

interface CollectionModalProps {
  open: boolean;
  onClose: () => void;
}

export const CollectionModal = ({ open, onClose }: CollectionModalProps) => {
  const { player, inventory } = useGameStore();

  // Determine discovered crops (those with inventory count > 0 or previously harvested)
  const discoveredCropIds = new Set(Object.keys(inventory));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <BookMarked className="w-6 h-6" />
            Bộ sưu tập cây trồng
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {Object.values(CROPS).map((crop) => {
              const discovered = discoveredCropIds.has(crop.id);
              const locked = crop.unlockedAtLevel > player.level;

              return (
                <div
                  key={crop.id}
                  className={`
                    border rounded-lg p-3 flex flex-col items-center gap-2 transition-all hover:shadow-md
                    ${discovered ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-300 hover:scale-105" : "bg-gray-50 border-gray-200"}
                    ${locked ? "opacity-50" : ""}
                  `}
                >
                  {discovered ? (
                    <>
                      <div className="text-3xl">{crop.name}</div>
                      <div className="text-xs text-center font-medium text-gray-700">
                        {crop.name}
                      </div>
                    </>
                  ) : (
                    <>
                      <Lock className="w-8 h-8 text-gray-400" />
                      <div className="text-xs text-center text-gray-500">???</div>
                    </>
                  )}

                  {locked && (
                    <div className="text-xs text-orange-600 font-semibold">
                      🔒 Cấp {crop.unlockedAtLevel}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg">
            <p className="text-sm text-purple-900">
              📊 Đã khám phá: <strong>{discoveredCropIds.size}</strong> /{" "}
              {Object.values(CROPS).length} loại cây
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
