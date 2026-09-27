# Cấu hình guest mode

Guest mode không truy cập PocketBase trực tiếp từ trình duyệt. Các API server
`/api/public/check-payroll`, `/api/public/advance-request` và
`/api/public/complaint` dùng quyền quản trị phía server để tra cứu hoặc tạo
bản ghi sau khi đã kiểm tra dữ liệu đầu vào.

## Biến môi trường server

Cấu hình trên server chạy ứng dụng, không dùng tiền tố `VITE_` và không đưa các
giá trị này vào bundle trình duyệt:

```env
PB_URL=http://127.0.0.1:8090
PB_ADMIN_TOKEN=...
```

Hoặc dùng tài khoản superuser:

```env
PB_ADMIN_EMAIL=...
PB_ADMIN_PASSWORD=...
```

Ưu tiên `PB_ADMIN_TOKEN`. Nếu không có token, app sẽ đăng nhập bằng email và
mật khẩu để lấy token tạm thời.

## Kiểm tra collection

- `advances.user` phải là relation không bắt buộc (`required=false`).
- `advances.requested_by` phải là relation không bắt buộc nếu field này đang có
  trong schema.
- Hai relation trên nên giữ `cascadeDelete=false`.
- `complaints` cần có các field `full_name`, `phone`, `content`,
  `employee_code`, `company` và `status`.
- Không mở `listRule` hoặc `viewRule` công khai cho
  `employment_histories`, `check_attendance_items` hay `check_salary_items`.
  Guest chỉ nhận dữ liệu đã được API server lọc theo mã nhân viên.
- Rule đọc/tạo/sửa/xóa của `advances` và `complaints` vẫn giữ giới hạn cho
  tài khoản nội bộ. Guest đi qua API server, không gọi collection trực tiếp.

Filter admin của ứng lương phải bao gồm cả bản ghi không có relation `user`
(điều kiện `user=""`), để các yêu cầu guest đã tạo vẫn xuất hiện trong màn
quản trị.
