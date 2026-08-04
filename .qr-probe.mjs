import sharp from "sharp";
import jsQR from "jsqr";
const dir = "C:/Users/admin/Pictures/CCCD HL";
const names = ["Hoang thi Nu.png", "Hoang thi Nu1.png", "vietanh1.jpg"];
async function tryRegion(file, left, top, width, height, target, kernel) {
  const requested = target / Math.max(width, height);
  const scale = requested > 1 ? Math.min(requested, 6) : requested;
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  for (const variant of ["plain", "sharpen", "norm"]) {
    let pipe = sharp(file).extract({ left, top, width, height }).resize(w, h, { kernel });
    if (variant === "sharpen") pipe = pipe.sharpen();
    if (variant === "norm") pipe = pipe.normalise().sharpen();
    const { data, info } = await pipe.grayscale().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    try { if (jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: "attemptBoth" })?.data) return true; } catch {}
  }
  return false;
}
for (const name of names) {
  const file = dir + "/" + name;
  const { width: W, height: H } = await sharp(file).metadata();
  let found = false;
  const grids = [1, 2, 3, 4, 6];
  outer:
  for (const g of grids) {
    const cw = Math.floor(W / g), ch = Math.floor(H / g);
    for (let gx = 0; gx < g && !found; gx++) for (let gy = 0; gy < g && !found; gy++) {
      const left = gx * cw, top = gy * ch;
      const width = Math.min(cw + Math.floor(cw * 0.2), W - left), height = Math.min(ch + Math.floor(ch * 0.2), H - top);
      for (const kernel of ["lanczos3", "cubic", "nearest"]) {
        if (await tryRegion(file, left, top, width, height, 1600, kernel)) { found = true; console.log(name.padEnd(20) + " " + W + "x" + H + "  QR DOC DUOC khi vet can (grid " + g + ")"); break outer; }
      }
    }
  }
  if (!found) console.log(name.padEnd(20) + " " + W + "x" + H + "  KHONG doc duoc du da vet can 1/2/3/4/6 + sharpen/normalise");
}
