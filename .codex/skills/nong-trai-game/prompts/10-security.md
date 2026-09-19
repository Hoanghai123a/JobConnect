# Milestone 10 — Security

Audit and harden economy/action mutations.

Validate server-side:

- authenticated player
- ownership
- plot unlocked
- seed ownership
- crop id
- harvestAt
- inventory
- action duplication.

Do not accept client-authoritative final balances.

Document PocketBase rules/endpoints/hooks used.

Acceptance:

- obvious replay/double-submit cases are rejected
- user A cannot modify user B
- invalid crop/action is rejected
- negative economy values are impossible through supported actions.
