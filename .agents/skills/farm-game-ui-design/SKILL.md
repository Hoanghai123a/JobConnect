---
name: farm-game-ui-design
description: Hướng dẫn thiết kế UI cho game nông trại theo phong cách isometric 3D landscape
---

# Farm Game UI Design Skill

Skill này giúp thiết kế và debug UI cho game nông trại theo phong cách **isometric 3D với landscape orientation**.

## Quick Reference

### Canvas Config
```typescript
width: 800,   // Fixed landscape width
height: 500,  // Fixed height để đủ cho grid 4×3
```

### Isometric Grid
```typescript
plotsX: 4,
plotsY: 3,
tileWidth: 70,   // Đủ nhỏ để fit toàn bộ grid
tileHeight: 35,
spacing: 6,
```

### Color Palette
```typescript
soilDryColor: 0xa67c52,      // Light brown (đất khô)
soilWetColor: 0x8b6f47,      // Dark brown (đất ướt)
grassBorder: 0x8bc34a,       // Bright green (viền cỏ)
sparkleColor: 0xffeb3b,      // Yellow (sparkles)
goldenGlow: 0xffd700,        // Golden (ready state)
```

### Visual States
1. **EMPTY**: Soil + Plus icon + Grass border 4px
2. **GROWING**: Crop sprite + Progress bar + Timer
3. **NEEDS_CARE**: Care bubble (💧🐛🌿) + Float animation
4. **READY**: Golden glow + Sparkles + Pulsing
5. **LOCKED**: Gray + Lock icon

### Multi-layer Structure (bottom → top)
1. Shadow (ellipse, opacity 0.25)
2. Soil (diamond gradient)
3. Highlight (white line, opacity 0.2)
4. **Grass Border** (4px, bright green)
5. Crop sprite
6. UI elements (bars/bubbles)
7. Hover highlight

## Common Issues & Fixes

### ❌ Chỉ hiển thị 1 ô đất thay vì grid 4×3
**Nguyên nhân**: 
- Canvas quá nhỏ
- Tile size quá lớn
- Origin positioning sai

**Fix**:
1. Dùng fixed size: `width: 800, height: 500`
2. Giảm tile: `tileWidth: 70, tileHeight: 35`
3. Check origin: `y: centerY - totalGridHeight / 2 + totalGridHeight / 3`

### ❌ Viền cỏ quá mỏng hoặc không thấy
**Fix**:
```typescript
const grassBorderColor = 0x8bc34a; // Bright green
soil.lineStyle(4, grassBorderColor, 1.0); // 4px, opacity 100%
soil.strokePath();
```

### ❌ Grid bị lệch ra ngoài viewport
**Fix**: Kiểm tra `getIsometricOrigin()` và đảm bảo:
- `centerX = GAME_CONFIG.width / 2`
- `centerY` có offset phù hợp với total grid height

### ❌ LandscapeMode overlay hiện cả trên PC
**Fix dev mode**: Comment out `<LandscapeMode />` trong [PhaserGame.tsx](src/game/PhaserGame.tsx)
```tsx
{/* <LandscapeMode /> */}
```

## Implementation Checklist

### Phase 1: Canvas Setup ✅
- [ ] Fixed size: 800×500
- [ ] Isometric tile: 70×35
- [ ] Spacing: 6px

### Phase 2: Grid Rendering ✅
- [ ] Grid 4×3 hiển thị đầy đủ
- [ ] Origin positioning centered
- [ ] All 12 plots visible

### Phase 3: Visual States ✅
- [ ] EMPTY: Grass border 4px bright green
- [ ] GROWING: Progress bar + timer
- [ ] NEEDS_CARE: Float bubble
- [ ] READY: Golden glow + sparkles
- [ ] LOCKED: Gray + lock icon

### Phase 4: Multi-layer Depth ✅
- [ ] Shadow layer
- [ ] Gradient soil
- [ ] White highlight
- [ ] **Grass border 4px**

### Phase 5: Interactive ✅
- [ ] Diamond hitbox
- [ ] Hover scale 1.05
- [ ] Swipe detection
- [ ] Floating text

### Phase 6: Effects ✅
- [ ] Sparkle particles
- [ ] Pulsing glow
- [ ] Care bubble float
- [ ] Touch feedback

### Phase 7: Responsive ✅
- [ ] LandscapeMode component
- [ ] Comment out khi dev PC
- [ ] Uncomment cho production

## Key Files

- [game.ts](src/game/config/game.ts) - Canvas & grid config
- [isometricHelper.ts](src/game/utils/isometricHelper.ts) - Grid positioning
- [FarmScene.ts](src/game/scenes/FarmScene.ts) - Main rendering
- [PhaserGame.tsx](src/game/PhaserGame.tsx) - Phaser container

## Debug Commands

```typescript
// Check canvas size
const canvas = document.querySelector('canvas');
console.log(`${canvas.width}x${canvas.height}`);

// Check origin
const origin = getIsometricOrigin();
console.log('Origin:', origin);

// Check plots count
const plots = useGameStore.getState().plots;
console.log('Plots:', plots.length); // Should be 12
```

## Performance Tips

1. Dùng `Graphics` objects thay vì images cho soil
2. Cache particle textures
3. Limit số tweens đồng thời
4. Object pooling cho floating text
5. Reuse Graphics objects

## When to Use This Skill

Gọi skill này khi:
- ❌ Grid chỉ hiển thị 1-2 ô thay vì 4×3
- ❌ Viền cỏ quá mỏng hoặc không thấy
- ❌ Canvas quá nhỏ không đủ chỗ
- ❌ Origin positioning sai
- ❌ LandscapeMode overlay che khuất
- ✅ Cần checklist để verify UI đúng chuẩn
- ✅ Cần reference color palette
- ✅ Cần hướng dẫn debug visual issues

---

**Tài liệu đầy đủ**: [FARM_GAME_UI_DESIGN_GUIDE.md](docs/FARM_GAME_UI_DESIGN_GUIDE.md)
