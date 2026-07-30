import { useEffect, useState } from "react";
import { Archive, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  exportCccdHistoryArchive,
  prepareCccdHistoryExport,
  type CccdHistoryExportMode,
  type CccdHistoryExportProgress,
  type CccdHistoryPreparation,
} from "@/lib/cccd-history-export";
import type { EmploymentHistoryRecord } from "@/lib/employment";
import type { FactoryRecord } from "@/lib/factories";
import type { UserRecord } from "@/lib/pocketbase";

export function CccdHistoryExportDialog({
  open,
  onClose,
  histories,
  users,
  factories,
}: {
  open: boolean;
  onClose: () => void;
  histories: EmploymentHistoryRecord[];
  users: UserRecord[];
  factories: FactoryRecord[];
}) {
  const [mode, setMode] = useState<CccdHistoryExportMode>("folders");
  const [preparing, setPreparing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preparation, setPreparation] = useState<CccdHistoryPreparation | null>(null);
  const [progressState, setProgressState] = useState<CccdHistoryExportProgress>({
    completed: 0,
    total: 0,
    message: "",
  });
  const busy = preparing || exporting;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setMode("folders");
    setPreparation(null);
    setPreparing(true);
    setProgressState({ completed: 0, total: 0, message: "Đang đọc dữ liệu CCCD..." });
    prepareCccdHistoryExport(histories, users, factories)
      .then((result) => {
        if (alive) setPreparation(result);
      })
      .catch((error: unknown) => {
        if (alive) {
          toast.error(error instanceof Error ? error.message : "Không đọc được dữ liệu CCCD");
        }
      })
      .finally(() => {
        if (alive) setPreparing(false);
      });
    return () => {
      alive = false;
    };
  }, [open, histories, users, factories]);

  const startExport = async () => {
    if (!preparation || busy) return;
    if (!preparation.stats.full && !preparation.stats.partial) {
      toast.warning("Không có ảnh CCCD phù hợp để xuất");
      return;
    }

    setExporting(true);
    setProgressState({ completed: 0, total: 0, message: "Đang chuẩn bị xuất..." });
    try {
      const result = await exportCccdHistoryArchive(mode, preparation, setProgressState);
      toast.success(
        `Đã xuất ${result.exported} lịch sử (${result.full} Đủ 2 mặt, ${result.partial} thiếu 1 mặt).`,
      );
      if (result.missing || result.failedImages) {
        toast.warning(
          `Bỏ qua ${result.missing} lịch sử không có ảnh và ${result.failedImages} ảnh tải lỗi.`,
        );
      }
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Lỗi xuất ảnh CCCD");
    } finally {
      setExporting(false);
    }
  };

  const progressValue =
    progressState.total > 0
      ? Math.min(100, Math.round((progressState.completed / progressState.total) * 100))
      : exporting
        ? 8
        : 0;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !busy && onClose()}>
      <DialogContent className="max-w-lg rounded-2xl p-4 sm:p-5">
        <DialogHeader>
          <DialogTitle>Xuất ảnh CCCD theo lịch sử đi làm</DialogTitle>
          <DialogDescription>
            Dữ liệu lấy theo bộ lọc Nhà máy và Trạng thái đang chọn trên trang này.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ExportStat label="Lịch sử" value={preparation?.stats.total ?? histories.length} />
            <ExportStat label="Đủ 2 mặt" value={preparation?.stats.full ?? "—"} tone="success" />
            <ExportStat
              label="Thiếu 1 mặt"
              value={preparation?.stats.partial ?? "—"}
              tone="warning"
            />
            <ExportStat
              label="Không có ảnh"
              value={preparation?.stats.missing ?? "—"}
              tone="danger"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <ExportModeButton
              active={mode === "folders"}
              icon={Archive}
              title="Thư mục ảnh"
              description="ZIP nhóm Nhà máy → ngày vào"
              onClick={() => setMode("folders")}
              disabled={busy}
            />
            <ExportModeButton
              active={mode === "word"}
              icon={FileText}
              title="File Word"
              description="Mỗi nhà máy một file Word"
              onClick={() => setMode("word")}
              disabled={busy}
            />
          </div>

          {busy && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{progressState.message || "Đang xử lý..."}</span>
              </div>
              <Progress value={progressValue} />
              {progressState.total > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  {progressState.completed}/{progressState.total} ảnh
                </div>
              )}
            </div>
          )}

          {!busy && preparation && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              {mode === "folders"
                ? "Ảnh sẽ được tải trong một ZIP, chia theo tên nhà máy rồi đến ngày vào làm."
                : "Mỗi NLĐ một trang A4 dọc; ảnh mặt trước rồi mặt sau, rộng 3 inch và giữ nguyên tỷ lệ."}
            </div>
          )}

          <Button
            type="button"
            className="w-full rounded-xl"
            onClick={startExport}
            disabled={
              busy || !preparation || !(preparation.stats.full || preparation.stats.partial)
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy
              ? "Đang xuất..."
              : mode === "folders"
                ? "Tạo ZIP thư mục ảnh"
                : "Tạo ZIP file Word"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExportStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-destructive",
  }[tone];
  return (
    <div className="rounded-xl border border-border/60 bg-card p-2.5 text-center">
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ExportModeButton({
  active,
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-20 items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border/60 bg-card hover:bg-muted/40"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold">{title}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}
