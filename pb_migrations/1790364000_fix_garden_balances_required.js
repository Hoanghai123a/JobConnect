/// <reference path="../pb_data/types.d.ts" />
migrate(
  (db) => {
    const dao = new Dao(db);

    // Fix garden_balances schema: reserve_balance và referral_coins_total không nên required
    const gardenBalances = dao.findCollectionByNameOrId("garden_balances");
    if (gardenBalances) {
      // Tìm và update các fields
      const reserveBalanceField = gardenBalances.schema.getFieldByName("reserve_balance");
      if (reserveBalanceField) {
        reserveBalanceField.required = false;
      }

      const referralCoinsTotalField = gardenBalances.schema.getFieldByName("referral_coins_total");
      if (referralCoinsTotalField) {
        referralCoinsTotalField.required = false;
      }

      const checkinCoinsTotalField = gardenBalances.schema.getFieldByName("checkin_coins_total");
      if (checkinCoinsTotalField) {
        checkinCoinsTotalField.required = false;
      }

      dao.saveCollection(gardenBalances);
    }

    return true;
  },
  (db) => {
    // Rollback không cần thiết vì đây là fix lỗi schema
    return true;
  }
);
