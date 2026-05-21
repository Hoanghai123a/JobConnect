import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PB_URL } from "@/lib/pocketbase-config";

const LoginSchema = z.object({
  identity: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const Route = createFileRoute("/api/public/pocketbase-auth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = LoginSchema.safeParse(await request.json().catch(() => null));

        if (!parsed.success) {
          return Response.json({ message: "Thiếu tên đăng nhập hoặc mật khẩu." }, { status: 400 });
        }

        try {
          const response = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify(parsed.data),
          });
          const contentType = response.headers.get("content-type") || "";
          const body = contentType.includes("application/json")
            ? await response.json().catch(() => ({ message: "Backend trả về dữ liệu không hợp lệ." }))
            : {
                message:
                  response.status >= 500
                    ? "Backend chấm công đang offline. Vui lòng bật lại PocketBase/ngrok rồi thử đăng nhập lại."
                    : "Backend trả về dữ liệu không hợp lệ.",
              };

          return Response.json(body, { status: response.status });
        } catch {
          return Response.json({ message: "Không kết nối được máy chủ backend." }, { status: 502 });
        }
      },
    },
  },
});