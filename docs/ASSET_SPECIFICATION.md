# Asset Specification - Farm Game

## 📁 Cấu trúc thư mục

```
public/game-assets/
├── crops/           # Sprite cây trồng (5 stages mỗi loại)
├── tiles/           # Texture ô đất, viền cỏ, đường
├── decorations/     # Hàng rào, cây, đá
├── ui/              # Icon coins, star, exp, buttons
└── effects/         # Particles, sparkles
```

---

## 🌾 Crops - Bộ sprite cây trồng

**3 loại cây cần đầy đủ:**
- Carrot (Cà rốt) - màu cam
- Wheat (Lúa mì) - màu vàng  
- Tomato (Cà chua) - màu đỏ

### Quy cách file

**Mỗi loại cây cần 5 file PNG trong suốt:**

```
{crop}_seed.png     # Stage SEED - Hạt vừa gieo, nhỏ
{crop}_stage1.png   # Stage 1 - Mầm non, 30% chiều cao
{crop}_stage2.png   # Stage 2 - Cây nhỡ, 60% chiều cao
{crop}_stage3.png   # Stage 3 - Cây trưởng thành, 90% chiều cao
{crop}_harvest.png  # Stage HARVEST - Quả chín rực rỡ, 100% + bounce
```

**Ví dụ carrot:**
```
carrot_seed.png
carrot_stage1.png
carrot_stage2.png
carrot_stage3.png
carrot_harvest.png
```

### Kích thước khuyến nghị

- **Canvas:** 128×128 px (power of 2, dễ scale)
- **Sprite thực tế:** 
  - SEED: ~20×20 px (nhỏ, sát đất)
  - STAGE1: ~40×50 px (mầm non)
  - STAGE2: ~60×80 px (cây nhỡ)
  - STAGE3: ~80×100 px (cây trưởng thành)
  - HARVEST: ~100×120 px (quả to, rực rỡ)

- **Anchor point:** Bottom-center (chân cây sát đất)
- **Transparent background:** Bắt buộc (PNG alpha channel)

### Style visual

- **Phong cách:** Cartoon casual, friendly, không quá realistic
- **Màu sắc:** Vibrant, saturated (màu rực rỡ để nổi bật trên nền đất nâu)
- **Outline:** Có viền đen mỏng (~2px) để tách biệt với background
- **Shadow:** Có bóng nhẹ ở chân cây (tùy chọn, có thể code vẽ)

---

## 🟫 Tiles - Texture ô đất

### Soil tile (Ô đất)

**File:** `soil_tile.png`
- **Kích thước:** 128×64 px (isometric diamond)
- **Hình dạng:** Diamond isometric (kim cương xiên 45°)
- **Texture:** Đất nâu, có sần nhám, chấm đá nhỏ
- **Màu:** #a67c52 (nền), #8b6f47 (shadow), #b89968 (highlight)

### Soil planted (Đất đã gieo)

**File:** `soil_planted.png`
- **Kích thước:** 128×64 px
- **Texture:** Đất tối hơn, ẩm ướt
- **Màu:** #6b5438 (tối hơn soil bình thường)

### Grass border (Viền cỏ)

**File:** `grass_border.png`
- **Kích thước:** 128×64 px
- **Style:** Viền cỏ xanh 4-6px bao quanh ô đất
- **Màu:** #7cb342 (xanh lá tươi)
- **Texture:** Có sợi cỏ nhỏ nhấp nhô

---

## 🪵 Decorations - Đồ trang trí

### Wooden fence (Hàng rào gỗ)

**Files:**
```
fence_horizontal.png  # Hàng rào ngang (128×32 px)
fence_vertical.png    # Hàng rào dọc (32×64 px)
fence_corner.png      # Góc hàng rào (64×64 px)
```

- **Style:** Gỗ nâu, có vân, phong cách rustic
- **Màu:** #8b6f47 (nâu gỗ), viền tối #5d4e37

### Trees & Rocks (Cây & đá)

**Files:**
```
tree_small.png   # Cây nhỏ (64×80 px)
tree_large.png   # Cây to (128×160 px)
rock_1.png       # Đá nhỏ (32×32 px)
rock_2.png       # Đá vừa (48×48 px)
```

---

## 💎 UI Icons - Biểu tượng giao diện

### Top Bar icons

```
coin.png         # Xu vàng (32×32 px)
star.png         # Sao level (32×32 px)
exp_bar_bg.png   # Background EXP bar (300×20 px)
exp_bar_fill.png # Fill EXP bar (298×18 px)
```

### Bottom Bar icons

```
quest_icon.png      # Icon nhiệm vụ (24×24 px)
shop_icon.png       # Icon cửa hàng (40×40 px)
storage_icon.png    # Icon kho (40×40 px)
settings_icon.png   # Icon cài đặt (40×40 px)
```

### Seed selector icons

```
seed_bg.png          # Background nút seed (60×60 px)
seed_bg_active.png   # Background active (viền xanh)
seed_bg_hover.png    # Background hover (sáng hơn)
```

---

## ✨ Effects - Hiệu ứng

### Particles

```
sparkle.png      # Tia sáng nhỏ (16×16 px)
coin_particle.png # Xu bay lên (24×24 px)
star_particle.png # Sao bay lên (24×24 px)
```

### Glow effects

```
glow_harvest.png  # Hào quang cây chín (128×128 px)
glow_complete.png # Hào quang hoàn thành quest (200×200 px)
```

---

## 📐 Quy tắc tích hợp

### Phaser 3 sprite loading

```typescript
// preload()
this.load.image('carrot_seed', '/game-assets/crops/carrot_seed.png');
this.load.image('carrot_stage1', '/game-assets/crops/carrot_stage1.png');
// ... tương tự cho stage2, stage3, harvest

// create()
const sprite = this.add.sprite(x, y, 'carrot_seed');
sprite.setOrigin(0.5, 1);  // Bottom-center anchor
sprite.setScale(0.8);       // Scale xuống 80%
```

### Fallback system

```typescript
// Kiểm tra sprite tồn tại
if (this.textures.exists(spriteKey)) {
  // Load sprite thật
  const sprite = this.add.sprite(x, y, spriteKey);
} else {
  // Fallback về Graphics
  const graphic = FallbackGraphics.drawCropStage(this, cropType, stage);
}
```

### Depth (Z-index) layers

```
0-99:    Shadows
100-199: Soil tiles
200-299: Grass borders
300-399: Decorations (fences, rocks)
400-499: Crops (sprites)
500-599: UI growth bars
1000+:   Overlay UI (Top Bar, Bottom Bar)
```

---

## 🎨 Palette chính

```css
/* Soil */
--soil-light: #a67c52;
--soil-dark: #6b5438;

/* Grass */
--grass-border: #7cb342;
--grass-dark: #558b2f;

/* UI */
--ui-blue: #1a237e;
--ui-gold: #ffd700;
--ui-green: #4caf50;
--ui-orange: #ff9800;

/* Crops */
--carrot-orange: #ff6b35;
--wheat-gold: #ffd700;
--tomato-red: #ff4444;
```

---

## ✅ Checklist triển khai

### Phase 8.1: Core crops (Ưu tiên cao)

- [ ] `carrot_seed.png` - `carrot_harvest.png` (5 files)
- [ ] `wheat_seed.png` - `wheat_harvest.png` (5 files)
- [ ] `tomato_seed.png` - `tomato_harvest.png` (5 files)

### Phase 8.2: Tiles & borders

- [ ] `soil_tile.png`
- [ ] `soil_planted.png`
- [ ] `grass_border.png`

### Phase 8.3: UI icons

- [ ] `coin.png`, `star.png`
- [ ] `quest_icon.png`
- [ ] `shop_icon.png`, `storage_icon.png`, `settings_icon.png`

### Phase 8.4: Decorations (Tùy chọn)

- [ ] `fence_horizontal.png`, `fence_vertical.png`
- [ ] `tree_small.png`, `tree_large.png`
- [ ] `rock_1.png`, `rock_2.png`

### Phase 8.5: Effects (Tùy chọn)

- [ ] `sparkle.png`
- [ ] `glow_harvest.png`

---

## 🔧 Tool hỗ trợ tạo asset

### AI Image Generation

**Prompt mẫu cho Midjourney/DALL-E:**

```
A cute cartoon [crop name] plant at [stage], 
isometric view, game asset, transparent background, 
vibrant colors, black outline, 128x128 canvas, 
centered, farming game style, casual mobile game
```

**Ví dụ:**
```
A cute cartoon carrot plant seedling, 
isometric view, game asset, transparent background, 
vibrant orange, black outline, 128x128 canvas, 
centered, farming game style
```

### Manual creation tools

- **Aseprite** - Pixel art animation
- **Figma** - Vector design, export PNG
- **Photoshop** - Painting, effects
- **GIMP** - Free alternative to Photoshop

---

**Version:** 1.0  
**Updated:** 2026-10-07  
**Status:** Specification draft - Ready for asset creation
