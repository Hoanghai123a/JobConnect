import fs from "node:fs";
import path from "node:path";
import PocketBase from "pocketbase";

export const AUDIT_COLUMNS = [
  "approved",
  "decision",
  "old_uid",
  "new_uid",
  "user_id",
  "username",
  "full_name",
  "phone",
  "cccd",
  "status",
  "created",
  "last_login",
  "active_employment",
  "employment_count",
  "attendance_count",
  "advance_count",
  "salary_hold_count",
  "check_attendance_count",
  "check_salary_count",
  "score",
  "risk",
  "reason",
];

export function parseArgs(argv = process.argv.slice(2)) {
  const result = { apply: false, input: "", outputDir: "uid-audit-output" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") result.apply = true;
    else if (arg === "--input") result.input = argv[++index] || "";
    else if (arg === "--output-dir") result.outputDir = argv[++index] || result.outputDir;
    else if (arg.startsWith("--input=")) result.input = arg.slice(8);
    else if (arg.startsWith("--output-dir=")) result.outputDir = arg.slice(13);
  }
  return result;
}

export async function connectPocketBase() {
  const baseUrl = process.env.PB_URL || process.env.VITE_PB_URL || "http://127.0.0.1:8090";
  const identity = process.env.PB_ADMIN_EMAIL;
  const password = process.env.PB_ADMIN_PASSWORD;
  const token = process.env.PB_ADMIN_TOKEN;
  if (!token && (!identity || !password)) {
    throw new Error("Thiếu PB_ADMIN_TOKEN hoặc PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD.");
  }
  const pb = new PocketBase(baseUrl);
  pb.autoCancellation(false);
  if (token) pb.authStore.save(token, null);
  else {
    await pb
      .collection("_superusers")
      .authWithPassword(identity, password)
      .catch(async () => {
        await pb.admins.authWithPassword(identity, password);
      });
  }
  return pb;
}

export function normalizeUid(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export function duplicateGroups(users) {
  const groups = new Map();
  for (const user of users) {
    const uid = normalizeUid(user.uid);
    if (!uid) continue;
    groups.set(uid, [...(groups.get(uid) || []), user]);
  }
  return new Map([...groups].filter(([, items]) => items.length > 1));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function writeCsv(filePath, rows, columns = AUDIT_COLUMNS) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = [
    columns.join(","),
    ...rows.map((row) => columns.map((key) => csvEscape(row[key])).join(",")),
  ].join("\r\n");
  fs.writeFileSync(filePath, `\uFEFF${content}\r\n`, "utf8");
}

export function parseCsv(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = (rows.shift() || []).map((item) => item.replace(/^\uFEFF/, "").trim());
  return rows
    .filter((items) => items.some(Boolean))
    .map((items) =>
      Object.fromEntries(headers.map((header, index) => [header, items[index] || ""])),
    );
}

export function readCsv(filePath) {
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

export async function safeFullList(pb, collection, options) {
  try {
    return await pb.collection(collection).getFullList(options);
  } catch (error) {
    if (error?.status === 404) return [];
    console.warn(`Bỏ qua collection ${collection}: ${error?.message || "không đọc được"}`);
    return [];
  }
}

export function countBy(records, field) {
  const counts = new Map();
  for (const record of records) {
    const id = String(record[field] || "");
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

export function timestampName(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}
