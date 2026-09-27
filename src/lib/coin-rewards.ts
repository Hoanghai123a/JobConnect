import { pb } from "./pocketbase";
import { escapePb } from "./pocketbase-utils";

export interface CoinSetting {
  id: string;
  setting_key: string;
  coin_amount: number;
  description: string;
  category: "referral" | "checkin" | "milestone" | "other";
  active: boolean;
  created?: string;
  updated?: string;
}

export interface WeeklyCheckin {
  id?: string;
  user: string;
  week_start: string;
  week_end: string;
  checkin_days: string[];
  total_days: number;
  coins_earned: number;
  bonus_claimed: boolean;
  created?: string;
  updated?: string;
}

export interface WeeklyCheckinStatus {
  currentWeek: WeeklyCheckin | null;
  canCheckinToday: boolean;
  hasCheckedInToday: boolean;
  canClaimBonus: boolean;
  daysUntilBonus: number;
  todayDate: string;
}

/**
 * Lấy cấu hình coins từ database, trả về Map để dễ lookup
 */
export async function getCoinSettings(): Promise<Map<string, number>> {
  const settings = await pb
    .collection("coin_settings")
    .getFullList<CoinSetting>({
      filter: "active = true",
    });

  const map = new Map<string, number>();
  settings.forEach((s) => {
    map.set(s.setting_key, s.coin_amount);
  });

  return map;
}

/**
 * Lấy giá trị coin cho một setting key cụ thể
 */
export async function getCoinAmount(settingKey: string): Promise<number> {
  try {
    const setting = await pb
      .collection("coin_settings")
      .getFirstListItem<CoinSetting>(
        `setting_key = "${escapePb(settingKey)}" && active = true`
      );
    return setting.coin_amount;
  } catch {
    return 0;
  }
}

/**
 * Lấy thứ Hai đầu tuần của một ngày cho trước
 * Tuần tính từ thứ Hai đến Chủ nhật
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = CN, 1 = T2, ..., 6 = T7

  // Tính số ngày cần cộng/trừ để về thứ Hai
  const diff = day === 0 ? -6 : 1 - day;

  // Tạo date mới từ year/month/date để tránh vấn đề timezone
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff, 0, 0, 0, 0);

  return result;
}

/**
 * Lấy Chủ nhật cuối tuần của một ngày cho trước
 */
function getSunday(date: Date): Date {
  const monday = getMonday(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

/**
 * Format date thành YYYY-MM-DD (local timezone)
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Lấy trạng thái điểm danh tuần hiện tại
 */
export async function getWeeklyCheckinStatus(
  userId: string
): Promise<WeeklyCheckinStatus> {
  const today = new Date();
  const todayStr = formatDate(today);
  const mondayDate = getMonday(today);
  const mondayStr = formatDate(mondayDate);

  let currentWeek: WeeklyCheckin | null = null;

  try {
    // Query tất cả records của user, sort theo created desc
    const allRecords = await pb
      .collection("weekly_checkins")
      .getFullList<WeeklyCheckin>({
        filter: `user = "${escapePb(userId)}"`,
        sort: '-created',
      });

    // Tìm record có week_start khớp với thứ Hai tuần này
    // PocketBase trả về date dạng "YYYY-MM-DD HH:MM:SS.sssZ"
    currentWeek = allRecords.find(record => {
      // So sánh 10 ký tự đầu tiên (YYYY-MM-DD)
      const recordDatePart = record.week_start.substring(0, 10);
      return recordDatePart === mondayStr;
    }) || null;
  } catch {
    // Chưa có record cho tuần này
  }

  const hasCheckedInToday = currentWeek?.checkin_days.includes(todayStr) || false;
  const totalDays = currentWeek?.total_days || 0;
  const canClaimBonus = totalDays === 7 && !currentWeek?.bonus_claimed;
  const daysUntilBonus = Math.max(0, 7 - totalDays);

  return {
    currentWeek,
    canCheckinToday: !hasCheckedInToday,
    hasCheckedInToday,
    canClaimBonus,
    daysUntilBonus,
    todayDate: todayStr,
  };
}

/**
 * Điểm danh hàng ngày
 * @returns success, số coins nhận được, streak hiện tại
 */
export async function checkInDaily(
  userId: string
): Promise<{ success: boolean; coinsEarned: number; streak: number; message: string }> {
  const status = await getWeeklyCheckinStatus(userId);

  if (!status.canCheckinToday) {
    return {
      success: false,
      coinsEarned: 0,
      streak: status.currentWeek?.total_days || 0,
      message: "Bạn đã điểm danh hôm nay rồi",
    };
  }

  const today = new Date();
  const mondayStr = formatDate(getMonday(today));
  const sundayStr = formatDate(getSunday(today));
  const todayStr = formatDate(today);

  // Lấy số coins cho điểm danh hàng ngày
  let dailyCoins = await getCoinAmount("daily_checkin_base");

  // Nếu chưa có cài đặt, dùng giá trị mặc định
  if (dailyCoins === 0) {
    dailyCoins = 5; // Giá trị mặc định
  }

  if (status.currentWeek) {
    // Update record hiện tại
    const updatedCheckinDays = [...status.currentWeek.checkin_days, todayStr];
    const updatedTotalDays = updatedCheckinDays.length;
    const updatedCoinsEarned = status.currentWeek.coins_earned + dailyCoins;

    await pb.collection("weekly_checkins").update(status.currentWeek.id!, {
      checkin_days: updatedCheckinDays,
      total_days: updatedTotalDays,
      coins_earned: updatedCoinsEarned,
    });

    // Award coins vào garden balance
    await awardCoinsToBalance(userId, dailyCoins, "checkin", "Điểm danh hàng ngày");

    return {
      success: true,
      coinsEarned: dailyCoins,
      streak: updatedTotalDays,
      message: `Điểm danh thành công! Nhận ${dailyCoins} xu. Streak: ${updatedTotalDays}/7`,
    };
  } else {
    // Tạo record mới cho tuần này
    try {
      const newRecordData = {
        user: userId,
        week_start: mondayStr,
        week_end: sundayStr,
        checkin_days: [todayStr],
        total_days: 1,
        coins_earned: dailyCoins,
        bonus_claimed: false,
      };
      console.log("Creating weekly_checkins record:", newRecordData);

      await pb.collection("weekly_checkins").create(newRecordData);

      // Award coins vào garden balance
      await awardCoinsToBalance(userId, dailyCoins, "checkin", "Điểm danh hàng ngày");

      return {
        success: true,
        coinsEarned: dailyCoins,
        streak: 1,
        message: `Điểm danh thành công! Nhận ${dailyCoins} xu. Streak: 1/7`,
      };
    } catch (error: any) {
      // Log chi tiết lỗi để debug
      console.error("Failed to create weekly_checkins:");
      console.error("- Status:", error?.status);
      console.error("- Message:", error?.message);
      console.error("- Data:", JSON.stringify(error?.data, null, 2));
      console.error("- Full error:", error);

      // Nếu lỗi unique constraint, có thể record đã tồn tại
      // Thử query lại và update
      if (error?.status === 400 && error?.data?.user) {
        try {
          // Query lại với điều kiện rộng hơn (chỉ user và trong tuần này)
          const existingRecord = await pb
            .collection("weekly_checkins")
            .getFirstListItem<WeeklyCheckin>(
              `user = "${escapePb(userId)}" && week_start >= "${mondayStr}"`
            );

          // Kiểm tra xem hôm nay đã điểm danh chưa
          if (existingRecord.checkin_days.includes(todayStr)) {
            return {
              success: false,
              coinsEarned: 0,
              streak: existingRecord.total_days,
              message: "Bạn đã điểm danh hôm nay rồi",
            };
          }

          // Update record
          const updatedCheckinDays = [...existingRecord.checkin_days, todayStr];
          const updatedTotalDays = updatedCheckinDays.length;
          const updatedCoinsEarned = existingRecord.coins_earned + dailyCoins;

          await pb.collection("weekly_checkins").update(existingRecord.id!, {
            checkin_days: updatedCheckinDays,
            total_days: updatedTotalDays,
            coins_earned: updatedCoinsEarned,
          });

          // Award coins vào garden balance
          await awardCoinsToBalance(userId, dailyCoins, "checkin", "Điểm danh hàng ngày");

          return {
            success: true,
            coinsEarned: dailyCoins,
            streak: updatedTotalDays,
            message: `Điểm danh thành công! Nhận ${dailyCoins} xu. Streak: ${updatedTotalDays}/7`,
          };
        } catch (retryError) {
          console.error("Retry check-in failed:", retryError);
          throw error; // Throw lỗi gốc nếu retry thất bại
        }
      }
      throw error; // Throw lại lỗi nếu không phải unique constraint
    }
  }
}

/**
 * Claim thưởng hoàn thành tuần (7 ngày)
 */
export async function claimWeeklyBonus(
  userId: string
): Promise<{ success: boolean; bonus: number; message: string }> {
  const status = await getWeeklyCheckinStatus(userId);

  if (!status.canClaimBonus) {
    return {
      success: false,
      bonus: 0,
      message:
        status.currentWeek?.bonus_claimed
          ? "Bạn đã nhận thưởng tuần này rồi"
          : "Bạn chưa điểm danh đủ 7 ngày",
    };
  }

  const weeklyBonus = await getCoinAmount("weekly_checkin_perfect");

  // Update record đánh dấu đã claim
  await pb.collection("weekly_checkins").update(status.currentWeek!.id!, {
    bonus_claimed: true,
  });

  // Award bonus coins
  await awardCoinsToBalance(userId, weeklyBonus, "checkin", "Hoàn thành điểm danh 7 ngày");

  return {
    success: true,
    bonus: weeklyBonus,
    message: `Chúc mừng! Nhận thưởng ${weeklyBonus} xu cho tuần hoàn thành`,
  };
}

/**
 * Award coins vào garden balance
 * Tạo hoặc update garden_balances với tracking riêng cho từng nguồn
 */
async function awardCoinsToBalance(
  userId: string,
  amount: number,
  source: "referral" | "checkin",
  description: string
): Promise<void> {
  // Lấy balance hiện tại
  let balance: any = null;
  try {
    balance = await pb
      .collection("garden_balances")
      .getFirstListItem(`user = "${escapePb(userId)}"`);
  } catch {
    // Chưa có balance, tạo mới với đầy đủ fields bắt buộc theo schema
    await pb.collection("garden_balances").create({
      user: userId,
      coins: amount,
      reserve_balance: 0,
      referral_coins_total: source === "referral" ? amount : 0,
      checkin_coins_total: source === "checkin" ? amount : 0,
    });
    return;
  }

  // Update balance - gửi tất cả required fields theo schema
  const newCoins = (balance.coins ?? 0) + amount;
  const updateData: any = {
    coins: newCoins,
    reserve_balance: balance.reserve_balance ?? 0,
    referral_coins_total: balance.referral_coins_total ?? 0,
    checkin_coins_total: balance.checkin_coins_total ?? 0,
  };

  // Cập nhật tracking field theo source
  if (source === "referral") {
    updateData.referral_coins_total = (balance.referral_coins_total ?? 0) + amount;
  } else if (source === "checkin") {
    updateData.checkin_coins_total = (balance.checkin_coins_total ?? 0) + amount;
  }

  await pb.collection("garden_balances").update(balance.id, updateData);
}

/**
 * Award coins cho referral (exported để dùng ở referral-coins.ts)
 */
export async function awardReferralCoins(
  userId: string,
  amount: number,
  description: string
): Promise<void> {
  await awardCoinsToBalance(userId, amount, "referral", description);
}
