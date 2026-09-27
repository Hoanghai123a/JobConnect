import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pocketbase";
import { escapePb } from "@/lib/pocketbase-utils";
import { getOrCreateReferralCode, getReferralStats } from "@/lib/referrals";
import { getReferralCoinsEarned } from "@/lib/referral-coins";
import { AppHeader } from "@/components/layout/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { CoinBalance } from "@/components/coins/CoinBalance";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/lib/toast";
import { Users, Copy, Share2, Gift, CheckCircle2, Clock, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShareDialog } from "@/components/referral/ShareDialog";
import { shareContent } from "@/lib/share";

export const Route = createFileRoute("/_authenticated/referral")({
  component: ReferralPage,
});

function ReferralPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadReferralData();
    }
  }, [user?.id]);

  const loadReferralData = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Lấy mã giới thiệu
      const code = await getOrCreateReferralCode(user.id);
      setReferralCode(code.code);

      // Lấy thống kê
      const referralStats = await getReferralStats(user.id);
      setStats(referralStats.stats);
      setReferrals(referralStats.referrals);

      // Lấy tổng coins đã nhận
      const coins = await getReferralCoinsEarned(user.id);
      setCoinsEarned(coins);
    } catch (error) {
      console.error("Error loading referral data:", error);
      toast.error("Không thể tải dữ liệu giới thiệu");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode);
    toast.success("Đã copy mã giới thiệu");
  };

  const shareCode = async () => {
    const success = await shareContent({
      referralCode,
      userName: user?.full_name,
    });

    if (!success && !navigator.share) {
      setShareDialogOpen(true);
    }
  };

  if (loading) {
    return (
      <div>
        <AppHeader title="Giới thiệu bạn bè" back />
        <DataLoadingState message="Đang tải..." />
      </div>
    );
  }

  if (!stats) {
    return (
      <div>
        <AppHeader title="Giới thiệu bạn bè" back />
        <div className="p-4 text-center text-muted-foreground">
          Không thể tải dữ liệu giới thiệu
        </div>
      </div>
    );
  }

  const nextMilestone = stats.completedReferrals < 5 ? 5 : stats.completedReferrals < 10 ? 10 : null;
  const progressToMilestone = nextMilestone
    ? (stats.completedReferrals / nextMilestone) * 100
    : 100;

  return (
    <div className="pb-nav">
      <AppHeader title="Giới thiệu bạn bè" back />

      <div className="space-y-4 p-4">
        {/* Mã giới thiệu */}
        <Card className="rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 p-5 dark:from-blue-950/20 dark:to-cyan-950/20">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold">Mã giới thiệu của bạn</h3>
          </div>

          <div className="mb-4 rounded-xl bg-white/60 p-4 text-center dark:bg-black/20">
            <p className="mb-2 text-xs text-muted-foreground">Chia sẻ mã này với bạn bè</p>
            <p className="text-3xl font-bold tracking-wider text-primary">{referralCode}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={copyCode} variant="outline" className="rounded-xl">
              <Copy className="mr-2 h-4 w-4" />
              Copy mã
            </Button>
            <Button onClick={shareCode} className="rounded-xl">
              <Share2 className="mr-2 h-4 w-4" />
              Chia sẻ
            </Button>
          </div>
        </Card>

        {/* Thống kê */}
        <Card className="rounded-2xl p-4">
          <div className="mb-4 flex items-center gap-2">
            <Gift className="h-5 w-5 text-amber-600" />
            <h3 className="font-semibold">Thành tích của bạn</h3>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Tổng giới thiệu</p>
              <p className="text-2xl font-bold text-foreground">{stats.totalReferrals}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Hoàn thành</p>
              <p className="text-2xl font-bold text-green-600">{stats.completedReferrals}</p>
            </div>
          </div>

          <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/20">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Tổng xu đã nhận</p>
              <CoinBalance coins={coinsEarned} size="sm" />
            </div>
          </div>

          {nextMilestone && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Mốc tiếp theo: {nextMilestone} người</span>
                <span className="font-medium">
                  {stats.completedReferrals}/{nextMilestone}
                </span>
              </div>
              <Progress value={progressToMilestone} className="h-2" />
            </div>
          )}
        </Card>

        {/* Danh sách bạn bè */}
        {referrals.length > 0 && (
          <Card className="rounded-2xl p-4">
            <h3 className="mb-3 font-semibold">Danh sách bạn bè ({referrals.length})</h3>
            <div className="space-y-2">
              {referrals.map((ref) => (
                <div
                  key={ref.id}
                  className="flex items-center justify-between rounded-xl bg-muted/50 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {ref.expand?.referee?.full_name || "Người dùng"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ref.referee_join_date).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                  <div className="ml-2 flex items-center gap-2">
                    {ref.status === "completed" && (
                      <div className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30">
                        <CheckCircle2 className="h-3 w-3" />
                        Hoàn thành
                      </div>
                    )}
                    {ref.status === "active" && (
                      <div className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30">
                        <Clock className="h-3 w-3" />
                        Đang hoạt động
                      </div>
                    )}
                    {ref.status === "pending" && (
                      <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30">
                        <Clock className="h-3 w-3" />
                        Chờ
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Hướng dẫn */}
        <Card className="rounded-2xl p-4">
          <h3 className="mb-3 font-semibold">Cách thức hoạt động</h3>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                1
              </div>
              <p className="text-muted-foreground">
                Chia sẻ mã giới thiệu của bạn với bạn bè
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                2
              </div>
              <p className="text-muted-foreground">
                Bạn bè nhập mã khi đăng ký → cả 2 nhận xu
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                3
              </div>
              <p className="text-muted-foreground">
                Khi bạn bè hoàn thành ứng lương đầu tiên → bạn nhận thêm xu thưởng
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                4
              </div>
              <p className="text-muted-foreground">
                Đạt mốc 5 và 10 người → nhận thưởng xu đặc biệt
              </p>
            </div>
          </div>
        </Card>
      </div>

      <ShareDialog
        referralCode={referralCode}
        userName={user?.full_name}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
      />
    </div>
  );
}
