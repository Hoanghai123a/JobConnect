import jsQR from "jsqr";
import { normalizeDate } from "./date-utils";

export type CccdQrScanMode = "auto" | "basic" | "full";

export type CccdQrScanOptions = {
  mode?: CccdQrScanMode;
  timeoutMs?: number;
};

const DESKTOP_QR_SCAN_TIMEOUT_MS = 7000;
const MOBILE_QR_SCAN_TIMEOUT_MS = 2500;

export interface CccdQrData {
  cccd?: string;
  oldIdentity?: string;
  fullName?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  issuedDate?: string;
}

export function formatDateForDisplay(value: unknown): string {
  const normalized = normalizeDate(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-");
  return `${day}-${month}-${year}`;
}

export function normalizeDisplayDate(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";

  if (/^\d{8}$/.test(text)) {
    return formatDateForDisplay(`${text.slice(0, 2)}-${text.slice(2, 4)}-${text.slice(4)}`);
  }

  return formatDateForDisplay(text);
}

export function displayDateToPocketBase(value: unknown): string {
  return normalizeDate(value);
}

export function parseCccdQrText(text: string): CccdQrData | null {
  const parts = text.split("|").map((part) => part.trim());
  if (parts.length < 6) return null;

  return {
    cccd: parts[0]?.replace(/\D/g, "") || "",
    oldIdentity: parts[1]?.replace(/\D/g, "") || "",
    fullName: parts[2] || "",
    dateOfBirth: normalizeDisplayDate(parts[3]),
    gender: parts[4] || "",
    address: parts[5] || "",
    issuedDate: normalizeDisplayDate(parts[6]),
  };
}

type QrScanRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  maxLongEdge: number;
  minLongEdge: number;
  tryThreshold?: boolean;
};

type BarcodeDetectorResult = { rawValue?: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>;
};
type BarcodeDetectorConstructor = {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

// QR trên ảnh CCCD thường nằm sát một trong các góc. Quét vùng nhỏ trước giúp
// mã QR chiếm nhiều pixel hơn và tránh nền/hoa văn trên phần còn lại của thẻ.
const QR_SCAN_REGIONS: QrScanRegion[] = [
  {
    x: 0.45,
    y: 0,
    width: 0.55,
    height: 0.68,
    maxLongEdge: 1400,
    minLongEdge: 900,
    tryThreshold: true,
  },
  {
    x: 0,
    y: 0,
    width: 0.55,
    height: 0.68,
    maxLongEdge: 1400,
    minLongEdge: 900,
    tryThreshold: true,
  },
  {
    x: 0.45,
    y: 0.32,
    width: 0.55,
    height: 0.68,
    maxLongEdge: 1400,
    minLongEdge: 900,
    tryThreshold: true,
  },
  {
    x: 0,
    y: 0.32,
    width: 0.55,
    height: 0.68,
    maxLongEdge: 1400,
    minLongEdge: 900,
    tryThreshold: true,
  },
  { x: 0.35, y: 0, width: 0.65, height: 1, maxLongEdge: 1500, minLongEdge: 900 },
  { x: 0, y: 0, width: 0.65, height: 1, maxLongEdge: 1500, minLongEdge: 900 },
  { x: 0, y: 0, width: 1, height: 1, maxLongEdge: 1800, minLongEdge: 1000, tryThreshold: true },
];

function parseDetectedQrText(value: string | undefined) {
  if (!value) return null;
  return parseCccdQrText(value.split("\u0000").join("").trim());
}

async function createQrBarcodeDetector(): Promise<BarcodeDetectorLike | null> {
  const BarcodeDetectorApi = (
    globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }
  ).BarcodeDetector;
  if (!BarcodeDetectorApi) return null;

  try {
    if (BarcodeDetectorApi.getSupportedFormats) {
      const formats = await BarcodeDetectorApi.getSupportedFormats();
      if (!formats.includes("qr_code")) return null;
    }
    return new BarcodeDetectorApi({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

async function scanWithBarcodeDetector(
  detector: BarcodeDetectorLike | null,
  source: CanvasImageSource,
) {
  if (!detector) return null;
  try {
    const results = await detector.detect(source);
    for (const result of results) {
      const parsed = parseDetectedQrText(result.rawValue);
      if (parsed) return parsed;
    }
  } catch {
    // Trình duyệt có thể công bố BarcodeDetector nhưng không đọc được nguồn ảnh này.
  }
  return null;
}

function renderScanRegion(bitmap: ImageBitmap, region: QrScanRegion) {
  const sourceX = Math.max(0, Math.floor(bitmap.width * region.x));
  const sourceY = Math.max(0, Math.floor(bitmap.height * region.y));
  const sourceWidth = Math.max(
    1,
    Math.min(bitmap.width - sourceX, Math.ceil(bitmap.width * region.width)),
  );
  const sourceHeight = Math.max(
    1,
    Math.min(bitmap.height - sourceY, Math.ceil(bitmap.height * region.height)),
  );
  const sourceLongEdge = Math.max(sourceWidth, sourceHeight);
  const scale =
    sourceLongEdge > region.maxLongEdge
      ? region.maxLongEdge / sourceLongEdge
      : sourceLongEdge < region.minLongEdge
        ? region.minLongEdge / sourceLongEdge
        : 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = scale <= 1;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return { canvas, ctx };
}

function scanWithJsQr(imageData: ImageData) {
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  return parseDetectedQrText(result?.data);
}

function enhanceQrImage(source: ImageData) {
  const histogram = new Uint32Array(256);
  const sourcePixels = source.data;
  const pixelCount = source.width * source.height;

  for (let index = 0; index < sourcePixels.length; index += 4) {
    const luminance = Math.round(
      sourcePixels[index] * 0.299 +
        sourcePixels[index + 1] * 0.587 +
        sourcePixels[index + 2] * 0.114,
    );
    histogram[luminance] += 1;
  }

  const percentile = (ratio: number) => {
    const target = pixelCount * ratio;
    let count = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      count += histogram[value];
      if (count >= target) return value;
    }
    return 255;
  };

  const low = percentile(0.01);
  const high = percentile(0.99);
  const range = Math.max(24, high - low);
  const output = new Uint8ClampedArray(sourcePixels.length);

  for (let index = 0; index < sourcePixels.length; index += 4) {
    const luminance =
      sourcePixels[index] * 0.299 +
      sourcePixels[index + 1] * 0.587 +
      sourcePixels[index + 2] * 0.114;
    const normalized = ((luminance - low) * 255) / range;
    const contrasted = Math.max(0, Math.min(255, (normalized - 128) * 1.2 + 128));
    output[index] = contrasted;
    output[index + 1] = contrasted;
    output[index + 2] = contrasted;
    output[index + 3] = 255;
  }

  return new ImageData(output, source.width, source.height);
}

function thresholdQrImage(source: ImageData) {
  const histogram = new Uint32Array(256);
  const pixels = source.data;
  const pixelCount = source.width * source.height;
  let totalLuminance = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = pixels[index];
    histogram[luminance] += 1;
    totalLuminance += luminance;
  }

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let threshold = 128;

  for (let value = 0; value < histogram.length; value += 1) {
    backgroundWeight += histogram[value];
    if (backgroundWeight === 0) continue;

    const foregroundWeight = pixelCount - backgroundWeight;
    if (foregroundWeight === 0) break;

    backgroundSum += value * histogram[value];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (totalLuminance - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = value;
    }
  }

  const output = new Uint8ClampedArray(pixels.length);
  for (let index = 0; index < pixels.length; index += 4) {
    const value = pixels[index] <= threshold ? 0 : 255;
    output[index] = value;
    output[index + 1] = value;
    output[index + 2] = value;
    output[index + 3] = 255;
  }
  return new ImageData(output, source.width, source.height);
}

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

async function createBitmapWithinDeadline(file: File, timeoutMs: number) {
  const bitmapPromise = createImageBitmap(file);
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<null>((resolve) => {
    timerId = globalThis.setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    const bitmap = await Promise.race([bitmapPromise, timeoutPromise]);
    if (!bitmap) {
      void bitmapPromise.then((lateBitmap) => lateBitmap.close()).catch(() => undefined);
      return null;
    }
    return bitmap;
  } finally {
    if (timerId !== undefined) globalThis.clearTimeout(timerId);
  }
}

export async function scanCccdQrFromFile(
  file: File,
  options: CccdQrScanOptions = {},
): Promise<CccdQrData | null> {
  if (!file.type.startsWith("image/")) return null;

  const mobile = isMobileDevice();
  const mode =
    options.mode === "auto" || !options.mode ? (mobile ? "basic" : "full") : options.mode;
  const maxTimeout = mobile ? MOBILE_QR_SCAN_TIMEOUT_MS : DESKTOP_QR_SCAN_TIMEOUT_MS;
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? maxTimeout, 500), maxTimeout);
  const deadline = Date.now() + timeoutMs;
  const timedOut = () => Date.now() >= deadline;
  const bitmap = await createBitmapWithinDeadline(file, timeoutMs);
  if (!bitmap) return null;

  try {
    if (timedOut()) return null;

    const detector = await createQrBarcodeDetector();
    const nativeResult = await scanWithBarcodeDetector(detector, bitmap);
    if (nativeResult) return nativeResult;
    if (timedOut()) return null;

    const regions = mode === "basic" ? QR_SCAN_REGIONS.slice(0, 4) : QR_SCAN_REGIONS;
    for (const region of regions) {
      if (timedOut()) return null;

      const rendered = renderScanRegion(bitmap, region);
      if (!rendered) continue;

      const detected = await scanWithBarcodeDetector(detector, rendered.canvas);
      if (detected) return detected;
      if (timedOut()) return null;

      const imageData = rendered.ctx.getImageData(
        0,
        0,
        rendered.canvas.width,
        rendered.canvas.height,
      );
      const originalResult = scanWithJsQr(imageData);
      if (originalResult) return originalResult;
      if (timedOut()) return null;

      // Mobile keeps only the fast raw-image pass to avoid blocking the UI.
      if (mode === "basic") {
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
        continue;
      }

      const enhancedImage = enhanceQrImage(imageData);
      const enhancedResult = scanWithJsQr(enhancedImage);
      if (enhancedResult) return enhancedResult;
      if (timedOut()) return null;

      if (region.tryThreshold) {
        const thresholdResult = scanWithJsQr(thresholdQrImage(enhancedImage));
        if (thresholdResult) return thresholdResult;
      }

      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    }

    return null;
  } finally {
    bitmap.close();
  }
}
