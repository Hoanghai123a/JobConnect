import jsQR from "jsqr";
import { normalizeDate } from "./date-utils";

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

export async function scanCccdQrFromFile(file: File): Promise<CccdQrData | null> {
  if (!file.type.startsWith("image/")) return null;

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    return result?.data ? parseCccdQrText(result.data) : null;
  } finally {
    bitmap.close();
  }
}
