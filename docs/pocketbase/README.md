# PocketBase 0.380 - Schema mở rộng JobConnect

Thư mục này chứa các file JSON dùng để import nhanh các collection mới phục vụ phần nhân sự staff (QLNM + người tuyển) và lịch sử đi làm theo nhà máy. Tất cả file cần giữ UTF-8 để copy/paste sang PocketBase không bị vỡ dấu tiếng Việt.

## Thứ tự import

1. Mở PocketBase Admin UI -> Settings -> Import collections.
2. Dán nội dung từ `pb_collections_staff.json` hoặc upload file.
3. Bấm `Review`, sau đó `Confirm and import`.

File này chỉ chứa các collection mới cần thêm:

- `factories`
- `factory_managers`
- `employment_histories`
- `staff_action_logs`
- `push_subscriptions` (nếu bật thông báo PWA)

Collection `users` đã có sẵn. Chỉ cần đảm bảo field `role` chấp nhận thêm giá trị `staff` (xem hướng dẫn ở `users-role-update.md`).
Luồng tạo nhanh NLĐ trong mục danh sách lao động còn cần rule `users.create/update`
cho admin/staff và các field ảnh CCCD/ngân hàng/ngày sinh như hướng dẫn trong
`users-role-update.md`.

## Rule cần có trong PocketBase

- `employment_histories`
  - `listRule` / `viewRule`: admin, staff, hoặc chính user.
  - `createRule`: chỉ admin hoặc staff. User thường không được tự tạo lịch sử đi làm mới.
  - `updateRule`: admin, staff, hoặc chính user. App chỉ mở luồng user tự báo nghỉ; các quyền chi tiết hơn được kiểm tra ở frontend.
  - Field lịch sử đi làm cần có `worker_tax_code_snapshot` để lưu mã số thuế theo từng nhà máy/lịch sử, không lấy cứng từ hồ sơ user.
  - Giữ index `idx_emphist_one_active` để mỗi user chỉ có một bản ghi `working`.
- `advances`, `check_attendance_items`, `check_salary_items`
  - Cần cho staff đọc/tạo theo luồng app đang dùng.
  - PocketBase rule không biểu đạt gọn được điều kiện "người tuyển trong 3 lịch sử gần nhất", nên app bắt buộc kiểm tra quyền trước khi gọi API.

## Sau khi import

- Tạo bản ghi trong `factories`, sau đó gán `factory_managers` để staff có dữ liệu chạy.
- Khi muốn báo đi làm nhà máy mới, bản ghi cũ của user phải có `status = "left"` và `leave_date` trước.
- Admin có toàn quyền cập nhật lịch sử. Staff chỉ thao tác theo vai trò:
  - Người tuyển: là staff nằm trong `recruiter_staff` của tối đa 3 lịch sử đi làm gần nhất của user.
  - QLNM: là staff được admin gán trong `factory_managers`.

## Quan hệ chính

```text
users (admin / user / staff)
  -> factory_managers.staff
  -> employment_histories.user
  -> employment_histories.recruiter_staff

factories
  -> factory_managers.factory
  -> employment_histories.factory

staff_action_logs
  -> actor (users)
  -> target_user (users)
```

## Quyền nghiệp vụ trong app

- Người tuyển được báo ứng, xem check công/check lương, báo nghỉ và báo đi làm cho user trong phạm vi 3 lịch sử gần nhất.
- QLNM được báo nghỉ cho nhà máy đang quản lý và báo đi làm vào nhà máy mình quản lý.
- User thường chỉ được tự báo nghỉ, không được tự báo đi làm mới.
- Mọi thao tác xuất/import/báo ứng/báo nghỉ/báo đi làm/cập nhật STK/chỉnh lịch sử đều được ghi vào `staff_action_logs` khi app thực hiện được thao tác.
- Tạo nhanh NLĐ ghi đồng thời `users`, `employment_histories`, `cccd_versions`
  (nếu có ảnh/số CCCD) và `staff_action_logs`.

## Thông báo PWA

- Import thêm `pb_collections_push_notifications.json` để có collection `push_subscriptions`.
- Rule của `push_subscriptions`: user chỉ xem/sửa/xóa thiết bị của chính mình; API server dùng quyền admin để đọc danh sách thiết bị khi cần gửi Web Push.
- Cần cấu hình biến môi trường trên server app: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- API gửi thông báo cần quyền đọc `push_subscriptions` phía server qua `PB_ADMIN_TOKEN` hoặc `PB_ADMIN_EMAIL` + `PB_ADMIN_PASSWORD`.
