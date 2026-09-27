import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pb, fileUrl } from "@/lib/pocketbase";
import { cancelRedemption, type Reward, type RewardRedemption } from "@/lib/rewards";
import { useRewardsRealtime } from "@/lib/use-rewards-realtime";
import { AppHeader } from "@/components/layout/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CoinBalance } from "@/components/coins/CoinBalance";
import { toast } from "@/lib/toast";
import {
  Coins,
  Users,
  Calendar,
  Save,
  Gift,
  Plus,
  Pencil,
  Trash2,
  Package,
  ShoppingBag,
  CheckCircle2,
  X,
  Clock,
  Upload,
  ChevronDown,
  ChevronUp,
  Download,
  Filter
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createStaffActionLog } from "@/lib/audit-staff";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/admin/coin-settings")({
  component: CoinSettingsPage,
});

type CoinSetting = {
  id: string;
  key: string;
  value: number;
  description: string;
};

type RewardForm = Omit<Reward, "id" | "created" | "updated"> & {
  image_file?: File;
};

const DEFAULT_SETTINGS = [
  {
    key: "referral_signup",
    description: "Xu thưởng cho người giới thiệu khi bạn bè đăng ký",
    defaultValue: 50,
    icon: Users,
    category: "referral",
  },
  {
    key: "referral_referee_bonus",
    description: "Xu thưởng cho người được giới thiệu khi đăng ký",
    defaultValue: 30,
    icon: Users,
    category: "referral",
  },
  {
    key: "referral_first_advance",
    description: "Xu thưởng khi bạn bè hoàn thành ứng lương đầu tiên",
    defaultValue: 100,
    icon: Users,
    category: "referral",
  },
  {
    key: "referral_milestone_5",
    description: "Xu thưởng khi đạt mốc 5 người giới thiệu thành công",
    defaultValue: 250,
    icon: Users,
    category: "referral",
  },
  {
    key: "referral_milestone_10",
    description: "Xu thưởng khi đạt mốc 10 người giới thiệu thành công",
    defaultValue: 750,
    icon: Users,
    category: "referral",
  },
  {
    key: "daily_checkin_mode",
    description: "Chế độ tính xu điểm danh hàng ngày",
    defaultValue: 0, // 0 = cố định, 1 = ngẫu nhiên
    icon: Calendar,
    category: "checkin",
    isMode: true,
  },
  {
    key: "daily_checkin_base",
    description: "Xu cố định cho mỗi lần điểm danh hàng ngày",
    defaultValue: 5,
    icon: Calendar,
    category: "checkin",
  },
  {
    key: "daily_checkin_min",
    description: "Xu tối thiểu khi điểm danh ngẫu nhiên",
    defaultValue: 3,
    icon: Calendar,
    category: "checkin",
  },
  {
    key: "daily_checkin_max",
    description: "Xu tối đa khi điểm danh ngẫu nhiên",
    defaultValue: 10,
    icon: Calendar,
    category: "checkin",
  },
  {
    key: "weekly_checkin_perfect",
    description: "Xu thưởng khi hoàn thành điểm danh đủ 7 ngày trong tuần",
    defaultValue: 50,
    icon: Calendar,
    category: "checkin",
  },
];

function CoinSettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, number>>({});
  const [checkinMode, setCheckinMode] = useState<"fixed" | "random">("fixed");
  const [activeTab, setActiveTab] = useState("rewards"); // Default to rewards tab

  // Rewards tab states
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [rewardsTabView, setRewardsTabView] = useState<"rewards" | "redemptions">("rewards");

  // Reward form states
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [showRewardDialog, setShowRewardDialog] = useState(false);
  const [savingReward, setSavingReward] = useState(false);
  const [rewardForm, setRewardForm] = useState<RewardForm>({
    title: "",
    description: "",
    category: "voucher",
    point_cost: 0,
    stock_quantity: -1,
    available_quantity: 0,
    is_active: true,
    terms: "",
    order: 0,
  });

  // Reject dialog states
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectingRedemption, setRejectingRedemption] = useState<RewardRedemption | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // Stats expansion & filtering
  const [showExpandedStats, setShowExpandedStats] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Setup realtime updates
  useRewardsRealtime({
    viewer: user,
    onRedemptionChanged: () => {
      loadRewards();
      toast.info("Có cập nhật đơn đổi quà mới!");
    },
    onRewardChanged: () => {
      loadRewards();
    },
  });

  useEffect(() => {
    loadSettings();
    loadRewards();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const records = await pb.collection("coin_settings").getFullList<any>();

      const settingsMap: Record<string, number> = {};
      for (const setting of DEFAULT_SETTINGS) {
        const record = records.find((r) => r.setting_key === setting.key);
        settingsMap[setting.key] = record?.coin_amount ?? setting.defaultValue;
      }

      setSettings(settingsMap);

      // Set checkin mode based on daily_checkin_mode value
      const mode = settingsMap["daily_checkin_mode"] ?? 0;
      setCheckinMode(mode === 1 ? "random" : "fixed");
    } catch (error) {
      console.error("Error loading coin settings:", error);
      toast.error("Không thể tải cài đặt xu");
    } finally {
      setLoading(false);
    }
  };

  const loadRewards = async () => {
    setLoadingRewards(true);
    try {
      const [rewardsData, redemptionsData] = await Promise.all([
        pb.collection("rewards").getFullList<Reward>({
          sort: "-created",
        }),
        pb.collection("reward_redemptions").getFullList<RewardRedemption>({
          sort: "-created",
          expand: "user,reward",
        }),
      ]);

      setRewards(rewardsData);
      setRedemptions(redemptionsData);
    } catch (error) {
      console.error("Error loading rewards data:", error);
    } finally {
      setLoadingRewards(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedSettings = {
        ...settings,
        daily_checkin_mode: checkinMode === "random" ? 1 : 0,
      };

      for (const setting of DEFAULT_SETTINGS) {
        const value = updatedSettings[setting.key];

        try {
          const existing = await pb
            .collection("coin_settings")
            .getFirstListItem(`setting_key = "${setting.key}"`)
            .catch(() => null);

          if (existing) {
            await pb.collection("coin_settings").update(existing.id, {
              coin_amount: value,
              description: setting.description,
              active: true,
            });
          } else {
            await pb.collection("coin_settings").create({
              setting_key: setting.key,
              coin_amount: value,
              description: setting.description,
              category: setting.category,
              active: true,
            });
          }
        } catch (error) {
          console.error(`Error saving ${setting.key}:`, error);
          throw error;
        }
      }

      toast.success("Đã lưu cài đặt xu thành công");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Không thể lưu cài đặt");
    } finally {
      setSaving(false);
    }
  };

  const handleValueChange = (key: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setSettings((prev) => ({ ...prev, [key]: numValue }));
  };

  // Reward CRUD handlers
  const handleCreateReward = () => {
    setEditingReward(null);
    setRewardForm({
      title: "",
      description: "",
      category: "voucher",
      point_cost: 0,
      stock_quantity: -1,
      available_quantity: 0,
      is_active: true,
      terms: "",
      order: 0,
    });
    setShowRewardDialog(true);
  };

  const handleEditReward = (reward: Reward) => {
    setEditingReward(reward);
    setRewardForm({
      title: reward.title,
      description: reward.description,
      category: reward.category,
      point_cost: reward.point_cost,
      stock_quantity: reward.stock_quantity,
      available_quantity: reward.available_quantity,
      is_active: reward.is_active,
      terms: reward.terms,
      order: reward.order,
    });
    setShowRewardDialog(true);
  };

  const handleSaveReward = async () => {
    if (!rewardForm.title.trim()) {
      toast.error("Vui lòng nhập tên phần thưởng");
      return;
    }

    setSavingReward(true);
    try {
      const formData = new FormData();
      formData.append("title", rewardForm.title);
      formData.append("description", rewardForm.description);
      formData.append("category", rewardForm.category);
      formData.append("point_cost", rewardForm.point_cost.toString());
      formData.append("stock_quantity", rewardForm.stock_quantity.toString());
      formData.append("available_quantity", rewardForm.available_quantity.toString());
      formData.append("is_active", rewardForm.is_active.toString());
      formData.append("terms", rewardForm.terms);
      formData.append("order", rewardForm.order.toString());

      if (rewardForm.image_file) {
        formData.append("image", rewardForm.image_file);
      }

      if (editingReward) {
        await pb.collection("rewards").update(editingReward.id, formData);
        await createStaffActionLog({
          staff_id: user!.id,
          action: "update",
          target_type: "reward",
          target_id: editingReward.id,
          details: { title: rewardForm.title },
        });
        toast.success("Đã cập nhật phần thưởng");
      } else {
        await pb.collection("rewards").create(formData);
        await createStaffActionLog({
          staff_id: user!.id,
          action: "create",
          target_type: "reward",
          details: { title: rewardForm.title },
        });
        toast.success("Đã tạo phần thưởng mới");
      }

      setShowRewardDialog(false);
      await loadRewards();
    } catch (error: any) {
      console.error("Error saving reward:", error);
      toast.error(error.message || "Lỗi khi lưu phần thưởng");
    } finally {
      setSavingReward(false);
    }
  };

  const handleDeleteReward = async (reward: Reward) => {
    if (!confirm(`Xoá phần thưởng "${reward.title}"?`)) return;

    try {
      await pb.collection("rewards").delete(reward.id);
      await createStaffActionLog({
        staff_id: user!.id,
        action: "delete",
        target_type: "reward",
        target_id: reward.id,
        details: { title: reward.title },
      });
      toast.success("Đã xoá phần thưởng");
      await loadRewards();
    } catch (error: any) {
      console.error("Error deleting reward:", error);
      toast.error(error.message || "Lỗi khi xoá");
    }
  };

  const handleApproveRedemption = async (redemption: RewardRedemption) => {
    try {
      await pb.collection("reward_redemptions").update(redemption.id, {
        status: "approved",
        approved_by: user!.id,
        approved_at: new Date().toISOString(),
      });
      await createStaffActionLog({
        staff_id: user!.id,
        action: "approve",
        target_type: "reward_redemption",
        target_id: redemption.id,
      });
      toast.success("Đã duyệt đơn đổi quà");
      await loadRewards();
    } catch (error: any) {
      console.error("Error approving redemption:", error);
      toast.error(error.message || "Lỗi khi duyệt");
    }
  };

  const handleRejectRedemption = async (redemption: RewardRedemption) => {
    setRejectingRedemption(redemption);
    setRejectNote("");
    setShowRejectDialog(true);
  };

  const confirmRejectRedemption = async () => {
    if (!rejectingRedemption || !rejectNote.trim()) {
      toast.error("Vui lòng nhập lý do từ chối");
      return;
    }

    try {
      await cancelRedemption({
        redemptionId: rejectingRedemption.id,
        adminNote: rejectNote,
        adminId: user!.id,
      });
      await createStaffActionLog({
        staff_id: user!.id,
        action: "reject",
        target_type: "reward_redemption",
        target_id: rejectingRedemption.id,
        details: { note: rejectNote },
      });
      toast.success("Đã từ chối đơn đổi quà và hoàn xu cho user");
      setShowRejectDialog(false);
      setRejectingRedemption(null);
      setRejectNote("");
      await loadRewards();
    } catch (error: any) {
      console.error("Error rejecting redemption:", error);
      toast.error(error.message || "Lỗi khi từ chối");
    }
  };

  const handleMarkDelivered = async (redemption: RewardRedemption) => {
    try {
      await pb.collection("reward_redemptions").update(redemption.id, {
        status: "delivered",
        delivered_at: new Date().toISOString(),
      });
      await createStaffActionLog({
        staff_id: user!.id,
        action: "mark_delivered",
        target_type: "reward_redemption",
        target_id: redemption.id,
      });
      toast.success("Đã đánh dấu đã giao");
      await loadRewards();
    } catch (error: any) {
      console.error("Error marking delivered:", error);
      toast.error(error.message || "Lỗi khi cập nhật");
    }
  };

  const referralSettings = DEFAULT_SETTINGS.filter((s) => s.category === "referral");
  const checkinSettings = DEFAULT_SETTINGS.filter((s) => s.category === "checkin");

  // Filter redemptions by date range
  const filteredRedemptions = redemptions.filter((r) => {
    if (!dateFrom && !dateTo) return true;
    const createdDate = new Date(r.created);
    if (dateFrom && createdDate < new Date(dateFrom)) return false;
    if (dateTo && createdDate > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  // Calculate statistics
  const stats = {
    total: filteredRedemptions.length,
    pending: filteredRedemptions.filter((r) => r.status === "pending").length,
    approved: filteredRedemptions.filter((r) => r.status === "approved").length,
    delivered: filteredRedemptions.filter((r) => r.status === "delivered").length,
    cancelled: filteredRedemptions.filter((r) => r.status === "cancelled").length,
    totalCoinsCollected: filteredRedemptions
      .filter((r) => r.status === "delivered")
      .reduce((sum, r) => sum + (r.points_spent || 0), 0),
  };

  // Export to Excel
  const handleExportExcel = () => {
    const data = filteredRedemptions.map((r) => ({
      "ID": r.id,
      "Người đổi": r.expand?.user_id?.full_name || "N/A",
      "Quà tặng": r.expand?.reward_id?.title || "N/A",
      "Xu tiêu": r.points_spent,
      "Trạng thái": r.status === "pending" ? "Chờ duyệt"
        : r.status === "approved" ? "Chờ giao"
        : r.status === "delivered" ? "Đã giao"
        : "Đã hủy",
      "Ngày tạo": new Date(r.created).toLocaleDateString("vi-VN"),
      "Ghi chú admin": r.admin_note || "",
    }));

    const csv = [
      Object.keys(data[0]).join(","),
      ...data.map((row) => Object.values(row).map(v => `"${v}"`).join(",")),
    ].join("\n");

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `don-doi-qua-${dateFrom || "all"}-${dateTo || "all"}.csv`;
    link.click();
    toast.success("Đã xuất file Excel");
  };

  return (
    <>
      <AppHeader title="Cài đặt xu & Quản lý quà tặng" />

      <div className="flex-1 flex flex-col min-h-0 bg-background">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-4 border-b">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="rewards" className="gap-2">
                <Gift className="h-4 w-4" />
                Quản lý quà tặng
              </TabsTrigger>
              <TabsTrigger value="coins" className="gap-2">
                <Coins className="h-4 w-4" />
                Cài đặt xu
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab: Quản lý quà tặng - HIỂN THỊ ĐẦU TIÊN */}
          <TabsContent value="rewards" className="flex-1 overflow-y-auto px-4 mt-0 min-h-0">
            {loadingRewards ? (
              <div className="py-4">
                <DataLoadingState message="Đang tải quà tặng..." />
              </div>
            ) : (
              <div className="space-y-4 py-4">
                {/* Filter & Export Section */}
                <div className="flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowFilters(!showFilters)}
                    className="gap-2"
                  >
                    <Filter className="h-4 w-4" />
                    {showFilters ? "Ẩn bộ lọc" : "Lọc theo ngày"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExportExcel}
                    disabled={filteredRedemptions.length === 0}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Xuất Excel
                  </Button>
                </div>

                {/* Date Filters */}
                {showFilters && (
                  <Card className="rounded-2xl p-4">
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Lọc theo ngày tạo đơn</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="date-from" className="text-xs text-muted-foreground">
                            Từ ngày
                          </Label>
                          <Input
                            id="date-from"
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="date-to" className="text-xs text-muted-foreground">
                            Đến ngày
                          </Label>
                          <Input
                            id="date-to"
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="h-9"
                          />
                        </div>
                      </div>
                      {(dateFrom || dateTo) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDateFrom("");
                            setDateTo("");
                          }}
                          className="w-full"
                        >
                          Xóa bộ lọc
                        </Button>
                      )}
                    </div>
                  </Card>
                )}

                {/* Stats Cards - 3 main cards */}
                <div className="grid grid-cols-3 gap-3">
                  <Card className="rounded-2xl p-3">
                    <p className="text-xs text-muted-foreground">Số đơn</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                  </Card>
                  <Card className="rounded-2xl p-3">
                    <p className="text-xs text-muted-foreground">Chờ duyệt</p>
                    <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                  </Card>
                  <Card className="rounded-2xl p-3">
                    <p className="text-xs text-muted-foreground">Chờ giao</p>
                    <p className="text-2xl font-bold text-blue-600">{stats.approved}</p>
                  </Card>
                </div>

                {/* Expand Button */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowExpandedStats(!showExpandedStats)}
                  className="w-full gap-2"
                >
                  {showExpandedStats ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Thu gọn thống kê
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Xem thêm thống kê
                    </>
                  )}
                </Button>

                {/* Expanded Stats Cards */}
                {showExpandedStats && (
                  <div className="grid grid-cols-3 gap-3">
                    <Card className="rounded-2xl p-3">
                      <p className="text-xs text-muted-foreground">Đã giao</p>
                      <p className="text-2xl font-bold text-green-600">{stats.delivered}</p>
                    </Card>
                    <Card className="rounded-2xl p-3">
                      <p className="text-xs text-muted-foreground">Đã hủy</p>
                      <p className="text-2xl font-bold text-red-600">{stats.cancelled}</p>
                    </Card>
                    <Card className="rounded-2xl p-3">
                      <p className="text-xs text-muted-foreground">Xu thu về</p>
                      <p className="text-2xl font-bold text-amber-600">
                        {stats.totalCoinsCollected.toLocaleString()}
                      </p>
                    </Card>
                  </div>
                )}

                {/* Sub-tabs */}
                <Tabs value={rewardsTabView} onValueChange={(v: any) => setRewardsTabView(v)} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 rounded-2xl">
                    <TabsTrigger value="rewards" className="rounded-xl">
                      <ShoppingBag className="mr-2 h-4 w-4" />
                      Danh sách quà
                    </TabsTrigger>
                    <TabsTrigger value="redemptions" className="rounded-xl">
                      <Package className="mr-2 h-4 w-4" />
                      Đơn đổi quà
                    </TabsTrigger>
                  </TabsList>

                  {/* Rewards List */}
                  <TabsContent value="rewards" className="mt-4 space-y-3">
                    <Button onClick={handleCreateReward} className="w-full rounded-xl">
                      <Plus className="mr-2 h-4 w-4" />
                      Thêm phần thưởng mới
                    </Button>

                    {rewards.map((reward) => (
                      <Card key={reward.id} className="rounded-2xl p-4">
                        <div className="flex gap-3">
                          {reward.image && (
                            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                              <img
                                src={fileUrl(reward, reward.image)}
                                alt={reward.title}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <h3 className="font-semibold">{reward.title}</h3>
                                <p className="line-clamp-2 text-xs text-muted-foreground">
                                  {reward.description}
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditReward(reward)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteReward(reward)}
                                  className="h-8 w-8 p-0 text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <CoinBalance coins={reward.point_cost} size="sm" />
                              <div className="flex items-center gap-2 text-xs">
                                {reward.stock_quantity === -1 ? (
                                  <span className="text-muted-foreground">Không giới hạn</span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    Còn {reward.available_quantity}/{reward.stock_quantity}
                                  </span>
                                )}
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-xs font-medium",
                                    reward.is_active
                                      ? "bg-green-100 text-green-700 dark:bg-green-900/30"
                                      : "bg-gray-100 text-gray-700 dark:bg-gray-900/30"
                                  )}
                                >
                                  {reward.is_active ? "Đang hoạt động" : "Tạm ngưng"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}

                    {rewards.length === 0 && (
                      <div className="py-12 text-center text-muted-foreground">
                        <Gift className="mx-auto mb-2 h-12 w-12 opacity-50" />
                        <p>Chưa có phần thưởng nào</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Redemptions List */}
                  <TabsContent value="redemptions" className="mt-4 space-y-3">
                    {redemptions.map((redemption: any) => (
                      <Card key={redemption.id} className="rounded-2xl p-4">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold">
                              {redemption.expand?.reward?.title || "Phần thưởng"}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {redemption.expand?.user?.full_name || "Người dùng"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(redemption.created).toLocaleString("vi-VN")}
                            </p>
                          </div>
                          <RedemptionStatusBadge status={redemption.status} />
                        </div>

                        <div className="mb-3 space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Số xu:</span>
                            <CoinBalance coins={redemption.points_spent} size="sm" />
                          </div>
                          {redemption.delivery_info?.name && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tên:</span>
                              <span>{redemption.delivery_info.name}</span>
                            </div>
                          )}
                          {redemption.delivery_info?.phone && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">SĐT:</span>
                              <span>{redemption.delivery_info.phone}</span>
                            </div>
                          )}
                          {redemption.delivery_info?.address && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Địa chỉ:</span>
                              <span className="truncate">{redemption.delivery_info.address}</span>
                            </div>
                          )}
                        </div>

                        {redemption.status === "pending" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApproveRedemption(redemption)}
                              className="flex-1 rounded-xl"
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Duyệt
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRejectRedemption(redemption)}
                              className="flex-1 rounded-xl"
                            >
                              <X className="mr-2 h-4 w-4" />
                              Từ chối
                            </Button>
                          </div>
                        )}

                        {redemption.status === "approved" && (
                          <Button
                            size="sm"
                            onClick={() => handleMarkDelivered(redemption)}
                            className="w-full rounded-xl"
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Đánh dấu đã giao
                          </Button>
                        )}
                      </Card>
                    ))}

                    {redemptions.length === 0 && (
                      <div className="py-12 text-center text-muted-foreground">
                        <Package className="mx-auto mb-2 h-12 w-12 opacity-50" />
                        <p>Chưa có đơn đổi quà nào</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </TabsContent>

          {/* Tab: Cài đặt xu */}
          <TabsContent value="coins" className="flex-1 overflow-y-auto px-4 mt-0 min-h-0">
            {loading ? (
              <div className="py-4">
                <DataLoadingState message="Đang tải cài đặt..." />
              </div>
            ) : (
              <div className="space-y-6 py-4 pb-32">
                {/* Giới thiệu */}
                <div className="space-y-4">
                  <h3 className="flex items-center gap-2 font-semibold text-sm">
                    <Users className="h-4 w-4 text-blue-600" />
                    Hệ thống giới thiệu
                  </h3>
                  <div className="space-y-3">
                    {referralSettings.map((setting) => (
                      <div key={setting.key} className="space-y-1.5">
                        <Label htmlFor={setting.key} className="text-xs text-muted-foreground">
                          {setting.description}
                        </Label>
                        <div className="flex items-center gap-2">
                          <Coins className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <Input
                            id={setting.key}
                            type="number"
                            min="0"
                            value={settings[setting.key] ?? setting.defaultValue}
                            onChange={(e) => handleValueChange(setting.key, e.target.value)}
                            className="h-9"
                          />
                          <span className="text-xs text-muted-foreground shrink-0">xu</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Điểm danh */}
                <div className="space-y-4">
                  <h3 className="flex items-center gap-2 font-semibold text-sm">
                    <Calendar className="h-4 w-4 text-green-600" />
                    Hệ thống điểm danh
                  </h3>
                  <div className="space-y-4">
                    {/* Chế độ điểm danh */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Chế độ tính xu điểm danh hàng ngày
                      </Label>
                      <RadioGroup
                        value={checkinMode}
                        onValueChange={(value) => setCheckinMode(value as "fixed" | "random")}
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="fixed" id="fixed" />
                          <Label htmlFor="fixed" className="font-normal cursor-pointer">
                            Cố định
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="random" id="random" />
                          <Label htmlFor="random" className="font-normal cursor-pointer">
                            Ngẫu nhiên
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {/* Trường nhập xu theo chế độ */}
                    {checkinMode === "fixed" ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="daily_checkin_base" className="text-xs text-muted-foreground">
                          Xu cố định cho mỗi lần điểm danh hàng ngày
                        </Label>
                        <div className="flex items-center gap-2">
                          <Coins className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <Input
                            id="daily_checkin_base"
                            type="number"
                            min="0"
                            value={settings["daily_checkin_base"] ?? 5}
                            onChange={(e) => handleValueChange("daily_checkin_base", e.target.value)}
                            className="h-9"
                          />
                          <span className="text-xs text-muted-foreground shrink-0">xu</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="daily_checkin_min" className="text-xs text-muted-foreground">
                            Xu tối thiểu khi điểm danh ngẫu nhiên
                          </Label>
                          <div className="flex items-center gap-2">
                            <Coins className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                            <Input
                              id="daily_checkin_min"
                              type="number"
                              min="0"
                              value={settings["daily_checkin_min"] ?? 3}
                              onChange={(e) => handleValueChange("daily_checkin_min", e.target.value)}
                              className="h-9"
                            />
                            <span className="text-xs text-muted-foreground shrink-0">xu</span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="daily_checkin_max" className="text-xs text-muted-foreground">
                            Xu tối đa khi điểm danh ngẫu nhiên
                          </Label>
                          <div className="flex items-center gap-2">
                            <Coins className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                            <Input
                              id="daily_checkin_max"
                              type="number"
                              min="0"
                              value={settings["daily_checkin_max"] ?? 10}
                              onChange={(e) => handleValueChange("daily_checkin_max", e.target.value)}
                              className="h-9"
                            />
                            <span className="text-xs text-muted-foreground shrink-0">xu</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Thưởng hoàn thành tuần */}
                    <div className="space-y-1.5">
                      <Label htmlFor="weekly_checkin_perfect" className="text-xs text-muted-foreground">
                        Xu thưởng khi hoàn thành điểm danh đủ 7 ngày trong tuần
                      </Label>
                      <div className="flex items-center gap-2">
                        <Coins className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <Input
                          id="weekly_checkin_perfect"
                          type="number"
                          min="0"
                          value={settings["weekly_checkin_perfect"] ?? 50}
                          onChange={(e) => handleValueChange("weekly_checkin_perfect", e.target.value)}
                          className="h-9"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">xu</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Save button - fixed at bottom when on coins tab */}
        {activeTab === "coins" && (
          <div className="fixed bottom-0 left-0 right-0 flex gap-3 px-4 py-4 border-t bg-background z-10">
            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex-1"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Đang lưu..." : "Lưu cài đặt"}
            </Button>
          </div>
        )}
      </div>

      {/* Reward Form Dialog */}
      <Dialog open={showRewardDialog} onOpenChange={setShowRewardDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingReward ? "Chỉnh sửa phần thưởng" : "Thêm phần thưởng mới"}
            </DialogTitle>
            <DialogDescription>
              Điền thông tin phần thưởng bên dưới
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tên phần thưởng *</Label>
              <Input
                className="mt-1 rounded-xl"
                value={rewardForm.title}
                onChange={(e) => setRewardForm({ ...rewardForm, title: e.target.value })}
              />
            </div>

            <div>
              <Label className="text-xs">Mô tả</Label>
              <Textarea
                className="mt-1 rounded-xl"
                rows={3}
                value={rewardForm.description}
                onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Loại</Label>
                <Select
                  value={rewardForm.category}
                  onValueChange={(v: any) => setRewardForm({ ...rewardForm, category: v })}
                >
                  <SelectTrigger className="mt-1 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="voucher">Voucher</SelectItem>
                    <SelectItem value="gift">Quà tặng</SelectItem>
                    <SelectItem value="cash">Tiền mặt</SelectItem>
                    <SelectItem value="service">Dịch vụ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Giá xu *</Label>
                <Input
                  type="number"
                  className="mt-1 rounded-xl"
                  value={rewardForm.point_cost}
                  onChange={(e) =>
                    setRewardForm({ ...rewardForm, point_cost: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tổng số lượng (-1 = vô hạn)</Label>
                <Input
                  type="number"
                  className="mt-1 rounded-xl"
                  value={rewardForm.stock_quantity}
                  onChange={(e) =>
                    setRewardForm({ ...rewardForm, stock_quantity: parseInt(e.target.value) || 0 })
                  }
                />
              </div>

              <div>
                <Label className="text-xs">Số lượng còn lại</Label>
                <Input
                  type="number"
                  className="mt-1 rounded-xl"
                  value={rewardForm.available_quantity}
                  onChange={(e) =>
                    setRewardForm({
                      ...rewardForm,
                      available_quantity: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Hình ảnh</Label>
              <Input
                type="file"
                accept="image/*"
                className="mt-1 rounded-xl"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setRewardForm({ ...rewardForm, image_file: file });
                  }
                }}
              />
            </div>

            <div>
              <Label className="text-xs">Điều khoản</Label>
              <Textarea
                className="mt-1 rounded-xl"
                rows={2}
                value={rewardForm.terms}
                onChange={(e) => setRewardForm({ ...rewardForm, terms: e.target.value })}
              />
            </div>

            <div>
              <Label className="text-xs">Thứ tự hiển thị</Label>
              <Input
                type="number"
                className="mt-1 rounded-xl"
                value={rewardForm.order}
                onChange={(e) =>
                  setRewardForm({ ...rewardForm, order: parseInt(e.target.value) || 0 })
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
              <Label className="text-xs">Đang hoạt động</Label>
              <Switch
                checked={rewardForm.is_active}
                onCheckedChange={(checked) => setRewardForm({ ...rewardForm, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRewardDialog(false)}
              className="rounded-xl"
            >
              Huỷ
            </Button>
            <Button
              onClick={handleSaveReward}
              disabled={savingReward}
              className="rounded-xl"
            >
              {savingReward ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Redemption Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Từ chối đơn đổi quà</DialogTitle>
            <DialogDescription>
              Nhập lý do từ chối. Xu sẽ được hoàn lại cho người dùng.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label className="text-xs">Lý do từ chối *</Label>
            <Textarea
              className="mt-1 rounded-xl"
              rows={4}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Ví dụ: Thông tin địa chỉ không hợp lệ..."
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setRejectingRedemption(null);
                setRejectNote("");
              }}
              className="rounded-xl"
            >
              Huỷ
            </Button>
            <Button
              onClick={confirmRejectRedemption}
              disabled={!rejectNote.trim()}
              className="rounded-xl"
              variant="destructive"
            >
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RedemptionStatusBadge({ status }: { status: string }) {
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
