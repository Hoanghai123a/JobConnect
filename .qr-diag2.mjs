import sharp from "sharp";
import jsQR from "jsqr";

const file = "C:/Users/admin/Pictures/CCCD HL/5.jpg";
const { width: W, height: H } = await sharp(file).metadata();

async function rgba(p) {
  const { data, info } = await p.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`channels=${info.channels}`);
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}
function decode(img) {
  try { return Boolean(jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data); }
  catch { return false; }
}
function quadrants(width, height, overlapRatio = 0.08) {
  const hw = width / 2, hh = height / 2;
  const ox = width * overlapRatio / 2, oy = height * overlapRatio / 2;
  const rx = Math.max(0, hw - ox), by = Math.max(0, hh - oy);
  return [
    { x: 0, y: 0, width: hw + ox, height: hh + oy },
    { x: rx, y: 0, width: width - rx, height: hh + oy },
    { x: 0, y: by, width: hw + ox, height: height - by },
    { x: rx, y: by, width: width - rx, height: height - by },
  ];
}
function intBox(r, parentW, parentH, offsetX=0, offsetY=0) {
  const left = offsetX + Math.max(0, Math.floor(r.x));
  const top = offsetY + Math.max(0, Math.floor(r.y));
  const width = Math.max(1, Math.min(offsetX + parentW - left, Math.ceil(r.width)));
  const height = Math.max(1, Math.min(offsetY + parentH - top, Math.ceil(r.height)));
  return { left, top, width, height };
}
async function testBox(label, box, target, kernel) {
  const scale = Math.min(target / Math.max(box.width, box.height), 3);
  const width = Math.round(box.width * scale), height = Math.round(box.height * scale);
  const ok = decode(await rgba(sharp(file).extract(box).resize(width, height, { kernel })));
  console.log(`${ok ? "PASS" : "fail"} ${label} target=${target} kernel=${kernel} out=${width}x${height}`);
  return ok;
}

const top = quadrants(W, H)[1];
const topBox = intBox(top, W, H);
console.log("top-right box", topBox);
for (const target of [600, 800, 900, 1000, 1200, 1400, 1600, 2000]) {
  await testBox("vung lon tren-phai", topBox, target, "nearest");
  await testBox("vung lon tren-phai", topBox, target, "lanczos3");
}

console.log("--- chia 2x2 lan 2 ben trong vung tren-phai ---");
const subregions = quadrants(topBox.width, topBox.height, 0.12);
for (let i = 0; i < subregions.length; i++) {
  const box = intBox(subregions[i], topBox.width, topBox.height, topBox.left, topBox.top);
  for (const target of [600, 900, 1200]) {
    await testBox(`vung con ${i+1}/4`, box, target, "nearest");
    await testBox(`vung con ${i+1}/4`, box, target, "lanczos3");
  }
}
