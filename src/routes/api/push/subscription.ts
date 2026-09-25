import { createFileRoute } from "@tanstack/react-router";

import { savePushSubscription } from "@/lib/push-server";

export const Route = createFileRoute("/api/push/subscription")({
  server: {
    handlers: {
      POST: async ({ request }) => savePushSubscription(request),
    },
  },
});
