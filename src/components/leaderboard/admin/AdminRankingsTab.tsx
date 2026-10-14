import { useState, useEffect, useCallback } from "react";
import { Download, RefreshCw } from "lucide-react";
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
    <div className="space-y-6">
      {/* Controls */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label>Tháng:</Label>
            <MonthSelector value={month} onChange={setMonth} />
          </div>

          <div className="flex items-center gap-2">
            <Label>Nguồn dữ liệu:</Label>
            <RadioGroup
              value={source}
              onValueChange={(value) => setSource(value as StaffHoursDataSource)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="admin_upload" id="admin_upload" />
                <Label htmlFor="admin_upload" className="font-normal cursor-pointer">
                  Admin upload
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="self_checkin" id="self_checkin" />
                <Label htmlFor="self_checkin" className="font-normal cursor-pointer">
                  Tự chấm công
                </Label>
              </div>
            </RadioGroup>
          </div>

          <select
            value={factoryFilter}
            onChange={(event) => setFactoryFilter(event.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
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

          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              disabled={filteredEntries.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Xuất Excel
            </Button>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Tổng số người</div>
          <div className="text-2xl font-bold">{filteredEntries.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Giờ trung bình</div>
          <div className="text-2xl font-bold">
            {filteredEntries.length > 0
              ? (
                  filteredEntries.reduce((sum, e) => sum + e.totalHours, 0) / filteredEntries.length
                ).toFixed(1)
              : 0}
            h
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Người dẫn đầu</div>
          <div className="text-2xl font-bold">
            {filteredEntries[0] ? `${filteredEntries[0].totalHours.toFixed(1)}h` : "—"}
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
