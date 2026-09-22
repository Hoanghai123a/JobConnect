import { createFileRoute } from "@tanstack/react-router";
import {
  getPublicAdminToken,
  jsonPublicError,
  publicPbFetch,
  readPublicJson,
} from "@/lib/public-pb-server";

export const Route = createFileRoute("/api/public/sync-guest-complaints")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const filter = url.searchParams.get("filter");

        if (!filter) {
          return jsonPublicError("Missing filter parameter.");
        }

        const token = await getPublicAdminToken();
        if (!token) {
          return jsonPublicError("Backend chưa cấu hình quyền truy cập.", 503);
        }

        const response = await publicPbFetch(
          `/api/collections/complaints/records?filter=${encodeURIComponent(filter)}&perPage=100`,
          {},
          token,
        );

        const body = await readPublicJson(response);
        if (!response.ok) {
          return jsonPublicError(
            body?.message || "Không thể lấy dữ liệu khiếu nại.",
            502,
          );
        }

        return Response.json(body);
      },
    },
  },
});
