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
import { syncAdminStaffHours } from "@/lib/admin-staff-hours";
import type { StaffHoursDataSource } from "@/lib/pocketbase";
import { exportToExcel } from "@/lib/excel";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthsInRange(from: string, to: string): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(from) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(to) || from > to) {
    return [];
  }

  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  const months: string[] = [];
  let year = fromYear;
  let month = fromMonth;

  while (year < toYear || (year === toYear && month <= toMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

function aggregateEntries(entries: LeaderboardEntry[], month: string): LeaderboardEntry[] {
  const aggregated = new Map<string, LeaderboardEntry>();
  for (const entry of entries) {
    const key = entry.employeeCode ? `${entry.employeeCode}|${entry.factoryName}` : entry.userId;
    const existing = aggregated.get(key);
    if (!existing) {
      aggregated.set(key, { ...entry, month });
      continue;
    }
    existing.hcHours += entry.hcHours;
    existing.tcHours += entry.tcHours;
    existing.totalHours += entry.totalHours;
  }
  return calculateRankings([...aggregated.values()]);
}

export function AdminRankingsTab() {
  const { user } = useAuth();
  const [monthFrom, setMonthFrom] = useState<string>(getCurrentMonth());
  const [monthTo, setMonthTo] = useState<string>(getCurrentMonth());
  const [source, setSource] = useState<StaffHoursDataSource>("admin_upload");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [factoryFilters, setFactoryFilters] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const months = getMonthsInRange(monthFrom, monthTo);
      if (months.length === 0) {
        setEntries([]);
        toast.error("Khoảng tháng không hợp lệ");
        return;
      }
      if (!user) {
        setEntries([]);
        return;
      }
      if (source === "self_checkin") {
        const monthEntries = await Promise.all(
          months.map((month) => fetchLeaderboard(month, source, 1000)),
        );
        setEntries(aggregateEntries(monthEntries.flat(), `${monthFrom} - ${monthTo}`));
      } else {
        const records = await syncAdminStaffHours(user.id, { source });
        setEntries(
          aggregateEntries(
            records
              .map((record) => ({
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
              }))
              .filter((entry) => entry.month >= monthFrom && entry.month <= monthTo),
            `${monthFrom} - ${monthTo}`,
          ),
        );
      }
    } catch (error: any) {
      toast.error(error?.message || "Không tải được bảng xếp hạng");
    } finally {
      setLoading(false);
    }
  }, [monthFrom, monthTo, source, user]);

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

    exportToExcel(`bang_xep_hang_${monthFrom}_${monthTo}_${source}`, {
      "Xếp hạng": exportData,
    });

    toast.success("Đã xuất file Excel");
  };

  const availableFactories = [
    ...new Set(entries.map((entry) => entry.factoryName).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "vi"));
  const filteredEntries = factoryFilters.length
    ? calculateRankings(entries.filter((entry) => factoryFilters.includes(entry.factoryName)))
    : entries;
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Controls */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0 items-center gap-2">
            <div className="flex w-full min-w-0 items-center gap-2">
              <MonthSelector
                id="admin-leaderboard-month-from"
                value={monthFrom}
                onChange={setMonthFrom}
                className="min-w-0 flex-1"
                inputClassName="min-w-0 flex-1"
              />
              <span className="text-sm text-muted-foreground">-</span>
              <MonthSelector
                id="admin-leaderboard-month-to"
                value={monthTo}
                onChange={setMonthTo}
                className="min-w-0 flex-1"
                inputClassName="min-w-0 flex-1"
              />

              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={filtersOpen ? "Thu gọn bộ lọc và thao tác" : "Mở bộ lọc và thao tác"}
                aria-expanded={filtersOpen}
                aria-controls="admin-leaderboard-filter-options"
                title={filtersOpen ? "Thu gọn bộ lọc và thao tác" : "Mở bộ lọc và thao tác"}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <ChevronDown
                  aria-hidden="true"
                  className={`h-3 w-3 transition-transform motion-reduce:transition-none ${filtersOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </div>
          </div>
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

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Nhà máy</legend>
            <div className="grid gap-2 rounded-lg border border-input p-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={factoryFilters.length === 0}
                  onChange={() => setFactoryFilters([])}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                Tất cả nhà máy
              </label>
              {availableFactories.map((factory) => (
                <label key={factory} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={factoryFilters.includes(factory)}
                    onChange={(event) =>
                      setFactoryFilters((current) =>
                        event.target.checked
                          ? [...current, factory]
                          : current.filter((item) => item !== factory),
                      )
                    }
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span className="truncate">{factory}</span>
                </label>
              ))}
            </div>
          </fieldset>

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
              Chưa có dữ liệu giờ làm từ tháng {monthFrom} đến {monthTo} (nguồn:{" "}
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
            Tìm kiếm được thực hiện trên toàn bộ dữ liệu trong khoảng tháng đã chọn, không chỉ 8 vị
            trí đầu.
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
