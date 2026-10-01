/**
 * PocketBase Hook: Daily Quest Reset
 *
 * Tự động reset quests hàng ngày cho tất cả players
 *
 * Installation:
 * 1. Copy file này vào pb_hooks/ folder trong PocketBase
 * 2. PocketBase sẽ tự động load và chạy cronAdd job
 *
 * Cron schedule: "0 0 * * *" = chạy lúc 00:00 (midnight) mỗi ngày
 */

/// <reference path="../pb_data/types.d.ts" />

cronAdd("daily_quest_reset", "0 0 * * *", () => {
  const now = new Date().toISOString();

  console.log(`[${now}] Starting daily quest reset...`);

  try {
    // Get all quest records
    const quests = $app.dao().findRecordsByFilter(
      "farm_quests",
      "reset_at <= {:now}",
      "-created", // Sort by created desc
      500, // Limit per batch
      0, // Offset
      { now }
    );

    let resetCount = 0;
    let errorCount = 0;

    // Reset each expired quest
    quests.forEach((quest) => {
      try {
        // Reset progress and claimed status
        quest.set("progress", 0);
        quest.set("claimed", false);

        // Set next reset time (24 hours from now)
        const nextReset = new Date();
        nextReset.setHours(nextReset.getHours() + 24);
        quest.set("reset_at", nextReset.toISOString());

        $app.dao().saveRecord(quest);
        resetCount++;
      } catch (err) {
        console.error(`Failed to reset quest ${quest.id}:`, err);
        errorCount++;
      }
    });

    console.log(`[${now}] Quest reset completed: ${resetCount} reset, ${errorCount} errors`);

    // Log to admin collection for audit trail
    try {
      const logCollection = $app.dao().findCollectionByNameOrId("system_logs");
      if (logCollection) {
        const logRecord = new Record(logCollection);
        logRecord.set("type", "quest_reset");
        logRecord.set("message", `Daily quest reset: ${resetCount} quests reset, ${errorCount} errors`);
        logRecord.set("data", {
          reset_count: resetCount,
          error_count: errorCount,
          timestamp: now
        });
        $app.dao().saveRecord(logRecord);
      }
    } catch (logErr) {
      console.error("Failed to create audit log:", logErr);
    }

  } catch (err) {
    console.error(`[${now}] Quest reset failed:`, err);
  }
});

/**
 * Alternative: Manual reset API endpoint
 *
 * Cho phép admin trigger quest reset manually qua API
 */
routerAdd("POST", "/api/farm/admin/reset-quests", (c) => {
  // Verify admin authentication
  const admin = c.get("admin");
  if (!admin) {
    return c.json(401, { error: "Unauthorized - Admin only" });
  }

  const now = new Date().toISOString();

  try {
    // Get all quests (no filter for manual reset)
    const quests = $app.dao().findRecordsByFilter(
      "farm_quests",
      "",
      "-created",
      1000,
      0
    );

    let resetCount = 0;

    quests.forEach((quest) => {
      try {
        quest.set("progress", 0);
        quest.set("claimed", false);

        const nextReset = new Date();
        nextReset.setHours(nextReset.getHours() + 24);
        quest.set("reset_at", nextReset.toISOString());

        $app.dao().saveRecord(quest);
        resetCount++;
      } catch (err) {
        console.error(`Failed to reset quest ${quest.id}:`, err);
      }
    });

    return c.json(200, {
      success: true,
      reset_count: resetCount,
      timestamp: now
    });

  } catch (err) {
    console.error("Manual quest reset failed:", err);
    return c.json(500, { error: "Reset failed", details: err.message });
  }
}, $apis.requireAdminAuth());
