import { createFileRoute } from "@tanstack/react-router";
import { handlePublicAdvanceRequest } from "@/lib/public-guest-submissions-server";

export const Route = createFileRoute("/api/public/advance-request")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePublicAdvanceRequest(request),
    },
  },
});
