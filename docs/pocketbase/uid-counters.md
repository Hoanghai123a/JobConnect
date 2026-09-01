# Bộ đếm UID tập trung

## Collection `uid_counters`

Tạo Base collection với các field:

- `counter_key`: Text, required, unique.
- `counter_type`: Select, required, giá trị `user`, `employment_history`.
- `prefix`: Text.
- `period`: Text.
- `current_value`: Number, required, min 0.
- `updated_by`: Relation một bản ghi tới `users`, optional.
- `note`: Text, optional.

Khóa toàn bộ List/View/Create/Update/Delete rules của collection. Ứng dụng chỉ truy cập thông qua API server `/api/uid-counter` bằng quyền superuser PocketBase.

Thêm unique index:

```sql
CREATE UNIQUE INDEX idx_uid_counters_key ON uid_counters (counter_key);
CREATE UNIQUE INDEX idx_users_uid_unique ON users (uid) WHERE uid != '';
CREATE UNIQUE INDEX idx_employment_histories_uid_unique ON employment_histories (uid) WHERE uid != '';
```

Tên bảng/index thực tế cần được xác nhận trong PocketBase Admin trước khi áp dụng trực tiếp bằng SQL. Có thể dùng phần Indexes của collection thay cho SQL.

`updated_by` chỉ là thông tin ghi nhận, không tham gia cấp số. API sẽ tự thử lại một lần không gửi field này
nếu PocketBase trả lỗi validation do collection production chưa có relation hoặc relation trỏ sai collection.
Tuy nhiên cần đồng bộ schema theo file `docs/pocketbase/uid_counters.pb_schema.json` để lưu được người thao tác.

## Khởi tạo

1. Sao lưu PocketBase.
2. Tạo collection và index trước.
3. Tạo `.env` riêng trên máy chủ và cấu hình `PB_URL` cùng **một tài khoản PocketBase Superuser thực**:
   - Khuyến nghị: `PB_ADMIN_EMAIL` và `PB_ADMIN_PASSWORD` của Superuser.
   - Hoặc: `PB_ADMIN_TOKEN` là token được cấp từ tài khoản Superuser, không phải token đăng nhập của collection `users` (kể cả user có `role = admin`).
     Không commit `.env` hoặc ghi mật khẩu vào `ecosystem.config.cjs`. Nếu dùng `PB_ADMIN_TOKEN`, vẫn nên giữ
     `PB_ADMIN_EMAIL` và `PB_ADMIN_PASSWORD` để API có thể tự cấp lại token khi token trực tiếp bị thu hồi/hết quyền.
4. Chạy `npm run pb:init-uid-counters`.
5. Kiểm tra báo cáo UID sai định dạng và UID trùng. Script không sửa các bản ghi nghiệp vụ.
6. Chạy lại script để xác nhận bộ đếm không bị giảm.

Sau khi thay đổi `.env` trên production, chạy `npm run deploy` để build và reload PM2 với môi
trường mới. Cấu hình PM2 sử dụng `node --env-file=.env`, vì vậy máy chủ cần Node.js 20.6 trở lên.
Sau đó đăng nhập bằng tài khoản staff/admin của ứng dụng và thử tạo một lao động: request `POST /api/uid-counter`
phải trả `200`, không còn `PB_PERMISSION_DENIED`.

## Vận hành

- UID user dùng khóa `user:{PREFIX}`.
- UID lịch sử dùng khóa `employment_history:{PREFIX}:{YYYYMM}`.
- UID đã giữ nhưng tạo dữ liệu thất bại không được tái sử dụng.
- Khi đổi tiền tố, một counter mới được tạo; counter cũ được giữ nguyên.
- API hiện khóa tuần tự trong tiến trình Node/PM2. Cấu hình hiện tại chạy một instance nên bảo đảm các request của ứng dụng được tuần tự hóa. Nếu chạy nhiều instance Node hoặc nhiều máy chủ, phải chuyển thao tác cấp số vào PocketBase hook/transaction hoặc một kho khóa phân tán trước khi scale-out.

## Quay lui

Frontend có thể quay về phiên bản cũ mà không cần xóa collection. Không xóa counter hoặc giảm `current_value`; việc đó có thể khiến UID bị cấp lại.
