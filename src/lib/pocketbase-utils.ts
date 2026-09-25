/**
 * Escape PocketBase filter string values
 */
export function escapePb(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Create OR filter for relation field
 */
export function relationInFilter(field: string, ids: string[]) {
  const cleanIds = [...new Set(ids.filter(Boolean))];
  if (!cleanIds.length) return "";
  return cleanIds.map((id) => `${field}="${escapePb(id)}"`).join(" || ");
}
