import { pb } from "./pocketbase";
import { escapePb } from "./pocketbase-utils";
import { deductCoins, fetchBalance, addCoins } from "./garden-server";

export interface Reward {
  id: string;
  title: string;
  description: string;
  category: "voucher" | "gift" | "cash" | "service";
  point_cost: number;
  stock_quantity: number;
  available_quantity: number;
  is_active: boolean;
  image?: string;
  terms: string;
  order: number;
  created?: string;
  updated?: string;
}

export interface RewardRedemption {
  id: string;
  user: string;
  reward: string;
  points_spent: number;
  status: "pending" | "approved" | "delivered" | "cancelled";
  delivery_info: any;
  approved_by?: string;
  approved_at?: string;
  delivered_at?: string;
  admin_note?: string;
  created: string;
  updated?: string;
}

export async function getActiveRewards(): Promise<Reward[]> {
  return pb.collection("rewards").getFullList<Reward>({
    filter: "is_active = true",
    sort: "order,title",
  });
}

export async function redeemReward(params: {
  userId: string;
  rewardId: string;
  deliveryInfo: any;
}): Promise<RewardRedemption> {
  const reward = await pb.collection("rewards").getOne<Reward>(params.rewardId);

  if (!reward.is_active) {
    throw new Error("Phần thưởng không còn khả dụng");
  }

  if (reward.available_quantity <= 0 && reward.stock_quantity !== -1) {
    throw new Error("Phần thưởng đã hết");
  }

  // Lấy balance hiện tại và kiểm tra số xu
  const balance = await fetchBalance(params.userId);
  if (balance.coins < reward.point_cost) {
    throw new Error("Bạn không đủ xu để đổi quà này");
  }

  // Cập nhật số lượng reward trước để đảm bảo không bị race condition
  if (reward.stock_quantity !== -1) {
    try {
      await pb.collection("rewards").update(params.rewardId, {
        available_quantity: reward.available_quantity - 1,
      });
    } catch (error) {
      console.error("Error updating reward quantity:", error);
      throw new Error("Không thể cập nhật số lượng phần thưởng");
    }
  }

  try {
    // Trừ xu từ garden_balances
    await deductCoins(balance.id, balance.coins, reward.point_cost);

    // Tạo record đổi quà
    const redemption = await pb
      .collection("reward_redemptions")
      .create<RewardRedemption>({
        user: params.userId,
        reward: params.rewardId,
        points_spent: reward.point_cost,
        status: "pending",
        delivery_info: params.deliveryInfo,
      });

    return redemption;
  } catch (error) {
    // Rollback: Hoàn lại số lượng reward nếu trừ xu hoặc tạo redemption thất bại
    if (reward.stock_quantity !== -1) {
      try {
        await pb.collection("rewards").update(params.rewardId, {
          available_quantity: reward.available_quantity,
        });
      } catch (rollbackError) {
        console.error("Error rolling back reward quantity:", rollbackError);
      }
    }
    throw error;
  }
}

export async function getUserRedemptions(
  userId: string
): Promise<RewardRedemption[]> {
  return pb.collection("reward_redemptions").getFullList<RewardRedemption>({
    filter: `user = "${escapePb(userId)}"`,
    sort: "-created",
    expand: "reward",
  });
}

export async function cancelRedemption(params: {
  redemptionId: string;
  adminNote: string;
  adminId: string;
}): Promise<void> {
  // Lấy thông tin redemption
  const redemption = await pb
    .collection("reward_redemptions")
    .getOne<RewardRedemption>(params.redemptionId, {
      expand: "reward,user",
    });

  if (redemption.status !== "pending") {
    throw new Error("Chỉ có thể từ chối đơn đang chờ duyệt");
  }

  const reward = (redemption.expand as any)?.reward as Reward;
  if (!reward) {
    throw new Error("Không tìm thấy thông tin phần thưởng");
  }

  // Hoàn xu cho user
  const balance = await fetchBalance(redemption.user);
  await addCoins(balance.id, balance.coins, redemption.points_spent);

  // Hoàn lại số lượng reward nếu có giới hạn
  if (reward.stock_quantity !== -1) {
    await pb.collection("rewards").update(reward.id, {
      available_quantity: reward.available_quantity + 1,
    });
  }

  // Cập nhật status của redemption
  await pb.collection("reward_redemptions").update(params.redemptionId, {
    status: "cancelled",
    admin_note: params.adminNote,
  });
}
