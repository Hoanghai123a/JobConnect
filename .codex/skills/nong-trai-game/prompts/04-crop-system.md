# Milestone 04 — Crop System

Implement:

- crop config
- seed selection
- planting
- plantedAt
- harvestAt
- growth stage derivation
- ready state
- harvest action
- crop visuals
- timestamp-based progression.

Do not use setTimeout as the source of truth.

Initial crops:
carrot, rice, corn, potato, tomato, strawberry, watermelon, pumpkin, sunflower, dragon_fruit.

Use test balance from SKILL.md.

Acceptance:

- plant works
- crop changes visual stage
- reload preserves correct stage from timestamps
- ready state is deterministic
- harvest clears plot.
