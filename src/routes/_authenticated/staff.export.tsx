import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileDown, ImageDown, Loader2, Server } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { CccdHistoryExportDialog } from "@/components/cccd/CccdHistoryExportDialog";
import { FactoryMultiSelect } from "@/components/factories/FactoryMultiSelect";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchFactories, type FactoryRecord } from "@/lib/factories";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { fetchStaffWorkspace, type StaffWorkerRecord } from "@/lib/staff-permissions";
import { toast } from "@/lib/toast";

type ExportMode = "basic" | "full";

export const Route = createFileRoute("/_authenticated/staff/export")({
  component: StaffExportPage,
});

function filenameFromResponse(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] || fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function StaffExportPage() {
  const { user } = useAuth();
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [factoryFilters, setFactoryFilters] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [exportingMode, setExportingMode] = useState<ExportMode | null>(null);
  const [cccdWorkers, setCccdWorkers] = useState<StaffWorkerRecord[]>([]);
  const [cccdExportOpen, setCccdExportOpen] = useState(false);
  const [loadingCccd, setLoadingCccd] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchFactories()
      .then((rows) => {
        if (alive) setFactories(rows);
      })
      .catch(() => {
        if (alive) toast.error("Không thể tải danh sách nhà máy");
      });
    return () => {
      alive = false;
    };
  }, []);

  const exportFromServer = async (mode: ExportMode) => {
    if (!factoryFilters.length || exportingMode) return;
    setExportingMode(mode);
    try {
      const response = await fetch("/api/staff/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
        },
        body: JSON.stringify({
          factoryIds: factoryFilters,
          mode,
          status: statusFilter,
          historyFromDate,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "Không thể xuất dữ liệu Excel");
      }

      const blob = await response.blob();
      const fallback = `jobconnect_${mode === "basic" ? "co_ban" : "day_du"}.xlsx`;
      downloadBlob(blob, filenameFromResponse(response, fallback));
      const rowCount = response.headers.get("x-export-row-count");
      toast.success(rowCount ? `Đã xuất ${rowCount} dòng dữ liệu` : "Đã xuất file Excel");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể xuất dữ liệu Excel");
    } finally {
      setExportingMode(null);
    }
  };

  const openCccdExport = async () => {
    if (!user?.id || !factoryFilters.length || loadingCccd) return;
    setLoadingCccd(true);
    try {
      const workspace = await fetchStaffWorkspace(user as UserRecord);
      const selectedFactories = new Set(factoryFilters);
      const scopedWorkers = workspace.workers
        .map((worker) => ({
          ...worker,
          histories: worker.histories.filter((history) => selectedFactories.has(history.factory)),
        }))
        .filter((worker) => worker.histories.length > 0);
      setCccdWorkers(scopedWorkers);
      setCccdExportOpen(true);
    } catch {
      toast.error("Không thể tải dữ liệu để xuất ảnh CCCD");
    } finally {
      setLoadingCccd(false);
    }
  };

  const disabled = factoryFilters.length === 0 || !historyFromDate || exportingMode !== null;
  const cccdHistories = cccdWorkers.flatMap((worker) => worker.histories);

  return (
    <PageContainer
      title="Xuất dữ liệu"
      subtitle="Chọn nhà máy, máy chủ sẽ tạo file Excel để tải xuống"
    >
      <div className="grid gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
        <FactoryMultiSelect
          factories={factories}
          selectedIds={factoryFilters}
          onChange={setFactoryFilters}
          label="Nhà máy (bắt buộc)"
        />

        <div className="space-y-1.5">
          <Label className="text-xs">Giữ lịch sử từ ngày (bắt buộc)</Label>
          <DateInput
            value={historyFromDate}
            onChange={setHistoryFromDate}
            placeholder="dd/mm/yyyy"
            aria-required="true"
          />
          <p className="text-[11px] text-muted-foreground">
            Lịch sử có ngày nghỉ trước ngày này sẽ không được đưa vào file Excel.
          </p>
        </div>

        <div className="space-y-1.5">
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

        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3">
          <div className="flex items-start gap-2.5">
            <Server className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <div className="text-sm font-semibold">
                {factoryFilters.length
                  ? `Đã chọn ${factoryFilters.length} nhà máy`
                  : "Chưa chọn nhà máy"}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Không tải hồ sơ và không tạo bản xem trước trên thiết bị. Dữ liệu được lọc theo nhà
                máy và tạo file trực tiếp trên máy chủ khi bạn bấm xuất.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl"
            disabled={disabled}
            onClick={() => exportFromServer("basic")}
          >
            {exportingMode === "basic" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            {exportingMode === "basic" ? "Máy chủ đang tạo file..." : "Xuất cơ bản"}
          </Button>
          <Button
            type="button"
            className="w-full rounded-xl"
            disabled={disabled}
            onClick={() => exportFromServer("full")}
          >
            {exportingMode === "full" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            {exportingMode === "full" ? "Máy chủ đang tạo file..." : "Xuất đầy đủ"}
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Bản đầy đủ gồm thông tin nhân sự, lịch sử làm việc, tài khoản ngân hàng và trạng thái tài
          khoản. Dữ liệu xuất tuân theo phạm vi quyền của tài khoản hiện tại.
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
              Dữ liệu CCCD chỉ được tải khi bạn mở chức năng này và được giới hạn theo nhà máy đã
              chọn.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full rounded-xl"
          disabled={!factoryFilters.length || loadingCccd || exportingMode !== null}
          onClick={openCccdExport}
        >
          {loadingCccd ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImageDown className="h-4 w-4" />
          )}
          {loadingCccd ? "Đang tải dữ liệu CCCD..." : "Xuất ảnh CCCD"}
        </Button>
      </div>

      <CccdHistoryExportDialog
        open={cccdExportOpen}
        onClose={() => setCccdExportOpen(false)}
        histories={cccdHistories}
        users={cccdWorkers.map((worker) => worker.user)}
        factories={factories.filter((factory) => factoryFilters.includes(factory.id))}
      />
    </PageContainer>
  );
}
