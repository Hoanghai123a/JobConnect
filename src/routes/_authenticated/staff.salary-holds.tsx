import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Check, Clock, Plus, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusChip } from "@/components/ui/status-chip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { fetchStaffWorkspace, type StaffWorkerRecord } from "@/lib/staff-permissions";
import { SalaryHoldCreateDialog } from "@/components/staff/SalaryHoldCreateDialog";
import { SALARY_HOLD_STATUS, buildSalaryHoldTransferDescription, type SalaryHoldRecord, type SalaryHoldStatus } from "@/lib/salary-holds";
import { createStaffActionLog } from "@/lib/staff-log";
import { buildVietQrUrl } from "@/lib/vn-banks";
import { fetchFactories, type FactoryRecord } from "@/lib/factories";

export const Route = createFileRoute("/_authenticated/staff/salary-holds")({ component: SalaryHoldsPage });
const QR_TEMPLATE_KEY = "jobconnect.salaryHoldTransferDescriptionTemplate";
const DEFAULT_QR_TEMPLATE = "Giải ngân giữ lương + tên";
type Tab = SalaryHoldStatus | "all";

function SalaryHoldsPage() {
  const { user, isAdmin } = useAuth();
  const viewer = user as UserRecord;
  const [rows, setRows] = useState<SalaryHoldRecord[]>([]);
  const [workers, setWorkers] = useState<StaffWorkerRecord[]>([]);
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [tab, setTab] = useState<Tab>(isAdmin ? "received" : "received");
  const [search, setSearch] = useState("");
  const [factoryIds, setFactoryIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<SalaryHoldRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [qrTemplate, setQrTemplate] = useState(DEFAULT_QR_TEMPLATE);

  const load = useCallback(async () => {
    if (!viewer?.id) return;
    setLoading(true);
    try {
      const filter = isAdmin ? "" : `staff=\"${viewer.id}\"`;
      const result = await pb.collection("salary_holds").getList<SalaryHoldRecord>(1, 500, { filter, sort: "-created", expand: "worker,staff" });
      setRows(result.items);
    } catch (error: any) { toast.error(error?.message || "Không tải được danh sách giữ lương"); }
    finally { setLoading(false); }
  }, [isAdmin, viewer?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    try { setQrTemplate(localStorage.getItem(QR_TEMPLATE_KEY) || DEFAULT_QR_TEMPLATE); } catch {}
    if (isAdmin) fetchFactories().then(setFactories).catch(() => {});
    else fetchStaffWorkspace(viewer).then((workspace) => setWorkers(workspace.workers.filter((worker) => worker.latestHistory?.recruiter_staff === viewer.id))).catch(() => {});
  }, [isAdmin, viewer?.id]);

  const filtered = useMemo(() => rows.filter((row) => {
    if (tab !== "all" && row.status !== tab) return false;
    if (search.trim() && !row.worker_name.toLocaleLowerCase("vi").includes(search.trim().toLocaleLowerCase("vi"))) return false;
    if (factoryIds.size && !factoryIds.has(row.factory)) return false;
    return true;
  }), [factoryIds, rows, search, tab]);
  const selectedWorker = workers.find((worker) => worker.user.id === selectedWorkerId) || null;
  const receivedRows = filtered.filter((row) => row.status === "received");

  const updateStatus = async (row: SalaryHoldRecord, status: SalaryHoldStatus) => {
    if (status === "cancelled" && (row.status !== "received" || row.staff !== viewer.id)) return toast.error("Không thể hủy yêu cầu này");
    if (["approved", "rejected"].includes(status) && (!isAdmin || row.status !== "received")) return toast.error("Yêu cầu không còn ở trạng thái tiếp nhận");
    if (status === "disbursed" && (!isAdmin || row.status !== "approved")) return toast.error("Chỉ giải ngân yêu cầu đã duyệt");
    const now = new Date().toISOString();
    const payload: Partial<SalaryHoldRecord> = { status };
    if (status === "approved") Object.assign(payload, { approved_by: viewer.id, approved_at: now });
    if (status === "rejected") Object.assign(payload, { rejected_by: viewer.id, rejected_at: now });
    if (status === "disbursed") Object.assign(payload, { disbursed_by: viewer.id, disbursed_at: now });
    if (status === "cancelled") Object.assign(payload, { cancelled_at: now });
    await pb.collection("salary_holds").update(row.id, payload);
    await createStaffActionLog({ actor: viewer, targetUserId: row.worker, targetCollection: "salary_holds", targetRecord: row.id, action: "update", before: { status: row.status }, after: payload, note: `Chuyển trạng thái giữ lương sang ${status}` });
    toast.success("Đã cập nhật yêu cầu"); setDetail(null); await load();
  };

  const bulkApprove = async () => {
    const targets = receivedRows.filter((row) => selectedIds.has(row.id));
    for (const row of targets) await updateStatus(row, "approved");
    setSelectedIds(new Set());
  };

  const counts = useMemo(() => rows.reduce<Record<SalaryHoldStatus, number>>((a, r) => ({ ...a, [r.status]: a[r.status] + 1 }), { received: 0, approved: 0, disbursed: 0, rejected: 0, cancelled: 0 }), [rows]);
  const tabs: Array<[Tab, string]> = isAdmin
    ? [["received", "Tiếp nhận"], ["approved", "Đã duyệt"], ["disbursed", "Đã giải ngân"], ["rejected", "Từ chối"], ["cancelled", "Đã hủy"], ["all", "Tất cả"]]
    : [["received", "Đã tạo"], ["approved", "Đã duyệt"], ["disbursed", "Đã giải ngân"], ["rejected", "Từ chối"], ["cancelled", "Đã hủy"]];

  return <PageContainer title="Giữ lương" subtitle={isAdmin ? "Tiếp nhận và giải ngân yêu cầu của Staff" : "Tạo và theo dõi yêu cầu giữ lương"}>
    {!isAdmin && <div className="flex justify-end"><Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Tạo mới</Button></div>}
    <div className="flex gap-2 overflow-x-auto pb-1">{tabs.map(([key, label]) => <button key={key} onClick={() => { setTab(key); setSelectedIds(new Set()); }} className={`shrink-0 rounded-full px-3 py-2 text-xs font-medium ${tab === key ? "bg-primary text-primary-foreground" : "border bg-card"}`}>{label}{key !== "all" ? ` (${counts[key]})` : ""}</button>)}</div>
    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo họ tên NLĐ" />
    {isAdmin && <details className="rounded-xl border bg-card p-3"><summary className="cursor-pointer text-sm font-medium">Lọc công ty ({factoryIds.size || "Tất cả"})</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{factories.map((factory) => <label key={factory.id} className="flex items-center gap-2 text-sm"><Checkbox checked={factoryIds.has(factory.id)} onCheckedChange={(checked) => setFactoryIds((old) => { const next = new Set(old); checked ? next.add(factory.id) : next.delete(factory.id); return next; })} />{factory.name}</label>)}</div></details>}
    {isAdmin && tab === "received" && receivedRows.length > 0 && <div className="sticky top-2 z-10 flex items-center justify-between rounded-xl border bg-background/95 p-2 shadow-sm"><label className="flex items-center gap-2 text-sm"><Checkbox checked={receivedRows.every((row) => selectedIds.has(row.id))} onCheckedChange={(checked) => setSelectedIds(checked ? new Set(receivedRows.map((r) => r.id)) : new Set())} />Chọn tất cả</label><Button size="sm" disabled={!selectedIds.size} onClick={bulkApprove}><Check className="mr-1 h-4 w-4" />Duyệt ({selectedIds.size})</Button></div>}
    <div className="space-y-2">{loading ? <div className="p-4 text-center text-sm text-muted-foreground">Đang tải...</div> : filtered.map((row) => <Card key={row.id} onClick={() => setDetail(row)} className="cursor-pointer p-3 shadow-soft"><div className="flex items-start gap-3">{isAdmin && row.status === "received" && <Checkbox checked={selectedIds.has(row.id)} onClick={(e) => e.stopPropagation()} onCheckedChange={(checked) => setSelectedIds((old) => { const next = new Set(old); checked ? next.add(row.id) : next.delete(row.id); return next; })} />}<div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><div className="font-semibold">{row.worker_name}</div><StatusChip tone={SALARY_HOLD_STATUS[row.status].tone}>{SALARY_HOLD_STATUS[row.status].label}</StatusChip></div><div className="mt-1 text-sm text-muted-foreground">{row.company_name}</div><div className="mt-2 text-lg font-bold text-primary">{Number(row.amount).toLocaleString("vi-VN")} đ</div><div className="line-clamp-2 text-xs text-muted-foreground">{row.content}</div></div></div></Card>)}</div>

    {!isAdmin && <Dialog open={createOpen && !selectedWorker} onOpenChange={setCreateOpen}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle>Chọn NLĐ</DialogTitle><DialogDescription>Chỉ hiển thị NLĐ có lịch sử gần nhất do bạn tuyển.</DialogDescription></DialogHeader><div className="max-h-72 space-y-2 overflow-y-auto">{workers.map((worker) => <button key={worker.user.id} onClick={() => setSelectedWorkerId(worker.user.id)} className="w-full rounded-xl border p-3 text-left"><div className="font-medium">{worker.latestHistory?.worker_name_snapshot || worker.user.full_name}</div><div className="text-xs text-muted-foreground">{worker.latestHistory?.expand?.factory?.name || worker.user.company}</div></button>)}</div></DialogContent></Dialog>}
    {!isAdmin && selectedWorker && <SalaryHoldCreateDialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setSelectedWorkerId(""); }} viewer={viewer} worker={selectedWorker.user} history={selectedWorker.latestHistory} onCreated={load} />}
    <SalaryHoldDetailDialog row={detail} onClose={() => setDetail(null)} isAdmin={isAdmin} viewer={viewer} qrTemplate={qrTemplate} setQrTemplate={(value) => { setQrTemplate(value); try { localStorage.setItem(QR_TEMPLATE_KEY, value); } catch {} }} onStatus={updateStatus} />
  </PageContainer>;
}

function SalaryHoldDetailDialog({ row, onClose, isAdmin, viewer, qrTemplate, setQrTemplate, onStatus }: { row: SalaryHoldRecord | null; onClose: () => void; isAdmin: boolean; viewer: UserRecord; qrTemplate: string; setQrTemplate: (v: string) => void; onStatus: (row: SalaryHoldRecord, status: SalaryHoldStatus) => Promise<void> }) {
  if (!row) return null;
  const qrUrl = row.status === "approved" ? buildVietQrUrl({ bankName: row.staff_bank_name, accountNumber: row.staff_bank_account_number, accountName: row.staff_bank_account_name, amount: row.amount, description: buildSalaryHoldTransferDescription(qrTemplate, row.worker_name) }) : null;
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-lg"><DialogHeader><DialogTitle>{row.worker_name}</DialogTitle><DialogDescription>{row.company_name} · {Number(row.amount).toLocaleString("vi-VN")} đ</DialogDescription></DialogHeader><div className="space-y-3"><StatusChip tone={SALARY_HOLD_STATUS[row.status].tone}>{SALARY_HOLD_STATUS[row.status].label}</StatusChip><div className="rounded-xl bg-muted/30 p-3 text-sm">{row.content}</div><details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-medium">STK Staff nhận tiền</summary><div className="mt-2 text-sm"><div>{row.staff_bank_name}</div><div>{row.staff_bank_account_number}</div><div>{row.staff_bank_account_name}</div></div></details>{isAdmin && row.status === "approved" && <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3"><Label>Nội dung chuyển khoản</Label><Input value={qrTemplate} onChange={(e) => setQrTemplate(e.target.value)} /><div className="text-[11px] text-muted-foreground">Dùng + tên để tự lấy họ tên NLĐ.</div>{qrUrl ? <div className="flex flex-col items-center gap-2"><div className="flex items-center gap-1 text-xs font-semibold text-primary"><QrCode className="h-4 w-4" />Mã QR chuyển khoản</div><img src={qrUrl} alt="QR giải ngân giữ lương" className="h-52 w-52 rounded-lg" /><div className="text-xs text-muted-foreground">Quét mã để chuyển {Number(row.amount).toLocaleString("vi-VN")} đ</div></div> : <div className="text-sm text-destructive">Không tạo được QR do ngân hàng hoặc STK không hợp lệ.</div>}</div>}</div><DialogFooter className="gap-2">{!isAdmin && row.staff === viewer.id && row.status === "received" && <Button variant="destructive" onClick={() => onStatus(row, "cancelled")}><X className="mr-1 h-4 w-4" />Hủy yêu cầu</Button>}{isAdmin && row.status === "received" && <><Button variant="destructive" onClick={() => onStatus(row, "rejected")}>Từ chối</Button><Button onClick={() => onStatus(row, "approved")}><Check className="mr-1 h-4 w-4" />Duyệt</Button></>}{isAdmin && row.status === "approved" && <Button disabled={!qrUrl} onClick={() => onStatus(row, "disbursed")}><Banknote className="mr-1 h-4 w-4" />Xác nhận đã giải ngân</Button>}<Button variant="outline" onClick={onClose}>Đóng</Button></DialogFooter></DialogContent></Dialog>;
}
