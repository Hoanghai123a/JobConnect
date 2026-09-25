import { createFileRoute } from "@tanstack/react-router";

import { sendApprovalPush } from "@/lib/push-server";

export const Route = createFileRoute("/api/push/approval")({
  server: {
    handlers: {
      POST: async ({ request }) => sendApprovalPush(request),
    },
  },
});
