import { PORT_COLOR, outputKeys, GRID_SIZE, REMOVE_ICON_R, SNAP_INDICATOR_R, PORT_R } from './config.js';
import { drawBezier, bezierPoint } from './bezier.js';

const GLOW_DURATION = 300; // ms the port glow lasts after a packet arrives

export class Renderer {
  #ctx;
  #cssW = 0;
  #cssH = 0;
  // `${connId}:${packetIndex}` → last arrival timestamp
  #lastArrival = new Map();
  // `${elemId}:${portIndex}` → { color, time } of most recent hit
  #portGlow    = new Map();

  constructor(canvas) {
    this.#ctx = canvas.getContext('2d');
  }

  resize(w, h, dpr) {
    this.#cssW = w;
    this.#cssH = h;
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(game, now = 0) {
    const W = this.#cssW;
    const H = this.#cssH;
    if (!W || !H) return;

    const { state, selectedEl, ghostElem, mx, my } = game.input.getRenderState();
    const result = game.connMgr.computeActivePct(game.elements);

    this.#drawGrid(W, H);
    this.#drawConnections(game.connMgr.connections, result, game.elemMap, now);
    this.#drawWireInProgress(state);
    this.#drawElements(game.elements, game.connMgr.connections, result, now);
    this.#drawSnapIndicator(state);
    this.#drawSelectionOutline(selectedEl);
    this.#drawGhost(ghostElem, mx, my);

    if (game.connMgr.selectedConn) {
      const m = game.connMgr.mid(game.connMgr.selectedConn);
      this.#drawRemoveIcon(m.x, m.y);
    }
    if (selectedEl && !selectedEl.def.preset) {
      this.#drawRemoveIcon(selectedEl.x + selectedEl.w, selectedEl.y);
    }
  }

  #drawGrid(W, H) {
    const ctx = this.#ctx;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1c2128';
    for (let gx = GRID_SIZE; gx < W; gx += GRID_SIZE) {
      for (let gy = GRID_SIZE; gy < H; gy += GRID_SIZE) {
        ctx.fillRect(gx - 1, gy - 1, 2, 2);
      }
    }
  }

  #drawConnections(connections, result, elemMap, now) {
    const ctx = this.#ctx;
    for (const c of connections) {
      const fromElem = elemMap.get(c.fromId);
      const toElem   = elemMap.get(c.toId);
      if (!fromElem || !toElem) continue;
      const fromCenter = fromElem.outputPos(c.fromPort);
      const toCenter   = toElem.inputPos(c.toPort);
      const from       = { x: fromCenter.x + PORT_R, y: fromCenter.y };
      const to         = { x: toCenter.x  - PORT_R, y: toCenter.y  };
      const portKey  = outputKeys(fromElem.def)[c.fromPort];
      const color    = PORT_COLOR[portKey] || '#888';
      const fromPct  = result.activePct.get(fromElem) ?? 0;
      const toPct    = result.activePct.get(toElem)   ?? 0;
      const wirePct  = Math.min(fromPct, toPct);
      const connRatio = result.connRatio.get(c.id) ?? 0;

      ctx.save();
      ctx.globalAlpha = 0.3 + (wirePct / 100) * 0.7;
      ctx.shadowColor = color;
      ctx.shadowBlur  = wirePct === 100 ? 8 : 0;
      drawBezier(ctx, from.x, from.y, to.x, to.y, color, 2.5, false);
      ctx.restore();

      if (connRatio > 0) {
        this.#drawPackets(ctx, from, to, color, now, connRatio, c.id, c.toId, c.toPort);
      }
    }
  }

  // Packet speed scales with connection ratio (0–1): 600 ms at 100%, 4000 ms at near-zero
  #drawPackets(ctx, from, to, color, now, connRatio, connId, toElemId, toPort) {
    const SPEED  = 600 + (1 - connRatio) * 3400; // ms per full traversal
    const N      = 3;
    const baseT  = (now % SPEED) / SPEED;
    const portKey = `${toElemId}:${toPort}`;

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10;

    for (let i = 0; i < N; i++) {
      const t   = (baseT + i / N) % 1;
      const pos = bezierPoint(from.x, from.y, to.x, to.y, t);

      // Detect arrival: packet crosses the t=0 wrap-around point this frame
      const arrivalKey = `${connId}:${i}`;
      const prevT      = this.#lastArrival.get(arrivalKey);
      if (prevT !== undefined && prevT > t) {
        // wrapped — packet just arrived
        this.#portGlow.set(portKey, { color, time: now });
      }
      this.#lastArrival.set(arrivalKey, t);

      // Outer glow ring
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color + '55';
      ctx.fill();

      // Bright core
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();
  }

  #drawWireInProgress(state) {
    if (state?.mode !== 'wire') return;
    const ctx = this.#ctx;
    const { fromElem, fromPort, mx, my, snap } = state;
    const fromCenter = fromElem.outputPos(fromPort);
    const from       = { x: fromCenter.x + PORT_R, y: fromCenter.y };
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

  #drawElements(elements, connections, result, now) {
    const connMap = new Map(); // elemId → Set<portIndex>
    for (const c of connections) {
      if (!connMap.has(c.toId)) connMap.set(c.toId, new Set());
      connMap.get(c.toId).add(c.toPort);
    }
    for (const el of elements) {
      el.draw(this.#ctx, connMap.get(el.id) || new Set(), result.activePct.get(el) ?? 0, result);
      this.#drawPortGlows(el, now);
    }
  }

  #drawPortGlows(el, now) {
    const ctx = this.#ctx;
    const inKeys = Object.keys(el.def.inputs);
    for (let i = 0; i < inKeys.length; i++) {
      const glow = this.#portGlow.get(`${el.id}:${i}`);
      if (!glow) continue;
      const age = now - glow.time;
      if (age > GLOW_DURATION) { this.#portGlow.delete(`${el.id}:${i}`); continue; }
      const alpha = 1 - age / GLOW_DURATION;
      const pos   = el.inputPos(i);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = glow.color;
      ctx.shadowBlur  = 18;
      ctx.strokeStyle = glow.color;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  #drawSnapIndicator(state) {
    if (state?.mode !== 'wire' || !state.snap) return;
    const ctx = this.#ctx;
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
    ctx.arc(tx, ty, SNAP_INDICATOR_R, 0, Math.PI * 2);
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

  #drawSelectionOutline(selectedEl) {
    if (!selectedEl) return;
    const ctx = this.#ctx;
    const el = selectedEl;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.roundRect(el.x - 4, el.y - 4, el.w + 8, el.h + 8, 10);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  #drawGhost(ghostElem, mx, my) {
    if (!ghostElem) return;
    ghostElem.x = mx - ghostElem.w / 2;
    ghostElem.y = my - ghostElem.h / 2;
    ghostElem.draw(this.#ctx, new Set(), 50, null);
  }

  #drawRemoveIcon(cx, cy) {
    const ctx = this.#ctx;
    ctx.beginPath();
    ctx.arc(cx, cy, REMOVE_ICON_R, 0, Math.PI * 2);
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
