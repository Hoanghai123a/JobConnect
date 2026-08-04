import { build } from "esbuild";
import { rmSync } from "node:fs";
const out = "./.qr-detector-bundle.mjs";
await build({ entryPoints: ["src/lib/cccd-qr.ts"], bundle: true, format: "esm", platform: "neutral", mainFields: ["module", "main"], outfile: out, logLevel: "silent" });
const mod = await import("./.qr-detector-bundle.mjs?v=" + Date.now());
let closed = 0;
globalThis.createImageBitmap = async () => ({ width: 100, height: 100, close: () => { closed++; } });
globalThis.BarcodeDetector = class {
  static async getSupportedFormats() { return ["qr_code"]; }
  async detect() { return new Promise(() => {}); }
};
const file = new File([new Uint8Array([1, 2, 3])], "fake.png", { type: "image/png" });
const start = Date.now();
const timed = await mod.scanCccdQrFromFileDetailed(file, { timeoutMs: 500 });
const elapsed = Date.now() - start;
console.log(timed.status === "failed" && timed.reason === "timeout" && elapsed < 2000 && closed === 1 ? "PASS  BarcodeDetector treo bi timeout va dong bitmap" : "FAIL  BarcodeDetector timeout");
const controller = new AbortController();
const pending = mod.scanCccdQrFromFileDetailed(file, { timeoutMs: 5000, signal: controller.signal });
setTimeout(() => controller.abort(), 50);
const cancelled = await pending;
console.log(cancelled.status === "failed" && cancelled.reason === "cancelled" && closed === 2 ? "PASS  BarcodeDetector treo bi AbortSignal huy" : "FAIL  BarcodeDetector abort");
rmSync(out, { force: true });
process.exit(timed.status === "failed" && timed.reason === "timeout" && cancelled.status === "failed" && cancelled.reason === "cancelled" && closed === 2 ? 0 : 1);
