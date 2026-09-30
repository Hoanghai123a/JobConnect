/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("coin_settings");

  // Thêm gems_game_enabled
  const gemsRecord = new Record(collection, {
    setting_key: "gems_game_enabled",
    coin_amount: 1,
    description: "Bật/tắt trò chơi kim cương",
    category: "game",
    active: true,
  });
  dao.saveRecord(gemsRecord);

  // Thêm minesweeper_game_enabled
  const minesweeperRecord = new Record(collection, {
    setting_key: "minesweeper_game_enabled",
    coin_amount: 1,
    description: "Bật/tắt trò chơi dò mìn",
    category: "game",
    active: true,
  });
  dao.saveRecord(minesweeperRecord);
}, (db) => {
  // Rollback: Xóa 2 records
  const dao = new Dao(db);

  try {
    const gemsRecord = dao.findFirstRecordByFilter("coin_settings", "setting_key = 'gems_game_enabled'");
    dao.deleteRecord(gemsRecord);
  } catch (e) {
    // Record không tồn tại
  }

  try {
    const minesweeperRecord = dao.findFirstRecordByFilter("coin_settings", "setting_key = 'minesweeper_game_enabled'");
    dao.deleteRecord(minesweeperRecord);
  } catch (e) {
    // Record không tồn tại
  }
});
