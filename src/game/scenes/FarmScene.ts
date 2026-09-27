import Phaser from "phaser";
import { useGameStore } from "../stores/gameStore";
import { GAME_CONFIG } from "../config/game";
import { ParticleService } from "../services/particleService";

export class FarmScene extends Phaser.Scene {
  private plotGraphics: Map<number, Phaser.GameObjects.Container> = new Map();
  private selectedPlotId: number | null = null;

  constructor() {
    super({ key: "FarmScene" });
  }

  preload() {
    // Initialize particle textures
    ParticleService.initParticles(this);
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
    const { plotSize, plotSpacing } = GAME_CONFIG.farm;
    const startX = 250;
    const startY = 180;

    store.plots.forEach((plot) => {
      const x = startX + plot.x * (plotSize + plotSpacing);
      const y = startY + plot.y * (plotSize + plotSpacing);

      const container = this.createPlotVisual(plot.id, x, y);
      this.plotGraphics.set(plot.id, container);

      // Make interactive
      container.setSize(plotSize, plotSize);
      container.setInteractive();

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
    const { plotSize } = GAME_CONFIG.farm;
    const store = useGameStore.getState();
    const isUnlocked = store.isPlotUnlocked(plotId);

    // Plot base (soil) - darker if locked
    const soilColor = isUnlocked ? 0x8b4513 : 0x4a4a4a;
    const soil = this.add.rectangle(0, 0, plotSize, plotSize, soilColor);
    soil.setStrokeStyle(2, 0x654321);
    soil.setName("soil");

    // Lock icon for locked plots
    const lockIcon = this.add.text(0, 0, "🔒", {
      fontSize: "24px",
    });
    lockIcon.setOrigin(0.5);
    lockIcon.setName("lockIcon");
    lockIcon.setVisible(!isUnlocked);

    // Highlight rectangle (hidden by default)
    const highlight = this.add.rectangle(0, 0, plotSize + 4, plotSize + 4, 0xffff00, 0);
    highlight.setStrokeStyle(3, 0xffff00);
    highlight.setName("highlight");

    // Crop visual placeholder (initially hidden)
    const cropVisual = this.add.graphics();
    cropVisual.setName("cropVisual");
    cropVisual.setVisible(false);

    // State text (growth timer)
    const stateText = this.add.text(0, plotSize / 2 - 8, "", {
      fontSize: "11px",
      color: "#ffffff",
      backgroundColor: "#00000080",
      padding: { x: 4, y: 2 },
    });
    stateText.setOrigin(0.5);
    stateText.setName("stateText");

    container.add([highlight, soil, lockIcon, cropVisual, stateText]);
    container.setData("x", x);
    container.setData("y", y);
    return container;
  }

  private highlightPlot(plotId: number, show: boolean) {
    const container = this.plotGraphics.get(plotId);
    if (!container) return;

    const highlight = container.getByName("highlight") as Phaser.GameObjects.Rectangle;
    if (highlight) {
      highlight.setAlpha(show ? 1 : 0);
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
      const soil = container.getByName("soil") as Phaser.GameObjects.Rectangle;
      const lockIcon = container.getByName("lockIcon") as Phaser.GameObjects.Text;
      const cropVisual = container.getByName("cropVisual") as Phaser.GameObjects.Graphics;
      const stateText = container.getByName("stateText") as Phaser.GameObjects.Text;

      // Update lock state
      if (soil) {
        soil.setFillStyle(isUnlocked ? 0x8b4513 : 0x4a4a4a);
      }
      if (lockIcon) {
        lockIcon.setVisible(!isUnlocked);
      }

      if (!cropVisual || !stateText) return;

      cropVisual.clear();

      if (plot.crop) {
        const cropState = plot.crop.state;
        const previousState = cropVisual.getData("lastState");
        cropVisual.setVisible(true);

        if (cropState === "GROWING") {
          // Draw growing crop (small green sprout)
          this.drawGrowingCrop(cropVisual);

          // Animate growth if state just changed
          if (previousState !== "GROWING") {
            cropVisual.setAlpha(0);
            cropVisual.setScale(0.5);
            this.tweens.add({
              targets: cropVisual,
              alpha: 1,
              scale: 1,
              duration: 400,
              ease: "Back.easeOut",
            });
          }

          const timeLeft = Math.max(0, plot.crop.harvestAt - Date.now());
          const seconds = Math.ceil(timeLeft / 1000);
          stateText.setText(`${seconds}s`);
          stateText.setVisible(true);
        } else if (cropState === "READY") {
          // Draw mature crop (larger with glow)
          this.drawReadyCrop(cropVisual);

          // Animate ready state transition
          if (previousState === "GROWING") {
            // Growth complete animation
            this.tweens.add({
              targets: cropVisual,
              scale: 1.3,
              duration: 200,
              yoyo: true,
              ease: "Sine.easeInOut",
            });

            // Pulsing glow animation
            this.tweens.add({
              targets: cropVisual,
              alpha: { from: 1, to: 0.7 },
              duration: 800,
              yoyo: true,
              repeat: -1,
              ease: "Sine.easeInOut",
            });
          }

          stateText.setText("Sẵn sàng");
          stateText.setVisible(true);
        }

        cropVisual.setData("lastState", cropState);
      } else {
        cropVisual.setVisible(false);
        stateText.setText("");
        stateText.setVisible(false);
        cropVisual.setData("lastState", null);
      }
    });
  }

  private drawGrowingCrop(graphics: Phaser.GameObjects.Graphics) {
    // Simple sprout shape
    graphics.fillStyle(0x4caf50, 1); // Green
    graphics.fillCircle(0, 0, 8); // Center bulb
    graphics.fillStyle(0x81c784, 1); // Light green
    graphics.fillCircle(-4, -6, 5); // Left leaf
    graphics.fillCircle(4, -6, 5); // Right leaf
  }

  private drawReadyCrop(graphics: Phaser.GameObjects.Graphics) {
    // Mature crop with glow effect
    graphics.fillStyle(0xffeb3b, 0.3); // Yellow glow
    graphics.fillCircle(0, 0, 20);

    graphics.fillStyle(0x4caf50, 1); // Green
    graphics.fillCircle(0, 0, 12); // Larger center

    graphics.fillStyle(0x81c784, 1); // Light green
    graphics.fillCircle(-8, -8, 7); // Left leaf
    graphics.fillCircle(8, -8, 7); // Right leaf
    graphics.fillCircle(-6, 6, 6); // Bottom left
    graphics.fillCircle(6, 6, 6); // Bottom right

    graphics.fillStyle(0xfdd835, 1); // Yellow center (harvest ready indicator)
    graphics.fillCircle(0, 0, 6);
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
}
