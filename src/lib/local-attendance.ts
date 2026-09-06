import type { AttendanceRow, AttendanceType, Shift } from "./salary";

export const LOCAL_ATTENDANCE_STORAGE_KEY = "jobconnect.localAttendance.v1";
const STORAGE_VERSION = 1;

export interface LocalAttendanceProfile {
  display_name: string;
  attendance_cutoff_day: number;
  lcb: number;
  chuyen_can: number;
  doi_song: number;
  tham_nien: number;
  default_hc_hours: number;
  default_ot_hours: number;
}

export type LocalAttendanceItem = AttendanceRow & { id: string };

export interface LocalAttendanceState {
  version: 1;
  profile: LocalAttendanceProfile | null;
  rows: LocalAttendanceItem[];
}

export const DEFAULT_LOCAL_ATTENDANCE_PROFILE: LocalAttendanceProfile = {
  display_name: "",
  attendance_cutoff_day: 0,
  lcb: 0,
  chuyen_can: 0,
  doi_song: 0,
  tham_nien: 0,
  default_hc_hours: 8,
  default_ot_hours: 0,
};

export function createEmptyLocalAttendanceState(): LocalAttendanceState {
  return { version: STORAGE_VERSION, profile: null, rows: [] };
}

function normalizeRow(value: unknown, index: number): LocalAttendanceItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<LocalAttendanceItem>;
  if (typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return null;
  const shift: Shift = row.shift === "night" ? "night" : "day";
  const attendance_type: AttendanceType =
    row.attendance_type === "off" || row.attendance_type === "paid_leave"
      ? row.attendance_type
      : "work";
  return {
    id: typeof row.id === "string" && row.id ? row.id : `local-${row.date}-${index}`,
    date: row.date,
    shift,
    is_holiday: Boolean(row.is_holiday),
    hc_hours: Number.isFinite(Number(row.hc_hours)) ? Math.max(0, Number(row.hc_hours)) : 0,
    ot_hours: Number.isFinite(Number(row.ot_hours)) ? Math.max(0, Number(row.ot_hours)) : 0,
    attendance_type,
  };
}

function normalizeProfile(value: unknown): LocalAttendanceProfile | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<LocalAttendanceProfile>;
  const display_name = typeof source.display_name === "string" ? source.display_name.trim() : "";
  if (!display_name) return null;
  const numberOrDefault = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    display_name,
    attendance_cutoff_day: Math.min(
      31,
      Math.max(
        0,
        numberOrDefault(
          source.attendance_cutoff_day,
          DEFAULT_LOCAL_ATTENDANCE_PROFILE.attendance_cutoff_day,
        ),
      ),
    ),
    lcb: Math.max(0, numberOrDefault(source.lcb, DEFAULT_LOCAL_ATTENDANCE_PROFILE.lcb)),
    chuyen_can: Math.max(
      0,
      numberOrDefault(source.chuyen_can, DEFAULT_LOCAL_ATTENDANCE_PROFILE.chuyen_can),
    ),
    doi_song: Math.max(
      0,
      numberOrDefault(source.doi_song, DEFAULT_LOCAL_ATTENDANCE_PROFILE.doi_song),
    ),
    tham_nien: Math.max(
      0,
      numberOrDefault(source.tham_nien, DEFAULT_LOCAL_ATTENDANCE_PROFILE.tham_nien),
    ),
    default_hc_hours: Math.max(
      0,
      numberOrDefault(source.default_hc_hours, DEFAULT_LOCAL_ATTENDANCE_PROFILE.default_hc_hours),
    ),
    default_ot_hours: Math.max(
      0,
      numberOrDefault(source.default_ot_hours, DEFAULT_LOCAL_ATTENDANCE_PROFILE.default_ot_hours),
    ),
  };
}

export function readLocalAttendance(): LocalAttendanceState {
  if (typeof window === "undefined") return createEmptyLocalAttendanceState();
  try {
    const raw = window.localStorage.getItem(LOCAL_ATTENDANCE_STORAGE_KEY);
    if (!raw) return createEmptyLocalAttendanceState();
    const parsed = JSON.parse(raw) as Partial<LocalAttendanceState>;
    if (parsed.version !== STORAGE_VERSION) return createEmptyLocalAttendanceState();
    const rows = Array.isArray(parsed.rows)
      ? parsed.rows.map(normalizeRow).filter((row): row is LocalAttendanceItem => Boolean(row))
      : [];
    return { version: 1, profile: normalizeProfile(parsed.profile), rows };
  } catch {
    return createEmptyLocalAttendanceState();
  }
}

export function writeLocalAttendance(state: LocalAttendanceState) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      LOCAL_ATTENDANCE_STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, profile: state.profile, rows: state.rows }),
    );
    return true;
  } catch {
    return false;
  }
}

export function upsertLocalAttendanceRow(
  state: LocalAttendanceState,
  row: Omit<LocalAttendanceItem, "id"> & { id?: string },
): LocalAttendanceState {
  const existing = state.rows.find((item) => item.date === row.date);
  const nextRow: LocalAttendanceItem = {
    ...row,
    id: row.id || existing?.id || `local-${row.date}`,
  };
  return {
    ...state,
    rows: [...state.rows.filter((item) => item.date !== row.date), nextRow].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
  };
}

export function removeLocalAttendanceRow(state: LocalAttendanceState, id: string) {
  return { ...state, rows: state.rows.filter((row) => row.id !== id) };
}
