import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { UserRecord } from "@/lib/pocketbase";
import type { EmploymentHistoryRecord } from "@/lib/employment";
import { createSalaryHold, createSalaryHoldPayload, hasCompleteBank } from "@/lib/salary-holds";
import { createStaffActionLog } from "@/lib/staff-log";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money";

export function SalaryHoldCreateDialog({ open, onOpenChange, viewer, worker, history, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewer: UserRecord;
  worker: UserRecord | null;
  history: EmploymentHistoryRecord | null;
  onCreated?: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [content, setContent] = useState("");
  const [showBank, setShowBank] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!open) { setAmount(""); setContent(""); setShowBank(false); } }, [open]);

  const submit = async () => {
    if (!worker || !history) return;
    const number = parseMoneyInput(amount);
    if (!number) return toast.warning("Nhập số tiền giữ lương");
    if (!content.trim()) return toast.warning("Nhập nội dung giữ lương");
    if (!hasCompleteBank(viewer)) return toast.error("Staff cần cập nhật đầy đủ STK trước khi tạo yêu cầu");
    if (history.recruiter_staff !== viewer.id) return toast.error("Bạn không phải người tuyển trong lịch sử gần nhất");
    setSaving(true);
    try {
      const payload = createSalaryHoldPayload(viewer, worker, history, number, content);
      const created = await createSalaryHold(payload);
      await createStaffActionLog({ actor: viewer, targetUserId: worker.id, targetCollection: "salary_holds", targetRecord: created.id, action: "create", after: payload, note: "Staff tạo yêu cầu giữ lương" });
      toast.success("Đã gửi yêu cầu giữ lương");
      onOpenChange(false);
      onCreated?.();
    } catch (error: any) { toast.error(error?.message || "Không tạo được yêu cầu giữ lương"); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={(value) => !saving && onOpenChange(value)}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
      <DialogHeader><DialogTitle>Tạo yêu cầu Giữ lương</DialogTitle><DialogDescription>Yêu cầu sẽ được chuyển đến Admin tiếp nhận.</DialogDescription></DialogHeader>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="rounded-xl border bg-muted/30 p-3 text-sm"><div className="font-semibold">{history?.worker_name_snapshot || worker?.full_name || "—"}</div><div className="text-muted-foreground">{history?.expand?.factory?.name || "Chưa có lịch sử đi làm"}</div></div>
        <div className="space-y-1"><Label>Số tiền</Label><Input inputMode="numeric" value={formatMoneyInput(amount)} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} placeholder="Nhập số tiền" /></div>
        <div className="space-y-1"><Label>Nội dung</Label><Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Nhập nội dung giữ lương" rows={3} /></div>
        <button type="button" onClick={() => setShowBank((v) => !v)} className="w-full rounded-xl border p-3 text-left text-sm"><div className="font-medium">STK Staff nhận tiền</div><div className="text-xs text-muted-foreground">{showBank ? "Bấm để thu gọn" : "Bấm để xem chi tiết"}</div>{showBank && <div className="mt-2 border-t pt-2 text-xs"><div>{viewer.bank_name || "Chưa có ngân hàng"}</div><div>{viewer.bank_account_number || "Chưa có số TK"}</div><div>{viewer.bank_account_name || "Chưa có tên TK"}</div></div>}</button>
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button><Button type="submit" disabled={saving}>{saving ? "Đang gửi..." : "Gửi yêu cầu"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
