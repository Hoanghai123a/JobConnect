# QA Checklist

## Build

- [ ] TypeScript passes
- [ ] lint passes if configured
- [ ] production build passes

## Authentication

- [ ] login
- [ ] logout
- [ ] unauthenticated access
- [ ] refresh session

## Farm

- [ ] plots render
- [ ] locked plots render correctly
- [ ] planting
- [ ] crop growth
- [ ] ready state
- [ ] harvest
- [ ] reload preserves crop timing

## Economy

- [ ] buy seed
- [ ] inventory decrement
- [ ] harvest item
- [ ] sell item
- [ ] coins update
- [ ] XP update
- [ ] duplicate action protection

## Progression

- [ ] level calculation
- [ ] unlock crop
- [ ] unlock plot
- [ ] level-up feedback

## Quests

- [ ] progress
- [ ] completion
- [ ] claim
- [ ] duplicate claim protection

## Collection

- [ ] discovery
- [ ] harvest count
- [ ] first harvest timestamp

## UI

- [ ] mobile layout
- [ ] desktop layout
- [ ] loading state
- [ ] error state
- [ ] empty state
- [ ] touch targets
- [ ] no overflow

## Phaser

- [ ] scene cleanup
- [ ] listener cleanup
- [ ] texture references valid
- [ ] no runaway timers
- [ ] no obvious memory leak

## Security

- [ ] ownership validated
- [ ] crop validity validated
- [ ] harvestAt validated
- [ ] inventory validated
- [ ] economy not client-authoritative
