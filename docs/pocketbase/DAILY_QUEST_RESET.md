# Daily Quest Reset - PocketBase Hook

## Tổng quan

PocketBase hook tự động reset daily quests cho tất cả players vào lúc midnight mỗi ngày.

## Files

- **Hook file:** `pb_hooks/daily_quest_reset.pb.js`
- **Cron schedule:** `0 0 * * *` (00:00 mỗi ngày)

## Installation

### Bước 1: Copy hook file

```bash
# Copy hook file vào PocketBase directory
cp docs/pocketbase/pb_hooks/daily_quest_reset.pb.js /path/to/pocketbase/pb_hooks/
```

### Bước 2: Restart PocketBase

```bash
# PocketBase sẽ tự động load hooks khi khởi động
./pocketbase serve
```

### Bước 3: Verify hook loaded

Check PocketBase logs để confirm hook đã được load:

```
> Registered cron job: daily_quest_reset (0 0 * * *)
```

---

## Chức năng

### Automatic Daily Reset

**Trigger:** Chạy tự động lúc 00:00 mỗi ngày

**Logic:**
1. Tìm tất cả quests có `reset_at <= now`
2. Với mỗi quest:
   - Set `progress = 0`
   - Set `claimed = false`
   - Set `reset_at = now + 24 hours`
3. Save changes vào database
4. Log kết quả (số quests reset, errors)

**Performance:**
- Batch size: 500 quests per run
- Expected execution time: < 1 second cho 1000 quests

---

### Manual Reset API

**Endpoint:** `POST /api/farm/admin/reset-quests`

**Authentication:** Admin only (PocketBase admin token required)

**Usage:**

```bash
# Using curl
curl -X POST https://your-domain.com/api/farm/admin/reset-quests \
  -H "Authorization: Admin YOUR_ADMIN_TOKEN"

# Response
{
  "success": true,
  "reset_count": 150,
  "timestamp": "2026-10-01T00:00:00.000Z"
}
```

**Use cases:**
- Manual trigger cho testing
- Emergency reset nếu cron job fail
- Reset sau maintenance

---

## Quest Reset Logic

### Reset Criteria

Quest được reset khi:
```javascript
reset_at <= current_time
```

### Reset Actions

Mỗi quest được reset sẽ:
1. **Progress** → 0
2. **Claimed** → false
3. **reset_at** → now + 24 hours

### Quest Creation

Khi tạo quest mới (player initialization):
```javascript
{
  quest_id: "daily_plant_5",
  progress: 0,
  claimed: false,
  reset_at: now + 24 hours  // Expires tomorrow midnight
}
```

---

## Monitoring & Debugging

### Check Cron Status

```bash
# PocketBase logs sẽ hiển thị mỗi lần cron chạy
tail -f /path/to/pocketbase/pb_data/logs/*.log | grep "quest_reset"
```

Expected output:
```
[2026-10-01T00:00:00Z] Starting daily quest reset...
[2026-10-01T00:00:01Z] Quest reset completed: 150 reset, 0 errors
```

### Check Quest Reset Status

```sql
-- Query to check recent resets
SELECT 
  player,
  quest_id,
  progress,
  claimed,
  reset_at,
  updated
FROM farm_quests
ORDER BY updated DESC
LIMIT 10;
```

### Common Issues

**Issue 1: Cron not running**
- **Symptom:** No log entries at midnight
- **Fix:** Check PocketBase is running, verify hook file exists
- **Verify:** `ls pb_hooks/daily_quest_reset.pb.js`

**Issue 2: Timezone mismatch**
- **Symptom:** Resets at wrong time
- **Fix:** PocketBase uses UTC by default, adjust cron schedule for your timezone
- **Example:** For GMT+7, use `0 17 * * *` (17:00 UTC = 00:00 GMT+7)

**Issue 3: Some quests not reset**
- **Symptom:** Some players still have old progress
- **Fix:** Check `reset_at` values, may need manual reset
- **Action:** Call `/api/farm/admin/reset-quests`

---

## Testing

### Test 1: Manual Trigger

```bash
# Trigger manual reset as admin
curl -X POST http://localhost:8090/api/farm/admin/reset-quests \
  -H "Authorization: Admin YOUR_ADMIN_TOKEN"

# Verify response
# Expected: { success: true, reset_count: X }
```

### Test 2: Verify Quest State

```javascript
// Client-side verification
const quests = await pb.collection('farm_quests').getFullList({
  filter: `player = "${playerId}"`
});

quests.forEach(quest => {
  console.log(`${quest.quest_id}: progress=${quest.progress}, claimed=${quest.claimed}`);
});

// Expected: All progress=0, claimed=false after reset
```

### Test 3: Cron Schedule Simulation

```bash
# Test cron expression
# Using cron expression tester: https://crontab.guru/#0_0_*_*_*

# "0 0 * * *" = At 00:00 every day
```

---

## Security Considerations

### Access Control

✅ **Cron job:** Runs with system privileges (no user context)
✅ **Manual API:** Requires admin authentication
✅ **Quest collection:** Users can only read/update their own quests

### Validation

✅ **Batch limit:** 500 quests per run (prevent memory issues)
✅ **Error handling:** Individual quest failures don't stop entire batch
✅ **Audit logging:** All resets logged with timestamp and counts

### Rate Limiting

- Cron runs once per day (low frequency)
- Manual API can be called by admin anytime
- Consider adding rate limit if manual endpoint is exposed

---

## Production Checklist

- [ ] Copy hook file to production PocketBase
- [ ] Verify cron schedule matches production timezone
- [ ] Test manual reset API with admin account
- [ ] Monitor first automatic reset at midnight
- [ ] Setup alerts for reset failures (optional)
- [ ] Document admin procedures for emergency reset

---

## Alternative Implementations

### Option 1: Client-side Reset Check

```typescript
// Check and reset expired quests on client load
export async function checkQuestExpiry(playerId: string) {
  const quests = await pb.collection('farm_quests').getFullList({
    filter: `player = "${playerId}" && reset_at <= @now`
  });
  
  // Quests are expired, show "New Daily Quests Available" message
  if (quests.length > 0) {
    return { expired: true, count: quests.length };
  }
  
  return { expired: false, count: 0 };
}
```

**Pros:** No server-side cron needed
**Cons:** Quests only reset when player logs in

### Option 2: External Cron Job

```bash
#!/bin/bash
# daily-quest-reset.sh

curl -X POST https://your-api.com/api/farm/admin/reset-quests \
  -H "Authorization: Admin $ADMIN_TOKEN"
```

Add to system crontab:
```
0 0 * * * /path/to/daily-quest-reset.sh
```

**Pros:** Independent from PocketBase
**Cons:** Additional infrastructure, needs secure token management

---

## Maintenance

### Monthly Tasks

- [ ] Review reset logs for patterns
- [ ] Check for any stuck quests
- [ ] Verify cron execution times

### Quarterly Tasks

- [ ] Audit quest definitions (add/remove/rebalance)
- [ ] Review reset timing with player activity patterns
- [ ] Optimize batch size if needed

---

## Related Documentation

- [SECURITY_RULES.md](SECURITY_RULES.md) - Quest security validation
- [farm_game_collections.json](farm_game_collections.json) - Quest schema
- [PocketBase Hooks Documentation](https://pocketbase.io/docs/js-hooks/)
- [PocketBase Cron Jobs](https://pocketbase.io/docs/js-cron/)
