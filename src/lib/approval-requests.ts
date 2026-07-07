import { pb, type UserRecord } from "./pocketbase";
import { escapePb } from "./delegations";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "completed";
export type ResponseStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequestRecord {
  id: string;
  title: string;
  content: string;
  images: string[];
  excel_files: string[];
  creator: string;
  admins: string[];
  status: ApprovalStatus;
  completed_at?: string;
  created: string;
  updated: string;
  expand?: {
    creator?: UserRecord;
    admins?: UserRecord[];
  };
}

export interface ApprovalResponseRecord {
  id: string;
  request: string;
  admin: string;
  status: ResponseStatus;
  note: string;
  responded_at?: string;
  created: string;
  updated: string;
  expand?: {
    admin?: UserRecord;
    request?: ApprovalRequestRecord;
  };
}

export async function createApprovalRequest(data: {
  title: string;
  content: string;
  images: File[];
  excelFiles: File[];
  adminIds: string[];
  creatorId: string;
}): Promise<ApprovalRequestRecord> {
  const formData = new FormData();
  formData.append("title", data.title);
  formData.append("content", data.content);
  formData.append("creator", data.creatorId);
  formData.append("status", "pending");
  for (const id of data.adminIds) formData.append("admins", id);
  for (const img of data.images) formData.append("images", img);
  for (const file of data.excelFiles) formData.append("excel_files", file);

  const request = await pb
    .collection("approval_requests")
    .create<ApprovalRequestRecord>(formData);

  await Promise.all(
    data.adminIds.map((adminId) =>
      pb.collection("approval_responses").create({
        request: request.id,
        admin: adminId,
        status: "pending",
        note: "",
      }),
    ),
  );

  return request;
}

export async function respondToApproval(
  responseId: string,
  status: "approved" | "rejected",
  note: string,
): Promise<void> {
  const response = await pb
    .collection("approval_responses")
    .update<ApprovalResponseRecord>(responseId, {
      status,
      note,
      responded_at: new Date().toISOString(),
    });

  const allResponses = await pb
    .collection("approval_responses")
    .getFullList<ApprovalResponseRecord>({
      filter: `request = "${escapePb(response.request)}"`,
    });

  let overall: ApprovalStatus = "pending";
  if (allResponses.some((r) => r.status === "rejected")) {
    overall = "rejected";
  } else if (allResponses.every((r) => r.status === "approved")) {
    overall = "approved";
  }

  if (overall !== "pending") {
    await pb
      .collection("approval_requests")
      .update(response.request, { status: overall });
  }
}

export async function markRequestCompleted(requestId: string): Promise<void> {
  await pb.collection("approval_requests").update(requestId, {
    status: "completed",
    completed_at: new Date().toISOString(),
  });
}

export async function getPendingApprovalCount(adminId: string): Promise<number> {
  const res = await pb.collection("approval_responses").getList(1, 1, {
    filter: `admin = "${escapePb(adminId)}" && status = "pending"`,
  });
  return res.totalItems;
}

export async function deleteOldRequests(beforeDate: string): Promise<number> {
  const requests = await pb
    .collection("approval_requests")
    .getFullList<ApprovalRequestRecord>({
      filter: `created < "${escapePb(beforeDate)}"`,
    });

  await Promise.all(
    requests.map((r) => pb.collection("approval_requests").delete(r.id)),
  );

  return requests.length;
}

export function getRequestFileUrl(
  record: ApprovalRequestRecord,
  filename: string,
  thumb?: string,
): string {
  return pb.files.getURL(record as any, filename, thumb ? { thumb } : undefined);
}
