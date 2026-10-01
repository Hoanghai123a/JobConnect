/**
 * Isometric grid utilities
 * Converts 2D grid coordinates to isometric (diamond) screen coordinates
 */

import { GAME_CONFIG } from "../config/game";

/**
 * Convert 2D grid position (x, y) to isometric screen position
 * @param gridX - Column in grid (0-indexed)
 * @param gridY - Row in grid (0-indexed)
 * @returns Screen coordinates {x, y}
 */
export function gridToIsometric(gridX: number, gridY: number): { x: number; y: number } {
  const { tileWidth, tileHeight, spacing } = GAME_CONFIG.farm.isometric;

  // Isometric projection formula with spacing
  const effectiveTileWidth = tileWidth + spacing;
  const effectiveTileHeight = tileHeight + spacing;

  const screenX = (gridX - gridY) * (effectiveTileWidth / 2);
  const screenY = (gridX + gridY) * (effectiveTileHeight / 2);

  return { x: screenX, y: screenY };
}

/**
 * Convert screen position to grid coordinates (for click detection)
 * @param screenX - Screen X coordinate
 * @param screenY - Screen Y coordinate
 * @returns Grid coordinates {x, y}
 */
export function isometricToGrid(screenX: number, screenY: number): { x: number; y: number } {
  const { tileWidth, tileHeight } = GAME_CONFIG.farm.isometric;

  // Inverse isometric projection
  const gridX = (screenX / (tileWidth / 2) + screenY / (tileHeight / 2)) / 2;
  const gridY = (screenY / (tileHeight / 2) - screenX / (tileWidth / 2)) / 2;

  return { x: Math.floor(gridX), y: Math.floor(gridY) };
}

/**
 * Get centered origin for isometric grid
 * Centers the grid on the screen accounting for isometric projection
 */
export function getIsometricOrigin(): { x: number; y: number } {
  const { plotsX, plotsY, isometric } = GAME_CONFIG.farm;
  const { tileWidth, tileHeight, spacing } = isometric;

  const effectiveTileWidth = tileWidth + spacing;
  const effectiveTileHeight = tileHeight + spacing;

  // For a 4×3 grid in isometric:
  // Total width spans from leftmost to rightmost point
  // Total height spans from top to bottom
  const totalGridWidth = (plotsX + plotsY - 1) * (effectiveTileWidth / 2);
  const totalGridHeight = (plotsX + plotsY - 1) * (effectiveTileHeight / 2);

  // Center the grid on screen
  const centerX = GAME_CONFIG.width / 2;
  const centerY = GAME_CONFIG.height / 2;

  // Origin is the center of the grid
  // Offset by half the grid dimensions to center it
  return {
    x: centerX,
    y: centerY - totalGridHeight / 2 + 40, // +40 to account for HUD at top
  };
}
