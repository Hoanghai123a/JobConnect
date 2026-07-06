# Mini game xếp kim cương

## Trạng thái hiện tại

Route `/gems` đã có mini game match-3 trong nhóm Giải trí, cạnh Vườn cây.

MVP hiện tại dùng `garden_balances.coins` để hiển thị và cộng xu khi người chơi ăn đúng viên kim cương có nhãn `+xu`.

Các giới hạn đang áp dụng ở frontend:

- Mỗi ván có 18 lượt đổi viên.
- Tối đa 20 xu/ngày từ kim cương.
- Đạt 500 xu thì không sinh thêm viên kim cương chứa xu.
- Càng nhiều xu thì số viên có xu càng thưa dần.

## PocketBase nên bổ sung trước khi mở thưởng lớn

Vì xu có thể quy đổi tiền, không nên để frontend là nguồn quyết định cuối cùng. Nên bổ sung các collection sau:

### `garden_game_sessions`

- `user` relation `users`
- `game_type` text, ví dụ `gems`
- `mode` select: `normal`, `solo`
- `seed` text
- `score` number
- `coins_rewarded` number
- `duration_ms` number
- `status` select: `started`, `completed`, `rejected`
- `created`

### `garden_gem_rewards`

- `session` relation `garden_game_sessions`
- `user` relation `users`
- `gem_key` text
- `coins` number
- `claimed` bool
- `claimed_at` date

### `garden_duels`

- `challenger` relation `users`
- `opponent` relation `users`
- `stake_coins` number
- `fee_percent` number, mặc định `10`
- `status` select: `pending`, `accepted`, `playing`, `completed`, `cancelled`, `expired`
- `winner` relation `users`
- `challenger_score` number
- `opponent_score` number
- `seed` text
- `expires_at` date

### `garden_coin_logs`

- `user` relation `users`
- `source` select: `gem_game`, `duel_stake`, `duel_win`, `duel_refund`, `duel_fee`
- `amount` number
- `balance_before` number
- `balance_after` number
- `ref_collection` text
- `ref_id` text
- `created`

## Cơ chế server-side bắt buộc cho solo cược xu

Khi mở cược thật, PocketBase hook hoặc endpoint backend cần xử lý bằng transaction:

1. Khi đối thủ chấp nhận, trừ xu của cả hai người và đưa vào escrow.
2. Khi cả hai nộp điểm, server tính người thắng.
3. Người thua mất đủ `stake_coins`.
4. Người thắng nhận phần cược của người thua sau phí 10%.
5. Ghi `garden_coin_logs` cho từng biến động.
6. Nếu hòa, hết hạn, hoặc một bên không hoàn thành thì xử lý hoàn xu theo rule vận hành.

Ví dụ cược 20 xu: người thua mất 20 xu, người thắng nhận thêm 18 xu, hệ thống giữ 2 xu phí.
