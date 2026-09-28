import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { coinLogger } from "@/lib/logger/coin-logger";
import { AlertCircle, TrendingUp, Download, RefreshCw } from "lucide-react";

interface ErrorStats {
  total: number;
  byLevel: {
    error: number;
    warn: number;
    info: number;
    debug: number;
  };
  errorsByCode: Record<string, number>;
  recentErrors: Array<{
    timestamp: string;
    event: string;
    errorCode?: string;
    errorMessage?: string;
  }>;
}

export function CoinErrorMonitor() {
  const [stats, setStats] = useState<ErrorStats>({
    total: 0,
    byLevel: { error: 0, warn: 0, info: 0, debug: 0 },
    errorsByCode: {},
    recentErrors: [],
  });
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadStats = () => {
    const logStats = coinLogger.getStats();
    const errorLogs = coinLogger.getLogsByLevel('error', 20);

    setStats({
      total: logStats.total,
      byLevel: logStats.byLevel,
      errorsByCode: logStats.errorsByCode,
      recentErrors: errorLogs.map((log) => ({
        timestamp: log.timestamp,
        event: log.event,
        errorCode: log.error?.code,
        errorMessage: log.error?.message,
      })),
    });
  };

  useEffect(() => {
    loadStats();

    if (autoRefresh) {
      // Auto-refresh every 10 seconds (reduced from 5s to lower load)
      const interval = setInterval(loadStats, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const handleExport = () => {
    const logs = coinLogger.exportLogsAsText();
    const blob = new Blob([logs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coin-error-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (confirm("Xóa tất cả error logs?")) {
      coinLogger.clear();
      loadStats();
    }
  };

  const errorRate =
    stats.total > 0 ? (stats.byLevel.error / stats.total) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Error Monitor
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Track và monitor coin operation errors
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`}
              />
              {autoRefresh ? "Auto" : "Manual"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button size="sm" variant="outline" onClick={handleClear}>
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Total Logs</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Errors</div>
            <div className="text-2xl font-bold text-red-600">
              {stats.byLevel.error}
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Warnings</div>
            <div className="text-2xl font-bold text-yellow-600">
              {stats.byLevel.warn}
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Error Rate
            </div>
            <div
              className={`text-2xl font-bold ${
                errorRate > 10
                  ? "text-red-600"
                  : errorRate > 5
                    ? "text-yellow-600"
                    : "text-green-600"
              }`}
            >
              {errorRate.toFixed(1)}%
            </div>
          </div>
        </Card>
      </div>

      {/* Errors by Code */}
      {Object.keys(stats.errorsByCode).length > 0 && (
        <Card className="p-4">
          <h4 className="font-semibold mb-3">Errors by Type</h4>
          <div className="space-y-2">
            {Object.entries(stats.errorsByCode)
              .sort(([, a], [, b]) => b - a)
              .map(([code, count]) => (
                <div
                  key={code}
                  className="flex items-center justify-between p-2 bg-muted rounded"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">{code}</Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      {count} occurrence{count > 1 ? "s" : ""}
                    </span>
                    <div className="w-32 bg-background rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-red-600"
                        style={{
                          width: `${(count / stats.byLevel.error) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Recent Errors */}
      {stats.recentErrors.length > 0 && (
        <Card className="p-4">
          <h4 className="font-semibold mb-3">Recent Errors</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {stats.recentErrors.map((error, index) => (
              <div
                key={index}
                className="p-3 bg-muted rounded text-xs font-mono space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {new Date(error.timestamp).toLocaleString()}
                  </span>
                  {error.errorCode && (
                    <Badge variant="destructive" className="text-xs">
                      {error.errorCode}
                    </Badge>
                  )}
                </div>
                <div className="font-medium">{error.event}</div>
                {error.errorMessage && (
                  <div className="text-muted-foreground">
                    {error.errorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* No Errors State */}
      {stats.byLevel.error === 0 && (
        <Card className="p-6">
          <div className="text-center text-muted-foreground">
            <div className="text-4xl mb-2">✅</div>
            <p className="font-medium">Không có lỗi nào được ghi nhận</p>
            <p className="text-sm mt-1">
              Hệ thống đang hoạt động bình thường
            </p>
          </div>
        </Card>
      )}

      {/* Health Indicator */}
      <Card className="p-3 bg-muted/50">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">System Health</span>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                errorRate > 10
                  ? "bg-red-600"
                  : errorRate > 5
                    ? "bg-yellow-600"
                    : "bg-green-600"
              }`}
            />
            <span className="font-medium">
              {errorRate > 10
                ? "Critical"
                : errorRate > 5
                  ? "Warning"
                  : "Healthy"}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
