import type { UserRecord } from "./pocketbase";

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
