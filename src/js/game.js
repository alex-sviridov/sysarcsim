import { ELEM_DEFS } from './config.js';
import { LEVELS } from './levels.js';
import { GameState } from './game-state.js';
import { ConnectionManager } from './connection.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input-handler.js';
import { Sidebar } from './sidebar.js';
import { EventBus, Events } from './event-bus.js';
import { Camera } from './camera.js';

export class Game {
  // Public refs read by Renderer / InputHandler
  canvas;
  camera  = new Camera();
  state   = new GameState();
  connMgr;
  input;

  // Convenience accessors so Renderer / InputHandler keep working unchanged
  get elements()  { return this.state.elements; }
  get elemMap()   { return this.state.elemMap; }
  get levelIndex()        { return this.state.levelIndex; }
  set levelIndex(v)       { this.state.levelIndex = v; }

  // Test-only: emit an event on the internal bus
  get _busForTest() { return this.#bus; }

  #bus;
  #sidebar;
  #renderer;
  #statusTimer  = null;
  #statusEl;
  #elemCountEl;
  #elementsLimit = 0;
  #cssW = 0;
  #cssH = 0;
  #boundLoop;

  constructor(startIndex = 0) {
    this.canvas       = document.getElementById('desk');
    this.#statusEl    = document.getElementById('status');
    this.#elemCountEl = document.getElementById('elem-count');

    this.#bus      = new EventBus();
    this.connMgr   = new ConnectionManager(this.state.elemMap, this.#bus);
    this.#renderer = new Renderer(this.canvas);
    this.#sidebar  = new Sidebar(this.#bus);

    this.#setupCanvas();

    this.input = new InputHandler(this.canvas, this.#bus, this.state.elements, this.connMgr, this.camera);

    this.#boundLoop = () => this.#loop();

    this.state.levelIndex = startIndex;

    this.#setupViewportButtons();
    this.#subscribeEvents();
    this.#sidebar.build(LEVELS[this.state.levelIndex]);
    this.reset();
    this.#loop();
  }

  // ── Canvas sizing ─────────────────────────────────────────────────────────

  #setupCanvas() {
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const r   = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.#cssW = r.width;
      this.#cssH = r.height;
      this.canvas.width  = r.width  * dpr;
      this.canvas.height = r.height * dpr;
      this.#renderer.resize(r.width, r.height, dpr);
    };
    window.addEventListener('resize', resize);
    resize();
  }

  // ── Viewport control buttons ──────────────────────────────────────────────

  #setupViewportButtons() {
    const ZOOM_FACTOR = 1.2;

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      this.camera.zoomAt(this.#cssW / 2, this.#cssH / 2, ZOOM_FACTOR);
      this.camera.clamp(this.state.elements, this.#cssW, this.#cssH);
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      this.camera.zoomAt(this.#cssW / 2, this.#cssH / 2, 1 / ZOOM_FACTOR);
      this.camera.clamp(this.state.elements, this.#cssW, this.#cssH);
    });

    document.getElementById('btn-center').addEventListener('click', () => {
      this.camera.centerOn(this.state.elements, this.#cssW, this.#cssH);
      this.camera.clamp(this.state.elements, this.#cssW, this.#cssH);
    });

    const btnSnap = document.getElementById('btn-snap-grid');
    btnSnap.addEventListener('click', () => {
      this.input.snapToGrid = !this.input.snapToGrid;
      btnSnap.classList.toggle('active', this.input.snapToGrid);
    });
  }

  // ── Event subscriptions ───────────────────────────────────────────────────

  #subscribeEvents() {
    const bus = this.#bus;

    bus.on(Events.GAME_RESET, () => this.reset());

    bus.on(Events.LEVEL_NEXT, () => {
      const next = this.state.levelIndex + 1;
      if (next < LEVELS.length) {
        window.location.href = `game.html?level=${encodeURIComponent(LEVELS[next].slug)}`;
      }
    });

    bus.on(Events.LEVEL_PREV, () => {
      const prev = this.state.levelIndex - 1;
      if (prev >= 0) {
        window.location.href = `game.html?level=${encodeURIComponent(LEVELS[prev].slug)}`;
      }
    });

    bus.on(Events.ELEMENT_PLACE, ({ x, y, type }) => {
      const limit = this.#elementsLimit;
      if (limit > 0 && this.#playerCount() >= limit) {
        this.#bus.emit(Events.SET_STATUS, { msg: 'Element limit reached.', type: 'warn', duration: 2000 });
        return;
      }
      const level  = LEVELS[this.state.levelIndex];
      const merged = level.elements ? { ...ELEM_DEFS, ...level.elements } : ELEM_DEFS;
      this.state.placeElement(x, y, type, merged);
      this.#updateCountDisplay();
      const label = merged[type]?.label ?? type;
      this.#setStatus(`Placed ${label}.`);
    });

    bus.on(Events.ELEMENT_DELETE, ({ el }) => {
      const label = el.def.label ?? el.type;
      this.state.deleteElement(el, this.connMgr, this.input);
      this.#updateCountDisplay();
      this.checkWin();
      if (!this.state.won) this.#setStatus(`Removed ${label}.`);
    });

    bus.on(Events.WIRE_COMPLETE, ({ fromElem, fromPort, x, y, snap }) => {
      const connsBefore = this.connMgr.connections.length;
      this.#completeWire(fromElem, fromPort, x, y, snap);
      if (this.connMgr.connections.length > connsBefore && !this.state.won) {
        const newConn   = this.connMgr.connections[this.connMgr.connections.length - 1];
        const toElem    = this.state.elemMap.get(newConn.toId);
        const fromLabel = fromElem.def.label ?? fromElem.type;
        const toLabel   = toElem ? (toElem.def.label ?? toElem.type) : '?';
        this.#setStatus(`Connected ${fromLabel} → ${toLabel}.`);
      }
    });

    bus.on(Events.CONN_DELETE, ({ conn }) => {
      this.connMgr.delete(conn);
      if (!this.state.won) this.#setStatus('Disconnected wire.');
    });

    bus.on(Events.CONN_SELECT, ({ conn }) => {
      this.connMgr.selectedConn = conn;
    });

    bus.on(Events.CHECK_WIN, () => this.checkWin());

    bus.on(Events.SET_STATUS, ({ msg, type, duration }) => this.#setStatus(msg, type, duration));

    bus.on(Events.CRITICAL_PATH_CLICK, ({ demandEl }) => {
      const result = this.connMgr.computeActivePct(this.state.elements);
      const { elemIds, connIds } = this.connMgr.criticalPath(result.latency, demandEl);
      this.#renderer.showCriticalPath(elemIds, connIds, demandEl.id, performance.now());
    });
  }

  // ── Game actions ──────────────────────────────────────────────────────────

  reset() {
    this.state.reset(this.connMgr, this.#cssW, this.#cssH);
    this.input.selectedEl = null;
    this.#sidebar.setWon(false);

    this.#elementsLimit = LEVELS[this.state.levelIndex].elementsLimit ?? 0;
    this.#updateCountDisplay();

    this.camera.x    = 0;
    this.camera.y    = 0;
    this.camera.zoom = 1;

    this.#setStatus('Connect elements to satisfy the demand.', 'info');
  }

  checkWin() {
    const demands = this.state.elements.filter(e => e.def.preset);
    if (!demands.length) return;
    const result = this.connMgr.computeActivePct(this.state.elements);

    const allFlowMet    = demands.every(d => (result.activePct.get(d) ?? 0) >= 100);
    const allLatencyMet = demands.every(d =>
      d.def.requiredLatency == null ||
      (result.latency?.get(d) ?? 0) <= d.def.requiredLatency
    );

    this.state.won = allFlowMet && allLatencyMet;
    this.#sidebar.setWon(this.state.won);

    if (this.state.won) {
      this.#setStatus('All demands satisfied.', 'success');
    } else if (allFlowMet && !allLatencyMet) {
      this.#setStatus('Latency too high — reduce the path length.', 'warn');
    }
  }

  #hitInputPort(x, y) {
    for (const el of this.state.elements) {
      const pi = el.hitInputPort(x, y);
      if (pi !== -1) return { snapElem: el, snapPort: pi };
    }
    return null;
  }

  #completeWire(fromElem, fromPort, x, y, snap) {
    const target = snap?.snapValid ? snap
                 : snap == null    ? this.#hitInputPort(x, y)
                 : null; // snap exists but is invalid (type mismatch) — reject
    if (target) this.connMgr.tryConnect(fromElem, fromPort, target.snapElem, target.snapPort);
  }

  #playerCount() {
    return this.state.elements.filter(e => !e.def.preset).length;
  }

  #updateCountDisplay() {
    const count = this.#playerCount();
    const limit = this.#elementsLimit;
    this.#elemCountEl.textContent = limit > 0
      ? `${count}/${limit} elements`
      : `${count} element${count !== 1 ? 's' : ''}`;
    this.#bus.emit(Events.LIMIT_CHANGED, { count, limit });
  }

  #setStatus(msg, type = 'info', duration) {
    this.#statusEl.textContent = msg;
    this.#statusEl.dataset.status = type;
    clearTimeout(this.#statusTimer);
    if (duration) {
      this.#statusTimer = setTimeout(() => {
        if (!this.state.won) this.#setStatus('Connect elements to satisfy the demand.', 'info');
      }, duration);
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────

  #loop() {
    this.#renderer.render(this, performance.now());
    requestAnimationFrame(this.#boundLoop);
  }
}
