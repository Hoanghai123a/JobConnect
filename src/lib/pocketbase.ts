import PocketBase from "pocketbase";
import { getPBUrl } from "./pocketbase-config";

let _pb: PocketBase | undefined;

export function getPB() {
  if (!_pb) {
    _pb = new PocketBase(getPBUrl());
    _pb.autoCancellation(false);
  }
  return _pb;
}

// Lazy getter for backward compatibility
export const pb = new Proxy({} as PocketBase, {
  get(_, prop) {
    return (getPB() as any)[prop];
  },
});

export type Role = "admin" | "user" | "staff";

export interface UserRecord {
  id: string;
  username?: string;
  email?: string;
  phone?: string;
  full_name?: string;
  cccd?: string;
  cccd_issue_date?: string;
  uid?: string;
  role?: Role;
  approved?: boolean | string;
  approvalStatus?: "pending" | "approved" | "rejected";
  status?: "active" | "disabled";
  attendance_cutoff_day?: number;
  lcb?: number;
  chuyen_can?: number;
  doi_song?: number;
  tham_nien?: number;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  bank_account_note?: string;
  collectionId?: string;
  collectionName?: string;
  avatar?: string;
  gender?: string;
  date_of_birth?: string;
  address?: string;
  must_change_password?: boolean;
  last_login?: string;
  // Leaderboard fields
  employee_code?: string;
  is_internal?: boolean;
}

/** Convert base64 dataURL to File (per HRJob skill rule #1) */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

export function fileUrl(record: any, filename?: string) {
  if (!record || !filename) return "";
  return pb.files.getURL(record, filename);
}

/** Leaderboard types */
export type StaffHoursDataSource = "admin_upload" | "self_checkin";
export type ImportStatus = "preview" | "completed" | "failed" | "rolled_back";

export interface InternalStaffHoursRecord {
  id: string;
  user: string;
  month: string; // Format: "YYYY-MM"
  employee_code?: string; // Snapshot
  full_name?: string; // Snapshot from import file
  factory_name?: string; // Snapshot from import file
  hc_hours: number;
  tc_hours: number;
  total_hours: number;
  source: StaffHoursDataSource;
  batch_id: string;
  previous_record?: string;
  note?: string;
  created: string;
  updated: string;
  expand?: {
    user?: UserRecord;
  };
}

export interface StaffHoursImportHistoryRecord {
  id: string;
  month: string;
  source: StaffHoursDataSource;
  batch_id: string;
  admin_user: string;
  success_count: number;
  error_count: number;
  status: ImportStatus;
  note?: string;
  created: string;
  updated: string;
  expand?: {
    admin_user?: UserRecord;
  };
}

export interface LeaderboardSettingsRecord {
  id: string;
  max_rank_display: number; // Min: 3
  default_data_source: StaffHoursDataSource;
  created: string;
  updated: string;
}

// Expose pb to window for dev testing
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as any).pb = pb;
  (window as any).getCurrentUser = () => pb.authStore.record;
}
