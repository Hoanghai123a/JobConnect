/**
 * Fallback Graphics Helper - Phase 3
 * Vẽ placeholder graphics khi sprites không tồn tại
 */

import Phaser from "phaser";
import { GAME_CONFIG } from "../config/game";
import type { GrowthStage, CropType } from "../types";

export class FallbackGraphics {
  /**
   * Vẽ crop placeholder theo stage
   */
  static drawCropStage(
    scene: Phaser.Scene,
    cropType: CropType,
    stage: GrowthStage,
  ): Phaser.GameObjects.Graphics {
    const graphic = scene.add.graphics();
    const { sprout, sproutDark } = GAME_CONFIG.colors;

    switch (stage) {
      case "SEED":
        // Hạt giống - chấm nhỏ nâu
        graphic.fillStyle(0x8b4513, 1);
        graphic.fillCircle(0, -5, 4);
        break;

      case "STAGE1":
        // Mầm nhỏ - 2 lá
        graphic.lineStyle(2, sproutDark, 1);
        graphic.beginPath();
        graphic.moveTo(0, 0);
        graphic.lineTo(0, -15);
        graphic.strokePath();

        graphic.fillStyle(sprout, 1);
        graphic.fillEllipse(-6, -12, 8, 6);
        graphic.fillEllipse(6, -12, 8, 6);
        break;

      case "STAGE2":
        // Cây phát triển - 4 lá
        graphic.lineStyle(3, sproutDark, 1);
        graphic.beginPath();
        graphic.moveTo(0, 0);
        graphic.lineTo(0, -30);
        graphic.strokePath();

        graphic.fillStyle(sprout, 1);
        graphic.fillEllipse(-10, -25, 12, 8);
        graphic.fillEllipse(10, -25, 12, 8);
        graphic.fillEllipse(-8, -18, 10, 7);
        graphic.fillEllipse(8, -18, 10, 7);
        break;

      case "STAGE3": {
        // Gần chín - cây lớn + hoa/quả nhỏ
        graphic.lineStyle(4, sproutDark, 1);
        graphic.beginPath();
        graphic.moveTo(0, 0);
        graphic.lineTo(0, -40);
        graphic.strokePath();

        graphic.fillStyle(sprout, 1);
        graphic.fillEllipse(-12, -35, 14, 10);
        graphic.fillEllipse(12, -35, 14, 10);
        graphic.fillEllipse(-10, -25, 12, 9);
        graphic.fillEllipse(10, -25, 12, 9);

        // Hoa/quả nhỏ theo loại cây
        const fruitColor = this.getCropColor(cropType);
        graphic.fillStyle(fruitColor, 1);
        graphic.fillCircle(0, -35, 5);
        break;
      }

      case "HARVEST": {
        // Chín thu hoạch - cây lớn + quả rõ
        graphic.lineStyle(4, sproutDark, 1);
        graphic.beginPath();
        graphic.moveTo(0, 0);
        graphic.lineTo(0, -45);
        graphic.strokePath();

        graphic.fillStyle(sprout, 1);
        graphic.fillEllipse(-14, -40, 16, 12);
        graphic.fillEllipse(14, -40, 16, 12);
        graphic.fillEllipse(-12, -30, 14, 10);
        graphic.fillEllipse(12, -30, 14, 10);

        // Quả chín lớn
        const harvestColor = this.getCropColor(cropType);
        graphic.fillStyle(harvestColor, 1);
        graphic.fillCircle(-8, -38, 7);
        graphic.fillCircle(8, -38, 7);
        graphic.fillCircle(0, -42, 8);

        // Sparkle effect (dấu sáng)
        graphic.lineStyle(2, 0xffff00, 0.8);
        graphic.strokeCircle(-8, -38, 10);
        graphic.strokeCircle(8, -38, 10);
        break;
      }
    }

    return graphic;
  }

  /**
   * Lấy màu đặc trưng của từng loại cây
   */
  private static getCropColor(cropType: CropType): number {
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
   * Vẽ progress bar mini phía trên cây
   */
  static drawProgressBar(
    scene: Phaser.Scene,
    progress: number, // 0-1
  ): Phaser.GameObjects.Graphics {
    const graphic = scene.add.graphics();
    const barWidth = 40;
    const barHeight = 4;
    const x = -barWidth / 2;
    const y = -55; // Phía trên cây

    // Background
    graphic.fillStyle(0x263238, 0.8);
    graphic.fillRoundedRect(x, y, barWidth, barHeight, 2);

    // Progress fill
    graphic.fillStyle(0x4caf50, 1);
    graphic.fillRoundedRect(x + 1, y + 1, (barWidth - 2) * progress, barHeight - 2, 1);

    return graphic;
  }

  /**
   * Vẽ countdown text
   */
  static drawCountdownText(scene: Phaser.Scene, seconds: number): Phaser.GameObjects.Text {
    const text = scene.add.text(0, -65, `${seconds}s`, {
      fontSize: "12px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 2,
    });
    text.setOrigin(0.5, 0.5);
    return text;
  }

  /**
   * Vẽ floating text (+10 Gold)
   */
  static createFloatingText(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    color: string = "#ffd700",
  ): void {
    const floatingText = scene.add.text(x, y, text, {
      fontSize: "20px",
      fontFamily: "Arial, sans-serif",
      color: color,
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 3,
    });
    floatingText.setOrigin(0.5, 0.5);

    // Animation: Bay lên + fade out
    scene.tweens.add({
      targets: floatingText,
      y: y - 50,
      alpha: 0,
      duration: 1500,
      ease: "Cubic.easeOut",
      onComplete: () => {
        floatingText.destroy();
      },
    });
  }
}
