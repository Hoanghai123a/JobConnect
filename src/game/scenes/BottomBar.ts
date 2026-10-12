/**
 * BottomBar Scene - Phase 4
 * Thanh công cụ dưới: Seed Selector + Mission HUD + Action Buttons
 */

import Phaser from "phaser";
import { GAME_CONFIG } from "../config/game";
import type { CropType, QuestProgress } from "../types";
import { blockInputBelow } from "../utils/blockInputBelow";
import { getQuestConfig } from "../utils/questManager";
import { audioManager } from "../utils/audioManager";

export class BottomBar extends Phaser.Scene {
  private selectedSeed: CropType = "carrot"; // Default seed
  private seedButtons: Map<CropType, Phaser.GameObjects.Container> = new Map();
  private seedBadges: Map<CropType, Phaser.GameObjects.Text> = new Map(); // Phase 9: Seed quantity badges
  private missionText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "BottomBar" });
  }

  create() {
    const { width, height } = GAME_CONFIG;

    // Bottom Bar Background
    const barHeight = 100;
    const barY = height - barHeight;

    // Chạm vào thanh (kể cả khoảng trống) không lọt xuống ô đất phía dưới
    blockInputBelow(this, 0, barY, width, barHeight);

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

    // Listen to quest updates
    this.game.events.on("questUpdate", this.updateMissionHUD, this);

    // Phase 9: Listen to gameState updates để cập nhật seed badges
    this.game.events.on("gameStateUpdate", this.updateSeedBadges, this);

    // === ACTION BUTTONS (Bottom Right) ===
    this.createActionButtons(barY);

    // Cleanup listeners on shutdown
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("questUpdate", this.updateMissionHUD, this);
      this.game.events.off("gameStateUpdate", this.updateSeedBadges, this);
    });
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

      // Phase 9: Seed quantity badge (góc trên phải)
      const badgeBg = this.add.graphics();
      badgeBg.fillStyle(0xff9800, 1);
      badgeBg.fillCircle(20, -20, 12);

      const badgeText = this.add.text(20, -20, "0", {
        fontSize: "11px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      });
      badgeText.setOrigin(0.5, 0.5);
      this.seedBadges.set(crop, badgeText);

      container.add([btnBg, border, seedIcon, nameText, costText, badgeBg, badgeText]);
      container.setSize(60, 60);
      container.setInteractive();
      container.setDepth(1001); // Depth cao hơn background

      // Click handler
      container.on("pointerdown", () => {
        // Phase 14: Play click sound
        audioManager.play("click");

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
    const width = 250;
    const height = 50;

    // Mission container
    const missionBg = this.add.graphics();
    missionBg.fillStyle(0x263238, 0.95);
    missionBg.fillRoundedRect(padding, barY + 10, width, height, 8);
    missionBg.setDepth(1001);

    // Mission icon (placeholder)
    const icon = this.add.graphics();
    icon.fillStyle(0xffc107, 1);
    icon.fillCircle(padding + 15, barY + 25, 8);
    icon.lineStyle(2, 0xffeb3b, 1);
    icon.strokeCircle(padding + 15, barY + 25, 10);
    icon.setDepth(1002);

    // Mission text
    this.missionText = this.add.text(padding + 35, barY + 20, "Nhiệm vụ: Đang tải...", {
      fontSize: "11px",
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
    });
    this.missionText.setOrigin(0, 0);
    this.missionText.setDepth(1002);

    // Progress text (current/target)
    this.progressText = this.add.text(padding + 35, barY + 35, "0 / 0", {
      fontSize: "10px",
      color: "#aaaaaa",
      fontFamily: "Arial, sans-serif",
    });
    this.progressText.setOrigin(0, 0);
    this.progressText.setDepth(1002);

    // Progress bar
    this.progressBar = this.add.graphics();
    this.progressBar.setDepth(1002);
  }

  /**
   * Update Mission HUD khi có thay đổi quest
   */
  private updateMissionHUD(questProgress?: QuestProgress) {
    if (!questProgress) {
      this.missionText.setText("Nhiệm vụ: Không có");
      this.progressText.setText("");
      this.progressBar.clear();
      return;
    }

    const config = getQuestConfig(questProgress.questId);
    if (!config) return;

    // Update text
    this.missionText.setText(`${config.name}`);
    this.progressText.setText(`${questProgress.current} / ${config.target}`);

    // Update progress bar
    const barWidth = 180;
    const barHeight = 6;
    const barX = 35;
    const barY = GAME_CONFIG.height - 100 + 45;

    this.progressBar.clear();

    // Background
    this.progressBar.fillStyle(0x37474f, 1);
    this.progressBar.fillRoundedRect(barX, barY, barWidth, barHeight, 3);

    // Progress fill
    const progress = Math.min(1, questProgress.current / config.target);
    const fillColor = questProgress.completed ? 0x4caf50 : 0xffc107;
    this.progressBar.fillStyle(fillColor, 1);
    this.progressBar.fillRoundedRect(
      barX + 1,
      barY + 1,
      (barWidth - 2) * progress,
      barHeight - 2,
      2,
    );

    // Glow effect khi hoàn thành
    if (questProgress.completed && !questProgress.claimed) {
      this.tweens.add({
        targets: this.progressBar,
        alpha: { from: 1, to: 0.6 },
        duration: 500,
        yoyo: true,
        repeat: -1,
      });
    }
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
      { icon: "📜", color: 0xff9800, label: "Quest" }, // Phase 12: Quest button
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

        // Phase 14: Play click sound
        audioManager.play("click");

        // Phase 9 & 12 & 14: Open modal scenes
        if (btn.label === "Quest") {
          this.scene.launch("QuestModal");
        } else if (btn.label === "Shop") {
          this.scene.launch("ShopModal");
        } else if (btn.label === "Storage") {
          this.scene.launch("StorageModal");
        } else if (btn.label === "Settings") {
          this.scene.launch("SettingsModal");
        }
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
   * Phase 9: Update seed badges khi gameState thay đổi
   */
  private updateSeedBadges(gameState: any) {
    if (!gameState || !gameState.seeds) return;

    const crops: CropType[] = ["carrot", "wheat", "tomato"];

    crops.forEach((crop) => {
      const quantity = gameState.seeds[crop] || 0;
      const badgeText = this.seedBadges.get(crop);
      const container = this.seedButtons.get(crop);

      if (badgeText) {
        badgeText.setText(quantity.toString());
      }

      // Làm mờ icon nếu hết hạt
      if (container) {
        const alpha = quantity > 0 ? 1 : 0.5;
        container.setAlpha(alpha);

        // Đổi màu badge sang xám nếu hết hạt
        const badgeBg = container.getAt(5) as Phaser.GameObjects.Graphics;
        if (badgeBg) {
          badgeBg.clear();
          badgeBg.fillStyle(quantity > 0 ? 0xff9800 : 0x757575, 1);
          badgeBg.fillCircle(20, -20, 12);
        }
      }
    });
  }

  /**
   * Public: Get selected seed
   */
  getSelectedSeed(): CropType {
    return this.selectedSeed;
  }
}
