import { useEffect, useState } from "react";
import { ChevronRight, History, UserRound } from "lucide-react";
import {
  formatStaffActionDateTime,
  getStaffActionCollectionLabel,
  getStaffActionLabel,
  getStaffActionLogChanges,
  type StaffActionLogRecord,
} from "@/lib/staff-log";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function actorName(log: StaffActionLogRecord) {
  return log.expand?.actor?.full_name || log.expand?.actor?.username || "Không xác định";
}

function StaffActionLogDetailDialog({
  log,
  onOpenChange,
}: {
  log: StaffActionLogRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const changes = log ? getStaffActionLogChanges(log) : [];

  return (
    <Dialog open={Boolean(log)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{log ? getStaffActionLabel(log.action) : "Chi tiết chỉnh sửa"}</DialogTitle>
          <DialogDescription>
            {log ? `${formatStaffActionDateTime(log.created)} · ${actorName(log)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {log && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-muted/45 p-2.5">
                <div className="text-[10px] text-muted-foreground">Loại dữ liệu</div>
                <div className="mt-0.5 font-semibold text-foreground">
                  {getStaffActionCollectionLabel(log.target_collection)}
                </div>
              </div>
              <div className="rounded-xl bg-muted/45 p-2.5">
                <div className="text-[10px] text-muted-foreground">Người thao tác</div>
                <div className="mt-0.5 break-words font-semibold text-foreground [overflow-wrap:anywhere]">
                  {actorName(log)}
                </div>
              </div>
            </div>

            {log.note && (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm text-foreground">
                <div className="mb-1 text-[11px] font-medium text-muted-foreground">Nội dung</div>
                <div className="break-words [overflow-wrap:anywhere]">{log.note}</div>
              </div>
            )}

            {changes.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold">Dữ liệu thay đổi</div>
                {changes.map((change) => (
                  <div key={change.field} className="rounded-xl border border-border/60 p-3">
                    <div className="mb-2 text-xs font-semibold text-foreground">{change.label}</div>
                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                      <div className="rounded-lg bg-destructive/5 p-2">
                        <div className="text-[10px] text-muted-foreground">Trước</div>
                        <div className="mt-0.5 break-words text-foreground [overflow-wrap:anywhere]">
                          {change.before}
                        </div>
                      </div>
                      <div className="rounded-lg bg-success/10 p-2">
                        <div className="text-[10px] text-muted-foreground">Sau</div>
                        <div className="mt-0.5 break-words text-foreground [overflow-wrap:anywhere]">
                          {change.after}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : !log.note ? (
              <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
                Bản ghi này chưa có dữ liệu chi tiết trước và sau khi thay đổi.
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StaffActionHistoryPanel({
  workerId,
  logs,
  loading,
  error,
  className,
}: {
  workerId: string;
  logs: StaffActionLogRecord[];
  loading: boolean;
  error: string;
  className?: string;
}) {
  const [selectedLog, setSelectedLog] = useState<StaffActionLogRecord | null>(null);

  useEffect(() => {
    setSelectedLog(null);
  }, [workerId]);

  return (
    <>
      <section
        className={cn(
          "min-w-0 rounded-2xl border border-border/60 bg-card p-3 shadow-soft desktop:max-h-[calc(90dvh-10rem)] desktop:overflow-y-auto desktop:rounded-xl",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Lịch sử chỉnh sửa</span>
          </div>
          {!loading && <span className="text-[11px] text-muted-foreground">{logs.length}</span>}
        </div>

        <div className="mt-3 space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-xl border border-border/50 p-3">
                <div className="h-3 w-2/3 rounded bg-muted" />
                <div className="mt-2 h-2.5 w-full rounded bg-muted/80" />
              </div>
            ))
          ) : error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
              {error}
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 p-3 text-center text-xs text-muted-foreground">
              Chưa có lịch sử chỉnh sửa.
            </div>
          ) : (
            logs.map((log) => (
              <button
                key={log.id}
                type="button"
                onClick={() => setSelectedLog(log)}
                className="flex w-full min-w-0 items-start gap-2 rounded-xl border border-border/60 p-2.5 text-left transition-colors hover:bg-muted/40 active:scale-[0.99]"
                aria-label={`Xem chi tiết ${getStaffActionLabel(log.action)}`}
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <UserRound className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {getStaffActionLabel(log.action)}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {actorName(log)} · {formatStaffActionDateTime(log.created)}
                  </span>
                  <span className="mt-1 block line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {log.note || getStaffActionCollectionLabel(log.target_collection)}
                  </span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      </section>

      <StaffActionLogDetailDialog
        log={selectedLog}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      />
    </>
  );
}
