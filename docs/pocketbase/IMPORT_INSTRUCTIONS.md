# Hướng dẫn Import PocketBase Schema cho Farm Game

## Tổng quan

File `farm_game_collections.json` chứa schema định nghĩa cho 4 collections của module Nông Trại Game:
- `farm_players` - Thông tin người chơi (coins, level, exp)
- `farm_plots` - Trạng thái các ô đất (crop_id, planted_at, harvest_at)
- `farm_inventory` - Kho lưu trữ cây trồng đã thu hoạch
- `farm_quests` - Tiến độ nhiệm vụ hàng ngày

## Yêu cầu

- PocketBase instance đang chạy trên http://localhost:8090
- Admin access để import collections
- File schema: `docs/pocketbase/farm_game_collections.json`

## Các bước Import

### Cách 1: Import qua PocketBase Admin UI (Khuyến nghị)

1. **Truy cập PocketBase Admin UI**
   ```
   http://localhost:8090/_/
   ```

2. **Đăng nhập với tài khoản Admin**

3. **Import Collections**
   - Click vào "Settings" (⚙️) ở sidebar
   - Chọn tab "Import collections"
   - Click "Load from JSON file"
   - Chọn file `docs/pocketbase/farm_game_collections.json`
   - Review các collections sẽ được tạo (4 collections)
   - Click "Import" để xác nhận

4. **Xác minh Import thành công**
   - Quay lại tab "Collections"
   - Kiểm tra 4 collections đã xuất hiện:
     - ✅ `farm_players`
     - ✅ `farm_plots`
     - ✅ `farm_inventory`
     - ✅ `farm_quests`

### Cách 2: Import qua PocketBase CLI (Advanced)

Nếu bạn có quyền truy cập terminal của server PocketBase:

```bash
# Stop PocketBase server trước
# Sau đó chạy import command:
./pocketbase import-collections docs/pocketbase/farm_game_collections.json

# Restart PocketBase server
./pocketbase serve
```

## Xác minh Schema

Sau khi import, kiểm tra từng collection:

### farm_players
- Fields: `user` (relation), `coins`, `level`, `exp`, `last_login`
- Indexes: Unique index trên `user`
- Access Rules:
  - List/View: User tự xem data của mình hoặc admin
  - Create: User đã authenticated
  - Update: User tự update hoặc admin
  - Delete: Admin only

### farm_plots
- Fields: `player` (relation), `plot_id`, `crop_id`, `planted_at`, `harvest_at`
- Indexes: Unique index trên (`player`, `plot_id`)
- Access Rules:
  - List/View: User tự xem plots của mình
  - Create: Không cho phép (plots được tạo tự động)
  - Update: User tự update plots của mình
  - Delete: Không cho phép

### farm_inventory
- Fields: `player` (relation), `crop_id`, `quantity`
- Indexes: Unique index trên (`player`, `crop_id`)
- Access Rules:
  - List/View: User tự xem inventory của mình
  - Create: Không cho phép (inventory được tạo tự động)
  - Update: User tự update inventory của mình
  - Delete: Không cho phép

### farm_quests
- Fields: `player` (relation), `quest_id`, `progress`, `claimed`, `reset_at`
- Indexes: 
  - Unique index trên (`player`, `quest_id`)
  - Index trên `reset_at` (cho daily reset logic)
- Access Rules:
  - List/View: User tự xem quests của mình
  - Create: Không cho phép (quests được tạo tự động)
  - Update: User tự update quests của mình (chỉ khi `claimed = false`)
  - Delete: Không cho phép

## Testing Import

Sau khi import xong, test bằng cách:

1. **Tạo test player record**
   - Vào collection `farm_players`
   - Click "New record"
   - Chọn một user từ `_pb_users_auth_`
   - Set: `coins: 1000`, `level: 1`, `exp: 0`
   - Save

2. **Kiểm tra relations**
   - Vào collection `farm_plots`
   - Tạo record với `player` = player vừa tạo
   - Set: `plot_id: 0`, `crop_id: null`
   - Verify relation hoạt động đúng

3. **Test access rules**
   - Logout khỏi admin
   - Login với user account thường
   - Verify chỉ thấy data của chính mình
   - Verify không thể tạo/xóa records trực tiếp

## Troubleshooting

### Lỗi "Collection already exists"
- Nếu collections đã tồn tại, xóa chúng trước:
  - Vào từng collection → Settings → Delete collection
  - Sau đó import lại

### Lỗi "Invalid relation target"
- Đảm bảo collection `_pb_users_auth_` đã tồn tại
- Nếu chưa có, tạo user account trước rồi import lại

### Lỗi "Invalid index"
- PocketBase version cũ có thể không support index syntax
- Update PocketBase lên phiên bản mới nhất

### Access rules không hoạt động
- Kiểm tra user đã login chưa: `pb.authStore.isValid`
- Kiểm tra `@request.auth.id` có match với `player.user` không
- Xem PocketBase logs để debug: `http://localhost:8090/_/#/logs`

## Next Steps

Sau khi import schema thành công:

1. ✅ Verify authenticated mode hoạt động
2. ✅ Test game persistence với real PocketBase data
3. ✅ Implement daily quest reset logic (PocketBase hooks hoặc cron)
4. ✅ Security audit - verify server-side validation
5. ✅ Load testing với multiple concurrent users

## Lưu ý quan trọng

**Data Isolation:**
- Offline/guest data (localStorage) KHÔNG được sync lên PocketBase
- Authenticated users bắt đầu với farm mới (empty state)
- Đây là design decision cho security và anti-cheat

**Server-side Validation:**
- Client KHÔNG được tin tưởng cho economy operations
- Backend phải validate mọi transaction (coins, inventory, timing)
- Implement validation logic trong PocketBase hooks hoặc custom endpoints

**Daily Quest Reset:**
- Cần implement cron job hoặc PocketBase hook
- Reset quests khi `reset_at < current_time`
- Set `progress = 0`, `claimed = false`, `reset_at = tomorrow`
