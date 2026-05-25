import { createFileRoute } from "@tanstack/react-router";

import { getPBUpstream } from "@/lib/pocketbase-config";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

async function proxy(request: Request, splat: string | undefined) {
  const incoming = new URL(request.url);
  const target = `${getPBUpstream()}/${splat ?? ""}${incoming.search}`;

  const headers = new Headers();
  const auth = request.headers.get("authorization");
  if (auth) headers.set("Authorization", auth);
  const ct = request.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);
  headers.set("ngrok-skip-browser-warning", "true");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (e: any) {
    return new Response(
      JSON.stringify({ code: 502, message: `Upstream fetch failed: ${e?.message || e}`, data: {} }),
      { status: 502, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }

  const respHeaders = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(CORS)) respHeaders.set(k, v);
  respHeaders.delete("content-encoding");
  respHeaders.delete("content-length");

  const contentType = upstream.headers.get("content-type") || "";
  if (upstream.status >= 500 && !contentType.includes("application/json")) {
    return new Response(
      JSON.stringify({
        code: 502,
        message: "Backend chấm công đang offline. Vui lòng bật lại PocketBase/ngrok rồi thử lại.",
        data: {},
      }),
      { status: 502, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

export const Route = createFileRoute("/api/public/pb/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request, params }) => proxy(request, params._splat),
      POST: async ({ request, params }) => proxy(request, params._splat),
      PATCH: async ({ request, params }) => proxy(request, params._splat),
      PUT: async ({ request, params }) => proxy(request, params._splat),
      DELETE: async ({ request, params }) => proxy(request, params._splat),
    },
  },
});
