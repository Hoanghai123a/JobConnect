import sharp from "sharp";
import { readdir } from "node:fs/promises";

const dir = "C:/Users/admin/Pictures/CCCD HL";

function otsu(gray) {
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v] += 1;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let wB = 0, sumB = 0, best = -1, threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * ((sumB / wB) - ((sum - sumB) / wF)) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

// Tim mau finder pattern 1:1:3:1:1 tren tung dong / cot (chi do hinh hoc, khong doc noi dung).
function findRuns(bits, width, height, transpose) {
  const hits = [];
  const at = (a, b) => (transpose ? bits[b * width + a] : bits[a * width + b]);
  const outer = transpose ? width : height;
  const inner = transpose ? height : width;
  for (let o = 0; o < outer; o += 1) {
    let counts = [0, 0, 0, 0, 0];
    let current = 0;
    let last = at(o, 0);
    let start = 0;
    for (let i = 1; i <= inner; i += 1) {
      const value = i < inner ? at(o, i) : 1 - last;
      if (value === last) { continue; }
      const runLength = i - start;
      if (current < 5) { counts[current] = runLength; current += 1; }
      else { counts = [counts[1], counts[2], counts[3], counts[4], runLength]; }
      start = i;
      last = value;
      if (current === 5 || counts[4] > 0) {
        const [a, b, c, d, e] = counts;
        const moduleSize = (a + b + c + d + e) / 7;
        if (moduleSize >= 1.2) {
          const tol = moduleSize * 0.6;
          const isDarkFirst = at(o, Math.max(0, start - runLength - d - c - b - a)) === 0;
          if (
            isDarkFirst &&
            Math.abs(a - moduleSize) < tol && Math.abs(b - moduleSize) < tol &&
            Math.abs(c - moduleSize * 3) < tol * 2 &&
            Math.abs(d - moduleSize) < tol && Math.abs(e - moduleSize) < tol
          ) {
            const center = start - (e + d + c / 2);
            hits.push(transpose ? { x: o, y: center, moduleSize } : { x: center, y: o, moduleSize });
          }
        }
      }
    }
  }
  return hits;
}

function cluster(points, radiusFactor = 2.5) {
  const clusters = [];
  for (const point of points) {
    const radius = Math.max(4, point.moduleSize * radiusFactor);
    const found = clusters.find((c) => Math.hypot(c.x - point.x, c.y - point.y) <= radius && Math.abs(c.moduleSize - point.moduleSize) <= point.moduleSize * 0.8);
    if (found) {
      found.count += 1;
      found.x = (found.x * (found.count - 1) + point.x) / found.count;
      found.y = (found.y * (found.count - 1) + point.y) / found.count;
      found.moduleSize = (found.moduleSize * (found.count - 1) + point.moduleSize) / found.count;
    } else {
      clusters.push({ x: point.x, y: point.y, moduleSize: point.moduleSize, count: 1 });
    }
  }
  return clusters;
}

async function analyze(file) {
  const meta = await sharp(file).metadata();
  const scale = Math.min(1, 1600 / Math.max(meta.width, meta.height));
  const width = Math.round(meta.width * scale);
  const height = Math.round(meta.height * scale);
  const { data } = await sharp(file).resize(width, height, { kernel: "lanczos3" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const threshold = otsu(data);
  const bits = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 1) bits[i] = data[i] <= threshold ? 0 : 1;
  const horizontal = findRuns(bits, width, height, false);
  const vertical = findRuns(bits, width, height, true);
  const confirmed = [];
  for (const h of horizontal) {
    const match = vertical.find((v) => Math.hypot(v.x - h.x, v.y - h.y) <= Math.max(4, h.moduleSize * 2) && Math.abs(v.moduleSize - h.moduleSize) <= h.moduleSize * 0.7);
    if (match) confirmed.push({ x: (h.x + match.x) / 2, y: (h.y + match.y) / 2, moduleSize: (h.moduleSize + match.moduleSize) / 2 });
  }
  const groups = cluster(confirmed).filter((c) => c.count >= 2).sort((a, b) => b.count - a.count);
  const quadrant = (c) => `${c.y < height / 2 ? "tren" : "duoi"}-${c.x < width / 2 ? "trai" : "phai"}`;
  const triples = [];
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      for (let k = j + 1; k < groups.length; k += 1) {
        const [a, b, c] = [groups[i], groups[j], groups[k]];
        const sizes = [a.moduleSize, b.moduleSize, c.moduleSize];
        if (Math.max(...sizes) / Math.min(...sizes) > 1.6) continue;
        const d = [Math.hypot(a.x - b.x, a.y - b.y), Math.hypot(a.x - c.x, a.y - c.y), Math.hypot(b.x - c.x, b.y - c.y)].sort((m, n) => m - n);
        if (d[0] < a.moduleSize * 7) continue;
        if (Math.abs(d[0] - d[1]) / d[1] > 0.3) continue;
        if (Math.abs(d[2] - Math.hypot(d[0], d[1])) / d[2] > 0.25) continue;
        triples.push({ modules: (d[1] / ((a.moduleSize + b.moduleSize + c.moduleSize) / 3)).toFixed(1), moduleSizePx: ((a.moduleSize + b.moduleSize + c.moduleSize) / 3).toFixed(2), where: [quadrant(a), quadrant(b), quadrant(c)].join(",") });
      }
    }
  }
  return { size: `${meta.width}x${meta.height}`, finderCandidates: groups.length, strongest: groups.slice(0, 3).map((c) => ({ where: quadrant(c), moduleSizePx: c.moduleSize.toFixed(2), hits: c.count })), qrLikeTriples: triples.length, sampleTriple: triples[0] || null };
}

const files = (await readdir(dir)).filter((f) => /\.(jpe?g|png)$/i.test(f));
for (const name of files) {
  const info = await analyze(`${dir}/${name}`);
  console.log(name.padEnd(20), JSON.stringify(info));
}
