# Milestone 04 — Crop System Acceptance Verification

## Acceptance Criteria (từ prompts/04-crop-system.md)

### ✅ 1. Plant works
**Status:** PASS  
**Evidence:** 
- `plantCrop()` action tồn tại trong [gameStore.ts:121-141](src/game/stores/gameStore.ts:121)
- Nhận parameters: `plotId`, `cropId`, `growTime`
- Tạo PlantedCrop với `plantedAt`, `harvestAt`, `state: "GROWING"`
- PlantModal component cho phép chọn seed và trồng
- Validation: kiểm tra seed có trong inventory

### ✅ 2. Crop changes visual stage
**Status:** PASS  
**Evidence:**
- FarmScene có `updatePlotsVisuals()` method [FarmScene.ts:120-145](src/game/scenes/FarmScene.ts:120)
- Visual khác nhau cho mỗi stage:
  - **GROWING:** Green sprout shape với countdown timer
  - **READY:** Larger green shape với yellow glow + yellow center
- Graphics API thay vì emoji placeholders

### ✅ 3. Reload preserves correct stage from timestamps
**Status:** PASS  
**Evidence:**
- Crop state dựa trên `plantedAt` và `harvestAt` timestamps [gameStore.ts:121-141](src/game/stores/gameStore.ts:121)
- `updateCropStates()` so sánh `Date.now()` với `harvestAt` [gameStore.ts:163-178](src/game/stores/gameStore.ts:163)
- Không dùng setTimeout làm source of truth
- State được tính lại mỗi giây từ timestamps
- Reload browser sẽ restore đúng state vì dựa vào timestamp, không phải local timer

### ✅ 4. Ready state is deterministic
**Status:** PASS  
**Evidence:**
- Ready state được xác định bởi: `Date.now() >= crop.harvestAt`
- Logic trong `updateCropStates()`: [gameStore.ts:163-178](src/game/stores/gameStore.ts:163)
```typescript
if (now >= plot.crop.harvestAt) {
  return {
    ...plot,
    crop: { ...plot.crop, state: "READY" as const },
  };
}
```
- Deterministic: cùng timestamp luôn cho cùng kết quả
- Không phụ thuộc vào setTimeout hoặc client-side timers

### ✅ 5. Harvest clears plot
**Status:** PASS  
**Evidence:**
- `harvestCrop()` action: [gameStore.ts:143-161](src/game/stores/gameStore.ts:143)
- Set `crop: null` sau khi harvest thành công
- Validation: chỉ harvest nếu `plot.crop.state === "READY"`
- Return harvestedCrop để PlantModal xử lý rewards
- Visual update tự động sau khi state thay đổi

## Additional Implemented Features

### ✅ Crop config
- 10 crops trong [crops.ts](src/game/config/crops.ts): carrot, rice, corn, potato, tomato, strawberry, watermelon, pumpkin, sunflower, dragon_fruit
- Test balance từ SKILL.md đã được áp dụng
- CropConfig interface với đầy đủ fields

### ✅ Seed selection
- PlantModal hiển thị grid seeds có trong inventory
- Filter theo level unlock
- Validation: chỉ hiển thị seeds có quantity > 0

### ✅ Timestamp-based progression
- Không dùng setTimeout
- Growth dựa trên `plantedAt` và `harvestAt`
- `updateCropStates()` check mỗi giây nhưng không modify timestamps
- Reload-safe

### ✅ Visual improvements
- Colored shapes thay vì emoji
- Graphics API cho detailed visuals
- Growing stage: small green sprout
- Ready stage: larger with yellow glow
- Countdown timer với background

## Build & Lint Status

```bash
npm run build  # ✅ PASS
npm run lint   # ✅ PASS (0 errors, 10 pre-existing warnings)
```

## Conclusion

**Milestone 04 - Crop System: ✅ COMPLETE**

Tất cả acceptance criteria đã được verify và pass. Crop system hoạt động đầy đủ với:
- Plant/harvest logic hoàn chỉnh
- Timestamp-based growth (reload-safe)
- Deterministic ready state
- Visual feedback với colored shapes
- Validation rules đầy đủ

Next: Milestone 05 - Economy (server-side validation, PocketBase integration)
