# Hướng dẫn import collection coin_transactions vào PocketBase

## Cách 1: Import qua Admin UI (Khuyến nghị)

1. Mở PocketBase Admin UI: `http://localhost:8090/_/`
2. Đăng nhập với tài khoản admin
3. Vào menu **Settings** → **Import collections**
4. Click **Load from JSON file**
5. Chọn file: `docs/pocketbase/coin_transactions_collection.json`
6. Review các trường và click **Import**

## Cách 2: Tạo thủ công qua Admin UI

1. Mở PocketBase Admin UI: `http://localhost:8090/_/`
2. Click **New collection** → **Base collection**
3. Đặt tên: `coin_transactions`
4. Thêm các fields sau:

### Fields cần tạo:

| Field name | Type | Required | Options |
|------------|------|----------|---------|
| `user` | Relation | ✓ | → users, max 1, display: full_name, username |
| `amount` | Number | ✓ | Integer only |
| `balance_after` | Number | ✓ | Min: 0, Integer only |
| `transaction_type` | Select | ✓ | Values: admin_add, admin_subtract, referral, checkin, reward, exchange, game |
| `reason` | Text | - | Max: 500 chars |
| `admin_id` | Relation | - | → users, max 1, display: full_name, username |
| `metadata` | JSON | - | Max size: 2MB |

### API Rules:

**List rule:**
```
@request.auth.id != "" && (@request.auth.role = "admin" || user = @request.auth.id)
```

**View rule:**
```
@request.auth.id != "" && (@request.auth.role = "admin" || user = @request.auth.id)
```

**Create rule:**
```
@request.auth.role = "admin"
```

**Update rule:** `null` (không cho phép update)

**Delete rule:** `null` (không cho phép delete)

### Indexes (Optional - tăng hiệu suất query):

Vào tab **Indexes** của collection và thêm:

1. `idx_user`: Single index trên field `user`
2. `idx_created`: Single index trên field `created`
3. `idx_user_created`: Compound index trên `user, created`

## Kiểm tra sau khi import

Chạy query test trong **API Preview**:

```javascript
// Lấy tất cả transactions của user
pb.collection('coin_transactions').getList(1, 10, {
  filter: 'user = "USER_ID"',
  sort: '-created'
});
```

## Lưu ý quan trọng

- Collection này lưu **lịch sử tất cả giao dịch xu** (cộng/trừ)
- Chỉ admin mới được tạo record mới
- User chỉ được xem transactions của chính họ
- Không cho phép sửa/xóa transaction (immutable log)
- Field `amount` có thể âm (trừ xu)
