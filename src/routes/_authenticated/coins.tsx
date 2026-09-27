import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pocketbase";
import { escapePb } from "@/lib/pocketbase-utils";
import { AppHeader } from "@/components/layout/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { CoinBalance } from "@/components/coins/CoinBalance";
import { CoinSettingsDialog } from "@/components/admin/CoinSettingsDialog";
import { toast } from "@/lib/toast";
import { Coins, Gift, Calendar, History, TrendingUp, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/coins")({
  component: CoinsPage,
});

function CoinsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [coins, setCoins] = useState(0);
  const [coinsFromReferral, setCoinsFromReferral] = useState(0);
  const [coinsFromCheckin, setCoinsFromCheckin] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (user?.id) {
      loadCoinsData();
    }
  }, [user?.id]);

  const loadCoinsData = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const balance = await pb
        .collection("garden_balances")
        .getFirstListItem(`user = "${escapePb(user.id)}"`)
        .catch(() => null);

      if (balance) {
        setCoins(balance.coins || 0);
        setCoinsFromReferral(balance.referral_coins_total || 0);
        setCoinsFromCheckin(balance.checkin_coins_total || 0);
      }
    } catch (error) {
      console.error("Error loading coins data:", error);
      toast.error("Không thể tải dữ liệu xu");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div>
        <AppHeader title="Xu" />
        <DataLoadingState message="Đang tải..." />
      </div>
    );
  }

  return (
    <div className="pb-nav">
      <AppHeader
        title="Xu"
        right={
          isAdmin ? (
            <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4 p-4">
        {/* Số dư xu */}
        <Card className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-6 dark:from-amber-950/20 dark:to-orange-950/20">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Coins className="h-5 w-5" />
            <span className="text-sm">Tổng số xu</span>
          </div>
          <CoinBalance coins={coins} size="xl" />
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/60 p-3 dark:bg-black/20">
              <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                Giới thiệu
              </div>
              <CoinBalance coins={coinsFromReferral} size="sm" />
            </div>
            <div className="rounded-xl bg-white/60 p-3 dark:bg-black/20">
              <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                Điểm danh
              </div>
              <CoinBalance coins={coinsFromCheckin} size="sm" />
            </div>
          </div>
        </Card>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-3">
          <Link
            to="/referral"
            className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-xs font-medium text-center">Giới thiệu</span>
          </Link>

          <Link
            to="/weekly-checkin"
            className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Calendar className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-xs font-medium text-center">Điểm danh</span>
          </Link>

          <Link
            to="/rewards"
            className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
              <Gift className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-xs font-medium text-center">Đổi quà</span>
          </Link>
        </div>

        {/* Cách kiếm xu */}
        <Card className="rounded-2xl p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <TrendingUp className="h-5 w-5 text-primary" />
            Cách kiếm xu
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <div>
                <div className="font-medium">Giới thiệu bạn bè</div>
                <div className="text-xs text-muted-foreground">
                  Nhận xu khi bạn bè đăng ký và hoàn thành ứng lương
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <div>
                <div className="font-medium">Điểm danh hàng tuần</div>
                <div className="text-xs text-muted-foreground">
                  Điểm danh mỗi ngày để nhận xu và thưởng hoàn thành tuần
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Dialog cài đặt cho admin */}
      {isAdmin && (
        <CoinSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      )}
    </div>
  );
}
