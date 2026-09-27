import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { pb } from "@/lib/pocketbase";
import { escapePb } from "@/lib/pocketbase-utils";
import { Card } from "@/components/ui/card";
import { CoinBalance } from "@/components/coins/CoinBalance";
import { TierBadge } from "@/components/coins/TierBadge";
import { Coins, Gift, Users, CalendarDays, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CoinsDashboardCardProps {
  userId: string;
}

export function CoinsDashboardCard({ userId }: CoinsDashboardCardProps) {
  const [coins, setCoins] = useState(0);
  const [tier, setTier] = useState<"bronze" | "silver" | "gold" | "platinum">("bronze");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCoinsData();
  }, [userId]);

  const loadCoinsData = async () => {
    try {
      // Lấy garden balance
      const balance = await pb
        .collection("garden_balances")
        .getFirstListItem(`user = "${escapePb(userId)}"`)
        .catch(() => null);

      if (balance) {
        setCoins(balance.coins || 0);
      }

      // Lấy points để tính tier
      const points = await pb
        .collection("user_points")
        .getFirstListItem(`user = "${escapePb(userId)}"`)
        .catch(() => null);

      if (points) {
        setTier(points.tier || "bronze");
      }
    } catch (error) {
      console.error("Error loading coins data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="rounded-2xl p-4">
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Đang tải...
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
      <div className="p-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
              <Coins className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold">Xu của tôi</h3>
              <p className="text-xs text-muted-foreground">Kiếm xu, đổi quà</p>
            </div>
          </div>
          <TierBadge tier={tier} size="sm" />
        </div>

        {/* Coin Balance */}
        <div className="mb-4 rounded-xl bg-white/60 p-4 dark:bg-black/20">
          <p className="mb-1 text-xs text-muted-foreground">Số dư hiện tại</p>
          <CoinBalance coins={coins} size="lg" showIcon={false} />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-2">
          <Link
            to="/referral"
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl bg-white/60 p-3 transition-colors hover:bg-white/80 dark:bg-black/20 dark:hover:bg-black/30"
            )}
          >
            <Users className="h-5 w-5 text-blue-600" />
            <span className="text-xs font-medium">Giới thiệu</span>
          </Link>

          <Link
            to="/weekly-checkin"
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl bg-white/60 p-3 transition-colors hover:bg-white/80 dark:bg-black/20 dark:hover:bg-black/30"
            )}
          >
            <CalendarDays className="h-5 w-5 text-green-600" />
            <span className="text-xs font-medium">Điểm danh</span>
          </Link>

          <Link
            to="/rewards"
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl bg-white/60 p-3 transition-colors hover:bg-white/80 dark:bg-black/20 dark:hover:bg-black/30"
            )}
          >
            <Gift className="h-5 w-5 text-purple-600" />
            <span className="text-xs font-medium">Đổi quà</span>
          </Link>
        </div>

        {/* View Details Link */}
        <Link
          to="/account"
          search={{ tab: "coins" }}
          className="mt-3 flex items-center justify-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Xem chi tiết
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  );
}
