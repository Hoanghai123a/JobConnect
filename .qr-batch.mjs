import sharp from "sharp";
import jsQR from "jsqr";
import { build } from "esbuild";
import { rmSync } from "node:fs";
import { readdir } from "node:fs/promises";

const dir = "C:/Users/admin/Pictures/CCCD HL";
const out = "./.qr-batch-bundle.mjs";
await build({ entryPoints: ["src/lib/cccd-qr.ts"], bundle: true, format: "esm", platform: "neutral", mainFields: ["module", "main"], outfile: out, logLevel: "silent" });
const mod = await import("./.qr-batch-bundle.mjs?v=" + Date.now());

function quadrants(width, height, ratio) {
  const hw = width / 2, hh = height / 2, ox = width * ratio / 2, oy = height * ratio / 2;
  const rx = Math.max(0, hw - ox), by = Math.max(0, hh - oy);
  return [
    { x: rx, y: 0, width: width - rx, height: hh + oy },
    { x: 0, y: 0, width: hw + ox, height: hh + oy },
    { x: rx, y: by, width: width - rx, height: height - by },
    { x: 0, y: by, width: hw + ox, height: height - by },
  ];
}

async function attempt(file, W, H, region, target, kernel) {
  const left = Math.max(0, Math.floor(region.x)), top = Math.max(0, Math.floor(region.y));
  const width = Math.max(1, Math.min(W - left, Math.ceil(region.width)));
  const height = Math.max(1, Math.min(H - top, Math.ceil(region.height)));
  const requested = target / Math.max(width, height);
  const scale = requested > 1 ? Math.min(requested, 3) : requested;
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const { data, info } = await sharp(file).extract({ left, top, width, height })
    .resize(w, h, { kernel }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = null;
  try { r = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: "attemptBoth" }); } catch {}
  return r?.data ? mod.parseCccdQrText(r.data) : null;
}

async function scan(file, useRefined, kernel) {
  const { width: W, height: H } = await sharp(file).metadata();
  if (await attempt(file, W, H, { x: 0, y: 0, width: W, height: H }, 1600, kernel)) return "toan anh";
  const regions = quadrants(W, H, 0.08);
  for (let i = 0; i < regions.length; i++) if (await attempt(file, W, H, regions[i], 1600, kernel)) return `vung lon ${i + 1}`;
  if (!useRefined) return null;
  const refined = regions.flatMap((p) => quadrants(p.width, p.height, 0.12).map((c) => ({ x: p.x + c.x, y: p.y + c.y, width: c.width, height: c.height })));
  for (let i = 0; i < refined.length; i++) if (await attempt(file, W, H, refined[i], 1200, kernel)) return `vung chi tiet ${i + 1}`;
  return null;
}

const files = (await readdir(dir)).filter((f) => /\.(jpe?g|png)$/i.test(f));
let beforeOk = 0, afterOk = 0;
for (const name of files) {
  const file = `${dir}/${name}`;
  const before = await scan(file, false, "nearest");
  const t0 = Date.now();
  const after = await scan(file, true, "lanczos3");
  const ms = Date.now() - t0;
  if (before) beforeOk++;
  if (after) afterOk++;
  console.log(`${name.padEnd(20)} truoc=${before ? "OK" : "FAIL"}  sau=${after ? "OK (" + after + ")" : "FAIL"}  ${ms}ms`);
}
console.log(`\nTong ${files.length} anh: truoc ${beforeOk} doc duoc, sau ${afterOk} doc duoc`);
rmSync(out, { force: true });
