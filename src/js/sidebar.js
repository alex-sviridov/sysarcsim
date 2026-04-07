import { ELEM_DEFS, PORT_UNIT, inputKeys, outputKeys } from './config.js';
import { GameElement } from './element.js';
import { LEVELS } from './levels.js';
import { Events } from './event-bus.js';

export class Sidebar {
  #bus;
  #pendingType  = null;
  #ghostElem    = null;
  #limitReached = false;
  #currentLevel = null;

  constructor(bus) {
    this.#bus = bus;
    bus.on(Events.LIMIT_CHANGED, ({ count, limit }) => {
      this.#limitReached = limit > 0 && count >= limit;
      document.querySelectorAll('#sidebar-cards .card[data-type]').forEach(card => {
        card.classList.toggle('card--disabled', this.#limitReached);
      });
    });
    this.#bindButtons();
  }

  build(level) {
    this.clearPending();
    this.#limitReached  = false;
    this.#currentLevel  = level;

    document.getElementById('level-title').textContent             = level.title;
    document.getElementById('level-description-popup').textContent = level.description ?? '';
    document.getElementById('level-description-popup').hidden      = true;

    const container = document.getElementById('sidebar-cards');
    container.innerHTML = '';

    for (const type of level.available) {
      const def  = ELEM_DEFS[type];
      const card = document.createElement('div');
      card.className    = 'card';
      card.dataset.type = type;

      // Icon
      if (def.icon) {
        const iconEl = document.createElement('div');
        iconEl.className = 'card-icon';
        iconEl.innerHTML = def.icon;
        card.appendChild(iconEl);
      }

      const nameEl = document.createElement('div');
      nameEl.className   = 'card-name';
      nameEl.textContent = def.label;

      const ioEl = document.createElement('div');
      ioEl.className = 'card-io';
      for (const k of outputKeys(def)) {
        const unit = PORT_UNIT[k] ? ` ${PORT_UNIT[k]}` : '';
        const span = document.createElement('span');
        span.className   = 'out';
        span.textContent = `▶ ${k} ${def.outputs[k].supply}${unit}`;
        ioEl.appendChild(span);
      }
      for (const k of inputKeys(def)) {
        const unit = PORT_UNIT[k] ? ` ${PORT_UNIT[k]}` : '';
        const span = document.createElement('span');
        span.className   = 'in';
        span.textContent = `◀ ${k} ${def.inputs[k].demand}${unit}`;
        ioEl.appendChild(span);
      }

      card.appendChild(nameEl);
      card.appendChild(ioEl);
      container.appendChild(card);
    }

    this.#updateNavButtons(false);
  }

  setWon(won) {
    document.getElementById('win-badge').hidden = !won;
    this.#updateNavButtons(won);
  }

  #updateNavButtons(won = false) {
    const idx     = LEVELS.indexOf(this.#currentLevel);
    const isLast  = idx >= LEVELS.length - 1;
    const prevBtn = document.getElementById('btn-prev-level');
    const nextBtn = document.getElementById('btn-next-level');

    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = isLast;
    nextBtn.classList.toggle('btn-next--ready', won && !isLast);
  }

  clearPending() {
    this.#pendingType = null;
    this.#ghostElem   = null;
    document.querySelectorAll('#sidebar-cards .card--active')
      .forEach(c => c.classList.remove('card--active'));
    this.#bus.emit(Events.PENDING_CHANGED, { type: null, ghostElem: null });
  }

  #bindButtons() {
    const sidebar = document.getElementById('sidebar');
    const cards   = document.getElementById('sidebar-cards');

    sidebar.addEventListener('mousedown', e => {
      if (!e.target.closest('.card[data-type]')) this.clearPending();
    });

    cards.addEventListener('mousedown', e => {
      const card = e.target.closest('.card[data-type]');
      if (!card) return;
      e.preventDefault();

      if (card.classList.contains('card--disabled')) {
        this.#bus.emit(Events.SET_STATUS, { msg: 'Element limit reached.', duration: 2000 });
        return;
      }

      const type = card.dataset.type;
      if (this.#pendingType === type) {
        this.clearPending();
      } else {
        this.clearPending();
        this.#pendingType = type;
        this.#ghostElem   = new GameElement(type, 0, 0, ELEM_DEFS[type]);
        card.classList.add('card--active');
        this.#bus.emit(Events.PENDING_CHANGED, { type, ghostElem: this.#ghostElem });
        this.#bus.emit(Events.SIDEBAR_DRAG_START, {});
      }
    });

    document.getElementById('btn-info').addEventListener('click', e => {
      e.stopPropagation();
      const popup = document.getElementById('level-description-popup');
      popup.hidden = !popup.hidden;
    });

    document.addEventListener('click', () => {
      document.getElementById('level-description-popup').hidden = true;
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      this.#bus.emit(Events.GAME_RESET, {});
    });

    document.getElementById('btn-next-level').addEventListener('click', () => {
      if (!document.getElementById('btn-next-level').disabled) {
        this.#bus.emit(Events.LEVEL_NEXT, {});
      }
    });

    document.getElementById('btn-prev-level').addEventListener('click', () => {
      if (!document.getElementById('btn-prev-level').disabled) {
        this.#bus.emit(Events.LEVEL_PREV, {});
      }
    });
  }
}
