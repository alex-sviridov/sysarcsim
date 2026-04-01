export function bezierPoint(x1, y1, x2, y2, t) {
  const cp = Math.max(Math.abs(x2 - x1) * 0.5, 60);
  const cx1 = x1 + cp, cx2 = x2 - cp;
  const mt = 1 - t;
  return {
    x: mt*mt*mt*x1 + 3*mt*mt*t*cx1 + 3*mt*t*t*cx2 + t*t*t*x2,
    y: mt*mt*mt*y1 + 3*mt*mt*t*y1  + 3*mt*t*t*y2  + t*t*t*y2,
  };
}

export function drawBezier(ctx, x1, y1, x2, y2, color, lineWidth, dashed) {
  const cp = Math.max(Math.abs(x2 - x1) * 0.5, 60);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1 + cp, y1, x2 - cp, y2, x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth   = lineWidth;
  ctx.setLineDash(dashed ? [6, 4] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}
