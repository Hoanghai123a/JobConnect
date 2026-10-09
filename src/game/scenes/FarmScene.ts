/**
 * FarmScene - Phase 3
 * Growth Timer System + Harvest Mechanics + Fallback Graphics
 */

import Phaser from "phaser";
import { GAME_CONFIG } from "../config/game";
import { gridToIsometric, getIsometricOrigin } from "../utils/isometricHelper";
import { FallbackGraphics } from "../utils/fallbackGraphics";
import { loadGame, saveGame, applyOfflineProgress, advancePlotStage } from "../utils/saveManager";
import {
  getNextQuest,
  initQuestProgress,
  updateQuestProgress,
  getQuestConfig,
} from "../utils/questManager";
import type { Plot, GameState, CropType, QuestProgress } from "../types";

/** Sprite (asset thật) hoặc Graphics (fallback) - cả hai đều có x/y/scale/alpha */
type CropVisual = Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics;

export class FarmScene extends Phaser.Scene {
  public gameState!: GameState; // Phase 9: Changed to public for Modal access
  private tiles: Map<string, Phaser.GameObjects.Container> = new Map();
  private cropGraphics: Map<string, CropVisual> = new Map();
  private progressBars: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private countdownTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private updateTimer!: Phaser.Time.TimerEvent;
  private selectedSeed: CropType = "carrot"; // Default seed

  constructor() {
    super({ key: "FarmScene" });
  }

  preload() {
    // Attempt to load sprites (will fallback to Graphics if not found)
    const { crops } = GAME_CONFIG.assets;

    // Load crop sprites with error handling
    Object.entries(crops).forEach(([cropType, stages]) => {
      Object.entries(stages).forEach(([stage, path]) => {
        const key = `${cropType}_${stage}`;
        this.load.image(key, path);
      });
    });

    // Continue even if assets fail to load
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      console.warn(`⚠️ Asset not found: ${file.key}, will use fallback graphics`);
    });
  }

  create() {
    // Phase 10: Migration - Tải save cũ hoặc tạo mới
    const saved = loadGame();
    if (saved) {
      // Migrate old 3x3 save to 4x4 grid
      this.gameState = this.migrateGameState(saved);
      const changed = applyOfflineProgress(this.gameState);
      console.log(`💾 Đã tải save. ${changed} ô đất lớn thêm khi vắng mặt`);
    } else {
      this.initGameState();
    }

    // Lấy origin point để center grid
    const origin = getIsometricOrigin();

    // Vẽ grid 4x4 + khôi phục cây đã trồng
    for (let row = 0; row < GAME_CONFIG.grid.rows; row++) {
      for (let col = 0; col < GAME_CONFIG.grid.cols; col++) {
        this.drawIsometricTile(col, row, origin);
        this.restorePlotVisual(col, row);
      }
    }

    // UIOverlay launch async nên bỏ lỡ emit đầu tiên → cho nó hỏi lại state
    this.game.events.on("gameStateRequest", this.emitGameState, this);

    // Auto-save định kỳ + khi đóng/ẩn tab
    this.time.addEvent({ delay: 5000, callback: this.persist, callbackScope: this, loop: true });
    const saveOnHide = () => this.persist();
    const saveOnVisibility = () => {
      if (document.visibilityState === "hidden") this.persist();
    };
    window.addEventListener("pagehide", saveOnHide);
    document.addEventListener("visibilitychange", saveOnVisibility);

    // game.events sống lâu hơn scene → phải gỡ listener khi scene tắt/hủy
    const cleanup = () => {
      window.removeEventListener("pagehide", saveOnHide);
      document.removeEventListener("visibilitychange", saveOnVisibility);
      this.game.events.off("gameStateRequest", this.emitGameState, this);
      this.game.events.off("seed-selected", this.onSeedSelected, this);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

    // Start UI Overlay scene
    this.scene.launch("UIOverlay");

    // Start BottomBar scene
    this.scene.launch("BottomBar");

    // Listen to seed selection from BottomBar
    this.game.events.on("seed-selected", this.onSeedSelected, this);

    // Setup update timer (every 100ms để update countdown)
    this.updateTimer = this.time.addEvent({
      delay: 100,
      callback: this.updateGrowth,
      callbackScope: this,
      loop: true,
    });

    // Khởi tạo nhiệm vụ đầu tiên nếu chưa có
    this.initQuest();

    // Emit initial state to UI
    this.emitGameState();
  }

  /**
   * Event handler khi seed được chọn từ BottomBar
   */
  private onSeedSelected(crop: CropType) {
    this.selectedSeed = crop;
    console.log(`🎯 FarmScene received seed selection: ${crop}`);
  }

  private initGameState() {
    const { initialCoins, initialLevel, initialExp, getExpForLevel } = GAME_CONFIG.balance;
    const plots: Plot[] = [];

    // Phase 10: Initialize plots - 4 ô đầu EMPTY, còn lại LOCKED (4x4 = 16 ô)
    for (let row = 0; row < GAME_CONFIG.grid.rows; row++) {
      for (let col = 0; col < GAME_CONFIG.grid.cols; col++) {
        const index = row * GAME_CONFIG.grid.cols + col;
        plots.push({
          gridX: col,
          gridY: row,
          state: index < 4 ? "EMPTY" : "LOCKED", // 4 ô đầu miễn phí
        });
      }
    }

    this.gameState = {
      coins: initialCoins,
      level: initialLevel,
      exp: initialExp,
      expToNextLevel: getExpForLevel(initialLevel),
      plots,
      currentQuest: undefined,
      questHistory: [],
      quests: GAME_CONFIG.defaultQuests.map((q) => ({ ...q })), // Phase 12: Deep copy
      // Phase 9: Inventory system
      storage: { carrot: 0, wheat: 0, tomato: 0 },
      seeds: { carrot: 5, wheat: 5, tomato: 5 }, // Ban đầu cho 5 hạt mỗi loại
      storageCapacity: 50,
    };
  }

  /**
   * Phase 10: Migrate old save to 4x4 grid
   */
  private migrateGameState(saved: GameState): GameState {
    const expectedPlots = GAME_CONFIG.grid.rows * GAME_CONFIG.grid.cols; // 16

    // Check if migration is needed:
    // 1. Wrong plot count, OR
    // 2. Plot 4-15 không phải tất cả đều LOCKED (save cũ chưa migrate)
    const needsMigration =
      saved.plots.length !== expectedPlots ||
      !saved.plots.slice(4, 16).every((p) => p.state === "LOCKED");

    if (!needsMigration) {
      console.log("✅ Save đã ở định dạng 4x4 đúng, không cần migrate");
      return saved;
    }

    console.log(`🔄 Migrating save: ${saved.plots.length} plots → ${expectedPlots} plots`);
    console.log(`🔄 Ép LOCKED cho plot 4-15...`);

    // Rebuild plots array
    const newPlots: Plot[] = [];
    for (let row = 0; row < GAME_CONFIG.grid.rows; row++) {
      for (let col = 0; col < GAME_CONFIG.grid.cols; col++) {
        const index = row * GAME_CONFIG.grid.cols + col;

        if (index < 4) {
          // Plot 0-3: Giữ nguyên state cũ (nếu có), default EMPTY
          const oldPlot = saved.plots[index];
          if (oldPlot) {
            newPlots.push({
              gridX: col,
              gridY: row,
              state: oldPlot.state,
              plantedAt: oldPlot.plantedAt,
              cropType: oldPlot.cropType,
              growthStage: oldPlot.growthStage,
              nextStageAt: oldPlot.nextStageAt,
            });
          } else {
            newPlots.push({
              gridX: col,
              gridY: row,
              state: "EMPTY",
            });
          }
        } else {
          // Plot 4-15: ÉP BUỘC LOCKED (bỏ qua state cũ)
          newPlots.push({
            gridX: col,
            gridY: row,
            state: "LOCKED",
          });
        }
      }
    }

    console.log(`✅ Migration hoàn tất: plot 0-3 giữ nguyên, plot 4-15 → LOCKED`);

    const migrated = {
      ...saved,
      plots: newPlots,
    };

    // Persist ngay sau migration
    saveGame(migrated);
    console.log(`💾 Đã lưu save sau migration`);

    return migrated;
  }

  /**
   * Phase 10: Public API - Reset grid to 4x4 (xóa save cũ)
   */
  public resetGridTo4x4() {
    console.log("🔄 Resetting grid to 4x4...");

    // Xóa save cũ
    localStorage.removeItem("farm-game-save");

    // Khởi tạo lại state mới
    this.initGameState();

    // Clear scene và vẽ lại
    this.tiles.forEach((container) => container.destroy());
    this.tiles.clear();
    this.cropGraphics.clear();

    // Lấy origin point để center grid
    const origin = getIsometricOrigin();

    // Vẽ lại grid 4x4
    for (let row = 0; row < GAME_CONFIG.grid.rows; row++) {
      for (let col = 0; col < GAME_CONFIG.grid.cols; col++) {
        this.drawIsometricTile(col, row, origin);
      }
    }

    // Khởi tạo quest mới
    this.initQuest();

    // Save state mới
    this.persist();

    // Emit state mới
    this.emitGameState();

    console.log("✅ Grid reset hoàn tất! 4 ô đầu EMPTY, 12 ô còn lại LOCKED");
    console.log(
      `💰 Coins: ${this.gameState.coins}, 🌱 Seeds: carrot=${this.gameState.seeds.carrot}`,
    );
  }

  /**
   * Khởi tạo nhiệm vụ đầu tiên
   */
  private initQuest() {
    if (!this.gameState.currentQuest) {
      const nextQuest = getNextQuest(this.gameState.questHistory);
      this.gameState.currentQuest = initQuestProgress(nextQuest);
      this.emitQuestUpdate();
    }
  }

  /**
   * Emit quest state cho UI
   */
  private emitQuestUpdate() {
    this.game.events.emit("questUpdate", this.gameState.currentQuest);
  }

  /**
   * Cập nhật tiến độ nhiệm vụ (gọi khi plant/harvest/coins thay đổi)
   */
  private checkQuestProgress(action: "plant" | "harvest" | "coins", cropType?: CropType) {
    if (!this.gameState.currentQuest) return;

    const config = getQuestConfig(this.gameState.currentQuest.questId);
    if (!config) return;

    let shouldUpdate = false;

    // Kiểm tra điều kiện nhiệm vụ
    if (config.type === "harvest" && action === "harvest" && config.cropType === cropType) {
      shouldUpdate = true;
    } else if (config.type === "plant" && action === "plant") {
      shouldUpdate = true;
    } else if (config.type === "coins" && action === "coins") {
      // Quest coins: check tổng xu hiện tại >= target
      this.gameState.currentQuest.current = this.gameState.coins;
      shouldUpdate = true;
    }

    if (shouldUpdate && config.type !== "coins") {
      const justCompleted = updateQuestProgress(this.gameState.currentQuest, config, 1);
      if (justCompleted) {
        this.onQuestCompleted();
      }
    } else if (shouldUpdate && config.type === "coins") {
      if (
        this.gameState.currentQuest.current >= config.target &&
        !this.gameState.currentQuest.completed
      ) {
        this.gameState.currentQuest.completed = true;
        this.onQuestCompleted();
      }
    }

    this.emitQuestUpdate();
  }

  /**
   * Xử lý khi nhiệm vụ hoàn thành
   */
  private onQuestCompleted() {
    if (!this.gameState.currentQuest) return;

    const config = getQuestConfig(this.gameState.currentQuest.questId);
    if (!config) return;

    console.log(`🎉 Quest completed: ${config.name}`);

    // Floating text chúc mừng
    const origin = getIsometricOrigin();
    FallbackGraphics.createFloatingText(
      this,
      origin.x,
      origin.y - 100,
      `🎉 ${config.name} hoàn thành!`,
      "#ff9800",
    );

    // Tự động nhận thưởng và chuyển nhiệm vụ mới sau 1.5s
    this.time.delayedCall(1500, () => {
      this.claimQuestReward();
    });
  }

  /**
   * Nhận thưởng nhiệm vụ và chuyển nhiệm vụ mới
   */
  private claimQuestReward() {
    if (!this.gameState.currentQuest) return;

    const config = getQuestConfig(this.gameState.currentQuest.questId);
    if (!config || !this.gameState.currentQuest.completed) return;

    // Thưởng coins + exp
    this.gameState.coins += config.rewardCoins;
    this.gameState.exp += config.rewardExp;

    // Check level up
    if (this.gameState.exp >= this.gameState.expToNextLevel) {
      this.gameState.level++;
      this.gameState.exp = 0;
      this.gameState.expToNextLevel = GAME_CONFIG.balance.getExpForLevel(this.gameState.level);
    }

    // Floating text thưởng
    const origin = getIsometricOrigin();
    FallbackGraphics.createFloatingText(
      this,
      origin.x - 30,
      origin.y - 80,
      `+${config.rewardCoins}💰`,
      "#ffd700",
    );
    FallbackGraphics.createFloatingText(
      this,
      origin.x + 30,
      origin.y - 80,
      `+${config.rewardExp}⭐`,
      "#4caf50",
    );

    // Lưu vào lịch sử
    this.gameState.questHistory.push(this.gameState.currentQuest.questId);

    // Chuyển nhiệm vụ mới
    const nextQuest = getNextQuest(this.gameState.questHistory);
    this.gameState.currentQuest = initQuestProgress(nextQuest);

    console.log(`✨ New quest: ${nextQuest.name}`);

    this.emitGameState();
    this.emitQuestUpdate();
    this.persist();
  }

  private getPlot(gridX: number, gridY: number): Plot | undefined {
    return this.gameState.plots.find((p) => p.gridX === gridX && p.gridY === gridY);
  }

  /**
   * Update growth timer mỗi frame
   */
  private updateGrowth() {
    const now = Date.now();

    this.gameState.plots.forEach((plot) => {
      if (plot.state === "GROWING" && plot.nextStageAt) {
        const tileKey = `${plot.gridX},${plot.gridY}`;

        // Tính thời gian còn lại
        const timeLeft = Math.max(0, plot.nextStageAt - now);
        const secondsLeft = Math.ceil(timeLeft / 1000);

        // Update countdown text
        const countdownText = this.countdownTexts.get(tileKey);
        if (countdownText) {
          countdownText.setText(`${secondsLeft}s`);
        }

        // Update progress bar
        const progressBar = this.progressBars.get(tileKey);
        if (progressBar && plot.cropType) {
          const cropConfig = GAME_CONFIG.crops[plot.cropType];
          const stageTime = cropConfig.stageTime * 1000; // ms
          const elapsed = stageTime - timeLeft;
          const progress = Math.min(1, elapsed / stageTime);

          progressBar.clear();
          const barWidth = 40;
          const barHeight = 4;
          const x = -barWidth / 2;
          const y = -55;

          progressBar.fillStyle(0x263238, 0.8);
          progressBar.fillRoundedRect(x, y, barWidth, barHeight, 2);

          progressBar.fillStyle(0x4caf50, 1);
          progressBar.fillRoundedRect(x + 1, y + 1, (barWidth - 2) * progress, barHeight - 2, 1);
        }

        // Chuyển sang stage tiếp theo
        if (timeLeft === 0) {
          this.advanceGrowthStage(plot.gridX, plot.gridY);
        }
      }
    });
  }

  /**
   * Chuyển sang growth stage tiếp theo
   */
  private advanceGrowthStage(gridX: number, gridY: number) {
    const plot = this.getPlot(gridX, gridY);
    if (!plot || !plot.cropType || !plot.growthStage) return;

    const ripe = advancePlotStage(plot);

    if (ripe) {
      // Đã HARVEST - xóa progress bar và countdown
      this.removeGrowthUI(`${gridX},${gridY}`);
      this.persist();
    }

    // Update visual
    this.updateCropVisual(gridX, gridY);

    console.log(`🌱 Crop [${gridX}, ${gridY}] → ${plot.growthStage}`);
  }

  /**
   * Vẽ bóng ở chân cây
   */
  private drawCropShadow(tile: Phaser.GameObjects.Container, scale: number = 0.8): void {
    const tileKey = this.tiles.entries().next().value?.[0] || "";
    const shadowKey = `shadow_${tileKey}`;

    // Xóa shadow cũ nếu có
    const oldShadow = tile.getByName(shadowKey);
    if (oldShadow) oldShadow.destroy();

    // Vẽ shadow mới
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.25);
    shadow.fillEllipse(0, -5, 30 * scale, 15 * scale);
    shadow.setDepth(99); // Shadow layer thấp nhất
    shadow.setName(shadowKey);

    tile.add(shadow);
  }

  /**
   * Lấy scale động theo growth stage
   */
  private getStageScale(stage: string): number {
    const scaleMap: Record<string, number> = {
      SEED: 0.6, // Hạt nhỏ
      STAGE1: 0.75, // Mầm non
      STAGE2: 0.85, // Cây nhỡ
      STAGE3: 0.95, // Cây trưởng thành
      HARVEST: 1.0, // Quả chín to nhất
    };
    return scaleMap[stage] || 0.8;
  }

  /**
   * Update visual của crop (sprite hoặc fallback graphics)
   */
  private updateCropVisual(gridX: number, gridY: number) {
    const plot = this.getPlot(gridX, gridY);
    if (!plot || !plot.cropType || !plot.growthStage) return;

    const tileKey = `${gridX},${gridY}`;
    const tile = this.tiles.get(tileKey);
    if (!tile) return;

    // Xóa visual stage cũ (kể cả tween bounce đang chạy)
    this.removeCropVisual(tileKey);

    // Thử load sprite, fallback về graphics
    const spriteKey = `${plot.cropType}_${plot.growthStage.toLowerCase()}`;
    let cropVisual: CropVisual;

    if (this.textures.exists(spriteKey)) {
      // Sprite tồn tại - dùng sprite
      const sprite = this.add.sprite(0, -20, spriteKey);
      sprite.setOrigin(0.5, 1);
      sprite.setScale(this.getStageScale(plot.growthStage));
      cropVisual = sprite;
      console.log(`✅ Using sprite: ${spriteKey}`);
    } else {
      // Sprite không tồn tại - fallback graphics
      const graphic = FallbackGraphics.drawCropStage(this, plot.cropType, plot.growthStage);
      cropVisual = graphic;
      console.log(`⚠️ Fallback graphics: ${plot.cropType} ${plot.growthStage}`);
    }

    // Lưu reference để xóa sau (dù sprite hay graphics)
    this.cropGraphics.set(tileKey, cropVisual);

    // Set depth: crops layer (400-499)
    cropVisual.setDepth(400);

    // Vẽ bóng ở chân cây
    this.drawCropShadow(tile, this.getStageScale(plot.growthStage));

    tile.add(cropVisual);

    // Animation pop in với scale động theo stage
    const targetScale = this.getStageScale(plot.growthStage);
    this.tweens.add({
      targets: cropVisual,
      scaleX: { from: 0, to: targetScale },
      scaleY: { from: 0, to: targetScale },
      duration: 300,
      ease: "Back.easeOut",
    });

    // HARVEST stage: Thêm bounce animation liên tục quanh vị trí gốc
    if (plot.growthStage === "HARVEST") {
      const baseY = cropVisual.y;
      this.tweens.add({
        targets: cropVisual,
        y: baseY - 5,
        duration: 600,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1, // Loop forever
      });
    }
  }

  /**
   * Plant crop với growth timer - Sử dụng selectedSeed từ BottomBar
   */
  private plantCrop(gridX: number, gridY: number) {
    const plot = this.getPlot(gridX, gridY);
    if (!plot || plot.state !== "EMPTY") return;

    const cropType = this.selectedSeed; // Dùng seed đã chọn từ BottomBar
    const cropConfig = GAME_CONFIG.crops[cropType];

    // Phase 9: Check seeds inventory trước
    if (this.gameState.seeds[cropType] <= 0) {
      console.log(`❌ Hết hạt ${cropType}! Vào Shop mua thêm.`);
      // TODO: Show notification toast
      return;
    }

    // Deduct 1 seed from inventory
    this.gameState.seeds[cropType] -= 1;

    // Update plot state
    plot.state = "GROWING";
    plot.plantedAt = Date.now();
    plot.cropType = cropType;
    plot.growthStage = "SEED";
    plot.nextStageAt = Date.now() + cropConfig.stageTime * 1000;

    const tileKey = `${gridX},${gridY}`;
    const tile = this.tiles.get(tileKey);
    if (tile) this.paintPlantedSoil(tile);
    this.updateCropVisual(gridX, gridY);
    this.attachGrowthUI(tileKey);

    // Cập nhật tiến độ nhiệm vụ
    this.checkQuestProgress("plant");

    // Phase 12: Update quest progress - PLANT
    this.updateQuestProgress("PLANT", 1);

    this.emitGameState();
    this.persist();
    console.log(
      `✅ Planted ${cropType} at [${gridX}, ${gridY}]. Seeds left: ${this.gameState.seeds[cropType]}`,
    );
  }

  /**
   * Harvest crop - Phase 9: Thu hoạch vào storage thay vì +coins
   */
  private harvestCrop(gridX: number, gridY: number) {
    const plot = this.getPlot(gridX, gridY);
    if (!plot || plot.state !== "HARVEST" || !plot.cropType) return;

    const cropConfig = GAME_CONFIG.crops[plot.cropType];
    const tile = this.tiles.get(`${gridX},${gridY}`);
    if (!tile) return;

    // Phase 9: Kiểm tra kho đầy
    const totalStorage =
      this.gameState.storage.carrot + this.gameState.storage.wheat + this.gameState.storage.tomato;
    if (totalStorage >= this.gameState.storageCapacity) {
      console.log("❌ Kho đầy! Bán bớt nông sản hoặc nâng cấp kho.");
      // TODO: Show notification toast
      return;
    }

    // Get screen position for floating text
    const screenPos = gridToIsometric(gridX, gridY);
    const origin = getIsometricOrigin();

    // Phase 9: Thêm vào storage thay vì +coins trực tiếp
    this.gameState.storage[plot.cropType] += 1;

    // Vẫn cộng EXP
    this.gameState.exp += cropConfig.harvestExp;

    // Cập nhật tiến độ nhiệm vụ harvest
    this.checkQuestProgress("harvest", plot.cropType);

    // Phase 11: Add EXP (old level-up code removed, now handled by addExp())

    // Floating text: +1 nông sản vào kho
    FallbackGraphics.createFloatingText(
      this,
      origin.x + screenPos.x - 20,
      origin.y + screenPos.y - 40,
      `+1 ${cropConfig.name}`,
      "#ffd700",
    );

    // Floating exp text
    FallbackGraphics.createFloatingText(
      this,
      origin.x + screenPos.x + 20,
      origin.y + screenPos.y - 40,
      `+${cropConfig.harvestExp} ⭐`,
      "#4caf50",
    );

    // Remove crop visual
    const tileKey = `${gridX},${gridY}`;
    this.removeCropVisual(tileKey, true);

    // Reset plot to EMPTY
    plot.state = "EMPTY";
    plot.cropType = undefined;
    plot.growthStage = undefined;
    plot.plantedAt = undefined;
    plot.nextStageAt = undefined;

    // Restore original soil color
    const soil = tile.getAt(1) as Phaser.GameObjects.Graphics;
    soil.clear();

    const { tileWidth, tileHeight } = GAME_CONFIG.grid;
    const points = [
      { x: 0, y: -tileHeight / 2 },
      { x: tileWidth / 2, y: 0 },
      { x: 0, y: tileHeight / 2 },
      { x: -tileWidth / 2, y: 0 },
    ];

    soil.fillGradientStyle(0xa17c6b, 0xa17c6b, 0x7d5e4f, 0x7d5e4f, 1);
    soil.beginPath();
    soil.moveTo(points[0].x, points[0].y);
    points.forEach((p) => soil.lineTo(p.x, p.y));
    soil.closePath();
    soil.fillPath();

    soil.lineStyle(4, 0x8bc34a, 1.0);
    soil.strokePath();

    // Texture dots
    soil.fillStyle(0x8b6f47, 0.3);
    for (let i = 0; i < 15; i++) {
      const dotX = (Math.random() - 0.5) * (tileWidth * 0.7);
      const dotY = (Math.random() - 0.5) * (tileHeight * 0.7);
      soil.fillCircle(dotX, dotY, 1.5);
    }

    // Phase 11: Add EXP and check level-up
    this.addExp(cropConfig.harvestExp);

    // Phase 12: Update quest progress - HARVEST
    this.updateQuestProgress("HARVEST", 1);

    this.emitGameState();
    this.persist();
    console.log(
      `✅ Harvested ${cropConfig.name}! +${cropConfig.harvestCoins}💰 +${cropConfig.harvestExp}⭐`,
    );
  }

  /**
   * Khôi phục hình ảnh 1 ô đất từ state đã load (sau reload)
   */
  private restorePlotVisual(gridX: number, gridY: number) {
    const plot = this.getPlot(gridX, gridY);
    if (!plot) return;

    const tileKey = `${gridX},${gridY}`;
    const tile = this.tiles.get(tileKey);
    if (!tile) return;

    // Phase 10: Render LOCKED plots
    if (plot.state === "LOCKED") {
      const index = gridY * GAME_CONFIG.grid.cols + gridX;
      this.renderLockedPlot(tile, index);
      return;
    }

    // EMPTY plots: do nothing (already rendered as soil)
    if (plot.state === "EMPTY") return;

    // GROWING/HARVEST plots: restore crop visual
    this.paintPlantedSoil(tile);
    this.updateCropVisual(gridX, gridY);
    if (plot.state === "GROWING") this.attachGrowthUI(tileKey);
  }

  /** Vẽ đất tối màu (đã gieo hạt) */
  private paintPlantedSoil(tile: Phaser.GameObjects.Container) {
    const soil = tile.getAt(1) as Phaser.GameObjects.Graphics;
    const { tileWidth, tileHeight } = GAME_CONFIG.grid;
    soil.clear();
    soil.fillGradientStyle(0x6d4c41, 0x6d4c41, 0x4a2c2a, 0x4a2c2a, 1);
    soil.beginPath();
    soil.moveTo(0, -tileHeight / 2);
    soil.lineTo(tileWidth / 2, 0);
    soil.lineTo(0, tileHeight / 2);
    soil.lineTo(-tileWidth / 2, 0);
    soil.closePath();
    soil.fillPath();
    soil.lineStyle(3, 0x8bc34a, 1.0);
    soil.strokePath();
  }

  /** Gắn progress bar + countdown cho ô đang lớn (updateGrowth sẽ cập nhật mỗi 100ms) */
  private attachGrowthUI(tileKey: string) {
    const tile = this.tiles.get(tileKey);
    if (!tile) return;
    this.removeGrowthUI(tileKey);

    const progressBar = FallbackGraphics.drawProgressBar(this, 0);
    tile.add(progressBar);
    this.progressBars.set(tileKey, progressBar);

    const countdownText = FallbackGraphics.drawCountdownText(this, 0);
    tile.add(countdownText);
    this.countdownTexts.set(tileKey, countdownText);
  }

  /**
   * Gỡ visual cây khỏi ô. Xóa khỏi map ngay lập tức để gieo lại liền tay
   * không bị tween fade cũ xóa nhầm visual mới.
   */
  private removeCropVisual(tileKey: string, fadeOut = false) {
    const visual = this.cropGraphics.get(tileKey);
    if (!visual) return;
    this.cropGraphics.delete(tileKey);
    this.tweens.killTweensOf(visual);

    if (!fadeOut) {
      visual.destroy();
      return;
    }
    this.tweens.add({
      targets: visual,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 300,
      ease: "Back.easeIn",
      onComplete: () => visual.destroy(),
    });
  }

  private removeGrowthUI(tileKey: string) {
    this.progressBars.get(tileKey)?.destroy();
    this.progressBars.delete(tileKey);
    this.countdownTexts.get(tileKey)?.destroy();
    this.countdownTexts.delete(tileKey);
  }

  private persist() {
    saveGame(this.gameState);
  }

  private emitGameState() {
    this.game.events.emit("gameStateUpdate", this.gameState);
  }

  /**
   * Vẽ 1 ô đất isometric (hình thoi) bằng Graphics
   */
  private drawIsometricTile(gridX: number, gridY: number, origin: { x: number; y: number }) {
    const { tileWidth, tileHeight } = GAME_CONFIG.grid;
    const { soil, soilDark, highlight } = GAME_CONFIG.colors;

    // Chuyển đổi tọa độ grid sang isometric
    const isoPos = gridToIsometric(gridX, gridY);
    const x = origin.x + isoPos.x;
    const y = origin.y + isoPos.y;

    // Container cho tile
    const tileContainer = this.add.container(x, y);
    const tileKey = `${gridX},${gridY}`;
    this.tiles.set(tileKey, tileContainer);

    // 1. Vẽ shadow (ellipse dưới đáy)
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.2);
    shadow.fillEllipse(0, tileHeight / 2 + 5, tileWidth * 0.6, tileHeight * 0.3);
    tileContainer.add(shadow);

    // 2. Vẽ soil (hình thoi với gradient)
    const soilGraphic = this.add.graphics();

    // Gradient màu từ sáng (top) xuống tối (bottom)
    soilGraphic.fillGradientStyle(soil, soil, soilDark, soilDark, 1);

    // Vẽ hình thoi (diamond)
    const points = [
      { x: 0, y: -tileHeight / 2 },
      { x: tileWidth / 2, y: 0 },
      { x: 0, y: tileHeight / 2 },
      { x: -tileWidth / 2, y: 0 },
    ];

    soilGraphic.beginPath();
    soilGraphic.moveTo(points[0].x, points[0].y);
    points.forEach((p) => soilGraphic.lineTo(p.x, p.y));
    soilGraphic.closePath();
    soilGraphic.fillPath();

    tileContainer.add(soilGraphic);

    // 3. Vẽ highlight (viền sáng phía trên)
    const highlightGraphic = this.add.graphics();
    highlightGraphic.lineStyle(1, highlight, 0.3);
    highlightGraphic.beginPath();
    highlightGraphic.moveTo(0, -tileHeight / 2);
    highlightGraphic.lineTo(tileWidth / 2, 0);
    highlightGraphic.strokePath();
    tileContainer.add(highlightGraphic);

    // 4. Vẽ grass border (viền cỏ xanh)
    const grassBorder = this.add.graphics();
    grassBorder.lineStyle(4, 0x8bc34a, 1.0);
    grassBorder.beginPath();
    grassBorder.moveTo(points[0].x, points[0].y);
    points.forEach((p) => grassBorder.lineTo(p.x, p.y));
    grassBorder.closePath();
    grassBorder.strokePath();
    tileContainer.add(grassBorder);

    // 5. Vẽ texture dots (chấm đất)
    const dotsGraphic = this.add.graphics();
    dotsGraphic.fillStyle(0x8b6f47, 0.3);
    for (let i = 0; i < 15; i++) {
      const dotX = (Math.random() - 0.5) * (tileWidth * 0.7);
      const dotY = (Math.random() - 0.5) * (tileHeight * 0.7);
      dotsGraphic.fillCircle(dotX, dotY, 1.5);
    }
    tileContainer.add(dotsGraphic);

    // Make tile interactive
    const hitArea = new Phaser.Geom.Polygon([
      new Phaser.Math.Vector2(0, -tileHeight / 2),
      new Phaser.Math.Vector2(tileWidth / 2, 0),
      new Phaser.Math.Vector2(0, tileHeight / 2),
      new Phaser.Math.Vector2(-tileWidth / 2, 0),
    ]);

    tileContainer.setInteractive(hitArea, Phaser.Geom.Polygon.Contains);

    // Hover effect
    tileContainer.on("pointerover", () => {
      tileContainer.setScale(1.05);
    });

    tileContainer.on("pointerout", () => {
      tileContainer.setScale(1.0);
    });

    // Click handler
    tileContainer.on("pointerdown", () => {
      this.handleTileClick(gridX, gridY);
    });
  }

  /**
   * Xử lý khi click vào tile
   */
  private handleTileClick(gridX: number, gridY: number) {
    console.log(`🖱️ Tile clicked at [${gridX}, ${gridY}]`);

    const plot = this.getPlot(gridX, gridY);
    if (!plot) return;

    if (plot.state === "LOCKED") {
      // Phase 10: Sequential unlock - Chỉ mở ô LOCKED tiếp theo
      const index = gridY * GAME_CONFIG.grid.cols + gridX;
      const nextLockedIndex = this.gameState.plots.findIndex((p) => p.state === "LOCKED");

      if (index !== nextLockedIndex) {
        // Click vào ô LOCKED không phải lượt kế tiếp
        console.log(`❌ Cannot unlock plot ${index}. Next locked: ${nextLockedIndex}`);
        this.showFloatingText(gridX, gridY, "Hãy mở các ô trước!", 0xff3333);
        return;
      }

      // Ô LOCKED tiếp theo → Show unlock dialog
      this.showUnlockDialog(gridX, gridY);
    } else if (plot.state === "EMPTY") {
      // Plant crop - dùng selectedSeed từ BottomBar
      this.plantCrop(gridX, gridY);
    } else if (plot.state === "HARVEST") {
      // Harvest crop
      this.harvestCrop(gridX, gridY);
    } else {
      // GROWING - không làm gì
      console.log(`🌱 Cây đang lớn... còn ${Math.ceil((plot.nextStageAt! - Date.now()) / 1000)}s`);
    }
  }

  /**
   * Show floating text at tile position
   */
  private showFloatingText(gridX: number, gridY: number, text: string, color: number) {
    const isoPos = gridToIsometric(gridX, gridY);
    const origin = getIsometricOrigin();
    const x = origin.x + isoPos.x;
    const y = origin.y + isoPos.y - 40; // Offset lên trên

    const floatingText = this.add
      .text(x, y, text, {
        fontSize: "16px",
        fontFamily: "Arial, sans-serif",
        color: `#${color.toString(16).padStart(6, "0")}`,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(1000);

    // Tween bay lên + fade out
    this.tweens.add({
      targets: floatingText,
      y: y - 50,
      alpha: 0,
      duration: 1500,
      ease: "Power2",
      onComplete: () => floatingText.destroy(),
    });
  }

  // ===== PUBLIC API for Quest System (Phase 12) =====

  /**
   * Public: Update quest progress
   */
  public updateQuestProgress(targetType: string, amount: number = 1) {
    let updated = false;

    this.gameState.quests.forEach((quest) => {
      if (quest.targetType === targetType && !quest.isCompleted) {
        quest.current = Math.min(quest.current + amount, quest.target);

        // Check if completed
        if (quest.current >= quest.target && !quest.isCompleted) {
          quest.isCompleted = true;
          updated = true;

          // Show floating text
          this.showFloatingText(450, 275, `✅ Nhiệm vụ hoàn thành: ${quest.title}`, 0x4caf50);

          console.log(`✅ Quest completed: ${quest.title}`);
        }
      }
    });

    if (updated) {
      this.persist();
      this.emitGameState();
    }
  }

  /**
   * Public: Claim quest reward
   */
  public claimQuestReward(questId: string): boolean {
    const quest = this.gameState.quests.find((q) => q.id === questId);

    if (!quest) {
      console.error(`❌ Quest not found: ${questId}`);
      return false;
    }

    if (!quest.isCompleted) {
      console.log(`⚠️ Quest not completed yet: ${quest.title}`);
      return false;
    }

    if (quest.isClaimed) {
      console.log(`⚠️ Quest reward already claimed: ${quest.title}`);
      return false;
    }

    // Thưởng coins và EXP
    this.gameState.coins += quest.rewardCoins;
    this.addExp(quest.rewardExp);
    quest.isClaimed = true;

    this.persist();
    this.emitGameState();

    // Show floating text
    this.showFloatingText(450, 275, `🎁 +${quest.rewardCoins}💰 +${quest.rewardExp}⭐`, 0xffd700);

    console.log(
      `🎁 Claimed reward for "${quest.title}": +${quest.rewardCoins}💰 +${quest.rewardExp}⭐`,
    );
    return true;
  }

  // ===== PUBLIC API for Level & EXP System (Phase 11) =====

  /**
   * Public: Add EXP and handle level-up
   */
  public addExp(amount: number) {
    this.gameState.exp += amount;
    console.log(`⭐ +${amount} EXP (${this.gameState.exp}/${this.gameState.expToNextLevel})`);

    // Vòng lặp kiểm tra thăng cấp (có thể lên nhiều cấp cùng lúc)
    let leveledUp = false;
    while (this.gameState.exp >= this.gameState.expToNextLevel) {
      // Lên cấp
      this.gameState.level++;
      this.gameState.exp -= this.gameState.expToNextLevel;

      // Cập nhật EXP cần cho level tiếp theo
      this.gameState.expToNextLevel = GAME_CONFIG.balance.getExpForLevel(this.gameState.level);

      // Thưởng coin khi lên cấp
      const bonus = GAME_CONFIG.balance.levelUpCoinBonus(this.gameState.level);
      this.gameState.coins += bonus;

      leveledUp = true;
      console.log(
        `🎉 LEVEL UP! Cấp ${this.gameState.level} | Thưởng: ${bonus}💰 | EXP tiếp theo: ${this.gameState.expToNextLevel}`,
      );

      // Show floating text giữa màn hình
      this.showLevelUpText(this.gameState.level, bonus);
    }

    if (leveledUp) {
      this.persist();
      this.emitGameState();
    }
  }

  /**
   * Show level-up floating text at screen center
   */
  private showLevelUpText(level: number, bonus: number) {
    const centerX = 450;
    const centerY = 275;

    // Main text: "🎉 LEVEL UP!"
    const mainText = this.add
      .text(centerX, centerY - 20, "🎉 LEVEL UP!", {
        fontSize: "48px",
        fontFamily: "Arial, sans-serif",
        color: "#ffd700",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 6,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(2000)
      .setScale(0);

    // Sub text: "Cấp X | +Y💰"
    const subText = this.add
      .text(centerX, centerY + 30, `Cấp ${level} | +${bonus}💰`, {
        fontSize: "24px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(2000)
      .setAlpha(0);

    // Animation: Scale in + fade out
    this.tweens.add({
      targets: mainText,
      scale: 1.2,
      duration: 500,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: mainText,
          alpha: 0,
          y: centerY - 60,
          duration: 1500,
          delay: 1000,
          ease: "Power2",
          onComplete: () => mainText.destroy(),
        });
      },
    });

    this.tweens.add({
      targets: subText,
      alpha: 1,
      duration: 500,
      delay: 500,
      onComplete: () => {
        this.tweens.add({
          targets: subText,
          alpha: 0,
          y: centerY + 70,
          duration: 1500,
          delay: 1000,
          ease: "Power2",
          onComplete: () => subText.destroy(),
        });
      },
    });
  }

  // ===== PUBLIC API for Modals (Phase 9) =====

  /**
   * Public: Buy seeds (called from ShopModal)
   */
  public buySeed(cropType: CropType, quantity: number): boolean {
    const config = GAME_CONFIG.crops[cropType];
    const totalCost = config.seedCost * quantity;

    if (this.gameState.coins < totalCost) {
      return false;
    }

    this.gameState.coins -= totalCost;
    this.gameState.seeds[cropType] += quantity;

    this.persist();
    this.emitGameState();

    return true;
  }

  /**
   * Public: Sell crop (called from StorageModal)
   */
  public sellCrop(cropType: CropType, quantity: number): boolean {
    const available = this.gameState.storage[cropType];
    if (available <= 0) return false;

    const actualQty = Math.min(quantity, available);
    const config = GAME_CONFIG.crops[cropType];
    const totalCoins = config.harvestCoins * actualQty;

    this.gameState.storage[cropType] -= actualQty;
    this.gameState.coins += totalCoins;

    // Phase 12: Update quest progress - EARN_COINS
    this.updateQuestProgress("EARN_COINS", totalCoins);

    this.checkQuestProgress("coins");
    this.persist();
    this.emitGameState();

    return true;
  }

  // ===== PUBLIC API for Land Expansion (Phase 10) =====

  /**
   * Public: Unlock a LOCKED plot
   */
  public unlockPlot(index: number): boolean {
    if (index < 0 || index >= this.gameState.plots.length) {
      console.error(`❌ Invalid plot index: ${index}`);
      return false;
    }

    const plot = this.gameState.plots[index];
    if (plot.state !== "LOCKED") {
      console.log(`⚠️ Plot ${index} is not LOCKED (current state: ${plot.state})`);
      return false;
    }

    const cost = GAME_CONFIG.unlockCosts[index];
    if (this.gameState.coins < cost) {
      console.log(`❌ Không đủ xu! Cần ${cost}💰, còn ${this.gameState.coins}💰`);
      return false;
    }

    // Trừ tiền và mở khóa
    this.gameState.coins -= cost;
    plot.state = "EMPTY";

    // Phase 11: Add EXP for unlocking plot
    this.addExp(GAME_CONFIG.balance.expPerUnlock);

    // Phase 12: Update quest progress - UNLOCK_PLOT
    this.updateQuestProgress("UNLOCK_PLOT", 1);

    this.persist();
    this.emitGameState();

    console.log(
      `✅ Đã mở khóa ô đất ${index} (${plot.gridX}, ${plot.gridY})! Trừ ${cost}💰 +${GAME_CONFIG.balance.expPerUnlock}⭐`,
    );

    // === Cập nhật UI dây chuyền ===
    // 1. Xóa lock overlay + icon + cost text của ô vừa mở
    const tileKey = `${plot.gridX},${plot.gridY}`;
    const tile = this.tiles.get(tileKey);
    if (tile) {
      // Xóa các child có name "lock-*"
      tile.each((child: Phaser.GameObjects.GameObject) => {
        if (
          child.name === "lock-overlay" ||
          child.name === "lock-icon" ||
          child.name === "lock-cost" ||
          child.name === "lock-icon-distant"
        ) {
          child.destroy();
        }
      });
      // Reset depth về bình thường
      tile.setDepth(0);
      console.log(`🧹 Đã xóa lock UI của plot ${index}`);
    }

    // 2. Render lại ô LOCKED tiếp theo (nếu có)
    const nextLockedIndex = this.gameState.plots.findIndex((p) => p.state === "LOCKED");
    if (nextLockedIndex !== -1) {
      const nextPlot = this.gameState.plots[nextLockedIndex];
      const nextTileKey = `${nextPlot.gridX},${nextPlot.gridY}`;
      const nextTile = this.tiles.get(nextTileKey);

      if (nextTile) {
        // Xóa lock UI cũ (icon xám mờ)
        nextTile.each((child: Phaser.GameObjects.GameObject) => {
          if (
            child.name === "lock-overlay" ||
            child.name === "lock-icon" ||
            child.name === "lock-icon-distant"
          ) {
            child.destroy();
          }
        });

        // Render lại với icon vàng + giá tiền
        this.renderLockedPlot(nextTile, nextLockedIndex);
        console.log(`✨ Đã render lại ô LOCKED tiếp theo: ${nextLockedIndex}`);
      }
    }

    return true;
  }

  /**
   * Show unlock confirmation dialog
   */
  private showUnlockDialog(gridX: number, gridY: number) {
    const index = gridY * GAME_CONFIG.grid.cols + gridX;
    const cost = GAME_CONFIG.unlockCosts[index];

    console.log(`🔓 Showing unlock dialog for plot ${index} (cost: ${cost}💰)`);

    // Overlay mờ
    const overlay = this.add.rectangle(450, 275, 900, 550, 0x000000, 0.7);
    overlay.setDepth(100);

    // Dialog container
    const dialogW = 400;
    const dialogH = 200;
    const dialogX = 450;
    const dialogY = 275;

    // Background
    const dialogBg = this.add.rectangle(dialogX, dialogY, dialogW, dialogH, 0x2c3e50);
    dialogBg.setStrokeStyle(4, 0x3498db);
    dialogBg.setDepth(101);

    // Title
    const title = this.add
      .text(dialogX, dialogY - 60, "🔓 Mở khóa ô đất", {
        fontSize: "24px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(102);

    // Message
    const message = this.add
      .text(dialogX, dialogY - 10, `Bạn có muốn mở khóa ô đất này?\nGiá: ${cost}💰`, {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: "#ecf0f1",
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(102);

    // Button: Mở Khóa (Rectangle + setInteractive trực tiếp)
    const unlockBtnW = 140;
    const unlockBtnH = 50;
    const unlockBtnX = dialogX - 80;
    const unlockBtnY = dialogY + 60;

    const unlockBtn = this.add
      .rectangle(unlockBtnX, unlockBtnY, unlockBtnW, unlockBtnH, 0x27ae60)
      .setStrokeStyle(2, 0x1e8449)
      .setInteractive({ useHandCursor: true })
      .setDepth(102);

    const unlockText = this.add
      .text(unlockBtnX, unlockBtnY, "Mở Khóa", {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(103);

    unlockBtn.on("pointerdown", () => {
      console.log(`👉 ĐÃ CLICK MỞ KHÓA: plot ${index}`);
      const success = this.unlockPlot(index);
      if (success) {
        // Đóng dialog
        overlay.destroy();
        dialogBg.destroy();
        title.destroy();
        message.destroy();
        unlockBtn.destroy();
        unlockText.destroy();
        cancelBtn.destroy();
        cancelText.destroy();

        // Redraw tile as EMPTY
        this.updateLockedPlotVisual(gridX, gridY);
      }
    });

    unlockBtn.on("pointerover", () => unlockBtn.setFillStyle(0x2ecc71));
    unlockBtn.on("pointerout", () => unlockBtn.setFillStyle(0x27ae60));

    // Button: Hủy
    const cancelBtnW = 140;
    const cancelBtnH = 50;
    const cancelBtnX = dialogX + 80;
    const cancelBtnY = dialogY + 60;

    const cancelBtn = this.add
      .rectangle(cancelBtnX, cancelBtnY, cancelBtnW, cancelBtnH, 0x95a5a6)
      .setStrokeStyle(2, 0x7f8c8d)
      .setInteractive({ useHandCursor: true })
      .setDepth(102);

    const cancelText = this.add
      .text(cancelBtnX, cancelBtnY, "Hủy", {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(103);

    cancelBtn.on("pointerdown", () => {
      console.log(`👉 ĐÃ CLICK HỦY`);
      overlay.destroy();
      dialogBg.destroy();
      title.destroy();
      message.destroy();
      unlockBtn.destroy();
      unlockText.destroy();
      cancelBtn.destroy();
      cancelText.destroy();
    });

    cancelBtn.on("pointerover", () => cancelBtn.setFillStyle(0xbdc3c7));
    cancelBtn.on("pointerout", () => cancelBtn.setFillStyle(0x95a5a6));
  }

  /**
   * Update visual when plot is unlocked
   */
  private updateLockedPlotVisual(gridX: number, gridY: number) {
    const tileKey = `${gridX},${gridY}`;
    const tileContainer = this.tiles.get(tileKey);
    if (!tileContainer) return;

    // Remove lock icon and cost text
    tileContainer.each((child: Phaser.GameObjects.GameObject) => {
      if (child.name === "lock-icon" || child.name === "lock-cost") {
        child.destroy();
      }
    });

    // Repaint soil as normal EMPTY state
    const { soil } = GAME_CONFIG.colors;
    const soilGraphics = tileContainer.getAll().find((obj) => obj.type === "Graphics");
    if (soilGraphics && soilGraphics instanceof Phaser.GameObjects.Graphics) {
      soilGraphics.clear();
      soilGraphics.fillStyle(soil, 1);
      const { tileWidth, tileHeight } = GAME_CONFIG.grid;
      soilGraphics.fillPoints(
        [
          new Phaser.Math.Vector2(0, 0),
          new Phaser.Math.Vector2(tileWidth / 2, tileHeight / 2),
          new Phaser.Math.Vector2(0, tileHeight),
          new Phaser.Math.Vector2(-tileWidth / 2, tileHeight / 2),
        ],
        true,
      );
    }
  }

  /**
   * Phase 10: Render LOCKED plot overlay (icon + cost)
   */
  private renderLockedPlot(tileContainer: Phaser.GameObjects.Container, index: number) {
    const cost = GAME_CONFIG.unlockCosts[index];
    const { tileWidth, tileHeight } = GAME_CONFIG.grid;

    // Xác định ô tiếp theo được mở
    const nextLockedIndex = this.gameState.plots.findIndex((p) => p.state === "LOCKED");
    const isNextUnlock = index === nextLockedIndex;

    console.log(`🔒 Rendering LOCKED plot ${index}, cost: ${cost}💰, isNext: ${isNextUnlock}`);

    // 1. Nền tối cho mọi ô LOCKED
    const darkOverlay = this.add.graphics();
    const overlayAlpha = isNextUnlock ? 0.75 : 0.85; // Ô tiếp theo sáng hơn
    const overlayColor = isNextUnlock ? 0x2c3e50 : 0x1a252f; // Ô tiếp theo xám nhạt, xa hơn đen hơn
    darkOverlay.fillStyle(overlayColor, overlayAlpha);
    darkOverlay.fillPoints(
      [
        new Phaser.Math.Vector2(0, -tileHeight / 2),
        new Phaser.Math.Vector2(tileWidth / 2, 0),
        new Phaser.Math.Vector2(0, tileHeight / 2),
        new Phaser.Math.Vector2(-tileWidth / 2, 0),
      ],
      true,
    );
    darkOverlay.setName("lock-overlay");
    tileContainer.add(darkOverlay);

    if (isNextUnlock) {
      // === Ô TIẾP THEO ĐƯỢC MỞ: Icon vàng + giá tiền + hover + click ===

      // 2. Vẽ icon ổ khóa bằng Graphics (màu vàng nổi bật)
      const lockGraphics = this.add.graphics();

      // Thân khóa (hình chữ nhật màu vàng)
      lockGraphics.fillStyle(0xffd700, 1); // Vàng
      lockGraphics.fillRect(-8, -5, 16, 12); // Thân khóa 16x12px

      // Cùm khóa (arc màu vàng)
      lockGraphics.lineStyle(3, 0xffd700, 1);
      lockGraphics.strokeCircle(0, -8, 6); // Cùm tròn radius 6px

      // Lỗ khóa (chấm đen nhỏ)
      lockGraphics.fillStyle(0x000000, 1);
      lockGraphics.fillCircle(0, 0, 2); // Chấm đen 2px

      lockGraphics.setName("lock-icon");
      tileContainer.add(lockGraphics);

      // 3. Text giá tiền (vàng rực với stroke đen dày)
      const costText = this.add
        .text(0, 20, `${cost}💰`, {
          fontSize: "18px",
          fontFamily: "Arial, sans-serif",
          color: "#ffd700",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 4,
        })
        .setOrigin(0.5, 0.5)
        .setName("lock-cost");
      tileContainer.add(costText);

      // 4. Hover effect - Làm sáng khi hover
      tileContainer.on("pointerover", () => {
        darkOverlay.clear();
        darkOverlay.fillStyle(0x34495e, 0.65); // Sáng hơn khi hover
        darkOverlay.fillPoints(
          [
            new Phaser.Math.Vector2(0, -tileHeight / 2),
            new Phaser.Math.Vector2(tileWidth / 2, 0),
            new Phaser.Math.Vector2(0, tileHeight / 2),
            new Phaser.Math.Vector2(-tileWidth / 2, 0),
          ],
          true,
        );
        lockGraphics.setScale(1.15); // Icon phóng to
        costText.setScale(1.1);
      });

      tileContainer.on("pointerout", () => {
        darkOverlay.clear();
        darkOverlay.fillStyle(overlayColor, overlayAlpha); // Trở về tối
        darkOverlay.fillPoints(
          [
            new Phaser.Math.Vector2(0, -tileHeight / 2),
            new Phaser.Math.Vector2(tileWidth / 2, 0),
            new Phaser.Math.Vector2(0, tileHeight / 2),
            new Phaser.Math.Vector2(-tileWidth / 2, 0),
          ],
          true,
        );
        lockGraphics.setScale(1.0);
        costText.setScale(1.0);
      });

      // 5. Đưa Container lên depth cao để nổi bật
      tileContainer.setDepth(10);
    } else {
      // === Các ô LOCKED xa hơn: Chỉ icon khóa nhỏ màu xám mờ, KHÔNG có giá tiền ===

      // Icon khóa nhỏ màu xám mờ
      const lockGraphics = this.add.graphics();
      lockGraphics.fillStyle(0x95a5a6, 0.5); // Xám mờ alpha 0.5
      lockGraphics.fillRect(-6, -4, 12, 9); // Thân khóa nhỏ hơn

      lockGraphics.lineStyle(2, 0x95a5a6, 0.5);
      lockGraphics.strokeCircle(0, -6, 4); // Cùm nhỏ hơn

      lockGraphics.fillStyle(0x000000, 0.3);
      lockGraphics.fillCircle(0, 0, 1.5); // Lỗ khóa nhỏ

      lockGraphics.setName("lock-icon-distant");
      tileContainer.add(lockGraphics);

      // Không có hover effect và không có depth cao
      tileContainer.setDepth(5); // Depth thấp hơn
    }

    console.log(`✅ LOCKED plot ${index} rendered (isNext: ${isNextUnlock})`);
  }
}
