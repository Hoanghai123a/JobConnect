import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FactoryPicker, UserPicker } from "./UserPicker";
import type { UserRecord } from "@/lib/pocketbase";
import type { FactoryRecord } from "@/lib/factories";
import type { MainHouseRecord } from "@/lib/main-houses";
import {
  createEmploymentHistory,
  fetchEmploymentHistories,
  fetchRegisterableUsers,
  maskCccd,
  syncLegacyUserWorkFields,
  updateEmploymentHistory,
} from "@/lib/employment";
import { createStaffActionLog } from "@/lib/staff-log";

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getPocketBaseFieldErrors(error: unknown) {
  const data =
    typeof error === "object" && error !== null && "data" in error
      ? (error.data as { data?: Record<string, unknown> }).data
      : undefined;
  if (!data) return "";
  return Object.entries(data)
    .map(([field, value]) => {
      const message =
        typeof value === "object" && value !== null && "message" in value
          ? String(value.message)
          : String(value);
      return `${field}: ${message}`;
    })
    .join("; ");
}

export interface RegisterDialogProps {
  open: boolean;
  actor: UserRecord | null;
  onClose: () => void;
  users: UserRecord[];
  factories: FactoryRecord[];
  mainHouses: MainHouseRecord[];
  onCreated: () => void;
  includeLongLeft?: boolean;
  defaultRecruiterId?: string;
  actorRoleLabel?: string;
}

export function RegisterDialog({
  open,
  actor,
  onClose,
  users,
  factories,
  mainHouses,
  onCreated,
  includeLongLeft = false,
  defaultRecruiterId = "",
  actorRoleLabel,
}: RegisterDialogProps) {
  const [userId, setUserId] = useState("");
  const [factoryId, setFactoryId] = useState("");
  const [mainHouseId, setMainHouseId] = useState("");
  const [recruiterId, setRecruiterId] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [workerCccd, setWorkerCccd] = useState("");
  const [workerTaxCode, setWorkerTaxCode] = useState("");
  const [joinDate, setJoinDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [candidateUsers, setCandidateUsers] = useState<UserRecord[]>([]);

  const staffUsers = useMemo(() => users.filter((u) => u.role === "staff"), [users]);
  const selectedUser = candidateUsers.find((u) => u.id === userId);
  const roleLabel = actorRoleLabel || (actor?.role === "admin" ? "Quản trị viên" : "Nhân sự");

  const reset = () => {
    setUserId("");
    setFactoryId("");
    setMainHouseId("");
    setRecruiterId(defaultRecruiterId);
    setEmployeeCode("");
    setWorkerName("");
    setWorkerCccd("");
    setWorkerTaxCode("");
    setJoinDate(todayIso());
    setNote("");
  };

  useEffect(() => {
    if (!open) reset();
  }, [open, defaultRecruiterId]);

  useEffect(() => {
    if (!open) return;
    fetchRegisterableUsers({ includeLongLeft })
      .then(setCandidateUsers)
      .catch(() => setCandidateUsers([]));
  }, [open, includeLongLeft]);

  useEffect(() => {
    if (!selectedUser) return;
    setWorkerName((cur) => cur || selectedUser.full_name || selectedUser.username || "");
    setWorkerCccd((cur) => cur || selectedUser.cccd || "");
  }, [selectedUser]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return toast.error("Chọn người lao động");
    if (!factoryId) return toast.error("Chọn nhà máy");
    if (!joinDate) return toast.error("Nhập ngày vào làm");
    if (!recruiterId) return toast.error("Chọn người tuyển");
    if (!mainHouseId) return toast.error("Chọn nhà chính");
    if (!selectedUser) return;

    const workerCccdDigits = workerCccd.replace(/\D/g, "");
    if (workerCccd && workerCccdDigits.length !== 12) {
      return toast.error("CCCD phải có đúng 12 chữ số; có thể thêm ký tự phía sau");
    }

    setSubmitting(true);
    try {
      const latestHistories = await fetchEmploymentHistories([userId]);
      const staleWorkingHistories = latestHistories.filter(
        (history) => history.status === "working" && Boolean(history.leave_date),
      );

      for (const history of staleWorkingHistories) {
        const updated = await updateEmploymentHistory(history.id, { status: "left" });
        await createStaffActionLog({
          actor,
          targetUserId: userId,
          targetCollection: "employment_histories",
          targetRecord: history.id,
          action: "update",
          before: history,
          after: updated,
          note: `${roleLabel} đăng ký đi làm mới: đồng bộ lịch sử đã có ngày nghỉ`,
        });
      }

      const activeHistory = latestHistories.find(
        (history) => history.status === "working" && !history.leave_date,
      );
      if (activeHistory) {
        toast.error(
          "Người lao động này đang có một lịch sử đi làm chưa kết thúc. Hãy cập nhật ngày nghỉ trước khi đăng ký mới.",
        );
        return;
      }

      const created = await createEmploymentHistory({
        user: userId,
        factory: factoryId,
        main_house: mainHouseId,
        employee_code: employeeCode.trim() || undefined,
        worker_name_snapshot:
          workerName.trim() || selectedUser.full_name || selectedUser.username || "",
        worker_cccd_snapshot: workerCccd || selectedUser.cccd || "",
        worker_tax_code_snapshot: workerTaxCode.trim(),
        recruiter_staff: recruiterId,
        join_date: joinDate,
        status: "working",
        note: note.trim() || undefined,
      });
      await syncLegacyUserWorkFields(userId, created);
      await createStaffActionLog({
        actor,
        targetUserId: userId,
        targetCollection: "employment_histories",
        targetRecord: created.id,
        action: "create",
        after: created,
        note: `${roleLabel} đăng ký đi làm`,
      });
      toast.success("Đã đăng ký đi làm");
      onClose();
      onCreated();
    } catch (error: unknown) {
      const fieldErrors = getPocketBaseFieldErrors(error);
      const message = getErrorMessage(error, "Lỗi đăng ký đi làm");
      if (fieldErrors) {
        toast.error(fieldErrors);
      } else if (message.includes("UNIQUE")) {
        toast.error(
          "Người lao động này đã có lịch sử đang đi làm. Hãy cập nhật trạng thái nghỉ trước khi đăng ký mới.",
        );
      } else {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Đăng ký đi làm</DialogTitle>
          <DialogDescription>
            Tạo bản ghi lịch sử đi làm cho người lao động đã có tài khoản.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <UserPicker
            label="Người lao động"
            users={candidateUsers}
            value={userId}
            onChange={setUserId}
            placeholder="Tìm họ tên, SĐT, mã NV..."
          />

          {selectedUser && (
            <div className="rounded-xl border border-dashed bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
              Gợi ý từ tài khoản:{" "}
              <span className="font-medium text-foreground">
                {selectedUser.full_name || selectedUser.username}
              </span>
              {selectedUser.cccd && ` · CCCD ${maskCccd(selectedUser.cccd)}`}
              {selectedUser.phone && ` · ${selectedUser.phone}`}
              <div className="mt-1">
                Có thể sửa họ tên / CCCD bên dưới nếu nhà máy ghi nhận khác.
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Họ tên (theo nhà máy)</Label>
              <Input
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                placeholder="Họ tên ghi nhận"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CCCD (theo nhà máy)</Label>
              <Input
                value={workerCccd}
                onChange={(e) => setWorkerCccd(e.target.value)}
                inputMode="text"
                placeholder="12 số, có thể kèm ký tự"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Mã số thuế</Label>
            <Input
              value={workerTaxCode}
              onChange={(e) => setWorkerTaxCode(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="Mã số thuế theo lịch sử đi làm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Nhà máy</Label>
            <FactoryPicker factories={factories} value={factoryId} onChange={setFactoryId} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Nhà chính</Label>
            <Select value={mainHouseId} onValueChange={setMainHouseId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn nhà chính" />
              </SelectTrigger>
              <SelectContent>
                {mainHouses.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Người tuyển</Label>
            <UserPicker
              users={staffUsers}
              value={recruiterId}
              onChange={setRecruiterId}
              placeholder="Chọn nhân sự tuyển"
              allowClear
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Mã NV</Label>
              <Input
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="Tuỳ chọn"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ngày vào làm</Label>
              <DateInput
                value={joinDate}
                onChange={(value) => setJoinDate(value)}
                max={todayIso()}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Ghi chú</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tuỳ chọn"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Huỷ
            </Button>
            <Button type="submit" disabled={submitting}>
              <BriefcaseBusiness className="h-4 w-4" />
              {submitting ? "Đang lưu..." : "Đăng ký"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Re-export for callers that need the pickers directly
export { UserPicker, FactoryPicker };
export type { UserRecord };
