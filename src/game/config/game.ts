export const GAME_CONFIG = {
  width: Math.max(window.innerWidth, window.innerHeight), // Chiều ngang lớn hơn
  height: Math.min(window.innerWidth, window.innerHeight) - 140, // Chiều cao nhỏ hơn, trừ HUD+nav
  backgroundColor: "#87CEEB",

  farm: {
    plotsX: 4,
    plotsY: 3,
    plotSize: 64,
    plotSpacing: 8,

    // Isometric layout config
    isometric: {
      enabled: true,
      tileWidth: 80, // Thu gọn về 80 để vừa màn hình
      tileHeight: 40, // Thu gọn về 40 để cân đối
      spacing: 8, // Giảm spacing để compact hơn
      angle: 30, // Isometric angle (degrees)
    },

    // Visual effects
    effects: {
      soilDryColor: 0xa67c52, // Light brown when dry
      soilWetColor: 0x8b6f47, // Dark brown when watered
      sparkleColor: 0xffeb3b, // Yellow sparkle for ready crops
      glowIntensity: 0.3,
    },

    // UI elements
    ui: {
      bubbleFloatSpeed: 1.5, // Pixels per second
      bubbleFloatDistance: 10, // Pixels
      timerBarHeight: 4,
      timerBarWidth: 50,
    },
  },

  player: {
    initialCoins: 1000,
    initialLevel: 1,
    initialExp: 0,
  },
};
