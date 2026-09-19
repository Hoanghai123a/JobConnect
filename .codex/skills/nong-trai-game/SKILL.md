---
name: nong-trai-game
description: Workflow chuyên dụng để xây dựng game nông trại web 2D casual độc lập bằng React, Vite, TypeScript, Phaser 3, Zustand và PocketBase; bao gồm gameplay, UI, asset pipeline, Image Generation, persistence, security và QA.
---

# Nong Trai Game Skill

## Mục tiêu

Xây dựng một web game nông trại casual 2D có gameplay loop:
nhiệm vụ → hạt giống → trồng → chờ lớn → thu hoạch → bán → xu/EXP → lên cấp → mở khóa.

Game có thể lấy cảm hứng từ các game nông trại phổ biến, nhưng phải có nhận diện, asset, UI, tên gọi và triển khai độc lập. Không sao chép logo, nhân vật, hình ảnh, âm thanh, UI hoặc asset độc quyền của Liên Quân hay sản phẩm khác.

## Stack mặc định

- React + Vite + TypeScript
- Phaser 3 cho gameplay world
- Zustand cho client state
- PocketBase cho persistence/backend MVP
- CSS/Tailwind hoặc UI library hiện có của repo nếu phù hợp
- Không thêm dependency nếu không cần thiết.

## Nguyên tắc kiến trúc

React:

- app shell
- HUD
- menu
- shop
- inventory
- quests
- collection
- profile
- modal/dialog

Phaser:

- farm map
- player
- plots
- crops
- interactions
- animation
- effects

Luồng:
Phaser → game service/store → persistence service → PocketBase.

Phaser KHÔNG được gọi PocketBase trực tiếp.

Không duy trì cùng một nguồn dữ liệu cho cùng một trạng thái ở cả React và Phaser. Zustand/service layer là cầu nối.

## Crop timing

Không dùng setTimeout để làm trạng thái tăng trưởng trở thành nguồn sự thật.

Mỗi crop cần tối thiểu:

- cropId
- plotId
- plantedAt
- harvestAt
- state

State:
EMPTY → PLANTED/GROWING → READY → EMPTY.

Readiness phải được tính từ current time và harvestAt, vì người chơi có thể đóng trình duyệt rồi mở lại.

## Economy và security

Client không được là nguồn sự thật cho:

- coins
- inventory
- XP
- crop ownership
- plot ownership
- harvest timing
- quest completion.

Action gửi lên backend nên mô tả hành động, ví dụ:

- plant seed vào plot
- harvest plot
- buy seed
- sell crop

Không gửi các giá trị kiểu:
coinsAfter, inventoryAfter, expAfter để backend tin tưởng.

Backend phải kiểm tra:

- authenticated player
- resource ownership
- seed availability
- plot ownership
- crop validity
- harvestAt
- inventory sufficiency
- transaction consistency.

## Asset rules

Tất cả asset game phải đi qua asset manifest.

Không hardcode đường dẫn asset rải rác trong nhiều file.

Không tự bịa filename khi asset chưa tồn tại.

Nếu thiếu asset:

1. báo chính xác asset còn thiếu;
2. có thể dùng placeholder đã được khai báo;
3. không tự thay bằng icon/emoji/random image.

Asset nên được tách thành:

- characters
- crops
- tiles
- buildings
- items
- effects
- ui

Ưu tiên sprite/asset rời thay vì một ảnh farm khổng lồ.

## Art direction mặc định

- 2D casual farming
- cute, colorful, clean
- soft lighting
- hơi isometric hoặc top-down
- mobile-game quality
- readable silhouettes
- không quá nhiều chi tiết
- transparent background cho sprite
- nhất quán camera, scale, lighting, outline/shape language.

Art Direction phải được khóa trước khi sản xuất hàng loạt asset.

Image Generation dùng để tạo concept và production assets. Codex chịu trách nhiệm asset specification, manifest, loading, animation, integration và QA.

## Quy trình milestone

Chỉ làm một milestone mỗi lần.

Trước khi sửa:

1. đọc repo hiện tại;
2. đọc package.json;
3. kiểm tra git status;
4. kiểm tra cấu trúc source;
5. kiểm tra asset hiện có;
6. đọc `.codex/game-status.md` nếu tồn tại.

Sau khi sửa:

1. chạy typecheck/lint/build phù hợp;
2. test luồng vừa thay đổi;
3. cập nhật game-status;
4. báo file thay đổi;
5. báo lỗi còn lại nếu có.

Không rewrite toàn bộ project chỉ để hoàn thành một milestone.

## Commands

### `@nong-trai-game status`

Đọc game-status, repo và assets rồi báo:

- phase hiện tại
- completed
- in progress
- blockers
- missing assets
- next milestone.

### `@nong-trai-game continue`

Tiếp tục milestone hiện tại. Không tự nhảy sang milestone kế tiếp nếu milestone hiện tại chưa pass QA cơ bản.

### `@nong-trai-game implement milestone N`

Đọc prompt tương ứng và triển khai đúng phạm vi.

### `@nong-trai-game review`

Review architecture, state, security, performance và code quality mà không thay đổi code trừ khi được yêu cầu.

### `@nong-trai-game asset-spec [category]`

Tạo production asset specification cho category được yêu cầu.

### `@nong-trai-game asset-audit`

Quét manifest và source để tìm:

- asset thiếu
- filename không tồn tại
- asset không được dùng
- duplicate asset
- hardcoded asset paths.

### `@nong-trai-game qa`

Chạy checklist QA và báo pass/fail/blocker.

## MVP scope

Initial farm: 12 plots, dạng 4×3.

Initial crops:

- carrot
- rice
- corn
- potato
- tomato
- strawberry
- watermelon
- pumpkin
- sunflower
- dragon_fruit

Test balance:

- carrot: seed 20, sell 35, 30s, 3 XP
- rice: 30, 55, 60s, 5 XP
- corn: 50, 90, 120s, 8 XP
- potato: 80, 140, 180s, 12 XP
- tomato: 120, 210, 300s, 18 XP
- strawberry: 200, 360, 600s, 30 XP
- watermelon: 350, 650, 900s, 45 XP
- pumpkin: 500, 950, 1200s, 65 XP
- sunflower: 750, 1400, 1800s, 90 XP
- dragon_fruit: 1200, 2300, 3600s, 140 XP

Đây là giá trị test cho MVP, không phải số liệu cân bằng của game thương mại.

Player mặc định:

- coins: 1000
- level: 1
- exp: 0.

Quest types:

- PLANT
- HARVEST
- SELL
- BUY_SEED
- EARN_COINS
- GAIN_EXP

Collection:

- discovered
- harvestCount
- firstHarvestAt.

## Không làm trong MVP

Không tự thêm:

- multiplayer
- PvP
- chat
- trading
- guild
- blockchain
- payment
- ads
- WebSocket
- social graph.

Chỉ thêm khi có yêu cầu riêng.

## Code quality

- TypeScript strict khi repo cho phép.
- Tránh `any`.
- Component nhỏ, rõ trách nhiệm.
- Không tạo giant component.
- Không duplicate game state.
- Cleanup Phaser scenes, listeners và timers.
- Không để business logic quan trọng trong UI component.
- Không để UI quyết định economy.
- Không dùng magic strings nếu có thể đưa vào constants/types/config.

## Definition of Done

Một milestone chỉ được coi là hoàn thành khi:

- code compile/typecheck;
- build pass nếu project có build;
- luồng chính hoạt động;
- không có console error nghiêm trọng;
- state không bị duplicate;
- asset references hợp lệ;
- persistence/security đúng phạm vi milestone;
- `game-status.md` được cập nhật.
