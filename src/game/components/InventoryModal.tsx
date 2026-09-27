import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGameStore } from "../stores/gameStore";
import { CROPS } from "../config/crops";
import { Package } from "lucide-react";

interface InventoryModalProps {
  open: boolean;
  onClose: () => void;
}

export const InventoryModal = ({ open, onClose }: InventoryModalProps) => {
  const { inventory } = useGameStore();

  const inventoryItems = Object.entries(inventory)
    .filter(([_, quantity]) => quantity > 0)
    .map(([cropId, quantity]) => {
      const crop = CROPS[cropId];
      return { cropId, quantity, crop };
    });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Package className="w-6 h-6" />
            Kho đồ
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {inventoryItems.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {inventoryItems.map(({ cropId, quantity, crop }) => (
                <div
                  key={cropId}
                  className="border rounded-lg p-3 flex flex-col items-center gap-2 bg-gradient-to-br from-white to-gray-50"
                >
                  <div className="text-3xl">{crop?.name || "❓"}</div>
                  <div className="text-sm font-medium text-gray-700">{crop?.name || cropId}</div>
                  <div className="text-xs text-gray-500">Số lượng: {quantity}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-16 h-16 mx-auto mb-3 text-gray-300" />
              <p>Kho đồ trống</p>
              <p className="text-sm mt-1">Hãy mua hạt giống và trồng cây!</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
