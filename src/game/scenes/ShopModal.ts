/**
 * ShopModal - Phase 9
 * Cửa hàng mua hạt giống
 */

import Phaser from "phaser";
import { GAME_CONFIG } from "../config/game";
import type { CropType } from "../types";
import { blockInputBelow } from "../utils/blockInputBelow";
import type { FarmScene } from "./FarmScene";

export class ShopModal extends Phaser.Scene {
  private overlay!: Phaser.GameObjects.Graphics;
  private modalContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: "ShopModal" });
  }

  create() {
    const { width, height } = GAME_CONFIG;

    // Overlay tối làm mờ background
    this.overlay = this.add.graphics();
    this.overlay.fillStyle(0x000000, 0.7);
    this.overlay.fillRect(0, 0, width, height);
    this.overlay.setDepth(2000);
    this.overlay.setInteractive();

    // Block input xuống scene bên dưới
    blockInputBelow(this, 0, 0, width, height);

    // Modal container
    const modalWidth = 500;
    const modalHeight = 400;
    const modalX = width / 2;
    const modalY = height / 2;

    this.modalContainer = this.add.container(modalX, modalY);
    this.modalContainer.setDepth(2001);

    // Modal background
    const modalBg = this.add.graphics();
    modalBg.fillStyle(0x263238, 1);
    modalBg.fillRoundedRect(-modalWidth / 2, -modalHeight / 2, modalWidth, modalHeight, 16);
    modalBg.lineStyle(4, 0x4caf50, 1);
    modalBg.strokeRoundedRect(-modalWidth / 2, -modalHeight / 2, modalWidth, modalHeight, 16);

    // Title
    const title = this.add.text(0, -modalHeight / 2 + 30, "🛒 Shop - Mua Hạt Giống", {
      fontSize: "24px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      fontStyle: "bold",
    });
    title.setOrigin(0.5, 0.5);

    // Close button (X)
    const closeBtn = this.add.text(modalWidth / 2 - 30, -modalHeight / 2 + 30, "✕", {
      fontSize: "32px",
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
    });
    closeBtn.setOrigin(0.5, 0.5);
    closeBtn.setInteractive({ useHandCursor: true });
    closeBtn.on("pointerdown", () => this.closeShop());
    closeBtn.on("pointerover", () => closeBtn.setColor("#ff4444"));
    closeBtn.on("pointerout", () => closeBtn.setColor("#ffffff"));

    this.modalContainer.add([modalBg, title, closeBtn]);

    // Seed items
    this.createSeedItems();

    // Fade in animation
    this.overlay.setAlpha(0);
    this.modalContainer.setScale(0.8);
    this.tweens.add({
      targets: this.overlay,
      alpha: 0.7,
      duration: 200,
    });
    this.tweens.add({
      targets: this.modalContainer,
      scale: 1,
      duration: 200,
      ease: "Back.easeOut",
    });
  }

  private createSeedItems() {
    const farmScene = this.scene.get("FarmScene") as FarmScene;
    const playerLevel = farmScene.gameState.level;

    const crops: CropType[] = ["carrot", "wheat", "tomato"];
    const cropNames = {
      carrot: "Cà rốt",
      wheat: "Lúa mì",
      tomato: "Cà chua",
    };
    const cropColors = {
      carrot: 0xff6b35,
      wheat: 0xffd700,
      tomato: 0xff4444,
    };

    const startY = -80;
    const itemHeight = 100;

    crops.forEach((crop, index) => {
      const config = GAME_CONFIG.crops[crop];
      const y = startY + index * itemHeight;
      const isLocked = playerLevel < config.requiredLevel;

      // Item container
      const itemBg = this.add.graphics();
      itemBg.fillStyle(isLocked ? 0x263238 : 0x37474f, 1); // Tối hơn khi bị khóa
      itemBg.fillRoundedRect(-200, y - 35, 400, 80, 8);

      // Phase 11: Lock overlay nếu chưa đủ level
      if (isLocked) {
        const lockOverlay = this.add.graphics();
        lockOverlay.fillStyle(0x000000, 0.5); // Phủ đen mờ
        lockOverlay.fillRoundedRect(-200, y - 35, 400, 80, 8);

        // Lock icon text
        const lockText = this.add.text(0, y, `🔒 Mở ở Cấp ${config.requiredLevel}`, {
          fontSize: "16px",
          fontFamily: "Arial, sans-serif",
          color: "#ff9800",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 3,
        });
        lockText.setOrigin(0.5, 0.5);

        this.modalContainer.add([itemBg, lockOverlay, lockText]);
        return; // Không render nội dung chi tiết
      }

      // Seed icon
      const seedIcon = this.add.graphics();
      seedIcon.fillStyle(cropColors[crop], 1);
      seedIcon.fillCircle(-160, y, 20);

      // Name
      const nameText = this.add.text(-120, y - 20, cropNames[crop], {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      });

      // Price
      const priceText = this.add.text(-120, y + 5, `Giá: ${config.seedCost}💰 / hạt`, {
        fontSize: "14px",
        fontFamily: "Arial, sans-serif",
        color: "#ffd700",
      });

      // Buy button (x5 seeds) - CHUẨN HÓA: Dùng Rectangle với interactive trực tiếp
      const btnX = 130; // Tâm nút
      const btnY = y;
      const btnWidth = 100;
      const btnHeight = 50;

      const btnBg = this.add
        .rectangle(btnX, btnY, btnWidth, btnHeight, 0x4caf50)
        .setStrokeStyle(2, 0x388e3c)
        .setInteractive({ useHandCursor: true });

      const btnText = this.add
        .text(btnX, btnY, `Mua x5\n${config.seedCost * 5}💰`, {
          fontSize: "14px",
          fontFamily: "Arial, sans-serif",
          color: "#ffffff",
          fontStyle: "bold",
          align: "center",
        })
        .setOrigin(0.5, 0.5);

      // Event handlers trực tiếp trên btnBg
      btnBg.on("pointerdown", () => {
        console.log(`👉 ĐÃ CLICK NÚT MUA: ${crop}`);
        this.buySeed(crop, 5);
      });

      btnBg.on("pointerover", () => {
        btnBg.setFillStyle(0x66bb6a);
      });

      btnBg.on("pointerout", () => {
        btnBg.setFillStyle(0x4caf50);
      });

      this.modalContainer.add([itemBg, seedIcon, nameText, priceText, btnBg, btnText]);
    });
  }

  private buySeed(cropType: CropType, quantity: number) {
    const config = GAME_CONFIG.crops[cropType];
    const totalCost = config.seedCost * quantity;

    // Lấy FarmScene với proper typing
    const farmScene = this.scene.get("FarmScene") as FarmScene;
    if (!farmScene || !farmScene.gameState) {
      console.error("❌ FarmScene not found or gameState missing!");
      return;
    }

    // Gọi public API buySeed()
    const success = farmScene.buySeed(cropType, quantity);

    if (!success) {
      console.log(`❌ Không đủ xu! Cần ${totalCost}💰, còn ${farmScene.gameState.coins}💰`);
      return;
    }

    console.log(
      `✅ Mua ${quantity} hạt ${cropType}. Trừ ${totalCost}💰, Seeds: ${farmScene.gameState.seeds[cropType]}`,
    );

    // Feedback animation
    this.tweens.add({
      targets: this.modalContainer,
      scale: { from: 1, to: 1.05 },
      duration: 100,
      yoyo: true,
    });
  }

  private closeShop() {
    // Fade out animation
    this.tweens.add({
      targets: this.overlay,
      alpha: 0,
      duration: 150,
    });
    this.tweens.add({
      targets: this.modalContainer,
      scale: 0.8,
      duration: 150,
      ease: "Back.easeIn",
      onComplete: () => {
        this.scene.stop("ShopModal");
      },
    });
  }
}
