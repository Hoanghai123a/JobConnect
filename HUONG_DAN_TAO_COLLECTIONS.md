# Hướng dẫn tạo Collections cho PocketBase v0.40.3

## Cách tạo: Vào PocketBase Admin UI → Collections → New Collection

---

## 1. Collection: notebooks (Sổ tay)

**Thông tin cơ bản:**
- Name: `notebooks`
- Type: Base collection
- ❌ System: false

**Schema (Fields):**

1. **user** (relation)
   - Type: Relation
   - Required: ✅
   - Collection: users
   - Max select: 1
   - Cascade delete: ✅

2. **title** (text)
   - Type: Text
   - Required: ✅
   - Min: 1
   - Max: 200
   - Presentable: ✅

3. **content** (editor)
   - Type: Editor
   - Required: ❌

4. **category** (select)
   - Type: Select
   - Required: ❌
   - Max select: 1
   - Values: `công việc`, `cá nhân`, `học tập`, `quan trọng`, `ghi chú`, `khác`

5. **tags** (json)
   - Type: JSON
   - Required: ❌

6. **is_pinned** (bool)
   - Type: Bool
   - Required: ❌

7. **reminder_date** (date)
   - Type: Date
   - Required: ❌

8. **attachments** (file)
   - Type: File
   - Max select: 10
   - Max size: 10 MB
   - Types: image/jpeg, image/png, image/gif, image/webp, application/pdf

**API Rules:**
```javascript
// List rule
@request.auth.id != "" && user = @request.auth.id

// View rule
@request.auth.id != "" && user = @request.auth.id

// Create rule
@request.auth.id != ""

// Update rule
@request.auth.id != "" && user = @request.auth.id

// Delete rule
@request.auth.id != "" && user = @request.auth.id
```

---

## 2. Collection: statistics (Thống kê)

**Thông tin cơ bản:**
- Name: `statistics`
- Type: Base collection

**Schema (Fields):**

1. **user** (relation)
   - Type: Relation
   - Required: ❌
   - Collection: users
   - Max select: 1
   - Cascade delete: ✅

2. **metric_type** (select)
   - Type: Select
   - Required: ✅
   - Presentable: ✅
   - Values: `attendance`, `salary`, `advances`, `performance`, `overtime`, `leave`, `system_usage`, `custom`

3. **period_type** (select)
   - Type: Select
   - Required: ✅
   - Values: `daily`, `weekly`, `monthly`, `quarterly`, `yearly`

4. **period_start** (date)
   - Type: Date
   - Required: ✅

5. **period_end** (date)
   - Type: Date
   - Required: ✅

6. **data** (json)
   - Type: JSON
   - Required: ✅
   - Max size: 2000000

7. **summary** (text)
   - Type: Text
   - Max: 1000

**API Rules:**
```javascript
// List rule
@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "staff" || user = @request.auth.id)

// View rule
@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "staff" || user = @request.auth.id)

// Create rule
@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "staff")

// Update rule
@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "staff")

// Delete rule
@request.auth.id != "" && @request.auth.role = "admin"
```

---

## 3. Collection: conversations (Cuộc trò chuyện)

**Thông tin cơ bản:**
- Name: `conversations`
- Type: Base collection

**Schema (Fields):**

1. **participants** (relation)
   - Type: Relation
   - Required: ✅
   - Collection: users
   - Min select: 2
   - Max select: Unlimited (để trống)

2. **title** (text)
   - Type: Text
   - Max: 200
   - Presentable: ✅

3. **is_group** (bool)
   - Type: Bool

4. **last_message** (text)
   - Type: Text
   - Max: 500

5. **last_message_at** (date)
   - Type: Date

6. **unread_count** (json)
   - Type: JSON
   - Note: Lưu dạng {"user_id": count}

**API Rules:**
```javascript
// List rule
@request.auth.id != "" && participants ?= @request.auth.id

// View rule
@request.auth.id != "" && participants ?= @request.auth.id

// Create rule
@request.auth.id != "" && participants ?= @request.auth.id

// Update rule
@request.auth.id != "" && participants ?= @request.auth.id

// Delete rule
@request.auth.id != "" && participants ?= @request.auth.id
```

---

## 4. Collection: messages (Tin nhắn)

**Thông tin cơ bản:**
- Name: `messages`
- Type: Base collection

**Schema (Fields):**

1. **conversation** (relation)
   - Type: Relation
   - Required: ✅
   - Collection: conversations
   - Max select: 1
   - Cascade delete: ✅

2. **sender** (relation)
   - Type: Relation
   - Required: ✅
   - Collection: users
   - Max select: 1

3. **content** (text)
   - Type: Text
   - Max: 10000
   - Presentable: ✅

4. **message_type** (select)
   - Type: Select
   - Values: `text`, `image`, `file`, `location`, `system`

5. **attachments** (file)
   - Type: File
   - Max select: 5
   - Max size: 10 MB

6. **read_by** (json)
   - Type: JSON
   - Note: Array của user IDs

7. **reply_to** (relation)
   - Type: Relation
   - Collection: messages
   - Max select: 1

**API Rules:**
```javascript
// List rule
@request.auth.id != "" && conversation.participants ?= @request.auth.id

// View rule
@request.auth.id != "" && conversation.participants ?= @request.auth.id

// Create rule
@request.auth.id != "" && conversation.participants ?= @request.auth.id && sender = @request.auth.id

// Update rule
@request.auth.id != "" && sender = @request.auth.id

// Delete rule
@request.auth.id != "" && sender = @request.auth.id
```

---

## 5. Collection: transport_companies (Nhà xe)

**Thông tin cơ bản:**
- Name: `transport_companies`
- Type: Base collection

**Schema (Fields):**

1. **name** (text)
   - Type: Text
   - Required: ✅
   - Presentable: ✅
   - Max: 200

2. **phone** (text)
   - Type: Text
   - Max: 20

3. **email** (email)
   - Type: Email

4. **address** (text)
   - Type: Text
   - Max: 500

5. **province** (text)
   - Type: Text
   - Max: 100

6. **district** (text)
   - Type: Text
   - Max: 100

7. **description** (text)
   - Type: Text
   - Max: 2000

8. **services** (json)
   - Type: JSON
   - Note: Array dịch vụ

9. **rating** (number)
   - Type: Number
   - Min: 0
   - Max: 5

10. **logo** (file)
    - Type: File
    - Max select: 1
    - Max size: 2 MB
    - Types: image/jpeg, image/png, image/webp

11. **is_active** (bool)
    - Type: Bool

12. **website** (url)
    - Type: URL

**API Rules:**
```javascript
// List rule
@request.auth.id != ""

// View rule
@request.auth.id != ""

// Create rule
@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "staff")

// Update rule
@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "staff")

// Delete rule
@request.auth.id != "" && @request.auth.role = "admin"
```

---

## 6. Collection: transport_routes (Tuyến xe)

**Thông tin cơ bản:**
- Name: `transport_routes`
- Type: Base collection

**Schema (Fields):**

1. **company** (relation)
   - Type: Relation
   - Required: ✅
   - Collection: transport_companies
   - Max select: 1
   - Cascade delete: ✅

2. **route_name** (text)
   - Type: Text
   - Required: ✅
   - Presentable: ✅
   - Max: 300

3. **departure** (text)
   - Type: Text
   - Required: ✅
   - Max: 200

4. **destination** (text)
   - Type: Text
   - Required: ✅
   - Max: 200

5. **departure_time** (text)
   - Type: Text
   - Max: 50

6. **arrival_time** (text)
   - Type: Text
   - Max: 50

7. **price** (number)
   - Type: Number
   - Min: 0

8. **vehicle_type** (select)
   - Type: Select
   - Values: `xe khách`, `xe giường nằm`, `xe limousine`, `xe phòng đôi`, `xe 16 chỗ`, `xe 29 chỗ`, `xe 45 chỗ`

9. **available_seats** (number)
   - Type: Number
   - Min: 0

10. **schedule** (json)
    - Type: JSON

11. **is_active** (bool)
    - Type: Bool

**API Rules:** (giống transport_companies)

---

## 7. Collection: guides (Hướng dẫn)

**Thông tin cơ bản:**
- Name: `guides`
- Type: Base collection

**Schema (Fields):**

1. **title** (text)
   - Type: Text
   - Required: ✅
   - Presentable: ✅
   - Max: 300

2. **slug** (text)
   - Type: Text
   - Required: ✅
   - Unique: ✅
   - Max: 200
   - Pattern: `^[a-z0-9]+(?:-[a-z0-9]+)*$`

3. **category** (select)
   - Type: Select
   - Required: ✅
   - Values: `chấm công`, `lương bổng`, `tạm ứng`, `nhân sự`, `hệ thống`, `công cụ`, `quy trình`, `chính sách`, `khác`

4. **content** (editor)
   - Type: Editor
   - Required: ✅

5. **excerpt** (text)
   - Type: Text
   - Max: 500

6. **author** (relation)
   - Type: Relation
   - Collection: users
   - Max select: 1

7. **thumbnail** (file)
   - Type: File
   - Max select: 1
   - Max size: 2 MB

8. **tags** (json)
   - Type: JSON

9. **is_published** (bool)
   - Type: Bool

10. **view_count** (number)
    - Type: Number
    - Min: 0

11. **order** (number)
    - Type: Number
    - Min: 0

12. **target_roles** (json)
    - Type: JSON
    - Note: Array of roles

**API Rules:**
```javascript
// List rule
@request.auth.id != "" && (is_published = true || @request.auth.role = "admin" || @request.auth.role = "staff")

// View rule
@request.auth.id != "" && (is_published = true || @request.auth.role = "admin" || @request.auth.role = "staff")

// Create rule
@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "staff")

// Update rule
@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "staff")

// Delete rule
@request.auth.id != "" && @request.auth.role = "admin"
```

---

## Lưu ý quan trọng:

1. **Thứ tự tạo collection:** Tạo các collection độc lập trước (notebooks, statistics, transport_companies, guides), sau đó tạo các collection có relation (conversations, messages, transport_routes)

2. **Relation field:** Khi tạo relation, PocketBase sẽ tự động list các collection đã có

3. **Indexes:** Không cần tạo ngay, có thể thêm sau bằng SQL trong PocketBase Admin UI → Settings → Database

4. **Test rules:** Sau khi tạo xong, hãy test API rules bằng cách tạo vài bản ghi thử

5. **Backup:** Export schema sau khi tạo xong để backup: Settings → Export collections
