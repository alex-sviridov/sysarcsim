import { ELEM_DEFS, PORT_SNAP } from './config.js';
import { GameElement } from './element.js';
import { LEVELS } from './levels.js';

export class InputHandler {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game   = game;

    this.state             = null;
    // state shapes:
    //   null
    //   { mode: 'drag', elem, dx, dy }
    //   { mode: 'wire', fromElem, fromPort, mx, my, ox, oy, moved, snap }

    this._dragStartEl      = null;
    this._dragStartPos     = null;
    this._dragMoved        = false;
    this._sidebarDragging  = false;
    this._sidebarDragMoved = false;
    this._mx               = 0;
    this._my               = 0;
    this.selectedEl        = null;
    this._pendingType      = null;
    this._ghostElem        = null;

    this._bindEvents();
  }

  _xy(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _bindEvents() {
    const canvas = this.canvas;
    const game   = this.game;

    canvas.addEventListener('mousedown',   e => this._onDown(e));
    document.addEventListener('mousemove', e => this._onMove(e));
    document.addEventListener('mouseup',   e => this._onUp(e));
    canvas.addEventListener('contextmenu', e => { e.preventDefault(); this._onRightClick(e); });

    document.getElementById('sidebar').addEventListener('mousedown', e => {
      if (!e.target.closest('.card[data-type]')) this._clearPending();
    });

    document.getElementById('sidebar-cards').addEventListener('mousedown', e => {
      const card = e.target.closest('.card[data-type]');
      if (!card) return;
      e.preventDefault();
      const type = card.dataset.type;
      if (this._pendingType === type) {
        this._clearPending();
      } else {
        this._clearPending();
        this._pendingType      = type;
        this._ghostElem        = new GameElement(type, 0, 0, ELEM_DEFS[type]);
        this._sidebarDragging  = true;
        this._sidebarDragMoved = false;
        card.classList.add('card--active');
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this._clearPending();
        if (this.state?.mode === 'wire') this.state = null;
      }
    });

    document.getElementById('btn-reset').addEventListener('click', () => game.reset());

    game.nextLevelBtn.addEventListener('click', () => {
      if (game.levelIndex < LEVELS.length - 1) {
        game.levelIndex++;
        game._buildSidebarCards();
        game.reset();
      }
    });
  }

  _onDown(e) {
    if (e.button !== 0) return;
    const { x, y } = this._xy(e);
    const game = this.game;

    // Remove icon on selected connection
    if (game.connMgr.selectedConn) {
      const m = game.connMgr.mid(game.connMgr.selectedConn);
      if (Math.hypot(x - m.x, y - m.y) < 12) {
        game.connMgr.delete(game.connMgr.selectedConn);
        return;
      }
    }

    // Remove icon on selected non-preset element
    if (this.selectedEl && !this.selectedEl.def.preset) {
      const rx = this.selectedEl.x + this.selectedEl.w;
      const ry = this.selectedEl.y;
      if (Math.hypot(x - rx, y - ry) < 12) {
        game._deleteElement(this.selectedEl);
        this.selectedEl = null;
        return;
      }
    }

    // Second click while wire is active (click-click mode): complete or cancel (Fix 4)
    if (this.state?.mode === 'wire') {
      const { fromElem, fromPort, snap } = this.state;
      game._completeWire(fromElem, fromPort, x, y, snap);
      this.state = null;
      return;
    }

    // Output ports take priority (start wire)
    for (let i = game.elements.length - 1; i >= 0; i--) {
      const el = game.elements[i];
      const pi = el.hitOutputPort(x, y);
      if (pi !== -1) {
        this._clearPending();
        this.state = { mode: 'wire', fromElem: el, fromPort: pi, mx: x, my: y, ox: x, oy: y, moved: false };
        return;
      }
    }

    // Element body (drag to reposition, click to select)
    for (let i = game.elements.length - 1; i >= 0; i--) {
      const el = game.elements[i];
      if (el.hitBody(x, y)) {
        this._clearPending();
        game.elements.splice(i, 1);
        game.elements.push(el);
        this._dragStartEl  = el;
        this._dragStartPos = { x, y };
        this._dragMoved    = false;
        game.connMgr.selectedConn = null;
        this.state = { mode: 'drag', elem: el, dx: x - el.x, dy: y - el.y };
        return;
      }
    }

    // Connection wire hit
    for (let i = game.connMgr.connections.length - 1; i >= 0; i--) {
      if (game.connMgr.hit(x, y, game.connMgr.connections[i])) {
        this._clearPending();
        game.connMgr.selectedConn = game.connMgr.connections[i];
        this.selectedEl           = null;
        return;
      }
    }

    // Empty space — place pending element (click-click mode) or deselect
    if (this._pendingType) {
      game._placeElement(x, y, this._pendingType);
      this._clearPending();
    } else {
      this.selectedEl           = null;
      game.connMgr.selectedConn = null;
    }
  }

  _findSnapTarget(x, y, fromElem, fromType) {
    let best = null, bestDist = PORT_SNAP;
    for (const el of this.game.elements) {
      if (el === fromElem) continue;
      for (let i = 0; i < el.def.inputs.length; i++) {
        const p = el.inputPos(i);
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = { snapElem: el, snapPort: i, snapValid: el.def.inputs[i] === fromType };
        }
      }
    }
    return best;
  }

  _onMove(e) {
    const { x, y } = this._xy(e);

    if (this._sidebarDragging && Math.hypot(x - this._mx, y - this._my) > 4) {
      this._sidebarDragMoved = true;
    }

    this._mx = x;
    this._my = y;

    if (this.state?.mode === 'drag') {
      this.state.elem.x = x - this.state.dx;
      this.state.elem.y = y - this.state.dy;
      if (this._dragStartPos && Math.hypot(x - this._dragStartPos.x, y - this._dragStartPos.y) > 4) {
        this._dragMoved = true;
      }
    }

    if (this.state?.mode === 'wire') {
      this.state.mx = x;
      this.state.my = y;
      if (!this.state.moved && Math.hypot(x - this.state.ox, y - this.state.oy) > 4) {
        this.state.moved = true;
      }
      const fromType = this.state.fromElem.def.outputs[this.state.fromPort];
      this.state.snap = this._findSnapTarget(x, y, this.state.fromElem, fromType);
    }

    this.canvas.style.cursor = this._cursorFor(x, y);
  }

  _cursorFor(x, y) {
    if (this.state?.mode === 'drag') return 'grabbing';
    if (this.state?.mode === 'wire') return 'crosshair';
    for (let i = this.game.elements.length - 1; i >= 0; i--) {
      const el = this.game.elements[i];
      if (el.hitOutputPort(x, y) !== -1 || el.hitInputPort(x, y) !== -1) return 'crosshair';
      if (el.hitBody(x, y)) return this._pendingType ? 'not-allowed' : 'grab';
    }
    return this._pendingType ? 'cell' : 'default';
  }

  _onUp(e) {
    if (e.button !== 0) { this.state = null; return; }
    const { x, y } = this._xy(e);
    const game = this.game;

    // Sidebar drag release — place if over empty canvas, else keep pending for click-click
    if (this._sidebarDragging) {
      this._sidebarDragging = false;
      const onCanvas = x >= 0 && x <= game._cssW && y >= 0 && y <= game._cssH;
      const hitsElem = game.elements.some(el => el.hitBody(x, y));
      if (this._pendingType && onCanvas && !hitsElem) {
        game._placeElement(x, y, this._pendingType);
        this._clearPending();
      } else if (!onCanvas && this._sidebarDragMoved) {
        this._clearPending(); // dragged back to sidebar intentionally
      }
      // quick click (no movement) → keep _pendingType for click-click mode
      return;
    }

    if (this.state?.mode === 'wire') {
      if (!this.state.moved) {
        // Plain click — keep wire alive for click-click completion
        return;
      }
      // Drag release — complete and clear (Fix 4)
      const { fromElem, fromPort, snap } = this.state;
      game._completeWire(fromElem, fromPort, x, y, snap);
    }

    if (this.state?.mode === 'drag' && !this._dragMoved) {
      this.selectedEl = this._dragStartEl || null;
    }

    this.state         = null;
    this._dragStartEl  = null;
    this._dragStartPos = null;
  }

  _onRightClick(e) {
    const { x, y } = this._xy(e);
    const game = this.game;
    for (let i = game.elements.length - 1; i >= 0; i--) {
      const el = game.elements[i];
      if (el.hitBody(x, y) && !el.def.preset) {
        game._deleteElement(el);
        return;
      }
    }
  }

  _clearPending() {
    this._pendingType      = null;
    this._ghostElem        = null;
    this._sidebarDragging  = false;
    this._sidebarDragMoved = false;
    document.querySelectorAll('#sidebar-cards .card--active')
      .forEach(c => c.classList.remove('card--active'));
  }
}
