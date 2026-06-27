import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, FileDown } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportToExcel } from "@/lib/excel";
import { fetchFactories } from "@/lib/factories";
import { fetchStaffWorkspace } from "@/lib/staff-permissions";
import { useAuth } from "@/lib/auth";
import type { FactoryRecord } from "@/lib/factories";
import type { StaffWorkerRecord } from "@/lib/staff-permissions";
import type { UserRecord } from "@/lib/pocketbase";
import { toast } from "sonner";

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

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;

    setLoading(true);
    Promise.all([fetchStaffWorkspace(user as UserRecord), fetchFactories()])
      .then(([workspace, factoryRows]) => {
        if (!alive) return;
        setWorkers(workspace.workers);
        setFactories(factoryRows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [user?.id]);

  const exportRows = useMemo(() => {
    return workers
      .flatMap((worker) => worker.histories)
      .filter((history) => {
        if (factoryFilter !== "all" && history.factory !== factoryFilter) return false;
        if (statusFilter !== "all" && history.status !== statusFilter) return false;
        return true;
      })
      .map((history, index) => ({
        STT: index + 1,
        "Mã NV": history.employee_code || "",
        "Họ tên tại nhà máy": history.worker_name_snapshot,
        CCCD: history.worker_cccd_snapshot,
        "Người tuyển":
          history.expand?.recruiter_staff?.full_name ||
          history.expand?.recruiter_staff?.username ||
          "",
        "Nhà máy": history.expand?.factory?.name || "",
        "Ngày vào": history.join_date || "",
        "Ngày nghỉ": history.leave_date || "",
        "Trạng thái": history.status === "working" ? "Đang làm" : "Đã nghỉ",
        "User gốc": history.expand?.user?.full_name || history.expand?.user?.username || "",
        "Số điện thoại": history.expand?.user?.phone || "",
      }));
  }, [factoryFilter, statusFilter, workers]);

  const doExport = async () => {
    if (!exportRows.length) {
      toast.warning("Không có dữ liệu để xuất");
      return;
    }

    exportToExcel(`jobconnect_staff_export_${Date.now()}`, { "Lao dong": exportRows });
    toast.success("Đã xuất Excel");
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
          Sẵn sàng xuất <strong>{exportRows.length}</strong> dòng dữ liệu.
        </div>

        <Button onClick={doExport} className="w-full rounded-xl">
          <FileDown className="h-4 w-4" /> Xuất Excel
        </Button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          Đang tải dữ liệu để xuất...
        </div>
      ) : exportRows.length === 0 ? (
        <EmptyState
          icon={Download}
          title="Chưa có dữ liệu phù hợp"
          description="Đổi bộ lọc hoặc chờ admin import thêm lịch sử đi làm."
        />
      ) : (
        <div className="space-y-2">
          {exportRows.slice(0, 12).map((row) => (
            <div key={`${row.STT}-${row["Mã NV"]}-${row["Ngày vào"]}`} className="list-card border-l-[color:var(--status-info)]">
              <div className="text-sm font-semibold">{row["Họ tên tại nhà máy"]}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {row["Nhà máy"]} · {row["Mã NV"] || "Chưa có mã"} · {row["Trạng thái"]}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
