/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);

  // 1. Create coin_settings collection
  const coinSettingsCollection = new Collection({
    name: "coin_settings",
    type: "base",
    system: false,
    schema: [
      {
        name: "setting_key",
        type: "text",
        required: true,
        unique: true,
      },
      {
        name: "coin_amount",
        type: "number",
        required: true,
        min: 0,
      },
      {
        name: "description",
        type: "text",
        required: true,
      },
      {
        name: "category",
        type: "select",
        required: true,
        options: {
          values: ["referral", "checkin", "milestone", "other"],
        },
      },
      {
        name: "active",
        type: "bool",
        required: false,
      },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_coin_settings_key ON coin_settings (setting_key)"],
    listRule: "",
    viewRule: "",
    createRule: "@request.auth.role = 'admin'",
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
  });

  dao.saveCollection(coinSettingsCollection);

  // 2. Create weekly_checkins collection
  const weeklyCheckinsCollection = new Collection({
    name: "weekly_checkins",
    type: "base",
    system: false,
    schema: [
      {
        name: "user",
        type: "relation",
        required: true,
        options: {
          collectionId: "_pb_users_auth_",
          cascadeDelete: true,
          maxSelect: 1,
          displayFields: ["full_name", "username"],
        },
      },
      {
        name: "week_start",
        type: "date",
        required: true,
      },
      {
        name: "week_end",
        type: "date",
        required: true,
      },
      {
        name: "checkin_days",
        type: "json",
        required: false,
      },
      {
        name: "total_days",
        type: "number",
        required: true,
        min: 0,
        max: 7,
      },
      {
        name: "coins_earned",
        type: "number",
        required: true,
        min: 0,
      },
      {
        name: "bonus_claimed",
        type: "bool",
        required: false,
      },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_weekly_checkins_user_week ON weekly_checkins (user, week_start)",
    ],
    listRule:
      "@request.auth.id != '' && (user = @request.auth.id || @request.auth.role = 'admin')",
    viewRule:
      "@request.auth.id != '' && (user = @request.auth.id || @request.auth.role = 'admin')",
    createRule: "@request.auth.id != '' && user = @request.auth.id",
    updateRule: "@request.auth.id != '' && user = @request.auth.id",
    deleteRule: "@request.auth.role = 'admin'",
  });

  dao.saveCollection(weeklyCheckinsCollection);

  // 3. Extend garden_balances collection with new fields
  const gardenBalances = dao.findCollectionByNameOrId("garden_balances");
  if (gardenBalances) {
    gardenBalances.schema.addField(
      new SchemaField({
        name: "referral_coins_total",
        type: "number",
        required: false,
        options: {
          min: 0,
        },
      })
    );

    gardenBalances.schema.addField(
      new SchemaField({
        name: "checkin_coins_total",
        type: "number",
        required: false,
        options: {
          min: 0,
        },
      })
    );

    dao.saveCollection(gardenBalances);
  }

  // 4. Extend referrals collection with coin tracking fields
  const referrals = dao.findCollectionByNameOrId("referrals");
  if (referrals) {
    referrals.schema.addField(
      new SchemaField({
        name: "coins_awarded",
        type: "number",
        required: false,
        options: {
          min: 0,
        },
      })
    );

    referrals.schema.addField(
      new SchemaField({
        name: "referee_coins_awarded",
        type: "number",
        required: false,
        options: {
          min: 0,
        },
      })
    );

    dao.saveCollection(referrals);
  }

  // 5. Insert default coin settings
  const defaultSettings = [
    {
      setting_key: "referral_signup",
      coin_amount: 50,
      description: "Người giới thiệu nhận khi người được giới thiệu đăng ký thành công",
      category: "referral",
      active: true,
    },
    {
      setting_key: "referral_referee_bonus",
      coin_amount: 30,
      description: "Người nhập mã giới thiệu nhận thưởng",
      category: "referral",
      active: true,
    },
    {
      setting_key: "referral_first_advance",
      coin_amount: 100,
      description: "Người giới thiệu nhận khi người được giới thiệu hoàn thành ứng lương đầu tiên",
      category: "referral",
      active: true,
    },
    {
      setting_key: "referral_milestone_5",
      coin_amount: 250,
      description: "Thưởng khi giới thiệu thành công 5 người",
      category: "milestone",
      active: true,
    },
    {
      setting_key: "referral_milestone_10",
      coin_amount: 750,
      description: "Thưởng khi giới thiệu thành công 10 người",
      category: "milestone",
      active: true,
    },
    {
      setting_key: "daily_checkin_base",
      coin_amount: 5,
      description: "Điểm danh mỗi ngày trong tuần",
      category: "checkin",
      active: true,
    },
    {
      setting_key: "weekly_checkin_perfect",
      coin_amount: 50,
      description: "Thưởng hoàn thành đủ 7 ngày điểm danh",
      category: "checkin",
      active: true,
    },
  ];

  const coinSettings = dao.findCollectionByNameOrId("coin_settings");
  defaultSettings.forEach((setting) => {
    const record = new Record(coinSettings, setting);
    dao.saveRecord(record);
  });

  return true;
}, (db) => {
  const dao = new Dao(db);

  // Rollback: delete collections and fields
  try {
    const coinSettings = dao.findCollectionByNameOrId("coin_settings");
    dao.deleteCollection(coinSettings);
  } catch {}

  try {
    const weeklyCheckins = dao.findCollectionByNameOrId("weekly_checkins");
    dao.deleteCollection(weeklyCheckins);
  } catch {}

  try {
    const gardenBalances = dao.findCollectionByNameOrId("garden_balances");
    if (gardenBalances) {
      gardenBalances.schema.removeField("referral_coins_total");
      gardenBalances.schema.removeField("checkin_coins_total");
      dao.saveCollection(gardenBalances);
    }
  } catch {}

  try {
    const referrals = dao.findCollectionByNameOrId("referrals");
    if (referrals) {
      referrals.schema.removeField("coins_awarded");
      referrals.schema.removeField("referee_coins_awarded");
      dao.saveCollection(referrals);
    }
  } catch {}

  return true;
});
