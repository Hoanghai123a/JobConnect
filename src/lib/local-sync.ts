import { pb } from "./pocketbase";
import {
  readLocalAttendance,
  writeLocalAttendance,
  createEmptyLocalAttendanceState,
  LOCAL_ATTENDANCE_STORAGE_KEY,
  type LocalAttendanceProfile,
  type LocalAttendanceItem,
} from "./local-attendance";

export interface SyncResult {
  success: number;
  skipped: number;
  failed: number;
  errors: string[];
}

const BATCH_SIZE = 10;

/**
 * Kiểm tra có dữ liệu local cần đồng bộ không
 */
export function hasLocalDataToSync(): boolean {
  try {
    const state = readLocalAttendance();
    return state.rows.length > 0 || state.profile !== null;
  } catch {
    return false;
  }
}

/**
 * Đếm số ngày công cần đồng bộ
 */
export function countLocalAttendanceRows(): number {
  try {
    const state = readLocalAttendance();
    return state.rows.length;
  } catch {
    return 0;
  }
}

/**
 * Sync profile data lên users collection
 */
export async function syncProfileToUser(
  userId: string,
  profile: LocalAttendanceProfile,
): Promise<void> {
  await pb.collection("users").update(userId, {
    attendance_cutoff_day: profile.attendance_cutoff_day || 0,
    lcb: profile.lcb || 0,
    chuyen_can: profile.chuyen_can || 0,
    doi_song: profile.doi_song || 0,
    tham_nien: profile.tham_nien || 0,
  });
}

/**
 * Sync attendance rows lên PocketBase với batch processing
 */
export async function syncAttendanceRows(
  userId: string,
  rows: LocalAttendanceItem[],
  onProgress?: (current: number, total: number) => void,
): Promise<SyncResult> {
  const result: SyncResult = {
    success: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  if (rows.length === 0) return result;

  try {
    // Fetch existing dates từ server
    const existingRecords = await pb.collection("attendance").getFullList<{
      date: string;
    }>({
      filter: `user="${userId}"`,
      fields: "date",
    });
    const existingDates = new Set(existingRecords.map((r) => r.date));

    // Filter out duplicates
    const newRows = rows.filter((row) => !existingDates.has(row.date));
    result.skipped = rows.length - newRows.length;

    if (newRows.length === 0) {
      onProgress?.(0, 0);
      return result;
    }

    // Batch sync
    const batches: LocalAttendanceItem[][] = [];
    for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
      batches.push(newRows.slice(i, i + BATCH_SIZE));
    }

    let processed = 0;
    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map((row) =>
          pb.collection("attendance").create({
            user: userId,
            date: row.date,
            shift: row.shift,
            is_holiday: row.is_holiday,
            hc_hours: row.hc_hours,
            ot_hours: row.ot_hours,
            attendance_type: row.attendance_type || "work",
          }),
        ),
      );

      batchResults.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          result.success++;
        } else {
          result.failed++;
          const row = batch[idx];
          result.errors.push(`${row.date}: ${r.reason?.message || "Unknown error"}`);
        }
      });

      processed += batch.length;
      onProgress?.(processed, newRows.length);
    }
  } catch (error) {
    result.failed = rows.length;
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
  }

  return result;
}

/**
 * Đồng bộ tất cả dữ liệu local lên PocketBase
 */
export async function syncLocalDataToPocketBase(
  userId: string,
  onProgress?: (current: number, total: number) => void,
): Promise<SyncResult> {
  const state = readLocalAttendance();

  // Sync profile nếu có
  if (state.profile) {
    await syncProfileToUser(userId, state.profile);
  }

  // Sync attendance rows
  return await syncAttendanceRows(userId, state.rows, onProgress);
}

/**
 * Xóa dữ liệu local sau khi sync thành công
 */
export function clearLocalAttendanceData(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOCAL_ATTENDANCE_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
