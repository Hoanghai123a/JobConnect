# PocketBase Security Rules - Nông Trại Game

## Tổng quan

Document này mô tả security rules cho 4 collections của farm game và các improvements cần thiết.

## Collections và Access Rules

### 1. farm_players

**Mục đích:** Lưu trữ thông tin player (coins, level, exp)

**Current Rules:**
- `listRule`: `user = @request.auth.id || @request.auth.role = "admin"`
- `viewRule`: `user = @request.auth.id || @request.auth.role = "admin"`
- `createRule`: `@request.auth.id != "" && user = @request.auth.id`
- `updateRule`: `user = @request.auth.id || @request.auth.role = "admin"`
- `deleteRule`: `@request.auth.role = "admin"`

**Security Analysis:**
✅ **GOOD:**
- User chỉ xem được player data của mình
- Admin có full access
- Prevent anonymous users

⚠️ **IMPROVEMENTS NEEDED:**

1. **Prevent negative values:**
```javascript
// updateRule should validate:
user = @request.auth.id && 
@request.data.coins >= 0 && 
@request.data.level >= 1 && 
@request.data.level <= 100 &&
@request.data.exp >= 0
```

2. **Prevent level/exp manipulation:**
```javascript
// Server-side validation needed:
// - Level increases must match exp requirements
// - Coins changes must be justified by transactions
```

3. **Add transaction logging:**
- Tạo collection `farm_transactions` để log mọi thay đổi coins/exp
- Required fields: player, type, amount, timestamp, reason

---

### 2. farm_plots

**Mục đích:** Lưu trữ trạng thái 12 plots (crop_id, planted_at, harvest_at)

**Current Rules:**
- `listRule`: `@request.auth.id != "" && player.user = @request.auth.id`
- `viewRule`: `@request.auth.id != "" && player.user = @request.auth.id`
- `createRule`: `null` (plots được tạo tự động khi init player)
- `updateRule`: `@request.auth.id != "" && player.user = @request.auth.id`
- `deleteRule`: `null` (không cho phép xóa plots)

**Security Analysis:**
✅ **GOOD:**
- User chỉ access plots của mình
- Không cho phép create/delete plots manually

⚠️ **IMPROVEMENTS NEEDED:**

1. **Validate harvest timing:**
```javascript
// updateRule should check:
player.user = @request.auth.id &&
// If harvesting (clearing crop):
(@request.data.crop_id = null ? 
  // Must be past harvest_at time
  @now >= harvest_at 
  : true)
```

2. **Validate plot_id range:**
```javascript
// updateRule should ensure:
@request.data.plot_id >= 0 && 
@request.data.plot_id <= 11
```

3. **Prevent time manipulation:**
```javascript
// planted_at and harvest_at should only be set by server
// Client should send action requests, not timestamps
```

---

### 3. farm_inventory

**Mục đích:** Lưu trữ crops trong inventory (crop_id, quantity)

**Current Rules:**
- `listRule`: `@request.auth.id != "" && player.user = @request.auth.id`
- `viewRule`: `@request.auth.id != "" && player.user = @request.auth.id`
- `createRule`: `null` (inventory items được tạo bởi server)
- `updateRule`: `@request.auth.id != "" && player.user = @request.auth.id`
- `deleteRule`: `null`

**Security Analysis:**
✅ **GOOD:**
- User chỉ access inventory của mình
- Không cho phép create/delete manually

⚠️ **IMPROVEMENTS NEEDED:**

1. **Prevent negative quantity:**
```javascript
// updateRule should validate:
player.user = @request.auth.id && 
@request.data.quantity >= 0
```

2. **Validate quantity changes:**
```javascript
// Server should validate:
// - Quantity increases: must come from harvest
// - Quantity decreases: must have sufficient amount
```

3. **Add inventory transaction log:**
- Log mọi thay đổi inventory với reason (harvest, plant, sell)

---

### 4. farm_quests

**Mục đích:** Lưu trữ daily quests (quest_id, progress, claimed, reset_at)

**Current Rules:**
- `listRule`: `@request.auth.id != "" && player.user = @request.auth.id`
- `viewRule`: `@request.auth.id != "" && player.user = @request.auth.id`
- `createRule`: `null` (quests được tạo bởi server)
- `updateRule`: `@request.auth.id != "" && player.user = @request.auth.id && claimed = false`
- `deleteRule`: `null`

**Security Analysis:**
✅ **GOOD:**
- User chỉ access quests của mình
- Không cho phép update quest đã claimed

⚠️ **IMPROVEMENTS NEEDED:**

1. **Validate progress changes:**
```javascript
// updateRule should ensure progress only increases:
player.user = @request.auth.id && 
claimed = false &&
@request.data.progress >= progress &&
@request.data.claimed = false  // Prevent claiming via update
```

2. **Separate claim endpoint:**
- Tạo custom endpoint `/api/farm/quests/claim` để handle claim logic
- Server validates: progress >= target, not claimed, not expired

3. **Validate reset_at:**
```javascript
// reset_at should only be updated by daily reset cron
// Client should not be able to change it
```

---

## Critical Security Improvements

### 1. Server-Side Transaction Validation

**Problem:** Client hiện tại gửi kết quả transaction (coins after, inventory after) thay vì action.

**Solution:** Tạo API endpoints cho mọi game actions:

```
POST /api/farm/actions/buy_seed
Body: { crop_id: string }
Server validates: coins >= seedCost, level >= requirement
Server executes: decrease coins, increase inventory

POST /api/farm/actions/plant_crop
Body: { plot_id: number, crop_id: string }
Server validates: has seed in inventory, plot is empty
Server executes: decrease inventory, update plot with timestamps

POST /api/farm/actions/harvest_crop
Body: { plot_id: number }
Server validates: plot has crop, now >= harvest_at
Server executes: clear plot, increase coins/exp/inventory

POST /api/farm/actions/sell_crop
Body: { crop_id: string, quantity: number }
Server validates: has enough in inventory
Server executes: decrease inventory, increase coins
```

### 2. Transaction Logging Collection

Tạo collection mới: `farm_transactions`

```json
{
  "name": "farm_transactions",
  "fields": [
    {
      "name": "player",
      "type": "relation",
      "collectionId": "farm_players",
      "required": true
    },
    {
      "name": "type",
      "type": "select",
      "options": ["BUY_SEED", "PLANT", "HARVEST", "SELL", "QUEST_CLAIM"]
    },
    {
      "name": "details",
      "type": "json",
      "required": true
    },
    {
      "name": "coins_before",
      "type": "number"
    },
    {
      "name": "coins_after",
      "type": "number"
    },
    {
      "name": "timestamp",
      "type": "date",
      "required": true
    }
  ],
  "listRule": "@request.auth.role = 'admin'",
  "viewRule": "@request.auth.role = 'admin'",
  "createRule": null,
  "updateRule": null,
  "deleteRule": null
}
```

### 3. Rate Limiting

**Problem:** Không có rate limiting cho game actions.

**Solution:** Implement rate limiting trong PocketBase hooks:

```javascript
// Maximum 60 actions per minute per user
// Maximum 10 harvests per minute (prevent rapid farming)
// Maximum 100 transactions per hour
```

### 4. Validation Constants

Tạo shared validation constants giữa client và server:

```typescript
// src/game/config/validation.ts
export const VALIDATION = {
  MAX_LEVEL: 100,
  MIN_COINS: 0,
  MIN_EXP: 0,
  MAX_PLOTS: 12,
  MIN_PLOT_ID: 0,
  MAX_PLOT_ID: 11,
  MIN_INVENTORY_QUANTITY: 0,
  MAX_ACTIONS_PER_MINUTE: 60,
  MAX_HARVESTS_PER_MINUTE: 10,
} as const;
```

---

## Implementation Priority

### High Priority (Blocker cho production)
1. ✅ Server-side transaction validation endpoints
2. ✅ Prevent negative values (coins, exp, inventory)
3. ✅ Validate harvest timing server-side
4. ✅ Transaction logging collection

### Medium Priority
5. Rate limiting implementation
6. Validate level/exp progression logic
7. Quest claim validation endpoint

### Low Priority (Nice to have)
8. Admin dashboard cho transaction monitoring
9. Automated suspicious activity detection
10. Backup và restore mechanisms

---

## Testing Checklist

- [ ] Test negative coin exploit attempts
- [ ] Test harvest before harvest_at time
- [ ] Test inventory quantity manipulation
- [ ] Test quest progress manipulation
- [ ] Test quest claim twice
- [ ] Test concurrent transaction race conditions
- [ ] Test rate limiting thresholds
- [ ] Load test với 100 concurrent users

---

## Next Steps

1. Implement server-side validation endpoints (Task #1)
2. Update PocketBase schema với improved rules
3. Tạo integration tests (Task #4)
4. Deploy và monitor transaction logs
