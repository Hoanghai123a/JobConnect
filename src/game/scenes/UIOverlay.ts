/**
 * UIOverlay Scene - Phase 2
 * Top bar hiển thị: Coins, Level, EXP bar
 */

import Phaser from "phaser";
import { GAME_CONFIG } from "../config/game";
import type { GameState } from "../types";

export class UIOverlay extends Phaser.Scene {
  private coinText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private expBar!: Phaser.GameObjects.Graphics;
  private expBarBg!: Phaser.GameObjects.Graphics;
  private expText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "UIOverlay" });
  }

  create() {
    this.createTopBar();
    this.createCoinDisplay();
    this.createLevelDisplay();
    this.createExpBar();

    // Listen for game state updates
    this.game.events.on("gameStateUpdate", this.updateUI, this);
  }

  private createTopBar() {
    const { width } = GAME_CONFIG;
    const { topBarHeight, topBarColor, topBarAlpha } = GAME_CONFIG.ui;

    // Top bar background
    const topBar = this.add.graphics();
    topBar.fillStyle(topBarColor, topBarAlpha);
    topBar.fillRoundedRect(0, 0, width, topBarHeight, 8);
    topBar.setDepth(1000); // Always on top
  }

  private createCoinDisplay() {
    const { goldColor, textColor } = GAME_CONFIG.ui;

    // Coin icon (placeholder - vẽ hình tròn màu vàng)
    const coinIcon = this.add.graphics();
    coinIcon.fillStyle(0xffd700, 1); // Gold
    coinIcon.fillCircle(40, 25, 12);
    coinIcon.lineStyle(2, 0xffed4e, 1); // Light gold border
    coinIcon.strokeCircle(40, 25, 12);
    coinIcon.setDepth(1001);

    // Coin text
    this.coinText = this.add.text(60, 15, "100", {
      fontSize: "24px",
      fontFamily: "Arial, sans-serif",
      color: goldColor,
      fontStyle: "bold",
    });
    this.coinText.setDepth(1001);
  }

  private createLevelDisplay() {
    const { textColor } = GAME_CONFIG.ui;
    const { width } = GAME_CONFIG;

    // Level icon (placeholder - vẽ ngôi sao)
    const star = this.add.graphics();
    star.fillStyle(0xff9800, 1); // Orange
    const starX = width - 120;
    const starY = 25;

    // Vẽ ngôi sao 5 cánh
    star.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const x = starX + Math.cos(angle) * 12;
      const y = starY + Math.sin(angle) * 12;
      if (i === 0) star.moveTo(x, y);
      else star.lineTo(x, y);
    }
    star.closePath();
    star.fillPath();
    star.setDepth(1001);

    // Level text
    this.levelText = this.add.text(width - 95, 15, "Lv.1", {
      fontSize: "24px",
      fontFamily: "Arial, sans-serif",
      color: textColor,
      fontStyle: "bold",
    });
    this.levelText.setDepth(1001);
  }

  private createExpBar() {
    const { width } = GAME_CONFIG;
    const { expBarBg, expBarColor, textColor } = GAME_CONFIG.ui;

    const barWidth = 300;
    const barHeight = 20;
    const barX = (width - barWidth) / 2;
    const barY = 50;

    // EXP bar background
    this.expBarBg = this.add.graphics();
    this.expBarBg.fillStyle(expBarBg, 0.8);
    this.expBarBg.fillRoundedRect(barX, barY, barWidth, barHeight, 10);
    this.expBarBg.setDepth(1001);

    // EXP bar fill
    this.expBar = this.add.graphics();
    this.expBar.setDepth(1002);

    // EXP text
    this.expText = this.add.text(barX + barWidth / 2, barY + 2, "0 / 100", {
      fontSize: "14px",
      fontFamily: "Arial, sans-serif",
      color: textColor,
      fontStyle: "bold",
    });
    this.expText.setOrigin(0.5, 0);
    this.expText.setDepth(1003);
  }

  private updateUI(gameState: GameState) {
    // Update coins
    this.coinText.setText(gameState.coins.toString());

    // Update level
    this.levelText.setText(`Lv.${gameState.level}`);

    // Update EXP bar
    const progress = gameState.exp / gameState.expToNextLevel;
    const barWidth = 300;
    const barHeight = 20;
    const barX = (GAME_CONFIG.width - barWidth) / 2;
    const barY = 50;

    this.expBar.clear();
    this.expBar.fillStyle(GAME_CONFIG.ui.expBarColor, 1);
    this.expBar.fillRoundedRect(
      barX + 2,
      barY + 2,
      (barWidth - 4) * progress,
      barHeight - 4,
      8
    );

    // Update EXP text
    this.expText.setText(`${gameState.exp} / ${gameState.expToNextLevel}`);
  }

  destroy() {
    this.game.events.off("gameStateUpdate", this.updateUI, this);
    super.destroy();
  }
}
