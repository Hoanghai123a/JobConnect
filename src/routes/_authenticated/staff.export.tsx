import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, FileDown, ImageDown } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { CccdHistoryExportDialog } from "@/components/cccd/CccdHistoryExportDialog";
import { FactoryMultiSelect } from "@/components/factories/FactoryMultiSelect";
import { EmptyState } from "@/components/ui/empty-state";
import { DataLoadingState } from "@/components/ui/data-loading-state";
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
import {
  fetchCachedStaffWorkspace,
  fetchStaffWorkspace,
  fetchFreshStaffWorkspace,
} from "@/lib/staff-permissions";
import { useStaffCacheSignal } from "@/lib/use-staff-cache-signal";
import { useAuth } from "@/lib/auth";
import type { FactoryRecord } from "@/lib/factories";
import type { StaffWorkerRecord } from "@/lib/staff-permissions";
import { isCurrentlyWorking, type EmploymentHistoryRecord } from "@/lib/employment";
import type { UserRecord } from "@/lib/pocketbase";
import { getApprovalStatus } from "@/lib/user-approval";
import { getRecruiterDisplay } from "@/lib/recruiters";
import { toast } from "sonner";

const APPROVAL_STATUS_LABELS = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
} as const;

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

function getBirthYear(value?: string) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const iso = text.match(/^(\d{4})[-/]\d{1,2}[-/]\d{1,2}/);
  if (iso) return iso[1];

  const local = text.match(/^\d{1,2}[-/]\d{1,2}[-/](\d{4})/);
  if (local) return local[1];

  return /^(?:19|20)\d{2}$/.test(text) ? text : "";
}

function buildBasicRows(
  histories: EmploymentHistoryRecord[],
  tenureDaysByUserId: Map<string, number>,
) {
  return histories.map((history, index) => {
    const recruiter = getRecruiterDisplay(history);
    return {
    STT: index + 1,
    "Mã lịch sử": history.uid || "",
    "Mã nhân viên": history.employee_code || "",
    "Họ tên tại thời điểm đi làm": history.worker_name_snapshot,
    "CCCD tại thời điểm đi làm": history.worker_cccd_snapshot,
    "Ngày sinh tại thời điểm đi làm": formatDateOnly(history.worker_date_of_birth_snapshot),
    "Địa chỉ thường trú tại thời điểm đi làm":
      history.worker_address_snapshot || history.hometown_snapshot || "",
    "Ngày cấp CCCD tại thời điểm đi làm": formatDateOnly(history.cccd_issue_date),
    "Mã số thuế": history.worker_tax_code_snapshot || "",
    "Người tuyển": recruiter?.name || "",
    "Loại người tuyển": recruiter?.label || "",
    "Nhà máy": history.expand?.factory?.name || "",
    "Nhà chính": history.expand?.main_house?.name || "",
    "Ngày vào": formatDateOnly(history.join_date),
    "Ngày nghỉ": formatDateOnly(history.leave_date),
    "Trạng thái": isCurrentlyWorking(history) ? "Đang làm" : "Đã nghỉ",
    "Thâm niên tích luỹ (ngày)": tenureDaysByUserId.get(history.user) ?? 0,
    "Tài khoản gốc": history.expand?.user?.full_name || history.expand?.user?.username || "",
    "Số điện thoại": history.expand?.user?.phone || "",
    };
  });
}

function buildFullRows(
  histories: EmploymentHistoryRecord[],
  tenureDaysByUserId: Map<string, number>,
) {
  return histories.map((history, index) => {
    const user = history.expand?.user;
    const recruiter = getRecruiterDisplay(history);
    return {
      STT: index + 1,
      "Mã tài khoản (UID)": user?.uid || "",
      "Mã lịch sử": history.uid || "",
      "Mã nhân viên": history.employee_code || "",
      "Họ tên tại nhà máy": history.worker_name_snapshot || "",
      "CCCD tại nhà máy": history.worker_cccd_snapshot || "",
      "Số điện thoại": user?.phone || "",
      "Năm sinh": getBirthYear(user?.date_of_birth),
      "Giới tính": user?.gender || "",
      "Quê quán": user?.address || "",
      "Nhà máy": history.expand?.factory?.name || "",
      "Nhà chính": history.expand?.main_house?.name || "",
      "Ngày vào": formatDateOnly(history.join_date),
      "Ngày nghỉ": formatDateOnly(history.leave_date),
      "Người tuyển": recruiter?.name || "",
      "Loại người tuyển": recruiter?.label || "",
      "Họ tên gốc": user?.full_name || "",
      "CCCD gốc": user?.cccd || "",
      "Ngày cấp CCCD": formatDateOnly(history.cccd_issue_date),
      "Thâm niên tích luỹ (ngày)": tenureDaysByUserId.get(history.user) ?? 0,
      "Mã số thuế": history.worker_tax_code_snapshot || "",
      "Trạng thái lịch sử": isCurrentlyWorking(history) ? "Đang làm" : "Đã nghỉ",
      "Ghi chú": history.note || "",
      "Ngân hàng": user?.bank_name || "",
      "Số tài khoản": user?.bank_account_number || "",
      "Tên chủ tài khoản": user?.bank_account_name || "",
      "Ghi chú STK": user?.bank_account_note || "",
      "Tên đăng nhập": user?.username || "",
      "Vai trò": user?.role || "",
      "Trạng thái tài khoản": user?.status || "",
      "Trạng thái duyệt": user ? APPROVAL_STATUS_LABELS[getApprovalStatus(user)] : "",
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
  const [factoryFilters, setFactoryFilters] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [exportingAll, setExportingAll] = useState(false);
  const [cccdExportOpen, setCccdExportOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;

    setLoading(true);
    Promise.all([fetchStaffWorkspace(user as UserRecord), fetchFactories()])
      .then(([workspace, factoryRows]) => {
        if (!alive) return;
        setWorkers(workspace.workers ?? []);
        setFactories(factoryRows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [user]);

  const cacheSignal = useStaffCacheSignal();
  useEffect(() => {
    if (!user?.id || cacheSignal === 0) return;
    const timer = setTimeout(async () => {
      const ws = await fetchCachedStaffWorkspace(user as UserRecord);
      if (ws) setWorkers(ws.workers ?? []);
    }, 150);
    return () => clearTimeout(timer);
  }, [cacheSignal, user?.id]);

  const allHistories = useMemo(() => workers.flatMap((worker) => worker.histories), [workers]);

  const filteredHistories = useMemo(() => {
    return allHistories.filter((history) => {
      if (factoryFilters.length > 0 && !factoryFilters.includes(history.factory)) return false;
      if (
        statusFilter !== "all" &&
        (isCurrentlyWorking(history) ? "working" : "left") !== statusFilter
      ) {
        return false;
      }
      return true;
    });
  }, [allHistories, factoryFilters, statusFilter]);

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
    exportToExcel(
      `jobconnect_export_co_ban_${Date.now()}`,
      { "Lao động cơ bản": basicRows },
      { "Lao động cơ bản": ["Ngày sinh", "Ngày cấp CCCD", "Ngày vào", "Ngày nghỉ"] },
    );
    toast.success("Đã xuất Excel cơ bản");
  };

  const doExportFull = async () => {
    if (!fullRows.length) {
      toast.warning("Không có dữ liệu để xuất");
      return;
    }
    exportToExcel(
      `jobconnect_export_day_du_${Date.now()}`,
      { "Lao động đầy đủ": fullRows },
      { "Lao động đầy đủ": ["Ngày cấp CCCD", "Ngày vào", "Ngày nghỉ"] },
    );
    toast.success("Đã xuất Excel đầy đủ");
  };

  const doExportAllFromPocketBase = async () => {
    if (!user?.id || exportingAll) return;
    setExportingAll(true);
    try {
      const workspace = await fetchFreshStaffWorkspace(user as UserRecord, { bypassScope: true });
      const histories = workspace.workers.flatMap((worker) => worker.histories);
      const rows = buildFullRows(histories, buildTenureDaysByUserId(workspace.workers));
      if (!rows.length) {
        toast.warning("Không có dữ liệu từ PocketBase để xuất");
        return;
      }
      exportToExcel(
        `jobconnect_export_tat_ca_pocketbase_${Date.now()}`,
        {
          "Tất cả lao động": rows,
        },
        { "Tất cả lao động": ["Ngày cấp CCCD", "Ngày vào", "Ngày nghỉ"] },
      );
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
        <FactoryMultiSelect
          factories={factories}
          selectedIds={factoryFilters}
          onChange={setFactoryFilters}
          emptyMeansAll
        />

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
          Bản đầy đủ gồm thông tin nhân sự, lịch sử làm việc, tài khoản ngân hàng và trạng thái tài
          khoản.
        </p>
      </div>

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ImageDown className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Xuất ảnh CCCD theo lịch sử đi làm</div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Chọn khoảng ngày và nhà máy hoặc tải danh sách Excel; hỗ trợ thư mục ảnh và file Word
              sẵn sàng in.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full rounded-xl"
          onClick={() => setCccdExportOpen(true)}
        >
          <ImageDown className="h-4 w-4" />
          Xuất ảnh CCCD
        </Button>
      </div>

      <CccdHistoryExportDialog
        open={cccdExportOpen}
        onClose={() => setCccdExportOpen(false)}
        histories={allHistories}
        users={workers.map((worker) => worker.user)}
        factories={factories}
      />

      {loading ? (
        <DataLoadingState variant="list" label="Đang tải dữ liệu để xuất..." rows={3} />
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
