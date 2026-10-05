/**
 * PhaserGame Component - Phase 2
 * React wrapper cho Phaser game canvas + UIOverlay
 */

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { FarmScene } from "./scenes/FarmScene";
import { UIOverlay } from "./scenes/UIOverlay";
import { BottomBar } from "./scenes/BottomBar";
import { GAME_CONFIG } from "./config/game";

export const PhaserGame = () => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: GAME_CONFIG.width,
      height: GAME_CONFIG.height,
      backgroundColor: GAME_CONFIG.backgroundColor,
      parent: containerRef.current,
      scene: [FarmScene, UIOverlay, BottomBar], // Thêm BottomBar scene
      scale: {
        mode: Phaser.Scale.NONE, // Không scale, để canvas exact size match container
        autoCenter: Phaser.Scale.NO_CENTER,
      },
      input: {
        // Fix pointer coordinates khi canvas được scale
        activePointers: 3,
        smoothFactor: 0,
      },
      physics: {
        default: "arcade",
        arcade: {
          gravity: { y: 0, x: 0 },
          debug: false,
        },
      },
    };

    gameRef.current = new Phaser.Game(config);

    // Expose game object for debugging
    (window as any).game = gameRef.current;

    // Cleanup
    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-sky-400 to-green-400">
      {/* Phaser Game Canvas */}
      <div className="flex-1 flex items-center justify-center w-full px-1 py-1">
        <div
          ref={containerRef}
          className="rounded-lg shadow-2xl overflow-hidden border-2 border-white max-w-full max-h-full"
          style={{
            width: '900px',
            height: '550px',
            aspectRatio: '900 / 550',
            maxWidth: 'calc(100vw - 8px)',
            maxHeight: 'calc(100vh - 140px)',
          }}
        />
      </div>
    </div>
  );
};
