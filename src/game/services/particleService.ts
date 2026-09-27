import Phaser from "phaser";

/**
 * Particle Service - Centralized particle effect management
 * Creates visual effects for harvest, coins, level-up, etc.
 */

export interface ParticleConfig {
  x: number;
  y: number;
  scene: Phaser.Scene;
}

export class ParticleService {
  /**
   * Create harvest sparkle effect
   */
  static createHarvestEffect(config: ParticleConfig) {
    const { x, y, scene } = config;

    // Create sparkle particles
    const particles = scene.add.particles(x, y, "sparkle", {
      speed: { min: 50, max: 150 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 600,
      quantity: 15,
      frequency: -1, // Emit once
    });

    // Cleanup after animation
    scene.time.delayedCall(700, () => {
      particles.destroy();
    });

    return particles;
  }

  /**
   * Create coin drop effect
   */
  static createCoinEffect(config: ParticleConfig, amount: number) {
    const { x, y, scene } = config;

    // Create coin particles that float upward
    const particles = scene.add.particles(x, y, "coin", {
      speed: { min: 30, max: 80 },
      angle: { min: -110, max: -70 }, // Upward arc
      scale: { start: 0.8, end: 0.3 },
      alpha: { start: 1, end: 0 },
      lifespan: 800,
      quantity: Math.min(amount / 10, 10), // Scale with amount
      frequency: -1,
      gravityY: 150, // Coins fall back down
    });

    scene.time.delayedCall(1000, () => {
      particles.destroy();
    });

    return particles;
  }

  /**
   * Create level-up burst effect
   */
  static createLevelUpEffect(config: ParticleConfig) {
    const { x, y, scene } = config;

    // Radial burst effect
    const particles = scene.add.particles(x, y, "sparkle", {
      speed: { min: 100, max: 250 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.5, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 1000,
      quantity: 30,
      frequency: -1,
      tint: [0xffeb3b, 0xff9800, 0xffc107], // Yellow/orange colors
    });

    scene.time.delayedCall(1200, () => {
      particles.destroy();
    });

    return particles;
  }

  /**
   * Create planting dust effect
   */
  static createPlantEffect(config: ParticleConfig) {
    const { x, y, scene } = config;

    // Small dust puff
    const particles = scene.add.particles(x, y, "sparkle", {
      speed: { min: 20, max: 60 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.6, end: 0 },
      lifespan: 400,
      quantity: 8,
      frequency: -1,
      tint: [0x8b4513, 0xa0522d], // Brown/dirt colors
    });

    scene.time.delayedCall(500, () => {
      particles.destroy();
    });

    return particles;
  }

  /**
   * Create placeholder particle texture
   * Used when actual particle sprites are not available
   */
  static createPlaceholderParticle(scene: Phaser.Scene, key: string) {
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);

    // Draw a simple glowing circle
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(8, 8, 8);
    graphics.generateTexture(key, 16, 16);
    graphics.destroy();
  }

  /**
   * Initialize particle textures
   */
  static initParticles(scene: Phaser.Scene) {
    // Create placeholder textures if actual assets don't exist
    if (!scene.textures.exists("sparkle")) {
      this.createPlaceholderParticle(scene, "sparkle");
    }
    if (!scene.textures.exists("coin")) {
      this.createPlaceholderParticle(scene, "coin");
    }
  }
}
