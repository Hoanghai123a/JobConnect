import { useState } from "react";
import { ShoppingBag, Package, ListTodo, BookMarked, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GameBottomNavProps {
  onShopClick: () => void;
  onInventoryClick: () => void;
  onQuestsClick: () => void;
  onCollectionClick: () => void;
  onSellClick: () => void;
}

export const GameBottomNav = ({
  onShopClick,
  onInventoryClick,
  onQuestsClick,
  onCollectionClick,
  onSellClick,
}: GameBottomNavProps) => {
  const [active, setActive] = useState<string | null>(null);

  const handleClick = (key: string, callback: () => void) => {
    setActive(key);
    callback();
  };

  const navItems = [
    { key: "shop", icon: ShoppingBag, label: "Cửa hàng", onClick: onShopClick },
    { key: "sell", icon: Coins, label: "Bán", onClick: onSellClick },
    { key: "inventory", icon: Package, label: "Kho đồ", onClick: onInventoryClick },
    { key: "quests", icon: ListTodo, label: "Nhiệm vụ", onClick: onQuestsClick },
    { key: "collection", icon: BookMarked, label: "Bộ sưu tập", onClick: onCollectionClick },
  ];

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/40 to-transparent p-3">
      <div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-2">
        <div className="grid grid-cols-5 gap-1">
          {navItems.map(({ key, icon: Icon, label, onClick }) => (
            <Button
              key={key}
              variant={active === key ? "default" : "ghost"}
              className="flex flex-col items-center gap-1 h-auto py-2 transition-all hover:scale-105 active:scale-95 touch-manipulation"
              onClick={() => handleClick(key, onClick)}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs">{label}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};
