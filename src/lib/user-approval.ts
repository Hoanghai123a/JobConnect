export type ApprovalStatus = "pending" | "approved" | "rejected";

export function getApprovalStatus(user: any): ApprovalStatus {
  if (user?.role === "admin") return "approved";

  if (user?.approvalStatus === "pending") return "pending";
  if (user?.approvalStatus === "rejected") return "rejected";
  if (user?.approvalStatus === "approved") return "approved";

  if (user?.approved === false || user?.approved === "false" || user?.approved === "0") {
    return "pending";
  }

  return "approved";
}

export function isUserApproved(user: any): boolean {
  return getApprovalStatus(user) === "approved";
}
