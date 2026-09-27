import { pb } from "./pocketbase";
import { escapePb } from "./pocketbase-utils";
import { awardReferralCoins, getCoinAmount } from "./coin-rewards";
import type { Referral, ReferralCode } from "./referrals";

/**
 * Xử lý khi người dùng nhập mã giới thiệu và đăng ký thành công
 * Award coins cho cả người giới thiệu và người được giới thiệu
 */
export async function processReferralSignup(
  refereeId: string,
  code: string
): Promise<boolean> {
  try {
    // Tìm referral code
    const referralCode = await pb
      .collection("referral_codes")
      .getFirstListItem<ReferralCode>(
        `code = "${escapePb(code)}" && is_active = true`
      );

    if (!referralCode || referralCode.user === refereeId) {
      return false;
    }

    // Check xem đã có referral chưa
    const existingReferral = await pb
      .collection("referrals")
      .getFirstListItem(`referee = "${escapePb(refereeId)}"`)
      .catch(() => null);

    if (existingReferral) {
      return false;
    }

    // Lấy coin settings
    const referrerCoins = await getCoinAmount("referral_signup");
    const refereeCoins = await getCoinAmount("referral_referee_bonus");

    // Tạo referral record
    await pb.collection("referrals").create({
      referrer: referralCode.user,
      referee: refereeId,
      referral_code: code,
      status: "active",
      referee_join_date: new Date().toISOString(),
      points_awarded: 0,
      coins_awarded: referrerCoins,
      referee_coins_awarded: refereeCoins,
    });

    // Award coins cho người giới thiệu
    if (referrerCoins > 0) {
      await awardReferralCoins(
        referralCode.user,
        referrerCoins,
        "Giới thiệu bạn bè đăng ký thành công"
      );
    }

    // Award coins cho người nhập mã
    if (refereeCoins > 0) {
      await awardReferralCoins(refereeId, refereeCoins, "Thưởng nhập mã giới thiệu");
    }

    // Update referral code statistics
    await pb.collection("referral_codes").update(referralCode.id, {
      total_uses: referralCode.total_uses + 1,
      successful_referrals: referralCode.successful_referrals + 1,
      total_points_earned: referralCode.total_points_earned + referrerCoins,
    });

    // Check milestones
    await checkAndAwardMilestones(referralCode.user);

    return true;
  } catch (error) {
    console.error("Error processing referral signup:", error);
    return false;
  }
}

/**
 * Xử lý khi người được giới thiệu hoàn thành lần ứng lương đầu tiên
 */
export async function processReferralFirstAdvance(
  refereeId: string,
  advanceId: string
): Promise<void> {
  try {
    // Tìm referral của user này
    const referral = await pb
      .collection("referrals")
      .getFirstListItem<Referral>(`referee = "${escapePb(refereeId)}"`);

    // Check xem đã award first advance chưa
    if (referral.referee_first_advance_date) {
      return; // Đã award rồi
    }

    const firstAdvanceCoins = await getCoinAmount("referral_first_advance");

    // Update referral record
    const currentCoins = referral.coins_awarded || 0;
    await pb.collection("referrals").update(referral.id, {
      referee_first_advance_date: new Date().toISOString(),
      coins_awarded: currentCoins + firstAdvanceCoins,
      status: "completed",
    });

    // Award coins cho người giới thiệu
    if (firstAdvanceCoins > 0) {
      await awardReferralCoins(
        referral.referrer,
        firstAdvanceCoins,
        "Bạn bè hoàn thành ứng lương đầu tiên"
      );
    }

    // Update referral code total earnings
    const referralCode = await pb
      .collection("referral_codes")
      .getFirstListItem<ReferralCode>(
        `user = "${escapePb(referral.referrer)}"`
      );

    await pb.collection("referral_codes").update(referralCode.id, {
      total_points_earned: referralCode.total_points_earned + firstAdvanceCoins,
    });

    // Check milestones
    await checkAndAwardMilestones(referral.referrer);
  } catch (error) {
    console.error("Error processing referral first advance:", error);
  }
}

/**
 * Kiểm tra và thưởng milestones (5, 10 người)
 */
export async function checkAndAwardMilestones(referrerId: string): Promise<void> {
  try {
    // Đếm số referrals completed
    const referrals = await pb.collection("referrals").getFullList<Referral>({
      filter: `referrer = "${escapePb(referrerId)}" && status = "completed"`,
    });

    const completedCount = referrals.length;

    // Check milestone 5
    if (completedCount === 5) {
      const milestone5Coins = await getCoinAmount("referral_milestone_5");
      if (milestone5Coins > 0) {
        await awardReferralCoins(
          referrerId,
          milestone5Coins,
          "Thưởng mốc 5 người giới thiệu thành công"
        );

        // Update referral code
        const referralCode = await pb
          .collection("referral_codes")
          .getFirstListItem<ReferralCode>(
            `user = "${escapePb(referrerId)}"`
          );

        await pb.collection("referral_codes").update(referralCode.id, {
          total_points_earned: referralCode.total_points_earned + milestone5Coins,
        });
      }
    }

    // Check milestone 10
    if (completedCount === 10) {
      const milestone10Coins = await getCoinAmount("referral_milestone_10");
      if (milestone10Coins > 0) {
        await awardReferralCoins(
          referrerId,
          milestone10Coins,
          "Thưởng mốc 10 người giới thiệu thành công"
        );

        // Update referral code
        const referralCode = await pb
          .collection("referral_codes")
          .getFirstListItem<ReferralCode>(
            `user = "${escapePb(referrerId)}"`
          );

        await pb.collection("referral_codes").update(referralCode.id, {
          total_points_earned: referralCode.total_points_earned + milestone10Coins,
        });
      }
    }
  } catch (error) {
    console.error("Error checking and awarding milestones:", error);
  }
}

/**
 * Lấy tổng coins đã nhận từ giới thiệu
 */
export async function getReferralCoinsEarned(userId: string): Promise<number> {
  try {
    const balance = await pb
      .collection("garden_balances")
      .getFirstListItem(`user = "${escapePb(userId)}"`);

    return balance.referral_coins_total || 0;
  } catch {
    return 0;
  }
}
