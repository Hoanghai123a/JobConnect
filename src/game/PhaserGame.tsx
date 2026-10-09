/**
 * PhaserGame Component
 * React wrapper cho Phaser game canvas (FarmScene + UIOverlay + BottomBar)
 */

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { FarmScene } from "./scenes/FarmScene";
import { UIOverlay } from "./scenes/UIOverlay";
import { BottomBar } from "./scenes/BottomBar";
import { ShopModal } from "./scenes/ShopModal";
import { StorageModal } from "./scenes/StorageModal";
import { QuestModal } from "./scenes/QuestModal";
import { GAME_CONFIG } from "./config/game";

export const PhaserGame = () => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host || gameRef.current) return;

    // Mỗi instance có div mount riêng, gỡ ngay khi unmount. game.destroy() xóa canvas
    // trễ 1 frame → nếu dùng chung parent, canvas cũ (React StrictMode mount 2 lần) đẩy
    // canvas mới lệch xuống lúc Phaser đo bounds → tọa độ click sai.
    const mount = document.createElement("div");
    mount.style.width = "100%";
    mount.style.height = "100%";
    host.appendChild(mount);

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      backgroundColor: GAME_CONFIG.backgroundColor,
      parent: mount,
      scene: [FarmScene, UIOverlay, BottomBar, ShopModal, StorageModal, QuestModal],
      // FIT: giữ tỷ lệ 900x550, co giãn vừa khít container và tự cập nhật khi resize/xoay máy.
      // Phaser tự quy đổi tọa độ chuột/chạm theo tỷ lệ scale nên hitArea không bị lệch.
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_CONFIG.width,
        height: GAME_CONFIG.height,
      },
      physics: {
        default: "arcade",
        arcade: {
          gravity: { y: 0, x: 0 },
          debug: false,
        },
      },
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Mặc định Phaser dừng ở scene trên cùng có "tương tác" - kể cả sự kiện pointerout
    // của nút hạt giống. Trên cảm ứng (không có hover) chạm nút hạt rồi chạm ô đất
    // thì cú chạm thứ 2 bị BottomBar nuốt. Tắt đi; các thanh UI tự chặn bằng
    // stopPropagation (xem blockInputBelow).
    game.input.globalTopOnly = false;

    // Phaser chỉ tự đo lại bounds khi kích thước parent đổi. Nếu layout chỉ dịch vị trí
    // (thanh địa chỉ mobile, banner trên trang...) bounds cũ làm lệch tọa độ click
    // → đo lại ngay trước khi Phaser xử lý mỗi lần chạm/nhấn (capture phase chạy trước).
    const refreshBounds = () => game.scale.updateBounds();
    host.addEventListener("pointerdown", refreshBounds, true);
    host.addEventListener("touchstart", refreshBounds, { capture: true, passive: true });

    // Expose game object để debug trên dev
    if (import.meta.env.DEV) {
      (window as unknown as { game?: Phaser.Game }).game = game;
    }

    return () => {
      host.removeEventListener("pointerdown", refreshBounds, true);
      host.removeEventListener("touchstart", refreshBounds, true);
      game.destroy(true);
      mount.remove();
      gameRef.current = null;
    };
  }, []);

  // Fixed full-width để thoát khỏi giới hạn 30rem của .app-shell (cần cho màn ngang),
  // chừa chỗ cho BottomNav cố định phía dưới
  return (
    <div
      className="fixed inset-x-0 top-0 bg-gradient-to-b from-sky-400 to-green-400"
      style={{ bottom: "calc(var(--mobile-nav-h) + env(safe-area-inset-bottom))" }}
    >
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
    </div>
  );
};
