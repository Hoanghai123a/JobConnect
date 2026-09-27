import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pb, fileUrl } from "@/lib/pocketbase";
import type { Reward, RewardRedemption } from "@/lib/rewards";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import {
  Gift,
  Plus,
  Pencil,
  Trash2,
  Package,
  Clock,
  CheckCircle2,
  X,
  Upload,
  ShoppingBag
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createStaffActionLog } from "@/lib/audit-staff";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/admin/rewards")({
  component: AdminRewardsPage,
});

type RewardForm = Omit<Reward, "id" | "created" | "updated"> & {
  image_file?: File;
};

function AdminRewardsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [showRewardDialog, setShowRewardDialog] = useState(false);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
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
      console.error("Error loading admin rewards data:", error);
      toast.error("Không thể tải dữ liệu");
    } finally {
      setLoading(false);
    }
  };

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

    setSaving(true);
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
      await loadData();
    } catch (error: any) {
      console.error("Error saving reward:", error);
      toast.error(error.message || "Lỗi khi lưu phần thưởng");
    } finally {
      setSaving(false);
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
      await loadData();
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
      await loadData();
    } catch (error: any) {
      console.error("Error approving redemption:", error);
      toast.error(error.message || "Lỗi khi duyệt");
    }
  };

  const handleRejectRedemption = async (redemption: RewardRedemption) => {
    const note = prompt("Lý do từ chối:");
    if (!note) return;

    try {
      await pb.collection("reward_redemptions").update(redemption.id, {
        status: "cancelled",
        admin_note: note,
      });
      await createStaffActionLog({
        staff_id: user!.id,
        action: "reject",
        target_type: "reward_redemption",
        target_id: redemption.id,
        details: { note },
      });
      toast.success("Đã từ chối đơn đổi quà");
      await loadData();
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
      await loadData();
    } catch (error: any) {
      console.error("Error marking delivered:", error);
      toast.error(error.message || "Lỗi khi cập nhật");
    }
  };

  if (loading) {
    return (
      <div>
        <AppHeader title="Quản lý phần thưởng" />
        <DataLoadingState message="Đang tải..." />
      </div>
    );
  }

  const pendingRedemptions = redemptions.filter((r) => r.status === "pending");
  const totalRewards = rewards.length;
  const activeRewards = rewards.filter((r) => r.is_active).length;
  const totalRedemptions = redemptions.length;

  return (
    <div className="pb-nav">
      <AppHeader title="Quản lý phần thưởng" />

      <div className="p-4">
        {/* Stats Cards */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Card className="rounded-2xl p-3">
            <p className="text-xs text-muted-foreground">Tổng phần thưởng</p>
            <p className="text-2xl font-bold">{totalRewards}</p>
            <p className="text-xs text-green-600">{activeRewards} đang hoạt động</p>
          </Card>
          <Card className="rounded-2xl p-3">
            <p className="text-xs text-muted-foreground">Đơn đổi quà</p>
            <p className="text-2xl font-bold">{totalRedemptions}</p>
          </Card>
          <Card className="rounded-2xl p-3">
            <p className="text-xs text-muted-foreground">Chờ duyệt</p>
            <p className="text-2xl font-bold text-amber-600">{pendingRedemptions.length}</p>
          </Card>
        </div>

        <Tabs defaultValue="rewards" className="w-full">
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

          {/* Rewards Tab */}
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

          {/* Redemptions Tab */}
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
            <Button onClick={handleSaveReward} disabled={saving} className="rounded-xl">
              {saving ? "Đang lưu..." : editingReward ? "Cập nhật" : "Tạo mới"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
