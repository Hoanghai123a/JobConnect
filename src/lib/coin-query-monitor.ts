/**
 * Query Performance Monitor for Coin Operations
 *
 * Track và log query execution times để monitor performance improvements
 * sau khi add indexes
 */

interface QueryMetrics {
  name: string;
  count: number;
  totalTime: number;
  minTime: number;
  maxTime: number;
  avgTime: number;
  p95Time: number;
  lastExecutions: number[]; // Rolling window of last 100 executions
}

class CoinQueryMonitor {
  private metrics: Map<string, QueryMetrics> = new Map();
  private readonly MAX_HISTORY = 100;
  private enabled: boolean = import.meta.env.DEV; // Only in development

  /**
   * Record một query execution
   */
  recordQuery(queryName: string, durationMs: number) {
    if (!this.enabled) return;

    let metric = this.metrics.get(queryName);

    if (!metric) {
      metric = {
        name: queryName,
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        avgTime: 0,
        p95Time: 0,
        lastExecutions: [],
      };
      this.metrics.set(queryName, metric);
    }

    // Update metrics
    metric.count++;
    metric.totalTime += durationMs;
    metric.minTime = Math.min(metric.minTime, durationMs);
    metric.maxTime = Math.max(metric.maxTime, durationMs);
    metric.avgTime = metric.totalTime / metric.count;

    // Rolling window
    metric.lastExecutions.push(durationMs);
    if (metric.lastExecutions.length > this.MAX_HISTORY) {
      metric.lastExecutions.shift();
    }

    // Calculate P95
    const sorted = [...metric.lastExecutions].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    metric.p95Time = sorted[p95Index] || 0;

    // Log slow queries
    if (durationMs > 100) {
      console.warn(`🐌 Slow query: ${queryName} took ${durationMs.toFixed(1)}ms`);
    }
  }

  /**
   * Get metrics cho một query
   */
  getMetrics(queryName: string): QueryMetrics | undefined {
    return this.metrics.get(queryName);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): QueryMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get performance report
   */
  getReport(): string {
    const metrics = this.getAllMetrics();

    if (metrics.length === 0) {
      return 'No query metrics recorded yet.';
    }

    const lines = [
      '📊 Coin Query Performance Report',
      '─'.repeat(60),
      '',
    ];

    metrics
      .sort((a, b) => b.count - a.count) // Sort by frequency
      .forEach(m => {
        lines.push(`Query: ${m.name}`);
        lines.push(`  Count: ${m.count}`);
        lines.push(`  Avg: ${m.avgTime.toFixed(1)}ms`);
        lines.push(`  Min: ${m.minTime.toFixed(1)}ms`);
        lines.push(`  Max: ${m.maxTime.toFixed(1)}ms`);
        lines.push(`  P95: ${m.p95Time.toFixed(1)}ms`);
        lines.push('');
      });

    return lines.join('\n');
  }

  /**
   * Log report to console
   */
  logReport() {
    if (!this.enabled) return;
    console.log(this.getReport());
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }
}

// Singleton instance
export const coinQueryMonitor = new CoinQueryMonitor();

/**
 * Decorator để auto-track query performance
 */
export function trackQuery(queryName: string) {
  return function <T>(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const start = performance.now();

      try {
        const result = await originalMethod.apply(this, args);
        const duration = performance.now() - start;
        coinQueryMonitor.recordQuery(queryName, duration);
        return result;
      } catch (error) {
        const duration = performance.now() - start;
        coinQueryMonitor.recordQuery(`${queryName}_error`, duration);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Helper function để wrap async functions
 */
export async function withQueryTracking<T>(
  queryName: string,
  operation: () => Promise<T>
): Promise<T> {
  const start = performance.now();

  try {
    const result = await operation();
    const duration = performance.now() - start;
    coinQueryMonitor.recordQuery(queryName, duration);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    coinQueryMonitor.recordQuery(`${queryName}_error`, duration);
    throw error;
  }
}
