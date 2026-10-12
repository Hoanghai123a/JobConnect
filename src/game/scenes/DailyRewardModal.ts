/**
 * DailyRewardModal - Phase 16
 * Popup hiển thị lịch điểm danh 7 ngày với phần thưởng
 */

import Phaser from "phaser";
import { GAME_CONFIG } from "../config/game";
import { claimDailyReward, getRewardForDay } from "../utils/dailyLoginManager";
import { audioManager } from "../utils/audioManager";
import type { GameState } from "../types";

export class DailyRewardModal extends Phaser.Scene {
  private gameState!: GameState;

  constructor() {
    super("DailyRewardModal");
  }

  init(data: { gameState: GameState }) {
    this.gameState = data.gameState;
  }

  create() {
    const { width, height } = this.cameras.main;
    const centerX = width / 2;
    const centerY = height / 2;

    // Overlay mờ
    const overlay = this.add.rectangle(centerX, centerY, width, height, 0x000000, 0.8);
    overlay.setDepth(100);
    overlay.setInteractive();

    // Modal container
    const modalW = 700;
    const modalH = 450;

    // Background
    const modalBg = this.add.rectangle(centerX, centerY, modalW, modalH, 0x1a237e);
    modalBg.setStrokeStyle(6, 0xffd700);
    modalBg.setDepth(101);

    // Title
    const title = this.add
      .text(centerX, centerY - 190, "🎁 Điểm Danh Nhận Quà 🎁", {
        fontSize: "32px",
        fontFamily: "Arial, sans-serif",
        color: "#ffd700",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(102);

    // Current streak info
    const currentDay = this.gameState.loginStreak || 1;
    const streakText = this.add
      .text(centerX, centerY - 150, `Chuỗi hiện tại: Ngày ${currentDay}/7`, {
        fontSize: "20px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(102);

    // Render 7 reward cards
    this.renderRewardCards(centerX, centerY);

    // Claim button (only if not claimed today)
    if (!this.gameState.dailyClaimedToday) {
      this.renderClaimButton(centerX, centerY + 150);
    } else {
      // Already claimed message
      const claimedText = this.add
        .text(centerX, centerY + 150, "✅ Đã nhận thưởng hôm nay!", {
          fontSize: "22px",
          fontFamily: "Arial, sans-serif",
          color: "#4caf50",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0.5)
        .setDepth(102);
    }

    // Close button
    this.renderCloseButton(centerX, centerY + 195);
  }

  private renderRewardCards(centerX: number, centerY: number) {
    const cardW = 85;
    const cardH = 110;
    const gap = 10;
    const startX = centerX - (cardW * 7 + gap * 6) / 2 + cardW / 2;
    const cardY = centerY - 20;

    for (let day = 1; day <= 7; day++) {
      const reward = getRewardForDay(day);
      if (!reward) continue;

      const cardX = startX + (day - 1) * (cardW + gap);
      const isToday = day === (this.gameState.loginStreak || 1);
      const isClaimed = day < (this.gameState.loginStreak || 1) || this.gameState.dailyClaimedToday;

      // Card background
      const cardBg = this.add.rectangle(
        cardX,
        cardY,
        cardW,
        cardH,
        isToday ? 0xffd700 : 0x2c3e50,
      );
      cardBg.setStrokeStyle(3, isToday ? 0xffeb3b : 0x34495e);
      cardBg.setDepth(102);

      // Add glow effect for today's card
      if (isToday && !this.gameState.dailyClaimedToday) {
        this.tweens.add({
          targets: cardBg,
          scaleX: 1.1,
          scaleY: 1.1,
          duration: 800,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      // Day number
      const dayText = this.add
        .text(cardX, cardY - 40, `Ngày ${day}`, {
          fontSize: "14px",
          fontFamily: "Arial, sans-serif",
          color: isToday ? "#000000" : "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0.5)
        .setDepth(103);

      // Reward icon/text
      let rewardIcon = "";
      if (reward.coins && reward.seeds) {
        rewardIcon = "🎉"; // Mega reward
      } else if (reward.coins) {
        rewardIcon = "💰";
      } else if (reward.seeds) {
        if (reward.seeds.carrot) rewardIcon = "🥕";
        else if (reward.seeds.wheat) rewardIcon = "🌾";
        else if (reward.seeds.tomato) rewardIcon = "🍅";
      }

      const iconText = this.add
        .text(cardX, cardY, rewardIcon, {
          fontSize: "28px",
        })
        .setOrigin(0.5, 0.5)
        .setDepth(103);

      // Reward description (small)
      const descLines = reward.description.split(" ");
      const descText = this.add
        .text(cardX, cardY + 30, descLines.join("\n"), {
          fontSize: "11px",
          fontFamily: "Arial, sans-serif",
          color: isToday ? "#000000" : "#ecf0f1",
          align: "center",
        })
        .setOrigin(0.5, 0.5)
        .setDepth(103);

      // Claimed checkmark
      if (isClaimed) {
        const checkmark = this.add
          .text(cardX, cardY, "✅", {
            fontSize: "40px",
          })
          .setOrigin(0.5, 0.5)
          .setDepth(104)
          .setAlpha(0.9);
      }
    }
  }

  private renderClaimButton(centerX: number, centerY: number) {
    const btnW = 280;
    const btnH = 60;

    const btn = this.add.rectangle(centerX, centerY, btnW, btnH, 0x4caf50);
    btn.setStrokeStyle(4, 0x2e7d32);
    btn.setInteractive({ useHandCursor: true });
    btn.setDepth(102);

    const btnText = this.add
      .text(centerX, centerY, "🎁 Điểm Danh Nhận Quà 🎁", {
        fontSize: "24px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(103);

    btn.on("pointerdown", () => {
      this.handleClaim(btn, btnText);
    });

    btn.on("pointerover", () => {
      btn.setFillStyle(0x66bb6a);
      btn.setScale(1.05);
      btnText.setScale(1.05);
    });

    btn.on("pointerout", () => {
      btn.setFillStyle(0x4caf50);
      btn.setScale(1.0);
      btnText.setScale(1.0);
    });
  }

  private handleClaim(btn: Phaser.GameObjects.Rectangle, btnText: Phaser.GameObjects.Text) {
    const reward = claimDailyReward(this.gameState);
    if (!reward) return;

    // Play sound
    audioManager.play("coin");

    // Notify parent scene (FarmScene) to persist & update UI
    this.game.events.emit("dailyRewardClaimed", this.gameState);

    // Disable button
    btn.setFillStyle(0x95a5a6);
    btn.disableInteractive();
    btnText.setText("✅ Đã nhận!");

    // Spawn reward particles
    this.spawnRewardParticles();

    // Auto close after 2s
    this.time.delayedCall(2000, () => {
      this.scene.stop();
    });
  }

  private renderCloseButton(centerX: number, centerY: number) {
    const btnW = 120;
    const btnH = 40;

    const btn = this.add.rectangle(centerX, centerY, btnW, btnH, 0x95a5a6);
    btn.setStrokeStyle(2, 0x7f8c8d);
    btn.setInteractive({ useHandCursor: true });
    btn.setDepth(102);

    const btnText = this.add
      .text(centerX, centerY, "Đóng", {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(103);

    btn.on("pointerdown", () => {
      audioManager.play("click");
      this.scene.stop();
    });

    btn.on("pointerover", () => {
      btn.setFillStyle(0xbdc3c7);
    });

    btn.on("pointerout", () => {
      btn.setFillStyle(0x95a5a6);
    });
  }

  private spawnRewardParticles() {
    const { width, height } = this.cameras.main;
    const centerX = width / 2;
    const centerY = height / 2;

    // Spawn 20 coin/star particles
    for (let i = 0; i < 20; i++) {
      const particle = this.add
        .text(centerX, centerY - 50, Math.random() > 0.5 ? "💰" : "⭐", {
          fontSize: "24px",
        })
        .setDepth(105);

      this.tweens.add({
        targets: particle,
        x: centerX + (Math.random() - 0.5) * 400,
        y: centerY - 150 + (Math.random() - 0.5) * 200,
        alpha: 0,
        scale: 1.5,
        duration: 1000,
        ease: "Cubic.easeOut",
        onComplete: () => particle.destroy(),
      });
    }
  }
}
