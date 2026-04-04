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

  #bus;
  #sidebar;
  #renderer;
  #statusTimer  = null;
  #statusEl;
  #winBadge;
  #nextLevelBtn;
  #elemCountEl;
  #elementsLimit = 0;
  #cssW = 0;
  #cssH = 0;
  #boundLoop;

  constructor() {
    this.canvas        = document.getElementById('desk');
    this.#statusEl     = document.getElementById('status');
    this.#winBadge     = document.getElementById('win-badge');
    this.#nextLevelBtn = document.getElementById('btn-next-level');
    this.#elemCountEl  = document.getElementById('elem-count');

    this.#bus      = new EventBus();
    this.connMgr   = new ConnectionManager(this.state.elemMap, this.#bus);
    this.#renderer = new Renderer(this.canvas);
    this.#sidebar  = new Sidebar(this.#bus);

    this.#setupCanvas();

    this.input = new InputHandler(this.canvas, this.#bus, this.state.elements, this.connMgr, this.camera);

    this.#boundLoop = () => this.#loop();

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
  }

  // ── Event subscriptions ───────────────────────────────────────────────────

  #subscribeEvents() {
    const bus = this.#bus;

    bus.on(Events.GAME_RESET, () => this.reset());

    bus.on(Events.LEVEL_NEXT, () => {
      if (this.state.levelIndex < LEVELS.length - 1) {
        this.state.levelIndex++;
        this.#sidebar.build(LEVELS[this.state.levelIndex]);
        this.reset();
      }
    });

    bus.on(Events.ELEMENT_PLACE, ({ x, y, type }) => {
      const limit = this.#elementsLimit;
      if (limit > 0 && this.#playerCount() >= limit) {
        this.#bus.emit(Events.SET_STATUS, { msg: 'Element limit reached.', duration: 2000 });
        return;
      }
      this.state.placeElement(x, y, type, ELEM_DEFS);
      this.#updateCountDisplay();
    });

    bus.on(Events.ELEMENT_DELETE, ({ el }) => {
      this.state.deleteElement(el, this.connMgr, this.input);
      this.#updateCountDisplay();
      this.checkWin();
    });

    bus.on(Events.WIRE_COMPLETE, ({ fromElem, fromPort, x, y, snap }) => {
      this.#completeWire(fromElem, fromPort, x, y, snap);
    });

    bus.on(Events.CONN_DELETE, ({ conn }) => {
      this.connMgr.delete(conn);
    });

    bus.on(Events.CONN_SELECT, ({ conn }) => {
      this.connMgr.selectedConn = conn;
    });

    bus.on(Events.CHECK_WIN, () => this.checkWin());

    bus.on(Events.SET_STATUS, ({ msg, duration }) => this.#setStatus(msg, duration));

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
    this.#winBadge.hidden     = true;
    this.#nextLevelBtn.hidden = true;

    this.#elementsLimit = LEVELS[this.state.levelIndex].elementsLimit ?? 0;
    this.#updateCountDisplay();

    this.camera.x    = 0;
    this.camera.y    = 0;
    this.camera.zoom = 1;

    this.#setStatus('Connect elements to satisfy the demand.');
  }

  checkWin() {
    const demands = this.state.elements.filter(e => e.def.preset);
    if (!demands.length) return;
    const result = this.connMgr.computeActivePct(this.state.elements);

    const allFlowMet    = demands.every(d => (result.activePct.get(d) ?? 0) >= 100);
    const latencyUnmet  = demands.filter(d =>
      d.def.requiredLatency != null &&
      (result.latency?.get(d) ?? 0) > d.def.requiredLatency
    );
    const allLatencyMet = latencyUnmet.length === 0;

    this.state.won = allFlowMet && allLatencyMet;
    this.#winBadge.hidden = !this.state.won;

    if (this.state.won) {
      this.#setStatus('All demands satisfied.');
      this.#nextLevelBtn.hidden = this.state.levelIndex >= LEVELS.length - 1;
    } else {
      if (allFlowMet && !allLatencyMet) {
        this.#setStatus('Latency too high — reduce the path length.');
      }
      this.#nextLevelBtn.hidden = true;
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
    if (snap?.snapValid !== false) {
      const target = snap ?? this.#hitInputPort(x, y);
      if (target) this.connMgr.tryConnect(fromElem, fromPort, target.snapElem, target.snapPort);
    }
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

  #setStatus(msg, duration) {
    this.#statusEl.textContent = msg;
    clearTimeout(this.#statusTimer);
    if (duration) {
      this.#statusTimer = setTimeout(() => {
        if (!this.state.won) this.#setStatus('Connect elements to satisfy the demand.');
      }, duration);
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────

  #loop() {
    this.#renderer.render(this, performance.now());
    requestAnimationFrame(this.#boundLoop);
  }
}
