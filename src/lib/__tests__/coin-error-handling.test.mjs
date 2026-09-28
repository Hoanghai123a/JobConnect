/**
 * Error Handling Test Suite
 *
 * Test các scenarios để verify error classification, retry logic, và logging
 * Run: node --test src/lib/__tests__/coin-error-handling.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  classifyError,
  InsufficientBalanceError,
  NetworkError,
  ValidationError,
  DatabaseLockError,
  BalanceNotFoundError,
  PermissionDeniedError,
  RateLimitError,
  isRetryableError,
  getUserMessage,
} from '../errors/coin-errors.ts';
import { coinLogger } from '../logger/coin-logger.ts';

describe('Error Classification', () => {
  it('should classify network errors', () => {
    const error = new Error('fetch failed');
    const classified = classifyError(error, { operation: 'addCoins' });

    assert.ok(classified instanceof NetworkError);
    assert.strictEqual(classified.code, 'NETWORK_ERROR');
    assert.strictEqual(classified.retryable, true);
    assert.ok(classified.userMessage.includes('Lỗi kết nối'));
  });

  it('should classify database lock errors', () => {
    const error = new Error('database is locked');
    const classified = classifyError(error, { operation: 'addCoins' });

    assert.strictEqual(classified.code, 'DATABASE_LOCK');
    assert.strictEqual(classified.retryable, true);
    assert.ok(classified.userMessage.includes('Hệ thống đang bận'));
  });

  it('should classify insufficient balance errors', () => {
    const error = new InsufficientBalanceError(50, 100);

    assert.strictEqual(error.code, 'INSUFFICIENT_BALANCE');
    assert.strictEqual(error.retryable, false);
    assert.strictEqual(error.details.current, 50);
    assert.strictEqual(error.details.requested, 100);
    assert.strictEqual(error.details.shortfall, 50);
    assert.ok(error.userMessage.includes('50'));
    assert.ok(error.userMessage.includes('100'));
  });

  it('should classify validation errors', () => {
    const error = new ValidationError('amount', 'phải lớn hơn 0', -10);

    assert.strictEqual(error.code, 'VALIDATION_ERROR');
    assert.strictEqual(error.retryable, false);
    assert.strictEqual(error.details.field, 'amount');
    assert.strictEqual(error.details.value, -10);
  });

  it('should classify 404 errors', () => {
    const error = { status: 404, message: 'Not found' };
    const classified = classifyError(error, {
      operation: 'getBalance',
      userId: 'user123',
    });

    assert.strictEqual(classified.code, 'BALANCE_NOT_FOUND');
    assert.strictEqual(classified.retryable, false);
  });

  it('should classify 401/403 permission errors', () => {
    const error = { status: 403, message: 'Forbidden' };
    const classified = classifyError(error, { operation: 'addCoins' });

    assert.strictEqual(classified.code, 'PERMISSION_DENIED');
    assert.strictEqual(classified.retryable, false);
    assert.ok(classified.userMessage.includes('không có quyền'));
  });

  it('should classify 429 rate limit errors', () => {
    const error = {
      status: 429,
      headers: { 'retry-after': '60' },
    };
    const classified = classifyError(error, {});

    assert.strictEqual(classified.code, 'RATE_LIMIT');
    assert.strictEqual(classified.retryable, true);
    assert.ok(classified.userMessage.includes('60 giây'));
  });
});

describe('Error Retryability', () => {
  it('should identify retryable errors', () => {
    const networkError = new NetworkError(new Error('fetch failed'));
    assert.strictEqual(isRetryableError(networkError), true);

    const dbLockError = { message: 'database is locked' };
    assert.strictEqual(isRetryableError(dbLockError), true);

    const rateLimitError = { status: 429 };
    assert.strictEqual(isRetryableError(rateLimitError), true);
  });

  it('should identify non-retryable errors', () => {
    const insufficientBalance = new InsufficientBalanceError(50, 100);
    assert.strictEqual(isRetryableError(insufficientBalance), false);

    const validationError = new ValidationError('amount', 'invalid');
    assert.strictEqual(isRetryableError(validationError), false);

    const permissionError = { status: 403 };
    assert.strictEqual(isRetryableError(permissionError), false);
  });
});

describe('User Messages', () => {
  it('should return user-friendly messages', () => {
    const insufficientBalance = new InsufficientBalanceError(50, 100);
    const message = getUserMessage(insufficientBalance);

    assert.ok(message.includes('Không đủ xu'));
    assert.ok(message.includes('50'));
    assert.ok(message.includes('100'));
  });

  it('should return generic message for unknown errors', () => {
    const unknownError = new Error('Something went wrong');
    const message = getUserMessage(unknownError);

    assert.ok(message.includes('Đã xảy ra lỗi'));
  });
});

describe('Logging Integration', () => {
  it('should log and track statistics', () => {
    coinLogger.clear();

    // Generate some logs
    coinLogger.info('test_event_1', { data: 1 });
    coinLogger.warn('test_event_2', { data: 2 });
    coinLogger.error('test_event_3', { data: 3 }, new Error('Test'));

    const stats = coinLogger.getStats();

    assert.strictEqual(stats.total, 3);
    assert.strictEqual(stats.byLevel.info, 1);
    assert.strictEqual(stats.byLevel.warn, 1);
    assert.strictEqual(stats.byLevel.error, 1);
  });

  it('should filter logs by level', () => {
    coinLogger.clear();

    coinLogger.info('info_event', {});
    coinLogger.error('error_event', {}, new Error('Test'));
    coinLogger.warn('warn_event', {});

    const errorLogs = coinLogger.getLogsByLevel('error');
    assert.strictEqual(errorLogs.length, 1);
    assert.strictEqual(errorLogs[0].event, 'error_event');

    const warnLogs = coinLogger.getLogsByLevel('warn');
    assert.strictEqual(warnLogs.length, 1);
    assert.strictEqual(warnLogs[0].event, 'warn_event');
  });

  it('should export logs', () => {
    coinLogger.clear();

    coinLogger.info('export_test', { key: 'value' });

    const exported = coinLogger.exportLogsAsText();
    assert.ok(exported.includes('export_test'));
    assert.ok(exported.includes('INFO'));
  });
});

describe('Error Details', () => {
  it('should include proper context in error details', () => {
    const error = new InsufficientBalanceError(100, 200);

    assert.strictEqual(error.details.current, 100);
    assert.strictEqual(error.details.requested, 200);
    assert.strictEqual(error.details.shortfall, 100);
    assert.ok(error.userMessage);
    assert.ok(error.message);
  });

  it('should handle validation errors with context', () => {
    const error = new ValidationError('userId', 'không được để trống', null);

    assert.strictEqual(error.details.field, 'userId');
    assert.strictEqual(error.details.constraint, 'không được để trống');
    assert.ok(error.userMessage.includes('userId'));
  });

  it('should classify timeout errors as network errors', () => {
    const error = new Error('timeout');
    const classified = classifyError(error, {});

    assert.strictEqual(classified.code, 'NETWORK_ERROR');
    assert.strictEqual(classified.retryable, true);
  });

  it('should classify connection refused as network errors', () => {
    const error = new Error('connection refused');
    const classified = classifyError(error, {});

    assert.strictEqual(classified.code, 'NETWORK_ERROR');
    assert.strictEqual(classified.retryable, true);
  });
});
