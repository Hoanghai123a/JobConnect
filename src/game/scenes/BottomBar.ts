/**
 * BottomBar Scene - Phase 4
 * Thanh công cụ dưới: Seed Selector + Mission HUD + Action Buttons
 */

import Phaser from "phaser";
import { GAME_CONFIG } from "../config/game";
import type { CropType } from "../types";

export class BottomBar extends Phaser.Scene {
  private selectedSeed: CropType = "carrot"; // Default seed
  private seedButtons: Map<CropType, Phaser.GameObjects.Container> = new Map();
  private missionText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "BottomBar" });
  }

  create() {
    console.log("🎮 BottomBar scene created!");

    // Enable input for this scene
    this.input.topOnly = false;

    const { width, height } = GAME_CONFIG;

    // Bottom Bar Background
    const barHeight = 100;
    const barY = height - barHeight;

    const bg = this.add.graphics();
    bg.fillStyle(0x1a237e, 1); // Navy blue
    bg.fillRect(0, barY, width, barHeight);
    bg.setDepth(1000); // Đảm bảo luôn hiển thị trên cùng

    // Border top
    bg.lineStyle(2, 0x3949ab, 1);
    bg.beginPath();
    bg.moveTo(0, barY);
    bg.lineTo(width, barY);
    bg.strokePath();

    // === SEED SELECTOR (Center) ===
    this.createSeedSelector(barY);

    // === MISSION HUD (Bottom Left) ===
    this.createMissionHUD(barY);

    // === ACTION BUTTONS (Bottom Right) ===
    this.createActionButtons(barY);

    // Listen to game events
    this.game.events.on("seed-selected", this.onSeedSelected, this);
  }

  /**
   * Tạo Seed Selector - 3 loại cây
   */
  private createSeedSelector(barY: number) {
    const centerX = GAME_CONFIG.width / 2;
    const seedY = barY + 50;
    const seedSpacing = 80;

    const crops: CropType[] = ["carrot", "wheat", "tomato"];
    const cropNames = {
      carrot: "Cà rốt",
      wheat: "Lúa mì",
      tomato: "Cà chua",
    };

    crops.forEach((crop, index) => {
      const x = centerX + (index - 1) * seedSpacing;
      const container = this.add.container(x, seedY);

      // Button background
      const btnBg = this.add.graphics();
      btnBg.fillStyle(0x263238, 1);
      btnBg.fillRoundedRect(-30, -30, 60, 60, 8);

      // Border (active/inactive)
      const border = this.add.graphics();
      const isActive = crop === this.selectedSeed;
      border.lineStyle(3, isActive ? 0x4caf50 : 0x455a64, 1);
      border.strokeRoundedRect(-30, -30, 60, 60, 8);

      // Seed icon placeholder (colored circle)
      const seedColor = this.getCropColor(crop);
      const seedIcon = this.add.graphics();
      seedIcon.fillStyle(seedColor, 1);
      seedIcon.fillCircle(0, -5, 15);

      // Seed name
      const nameText = this.add.text(0, 25, cropNames[crop], {
        fontSize: "12px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      });
      nameText.setOrigin(0.5, 0.5);

      // Cost text
      const config = GAME_CONFIG.crops[crop];
      const costText = this.add.text(0, 40, `${config.seedCost}💰`, {
        fontSize: "10px",
        color: "#ffd700",
        fontFamily: "Arial, sans-serif",
      });
      costText.setOrigin(0.5, 0.5);

      container.add([btnBg, border, seedIcon, nameText, costText]);
      container.setSize(60, 60);
      container.setInteractive();
      container.setDepth(1001); // Depth cao hơn background

      // Click handler
      container.on("pointerdown", () => {
        console.log(`🌱 Seed button clicked: ${crop}`);
        this.selectSeed(crop);
      });

      // Hover effect
      container.on("pointerover", () => {
        btnBg.clear();
        btnBg.fillStyle(0x37474f, 1);
        btnBg.fillRoundedRect(-30, -30, 60, 60, 8);
      });

      container.on("pointerout", () => {
        btnBg.clear();
        btnBg.fillStyle(0x263238, 1);
        btnBg.fillRoundedRect(-30, -30, 60, 60, 8);
      });

      this.seedButtons.set(crop, container);
    });
  }

  /**
   * Tạo Mission HUD (góc trái dưới)
   */
  private createMissionHUD(barY: number) {
    const padding = 20;

    // Mission container
    const missionBg = this.add.graphics();
    missionBg.fillStyle(0x263238, 0.9);
    missionBg.fillRoundedRect(padding, barY + 10, 200, 35, 6);
    missionBg.setDepth(1001);

    // Mission icon (placeholder)
    const icon = this.add.graphics();
    icon.fillStyle(0xffc107, 1);
    icon.fillCircle(padding + 15, barY + 27, 8);
    icon.lineStyle(2, 0xffeb3b, 1);
    icon.strokeCircle(padding + 15, barY + 27, 10);
    icon.setDepth(1002);

    // Mission text
    this.missionText = this.add.text(padding + 35, barY + 27, "Nhiệm vụ: Thu hoạch 10 Cà rốt", {
      fontSize: "11px",
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
    });
    this.missionText.setOrigin(0, 0.5);
    this.missionText.setDepth(1002);
  }

  /**
   * Tạo Action Buttons (góc phải dưới)
   */
  private createActionButtons(barY: number) {
    const { width } = GAME_CONFIG;
    const padding = 20;
    const btnSize = 50;
    const btnSpacing = 10;

    const buttons = [
      { icon: "💼", color: 0x2196f3, label: "Shop" },
      { icon: "📦", color: 0x9c27b0, label: "Storage" },
      { icon: "⚙️", color: 0x607d8b, label: "Settings" },
    ];

    buttons.forEach((btn, index) => {
      const x = width - padding - (buttons.length - index) * (btnSize + btnSpacing);
      const y = barY + 25;

      const container = this.add.container(x, y);

      // Button background
      const bg = this.add.graphics();
      bg.fillStyle(btn.color, 1);
      bg.fillCircle(0, 0, btnSize / 2);

      // Icon text
      const iconText = this.add.text(0, 0, btn.icon, {
        fontSize: "24px",
      });
      iconText.setOrigin(0.5, 0.5);

      container.add([bg, iconText]);
      container.setSize(btnSize, btnSize);
      container.setInteractive();
      container.setDepth(1001);

      // Hover effect
      container.on("pointerover", () => {
        this.tweens.add({
          targets: container,
          scale: 1.1,
          duration: 150,
        });
      });

      container.on("pointerout", () => {
        this.tweens.add({
          targets: container,
          scale: 1,
          duration: 150,
        });
      });

      container.on("pointerdown", () => {
        console.log(`🔘 ${btn.label} button clicked`);
      });
    });
  }

  /**
   * Chọn seed
   */
  private selectSeed(crop: CropType) {
    this.selectedSeed = crop;

    // Update border của tất cả buttons
    this.seedButtons.forEach((container, cropType) => {
      const border = container.getAt(1) as Phaser.GameObjects.Graphics;
      border.clear();
      const isActive = cropType === crop;
      border.lineStyle(3, isActive ? 0x4caf50 : 0x455a64, 1);
      border.strokeRoundedRect(-30, -30, 60, 60, 8);
    });

    // Emit event cho FarmScene
    this.game.events.emit("seed-selected", crop);
    console.log(`🌱 Selected seed: ${crop}`);
  }

  /**
   * Event handler khi seed được chọn từ FarmScene
   */
  private onSeedSelected(crop: CropType) {
    // Chỉ sync UI, không emit event lại (tránh infinite loop)
    this.selectedSeed = crop;

    // Update border của tất cả buttons
    this.seedButtons.forEach((container, cropType) => {
      const border = container.getAt(1) as Phaser.GameObjects.Graphics;
      border.clear();
      const isActive = cropType === crop;
      border.lineStyle(3, isActive ? 0x4caf50 : 0x455a64, 1);
      border.strokeRoundedRect(-30, -30, 60, 60, 8);
    });
  }

  /**
   * Lấy màu đặc trưng của từng loại cây
   */
  private getCropColor(cropType: CropType): number {
    switch (cropType) {
      case "carrot":
        return 0xff6b35; // Orange
      case "wheat":
        return 0xffd700; // Gold
      case "tomato":
        return 0xff4444; // Red
      default:
        return 0x4caf50; // Green
    }
  }

  /**
   * Public: Get selected seed
   */
  getSelectedSeed(): CropType {
    return this.selectedSeed;
  }
}
