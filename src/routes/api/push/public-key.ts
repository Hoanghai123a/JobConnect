import { createFileRoute } from "@tanstack/react-router";

import { getVapidPublicKey } from "@/lib/push-server";

export const Route = createFileRoute("/api/push/public-key")({
  server: {
    handlers: {
      GET: async () => Response.json({ publicKey: getVapidPublicKey() }),
    },
  },
});
