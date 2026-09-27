# Game Replacement Summary

## Ngày thực hiện: 2026-09-16

### Thay đổi chính

**Game cũ (Vườn cây):**
- React components thuần
- localStorage + PocketBase
- Trồng hoa, nuôi thú cưng
- Hệ thống quy đổi xu phức tạp
- Component RoamingPet toàn ứng dụng

**Game mới (Nông Trại):**
- Phaser 3 game engine
- Zustand + PocketBase (planned)
- Trồng cây nông sản
- Kiến trúc module hóa
- Game tách biệt trong canvas

### Files đã thay đổi

1. `src/routes/_authenticated/garden.tsx` — Route giữ nguyên `/garden`, nội dung thay bằng PhaserGame component
2. `src/routes/index.tsx` — Label đổi từ "Vườn cây" → "Nông trại"
3. `src/routes/__root.tsx` — Xóa import và render RoamingPet

### Files đã backup

Toàn bộ code game cũ lưu tại:
- `src/archive/garden-game-old/garden.tsx.backup`
- `src/archive/garden-game-old/garden.ts.backup`
- `src/archive/garden-game-old/garden-server.ts.backup`
- `src/archive/garden-game-old/components-garden-backup/` (RoamingPet.tsx)

### Files game mới (Foundation)

```
src/game/
├── types/index.ts           — TypeScript types
├── config/
│   ├── game.ts              — Game constants
│   ├── crops.ts             — Crop data (10 loại)
│   └── assets.ts            — Asset manifest
├── stores/gameStore.ts      — Zustand store
├── scenes/FarmScene.ts      — Phaser scene
└── PhaserGame.tsx           — React mount
```

### Tích hợp

- ✅ Route `/garden` hoạt động
- ✅ Navigation hiển thị "Nông trại"
- ✅ Game render trong Phaser canvas
- ✅ Zustand store khởi tạo
- ✅ Asset manifest tập trung
- ✅ Build thành công (0 errors)

### PocketBase Collections (chưa migrate)

Game cũ sử dụng các collections sau (vẫn còn trong DB):
- `garden_foods`
- `garden_exchange_tiers`
- `garden_balances`
- `garden_exchange_requests`
- `garden_visit_saves`

**TODO Milestone 9 (PocketBase):** Tạo collections mới cho game nông trại hoặc adapt lại collections cũ.

### Lưu ý kỹ thuật

1. **RoamingPet component đã bị xóa khỏi __root.tsx** — Thú cưng di chuyển toàn màn hình không còn nữa
2. **Game vườn cây cũ vẫn có thể phục hồi** từ backup nếu cần
3. **`src/lib/garden.ts` và `src/lib/garden-server.ts` vẫn tồn tại** — Các route khác có thể đang dùng (cần kiểm tra)
4. **Phaser bundle lớn (1.39 MB minified)** — Cân nhắc lazy load hoặc code splitting trong tương lai

### Milestones tiếp theo

Theo `.codex/skills/nong-trai-game/SKILL.md`:
- **02 - UI**: HUD, shop, inventory, quest panel
- **03 - Phaser world**: Tilemap, sprites, animations
- **04 - Crop system**: Plant, grow, harvest với real assets
- **09 - PocketBase**: Migrate/create collections, sync state

### Verification

```bash
npm run build  # ✓ Pass (24.58s)
npm run lint   # ✓ 0 errors, 10 warnings (pre-existing)
```
