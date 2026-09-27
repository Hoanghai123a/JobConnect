# Milestone 05 — Economy Acceptance Verification

## Acceptance Criteria (từ prompts/05-economy.md)

### ✅ Shop → Inventory → Farm → Harvest → Sell loop works

**Status:** PASS  

**Evidence:**

#### 1. **Shop: Buy seeds**
- File: [ShopModal.tsx](src/game/components/ShopModal.tsx)
- Uses: `EconomyService.buySeed(cropId)`
- Validation:
  - ✅ Checks player has enough coins
  - ✅ Checks player level unlocks crop
  - ✅ Prevents negative coins
  - ✅ Toast notifications for success/error

#### 2. **Inventory: Seeds added**
- Store: [gameStore.ts:100-106](src/game/stores/gameStore.ts:100)
- Action: `addToInventory(cropId, quantity)`
- Validation:
  - ✅ Inventory updates after purchase
  - ✅ Seeds available in PlantModal

#### 3. **Farm: Plant crops**
- File: [PlantModal.tsx](src/game/components/PlantModal.tsx)
- Uses: `EconomyService.plantCrop(plotId, cropId)`
- Validation:
  - ✅ Checks seed in inventory
  - ✅ Checks plot is empty
  - ✅ Removes seed from inventory
  - ✅ Plants crop with timestamp
  - ✅ Prevents planting on occupied plot

#### 4. **Harvest: Get rewards**
- File: [PlantModal.tsx](src/game/components/PlantModal.tsx)
- Uses: `EconomyService.harvestCrop(plotId)`
- Validation:
  - ✅ Checks crop is READY
  - ✅ Prevents double harvest (plot.crop set to null)
  - ✅ Gives coins (crop.sellPrice)
  - ✅ Gives XP (crop.expReward)
  - ✅ Adds harvested crop to inventory

#### 5. **Sell: Convert crops to coins**
- File: [SellModal.tsx](src/game/components/SellModal.tsx)
- Uses: `EconomyService.sellCrop(cropId, quantity)`
- Validation:
  - ✅ Checks crop in inventory
  - ✅ Prevents selling nonexistent items
  - ✅ Prevents negative inventory
  - ✅ Removes crops from inventory
  - ✅ Adds coins to player

## Implementation Details

### EconomyService (Centralized Logic)

File: [economyService.ts](src/game/services/economyService.ts)

**Methods:**
- `buySeed()` — Buy seed, validate coins & level
- `sellCrop()` — Sell harvested crop, validate inventory
- `plantCrop()` — Plant seed on plot, validate seed & plot
- `harvestCrop()` — Harvest ready crop, give rewards

**Validation Rules Enforced:**

✅ **Negative inventory prevented:**
```typescript
if (!inventory[cropId] || inventory[cropId] < quantity) return false;
```

✅ **Negative coins prevented:**
```typescript
if (player.coins < amount) return false;
```

✅ **Selling nonexistent items prevented:**
```typescript
const currentQuantity = store.inventory[cropId] || 0;
if (currentQuantity < quantity) {
  return { success: false, error: "Không đủ số lượng trong kho" };
}
```

✅ **Double harvest prevented:**
```typescript
// harvestCrop() sets crop to null
const harvestedCrop = store.harvestCrop(plotId);
if (!harvestedCrop) return { success: false };
```

### Configuration-Based Prices/Rewards

File: [crops.ts](src/game/config/crops.ts)

All economy values from config:
- `seedCost` — Cost to buy seed
- `sellPrice` — Revenue from harvest
- `expReward` — XP gained from harvest
- `growTime` — Time to grow (seconds)
- `unlockedAtLevel` — Level requirement

### UI Integration

**Bottom Navigation:**
- [GameBottomNav.tsx](src/game/components/GameBottomNav.tsx) — Added "Bán" button (5 buttons total)

**Modals:**
- [ShopModal.tsx](src/game/components/ShopModal.tsx) — Buy seeds
- [SellModal.tsx](src/game/components/SellModal.tsx) — Sell crops (NEW)
- [PlantModal.tsx](src/game/components/PlantModal.tsx) — Plant & harvest
- [InventoryModal.tsx](src/game/components/InventoryModal.tsx) — View items

**Toast Notifications:**
- Success: "Đã mua hạt giống!", "Thu hoạch! +X xu, +Y XP", "Đã bán! +X xu"
- Error: "Không đủ xu", "Không thể thu hoạch", etc.

## Build & Lint Status

```bash
npm run build  # ✅ PASS (24.58s)
npm run lint   # ✅ PASS (0 errors)
```

## Conclusion

**Milestone 05 - Economy: ✅ COMPLETE**

The complete economy loop is functional:
1. **Shop** → Buy seeds (coins → seeds)
2. **Inventory** → Seeds stored
3. **Farm** → Plant seeds (seeds → crops)
4. **Harvest** → Get rewards (crops → coins + XP + harvested crops)
5. **Sell** → Sell harvested crops (harvested crops → coins)

All validation rules enforced:
- ✅ No negative inventory
- ✅ No negative coins
- ✅ Cannot sell nonexistent items
- ✅ Cannot double harvest
- ✅ Configuration-based prices/rewards

**Next:** Milestone 06 - Progression (level unlock system, gameplay progression)
