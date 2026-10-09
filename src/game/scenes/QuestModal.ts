/**
 * QuestModal Scene - Phase 12: Quest System
 * Hiển thị danh sách nhiệm vụ với progress bar và nút nhận thưởng
 */

import Phaser from "phaser";
import { GAME_CONFIG } from "../config/game";
import type { Quest } from "../types";
import type { FarmScene } from "./FarmScene";
import { blockInputBelow } from "../utils/blockInputBelow";

export class QuestModal extends Phaser.Scene {
  private overlay!: Phaser.GameObjects.Rectangle;
  private modalContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: "QuestModal" });
  }

  create() {
    const { width, height } = GAME_CONFIG;

    // Overlay mờ
    this.overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    this.overlay.setDepth(100);
    this.overlay.setInteractive();

    blockInputBelow(this, 0, 0, width, height);

    // Modal container
    this.modalContainer = this.add.container(width / 2, height / 2);
    this.modalContainer.setDepth(101);

    const modalWidth = 500;
    const modalHeight = 450;

    // Background
    const modalBg = this.add.graphics();
    modalBg.fillStyle(0x2c3e50, 1);
    modalBg.fillRoundedRect(-modalWidth / 2, -modalHeight / 2, modalWidth, modalHeight, 12);
    modalBg.lineStyle(4, 0x3498db, 1);
    modalBg.strokeRoundedRect(-modalWidth / 2, -modalHeight / 2, modalWidth, modalHeight, 12);

    // Title
    const title = this.add.text(0, -modalHeight / 2 + 30, "📜 Nhiệm vụ", {
      fontSize: "28px",
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
    closeBtn.on("pointerdown", () => this.closeModal());
    closeBtn.on("pointerover", () => closeBtn.setColor("#ff4444"));
    closeBtn.on("pointerout", () => closeBtn.setColor("#ffffff"));

    this.modalContainer.add([modalBg, title, closeBtn]);

    // Quest list
    this.renderQuestList();

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

  private renderQuestList() {
    const farmScene = this.scene.get("FarmScene") as FarmScene;
    const quests = farmScene.gameState.quests;

    const startY = -160;
    const itemHeight = 110;

    quests.forEach((quest, index) => {
      const y = startY + index * itemHeight;

      // Item background
      const itemBg = this.add.graphics();
      itemBg.fillStyle(0x37474f, 1);
      itemBg.fillRoundedRect(-230, y - 45, 460, 100, 8);

      // Title
      const titleText = this.add.text(-220, y - 30, quest.title, {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      });

      // Description
      const descText = this.add.text(-220, y - 5, quest.desc, {
        fontSize: "14px",
        fontFamily: "Arial, sans-serif",
        color: "#b0bec5",
      });

      // Progress bar
      const barWidth = 200;
      const barHeight = 12;
      const barX = -220;
      const barY = y + 20;
      const progress = Math.min(quest.current / quest.target, 1);

      // Bar background
      const barBg = this.add.graphics();
      barBg.fillStyle(0x263238, 1);
      barBg.fillRoundedRect(barX, barY, barWidth, barHeight, 6);

      // Bar fill
      const barFill = this.add.graphics();
      barFill.fillStyle(quest.isCompleted ? 0x4caf50 : 0xffd700, 1);
      barFill.fillRoundedRect(barX, barY, barWidth * progress, barHeight, 6);

      // Progress text
      const progressText = this.add.text(
        barX + barWidth + 10,
        barY + barHeight / 2,
        `${quest.current}/${quest.target}`,
        {
          fontSize: "14px",
          fontFamily: "Arial, sans-serif",
          color: "#ffffff",
          fontStyle: "bold",
        },
      );
      progressText.setOrigin(0, 0.5);

      // Button or status
      this.createClaimButton(quest, 120, y);

      this.modalContainer.add([itemBg, titleText, descText, barBg, barFill, progressText]);
    });
  }

  private createClaimButton(quest: Quest, btnX: number, btnY: number) {
    const btnWidth = 100;
    const btnHeight = 40;

    if (quest.isClaimed) {
      // Đã nhận thưởng - Text xám
      const claimedText = this.add.text(btnX, btnY, "Đã nhận", {
        fontSize: "14px",
        fontFamily: "Arial, sans-serif",
        color: "#757575",
        fontStyle: "bold",
      });
      claimedText.setOrigin(0.5, 0.5);
      this.modalContainer.add(claimedText);
    } else if (quest.isCompleted) {
      // Hoàn thành chưa nhận - Nút xanh lá
      const btnBg = this.add
        .rectangle(btnX, btnY, btnWidth, btnHeight, 0x4caf50)
        .setStrokeStyle(2, 0x388e3c)
        .setInteractive({ useHandCursor: true });

      const btnText = this.add.text(btnX, btnY, "Nhận\nThưởng", {
        fontSize: "13px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
        align: "center",
      });
      btnText.setOrigin(0.5, 0.5);

      btnBg.on("pointerdown", () => {
        const farmScene = this.scene.get("FarmScene") as FarmScene;
        const success = farmScene.claimQuestReward(quest.id);
        if (success) {
          // Rebuild modal to show updated state
          this.modalContainer.removeAll(true);
          this.create();
        }
      });

      btnBg.on("pointerover", () => btnBg.setFillStyle(0x66bb6a));
      btnBg.on("pointerout", () => btnBg.setFillStyle(0x4caf50));

      this.modalContainer.add([btnBg, btnText]);
    } else {
      // Chưa hoàn thành - Text xám mờ
      const incompleteText = this.add.text(btnX, btnY, "Chưa xong", {
        fontSize: "13px",
        fontFamily: "Arial, sans-serif",
        color: "#9e9e9e",
      });
      incompleteText.setOrigin(0.5, 0.5);
      this.modalContainer.add(incompleteText);
    }
  }

  private closeModal() {
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
      onComplete: () => this.scene.stop(),
    });
  }
}
