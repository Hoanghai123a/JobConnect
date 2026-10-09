/**
 * UIOverlay Scene - Phase 2
 * Top bar hiển thị: Coins, Level, EXP bar
 */

import Phaser from "phaser";
import { GAME_CONFIG } from "../config/game";
import type { GameState } from "../types";
import { blockInputBelow } from "../utils/blockInputBelow";

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

    // Phaser.Scene không có destroy() để override → gỡ listener qua scene events.
    // game.events sống lâu hơn scene nên không gỡ sẽ rò rỉ và gọi vào object đã hủy.
    const cleanup = () => this.game.events.off("gameStateUpdate", this.updateUI, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

    // Hỏi state hiện tại (scene này khởi động sau emit đầu tiên của FarmScene)
    this.game.events.emit("gameStateRequest");
  }

  private createTopBar() {
    const { width } = GAME_CONFIG;
    const { topBarHeight, topBarColor, topBarAlpha } = GAME_CONFIG.ui;

    blockInputBelow(this, 0, 0, width, topBarHeight);

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
    star.fillStyle(0xffd700, 1); // Gold star
    star.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const x = width - 260 + Math.cos(angle) * 12;
      const y = 25 + Math.sin(angle) * 12;
      if (i === 0) star.moveTo(x, y);
      else star.lineTo(x, y);
    }
    star.closePath();
    star.fillPath();
    star.setDepth(1001);

    // Level text
    this.levelText = this.add.text(width - 230, 15, "Lv.1", {
      fontSize: "24px",
      fontFamily: "Arial, sans-serif",
      color: textColor,
      fontStyle: "bold",
    });
    this.levelText.setDepth(1001);
  }

  private createExpBar() {
    const { width } = GAME_CONFIG;
    const { expBarColor, expBarBg } = GAME_CONFIG.ui;

    const barWidth = 180;
    const barHeight = 12;
    const barX = width - 180;
    const barY = 45;

    // EXP bar background
    this.expBarBg = this.add.graphics();
    this.expBarBg.fillStyle(expBarBg, 1);
    this.expBarBg.fillRoundedRect(barX, barY, barWidth, barHeight, 6);
    this.expBarBg.setDepth(1001);

    // EXP bar progress
    this.expBar = this.add.graphics();
    this.expBar.setDepth(1002);

    // EXP text (0/100)
    this.expText = this.add.text(barX + barWidth / 2, barY + barHeight / 2, "0/100", {
      fontSize: "14px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      fontStyle: "bold",
    });
    this.expText.setOrigin(0.5, 0.5);
    this.expText.setDepth(1003);
  }

  private updateUI(state: GameState) {
    // Update coin text
    this.coinText.setText(`${state.coins}`);

    // Update level text
    this.levelText.setText(`Lv.${state.level}`);

    // Update EXP bar
    const barWidth = 180;
    const barHeight = 12;
    const barX = this.cameras.main.width - 180;
    const barY = 45;
    const progress = Math.min(state.exp / state.expToNextLevel, 1); // 0-1

    this.expBar.clear();
    this.expBar.fillStyle(GAME_CONFIG.ui.expBarColor, 1);
    this.expBar.fillRoundedRect(barX, barY, barWidth * progress, barHeight, 6);

    // Update EXP text
    this.expText.setText(`${state.exp}/${state.expToNextLevel}`);
  }
}
