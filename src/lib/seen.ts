const PREFIX = "seen:";

function key(scope: string, userId: string) {
  return `${PREFIX}${scope}:${userId}`;
}

export function getSeen(scope: string, userId?: string): number {
  if (!userId || typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(key(scope, userId));
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}

export function markSeen(scope: string, userId?: string, at: number = Date.now()) {
  if (!userId || typeof window === "undefined") return;
  window.localStorage.setItem(key(scope, userId), String(at));
}
