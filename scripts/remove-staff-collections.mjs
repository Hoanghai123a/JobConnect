#!/usr/bin/env node
/**
 * Migration: Remove Staff-related collections
 *
 * Collections to delete:
 * - staff_action_logs
 * - factory_managers
 * - recruitment_entities (main_houses)
 * - salary_holds
 * - cccd_versions
 *
 * Keep: employment_histories (needed for check-attendance)
 */

import PocketBase from "pocketbase";

const pb = new PocketBase("http://localhost:8090");

// Admin credentials - you'll need to set these
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "admin@jobconnect.local";
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "admin123456";

const COLLECTIONS_TO_DELETE = [
  "staff_action_logs",
  "factory_managers",
  "recruitment_entities",
  "salary_holds",
  "cccd_versions",
];

async function main() {
  console.log("🔐 Authenticating as admin...");
  try {
    await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
    console.log("✅ Authenticated\n");
  } catch (error) {
    console.error("❌ Authentication failed:", error.message);
    console.error("Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD environment variables");
    process.exit(1);
  }

  console.log("📋 Collections to delete:", COLLECTIONS_TO_DELETE.join(", "));
  console.log("");

  // List all collections first
  console.log("📊 Current collections:");
  const collections = await pb.collections.getFullList({ sort: "name" });
  collections.forEach((col) => {
    const willDelete = COLLECTIONS_TO_DELETE.includes(col.name);
    console.log(`  ${willDelete ? "❌" : "  "} ${col.name}`);
  });
  console.log("");

  // Count records before deletion
  console.log("🔢 Record counts before deletion:");
  for (const collectionName of COLLECTIONS_TO_DELETE) {
    try {
      const list = await pb.collection(collectionName).getList(1, 1);
      console.log(`  ${collectionName}: ${list.totalItems} records`);
    } catch (error) {
      console.log(`  ${collectionName}: ⚠️  Not found or error - ${error.message}`);
    }
  }
  console.log("");

  // Confirm deletion
  console.log("⚠️  WARNING: This will PERMANENTLY delete data!");
  console.log("⏸️  Press Ctrl+C now to cancel, or wait 5 seconds to continue...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Delete collections
  console.log("\n🗑️  Deleting collections...");
  for (const collectionName of COLLECTIONS_TO_DELETE) {
    try {
      // Find collection by name
      const collection = collections.find((c) => c.name === collectionName);
      if (!collection) {
        console.log(`  ⚠️  ${collectionName}: Not found, skipping`);
        continue;
      }

      // Delete collection
      await pb.collections.delete(collection.id);
      console.log(`  ✅ ${collectionName}: Deleted`);
    } catch (error) {
      console.error(`  ❌ ${collectionName}: Failed - ${error.message}`);
    }
  }

  console.log("\n✨ Migration completed!");
  console.log("\n📝 Summary:");
  console.log("  - Deleted 5 collections related to Staff workflow");
  console.log("  - Kept: employment_histories (needed for check-attendance)");
  console.log("  - Kept: advances (simplified workflow, User → Admin)");
  console.log("  - Next: Update users with role='staff' to 'user' or delete them");
}

main().catch((error) => {
  console.error("\n💥 Migration failed:", error);
  process.exit(1);
});
