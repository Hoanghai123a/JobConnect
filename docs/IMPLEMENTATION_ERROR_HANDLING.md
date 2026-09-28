# Error Handling Implementation - Summary

## ✅ Đã Hoàn Thành

### 1. Error Classification System
**File:** [`src/lib/errors/coin-errors.ts`](src/lib/errors/coin-errors.ts)

Features:
- ✅ Base class `CoinOperationError` với typed errors
- ✅ Specific error classes:
  - `InsufficientBalanceError` - Không đủ xu
  - `NetworkError` - Lỗi kết nối (retryable)
  - `DatabaseLockError` - Database bị lock (retryable)
  - `BalanceNotFoundError` - Không tìm thấy balance
  - `ValidationError` - Validation failed
  - `PermissionDeniedError` - Không có quyền
  - `RateLimitError` - Rate limit exceeded (retryable)
  - `DuplicateRecordError` - Bản ghi trùng (retryable)
- ✅ `classifyError()` - Tự động classify raw errors
- ✅ `isRetryableError()` - Check nếu error có thể retry
- ✅ `getUserMessage()` - Get user-friendly message

### 2. Structured Logging System
**File:** [`src/lib/logger/coin-logger.ts`](src/lib/logger/coin-logger.ts)

Features:
- ✅ Multiple log levels (debug, info, warn, error)
- ✅ Structured log entries với timestamp và context
- ✅ Circular buffer (1000 logs max)
- ✅ Console output trong development
- ✅ External service integration cho production errors
- ✅ Export logs as JSON hoặc text
- ✅ Filter logs by level, event pattern
- ✅ Statistics (total, by level, errors by code)
- ✅ `OperationLogger` helper class
- ✅ `@logOperation` decorator

### 3. Retry Logic với Patterns
**File:** [`src/lib/retry/retry-logic.ts`](src/lib/retry/retry-logic.ts)

Features:
- ✅ `withRetry()` - Generic retry wrapper với exponential backoff
- ✅ `withNetworkRetry()` - Specialized cho network errors
- ✅ `withDatabaseLockRetry()` - Specialized cho database locks
- ✅ `CircuitBreaker` - Prevent overwhelming failing services
- ✅ `Bulkhead` - Limit concurrent operations
- ✅ Configurable: maxAttempts, baseDelay, maxDelay
- ✅ Jitter để tránh thundering herd
- ✅ Custom retry conditions
- ✅ Retry callbacks

### 4. Integration với Coin Management
**File:** [`src/lib/coin-management.ts`](src/lib/coin-management.ts)

Updated functions:
- ✅ `addCoinsToUser()` - Full error handling với retry logic
  - Operation tracking với unique operationId
  - Structured logging mọi bước
  - Automatic retry cho transient errors
  - Non-critical audit log (không fail operation nếu audit lỗi)
  - Detailed error classification và user messages
  
- ✅ `subtractCoinsFromUser()` - Full error handling với retry logic
  - Balance validation trước khi trừ
  - Throw `InsufficientBalanceError` thay vì return false
  - Automatic retry nhưng skip cho insufficient balance
  - Same structured logging như addCoinsToUser

### 5. Error Reporting UI Components
**File:** [`src/components/admin/ErrorDetails.tsx`](src/components/admin/ErrorDetails.tsx)

Components:
- ✅ `<ErrorDetails>` - Display single error với details
  - User-friendly message
  - Error code badge
  - Retryable indicator
  - Collapsible technical details
  - Retry button (nếu retryable)
  - Export error report
  
- ✅ `<ErrorList>` - Display multiple errors
  - Error summary
  - Dismiss individual/all errors
  - Retry individual errors
  - Timestamp display

### 6. Error Monitoring UI
**File:** [`src/components/admin/CoinErrorMonitor.tsx`](src/components/admin/CoinErrorMonitor.tsx)

Features:
- ✅ Real-time error statistics
  - Total logs, errors, warnings
  - Error rate percentage
  - Health indicator (Healthy/Warning/Critical)
- ✅ Errors by type với charts
- ✅ Recent errors list với details
- ✅ Auto-refresh every 5 seconds
- ✅ Export logs to file
- ✅ Clear logs functionality

## 📊 Error Handling Flow

### Before (Generic Error Handling)

```typescript
try {
  // ... operations
  return { success: true };
} catch (error: any) {
  console.error("Error:", error);
  return {
    success: false,
    message: error.message || "Lỗi khi cộng xu",
  };
}
```

**Problems:**
- ❌ Generic error message
- ❌ No retry cho transient errors
- ❌ Không track context
- ❌ Chỉ console.error (không structured)
- ❌ User không biết lỗi gì để fix

### After (Enhanced Error Handling)

```typescript
const opLogger = new OperationLogger('addCoins', context);
opLogger.start();

try {
  const result = await withRetry(
    async () => {
      // ... operations với detailed logging
      coinLogger.info('balance_updated', details);
      coinLogger.info('transaction_logged', details);
      return { newBalance };
    },
    {
      maxAttempts: 3,
      shouldRetry: (error) => {
        const classified = classifyError(error, context);
        return classified.retryable;
      },
    }
  );
  
  opLogger.success(result);
  return { success: true, message: "Thành công", ...result };
  
} catch (error: any) {
  const classified = classifyError(error, context);
  opLogger.error(classified);
  
  coinLogger.error('operation_failed', {
    operationId,
    errorCode: classified.code,
    details: classified.details,
  }, error);
  
  return {
    success: false,
    message: getUserMessage(classified), // User-friendly
  };
}
```

**Benefits:**
- ✅ Automatic retry cho network/database errors
- ✅ Detailed context tracking
- ✅ Structured logging cho debugging
- ✅ User-friendly error messages
- ✅ Error classification cho monitoring

## 🎯 Error Types và Handling

| Error Type | Retryable | User Message | Action |
|-----------|-----------|--------------|--------|
| `NETWORK_ERROR` | ✅ Yes | "Lỗi kết nối. Đang thử lại..." | Auto-retry 3 times |
| `DATABASE_LOCK` | ✅ Yes | "Hệ thống đang bận. Vui lòng thử lại..." | Auto-retry 5 times |
| `RATE_LIMIT` | ✅ Yes | "Vui lòng thử lại sau X giây" | Retry với delay |
| `DUPLICATE_RECORD` | ✅ Yes | "Bản ghi đã tồn tại" | Retry (might be from concurrent request) |
| `INSUFFICIENT_BALANCE` | ❌ No | "Không đủ xu (hiện có: X, cần: Y)" | Show specific amounts |
| `VALIDATION_ERROR` | ❌ No | "Dữ liệu không hợp lệ: {field} {constraint}" | Fix input |
| `PERMISSION_DENIED` | ❌ No | "Không có quyền thực hiện" | Check permissions |
| `BALANCE_NOT_FOUND` | ❌ No | "Không tìm thấy thông tin xu" | User might not exist |

## 📈 Monitoring Metrics

Trong development mode, tự động track:

1. **Operation Metrics:**
   - Operation count
   - Success/failure rate
   - Average duration
   - Retry attempts

2. **Error Metrics:**
   - Total errors
   - Errors by code
   - Error rate percentage
   - Recent error history

3. **Log Metrics:**
   - Total logs
   - Logs by level
   - Oldest/newest log timestamp

## 🚀 Usage Examples

### Basic Error Handling

```typescript
import { addCoinsToUser } from '@/lib/coin-management';

const result = await addCoinsToUser({
  userId: 'user123',
  amount: 100,
  reason: 'Bonus',
  adminId: 'admin1',
});

if (!result.success) {
  // Error message is already user-friendly
  toast.error(result.message);
} else {
  toast.success(result.message);
  console.log('New balance:', result.newBalance);
}
```

### Display Error Details (Admin UI)

```tsx
import { ErrorDetails } from '@/components/admin/ErrorDetails';
import { classifyError } from '@/lib/errors/coin-errors';

function MyComponent() {
  const [error, setError] = useState(null);
  
  const handleOperation = async () => {
    try {
      await addCoinsToUser(...);
    } catch (err) {
      const classified = classifyError(err, { operation: 'addCoins' });
      setError(classified);
    }
  };
  
  return (
    <>
      {error && (
        <ErrorDetails 
          error={error}
          onRetry={error.retryable ? handleOperation : undefined}
        />
      )}
    </>
  );
}
```

### Monitor Errors (Admin Panel)

```tsx
import { CoinErrorMonitor } from '@/components/admin/CoinErrorMonitor';

function AdminPanel() {
  return (
    <Tabs>
      <TabsContent value="errors">
        <CoinErrorMonitor />
      </TabsContent>
    </Tabs>
  );
}
```

### View Logs Programmatically

```typescript
import { coinLogger } from '@/lib/logger/coin-logger';

// Get recent errors
const errors = coinLogger.getLogsByLevel('error', 20);

// Get logs by event
const addCoinsLogs = coinLogger.getLogsByEvent('addCoins', 50);

// Get statistics
const stats = coinLogger.getStats();
console.log('Error rate:', stats.byLevel.error / stats.total);

// Export logs
const logsText = coinLogger.exportLogsAsText();
// Save to file or send to support
```

## 🐛 Troubleshooting

### Problem: Logs không hiển thị

**Cause:** Logging chỉ active trong dev mode

**Solution:**
```typescript
import { coinLogger } from '@/lib/logger/coin-logger';
coinLogger.setEnabled(true);
```

### Problem: Retry không work

**Check:**
1. Error có thực sự retryable không?
   ```typescript
   import { isRetryableError } from '@/lib/errors/coin-errors';
   console.log('Retryable:', isRetryableError(error));
   ```

2. MaxAttempts có đủ không?
   ```typescript
   withRetry(operation, { maxAttempts: 5 });
   ```

### Problem: Error message không user-friendly

**Fix:** Classify error trước khi show:
```typescript
import { classifyError, getUserMessage } from '@/lib/errors/coin-errors';

const classified = classifyError(error, context);
toast.error(getUserMessage(classified));
```

## 📚 Related Files

- [`src/lib/errors/coin-errors.ts`](src/lib/errors/coin-errors.ts) - Error classes
- [`src/lib/logger/coin-logger.ts`](src/lib/logger/coin-logger.ts) - Logging system
- [`src/lib/retry/retry-logic.ts`](src/lib/retry/retry-logic.ts) - Retry patterns
- [`src/lib/coin-management.ts`](src/lib/coin-management.ts) - Updated operations
- [`src/components/admin/ErrorDetails.tsx`](src/components/admin/ErrorDetails.tsx) - Error UI
- [`src/components/admin/CoinErrorMonitor.tsx`](src/components/admin/CoinErrorMonitor.tsx) - Monitoring UI

## ✨ Next Steps

1. **Test error scenarios:**
   - Simulate network failures
   - Test insufficient balance cases
   - Verify retry logic works
   
2. **Add monitoring to admin page:**
   ```tsx
   import { CoinErrorMonitor } from '@/components/admin/CoinErrorMonitor';
   // Add to coin-settings.tsx
   ```

3. **Setup external logging service** (optional):
   - Update `coinLogger.sendToExternalService()`
   - Integrate với Sentry, LogRocket, etc.

4. **Implement alerting** (optional):
   - Alert khi error rate > 10%
   - Alert khi specific error code occurs nhiều
   - Daily error reports

---

**Implemented by:** Claude Opus 5  
**Date:** 2026-09-28  
**Related Issues:** Medium Issue #6 - Error Handling
