# Game Design Reference

## Core loop

Quest → seed → plant → growth → harvest → sell → coins/XP → unlock → repeat.

## Farm

Initial:

- 4×3
- 12 plots
- some plots can become locked later.

## Crop model

```ts
type CropState = "EMPTY" | "GROWING" | "READY";

interface FarmPlot {
  id: string;
  unlocked: boolean;
  cropId?: string;
  plantedAt?: number;
  harvestAt?: number;
  state: CropState;
}
```

The visual growth stage is derived from elapsed time.

## Suggested progression

Level 1:

- carrot
- rice
- 4 active plots

Level 2:

- corn
- 6 plots

Level 3:

- potato
- 8 plots

Level 4:

- tomato
- 10 plots

Level 5:

- strawberry
- 12 plots

Level 6:

- watermelon
- 16 plots

Level 7:

- pumpkin

Level 8:

- sunflower

Level 9:

- dragon_fruit

Values are MVP test balance and should live in configuration, not UI code.

## UX principles

Every important action should have:

- clear target
- visible state
- immediate feedback
- understandable error
- no accidental double action.

Examples:

- planted → visual crop appears
- ready → ready indicator
- harvest → item popup + XP/coin feedback
- locked plot → reason shown.
