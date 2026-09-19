# Milestone 07 - Quests System

## Tổng quan
Triển khai hệ thống nhiệm vụ hàng ngày (daily quests) với tính năng tracking tự động và claim rewards.

## Các thành phần đã triển khai

### 1. Quest Types & Config
**File:** `src/game/types/index.ts`
- `Quest` interface với id, title, description, type, target, progress, reward, claimed
- `QuestType`: PLANT, HARVEST, BUY_SEED, SELL, EARN_COINS, GAIN_EXP, REACH_LEVEL

**File:** `src/game/config/quests.ts`
- `DAILY_QUESTS`: 6 nhiệm vụ hàng ngày với Vietnamese titles
  - Trồng 5 cây (PLANT, target: 5, reward: 50 xu + 20 XP)
  - Thu hoạch 3 cây (HARVEST, target: 3, reward: 100 xu + 30 XP)
  - Mua 2 hạt giống (BUY_SEED, target: 2, reward: 30 xu + 10 XP)
  - Bán 5 sản phẩm (SELL, target: 5, reward: 80 xu + 25 XP)
  - Kiếm 200 xu (EARN_COINS, target: 200, reward: 50 xu + 20 XP)
  - Kiếm 100 XP (GAIN_EXP, target: 100, reward: 100 xu + 40 XP)

### 2. Quest Service
**File:** `src/game/services/questService.ts`
- `updateQuestProgress(type, amount)`: Cập nhật tiến độ quest
- `claimQuest(questId)`: Claim rewards khi quest hoàn thành
- Validate: không claim quest chưa hoàn thành hoặc đã claim
- Auto-sync với gameStore

### 3. Game Store Integration
**File:** `src/game/stores/gameStore.ts`
- Thêm `quests: Quest[]` vào GameState
- Initialize với `DAILY_QUESTS.map(quest => ({ ...quest }))`
- Thêm `setQuests(quests)` action
- Reset quests khi resetGame()

### 4. Economy Service Integration
**File:** `src/game/services/economyService.ts`
- `buySeed()`: Track BUY_SEED quest
- `sellCrop()`: Track SELL và EARN_COINS quests
- `plantCrop()`: Track PLANT quest
- `harvestCrop()`: Track HARVEST và GAIN_EXP quests
- Tất cả actions tự động update quest progress

### 5. Quests Modal UI
**File:** `src/game/components/QuestsModal.tsx`
- Hiển thị danh sách quest từ store (không dùng mock data)
- Progress bar với màu xanh khi hoàn thành
- Badge "Đã nhận" cho claimed quests
- Nút "Nhận thưởng" với Gift icon
- Toast notification khi claim: "+X xu, +Y XP"
- Gray out và opacity 60% cho claimed quests
- Animate pulse icon cho completed quests

## Quest Flow

### User Journey
1. **Xem quest**: User mở Quests modal → thấy 6 daily quests
2. **Làm quest**: User plant/harvest/buy/sell → progress tự động tăng
3. **Complete**: Progress bar đầy (xanh lá) → nút "Nhận thưởng" xuất hiện
4. **Claim**: Click "Nhận thưởng" → nhận xu + XP → quest gray out

### Auto-Tracking
```
User action → EconomyService → QuestService.updateQuestProgress()
                                    ↓
                              GameStore.setQuests()
                                    ↓
                              QuestsModal re-renders
```

## Build & Verification

### Build Status
- ✅ Production build: 23.21s (client) + 6.45s (ssr) + 1m39s (nitro)
- ✅ Lint: 0 errors, 10 warnings (fast-refresh only, không ảnh hưởng)
- ✅ Prettier: All formatting fixed

### Acceptance Criteria
- ✅ **AC1**: Quest types defined với 6+ quest types
- ✅ **AC2**: Quest config với Vietnamese titles và balanced rewards
- ✅ **AC3**: Quest service với updateProgress và claimQuest
- ✅ **AC4**: Tích hợp vào gameStore với quests state
- ✅ **AC5**: EconomyService auto-track quest progress
- ✅ **AC6**: QuestsModal hiển thị real quest data với claim button
- ✅ **AC7**: Toast notifications khi claim rewards
- ✅ **AC8**: Visual feedback cho quest states (pending/completed/claimed)

## Files Changed
- `src/game/types/index.ts` - Added Quest and QuestType types
- `src/game/config/quests.ts` - NEW: Quest definitions
- `src/game/services/questService.ts` - NEW: Quest logic
- `src/game/stores/gameStore.ts` - Added quests state and setQuests
- `src/game/services/economyService.ts` - Quest tracking integration
- `src/game/components/QuestsModal.tsx` - Real quest UI with claim

## Technical Decisions

### 1. Quest Progress Tracking
- **Chosen**: Auto-track trong EconomyService
- **Why**: Đảm bảo mọi action đều được track, không bỏ sót
- **Alternative**: Manual tracking từ UI → dễ miss actions

### 2. Quest State Management
- **Chosen**: Store quests trong gameStore
- **Why**: Centralized state, dễ sync UI
- **Alternative**: Separate quest store → thêm complexity

### 3. Claim Validation
- **Chosen**: Server-side style validation trong questService
- **Why**: Prevent cheating, business logic tách biệt
- **Alternative**: UI-only validation → dễ bị bypass

### 4. Daily Reset
- **Not Implemented**: Auto-reset hàng ngày
- **Reason**: Cần backend (PocketBase) để lưu last reset time
- **Plan**: Milestone 09 - Backend Integration

## Next Steps (Not in this milestone)
1. **Milestone 08 - Polish**: UI animations, sound effects
2. **Milestone 09 - Backend**: PocketBase quest persistence, daily reset
3. **Future**: Weekly quests, achievement system, quest chains

## Known Limitations
- Quest không persist qua page refresh (cần backend)
- Không có daily reset logic (manual reset via resetGame())
- Không có quest expiry hoặc time limit
- Progress không validate max value (có thể vượt target)

## Testing Notes
**Manual Test Cases:**
1. Plant 5 crops → "Trồng 5 cây" progress = 5/5 → claim button appears
2. Harvest 3 crops → "Thu hoạch 3 cây" progress = 3/3 → claim rewards
3. Claim quest → toast shows "+X xu, +Y XP" → quest grays out
4. Try claim again → error toast "Nhiệm vụ đã được nhận thưởng"
5. Check player coins/XP increased after claim

## Performance Impact
- **Bundle size**: +3KB (quest config + service)
- **Runtime overhead**: Minimal (quest updates on actions already happening)
- **UI rendering**: O(n) where n = number of quests (currently 6)

---

**Status**: ✅ Completed
**Date**: 2025-01-XX
**Duration**: ~45 minutes
