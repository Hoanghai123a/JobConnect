# Claude Code Mandatory Rules

- Sử dụng tiếng việt để trả lời
  These rules are mandatory for every task in this repository.

## Before editing

Claude must not scan the whole repository by default.

For every task, Claude must follow this order:

1. Use CodeGraph first to locate the smallest relevant code area.
2. Read `PROJECT_MAP.md` if CodeGraph is insufficient.
3. Identify the smallest set of files related to the task.
4. Read only those files.
5. Edit only directly related files.
6. Do not refactor unrelated code.
7. Do not rewrite formatting-only changes across unrelated files.

## Required workflow

Before making changes, Claude must briefly state:

- the likely files to inspect
- why those files are relevant
- whether the change has a wider blast radius

Then Claude may edit.

## Non-negotiable behavior

If a task requires code changes, Claude must not begin by using broad grep, glob, or reading many files.

Claude must first use CodeGraph or `PROJECT_MAP.md`.

If Claude cannot access CodeGraph, it must say so and then use `PROJECT_MAP.md` before reading source files.

## Validation

After editing, Claude should run the smallest useful validation command:

```bash
npm run build
npm run lint
npm test
```

## Module Nông Trại Game

Module game mini tích hợp trong JobConnect, do AI Engineer phát triển theo quy trình milestone nghiêm ngặt.

### Tệp tin quản lý

- `.codex/skills/nong-trai-game/SKILL.md` — Hướng dẫn kỹ thuật chi tiết
- `.codex/game-status.md` — Trạng thái tiến độ hiện tại

### Lệnh điều hành

Prefix: `@nong-trai-game`

- `status` — Báo cáo tiến độ từ game-status.md
- `implement milestone [X]` — Triển khai milestone X
- `continue` — Tiếp tục công việc dở dang
- `asset-spec crops` — Kiểm tra quy chuẩn kỹ thuật asset cây trồng
- `asset-audit` — Kiểm tra tính đầy đủ và hợp lệ của asset
- `qa` — Kiểm thử và rà soát lỗi

### Milestones (phải hoàn thành từng bước theo thứ tự)

1. Foundation → 2. UI → 3. Phaser world → 4. Crop system → 5. Economy → 6. Progression → 7. Quests → 8. Collection → 9. PocketBase → 10. Security → 11. Polish → 12. QA

### Quy tắc Asset Pipeline

- Artwork từ Image Generation
- Tích hợp chính xác artwork vào game logic
- **NGHIÊM CẤM**: Tự bịa filename không tồn tại, dùng emoji/icon thay thế asset thật
