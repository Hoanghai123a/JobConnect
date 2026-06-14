#!/usr/bin/env node
/**
 * Quét toàn bộ workspace và sửa các file đang bị "mojibake" (UTF-8 đọc nhầm
 * sang Windows-1252 rồi mã hoá lại thành UTF-8). Áp dụng cho mã nguồn UI,
 * tài liệu Markdown và JSON cấu hình. Bỏ qua các thư mục build/cache.
 *
 * Cách dùng:
 *   node scripts/fix-mojibake.mjs            # quét từ thư mục hiện tại
 *   node scripts/fix-mojibake.mjs src docs   # quét nhiều thư mục cụ thể
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const TARGET_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".cjs",
  ".mjs",
  ".css",
  ".scss",
  ".html",
  ".json",
  ".md",
  ".mdx",
  ".txt",
  ".yml",
  ".yaml",
  ".cjsonc",
]);

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".output",
  "dist",
  ".netlify",
  ".wrangler",
  ".tanstack",
  ".lovable",
  ".pm2-jobconnect",
  ".vscode",
  ".idea",
]);

const SKIP_FILES = new Set(["package-lock.json", "bun.lock"]);

const decoder1252 = new TextDecoder("windows-1252");
const cp1252ToByte = new Map();
for (let b = 0; b < 256; b++) {
  const ch = decoder1252.decode(new Uint8Array([b]));
  cp1252ToByte.set(ch, b);
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: false });

// Một số mojibake "kẹt" trong văn bản UTF-8 đúng (do trộn nội dung từ
// nhiều nguồn). Các cặp này an toàn để thay thế trực tiếp.
const BIGRAM_FIXES = [
  ["\u00C4\u2018", "\u0111"], // đ -> đ
  ["\u00C4\u0192", "\u0103"], // ă -> ă
  ["\u00C3\u00A2", "\u00E2"], // â -> â
  ["\u00E2\u20AC\u201D", "\u2014"], // — -> —
  ["\u00E2\u20AC\u201C", "\u2013"], // – -> –
  ["\u00E2\u20AC\u0153", "\u201C"], // “ -> “
  ["\u00E2\u20AC\u009D", "\u201D"], // â€ -> ”
  ["\u00E2\u20AC\u2122", "\u2019"], // ’ -> ’
  ["\u00E2\u20AC\u02DC", "\u2018"], // ‘ -> ‘
  ["\u00E2\u20AC\u00A6", "\u2026"], // … -> …
  ["\u00C2\u00B7", "\u00B7"], // · -> ·
  ["\u00C2\u00A0", "\u00A0"], // Â  -> NBSP
];

function applyBigramFixes(text) {
  let next = text;
  for (const [from, to] of BIGRAM_FIXES) {
    if (next.includes(from)) next = next.split(from).join(to);
  }
  return next;
}

const MOJIBAKE_REGEX = new RegExp(
  [
    "Ã[\\u0080-\\u00FF]",
    "Ä[\\u0080-\\u00FF\\u2018\\u2019\\u201C\\u201D\\u201E\\u2020\\u2021\\u2022\\u2026]",
    "Æ[\\u0080-\\u00FF\\u2018\\u2019\\u201C\\u201D]",
    "á»",
    "â€",
    "Â[\\u0080-\\u00BF\\u00A0]",
  ].join("|"),
  "u",
);

function decodeOnce(text) {
  const bytes = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (cp1252ToByte.has(ch)) {
      bytes.push(cp1252ToByte.get(ch));
    } else if (code <= 0x7f) {
      bytes.push(code);
    } else {
      const u8 = utf8Encoder.encode(ch);
      for (const b of u8) bytes.push(b);
    }
  }
  return utf8Decoder.decode(new Uint8Array(bytes));
}

function isImproved(before, after) {
  if (after === before) return false;
  if (after.includes("\uFFFD") && !before.includes("\uFFFD")) return false;
  const beforeHits = before.match(MOJIBAKE_REGEX)?.length ?? 0;
  const afterHits = after.match(MOJIBAKE_REGEX)?.length ?? 0;
  return afterHits < beforeHits;
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (TARGET_EXTS.has(ext)) yield full;
    }
  }
}

function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

async function processFile(file) {
  const raw = await fs.readFile(file);
  const hadBom = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
  const original = stripBom(raw.toString("utf8"));
  let next = applyBigramFixes(original);
  if (next === original && !MOJIBAKE_REGEX.test(original) && !hadBom)
    return { file, status: "clean" };
  for (let i = 0; i < 3; i++) {
    if (!MOJIBAKE_REGEX.test(next)) break;
    const candidate = decodeOnce(next);
    if (isImproved(next, candidate)) {
      next = candidate;
    } else {
      break;
    }
  }
  next = applyBigramFixes(next);

  if (next.includes("\uFFFD")) {
    return { file, status: "skip_replacement" };
  }

  if (next === original && !hadBom) return { file, status: "unchanged" };

  await fs.writeFile(file, next, "utf8");
  return { file, status: hadBom ? "fixed_bom" : "fixed" };
}

const targets = process.argv.slice(2);
const roots = targets.length ? targets : ["."];

const counts = { fixed: 0, fixed_bom: 0, skip_replacement: 0, unchanged: 0, clean: 0 };
for (const root of roots) {
  for await (const file of walk(root)) {
    const result = await processFile(file);
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    if (result.status === "fixed" || result.status === "fixed_bom") {
      console.log(`fixed  ${file}`);
    } else if (result.status === "skip_replacement") {
      console.warn(`skip   ${file} (xuất hiện ký tự thay thế U+FFFD)`);
    }
  }
}

console.log("");
console.log(
  `Tóm tắt: ${counts.fixed} sửa, ${counts.fixed_bom} bỏ BOM, ${counts.skip_replacement} bỏ qua, ${counts.unchanged} không đổi.`,
);
