/**
 * StorageModal - Phase 9
 * Kho chứa nông sản - Bán nông sản lấy coin
 */

import Phaser from "phaser";
import { GAME_CONFIG } from "../config/game";
import type { CropType } from "../types";
import { blockInputBelow } from "../utils/blockInputBelow";
import type { FarmScene } from "./FarmScene";
import { audioManager } from "../utils/audioManager";

export class StorageModal extends Phaser.Scene {
  private overlay!: Phaser.GameObjects.Graphics;
  private modalContainer!: Phaser.GameObjects.Container;
  private storageItems: Map<CropType, Phaser.GameObjects.Text> = new Map();

  constructor() {
    super({ key: "StorageModal" });
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
    const modalHeight = 450;
    const modalX = width / 2;
    const modalY = height / 2;

    this.modalContainer = this.add.container(modalX, modalY);
    this.modalContainer.setDepth(2001);

    // Modal background
    const modalBg = this.add.graphics();
    modalBg.fillStyle(0x263238, 1);
    modalBg.fillRoundedRect(-modalWidth / 2, -modalHeight / 2, modalWidth, modalHeight, 16);
    modalBg.lineStyle(4, 0xff9800, 1);
    modalBg.strokeRoundedRect(-modalWidth / 2, -modalHeight / 2, modalWidth, modalHeight, 16);

    // Title
    const title = this.add.text(0, -modalHeight / 2 + 30, "📦 Kho - Bán Nông Sản", {
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
    closeBtn.on("pointerdown", () => this.closeStorage());
    closeBtn.on("pointerover", () => closeBtn.setColor("#ff4444"));
    closeBtn.on("pointerout", () => closeBtn.setColor("#ffffff"));

    this.modalContainer.add([modalBg, title, closeBtn]);

    // Storage capacity info
    const farmScene = this.scene.get("FarmScene") as any;
    const total =
      farmScene.gameState.storage.carrot +
      farmScene.gameState.storage.wheat +
      farmScene.gameState.storage.tomato;
    const capacityText = this.add.text(
      0,
      -modalHeight / 2 + 70,
      `Sức chứa: ${total} / ${farmScene.gameState.storageCapacity}`,
      {
        fontSize: "14px",
        fontFamily: "Arial, sans-serif",
        color: total >= farmScene.gameState.storageCapacity ? "#ff4444" : "#aaaaaa",
      },
    );
    capacityText.setOrigin(0.5, 0.5);
    this.modalContainer.add(capacityText);

    // Storage items
    this.createStorageItems();

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

  private createStorageItems() {
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

    const farmScene = this.scene.get("FarmScene") as any;
    if (!farmScene || !farmScene.gameState) return;

    const startY = -30;
    const itemHeight = 110;

    crops.forEach((crop, index) => {
      const config = GAME_CONFIG.crops[crop];
      const quantity = farmScene.gameState.storage[crop];
      const y = startY + index * itemHeight;

      // Item container
      const itemBg = this.add.graphics();
      itemBg.fillStyle(0x37474f, 1);
      itemBg.fillRoundedRect(-200, y - 40, 400, 90, 8);

      // Crop icon
      const cropIcon = this.add.graphics();
      cropIcon.fillStyle(cropColors[crop], 1);
      cropIcon.fillCircle(-160, y, 20);

      // Name
      const nameText = this.add.text(-120, y - 25, cropNames[crop], {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      });

      // Quantity
      const qtyText = this.add.text(-120, y, `Số lượng: ${quantity}`, {
        fontSize: "14px",
        fontFamily: "Arial, sans-serif",
        color: "#aaaaaa",
      });
      this.storageItems.set(crop, qtyText);

      // Sell price
      const priceText = this.add.text(-120, y + 20, `Giá bán: ${config.harvestCoins}💰 / cái`, {
        fontSize: "12px",
        fontFamily: "Arial, sans-serif",
        color: "#ffd700",
      });

      // Sell button (x1)
      const sellBtn1 = this.createSellButton(crop, 1, 60, y);

      // Sell all button
      const sellAllBtn = this.createSellButton(crop, quantity, 160, y, "Bán hết");

      this.modalContainer.add([
        itemBg,
        cropIcon,
        nameText,
        qtyText,
        priceText,
        sellBtn1,
        sellAllBtn,
      ]);
    });
  }

  private createSellButton(
    cropType: CropType,
    quantity: number,
    xOffset: number,
    y: number,
    label?: string,
  ): Phaser.GameObjects.Container {
    const farmScene = this.scene.get("FarmScene") as FarmScene;
    const available = farmScene.gameState.storage[cropType];

    const btnWidth = 80;
    const btnHeight = 40;
    const btnX = xOffset + btnWidth / 2; // Tâm nút
    const btnY = y;

    if (available <= 0 && !label) {
      // No items, show disabled button
      const disabledBg = this.add.rectangle(btnX, btnY, btnWidth, btnHeight, 0x555555, 0.5);

      const disabledText = this.add
        .text(btnX, btnY, "Hết", {
          fontSize: "12px",
          color: "#888888",
          fontFamily: "Arial, sans-serif",
        })
        .setOrigin(0.5, 0.5);

      return this.add.container(0, 0, [disabledBg, disabledText]);
    }

    // CHUẨN HÓA: Dùng Rectangle với interactive trực tiếp
    const btnBg = this.add
      .rectangle(btnX, btnY, btnWidth, btnHeight, 0xff9800)
      .setStrokeStyle(2, 0xf57c00)
      .setInteractive({ useHandCursor: true });

    const btnText = this.add
      .text(btnX, btnY, label || "Bán x1", {
        fontSize: "12px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5);

    // Event handlers trực tiếp trên btnBg
    btnBg.on("pointerdown", () => {
      console.log(`👉 ĐÃ CLICK NÚT BÁN: ${cropType} x${Math.min(quantity, available)}`);

      // Phase 13: Get button world position for coin fly animation
      const worldPos = btnBg.getWorldTransformMatrix();
      const btnScreenX = worldPos.tx;
      const btnScreenY = worldPos.ty;

      this.sellCrop(cropType, Math.min(quantity, available), btnScreenX, btnScreenY);
    });

    btnBg.on("pointerover", () => {
      btnBg.setFillStyle(0xffa726);
    });

    btnBg.on("pointerout", () => {
      btnBg.setFillStyle(0xff9800);
    });

    return this.add.container(0, 0, [btnBg, btnText]);
  }

  private sellCrop(cropType: CropType, quantity: number, btnX?: number, btnY?: number) {
    const farmScene = this.scene.get("FarmScene") as FarmScene;
    if (!farmScene || !farmScene.gameState) {
      console.error("❌ FarmScene not found or gameState missing!");
      return;
    }

    const available = farmScene.gameState.storage[cropType];
    if (available <= 0) {
      console.log(`❌ Không có ${cropType} để bán! Storage: ${available}`);
      return;
    }

    const actualQty = Math.min(quantity, available);
    const config = GAME_CONFIG.crops[cropType];
    const totalCoins = config.harvestCoins * actualQty;

    console.log(
      `💰 Bán ${actualQty} ${cropType}: Storage ${available} → ${available - actualQty}, Coins ${farmScene.gameState.coins} → ${farmScene.gameState.coins + totalCoins}`,
    );

    // Phase 14: Play coin sound
    audioManager.play("coin");

    // Phase 13: Coin fly animation BEFORE selling
    if (btnX !== undefined && btnY !== undefined) {
      (farmScene as any).createCoinFlyAnimation(btnX, btnY, totalCoins);
    }

    // Gọi public API sellCrop()
    const success = farmScene.sellCrop(cropType, actualQty);

    if (!success) {
      console.error("❌ Bán thất bại!");
      return;
    }

    console.log(`✅ Bán thành công! Storage hiện tại: ${farmScene.gameState.storage[cropType]}`);

    // FIX: Không rebuild toàn bộ modal, chỉ update text
    const qtyText = this.storageItems.get(cropType);
    if (qtyText) {
      qtyText.setText(`Số lượng: ${farmScene.gameState.storage[cropType]}`);
    }

    // Nếu hết hàng, rebuild để disable button
    if (farmScene.gameState.storage[cropType] === 0) {
      this.modalContainer.removeAll(true);
      this.create();
    }
  }

  private closeStorage() {
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
        this.scene.stop("StorageModal");
      },
    });
  }
}
