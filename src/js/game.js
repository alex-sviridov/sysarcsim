import { ELEM_DEFS, HEADER_H, ROW_H } from './config.js';
import { GameElement } from './element.js';
import { LEVELS } from './levels.js';
import { ConnectionManager } from './connection.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';

export class Game {
  constructor() {
    this.canvas       = document.getElementById('desk');
    this.statusEl     = document.getElementById('status');
    this.winBadge     = document.getElementById('win-badge');
    this.nextLevelBtn = document.getElementById('btn-next-level');

    this.elements = [];       // GameElement[]
    this.elemMap  = new Map(); // id → GameElement (Fix 2)
    this.connMgr  = new ConnectionManager(this);
    this._won     = false;
    this._statusTimer = null;
    this.levelIndex   = 0;
    this._cssW = 0;
    this._cssH = 0;

    this._boundLoop = this._loop.bind(this);

    this.renderer = new Renderer(this.canvas);
    this._setupCanvas();
    this.input = new InputHandler(this.canvas, this);
    this._buildSidebarCards();
    this.reset();
    this._loop();
  }

  // ── Canvas sizing ─────────────────────────────────────────────────────────

  _setupCanvas() {
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const r   = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this._cssW = r.width;
      this._cssH = r.height;
      this.canvas.width  = r.width  * dpr;
      this.canvas.height = r.height * dpr;
      this.renderer.resize(r.width, r.height, dpr);
    };
    window.addEventListener('resize', resize);
    resize();
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────

  _buildSidebarCards() {
    const level     = LEVELS[this.levelIndex];
    const titleEl   = document.getElementById('level-title');
    const container = document.getElementById('sidebar-cards');

    this.input._clearPending();
    titleEl.textContent = level.title;
    container.innerHTML = '';

    for (const type of level.available) {
      const def  = ELEM_DEFS[type];
      const card = document.createElement('div');
      card.className    = 'card';
      card.dataset.type = type;

      const ioLines = [
        ...def.outputs.map(t => `<span class="out">▶ ${t}</span>`),
        ...def.inputs.map(t => `<span class="in">◀ ${t}</span>`),
      ].join('');

      card.innerHTML = `<div class="card-name">${def.label}</div><div class="card-io">${ioLines}</div>`;
      container.appendChild(card);
    }
  }

  // ── Game state ────────────────────────────────────────────────────────────

  reset() {
    this.elements = [];
    this.elemMap  = new Map(); // Fix 2
    this.connMgr.reset();
    this._won     = false;
    this.input.selectedEl = null;
    this.winBadge.hidden     = true;
    this.nextLevelBtn.hidden = true;

    const level   = LEVELS[this.levelIndex];
    const W       = this._cssW || 640;
    const H       = this._cssH || 440;
    const demandH = HEADER_H + ROW_H;
    const gap     = 16;
    const totalH  = level.demands.length * demandH + (level.demands.length - 1) * gap;
    const startY  = H / 2 - totalH / 2;
    const demandX = W * 0.65 - 80;

    for (let i = 0; i < level.demands.length; i++) {
      const def = level.demands[i];
      const el  = new GameElement(def.type, demandX, startY + i * (demandH + gap), def);
      this.elements.push(el);
      this.elemMap.set(el.id, el); // Fix 2
    }

    this._setStatus('Connect elements to satisfy the demand.');
  }

  _setStatus(msg, duration) {
    this.statusEl.textContent = msg;
    clearTimeout(this._statusTimer);
    if (duration) {
      this._statusTimer = setTimeout(() => {
        if (!this._won) this._setStatus('Connect elements to satisfy the demand.');
      }, duration);
    }
  }

  // Fix 5 — win check lives in Game, not ConnectionManager
  checkWin() {
    const demands = this.elements.filter(e => e.def.preset);
    if (!demands.length) return;
    const active = this.connMgr.computeActive(this.elements);
    this._won = demands.every(d => active.has(d));
    this.winBadge.hidden = !this._won;
    if (this._won) {
      this._setStatus('All demands satisfied.');
      this.nextLevelBtn.hidden = this.levelIndex >= LEVELS.length - 1;
    } else {
      this.nextLevelBtn.hidden = true;
    }
  }

  // ── Element management ────────────────────────────────────────────────────

  _placeElement(x, y, type) {
    const def = ELEM_DEFS[type];
    const el  = new GameElement(type, 0, 0, def);
    el.x = x - el.w / 2;
    el.y = y - el.h / 2;
    this.elements.push(el);
    this.elemMap.set(el.id, el); // Fix 2
  }

  _deleteElement(el) {
    // Fix 1 — clear stale wire state before the element disappears
    if (this.input.state?.mode === 'wire' && this.input.state.fromElem === el) {
      this.input.state = null;
    }
    this.connMgr.deleteConnectedTo(el);
    this.elements.splice(this.elements.indexOf(el), 1);
    this.elemMap.delete(el.id); // Fix 2
    if (this.input.selectedEl === el) this.input.selectedEl = null;
    this.checkWin(); // Fix 5
    if (!this._won) this._setStatus('Connect elements to satisfy the demand.');
  }

  // Fix 4 helpers — shared wire completion logic
  _hitInputPort(x, y) {
    for (const el of this.elements) {
      const pi = el.hitInputPort(x, y);
      if (pi !== -1) return { snapElem: el, snapPort: pi };
    }
    return null;
  }

  _completeWire(fromElem, fromPort, x, y, snap) {
    if (snap?.snapValid !== false) {
      const target = snap ?? this._hitInputPort(x, y);
      if (target) this.connMgr.tryConnect(fromElem, fromPort, target.snapElem, target.snapPort);
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────

  _loop() {
    this.renderer.render(this);
    requestAnimationFrame(this._boundLoop);
  }
}
