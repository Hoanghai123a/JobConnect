# Nông Trại Game - Asset Specification

## Art Direction

### Visual Style
- **Style**: 2D casual farming game
- **Tone**: Cute, colorful, clean, welcoming
- **Perspective**: Top-down with slight isometric tilt (optional)
- **Quality**: Mobile-game quality, optimized for performance
- **Target audience**: Casual players, all ages

### Design Principles
- **Readability**: Clear silhouettes, easily distinguishable at small sizes
- **Consistency**: Unified lighting, scale, and camera angle across all assets
- **Simplicity**: Not overly detailed - clear, clean shapes
- **Color**: Vibrant but harmonious palette
- **Background**: Transparent PNG for all sprites

### Technical Constraints
- **Format**: PNG with transparency
- **Resolution**: 64x64px base size (can scale up for high-DPI)
- **Color depth**: 24-bit RGB + 8-bit alpha
- **File size**: Target <50KB per sprite (optimized)
- **Naming**: lowercase_underscore format (e.g., `carrot_ready.png`)

---

## Asset Categories

### 1. Crops (Priority: CRITICAL)
**Quantity**: 30 sprites (10 crops × 3 states)

#### States
1. **Seed** - Small sprouting stage, visible in ground
2. **Growing** - Mid-growth, recognizable but not mature
3. **Ready** - Fully grown, vibrant, harvestable

#### Crop List
1. **Cà rốt (Carrot)** - Orange root vegetable with green tops
   - Seed: Small orange nub with tiny leaves
   - Growing: Partial carrot visible, green leaves growing
   - Ready: Full bright orange carrot with lush green foliage

2. **Lúa (Rice)** - Golden grain stalks
   - Seed: Small green shoots
   - Growing: Green rice stalks, medium height
   - Ready: Golden yellow mature rice plants

3. **Ngô (Corn)** - Yellow corn cobs
   - Seed: Small corn sprout
   - Growing: Green stalk with partial cob
   - Ready: Tall stalk with golden corn cobs

4. **Khoai tây (Potato)** - Brown tubers
   - Seed: Small plant sprout
   - Growing: Green leaves, hints of potato underground
   - Ready: Mature plant with visible brown potatoes

5. **Cà chua (Tomato)** - Red tomatoes on vine
   - Seed: Tiny tomato seedling
   - Growing: Green plant with small green tomatoes
   - Ready: Red ripe tomatoes on green vine

6. **Dâu tây (Strawberry)** - Red berries
   - Seed: Strawberry seedling
   - Growing: Plant with white flowers
   - Ready: Bright red strawberries with seeds visible

7. **Dưa hấu (Watermelon)** - Large striped melons
   - Seed: Watermelon sprout
   - Growing: Vine with small green melon
   - Ready: Large striped watermelon on vine

8. **Bí ngô (Pumpkin)** - Orange pumpkin
   - Seed: Pumpkin sprout
   - Growing: Green vine with small orange pumpkin
   - Ready: Large orange pumpkin with green stem

9. **Hướng dương (Sunflower)** - Yellow flower
   - Seed: Small green shoot
   - Growing: Tall stalk with budding flower
   - Ready: Large bright yellow sunflower bloom

10. **Thanh long (Dragon Fruit)** - Pink/white exotic fruit
    - Seed: Cactus-like sprout
    - Growing: Cactus with small pink fruit forming
    - Ready: Vibrant pink dragon fruit on cactus plant

#### Design Requirements
- Each crop must be visually distinct at 64x64px
- Growth progression should be clear
- Ready state should be most vibrant/appealing
- Maintain consistent lighting direction across all crops
- Keep shadows soft and simple

---

### 2. Tiles (Priority: HIGH)
**Quantity**: 3 base tiles

1. **grass.png** - Background grass tile
   - Light green, slightly textured
   - Tileable seamlessly
   - Subtle variation to avoid repetition

2. **dirt.png** - Farm plot dirt
   - Brown soil texture
   - Slightly darker than grass
   - Tileable

3. **plot_empty.png** - Empty farm plot
   - Defined rectangular plot
   - Tilled soil appearance
   - Border visible but subtle
   - 128x128px (larger to accommodate plot size)

---

### 3. UI Elements (Priority: MEDIUM)
**Quantity**: 2 base elements

1. **button_primary.png** - Main action button
   - Rounded rectangle
   - Warm, inviting color (orange/yellow)
   - Slight gradient or shine
   - 9-slice compatible (design for stretching)

2. **panel.png** - Modal background panel
   - Subtle wood or paper texture
   - Rounded corners
   - Semi-transparent or solid
   - 9-slice compatible

---

### 4. Items (Priority: MEDIUM)
**Quantity**: 2 items

1. **coin.png** - Currency icon
   - Golden circular coin
   - Shine/glint effect
   - 32x32px (smaller item icon)

2. **seed_bag.png** - Seed inventory icon
   - Brown burlap sack
   - Tied at top
   - Generic, not crop-specific
   - 32x32px

---

### 5. Effects (Priority: LOW)
**Quantity**: 2 particle sprites

1. **sparkle.png** - Generic sparkle effect
   - Star or plus shape
   - Bright yellow/white
   - Semi-transparent
   - 32x32px
   - Used for level-up, quest complete

2. **harvest.png** - Harvest particle
   - Leaf or petal shapes
   - Green with slight transparency
   - 32x32px
   - Spawned when harvesting crops

---

### 6. Buildings (Priority: LOW - Post-MVP)
**Quantity**: 2 buildings (deferred)

1. **barn.png** - Storage building
   - Red barn with white trim
   - Simple geometric shape
   - Positioned in corner of farm

2. **shop.png** - Seed shop building
   - Wooden shop front
   - Sign indicating shop
   - Positioned in corner of farm

---

### 7. Characters (Priority: LOW - Post-MVP)
**Quantity**: 1 character (deferred)

1. **farmer.png** - Player character
   - Cute, simple character design
   - Friendly appearance
   - Neutral gender presentation
   - Optional: Multiple frames for idle animation

---

## Asset Pipeline

### Creation Process
1. **Concept** - Rough sketch or reference gathering
2. **Production** - Create asset in design tool or AI generation
3. **Review** - Check against specification
4. **Optimization** - Compress PNG, ensure transparency
5. **Integration** - Add to manifest in `src/game/config/assets.ts`
6. **Testing** - Verify in-game appearance

### Naming Convention
```
{category}/{item}_{state}.png
```

Examples:
- `crops/carrot_seed.png`
- `crops/carrot_growing.png`
- `crops/carrot_ready.png`
- `tiles/grass.png`
- `items/coin.png`

### File Organization
```
public/game-assets/
├── characters/
├── crops/          ← PRIORITY
├── tiles/          ← PRIORITY
├── buildings/
├── items/
├── effects/
├── ui/
├── sounds/
└── placeholder.png ← Fallback for missing assets
```

---

## Quality Checklist

Before an asset is considered complete:

- [ ] Correct dimensions (64x64px base, or specified size)
- [ ] PNG format with transparency
- [ ] Matches art direction (style, lighting, perspective)
- [ ] Visually distinct from similar assets
- [ ] Readable at target size
- [ ] Optimized file size (<50KB)
- [ ] Correct filename (lowercase_underscore)
- [ ] Added to asset manifest
- [ ] Tested in game scene
- [ ] No copyright/licensing issues

---

## Implementation Priority

### Phase 1: MVP Critical (Current Milestone)
1. ✅ Placeholder system (`placeholder.png`)
2. 🔲 Crop sprites (30 total) - **BLOCKING GAMEPLAY**
3. 🔲 Plot tile (`plot_empty.png`) - **BLOCKING VISUAL**

### Phase 2: Core Experience
4. 🔲 Grass and dirt tiles
5. 🔲 UI elements (button, panel)
6. 🔲 Coin icon

### Phase 3: Polish
7. 🔲 Effects (sparkle, harvest particles)
8. 🔲 Seed bag icon

### Phase 4: Future Enhancement
9. 🔲 Buildings (barn, shop)
10. 🔲 Character sprite

---

## Asset Generation Options

### Option 1: AI Image Generation (Recommended for MVP)
- Use Claude's image generation for concept and production assets
- Prompt template for crops:
  ```
  Create a 64x64px game sprite of a [crop name] in [state] stage.
  Style: cute 2D farming game, top-down view, vibrant colors, 
  transparent background, clean silhouette, mobile game quality.
  [Specific details about the crop appearance]
  ```

### Option 2: Manual Design
- Design tools: Aseprite, Photoshop, Procreate
- Faster for simple geometric shapes
- Better control over pixel-perfect details

### Option 3: Asset Pack Purchase
- Consider high-quality farming asset packs
- Ensure licensing allows commercial use
- Must match established art direction

---

## Current Status

- [x] Asset specification document created
- [x] Directory structure established
- [x] Placeholder system in place
- [x] Asset manifest updated with all 30 crop sprites
- [ ] Production assets created (0/30 crops completed)

**Next Action**: Begin creating crop sprites, starting with Level 1 crops (carrot, rice) as proof of concept.
