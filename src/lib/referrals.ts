import { pb } from "./pocketbase";
import { escapePb } from "./pocketbase-utils";

export interface ReferralCode {
  id: string;
  user: string;
  code: string;
  total_uses: number;
  successful_referrals: number;
  total_points_earned: number;
  is_active: boolean;
  created: string;
  updated: string;
}

export interface Referral {
  id: string;
  referrer: string;
  referee: string;
  referral_code: string;
  status: "pending" | "active" | "completed" | "cancelled";
  referee_join_date: string;
  referee_first_advance_date?: string;
  points_awarded: number;
  bonus_milestone?: string;
  completed_at?: string;
  created: string;
  updated?: string;
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function getOrCreateReferralCode(
  userId: string
): Promise<ReferralCode> {
  const existing = await pb
    .collection("referral_codes")
    .getFirstListItem<ReferralCode>(`user = "${escapePb(userId)}"`)
    .catch(() => null);

  if (existing) return existing;

  let code = generateReferralCode();
  let attempts = 0;
  while (attempts < 10) {
    const duplicate = await pb
      .collection("referral_codes")
      .getFirstListItem(`code = "${code}"`)
      .catch(() => null);

    if (!duplicate) break;
    code = generateReferralCode();
    attempts++;
  }

  return pb.collection("referral_codes").create<ReferralCode>({
    user: userId,
    code,
    total_uses: 0,
    successful_referrals: 0,
    total_points_earned: 0,
    is_active: true,
  });
}

export async function applyReferralCode(
  refereeId: string,
  code: string
): Promise<boolean> {
  const referralCode = await pb
    .collection("referral_codes")
    .getFirstListItem<ReferralCode>(
      `code = "${escapePb(code)}" && is_active = true`
    )
    .catch(() => null);

  if (!referralCode || referralCode.user === refereeId) {
    return false;
  }

  const existingReferral = await pb
    .collection("referrals")
    .getFirstListItem(`referee = "${escapePb(refereeId)}"`)
    .catch(() => null);

  if (existingReferral) {
    return false;
  }

  await pb.collection("referrals").create({
    referrer: referralCode.user,
    referee: refereeId,
    referral_code: code,
    status: "pending",
    referee_join_date: new Date().toISOString(),
    points_awarded: 0,
  });

  await pb.collection("referral_codes").update(referralCode.id, {
    total_uses: referralCode.total_uses + 1,
  });

  return true;
}

export async function getReferralStats(userId: string) {
  const referralCode = await getOrCreateReferralCode(userId);

  const referrals = await pb.collection("referrals").getFullList<Referral>({
    filter: `referrer = "${escapePb(userId)}"`,
    sort: "-created",
  });

  const stats = {
    totalReferrals: referrals.length,
    pendingReferrals: referrals.filter((r) => r.status === "pending").length,
    activeReferrals: referrals.filter((r) => r.status === "active").length,
    completedReferrals: referrals.filter((r) => r.status === "completed")
      .length,
    totalPointsEarned: referralCode.total_points_earned,
  };

  return { referralCode, referrals, stats };
}
