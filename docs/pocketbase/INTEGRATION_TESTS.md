# Integration Tests - PocketBase Farm Game

## Tổng quan

Document này mô tả integration test plan cho authenticated mode với PocketBase backend.

## Test Environment Setup

### Prerequisites

1. **PocketBase instance** chạy local hoặc test server
2. **Test database** riêng biệt với production
3. **Test user accounts** cho testing
4. **Browser/Playwright** cho end-to-end tests

### Environment Variables

```env
# .env.test
VITE_POCKETBASE_URL=http://localhost:8091
VITE_TEST_USER_EMAIL=test@farmgame.local
VITE_TEST_USER_PASSWORD=testpassword123
```

---

## Test Scenarios

### IT-001: Player Initialization

**Objective:** Verify player được tạo đúng khi user đăng nhập lần đầu

**Steps:**
1. Login với test user account
2. Navigate to /farm
3. Wait for FarmLoader to complete

**Expected Results:**
- Player record created trong `farm_players` với:
  - `user` = authenticated user ID
  - `coins` = 1000
  - `level` = 1
  - `exp` = 0
- 12 empty plots created trong `farm_plots`
- Inventory empty trong `farm_inventory`
- 6 daily quests created trong `farm_quests`

**Verification:**
```typescript
const player = await pb.collection('farm_players').getFirstListItem(
  `user = "${pb.authStore.model?.id}"`
);
assert(player.coins === 1000);
assert(player.level === 1);
assert(player.exp === 0);

const plots = await pb.collection('farm_plots').getFullList({
  filter: `player = "${player.id}"`
});
assert(plots.length === 12);
assert(plots.every(p => p.crop_id === null));

const quests = await pb.collection('farm_quests').getFullList({
  filter: `player = "${player.id}"`
});
assert(quests.length === 6);
```

---

### IT-002: Buy Seed Transaction

**Objective:** Verify buy seed hoạt động end-to-end với PocketBase

**Steps:**
1. Login and initialize player
2. Click shop button
3. Select carrot seed (20 coins)
4. Confirm purchase

**Expected Results:**
- Player coins decreased: 1000 → 980
- Inventory updated: carrot = 1
- Quest progress updated: BUY_SEED +1
- All changes persisted to PocketBase
- UI reflects new state immediately

**Verification:**
```typescript
// Before
const initialCoins = player.coins; // 1000

// Action
await EconomyService.buySeed('carrot');

// After
const updatedPlayer = await pb.collection('farm_players').getOne(player.id);
assert(updatedPlayer.coins === initialCoins - 20);

const inventory = await pb.collection('farm_inventory').getFullList({
  filter: `player = "${player.id}" && crop_id = "carrot"`
});
assert(inventory[0].quantity === 1);
```

---

### IT-003: Plant and Harvest Cycle

**Objective:** Verify full plant → grow → harvest cycle với timestamps

**Steps:**
1. Buy carrot seed
2. Plant on plot 0
3. Wait for grow time (30 seconds)
4. Harvest crop

**Expected Results:**
- **After plant:**
  - Plot 0 updated với crop data
  - `planted_at` = current time
  - `harvest_at` = planted_at + 30s
  - Inventory carrot -1
  
- **After harvest (wait 30s):**
  - Plot 0 cleared (crop_id = null)
  - Player coins +35
  - Player exp +3
  - Inventory carrot +1
  - Quest HARVEST +1, GAIN_EXP +3

**Verification:**
```typescript
// Plant
await EconomyService.plantCrop(0, 'carrot');

const plot = await pb.collection('farm_plots').getFirstListItem(
  `player = "${player.id}" && plot_id = 0`
);
assert(plot.crop_id === 'carrot');
assert(plot.harvest_at !== null);

// Wait
await new Promise(resolve => setTimeout(resolve, 31000));

// Harvest
const result = await EconomyService.harvestCrop(0);
assert(result.success === true);
assert(result.rewards.coins === 35);

const updatedPlot = await pb.collection('farm_plots').getOne(plot.id);
assert(updatedPlot.crop_id === null);
```

---

### IT-004: Quest Tracking and Completion

**Objective:** Verify quest progress updates và claim rewards

**Steps:**
1. Initialize player với fresh quests
2. Complete quest "Plant 5 crops"
3. Claim quest reward

**Expected Results:**
- Quest progress increments with each plant action
- Quest becomes claimable when progress >= target
- Claim adds rewards to player (coins + exp)
- Quest marked as claimed
- Cannot claim twice

**Verification:**
```typescript
const questId = 'daily_plant_5';

// Track progress
for (let i = 0; i < 5; i++) {
  await EconomyService.plantCrop(i, 'carrot');
}

const quest = await pb.collection('farm_quests').getFirstListItem(
  `player = "${player.id}" && quest_id = "${questId}"`
);
assert(quest.progress === 5);
assert(quest.claimed === false);

// Claim
const initialCoins = player.coins;
await QuestService.claimReward(questId);

const updatedQuest = await pb.collection('farm_quests').getOne(quest.id);
assert(updatedQuest.claimed === true);

const updatedPlayer = await pb.collection('farm_players').getOne(player.id);
assert(updatedPlayer.coins > initialCoins); // Reward added
```

---

### IT-005: Concurrent User Isolation

**Objective:** Verify data isolation giữa multiple users

**Steps:**
1. Login as User A
2. Buy seeds and plant crops
3. Logout
4. Login as User B
5. Verify User B không thấy data của User A

**Expected Results:**
- User A và User B có player records riêng biệt
- Plots của User A không visible cho User B
- Inventory và quests isolated
- PocketBase access rules enforced

**Verification:**
```typescript
// User A actions
await pb.authStore.clear();
await pb.collection('users').authWithPassword('userA@test.com', 'password');
await EconomyService.buySeed('carrot');

const userAInventory = await pb.collection('farm_inventory').getFullList();
assert(userAInventory.length > 0);

// Switch to User B
await pb.authStore.clear();
await pb.collection('users').authWithPassword('userB@test.com', 'password');

const userBInventory = await pb.collection('farm_inventory').getFullList();
assert(userBInventory.length === 0); // User B starts fresh

// Verify User B cannot access User A's data
try {
  await pb.collection('farm_plots').getFullList({
    filter: `player != "${pb.authStore.model?.id}"`
  });
  assert(false, 'Should not reach here');
} catch (err) {
  assert(err.status === 403); // Forbidden
}
```

---

### IT-006: Offline → Online Sync (No Migration)

**Objective:** Verify offline data KHÔNG sync khi login

**Steps:**
1. Play offline mode (guest)
2. Plant and harvest crops
3. Accumulate coins and exp
4. Login with authenticated account

**Expected Results:**
- Offline progress stays in localStorage
- Authenticated account starts fresh (1000 coins, level 1)
- No data migration occurs
- Warning message shown to user

**Verification:**
```typescript
// Offline play
localStorage.setItem('farm_game_guest_xyz', JSON.stringify({
  player: { coins: 5000, level: 5, exp: 200 },
  inventory: { carrot: 10 }
}));

// Login
await pb.collection('users').authWithPassword('user@test.com', 'password');
await FarmPersistenceService.initPlayer();

// Check server state (should be fresh)
const player = await pb.collection('farm_players').getFirstListItem(
  `user = "${pb.authStore.model?.id}"`
);
assert(player.coins === 1000); // Fresh start
assert(player.level === 1);

// Check localStorage still has offline data
const offlineData = JSON.parse(localStorage.getItem('farm_game_guest_xyz'));
assert(offlineData.player.coins === 5000); // Offline data preserved
```

---

### IT-007: Daily Quest Reset

**Objective:** Verify quest reset automation hoạt động

**Prerequisites:** PocketBase hook installed và running

**Steps:**
1. Complete and claim some quests
2. Wait for daily reset (hoặc trigger manual reset API)
3. Verify quests reset to initial state

**Expected Results:**
- All quests have progress = 0
- All quests have claimed = false
- reset_at updated to +24 hours
- Player state unchanged (coins, exp, inventory preserved)

**Verification:**
```typescript
// Complete quest
const questId = 'daily_harvest_10';
await completeQuest(questId); // Helper function
await QuestService.claimReward(questId);

let quest = await pb.collection('farm_quests').getFirstListItem(
  `player = "${player.id}" && quest_id = "${questId}"`
);
assert(quest.claimed === true);
assert(quest.progress >= 10);

// Trigger reset (admin API)
await fetch('http://localhost:8090/api/farm/admin/reset-quests', {
  method: 'POST',
  headers: { 'Authorization': `Admin ${ADMIN_TOKEN}` }
});

// Verify reset
quest = await pb.collection('farm_quests').getOne(quest.id);
assert(quest.progress === 0);
assert(quest.claimed === false);

// Verify player untouched
const player = await pb.collection('farm_players').getOne(playerId);
assert(player.coins === expectedCoins); // Unchanged
```

---

### IT-008: Error Recovery

**Objective:** Verify graceful handling khi PocketBase unavailable

**Steps:**
1. Start game in authenticated mode
2. Simulate network failure
3. Attempt transactions
4. Restore network
5. Verify state consistency

**Expected Results:**
- Transactions fail gracefully with error messages
- No data corruption
- UI shows offline indicator
- State resumes after network restored

**Verification:**
```typescript
// Mock network failure
const originalFetch = window.fetch;
window.fetch = () => Promise.reject(new Error('Network error'));

// Attempt transaction
const result = await EconomyService.buySeed('carrot');
assert(result.success === false);
assert(result.error.includes('Network') || result.error.includes('connection'));

// Verify no partial updates
const player = await pb.collection('farm_players').getOne(playerId);
assert(player.coins === initialCoins); // Unchanged

// Restore network
window.fetch = originalFetch;

// Retry transaction
const retryResult = await EconomyService.buySeed('carrot');
assert(retryResult.success === true);
```

---

## Performance Tests

### PT-001: Load Time

**Metric:** Time to load farm game from login

**Acceptance Criteria:**
- Player initialization: < 500ms
- Load all plots: < 200ms
- Load inventory: < 200ms
- Load quests: < 200ms
- Total cold start: < 1.5s

**Test:**
```typescript
const startTime = performance.now();

await pb.collection('users').authWithPassword('user@test.com', 'password');
const t1 = performance.now();

await FarmPersistenceService.initPlayer();
const t2 = performance.now();

console.log(`Login: ${t1 - startTime}ms`);
console.log(`Init: ${t2 - t1}ms`);
console.log(`Total: ${t2 - startTime}ms`);

assert(t2 - startTime < 1500);
```

---

### PT-002: Transaction Throughput

**Metric:** Transactions per second

**Acceptance Criteria:**
- Single user: > 10 TPS
- 10 concurrent users: > 50 TPS total

**Test:**
```typescript
const iterations = 100;
const startTime = Date.now();

for (let i = 0; i < iterations; i++) {
  await EconomyService.buySeed('carrot');
}

const duration = Date.now() - startTime;
const tps = (iterations / duration) * 1000;

console.log(`TPS: ${tps.toFixed(2)}`);
assert(tps > 10);
```

---

### PT-003: Concurrent Users

**Metric:** System stability với 100 concurrent users

**Acceptance Criteria:**
- All transactions complete successfully
- No race conditions
- Response time P95 < 500ms

**Test:**
```typescript
const users = 100;
const promises = [];

for (let i = 0; i < users; i++) {
  const promise = (async () => {
    const email = `user${i}@test.com`;
    await pb.collection('users').authWithPassword(email, 'password');
    await FarmPersistenceService.initPlayer();
    await EconomyService.buySeed('carrot');
  })();
  
  promises.push(promise);
}

const startTime = Date.now();
await Promise.all(promises);
const duration = Date.now() - startTime;

console.log(`${users} users completed in ${duration}ms`);
assert(duration < 30000); // < 30s for 100 users
```

---

## Security Tests

### ST-001: Unauthorized Access

**Objective:** Verify không thể access data của user khác

**Test:**
```typescript
// User A creates data
await pb.authStore.clear();
await pb.collection('users').authWithPassword('userA@test.com', 'password');
const playerA = await FarmPersistenceService.initPlayer();

// User B attempts access
await pb.authStore.clear();
await pb.collection('users').authWithPassword('userB@test.com', 'password');

try {
  await pb.collection('farm_players').getOne(playerA.player.id);
  assert(false, 'Should throw error');
} catch (err) {
  assert(err.status === 404); // Not found (access denied)
}
```

---

### ST-002: Input Validation

**Objective:** Verify server validates malicious inputs

**Test:**
```typescript
// Attempt negative coins
try {
  await pb.collection('farm_players').update(playerId, {
    coins: -9999
  });
  assert(false, 'Should reject negative coins');
} catch (err) {
  assert(err.status === 400); // Bad request
}

// Attempt future harvest_at manipulation
try {
  await pb.collection('farm_plots').update(plotId, {
    harvest_at: new Date('1970-01-01').toISOString()
  });
  // Should either reject or be overridden by server validation
} catch (err) {
  // Expected
}
```

---

### ST-003: Rate Limiting (Future)

**Objective:** Verify rate limits prevent abuse

**Test:**
```typescript
const attempts = 200;
let successCount = 0;
let rateLimitCount = 0;

for (let i = 0; i < attempts; i++) {
  try {
    await EconomyService.buySeed('carrot');
    successCount++;
  } catch (err) {
    if (err.status === 429) {
      rateLimitCount++;
    }
  }
}

console.log(`Success: ${successCount}, Rate limited: ${rateLimitCount}`);
// Should hit rate limit before 200 attempts
```

---

## Test Execution Checklist

### Setup
- [ ] PocketBase test instance running
- [ ] Test database initialized
- [ ] Test user accounts created
- [ ] Collections imported from schema
- [ ] Hooks installed (daily reset)

### Execution
- [ ] IT-001: Player Initialization
- [ ] IT-002: Buy Seed Transaction
- [ ] IT-003: Plant and Harvest Cycle
- [ ] IT-004: Quest Tracking
- [ ] IT-005: User Isolation
- [ ] IT-006: Offline No-Migration
- [ ] IT-007: Daily Quest Reset
- [ ] IT-008: Error Recovery

### Performance
- [ ] PT-001: Load Time < 1.5s
- [ ] PT-002: TPS > 10
- [ ] PT-003: 100 Concurrent Users

### Security
- [ ] ST-001: Unauthorized Access Blocked
- [ ] ST-002: Input Validation
- [ ] ST-003: Rate Limiting (if implemented)

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Farm Game Integration Tests

on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    services:
      pocketbase:
        image: ghcr.io/pocketbase/pocketbase:latest
        ports:
          - 8090:8090
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm install
      
      - name: Setup PocketBase
        run: |
          # Import schema
          # Create test users
          # Install hooks
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          VITE_POCKETBASE_URL: http://localhost:8090
```

---

## Next Steps

1. ✅ Create integration test document
2. → Setup PocketBase test instance
3. → Create test user accounts
4. → Implement test scripts
5. → Run tests and document results
6. → Fix any discovered issues
7. → Add to CI/CD pipeline
