import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock3, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import {
  fetchEmploymentHistories,
  getLatestEmploymentHistory,
  maskCccd,
  syncLegacyUserWorkFields,
  updateEmploymentHistory,
  type EmploymentHistoryRecord,
} from "@/lib/employment";
import { createStaffActionLog } from "@/lib/staff-log";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string) {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("vi-VN");
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function UserWorkHistoryPanel() {
  const { user, refresh } = useAuth();

  const [loading, setLoading] = useState(true);
  const [histories, setHistories] = useState<EmploymentHistoryRecord[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveDate, setLeaveDate] = useState(todayDate());
  const [leaveNote, setLeaveNote] = useState("");

  const loadAll = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const historyRows = await fetchEmploymentHistories([user.id]);
      setHistories(historyRows);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Không tải được lịch sử đi làm"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const activeHistory = useMemo(
    () => histories.find((item) => item.status === "working" && !item.leave_date) || null,
    [histories],
  );

  const reload = async () => {
    if (!user?.id) return;
    const nextRows = await fetchEmploymentHistories([user.id]);
    setHistories(nextRows);
    await syncLegacyUserWorkFields(user.id, getLatestEmploymentHistory(nextRows));
    await refresh();
  };

  const submitLeave = async () => {
    if (!user?.id || !activeHistory) {
      toast.warning("Bạn chưa có nhà máy đang làm để báo nghỉ");
      return;
    }
    if (!leaveDate) {
      toast.warning("Chọn ngày nghỉ");
      return;
    }

    setSubmitting(true);
    try {
      const before = { ...activeHistory };
      await updateEmploymentHistory(activeHistory.id, {
        leave_date: leaveDate,
        status: "left",
        note: leaveNote.trim(),
      });
      await reload();
      await createStaffActionLog({
        actor: user,
        targetUserId: user.id,
        targetCollection: "employment_histories",
        targetRecord: activeHistory.id,
        action: "report_leave",
        before,
        after: { leave_date: leaveDate, status: "left", note: leaveNote.trim() },
        note: "User tự báo nghỉ",
      });
      setLeaveOpen(false);
      setLeaveNote("");
      setLeaveDate(todayDate());
      toast.success("Đã ghi nhận ngày nghỉ");
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Không thể báo nghỉ"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Trạng thái hiện tại</div>
            <div className="text-[11px] text-muted-foreground">
              {activeHistory
                ? "Đang làm tại " + (activeHistory.expand?.factory?.name || "nhà máy")
                : "Bạn chưa khai báo nhà máy đang làm"}
            </div>
          </div>
          <StatusChip tone={activeHistory ? "success" : "neutral"}>
            {activeHistory ? "Đang làm" : "Đang nghỉ"}
          </StatusChip>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={!activeHistory}
            onClick={() => {
              setLeaveDate(todayDate());
              setLeaveNote("");
              setLeaveOpen(true);
            }}
          >
            <Clock3 className="h-4 w-4" /> Báo nghỉ
          </Button>
        </div>
        {activeHistory && (
          <p className="text-[11px] text-muted-foreground">
            Muốn chuyển nhà máy mới, hãy báo nghỉ nhà máy hiện tại trước rồi liên hệ người tuyển hoặc QLNM.
          </p>
        )}
      </Card>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4" /> Lịch sử đi làm
        </div>

        {loading ? (
          <Card className="p-4 text-sm text-muted-foreground">Đang tải lịch sử...</Card>
        ) : histories.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title="Chưa có lịch sử đi làm"
            description="Liên hệ người tuyển hoặc QLNM để được ghi nhận nhà máy đi làm."
          />
        ) : (
          histories.map((history) => (
            <Card key={history.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {history.expand?.factory?.name || "Nhà máy"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Mã NV: {history.employee_code || "Chưa có"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Họ tên (NM): {history.worker_name_snapshot || "—"} · CCCD:{" "}
                    {maskCccd(history.worker_cccd_snapshot)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Nhà chính: {history.expand?.main_house?.name || "Chưa gán"}
                  </div>
                </div>
                <StatusChip tone={history.status === "working" ? "success" : "neutral"}>
                  {history.status === "working" ? "Đang làm" : "Đã nghỉ"}
                </StatusChip>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl bg-muted/35 p-3">
                  <div className="text-[11px] text-muted-foreground">Ngày vào</div>
                  <div className="mt-1 text-sm font-semibold">{formatDate(history.join_date)}</div>
                </div>
                <div className="rounded-2xl bg-muted/35 p-3">
                  <div className="text-[11px] text-muted-foreground">Ngày nghỉ</div>
                  <div className="mt-1 text-sm font-semibold">{formatDate(history.leave_date)}</div>
                </div>
              </div>
              {history.note && (
                <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                  {history.note}
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Báo nghỉ</DialogTitle>
            <DialogDescription>
              Ghi nhận ngày nghỉ tại {activeHistory?.expand?.factory?.name || "nhà máy hiện tại"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Ngày nghỉ</Label>
              <Input
                type="date"
                value={leaveDate}
                onChange={(e) => setLeaveDate(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                rows={3}
                value={leaveNote}
                onChange={(e) => setLeaveNote(e.target.value)}
                className="rounded-xl"
                placeholder="Ví dụ: nghỉ việc, chuyển nhà máy..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setLeaveOpen(false)}>
              Đóng
            </Button>
            <Button className="rounded-xl" onClick={submitLeave} disabled={submitting}>
              Xác nhận nghỉ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
