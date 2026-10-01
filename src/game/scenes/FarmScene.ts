import Phaser from "phaser";
import { useGameStore } from "../stores/gameStore";
import { GAME_CONFIG } from "../config/game";
import { ParticleService } from "../services/particleService";
import { CROPS } from "../config/crops";
import { ASSETS } from "../config/assets";
import { gridToIsometric, getIsometricOrigin } from "../utils/isometricHelper";

export class FarmScene extends Phaser.Scene {
  private plotGraphics: Map<number, Phaser.GameObjects.Container> = new Map();
  private selectedPlotId: number | null = null;

  // Swipe detection
  private swipeStartPos: { x: number; y: number } | null = null;
  private swipeStartTime: number = 0;
  private swipePlotId: number | null = null;
  private readonly SWIPE_MIN_DISTANCE = 30; // pixels
  private readonly SWIPE_MAX_TIME = 300; // milliseconds

  constructor() {
    super({ key: "FarmScene" });
  }

  preload() {
    // Initialize particle textures
    ParticleService.initParticles(this);

    // Load all crop sprites (15 crops × 2 states = 30 sprites)
    Object.keys(CROPS).forEach((cropId) => {
      const seedKey = `${cropId}_seed`;
      const readyKey = `${cropId}_ready`;

      // Load seed sprite
      if (ASSETS.crops[seedKey]) {
        this.load.image(seedKey, ASSETS.crops[seedKey]);
      }

      // Load ready sprite
      if (ASSETS.crops[readyKey]) {
        this.load.image(readyKey, ASSETS.crops[readyKey]);
      }
    });
  }

  create() {
    this.createBackground();
    this.createFarmLayout();
    this.setupUpdateLoop();

    // Subscribe to store changes
    useGameStore.subscribe(() => {
      this.updatePlotsVisuals();
    });
  }

  private createBackground() {
    // Grass background
    const grass = this.add.rectangle(400, 300, 800, 600, 0x5a8f3a);

    // Path decorations
    const pathColor = 0x8b7355;
    this.add.rectangle(400, 500, 600, 40, pathColor);
    this.add.rectangle(100, 300, 40, 400, pathColor);
  }

  private createFarmLayout() {
    const store = useGameStore.getState();
    const { isometric } = GAME_CONFIG.farm;
    const origin = getIsometricOrigin();

    store.plots.forEach((plot) => {
      // Convert grid coordinates to isometric screen position
      const isoPos = gridToIsometric(plot.x, plot.y);
      const screenX = origin.x + isoPos.x;
      const screenY = origin.y + isoPos.y;

      const container = this.createPlotVisual(plot.id, screenX, screenY);
      this.plotGraphics.set(plot.id, container);

      // Make interactive with diamond hitbox
      const hitArea = new Phaser.Geom.Polygon([
        0, -isometric.tileHeight / 2,          // Top
        isometric.tileWidth / 2, 0,            // Right
        0, isometric.tileHeight / 2,           // Bottom
        -isometric.tileWidth / 2, 0,           // Left
      ]);
      container.setInteractive(hitArea, Phaser.Geom.Polygon.Contains);

      // Setup swipe detection for harvest/care actions
      this.setupSwipeDetection(container, plot.id);

      container.on("pointerover", () => {
        this.highlightPlot(plot.id, true);
        // Scale up animation
        this.tweens.add({
          targets: container,
          scale: 1.05,
          duration: 150,
          ease: "Power2",
        });
      });

      container.on("pointerout", () => {
        if (this.selectedPlotId !== plot.id) {
          this.highlightPlot(plot.id, false);
        }
        // Scale back animation
        this.tweens.add({
          targets: container,
          scale: 1,
          duration: 150,
          ease: "Power2",
        });
      });

      container.on("pointerdown", () => {
        this.selectPlot(plot.id);
      });
    });
  }

  private createPlotVisual(plotId: number, x: number, y: number): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const { isometric, effects } = GAME_CONFIG.farm;
    const store = useGameStore.getState();
    const isUnlocked = store.isPlotUnlocked(plotId);

    // Shadow layer (drawn first, behind everything)
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.25);
    shadow.fillEllipse(0, isometric.tileHeight / 2 + 4, isometric.tileWidth * 0.85, isometric.tileHeight * 0.45);
    shadow.setName("shadow");

    // Diamond-shaped plot base with gradient (isometric tile)
    const soil = this.add.graphics();
    const baseColor = isUnlocked ? effects.soilDryColor : 0x4a4a4a;

    // Calculate gradient colors (lighter top, darker bottom for 3D effect)
    const topColor = Phaser.Display.Color.IntegerToColor(baseColor);
    const bottomColor = topColor.clone().darken(20);

    // Draw diamond shape with gradient
    soil.fillGradientStyle(
      topColor.color,      // Top-left
      topColor.color,      // Top-right
      bottomColor.color,   // Bottom-right
      bottomColor.color,   // Bottom-left
      1
    );

    // Subtle border
    soil.lineStyle(2, 0x654321, 0.8);
    soil.beginPath();
    soil.moveTo(0, -isometric.tileHeight / 2);              // Top
    soil.lineTo(isometric.tileWidth / 2, 0);                // Right
    soil.lineTo(0, isometric.tileHeight / 2);               // Bottom
    soil.lineTo(-isometric.tileWidth / 2, 0);               // Left
    soil.closePath();
    soil.fillPath();
    soil.strokePath();
    soil.setName("soil");

    // Add top highlight for extra depth
    const highlight3D = this.add.graphics();
    highlight3D.lineStyle(1.5, 0xffffff, 0.2);
    highlight3D.beginPath();
    highlight3D.moveTo(-2, -isometric.tileHeight / 2 + 1);
    highlight3D.lineTo(isometric.tileWidth / 2 - 2, -1);
    highlight3D.strokePath();
    highlight3D.setName("highlight3D");

    // Lock icon for locked plots
    const lockIcon = this.add.text(0, 0, "🔒", {
      fontSize: "24px",
    });
    lockIcon.setOrigin(0.5);
    lockIcon.setName("lockIcon");
    lockIcon.setVisible(!isUnlocked);

    // Highlight diamond (hidden by default)
    const highlight = this.add.graphics();
    highlight.lineStyle(3, 0xffff00, 0);
    highlight.beginPath();
    highlight.moveTo(0, -isometric.tileHeight / 2 - 2);
    highlight.lineTo(isometric.tileWidth / 2 + 2, 0);
    highlight.lineTo(0, isometric.tileHeight / 2 + 2);
    highlight.lineTo(-isometric.tileWidth / 2 - 2, 0);
    highlight.closePath();
    highlight.strokePath();
    highlight.setName("highlight");

    // Empty state: Plus icon (hidden by default)
    const plusIcon = this.add.text(0, 0, "+", {
      fontSize: "32px",
      color: "#ffffff",
      alpha: 0.3,
    });
    plusIcon.setOrigin(0.5);
    plusIcon.setName("plusIcon");
    plusIcon.setVisible(false);

    // Crop sprite placeholder (initially hidden)
    const cropSprite = this.add.sprite(0, -isometric.tileHeight / 4, "");
    cropSprite.setName("cropSprite");
    cropSprite.setVisible(false);
    cropSprite.setDisplaySize(isometric.tileWidth * 0.6, isometric.tileWidth * 0.6);

    // Progress bar for growing crops
    const progressBarBg = this.add.graphics();
    progressBarBg.setName("progressBarBg");
    progressBarBg.setVisible(false);

    const progressBarFill = this.add.graphics();
    progressBarFill.setName("progressBarFill");
    progressBarFill.setVisible(false);

    // Floating bubble for care events (water, pests, weeds)
    const careBubble = this.add.container(0, -isometric.tileHeight);
    const bubbleCircle = this.add.circle(0, 0, 16, 0xffffff, 0.95);
    bubbleCircle.setStrokeStyle(2, 0x333333);
    const bubbleIcon = this.add.text(0, 0, "", { fontSize: "20px" });
    bubbleIcon.setOrigin(0.5);
    careBubble.add([bubbleCircle, bubbleIcon]);
    careBubble.setName("careBubble");
    careBubble.setVisible(false);

    // Sparkle effect for ready crops
    const sparkles = this.add.particles(0, -isometric.tileHeight / 2, "particle-yellow", {
      speed: { min: 10, max: 30 },
      scale: { start: 0.3, end: 0 },
      lifespan: 600,
      frequency: 300,
      quantity: 2,
    });
    sparkles.setName("sparkles");
    sparkles.stop();

    // State text (growth timer)
    const stateText = this.add.text(0, isometric.tileHeight / 2 + 8, "", {
      fontSize: "11px",
      color: "#ffffff",
      backgroundColor: "#00000080",
      padding: { x: 4, y: 2 },
    });
    stateText.setOrigin(0.5);
    stateText.setName("stateText");

    container.add([
      shadow,
      soil,
      highlight3D,
      highlight,
      lockIcon,
      plusIcon,
      progressBarBg,
      progressBarFill,
      cropSprite,
      careBubble,
      sparkles,
      stateText,
    ]);
    container.setData("x", x);
    container.setData("y", y);
    return container;
  }

  private highlightPlot(plotId: number, show: boolean) {
    const container = this.plotGraphics.get(plotId);
    if (!container) return;

    const highlight = container.getByName("highlight") as Phaser.GameObjects.Graphics;
    if (highlight) {
      // Update stroke alpha for graphics object
      highlight.lineStyle(3, 0xffff00, show ? 1 : 0);
      highlight.clear();
      if (show) {
        const { isometric } = GAME_CONFIG.farm;
        highlight.beginPath();
        highlight.moveTo(0, -isometric.tileHeight / 2 - 2);
        highlight.lineTo(isometric.tileWidth / 2 + 2, 0);
        highlight.lineTo(0, isometric.tileHeight / 2 + 2);
        highlight.lineTo(-isometric.tileWidth / 2 - 2, 0);
        highlight.closePath();
        highlight.strokePath();
      }
    }
  }

  private selectPlot(plotId: number) {
    const store = useGameStore.getState();

    // Don't allow selecting locked plots
    if (!store.isPlotUnlocked(plotId)) {
      return;
    }

    // Clear previous selection
    if (this.selectedPlotId !== null) {
      this.highlightPlot(this.selectedPlotId, false);
    }

    this.selectedPlotId = plotId;
    this.highlightPlot(plotId, true);

    // Emit event for React UI to handle
    this.events.emit("plot-selected", plotId);
  }

  private updatePlotsVisuals() {
    const store = useGameStore.getState();

    store.plots.forEach((plot) => {
      const container = this.plotGraphics.get(plot.id);
      if (!container) return;

      const isUnlocked = store.isPlotUnlocked(plot.id);
      const soil = container.getByName("soil") as Phaser.GameObjects.Graphics;
      const lockIcon = container.getByName("lockIcon") as Phaser.GameObjects.Text;
      const plusIcon = container.getByName("plusIcon") as Phaser.GameObjects.Text;
      const cropSprite = container.getByName("cropSprite") as Phaser.GameObjects.Sprite;
      const progressBarBg = container.getByName("progressBarBg") as Phaser.GameObjects.Graphics;
      const progressBarFill = container.getByName("progressBarFill") as Phaser.GameObjects.Graphics;
      const careBubble = container.getByName("careBubble") as Phaser.GameObjects.Container;
      const sparkles = container.getByName("sparkles") as Phaser.GameObjects.ParticleEmitter;
      const stateText = container.getByName("stateText") as Phaser.GameObjects.Text;

      // Update soil color based on watered state
      if (soil) {
        const { isometric, effects } = GAME_CONFIG.farm;
        let soilColor = effects.soilDryColor;

        if (!isUnlocked) {
          soilColor = 0x4a4a4a; // Gray for locked
        } else if (plot.isWatered) {
          soilColor = effects.soilWetColor; // Dark brown when watered
        }

        soil.clear();
        soil.fillStyle(soilColor, 1);
        soil.lineStyle(2, 0x654321, 1);
        soil.beginPath();
        soil.moveTo(0, -isometric.tileHeight / 2);
        soil.lineTo(isometric.tileWidth / 2, 0);
        soil.lineTo(0, isometric.tileHeight / 2);
        soil.lineTo(-isometric.tileWidth / 2, 0);
        soil.closePath();
        soil.fillPath();
        soil.strokePath();
      }

      // Hide all elements by default
      lockIcon?.setVisible(false);
      plusIcon?.setVisible(false);
      cropSprite?.setVisible(false);
      progressBarBg?.setVisible(false);
      progressBarFill?.setVisible(false);
      careBubble?.setVisible(false);
      sparkles?.stop();
      stateText?.setVisible(false);

      // Render based on plot state
      if (plot.state === "LOCKED") {
        // State 5: LOCKED - Show lock icon
        lockIcon?.setVisible(true);

      } else if (plot.state === "EMPTY") {
        // State 1: EMPTY - Show plus icon hint
        if (isUnlocked) {
          plusIcon?.setVisible(true);
        }

      } else if (plot.state === "GROWING" && plot.crop) {
        // State 2: GROWING - Show crop sprite + progress bar
        const cropConfig = CROPS[plot.crop.cropId];
        if (!cropConfig) return;

        // Show crop sprite
        const spriteKey = `${plot.crop.cropId}_seed`;
        if (cropSprite && this.textures.exists(spriteKey)) {
          cropSprite.setTexture(spriteKey);
          cropSprite.setVisible(true);
        }

        // Draw progress bar
        const { isometric, ui } = GAME_CONFIG.farm;
        const barY = -isometric.tileHeight / 2 - 12;

        progressBarBg?.clear();
        progressBarBg?.fillStyle(0x333333, 0.8);
        progressBarBg?.fillRect(-ui.timerBarWidth / 2, barY, ui.timerBarWidth, ui.timerBarHeight);
        progressBarBg?.setVisible(true);

        // Calculate progress
        const now = Date.now();
        const totalTime = plot.crop.harvestAt - plot.crop.plantedAt;
        const elapsed = now - plot.crop.plantedAt;
        const progress = Math.min(1, elapsed / totalTime);

        progressBarFill?.clear();
        progressBarFill?.fillStyle(0x4caf50, 1);
        progressBarFill?.fillRect(-ui.timerBarWidth / 2, barY, ui.timerBarWidth * progress, ui.timerBarHeight);
        progressBarFill?.setVisible(true);

        // Show timer text
        const timeLeft = Math.max(0, plot.crop.harvestAt - now);
        const secondsLeft = Math.ceil(timeLeft / 1000);
        stateText?.setText(`${secondsLeft}s`);
        stateText?.setVisible(true);

      } else if (plot.state === "NEEDS_CARE" && plot.needsCare) {
        // State 3: NEEDS_CARE - Show crop + floating bubble
        if (plot.crop) {
          const spriteKey = `${plot.crop.cropId}_seed`;
          if (cropSprite && this.textures.exists(spriteKey)) {
            cropSprite.setTexture(spriteKey);
            cropSprite.setVisible(true);
          }
        }

        // Show care bubble with icon
        if (careBubble) {
          const bubbleIcon = careBubble.getAt(1) as Phaser.GameObjects.Text;
          if (bubbleIcon) {
            // Set icon based on care type
            if (plot.needsCare === "WATER") {
              bubbleIcon.setText("💧");
            } else if (plot.needsCare === "PESTS") {
              bubbleIcon.setText("🐛");
            } else if (plot.needsCare === "WEEDS") {
              bubbleIcon.setText("🌿");
            }
          }
          careBubble.setVisible(true);

          // Animate bubble float (if not already animated)
          if (!careBubble.getData("floating")) {
            careBubble.setData("floating", true);
            this.tweens.add({
              targets: careBubble,
              y: careBubble.y - 5,
              duration: 1000,
              yoyo: true,
              repeat: -1,
              ease: "Sine.easeInOut",
            });
          }
        }

      } else if (plot.state === "READY" && plot.crop) {
        // State 4: READY - Show mature crop + sparkles + bounce + glow
        const cropConfig = CROPS[plot.crop.cropId];
        if (!cropConfig) return;

        const spriteKey = `${plot.crop.cropId}_ready`;
        if (cropSprite && this.textures.exists(spriteKey)) {
          cropSprite.setTexture(spriteKey);
          cropSprite.setVisible(true);

          // Bounce animation (if not already bouncing)
          if (!cropSprite.getData("bouncing")) {
            cropSprite.setData("bouncing", true);
            this.tweens.add({
              targets: cropSprite,
              y: cropSprite.y - 8,
              duration: 600,
              yoyo: true,
              repeat: -1,
              ease: "Sine.easeInOut",
            });
          }
        }

        // Add pulsing glow effect around the plot
        const { isometric } = GAME_CONFIG.farm;
        if (soil) {
          // Add golden glow outline
          soil.clear();
          soil.fillStyle(effects.soilWetColor, 1);
          soil.lineStyle(3, 0xffd700, 0.8); // Golden outline
          soil.beginPath();
          soil.moveTo(0, -isometric.tileHeight / 2);
          soil.lineTo(isometric.tileWidth / 2, 0);
          soil.lineTo(0, isometric.tileHeight / 2);
          soil.lineTo(-isometric.tileWidth / 2, 0);
          soil.closePath();
          soil.fillPath();
          soil.strokePath();

          // Pulse animation for glow (if not already pulsing)
          if (!soil.getData("glowing")) {
            soil.setData("glowing", true);
            this.tweens.add({
              targets: soil,
              alpha: 0.7,
              duration: 800,
              yoyo: true,
              repeat: -1,
              ease: "Sine.easeInOut",
            });
          }
        }

        // Start sparkle particles
        sparkles?.start();

        // Show ready text
        stateText?.setText("✓ Sẵn sàng");
        stateText?.setVisible(true);
      }
    });
  }

  private setupUpdateLoop() {
    // Update crop states every second
    this.time.addEvent({
      delay: 1000,
      callback: () => {
        useGameStore.getState().updateCropStates();
      },
      loop: true,
    });
  }

  update() {
    // Continuous visual updates if needed
    this.updatePlotsVisuals();
  }

  // Cleanup
  shutdown() {
    this.plotGraphics.clear();
  }

  /**
   * Trigger plant effect on plot
   */
  triggerPlantEffect(plotId: number) {
    const container = this.plotGraphics.get(plotId);
    if (!container) return;

    const x = container.getData("x") || container.x;
    const y = container.getData("y") || container.y;

    ParticleService.createPlantEffect({
      x,
      y,
      scene: this,
    });
  }

  /**
   * Trigger harvest effect on plot
   */
  triggerHarvestEffect(plotId: number, coinAmount: number) {
    const container = this.plotGraphics.get(plotId);
    if (!container) return;

    const x = container.getData("x") || container.x;
    const y = container.getData("y") || container.y;

    ParticleService.createHarvestEffect({
      x,
      y,
      scene: this,
    });

    // Add coin effect after short delay
    this.time.delayedCall(200, () => {
      ParticleService.createCoinEffect(
        {
          x,
          y,
          scene: this,
        },
        coinAmount,
      );
    });
  }

  /**
   * Trigger level-up effect (center of screen)
   */
  triggerLevelUpEffect() {
    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    ParticleService.createLevelUpEffect({
      x: centerX,
      y: centerY,
      scene: this,
    });
  }

  /**
   * Create floating text effect (for XP, coins, etc.)
   */
  private createFloatingText(x: number, y: number, text: string, color: string = "#ffffff") {
    const floatingText = this.add.text(x, y, text, {
      fontSize: "20px",
      fontStyle: "bold",
      color: color,
      stroke: "#000000",
      strokeThickness: 3,
    });
    floatingText.setOrigin(0.5);
    floatingText.setDepth(1000);

    // Animate floating up and fade out
    this.tweens.add({
      targets: floatingText,
      y: y - 80,
      alpha: 0,
      scale: 1.2,
      duration: 1200,
      ease: "Cubic.easeOut",
      onComplete: () => {
        floatingText.destroy();
      },
    });
  }

  /**
   * Setup swipe detection on a plot container
   */
  private setupSwipeDetection(container: Phaser.GameObjects.Container, plotId: number) {
    container.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.swipeStartPos = { x: pointer.x, y: pointer.y };
      this.swipeStartTime = Date.now();
      this.swipePlotId = plotId;
    });

    container.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.swipeStartPos || this.swipePlotId !== plotId) return;

      const deltaX = pointer.x - this.swipeStartPos.x;
      const deltaY = pointer.y - this.swipeStartPos.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const duration = Date.now() - this.swipeStartTime;

      // Check if it's a valid swipe
      if (distance >= this.SWIPE_MIN_DISTANCE && duration <= this.SWIPE_MAX_TIME) {
        this.handleSwipe(plotId, deltaX, deltaY);
      }

      // Reset swipe tracking
      this.swipeStartPos = null;
      this.swipePlotId = null;
    });
  }

  /**
   * Handle swipe gesture on a plot
   */
  private handleSwipe(plotId: number, deltaX: number, deltaY: number) {
    const store = useGameStore.getState();
    const plot = store.plots.find((p) => p.id === plotId);
    if (!plot) return;

    const container = this.plotGraphics.get(plotId);
    if (!container) return;

    const x = container.getData("x") || container.x;
    const y = container.getData("y") || container.y;

    // Determine swipe direction
    const angle = Math.atan2(deltaY, deltaX);
    const isUpSwipe = angle < -Math.PI / 4 && angle > (-3 * Math.PI) / 4;

    // Handle based on plot state
    if (plot.state === "READY" && plot.crop) {
      // Swipe up to harvest
      if (isUpSwipe) {
        const cropConfig = CROPS[plot.crop.cropId];
        if (cropConfig) {
          store.harvestCrop(plotId);

          // Show floating rewards
          this.createFloatingText(x, y - 20, `+${cropConfig.expReward} XP`, "#4caf50");
          this.createFloatingText(x + 30, y - 10, `+${cropConfig.sellPrice} 💰`, "#ffd700");

          // Trigger harvest particles
          ParticleService.createHarvestEffect({ x, y, scene: this });
        }
      }
    } else if (plot.state === "NEEDS_CARE" && plot.needsCare) {
      // Swipe to provide care
      if (plot.needsCare === "WATER" && isUpSwipe) {
        store.waterPlot(plotId);
        this.createFloatingText(x, y - 20, "💧 Đã tưới", "#2196f3");
        // Simple particle effect for watering
        ParticleService.createPlantEffect({ x, y, scene: this });
      } else if (plot.needsCare === "PESTS") {
        store.removePests(plotId);
        this.createFloatingText(x, y - 20, "🐛 Diệt sâu", "#ff9800");
        // Use harvest effect for pest removal
        ParticleService.createHarvestEffect({ x, y, scene: this });
      } else if (plot.needsCare === "WEEDS") {
        store.removeWeeds(plotId);
        this.createFloatingText(x, y - 20, "🌿 Nhổ cỏ", "#8bc34a");
        // Use plant effect for weed removal
        ParticleService.createPlantEffect({ x, y, scene: this });
      }
    }
  }
}
