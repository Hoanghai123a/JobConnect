import type { AdvanceRecord, AdvancePayoutMethod } from "@/lib/advances";

const GUEST_ADVANCE_STORAGE_KEY = "jobconnect.guestAdvances.v1";
const GUEST_COMPLAINT_STORAGE_KEY = "jobconnect.guestComplaints.v1";

export type GuestComplaint = {
  id: string;
  employee_code?: string;
  full_name: string;
  company: string;
  phone: string;
  content: string;
  status?: "pending" | "accepted" | "rejected";
  admin_note?: string;
  resolved_at?: string;
  created: string;
};

export type GuestAdvancePayload = {
  employee_code: string;
  full_name: string;
  company: string;
  phone: string;
  join_date: string;
  bank_name: string;
  bank_account_number: string;
  bank_account_name: string;
  payout_method: AdvancePayoutMethod;
  amount: number;
  reason: string;
};

function readLocal<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeLocal<T>(key: string, rows: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(rows.slice(0, 100)));
}

function getErrorMessage(body: unknown, fallback: string) {
  return typeof body === "object" && body && "message" in body
    ? String((body as { message?: unknown }).message || fallback)
    : fallback;
}

async function postGuestJson<T>(url: string, payload: unknown, fallback: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(body, fallback));
  return body as T;
}

export function readGuestAdvances() {
  return readLocal<AdvanceRecord>(GUEST_ADVANCE_STORAGE_KEY);
}

export function saveGuestAdvance(row: AdvanceRecord) {
  writeLocal(GUEST_ADVANCE_STORAGE_KEY, [
    row,
    ...readGuestAdvances().filter((item) => item.id !== row.id),
  ]);
}

export function readGuestComplaints() {
  return readLocal<GuestComplaint>(GUEST_COMPLAINT_STORAGE_KEY);
}

export function saveGuestComplaint(row: GuestComplaint) {
  writeLocal(GUEST_COMPLAINT_STORAGE_KEY, [
    row,
    ...readGuestComplaints().filter((item) => item.id !== row.id),
  ]);
}

export async function lookupGuestPayroll(employeeCode: string, company: string) {
  return postGuestJson<{
    attendance: unknown[];
    salary: unknown[];
  }>(
    "/api/public/check-payroll",
    { employee_code: employeeCode, company },
    "Không tra cứu được bảng check công/lương.",
  );
}

export async function submitGuestAdvance(payload: GuestAdvancePayload) {
  return postGuestJson<AdvanceRecord>(
    "/api/public/advance-request",
    payload,
    "Không gửi được yêu cầu ứng lương.",
  );
}

export async function submitGuestComplaint(payload: {
  full_name: string;
  phone: string;
  content: string;
}) {
  return postGuestJson<GuestComplaint>(
    "/api/public/complaint",
    payload,
    "Không gửi được khiếu nại.",
  );
}
