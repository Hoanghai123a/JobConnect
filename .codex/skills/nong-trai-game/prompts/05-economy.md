# Milestone 05 — Economy

Implement typed economy domain:

- coins
- inventory
- buy seeds
- sell crops
- harvest rewards
- XP reward.

Use configuration for prices/rewards.

For now persistence may use a clearly isolated local/mock adapter if PocketBase is not ready.

Prevent:

- negative inventory
- negative coins
- selling nonexistent items
- double harvest.

Acceptance:

- shop → inventory → farm → harvest → sell loop works.
