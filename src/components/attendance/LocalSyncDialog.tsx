import { useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  syncLocalDataToPocketBase,
  countLocalAttendanceRows,
  clearLocalAttendanceData,
  type SyncResult,
} from "@/lib/local-sync";
import { readLocalAttendance } from "@/lib/local-attendance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/lib/toast";
import { AlertTriangle, CheckCircle2, AlertCircle, Database } from "lucide-react";

interface LocalSyncDialogProps {
  open: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

type Step = "preview" | "syncing" | "complete";

export function LocalSyncDialog({ open, onClose, onSyncComplete }: LocalSyncDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("preview");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<SyncResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const rowCount = countLocalAttendanceRows();
  const localState = readLocalAttendance();

  const handleSync = async () => {
    if (!user?.id) {
      toast.error("Không tìm thấy thông tin người dùng");
      return;
    }

    setStep("syncing");
    setProgress({ current: 0, total: rowCount });

    try {
      const syncResult = await syncLocalDataToPocketBase(user.id, (current, total) => {
        setProgress({ current, total });
      });

      setResult(syncResult);
      setStep("complete");

      if (syncResult.success > 0) {
        clearLocalAttendanceData();
        onSyncComplete?.();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Đồng bộ thất bại");
      setStep("preview");
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const handleComplete = () => {
    onClose();
  };

  const progressPercent =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={step !== "syncing" ? onClose : undefined}>
      <DialogContent className={step === "syncing" ? "pointer-events-none" : ""}>
        {step === "preview" && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <DialogTitle className="text-center">
                Phát hiện {rowCount} ngày công chưa đồng bộ
              </DialogTitle>
              <DialogDescription className="text-center">
                Dữ liệu bảng công của bạn đang lưu trên máy. Đồng bộ lên hệ thống để sao lưu an
                toàn.
              </DialogDescription>
            </DialogHeader>

            {localState.profile && (
              <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                <div className="font-medium">Hồ sơ: {localState.profile.display_name}</div>
                <div className="mt-1 text-muted-foreground">
                  LCB: {localState.profile.lcb.toLocaleString()} • Chuyên cần:{" "}
                  {localState.profile.chuyen_can.toLocaleString()}
                </div>
              </div>
            )}

            {showDetails && (
              <div className="max-h-40 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-xs">
                <div className="font-medium mb-1">Danh sách ngày công:</div>
                {localState.rows.slice(0, 10).map((row) => (
                  <div key={row.id} className="text-muted-foreground">
                    {row.date} - {row.shift === "day" ? "Ca ngày" : "Ca đêm"} (HC: {row.hc_hours}h,
                    OT: {row.ot_hours}h)
                  </div>
                ))}
                {localState.rows.length > 10 && (
                  <div className="text-muted-foreground mt-1">
                    ... và {localState.rows.length - 10} ngày khác
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="ghost" onClick={() => setShowDetails(!showDetails)} className="w-full sm:w-auto">
                {showDetails ? "Ẩn chi tiết" : "Xem chi tiết"}
              </Button>
              <div className="flex gap-2 flex-1">
                <Button variant="outline" onClick={handleSkip} className="flex-1">
                  Bỏ qua
                </Button>
                <Button onClick={handleSync} className="flex-1">
                  Đồng bộ ngay
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {step === "syncing" && (
          <>
            <DialogHeader>
              <DialogTitle className="text-center">Đang đồng bộ...</DialogTitle>
              <DialogDescription className="text-center">
                {progress.current}/{progress.total} ngày công
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Progress value={progressPercent} className="h-2" />
              <div className="text-center text-sm text-muted-foreground">{progressPercent}%</div>
            </div>
          </>
        )}

        {step === "complete" && result && (
          <>
            <DialogHeader>
              <div
                className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full ${
                  result.failed > 0
                    ? "bg-yellow-100 dark:bg-yellow-900"
                    : "bg-green-100 dark:bg-green-900"
                }`}
              >
                {result.failed > 0 ? (
                  <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                ) : (
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                )}
              </div>
              <DialogTitle className="text-center">
                {result.failed > 0 ? "Đồng bộ một phần" : "Đồng bộ thành công"}
              </DialogTitle>
              <DialogDescription className="text-center space-y-1">
                <div>Đã đồng bộ {result.success} ngày công</div>
                {result.skipped > 0 && (
                  <div className="text-muted-foreground text-xs">
                    Bỏ qua {result.skipped} ngày (đã tồn tại trên hệ thống)
                  </div>
                )}
                {result.failed > 0 && (
                  <div className="text-yellow-600 dark:text-yellow-400 text-xs">
                    {result.failed} ngày thất bại
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>

            {result.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs dark:border-yellow-800 dark:bg-yellow-950">
                <div className="font-medium mb-1">Chi tiết lỗi:</div>
                {result.errors.map((err, idx) => (
                  <div key={idx} className="text-yellow-700 dark:text-yellow-300">
                    {err}
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button onClick={handleComplete} className="w-full">
                Hoàn tất
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
