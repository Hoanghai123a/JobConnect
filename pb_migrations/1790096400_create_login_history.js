/// <reference path="../pb_data/types.d.ts" />
migrate(
  (db) => {
    const collection = new Collection({
      id: "login_history_collection",
      name: "login_history",
      type: "base",
      system: false,
      schema: [
        {
          id: "user_id_field",
          name: "user_id",
          type: "relation",
          required: false,
          options: {
            collectionId: "_pb_users_auth_",
            cascadeDelete: true,
            minSelect: null,
            maxSelect: 1,
            displayFields: ["username", "email"],
          },
        },
        {
          id: "session_id_field",
          name: "session_id",
          type: "text",
          required: false,
          options: {
            min: null,
            max: 255,
            pattern: "",
          },
        },
        {
          id: "login_type_field",
          name: "login_type",
          type: "select",
          required: true,
          options: {
            maxSelect: 1,
            values: ["user", "guest"],
          },
        },
        {
          id: "login_at_field",
          name: "login_at",
          type: "date",
          required: true,
          options: {
            min: "",
            max: "",
          },
        },
      ],
      indexes: [
        "CREATE INDEX idx_login_history_login_at ON login_history (login_at)",
        "CREATE INDEX idx_login_history_user_id ON login_history (user_id)",
        "CREATE INDEX idx_login_history_session_id ON login_history (session_id)",
      ],
      // Chỉ admin mới đọc được
      listRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      viewRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      // Cho phép tạo từ bất kỳ đâu (backend server-side)
      // Validation: phải có đúng 1 trong 2 (user_id hoặc session_id)
      createRule: "",
      // Không cho phép update/delete - đây là immutable log
      updateRule: null,
      deleteRule: null,
    });

    return Dao(db).saveCollection(collection);
  },
  (db) => {
    const dao = new Dao(db);
    const collection = dao.findCollectionByNameOrId("login_history_collection");
    return dao.deleteCollection(collection);
  },
);
