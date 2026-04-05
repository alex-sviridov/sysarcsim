export const Events = {
  ELEMENT_PLACE:   'element:place',    // { x, y, type }
  ELEMENT_DELETE:  'element:delete',   // { el }
  WIRE_COMPLETE:   'wire:complete',    // { fromElem, fromPort, x, y, snap }
  CONN_DELETE:     'connection:delete',// { conn }
  CONN_SELECT:     'connection:select',// { conn }
  ELEM_SELECT:     'element:select',   // { el }
  PENDING_CHANGED:    'sidebar:pending',      // { type, ghostElem } | { type: null, ghostElem: null }
  SIDEBAR_DRAG_START: 'sidebar:drag-start',   // {} — card was pressed (mousedown), drag may follow
  LEVEL_NEXT:      'level:next',       // {}
  LEVEL_PREV:      'level:prev',       // {}
  GAME_RESET:      'game:reset',       // {}
  CHECK_WIN:       'game:check-win',   // {}
  SET_STATUS:      'game:set-status',  // { msg, duration? }
  LIMIT_CHANGED:        'game:limit-changed',        // { count, limit }
  CRITICAL_PATH_CLICK:  'game:critical-path-click',  // { demandEl }
};

export class EventBus {
  #listeners = new Map();

  on(event, fn) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, []);
    this.#listeners.get(event).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const list = this.#listeners.get(event);
    if (list) this.#listeners.set(event, list.filter(f => f !== fn));
  }

  emit(event, data) {
    for (const fn of (this.#listeners.get(event) ?? [])) fn(data);
  }
}
