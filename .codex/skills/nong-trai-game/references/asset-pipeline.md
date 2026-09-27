# Asset Pipeline

## Directory

public/assets/

- characters/
- crops/
- tiles/
- buildings/
- items/
- effects/
- ui/

## Naming

Use lowercase snake_case.

Examples:

- farmer_idle.png
- carrot_stage_1.png
- soil_watered.png
- harvest_sparkle.png

## Manifest

All runtime asset paths should be exported from one manifest module.

## Asset specification

Each requested asset should document:

- asset id
- filename
- category
- canvas size
- transparent background
- camera/perspective
- pose/stage
- lighting
- shadow
- visual constraints
- animation frames if any.

## Missing assets

Never invent paths.

Allowed:

- documented placeholder asset
- explicit missing asset report.

## Sprite sheets

Use sprite sheets when:

- animation has multiple frames
- frame dimensions are consistent
- Phaser animation benefits from atlas/sheet loading.

Use standalone PNG when:

- asset is static
- no atlas benefit.

## Image Generation

Use Image Generation for:

- character concepts
- crop stages
- tiles
- buildings
- items
- effects.

Codex should integrate generated files but should not fabricate image contents.
