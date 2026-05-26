import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import netlify from "@netlify/vite-plugin-tanstack-start";
import { nitro } from "nitro/vite";

const isNetlify = process.env.NETLIFY === "1" || process.env.NETLIFY === "true";

export default defineConfig({
  cloudflare: false,
  plugins: [isNetlify ? netlify() : nitro()],
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      allowedHosts: ["chamcongchua.com"],
    },
  },
});
