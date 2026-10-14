import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Trophy, RefreshCw, Award } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MonthSelector } from "@/components/leaderboard/MonthSelector";
import { LeaderboardRankingList } from "@/components/leaderboard/LeaderboardRankingList";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  fetchLeaderboardForUser,
  getLeaderboardSettings,
  invalidateLeaderboardCache,
  type LeaderboardData,
} from "@/lib/leaderboard";
import { pb, type UserRecord, type StaffHoursDataSource, fileUrl } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  beforeLoad: () => {
    const currentUser = pb.authStore.record as UserRecord | null;
    if (typeof window !== "undefined" && !currentUser?.is_internal) {
      throw redirect({ to: "/" });
    }
  },
  component: LeaderboardPage,
});

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function LeaderboardPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState<string>(getCurrentMonth());
  const [source, setSource] = useState<StaffHoursDataSource>("admin_upload");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [maxRankDisplay, setMaxRankDisplay] = useState(10);

  const loadSettings = useCallback(async () => {
    try {
      const settings = await getLeaderboardSettings();
      setMaxRankDisplay(settings.maxRankDisplay);
      setSource(user?.role === "admin" ? settings.defaultDataSource : "self_checkin");
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }, [user?.role]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const loadLeaderboard = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const leaderboardData = await fetchLeaderboardForUser(month, source, user.id, maxRankDisplay);
      setData(leaderboardData);
    } catch (error: any) {
      toast.error(error?.message || "Không tải được bảng xếp hạng");
    } finally {
      setLoading(false);
    }
  }, [user, month, source, maxRankDisplay]);

  useEffect(() => {
    if (user) loadLeaderboard();
  }, [user, loadLeaderboard]);

  const handleRefresh = () => {
    invalidateLeaderboardCache();
    loadLeaderboard();
    toast.success("Đã làm mới dữ liệu");
  };

  const rankedEntries = data?.topEntries.filter((entry) => entry.rank <= 8) || [];

  // Determine user's rank status
  const userRankStatus = (() => {
    if (!data?.userEntry) return "no_data";
    if (
      data.userRank &&
      data.userRank <= 8 &&
      rankedEntries.some((entry) => entry.userId === user?.id)
    ) {
      return "in_top";
    }
    return "unranked";
  })();

  return (
    <div className="container mx-auto p-6 max-w-6xl pb-32">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Trophy className="h-8 w-8 text-primary" />
          Bảng xếp hạng giờ làm
        </h1>
        <p className="text-muted-foreground mt-2">Xem thành tích và xếp hạng giờ làm của bạn</p>
      </div>

      {/* Controls */}
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label>Tháng:</Label>
            <MonthSelector value={month} onChange={setMonth} />
          </div>

          <div className="flex items-center gap-2">
            <Label>Nguồn:</Label>
            <RadioGroup
              value={source}
              onValueChange={(value) => setSource(value as StaffHoursDataSource)}
              className="flex gap-4"
            >
              {user?.role === "admin" && (
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="admin_upload" id="user_admin_upload" />
                  <Label htmlFor="user_admin_upload" className="font-normal cursor-pointer">
                    Admin upload riêng
                  </Label>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="self_checkin" id="user_self_checkin" />
                <Label htmlFor="user_self_checkin" className="font-normal cursor-pointer">
                  Tự chấm công
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Loading */}
      {loading && (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
            <div>Đang tải dữ liệu...</div>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {!loading && data?.topEntries.length === 0 && (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <Award className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <div className="text-lg font-medium mb-2">Chưa có dữ liệu</div>
            <div className="text-sm">Chưa có dữ liệu giờ làm cho tháng {month}</div>
          </div>
        </Card>
      )}

      {/* Ranking list */}
      {!loading && rankedEntries.length > 0 && (
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-6">Bảng xếp hạng</h2>
          <LeaderboardRankingList
            entries={rankedEntries}
            currentUserId={user?.id}
            visibleCount={8}
          />
        </Card>
      )}

      {/* User's ranking card - Sticky at bottom */}
      {!loading && user && userRankStatus !== "in_top" && (
        <Card className="fixed bottom-0 left-0 right-0 md:left-auto md:right-6 md:bottom-6 md:max-w-md border-t-4 border-t-primary shadow-lg z-50">
          <div className="p-4">
            <div className="text-sm font-medium text-muted-foreground mb-3">Xếp hạng của bạn</div>

            {userRankStatus === "no_data" && (
              <div className="text-center py-4 text-muted-foreground">
                <Award className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <div className="text-sm">Chưa có dữ liệu tháng này</div>
              </div>
            )}

            {userRankStatus === "unranked" && data?.userEntry && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={fileUrl(user, user.avatar)} alt={user.full_name} />
                    <AvatarFallback>{user.full_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="font-medium">{user.full_name}</div>
                    <div className="text-sm text-muted-foreground">{user.employee_code || "—"}</div>
                  </div>
                  <div className="rounded-full bg-muted px-3 py-1.5 text-sm font-bold tabular-nums text-muted-foreground">
                    #{data.userRank}
                  </div>
                </div>
                <div className="flex justify-between text-sm border-t pt-3">
                  <div>
                    <div className="text-muted-foreground">Giờ HC</div>
                    <div className="font-semibold">{data.userEntry.hcHours.toFixed(1)}h</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Giờ TC</div>
                    <div className="font-semibold">{data.userEntry.tcHours.toFixed(1)}h</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Tổng</div>
                    <div className="font-bold text-primary">
                      {data.userEntry.totalHours.toFixed(1)}h
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground text-center">
                  Ngoài top 8 · Xếp hạng #{data.userRank} / {data.totalParticipants}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
