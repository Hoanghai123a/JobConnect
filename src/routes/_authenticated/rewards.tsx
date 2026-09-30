import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pocketbase";
import { escapePb } from "@/lib/pocketbase-utils";
import { getActiveRewards, redeemReward, getUserRedemptions, type Reward } from "@/lib/rewards";
import { useRewardsRealtime } from "@/lib/use-rewards-realtime";
import { AppHeader } from "@/components/layout/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { CoinBalance } from "@/components/coins/CoinBalance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { Gift, Package, ShoppingBag, History, Coins, Clock, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/pocketbase";

export const Route = createFileRoute("/_authenticated/rewards")({
  component: RewardsPage,
});

function RewardsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [coins, setCoins] = useState(0);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [deliveryInfo, setDeliveryInfo] = useState({
    name: "",
    phone: "",
    address: "",
    note: "",
  });
  const [redeeming, setRedeeming] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedRedemption, setSelectedRedemption] = useState<any>(null);

  // Setup realtime updates
  useRewardsRealtime({
    viewer: user,
    onRedemptionChanged: () => {
      // Reload redemptions khi có thay đổi
      if (user?.id) {
        getUserRedemptions(user.id).then(setRedemptions).catch(console.error);
      }
    },
    onRewardChanged: () => {
      // Reload rewards khi admin thay đổi
      getActiveRewards().then(setRewards).catch(console.error);
    },
  });

  // Listen to redemption status changes (chi tiết hơn)
  useEffect(() => {
    const handleRedemptionChanged = (event: any) => {
      const { action, record, status, userId } = event.detail;

      // Chỉ notify nếu là đơn của user hiện tại
      if (userId !== user?.id) return;

      if (action === "update") {
        // Admin đã phản hồi đơn đổi quà
        if (status === "approved") {
          toast.success("✅ Đơn đổi quà của bạn đã được duyệt!");
        } else if (status === "delivered") {
          toast.success("🎉 Đơn đổi quà đã được giao!");
        } else if (status === "cancelled") {
          const adminNote = record.admin_note || "Không có lý do cụ thể";
          toast.error(`❌ Đơn đổi quà bị từ chối: ${adminNote}`);
        }
      }
    };

    window.addEventListener("jobconnect:reward-redemption-changed", handleRedemptionChanged);

    return () => {
      window.removeEventListener("jobconnect:reward-redemption-changed", handleRedemptionChanged);
    };
  }, [user?.id]);

  // Listen to coin balance changes
  useEffect(() => {
    const handleCoinBalanceChanged = (event: any) => {
      const { coins } = event.detail;
      setCoins(coins);
      toast.success(`🪙 Số xu của bạn đã được cập nhật: ${coins} xu`);
    };

    window.addEventListener("jobconnect:coin-balance-changed", handleCoinBalanceChanged);

    return () => {
      window.removeEventListener("jobconnect:coin-balance-changed", handleCoinBalanceChanged);
    };
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Load rewards
      const activeRewards = await getActiveRewards();
      setRewards(activeRewards);

      // Load user redemptions
      const userRedemptions = await getUserRedemptions(user.id);
      setRedemptions(userRedemptions);

      // Load user coins
      const balance = await pb
        .collection("garden_balances")
        .getFirstListItem(`user = "${escapePb(user.id)}"`)
        .catch(() => null);

      if (balance) {
        setCoins(balance.coins || 0);
      }
    } catch (error) {
      console.error("Error loading rewards data:", error);
      toast.error("Không thể tải dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemClick = (reward: Reward) => {
    if (coins < reward.point_cost) {
      toast.error("Bạn không đủ xu để đổi quà này");
      return;
    }

    if (reward.stock_quantity !== -1 && reward.stock_quantity <= 0) {
      toast.error("Phần thưởng đã hết");
      return;
    }

    // Kiểm tra số lần user đã đổi phần thưởng này
    if (reward.available_quantity !== -1) {
      const userRedemptionCount = redemptions.filter(
        (r) => r.reward === reward.id && r.status !== "cancelled"
      ).length;

      if (userRedemptionCount >= reward.available_quantity) {
        toast.error(`Bạn chỉ có thể đổi phần thưởng này tối đa ${reward.available_quantity} lần`);
        return;
      }
    }

    setSelectedReward(reward);
    setDeliveryInfo({
      name: user?.full_name || "",
      phone: user?.phone || "",
      address: "",
      note: "",
    });
  };

  const handleRedeem = async () => {
    if (!user?.id || !selectedReward) return;

    setRedeeming(true);
    try {
      await redeemReward({
        userId: user.id,
        rewardId: selectedReward.id,
        deliveryInfo,
      });

      toast.success("Đổi quà thành công! Vui lòng chờ xét duyệt");
      setSelectedReward(null);
      await loadData();
    } catch (error: any) {
      console.error("Error redeeming reward:", error);
      toast.error(error.message || "Lỗi khi đổi quà");
    } finally {
      setRedeeming(false);
    }
  };

  const filteredRewards =
    categoryFilter === "all"
      ? rewards
      : rewards.filter((r) => r.category === categoryFilter);

  if (loading) {
    return (
      <div>
        <AppHeader title="Đổi thưởng" back />
        <DataLoadingState message="Đang tải..." />
      </div>
    );
  }

  return (
    <div className="pb-nav">
      <AppHeader title="Đổi thưởng" back />

      <Tabs defaultValue="rewards" className="w-full">
        <div className="sticky top-0 z-10 border-b bg-background px-4 pt-3">
          <TabsList className="grid w-full grid-cols-2 rounded-2xl">
            <TabsTrigger value="rewards" className="rounded-xl">
              <ShoppingBag className="mr-2 h-4 w-4" />
              Đổi quà
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-xl">
              <History className="mr-2 h-4 w-4" />
              Lịch sử
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="rewards" className="mt-0 p-4">
          {/* Coin Balance */}
          <Card className="mb-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-4 dark:from-amber-950/20 dark:to-orange-950/20">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Số dư của bạn</p>
              <CoinBalance coins={coins} size="lg" />
            </div>
          </Card>

          {/* Category Filter */}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
            <Button
              size="sm"
              variant={categoryFilter === "all" ? "default" : "outline"}
              onClick={() => setCategoryFilter("all")}
              className="rounded-full"
            >
              Tất cả
            </Button>
            <Button
              size="sm"
              variant={categoryFilter === "voucher" ? "default" : "outline"}
              onClick={() => setCategoryFilter("voucher")}
              className="rounded-full"
            >
              Voucher
            </Button>
            <Button
              size="sm"
              variant={categoryFilter === "gift" ? "default" : "outline"}
              onClick={() => setCategoryFilter("gift")}
              className="rounded-full"
            >
              Quà tặng
            </Button>
            <Button
              size="sm"
              variant={categoryFilter === "cash" ? "default" : "outline"}
              onClick={() => setCategoryFilter("cash")}
              className="rounded-full"
            >
              Tiền mặt
            </Button>
          </div>

          {/* Rewards Grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredRewards.map((reward) => (
              <Card
                key={reward.id}
                className="overflow-hidden rounded-2xl"
              >
                {reward.image && (
                  <div className="aspect-video w-full overflow-hidden bg-muted">
                    <img
                      src={fileUrl(reward, reward.image)}
                      alt={reward.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="p-3">
                  <h3 className="mb-1 font-semibold">{reward.title}</h3>
                  <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
                    {reward.description}
                  </p>

                  <div className="mb-3 flex items-center justify-between">
                    <CoinBalance coins={reward.point_cost} size="sm" />
                    {reward.stock_quantity !== -1 && (
                      <span className="text-xs text-muted-foreground">
                        Còn {reward.stock_quantity} suất
                      </span>
                    )}
                  </div>

                  <Button
                    onClick={() => handleRedeemClick(reward)}
                    disabled={
                      coins < reward.point_cost ||
                      (reward.stock_quantity !== -1 && reward.stock_quantity <= 0)
                    }
                    className="w-full rounded-xl"
                    size="sm"
                  >
                    <Gift className="mr-2 h-4 w-4" />
                    {coins < reward.point_cost
                      ? "Không đủ xu"
                      : reward.available_quantity <= 0 && reward.stock_quantity !== -1
                        ? "Hết hàng"
                        : "Đổi ngay"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {filteredRewards.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              <Package className="mx-auto mb-2 h-12 w-12 opacity-50" />
              <p>Chưa có phần thưởng nào</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-0 p-4">
          <div className="space-y-3">
            {redemptions.map((redemption) => (
              <Card
                key={redemption.id}
                className="rounded-2xl p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelectedRedemption(redemption)}
              >
                <div className="mb-2 flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold">
                      {redemption.expand?.reward?.title || "Phần thưởng"}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {new Date(redemption.created).toLocaleString("vi-VN")}
                    </p>
                  </div>
                  <StatusBadge status={redemption.status} />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Đã tiêu:</span>
                  <CoinBalance coins={redemption.points_spent} size="sm" />
                </div>
              </Card>
            ))}

            {redemptions.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                <History className="mx-auto mb-2 h-12 w-12 opacity-50" />
                <p>Chưa có lịch sử đổi quà</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Redemption Detail Dialog */}
      <Dialog open={!!selectedRedemption} onOpenChange={(open) => !open && setSelectedRedemption(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Chi tiết đơn đổi quà</DialogTitle>
            <DialogDescription>
              {selectedRedemption?.expand?.reward?.title || "Phần thưởng"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl bg-muted/50 p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Trạng thái:</span>
                {selectedRedemption && <StatusBadge status={selectedRedemption.status} />}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Xu đã tiêu:</span>
                <CoinBalance coins={selectedRedemption?.points_spent || 0} size="sm" />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ngày đổi:</span>
                <span className="font-medium">
                  {selectedRedemption && new Date(selectedRedemption.created).toLocaleString("vi-VN")}
                </span>
              </div>
            </div>

            {selectedRedemption?.delivery_info && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Thông tin nhận hàng:</p>
                <div className="rounded-xl bg-muted/50 p-3 space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Tên:</span> {JSON.parse(selectedRedemption.delivery_info).name}</p>
                  <p><span className="text-muted-foreground">SĐT:</span> {JSON.parse(selectedRedemption.delivery_info).phone}</p>
                  <p><span className="text-muted-foreground">Địa chỉ:</span> {JSON.parse(selectedRedemption.delivery_info).address}</p>
                  {JSON.parse(selectedRedemption.delivery_info).note && (
                    <p><span className="text-muted-foreground">Ghi chú:</span> {JSON.parse(selectedRedemption.delivery_info).note}</p>
                  )}
                </div>
              </div>
            )}

            {selectedRedemption?.admin_note && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-red-600">
                  {selectedRedemption.status === "cancelled" ? "⚠️ Lý do từ chối:" : "📝 Ghi chú Admin:"}
                </p>
                <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-3 text-sm">
                  {selectedRedemption.admin_note}
                </div>
              </div>
            )}

            {selectedRedemption?.delivered_at && (
              <div className="rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 text-sm">
                <p className="text-green-700 dark:text-green-400">
                  ✅ Đã giao ngày: {new Date(selectedRedemption.delivered_at).toLocaleString("vi-VN")}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedRedemption(null)}
              className="rounded-xl w-full"
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redeem Dialog */}
      <Dialog open={!!selectedReward} onOpenChange={(open) => !open && setSelectedReward(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Xác nhận đổi quà</DialogTitle>
            <DialogDescription>
              {selectedReward?.title}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Giá:</span>
                <CoinBalance coins={selectedReward?.point_cost || 0} size="sm" />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Số dư sau khi đổi:</span>
                <CoinBalance
                  coins={coins - (selectedReward?.point_cost || 0)}
                  size="sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Họ tên *</Label>
              <Input
                className="mt-1 rounded-xl"
                value={deliveryInfo.name}
                onChange={(e) => setDeliveryInfo({ ...deliveryInfo, name: e.target.value })}
              />
            </div>

            <div>
              <Label className="text-xs">Số điện thoại *</Label>
              <Input
                className="mt-1 rounded-xl"
                value={deliveryInfo.phone}
                onChange={(e) => setDeliveryInfo({ ...deliveryInfo, phone: e.target.value })}
              />
            </div>

            <div>
              <Label className="text-xs">Địa chỉ nhận hàng</Label>
              <Textarea
                className="mt-1 rounded-xl"
                rows={2}
                value={deliveryInfo.address}
                onChange={(e) => setDeliveryInfo({ ...deliveryInfo, address: e.target.value })}
              />
            </div>

            <div>
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                className="mt-1 rounded-xl"
                rows={2}
                value={deliveryInfo.note}
                onChange={(e) => setDeliveryInfo({ ...deliveryInfo, note: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedReward(null)}
              className="rounded-xl"
            >
              Huỷ
            </Button>
            <Button
              onClick={handleRedeem}
              disabled={redeeming || !deliveryInfo.name || !deliveryInfo.phone}
              className="rounded-xl"
            >
              {redeeming ? "Đang xử lý..." : "Xác nhận đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; icon: any; className: string }> = {
    pending: {
      label: "Chờ duyệt",
      icon: Clock,
      className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30",
    },
    approved: {
      label: "Đã duyệt",
      icon: CheckCircle2,
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30",
    },
    delivered: {
      label: "Đã giao",
      icon: CheckCircle2,
      className: "bg-green-100 text-green-700 dark:bg-green-900/30",
    },
    cancelled: {
      label: "Đã huỷ",
      icon: X,
      className: "bg-red-100 text-red-700 dark:bg-red-900/30",
    },
  };

  const { label, icon: Icon, className } = config[status] || config.pending;

  return (
    <div className={cn("flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </div>
  );
}
