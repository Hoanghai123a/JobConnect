# PocketBase Collections Structure - JobConnect

> **Hướng dẫn tạo collections cho PocketBase v0.40.3**

## 📋 Tổng quan

File này lưu trữ cấu trúc chuẩn của các collections trong PocketBase cho dự án JobConnect. Sử dụng cấu trúc này khi cần:
- Tạo database mới
- Migrate giữa các môi trường
- Khôi phục sau sự cố
- Tạo collections mới theo đúng format

## 🎯 Collections đã triển khai

### Core Collections (Có sẵn)
1. **users** - Quản lý người dùng (auth collection)
2. **advances** - Tạm ứng
3. **attendance** - Chấm công
4. **complaints** - Góp ý/Khiếu nại
5. **factories** - Nhà máy
6. **news** - Tin tức
7. **recruitments** - Tuyển dụng
8. **transport_routes** - Tuyến xe
9. **transport_contacts** - Liên hệ nhà xe

### Extended Collections (Mới thêm)
10. **notebooks** - Sổ tay cá nhân
11. **statistics** - Thống kê hệ thống
12. **conversations** - Cuộc trò chuyện
13. **messages** - Tin nhắn chat
14. **transport_companies** - Nhà xe
15. **guides** - Tài liệu hướng dẫn

## 📝 Format chuẩn cho PocketBase v0.40.3

### Cấu trúc Collection

```json
{
  "id": "collection_unique_id",
  "name": "collection_name",
  "type": "base",
  "system": false,
  "listRule": "API rule",
  "viewRule": "API rule",
  "createRule": "API rule",
  "updateRule": "API rule",
  "deleteRule": "API rule",
  "fields": [],
  "indexes": []
}
```

### Cấu trúc Field Types

#### 1. Text Field
```json
{
  "autogeneratePattern": "",
  "help": "",
  "hidden": false,
  "id": "field_unique_id",
  "max": 200,
  "min": 0,
  "name": "field_name",
  "pattern": "",
  "presentable": false,
  "primaryKey": false,
  "required": true,
  "system": false,
  "type": "text"
}
```

#### 2. Relation Field
```json
{
  "cascadeDelete": true,
  "collectionId": "_pb_users_auth_",
  "help": "",
  "hidden": false,
  "id": "rel_field_id",
  "maxSelect": 1,
  "minSelect": 0,
  "name": "user",
  "presentable": false,
  "required": true,
  "system": false,
  "type": "relation"
}
```

#### 3. Select Field
```json
{
  "help": "",
  "hidden": false,
  "id": "sel_field_id",
  "maxSelect": 1,
  "name": "category",
  "presentable": false,
  "required": false,
  "system": false,
  "type": "select",
  "values": ["option1", "option2", "option3"]
}
```

#### 4. Number Field
```json
{
  "help": "",
  "hidden": false,
  "id": "num_field_id",
  "max": 100,
  "min": 0,
  "name": "count",
  "onlyInt": true,
  "presentable": false,
  "required": false,
  "system": false,
  "type": "number"
}
```

#### 5. Boolean Field
```json
{
  "help": "",
  "hidden": false,
  "id": "bool_field_id",
  "name": "is_active",
  "presentable": false,
  "required": false,
  "system": false,
  "type": "bool"
}
```

#### 6. Date Field
```json
{
  "help": "",
  "hidden": false,
  "id": "date_field_id",
  "max": "",
  "min": "",
  "name": "created_date",
  "presentable": false,
  "required": false,
  "system": false,
  "type": "date"
}
```

#### 7. JSON Field
```json
{
  "help": "",
  "hidden": false,
  "id": "json_field_id",
  "maxSize": 1000000,
  "name": "metadata",
  "presentable": false,
  "required": false,
  "system": false,
  "type": "json"
}
```

#### 8. File Field
```json
{
  "help": "",
  "hidden": false,
  "id": "file_field_id",
  "maxSelect": 1,
  "maxSize": 5242880,
  "mimeTypes": ["image/jpeg", "image/png", "image/webp"],
  "name": "avatar",
  "presentable": false,
  "protected": false,
  "required": false,
  "system": false,
  "thumbs": ["100x100", "300x300"],
  "type": "file"
}
```

#### 9. Autodate Fields (Required)
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
```

## 🔐 API Rules Patterns

### User-owned data
```javascript
// List/View
"@request.auth.id != \"\" && user = @request.auth.id"

// Create
"@request.auth.id != \"\""

// Update/Delete
"@request.auth.id != \"\" && user = @request.auth.id"
```

### Admin-only management
```javascript
// List/View
"@request.auth.id != \"\" && @request.auth.role = \"admin\""

// Create/Update/Delete
"@request.auth.role = \"admin\""
```

### Many-to-many relations
```javascript
// List/View (participants array)
"@request.auth.id != \"\" && participants ?= @request.auth.id"
```

### Nested relations
```javascript
// Access through parent relation
"@request.auth.id != \"\" && conversation.participants ?= @request.auth.id"
```

## 📊 Chi tiết Extended Collections

### 1. Notebooks Collection

**Mục đích:** Sổ tay cá nhân cho mỗi user

**Fields:**
- `user` (relation) - Người sở hữu
- `title` (text, required) - Tiêu đề
- `content` (text) - Nội dung
- `category` (select) - Danh mục
- `tags` (json) - Tags
- `is_pinned` (bool) - Ghim
- `reminder_date` (date) - Ngày nhắc nhở

**Indexes:**
```sql
CREATE INDEX `idx_notebooks_user` ON `notebooks` (`user`)
CREATE INDEX `idx_notebooks_category` ON `notebooks` (`category`)
```

### 2. Statistics Collection

**Mục đích:** Lưu thống kê hệ thống

**Fields:**
- `user` (relation, optional) - User liên quan
- `metric_type` (select, required) - Loại metric
- `period_type` (select, required) - Chu kỳ
- `period_start` (date, required) - Ngày bắt đầu
- `period_end` (date, required) - Ngày kết thúc
- `data` (json, required) - Dữ liệu thống kê
- `summary` (text) - Tóm tắt

**Metric Types:** attendance, salary, advances, performance, overtime, leave, system_usage

**Period Types:** daily, weekly, monthly, quarterly, yearly

### 3. Conversations Collection

**Mục đích:** Quản lý cuộc trò chuyện nhóm

**Fields:**
- `participants` (relation, multi) - Người tham gia (min 2)
- `title` (text) - Tiêu đề nhóm
- `is_group` (bool) - Là nhóm chat
- `last_message` (text) - Tin nhắn cuối
- `last_message_at` (date) - Thời gian tin nhắn cuối
- `unread_count` (json) - Số tin chưa đọc theo user

### 4. Messages Collection

**Mục đích:** Tin nhắn trong conversations

**Fields:**
- `conversation` (relation, required) - Cuộc trò chuyện
- `sender` (relation, required) - Người gửi
- `content` (text) - Nội dung
- `message_type` (select) - Loại tin nhắn
- `attachments` (file, max 5) - File đính kèm
- `read_by` (json) - Danh sách đã đọc

**Message Types:** text, image, file, location, system

### 5. Transport Companies Collection

**Mục đích:** Thông tin nhà xe

**Fields:**
- `name` (text, required) - Tên nhà xe
- `phone` (text) - Số điện thoại
- `address` (text) - Địa chỉ
- `province` (text) - Tỉnh/Thành
- `description` (text) - Mô tả
- `services` (json) - Dịch vụ
- `rating` (number, 0-5) - Đánh giá
- `logo` (file) - Logo
- `is_active` (bool) - Trạng thái hoạt động

### 6. Guides Collection

**Mục đích:** Tài liệu hướng dẫn sử dụng hệ thống

**Fields:**
- `title` (text, required) - Tiêu đề
- `slug` (text, required, unique) - URL slug
- `category` (select, required) - Danh mục
- `content` (text, required) - Nội dung
- `excerpt` (text) - Tóm tắt
- `author` (relation) - Tác giả
- `thumbnail` (file) - Ảnh đại diện
- `tags` (json) - Tags
- `is_published` (bool) - Đã xuất bản
- `view_count` (number) - Lượt xem
- `order` (number) - Thứ tự hiển thị
- `target_roles` (json) - Vai trò mục tiêu

**Categories:** chấm công, lương bổng, tạm ứng, nhân sự, hệ thống, công cụ, quy trình, khác

## 🚀 Cách sử dụng

### Import Collections

1. Vào PocketBase Admin: `http://127.0.0.1:8090/_/`
2. **Settings** → **Import collections**
3. Chọn file `pb_collections_new_features.json`
4. Click **Confirm and import**

### Export Collections (Backup)

1. Vào PocketBase Admin
2. **Settings** → **Export collections**
3. Lưu file JSON để backup

### Tạo Collection mới

1. Copy format từ file này
2. Thay đổi:
   - `id`: Unique ID mới
   - `name`: Tên collection
   - `fields`: Danh sách fields cần thiết
   - `indexes`: Indexes cho performance
3. Import hoặc tạo thủ công qua UI

## ⚠️ Lưu ý quan trọng

### 1. Field IDs
- Mỗi field phải có `id` unique
- ID format: `<type>_<name>_<collection>` (e.g., `txt_title_notebooks`)
- System fields dùng ID chuẩn: `text3208210256`, `autodate2990389176`, `autodate3332085495`

### 2. Collection IDs
- User collection: `_pb_users_auth_`
- Custom collections: Prefix `pbc_` hoặc tên đơn giản

### 3. Relation Fields
- Luôn có `cascadeDelete`: true/false
- `collectionId`: ID của collection được reference
- `maxSelect`: 1 (one-to-one), 99 (one-to-many)
- `minSelect`: 0 (optional), 1+ (required)

### 4. Indexes
- Tạo index cho:
  - Foreign keys (relation fields)
  - Fields dùng trong WHERE/ORDER BY
  - Unique constraints
- Format: `CREATE INDEX|UNIQUE INDEX \`idx_name\` ON \`table\` (\`column\`)`

### 5. API Rules
- Luôn check `@request.auth.id != ""`
- So sánh với user ID: `user = @request.auth.id`
- Check role: `@request.auth.role = "admin"`
- Array contains: `participants ?= @request.auth.id`
- Nested access: `conversation.participants ?= @request.auth.id`

## 📁 Files liên quan

- **[pb_collections_new_features.json](pb_collections_new_features.json)** - File import collections mới nhất
- **[HUONG_DAN_TAO_COLLECTIONS.md](HUONG_DAN_TAO_COLLECTIONS.md)** - Hướng dẫn tạo thủ công qua UI

## 🔄 Version History

- **2026-09-22**: Thêm 6 extended collections (notebooks, statistics, conversations, messages, transport_companies, guides)
- **Format**: PocketBase v0.40.3

## 📞 Support

Nếu gặp lỗi khi import:
1. Kiểm tra format JSON hợp lệ
2. Đảm bảo collection IDs unique
3. Kiểm tra relation `collectionId` tồn tại
4. Xem logs trong PocketBase console
