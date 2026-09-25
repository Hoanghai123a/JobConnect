# Milestone 09 — PocketBase Persistence

Integrate PocketBase through a service/adapter layer.

Suggested collections are in references/pocketbase.md.

Implement:

- auth/session
- player record
- farm
- plots
- inventory
- quests
- collections.

Phaser must never import PocketBase directly.

Map backend records into domain types.

Acceptance:

- login/session works
- player data loads
- farm state persists
- crop timestamps survive reload/browser restart
- services are testable independently of Phaser.
