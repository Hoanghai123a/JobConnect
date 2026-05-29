import PocketBase from "pocketbase";
import { PB_URL } from "./pocketbase-config";

export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

// Bypass ngrok-free.dev browser warning page (returns HTML otherwise → "Failed to fetch")
pb.beforeSend = function (url, options) {
  options.headers = {
    ...(options.headers || {}),
    "ngrok-skip-browser-warning": "true",
  };
  return { url, options };
};

export type Role = "admin" | "user";

export interface UserRecord {
  id: string;
  username?: string;
  email?: string;
  phone?: string;
  full_name?: string;
  role?: Role;
  approved?: boolean | string;
  approvalStatus?: "pending" | "approved" | "rejected";
  status?: "active" | "disabled";
  default_hc_hours?: number;
  default_ot_hours?: number;
  company?: string;
  employee_code?: string;
  lcb?: number;
  chuyen_can?: number;
  doi_song?: number;
  tham_nien?: number;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  collectionId?: string;
  collectionName?: string;
  avatar?: string;
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
