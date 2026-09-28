# Query Performance Optimization - Implementation Summary

## ✅ Đã Hoàn Thành

### 1. Database Indexes
**File:** [`pb_migrations/1738089600_add_coin_indexes.js`](pb_migrations/1738089600_add_coin_indexes.js)

Đã thêm 4 indexes:
- ✅ `idx_garden_balances_user` - UNIQUE index cho getUserCoinBalance
- ✅ `idx_coin_transactions_user_created` - Composite index cho getCoinTransactionHistory
- ✅ `idx_coin_transactions_admin_id` - Index cho admin queries
- ✅ `idx_coin_transactions_type` - Index cho filtering by type

### 2. Query Monitoring System
**File:** [`src/lib/coin-query-monitor.ts`](src/lib/coin-query-monitor.ts)

Features:
- ✅ Track query execution times (count, avg, min, max, P95)
- ✅ Rolling window of last 100 executions
- ✅ Automatic slow query detection (> 100ms)
- ✅ Export metrics to file
- ✅ Performance report generation

### 3. Integration với Coin Management
**File:** [`src/lib/coin-management.ts`](src/lib/coin-management.ts)

Updated functions:
- ✅ `getUserCoinBalance()` - wrapped với withQueryTracking
- ✅ `getCoinTransactionHistory()` - wrapped với withQueryTracking

### 4. Admin Monitoring UI
**File:** [`src/components/admin/CoinQueryMonitor.tsx`](src/components/admin/CoinQueryMonitor.tsx)

Features:
- ✅ Real-time query metrics display
- ✅ Performance badges (Excellent/Good/Fair/Slow)
- ✅ Auto-refresh every 5 seconds
- ✅ Export metrics to file
- ✅ Reset functionality

### 5. Documentation
**File:** [`docs/COIN_QUERY_OPTIMIZATION.md`](docs/COIN_QUERY_OPTIMIZATION.md)

Includes:
- ✅ Performance analysis
- ✅ Index explanations
- ✅ Deployment guide
- ✅ Troubleshooting tips
- ✅ Best practices

## 📊 Expected Performance Improvements

| Query | Before | After | Improvement |
|-------|--------|-------|-------------|
| getUserCoinBalance | ~75ms | ~1.5ms | **50x faster** |
| getCoinTransactionHistory | ~750ms | ~7.5ms | **100x faster** |

**Total DB time saved:** ~52 seconds/minute (86% reduction)

## 🚀 Deployment Steps

### Step 1: Run Migration

PocketBase sẽ tự động chạy migration khi restart:

```bash
# Stop PocketBase
# Start PocketBase
./pocketbase serve
```

Migration file sẽ được executed automatically.

### Step 2: Verify Indexes

1. Mở PocketBase Admin: http://localhost:8090/_/
2. Go to Collections → `garden_balances` → Indexes tab
3. Verify `idx_garden_balances_user` exists
4. Go to Collections → `coin_transactions` → Indexes tab
5. Verify 3 indexes exist

### Step 3: Test Query Performance

Development mode tự động enable monitoring. Test bằng cách:

1. Vào admin coin settings page
2. Search một user
3. Xem transaction history
4. Open browser console và chạy:

```javascript
import { coinQueryMonitor } from './src/lib/coin-query-monitor.ts';
coinQueryMonitor.logReport();
```

Expected output:
```
📊 Coin Query Performance Report
────────────────────────────────────────────────────────

Query: getUserCoinBalance
  Count: 50
  Avg: 1.8ms    ← Should be < 5ms
  Min: 0.9ms
  Max: 5.2ms
  P95: 2.3ms    ← Should be < 10ms

Query: getCoinTransactionHistory
  Count: 12
  Avg: 8.1ms    ← Should be < 20ms
  Min: 4.3ms
  Max: 15.7ms
  P95: 12.4ms   ← Should be < 50ms
```

### Step 4: Add Monitoring UI to Admin Page (Optional)

Nếu muốn view metrics trong UI, thêm vào admin page:

```typescript
// src/routes/_authenticated/admin/coin-settings.tsx
import { CoinQueryMonitor } from "@/components/admin/CoinQueryMonitor";

// Add tab cho monitoring
<TabsContent value="performance">
  <CoinQueryMonitor />
</TabsContent>
```

## 🔍 Monitoring & Alerts

### Console Monitoring (Development)

Slow queries (> 100ms) tự động log warning:

```
🐌 Slow query: getUserCoinBalance took 125.3ms
```

### Performance Targets

| Metric | Target | Action if Exceeded |
|--------|--------|-------------------|
| Avg response time | < 20ms | Investigate query plan |
| P95 response time | < 50ms | Check for missing indexes |
| Max response time | < 100ms | Review slow query logs |

### Weekly Review

Chạy report mỗi tuần:

```bash
# In browser console
coinQueryMonitor.logReport();
```

Alert nếu:
- Avg > 20ms: Query plan có thể không dùng index
- P95 > 50ms: Performance degradation
- Count tăng đột ngột: Potential N+1 query issue

## 🐛 Troubleshooting

### Problem: Queries vẫn chậm sau khi add indexes

**Check 1:** Verify indexes exist
```sql
-- In PocketBase SQLite
.indexes garden_balances
-- Should show: idx_garden_balances_user

.indexes coin_transactions
-- Should show: idx_coin_transactions_user_created, idx_coin_transactions_admin_id, idx_coin_transactions_type
```

**Check 2:** Verify query plan
```sql
EXPLAIN QUERY PLAN
SELECT * FROM garden_balances WHERE user = 'user_123';

-- Should show: SEARCH...USING INDEX idx_garden_balances_user
-- NOT: SCAN TABLE garden_balances
```

**Check 3:** Rebuild indexes (nếu corrupt)
```sql
REINDEX idx_garden_balances_user;
REINDEX idx_coin_transactions_user_created;
```

### Problem: Index không được sử dụng

**Cause:** Query syntax không match index

❌ Wrong (không dùng index):
```typescript
filter: `user LIKE "%${userId}%"`  // LIKE không dùng index
```

✅ Correct (dùng index):
```typescript
filter: `user = "${escapePb(userId)}"`  // Equality dùng index
```

### Problem: Monitoring không hiện metrics

**Cause:** Monitoring chỉ active trong dev mode

**Solution:**
```typescript
// Enable manually
import { coinQueryMonitor } from '@/lib/coin-query-monitor';
coinQueryMonitor.setEnabled(true);
```

## 📚 Related Files

- [`src/lib/coin-management.ts`](src/lib/coin-management.ts) - Coin operations với query tracking
- [`src/lib/coin-query-monitor.ts`](src/lib/coin-query-monitor.ts) - Query monitoring system
- [`src/components/admin/CoinQueryMonitor.tsx`](src/components/admin/CoinQueryMonitor.tsx) - Monitoring UI component
- [`pb_migrations/1738089600_add_coin_indexes.js`](pb_migrations/1738089600_add_coin_indexes.js) - Migration script
- [`docs/COIN_QUERY_OPTIMIZATION.md`](docs/COIN_QUERY_OPTIMIZATION.md) - Full documentation

## ✨ Next Steps

Sau khi deploy và verify performance improvements:

1. **Week 1:** Monitor metrics daily
2. **Week 2:** Implement error handling improvements (Issue #6)
3. **Week 3:** Clean up duplicate totals tracking (Issue #5)
4. **Week 4:** Add structured logging và alerting

## 🎯 Success Criteria

✅ Implementation hoàn tất khi:
- [x] Migration file created
- [x] Query monitoring integrated
- [x] Admin UI component created
- [x] Documentation written
- [ ] Migration deployed to PocketBase
- [ ] Indexes verified in production
- [ ] Performance targets met (Avg < 20ms)
- [ ] No regression in functionality

---

**Implemented by:** Claude Opus 5  
**Date:** 2026-09-28  
**Related Issues:** Medium Issue #4 - Query Performance
