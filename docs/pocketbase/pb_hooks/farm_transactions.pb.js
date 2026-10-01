/// <reference path="../pb_data/types.d.ts" />

/**
 * Farm Transaction Endpoints
 * Server-side validation cho tất cả game transactions
 *
 * Endpoints:
 * - POST /api/farm/buy-seed
 * - POST /api/farm/plant-crop
 * - POST /api/farm/harvest-crop
 * - POST /api/farm/sell-crop
 */

// Crop configurations (must match client-side CROPS)
const CROPS = {
  carrot: { seedCost: 20, sellPrice: 35, growTime: 30, expReward: 3, unlockedAtLevel: 1 },
  rice: { seedCost: 30, sellPrice: 55, growTime: 60, expReward: 5, unlockedAtLevel: 1 },
  lettuce: { seedCost: 25, sellPrice: 45, growTime: 45, expReward: 4, unlockedAtLevel: 2 },
  corn: { seedCost: 50, sellPrice: 90, growTime: 120, expReward: 8, unlockedAtLevel: 3 },
  potato: { seedCost: 80, sellPrice: 140, growTime: 180, expReward: 12, unlockedAtLevel: 4 },
  tomato: { seedCost: 120, sellPrice: 210, growTime: 300, expReward: 18, unlockedAtLevel: 5 },
  strawberry: { seedCost: 200, sellPrice: 360, growTime: 600, expReward: 30, unlockedAtLevel: 6 },
  pumpkin: { seedCost: 300, sellPrice: 560, growTime: 800, expReward: 40, unlockedAtLevel: 7 },
  chili: { seedCost: 250, sellPrice: 470, growTime: 700, expReward: 35, unlockedAtLevel: 8 },
  watermelon: { seedCost: 400, sellPrice: 750, growTime: 1000, expReward: 50, unlockedAtLevel: 9 },
  grape: { seedCost: 500, sellPrice: 950, growTime: 1200, expReward: 60, unlockedAtLevel: 10 },
  eggplant: { seedCost: 450, sellPrice: 850, growTime: 1100, expReward: 55, unlockedAtLevel: 11 },
  sunflower: { seedCost: 750, sellPrice: 1400, growTime: 1800, expReward: 90, unlockedAtLevel: 12 },
  dragon_fruit: { seedCost: 1200, sellPrice: 2300, growTime: 3600, expReward: 140, unlockedAtLevel: 13 },
  golden_ginger: { seedCost: 1500, sellPrice: 2900, growTime: 4200, expReward: 180, unlockedAtLevel: 14 }
};

/**
 * Helper: Get player record
 */
function getPlayer(userId) {
  try {
    return $app.dao().findFirstRecordByFilter(
      "farm_players",
      `user = "${userId}"`
    );
  } catch (e) {
    return null;
  }
}

/**
 * Helper: Get or create inventory item
 */
function getOrCreateInventoryItem(playerId, cropId) {
  try {
    return $app.dao().findFirstRecordByFilter(
      "farm_inventory",
      `player = "${playerId}" && crop_id = "${cropId}"`
    );
  } catch (e) {
    // Create new inventory item
    const collection = $app.dao().findCollectionByNameOrId("farm_inventory");
    const record = new Record(collection);
    record.set("player", playerId);
    record.set("crop_id", cropId);
    record.set("quantity", 0);
    return record;
  }
}

/**
 * Helper: Log transaction
 */
function logTransaction(playerId, type, data) {
  try {
    const collection = $app.dao().findCollectionByNameOrId("farm_transactions");
    const record = new Record(collection);
    record.set("player", playerId);
    record.set("transaction_type", type);
    record.set("transaction_data", data);
    $app.dao().saveRecord(record);
  } catch (e) {
    console.error("Failed to log transaction:", e);
  }
}

/**
 * Endpoint: Buy Seed
 * POST /api/farm/buy-seed
 * Body: { cropId: string }
 */
routerAdd("POST", "/api/farm/buy-seed", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) {
    return c.json(400, { error: "Unauthorized" });
  }

  const data = $apis.requestInfo(c).data;
  const cropId = data.cropId;

  // Validate crop exists
  const cropConfig = CROPS[cropId];
  if (!cropConfig) {
    return c.json(400, { error: "Crop không tồn tại" });
  }

  // Get player
  const player = getPlayer(authRecord.id);
  if (!player) {
    return c.json(404, { error: "Player không tồn tại" });
  }

  // Validate coins
  if (player.get("coins") < cropConfig.seedCost) {
    return c.json(400, { error: "Không đủ xu" });
  }

  // Validate level
  if (player.get("level") < cropConfig.unlockedAtLevel) {
    return c.json(400, { error: "Chưa đủ cấp" });
  }

  try {
    // Deduct coins
    player.set("coins", player.get("coins") - cropConfig.seedCost);
    $app.dao().saveRecord(player);

    // Add to inventory
    const inventoryItem = getOrCreateInventoryItem(player.id, cropId);
    inventoryItem.set("quantity", inventoryItem.get("quantity") + 1);
    $app.dao().saveRecord(inventoryItem);

    // Log transaction
    logTransaction(player.id, "BUY_SEED", {
      cropId: cropId,
      cost: cropConfig.seedCost,
      timestamp: new Date().toISOString()
    });

    return c.json(200, {
      success: true,
      player: {
        coins: player.get("coins"),
        level: player.get("level")
      },
      inventory: {
        cropId: cropId,
        quantity: inventoryItem.get("quantity")
      }
    });
  } catch (e) {
    console.error("Buy seed error:", e);
    return c.json(500, { error: "Giao dịch thất bại" });
  }
}, $apis.requireRecordAuth());

/**
 * Endpoint: Plant Crop
 * POST /api/farm/plant-crop
 * Body: { plotId: number, cropId: string }
 */
routerAdd("POST", "/api/farm/plant-crop", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) {
    return c.json(400, { error: "Unauthorized" });
  }

  const data = $apis.requestInfo(c).data;
  const plotId = data.plotId;
  const cropId = data.cropId;

  // Validate crop exists
  const cropConfig = CROPS[cropId];
  if (!cropConfig) {
    return c.json(400, { error: "Crop không tồn tại" });
  }

  // Get player
  const player = getPlayer(authRecord.id);
  if (!player) {
    return c.json(404, { error: "Player không tồn tại" });
  }

  // Get plot
  let plot;
  try {
    plot = $app.dao().findFirstRecordByFilter(
      "farm_plots",
      `player = "${player.id}" && plot_id = ${plotId}`
    );
  } catch (e) {
    return c.json(404, { error: "Ô đất không tồn tại" });
  }

  // Validate plot is empty
  if (plot.get("crop_id") !== "") {
    return c.json(400, { error: "Ô đất đã có cây" });
  }

  // Get inventory item
  let inventoryItem;
  try {
    inventoryItem = $app.dao().findFirstRecordByFilter(
      "farm_inventory",
      `player = "${player.id}" && crop_id = "${cropId}"`
    );
  } catch (e) {
    return c.json(400, { error: "Không có hạt giống trong kho" });
  }

  // Validate inventory quantity
  if (inventoryItem.get("quantity") < 1) {
    return c.json(400, { error: "Không có hạt giống trong kho" });
  }

  try {
    // Remove from inventory
    inventoryItem.set("quantity", inventoryItem.get("quantity") - 1);
    $app.dao().saveRecord(inventoryItem);

    // Plant on plot (SERVER controls timestamps)
    const now = new Date();
    const harvestAt = new Date(now.getTime() + cropConfig.growTime * 1000);

    plot.set("crop_id", cropId);
    plot.set("planted_at", now.toISOString());
    plot.set("harvest_at", harvestAt.toISOString());
    $app.dao().saveRecord(plot);

    // Log transaction
    logTransaction(player.id, "PLANT_CROP", {
      plotId: plotId,
      cropId: cropId,
      plantedAt: now.toISOString(),
      harvestAt: harvestAt.toISOString()
    });

    return c.json(200, {
      success: true,
      plot: {
        plotId: plotId,
        cropId: cropId,
        plantedAt: now.toISOString(),
        harvestAt: harvestAt.toISOString()
      },
      inventory: {
        cropId: cropId,
        quantity: inventoryItem.get("quantity")
      }
    });
  } catch (e) {
    console.error("Plant crop error:", e);
    return c.json(500, { error: "Không thể trồng" });
  }
}, $apis.requireRecordAuth());

/**
 * Endpoint: Harvest Crop
 * POST /api/farm/harvest-crop
 * Body: { plotId: number }
 */
routerAdd("POST", "/api/farm/harvest-crop", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) {
    return c.json(400, { error: "Unauthorized" });
  }

  const data = $apis.requestInfo(c).data;
  const plotId = data.plotId;

  // Get player
  const player = getPlayer(authRecord.id);
  if (!player) {
    return c.json(404, { error: "Player không tồn tại" });
  }

  // Get plot
  let plot;
  try {
    plot = $app.dao().findFirstRecordByFilter(
      "farm_plots",
      `player = "${player.id}" && plot_id = ${plotId}`
    );
  } catch (e) {
    return c.json(404, { error: "Ô đất không tồn tại" });
  }

  // Validate plot has crop
  const cropId = plot.get("crop_id");
  if (!cropId || cropId === "") {
    return c.json(400, { error: "Ô đất trống" });
  }

  // Validate crop config
  const cropConfig = CROPS[cropId];
  if (!cropConfig) {
    return c.json(400, { error: "Crop không tồn tại" });
  }

  // SERVER validates harvest_at (prevent early harvest)
  const harvestAt = new Date(plot.get("harvest_at"));
  const now = new Date();

  if (now < harvestAt) {
    return c.json(400, {
      error: "Cây chưa lớn",
      timeRemaining: Math.ceil((harvestAt - now) / 1000)
    });
  }

  try {
    // Clear plot
    plot.set("crop_id", "");
    plot.set("planted_at", "");
    plot.set("harvest_at", "");
    $app.dao().saveRecord(plot);

    // Add rewards: coins, exp, inventory
    const newCoins = player.get("coins") + cropConfig.sellPrice;
    const newExp = player.get("exp") + cropConfig.expReward;

    // Calculate level up
    let currentLevel = player.get("level");
    let expForNextLevel = 100 * Math.pow(1.5, currentLevel - 1);
    let leveledUp = false;

    while (newExp >= expForNextLevel && currentLevel < 100) {
      currentLevel++;
      expForNextLevel = 100 * Math.pow(1.5, currentLevel - 1);
      leveledUp = true;
    }

    player.set("coins", newCoins);
    player.set("exp", newExp);
    player.set("level", currentLevel);
    $app.dao().saveRecord(player);

    // Add to inventory
    const inventoryItem = getOrCreateInventoryItem(player.id, cropId);
    inventoryItem.set("quantity", inventoryItem.get("quantity") + 1);
    $app.dao().saveRecord(inventoryItem);

    // Log transaction
    logTransaction(player.id, "HARVEST_CROP", {
      plotId: plotId,
      cropId: cropId,
      rewards: {
        coins: cropConfig.sellPrice,
        exp: cropConfig.expReward
      },
      leveledUp: leveledUp,
      newLevel: currentLevel
    });

    return c.json(200, {
      success: true,
      rewards: {
        coins: cropConfig.sellPrice,
        exp: cropConfig.expReward,
        cropId: cropId
      },
      player: {
        coins: newCoins,
        exp: newExp,
        level: currentLevel,
        leveledUp: leveledUp
      },
      inventory: {
        cropId: cropId,
        quantity: inventoryItem.get("quantity")
      }
    });
  } catch (e) {
    console.error("Harvest crop error:", e);
    return c.json(500, { error: "Không thể thu hoạch" });
  }
}, $apis.requireRecordAuth());

/**
 * Endpoint: Sell Crop
 * POST /api/farm/sell-crop
 * Body: { cropId: string, quantity: number }
 */
routerAdd("POST", "/api/farm/sell-crop", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) {
    return c.json(400, { error: "Unauthorized" });
  }

  const data = $apis.requestInfo(c).data;
  const cropId = data.cropId;
  const quantity = data.quantity || 1;

  // Validate quantity
  if (quantity <= 0 || quantity > 999) {
    return c.json(400, { error: "Số lượng không hợp lệ" });
  }

  // Validate crop exists
  const cropConfig = CROPS[cropId];
  if (!cropConfig) {
    return c.json(400, { error: "Crop không tồn tại" });
  }

  // Get player
  const player = getPlayer(authRecord.id);
  if (!player) {
    return c.json(404, { error: "Player không tồn tại" });
  }

  // Get inventory item
  let inventoryItem;
  try {
    inventoryItem = $app.dao().findFirstRecordByFilter(
      "farm_inventory",
      `player = "${player.id}" && crop_id = "${cropId}"`
    );
  } catch (e) {
    return c.json(400, { error: "Không có crop trong kho" });
  }

  // Validate inventory quantity
  if (inventoryItem.get("quantity") < quantity) {
    return c.json(400, { error: "Không đủ số lượng trong kho" });
  }

  try {
    // Remove from inventory
    inventoryItem.set("quantity", inventoryItem.get("quantity") - quantity);
    $app.dao().saveRecord(inventoryItem);

    // Add coins
    const earned = cropConfig.sellPrice * quantity;
    player.set("coins", player.get("coins") + earned);
    $app.dao().saveRecord(player);

    // Log transaction
    logTransaction(player.id, "SELL_CROP", {
      cropId: cropId,
      quantity: quantity,
      earned: earned,
      timestamp: new Date().toISOString()
    });

    return c.json(200, {
      success: true,
      earned: earned,
      player: {
        coins: player.get("coins")
      },
      inventory: {
        cropId: cropId,
        quantity: inventoryItem.get("quantity")
      }
    });
  } catch (e) {
    console.error("Sell crop error:", e);
    return c.json(500, { error: "Không thể bán" });
  }
}, $apis.requireRecordAuth());

console.log("Farm transaction endpoints registered");
