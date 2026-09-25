import { pb } from "./pocketbase";
import { escapePb } from "./pocketbase-utils";
import { redeemPoints } from "./points";

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

  await redeemPoints({
    userId: params.userId,
    amount: reward.point_cost,
    referenceType: "reward_redemption",
    referenceId: params.rewardId,
    description: `Đổi quà: ${reward.title}`,
  });

  const redemption = await pb
    .collection("reward_redemptions")
    .create<RewardRedemption>({
      user: params.userId,
      reward: params.rewardId,
      points_spent: reward.point_cost,
      status: "pending",
      delivery_info: params.deliveryInfo,
    });

  if (reward.stock_quantity !== -1) {
    await pb.collection("rewards").update(params.rewardId, {
      available_quantity: reward.available_quantity - 1,
    });
  }

  return redemption;
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
