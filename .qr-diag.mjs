import sharp from "sharp";
import jsQR from "jsqr";

const file = "C:/Users/admin/Pictures/CCCD HL/5.jpg";
const meta = await sharp(file).metadata();
const W = meta.width, H = meta.height;

async function raw(p) {
  const { data, info } = await p.toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}
function dec(img, label) {
  let r = null;
  try { r = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" }); } catch (e) { console.log(label, "LOI:", e.message); return null; }
  console.log(`${label}: ${r?.data ? "DOC DUOC" : "khong thay"}`);
  return r?.data ?? null;
}

const ratio = 0.08;
const ox = (W * ratio) / 2, oy = (H * ratio) / 2;
const rightX = Math.max(0, W / 2 - ox), bottomY = Math.max(0, H / 2 - oy);
const regions = [
  ["tren-trai", 0, 0, W / 2 + ox, H / 2 + oy],
  ["tren-phai", rightX, 0, W - rightX, H / 2 + oy],
  ["duoi-trai", 0, bottomY, W / 2 + ox, H - bottomY],
  ["duoi-phai", rightX, bottomY, W - rightX, H - bottomY],
];

for (const [name, rx, ry, rw, rh] of regions) {
  const left = Math.floor(rx), top = Math.floor(ry);
  const width = Math.min(W - left, Math.ceil(rw)), height = Math.min(H - top, Math.ceil(rh));
  for (const target of [1600, 2000]) {
    let scale = target / Math.max(width, height);
    if (scale > 1) scale = Math.min(scale, 3);
    const w = Math.round(width * scale), h = Math.round(height * scale);
    const base = sharp(file).extract({ left, top, width, height }).resize(w, h, { kernel: "lanczos3" });
    dec(await raw(base.clone()), `${name} @${target} goc`);
    dec(await raw(base.clone().greyscale().normalise()), `${name} @${target} tuong phan`);
    dec(await raw(base.clone().greyscale().normalise().threshold(128)), `${name} @${target} nhi phan`);
  }
}

console.log("--- cat sat QR that (goc tren phai) ---");
for (const [lbl, box] of [
  ["QR chat", { left: Math.round(W*0.775), top: Math.round(H*0.07), width: Math.round(W*0.145), height: Math.round(H*0.21) }],
  ["QR + le", { left: Math.round(W*0.755), top: Math.round(H*0.05), width: Math.round(W*0.19), height: Math.round(H*0.26) }],
]) {
  for (const target of [600, 900, 1400]) {
    let scale = target / Math.max(box.width, box.height);
    const w = Math.round(box.width * scale), h = Math.round(box.height * scale);
    const base = sharp(file).extract(box).resize(w, h, { kernel: "lanczos3" });
    dec(await raw(base.clone()), `${lbl} @${target} goc (${w}x${h})`);
    dec(await raw(base.clone().greyscale().normalise()), `${lbl} @${target} tuong phan`);
    dec(await raw(base.clone().greyscale().normalise().threshold(128)), `${lbl} @${target} nhi phan`);
    dec(await raw(base.clone().greyscale().normalise().sharpen()), `${lbl} @${target} sharpen`);
  }
}
