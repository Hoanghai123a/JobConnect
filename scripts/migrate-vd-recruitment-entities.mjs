import fs from "node:fs/promises";
import path from "node:path";
import PocketBase from "pocketbase";

const APPLY = process.argv.includes("--apply");
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const reportPath = reportArg ? path.resolve(reportArg.slice("--report=".length)) : "";

async function loadLocalEnv() {
  try {
    const source = await fs.readFile(path.resolve(".env"), "utf8");
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const separator = trimmed.indexOf("=");
      const key = trimmed.slice(0, separator).trim();
      if (key in process.env) continue;
      process.env[key] = trimmed
        .slice(separator + 1)
        .trim()
        .replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {
    // Environment variables can be supplied without a local .env file.
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeName(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function partnerName(user) {
  return text(user.full_name) || text(user.username).replace(/^vd_/i, "").replace(/[._-]+/g, " ");
}

function fieldNames(collection) {
  return new Set((collection.fields || []).map((field) => field.name));
}

function textField(id, name) {
  return {
    autogeneratePattern: "",
    hidden: false,
    id,
    max: 0,
    min: 0,
    name,
    pattern: "",
    presentable: false,
    primaryKey: false,
    required: false,
    system: false,
    type: "text",
  };
}

function ensureEntitySchema(collection) {
  const names = fieldNames(collection);
  const fields = [...collection.fields];
  if (!names.has("status")) {
    fields.push({
      hidden: false,
      id: "select_mainhouses_status",
      maxSelect: 1,
      name: "status",
      presentable: false,
      required: false,
      system: false,
      type: "select",
      values: ["active", "inactive"],
    });
  }
  if (!names.has("legacy_user_id")) {
    fields.push(textField("text_mainhouses_legacyuid", "legacy_user_id"));
  }
  if (!names.has("legacy_username")) {
    fields.push(textField("text_mainhouses_legacyname", "legacy_username"));
  }
  const indexes = [...(collection.indexes || [])];
  if (!indexes.some((index) => index.includes("idx_recruitment_entities_name"))) {
    indexes.push("CREATE INDEX `idx_recruitment_entities_name` ON `recruitment_entities` (`name`)");
  }
  if (!indexes.some((index) => index.includes("idx_recruitment_entities_status"))) {
    indexes.push("CREATE INDEX `idx_recruitment_entities_status` ON `recruitment_entities` (`status`)");
  }
  return { name: "recruitment_entities", fields, indexes };
}

function ensureHistorySchema(collection, entityCollectionId) {
  const names = fieldNames(collection);
  if (names.has("recruiter_partner")) return null;
  return {
    fields: [
      ...collection.fields,
      {
        cascadeDelete: false,
        collectionId: entityCollectionId,
        hidden: false,
        id: "relation_emphist_partner",
        maxSelect: 1,
        minSelect: 0,
        name: "recruiter_partner",
        presentable: true,
        required: false,
        system: false,
        type: "relation",
      },
    ],
    indexes: [
      ...(collection.indexes || []),
      "CREATE INDEX `idx_emphist_recruiter_partner` ON `employment_histories` (`recruiter_partner`)",
    ],
  };
}

async function main() {
  await loadLocalEnv();
  const baseUrl = process.env.PB_URL || process.env.VITE_PB_URL || "http://127.0.0.1:8090";
  const email = process.env.PB_ADMIN_EMAIL;
  const password = process.env.PB_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Thieu PB_ADMIN_EMAIL hoac PB_ADMIN_PASSWORD.");

  const pb = new PocketBase(baseUrl);
  pb.autoCancellation(false);
  await pb.collection("_superusers").authWithPassword(email, password);

  let collections = await pb.collections.getFullList();
  let entityCollection = collections.find(
    (collection) => collection.id === "pbc_mainhouses001" || ["main_houses", "recruitment_entities"].includes(collection.name),
  );
  const historyCollection = collections.find((collection) => collection.name === "employment_histories");
  if (!entityCollection) throw new Error("Khong tim thay collection main_houses/recruitment_entities.");
  if (!historyCollection) throw new Error("Khong tim thay collection employment_histories.");

  const schemaPlan = {
    renameCollection: entityCollection.name !== "recruitment_entities",
    addEntityFields: ["status", "legacy_user_id", "legacy_username"].filter(
      (field) => !fieldNames(entityCollection).has(field),
    ),
    addRecruiterPartner: !fieldNames(historyCollection).has("recruiter_partner"),
  };

  if (APPLY && (schemaPlan.renameCollection || schemaPlan.addEntityFields.length)) {
    await pb.collections.update(entityCollection.id, ensureEntitySchema(entityCollection));
  }
  if (APPLY && schemaPlan.addRecruiterPartner) {
    const historyUpdate = ensureHistorySchema(historyCollection, entityCollection.id);
    if (historyUpdate) await pb.collections.update(historyCollection.id, historyUpdate);
  }

  if (APPLY) {
    collections = await pb.collections.getFullList();
    entityCollection = collections.find((collection) => collection.id === entityCollection.id);
  }

  const [allUsers, entities] = await Promise.all([
    pb.collection("users").getFullList({ sort: "created" }),
    pb.collection(APPLY ? "recruitment_entities" : entityCollection.name).getFullList({ sort: "name" }),
  ]);
  const partnerUsers = allUsers.filter((user) => text(user.username).toLowerCase().startsWith("vd_"));
  const entitiesByLegacyUser = new Map(
    entities.filter((entity) => entity.legacy_user_id).map((entity) => [entity.legacy_user_id, entity]),
  );
  const entitiesByName = new Map();
  for (const entity of entities) {
    const key = normalizeName(entity.name);
    if (!key) continue;
    const rows = entitiesByName.get(key) || [];
    rows.push(entity);
    entitiesByName.set(key, rows);
  }

  const report = {
    mode: APPLY ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    schemaPlan,
    totals: { partnerUsers: partnerUsers.length, createdEntities: 0, reusedEntities: 0, histories: 0, assignments: 0, lockedUsers: 0 },
    migrated: [],
    review: [],
  };

  for (const user of partnerUsers) {
    const name = partnerName(user);
    const normalized = normalizeName(name);
    if (!normalized) {
      report.review.push({ userId: user.id, username: user.username, reason: "missing_name" });
      continue;
    }

    let entity = entitiesByLegacyUser.get(user.id);
    if (!entity) {
      const exactMatches = entitiesByName.get(normalized) || [];
      if (exactMatches.length > 1) {
        report.review.push({ userId: user.id, username: user.username, name, reason: "duplicate_exact_name", entityIds: exactMatches.map((item) => item.id) });
        continue;
      }
      entity = exactMatches[0];
    }

    let action = "reuse";
    if (!entity) {
      action = "create";
      if (APPLY) {
        entity = await pb.collection("recruitment_entities").create({
          name,
          address: text(user.address),
          hotline: text(user.phone),
          note: `Chuyen tu tai khoan ${text(user.username)}`,
          status: "active",
          legacy_user_id: user.id,
          legacy_username: text(user.username),
        });
        const rows = entitiesByName.get(normalized) || [];
        rows.push(entity);
        entitiesByName.set(normalized, rows);
        entitiesByLegacyUser.set(user.id, entity);
      } else {
        entity = { id: `new:${user.id}`, name };
      }
      report.totals.createdEntities++;
    } else {
      report.totals.reusedEntities++;
      if (APPLY && (!entity.legacy_user_id || entity.status === "inactive")) {
        entity = await pb.collection("recruitment_entities").update(entity.id, {
          legacy_user_id: entity.legacy_user_id || user.id,
          legacy_username: entity.legacy_username || text(user.username),
          status: entity.status === "inactive" ? "inactive" : "active",
        });
      }
    }

    const [histories, assignments] = await Promise.all([
      pb.collection("employment_histories").getFullList({ filter: `recruiter_staff="${user.id}"` }),
      pb.collection("factory_managers").getFullList({ filter: `staff="${user.id}"` }).catch(() => []),
    ]);

    if (APPLY) {
      for (const history of histories) {
        await pb.collection("employment_histories").update(history.id, {
          recruiter_staff: "",
          recruiter_partner: entity.id,
        });
      }
      for (const assignment of assignments) {
        await pb.collection("factory_managers").update(assignment.id, { status: "inactive" });
      }
      await pb.collection("users").update(user.id, { status: "disabled" });
    }

    report.totals.histories += histories.length;
    report.totals.assignments += assignments.length;
    report.totals.lockedUsers++;
    report.migrated.push({ userId: user.id, username: user.username, name, entityId: entity.id, action, histories: histories.length, assignments: assignments.length });
  }

  if (reportPath) await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!APPLY) console.log("\nDry-run: them --apply de thuc hien migration.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
