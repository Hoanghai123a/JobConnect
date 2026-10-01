# Economy Service Test Plan

## Tổng quan

Document này mô tả test plan cho `economyService.ts` - service layer xử lý tất cả economic transactions trong farm game.

## Test Coverage

### 1. buySeed()

**Chức năng:** Mua hạt giống từ shop

**Test Cases:**

✅ **TC-BUY-001: Successful seed purchase**
- **Given:** Player có 1000 coins, level 1
- **When:** Buy carrot seed (cost 20 coins)
- **Then:** 
  - Success = true
  - Coins = 980
  - Inventory.carrot = 1
  - Quest "BUY_SEED" progress +1
  - Audio "buy" plays

✅ **TC-BUY-002: Insufficient coins**
- **Given:** Player có 10 coins
- **When:** Buy carrot seed (cost 20 coins)
- **Then:**
  - Success = false
  - Error = "Không đủ xu"
  - Coins unchanged
  - Inventory unchanged

✅ **TC-BUY-003: Level requirement not met**
- **Given:** Player level 1
- **When:** Buy dragon_fruit seed (requires level 13)
- **Then:**
  - Success = false
  - Error = "Chưa đủ cấp"
  - No transaction

✅ **TC-BUY-004: Invalid crop ID**
- **Given:** Any player state
- **When:** Buy "invalid_crop"
- **Then:**
  - Success = false
  - Error = "Crop không tồn tại"

**Security Validations:**
- ✅ Prevent negative coin balance
- ✅ Validate level requirement server-side
- ✅ Validate crop exists in CROPS config

---

### 2. sellCrop()

**Chức năng:** Bán crops đã thu hoạch

**Test Cases:**

✅ **TC-SELL-001: Successful crop sale**
- **Given:** Inventory có 5 carrots
- **When:** Sell 2 carrots (35 coins each)
- **Then:**
  - Success = true
  - Earned = 70
  - Inventory.carrot = 3
  - Coins +70
  - Quest "SELL" progress +2
  - Quest "EARN_COINS" progress +70

✅ **TC-SELL-002: Insufficient inventory**
- **Given:** Inventory có 5 carrots
- **When:** Sell 10 carrots
- **Then:**
  - Success = false
  - Error = "Không đủ số lượng trong kho"
  - Inventory unchanged

✅ **TC-SELL-003: Zero quantity**
- **Given:** Any inventory state
- **When:** Sell 0 carrots
- **Then:**
  - Success = false
  - Error = "Số lượng không hợp lệ"

✅ **TC-SELL-004: Negative quantity**
- **Given:** Any inventory state
- **When:** Sell -1 carrots
- **Then:**
  - Success = false
  - Error = "Số lượng không hợp lệ"

**Security Validations:**
- ✅ Prevent negative inventory
- ✅ Validate quantity > 0
- ✅ Prevent integer overflow on coins

---

### 3. plantCrop()

**Chức năng:** Trồng cây vào plot

**Test Cases:**

✅ **TC-PLANT-001: Successful planting**
- **Given:** 
  - Inventory có 3 carrot seeds
  - Plot 0 is empty
- **When:** Plant carrot on plot 0
- **Then:**
  - Success = true
  - Inventory.carrot = 2
  - Plot[0].crop.cropId = "carrot"
  - Plot[0].crop.state = "GROWING"
  - Plot[0].crop.plantedAt ≈ now
  - Plot[0].crop.harvestAt ≈ now + 30s
  - Quest "PLANT" progress +1

✅ **TC-PLANT-002: Plot already occupied**
- **Given:** Plot 0 already has a crop
- **When:** Plant carrot on plot 0
- **Then:**
  - Success = false
  - Error = "Ô đất đã có cây"
  - No state change

✅ **TC-PLANT-003: No seed in inventory**
- **Given:** Inventory empty
- **When:** Plant carrot on plot 0
- **Then:**
  - Success = false
  - Error = "Không có hạt giống trong kho"

✅ **TC-PLANT-004: Invalid plot ID**
- **Given:** Any state
- **When:** Plant on plot 99
- **Then:**
  - Success = false
  - Error = "Ô đất không tồn tại"

**Security Validations:**
- ✅ Validate plot exists (0-11)
- ✅ Validate plot is empty
- ✅ Validate seed ownership
- ✅ Timestamps set by client (server should override in authenticated mode)

---

### 4. harvestCrop()

**Chức năng:** Thu hoạch cây trồng

**Test Cases:**

✅ **TC-HARVEST-001: Successful harvest**
- **Given:**
  - Plot 0 has carrot in "READY" state
  - harvestAt < now
- **When:** Harvest plot 0
- **Then:**
  - Success = true
  - Rewards = { coins: 35, exp: 3, cropId: "carrot" }
  - Player.coins +35
  - Player.exp +3
  - Inventory.carrot +1
  - Plot[0].crop = null
  - Quest "HARVEST" progress +1
  - Quest "GAIN_EXP" progress +3

✅ **TC-HARVEST-002: Empty plot**
- **Given:** Plot 1 is empty
- **When:** Harvest plot 1
- **Then:**
  - Success = false
  - Error = "Ô đất trống"

✅ **TC-HARVEST-003: Crop not ready**
- **Given:** Plot 0 has crop with harvestAt > now
- **When:** Harvest plot 0
- **Then:**
  - Success = false
  - Error = "Cây chưa lớn"

✅ **TC-HARVEST-004: Prevent double harvest**
- **Given:** Plot 0 ready for harvest
- **When:** Harvest plot 0 twice
- **Then:**
  - First harvest: success
  - Second harvest: fail with "Ô đất trống"

**Security Validations:**
- ✅ Validate harvestAt timestamp (server-side critical)
- ✅ Prevent time manipulation
- ✅ Prevent double harvest
- ✅ Atomic operation (harvest + rewards)

---

## Edge Cases & Race Conditions

### EC-001: Concurrent transactions
**Scenario:** Player buys 2 seeds rapidly with exactly 40 coins

**Expected Behavior:**
- Both succeed (40 - 20 - 20 = 0), OR
- Second fails with "Không đủ xu"
- Never allow negative coins

**Current Implementation:** Zustand store is synchronous, so race is unlikely in single-threaded JS

---

### EC-002: Inventory overflow
**Scenario:** Inventory has 999,999 carrots, harvest +1

**Expected Behavior:**
- Should succeed (JS numbers are safe up to 2^53)
- No integer overflow

**Note:** Consider adding max inventory limit in future

---

### EC-003: Level up during harvest
**Scenario:** Player harvests and gains enough EXP to level up

**Expected Behavior:**
- Harvest succeeds
- EXP added
- Level up triggered (gameStore.addExp handles this)
- Level-up rewards given

**Status:** ✅ Already handled by gameStore.addExp()

---

## Integration Tests (Manual)

### IT-001: Full gameplay loop
1. Start with 1000 coins, level 1
2. Buy 3 carrot seeds (60 coins spent)
3. Plant 3 carrots on plots 0, 1, 2
4. Wait 30 seconds
5. Harvest all 3 carrots
6. Sell 2 carrots
7. Verify final state:
   - Coins ≈ 1010 (1000 - 60 + 105 (3×35) + 70 (2×35))
   - Inventory: 1 carrot
   - EXP: 9 (3×3)
   - Quests updated correctly

---

### IT-002: Level progression
1. Start at level 1
2. Plant and harvest rice repeatedly (5 EXP each)
3. Verify level unlocks at correct EXP thresholds
4. Verify higher-level crops become available

---

### IT-003: Quest completion
1. Complete daily quest "Harvest 10 crops"
2. Claim reward
3. Verify coins and EXP added
4. Verify quest marked as claimed

---

## Performance Tests

### PT-001: Rapid transactions
- Execute 100 buy/sell operations rapidly
- Verify no race conditions
- Verify all transactions atomic

### PT-002: Large inventory
- Create inventory with 1000+ different crops
- Test sell/plant operations
- Verify no performance degradation

---

## Security Audit Checklist

### Client-Side Validations (Current)
- [x] Validate coins >= cost
- [x] Validate level >= requirement
- [x] Validate inventory quantity
- [x] Validate plot ownership
- [x] Validate crop readiness (time-based)
- [x] Prevent negative values

### Server-Side Validations (Required for Authenticated Mode)
- [ ] **CRITICAL:** Validate harvestAt timestamp server-side
- [ ] **CRITICAL:** Validate transaction order (no double-harvest)
- [ ] **HIGH:** Validate crop grow times match server config
- [ ] **HIGH:** Rate limit transactions (prevent rapid farming)
- [ ] **MEDIUM:** Log all transactions for audit
- [ ] **MEDIUM:** Validate inventory changes match transaction type

---

## Test Execution Plan

### Phase 1: Unit Tests (Offline Mode)
- [x] Test suite created: `economyService.test.ts`
- [ ] Execute tests in isolated environment
- [ ] Achieve 100% code coverage

### Phase 2: Integration Tests (Offline Mode)
- [ ] Manual testing trong browser
- [ ] Verify full gameplay loop
- [ ] Test edge cases

### Phase 3: Server Integration Tests (Authenticated Mode)
- [ ] Test với real PocketBase instance
- [ ] Verify server-side validations
- [ ] Test concurrent users

### Phase 4: Load Testing
- [ ] Simulate 100 concurrent users
- [ ] Monitor transaction throughput
- [ ] Identify bottlenecks

---

## Test Results Template

```
Test Run: [Date]
Environment: [Offline/Authenticated]
Browser: [Chrome/Firefox/Safari]
PocketBase: [Version]

Results:
- Total Tests: X
- Passed: Y
- Failed: Z
- Coverage: X%

Failed Tests:
1. [Test ID] - [Reason]
2. ...

Performance Metrics:
- Average transaction time: Xms
- P95 transaction time: Xms
- Max concurrent users: X
```

---

## Known Issues

1. **Mock dependencies in tests**
   - Zustand store requires browser environment
   - Audio/Quest services need mocking
   - **Workaround:** Manual browser testing preferred

2. **Time-based testing**
   - Crop growth depends on real time
   - Difficult to test in unit tests
   - **Workaround:** Mock Date.now() or use shorter grow times

3. **Storage adapter in tests**
   - Requires PocketBase or localStorage
   - **Workaround:** Use in-memory mock adapter

---

## Next Steps

1. ✅ Create test document
2. → Setup manual test environment
3. → Execute integration tests in browser
4. → Setup PocketBase test instance
5. → Execute authenticated mode tests
6. → Document test results
7. → Fix any discovered issues
