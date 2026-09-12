import { createFileRoute } from "@tanstack/react-router";
import { handlePublicComplaintRequest } from "@/lib/public-guest-submissions-server";

export const Route = createFileRoute("/api/public/complaint")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePublicComplaintRequest(request),
    },
  },
});
