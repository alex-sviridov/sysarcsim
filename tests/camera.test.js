/**
 * Tests for the Camera class in src/js/camera.js
 */

import { ZOOM_MIN, ZOOM_MAX } from '../src/js/config.js';

const { Camera } = await import('../src/js/camera.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal element stub with position and size. */
function el(x, y, w = 200, h = 58) {
  return { x, y, w, h };
}

// ── Constructor / initial state ───────────────────────────────────────────────

describe('Camera initial state', () => {
  test('x, y start at 0', () => {
    const cam = new Camera();
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
  });

  test('zoom starts at 1', () => {
    const cam = new Camera();
    expect(cam.zoom).toBe(1);
  });
});

// ── toWorld ───────────────────────────────────────────────────────────────────

describe('Camera.toWorld()', () => {
  test('identity camera: toWorld(sx, sy) === {x: sx, y: sy}', () => {
    const cam = new Camera();
    expect(cam.toWorld(100, 200)).toEqual({ x: 100, y: 200 });
  });

  test('pan only: toWorld subtracts pan offset', () => {
    const cam = new Camera();
    cam.x = 50; cam.y = 30;
    expect(cam.toWorld(150, 130)).toEqual({ x: 100, y: 100 });
  });

  test('zoom=2 only: toWorld divides by zoom', () => {
    const cam = new Camera();
    cam.zoom = 2;
    expect(cam.toWorld(200, 100)).toEqual({ x: 100, y: 50 });
  });

  test('pan + zoom together', () => {
    const cam = new Camera();
    cam.x = 100; cam.y = 50; cam.zoom = 2;
    // world = (screen - pan) / zoom
    expect(cam.toWorld(300, 150)).toEqual({ x: 100, y: 50 });
  });
});

// ── toScreen ──────────────────────────────────────────────────────────────────

describe('Camera.toScreen()', () => {
  test('identity camera: toScreen(wx, wy) === {x: wx, y: wy}', () => {
    const cam = new Camera();
    expect(cam.toScreen(100, 200)).toEqual({ x: 100, y: 200 });
  });

  test('pan only: toScreen adds pan offset', () => {
    const cam = new Camera();
    cam.x = 50; cam.y = 30;
    expect(cam.toScreen(100, 100)).toEqual({ x: 150, y: 130 });
  });

  test('zoom=2 only: toScreen multiplies by zoom', () => {
    const cam = new Camera();
    cam.zoom = 2;
    expect(cam.toScreen(100, 50)).toEqual({ x: 200, y: 100 });
  });

  test('pan + zoom together', () => {
    const cam = new Camera();
    cam.x = 100; cam.y = 50; cam.zoom = 2;
    expect(cam.toScreen(100, 50)).toEqual({ x: 300, y: 150 });
  });

  test('toScreen is the inverse of toWorld', () => {
    const cam = new Camera();
    cam.x = 80; cam.y = -30; cam.zoom = 1.5;
    const wx = 123, wy = 456;
    const s = cam.toScreen(wx, wy);
    const back = cam.toWorld(s.x, s.y);
    expect(back.x).toBeCloseTo(wx);
    expect(back.y).toBeCloseTo(wy);
  });
});

// ── zoomAt ────────────────────────────────────────────────────────────────────

describe('Camera.zoomAt()', () => {
  test('zoom increases when factor > 1', () => {
    const cam = new Camera();
    cam.zoomAt(0, 0, 2);
    expect(cam.zoom).toBeCloseTo(Math.min(ZOOM_MAX, 1 * 2));
  });

  test('zoom decreases when factor < 1', () => {
    const cam = new Camera();
    cam.zoom = ZOOM_MAX;
    cam.zoomAt(0, 0, 0.5);
    expect(cam.zoom).toBeCloseTo(Math.max(ZOOM_MIN, ZOOM_MAX * 0.5));
  });

  test('zoom is clamped at ZOOM_MIN', () => {
    const cam = new Camera();
    cam.zoom = ZOOM_MIN;
    cam.zoomAt(400, 300, 0.1);
    expect(cam.zoom).toBe(ZOOM_MIN);
  });

  test('zoom is clamped at ZOOM_MAX', () => {
    const cam = new Camera();
    cam.zoom = ZOOM_MAX;
    cam.zoomAt(400, 300, 10);
    expect(cam.zoom).toBe(ZOOM_MAX);
  });

  test('world point under anchor stays fixed after zoom', () => {
    const cam = new Camera();
    const sx = 400, sy = 300;
    const worldBefore = cam.toWorld(sx, sy);
    cam.zoomAt(sx, sy, 2);
    const worldAfter = cam.toWorld(sx, sy);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
  });

  test('world point under anchor stays fixed after zoom-out', () => {
    const cam = new Camera();
    cam.zoom = ZOOM_MAX; cam.x = -200; cam.y = -100;
    const sx = 300, sy = 200;
    const worldBefore = cam.toWorld(sx, sy);
    cam.zoomAt(sx, sy, 0.5);
    const worldAfter = cam.toWorld(sx, sy);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
  });

  test('zoom at (0,0): pan offset is scaled proportionally', () => {
    const cam = new Camera();
    cam.zoom = 1; cam.x = 100; cam.y = 50;
    cam.zoomAt(0, 0, 2);
    const expectedZoom = Math.min(ZOOM_MAX, 1 * 2);
    expect(cam.zoom).toBeCloseTo(expectedZoom);
    expect(cam.x).toBeCloseTo(100 * expectedZoom);
    expect(cam.y).toBeCloseTo(50 * expectedZoom);
  });
});

// ── centerOn ─────────────────────────────────────────────────────────────────

describe('Camera.centerOn()', () => {
  test('does nothing when elements array is empty', () => {
    const cam = new Camera();
    cam.x = 99; cam.y = 77;
    cam.centerOn([], 800, 600);
    expect(cam.x).toBe(99);
    expect(cam.y).toBe(77);
  });

  test('centers a single element in the viewport', () => {
    const cam = new Camera();
    const elem = el(0, 0, 200, 58); // center at (100, 29)
    cam.centerOn([elem], 800, 600);
    // cam.x = viewW/2 - midX*zoom = 400 - 100 = 300
    // cam.y = viewH/2 - midY*zoom = 300 - 29 = 271
    expect(cam.x).toBeCloseTo(300);
    expect(cam.y).toBeCloseTo(271);
  });

  test('centers multiple elements: midpoint of bounding box is viewport center', () => {
    const cam = new Camera();
    const elements = [el(0, 0, 100, 50), el(300, 200, 100, 50)];
    // bbox: (0,0)→(400,250), mid=(200,125)
    cam.centerOn(elements, 800, 600);
    // After centering, toScreen(200, 125) should equal (400, 300) = viewport center
    const s = cam.toScreen(200, 125);
    expect(s.x).toBeCloseTo(400);
    expect(s.y).toBeCloseTo(300);
  });

  test('respects current zoom level when centering', () => {
    const cam = new Camera();
    cam.zoom = 2;
    const elem = el(0, 0, 200, 100); // mid = (100, 50)
    cam.centerOn([elem], 800, 600);
    // cam.x = 400 - 100*2 = 200, cam.y = 300 - 50*2 = 200
    expect(cam.x).toBeCloseTo(200);
    expect(cam.y).toBeCloseTo(200);
    // world center should map to screen center
    const s = cam.toScreen(100, 50);
    expect(s.x).toBeCloseTo(400);
    expect(s.y).toBeCloseTo(300);
  });
});

// ── clamp ─────────────────────────────────────────────────────────────────────

describe('Camera.clamp()', () => {
  const MARGIN = 50;

  test('does nothing when elements array is empty', () => {
    const cam = new Camera();
    cam.x = -99999; cam.y = -99999;
    cam.clamp([], 800, 600);
    expect(cam.x).toBe(-99999);
    expect(cam.y).toBe(-99999);
  });

  test('no adjustment needed when elements are in view', () => {
    const cam = new Camera();
    const elem = el(100, 100, 200, 58);
    const xBefore = cam.x, yBefore = cam.y;
    cam.clamp([elem], 800, 600);
    expect(cam.x).toBe(xBefore);
    expect(cam.y).toBe(yBefore);
  });

  test('clamps pan when element is scrolled fully off the right edge', () => {
    const cam = new Camera();
    // Move element far to the left in screen space (off left side)
    cam.x = -10000;
    const elem = el(0, 0, 200, 58);
    cam.clamp([elem], 800, 600);
    // After clamp: rightmost screen coord of elem must be >= MARGIN
    const sMaxX = (elem.x + elem.w) * cam.zoom + cam.x;
    expect(sMaxX).toBeGreaterThanOrEqual(MARGIN);
  });

  test('clamps pan when element is scrolled fully off the left edge', () => {
    const cam = new Camera();
    cam.x = 10000;
    const elem = el(0, 0, 200, 58);
    cam.clamp([elem], 800, 600);
    const sMinX = elem.x * cam.zoom + cam.x;
    expect(sMinX).toBeLessThanOrEqual(800 - MARGIN);
  });

  test('clamps pan when element is scrolled fully off the bottom edge', () => {
    const cam = new Camera();
    cam.y = -10000;
    const elem = el(0, 0, 200, 58);
    cam.clamp([elem], 800, 600);
    const sMaxY = (elem.y + elem.h) * cam.zoom + cam.y;
    expect(sMaxY).toBeGreaterThanOrEqual(MARGIN);
  });

  test('clamps pan when element is scrolled fully off the top edge', () => {
    const cam = new Camera();
    cam.y = 10000;
    const elem = el(0, 0, 200, 58);
    cam.clamp([elem], 800, 600);
    const sMinY = elem.y * cam.zoom + cam.y;
    expect(sMinY).toBeLessThanOrEqual(600 - MARGIN);
  });

  test('handles multiple elements: uses their combined bounding box', () => {
    const cam = new Camera();
    cam.x = -10000;
    const elems = [el(0, 0, 100, 50), el(500, 300, 100, 50)];
    cam.clamp(elems, 800, 600);
    // right edge of combined bbox (x=600) must be >= MARGIN in screen space
    const sMaxX = 600 * cam.zoom + cam.x;
    expect(sMaxX).toBeGreaterThanOrEqual(MARGIN);
  });
});
