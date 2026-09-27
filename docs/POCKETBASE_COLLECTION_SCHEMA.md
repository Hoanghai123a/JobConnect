# Cấu trúc PocketBase Collection Schema

Tài liệu này mô tả cấu trúc chuẩn để tạo file JSON import collection vào PocketBase.

## ⚠️ Lưu ý quan trọng

**File JSON phải là một ARRAY chứa collections**, không phải object đơn lẻ:

```json
[
  {
    "id": "collection_id",
    "name": "collection_name",
    ...
  }
]
```

## Template hoàn chỉnh

Sao chép template này để tạo collection mới:

```json
[
  {
    "id": "your_collection_id",
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\"",
    "createRule": "@request.auth.role = \"admin\"",
    "updateRule": "@request.auth.role = \"admin\"",
    "deleteRule": "@request.auth.role = \"admin\"",
    "name": "your_collection_name",
    "type": "base",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "help": "",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "your_field_id_1",
        "max": 255,
        "min": 0,
        "name": "your_field_name",
        "pattern": "",
        "presentable": true,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "autodate2990389176",
        "name": "created",
        "onCreate": true,
        "onUpdate": false,
        "presentable": false,
        "system": false,
        "type": "autodate"
      },
      {
        "hidden": false,
        "id": "autodate3332085495",
        "name": "updated",
        "onCreate": true,
        "onUpdate": true,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "indexes": [
      "CREATE INDEX `idx_your_collection_field` ON `your_collection_name` (`field_name`)"
    ],
    "system": false
  }
]
```

## Cấu trúc từng thành phần

## Các trường bắt buộc

### 1. Collection metadata
- **id**: ID duy nhất cho collection (dạng `collection_name_id` hoặc `pbc_...`)
- **name**: Tên collection (snake_case)
- **type**: Loại collection (`base` cho collection thường, `auth` cho authentication)
- **system**: Luôn là `false` cho custom collections

### 2. Permission rules
Định nghĩa quyền truy cập cho mỗi operation:
- **listRule**: Quyền xem danh sách records
- **viewRule**: Quyền xem chi tiết 1 record
- **createRule**: Quyền tạo record mới
- **updateRule**: Quyền cập nhật record
- **deleteRule**: Quyền xóa record

Ví dụ:
```json
{
  "listRule": "@request.auth.id != \"\"",
  "viewRule": "@request.auth.id != \"\"",
  "createRule": "@request.auth.role = \"admin\"",
  "updateRule": "@request.auth.role = \"admin\"",
  "deleteRule": "@request.auth.role = \"admin\""
}
```

### 3. Fields array
Mỗi field phải có cấu trúc:

```json
{
  "help": "",
  "hidden": false,
  "id": "unique_field_id",
  "name": "field_name",
  "presentable": false,
  "required": false,
  "system": false,
  "type": "field_type"
}
```

#### Field types và properties riêng

**Text field:**
```json
{
  "autogeneratePattern": "",
  "max": 255,
  "min": 0,
  "pattern": "",
  "primaryKey": false,
  "type": "text"
}
```

**Number field:**
```json
{
  "max": null,
  "min": 0,
  "onlyInt": false,
  "type": "number"
}
```

**Bool field:**
```json
{
  "type": "bool"
}
```

**Date field:**
```json
{
  "max": "",
  "min": "",
  "type": "date"
}
```

**Select field:**
```json
{
  "maxSelect": 1,
  "type": "select",
  "values": ["option1", "option2"]
}
```

**File field:**
```json
{
  "maxSelect": 1,
  "maxSize": 5242880,
  "mimeTypes": ["image/jpeg", "image/png"],
  "protected": false,
  "thumbs": ["100x100"],
  "type": "file"
}
```

**URL field:**
```json
{
  "exceptDomains": [],
  "onlyDomains": [],
  "type": "url"
}
```

**Relation field:**
```json
{
  "cascadeDelete": false,
  "collectionId": "target_collection_id",
  "maxSelect": 1,
  "minSelect": 0,
  "type": "relation"
}
```

**Autodate field:**
```json
{
  "onCreate": true,
  "onUpdate": false,
  "type": "autodate"
}
```

### 4. System fields bắt buộc

Mọi collection phải có 3 system fields:

**ID field:**
```json
{
  "autogeneratePattern": "[a-z0-9]{15}",
  "help": "",
  "hidden": false,
  "id": "text3208210256",
  "max": 15,
  "min": 15,
  "name": "id",
  "pattern": "^[a-z0-9]+$",
  "presentable": false,
  "primaryKey": true,
  "required": true,
  "system": true,
  "type": "text"
}
```

**Created field:**
```json
{
  "hidden": false,
  "id": "autodate2990389176",
  "name": "created",
  "onCreate": true,
  "onUpdate": false,
  "presentable": false,
  "system": false,
  "type": "autodate"
}
```

**Updated field:**
```json
{
  "hidden": false,
  "id": "autodate3332085495",
  "name": "updated",
  "onCreate": true,
  "onUpdate": true,
  "presentable": false,
  "system": false,
  "type": "autodate"
}
```

### 5. Indexes

Tối ưu query performance bằng indexes:

```json
{
  "indexes": [
    "CREATE INDEX `idx_collection_field` ON `collection` (`field`)",
    "CREATE UNIQUE INDEX `idx_unique_field` ON `collection` (`field`)"
  ]
}
```

## Quy tắc đặt tên

1. **Collection ID**: Dùng pattern `collection_name_id` hoặc `pbc_...`
2. **Field ID**: Dùng pattern mô tả, ví dụ:
   - `recruitment_company` cho field company
   - `adv_user_f1` cho field user trong advances collection
3. **Index name**: Dùng pattern `idx_collection_field`

## Ví dụ hoàn chỉnh

Xem file [pocketbase-recruitments-collection.json](../pocketbase-recruitments-collection.json) để tham khảo một collection đầy đủ.

## Cách import vào PocketBase

1. Mở PocketBase Admin UI: `http://127.0.0.1:8090/_/`
2. Vào **Settings** → **Import collections**
3. Copy toàn bộ nội dung file JSON
4. Paste vào ô import
5. Click **Import**

## Lưu ý quan trọng

- **Không thay đổi** các system field IDs (`text3208210256`, `autodate2990389176`, `autodate3332085495`)
- **Luôn giữ** đúng cấu trúc field theo type
- **Kiểm tra** permission rules trước khi import
- **Backup** database trước khi import collection mới
- **Test** collection sau khi import để đảm bảo hoạt động đúng
