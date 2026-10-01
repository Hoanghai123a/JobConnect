# PocketBase Collection Rules - UPDATED với Server-side Validation

## Tổng quan

Document này cập nhật security rules cho 4 PocketBase collections sau khi implement server-side transaction endpoints.

**Updated Date:** 2026-10-01  
**Status:** PRODUCTION READY với server-side validation

---

## Architecture Change

### Before (VULNERABLE)
```
Client → PocketBase Direct Update
- Client có thể manipulate coins, timestamps, inventory trực tiếp
- Validation chỉ ở client-side
```

### After (SECURE)
```
Client → Server API → PocketBase
- Server validates tất cả business logic
- Client chỉ có thể READ data
- Server controls timestamps và rewards
```

---

## Collection 1: farm_players

### Updated Rules

```javascript
// listRule - User chỉ thấy player record của mình
listRule: "user = @request.auth.id"

// viewRule - User chỉ đọc được player record của mình  
viewRule: "user = @request.auth.id"

// createRule - User có thể tạo player record lần đầu
createRule: "user = @request.auth.id && 
  @request.data.coins = 100 && 
  @request.data.level = 1 && 
  @request.data.exp = 0"

// updateRule - CHỈ SERVER API được update (client KHÔNG thể update trực tiếp)
updateRule: null

// deleteRule - Không cho phép xóa
deleteRule: null
```

### Field Validation

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| user | relation | required, unique | Relation to users collection |
| coins | number | >= 0, <= 999999999 | Server-controlled |
| level | number | >= 1, <= 100 | Server-controlled |
| exp | number | >= 0, <= 999999999 | Server-controlled |

### Security Improvements

✅ **FIXED:** Client không thể manipulate coins  
✅ **FIXED:** Client không thể manipulate level/exp  
✅ **NEW:** Tất cả updates qua server API endpoints  

---

## Collection 2: farm_plots

### Updated Rules

```javascript
// listRule - User chỉ thấy plots của mình
listRule: "player.user = @request.auth.id"

// viewRule - User chỉ đọc được plots của mình
viewRule: "player.user = @request.auth.id"

// createRule - Tạo plots khi init player
createRule: "player.user = @request.auth.id && 
  @request.data.plot_id >= 0 && 
  @request.data.plot_id < 12 &&
  @request.data.crop_id = '' &&
  @request.data.planted_at = '' &&
  @request.data.harvest_at = ''"

// updateRule - CHỈ SERVER API được update
updateRule: null

// deleteRule - Không cho phép xóa
deleteRule: null
```

### Field Validation

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| player | relation | required | Relation to farm_players |
| plot_id | number | 0-11 | Grid position |
| crop_id | text | empty or valid cropId | Server-controlled |
| planted_at | text | ISO timestamp or empty | SERVER-CONTROLLED |
| harvest_at | text | ISO timestamp or empty | SERVER-CONTROLLED |

### Security Improvements

✅ **FIXED:** Client không thể manipulate planted_at  
✅ **FIXED:** Client không thể manipulate harvest_at (instant harvest exploit)  
✅ **NEW:** Server validates crop ready state trước khi harvest  

---

## Collection 3: farm_inventory

### Updated Rules

```javascript
// listRule - User chỉ thấy inventory của mình
listRule: "player.user = @request.auth.id"

// viewRule - User chỉ đọc được inventory của mình
viewRule: "player.user = @request.auth.id"

// createRule - Tạo inventory items khi cần
createRule: "player.user = @request.auth.id && 
  @request.data.quantity = 0"

// updateRule - CHỈ SERVER API được update
updateRule: null

// deleteRule - Không cho phép xóa
deleteRule: null
```

### Field Validation

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| player | relation | required | Relation to farm_players |
| crop_id | text | required, valid cropId | Must exist in CROPS config |
| quantity | number | >= 0, <= 9999 | Server-controlled |

### Security Improvements

✅ **FIXED:** Client không thể manipulate quantity  
✅ **FIXED:** Client không thể tạo unlimited items  
✅ **NEW:** Server validates inventory before plant/sell  

---

## Collection 4: farm_quests

### Updated Rules

```javascript
// listRule - User chỉ thấy quests của mình
listRule: "player.user = @request.auth.id"

// viewRule - User chỉ đọc được quests của mình
viewRule: "player.user = @request.auth.id"

// createRule - Tạo quests khi init player
createRule: "player.user = @request.auth.id && 
  @request.data.progress = 0 && 
  @request.data.claimed = false"

// updateRule - CHỈ SERVER API được update (quest progress + claim)
updateRule: null

// deleteRule - Không cho phép xóa
deleteRule: null
```

### Field Validation

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| player | relation | required | Relation to farm_players |
| quest_id | text | required, valid questId | Must exist in QUESTS config |
| progress | number | >= 0, <= 9999 | Server-controlled |
| claimed | bool | default false | Server-controlled |
| reset_at | text | ISO timestamp | Auto-reset at midnight |

### Security Improvements

✅ **FIXED:** Client không thể manipulate progress  
✅ **FIXED:** Client không thể claim rewards nhiều lần  
✅ **NEW:** Server validates quest completion trước khi claim  

---

## Collection 5: farm_transactions (NEW)

### Schema

```json
{
  "name": "farm_transactions",
  "schema": [
    {
      "name": "player",
      "type": "relation",
      "required": true,
      "options": {
        "collectionId": "farm_players",
        "cascadeDelete": true
      }
    },
    {
      "name": "transaction_type",
      "type": "select",
      "required": true,
      "options": {
        "values": ["BUY_SEED", "PLANT_CROP", "HARVEST_CROP", "SELL_CROP"]
      }
    },
    {
      "name": "transaction_data",
      "type": "json",
      "required": true
    }
  ]
}
```

### Rules

```javascript
// listRule - User chỉ thấy transactions của mình
listRule: "player.user = @request.auth.id"

// viewRule - User chỉ đọc được transactions của mình
viewRule: "player.user = @request.auth.id"

// createRule - CHỈ SERVER tạo transaction logs
createRule: null

// updateRule - Không cho phép update logs
updateRule: null

// deleteRule - Không cho phép xóa logs
deleteRule: null
```

### Purpose

- **Audit trail:** Log tất cả transactions cho fraud detection
- **Analytics:** Track player behavior patterns
- **Debugging:** Trace issues về economy bugs
- **Compliance:** Có evidence nếu cần investigate

---

## Server API Endpoints

### Endpoint Summary

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/farm/buy-seed` | POST | Mua hạt giống | ✅ |
| `/api/farm/plant-crop` | POST | Trồng cây | ✅ |
| `/api/farm/harvest-crop` | POST | Thu hoạch | ✅ |
| `/api/farm/sell-crop` | POST | Bán cây | ✅ |

### Request/Response Examples

**Buy Seed:**
```javascript
// Request
POST /api/farm/buy-seed
{
  "cropId": "carrot"
}

// Response
{
  "success": true,
  "player": { "coins": 80, "level": 1 },
  "inventory": { "cropId": "carrot", "quantity": 1 }
}
```

**Plant Crop:**
```javascript
// Request
POST /api/farm/plant-crop
{
  "plotId": 0,
  "cropId": "carrot"
}

// Response
{
  "success": true,
  "plot": {
    "plotId": 0,
    "cropId": "carrot",
    "plantedAt": "2026-10-01T10:00:00.000Z",
    "harvestAt": "2026-10-01T10:00:30.000Z"  // SERVER controls this
  }
}
```

**Harvest Crop:**
```javascript
// Request
POST /api/farm/harvest-crop
{
  "plotId": 0
}

// Response (success)
{
  "success": true,
  "rewards": { "coins": 35, "exp": 3, "cropId": "carrot" },
  "player": { "coins": 115, "exp": 3, "level": 1, "leveledUp": false }
}

// Response (too early)
{
  "success": false,
  "error": "Cây chưa lớn",
  "timeRemaining": 15  // seconds
}
```

**Sell Crop:**
```javascript
// Request
POST /api/farm/sell-crop
{
  "cropId": "carrot",
  "quantity": 2
}

// Response
{
  "success": true,
  "earned": 70,
  "player": { "coins": 185 },
  "inventory": { "cropId": "carrot", "quantity": 0 }
}
```

---

## Security Validation Checklist

### Server-side Validations

**All Endpoints:**
- [x] User authentication required
- [x] Player record exists
- [x] Input validation (type, range, format)
- [x] Business logic validation
- [x] Transaction atomicity
- [x] Error handling và rollback
- [x] Transaction logging

**Buy Seed:**
- [x] Crop exists in CROPS config
- [x] Player has enough coins
- [x] Player level >= crop unlock level
- [x] Coins deducted before inventory added
- [x] Rollback on failure

**Plant Crop:**
- [x] Crop exists in CROPS config
- [x] Plot exists và belongs to player
- [x] Plot is empty (crop_id = "")
- [x] Player has seed in inventory
- [x] SERVER sets planted_at = now
- [x] SERVER sets harvest_at = now + growTime
- [x] Inventory deducted atomically

**Harvest Crop:**
- [x] Plot exists và belongs to player
- [x] Plot has crop (crop_id != "")
- [x] SERVER validates harvest_at <= now
- [x] Prevent early harvest (time manipulation)
- [x] Rewards calculated server-side
- [x] Level-up logic server-side
- [x] Plot cleared atomically

**Sell Crop:**
- [x] Crop exists in CROPS config
- [x] Quantity > 0 và <= inventory
- [x] Inventory deducted before coins added
- [x] Earned = sellPrice * quantity (server-calculated)

---

## Migration Steps

### Step 1: Update PocketBase Collections

```bash
# Import updated collection schemas
# Via PocketBase Admin UI: Settings → Import collections

# Collections to update:
1. farm_players - set updateRule = null
2. farm_plots - set updateRule = null
3. farm_inventory - set updateRule = null
4. farm_quests - set updateRule = null
5. farm_transactions - import new collection
```

### Step 2: Deploy Server Hooks

```bash
# Copy hooks to PocketBase
cp docs/pocketbase/pb_hooks/farm_transactions.pb.js /path/to/pocketbase/pb_hooks/

# Restart PocketBase
./pocketbase serve
```

### Step 3: Update Client Code

```typescript
// Replace direct PocketBase calls với API calls

// OLD (VULNERABLE):
await pb.collection('farm_players').update(playerId, {
  coins: newCoins  // Client controls coins
});

// NEW (SECURE):
const response = await fetch('/api/farm/buy-seed', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${pb.authStore.token}`
  },
  body: JSON.stringify({ cropId: 'carrot' })
});
```

### Step 4: Test Migration

1. Test offline mode (localStorage) - Should work unchanged
2. Test authenticated mode với new APIs
3. Verify security: Try to manipulate coins via DevTools
4. Check transaction logs in farm_transactions collection

---

## Rate Limiting (Recommended)

### PocketBase Middleware

```javascript
// In pb_hooks/rate_limit.pb.js
onBeforeServe((e) => {
  e.router.use((c) => {
    const userId = c.get("authRecord")?.id;
    if (!userId) return c.next();

    // Check rate limit (60 requests per minute)
    const key = `rate_limit:${userId}`;
    const count = $app.cache().get(key) || 0;

    if (count >= 60) {
      return c.json(429, { error: "Too many requests" });
    }

    $app.cache().set(key, count + 1, 60); // 60 seconds TTL
    return c.next();
  });
});
```

---

## Monitoring & Alerts

### Metrics to Track

1. **Transaction Volume**
   - BUY_SEED per hour
   - HARVEST_CROP per hour
   - Detect anomalies (100x normal rate)

2. **Failed Transactions**
   - Track error rates
   - Alert if > 10% fail rate

3. **Player Progression**
   - Track coins distribution
   - Detect outliers (10000x median)

4. **API Latency**
   - p50, p95, p99 response times
   - Alert if p95 > 500ms

### Query Examples

```sql
-- Top spenders (last 24h)
SELECT 
  player,
  COUNT(*) as transaction_count,
  SUM(json_extract(transaction_data, '$.cost')) as total_spent
FROM farm_transactions
WHERE transaction_type = 'BUY_SEED'
  AND created >= datetime('now', '-1 day')
GROUP BY player
ORDER BY total_spent DESC
LIMIT 10;

-- Suspicious activity (rapid harvests)
SELECT 
  player,
  COUNT(*) as harvest_count,
  MIN(created) as first_harvest,
  MAX(created) as last_harvest
FROM farm_transactions
WHERE transaction_type = 'HARVEST_CROP'
  AND created >= datetime('now', '-5 minutes')
GROUP BY player
HAVING harvest_count > 20;  -- 20 harvests in 5 minutes is suspicious
```

---

## Production Checklist

- [x] Server-side transaction endpoints implemented
- [x] PocketBase collection rules updated (updateRule = null)
- [x] Transaction logging collection created
- [x] Client code updated to use APIs instead of direct PocketBase
- [ ] Rate limiting middleware deployed
- [ ] Monitoring queries configured
- [ ] Alert thresholds set
- [ ] Load testing completed (100 concurrent users)
- [ ] Penetration testing completed
- [ ] Documentation updated

---

## Known Limitations

1. **Network Latency:** API calls add 50-200ms latency vs direct PocketBase
   - **Mitigation:** Optimistic UI updates, loading states

2. **Offline Mode:** Server APIs không work offline
   - **Solution:** Keep offline mode using localStorage (unchanged)

3. **Transaction Conflicts:** Concurrent requests có thể conflict
   - **Mitigation:** Database transactions, retry logic

---

## References

- [farm_transactions.pb.js](pb_hooks/farm_transactions.pb.js) - Server API implementation
- [farm_transactions_collection.json](farm_transactions_collection.json) - Transaction log schema
- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) - Original security findings
- [PocketBase API Rules](https://pocketbase.io/docs/api-rules-and-filters/)
