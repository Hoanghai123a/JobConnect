// Use same-origin proxy in the browser (avoids CORS issues with the upstream
// PocketBase server). Server-side code still hits the upstream directly.
const UPSTREAM = "https://ripple-skyrocket-progeny.ngrok-free.dev";

export const PB_URL =
  (typeof window !== "undefined" && (window as any).__PB_URL__) ||
  (typeof window !== "undefined" ? `${window.location.origin}/api/public/pb` : UPSTREAM);