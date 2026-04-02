import { ELEM_DEFS, HEADER_H, ROW_H } from './config.js';
import { GameElement } from './element.js';
import { LEVELS } from './levels.js';
import { ConnectionManager } from './connection.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input-handler.js';
import { Sidebar } from './sidebar.js';
import { EventBus, Events } from './event-bus.js';

export class Game {
  // Public refs read by Renderer
  canvas;
  elements  = [];
  elemMap   = new Map(); // id → GameElement
  connMgr;
  input;
  levelIndex = 0;

  #bus;
  #sidebar;
  #renderer;
  #won         = false;
  #statusTimer  = null;
  #statusEl;
  #winBadge;
  #nextLevelBtn;
  #cssW = 0;
  #cssH = 0;
  #boundLoop;

  constructor() {
    this.canvas        = document.getElementById('desk');
    this.#statusEl     = document.getElementById('status');
    this.#winBadge     = document.getElementById('win-badge');
    this.#nextLevelBtn = document.getElementById('btn-next-level');

    this.#bus      = new EventBus();
    this.connMgr   = new ConnectionManager(this.elemMap, this.#bus);
    this.#renderer = new Renderer(this.canvas);
    this.#sidebar  = new Sidebar(this.#bus);

    this.#setupCanvas();

    this.input = new InputHandler(this.canvas, this.#bus, this.elements, this.connMgr);

    this.#boundLoop = () => this.#loop();

    this.#subscribeEvents();
    this.#sidebar.build(LEVELS[this.levelIndex]);
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

  // ── Event subscriptions ───────────────────────────────────────────────────

  #subscribeEvents() {
    const bus = this.#bus;

    bus.on(Events.GAME_RESET, () => this.reset());

    bus.on(Events.LEVEL_NEXT, () => {
      if (this.levelIndex < LEVELS.length - 1) {
        this.levelIndex++;
        this.#sidebar.build(LEVELS[this.levelIndex]);
        this.reset();
      }
    });

    bus.on(Events.ELEMENT_PLACE, ({ x, y, type }) => this.#placeElement(x, y, type));

    bus.on(Events.ELEMENT_DELETE, ({ el }) => this.#deleteElement(el));

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
  }

  // ── Game state ────────────────────────────────────────────────────────────

  reset() {
    this.elements.length = 0;
    this.elemMap.clear(); // keep same Map reference so connMgr stays in sync
    this.connMgr.reset();
    GameElement.resetCounter();
    ConnectionManager.resetCounter();
    this.#won = false;
    this.input.selectedEl = null;
    this.#winBadge.hidden     = true;
    this.#nextLevelBtn.hidden = true;

    const level   = LEVELS[this.levelIndex];
    const W       = this.#cssW || 640;
    const H       = this.#cssH || 440;
    const demandH = HEADER_H + ROW_H;
    const gap     = 16;
    const totalH  = level.demands.length * demandH + (level.demands.length - 1) * gap;
    const startY  = H / 2 - totalH / 2;
    const demandX = W * 0.65 - 80;

    for (let i = 0; i < level.demands.length; i++) {
      const def = level.demands[i];
      const el  = new GameElement(def.type, demandX, startY + i * (demandH + gap), def);
      this.elements.push(el);
      this.elemMap.set(el.id, el);
    }

    this.#setStatus('Connect elements to satisfy the demand.');
  }

  #setStatus(msg, duration) {
    this.#statusEl.textContent = msg;
    clearTimeout(this.#statusTimer);
    if (duration) {
      this.#statusTimer = setTimeout(() => {
        if (!this.#won) this.#setStatus('Connect elements to satisfy the demand.');
      }, duration);
    }
  }

  checkWin() {
    const demands = this.elements.filter(e => e.def.preset);
    if (!demands.length) return;
    const result = this.connMgr.computeActivePct(this.elements);
    this.#won = demands.every(d => (result.activePct.get(d) ?? 0) >= 100);
    this.#winBadge.hidden = !this.#won;
    if (this.#won) {
      this.#setStatus('All demands satisfied.');
      this.#nextLevelBtn.hidden = this.levelIndex >= LEVELS.length - 1;
    } else {
      this.#nextLevelBtn.hidden = true;
    }
  }

  // ── Element management ────────────────────────────────────────────────────

  #placeElement(x, y, type) {
    const def = ELEM_DEFS[type];
    const el  = new GameElement(type, 0, 0, def);
    el.x = x - el.w / 2;
    el.y = y - el.h / 2;
    this.elements.push(el);
    this.elemMap.set(el.id, el);
  }

  #deleteElement(el) {
    // Clear stale wire state before the element disappears
    if (this.input.state?.mode === 'wire' && this.input.state.fromElem === el) {
      this.input.state = null;
    }
    this.connMgr.deleteConnectedTo(el);
    this.elements.splice(this.elements.indexOf(el), 1);
    this.elemMap.delete(el.id);
    if (this.input.selectedEl === el) this.input.selectedEl = null;
    this.checkWin();
  }

  #hitInputPort(x, y) {
    for (const el of this.elements) {
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

  // ── Render loop ───────────────────────────────────────────────────────────

  #loop() {
    this.#renderer.render(this);
    requestAnimationFrame(this.#boundLoop);
  }
}
