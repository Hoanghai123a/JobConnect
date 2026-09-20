/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_")

  // Xóa các field không dùng
  collection.schema.removeField("bool4019833756") // requireApproval
  collection.schema.removeField("bool3768296713") // required
  collection.schema.removeField("default_hc_hours_custom") // default_hc_hours (nếu có)
  collection.schema.removeField("default_ot_hours_custom") // default_ot_hours (nếu có)

  return dao.saveCollection(collection)
}, (db) => {
  // Rollback: thêm lại các field nếu cần
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_")

  // Thêm lại requireApproval
  collection.schema.addField(new SchemaField({
    "id": "bool4019833756",
    "name": "requireApproval",
    "type": "bool"
  }))

  // Thêm lại required
  collection.schema.addField(new SchemaField({
    "id": "bool3768296713",
    "name": "required",
    "type": "bool"
  }))

  return dao.saveCollection(collection)
})
