/// <reference path="../pb_data/types.d.ts" />
migrate(
  (db) => {
    const dao = new Dao(db);

    // 1. Thêm fields mới vào collection users
    const usersCollection = dao.findCollectionByNameOrId("users");

    // Thêm field employee_code (text, optional)
    usersCollection.schema.addField(
      new SchemaField({
        system: false,
        id: "employee_code_field",
        name: "employee_code",
        type: "text",
        required: false,
        presentable: false,
        unique: false,
        options: {
          min: null,
          max: null,
          pattern: "",
        },
      })
    );

    // Thêm field is_internal (bool, default: false)
    usersCollection.schema.addField(
      new SchemaField({
        system: false,
        id: "is_internal_field",
        name: "is_internal",
        type: "bool",
        required: false,
        presentable: false,
        unique: false,
        options: {},
      })
    );

    // Thêm index cho is_internal
    usersCollection.indexes = [
      ...(usersCollection.indexes || []),
      'CREATE INDEX idx_is_internal ON users (is_internal)',
    ];

    dao.saveCollection(usersCollection);

    // 2. Tạo collection internal_staff_hours
    const internalStaffHoursCollection = new Collection({
      id: "internal_staff_hours_col",
      name: "internal_staff_hours",
      type: "base",
      system: false,
      schema: [
        {
          system: false,
          id: "user_field",
          name: "user",
          type: "relation",
          required: true,
          presentable: false,
          unique: false,
          options: {
            collectionId: "users",
            cascadeDelete: false,
            minSelect: null,
            maxSelect: 1,
            displayFields: ["full_name"],
          },
        },
        {
          system: false,
          id: "month_field",
          name: "month",
          type: "text",
          required: true,
          presentable: false,
          unique: false,
          options: {
            min: null,
            max: 7,
            pattern: "^\\d{4}-\\d{2}$",
          },
        },
        {
          system: false,
          id: "employee_code_snapshot",
          name: "employee_code",
          type: "text",
          required: false,
          presentable: false,
          unique: false,
          options: {
            min: null,
            max: null,
            pattern: "",
          },
        },
        {
          system: false,
          id: "hc_hours_field",
          name: "hc_hours",
          type: "number",
          required: false,
          presentable: false,
          unique: false,
          options: {
            min: 0,
            max: null,
            noDecimal: false,
          },
        },
        {
          system: false,
          id: "tc_hours_field",
          name: "tc_hours",
          type: "number",
          required: false,
          presentable: false,
          unique: false,
          options: {
            min: 0,
            max: null,
            noDecimal: false,
          },
        },
        {
          system: false,
          id: "total_hours_field",
          name: "total_hours",
          type: "number",
          required: false,
          presentable: false,
          unique: false,
          options: {
            min: 0,
            max: null,
            noDecimal: false,
          },
        },
        {
          system: false,
          id: "source_field",
          name: "source",
          type: "select",
          required: true,
          presentable: false,
          unique: false,
          options: {
            maxSelect: 1,
            values: ["admin_upload", "self_checkin"],
          },
        },
        {
          system: false,
          id: "batch_id_field",
          name: "batch_id",
          type: "text",
          required: true,
          presentable: false,
          unique: false,
          options: {
            min: null,
            max: null,
            pattern: "",
          },
        },
        {
          system: false,
          id: "note_field",
          name: "note",
          type: "text",
          required: false,
          presentable: false,
          unique: false,
          options: {
            min: null,
            max: null,
            pattern: "",
          },
        },
      ],
      indexes: [
        // Composite unique: user + month + source
        'CREATE UNIQUE INDEX idx_user_month_source ON internal_staff_hours (user, month, source)',
        // Single indexes
        'CREATE INDEX idx_month ON internal_staff_hours (month)',
        'CREATE INDEX idx_source ON internal_staff_hours (source)',
        'CREATE INDEX idx_total_hours ON internal_staff_hours (total_hours)',
        'CREATE INDEX idx_batch_id ON internal_staff_hours (batch_id)',
      ],
      listRule: '@request.auth.role = "admin" || (@request.auth.is_internal = true && user = @request.auth.id)',
      viewRule: '@request.auth.role = "admin" || (@request.auth.is_internal = true && user = @request.auth.id)',
      createRule: '@request.auth.role = "admin"',
      updateRule: '@request.auth.role = "admin"',
      deleteRule: '@request.auth.role = "admin"',
    });

    dao.saveCollection(internalStaffHoursCollection);

    // 3. Tạo collection staff_hours_import_history
    const importHistoryCollection = new Collection({
      id: "staff_hours_import_history_col",
      name: "staff_hours_import_history",
      type: "base",
      system: false,
      schema: [
        {
          system: false,
          id: "month_field",
          name: "month",
          type: "text",
          required: true,
          presentable: false,
          unique: false,
          options: {
            min: null,
            max: 7,
            pattern: "^\\d{4}-\\d{2}$",
          },
        },
        {
          system: false,
          id: "source_field",
          name: "source",
          type: "select",
          required: true,
          presentable: false,
          unique: false,
          options: {
            maxSelect: 1,
            values: ["admin_upload", "self_checkin"],
          },
        },
        {
          system: false,
          id: "batch_id_field",
          name: "batch_id",
          type: "text",
          required: true,
          presentable: false,
          unique: true,
          options: {
            min: null,
            max: null,
            pattern: "",
          },
        },
        {
          system: false,
          id: "admin_user_field",
          name: "admin_user",
          type: "relation",
          required: true,
          presentable: false,
          unique: false,
          options: {
            collectionId: "users",
            cascadeDelete: false,
            minSelect: null,
            maxSelect: 1,
            displayFields: ["full_name"],
          },
        },
        {
          system: false,
          id: "success_count_field",
          name: "success_count",
          type: "number",
          required: false,
          presentable: false,
          unique: false,
          options: {
            min: 0,
            max: null,
            noDecimal: true,
          },
        },
        {
          system: false,
          id: "error_count_field",
          name: "error_count",
          type: "number",
          required: false,
          presentable: false,
          unique: false,
          options: {
            min: 0,
            max: null,
            noDecimal: true,
          },
        },
        {
          system: false,
          id: "status_field",
          name: "status",
          type: "select",
          required: true,
          presentable: false,
          unique: false,
          options: {
            maxSelect: 1,
            values: ["preview", "completed", "failed", "rolled_back"],
          },
        },
        {
          system: false,
          id: "note_field",
          name: "note",
          type: "text",
          required: false,
          presentable: false,
          unique: false,
          options: {
            min: null,
            max: null,
            pattern: "",
          },
        },
      ],
      indexes: [
        'CREATE INDEX idx_month ON staff_hours_import_history (month)',
        'CREATE INDEX idx_status ON staff_hours_import_history (status)',
      ],
      listRule: '@request.auth.role = "admin"',
      viewRule: '@request.auth.role = "admin"',
      createRule: '@request.auth.role = "admin"',
      updateRule: '@request.auth.role = "admin"',
      deleteRule: null, // Không cho xóa lịch sử
    });

    dao.saveCollection(importHistoryCollection);

    // 4. Tạo collection leaderboard_settings
    const settingsCollection = new Collection({
      id: "leaderboard_settings_col",
      name: "leaderboard_settings",
      type: "base",
      system: false,
      schema: [
        {
          system: false,
          id: "max_rank_display_field",
          name: "max_rank_display",
          type: "number",
          required: false,
          presentable: false,
          unique: false,
          options: {
            min: 3,
            max: null,
            noDecimal: true,
          },
        },
        {
          system: false,
          id: "default_data_source_field",
          name: "default_data_source",
          type: "select",
          required: false,
          presentable: false,
          unique: false,
          options: {
            maxSelect: 1,
            values: ["admin_upload", "self_checkin"],
          },
        },
      ],
      indexes: [],
      listRule: '@request.auth.id != ""', // Logged in users
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.role = "admin"',
      updateRule: '@request.auth.role = "admin"',
      deleteRule: '@request.auth.role = "admin"',
    });

    dao.saveCollection(settingsCollection);

    // 5. Insert default settings record
    const defaultSettings = new Record(settingsCollection, {
      max_rank_display: 10,
      default_data_source: "admin_upload",
    });
    dao.saveRecord(defaultSettings);

    console.log("Migration completed: Added internal staff fields and collections");
  },
  (db) => {
    const dao = new Dao(db);

    // Rollback: Xóa các collections đã tạo
    try {
      dao.deleteCollection(dao.findCollectionByNameOrId("leaderboard_settings"));
    } catch {}
    try {
      dao.deleteCollection(dao.findCollectionByNameOrId("staff_hours_import_history"));
    } catch {}
    try {
      dao.deleteCollection(dao.findCollectionByNameOrId("internal_staff_hours"));
    } catch {}

    // Rollback: Xóa fields khỏi users (nếu có thể)
    try {
      const usersCollection = dao.findCollectionByNameOrId("users");
      usersCollection.schema.removeField("employee_code_field");
      usersCollection.schema.removeField("is_internal_field");

      // Xóa index
      usersCollection.indexes = (usersCollection.indexes || []).filter(
        (idx) => !idx.includes("idx_is_internal")
      );

      dao.saveCollection(usersCollection);
    } catch {}

    console.log("Migration rolled back: Removed internal staff fields and collections");
  }
);
