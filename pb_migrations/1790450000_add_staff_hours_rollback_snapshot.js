/// <reference path="../pb_data/types.d.ts" />
migrate(
  (db) => {
    const dao = new Dao(db);
    const collection = dao.findCollectionByNameOrId("internal_staff_hours");

    collection.schema.addField(
      new SchemaField({
        system: false,
        id: "previous_record_field",
        name: "previous_record",
        type: "text",
        required: false,
        presentable: false,
        unique: false,
        options: {
          min: null,
          max: 10000,
          pattern: "",
        },
      })
    );

    dao.saveCollection(collection);
  },
  (db) => {
    const dao = new Dao(db);
    const collection = dao.findCollectionByNameOrId("internal_staff_hours");
    collection.schema.removeField("previous_record_field");
    dao.saveCollection(collection);
  }
);
