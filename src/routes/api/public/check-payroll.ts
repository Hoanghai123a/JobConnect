import { createFileRoute } from "@tanstack/react-router";
import { handlePublicCheckPayroll } from "@/lib/public-check-payroll-server";

export const Route = createFileRoute("/api/public/check-payroll")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePublicCheckPayroll(request),
    },
  },
});
