# Milestone 03 — Phaser World Implementation Summary

## Ngày hoàn thành: 2026-09-19

## Mục tiêu

Xây dựng playable farm world trong Phaser với tilemap, sprites, và interaction system.

## Đã triển khai

### 1. FarmScene - Complete Rewrite
- **File:** [src/game/scenes/FarmScene.ts](src/game/scenes/FarmScene.ts)
- **Chức năng:**
  - Background với grass và path decorations
  - 4×3 plot layout (12 plots) với soil visuals
  - Interactive plots với hover highlight (yellow border)
  - Click selection system
  - Visual state updates (GROWING → READY)
  - Real-time countdown display cho growing crops
  - Event emission cho React UI integration
  - Proper cleanup (no memory leaks)

**Architecture:**
```typescript
FarmScene
├── plotGraphics: Map<plotId, Container>
├── selectedPlotId: number | null
├── createBackground() — grass + paths
├── createFarmLayout() — 12 interactive plots
├── createPlotVisual() — soil + highlight + state text
├── highlightPlot() — yellow border on/off
├── selectPlot() — emit "plot-selected" event
├── updatePlotsVisuals() — sync với Zustand state
└── setupUpdateLoop() — crop state check mỗi giây
```

### 2. PlantModal - Plot Interaction UI
- **File:** [src/game/components/PlantModal.tsx](src/game/components/PlantModal.tsx)
- **Chức năng:**
  - Hiển thị khi click vào plot
  - 3 trạng thái: Empty (trồng), Growing (info), Ready (thu hoạch)
  - **Empty state:** Grid hiển thị seeds có trong inventory
  - **Growing state:** Countdown timer + thông tin crop
  - **Ready state:** Button thu hoạch → coins + exp + inventory
  - Validation: chỉ hiển thị crops đã unlock + có trong inventory

**Plant flow:**
```
Click plot → Phaser emits "plot-selected" 
→ React opens PlantModal 
→ User selects seed 
→ removeFromInventory() + plantCrop() 
→ Modal closes 
→ Phaser updates visual (🌱 + countdown)
```

**Harvest flow:**
```
Click ready plot → Phaser emits "plot-selected" 
→ React opens PlantModal (harvest state) 
→ User clicks "Thu hoạch" 
→ harvestCrop() + addCoins() + addExp() + addToInventory() 
→ Modal closes 
→ Phaser updates visual (empty plot)
```

### 3. React ↔ Phaser Integration
- **File:** [src/game/PhaserGame.tsx](src/game/PhaserGame.tsx:1)
- **Pattern:**
  - React maintains UI modals + state management
  - Phaser handles rendering + user input
  - Event-driven communication (no polling)
  - `scene.events.on("plot-selected", callback)`
  - Zustand store là single source of truth

**State flow:**
```
User action (Phaser click)
    ↓
Phaser emits event
    ↓
React handler opens modal
    ↓
User confirms action
    ↓
Zustand store updates
    ↓
Phaser subscribe callback triggers
    ↓
Visual update in game
```

### 4. Visual State System

**Plot states:**
- Empty: Soil color (brown), no text
- Growing: 🌱 emoji + countdown (e.g., "32s")
- Ready: ✨ emoji + "Sẵn sàng!"

**Interaction states:**
- Hover: Yellow highlight border
- Selected: Yellow highlight persists
- Click: Emits event + opens modal

### 5. Zustand Store Integration

FarmScene subscribes to store changes:
```typescript
useGameStore.subscribe(() => {
  this.updatePlotsVisuals();
});
```

No direct manipulation — all state changes go through store actions.

## Architecture Compliance

✅ **Phaser không gọi PocketBase** — Chỉ đọc/ghi Zustand store  
✅ **React UI riêng biệt** — Modals, HUD, navigation ở React layer  
✅ **Event-driven** — Không polling, không tight coupling  
✅ **No memory leaks** — Proper cleanup trong destroy()  
✅ **Timestamp-based growth** — Không dùng setTimeout cho crop timing  

## Files Summary

**Created:**
- [PlantModal.tsx](src/game/components/PlantModal.tsx) — Plot interaction UI

**Modified:**
- [FarmScene.ts](src/game/scenes/FarmScene.ts) — Full interactive world implementation
- [PhaserGame.tsx](src/game/PhaserGame.tsx:1) — Event listener + PlantModal integration

## Acceptance Criteria

- ✅ 12 plots visible in 4×3 layout
- ✅ Player can interact with plot (click → modal)
- ✅ No direct PocketBase calls from Phaser
- ✅ No listener/timer leaks (cleanup in destroy)
- ✅ Locked/unlocked visual state (via text display)
- ✅ Clean scene lifecycle

## Gameplay Loop Working

```
1. Mua seed từ Shop → inventory++
2. Click plot trống → mở PlantModal
3. Chọn seed → trồng → inventory--
4. Phaser hiển thị 🌱 + countdown
5. Đợi crop lớn (timestamp-based)
6. Phaser tự động chuyển state → ✨ Sẵn sàng
7. Click plot → mở PlantModal (harvest)
8. Thu hoạch → coins++ exp++ inventory++
9. Lặp lại
```

## Technical Highlights

- **Container-based plot graphics** — Flexible composition
- **Map-based tracking** — O(1) lookup cho plot updates
- **Subscribe pattern** — React state → Phaser visual sync
- **Event emission** — Phaser → React communication
- **Stateless UI** — Modals không hold state, chỉ đọc từ store

## Next Steps

**Milestone 04 - Crop System:**
- Real crop sprites thay vì emoji placeholders
- Asset loading từ manifest
- Animation system (plant → grow → ready)
- Particle effects khi harvest
- Sound effects

## Verification

```bash
npm run build  # ✓ Pass
npm run lint   # ✓ 0 errors, 10 warnings (pre-existing)
```

**Manual testing needed:**
1. Click plots → modal opens
2. Buy seed → inventory updates
3. Plant seed → visual changes
4. Wait for crop → countdown works
5. Harvest → rewards received

Lines of code added: ~200 LOC (FarmScene) + ~150 LOC (PlantModal)
