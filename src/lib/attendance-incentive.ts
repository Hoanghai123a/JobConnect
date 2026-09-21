import type { AttendanceRow, Shift } from "./salary";
import { EMPTY_BUCKETS, distributeDay, calcSalary, formatVND } from "./salary";

export interface DailySalaryEstimate {
  work: number; // Tiền nếu đi làm (8h HC)
  off: number; // Tiền nếu nghỉ (0đ)
  difference: number; // Chênh lệch
}

/**
 * Tính tiền lương dự kiến cho 1 ngày đi làm vs nghỉ
 */
export function estimateDailySalary(
  date: string,
  userProfile: {
    lcb: number;
    chuyen_can: number;
    doi_song: number;
    tham_nien: number;
  },
  shift: Shift = "day",
  isHoliday = false,
  hcHours = 8,
  otHours = 0,
): DailySalaryEstimate {
  // Tính lương nếu đi làm
  const workRow: AttendanceRow = {
    date,
    shift,
    is_holiday: isHoliday,
    hc_hours: hcHours,
    ot_hours: otHours,
    attendance_type: "work",
  };

  const workBuckets = EMPTY_BUCKETS();
  distributeDay(workRow, workBuckets);
  const workSalary = calcSalary(workBuckets, {
    lcb: userProfile.lcb,
    chuyen_can: 0, // Không tính chuyên cần cho 1 ngày
    doi_song: userProfile.doi_song / 26, // Phụ cấp đời sống theo ngày
    tham_nien: 0, // Thâm niên tính theo tháng
  });

  return {
    work: Math.round(workSalary.total),
    off: 0,
    difference: Math.round(workSalary.total),
  };
}

/**
 * Kiểm tra date có phải "ngày mai" hay không
 */
export function isTomorrow(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [year, month, day] = dateStr.split("-").map(Number);
  const target = new Date(year, month - 1, day);

  return target.getTime() === tomorrow.getTime();
}
