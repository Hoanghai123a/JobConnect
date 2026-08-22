import { pb } from "./pocketbase";

export type UidCounterType = "user" | "employment_history";

export interface AllocateUidResponse {
  type: UidCounterType;
  prefix: string;
  period: string;
  startValue: number;
  endValue: number;
  uids: string[];
}

type UidCounterErrorPayload = {
  message?: string;
  code?: string;
  operation?: string;
};

const UID_ERROR_MESSAGES: Record<string, string> = {
  PB_UNREACHABLE: "Máy chủ không kết nối được PocketBase. Vui lòng thử lại sau.",
  PB_AUTH_EXPIRED: "Phiên quản trị PocketBase đã hết hạn hoặc không hợp lệ.",
  PB_PERMISSION_DENIED: "PocketBase từ chối quyền đọc hoặc cập nhật bộ đếm UID.",
  PB_RECORD_NOT_FOUND: "PocketBase chưa có collection hoặc bản ghi bộ đếm UID cần thiết.",
  PB_READ_FAILED: "Không đọc được bộ đếm UID từ PocketBase.",
  PB_WRITE_FAILED: "Không cập nhật được bộ đếm UID trong PocketBase.",
  PB_VALIDATION_FAILED: "PocketBase từ chối dữ liệu cập nhật bộ đếm UID.",
  UID_PREFIX_MISSING: "PocketBase chưa cấu hình tiền tố UID.",
  UID_COUNTER_INVALID: "Bản ghi bộ đếm UID trong PocketBase không hợp lệ.",
};

async function readResponsePayload(response: Response): Promise<UidCounterErrorPayload | null> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? (value as UidCounterErrorPayload) : null;
  } catch {
    return { message: response.status >= 500 ? "Máy chủ cấp UID trả về lỗi không hợp lệ." : text };
  }
}

async function requestCounter(body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch("/api/uid-counter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Không kết nối được máy chủ cấp UID. Vui lòng kiểm tra mạng và thử lại.");
  }

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    const codeMessage = payload?.code ? UID_ERROR_MESSAGES[payload.code] : "";
    const message = payload?.message || codeMessage || "Không cấp được UID.";
    throw new Error(
      codeMessage && payload?.message && payload.message !== codeMessage
        ? `${codeMessage} Chi tiết: ${payload.message}`
        : message,
    );
  }
  return payload;
}

export async function allocateUserUids(count = 1): Promise<string[]> {
  const result = (await requestCounter({
    action: "allocate",
    type: "user",
    count,
  })) as AllocateUidResponse;
  return result.uids;
}

export async function allocateEmploymentHistoryUids(
  count = 1,
  referenceDate = new Date(),
): Promise<string[]> {
  const result = (await requestCounter({
    action: "allocate",
    type: "employment_history",
    count,
    referenceDate: referenceDate.toISOString(),
  })) as AllocateUidResponse;
  return result.uids;
}

export async function observeManualUid(
  type: UidCounterType,
  uid: string,
  referenceDate = new Date(),
) {
  await requestCounter({
    action: "observe",
    type,
    uid,
    referenceDate: referenceDate.toISOString(),
  });
}
