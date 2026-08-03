import { type ChangeEvent, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  downloadBulkWorkerTemplate,
  executePreparedBulkImport,
  exportBulkWorkerErrors,
  prepareBulkWorkerImport,
  type BulkWorkerImportSummary,
  type WorkerImportError,
} from "@/lib/bulk-worker-history-import";
import type { UserRecord } from "@/lib/pocketbase";
import { clearStaffCache } from "@/lib/staff-cache";
import { createStaffActionLog } from "@/lib/staff-log";

type ImportPhase = "idle" | "reading" | "validating" | "importing" | "done" | "error";
type ImportProgress = { total: number; processed: number; created: number; failed: number };

function phaseLabel(phase: ImportPhase) {
  if (phase === "reading") return "Đang đọc file Excel...";
  if (phase === "validating") return "Đang kiểm tra dữ liệu...";
  if (phase === "importing") return "Đang tạo tài khoản và lịch sử...";
  if (phase === "done") return "Đã hoàn tất nhập dữ liệu";
  if (phase === "error") return "Không thể nhập dữ liệu";
  return "Sẵn sàng nhập dữ liệu";
}

function formatDuration(durationMs: number) {
  if (durationMs < 1_000) return `${durationMs} ms`;
  return `${(Math.round(durationMs / 100) / 10).toLocaleString("vi-VN")} giây`;
}

export function BulkWorkerHistoryImportCard({ actor }: { actor: UserRecord }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState<ImportProgress>({
    total: 0,
    processed: 0,
    created: 0,
    failed: 0,
  });
  const [summary, setSummary] = useState<BulkWorkerImportSummary | null>(null);
  const [errors, setErrors] = useState<WorkerImportError[]>([]);
  const [fatalError, setFatalError] = useState("");
  const busy = phase === "reading" || phase === "validating" || phase === "importing";
  const progressValue = progress.total
    ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
    : 0;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && busy) return;
    setOpen(nextOpen);
    if (!nextOpen) setPhase("idle");
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const startedAt = performance.now();
    setSummary(null);
    setErrors([]);
    setFatalError("");
    setProgress({ total: 0, processed: 0, created: 0, failed: 0 });
    setFileName(file.name);
    setOpen(true);
    setPhase("reading");

    try {
      setPhase("validating");
      const prepared = await prepareBulkWorkerImport(file);
      const validationFailed = Math.max(0, prepared.totalWorkers - prepared.workers.length);
      setProgress({
        total: prepared.totalWorkers,
        processed: validationFailed,
        created: 0,
        failed: validationFailed,
      });
      setPhase("importing");

      const executed = await executePreparedBulkImport(
        prepared.workers,
        (processedWorkers, createdWorkers, failedWorkers) => {
          setProgress({
            total: prepared.totalWorkers,
            processed: validationFailed + processedWorkers,
            created: createdWorkers,
            failed: validationFailed + failedWorkers,
          });
        },
      );

      const allErrors = [...prepared.errors, ...executed.errors];
      const createdWorkers = executed.createdWorkers.length;
      const result: BulkWorkerImportSummary = {
        totalWorkers: prepared.totalWorkers,
        createdWorkers,
        failedWorkers: Math.max(0, prepared.totalWorkers - createdWorkers),
        createdHistories: executed.createdHistoryCount,
        durationMs: Math.round(performance.now() - startedAt),
      };

      if (createdWorkers > 0) await clearStaffCache();
      const logPayload = {
        file: file.name,
        total_workers: result.totalWorkers,
        created_workers: result.createdWorkers,
        failed_workers: result.failedWorkers,
        created_histories: result.createdHistories,
        exported_errors: allErrors.length,
      };
      await Promise.all([
        createStaffActionLog({
          actor,
          targetCollection: "users",
          action: "import",
          after: logPayload,
          note: "Admin tạo hàng loạt NLĐ và lịch sử đi làm từ Excel",
        }),
        createStaffActionLog({
          actor,
          targetCollection: "employment_histories",
          action: "import",
          after: logPayload,
          note: "Admin tạo hàng loạt NLĐ và nhiều lịch sử đi làm từ Excel",
        }),
      ]).catch(() => toast.warning("Đã nhập dữ liệu nhưng chưa ghi được đầy đủ nhật ký thao tác"));

      setSummary(result);
      setErrors(allErrors);
      setProgress({
        total: result.totalWorkers,
        processed: result.totalWorkers,
        created: result.createdWorkers,
        failed: result.failedWorkers,
      });
      setPhase("done");

      if (allErrors.length) {
        exportBulkWorkerErrors(allErrors);
        toast.warning(
          `Đã tạo ${result.createdWorkers} NLĐ, ${result.failedWorkers} NLĐ lỗi. Đã xuất file lỗi.`,
        );
      } else {
        toast.success(
          `Đã tạo ${result.createdWorkers} NLĐ và ${result.createdHistories} lịch sử đi làm.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể xử lý file Excel.";
      setFatalError(message);
      setPhase("error");
      toast.error(message);
    }
  };

  return (
    <>
      <Card className="relative overflow-hidden rounded-3xl border-primary/25 bg-gradient-to-br from-primary/10 via-card to-emerald-500/10 p-5 shadow-soft desktop:col-span-2">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative space-y-4">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <UsersRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold">Tạo hàng loạt NLĐ và lịch sử đi làm</div>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                File gồm hai sheet Người lao động và Lịch sử đi làm. Một NLĐ có thể có tối đa 10
                lịch sử; toàn bộ dữ liệu của từng NLĐ được tạo trong cùng một giao dịch.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/70 p-3 text-xs leading-5 text-muted-foreground backdrop-blur">
            Có thể thêm hậu tố chữ a-z, dấu chấm hoặc gạch dưới vào SĐT/CCCD để phân biệt tên đăng
            nhập. Hậu tố không được lưu vào SĐT, CCCD hoặc lịch sử đi làm.
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full sm:w-auto"
              onClick={downloadBulkWorkerTemplate}
              disabled={busy}
            >
              <FileSpreadsheet className="h-4 w-4" /> Tải file mẫu
            </Button>
            <Button
              type="button"
              className="w-full rounded-full sm:w-auto"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? "Đang xử lý..." : "Chọn file Excel"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFile}
              disabled={busy}
            />
          </div>
        </div>
      </Card>

      <BulkWorkerHistoryImportDialog
        open={open}
        onOpenChange={handleOpenChange}
        busy={busy}
        phase={phase}
        fileName={fileName}
        progress={progress}
        progressValue={progressValue}
        summary={summary}
        errors={errors}
        fatalError={fatalError}
      />
    </>
  );
}

type ImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  phase: ImportPhase;
  fileName: string;
  progress: ImportProgress;
  progressValue: number;
  summary: BulkWorkerImportSummary | null;
  errors: WorkerImportError[];
  fatalError: string;
};

function BulkWorkerHistoryImportDialog({
  open,
  onOpenChange,
  busy,
  phase,
  fileName,
  progress,
  progressValue,
  summary,
  errors,
  fatalError,
}: ImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="desktop:max-w-xl"
        onEscapeKeyDown={(event) => busy && event.preventDefault()}
        onInteractOutside={(event) => busy && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Nhập NLĐ và lịch sử đi làm</DialogTitle>
          <DialogDescription>
            {fileName ? `File: ${fileName}` : "Theo dõi tiến độ tạo dữ liệu từ Excel."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : phase === "done" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{phaseLabel(phase)}</div>
              {busy && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Không đóng ứng dụng trong khi đang tạo dữ liệu.
                </div>
              )}
            </div>
          </div>

          {(phase === "importing" || phase === "done") && progress.total > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  Đã xử lý {progress.processed}/{progress.total} NLĐ
                </span>
                <span>{progressValue}%</span>
              </div>
              <Progress value={progressValue} className="h-2.5" />
              <div className="grid grid-cols-2 gap-2 pt-1 text-center text-xs sm:grid-cols-3">
                <ResultStat label="Đã tạo" value={progress.created} tone="success" />
                <ResultStat label="Bị lỗi" value={progress.failed} tone="danger" />
                <ResultStat label="Tổng NLĐ" value={progress.total} tone="neutral" />
              </div>
            </div>
          )}

          {summary && (
            <div className="grid grid-cols-2 gap-2">
              <ResultStat label="NLĐ thành công" value={summary.createdWorkers} tone="success" />
              <ResultStat label="Lịch sử đã tạo" value={summary.createdHistories} tone="success" />
              <ResultStat label="NLĐ thất bại" value={summary.failedWorkers} tone="danger" />
              <ResultStat
                label="Thời gian"
                value={formatDuration(summary.durationMs)}
                tone="neutral"
              />
            </div>
          )}

          {fatalError && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {fatalError}
            </div>
          )}

          {errors.length > 0 && phase === "done" && (
            <div className="space-y-2 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900">
              <div className="text-sm font-semibold">Một số NLĐ chưa được tạo</div>
              <div className="space-y-1 text-xs leading-5">
                {errors.slice(0, 5).map((error, index) => (
                  <div key={`${error.workerKey}-${index}`}>
                    {error.workerKey || "Không rõ mã NLĐ"}: {error.reason}
                  </div>
                ))}
                {errors.length > 5 && (
                  <div>Và {errors.length - 5} lỗi khác trong file Excel lỗi.</div>
                )}
              </div>
            </div>
          )}
        </div>

        {!busy && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
            {errors.length > 0 && (
              <Button type="button" onClick={() => exportBulkWorkerErrors(errors)}>
                <Download className="h-4 w-4" /> Tải lại file lỗi
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResultStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "success" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-border bg-muted/30 text-foreground";
  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <div className="text-lg font-semibold">{value}</div>
      <div className="mt-0.5 text-[11px]">{label}</div>
    </div>
  );
}
