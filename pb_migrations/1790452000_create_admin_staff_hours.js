/// <reference path="../pb_data/types.d.ts" />

// Admin-imported statistics are intentionally separate from user attendance.
migrate((app) => {
  const records = new Collection({
    name: "admin_staff_hours",
    type: "base",
    fields: [
      { id: "relation1790452001", name: "admin_id", type: "relation", required: true, collectionId: "_pb_users_auth_", cascadeDelete: false, minSelect: 0, maxSelect: 1 },
      { id: "text1790452002", name: "batch_id", type: "text", required: true },
      { id: "text1790452003", name: "employee_code", type: "text", required: true },
      { id: "text1790452004", name: "employee_code_key", type: "text", required: true },
      { id: "text1790452005", name: "full_name", type: "text" },
      { id: "text1790452006", name: "full_name_key", type: "text" },
      { id: "text1790452007", name: "factory_name", type: "text" },
      { id: "text1790452008", name: "factory_name_key", type: "text" },
      { id: "text1790452009", name: "month", type: "text", required: true, max: 7, pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
      { id: "number1790452010", name: "hc_hours", type: "number", min: 0 },
      { id: "number1790452011", name: "tc_hours", type: "number", min: 0 },
      { id: "number1790452012", name: "total_hours", type: "number", min: 0 },
      { id: "select1790452013", name: "source", type: "select", required: true, maxSelect: 1, values: ["admin_upload", "self_checkin"] },
      { id: "text1790452014", name: "note", type: "text" },
      { id: "text1790452015", name: "previous_record", type: "text" },
      { id: "autodate1790452016", name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { id: "autodate1790452017", name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_admin_hours_key ON admin_staff_hours (admin_id, employee_code_key, factory_name_key, month, source)",
      "CREATE INDEX idx_admin_hours_admin_month ON admin_staff_hours (admin_id, month, source)",
      "CREATE INDEX idx_admin_hours_admin_code ON admin_staff_hours (admin_id, month, employee_code_key)",
      "CREATE INDEX idx_admin_hours_admin_name ON admin_staff_hours (admin_id, month, full_name_key)",
      "CREATE INDEX idx_admin_hours_admin_factory ON admin_staff_hours (admin_id, month, factory_name_key)",
      "CREATE INDEX idx_admin_hours_admin_total ON admin_staff_hours (admin_id, month, source, total_hours DESC)",
      "CREATE INDEX idx_admin_hours_batch ON admin_staff_hours (admin_id, batch_id)",
    ],
    listRule: '@request.auth.role = "admin" && admin_id = @request.auth.id',
    viewRule: '@request.auth.role = "admin" && admin_id = @request.auth.id',
    createRule: '@request.auth.role = "admin" && admin_id = @request.auth.id',
    updateRule: '@request.auth.role = "admin" && admin_id = @request.auth.id',
    deleteRule: '@request.auth.role = "admin" && admin_id = @request.auth.id',
  });
  const recordsError = app.save(records);
  if (recordsError) return recordsError;

  const history = new Collection({
    name: "admin_staff_hours_import_history",
    type: "base",
    fields: [
      { id: "relation1790452018", name: "admin_id", type: "relation", required: true, collectionId: "_pb_users_auth_", cascadeDelete: false, minSelect: 0, maxSelect: 1 },
      { id: "text1790452019", name: "batch_id", type: "text", required: true },
      { id: "text1790452020", name: "months", type: "text", required: true },
      { id: "select1790452021", name: "source", type: "select", required: true, maxSelect: 1, values: ["admin_upload", "self_checkin"] },
      { id: "number1790452022", name: "success_count", type: "number", min: 0, onlyInt: true },
      { id: "number1790452023", name: "error_count", type: "number", min: 0, onlyInt: true },
      { id: "select1790452024", name: "status", type: "select", required: true, maxSelect: 1, values: ["completed", "rolled_back"] },
      { id: "text1790452025", name: "note", type: "text" },
      { id: "autodate1790452026", name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { id: "autodate1790452027", name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_admin_hours_history_batch ON admin_staff_hours_import_history (admin_id, batch_id)",
      "CREATE INDEX idx_admin_hours_history_created ON admin_staff_hours_import_history (admin_id, created DESC)",
      "CREATE INDEX idx_admin_hours_history_status ON admin_staff_hours_import_history (admin_id, status)",
    ],
    listRule: '@request.auth.role = "admin" && admin_id = @request.auth.id',
    viewRule: '@request.auth.role = "admin" && admin_id = @request.auth.id',
    createRule: '@request.auth.role = "admin" && admin_id = @request.auth.id',
    updateRule: '@request.auth.role = "admin" && admin_id = @request.auth.id',
    deleteRule: null,
  });
  return app.save(history);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("admin_staff_hours_import_history"));
  return app.delete(app.findCollectionByNameOrId("admin_staff_hours"));
});
