import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { coinQueryMonitor } from "@/lib/coin-query-monitor";
import { Activity, TrendingUp, Clock, RefreshCw, Download } from "lucide-react";

interface QueryMetric {
  name: string;
  count: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p95Time: number;
}

export function CoinQueryMonitor() {
  const [metrics, setMetrics] = useState<QueryMetric[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadMetrics = () => {
    const allMetrics = coinQueryMonitor.getAllMetrics();
    setMetrics(allMetrics);
  };

  useEffect(() => {
    loadMetrics();

    if (autoRefresh) {
      // Auto-refresh every 10 seconds (reduced from 5s to lower load)
      const interval = setInterval(loadMetrics, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const handleReset = () => {
    if (confirm("Reset tất cả query metrics?")) {
      coinQueryMonitor.reset();
      loadMetrics();
    }
  };

  const handleExport = () => {
    const report = coinQueryMonitor.getReport();
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coin-query-metrics-${Date.now()}.txt`;
    a.click();
  };

  const getPerformanceColor = (avgTime: number) => {
    if (avgTime < 5) return "text-green-600";
    if (avgTime < 20) return "text-blue-600";
    if (avgTime < 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getPerformanceBadge = (avgTime: number) => {
    if (avgTime < 5) return { label: "Excellent", variant: "default" as const };
    if (avgTime < 20) return { label: "Good", variant: "secondary" as const };
    if (avgTime < 50) return { label: "Fair", variant: "outline" as const };
    return { label: "Slow", variant: "destructive" as const };
  };

  if (metrics.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Chưa có query metrics nào được ghi nhận.</p>
          <p className="text-xs mt-1">
            Metrics sẽ xuất hiện sau khi thực hiện các thao tác xu.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              Query Performance Monitor
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Track database query execution times
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
            <Button size="sm" variant="outline" onClick={handleReset}>
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {/* Metrics Cards */}
      <div className="grid gap-4">
        {metrics
          .sort((a, b) => b.count - a.count)
          .map((metric) => {
            const perfBadge = getPerformanceBadge(metric.avgTime);

            return (
              <Card key={metric.name} className="p-4">
                <div className="space-y-3">
                  {/* Query name and badge */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm font-mono">
                        {metric.name}
                      </div>
                    </div>
                    <Badge variant={perfBadge.variant}>{perfBadge.label}</Badge>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        Calls
                      </div>
                      <div className="text-lg font-semibold">
                        {metric.count}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        Avg
                      </div>
                      <div
                        className={`text-lg font-semibold ${getPerformanceColor(metric.avgTime)}`}
                      >
                        {metric.avgTime.toFixed(1)}ms
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Min</div>
                      <div className="text-lg font-semibold text-green-600">
                        {metric.minTime.toFixed(1)}ms
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Max</div>
                      <div className="text-lg font-semibold text-red-600">
                        {metric.maxTime.toFixed(1)}ms
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        P95
                      </div>
                      <div className="text-lg font-semibold">
                        {metric.p95Time.toFixed(1)}ms
                      </div>
                    </div>
                  </div>

                  {/* Performance indicator bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Performance</span>
                      <span>
                        {metric.avgTime < 50
                          ? "✅ Within target"
                          : "⚠️ Needs optimization"}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          metric.avgTime < 5
                            ? "bg-green-600"
                            : metric.avgTime < 20
                              ? "bg-blue-600"
                              : metric.avgTime < 50
                                ? "bg-yellow-600"
                                : "bg-red-600"
                        }`}
                        style={{
                          width: `${Math.min((metric.avgTime / 100) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
      </div>

      {/* Footer note */}
      <Card className="p-3 bg-muted/50">
        <p className="text-xs text-muted-foreground">
          <strong>Note:</strong> Query monitoring chỉ active trong development
          mode. Metrics được track trong memory và reset khi reload page. Target
          performance: Avg &lt; 20ms, P95 &lt; 50ms.
        </p>
      </Card>
    </div>
  );
}
