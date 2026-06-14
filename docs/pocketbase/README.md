# PocketBase 0.380 — Schema mở rộng JobConnect

Thư mục này chứa các file JSON dùng để import nhanh các collection mới phục vụ cho phần
nhân sự staff (qlnm + nvtd) và lịch sử đi làm theo nhà máy. Tất cả file đều UTF-8 không BOM
nên copy/paste sang PocketBase 0.380 sẽ không bị vỡ dấu tiếng Việt.

## Thứ tự import

1. Mở PocketBase Admin UI → Settings → Import collections.
2. Dán nội dung từ `pb_collections_staff.json` (hoặc upload file).
3. Bấm `Review` rồi `Confirm and import`.

File này chỉ chứa các collection MỚI cần thêm:

- `factories`
- `factory_managers`
- `employment_histories`
- `staff_action_logs`

Collection `users` đã có sẵn. Chỉ cần đảm bảo field `role` chấp nhận thêm giá trị
`staff` (xem hướng dẫn ở `users-role-update.md`).

## Sau khi import

- Vào từng collection mới, kiểm tra phần `API rules` cho phù hợp với môi trường
  (file JSON đã set sẵn rule cơ bản; bạn có thể siết chặt thêm theo nhu cầu).
- Tạo vài bản ghi mẫu trong `factories` rồi mới gán `factory_managers` để app
  staff có dữ liệu chạy.
- Index `idx_emphist_one_active` đảm bảo mỗi user chỉ có duy nhất một bản ghi
  trạng thái `working` tại một thời điểm. Khi muốn báo đi làm nhà máy mới thì
  bản ghi cũ phải đặt `status = "left"` và có `leave_date` trước.

## Quan hệ chính

```text
users (admin / user / staff)
  └─ factory_managers.staff        (admin gán quyền qlnm)
  └─ employment_histories.user
  └─ employment_histories.recruiter_staff

factories
  └─ factory_managers.factory
  └─ employment_histories.factory

staff_action_logs
  └─ actor          (users)
  └─ target_user    (users)
```

## Quyền và phạm vi xem

- Một staff có thể đồng thời là qlnm (nhà máy do admin gán trong `factory_managers`)
  và nvtd (xác định theo `employment_histories.recruiter_staff`). Cả hai cũng có
  thể bỏ trống, app sẽ chỉ hiện đúng phạm vi mà staff có quyền.
- Khung 90 ngày gần nhất được áp ở phía app (xem `STAFF_LOOKBACK_DAYS` trong
  `src/lib/staff-types.ts`). PocketBase chỉ ràng buộc dữ liệu, app sẽ lọc khi hiển thị.
- Mọi thao tác xuất / import / báo ứng / báo nghỉ / báo đi làm / cập nhật STK / chỉnh
  lịch sử đều được ghi vào `staff_action_logs` (admin có quyền xem nhật ký này).
