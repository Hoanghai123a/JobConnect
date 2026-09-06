#!/usr/bin/env node
/**
 * Đánh lại UID users và employment_histories theo thứ tự ổn định.
 *
 * Quy tắc an toàn:
 * - Mặc định chỉ dry-run.
 * - --apply yêu cầu PB_URL rõ ràng và xác nhận đã dừng ghi dữ liệu.
 * - Dừng trước khi ghi nếu dữ liệu/sơ đồ không đạt điều kiện an toàn.
 * - Đổi qua UID tạm trước, nên không va chạm unique index khi hoán đổi UID.
 * - Lưu kế hoạch/rollback, kiểm tra relation và khôi phục khi lỗi.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import PocketBase from "pocketbase";

const MAX_BATCH_SIZE = 100;
const USER_UID_LIMIT = 999_999;
const HISTORY_UID_LIMIT = 9_999;
const APPLY_CONFIRMATION = "--maintenance-confirmed";

export function normalizeUid(value) {
  return String(value || "").trim().toUpperCase();
}

export function parseArgs(argv = process.argv.slice(2)) {
  const result = {
    apply: false,
    allowCreatedDateFallback: false,
    maintenanceConfirmed: false,
    outputDir: "uid-rebuild-output",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") result.apply = true;
    else if (arg === "--allow-created-date-fallback") result.allowCreatedDateFallback = true;
    else if (arg === APPLY_CONFIRMATION) result.maintenanceConfirmed = true;
    else if (arg === "--output-dir") result.outputDir = argv[++index] || result.outputDir;
    else if (arg.startsWith("--output-dir=")) result.outputDir = arg.slice(13) || result.outputDir;
  }

  return result;
}

function timestampName(base) {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const DD = String(now.getDate()).padStart(2, "0");
  const HH = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const SS = String(now.getSeconds()).padStart(2, "0");
  return `${base}-${YYYY}${MM}${DD}-${HH}${mm}${SS}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\r\n");
  fs.writeFileSync(filePath, `\uFEFF${content}\r\n`, "utf8");
  console.log(`Đã ghi file: ${filePath}`);
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`Đã ghi file: ${filePath}`);
}

async function connectPocketBase({ requireExplicitUrl = false } = {}) {
  if (requireExplicitUrl && !process.env.PB_URL) {
    throw new Error("Khi chạy --apply, bắt buộc cấu hình PB_URL rõ ràng cho PocketBase đích.");
  }

  const baseUrl = process.env.PB_URL || process.env.VITE_PB_URL || "http://127.0.0.1:8090";
  const token = process.env.PB_ADMIN_TOKEN;
  const identity = process.env.PB_ADMIN_EMAIL;
  const password = process.env.PB_ADMIN_PASSWORD;
  if (!token && (!identity || !password)) {
    throw new Error("Thiếu PB_ADMIN_TOKEN hoặc PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD.");
  }

  const pb = new PocketBase(baseUrl);
  pb.autoCancellation(false);
  if (token) {
    pb.authStore.save(token, null);
  } else {
    await pb
      .collection("_superusers")
      .authWithPassword(identity, password)
      .catch(async () => {
        await pb.admins.authWithPassword(identity, password);
      });
  }
  console.log(`Đã kết nối PocketBase: ${baseUrl}`);
  return pb;
}

async function getConfiguredPrefix(pb) {
  const settings = await pb.collection("app_settings").getList(1, 1, {
    fields: "account_code_prefix",
  });
  const prefix = normalizeUid(settings.items[0]?.account_code_prefix);
  if (!prefix) throw new Error("app_settings.account_code_prefix đang để trống.");
  return prefix;
}

export function buildUserUid(prefix, sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > USER_UID_LIMIT) {
    throw new Error("Số thứ tự UID users phải nằm trong khoảng 1-999999.");
  }
  return `${prefix}${String(sequence).padStart(6, "0")}`;
}

export function buildHistoryUid(prefix, year, month, sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > HISTORY_UID_LIMIT) {
    throw new Error("Số thứ tự UID lịch sử theo tháng phải nằm trong khoảng 1-9999.");
  }
  const yy = String(year).slice(-2).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${prefix}${yy}${mm}${String(sequence).padStart(4, "0")}`;
}

export function parseHistoryDate(dateStr) {
  const value = String(dateStr || "").trim();
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() + 1 !== month ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month };
}

export function buildUserPlanFromRecords(users, prefix) {
  if (users.length > USER_UID_LIMIT) {
    throw new Error("Số users vượt giới hạn 999999 UID cho một tiền tố.");
  }
  return users.map((user, index) => {
    const newUid = buildUserUid(prefix, index + 1);
    const originalUid = String(user.uid || "");
    return {
      collection: "users",
      id: user.id,
      original_uid: originalUid,
      old_uid: normalizeUid(originalUid) || "(trống)",
      new_uid: newUid,
      username: user.username || "",
      full_name: user.full_name || "",
      created: user.created || "",
      changed: originalUid !== newUid,
    };
  });
}

export function buildHistoryPlanFromRecords(histories, prefix, { allowCreatedDateFallback = false } = {}) {
  const groups = new Map();
  const invalidJoinDates = [];

  for (const history of histories) {
    let dateInfo = parseHistoryDate(history.join_date);
    let dateSource = "join_date";
    if (!dateInfo && allowCreatedDateFallback) {
      dateInfo = parseHistoryDate(history.created);
      dateSource = "created";
    }
    if (!dateInfo) {
      invalidJoinDates.push({
        id: history.id,
        join_date: history.join_date || "",
        created: history.created || "",
      });
      continue;
    }

    const key = `${dateInfo.year}-${String(dateInfo.month).padStart(2, "0")}`;
    const group = groups.get(key) || {
      year: dateInfo.year,
      month: dateInfo.month,
      histories: [],
    };
    group.histories.push({ ...history, uid_date_source: dateSource });
    groups.set(key, group);
  }

  if (invalidJoinDates.length) {
    const ids = invalidJoinDates.map((item) => item.id).join(", ");
    throw new Error(
      `Có ${invalidJoinDates.length} employment_histories thiếu hoặc sai join_date: ${ids}. ` +
        "Hãy sửa join_date, hoặc chỉ khi đã đối soát dùng --allow-created-date-fallback.",
    );
  }

  const plan = [];
  const counterValues = [];
  for (const [key, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.histories.length > HISTORY_UID_LIMIT) {
      throw new Error(`Tháng ${key} có hơn 9999 employment_histories, không thể tạo UID hợp lệ.`);
    }
    for (const [index, history] of group.histories.entries()) {
      const originalUid = String(history.uid || "");
      const newUid = buildHistoryUid(prefix, group.year, group.month, index + 1);
      plan.push({
        collection: "employment_histories",
        id: history.id,
        original_uid: originalUid,
        old_uid: normalizeUid(originalUid) || "(trống)",
        new_uid: newUid,
        user: history.user || "",
        join_date: history.join_date || "",
        uid_date_source: history.uid_date_source,
        created: history.created || "",
        year_month: key,
        changed: originalUid !== newUid,
      });
    }
    counterValues.push({
      period: `${group.year}${String(group.month).padStart(2, "0")}`,
      maxSequence: group.histories.length,
    });
  }
  return { plan, counterValues };
}

async function buildUserPlan(pb, prefix) {
  const users = await pb.collection("users").getFullList({
    fields: "id,uid,username,full_name,created",
    sort: "created,id",
  });
  return { plan: buildUserPlanFromRecords(users, prefix), maxSequence: users.length };
}

async function buildHistoryPlan(pb, prefix, args) {
  const histories = await pb.collection("employment_histories").getFullList({
    fields: "id,uid,user,join_date,created",
    sort: "join_date,created,id",
  });
  return buildHistoryPlanFromRecords(histories, prefix, args);
}

function normalizedRelationValues(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).sort();
  return value ? [String(value)] : [];
}

async function loadUidSafetyMeta(pb) {
  const collections = await pb.collections.getFullList();
  const targetNames = new Set(["users", "employment_histories"]);
  const targetIds = new Set(
    collections.filter((collection) => targetNames.has(collection.name)).map((collection) => collection.id),
  );
  if (targetIds.size !== targetNames.size) throw new Error("Thiếu collection users hoặc employment_histories.");

  const relationFields = [];
  const unsupportedUidFields = [];
  const uidFields = new Map();
  for (const collection of collections) {
    for (const field of collection.fields || []) {
      if (field.type === "relation" && targetIds.has(field.collectionId)) {
        relationFields.push({ collection: collection.name, field: field.name });
      }
      if (field.type === "text" && /uid/i.test(field.name)) {
        if (targetNames.has(collection.name) && field.name === "uid") uidFields.set(collection.name, field);
        else unsupportedUidFields.push({ collection: collection.name, field: field.name });
      }
    }
  }
  for (const name of targetNames) {
    if (!uidFields.has(name)) throw new Error(`Không tìm thấy trường text ${name}.uid.`);
  }
  if (unsupportedUidFields.length) {
    throw new Error(
      "Phát hiện trường UID dạng text chưa có quy tắc cập nhật: " +
        unsupportedUidFields.map((item) => `${item.collection}.${item.field}`).join(", "),
    );
  }
  return { relationFields, uidFields };
}

async function captureRelationSnapshot(pb, relationFields) {
  const grouped = new Map();
  for (const item of relationFields) {
    grouped.set(item.collection, [...(grouped.get(item.collection) || []), item.field]);
  }
  const snapshot = new Map();
  for (const [collection, fields] of grouped) {
    const records = await pb.collection(collection).getFullList({
      fields: `id,${[...new Set(fields)].join(",")}`,
    });
    snapshot.set(
      collection,
      records
        .map((record) => ({
          id: record.id,
          values: Object.fromEntries(
            fields.map((field) => [field, normalizedRelationValues(record[field])]),
          ),
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    );
  }
  return snapshot;
}

function relationSnapshotsEqual(before, after) {
  if (before.size !== after.size) return false;
  for (const [collection, records] of before) {
    if (JSON.stringify(records) !== JSON.stringify(after.get(collection))) return false;
  }
  return true;
}

function relationSnapshotSummary(snapshot) {
  return [...snapshot.entries()].map(([collection, records]) => ({
    collection,
    record_count: records.length,
    sha256: crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex"),
  }));
}

async function assertPlanStillCurrent(pb, collection, plan) {
  const current = await pb.collection(collection).getFullList({ fields: "id,uid" });
  if (current.length !== plan.length) {
    throw new Error(`${collection} đã thay đổi số lượng record kể từ lúc lập kế hoạch. Hãy chạy lại.`);
  }
  const byId = new Map(current.map((record) => [record.id, record]));
  for (const item of plan) {
    if (String(byId.get(item.id)?.uid || "") !== item.original_uid) {
      throw new Error(`${collection}/${item.id} đã thay đổi UID kể từ lúc lập kế hoạch. Hãy chạy lại.`);
    }
  }
}

export function createTemporaryUids({ currentUids, count, uidField }) {
  if (count === 0) return [];
  const max = Number(uidField.max || 255);
  const min = Number(uidField.min || 0);
  if (uidField.pattern) {
    throw new Error("Trường UID có pattern validation; không thể dùng UID tạm một cách an toàn.");
  }
  const sequenceWidth = Math.max(2, Math.ceil(Math.log(count + 1) / Math.log(36)));
  const tokenLength = Math.min(8, max - sequenceWidth - 1);
  if (tokenLength < 4 || max < min || 1 + tokenLength + sequenceWidth < min) {
    throw new Error("Trường UID không đủ độ dài để tạo UID tạm an toàn.");
  }
  const existing = new Set([...currentUids].map(normalizeUid).filter(Boolean));
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const token = crypto.randomBytes(8).toString("hex").slice(0, tokenLength).toUpperCase();
    const result = Array.from({ length: count }, (_, index) =>
      `T${token}${index.toString(36).padStart(sequenceWidth, "0").toUpperCase()}`,
    );
    if (result.some((candidate) => candidate.length > max || existing.has(candidate))) continue;
    return result;
  }
  throw new Error("Không tạo được dải UID tạm không trùng sau 100 lần thử.");
}

function assignTemporaryUids(plan, temporaryUids) {
  return plan.map((item, index) => ({ ...item, temporary_uid: temporaryUids[index] }));
}

async function updateUids(pb, collection, rows, uidKey) {
  for (let offset = 0; offset < rows.length; offset += MAX_BATCH_SIZE) {
    const chunk = rows.slice(offset, offset + MAX_BATCH_SIZE);
    for (const item of chunk) {
      await pb.collection(collection).update(item.id, { uid: item[uidKey] });
    }
    console.log(`${collection}: đã cập nhật ${Math.min(offset + chunk.length, rows.length)}/${rows.length}`);
  }
}

async function restoreCollection(pb, collection, plan) {
  const current = await pb.collection(collection).getFullList({ fields: "id,uid" });
  const byId = new Map(current.map((record) => [record.id, record]));
  const finals = plan.filter((item) => String(byId.get(item.id)?.uid || "") === item.new_uid);
  if (finals.length) await updateUids(pb, collection, finals, "temporary_uid");

  const refreshed = await pb.collection(collection).getFullList({ fields: "id,uid" });
  const refreshedById = new Map(refreshed.map((record) => [record.id, record]));
  const temporary = plan.filter(
    (item) => String(refreshedById.get(item.id)?.uid || "") === item.temporary_uid,
  );
  if (temporary.length) await updateUids(pb, collection, temporary, "original_uid");
  return finals.length + temporary.length;
}

function escapePb(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function getCounter(pb, key) {
  const result = await pb.collection("uid_counters").getList(1, 1, {
    filter: `counter_key="${escapePb(key)}"`,
    fields: "id,counter_key,counter_type,prefix,period,current_value,updated_by,note",
  });
  return result.items[0] || null;
}

function counterDefinition(type, prefix, period, currentValue) {
  return {
    counter_key: type === "user" ? `user:${prefix}` : `employment_history:${prefix}:${period}`,
    counter_type: type,
    prefix,
    period,
    current_value: currentValue,
  };
}

function assertCounterMatches(counter, expected) {
  if (!counter) return;
  for (const key of ["counter_key", "counter_type", "prefix", "period"]) {
    if (String(counter[key] || "") !== String(expected[key] || "")) {
      throw new Error(`uid_counters/${counter.id} không đúng metadata cho ${expected.counter_key}.`);
    }
  }
}

async function captureCounters(pb, prefix, userMaxSeq, historyCounterValues) {
  const definitions = [
    counterDefinition("user", prefix, "", userMaxSeq),
    ...historyCounterValues.map((item) =>
      counterDefinition("employment_history", prefix, item.period, item.maxSequence),
    ),
  ];
  const snapshots = [];
  for (const definition of definitions) {
    const record = await getCounter(pb, definition.counter_key);
    assertCounterMatches(record, definition);
    snapshots.push({ definition, record });
  }
  return snapshots;
}

async function applyCounters(pb, snapshots) {
  const applied = [];
  for (const snapshot of snapshots) {
    const { definition, record } = snapshot;
    if (record) {
      await pb.collection("uid_counters").update(record.id, {
        current_value: definition.current_value,
      });
      applied.push({ ...snapshot, appliedId: record.id, created: false });
    } else {
      const created = await pb.collection("uid_counters").create({
        ...definition,
        updated_by: "",
        note: "Đánh lại UID tuần tự bằng script",
      });
      applied.push({ ...snapshot, appliedId: created.id, created: true });
    }
  }
  return applied;
}

async function restoreCounters(pb, applied) {
  for (const item of [...applied].reverse()) {
    if (item.created) {
      await pb.collection("uid_counters").delete(item.appliedId);
    } else {
      await pb.collection("uid_counters").update(item.appliedId, {
        current_value: item.record.current_value,
        updated_by: item.record.updated_by || "",
        note: item.record.note || "",
      });
    }
  }
}

async function validateAppliedData(pb, userPlan, historyPlan, relationBefore, relationFields) {
  for (const [collection, plan] of [
    ["users", userPlan],
    ["employment_histories", historyPlan],
  ]) {
    const records = await pb.collection(collection).getFullList({ fields: "id,uid" });
    const byId = new Map(records.map((record) => [record.id, record]));
    for (const item of plan) {
      if (String(byId.get(item.id)?.uid || "") !== item.new_uid) {
        throw new Error(`${collection}/${item.id} không có UID mới như kế hoạch.`);
      }
    }
  }
  const relationAfter = await captureRelationSnapshot(pb, relationFields);
  if (!relationSnapshotsEqual(relationBefore, relationAfter)) {
    throw new Error("Relation PocketBase đã thay đổi ngoài kế hoạch.");
  }
  return relationAfter;
}

function requireApplySafety(args) {
  if (!args.apply) return;
  if (!args.maintenanceConfirmed) {
    throw new Error(
      `Khi chạy --apply phải dừng PM2/ứng dụng có thể ghi dữ liệu và thêm ${APPLY_CONFIRMATION}.`,
    );
  }
  if (!process.env.PB_URL) {
    throw new Error("Khi chạy --apply, bắt buộc cấu hình PB_URL rõ ràng.");
  }
}

async function main() {
  const args = parseArgs();
  requireApplySafety(args);
  const pb = await connectPocketBase({ requireExplicitUrl: args.apply });
  const outputDir = path.resolve(args.outputDir);
  const baseName = timestampName(args.apply ? "rebuild-uids-applied" : "rebuild-uids-plan");
  const paths = {
    users: path.join(outputDir, `${baseName}-users.csv`),
    histories: path.join(outputDir, `${baseName}-histories.csv`),
    rollback: path.join(outputDir, `${baseName}-rollback.csv`),
    relations: path.join(outputDir, `${baseName}-relations.json`),
    summary: path.join(outputDir, `${baseName}-summary.json`),
  };

  try {
    const prefix = await getConfiguredPrefix(pb);
    const [userResult, historyResult, safetyMeta] = await Promise.all([
      buildUserPlan(pb, prefix),
      buildHistoryPlan(pb, prefix, args),
      loadUidSafetyMeta(pb),
    ]);
    const changedUsers = userResult.plan.filter((item) => item.changed);
    const changedHistories = historyResult.plan.filter((item) => item.changed);
    const relationBefore = await captureRelationSnapshot(pb, safetyMeta.relationFields);

    writeCsv(paths.users, userResult.plan, [
      "collection",
      "id",
      "old_uid",
      "new_uid",
      "username",
      "full_name",
      "created",
      "changed",
    ]);
    writeCsv(paths.histories, historyResult.plan, [
      "collection",
      "id",
      "old_uid",
      "new_uid",
      "user",
      "join_date",
      "uid_date_source",
      "year_month",
      "created",
      "changed",
    ]);

    const summary = {
      mode: args.apply ? "apply" : "dry-run",
      prefix,
      users: { total: userResult.plan.length, changed: changedUsers.length },
      histories: {
        total: historyResult.plan.length,
        changed: changedHistories.length,
        months: historyResult.counterValues.length,
      },
      files: paths,
    };
    writeJson(paths.summary, summary);
    writeJson(paths.relations, {
      before: relationSnapshotSummary(relationBefore),
      after: null,
      unchanged: null,
    });

    if (!args.apply) {
      console.log(JSON.stringify(summary, null, 2));
      console.log("Dry-run hoàn tất. Không có dữ liệu PocketBase nào bị thay đổi.");
      return;
    }

    await assertPlanStillCurrent(pb, "users", userResult.plan);
    await assertPlanStillCurrent(pb, "employment_histories", historyResult.plan);
    const relationLive = await captureRelationSnapshot(pb, safetyMeta.relationFields);
    if (!relationSnapshotsEqual(relationBefore, relationLive)) {
      throw new Error("Relation đã thay đổi kể từ lúc lập kế hoạch. Hãy chạy lại.");
    }

    const userPlan = changedUsers.length
      ? assignTemporaryUids(
          changedUsers,
          createTemporaryUids({
            currentUids: userResult.plan.map((item) => item.original_uid),
            count: changedUsers.length,
            uidField: safetyMeta.uidFields.get("users"),
          }),
        )
      : [];
    const historyPlan = changedHistories.length
      ? assignTemporaryUids(
          changedHistories,
          createTemporaryUids({
            currentUids: historyResult.plan.map((item) => item.original_uid),
            count: changedHistories.length,
            uidField: safetyMeta.uidFields.get("employment_histories"),
          }),
        )
      : [];
    const counterSnapshots = await captureCounters(
      pb,
      prefix,
      userResult.maxSequence,
      historyResult.counterValues,
    );

    writeCsv(paths.rollback, [...userPlan, ...historyPlan], [
      "collection",
      "id",
      "original_uid",
      "temporary_uid",
      "new_uid",
    ]);

    const appliedCounters = [];
    try {
      await updateUids(pb, "users", userPlan, "temporary_uid");
      await updateUids(pb, "employment_histories", historyPlan, "temporary_uid");
      await updateUids(pb, "users", userPlan, "new_uid");
      await updateUids(pb, "employment_histories", historyPlan, "new_uid");
      const relationAfter = await validateAppliedData(
        pb,
        userResult.plan,
        historyResult.plan,
        relationBefore,
        safetyMeta.relationFields,
      );
      appliedCounters.push(...(await applyCounters(pb, counterSnapshots)));
      writeJson(paths.relations, {
        before: relationSnapshotSummary(relationBefore),
        after: relationSnapshotSummary(relationAfter),
        unchanged: true,
      });
    } catch (error) {
      const rollbackErrors = [];
      await restoreCounters(pb, appliedCounters).catch((rollbackError) => {
        rollbackErrors.push(`counter: ${rollbackError.message}`);
      });
      await restoreCollection(pb, "employment_histories", historyPlan).catch((rollbackError) => {
        rollbackErrors.push(`employment_histories: ${rollbackError.message}`);
      });
      await restoreCollection(pb, "users", userPlan).catch((rollbackError) => {
        rollbackErrors.push(`users: ${rollbackError.message}`);
      });
      const suffix = rollbackErrors.length
        ? ` Khôi phục có lỗi: ${rollbackErrors.join(" | ")}.`
        : " Đã chạy khôi phục UID/counter theo file rollback.";
      throw new Error(`${error instanceof Error ? error.message : String(error)}.${suffix}`);
    }

    summary.applied = {
      usersUpdated: userPlan.length,
      historiesUpdated: historyPlan.length,
      countersUpdated: counterSnapshots.length,
    };
    writeJson(paths.summary, summary);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    pb.authStore.clear();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Lỗi: ${error.message}`);
    process.exit(1);
  });
}
