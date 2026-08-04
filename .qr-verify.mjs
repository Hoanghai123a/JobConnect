import sharp from "sharp";
import jsQR from "jsqr";
import { build } from "esbuild";
import { rmSync, readFileSync } from "node:fs";

const file = "C:/Users/admin/Pictures/CCCD HL/5.jpg";
const out = "./.qr-verify-bundle.mjs";
await build({ entryPoints: ["src/lib/cccd-qr.ts"], bundle: true, format: "esm", platform: "neutral", mainFields: ["module", "main"], outfile: out, logLevel: "silent" });
const mod = await import("./.qr-verify-bundle.mjs?v=" + Date.now());
const src = readFileSync(out, "utf8");

const num = (name) => Number(new RegExp(name + "\\s*=\\s*([0-9.]+)").exec(src)[1]);
const QUAD = num("QUADRANT_OVERLAP_RATIO"), REF = num("REFINED_OVERLAP_RATIO");
const REFINED_LONG_EDGE = num("REFINED_LONG_EDGE"), AUTO = num("AUTO_LONG_EDGE"), MAXUP = num("MAX_UPSCALE");

const slice = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
const buildQuadrantRegions = new Function("QUADRANT_OVERLAP_RATIO", slice("function buildQuadrantRegions", "function buildRefinedRegions") + "; return buildQuadrantRegions;")(QUAD);
const buildRefinedRegions = new Function("buildQuadrantRegions", "REFINED_OVERLAP_RATIO", slice("function buildRefinedRegions", "function renderScanRegion") + "; return buildRefinedRegions;")(buildQuadrantRegions, REF);

const { width: W, height: H } = await sharp(file).metadata();
const regions = buildQuadrantRegions(W, H);
const refined = buildRefinedRegions(regions);
console.log(`anh ${W}x${H}; vung lon=${regions.length}; vung chi tiet=${refined.length}`);

async function decodeRegion(region, targetLongEdge) {
  const left = Math.max(0, Math.floor(region.x));
  const top = Math.max(0, Math.floor(region.y));
  const width = Math.max(1, Math.min(W - left, Math.ceil(region.width)));
  const height = Math.max(1, Math.min(H - top, Math.ceil(region.height)));
  const requested = targetLongEdge / Math.max(width, height);
  const scale = requested > 1 ? Math.min(requested, MAXUP) : requested;
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const { data, info } = await sharp(file).extract({ left, top, width, height })
    .resize(w, h, { kernel: "lanczos3" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = null;
  try { r = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: "attemptBoth" }); } catch {}
  return r?.data ? mod.parseCccdQrText(r.data) : null;
}

const started = Date.now();
let found = null, stage = "";
found = await decodeRegion({ x: 0, y: 0, width: W, height: H }, AUTO);
if (found) stage = "toan anh";
if (!found) for (let i = 0; i < regions.length && !found; i++) {
  found = await decodeRegion(regions[i], AUTO);
  if (found) stage = `vung lon ${i + 1}/4`;
}
if (!found) for (let i = 0; i < refined.length && !found; i++) {
  found = await decodeRegion(refined[i], REFINED_LONG_EDGE);
  if (found) stage = `vung chi tiet ${i + 1}/${refined.length}`;
}

const elapsed = Date.now() - started;
console.log(found ? `KET QUA: DOC DUOC tai ${stage} sau ${elapsed}ms` : `KET QUA: VAN THAT BAI sau ${elapsed}ms`);
if (found) {
  console.log("truong doc duoc:", Object.entries(found).filter(([, v]) => v).map(([k]) => k).join(", "));
  console.log("so CCCD khop anh:", found.cccd === "002209008843");
}
rmSync(out, { force: true });
process.exit(found ? 0 : 1);
