import { pb } from "./pocketbase";
import { escapePb } from "./pocketbase-utils";

export interface UserPoints {
  id: string;
  user: string;
  total_points: number;
  available_points: number;
  used_points: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  tier_updated_at: string;
  created?: string;
  updated?: string;
}

export interface PointTransaction {
  id?: string;
  user: string;
  type: "earn" | "redeem" | "expire" | "adjust";
  source:
    | "referral"
    | "attendance"
    | "advance_recovery"
    | "login_streak"
    | "manual"
    | "other";
  amount: number;
  balance_after: number;
  reference_type?: string;
  reference_id?: string;
  description: string;
  created_by?: string;
  expires_at?: string;
  created?: string;
  updated?: string;
}

const TIER_THRESHOLDS = {
  bronze: 0,
  silver: 1000,
  gold: 5000,
  platinum: 20000,
} as const;

export const POINT_REWARDS = {
  referral_signup: 100,
  referral_first_advance: 200,
  referral_milestone_5: 500,
  referral_milestone_10: 1500,
  perfect_attendance_week: 50,
  perfect_attendance_month: 300,
  advance_recovery_on_time: 100,
  login_streak_7: 50,
  login_streak_30: 200,
} as const;

export function calculateTier(
  totalPoints: number
): UserPoints["tier"] {
  if (totalPoints >= TIER_THRESHOLDS.platinum) return "platinum";
  if (totalPoints >= TIER_THRESHOLDS.gold) return "gold";
  if (totalPoints >= TIER_THRESHOLDS.silver) return "silver";
  return "bronze";
}

export async function awardPoints(params: {
  userId: string;
  amount: number;
  source: PointTransaction["source"];
  referenceType?: string;
  referenceId?: string;
  description: string;
  expiresAt?: string;
}): Promise<PointTransaction> {
  const userPoints = await pb
    .collection("user_points")
    .getFirstListItem<UserPoints>(`user = "${escapePb(params.userId)}"`)
    .catch(() => null);

  if (!userPoints) {
    const newBalance = params.amount;
    const tier = calculateTier(newBalance);
    await pb.collection("user_points").create({
      user: params.userId,
      total_points: newBalance,
      available_points: newBalance,
      used_points: 0,
      tier,
      tier_updated_at: new Date().toISOString(),
    });

    return pb.collection("point_transactions").create<PointTransaction>({
      user: params.userId,
      type: "earn",
      source: params.source,
      amount: params.amount,
      balance_after: newBalance,
      reference_type: params.referenceType,
      reference_id: params.referenceId,
      description: params.description,
      expires_at: params.expiresAt,
    });
  }

  const newTotalPoints = userPoints.total_points + params.amount;
  const newAvailablePoints = userPoints.available_points + params.amount;
  const newTier = calculateTier(newTotalPoints);

  await pb.collection("user_points").update(userPoints.id, {
    total_points: newTotalPoints,
    available_points: newAvailablePoints,
    tier: newTier,
    tier_updated_at:
      newTier !== userPoints.tier
        ? new Date().toISOString()
        : userPoints.tier_updated_at,
  });

  return pb.collection("point_transactions").create<PointTransaction>({
    user: params.userId,
    type: "earn",
    source: params.source,
    amount: params.amount,
    balance_after: newAvailablePoints,
    reference_type: params.referenceType,
    reference_id: params.referenceId,
    description: params.description,
    expires_at: params.expiresAt,
  });
}

export async function redeemPoints(params: {
  userId: string;
  amount: number;
  referenceType: string;
  referenceId: string;
  description: string;
}): Promise<PointTransaction> {
  const userPoints = await pb
    .collection("user_points")
    .getFirstListItem<UserPoints>(`user = "${escapePb(params.userId)}"`);

  if (userPoints.available_points < params.amount) {
    throw new Error("Không đủ điểm để đổi quà");
  }

  const newAvailablePoints = userPoints.available_points - params.amount;
  const newUsedPoints = userPoints.used_points + params.amount;

  await pb.collection("user_points").update(userPoints.id, {
    available_points: newAvailablePoints,
    used_points: newUsedPoints,
  });

  return pb.collection("point_transactions").create<PointTransaction>({
    user: params.userId,
    type: "redeem",
    source: "other",
    amount: -params.amount,
    balance_after: newAvailablePoints,
    reference_type: params.referenceType,
    reference_id: params.referenceId,
    description: params.description,
  });
}

export async function onReferralSignup(
  referrerId: string,
  refereeId: string
) {
  await awardPoints({
    userId: referrerId,
    amount: POINT_REWARDS.referral_signup,
    source: "referral",
    referenceType: "referral_signup",
    referenceId: refereeId,
    description: "Bạn bè đăng ký thành công",
  });
}

export async function onReferralFirstAdvance(
  referrerId: string,
  refereeId: string,
  advanceId: string
) {
  await awardPoints({
    userId: referrerId,
    amount: POINT_REWARDS.referral_first_advance,
    source: "referral",
    referenceType: "referral_first_advance",
    referenceId: advanceId,
    description: "Bạn bè hoàn thành lần ứng lương đầu tiên",
  });
}

export async function onAdvanceRecoverySuccess(
  userId: string,
  advanceId: string
) {
  await awardPoints({
    userId,
    amount: POINT_REWARDS.advance_recovery_on_time,
    source: "advance_recovery",
    referenceType: "advance",
    referenceId: advanceId,
    description: "Thu hồi ứng lương đúng hạn",
  });
}

export async function getUserPointsSummary(userId: string) {
  const points = await pb
    .collection("user_points")
    .getFirstListItem<UserPoints>(`user = "${escapePb(userId)}"`)
    .catch(() => ({
      id: "",
      user: userId,
      total_points: 0,
      available_points: 0,
      used_points: 0,
      tier: "bronze" as const,
      tier_updated_at: new Date().toISOString(),
    }));

  const nextTier =
    points.tier === "bronze"
      ? "silver"
      : points.tier === "silver"
        ? "gold"
        : points.tier === "gold"
          ? "platinum"
          : null;

  const pointsToNextTier = nextTier
    ? TIER_THRESHOLDS[nextTier] - points.total_points
    : 0;

  return {
    ...points,
    nextTier,
    pointsToNextTier,
  };
}
