import { createFileRoute } from "@tanstack/react-router";
import { fetchAppSettingsRecord } from "@/lib/server-app-brand";

export const Route = createFileRoute("/api/public/manifest/webmanifest")({
  server: {
    handlers: {
      GET: async () => {
        const app = await fetchAppSettingsRecord();
        const name = app?.item.company_name?.trim() || "JobConnect";
        const shortName = name.slice(0, 12) || "JobConnect";
        const iconSrc = app?.item.logo ? "/api/public/app-logo" : "/pwa-icon.svg";

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
                sizes: "192x192",
                type: "image/svg+xml",
                purpose: "any maskable",
              },
              {
                src: iconSrc,
                sizes: "512x512",
                type: "image/svg+xml",
                purpose: "any maskable",
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
