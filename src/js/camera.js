import { ZOOM_MIN, ZOOM_MAX } from './config.js';

export class Camera {
  x    = 0;
  y    = 0;
  zoom = 1;

  /** Convert screen-space point → world-space point. */
  toWorld(sx, sy) {
    return { x: (sx - this.x) / this.zoom, y: (sy - this.y) / this.zoom };
  }

  /** Convert world-space point → screen-space point. */
  toScreen(wx, wy) {
    return { x: wx * this.zoom + this.x, y: wy * this.zoom + this.y };
  }

  /**
   * Zoom by `factor` keeping the screen-space point (sx, sy) fixed in world space.
   */
  zoomAt(sx, sy, factor) {
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom * factor));
    this.x    = sx - (sx - this.x) * (newZoom / this.zoom);
    this.y    = sy - (sy - this.y) * (newZoom / this.zoom);
    this.zoom = newZoom;
  }

  /**
   * Center the bounding box of all elements in the viewport at the current zoom.
   */
  centerOn(elements, viewW, viewH) {
    if (!elements.length) return;
    const { minX, minY, maxX, maxY } = this.#bbox(elements);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    this.x = viewW / 2 - midX * this.zoom;
    this.y = viewH / 2 - midY * this.zoom;
  }

  /**
   * Clamp pan so that the elements bounding box is never entirely off-screen.
   * At least `MARGIN` px of the bounding box must remain within the viewport.
   */
  clamp(elements, viewW, viewH) {
    if (!elements.length) return;
    const MARGIN = 50;
    const { minX, minY, maxX, maxY } = this.#bbox(elements);
    const sMinX = minX * this.zoom + this.x;
    const sMaxX = maxX * this.zoom + this.x;
    const sMinY = minY * this.zoom + this.y;
    const sMaxY = maxY * this.zoom + this.y;

    if (sMaxX < MARGIN)          this.x += MARGIN - sMaxX;
    if (sMinX > viewW - MARGIN)  this.x -= sMinX - (viewW - MARGIN);
    if (sMaxY < MARGIN)          this.y += MARGIN - sMaxY;
    if (sMinY > viewH - MARGIN)  this.y -= sMinY - (viewH - MARGIN);
  }

  #bbox(elements) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
      if (el.x + el.w > maxX) maxX = el.x + el.w;
      if (el.y + el.h > maxY) maxY = el.y + el.h;
    }
    return { minX, minY, maxX, maxY };
  }
}
