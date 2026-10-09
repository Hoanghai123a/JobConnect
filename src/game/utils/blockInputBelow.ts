/**
 * Chặn click/chạm trong 1 vùng UI không lọt xuống scene phía dưới (FarmScene).
 * Cần vì game tắt globalTopOnly. Zone đặt depth thấp nhất nên các nút trong vùng
 * vẫn nhận click bình thường; stopPropagation chặn mọi scene bên dưới.
 */

import Phaser from "phaser";

export function blockInputBelow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
): Phaser.GameObjects.Zone {
  const zone = scene.add.zone(x, y, width, height).setOrigin(0, 0).setDepth(-1).setInteractive();

  // Scene-level: bắt cả click trúng nút (nút nằm trên zone nên zone không nhận event)
  const stop = (_pointer: Phaser.Input.Pointer, hits: Phaser.GameObjects.GameObject[]) => {
    if (hits.length > 0) scene.input.stopPropagation();
  };
  scene.input.on(Phaser.Input.Events.POINTER_DOWN, stop);
  scene.input.on(Phaser.Input.Events.POINTER_UP, stop);

  return zone;
}
