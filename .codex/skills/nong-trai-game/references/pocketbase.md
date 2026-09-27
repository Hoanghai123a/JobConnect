# PocketBase Reference

## Suggested collections

### players

- user
- coins
- level
- exp

### farms

- player
- name

### farm_plots

- farm
- index
- unlocked
- cropId
- plantedAt
- harvestAt
- state

### inventories

- player
- itemId
- quantity

### quests

- player
- questId
- type
- target
- progress
- completed
- claimed

### collections

- player
- itemId
- discovered
- harvestCount
- firstHarvestAt

## Ownership

Every player-owned record must be linked to the authenticated player/farm.

## Server authority

The backend validates actions rather than accepting arbitrary final balances.

Prefer action-oriented mutations:

- plant
- harvest
- buy
- sell
- claim quest.

Do not trust:

- client coinsAfter
- client inventoryAfter
- client expAfter
- client harvest success.

## Atomicity

Where PocketBase limitations require application-level sequencing, design operations so duplicate requests are detected and rejected. Do not allow easy double harvest or double spending.
