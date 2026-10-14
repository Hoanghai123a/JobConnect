/// <reference path="../pb_data/types.d.ts" />
migrate(
  (db) => {
    const dao = new Dao(db);
    const collection = dao.findCollectionByNameOrId("internal_staff_hours");

    const addField = (field) => {
      if (!collection.schema.getFieldByName(field.name)) {
        collection.schema.addField(new SchemaField(field));
      }
    };

    addField({
      system: false,
      id: "full_name_snapshot",
      name: "full_name",
      type: "text",
      required: false,
      presentable: false,
      unique: false,
      options: { min: null, max: 255, pattern: "" },
    });
    addField({
      system: false,
      id: "factory_name_snapshot",
      name: "factory_name",
      type: "text",
      required: false,
      presentable: false,
      unique: false,
      options: { min: null, max: 255, pattern: "" },
    });
    addField({
      system: false,
      id: "created_autodate",
      name: "created",
      type: "autodate",
      required: false,
      presentable: false,
      unique: false,
      options: { onCreate: true, onUpdate: false },
    });
    addField({
      system: false,
      id: "updated_autodate",
      name: "updated",
      type: "autodate",
      required: false,
      presentable: false,
      unique: false,
      options: { onCreate: true, onUpdate: true },
    });

    dao.saveCollection(collection);
  },
  (db) => {
    const dao = new Dao(db);
    const collection = dao.findCollectionByNameOrId("internal_staff_hours");
    for (const name of ["full_name", "factory_name", "created", "updated"]) {
      const field = collection.schema.getFieldByName(name);
      if (field) collection.schema.removeField(field.id);
    }
    dao.saveCollection(collection);
  },
);
