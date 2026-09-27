import { useEffect, useRef, useState, useCallback } from "react";
import Phaser from "phaser";
import { FarmScene } from "./scenes/FarmScene";
import { GAME_CONFIG } from "./config/game";
import { GameHUD } from "./components/GameHUD";
import { GameBottomNav } from "./components/GameBottomNav";
import { ShopModal } from "./components/ShopModal";
import { SellModal } from "./components/SellModal";
import { InventoryModal } from "./components/InventoryModal";
import { QuestsModal } from "./components/QuestsModal";
import { CollectionModal } from "./components/CollectionModal";
import { PlantModal } from "./components/PlantModal";

export const PhaserGame = () => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<FarmScene | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [shopOpen, setShopOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [plantModalOpen, setPlantModalOpen] = useState(false);
  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null);

  const handlePlotSelected = useCallback((plotId: number) => {
    setSelectedPlotId(plotId);
    setPlantModalOpen(true);
  }, []);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: GAME_CONFIG.width,
      height: GAME_CONFIG.height,
      backgroundColor: GAME_CONFIG.backgroundColor,
      parent: containerRef.current,
      scene: [FarmScene],
      physics: {
        default: "arcade",
        arcade: {
          gravity: { y: 0, x: 0 },
          debug: false,
        },
      },
    };

    gameRef.current = new Phaser.Game(config);

    // Get scene reference
    gameRef.current.events.once("ready", () => {
      sceneRef.current = gameRef.current?.scene.getScene("FarmScene") as FarmScene;

      // Listen to plot selection events
      sceneRef.current?.events.on("plot-selected", handlePlotSelected);
    });

    return () => {
      if (sceneRef.current) {
        sceneRef.current.events.off("plot-selected", handlePlotSelected);
      }
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      }
    };
  }, [handlePlotSelected]);

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-sky-400 to-green-400">
      {/* HUD */}
      <GameHUD />

      {/* Phaser Game Canvas */}
      <div className="flex-1 flex items-center justify-center w-full">
        <div
          ref={containerRef}
          className="rounded-lg shadow-2xl overflow-hidden border-4 border-white"
        />
      </div>

      {/* Bottom Navigation */}
      <GameBottomNav
        onShopClick={() => setShopOpen(true)}
        onSellClick={() => setSellOpen(true)}
        onInventoryClick={() => setInventoryOpen(true)}
        onQuestsClick={() => setQuestsOpen(true)}
        onCollectionClick={() => setCollectionOpen(true)}
      />

      {/* Modals */}
      <ShopModal open={shopOpen} onClose={() => setShopOpen(false)} />
      <SellModal open={sellOpen} onClose={() => setSellOpen(false)} />
      <InventoryModal open={inventoryOpen} onClose={() => setInventoryOpen(false)} />
      <QuestsModal open={questsOpen} onClose={() => setQuestsOpen(false)} />
      <CollectionModal open={collectionOpen} onClose={() => setCollectionOpen(false)} />
      <PlantModal
        open={plantModalOpen}
        onClose={() => {
          setPlantModalOpen(false);
          setSelectedPlotId(null);
        }}
        plotId={selectedPlotId}
      />
    </div>
  );
};
