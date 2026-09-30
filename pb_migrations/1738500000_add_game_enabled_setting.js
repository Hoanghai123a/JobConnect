/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);

  const coinSettings = dao.findCollectionByNameOrId("coin_settings");

  // Thêm setting game_enabled
  const record = new Record(coinSettings, {
    setting_key: "game_enabled",
    coin_amount: 1, // 1 = bật, 0 = tắt
    description: "Bật/tắt trò chơi nông trại",
    category: "game",
    active: true,
  });

  dao.saveRecord(record);

  return true;
}, (db) => {
  // Rollback: xóa setting game_enabled
  const dao = new Dao(db);

  try {
    const record = dao.findFirstRecordByFilter(
      "coin_settings",
      "setting_key = 'game_enabled'"
    );
    dao.deleteRecord(record);
  } catch (e) {
    // Record không tồn tại, bỏ qua
  }

  return true;
});
