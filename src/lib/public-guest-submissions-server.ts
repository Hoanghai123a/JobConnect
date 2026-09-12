import {
  getPublicAdminToken,
  jsonPublicError,
  publicPbFetch,
  readPublicJson,
} from "@/lib/public-pb-server";

type JsonRecord = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value: unknown): JsonRecord {
  return typeof value === "object" && value ? (value as JsonRecord) : {};
}

function validPhone(value: string) {
  return value.replace(/\D/g, "").length >= 9;
}

async function createRecord(collection: string, payload: JsonRecord) {
  const token = await getPublicAdminToken();
  if (!token) return jsonPublicError("Backend chưa cấu hình quyền gửi biểu mẫu guest.", 503);

  const response = await publicPbFetch(
    `/api/collections/${encodeURIComponent(collection)}/records`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    token,
  );
  const body = await readPublicJson(response);
  if (!response.ok) {
    return jsonPublicError(body?.message || `Không thể tạo dữ liệu ${collection}.`, 502);
  }
  return Response.json(body);
}

export async function handlePublicAdvanceRequest(request: Request) {
  const body = objectValue(await request.json().catch(() => null));
  const payload = {
    employee_code: text(body.employee_code),
    full_name: text(body.full_name),
    company: text(body.company),
    phone: text(body.phone),
    join_date: text(body.join_date),
    bank_name: text(body.bank_name),
    bank_account_number: text(body.bank_account_number),
    bank_account_name: text(body.bank_account_name),
    payout_method: body.payout_method === "cash" ? "cash" : "bank_transfer",
    amount: Number(body.amount || 0),
    reason: text(body.reason),
    status: "pending",
    recovery_status: "none",
  };

  if (!payload.employee_code || !payload.full_name || !payload.company || !payload.phone) {
    return jsonPublicError("Vui lòng nhập đủ mã nhân viên, họ tên, nhà máy và số điện thoại.");
  }
  if (!validPhone(payload.phone)) return jsonPublicError("Số điện thoại không hợp lệ.");
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    return jsonPublicError("Số tiền xin ứng không hợp lệ.");
  }
  if (!payload.reason) return jsonPublicError("Lý do ứng không được để trống.");
  if (
    payload.payout_method === "bank_transfer" &&
    (!payload.bank_name || !payload.bank_account_number || !payload.bank_account_name)
  ) {
    return jsonPublicError("Vui lòng nhập đủ thông tin tài khoản nhận tiền.");
  }

  const response = await createRecord("advances", payload);
  if (!response.ok) return response;
  const created = objectValue(await response.json().catch(() => null));
  return Response.json({
    ...created,
    id: text(created.id),
    created: text(created.created) || new Date().toISOString(),
    amount: Number(created.amount || payload.amount),
  });
}

export async function handlePublicComplaintRequest(request: Request) {
  const body = objectValue(await request.json().catch(() => null));
  const payload = {
    full_name: text(body.full_name),
    phone: text(body.phone),
    content: text(body.content),
    employee_code: "",
    company: "",
    status: "pending",
  };

  if (!payload.full_name || !payload.content) {
    return jsonPublicError("Vui lòng nhập họ tên và nội dung khiếu nại.");
  }
  if (!validPhone(payload.phone)) return jsonPublicError("Số điện thoại không hợp lệ.");

  const response = await createRecord("complaints", payload);
  if (!response.ok) return response;
  const created = objectValue(await response.json().catch(() => null));
  return Response.json({
    ...created,
    id: text(created.id),
    created: text(created.created) || new Date().toISOString(),
  });
}
