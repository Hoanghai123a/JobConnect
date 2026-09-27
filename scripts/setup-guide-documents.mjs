import PocketBase from "pocketbase";

const url = process.env.VITE_PB_URL;
const email = process.env.PB_ADMIN_EMAIL;
const password = process.env.PB_ADMIN_PASSWORD;

if (!url || !email || !password) {
  throw new Error("Thiếu VITE_PB_URL, PB_ADMIN_EMAIL hoặc PB_ADMIN_PASSWORD trong .env");
}

const pb = new PocketBase(url);

try {
  await pb.collection("_superusers").authWithPassword(email, password);
} catch {
  await pb.admins.authWithPassword(email, password);
}

const rules = {
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule: '@request.auth.role = "admin"',
  updateRule: '@request.auth.role = "admin"',
  deleteRule: '@request.auth.role = "admin"',
};

const desiredFields = [
  {
    name: "title",
    type: "text",
    required: true,
    min: 1,
    max: 200,
  },
  {
    name: "description",
    type: "text",
    required: false,
    max: 5000,
  },
  {
    name: "files",
    type: "file",
    required: true,
    maxSelect: 3,
    maxSize: 25 * 1024 * 1024,
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  },
  {
    name: "order",
    type: "number",
    required: false,
    onlyInt: true,
    min: 0,
  },
];

let collection = null;
try {
  collection = await pb.collections.getOne("guide_documents");
} catch (error) {
  if (error?.status !== 404) throw error;
}

if (!collection) {
  await pb.collections.create({
    name: "guide_documents",
    type: "base",
    ...rules,
    fields: [
      ...desiredFields,
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  console.log("Đã tạo collection guide_documents.");
} else {
  const desiredByName = new Map(desiredFields.map((field) => [field.name, field]));
  const fields = collection.fields.map((field) => {
    const desired = desiredByName.get(field.name);
    if (!desired) return field;
    desiredByName.delete(field.name);
    return { ...field, ...desired, id: field.id };
  });
  fields.push(...desiredByName.values());

  await pb.collections.update(collection.id, {
    ...rules,
    fields,
  });
  console.log("Đã cập nhật collection guide_documents.");
}
