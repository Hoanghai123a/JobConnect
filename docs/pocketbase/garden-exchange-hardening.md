# Harden flow quy đổi xu vườn hoa

## Thay đổi schema cần có

Collection `garden_exchange_requests`:

- Field `status` phải cho phép thêm giá trị `processing`.
- Các giá trị hợp lệ: `pending`, `processing`, `approved`, `rejected`.

Mục đích của `processing`: khóa yêu cầu trước khi trừ xu để tránh trạng thái `pending` nhưng xu đã bị trừ khi bước duyệt bị lỗi giữa chừng.

## Cơ chế server-side nên dùng

Luồng duyệt quy đổi là thao tác tiền/xu, nên triển khai ở PocketBase server hook hoặc endpoint backend riêng, không nên chỉ dựa vào client:

1. Mở transaction.
2. Đọc lại `garden_exchange_requests` theo `requestId`.
3. Nếu `status` không phải `pending` thì dừng.
4. Đổi `status` sang `processing`.
5. Đọc lại `garden_balances` của user trong cùng transaction.
6. Nếu `coins < coins_spent` thì trả request về `pending` hoặc `rejected` theo chính sách vận hành, không trừ xu.
7. Trừ `coins`; nếu type là `reserve` thì cộng `reserve_balance`.
8. Đổi request sang `approved`.
9. Commit transaction.

Client hiện đã chặn gửi yêu cầu nếu chưa đạt `min_coins` và helper đã kiểm tra lại mốc active trước khi tạo request. Tuy nhiên, chống double-spend tuyệt đối vẫn cần transaction server-side vì PocketBase client SDK không cung cấp cập nhật có điều kiện kiểu "chỉ update khi status vẫn là pending".
