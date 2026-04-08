import { PORT_COLOR, inputKeys, outputKeys, GRID_SIZE, REMOVE_ICON_R, SNAP_INDICATOR_R, PORT_R } from './config.js';
import { drawBezier, bezierPoint } from './bezier.js';

const GLOW_DURATION          = 300;   // ms the port glow lasts after a packet arrives
const CRITICAL_PATH_DURATION = 2000;  // ms the critical-path highlight fades over

export class Renderer {
  #ctx;
  #cssW = 0;
  #cssH = 0;
  // `${connId}:${packetIndex}` → last arrival timestamp
  #lastArrival = new Map();
  // `${elemId}:${portIndex}` → { color, time } of most recent hit
  #portGlow    = new Map();
  // Critical-path highlight: { elemIds: Set, connIds: Set, startTime: number } | null
  #criticalHighlight = null;
  // Reject animations: [{ from, to, startTime }]
  #rejectAnims = [];

  constructor(canvas) {
    this.#ctx = canvas.getContext('2d');
  }

  showCriticalPath(elemIds, connIds, demandId, now) {
    this.#criticalHighlight = { elemIds, connIds, demandId, startTime: now };
  }

  startRejectAnim(from, to, now) {
    this.#rejectAnims.push({ from, to, startTime: now });
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

    const cam = game.camera;
    const { state, selectedEl, ghostElem, mx, my, ghostMx, ghostMy, hoveredLatencyEl } = game.input.getRenderState();
    const result = game.connMgr.computeActivePct(game.elements);

    this.#drawGrid(W, H, cam);

    // ── World-space drawing (camera-transformed) ───────────────────────────
    const ctx = this.#ctx;
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.zoom, cam.zoom);

    this.#drawConnections(game.connMgr.connections, result, game.elemMap, now);
    this.#drawRejectAnims(now);
    this.#drawWireInProgress(state);
    this.#drawElements(game.elements, game.connMgr.connections, result, now, hoveredLatencyEl);
    this.#drawSnapIndicator(state, now);
    this.#drawGhost(ghostElem, ghostMx, ghostMy);

    ctx.restore();
    // ── Screen-space overlays (not affected by camera) ─────────────────────

    this.#drawSelectionOutline(selectedEl, cam, now);

    if (game.connMgr.selectedConn) {
      const m  = game.connMgr.mid(game.connMgr.selectedConn);
      const ms = cam.toScreen(m.x, m.y);
      this.#drawRemoveIcon(ms.x, ms.y);
    }
    if (selectedEl && !selectedEl.def.preset) {
      const rs = cam.toScreen(selectedEl.x + selectedEl.w, selectedEl.y);
      this.#drawRemoveIcon(rs.x, rs.y);
    }
  }

  #drawGrid(W, H, cam) {
    const ctx  = this.#ctx;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    const step   = GRID_SIZE * cam.zoom;
    // offset so dots stay aligned with the world grid as camera pans/zooms
    const offsetX = ((cam.x % step) + step) % step;
    const offsetY = ((cam.y % step) + step) % step;

    ctx.fillStyle = '#1c2128';
    for (let gx = offsetX; gx < W; gx += step) {
      for (let gy = offsetY; gy < H; gy += step) {
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

      // Critical-path highlight overlay
      const cpAlpha = this.#criticalAlpha(c.id, 'conn', now);
      if (cpAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = cpAlpha;
        ctx.shadowColor = '#79c0ff';
        ctx.shadowBlur  = 18;
        drawBezier(ctx, from.x, from.y, to.x, to.y, '#79c0ff', 3.5, false);
        ctx.restore();
      }

      if (connRatio > 0) {
        this.#drawPackets(ctx, from, to, color, now, connRatio, c.id, c.toId, c.toPort);
        if (wirePct === 100) {
          this.#drawWireShimmer(ctx, from, to, color, now, c.id);
        }
      } else {
        // Dead wire: draw reverse-flowing dashes
        this.#drawDeadWire(ctx, from, to, color, now);
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

      // Comet trail: 5 fading dots behind the packet
      const TRAIL = 5;
      for (let k = 1; k <= TRAIL; k++) {
        const tTrail = (t - k * 0.018 + 1) % 1;
        const trailPos = bezierPoint(from.x, from.y, to.x, to.y, tTrail);
        const trailAlpha = (1 - k / TRAIL) * 0.35;
        const trailR = 2.5 * (1 - k / TRAIL);
        ctx.beginPath();
        ctx.arc(trailPos.x, trailPos.y, trailR, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = trailAlpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

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

  // Heartbeat shimmer: a bright orb that sweeps once along a fully-loaded wire
  #drawWireShimmer(ctx, from, to, color, now, connId) {
    const PERIOD = 3000; // ms between heartbeats
    // Stagger each connection slightly so they don't all pulse together
    const offset = (connId * 1117) % PERIOD;
    const phase  = ((now + offset) % PERIOD) / PERIOD; // 0→1

    // Only visible during the first 30% of the period (the actual sweep)
    if (phase > 0.3) return;
    const sweep = phase / 0.3; // 0→1 within the sweep window

    // Bell-shaped brightness: peaks at middle of sweep
    const bell  = Math.sin(sweep * Math.PI);
    const pos   = bezierPoint(from.x, from.y, to.x, to.y, sweep);

    ctx.save();
    ctx.globalAlpha = bell * 0.6;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur  = 20;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 5 + bell * 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  // Dead wire: dashes flow backward (to→from) to signal "no data"
  #drawDeadWire(ctx, from, to, color, now) {
    const SPEED  = 1800; // ms per full traversal (slow, ominous)
    const phase  = (now % SPEED) / SPEED; // 0→1

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#f85149'; // red
    ctx.lineWidth   = 2;
    ctx.setLineDash([6, 10]);
    // Animate dash offset flowing backward (from destination toward source)
    ctx.lineDashOffset = phase * 16;
    // Draw the bezier manually to apply dash
    const cp = Math.max(Math.abs(to.x - from.x) * 0.5, 60);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.bezierCurveTo(from.x + cp, from.y, to.x - cp, to.y, to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
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

  #drawRejectAnims(now) {
    const DURATION = 700;   // ms total
    const BLINKS   = 3;     // full red flashes
    const ctx      = this.#ctx;

    this.#rejectAnims = this.#rejectAnims.filter(({ from, to, startTime }) => {
      const age = now - startTime;
      if (age >= DURATION) return false;

      // progress 0→1, blink using sine so it starts and ends at 0
      const t     = age / DURATION;
      const alpha = Math.abs(Math.sin(t * Math.PI * BLINKS)) * (1 - t);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur  = 18;
      drawBezier(ctx, from.x, from.y, to.x, to.y, '#ff4444', 3, false);
      ctx.restore();

      return true;
    });
  }

  #drawElements(elements, connections, result, now, hoveredLatencyEl = null) {
    const connMap = new Map(); // elemId → Set<portIndex>
    for (const c of connections) {
      if (!connMap.has(c.toId)) connMap.set(c.toId, new Set());
      connMap.get(c.toId).add(c.toPort);
    }
    for (const el of elements) {
      this.#drawCriticalPathBorder(el, now);
      el.draw(this.#ctx, connMap.get(el.id) || new Set(), result.activePct.get(el) ?? 0, result, el === hoveredLatencyEl, now);
      this.#drawPortGlows(el, now);
      this.#drawStarvedPorts(el, result, now);
    }
  }

  #drawPortGlows(el, now) {
    const ctx = this.#ctx;
    const inKeys = inputKeys(el.def);
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

  // Slow expanding pulse ring on input ports that have unmet demand
  #drawStarvedPorts(el, result, now) {
    const ctx    = this.#ctx;
    const inKeys = inputKeys(el.def);
    const PULSE  = 1600; // ms per pulse cycle

    for (let i = 0; i < inKeys.length; i++) {
      const portKey = inKeys[i];
      const spec    = el.def.inputs[portKey];
      if (!spec?.demand) continue;
      const recv = result.received.get(`${el.id}:${i}`) ?? 0;
      if (recv >= spec.demand) continue; // demand fully met — no pulse

      const pos     = el.inputPos(i);
      const phase   = (now % PULSE) / PULSE; // 0→1
      const expand  = phase < 0.6 ? phase / 0.6 : 1; // expand in first 60%
      const alpha   = phase < 0.6 ? (1 - expand) * 0.55 : 0; // fade as it expands
      const r       = PORT_R + 2 + expand * 12;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#f85149';
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = '#f85149';
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  #drawSnapIndicator(state, now) {
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
    } else {
      // Valid snap: rotating arc orbits the port
      const angle = (now / 400) % (Math.PI * 2);
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.shadowColor = portColor;
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.arc(tx, ty, SNAP_INDICATOR_R + 5, angle, angle + Math.PI * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tx, ty, SNAP_INDICATOR_R + 5, angle + Math.PI, angle + Math.PI * 1.7);
      ctx.stroke();
    }
    ctx.restore();
  }

  #drawSelectionOutline(selectedEl, cam, now) {
    if (!selectedEl) return;
    const ctx = this.#ctx;
    const el  = selectedEl;
    // Convert world corners to screen space
    const tl = cam.toScreen(el.x - 4,         el.y - 4);
    const br = cam.toScreen(el.x + el.w + 4,  el.y + el.h + 4);
    const w  = br.x - tl.x;
    const h  = br.y - tl.y;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    // Marching ants: offset advances over time
    ctx.lineDashOffset = -(now / 40) % 10;
    ctx.beginPath();
    ctx.roundRect(tl.x, tl.y, w, h, 10);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
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

  // Returns 0–1 fade alpha for a critical-path item; clears highlight when fully faded.
  #criticalAlpha(id, kind, now) {
    if (!this.#criticalHighlight) return 0;
    const { elemIds, connIds, demandId, startTime } = this.#criticalHighlight;
    const inPath = kind === 'elem' ? (elemIds.has(id) && id !== demandId) : connIds.has(id);
    if (!inPath) return 0;
    const age = now - startTime;
    if (age >= CRITICAL_PATH_DURATION) {
      this.#criticalHighlight = null;
      return 0;
    }
    return 1 - age / CRITICAL_PATH_DURATION;
  }

  #drawCriticalPathBorder(el, now) {
    const alpha = this.#criticalAlpha(el.id, 'elem', now);
    if (alpha <= 0) return;
    const ctx = this.#ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#79c0ff';
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = '#79c0ff';
    ctx.shadowBlur  = 16;
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, el.w, el.h, 8);
    ctx.stroke();
    ctx.restore();
  }
}
