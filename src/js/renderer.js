import { PORT_COLOR, outputKeys } from './config.js';
import { drawBezier } from './bezier.js';

export class Renderer {
  constructor(canvas) {
    this.ctx   = canvas.getContext('2d');
    this._cssW = 0;
    this._cssH = 0;
  }

  resize(w, h, dpr) {
    this._cssW = w;
    this._cssH = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(game) {
    const W = this._cssW;
    const H = this._cssH;
    if (!W || !H) return;

    const input  = game.input;
    const result = game.connMgr.computeActivePct(game.elements);

    this._drawGrid(W, H);
    this._drawConnections(game.connMgr.connections, result, game.elemMap);
    this._drawWireInProgress(input.state);
    this._drawElements(game.elements, game.connMgr.connections, result);
    this._drawSnapIndicator(input.state);
    this._drawSelectionOutline(input.selectedEl);
    this._drawGhost(input._ghostElem, input._mx, input._my);

    if (game.connMgr.selectedConn) {
      const m = game.connMgr.mid(game.connMgr.selectedConn);
      this._drawRemoveIcon(m.x, m.y);
    }
    if (input.selectedEl && !input.selectedEl.def.preset) {
      const el = input.selectedEl;
      this._drawRemoveIcon(el.x + el.w, el.y);
    }
  }

  _drawGrid(W, H) {
    const { ctx } = this;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1c2128';
    const gs = 28;
    for (let gx = gs; gx < W; gx += gs) {
      for (let gy = gs; gy < H; gy += gs) {
        ctx.fillRect(gx - 1, gy - 1, 2, 2);
      }
    }
  }

  _drawConnections(connections, result, elemMap) {
    const { ctx } = this;
    for (const c of connections) {
      const fromElem = elemMap.get(c.fromId);
      const toElem   = elemMap.get(c.toId);
      if (!fromElem || !toElem) continue;
      const from     = fromElem.outputPos(c.fromPort);
      const to       = toElem.inputPos(c.toPort);
      const portKey  = outputKeys(fromElem.def)[c.fromPort];
      const color    = PORT_COLOR[portKey] || '#888';
      const fromPct  = result.activePct.get(fromElem) ?? 0;
      const toPct    = result.activePct.get(toElem)   ?? 0;
      const wirePct  = Math.min(fromPct, toPct);

      ctx.save();
      ctx.globalAlpha = 0.3 + (wirePct / 100) * 0.7;
      ctx.shadowColor = color;
      ctx.shadowBlur  = wirePct === 100 ? 8 : 0;
      drawBezier(ctx, from.x, from.y, to.x, to.y, color, 2.5, false);
      ctx.restore();
    }
  }

  _drawWireInProgress(state) {
    if (state?.mode !== 'wire') return;
    const { ctx } = this;
    const { fromElem, fromPort, mx, my, snap } = state;
    const from      = fromElem.outputPos(fromPort);
    const portKey   = outputKeys(fromElem.def)[fromPort];
    const portColor = PORT_COLOR[portKey] || '#888';

    let tx = mx, ty = my, wireColor;
    if (snap) {
      ({ x: tx, y: ty } = snap.snapElem.inputPos(snap.snapPort));
      wireColor = (snap.snapValid ? portColor : '#ff4444') + 'cc';
    } else {
      wireColor = portColor + 'aa';
    }
    drawBezier(ctx, from.x, from.y, tx, ty, wireColor, 2, true);
  }

  _drawElements(elements, connections, result) {
    const connMap = new Map(); // elemId → Set<portIndex>
    for (const c of connections) {
      if (!connMap.has(c.toId)) connMap.set(c.toId, new Set());
      connMap.get(c.toId).add(c.toPort);
    }
    for (const el of elements) {
      el.draw(this.ctx, connMap.get(el.id) || new Set(), result.activePct.get(el) ?? 0, result);
    }
  }

  _drawSnapIndicator(state) {
    if (state?.mode !== 'wire' || !state.snap) return;
    const { ctx } = this;
    const { snap, fromElem, fromPort } = state;
    const portKey   = outputKeys(fromElem.def)[fromPort];
    const portColor = PORT_COLOR[portKey] || '#888';
    const snapColor = snap.snapValid ? portColor : '#ff4444';
    const { x: tx, y: ty } = snap.snapElem.inputPos(snap.snapPort);

    ctx.save();
    ctx.strokeStyle = snapColor;
    ctx.lineWidth   = 2.5;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(tx, ty, 11, 0, Math.PI * 2);
    ctx.stroke();

    if (!snap.snapValid) {
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(tx - r, ty - r); ctx.lineTo(tx + r, ty + r);
      ctx.moveTo(tx + r, ty - r); ctx.lineTo(tx - r, ty + r);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawSelectionOutline(selectedEl) {
    if (!selectedEl) return;
    const { ctx } = this;
    const el = selectedEl;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.roundRect(el.x - 4, el.y - 4, el.w + 8, el.h + 8, 10);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawGhost(ghostElem, mx, my) {
    if (!ghostElem) return;
    ghostElem.x = mx - ghostElem.w / 2;
    ghostElem.y = my - ghostElem.h / 2;
    ghostElem.draw(this.ctx, new Set(), 50, null);
  }

  _drawRemoveIcon(cx, cy) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#da3633';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.moveTo(cx + 4, cy - 4);
    ctx.lineTo(cx - 4, cy + 4);
    ctx.stroke();
  }
}
