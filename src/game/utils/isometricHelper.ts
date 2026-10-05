/**
 * Isometric Helper - Phase 1
 * Chuyển đổi tọa độ grid 2D sang tọa độ isometric (kim cương)
 */

import { GAME_CONFIG } from "../config/game";

/**
 * Chuyển đổi tọa độ grid (x, y) sang tọa độ màn hình isometric
 * @param gridX - Cột trong grid (0-indexed)
 * @param gridY - Hàng trong grid (0-indexed)
 * @returns Tọa độ màn hình {x, y}
 */
export function gridToIsometric(gridX: number, gridY: number): { x: number; y: number } {
  const { tileWidth, tileHeight } = GAME_CONFIG.grid;

  // Công thức isometric projection
  const screenX = (gridX - gridY) * (tileWidth / 2);
  const screenY = (gridX + gridY) * (tileHeight / 2);

  return { x: screenX, y: screenY };
}

/**
 * Lấy origin point để center grid trên canvas
 */
export function getIsometricOrigin(): { x: number; y: number } {
  const { cols, rows, tileWidth, tileHeight } = GAME_CONFIG.grid;

  // Tính tổng kích thước grid
  const totalGridWidth = (cols + rows - 1) * (tileWidth / 2);
  const totalGridHeight = (cols + rows - 1) * (tileHeight / 2);

  // Center trên canvas
  const centerX = GAME_CONFIG.width / 2;
  const centerY = GAME_CONFIG.height / 2;

  return {
    x: centerX,
    y: centerY - totalGridHeight / 3, // Offset để grid hiển thị centered
  };
}
