export function parseMoneyInput(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

export function formatMoneyInput(value: string | number | null | undefined) {
  const parsed = parseMoneyInput(value);
  return parsed ? parsed.toLocaleString("vi-VN") : "";
}
