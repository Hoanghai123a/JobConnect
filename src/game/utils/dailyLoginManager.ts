/**
 * Daily Login Reward Manager - Phase 16
 * Xử lý logic điểm danh, streak tracking, và phát thưởng
 */

import { GAME_CONFIG } from "../config/game";
import type { GameState, DailyReward } from "../types";

/**
 * Format Date thành YYYY-MM-DD theo local timezone
 */
export function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Kiểm tra xem ngày A và ngày B có liên tiếp không (B = A + 1 day)
 */
export function isConsecutiveDay(dateA: string, dateB: string): boolean {
  const a = new Date(dateA);
  const b = new Date(dateB);
  const diff = b.getTime() - a.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.abs(diff - oneDayMs) < 12 * 60 * 60 * 1000; // Cho phép ±12h vì timezone
}

/**
 * Xử lý logic Daily Login khi vào game
 * - Nếu ngày hôm nay chưa login: reset dailyClaimedToday = false
 * - Nếu ngắt streak: reset loginStreak về 1
 * @returns true nếu cần show Daily Reward Modal
 */
export function checkDailyLogin(state: GameState): boolean {
  const today = getTodayString();
  const lastLogin = state.lastLoginDate;

  // Lần đầu login hoặc login sau ngày mới
  if (!lastLogin || lastLogin !== today) {
    // Kiểm tra streak
    if (lastLogin && isConsecutiveDay(lastLogin, today)) {
      // Ngày liên tiếp → tăng streak
      state.loginStreak = ((state.loginStreak || 1) % 7) + 1; // 1-7, sau 7 quay về 1
    } else {
      // Ngắt streak hoặc first time → reset về 1
      state.loginStreak = 1;
    }

    // Reset claimed flag cho ngày mới
    state.lastLoginDate = today;
    state.dailyClaimedToday = false;

    console.log(`🎁 New day! Streak: Day ${state.loginStreak}/7`);
    return true; // Cần show modal
  }

  // Đã login hôm nay
  console.log(`✅ Already logged in today (Streak: Day ${state.loginStreak}/7)`);
  return !state.dailyClaimedToday; // Show modal nếu chưa claim
}

/**
 * Phát thưởng cho ngày hiện tại
 */
export function claimDailyReward(state: GameState): DailyReward | null {
  if (state.dailyClaimedToday) {
    console.warn("⚠️ Đã nhận thưởng hôm nay rồi!");
    return null;
  }

  const day = state.loginStreak || 1;
  const reward = GAME_CONFIG.dailyRewards.find((r) => r.day === day);

  if (!reward) {
    console.error(`❌ Không tìm thấy phần thưởng cho ngày ${day}`);
    return null;
  }

  // Phát coins
  if (reward.coins) {
    state.coins += reward.coins;
    console.log(`💰 +${reward.coins} xu`);
  }

  // Phát seeds
  if (reward.seeds) {
    if (reward.seeds.carrot) {
      state.seeds.carrot += reward.seeds.carrot;
      console.log(`🥕 +${reward.seeds.carrot} Hạt Cà Rốt`);
    }
    if (reward.seeds.wheat) {
      state.seeds.wheat += reward.seeds.wheat;
      console.log(`🌾 +${reward.seeds.wheat} Hạt Lúa Mì`);
    }
    if (reward.seeds.tomato) {
      state.seeds.tomato += reward.seeds.tomato;
      console.log(`🍅 +${reward.seeds.tomato} Hạt Cà Chua`);
    }
  }

  // Đánh dấu đã claim
  state.dailyClaimedToday = true;

  console.log(`🎉 Đã nhận thưởng Ngày ${day}: ${reward.description}`);

  return reward;
}

/**
 * Get reward info for a specific day
 */
export function getRewardForDay(day: number): DailyReward | undefined {
  return GAME_CONFIG.dailyRewards.find((r) => r.day === day);
}

/**
 * Console cheat: Giả lập chuyển sang ngày hôm sau để test
 */
export function debugAdvanceDay(state: GameState): void {
  const today = new Date(state.lastLoginDate || getTodayString());
  today.setDate(today.getDate() + 1);
  const tomorrow = today.toISOString().split("T")[0];

  state.lastLoginDate = tomorrow;
  state.dailyClaimedToday = false;

  console.log(`🐛 DEBUG: Advanced to ${tomorrow} (Streak will update on next checkDailyLogin)`);
}

/**
 * Console cheat: Reset streak về ngày 1
 */
export function debugResetStreak(state: GameState): void {
  state.loginStreak = 1;
  state.dailyClaimedToday = false;
  state.lastLoginDate = undefined;
  console.log("🐛 DEBUG: Reset streak to Day 1");
}

/**
 * Console cheat: Set to specific day
 */
export function debugSetDay(state: GameState, day: number): void {
  if (day < 1 || day > 7) {
    console.error("❌ Day must be between 1-7");
    return;
  }
  state.loginStreak = day;
  state.dailyClaimedToday = false;
  console.log(`🐛 DEBUG: Set to Day ${day}/7`);
}
