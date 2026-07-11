import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, FileDown } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportToExcel, formatDateOnly } from "@/lib/excel";
import { fetchFactories } from "@/lib/factories";
import { fetchCachedStaffWorkspace, fetchFreshStaffWorkspace } from "@/lib/staff-permissions";
import { useAuth } from "@/lib/auth";
import type { FactoryRecord } from "@/lib/factories";
import type { StaffWorkerRecord } from "@/lib/staff-permissions";
import type { EmploymentHistoryRecord } from "@/lib/employment";
import type { UserRecord } from "@/lib/pocketbase";
import { toast } from "sonner";

function computeTenureDays(histories: EmploymentHistoryRecord[], referenceDate = new Date()) {
  const refTime = referenceDate.getTime();
  let totalMs = 0;
  for (const h of histories) {
    if (!h.join_date) continue;
    const joinTime = new Date(h.join_date).getTime();
    if (Number.isNaN(joinTime)) continue;
    const endSource = h.leave_date && new Date(h.leave_date).getTime();
    const endTime = endSource && !Number.isNaN(endSource) ? endSource : refTime;
    if (endTime <= joinTime) continue;
    totalMs += endTime - joinTime;
  }
  return Math.floor(totalMs / (1000 * 60 * 60 * 24));
}

function buildTenureDaysByUserId(workers: StaffWorkerRecord[]) {
  const map = new Map<string, number>();
  for (const worker of workers) {
    map.set(worker.user.id, computeTenureDays(worker.histories));
  }
  return map;
}

function buildBasicRows(histories: EmploymentHistoryRecord[], tenureDaysByUserId: Map<string, number>) {
  return histories.map((history, index) => ({
    STT: index + 1,
    "Mã lịch sử": history.uid || "",
    "Mã nhân viên": history.employee_code || "",
    "Họ tên tại nhà máy": history.worker_name_snapshot,
    CCCD: history.worker_cccd_snapshot,
    "Mã số thuế": history.worker_tax_code_snapshot || "",
    "Người tuyển":
      history.expand?.recruiter_staff?.full_name ||
      history.expand?.recruiter_staff?.username ||
      "",
    "Nhà máy": history.expand?.factory?.name || "",
    "Nhà chính": history.expand?.main_house?.name || "",
    "Ngày vào": formatDateOnly(history.join_date),
    "Ngày nghỉ": formatDateOnly(history.leave_date),
    "Trạng thái": history.status === "working" ? "Đang làm" : "Đã nghỉ",
    "Thâm niên tích luỹ (ngày)": tenureDaysByUserId.get(history.user) ?? 0,
    "Tài khoản gốc": history.expand?.user?.full_name || history.expand?.user?.username || "",
    "Số điện thoại": history.expand?.user?.phone || "",
  }));
}

function buildFullRows(histories: EmploymentHistoryRecord[], tenureDaysByUserId: Map<string, number>) {
  return histories.map((history, index) => {
    const u = history.expand?.user;
    return {
      STT: index + 1,
      "Mã tài khoản (UID)": u?.uid || "",
      "Mã lịch sử": history.uid || "",
      "Họ tên gốc": u?.full_name || "",
      "CCCD gốc": u?.cccd || "",
      "Số điện thoại": u?.phone || "",
      "Tên đăng nhập": u?.username || "",
      "Vai trò": u?.role || "",
      "Trạng thái tài khoản": u?.status || "",
      "Mã nhân viên": history.employee_code || "",
      "Nhà máy": history.expand?.factory?.name || "",
      "Nhà chính": history.expand?.main_house?.name || "",
      "Ngày vào": formatDateOnly(history.join_date),
      "Ngày nghỉ": formatDateOnly(history.leave_date),
      "Người tuyển":
        history.expand?.recruiter_staff?.full_name ||
        history.expand?.recruiter_staff?.username ||
        "",
      "Thâm niên tích luỹ (ngày)": tenureDaysByUserId.get(history.user) ?? 0,
      "Họ tên tại nhà máy": history.worker_name_snapshot,
      "CCCD tại nhà máy": history.worker_cccd_snapshot,
      "Mã số thuế": history.worker_tax_code_snapshot || "",
      "Trạng thái lịch sử": history.status === "working" ? "Đang làm" : "Đã nghỉ",
      "Ghi chú": history.note || "",
      "Ngân hàng": u?.bank_name || "",
      "Số tài khoản": u?.bank_account_number || "",
      "Tên chủ tài khoản": u?.bank_account_name || "",
      "Lương cơ bản": u?.lcb ?? "",
      "Chuyên cần": u?.chuyen_can ?? "",
      "Đời sống": u?.doi_song ?? "",
      "Thâm niên": u?.tham_nien ?? "",
    };
  });
}

export const Route = createFileRoute("/_authenticated/staff/export")({
  component: StaffExportPage,
});

function StaffExportPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<StaffWorkerRecord[]>([]);
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [factoryFilter, setFactoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [exportingAll, setExportingAll] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;

    setLoading(true);
    Promise.all([fetchCachedStaffWorkspace(user as UserRecord), fetchFactories()])
      .then(([workspace, factoryRows]) => {
        if (!alive) return;
        setWorkers(workspace?.workers ?? []);
        setFactories(factoryRows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [user?.id]);

  const filteredHistories = useMemo(() => {
    return workers
      .flatMap((worker) => worker.histories)
      .filter((history) => {
        if (factoryFilter !== "all" && history.factory !== factoryFilter) return false;
        if (statusFilter !== "all" && history.status !== statusFilter) return false;
        return true;
      });
  }, [factoryFilter, statusFilter, workers]);

  const tenureDaysByUserId = useMemo(() => {
    return buildTenureDaysByUserId(workers);
  }, [workers]);

  const basicRows = useMemo(() => {
    return buildBasicRows(filteredHistories, tenureDaysByUserId);
  }, [filteredHistories, tenureDaysByUserId]);

  const fullRows = useMemo(() => {
    return buildFullRows(filteredHistories, tenureDaysByUserId);
  }, [filteredHistories, tenureDaysByUserId]);

  const doExportBasic = async () => {
    if (!basicRows.length) {
      toast.warning("Không có dữ liệu để xuất");
      return;
    }
    exportToExcel(`jobconnect_export_co_ban_${Date.now()}`, { "Lao động cơ bản": basicRows });
    toast.success("Đã xuất Excel cơ bản");
  };

  const doExportFull = async () => {
    if (!fullRows.length) {
      toast.warning("Không có dữ liệu để xuất");
      return;
    }
    exportToExcel(`jobconnect_export_day_du_${Date.now()}`, { "Lao động đầy đủ": fullRows });
    toast.success("Đã xuất Excel đầy đủ");
  };

  const doExportAllFromPocketBase = async () => {
    if (!user?.id || exportingAll) return;
    setExportingAll(true);
    try {
      const workspace = await fetchFreshStaffWorkspace(user as UserRecord);
      const histories = workspace.workers.flatMap((worker) => worker.histories);
      const rows = buildFullRows(histories, buildTenureDaysByUserId(workspace.workers));
      if (!rows.length) {
        toast.warning("Không có dữ liệu từ PocketBase để xuất");
        return;
      }
      exportToExcel(`jobconnect_export_tat_ca_pocketbase_${Date.now()}`, {
        "Tất cả lao động": rows,
      });
      toast.success("Đã xuất tất cả dữ liệu từ PocketBase");
    } catch {
      toast.error("Không thể xuất tất cả dữ liệu từ PocketBase");
    } finally {
      setExportingAll(false);
    }
  };

  return (
    <PageContainer title="Xuất dữ liệu" subtitle="Lọc nhanh hồ sơ được phép xem rồi xuất Excel">
      <div className="grid gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
        <div className="space-y-1">
          <Label className="text-xs">Nhà máy</Label>
          <Select value={factoryFilter} onValueChange={setFactoryFilter}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Chọn nhà máy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả nhà máy</SelectItem>
              {factories.map((factory) => (
                <SelectItem key={factory.id} value={factory.id}>
                  {factory.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Trạng thái</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Chọn trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="working">Đang làm</SelectItem>
              <SelectItem value="left">Đã nghỉ</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-2xl bg-muted/40 p-3 text-sm">
          Sẵn sàng xuất <strong>{basicRows.length}</strong> dòng dữ liệu.
          <div className="mt-1 text-[11px] text-muted-foreground">
            Dữ liệu đang xem lấy từ IndexedDB. Nút xuất tất cả sẽ tải trực tiếp từ PocketBase.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button onClick={doExportBasic} variant="outline" className="w-full rounded-xl">
            <FileDown className="h-4 w-4" /> Xuất cơ bản
          </Button>
          <Button onClick={doExportFull} className="w-full rounded-xl">
            <FileDown className="h-4 w-4" /> Xuất đầy đủ
          </Button>
          <Button
            onClick={doExportAllFromPocketBase}
            disabled={exportingAll}
            variant="secondary"
            className="w-full rounded-xl"
          >
            <FileDown className="h-4 w-4" /> {exportingAll ? "Đang xuất..." : "Xuất tất cả"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Bản đầy đủ kèm thông tin cá nhân (mã tài khoản UID, vai trò, CCCD gốc), tài khoản ngân hàng và
          các tham số lương.
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          Đang tải dữ liệu để xuất...
        </div>
      ) : basicRows.length === 0 ? (
        <EmptyState
          icon={Download}
          title="Chưa có dữ liệu phù hợp"
          description="Đổi bộ lọc hoặc chờ admin import thêm lịch sử đi làm."
        />
      ) : (
        <div className="space-y-2">
          {basicRows.slice(0, 12).map((row) => (
            <div
              key={`${row.STT}-${row["Mã nhân viên"]}-${row["Ngày vào"]}`}
              className="list-card border-l-[color:var(--status-info)]"
            >
              <div className="text-sm font-semibold">{row["Họ tên tại nhà máy"]}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {row["Nhà máy"]} · {row["Mã nhân viên"] || "Chưa có mã"} · {row["Trạng thái"]}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
