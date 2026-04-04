import { PORT_SNAP, REMOVE_HIT_R, inputKeys, outputKeys } from './config.js';
import { Events } from './event-bus.js';


export class InputHandler {
  // state shapes:
  //   null
  //   { mode: 'drag', elem, dx, dy }
  //   { mode: 'wire', fromElem, fromPort, mx, my, ox, oy, moved, snap }
  //   { mode: 'pan',  sx, sy, camX, camY }
  state      = null;
  selectedEl = null;

  #bus;
  #elements;   // reference to game.elements array
  #connMgr;    // reference to game.connMgr
  #cam;        // reference to game.camera (Camera instance)

  #dragStartEl      = null;
  #dragStartPos     = null;
  #dragMoved        = false;
  #hoveredLatencyEl = null;

  // Pending/ghost state owned by Sidebar; mirrored here for rendering
  #pendingType      = null;
  #ghostElem        = null;
  #sidebarDragging  = false;
  #sidebarDragMoved = false;

  #mx = 0;  // world-space mouse X (for rendering)
  #my = 0;  // world-space mouse Y (for rendering)

  constructor(canvas, bus, elements, connMgr, camera) {
    this.canvas    = canvas;
    this.#bus      = bus;
    this.#elements = elements;
    this.#connMgr  = connMgr;
    this.#cam      = camera;

    bus.on(Events.PENDING_CHANGED, ({ type, ghostElem }) => {
      this.#pendingType = type;
      this.#ghostElem   = ghostElem;
      if (!type) {
        this.#sidebarDragging  = false;
        this.#sidebarDragMoved = false;
      }
    });

    bus.on(Events.SIDEBAR_DRAG_START, () => {
      this.#sidebarDragging  = true;
      this.#sidebarDragMoved = false;
    });

    this.#bindEvents();
  }

  /** Exposes read-only render state to Renderer without leaking internals. */
  getRenderState() {
    return {
      state:            this.state,
      selectedEl:       this.selectedEl,
      ghostElem:        this.#ghostElem,
      mx:               this.#mx,
      my:               this.#my,
      hoveredLatencyEl: this.#hoveredLatencyEl,
    };
  }

  /**
   * Returns both world-space {x, y} and raw screen-space {sx, sy}.
   * World coords are used for element/port/wire hit tests.
   * Screen coords are used for remove-icon hit tests (drawn in screen space).
   */
  #xy(e) {
    const r  = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const w  = this.#cam.toWorld(sx, sy);
    return { x: w.x, y: w.y, sx, sy };
  }

  #bindEvents() {
    this.canvas.addEventListener('mousedown',   e => this.#onDown(e));
    document.addEventListener('mousemove',      e => this.#onMove(e));
    document.addEventListener('mouseup',        e => this.#onUp(e));
    this.canvas.addEventListener('contextmenu', e => { e.preventDefault(); this.#onRightClick(e); });
    this.canvas.addEventListener('wheel',       e => this.#onWheel(e), { passive: false });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.#bus.emit(Events.PENDING_CHANGED, { type: null, ghostElem: null });
        if (this.state?.mode === 'wire') this.state = null;
      }
    });
  }

  #onDown(e) {
    if (e.button !== 0) return;
    const { x, y, sx, sy } = this.#xy(e);

    // Remove icon on selected connection (screen-space hit)
    if (this.#connMgr.selectedConn) {
      const m  = this.#connMgr.mid(this.#connMgr.selectedConn);
      const ms = this.#cam.toScreen(m.x, m.y);
      if (Math.hypot(sx - ms.x, sy - ms.y) < REMOVE_HIT_R) {
        this.#bus.emit(Events.CONN_DELETE, { conn: this.#connMgr.selectedConn });
        return;
      }
    }

    // Remove icon on selected non-preset element (screen-space hit)
    if (this.selectedEl && !this.selectedEl.def.preset) {
      const rs = this.#cam.toScreen(this.selectedEl.x + this.selectedEl.w, this.selectedEl.y);
      if (Math.hypot(sx - rs.x, sy - rs.y) < REMOVE_HIT_R) {
        this.#bus.emit(Events.ELEMENT_DELETE, { el: this.selectedEl });
        this.selectedEl = null;
        return;
      }
    }

    // Second click while wire is active (click-click mode): complete or cancel
    if (this.state?.mode === 'wire') {
      const { fromElem, fromPort, snap } = this.state;
      this.#bus.emit(Events.WIRE_COMPLETE, { fromElem, fromPort, x, y, snap });
      this.state = null;
      return;
    }

    // Latency label click on demand elements
    for (let i = this.#elements.length - 1; i >= 0; i--) {
      const el = this.#elements[i];
      if (el.hitLatencyLabel(x, y)) {
        this.#bus.emit(Events.CRITICAL_PATH_CLICK, { demandEl: el });
        return;
      }
    }

    // Output ports take priority (start wire)
    for (let i = this.#elements.length - 1; i >= 0; i--) {
      const el = this.#elements[i];
      const pi = el.hitOutputPort(x, y);
      if (pi !== -1) {
        this.#bus.emit(Events.PENDING_CHANGED, { type: null, ghostElem: null });
        this.state = { mode: 'wire', fromElem: el, fromPort: pi, mx: x, my: y, ox: x, oy: y, moved: false };
        return;
      }
    }

    // Element body (drag to reposition, click to select)
    for (let i = this.#elements.length - 1; i >= 0; i--) {
      const el = this.#elements[i];
      if (el.hitBody(x, y)) {
        this.#bus.emit(Events.PENDING_CHANGED, { type: null, ghostElem: null });
        this.#elements.splice(i, 1);
        this.#elements.push(el);
        this.#dragStartEl  = el;
        this.#dragStartPos = { x, y };
        this.#dragMoved    = false;
        this.#bus.emit(Events.CONN_SELECT, { conn: null });
        this.state = { mode: 'drag', elem: el, dx: x - el.x, dy: y - el.y };
        return;
      }
    }

    // Connection wire hit
    for (let i = this.#connMgr.connections.length - 1; i >= 0; i--) {
      if (this.#connMgr.hit(x, y, this.#connMgr.connections[i])) {
        this.#bus.emit(Events.PENDING_CHANGED, { type: null, ghostElem: null });
        this.#bus.emit(Events.CONN_SELECT, { conn: this.#connMgr.connections[i] });
        this.selectedEl = null;
        return;
      }
    }

    // Empty space — place pending element or start pan
    if (this.#pendingType) {
      this.#bus.emit(Events.ELEMENT_PLACE, { x, y, type: this.#pendingType });
      if (!e.shiftKey) {
        this.#bus.emit(Events.PENDING_CHANGED, { type: null, ghostElem: null });
      }
    } else {
      this.selectedEl = null;
      this.#bus.emit(Events.CONN_SELECT, { conn: null });
      this.state = { mode: 'pan', sx, sy, camX: this.#cam.x, camY: this.#cam.y };
    }
  }

  #findSnapTarget(x, y, fromElem, fromType) {
    let best = null, bestDist = PORT_SNAP;
    for (const el of this.#elements) {
      if (el === fromElem) continue;
      const keys = inputKeys(el.def);
      for (let i = 0; i < keys.length; i++) {
        const p = el.inputPos(i);
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = { snapElem: el, snapPort: i, snapValid: keys[i] === fromType };
        }
      }
    }
    return best;
  }

  #onMove(e) {
    const r  = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const { x, y } = this.#cam.toWorld(sx, sy);

    if (this.#sidebarDragging && Math.hypot(sx - this.#cam.toScreen(this.#mx, this.#my).x,
                                             sy - this.#cam.toScreen(this.#mx, this.#my).y) > 4) {
      this.#sidebarDragMoved = true;
    }

    this.#mx = x;
    this.#my = y;
    this.#hoveredLatencyEl = this.#elements.find(el => el.hitLatencyLabel(x, y)) ?? null;

    if (this.state?.mode === 'pan') {
      this.#cam.x = this.state.camX + (sx - this.state.sx);
      this.#cam.y = this.state.camY + (sy - this.state.sy);
      this.#cam.clamp(this.#elements, r.width, r.height);
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (this.state?.mode === 'drag') {
      this.state.elem.x = x - this.state.dx;
      this.state.elem.y = y - this.state.dy;
      if (this.#dragStartPos && Math.hypot(x - this.#dragStartPos.x, y - this.#dragStartPos.y) > 4) {
        this.#dragMoved = true;
      }
    }

    if (this.state?.mode === 'wire') {
      this.state.mx = x;
      this.state.my = y;
      if (!this.state.moved && Math.hypot(x - this.state.ox, y - this.state.oy) > 4) {
        this.state.moved = true;
      }
      const fromType = outputKeys(this.state.fromElem.def)[this.state.fromPort];
      this.state.snap = this.#findSnapTarget(x, y, this.state.fromElem, fromType);
    }

    this.canvas.style.cursor = this.#cursorFor(x, y);
  }

  #cursorFor(x, y) {
    if (this.state?.mode === 'drag') return 'grabbing';
    if (this.state?.mode === 'wire') return 'crosshair';
    for (let i = this.#elements.length - 1; i >= 0; i--) {
      const el = this.#elements[i];
      if (el.hitLatencyLabel(x, y)) return 'pointer';
      if (el.hitOutputPort(x, y) !== -1 || el.hitInputPort(x, y) !== -1) return 'crosshair';
      if (el.hitBody(x, y)) return this.#pendingType ? 'not-allowed' : 'grab';
    }
    return this.#pendingType ? 'cell' : 'default';
  }

  #onUp(e) {
    if (e.button !== 0) { this.state = null; return; }
    const { x, y, sx, sy } = this.#xy(e);

    // Sidebar drag release — place if over empty canvas, else keep pending for click-click
    if (this.#sidebarDragging) {
      this.#sidebarDragging = false;
      const r        = this.canvas.getBoundingClientRect();
      const cssW     = r.width;
      const cssH     = r.height;
      const onCanvas = sx >= 0 && sx <= cssW && sy >= 0 && sy <= cssH;
      const hitsElem = this.#elements.some(el => el.hitBody(x, y));
      if (this.#pendingType && onCanvas && !hitsElem) {
        this.#bus.emit(Events.ELEMENT_PLACE, { x, y, type: this.#pendingType });
        if (!e.shiftKey) {
          this.#bus.emit(Events.PENDING_CHANGED, { type: null, ghostElem: null });
        }
      } else if (!onCanvas && this.#sidebarDragMoved) {
        this.#bus.emit(Events.PENDING_CHANGED, { type: null, ghostElem: null });
      }
      // quick click (no movement) → keep pendingType for click-click mode
      return;
    }

    if (this.state?.mode === 'pan') {
      this.state = null;
      return;
    }

    if (this.state?.mode === 'wire') {
      if (!this.state.moved) {
        // Plain click — keep wire alive for click-click completion
        return;
      }
      // Drag release — complete and clear
      const { fromElem, fromPort, snap } = this.state;
      this.#bus.emit(Events.WIRE_COMPLETE, { fromElem, fromPort, x, y, snap });
    }

    if (this.state?.mode === 'drag' && !this.#dragMoved) {
      this.selectedEl = this.#dragStartEl || null;
    }

    this.state          = null;
    this.#dragStartEl   = null;
    this.#dragStartPos  = null;
  }

  #onRightClick(e) {
    const { x, y } = this.#xy(e);
    for (let i = this.#elements.length - 1; i >= 0; i--) {
      const el = this.#elements[i];
      if (el.hitBody(x, y) && !el.def.preset) {
        this.#bus.emit(Events.ELEMENT_DELETE, { el });
        return;
      }
    }
  }

  #onWheel(e) {
    e.preventDefault();
    const r      = this.canvas.getBoundingClientRect();
    const sx     = e.clientX - r.left;
    const sy     = e.clientY - r.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.#cam.zoomAt(sx, sy, factor);
    this.#cam.clamp(this.#elements, r.width, r.height);
  }
}
