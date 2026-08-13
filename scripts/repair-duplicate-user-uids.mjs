import fs from "node:fs";
import path from "node:path";
import {
  connectPocketBase,
  duplicateGroups,
  normalizeUid,
  parseArgs,
  readCsv,
  timestampName,
  writeCsv,
} from "./uid-duplicate-tools.mjs";

async function main() {
  const args = parseArgs();
  if (!args.input) throw new Error("Thiếu --input <file CSV đã duyệt>.");
  const inputPath = path.resolve(args.input);
  const rows = readCsv(inputPath);
  if (!rows.length) throw new Error("CSV không có dữ liệu.");
  const required = ["approved", "decision", "old_uid", "new_uid", "user_id"];
  for (const field of required) if (!(field in rows[0])) throw new Error(`CSV thiếu cột ${field}.`);

  const pb = await connectPocketBase();
  const currentUsers = await pb
    .collection("users")
    .getFullList({ fields: "id,uid,username,full_name" });
  const userById = new Map(currentUsers.map((user) => [user.id, user]));
  const currentUidOwners = new Map();
  for (const user of currentUsers) {
    const uid = normalizeUid(user.uid);
    if (uid) currentUidOwners.set(uid, [...(currentUidOwners.get(uid) || []), user.id]);
  }

  const groupedRows = new Map();
  for (const raw of rows) {
    const row = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, String(value || "").trim()]),
    );
    row.approved = row.approved.toUpperCase();
    row.decision = row.decision.toUpperCase();
    row.old_uid = normalizeUid(row.old_uid);
    row.new_uid = normalizeUid(row.new_uid);
    if (!row.old_uid || !row.user_id) throw new Error("Mỗi dòng phải có old_uid và user_id.");
    groupedRows.set(row.old_uid, [...(groupedRows.get(row.old_uid) || []), row]);
  }

  const errors = [];
  const planned = [];
  const reservedNewUids = new Set();
  for (const [oldUid, group] of groupedRows) {
    if (group.some((row) => row.approved !== "YES"))
      errors.push(`${oldUid}: toàn bộ dòng trong nhóm phải approved=YES.`);
    const keepers = group.filter((row) => row.decision === "KEEP");
    if (keepers.length !== 1) errors.push(`${oldUid}: phải có đúng một dòng decision=KEEP.`);
    for (const row of group) {
      if (row.decision !== "KEEP" && row.decision !== "CHANGE")
        errors.push(`${oldUid}/${row.user_id}: decision chỉ được KEEP hoặc CHANGE.`);
      const user = userById.get(row.user_id);
      if (!user) {
        errors.push(`${oldUid}/${row.user_id}: không còn tồn tại trong users.`);
        continue;
      }
      if (normalizeUid(user.uid) !== oldUid)
        errors.push(
          `${oldUid}/${row.user_id}: UID hiện tại đã thay đổi thành ${normalizeUid(user.uid) || "rỗng"}.`,
        );
      if (row.decision === "KEEP" && row.new_uid)
        errors.push(`${oldUid}/${row.user_id}: dòng KEEP phải để trống new_uid.`);
      if (row.decision === "CHANGE") {
        if (!row.new_uid) errors.push(`${oldUid}/${row.user_id}: dòng CHANGE thiếu new_uid.`);
        if (row.new_uid === oldUid)
          errors.push(`${oldUid}/${row.user_id}: new_uid phải khác old_uid.`);
        if (reservedNewUids.has(row.new_uid)) errors.push(`${row.new_uid}: bị dùng lặp trong CSV.`);
        reservedNewUids.add(row.new_uid);
        const owners = currentUidOwners.get(row.new_uid) || [];
        if (owners.some((id) => id !== row.user_id))
          errors.push(`${row.new_uid}: đã được tài khoản khác sử dụng.`);
        planned.push({
          ...row,
          current_username: user.username || "",
          current_full_name: user.full_name || "",
        });
      }
    }
  }

  const liveDuplicateGroups = duplicateGroups(currentUsers);
  for (const uid of liveDuplicateGroups.keys())
    if (!groupedRows.has(uid))
      errors.push(`${uid}: đang trùng trên PocketBase nhưng không có trong CSV duyệt.`);
  if (errors.length) {
    pb.authStore.clear();
    throw new Error(`CSV chưa hợp lệ:\n${errors.join("\n")}`);
  }

  const outputDir = path.resolve(args.outputDir);
  const baseName = timestampName(
    args.apply ? "duplicate-user-uids-applied" : "duplicate-user-uids-dry-run",
  );
  const planPath = path.join(outputDir, `${baseName}.csv`);
  writeCsv(planPath, planned, [
    "old_uid",
    "new_uid",
    "user_id",
    "current_username",
    "current_full_name",
    "reason",
  ]);
  if (!args.apply) {
    console.log(
      JSON.stringify(
        { valid: true, mode: "dry-run", updates: planned.length, plan: planPath },
        null,
        2,
      ),
    );
    console.log(
      "Không có dữ liệu nào bị thay đổi. Thêm --apply để thực hiện sau khi kiểm tra file dry-run.",
    );
    pb.authStore.clear();
    return;
  }

  const settings = await pb
    .collection("app_settings")
    .getList(1, 1, { fields: "account_code_prefix" });
  const prefix = String(settings.items[0]?.account_code_prefix || "")
    .trim()
    .toUpperCase();
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const uidPattern = new RegExp(`^${escapedPrefix}(\\d{6})$`);
  const plannedSequences = planned.map((item) => Number(item.new_uid.match(uidPattern)?.[1] || 0));
  if (plannedSequences.some((value) => value < 1)) {
    pb.authStore.clear();
    throw new Error(`Tất cả UID mới phải đúng định dạng ${prefix || "<PREFIX>"}000001.`);
  }
  const counterKey = `user:${prefix}`;
  const counter = await pb
    .collection("uid_counters")
    .getFirstListItem(`counter_key="${counterKey.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .catch(() => null);
  if (!counter) {
    pb.authStore.clear();
    throw new Error("Chưa có bộ đếm UID user. Hãy chạy pb:init-uid-counters trước.");
  }
  const firstPlannedSequence = Math.min(...plannedSequences);
  const lastPlannedSequence = Math.max(...plannedSequences);
  if (Number(counter.current_value || 0) >= firstPlannedSequence) {
    pb.authStore.clear();
    throw new Error(
      `Bộ đếm UID đã tiến tới ${counter.current_value}, chồng lên dải CSV từ ${firstPlannedSequence}. Hãy chạy audit lại để nhận dải UID mới.`,
    );
  }
  await pb.collection("uid_counters").update(counter.id, {
    current_value: lastPlannedSequence,
    note: "Giữ dải UID cho repair dữ liệu trùng",
  });
  console.log(
    `Đã giữ dải UID ${prefix}${String(firstPlannedSequence).padStart(6, "0")} - ${prefix}${String(lastPlannedSequence).padStart(6, "0")}.`,
  );

  const rollbackRows = [];
  for (const [index, item] of planned.entries()) {
    const before = userById.get(item.user_id);
    try {
      await pb.collection("users").update(item.user_id, { uid: item.new_uid });
      rollbackRows.push({
        user_id: item.user_id,
        restore_uid: item.old_uid,
        applied_uid: item.new_uid,
        username: before?.username || "",
        full_name: before?.full_name || "",
      });
      console.log(
        `[${index + 1}/${planned.length}] ${item.old_uid} -> ${item.new_uid} (${item.user_id})`,
      );
    } catch (error) {
      const rollbackPath = path.join(outputDir, `${baseName}-rollback.csv`);
      writeCsv(rollbackPath, rollbackRows, [
        "user_id",
        "restore_uid",
        "applied_uid",
        "username",
        "full_name",
      ]);
      throw new Error(
        `Dừng tại ${item.user_id}: ${error?.message || "PocketBase từ chối cập nhật"}. File rollback: ${rollbackPath}`,
      );
    }
  }

  const afterUsers = await pb.collection("users").getFullList({ fields: "id,uid" });
  const remaining = duplicateGroups(afterUsers);
  const rollbackPath = path.join(outputDir, `${baseName}-rollback.csv`);
  writeCsv(rollbackPath, rollbackRows, [
    "user_id",
    "restore_uid",
    "applied_uid",
    "username",
    "full_name",
  ]);
  if (remaining.size)
    throw new Error(
      `Đã cập nhật nhưng vẫn còn ${remaining.size} nhóm UID trùng. Kiểm tra file rollback ${rollbackPath}.`,
    );
  console.log(
    JSON.stringify(
      {
        valid: true,
        mode: "apply",
        updated: planned.length,
        result: planPath,
        rollback: rollbackPath,
        remainingDuplicateGroups: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    "Không có tài khoản hoặc relation nào bị xóa/gộp; script chỉ cập nhật trường users.uid.",
  );

  pb.authStore.clear();
}

await main();
