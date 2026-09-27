# Architecture Reference

## Layers

1. Presentation
   - React pages/components
   - HUD
   - modal
   - shop/inventory/quest UI

2. Game
   - Phaser scenes
   - player
   - farm plots
   - crop visuals
   - interactions
   - effects

3. State
   - Zustand stores
   - selectors
   - derived state

4. Domain/services
   - crop service
   - economy service
   - quest service
   - collection service
   - player progression

5. Persistence
   - PocketBase adapter
   - auth
   - records
   - server-side validation.

## Phaser scenes

- BootScene
- PreloadScene
- FarmScene
- UIScene nếu cần cho in-game Phaser UI.

React vẫn là nơi ưu tiên cho application-level UI.

## Suggested source tree

src/
app/
components/
pages/
game/
scenes/
entities/
systems/
events/
stores/
services/
domain/
crops/
economy/
quests/
progression/
collection/
lib/
types/
config/

public/assets/
characters/
crops/
tiles/
buildings/
items/
effects/
ui/
