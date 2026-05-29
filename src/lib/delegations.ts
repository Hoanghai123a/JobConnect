import { pb, type UserRecord } from "./pocketbase";

export type DelegationPermission = "advance" | "check";

export interface UserDelegationRecord {
  id: string;
  grantor: string;
  delegatee: string;
  can_advance?: boolean;
  can_check?: boolean;
  created?: string;
  updated?: string;
  expand?: {
    grantor?: UserRecord;
    delegatee?: UserRecord;
  };
}

export function escapePb(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function relationInFilter(field: string, ids: string[]) {
  const cleanIds = [...new Set(ids.filter(Boolean))];
  if (!cleanIds.length) return `${field}=""`;
  return cleanIds.map((id) => `${field}="${escapePb(id)}"`).join(" || ");
}

export function userDisplayName(user?: Partial<UserRecord> | null) {
  if (!user) return "Không rõ";
  const name = user.full_name || user.username || user.phone || user.employee_code || user.id;
  const code = user.employee_code ? ` · ${user.employee_code}` : "";
  return `${name}${code}`;
}

export async function fetchReceivedDelegations(userId: string, permission?: DelegationPermission) {
  let filter = `delegatee="${escapePb(userId)}"`;
  if (permission === "advance") filter += " && can_advance=true";
  if (permission === "check") filter += " && can_check=true";
  return (await pb.collection("user_delegations").getFullList({
    filter,
    sort: "-created",
    expand: "grantor,delegatee",
  })) as unknown as UserDelegationRecord[];
}
