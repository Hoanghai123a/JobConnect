/**
 * Manual Error Handling Verification Script
 *
 * Run: node scripts/test-error-handling.mjs
 */

import {
  classifyError,
  InsufficientBalanceError,
  NetworkError,
  ValidationError,
  isRetryableError,
  getUserMessage,
} from '../src/lib/errors/coin-errors.ts';
import { coinLogger } from '../src/lib/logger/coin-logger.ts';

console.log('🧪 Testing Error Handling Implementation\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passCount++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failCount++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test 1: Network Error Classification
test('Network errors should be classified correctly', () => {
  const error = new Error('fetch failed');
  const classified = classifyError(error, { operation: 'addCoins' });

  assert(classified instanceof NetworkError, 'Should be NetworkError instance');
  assert(classified.code === 'NETWORK_ERROR', 'Should have NETWORK_ERROR code');
  assert(classified.retryable === true, 'Should be retryable');
  assert(classified.userMessage.includes('Lỗi kết nối'), 'Should have user-friendly message');
});

// Test 2: Database Lock Error
test('Database lock errors should be retryable', () => {
  const error = new Error('database is locked');
  const classified = classifyError(error, { operation: 'addCoins' });

  assert(classified.code === 'DATABASE_LOCK', 'Should have DATABASE_LOCK code');
  assert(classified.retryable === true, 'Should be retryable');
  assert(classified.userMessage.includes('Hệ thống đang bận'), 'Should have user message');
});

// Test 3: Insufficient Balance Error
test('Insufficient balance errors should include amounts', () => {
  const error = new InsufficientBalanceError(50, 100);

  assert(error.code === 'INSUFFICIENT_BALANCE', 'Should have correct code');
  assert(error.retryable === false, 'Should NOT be retryable');
  assert(error.details.current === 50, 'Should have current balance');
  assert(error.details.requested === 100, 'Should have requested amount');
  assert(error.details.shortfall === 50, 'Should calculate shortfall');
  assert(error.userMessage.includes('50'), 'Should show current balance');
  assert(error.userMessage.includes('100'), 'Should show requested amount');
});

// Test 4: Validation Error
test('Validation errors should not be retryable', () => {
  const error = new ValidationError('amount', 'phải lớn hơn 0', -10);

  assert(error.code === 'VALIDATION_ERROR', 'Should have VALIDATION_ERROR code');
  assert(error.retryable === false, 'Should NOT be retryable');
  assert(error.details.field === 'amount', 'Should have field name');
  assert(error.details.value === -10, 'Should have invalid value');
});

// Test 5: 404 Error Classification
test('404 errors should classify as balance not found', () => {
  const error = { status: 404, message: 'Not found' };
  const classified = classifyError(error, { operation: 'getBalance' });

  assert(classified.code === 'BALANCE_NOT_FOUND', 'Should have BALANCE_NOT_FOUND code');
  assert(classified.retryable === false, 'Should NOT be retryable');
});

// Test 6: Permission Error
test('403 errors should classify as permission denied', () => {
  const error = { status: 403, message: 'Forbidden' };
  const classified = classifyError(error, { operation: 'addCoins' });

  assert(classified.code === 'PERMISSION_DENIED', 'Should have PERMISSION_DENIED code');
  assert(classified.retryable === false, 'Should NOT be retryable');
  assert(classified.userMessage.includes('không có quyền'), 'Should have permission message');
});

// Test 7: Rate Limit Error
test('429 errors should be retryable with delay', () => {
  const error = { status: 429, headers: { 'retry-after': '60' } };
  const classified = classifyError(error, {});

  assert(classified.code === 'RATE_LIMIT', 'Should have RATE_LIMIT code');
  assert(classified.retryable === true, 'Should be retryable');
  assert(classified.userMessage.includes('60 giây'), 'Should show retry delay');
});

// Test 8: Retryability Detection
test('isRetryableError should identify retryable errors', () => {
  const networkError = new NetworkError(new Error('fetch failed'));
  assert(isRetryableError(networkError) === true, 'Network error should be retryable');

  const dbLockError = { message: 'database is locked' };
  assert(isRetryableError(dbLockError) === true, 'DB lock should be retryable');

  const rateLimitError = { status: 429 };
  assert(isRetryableError(rateLimitError) === true, 'Rate limit should be retryable');
});

// Test 9: Non-Retryable Errors
test('isRetryableError should identify non-retryable errors', () => {
  const insufficientBalance = new InsufficientBalanceError(50, 100);
  assert(isRetryableError(insufficientBalance) === false, 'Insufficient balance NOT retryable');

  const validationError = new ValidationError('amount', 'invalid');
  assert(isRetryableError(validationError) === false, 'Validation error NOT retryable');

  const permissionError = { status: 403 };
  assert(isRetryableError(permissionError) === false, 'Permission error NOT retryable');
});

// Test 10: User-Friendly Messages
test('getUserMessage should return user-friendly messages', () => {
  const insufficientBalance = new InsufficientBalanceError(50, 100);
  const message = getUserMessage(insufficientBalance);

  assert(message.includes('Không đủ xu'), 'Should have friendly message');
  assert(message.includes('50'), 'Should include current balance');
  assert(message.includes('100'), 'Should include requested amount');
});

// Test 11: Generic Error Message
test('getUserMessage should handle unknown errors', () => {
  const unknownError = new Error('Something went wrong');
  const message = getUserMessage(unknownError);

  assert(message.includes('Đã xảy ra lỗi'), 'Should have generic error message');
});

// Test 12: Logger Integration
test('Logger should track statistics', () => {
  coinLogger.clear();

  coinLogger.info('test_event_1', { data: 1 });
  coinLogger.warn('test_event_2', { data: 2 });
  coinLogger.error('test_event_3', { data: 3 }, new Error('Test'));

  const stats = coinLogger.getStats();

  assert(stats.total === 3, 'Should have 3 total logs');
  assert(stats.byLevel.info === 1, 'Should have 1 info log');
  assert(stats.byLevel.warn === 1, 'Should have 1 warn log');
  assert(stats.byLevel.error === 1, 'Should have 1 error log');
});

// Test 13: Logger Filter by Level
test('Logger should filter logs by level', () => {
  coinLogger.clear();

  coinLogger.info('info_event', {});
  coinLogger.error('error_event', {}, new Error('Test'));
  coinLogger.warn('warn_event', {});

  const errorLogs = coinLogger.getLogsByLevel('error');
  assert(errorLogs.length === 1, 'Should have 1 error log');
  assert(errorLogs[0].event === 'error_event', 'Should be error_event');

  const warnLogs = coinLogger.getLogsByLevel('warn');
  assert(warnLogs.length === 1, 'Should have 1 warn log');
  assert(warnLogs[0].event === 'warn_event', 'Should be warn_event');
});

// Test 14: Logger Export
test('Logger should export logs as text', () => {
  coinLogger.clear();

  coinLogger.info('export_test', { key: 'value' });

  const exported = coinLogger.exportLogsAsText();
  assert(exported.includes('export_test'), 'Should include event name');
  assert(exported.includes('INFO'), 'Should include log level');
});

// Test 15: Timeout Errors
test('Timeout errors should classify as network errors', () => {
  const error = new Error('timeout');
  const classified = classifyError(error, {});

  assert(classified.code === 'NETWORK_ERROR', 'Should be network error');
  assert(classified.retryable === true, 'Should be retryable');
});

// Test 16: Connection Refused
test('Connection refused should classify as network errors', () => {
  const error = new Error('connection refused');
  const classified = classifyError(error, {});

  assert(classified.code === 'NETWORK_ERROR', 'Should be network error');
  assert(classified.retryable === true, 'Should be retryable');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log(`📊 Total: ${passCount + failCount}`);
console.log('='.repeat(50));

if (failCount > 0) {
  console.log('\n❌ Some tests failed');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}
