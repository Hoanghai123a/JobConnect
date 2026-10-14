import { useState, useEffect, useCallback } from "react";
import { ChevronDown, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MonthSelector } from "../MonthSelector";
import { LeaderboardRankingList } from "../LeaderboardRankingList";
import { calculateRankings, fetchLeaderboard } from "@/lib/leaderboard";
import type { LeaderboardEntry } from "@/lib/leaderboard";
import { getCachedAdminStaffHours, syncAdminStaffHours } from "@/lib/admin-staff-hours";
import type { StaffHoursDataSource } from "@/lib/pocketbase";
import { exportToExcel } from "@/lib/excel";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function AdminRankingsTab() {
  const { user } = useAuth();
  const [month, setMonth] = useState<string>(getCurrentMonth());
  const [source, setSource] = useState<StaffHoursDataSource>("admin_upload");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [factoryFilter, setFactoryFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      if (!user) {
        setEntries([]);
        return;
      }
      if (source === "self_checkin") {
        setEntries(await fetchLeaderboard(month, source, 1000));
      } else {
        await syncAdminStaffHours(user.id, { month, source });
        const records = getCachedAdminStaffHours(user.id, month, source);
        setEntries(
          calculateRankings(
            records.map((record) => ({
              rank: 0,
              userId: record.id,
              fullName: record.full_name || record.full_name_key || "Chưa có tên",
              employeeCode: record.employee_code || record.employee_code_key || "",
              factoryName: record.factory_name || record.factory_name_key || "",
              hcHours: Number(record.hc_hours || 0),
              tcHours: Number(record.tc_hours || 0),
              totalHours: Number(record.total_hours || 0),
              month: record.month,
              createdAt: record.created,
            })),
          ),
        );
      }
    } catch (error: any) {
      toast.error(error?.message || "Không tải được bảng xếp hạng");
    } finally {
      setLoading(false);
    }
  }, [month, source, user]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const handleRefresh = () => {
    loadLeaderboard();
    toast.success("Đã làm mới dữ liệu");
  };

  const handleExportExcel = () => {
    if (filteredEntries.length === 0) {
      toast.warning("Không có dữ liệu để xuất");
      return;
    }

    const exportData = filteredEntries.map((entry) => ({
      Hạng: entry.rank,
      "Họ tên": entry.fullName,
      "Mã NV": entry.employeeCode || "",
      "Tên nhà máy": entry.factoryName || "",
      Tháng: entry.month,
      "Giờ HC": entry.hcHours,
      "Giờ TC": entry.tcHours,
      "Tổng giờ": entry.totalHours,
    }));

    exportToExcel(`bang_xep_hang_${month}_${source}`, {
      "Xếp hạng": exportData,
    });

    toast.success("Đã xuất file Excel");
  };

  const filteredEntries = factoryFilter
    ? entries
        .filter((entry) => entry.factoryName === factoryFilter)
        .map((entry, index) => ({ ...entry, rank: index + 1 }))
    : entries;
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Controls */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Label htmlFor="admin-leaderboard-month" className="shrink-0">
              Tháng
            </Label>
            <MonthSelector
              id="admin-leaderboard-month"
              value={month}
              onChange={setMonth}
              className="min-w-0 flex-1"
              inputClassName="w-0 min-w-0 flex-1"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            aria-label={filtersOpen ? "Thu gọn bộ lọc và thao tác" : "Mở bộ lọc và thao tác"}
            aria-expanded={filtersOpen}
            aria-controls="admin-leaderboard-filter-options"
            title={filtersOpen ? "Thu gọn bộ lọc và thao tác" : "Mở bộ lọc và thao tác"}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 transition-transform motion-reduce:transition-none ${filtersOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </div>

        <div
          id="admin-leaderboard-filter-options"
          hidden={!filtersOpen}
          className="mt-3 space-y-4 border-t pt-4"
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Nguồn dữ liệu</legend>
            <RadioGroup
              name="source"
              value={source}
              onValueChange={(value) => setSource(value as StaffHoursDataSource)}
              className="flex flex-wrap gap-x-4 gap-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="admin_upload" id="admin_upload" />
                <Label htmlFor="admin_upload" className="cursor-pointer font-normal">
                  Admin upload
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="self_checkin" id="self_checkin" />
                <Label htmlFor="self_checkin" className="cursor-pointer font-normal">
                  Tự chấm công
                </Label>
              </div>
            </RadioGroup>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="admin-leaderboard-factory">Nhà máy</Label>
            <select
              id="admin-leaderboard-factory"
              name="factory"
              value={factoryFilter}
              onChange={(event) => setFactoryFilter(event.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Tất cả nhà máy</option>
              {[...new Set(entries.map((entry) => entry.factoryName).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, "vi"))
                .map((factory) => (
                  <option key={factory} value={factory}>
                    {factory}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              aria-label="Làm mới bảng xếp hạng"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
              />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              disabled={filteredEntries.length === 0}
            >
              <Download aria-hidden="true" className="mr-2 h-4 w-4" />
              Xuất Excel
            </Button>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Card className="flex min-h-20 flex-col justify-center p-3">
          <div className="text-sm text-muted-foreground">Tổng người</div>
          <div className="text-2xl font-bold tabular-nums">{filteredEntries.length}</div>
        </Card>
        <Card className="flex min-h-20 flex-col justify-center p-3">
          <div className="text-sm text-muted-foreground">Trung bình</div>
          <div className="text-2xl font-bold tabular-nums">
            {filteredEntries.length > 0
              ? (
                  filteredEntries.reduce((sum, e) => sum + e.totalHours, 0) / filteredEntries.length
                ).toFixed(1)
              : 0}
            h
          </div>
        </Card>
      </div>

      {/* Empty state */}
      {!loading && filteredEntries.length === 0 && (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <div className="text-lg font-medium mb-2">Chưa có dữ liệu</div>
            <div className="text-sm">
              Chưa có dữ liệu giờ làm cho tháng {month} (nguồn:{" "}
              {source === "admin_upload" ? "Admin upload" : "Tự chấm công"})
            </div>
          </div>
        </Card>
      )}

      {/* Ranking list */}
      {!loading && (
        <Card className="p-6">
          <h3 className="mb-6 text-lg font-semibold">Danh sách xếp hạng</h3>
          <p className="-mt-4 mb-4 text-sm text-muted-foreground">
            Tìm kiếm được thực hiện trên toàn bộ dữ liệu của tháng đang chọn, không chỉ 8 vị trí
            đầu.
          </p>
          <LeaderboardRankingList entries={filteredEntries} visibleCount={8} showSearch />
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
            <div>Đang tải dữ liệu...</div>
          </div>
        </Card>
      )}
    </div>
  );
}
