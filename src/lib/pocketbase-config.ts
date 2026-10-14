const DEFAULT_PB_URL = "http://127.0.0.1:8090";

export function getPBUpstream() {
  return (
    (typeof process !== "undefined" ? process.env.PB_URL : undefined) ||
    import.meta.env.VITE_PB_URL ||
    DEFAULT_PB_URL
  );
}

let _cachedUrl: string | undefined;

export function getPBUrl() {
  if (_cachedUrl) return _cachedUrl;

  const runtimePbUrl =
    typeof window !== "undefined" ? (window as { __PB_URL__?: string }).__PB_URL__ : undefined;

  _cachedUrl =
    runtimePbUrl ||
    (typeof window !== "undefined" &&
    typeof window.location !== "undefined" &&
    window.location.origin
      ? `${window.location.origin}/api/public/pb`
      : getPBUpstream());

  return _cachedUrl;
}

// Deprecated: use getPBUrl() instead
export const PB_URL = getPBUpstream(); // Fallback to upstream for SSR
