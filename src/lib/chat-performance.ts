/**
 * Performance Monitoring for Chat Cache
 * Track cache hit rate, API call count, và load time improvements
 */

const PERF_STORAGE_KEY = "chat_performance_metrics";

export type PerformanceMetrics = {
  // Cache metrics
  cacheHits: number;
  cacheMisses: number;
  cacheWrites: number;
  cacheSize: number; // Number of cached rooms

  // API metrics
  apiCalls: number;
  apiErrors: number;
  totalBytesTransferred: number;

  // Timing metrics
  averageLoadTime: number; // ms
  fastestLoadTime: number; // ms
  slowestLoadTime: number; // ms
  totalLoads: number;

  // Session info
  sessionStart: number;
  lastUpdate: number;
};

/**
 * Get current metrics từ localStorage
 */
function getMetrics(): PerformanceMetrics {
  try {
    const stored = localStorage.getItem(PERF_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("[Perf] Failed to load metrics:", error);
  }

  // Default metrics
  return {
    cacheHits: 0,
    cacheMisses: 0,
    cacheWrites: 0,
    cacheSize: 0,
    apiCalls: 0,
    apiErrors: 0,
    totalBytesTransferred: 0,
    averageLoadTime: 0,
    fastestLoadTime: Infinity,
    slowestLoadTime: 0,
    totalLoads: 0,
    sessionStart: Date.now(),
    lastUpdate: Date.now(),
  };
}

/**
 * Save metrics vào localStorage
 */
function saveMetrics(metrics: PerformanceMetrics): void {
  try {
    metrics.lastUpdate = Date.now();
    localStorage.setItem(PERF_STORAGE_KEY, JSON.stringify(metrics));
  } catch (error) {
    console.error("[Perf] Failed to save metrics:", error);
  }
}

/**
 * Track cache hit
 */
export function trackCacheHit(): void {
  const metrics = getMetrics();
  metrics.cacheHits++;
  saveMetrics(metrics);
}

/**
 * Track cache miss
 */
export function trackCacheMiss(): void {
  const metrics = getMetrics();
  metrics.cacheMisses++;
  saveMetrics(metrics);
}

/**
 * Track cache write
 */
export function trackCacheWrite(itemCount: number): void {
  const metrics = getMetrics();
  metrics.cacheWrites++;
  metrics.cacheSize = itemCount;
  saveMetrics(metrics);
}

/**
 * Track API call
 */
export function trackApiCall(success: boolean, bytesTransferred?: number): void {
  const metrics = getMetrics();
  metrics.apiCalls++;
  if (!success) {
    metrics.apiErrors++;
  }
  if (bytesTransferred) {
    metrics.totalBytesTransferred += bytesTransferred;
  }
  saveMetrics(metrics);
}

/**
 * Track load time
 */
export function trackLoadTime(milliseconds: number): void {
  const metrics = getMetrics();
  metrics.totalLoads++;
  metrics.fastestLoadTime = Math.min(metrics.fastestLoadTime, milliseconds);
  metrics.slowestLoadTime = Math.max(metrics.slowestLoadTime, milliseconds);

  // Calculate rolling average
  const totalTime = metrics.averageLoadTime * (metrics.totalLoads - 1) + milliseconds;
  metrics.averageLoadTime = totalTime / metrics.totalLoads;

  saveMetrics(metrics);
}

/**
 * Get cache hit rate (%)
 */
export function getCacheHitRate(): number {
  const metrics = getMetrics();
  const total = metrics.cacheHits + metrics.cacheMisses;
  if (total === 0) return 0;
  return (metrics.cacheHits / total) * 100;
}

/**
 * Get API error rate (%)
 */
export function getApiErrorRate(): number {
  const metrics = getMetrics();
  if (metrics.apiCalls === 0) return 0;
  return (metrics.apiErrors / metrics.apiCalls) * 100;
}

/**
 * Get performance report
 */
export function getPerformanceReport(): {
  metrics: PerformanceMetrics;
  cacheHitRate: number;
  apiErrorRate: number;
  sessionDuration: number; // minutes
  improvementEstimate: string;
} {
  const metrics = getMetrics();
  const cacheHitRate = getCacheHitRate();
  const apiErrorRate = getApiErrorRate();
  const sessionDuration = (Date.now() - metrics.sessionStart) / 1000 / 60; // minutes

  // Estimate improvement: cache hits save ~200ms average
  const timeSaved = metrics.cacheHits * 200; // ms
  const improvementEstimate =
    timeSaved > 1000
      ? `${(timeSaved / 1000).toFixed(1)}s saved by cache`
      : `${timeSaved}ms saved by cache`;

  return {
    metrics,
    cacheHitRate,
    apiErrorRate,
    sessionDuration,
    improvementEstimate,
  };
}

/**
 * Reset metrics (dành cho testing hoặc new session)
 */
export function resetMetrics(): void {
  localStorage.removeItem(PERF_STORAGE_KEY);
  console.log("[Perf] Metrics reset");
}

/**
 * Log performance report vào console
 */
export function logPerformanceReport(): void {
  const report = getPerformanceReport();

  console.group("📊 Chat Performance Report");
  console.log("Session Duration:", report.sessionDuration.toFixed(1), "minutes");
  console.log("");

  console.group("💾 Cache Performance");
  console.log("Hit Rate:", report.cacheHitRate.toFixed(1) + "%");
  console.log("Hits:", report.metrics.cacheHits);
  console.log("Misses:", report.metrics.cacheMisses);
  console.log("Writes:", report.metrics.cacheWrites);
  console.log("Cached Rooms:", report.metrics.cacheSize);
  console.log("Improvement:", report.improvementEstimate);
  console.groupEnd();

  console.group("🌐 API Performance");
  console.log("Total Calls:", report.metrics.apiCalls);
  console.log("Errors:", report.metrics.apiErrors);
  console.log("Error Rate:", report.apiErrorRate.toFixed(1) + "%");
  console.log(
    "Data Transferred:",
    (report.metrics.totalBytesTransferred / 1024).toFixed(2) + " KB",
  );
  console.groupEnd();

  console.group("⚡ Load Time");
  console.log("Average:", report.metrics.averageLoadTime.toFixed(0) + "ms");
  console.log("Fastest:", report.metrics.fastestLoadTime + "ms");
  console.log("Slowest:", report.metrics.slowestLoadTime + "ms");
  console.log("Total Loads:", report.metrics.totalLoads);
  console.groupEnd();

  console.groupEnd();
}

/**
 * Export metrics as JSON (dành cho debugging)
 */
export function exportMetricsAsJson(): string {
  const report = getPerformanceReport();
  return JSON.stringify(report, null, 2);
}
