import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGameStore } from "../stores/gameStore";
import { CROPS } from "../config/crops";
import { EconomyService } from "../services/economyService";
import { Coins, Package } from "lucide-react";
import { toast } from "sonner";

interface SellModalProps {
  open: boolean;
  onClose: () => void;
}

export const SellModal = ({ open, onClose }: SellModalProps) => {
  const { inventory } = useGameStore();

  const handleSell = (cropId: string, quantity: number) => {
    const result = EconomyService.sellCrop(cropId, quantity);

    if (result.success && result.earned) {
      toast.success(`Đã bán! +${result.earned} xu`);
    } else {
      toast.error(result.error || "Không thể bán");
    }
  };

  const cropsInInventory = Object.values(CROPS).filter((crop) => (inventory[crop.id] || 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Package className="w-6 h-6" />
            Bán cây thu hoạch
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {cropsInInventory.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {cropsInInventory.map((crop) => {
                const quantity = inventory[crop.id] || 0;
                const totalValue = crop.sellPrice * quantity;

                return (
                  <div
                    key={crop.id}
                    className="border rounded-lg p-3 flex flex-col gap-2 bg-gradient-to-br from-white to-gray-50 hover:shadow-md transition-all hover:scale-105"
                  >
                    <div className="text-3xl text-center">{crop.name}</div>
                    <div className="text-sm text-center text-gray-600 font-medium">{crop.name}</div>
                    <div className="text-xs text-center text-gray-500">Trong kho: {quantity}</div>
                    <div className="flex items-center justify-center gap-1 text-sm text-yellow-700">
                      <Coins className="w-4 h-4" />
                      <span className="font-semibold">{crop.sellPrice} xu/cây</span>
                    </div>
                    <div className="text-xs text-center text-green-600 font-medium">
                      Tổng: {totalValue} xu
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSell(crop.id, 1)}
                        disabled={quantity < 1}
                        className="flex-1 transition-all hover:scale-105 active:scale-95"
                      >
                        Bán 1
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSell(crop.id, quantity)}
                        disabled={quantity < 1}
                        className="flex-1 transition-all hover:scale-105 active:scale-95"
                      >
                        Bán hết
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-16 h-16 mx-auto mb-3 text-gray-300" />
              <p>Không có cây thu hoạch</p>
              <p className="text-sm mt-1">Hãy thu hoạch cây trồng để bán!</p>
              <Button onClick={onClose} className="mt-4">
                Đóng
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
