import sharp from "sharp";
import { mkdirSync } from "node:fs";

const dir = "C:/Users/admin/Pictures/CCCD HL";
const outDir = "C:/Users/admin/AppData/Local/Temp/qr-crops";
mkdirSync(outDir, { recursive: true });

// Chi cat dung o vuong nho o goc tren-phai (vung ma QR), khong lay vung chu hay anh chan dung.
const targets = [
  { name: "Hoang thi Nu.png", corner: "tren-phai" },
  { name: "Hoang thi Nu1.png", corner: "tren-phai" },
  { name: "vietanh1.jpg", corner: "tren-phai" },
  { name: "5.jpg", corner: "tren-phai" },
];

function laplacianVariance(gray, width, height) {
  let sum = 0, sumSq = 0, count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const value = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      sum += value; sumSq += value * value; count += 1;
    }
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

for (const target of targets) {
  const file = `${dir}/${target.name}`;
  const meta = await sharp(file).metadata();
  const side = Math.round(Math.min(meta.width, meta.height) * 0.32);
  const left = meta.width - side - Math.round(meta.width * 0.02);
  const top = Math.round(meta.height * 0.03);
  const region = { left: Math.max(0, left), top, width: Math.min(side, meta.width - left), height: Math.min(side, meta.height - top) };
  const cropPath = `${outDir}/${target.name.replace(/[^a-z0-9]+/gi, "_")}_qr.png`;
  await sharp(file).extract(region).resize(360, 360, { kernel: "lanczos3" }).png().toFile(cropPath);
  const { data, info } = await sharp(file).extract(region).grayscale().raw().toBuffer({ resolveWithObject: true });
  console.log(`${target.name.padEnd(20)} crop=${region.width}x${region.height} doNet(laplacianVar)=${laplacianVariance(data, info.width, info.height).toFixed(1)} -> ${cropPath}`);
}
