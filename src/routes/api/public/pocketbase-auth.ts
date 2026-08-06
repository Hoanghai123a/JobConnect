import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPBUpstream } from "@/lib/pocketbase-config";

const LoginSchema = z.object({
  identity: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

async function readPocketBaseAuthResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json")
    ? await response.json().catch(() => ({ message: "Backend trả về dữ liệu không hợp lệ." }))
    : {
        message:
          response.status >= 500
            ? "Backend chấm công đang offline. Vui lòng bật lại PocketBase/ngrok rồi thử đăng nhập lại."
            : "Backend trả về dữ liệu không hợp lệ.",
      };
}

async function authWithPassword(identity: string, password: string) {
  const response = await fetch(`${getPBUpstream()}/api/collections/users/auth-with-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ identity, password }),
  });

  const body = await readPocketBaseAuthResponse(response);
  if (response.ok && body?.record?.status === "disabled") {
    return {
      response: new Response(null, { status: 403 }),
      body: { message: "Tài khoản đã bị khóa và không thể đăng nhập." },
    };
  }

  return { response, body };
}

function escapePocketBaseString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function resolveCanonicalIdentity(identity: string) {
  const normalizedIdentity = identity.toLowerCase();
  const escapedIdentity = escapePocketBaseString(identity);
  const filter = encodeURIComponent(`username~"${escapedIdentity}" || email~"${escapedIdentity}"`);
  const response = await fetch(
    `${getPBUpstream()}/api/collections/users/records?page=1&perPage=25&filter=${filter}&fields=username,email`,
    {
      headers: {
        "ngrok-skip-browser-warning": "true",
      },
    },
  );

  if (!response.ok) return null;

  const body = await response.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : [];
  const matched = items.find(
    (item) =>
      String(item?.username || "").toLowerCase() === normalizedIdentity ||
      String(item?.email || "").toLowerCase() === normalizedIdentity,
  );

  return matched?.username || matched?.email || null;
}

function updateLastLogin(token: string, recordId: string) {
  fetch(`${getPBUpstream()}/api/collections/users/records/${recordId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ last_login: new Date().toISOString() }),
  }).catch(() => {});
}

export const Route = createFileRoute("/api/public/pocketbase-auth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = LoginSchema.safeParse(await request.json().catch(() => null));

        if (!parsed.success) {
          return Response.json({ message: "Thiếu tên đăng nhập hoặc mật khẩu." }, { status: 400 });
        }

        try {
          const identityCandidates = [parsed.data.identity, parsed.data.identity.toLowerCase()];
          let lastResult: Awaited<ReturnType<typeof authWithPassword>> | null = null;

          for (const identity of new Set(identityCandidates)) {
            lastResult = await authWithPassword(identity, parsed.data.password);

            if (lastResult.response.ok || lastResult.response.status !== 400) {
              if (lastResult.response.ok && lastResult.body?.token && lastResult.body?.record?.id) {
                updateLastLogin(lastResult.body.token, lastResult.body.record.id);
              }
              return Response.json(lastResult.body, { status: lastResult.response.status });
            }
          }

          const canonicalIdentity = await resolveCanonicalIdentity(parsed.data.identity);
          if (canonicalIdentity && !identityCandidates.includes(canonicalIdentity)) {
            lastResult = await authWithPassword(canonicalIdentity, parsed.data.password);
          }

          if (lastResult?.response.ok && lastResult.body?.token && lastResult.body?.record?.id) {
            updateLastLogin(lastResult.body.token, lastResult.body.record.id);
          }

          return Response.json(lastResult?.body || {}, {
            status: lastResult?.response.status || 400,
          });
        } catch {
          return Response.json({ message: "Không kết nối được máy chủ backend." }, { status: 502 });
        }
      },
    },
  },
});
