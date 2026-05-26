const DEFAULT_PB_URL = "https://ripple-skyrocket-progeny.ngrok-free.dev";

const runtimePbUrl =
  typeof window !== "undefined" ? (window as { __PB_URL__?: string }).__PB_URL__ : undefined;

export function getPBUpstream() {
  console.log(import.meta.env);
  return (
    (typeof process !== "undefined" ? process.env.PB_URL : undefined) ||
    import.meta.env.VITE_PB_URL ||
    DEFAULT_PB_URL
  );
}

export const PB_URL =
  runtimePbUrl ||
  (typeof window !== "undefined"
    ? `${window.location.origin}/api/public/pb`
    : import.meta.env.VITE_PB_URL || DEFAULT_PB_URL);
