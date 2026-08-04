# Xóa tài khoản người lao động an toàn

## Mục đích

Luồng xóa NLĐ của Admin yêu cầu xác thực lại mật khẩu. Hệ thống cho phép xóa khi tài khoản chỉ còn lịch sử đi làm hoặc dữ liệu hồ sơ không liên quan tới tiền. Nếu còn nghiệp vụ tiền, ứng dụng phải chặn xóa và hướng dẫn Admin xử lý nghiệp vụ hoặc vô hiệu hóa tài khoản.

## Cấu hình PocketBase

### Collection `users`

- `deleteRule`: `@request.auth.role = "admin"`
- Không mở quyền xóa cho `staff` hoặc `user`.

### Collection `staff_action_logs`

- `createRule`: `@request.auth.id != ""`
- Field `action` phải chấp nhận giá trị `delete`.
- Field `target_user` không bắt buộc và giữ `cascadeDelete = false`.
- Field `target_record` là Text, dùng để lưu ID tài khoản đã xóa.
- Field `before` là JSON, dùng để lưu snapshot tài khoản trước khi xóa.

### Batch API

Trong PocketBase Admin UI, vào **Settings → Application → Batch requests**:

- Bật Batch API.
- `Max requests` tối thiểu là `2`; cấu hình khuyến nghị chung của dự án là `40`.

Ứng dụng tạo log và xóa tài khoản trong cùng một batch. Nếu một request thất bại, toàn bộ giao dịch phải rollback.

## Dữ liệu chặn xóa

Chỉ các nghiệp vụ liên quan tới tiền mới chặn xóa:

- Yêu cầu ứng lương trong `advances`.
- Dữ liệu check lương trong `check_salary_items`.
- Dữ liệu giữ lương trong `salary_holds`.
- Yêu cầu phê duyệt của NLĐ có `amount > 0`.
- Yêu cầu quy đổi xu thành tiền trong `garden_exchange_requests`.
- Số dư `reserve_balance > 0` trong `garden_balances`.

`employment_histories`, `cccd_versions`, check công, sổ tay và dữ liệu trò chơi không chặn xóa. Các bản ghi có relation `cascadeDelete = true` sẽ bị PocketBase xóa cùng tài khoản. Cần hiển thị cảnh báo rõ vì hành động không thể hoàn tác. Collection chưa được cài đặt sẽ được bỏ qua; lỗi quyền hoặc lỗi truy vấn khác vẫn dừng thao tác để tránh xóa thiếu an toàn.

## Nhật ký

Log xóa không lưu mật khẩu và không giữ relation tới tài khoản đã xóa. Thông tin nhận diện tối thiểu được lưu trong `before`, gồm ID, UID, username, họ tên, số điện thoại, vai trò và trạng thái tài khoản.
