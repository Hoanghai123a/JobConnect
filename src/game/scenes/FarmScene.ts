/**
 * FarmScene - Phase 3
 * Growth Timer System + Harvest Mechanics + Fallback Graphics
 */

import Phaser from "phaser";
import { GAME_CONFIG } from "../config/game";
import { gridToIsometric, getIsometricOrigin } from "../utils/isometricHelper";
import { FallbackGraphics } from "../utils/fallbackGraphics";
import type { Plot, GameState, CropType, GrowthStage } from "../types";

export class FarmScene extends Phaser.Scene {
  private gameState!: GameState;
  private tiles: Map<string, Phaser.GameObjects.Container> = new Map();
  private cropGraphics: Map<string, Phaser.GameObjects.GameObject> = new Map();
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
    // Initialize game state
    this.initGameState();

    // Lấy origin point để center grid
    const origin = getIsometricOrigin();

    // Vẽ grid 4x3
    for (let row = 0; row < GAME_CONFIG.grid.rows; row++) {
      for (let col = 0; col < GAME_CONFIG.grid.cols; col++) {
        this.drawIsometricTile(col, row, origin);
      }
    }

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
    const { initialCoins, initialLevel, expPerLevel } = GAME_CONFIG.balance;
    const plots: Plot[] = [];

    // Initialize all plots as EMPTY
    for (let row = 0; row < GAME_CONFIG.grid.rows; row++) {
      for (let col = 0; col < GAME_CONFIG.grid.cols; col++) {
        plots.push({
          gridX: col,
          gridY: row,
          state: "EMPTY",
        });
      }
    }

    this.gameState = {
      coins: initialCoins,
      level: initialLevel,
      exp: 0,
      expToNextLevel: expPerLevel,
      plots,
    };
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

    const cropConfig = GAME_CONFIG.crops[plot.cropType];
    const currentStageIndex = cropConfig.stages.indexOf(plot.growthStage);
    const nextStageIndex = currentStageIndex + 1;

    if (nextStageIndex >= cropConfig.stages.length) return;

    const nextStage = cropConfig.stages[nextStageIndex];
    plot.growthStage = nextStage;

    // Nếu chưa đến HARVEST, setup timer cho stage tiếp
    if (nextStage !== "HARVEST") {
      plot.nextStageAt = Date.now() + cropConfig.stageTime * 1000;
    } else {
      // Đã HARVEST - dừng timer
      plot.state = "HARVEST";
      plot.nextStageAt = undefined;

      // Xóa progress bar và countdown
      const tileKey = `${gridX},${gridY}`;
      const progressBar = this.progressBars.get(tileKey);
      const countdownText = this.countdownTexts.get(tileKey);
      if (progressBar) {
        progressBar.destroy();
        this.progressBars.delete(tileKey);
      }
      if (countdownText) {
        countdownText.destroy();
        this.countdownTexts.delete(tileKey);
      }
    }

    // Update visual
    this.updateCropVisual(gridX, gridY);

    console.log(`🌱 Crop [${gridX}, ${gridY}] → ${nextStage}`);
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

    // XÓA TẤT CẢ CROP VISUALS CŨ (sprites + graphics)
    const oldVisual = this.cropGraphics.get(tileKey);
    if (oldVisual) {
      oldVisual.destroy();
      this.cropGraphics.delete(tileKey);
    }

    // Thử load sprite, fallback về graphics
    const spriteKey = `${plot.cropType}_${plot.growthStage.toLowerCase()}`;
    let cropVisual: Phaser.GameObjects.GameObject;

    if (this.textures.exists(spriteKey)) {
      // Sprite tồn tại - dùng sprite
      const sprite = this.add.sprite(0, -20, spriteKey);
      sprite.setOrigin(0.5, 1);
      sprite.setScale(0.8);
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

    tile.add(cropVisual);

    // Animation pop in
    this.tweens.add({
      targets: cropVisual,
      scaleX: { from: 0, to: 1 },
      scaleY: { from: 0, to: 1 },
      duration: 300,
      ease: "Back.easeOut",
    });

    // HARVEST stage: Thêm bounce animation liên tục
    if (plot.growthStage === "HARVEST") {
      this.tweens.add({
        targets: cropVisual,
        y: cropVisual.y - 5,
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

    // Check coins
    if (this.gameState.coins < cropConfig.seedCost) {
      console.log("❌ Không đủ xu!");
      return;
    }

    // Deduct coins
    this.gameState.coins -= cropConfig.seedCost;

    // Update plot state
    plot.state = "GROWING";
    plot.plantedAt = Date.now();
    plot.cropType = cropType;
    plot.growthStage = "SEED";
    plot.nextStageAt = Date.now() + cropConfig.stageTime * 1000;

    // Đổi màu ô đất (darker)
    const tileKey = `${gridX},${gridY}`;
    const tile = this.tiles.get(tileKey);
    if (tile) {
      const soil = tile.getAt(1) as Phaser.GameObjects.Graphics;
      soil.clear();

      // Redraw darker soil
      const { tileWidth, tileHeight } = GAME_CONFIG.grid;
      const points = [
        { x: 0, y: -tileHeight / 2 },
        { x: tileWidth / 2, y: 0 },
        { x: 0, y: tileHeight / 2 },
        { x: -tileWidth / 2, y: 0 },
      ];

      soil.fillGradientStyle(0x6d4c41, 0x6d4c41, 0x4a2c2a, 0x4a2c2a, 1);
      soil.beginPath();
      soil.moveTo(points[0].x, points[0].y);
      points.forEach((p) => soil.lineTo(p.x, p.y));
      soil.closePath();
      soil.fillPath();

      // Grass border
      soil.lineStyle(3, 0x8bc34a, 1.0);
      soil.strokePath();
    }

    // Draw initial crop
    this.updateCropVisual(gridX, gridY);

    // Add progress bar
    const progressBar = FallbackGraphics.drawProgressBar(this, 0);
    tile?.add(progressBar);
    this.progressBars.set(tileKey, progressBar);

    // Add countdown text
    const countdownText = FallbackGraphics.drawCountdownText(this, cropConfig.stageTime);
    tile?.add(countdownText);
    this.countdownTexts.set(tileKey, countdownText);

    this.emitGameState();
    console.log(`✅ Planted ${cropType} at [${gridX}, ${gridY}]`);
  }

  /**
   * Harvest crop
   */
  private harvestCrop(gridX: number, gridY: number) {
    const plot = this.getPlot(gridX, gridY);
    if (!plot || plot.state !== "HARVEST" || !plot.cropType) return;

    const cropConfig = GAME_CONFIG.crops[plot.cropType];
    const tile = this.tiles.get(`${gridX},${gridY}`);
    if (!tile) return;

    // Get screen position for floating text
    const screenPos = gridToIsometric(gridX, gridY);
    const origin = getIsometricOrigin();

    // Add coins and exp
    this.gameState.coins += cropConfig.harvestCoins;
    this.gameState.exp += cropConfig.harvestExp;

    // Check level up
    if (this.gameState.exp >= this.gameState.expToNextLevel) {
      this.gameState.level++;
      this.gameState.exp = 0;
      this.gameState.expToNextLevel = GAME_CONFIG.balance.expPerLevel * this.gameState.level;

      // Floating text level up
      FallbackGraphics.createFloatingText(
        this,
        origin.x + screenPos.x,
        origin.y + screenPos.y - 60,
        "LEVEL UP!",
        "#ff9800"
      );
    }

    // Floating coins text
    FallbackGraphics.createFloatingText(
      this,
      origin.x + screenPos.x - 20,
      origin.y + screenPos.y - 40,
      `+${cropConfig.harvestCoins} 💰`,
      "#ffd700"
    );

    // Floating exp text
    FallbackGraphics.createFloatingText(
      this,
      origin.x + screenPos.x + 20,
      origin.y + screenPos.y - 40,
      `+${cropConfig.harvestExp} ⭐`,
      "#4caf50"
    );

    // Remove crop visual
    const tileKey = `${gridX},${gridY}`;
    const oldGraphic = this.cropGraphics.get(tileKey);
    if (oldGraphic) {
      this.tweens.add({
        targets: oldGraphic,
        alpha: 0,
        scaleX: 1.5,
        scaleY: 1.5,
        duration: 300,
        ease: "Back.easeIn",
        onComplete: () => {
          oldGraphic.destroy();
          this.cropGraphics.delete(tileKey);
        },
      });
    }

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

    this.emitGameState();
    console.log(`✅ Harvested ${cropConfig.name}! +${cropConfig.harvestCoins}💰 +${cropConfig.harvestExp}⭐`);
  }

  private emitGameState() {
    this.game.events.emit("gameStateUpdate", this.gameState);
  }

  private initGameState() {
    const { initialCoins, initialLevel, expPerLevel } = GAME_CONFIG.balance;
    const plots: Plot[] = [];

    // Initialize all plots as EMPTY
    for (let row = 0; row < GAME_CONFIG.grid.rows; row++) {
      for (let col = 0; col < GAME_CONFIG.grid.cols; col++) {
        plots.push({
          gridX: col,
          gridY: row,
          state: "EMPTY",
        });
      }
    }

    this.gameState = {
      coins: initialCoins,
      level: initialLevel,
      exp: 0,
      expToNextLevel: expPerLevel,
      plots,
    };
  }

  private getPlot(gridX: number, gridY: number): Plot | undefined {
    return this.gameState.plots.find((p) => p.gridX === gridX && p.gridY === gridY);
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

    if (plot.state === "EMPTY") {
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
}
