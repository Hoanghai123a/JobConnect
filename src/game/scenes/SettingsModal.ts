/**
 * SettingsModal - Phase 14
 * Cài đặt: Bật/Tắt âm thanh
 */

import Phaser from "phaser";
import { GAME_CONFIG } from "../config/game";
import { blockInputBelow } from "../utils/blockInputBelow";
import { audioManager } from "../utils/audioManager";

export class SettingsModal extends Phaser.Scene {
  private overlay!: Phaser.GameObjects.Graphics;
  private modalContainer!: Phaser.GameObjects.Container;
  private muteButton!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: "SettingsModal" });
  }

  create() {
    const { width, height } = GAME_CONFIG;

    // Overlay mờ
    this.overlay = this.add.graphics();
    this.overlay.fillStyle(0x000000, 0.7);
    this.overlay.fillRect(0, 0, width, height);
    this.overlay.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    this.overlay.on("pointerdown", () => this.closeModal());

    blockInputBelow(this, 0, 0, width, height);

    // Modal container
    this.modalContainer = this.add.container(width / 2, height / 2);
    this.modalContainer.setDepth(2000);

    // Modal background
    const modalWidth = 400;
    const modalHeight = 300;
    const modalBg = this.add.graphics();
    modalBg.fillStyle(0x263238, 0.98);
    modalBg.lineStyle(3, 0x4caf50, 1);
    modalBg.fillRoundedRect(-modalWidth / 2, -modalHeight / 2, modalWidth, modalHeight, 16);
    modalBg.strokeRoundedRect(-modalWidth / 2, -modalHeight / 2, modalWidth, modalHeight, 16);

    // Title
    const title = this.add.text(0, -modalHeight / 2 + 30, "⚙️ Cài đặt", {
      fontSize: "28px",
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
    });
    title.setOrigin(0.5, 0.5);

    // Divider
    const divider = this.add.graphics();
    divider.lineStyle(2, 0x4caf50, 0.5);
    divider.lineBetween(-modalWidth / 2 + 20, -modalHeight / 2 + 60, modalWidth / 2 - 20, -modalHeight / 2 + 60);

    this.modalContainer.add([modalBg, title, divider]);

    // Audio toggle
    this.createAudioToggle();

    // Close button
    this.createCloseButton(modalWidth, modalHeight);
  }

  /**
   * Tạo nút Toggle Audio
   */
  private createAudioToggle() {
    const y = -40; // Position relative to modal center

    // Label
    const label = this.add.text(-130, y, "🔊 Âm thanh:", {
      fontSize: "18px",
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
    });
    label.setOrigin(0, 0.5);

    // Toggle button container
    this.muteButton = this.add.container(80, y);

    const bgWidth = 60;
    const bgHeight = 30;

    // Background (ON: green, OFF: gray)
    const isMuted = audioManager.getMuted();
    const bg = this.add.graphics();
    bg.fillStyle(isMuted ? 0x607d8b : 0x4caf50, 1);
    bg.fillRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 15);

    // Knob (toggle circle)
    const knobX = isMuted ? -15 : 15;
    const knob = this.add.graphics();
    knob.fillStyle(0xffffff, 1);
    knob.fillCircle(knobX, 0, 12);

    // Text: ON/OFF
    const statusText = this.add.text(0, 0, isMuted ? "OFF" : "ON", {
      fontSize: "14px",
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
    });
    statusText.setOrigin(0.5, 0.5);

    this.muteButton.add([bg, knob, statusText]);
    this.muteButton.setSize(bgWidth, bgHeight);
    this.muteButton.setInteractive();

    // Click handler
    this.muteButton.on("pointerdown", () => {
      const newMuted = audioManager.toggleMute();

      // Update visual
      bg.clear();
      bg.fillStyle(newMuted ? 0x607d8b : 0x4caf50, 1);
      bg.fillRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 15);

      knob.x = newMuted ? -15 : 15;
      statusText.setText(newMuted ? "OFF" : "ON");

      // Play feedback (nếu unmute)
      if (!newMuted) {
        audioManager.play("click");
      }

      console.log(newMuted ? "🔇 Audio muted" : "🔊 Audio unmuted");
    });

    // Hover effect
    this.muteButton.on("pointerover", () => {
      this.tweens.add({
        targets: this.muteButton,
        scale: 1.1,
        duration: 150,
      });
    });

    this.muteButton.on("pointerout", () => {
      this.tweens.add({
        targets: this.muteButton,
        scale: 1,
        duration: 150,
      });
    });

    this.modalContainer.add([label, this.muteButton]);
  }

  /**
   * Tạo nút Close
   */
  private createCloseButton(modalWidth: number, modalHeight: number) {
    const btnX = 0;
    const btnY = modalHeight / 2 - 50;

    const btnBg = this.add.graphics();
    btnBg.fillStyle(0xf44336, 1);
    btnBg.fillRoundedRect(btnX - 80, btnY - 20, 160, 40, 12);
    btnBg.setInteractive(
      new Phaser.Geom.Rectangle(btnX - 80, btnY - 20, 160, 40),
      Phaser.Geom.Rectangle.Contains,
    );

    const btnText = this.add.text(btnX, btnY, "Đóng", {
      fontSize: "20px",
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
    });
    btnText.setOrigin(0.5, 0.5);

    btnBg.on("pointerdown", () => {
      audioManager.play("click");
      this.closeModal();
    });

    btnBg.on("pointerover", () => {
      btnBg.clear();
      btnBg.fillStyle(0xe53935, 1);
      btnBg.fillRoundedRect(btnX - 80, btnY - 20, 160, 40, 12);
    });

    btnBg.on("pointerout", () => {
      btnBg.clear();
      btnBg.fillStyle(0xf44336, 1);
      btnBg.fillRoundedRect(btnX - 80, btnY - 20, 160, 40, 12);
    });

    this.modalContainer.add([btnBg, btnText]);
  }

  /**
   * Đóng modal
   */
  private closeModal() {
    this.scene.stop("SettingsModal");
  }
}
