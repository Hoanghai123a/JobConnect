/**
 * Structured Logging System for Coin Operations
 *
 * Provides consistent logging với context tracking và external service integration
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  event: string;
  timestamp: string;
  data?: any;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
}

class CoinLogger {
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 1000;
  private enabled: boolean = true;

  /**
   * Internal log method
   */
  private log(level: LogLevel, event: string, data?: any, error?: any) {
    if (!this.enabled) return;

    const entry: LogEntry = {
      level,
      event,
      timestamp: new Date().toISOString(),
      data,
      error: error
        ? {
            message: error.message || String(error),
            code: error.code,
            stack: error.stack,
          }
        : undefined,
    };

    // Console output (development)
    if (import.meta.env.DEV) {
      const style = {
        debug: 'color: gray',
        info: 'color: blue',
        warn: 'color: orange; font-weight: bold',
        error: 'color: red; font-weight: bold',
      }[level];

      const prefix = `[${level.toUpperCase()}] ${event}`;

      if (level === 'error' && error) {
        console.error(`%c${prefix}`, style, data || '', error);
      } else {
        console.log(`%c${prefix}`, style, data || '');
      }
    }

    // Store in memory (circular buffer)
    this.logs.push(entry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift();
    }

    // Send critical errors to external service
    if (import.meta.env.PROD && level === 'error') {
      this.sendToExternalService(entry).catch(() => {
        // Fail silently to not interfere with app
      });
    }
  }

  /**
   * Debug level logging
   */
  debug(event: string, data?: any) {
    this.log('debug', event, data);
  }

  /**
   * Info level logging
   */
  info(event: string, data?: any) {
    this.log('info', event, data);
  }

  /**
   * Warning level logging
   */
  warn(event: string, data?: any) {
    this.log('warn', event, data);
  }

  /**
   * Error level logging
   */
  error(event: string, data?: any, error?: any) {
    this.log('error', event, data, error);
  }

  /**
   * Get recent logs
   */
  getRecentLogs(count: number = 50): LogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: LogLevel, count: number = 50): LogEntry[] {
    return this.logs.filter((log) => log.level === level).slice(-count);
  }

  /**
   * Get logs by event pattern
   */
  getLogsByEvent(pattern: string, count: number = 50): LogEntry[] {
    return this.logs
      .filter((log) => log.event.includes(pattern))
      .slice(-count);
  }

  /**
   * Export all logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Export logs as formatted text
   */
  exportLogsAsText(): string {
    return this.logs
      .map((log) => {
        const parts = [
          `[${log.timestamp}]`,
          `[${log.level.toUpperCase()}]`,
          log.event,
        ];

        if (log.data) {
          parts.push(JSON.stringify(log.data));
        }

        if (log.error) {
          parts.push(`Error: ${log.error.message}`);
          if (log.error.code) {
            parts.push(`Code: ${log.error.code}`);
          }
        }

        return parts.join(' ');
      })
      .join('\n');
  }

  /**
   * Clear all logs
   */
  clear() {
    this.logs = [];
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  /**
   * Get logging statistics
   */
  getStats() {
    const byLevel = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };

    this.logs.forEach((log) => {
      byLevel[log.level]++;
    });

    const errorLogs = this.logs.filter((log) => log.level === 'error');
    const errorsByCode: Record<string, number> = {};

    errorLogs.forEach((log) => {
      if (log.error?.code) {
        errorsByCode[log.error.code] = (errorsByCode[log.error.code] || 0) + 1;
      }
    });

    return {
      total: this.logs.length,
      byLevel,
      errorsByCode,
      oldestLog: this.logs[0]?.timestamp,
      newestLog: this.logs[this.logs.length - 1]?.timestamp,
    };
  }

  /**
   * Send logs to external service (Sentry, LogRocket, etc.)
   */
  private async sendToExternalService(entry: LogEntry): Promise<void> {
    // TODO: Implement integration với external logging service
    // Example: Sentry, LogRocket, custom endpoint

    try {
      // Send to custom logging endpoint
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (err) {
      // Fail silently - don't want logging errors to break the app
      if (import.meta.env.DEV) {
        console.warn('Failed to send log to external service:', err);
      }
    }
  }
}

// Singleton instance
export const coinLogger = new CoinLogger();

/**
 * Helper: Log operation lifecycle
 */
export class OperationLogger {
  constructor(
    private operationName: string,
    private context: any
  ) {}

  start() {
    coinLogger.info(`${this.operationName}_started`, this.context);
  }

  success(result?: any) {
    coinLogger.info(`${this.operationName}_completed`, {
      ...this.context,
      result,
    });
  }

  error(error: any) {
    coinLogger.error(
      `${this.operationName}_failed`,
      this.context,
      error
    );
  }

  warn(message: string, data?: any) {
    coinLogger.warn(`${this.operationName}_warning`, {
      ...this.context,
      message,
      ...data,
    });
  }

  debug(message: string, data?: any) {
    coinLogger.debug(`${this.operationName}_debug`, {
      ...this.context,
      message,
      ...data,
    });
  }
}

/**
 * Decorator to auto-log function calls
 */
export function logOperation(operationName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const logger = new OperationLogger(operationName, { args });
      logger.start();

      try {
        const result = await originalMethod.apply(this, args);
        logger.success(result);
        return result;
      } catch (error) {
        logger.error(error);
        throw error;
      }
    };

    return descriptor;
  };
}
