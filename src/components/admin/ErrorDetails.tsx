import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ChevronDown,
  Download,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { CoinOperationError } from "@/lib/errors/coin-errors";

interface ErrorDetailsProps {
  error: CoinOperationError;
  context?: any;
  onRetry?: () => void;
}

export function ErrorDetails({ error, context, onRetry }: ErrorDetailsProps) {
  const [showDetails, setShowDetails] = useState(false);

  const getVariant = () => {
    if (error.retryable) return "default";
    return "destructive";
  };

  const getIcon = () => {
    if (error.retryable) return AlertCircle;
    return XCircle;
  };

  const Icon = getIcon();

  return (
    <div className="space-y-2">
      {/* User-friendly message */}
      <Alert variant={getVariant()}>
        <Icon className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          {error.retryable ? "Lỗi tạm thời" : "Lỗi thao tác"}
          <Badge variant={error.retryable ? "secondary" : "destructive"}>
            {error.code}
          </Badge>
        </AlertTitle>
        <AlertDescription className="mt-2">
          {error.userMessage || error.message}
        </AlertDescription>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3">
          {error.retryable && onRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              className="gap-2"
            >
              <RefreshCw className="h-3 w-3" />
              Thử lại
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowDetails(!showDetails)}
            className="gap-2"
          >
            {showDetails ? "Ẩn" : "Xem"} chi tiết kỹ thuật
            <ChevronDown
              className={`h-3 w-3 transition-transform ${
                showDetails ? "rotate-180" : ""
              }`}
            />
          </Button>
        </div>
      </Alert>

      {/* Technical details (collapsible) */}
      {showDetails && (
        <Card className="p-4 bg-muted">
          <div className="space-y-3 text-xs font-mono">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-muted-foreground">Error Code:</span>{" "}
                <span className="font-semibold">{error.code}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Retryable:</span>{" "}
                <Badge variant={error.retryable ? "default" : "secondary"}>
                  {error.retryable ? "Yes" : "No"}
                </Badge>
              </div>
            </div>

            {error.details && (
              <div>
                <div className="text-muted-foreground mb-1">Details:</div>
                <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
                  {JSON.stringify(error.details, null, 2)}
                </pre>
              </div>
            )}

            {context && (
              <div>
                <div className="text-muted-foreground mb-1">Context:</div>
                <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
                  {JSON.stringify(context, null, 2)}
                </pre>
              </div>
            )}

            {error.stack && (
              <div>
                <div className="text-muted-foreground mb-1">Stack Trace:</div>
                <pre className="text-xs bg-background p-2 rounded overflow-x-auto max-h-40">
                  {error.stack}
                </pre>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2 gap-2"
              onClick={() => {
                const data = {
                  error: {
                    code: error.code,
                    message: error.message,
                    userMessage: error.userMessage,
                    details: error.details,
                    stack: error.stack,
                  },
                  context,
                  timestamp: new Date().toISOString(),
                };

                const blob = new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `error-report-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-3 w-3" />
              Tải error report
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * Error List Component
 * Hiển thị danh sách errors với summary
 */
interface ErrorListProps {
  errors: Array<{
    id: string;
    error: CoinOperationError;
    context?: any;
    timestamp: Date;
  }>;
  onDismiss?: (id: string) => void;
  onRetry?: (id: string) => void;
}

export function ErrorList({ errors, onDismiss, onRetry }: ErrorListProps) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Recent Errors ({errors.length})
        </h3>
        {onDismiss && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => errors.forEach((e) => onDismiss(e.id))}
          >
            Clear All
          </Button>
        )}
      </div>

      {errors.map((item) => (
        <div key={item.id} className="relative">
          <ErrorDetails
            error={item.error}
            context={item.context}
            onRetry={onRetry ? () => onRetry(item.id) : undefined}
          />

          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
            <span>{item.timestamp.toLocaleString()}</span>
            {onDismiss && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDismiss(item.id)}
                className="h-6 px-2"
              >
                Dismiss
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
