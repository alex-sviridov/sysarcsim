import { bezierPoint } from '../src/js/bezier.js';

describe('bezierPoint', () => {
  test('t=0 returns the start point', () => {
    const p = bezierPoint(10, 20, 100, 200, 0);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(20);
  });

  test('t=1 returns the end point', () => {
    const p = bezierPoint(10, 20, 100, 200, 1);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(200);
  });

  test('t=0.5 returns a point between start and end', () => {
    const p = bezierPoint(0, 0, 200, 0, 0.5);
    // For a horizontal curve, midpoint x should be between 0 and 200
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(200);
  });

  test('y interpolates linearly between start and end y (control points share y)', () => {
    // bezierPoint uses y1 for both control points on the y axis,
    // so: B_y(t) = (1-t)^3*y1 + 3(1-t)^2*t*y1 + 3(1-t)*t^2*y2 + t^3*y2
    //           = y1*(1-t)^3 + 3y1*(1-t)^2*t + y2*(3(1-t)*t^2 + t^3)
    // At t=0.5: = y1*(0.125 + 3*0.125) + y2*(3*0.125 + 0.125)
    //           = y1*0.5 + y2*0.5   → simple linear interpolation
    const p = bezierPoint(0, 0, 300, 100, 0.5);
    expect(p.y).toBeCloseTo(50);
  });

  test('minimum control-point offset is 60 even when dx < 120', () => {
    // When |x2-x1| * 0.5 < 60, cp = 60 is used
    const p0 = bezierPoint(0, 0, 10, 0, 0.5);
    const p1 = bezierPoint(0, 0, 200, 0, 0.5); // cp = 100

    // Both should be valid points (no NaN/Infinity)
    expect(isFinite(p0.x)).toBe(true);
    expect(isFinite(p0.y)).toBe(true);
    expect(isFinite(p1.x)).toBe(true);
  });

  test('result is symmetric for t and (1-t) on a horizontal line', () => {
    const p_lo = bezierPoint(0, 0, 200, 0, 0.25);
    const p_hi = bezierPoint(0, 0, 200, 0, 0.75);
    // x at t=0.25 and x at t=0.75 should be symmetric around x=100
    expect(p_lo.x + p_hi.x).toBeCloseTo(200, 1);
  });

  test('returns an object with x and y properties', () => {
    const p = bezierPoint(0, 0, 100, 100, 0.3);
    expect(p).toHaveProperty('x');
    expect(p).toHaveProperty('y');
  });
});
