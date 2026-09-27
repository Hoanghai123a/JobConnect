import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  checkInDaily,
  claimWeeklyBonus,
  getWeeklyCheckinStatus,
  type WeeklyCheckinStatus,
} from "@/lib/coin-rewards";
import { AppHeader } from "@/components/layout/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { CoinBalance } from "@/components/coins/CoinBalance";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/lib/toast";
import { CalendarDays, CheckCircle2, Gift, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/weekly-checkin")({
  component: WeeklyCheckinPage,
});

const DAYS_OF_WEEK = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function WeeklyCheckinPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [status, setStatus] = useState<WeeklyCheckinStatus | null>(null);

  useEffect(() => {
    if (user?.id) {
      loadCheckinStatus();
    }
  }, [user?.id]);

  const loadCheckinStatus = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const checkinStatus = await getWeeklyCheckinStatus(user.id);
      setStatus(checkinStatus);
    } catch (error) {
      console.error("Error loading checkin status:", error);
      toast.error("Không thể tải trạng thái điểm danh");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!user?.id || !status?.canCheckinToday) return;

    setChecking(true);
    try {
      const result = await checkInDaily(user.id);

      if (result.success) {
        toast.success(result.message);
        await loadCheckinStatus();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error("Error checking in:", error);
      toast.error("Lỗi khi điểm danh");
    } finally {
      setChecking(false);
    }
  };

  const handleClaimBonus = async () => {
    if (!user?.id || !status?.canClaimBonus) return;

    setClaiming(true);
    try {
      const result = await claimWeeklyBonus(user.id);

      if (result.success) {
        toast.success(result.message);
        await loadCheckinStatus();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error("Error claiming bonus:", error);
      toast.error("Lỗi khi nhận thưởng");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div>
        <AppHeader title="Điểm danh tuần" back />
        <DataLoadingState message="Đang tải..." />
      </div>
    );
  }

  const totalDays = status?.currentWeek?.total_days || 0;
  const progressPercent = (totalDays / 7) * 100;
  const coinsEarned = status?.currentWeek?.coins_earned || 0;

  return (
    <div className="pb-nav">
      <AppHeader title="Điểm danh tuần" back />

      <div className="space-y-4 p-4">
        {/* Header Card */}
        <Card className="rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 p-5 dark:from-green-950/20 dark:to-emerald-950/20">
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-green-600" />
            <h3 className="font-semibold">Điểm danh hàng ngày</h3>
          </div>

          <div className="mb-4 rounded-xl bg-white/60 p-4 dark:bg-black/20">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tuần này</span>
              <span className="text-sm font-medium">
                {totalDays}/7 ngày
              </span>
            </div>
            <Progress value={progressPercent} className="mb-3 h-2" />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Đã nhận</span>
              <CoinBalance coins={coinsEarned} size="sm" />
            </div>
          </div>

          {status?.canCheckinToday ? (
            <Button
              onClick={handleCheckIn}
              disabled={checking}
              className="w-full rounded-xl"
              size="lg"
            >
              <CheckCircle2 className="mr-2 h-5 w-5" />
              {checking ? "Đang điểm danh..." : "Điểm danh hôm nay"}
            </Button>
          ) : (
            <div className="rounded-xl bg-green-100 p-3 text-center text-sm font-medium text-green-700 dark:bg-green-900/30">
              <CheckCircle2 className="mx-auto mb-1 h-5 w-5" />
              Đã điểm danh hôm nay
            </div>
          )}
        </Card>

        {/* Calendar */}
        <Card className="rounded-2xl p-4">
          <h3 className="mb-3 font-semibold">Lịch tuần này</h3>
          <div className="grid grid-cols-7 gap-2">
            {DAYS_OF_WEEK.map((day, index) => {
              // Tính thứ Hai tuần này
              let monday: Date;
              if (status?.currentWeek?.week_start) {
                monday = new Date(status.currentWeek.week_start);
              } else {
                const today = new Date();
                const dayOfWeek = today.getDay();
                const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
              }

              const currentDate = new Date(monday);
              currentDate.setDate(monday.getDate() + index);

              // Format date theo local timezone giống backend
              const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

              const isCheckedIn = status?.currentWeek?.checkin_days.includes(dateStr);
              const isToday = dateStr === status?.todayDate;

              return (
                <div
                  key={index}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl p-2",
                    isCheckedIn
                      ? "bg-green-100 dark:bg-green-900/30"
                      : "bg-muted/50",
                    isToday && !isCheckedIn && "ring-2 ring-primary"
                  )}
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {day}
                  </span>
                  <span className="text-xs">{currentDate.getDate()}</span>
                  {isCheckedIn ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-muted" />
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Bonus Card */}
        {status?.canClaimBonus ? (
          <Card className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-5 dark:from-amber-950/20 dark:to-orange-950/20">
            <div className="mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-600" />
              <h3 className="font-semibold">Chúc mừng! 🎉</h3>
            </div>

            <p className="mb-4 text-sm text-muted-foreground">
              Bạn đã điểm danh đủ 7 ngày trong tuần. Nhận thưởng ngay!
            </p>

            <Button
              onClick={handleClaimBonus}
              disabled={claiming}
              className="w-full rounded-xl"
              size="lg"
            >
              <Gift className="mr-2 h-5 w-5" />
              {claiming ? "Đang nhận..." : "Nhận thưởng"}
            </Button>
          </Card>
        ) : totalDays === 7 && status?.currentWeek?.bonus_claimed ? (
          <Card className="rounded-2xl p-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Trophy className="h-5 w-5 text-amber-600" />
              <span>Bạn đã nhận thưởng tuần này rồi</span>
            </div>
          </Card>
        ) : (
          <Card className="rounded-2xl p-4">
            <div className="mb-3 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-600" />
              <h3 className="font-semibold">Thưởng hoàn thành tuần</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Điểm danh đủ 7 ngày để nhận thưởng đặc biệt
            </p>
          </Card>
        )}

        {/* Rules */}
        <Card className="rounded-2xl p-4">
          <h3 className="mb-3 font-semibold">Quy tắc</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• Điểm danh mỗi ngày để nhận xu</p>
            <p>• Tuần tính từ thứ Hai đến Chủ nhật</p>
            <p>• Điểm danh đủ 7 ngày nhận thưởng đặc biệt</p>
            <p>• Bỏ lỡ 1 ngày sẽ phải bắt đầu lại tuần sau</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
