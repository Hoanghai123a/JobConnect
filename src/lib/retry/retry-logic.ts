/**
 * Retry Logic với Exponential Backoff
 *
 * Automatic retry cho transient errors với smart backoff strategy
 */

import { isRetryableError } from '../errors/coin-errors';
import { coinLogger } from '../logger/coin-logger';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number; // ms
  maxDelay?: number; // ms
  shouldRetry?: (error: any, attempt: number) => boolean;
  onRetry?: (error: any, attempt: number, delay: number) => void;
}

/**
 * Wrap một async operation với retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 100,
    maxDelay = 5000,
    shouldRetry = (error) => isRetryableError(error),
    onRetry = () => {},
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Don't retry if:
      // 1. Last attempt
      // 2. Error not retryable
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      // Calculate delay với exponential backoff + jitter
      const exponentialDelay = Math.min(
        baseDelay * Math.pow(2, attempt - 1),
        maxDelay
      );
      const jitter = Math.random() * 0.3 * exponentialDelay; // ±30%
      const delay = exponentialDelay + jitter;

      // Log retry attempt
      coinLogger.warn('operation_retry', {
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
        delayMs: Math.round(delay),
        errorCode: error.code,
        errorMessage: error.message,
      });

      // Notify caller
      onRetry(error, attempt, delay);

      // Wait before retry
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry với specific error types
 */
export async function withNetworkRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  return withRetry(operation, {
    maxAttempts,
    baseDelay: 200,
    maxDelay: 3000,
    shouldRetry: (error) => {
      // Chỉ retry network errors
      return (
        error.message?.includes('fetch failed') ||
        error.message?.includes('Failed to fetch') ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'NETWORK_ERROR'
      );
    },
  });
}

/**
 * Retry với database lock errors
 */
export async function withDatabaseLockRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 5
): Promise<T> {
  return withRetry(operation, {
    maxAttempts,
    baseDelay: 50, // Shorter delay for lock contention
    maxDelay: 2000,
    shouldRetry: (error) => {
      return (
        error.message?.includes('database is locked') ||
        error.code === 'DATABASE_LOCK'
      );
    },
  });
}

/**
 * Circuit Breaker Pattern
 *
 * Prevents overwhelming a failing service với repeated requests
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === 'open') {
      const now = Date.now();
      if (now - this.lastFailureTime < this.timeout) {
        throw new Error('Circuit breaker is OPEN');
      }
      // Try half-open
      this.state = 'half-open';
      coinLogger.info('circuit_breaker_half_open', {
        failureCount: this.failureCount,
        lastFailureTime: this.lastFailureTime,
      });
    }

    try {
      const result = await operation();

      // Success - reset circuit
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failureCount = 0;
        coinLogger.info('circuit_breaker_closed', {
          message: 'Circuit recovered',
        });
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.threshold) {
        this.state = 'open';
        coinLogger.error('circuit_breaker_open', {
          failureCount: this.failureCount,
          threshold: this.threshold,
          timeout: this.timeout,
        });
      }

      throw error;
    }
  }

  reset() {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

/**
 * Bulkhead Pattern
 *
 * Limit concurrent operations để prevent resource exhaustion
 */
export class Bulkhead {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private maxConcurrent: number = 10) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Wait for slot if at capacity
    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.running++;

    try {
      return await operation();
    } finally {
      this.running--;

      // Release next in queue
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }

  getStats() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      utilization: (this.running / this.maxConcurrent) * 100,
    };
  }
}

// Global instances for coin operations
export const coinCircuitBreaker = new CircuitBreaker(5, 60000);
export const coinBulkhead = new Bulkhead(10);
