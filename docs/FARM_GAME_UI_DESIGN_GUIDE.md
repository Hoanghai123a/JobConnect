# Hướng Dẫn Thiết Kế UI Game Nông Trại

> **Reference Design:** Dựa trên game farm mobile với isometric 3D layout
> 
> **Canvas Orientation:** Landscape (nằm ngang) - user xoay ngang điện thoại để chơi

---

## 📐 1. LAYOUT TỔNG QUAN

### Canvas Configuration
```typescript
// File: src/game/config/game.ts
export const GAME_CONFIG = {
  // Landscape aspect ratio - chiều ngang luôn lớn hơn chiều cao
  width: Math.max(window.innerWidth, window.innerHeight),
  height: Math.min(window.innerWidth, window.innerHeight) - 140, // Trừ HUD + bottom nav
  backgroundColor: "#87CEEB", // Sky blue gradient top
}
```

### Farm Grid
- **Grid size:** 4×3 (4 cột × 3 hàng)
- **Tile dimensions:** 80×40 pixels (isometric diamond)
- **Spacing:** 8px giữa các ô
- **Centering:** Grid căn giữa theo công thức isometric projection

---

## 🎨 2. COLOR PALETTE

### Soil Colors (Đất)
```typescript
soilDryColor: 0xa67c52,    // #a67c52 - Nâu sáng khi khô
soilWetColor: 0x8b6f47,    // #8b6f47 - Nâu tối khi tưới nước
soilLockedColor: 0x4a4a4a, // #4a4a4a - Xám khi khóa
```

### Effect Colors
```typescript
sparkleColor: 0xffeb3b,     // #ffeb3b - Vàng cho sparkle particles
glowReadyColor: 0xffd700,   // #ffd700 - Vàng óng cho viền ready crops
highlightColor: 0xffff00,   // #ffff00 - Vàng highlight khi hover
grassBorderColor: 0x7cb342, // #7cb342 - Xanh cỏ viền ô đất
```

### Gradient System
```typescript
// Mỗi ô đất có gradient từ sáng (top) → tối (bottom)
topColor = lighten(baseColor, 15%);
bottomColor = darken(baseColor, 10%);
```

---

## 🔷 3. ISOMETRIC GRID SYSTEM

### Coordinate Conversion
```typescript
// File: src/game/utils/isometricHelper.ts

/**
 * Convert 2D grid (x,y) to isometric screen position
 */
export function gridToIsometric(gridX: number, gridY: number) {
  const { tileWidth, tileHeight, spacing } = GAME_CONFIG.farm.isometric;
  
  const effectiveTileWidth = tileWidth + spacing;
  const effectiveTileHeight = tileHeight + spacing;
  
  const screenX = (gridX - gridY) * (effectiveTileWidth / 2);
  const screenY = (gridX + gridY) * (effectiveTileHeight / 2);
  
  return { x: screenX, y: screenY };
}

/**
 * Get centered origin for grid
 */
export function getIsometricOrigin() {
  const { plotsX, plotsY } = GAME_CONFIG.farm;
  const { tileWidth, tileHeight, spacing } = GAME_CONFIG.farm.isometric;
  
  const effectiveTileWidth = tileWidth + spacing;
  const effectiveTileHeight = tileHeight + spacing;
  
  const totalGridWidth = (plotsX + plotsY - 1) * (effectiveTileWidth / 2);
  const totalGridHeight = (plotsX + plotsY - 1) * (effectiveTileHeight / 2);
  
  return {
    x: GAME_CONFIG.width / 2,
    y: (GAME_CONFIG.height / 2) - (totalGridHeight / 2) + 40, // +40 offset cho HUD
  };
}
```

### Diamond Hitbox
```typescript
// Phaser.Geom.Polygon với 4 điểm định nghĩa hình kim cương
const diamond = new Phaser.Geom.Polygon([
  { x: 0, y: -tileHeight / 2 },           // Top
  { x: tileWidth / 2, y: 0 },             // Right
  { x: 0, y: tileHeight / 2 },            // Bottom
  { x: -tileWidth / 2, y: 0 },            // Left
]);

container.setInteractive(diamond, Phaser.Geom.Polygon.Contains);
```

---

## 🎭 4. VISUAL STATES (5 Trạng Thái)

### State 1: EMPTY (Đất trống)
```typescript
{
  state: "EMPTY",
  visual: {
    soilColor: soilDryColor,           // Nâu sáng
    icon: "+",                          // Text "+" trắng, opacity 30%
    iconSize: 32,
    grassBorder: true,                  // Viền cỏ xanh 2px
  }
}
```

### State 2: GROWING (Đang phát triển)
```typescript
{
  state: "GROWING",
  visual: {
    cropSprite: "carrot_stage_0",       // Seedling sprite
    soilColor: soilWetColor,            // Nâu tối (đã tưới)
    progressBar: {
      width: 50,
      height: 4,
      bgColor: 0x666666,
      fillColor: 0x4caf50,              // Xanh lá
      position: { x: 0, y: -30 },
    },
    timerText: {
      content: "2:30",                  // Countdown time
      fontSize: 10,
      color: "#ffffff",
      position: { x: 0, y: -40 },
    }
  }
}
```

### State 3: NEEDS_CARE (Cần chăm sóc)
```typescript
{
  state: "NEEDS_CARE",
  needsCare: "WATER" | "PESTS" | "WEEDS",
  visual: {
    cropSprite: "carrot_stage_1",
    careBubble: {
      circle: { radius: 16, color: 0xffffff },
      icon: "💧" | "🐛" | "🌿",         // Icon tương ứng
      position: { x: 20, y: -40 },
      animation: {
        type: "float",
        distance: 5,
        duration: 1000,
        easing: "Sine.easeInOut",
      }
    }
  }
}
```

### State 4: READY (Chín - sẵn sàng thu hoạch)
```typescript
{
  state: "READY",
  visual: {
    cropSprite: "carrot_stage_2",       // Mature sprite
    soilColor: soilWetColor,
    glowEffect: {
      strokeColor: 0xffd700,            // Vàng óng
      strokeWidth: 3,
      opacity: 0.8,
      animation: {
        type: "pulsing",
        alphaRange: [0.7, 1.0],
        duration: 800,
        easing: "Sine.easeInOut",
      }
    },
    sparkles: {
      texture: "particle-yellow",
      color: 0xffeb3b,
      speed: { min: 10, max: 30 },
      lifespan: 600,
      frequency: 300,
      scale: { start: 1, end: 0 },
    },
    bounceAnimation: {
      yRange: 8,
      duration: 600,
      easing: "Sine.easeInOut",
    },
    stateText: {
      content: "Sẵn sàng!",
      color: "#ffeb3b",
      fontSize: 12,
      position: { x: 0, y: -50 },
    }
  }
}
```

### State 5: LOCKED (Đất khóa)
```typescript
{
  state: "LOCKED",
  visual: {
    soilColor: 0x4a4a4a,                // Xám
    lockIcon: "🔒",                     // Icon khóa
    iconSize: 24,
    opacity: 0.7,
    fenceOverlay: true,                 // Optional: hàng rào gỗ overlay
  }
}
```

---

## 🎨 5. MULTI-LAYER DEPTH SYSTEM

### Layer Structure (từ dưới lên)
```typescript
const plotLayers = [
  // 1. Shadow layer (bottom-most)
  {
    type: "ellipse",
    position: { x: 0, y: tileHeight / 2 + 4 },
    size: { rx: tileWidth * 0.85 / 2, ry: tileHeight * 0.3 / 2 },
    color: 0x000000,
    opacity: 0.25,
  },
  
  // 2. Soil base (diamond with gradient)
  {
    type: "graphics",
    shape: "diamond",
    gradient: {
      from: topColor,
      to: bottomColor,
      angle: 90,
    },
    border: {
      color: grassBorderColor,
      width: 2,
      opacity: 0.8,
    }
  },
  
  // 3. Top highlight (3D effect)
  {
    type: "line",
    points: [
      { x: 0, y: -tileHeight / 2 },
      { x: tileWidth / 2, y: 0 },
    ],
    color: 0xffffff,
    width: 1.5,
    opacity: 0.2,
  },
  
  // 4. Crop sprite (if planted)
  {
    type: "sprite",
    texture: "carrot_stage_2",
    scale: 1.2,
    anchor: { x: 0.5, y: 0.8 },
  },
  
  // 5. UI elements (progress bar, bubbles, sparkles)
  // 6. Highlight border (top-most, when hover)
];
```

### Drawing Diamond with Gradient
```typescript
function drawDiamondPlot(graphics: Phaser.GameObjects.Graphics) {
  const { tileWidth, tileHeight } = GAME_CONFIG.farm.isometric;
  
  // Calculate gradient colors
  const topColor = Phaser.Display.Color.ValueToColor(baseColor).lighten(15).color;
  const bottomColor = Phaser.Display.Color.ValueToColor(baseColor).darken(10).color;
  
  // Set gradient fill
  graphics.fillGradientStyle(
    topColor, topColor,    // Top-left, top-right
    bottomColor, bottomColor, // Bottom-left, bottom-right
    1 // Alpha
  );
  
  // Draw diamond shape
  graphics.beginPath();
  graphics.moveTo(0, -tileHeight / 2);           // Top
  graphics.lineTo(tileWidth / 2, 0);             // Right
  graphics.lineTo(0, tileHeight / 2);            // Bottom
  graphics.lineTo(-tileWidth / 2, 0);            // Left
  graphics.closePath();
  graphics.fillPath();
  
  // Add grass border
  graphics.lineStyle(2, grassBorderColor, 0.8);
  graphics.strokePath();
}
```

---

## 🎯 6. UI OVERLAY ELEMENTS

### Top HUD (Header)
```typescript
// File: src/game/components/GameHUD.tsx
<div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/40 to-transparent p-3">
  <div className="flex items-center justify-between">
    {/* Left: Level */}
    <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg">
      <User className="w-4 h-4 text-blue-600" />
      <span>Cấp {player.level}</span>
    </div>
    
    {/* Center: XP Bar */}
    <div className="flex-1 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg">
      <div className="h-2 bg-gray-200 rounded-full">
        <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500" 
             style={{ width: `${expPercentage}%` }} />
      </div>
    </div>
    
    {/* Right: Coins */}
    <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg">
      <Coins className="w-4 h-4 text-yellow-600" />
      <span>{player.coins.toLocaleString()}</span>
    </div>
  </div>
</div>
```

### Bottom Navigation
```typescript
// File: src/game/components/GameBottomNav.tsx
<div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/40 to-transparent p-4">
  <div className="flex items-center justify-around max-w-md mx-auto">
    {/* 4 circular buttons với icons */}
    <Button icon={Home} label="Cửa hàng" />
    <Button icon={Gift} label="Bán" />
    <Button icon={Package} label="Túi đồ" />
    <Button icon={Target} label="Nhiệm vụ" />
  </div>
</div>
```

### Quest Notification (Center Top)
```typescript
<div className="absolute top-16 left-1/2 -translate-x-1/2 z-20">
  <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg px-4 py-2 shadow-xl">
    <span className="text-white text-sm">
      Thu hoạch (55/16) hành tây
    </span>
    <ChevronRight className="inline w-4 h-4 ml-2" />
  </div>
</div>
```

---

## ✨ 7. ANIMATIONS & INTERACTIONS

### Hover Effect
```typescript
plot.on("pointerover", () => {
  // Redraw diamond với yellow stroke
  graphics.lineStyle(3, 0xffff00, 1);
  graphics.strokePath();
  
  // Scale up slightly
  container.setScale(1.05);
  
  // Tween smooth
  this.tweens.add({
    targets: container,
    scale: 1.05,
    duration: 150,
    ease: "Power2",
  });
});

plot.on("pointerout", () => {
  // Reset về màu border ban đầu
  graphics.lineStyle(2, grassBorderColor, 0.8);
  graphics.strokePath();
  container.setScale(1.0);
});
```

### Swipe Gesture
```typescript
// Detect swipe: distance >= 30px, time <= 300ms
const SWIPE_MIN_DISTANCE = 30;
const SWIPE_MAX_TIME = 300;

plot.on("pointerdown", (pointer) => {
  swipeStartPos = { x: pointer.x, y: pointer.y };
  swipeStartTime = Date.now();
});

plot.on("pointerup", (pointer) => {
  const distance = Phaser.Math.Distance.Between(
    swipeStartPos.x, swipeStartPos.y,
    pointer.x, pointer.y
  );
  const duration = Date.now() - swipeStartTime;
  
  if (distance >= SWIPE_MIN_DISTANCE && duration <= SWIPE_MAX_TIME) {
    handleSwipe(plot.id);
  }
});
```

### Floating Text (+XP, +Gold)
```typescript
function createFloatingText(x: number, y: number, text: string, color: string) {
  const textObj = this.add.text(x, y, text, {
    fontSize: "16px",
    fontFamily: "Arial",
    color: color,
    stroke: "#000000",
    strokeThickness: 3,
  });
  
  this.tweens.add({
    targets: textObj,
    y: y - 50,           // Bay lên 50px
    alpha: 0,            // Fade out
    scale: 1.2,          // Scale lên
    duration: 1200,
    ease: "Power2",
    onComplete: () => textObj.destroy(),
  });
}
```

### Sparkle Particles (Ready Crops)
```typescript
const sparkles = this.add.particles(x, y, "particle-yellow", {
  speed: { min: 10, max: 30 },
  lifespan: 600,
  frequency: 300,
  scale: { start: 1, end: 0 },
  alpha: { start: 1, end: 0 },
  tint: 0xffeb3b,
  blendMode: "ADD",
});
```

---

## 🌍 8. ENVIRONMENT DECORATIONS

### Background Elements
```typescript
// Sky gradient background
scene.cameras.main.setBackgroundColor("#87CEEB"); // Top
// Grass floor tự nhiên chuyển sang #7cb342

// Decorative props (non-interactive)
const decorations = [
  { type: "fence", position: "left", texture: "wooden_fence" },
  { type: "fence", position: "right", texture: "wooden_fence" },
  { type: "tree", position: { x: -200, y: 100 }, texture: "tree_01" },
  { type: "flowers", position: { x: 250, y: 150 }, texture: "flowers_pink" },
  { type: "house", position: { x: -250, y: -50 }, texture: "farm_house" },
];
```

### Grass Border Around Plots
```typescript
// Mỗi ô đất có viền cỏ xanh 2px
graphics.lineStyle(2, 0x7cb342, 0.8);
graphics.strokePath();
```

---

## 📱 9. RESPONSIVE & ORIENTATION

### Landscape Mode Enforcement
```typescript
// File: src/game/components/LandscapeMode.tsx
// Component detect portrait mode và hiển thị overlay yêu cầu xoay ngang

export const LandscapeMode = () => {
  const [isPortrait, setIsPortrait] = useState(false);
  
  useEffect(() => {
    const checkOrientation = () => {
      const portrait = window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
    };
    
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);
    
    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);
  
  if (!isPortrait) return null;
  
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center">
      <RotateCw className="w-20 h-20 animate-pulse" />
      <h2>Vui lòng xoay ngang màn hình</h2>
    </div>
  );
};
```

### Canvas Auto-resize
```typescript
// Canvas tự động điều chỉnh theo orientation
window.addEventListener("resize", () => {
  game.scale.resize(
    Math.max(window.innerWidth, window.innerHeight),
    Math.min(window.innerWidth, window.innerHeight) - 140
  );
});
```

---

## 🎨 10. ASSET SPECIFICATIONS

### Crop Sprites
```
Format: PNG with transparency
Size: 320×320px (scaled to fit tile)
Growth stages: 3 sprites per crop
  - stage_0: Seedling (nhỏ, xanh lá)
  - stage_1: Mid-growth (trung bình)
  - stage_2: Mature (lớn, màu sắc rực rỡ)

Naming convention:
  /public/game-assets/crops/{crop_name}_stage_{0-2}.png
  
Examples:
  carrot_stage_0.png
  carrot_stage_1.png
  carrot_stage_2.png
```

### Particle Textures
```
particle-yellow.png   - 16×16px white circle cho sparkles
particle-coin.png     - 24×24px gold coin cho coin effects
particle-dust.png     - 12×12px brown dot cho plant puff
```

### UI Icons
```
Lucide React icons:
  - User (level)
  - TrendingUp (XP)
  - Coins (gold)
  - Home (shop)
  - Gift (sell)
  - Package (inventory)
  - Target (quests)
  - RotateCw (landscape hint)
```

---

## 🚀 11. IMPLEMENTATION CHECKLIST

### Phase 1: Foundation
- [ ] Setup GAME_CONFIG với landscape dimensions
- [ ] Create isometricHelper.ts với coordinate conversion
- [ ] Implement gridToIsometric() và getIsometricOrigin()

### Phase 2: Grid Rendering
- [ ] Create FarmScene với 4×3 grid
- [ ] Draw diamond-shaped tiles với Phaser.Graphics
- [ ] Add interactive hitboxes (Phaser.Geom.Polygon)
- [ ] Implement hover highlight effect

### Phase 3: Visual States
- [ ] Create PlotState type ("EMPTY" | "GROWING" | "NEEDS_CARE" | "READY" | "LOCKED")
- [ ] Implement createPlotVisual() với tất cả UI elements
- [ ] Add updatePlotsVisuals() để control visibility theo state
- [ ] Setup animations (float bubbles, pulsing glow, sparkles)

### Phase 4: Multi-layer Depth
- [ ] Add shadow layer (ellipse opacity 0.25)
- [ ] Implement gradient soil với topColor/bottomColor
- [ ] Add top highlight (white line opacity 0.2)
- [ ] Add grass border (green 2px opacity 0.8)

### Phase 5: Interactions
- [ ] Setup swipe detection (30px min, 300ms max)
- [ ] Implement floating text (+XP, +Gold)
- [ ] Add particle effects (harvest, water, pests)
- [ ] Add touch feedback (scale 1.0 → 1.05)

### Phase 6: UI Overlay
- [ ] Create GameHUD component (level, XP bar, coins)
- [ ] Create GameBottomNav (4 circular buttons)
- [ ] Add quest notification banner
- [ ] Implement modals (shop, sell, inventory, quests)

### Phase 7: Polish
- [ ] Add environment decorations (fences, trees, flowers)
- [ ] Setup AudioService (BGM, SFX)
- [ ] Implement LandscapeMode component
- [ ] Add loading screen
- [ ] Performance optimization

---

## 📊 12. PERFORMANCE GUIDELINES

### Optimization Rules
```typescript
// 1. Object pooling cho particles
const particlePool = this.add.group({
  classType: Phaser.GameObjects.Particles.ParticleEmitter,
  maxSize: 50,
});

// 2. Reuse Graphics objects thay vì create mới
const graphics = this.add.graphics();
graphics.clear(); // Clear before redraw

// 3. Limit active tweens
if (container.getData("tween")) {
  container.getData("tween").stop();
}

// 4. Use texture atlases thay vì separate images
this.load.atlas("crops", "crops.png", "crops.json");

// 5. Disable auto-render khi không cần
this.sys.game.loop.sleep = true; // Khi inactive
```

### FPS Target
- **Desktop:** 60 FPS
- **Mobile:** 30-60 FPS (adaptive)

---

## 🎯 13. TESTING CHECKLIST

### Visual Testing
- [ ] All 5 plot states render correctly
- [ ] Gradient soil có depth 3D
- [ ] Shadow ellipse visible và correct position
- [ ] Sparkles particles xuất hiện khi READY
- [ ] Glow effect pulsing smooth
- [ ] Progress bar fill accurate

### Interaction Testing
- [ ] Click plot opens PlantModal
- [ ] Hover shows yellow highlight
- [ ] Swipe up harvests ready crops
- [ ] Swipe on NEEDS_CARE triggers care action
- [ ] Floating text animates correctly
- [ ] Touch feedback scale 1.05 smooth

### Responsive Testing
- [ ] Canvas resizes on orientation change
- [ ] Grid stays centered on all screen sizes
- [ ] HUD và Bottom Nav không overlap canvas
- [ ] LandscapeMode overlay shows in portrait
- [ ] All UI readable on small screens (320px width minimum)

### Performance Testing
- [ ] 60 FPS on desktop với 12 plots
- [ ] No memory leaks sau 5 phút chơi
- [ ] Particle count < 100 at any time
- [ ] Texture memory < 50MB
- [ ] Initial load < 3 seconds

---

## 📝 14. NOTES & TIPS

### Common Pitfalls
1. **Isometric math errors:** Luôn dùng `gridToIsometric()` thay vì tính thủ công
2. **Hitbox không chính xác:** Phải dùng `Phaser.Geom.Polygon` cho diamond shape
3. **Z-index conflicts:** Shadow phải là layer đầu tiên trong container
4. **Performance issues:** Reuse Graphics objects, không create mới mỗi frame
5. **Gradient không hiện:** Đảm bảo `fillGradientStyle()` gọi trước `fillPath()`

### Best Practices
- **Separation of concerns:** Visual logic trong Scene, game logic trong Store
- **Type safety:** Define types cho PlotState, CropConfig, Plot interface
- **Naming conventions:** Kebab-case cho assets, camelCase cho code
- **Comments:** Document public methods và complex algorithms
- **Git commits:** Commit theo từng milestone, không commit toàn bộ cùng lúc

---

## 📚 15. REFERENCE FILES

### Core Files
- [game.ts](src/game/config/game.ts) - Main config
- [isometricHelper.ts](src/game/utils/isometricHelper.ts) - Coordinate math
- [FarmScene.ts](src/game/scenes/FarmScene.ts) - Main scene logic
- [index.ts](src/game/types/index.ts) - Type definitions
- [GameHUD.tsx](src/game/components/GameHUD.tsx) - Header UI
- [GameBottomNav.tsx](src/game/components/GameBottomNav.tsx) - Footer UI
- [LandscapeMode.tsx](src/game/components/LandscapeMode.tsx) - Orientation overlay

### External Resources
- [Phaser 3 Documentation](https://photonstorm.github.io/phaser3-docs/)
- [Isometric Projection Math](https://en.wikipedia.org/wiki/Isometric_projection)
- [Lucide React Icons](https://lucide.dev/)

---

**Version:** 1.0  
**Last Updated:** 2026-10-01  
**Author:** AI Engineer Team

