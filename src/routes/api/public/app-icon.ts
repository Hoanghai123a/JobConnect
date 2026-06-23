import { createFileRoute } from "@tanstack/react-router";
import { fetchAppSettingsRecord, getAppLogoFileUrl } from "@/lib/server-app-brand";

const FALLBACK_ICON = "/pwa-icon.svg";

function fallback() {
  return new Response(null, {
    status: 302,
    headers: { Location: FALLBACK_ICON, "Cache-Control": "no-cache" },
  });
}

export const Route = createFileRoute("/api/public/app-icon")({
  server: {
    handlers: {
      GET: async () => {
        const app = await fetchAppSettingsRecord();
        if (!app) return fallback();

        const fileUrl = getAppLogoFileUrl(app);
        if (!fileUrl) return fallback();

        const upstreamFile = await fetch(fileUrl, {
          headers: { "ngrok-skip-browser-warning": "true" },
        }).catch(() => null);

        if (!upstreamFile || !upstreamFile.ok) return fallback();

        return new Response(upstreamFile.body, {
          status: 200,
          headers: {
            "Content-Type": upstreamFile.headers.get("content-type") || "image/png",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
