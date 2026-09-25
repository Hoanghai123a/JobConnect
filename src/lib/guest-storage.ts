export const GUEST_LOCAL_OWNER_ID = "guest-local";

export function readGuestStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null");
    return value === null ? fallback : (value as T);
  } catch {
    return fallback;
  }
}

export function writeGuestStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota and private-mode errors.
  }
}
