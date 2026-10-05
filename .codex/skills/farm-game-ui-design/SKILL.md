---
name: farm-game-ui-design
description: Hướng dẫn thiết kế UI cho game nông trại theo phong cách isometric 3D landscape
tags: [game, ui, phaser, isometric, design]
---

# Farm Game UI Design Skill

Skill này cung cấp hướng dẫn chi tiết cho việc thiết kế giao diện game nông trại theo phong cách isometric 3D với landscape orientation.

## Khi nào dùng skill này

- Khi cần thiết kế/implement visual states cho ô đất (EMPTY, GROWING, NEEDS_CARE, READY, LOCKED)
- Khi cần tạo effects (sparkles, glow, floating text, particles)
- Khi cần implement isometric grid system
- Khi cần setup multi-layer depth rendering
- Khi cần tạo animations (hover, touch feedback, pulsing)
- Khi cần thiết kế UI overlay components (HUD, bottom nav)
- Khi cần implement landscape mode enforcement

## Tài liệu tham khảo chính

File hướng dẫn đầy đủ: [FARM_GAME_UI_DESIGN_GUIDE.md](../../../docs/FARM_GAME_UI_DESIGN_GUIDE.md)

## Quick Reference

### 1. Canvas Config (Landscape)
```typescript
width: Math.max(window.innerWidth, window.innerHeight)
height: Math.min(window.innerWidth, window.innerHeight) - 140
```

### 2. Isometric Conversion
```typescript
// Grid (x,y) → Screen (x,y)
screenX = (gridX - gridY) * (tileWidth / 2)
screenY = (gridX + gridY) * (tileHeight / 2)
```

### 3. Color Palette
```typescript
soilDryColor: 0xa67c52    // Đất khô
soilWetColor: 0x8b6f47    // Đất ướt
sparkleColor: 0xffeb3b    // Sparkles vàng
glowReadyColor: 0xffd700  // Glow vàng óng
grassBorderColor: 0x7cb342 // Viền cỏ xanh
```

### 4. Visual States

#### EMPTY (Đất trống)
- Soil: `soilDryColor`
- Icon: `+` (white, opacity 30%)
- Border: Grass green 2px

#### GROWING (Đang lớn)
- Crop sprite: stage 0-1
- Soil: `soilWetColor`
- Progress bar: Green 50×4px
- Timer: Countdown text

#### NEEDS_CARE (Cần chăm sóc)
- Care bubble: White circle với icon (💧🐛🌿)
- Float animation: 5px up/down, 1000ms

#### READY (Sẵn sàng thu hoạch)
- Crop sprite: stage 2
- Glow: Golden stroke 3px, pulsing
- Sparkles: Yellow particles
- Bounce animation: 8px

#### LOCKED (Khóa)
- Soil: Gray `0x4a4a4a`
- Lock icon: 🔒
- No interactive

### 5. Multi-layer Structure
```
1. Shadow (bottom) - Ellipse opacity 0.25
2. Soil base - Diamond gradient sáng→tối
3. Highlight - White line opacity 0.2
4. Grass border - Green 2px
5. Crop sprite
6. UI elements (bars, bubbles)
7. Hover highlight (top)
```

### 6. Common Animations

#### Hover
```typescript
highlight.lineStyle(3, 0xffff00, 1);
container.setScale(1.05);
```

#### Floating Text
```typescript
y: y - 50, alpha: 0, scale: 1.2
duration: 1200ms
```

#### Sparkles
```typescript
speed: 10-30, lifespan: 600ms
frequency: 300ms, scale: 1→0
```

#### Pulsing Glow
```typescript
alpha: 0.7 ↔ 1.0
duration: 800ms, yoyo, repeat: -1
```

### 7. Helper Functions

#### Gradient Colors
```typescript
function lighten(color: number, amount: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) * (1 + amount));
  const g = Math.min(255, ((color >> 8) & 0xff) * (1 + amount));
  const b = Math.min(255, (color & 0xff) * (1 + amount));
  return (r << 16) | (g << 8) | b;
}
```

#### Draw Diamond
```typescript
graphics.fillGradientStyle(topColor, topColor, bottomColor, bottomColor);
graphics.beginPath();
graphics.moveTo(0, -tileHeight / 2);
graphics.lineTo(tileWidth / 2, 0);
graphics.lineTo(0, tileHeight / 2);
graphics.lineTo(-tileWidth / 2, 0);
graphics.closePath();
graphics.fillPath();
```

## Implementation Checklist

### Phase 1: Foundation
- [ ] Setup GAME_CONFIG với landscape dimensions
- [ ] Create isometricHelper.ts
- [ ] Implement gridToIsometric(), isometricToGrid(), getIsometricOrigin()

### Phase 2: Grid
- [ ] Create FarmScene với grid layout
- [ ] Draw diamond shapes với multi-layer
- [ ] Add interactive hitboxes (Phaser.Geom.Polygon)
- [ ] Implement hover effects

### Phase 3: Visual States
- [ ] Create PlotState type
- [ ] Implement createPlotVisual() với all UI elements
- [ ] Add updatePlotsVisuals() để control visibility
- [ ] Setup animations (float, pulse, sparkles)

### Phase 4: Effects
- [ ] Add shadow layer
- [ ] Implement gradient soil
- [ ] Add top highlight
- [ ] Add grass border
- [ ] Create particle effects

### Phase 5: Interactions
- [ ] Setup swipe detection
- [ ] Implement floating text
- [ ] Add touch feedback
- [ ] Create harvest effects

### Phase 6: UI Components
- [ ] Create GameHUD (level, XP, coins)
- [ ] Create GameBottomNav (4 buttons)
- [ ] Add quest banner
- [ ] Implement modals

### Phase 7: Polish
- [ ] Add decorations (fences, trees)
- [ ] Implement LandscapeMode
- [ ] Add audio (BGM, SFX)
- [ ] Performance optimization

## Key Files

- Config: [src/game/config/game.ts](../../../src/game/config/game.ts)
- Helpers: [src/game/utils/isometricHelper.ts](../../../src/game/utils/isometricHelper.ts)
- Scene: [src/game/scenes/FarmScene.ts](../../../src/game/scenes/FarmScene.ts)
- Types: [src/game/types/index.ts](../../../src/game/types/index.ts)
- Container: [src/game/PhaserGame.tsx](../../../src/game/PhaserGame.tsx)
- Landscape: [src/game/components/LandscapeMode.tsx](../../../src/game/components/LandscapeMode.tsx)

## Notes

- **Always** dùng isometric helpers, không tính tay
- **Always** dùng Phaser.Geom.Polygon cho diamond hitbox
- **Always** implement multi-layer depth (shadow→soil→highlight)
- **Always** add grass border cho mỗi ô
- **Always** reuse Graphics objects, không create mới mỗi frame
- **Always** test trên cả desktop và mobile

## Performance Tips

1. Object pooling cho particles
2. Reuse Graphics objects
3. Limit active tweens
4. Use texture atlases
5. Target 60 FPS desktop, 30-60 FPS mobile

---

**Invoke:** `@farm-game-ui-design` hoặc `/farm-game-ui-design`
**Guide:** [FARM_GAME_UI_DESIGN_GUIDE.md](../../../docs/FARM_GAME_UI_DESIGN_GUIDE.md)
