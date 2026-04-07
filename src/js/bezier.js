function bezierCp(x1, x2) {
  return Math.max(Math.abs(x2 - x1) * 0.5, 60);
}

export function bezierPoint(x1, y1, x2, y2, t) {
  const cp  = bezierCp(x1, x2);
  const cx1 = x1 + cp, cy1 = y1;
  const cx2 = x2 - cp, cy2 = y2;
  const mt  = 1 - t;
  return {
    x: mt**3*x1 + 3*mt**2*t*cx1 + 3*mt*t**2*cx2 + t**3*x2,
    y: mt**3*y1 + 3*mt**2*t*cy1 + 3*mt*t**2*cy2 + t**3*y2,
  };
}

export function drawBezier(ctx, x1, y1, x2, y2, color, lineWidth, dashed) {
  const cp = bezierCp(x1, x2);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1 + cp, y1, x2 - cp, y2, x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth   = lineWidth;
  ctx.setLineDash(dashed ? [6, 4] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}
