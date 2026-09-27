/**
 * List PocketBase collections and check for Staff-related ones
 * Run this before the migration to see what exists
 */

import PocketBase from "pocketbase";

const pb = new PocketBase("http://localhost:8090");

// Try to authenticate with default admin credentials
// If this fails, you'll need to manually set credentials
const tryAuth = async () => {
  const credentials = [
    { email: "admin@jobconnect.local", password: "admin123456" },
    { email: "admin@example.com", password: "admin123456" },
  ];

  for (const cred of credentials) {
    try {
      await pb.admins.authWithPassword(cred.email, cred.password);
      console.log(`✅ Authenticated as ${cred.email}\n`);
      return true;
    } catch {
      // Try next credential
    }
  }
  return false;
};

async function main() {
  console.log("🔍 Checking PocketBase collections...\n");

  const authenticated = await tryAuth();
  if (!authenticated) {
    console.log("⚠️  Could not authenticate with default credentials");
    console.log("   Please run the migration manually from PocketBase admin UI");
    console.log("   Or update credentials in the script\n");
    process.exit(1);
  }

  const collections = await pb.collections.getFullList({ sort: "name" });
  const targets = [
    "staff_action_logs",
    "factory_managers",
    "recruitment_entities",
    "salary_holds",
    "cccd_versions",
  ];

  console.log("📋 All collections:");
  collections.forEach((col) => {
    const isTarget = targets.includes(col.name);
    const marker = isTarget ? "❌ DELETE" : "✓ KEEP  ";
    console.log(`  ${marker}  ${col.name}`);
  });

  console.log("\n🔢 Records in collections to delete:");
  for (const name of targets) {
    try {
      const list = await pb.collection(name).getList(1, 1);
      console.log(`  ${name}: ${list.totalItems} records`);
    } catch (e) {
      console.log(`  ${name}: Not found (already deleted or doesn't exist)`);
    }
  }

  console.log("\n✨ To proceed with deletion, run:");
  console.log("   node scripts/remove-staff-collections.mjs");
}

main().catch((error) => {
  console.error("\n❌ Error:", error.message);
  process.exit(1);
});
