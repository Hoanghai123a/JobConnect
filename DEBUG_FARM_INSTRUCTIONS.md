# Debug Farm Route - Hướng dẫn kiểm tra lỗi

## Bước 1: Kiểm tra Console Errors

1. Mở browser (Chrome/Edge)
2. Nhấn `F12` để mở DevTools
3. Vào tab **Console**
4. Refresh trang `/farm`
5. Copy **toàn bộ lỗi màu đỏ** và gửi cho tôi

## Bước 2: Kiểm tra Network Requests

1. Trong DevTools, vào tab **Network**
2. Refresh trang `/farm`
3. Tìm các request màu đỏ (failed)
4. Click vào từng request failed → tab **Response** → copy nội dung
5. Đặc biệt chú ý các request đến:
   - `/api/public/pb/api/collections/farm_players/records`
   - `/api/public/pb/api/collections/farm_plots/records`
   - `/api/public/pb/api/collections/farm_inventory/records`
   - `/api/public/pb/api/collections/farm_quests/records`

## Bước 3: Kiểm tra PocketBase Collections

1. Vào PocketBase Admin: `http://127.0.0.1:8090/_/`
2. Vào **Collections**
3. Kiểm tra 4 collections đã được tạo chưa:
   - `farm_players`
   - `farm_plots`
   - `farm_inventory`
   - `farm_quests`
4. Click vào `farm_players` → **API Rules** tab
   - Screenshot các rules (List, View, Create, Update, Delete)

## Bước 4: Kiểm tra Authentication

Chạy lệnh này trong Browser Console:

```javascript
// Kiểm tra auth state
console.log("Auth valid:", pb.authStore.isValid);
console.log("User ID:", pb.authStore.model?.id);
console.log("User email:", pb.authStore.model?.email);

// Test query farm_players
pb.collection('farm_players').getList(1, 1).then(
  res => console.log("farm_players query OK:", res),
  err => console.error("farm_players query ERROR:", err)
);
```

## Bước 5: Test Manual Query

Thử query trực tiếp trong PocketBase Admin:

1. Vào collection `farm_players`
2. Click **API Preview**
3. Thử endpoint: `GET /api/collections/farm_players/records`
4. Check response có lỗi gì không

## Các lỗi phổ biến & Fix

### Lỗi: "Failed to resolve field @request.auth.id"
**Fix:** Schema rules sai cú pháp → Đã sửa trong `farm_game_collections.json`

### Lỗi: "User not authenticated"
**Fix:** Đăng nhập lại vào app

### Lỗi: "Collection not found"
**Fix:** Import lại schema vào PocketBase

### Lỗi: "CORS error"
**Fix:** Kiểm tra PocketBase settings → CORS allowed origins

### Lỗi: "Cannot read properties of undefined"
**Fix:** Có thể do GAME_CONFIG hoặc DAILY_QUESTS chưa được import đúng

## Thông tin cần gửi cho tôi

Sau khi làm các bước trên, gửi cho tôi:

1. ✅ Console errors (toàn bộ text màu đỏ)
2. ✅ Network failed requests (response body)
3. ✅ Screenshot PocketBase collections list
4. ✅ Kết quả test authentication (bước 4)
5. ✅ PocketBase version đang dùng

Với thông tin này tôi sẽ biết chính xác vấn đề và fix ngay.
