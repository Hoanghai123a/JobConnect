import { createFileRoute } from "@tanstack/react-router";
import { fetchAppSettingsRecord } from "@/lib/server-app-brand";

const FALLBACK_ICON = "/icons/app-icon.svg";

export const Route = createFileRoute("/api/public/manifest/webmanifest")({
  server: {
    handlers: {
      GET: async () => {
        const app = await fetchAppSettingsRecord();
        const name = app?.item.company_name?.trim() || "JobConnect";
        const shortName = name.slice(0, 12) || "JobConnect";
        const iconVersion = app?.item.updated || app?.item.id || "";
        const iconSrc = app?.item.logo
          ? `/api/public/app-icon${iconVersion ? `?v=${encodeURIComponent(iconVersion)}` : ""}`
          : FALLBACK_ICON;
        const iconType = app?.item.logo ? undefined : "image/svg+xml";

        return Response.json(
          {
            name,
            short_name: shortName,
            description: "Chấm công, bảng tin và hỗ trợ người lao động.",
            start_url: "/",
            scope: "/",
            display: "standalone",
            display_override: ["standalone", "minimal-ui"],
            background_color: "#f4fbfb",
            theme_color: "#0e6b7a",
            orientation: "portrait-primary",
            icons: [
              {
                src: iconSrc,
                sizes: "any",
                type: iconType,
                purpose: "any",
              },
              {
                src: iconSrc,
                sizes: "any",
                type: iconType,
                purpose: "maskable",
              },
            ],
          },
          {
            headers: {
              "Content-Type": "application/manifest+json; charset=utf-8",
              "Cache-Control": "no-cache",
            },
          },
        );
      },
    },
  },
});
