/**
 * Error Handling Test Suite
 *
 * Test các scenarios để verify error classification, retry logic, và logging
 */

import { describe, it, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import {
  classifyError,
  InsufficientBalanceError,
  NetworkError,
  ValidationError,
  isRetryableError,
  getUserMessage,
} from '../errors/coin-errors.ts';
import { coinLogger } from '../logger/coin-logger.ts';

// Note: Full integration tests với PocketBase và coin-management
// cần mock phức tạp hơn. Test này focus vào error classification logic.

describe('Error Classification', () => {
  it('should classify network errors', () => {
    const error = new Error('fetch failed');
    const classified = classifyError(error, { operation: 'addCoins' });

    expect(classified).toBeInstanceOf(NetworkError);
    expect(classified.code).toBe('NETWORK_ERROR');
    expect(classified.retryable).toBe(true);
    expect(classified.userMessage).toContain('Lỗi kết nối');
  });

  it('should classify database lock errors', () => {
    const error = new Error('database is locked');
    const classified = classifyError(error, { operation: 'addCoins' });

    expect(classified.code).toBe('DATABASE_LOCK');
    expect(classified.retryable).toBe(true);
    expect(classified.userMessage).toContain('Hệ thống đang bận');
  });

  it('should classify insufficient balance errors', () => {
    const error = new InsufficientBalanceError(50, 100);

    expect(error.code).toBe('INSUFFICIENT_BALANCE');
    expect(error.retryable).toBe(false);
    expect(error.details.current).toBe(50);
    expect(error.details.requested).toBe(100);
    expect(error.details.shortfall).toBe(50);
    expect(error.userMessage).toContain('50 xu');
    expect(error.userMessage).toContain('100 xu');
  });

  it('should classify validation errors', () => {
    const error = new ValidationError('amount', 'phải lớn hơn 0', -10);

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.retryable).toBe(false);
    expect(error.details.field).toBe('amount');
    expect(error.details.value).toBe(-10);
  });

  it('should classify 404 errors', () => {
    const error = { status: 404, message: 'Not found' };
    const classified = classifyError(error, {
      operation: 'getBalance',
      userId: 'user123',
    });

    expect(classified.code).toBe('BALANCE_NOT_FOUND');
    expect(classified.retryable).toBe(false);
  });

  it('should classify 401/403 permission errors', () => {
    const error = { status: 403, message: 'Forbidden' };
    const classified = classifyError(error, { operation: 'addCoins' });

    expect(classified.code).toBe('PERMISSION_DENIED');
    expect(classified.retryable).toBe(false);
    expect(classified.userMessage).toContain('không có quyền');
  });

  it('should classify 429 rate limit errors', () => {
    const error = {
      status: 429,
      headers: { 'retry-after': '60' },
    };
    const classified = classifyError(error, {});

    expect(classified.code).toBe('RATE_LIMIT');
    expect(classified.retryable).toBe(true);
    expect(classified.userMessage).toContain('60 giây');
  });
});

describe('Error Retryability', () => {
  it('should identify retryable errors', () => {
    const networkError = new NetworkError(new Error('fetch failed'));
    expect(isRetryableError(networkError)).toBe(true);

    const dbLockError = { message: 'database is locked' };
    expect(isRetryableError(dbLockError)).toBe(true);

    const rateLimitError = { status: 429 };
    expect(isRetryableError(rateLimitError)).toBe(true);
  });

  it('should identify non-retryable errors', () => {
    const insufficientBalance = new InsufficientBalanceError(50, 100);
    expect(isRetryableError(insufficientBalance)).toBe(false);

    const validationError = new ValidationError('amount', 'invalid');
    expect(isRetryableError(validationError)).toBe(false);

    const permissionError = { status: 403 };
    expect(isRetryableError(permissionError)).toBe(false);
  });
});

describe('User Messages', () => {
  it('should return user-friendly messages', () => {
    const insufficientBalance = new InsufficientBalanceError(50, 100);
    const message = getUserMessage(insufficientBalance);

    expect(message).toContain('Không đủ xu');
    expect(message).toContain('50');
    expect(message).toContain('100');
  });

  it('should return generic message for unknown errors', () => {
    const unknownError = new Error('Something went wrong');
    const message = getUserMessage(unknownError);

    expect(message).toContain('Đã xảy ra lỗi');
  });
});

describe('addCoinsToUser - Error Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    coinLogger.clear();
  });

  it('should reject invalid amount', async () => {
    const result = await addCoinsToUser({
      userId: 'user123',
      amount: -10,
      reason: 'Test',
      adminId: 'admin1',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Số xu phải lớn hơn 0');

    // Check logging
    const logs = coinLogger.getLogsByLevel('warn');
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].event).toContain('Validation');
  });

  it('should reject empty reason', async () => {
    const result = await addCoinsToUser({
      userId: 'user123',
      amount: 100,
      reason: '   ',
      adminId: 'admin1',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('lý do');
  });

  it('should retry on network errors', async () => {
    let attemptCount = 0;

    const mockCollection = {
      getFirstListItem: vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('fetch failed');
        }
        return Promise.resolve({
          id: 'balance1',
          user: 'user123',
          coins: 100,
        });
      }),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    };

    (pb.collection as any).mockReturnValue(mockCollection);

    const result = await addCoinsToUser({
      userId: 'user123',
      amount: 50,
      reason: 'Test retry',
      adminId: 'admin1',
    });

    // Should succeed after retries
    expect(result.success).toBe(true);
    expect(attemptCount).toBe(3);

    // Check retry logs
    const logs = coinLogger.getLogsByLevel('warn');
    expect(logs.some((l) => l.event.includes('retry'))).toBe(true);
  });

  it('should fail after max retry attempts', async () => {
    const mockCollection = {
      getFirstListItem: vi.fn().mockRejectedValue(new Error('fetch failed')),
    };

    (pb.collection as any).mockReturnValue(mockCollection);

    const result = await addCoinsToUser({
      userId: 'user123',
      amount: 50,
      reason: 'Test max retries',
      adminId: 'admin1',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Lỗi kết nối');

    // Check error logged
    const errorLogs = coinLogger.getLogsByLevel('error');
    expect(errorLogs.length).toBeGreaterThan(0);
    expect(errorLogs[0].event).toContain('failed');
  });

  it('should not retry on validation errors', async () => {
    // Already tested above - validation errors return immediately
    const result = await addCoinsToUser({
      userId: 'user123',
      amount: 0,
      reason: 'Invalid',
      adminId: 'admin1',
    });

    expect(result.success).toBe(false);

    // No retry logs should exist
    const logs = coinLogger.getRecentLogs();
    expect(logs.filter((l) => l.event.includes('retry')).length).toBe(0);
  });
});

describe('subtractCoinsFromUser - Error Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    coinLogger.clear();
  });

  it('should throw InsufficientBalanceError', async () => {
    const mockCollection = {
      getFirstListItem: vi.fn().mockResolvedValue({
        id: 'balance1',
        user: 'user123',
        coins: 50,
      }),
    };

    (pb.collection as any).mockReturnValue(mockCollection);

    const result = await subtractCoinsFromUser({
      userId: 'user123',
      amount: 100,
      reason: 'Test insufficient',
      adminId: 'admin1',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Không đủ xu');
    expect(result.message).toContain('50');
    expect(result.message).toContain('100');
  });

  it('should not retry insufficient balance', async () => {
    const mockCollection = {
      getFirstListItem: vi.fn().mockResolvedValue({
        id: 'balance1',
        user: 'user123',
        coins: 50,
      }),
    };

    (pb.collection as any).mockReturnValue(mockCollection);

    const result = await subtractCoinsFromUser({
      userId: 'user123',
      amount: 100,
      reason: 'Test no retry',
      adminId: 'admin1',
    });

    expect(result.success).toBe(false);

    // No retry attempts
    const logs = coinLogger.getRecentLogs();
    expect(logs.filter((l) => l.event.includes('retry')).length).toBe(0);
  });

  it('should handle balance not found', async () => {
    const mockCollection = {
      getFirstListItem: vi.fn().mockRejectedValue({
        status: 404,
        message: 'Not found',
      }),
    };

    (pb.collection as any).mockReturnValue(mockCollection);

    const result = await subtractCoinsFromUser({
      userId: 'user123',
      amount: 100,
      reason: 'Test not found',
      adminId: 'admin1',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Không đủ xu');
  });
});

describe('Logging Integration', () => {
  beforeEach(() => {
    coinLogger.clear();
  });

  it('should log operation lifecycle', async () => {
    const mockCollection = {
      getFirstListItem: vi.fn().mockResolvedValue({
        id: 'balance1',
        user: 'user123',
        coins: 100,
      }),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ id: 'tx1' }),
    };

    (pb.collection as any).mockReturnValue(mockCollection);

    await addCoinsToUser({
      userId: 'user123',
      amount: 50,
      reason: 'Test logging',
      adminId: 'admin1',
    });

    const logs = coinLogger.getRecentLogs();

    // Should have started, balance_updated, transaction_logged, completed
    expect(logs.some((l) => l.event.includes('started'))).toBe(true);
    expect(logs.some((l) => l.event === 'balance_updated')).toBe(true);
    expect(logs.some((l) => l.event === 'transaction_logged')).toBe(true);
    expect(logs.some((l) => l.event.includes('completed'))).toBe(true);
  });

  it('should log errors with context', async () => {
    const mockCollection = {
      getFirstListItem: vi.fn().mockRejectedValue(new Error('Test error')),
    };

    (pb.collection as any).mockReturnValue(mockCollection);

    await addCoinsToUser({
      userId: 'user123',
      amount: 50,
      reason: 'Test error logging',
      adminId: 'admin1',
    });

    const errorLogs = coinLogger.getLogsByLevel('error');
    expect(errorLogs.length).toBeGreaterThan(0);

    const lastError = errorLogs[errorLogs.length - 1];
    expect(lastError.data.userId).toBe('user123');
    expect(lastError.data.amount).toBe(50);
    expect(lastError.data.adminId).toBe('admin1');
  });

  it('should track statistics', async () => {
    coinLogger.clear();

    // Generate some logs
    coinLogger.info('test_event_1', { data: 1 });
    coinLogger.warn('test_event_2', { data: 2 });
    coinLogger.error('test_event_3', { data: 3 }, new Error('Test'));

    const stats = coinLogger.getStats();

    expect(stats.total).toBe(3);
    expect(stats.byLevel.info).toBe(1);
    expect(stats.byLevel.warn).toBe(1);
    expect(stats.byLevel.error).toBe(1);
  });
});
