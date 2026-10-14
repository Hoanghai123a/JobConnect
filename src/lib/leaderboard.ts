import { pb, type LeaderboardSettingsRecord, type StaffHoursDataSource } from "./pocketbase";

export interface LeaderboardAvatarRecord {
  id: string;
  collectionId?: string;
  collectionName?: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  fullName: string;
  employeeCode: string;
  factoryName: string;
  avatar?: string;
  avatarRecord?: LeaderboardAvatarRecord;
  hcHours: number;
  tcHours: number;
  totalHours: number;
  month: string;
  createdAt?: string;
}

export interface LeaderboardData {
  topEntries: LeaderboardEntry[];
  userEntry?: LeaderboardEntry;
  userRank?: number;
  totalParticipants: number;
}

export interface LeaderboardSettings {
  maxRankDisplay: number;
  defaultDataSource: StaffHoursDataSource;
}

// Cache với TTL 60s
const CACHE_TTL = 60000;
const cache = new Map<string, { data: any; timestamp: number }>();

function getCacheKey(prefix: string, ...args: string[]): string {
  return `${prefix}:${args.join(":")}`;
}

function getCache<T>(key: string): T | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return cached.data as T;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function invalidateLeaderboardCache(): void {
  cache.clear();
}

/**
 * Normalize employee code cho matching
 */
export function normalizeEmployeeCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Tính rank với tie-breaking logic:
 * - total_hours DESC (nhiều giờ hơn = rank cao hơn)
 * - hc_hours DESC (giờ HC nhiều hơn khi bằng total)
 * - full_name ASC (tên A-Z)
 * - created ASC (tạo trước)
 */
export function calculateRankings(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  // Sort theo tie-breaking rules
  const sorted = [...entries].sort((a, b) => {
    // 1. total_hours DESC
    if (b.totalHours !== a.totalHours) return b.totalHours - a.totalHours;
    // 2. hc_hours DESC
    if (b.hcHours !== a.hcHours) return b.hcHours - a.hcHours;
    // 3. full_name ASC
    const nameCompare = a.fullName.localeCompare(b.fullName, "vi");
    if (nameCompare !== 0) return nameCompare;
    // 4. userId ASC (proxy for created)
    return a.userId.localeCompare(b.userId);
  });

  // Assign ranks
  sorted.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  return sorted;
}

interface LeaderboardApiResponse {
  entries?: LeaderboardEntry[];
  topEntries?: LeaderboardEntry[];
  userEntry?: LeaderboardEntry;
  userRank?: number;
  totalParticipants: number;
}

/**
 * Fetch leaderboard settings
 */
export async function getLeaderboardSettings(): Promise<LeaderboardSettings> {
  const cacheKey = getCacheKey("settings");
  const cached = getCache<LeaderboardSettings>(cacheKey);
  if (cached) return cached;

  try {
    const records = await pb
      .collection("leaderboard_settings")
      .getFullList<LeaderboardSettingsRecord>();
    const record = records[0];

    const settings: LeaderboardSettings = {
      maxRankDisplay: record?.max_rank_display || 10,
      defaultDataSource: record?.default_data_source || "admin_upload",
    };

    setCache(cacheKey, settings);
    return settings;
  } catch (error) {
    console.error("Failed to fetch leaderboard settings:", error);
    return {
      maxRankDisplay: 10,
      defaultDataSource: "admin_upload",
    };
  }
}

/**
 * Save leaderboard settings (admin only)
 */
export async function saveLeaderboardSettings(
  settings: Partial<LeaderboardSettings>,
): Promise<void> {
  // Validation
  if (settings.maxRankDisplay !== undefined && settings.maxRankDisplay < 3) {
    throw new Error("Số lượng hiển thị tối thiểu là 3 (cho podium)");
  }

  try {
    const records = await pb
      .collection("leaderboard_settings")
      .getFullList<LeaderboardSettingsRecord>();
    const record = records[0];

    const payload: Record<string, any> = {};
    if (settings.maxRankDisplay !== undefined) {
      payload.max_rank_display = settings.maxRankDisplay;
    }
    if (settings.defaultDataSource !== undefined) {
      payload.default_data_source = settings.defaultDataSource;
    }

    if (record) {
      await pb.collection("leaderboard_settings").update(record.id, payload);
    } else {
      await pb.collection("leaderboard_settings").create({
        max_rank_display: settings.maxRankDisplay || 10,
        default_data_source: settings.defaultDataSource || "admin_upload",
      });
    }

    // Invalidate cache
    invalidateLeaderboardCache();
  } catch (error) {
    console.error("Failed to save leaderboard settings:", error);
    throw error;
  }
}

async function requestLeaderboard(
  month: string,
  source: StaffHoursDataSource,
  maxRankDisplay: number,
): Promise<LeaderboardApiResponse> {
  if (typeof window === "undefined") {
    throw new Error("Không thể tải bảng xếp hạng ngoài trình duyệt.");
  }

  const token = pb.authStore.token;
  if (!token) throw new Error("Phiên đăng nhập không hợp lệ.");

  const query = new URLSearchParams({
    month,
    source,
    maxRankDisplay: String(maxRankDisplay),
  });
  const response = await fetch(`/api/leaderboard?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = (await response.json().catch(() => null)) as
    | (LeaderboardApiResponse & {
        message?: string;
      })
    | null;

  if (!response.ok) {
    throw new Error(payload?.message || "Không tải được bảng xếp hạng.");
  }

  return payload || { totalParticipants: 0 };
}

/** Fetch leaderboard entries for an administrator. */
export async function fetchLeaderboard(
  month: string,
  source: StaffHoursDataSource,
  maxRankDisplay: number,
): Promise<LeaderboardEntry[]> {
  const cacheKey = getCacheKey("leaderboard", month, source, maxRankDisplay.toString());
  const cached = getCache<LeaderboardEntry[]>(cacheKey);
  if (cached) return cached;

  const response = await requestLeaderboard(month, source, maxRankDisplay);
  const entries = response.entries || response.topEntries || [];
  setCache(cacheKey, entries);
  return entries;
}

/**
 * Fetch leaderboard cho user (top N + user's own entry nếu ngoài top N)
 */
export async function fetchLeaderboardForUser(
  month: string,
  source: StaffHoursDataSource,
  userId: string,
  maxRankDisplay: number,
): Promise<LeaderboardData> {
  const response = await requestLeaderboard(month, source, maxRankDisplay);
  if (response.topEntries) {
    return {
      topEntries: response.topEntries,
      userEntry: response.userEntry,
      userRank: response.userRank,
      totalParticipants: response.totalParticipants,
    };
  }

  const entries = response.entries || [];
  const userEntry = entries.find((entry) => entry.userId === userId);
  return {
    topEntries: entries.slice(0, maxRankDisplay),
    userEntry,
    userRank: userEntry?.rank,
    totalParticipants: response.totalParticipants || entries.length,
  };
}

/**
 * Get user's ranking (không fetch toàn bộ data xuống frontend)
 * Backend query để tìm vị trí của user
 */
export async function getUserRanking(
  month: string,
  source: StaffHoursDataSource,
  userId: string,
): Promise<{ rank: number; total: number; entry?: LeaderboardEntry } | null> {
  try {
    const response = await requestLeaderboard(month, source, 10);
    const entry = response.userEntry?.userId === userId ? response.userEntry : undefined;
    return entry && response.userRank
      ? { rank: response.userRank, total: response.totalParticipants, entry }
      : null;
  } catch (error) {
    console.error("Failed to get user ranking:", error);
    return null;
  }
}
