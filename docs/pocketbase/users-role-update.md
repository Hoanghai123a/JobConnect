# Cập nhật collection `users`

Collection `users` đã có sẵn nên không import đè ở đây.

## Thay đổi cần làm

1. Field `role` (Select):
   - Thêm giá trị `staff` vào danh sách lựa chọn (hiện đang có `admin`, `user`).
   - Giữ nguyên giá trị mặc định `user` cho tài khoản đăng ký mới.
2. Field `cccd` (Text, không bắt buộc):
   - Nếu chưa có thì tạo mới để lưu CCCD gốc của user. Lịch sử đi làm vẫn dùng
     `worker_cccd_snapshot` riêng, không lấy cứng từ field này.
3. Field `employee_code` (Text, không bắt buộc):
   - Tuỳ chọn, dùng làm mã NV mặc định khi user chưa gắn với nhà máy nào.
4. Các field ngân hàng (`bank_name`, `bank_account_number`, `bank_account_name`):
   - Đảm bảo đã tồn tại để staff có thể cập nhật STK cho user khi cần.

## Ghi chú

- Không đổi tên collection `users` (`_pb_users_auth_`); các collection mới đã
  trỏ relation tới id hệ thống này.
- Sau khi cập nhật role, vào `/admin/staff` trong app để gán quyền qlnm và xem
  danh sách staff đang có.
