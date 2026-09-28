/**
 * Error Classification System for Coin Operations
 *
 * Provides typed errors với user-friendly messages và retry logic
 */

export class CoinOperationError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any,
    public retryable: boolean = false,
    public userMessage?: string
  ) {
    super(message);
    this.name = 'CoinOperationError';
  }
}

// ============================================================================
// Specific Error Classes
// ============================================================================

export class InsufficientBalanceError extends CoinOperationError {
  constructor(current: number, requested: number) {
    super(
      'INSUFFICIENT_BALANCE',
      `Insufficient balance: ${current} < ${requested}`,
      { current, requested, shortfall: requested - current },
      false,
      `Không đủ xu để trừ (hiện có: ${current.toLocaleString()} xu, cần: ${requested.toLocaleString()} xu)`
    );
  }
}

export class NetworkError extends CoinOperationError {
  constructor(originalError: Error, attempt: number = 1) {
    super(
      'NETWORK_ERROR',
      `Network error: ${originalError.message}`,
      { originalError: originalError.message, attempt },
      true,
      'Lỗi kết nối. Đang thử lại...'
    );
  }
}

export class DatabaseLockError extends CoinOperationError {
  constructor(operation: string) {
    super(
      'DATABASE_LOCK',
      `Database locked during ${operation}`,
      { operation },
      true,
      'Hệ thống đang bận. Vui lòng thử lại sau vài giây.'
    );
  }
}

export class BalanceNotFoundError extends CoinOperationError {
  constructor(userId: string) {
    super(
      'BALANCE_NOT_FOUND',
      `Balance record not found for user ${userId}`,
      { userId },
      false,
      'Không tìm thấy thông tin xu của user'
    );
  }
}

export class ValidationError extends CoinOperationError {
  constructor(field: string, constraint: string, value?: any) {
    super(
      'VALIDATION_ERROR',
      `Validation failed: ${field} ${constraint}`,
      { field, constraint, value },
      false,
      `Dữ liệu không hợp lệ: ${field} ${constraint}`
    );
  }
}

export class PermissionDeniedError extends CoinOperationError {
  constructor(action: string) {
    super(
      'PERMISSION_DENIED',
      `Permission denied for action: ${action}`,
      { action },
      false,
      'Bạn không có quyền thực hiện thao tác này'
    );
  }
}

export class RateLimitError extends CoinOperationError {
  constructor(retryAfter: number) {
    super(
      'RATE_LIMIT',
      'Rate limit exceeded',
      { retryAfter },
      true,
      `Vui lòng thử lại sau ${retryAfter} giây`
    );
  }
}

export class DuplicateRecordError extends CoinOperationError {
  constructor(field: string, value: any) {
    super(
      'DUPLICATE_RECORD',
      `Duplicate record: ${field} = ${value}`,
      { field, value },
      true, // Có thể retry vì record có thể đã được tạo bởi request khác
      'Bản ghi đã tồn tại'
    );
  }
}

// ============================================================================
// Error Classifier
// ============================================================================

export interface ErrorContext {
  operation?: string;
  userId?: string;
  amount?: number;
  attempt?: number;
}

/**
 * Classify raw errors thành typed CoinOperationError
 */
export function classifyError(
  error: any,
  context: ErrorContext
): CoinOperationError {
  // Network errors
  if (
    error.message?.includes('fetch failed') ||
    error.message?.includes('Failed to fetch') ||
    error.message?.includes('ECONNREFUSED') ||
    error.message?.includes('ETIMEDOUT') ||
    error.message?.includes('socket hang up') ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT'
  ) {
    return new NetworkError(error, context.attempt);
  }

  // Database errors
  if (error.message?.includes('database is locked')) {
    return new DatabaseLockError(context.operation || 'unknown');
  }

  // Duplicate key errors
  if (
    error.status === 400 &&
    (error.message?.includes('duplicate') ||
      error.message?.includes('unique') ||
      error.data?.data?.user?.code === 'validation_not_unique')
  ) {
    return new DuplicateRecordError('user', context.userId);
  }

  // PocketBase specific errors
  if (error.status === 404) {
    if (context.operation === 'getBalance') {
      return new BalanceNotFoundError(context.userId || 'unknown');
    }
    return new CoinOperationError(
      'NOT_FOUND',
      'Record not found',
      { status: 404 },
      false,
      'Không tìm thấy dữ liệu'
    );
  }

  if (error.status === 401 || error.status === 403) {
    return new PermissionDeniedError(context.operation || 'unknown');
  }

  if (error.status === 429) {
    const retryAfter = parseInt(error.headers?.['retry-after'] || '60');
    return new RateLimitError(retryAfter);
  }

  // Generic fallback
  return new CoinOperationError(
    'UNKNOWN_ERROR',
    error.message || 'Unknown error',
    { originalError: error, context },
    false,
    'Đã xảy ra lỗi. Vui lòng liên hệ admin nếu lỗi tiếp tục.'
  );
}

/**
 * Check nếu error có thể retry
 */
export function isRetryableError(error: any): boolean {
  if (error instanceof CoinOperationError) {
    return error.retryable;
  }

  // Check common retryable patterns
  if (error.message?.includes('fetch failed')) return true;
  if (error.message?.includes('database is locked')) return true;
  if (error.status === 429) return true;
  if (error.status === 503) return true;

  return false;
}

/**
 * Get user-friendly error message
 */
export function getUserMessage(error: any): string {
  if (error instanceof CoinOperationError) {
    return error.userMessage || error.message;
  }

  return 'Đã xảy ra lỗi. Vui lòng thử lại sau.';
}
