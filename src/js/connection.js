import { bezierPoint } from './bezier.js';

let _connCounter = 0;

export class ConnectionManager {
  constructor(game) {
    this.game = game;
    this.connections  = [];   // { id, fromId, fromPort, toId, toPort }
    this.selectedConn = null; // stored as object reference (Fix 3)
  }

  reset() {
    this.connections  = [];
    this.selectedConn = null;
  }

  _elem(id) {
    return this.game.elemMap.get(id); // O(1) via Map (Fix 2)
  }

  mid(c) {
    const from = this._elem(c.fromId).outputPos(c.fromPort);
    const to   = this._elem(c.toId).inputPos(c.toPort);
    return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  }

  hit(px, py, c) {
    const from = this._elem(c.fromId).outputPos(c.fromPort);
    const to   = this._elem(c.toId).inputPos(c.toPort);
    for (let i = 0; i <= 24; i++) {
      const p = bezierPoint(from.x, from.y, to.x, to.y, i / 24);
      if (Math.hypot(px - p.x, py - p.y) < 8) return true;
    }
    return false;
  }

  delete(c) {
    this.connections = this.connections.filter(x => x !== c);
    if (this.selectedConn === c) this.selectedConn = null;
    this.game.checkWin(); // Fix 5
    if (!this.game._won) this.game._setStatus('Connect elements to satisfy the demand.');
  }

  deleteConnectedTo(el) {
    if (this.selectedConn &&
        (this.selectedConn.fromId === el.id || this.selectedConn.toId === el.id)) {
      this.selectedConn = null;
    }
    this.connections = this.connections.filter(c => c.fromId !== el.id && c.toId !== el.id);
  }

  tryConnect(fromElem, fromPort, toElem, toPort) {
    if (fromElem.id === toElem.id) return;

    const fromType = fromElem.def.outputs[fromPort];
    const toType   = toElem.def.inputs[toPort];

    if (fromType !== toType) {
      this.game._setStatus(`Type mismatch: ${fromType} ≠ ${toType}`, 2500);
      return;
    }

    // Replace existing connection to this input slot
    const displaced = this.connections.find(c => c.toId === toElem.id && c.toPort === toPort);
    if (displaced && this.selectedConn === displaced) this.selectedConn = null;
    this.connections = this.connections.filter(
      c => !(c.toId === toElem.id && c.toPort === toPort)
    );

    this.connections.push({
      id:       `conn_${_connCounter++}`,
      fromId:   fromElem.id,
      fromPort,
      toId:     toElem.id,
      toPort,
    });
    this.game.checkWin(); // Fix 5
  }

  computeActive(elements) {
    const active   = new Set();
    const elemById = this.game.elemMap; // reuse shared Map (Fix 2)
    let changed = true;
    while (changed) {
      changed = false;
      for (const el of elements) {
        if (active.has(el)) continue;
        // Elements with no inputs (e.g. Storage) are always active as a base case
        const allInputsActive = el.def.inputs.every((_, i) =>
          this.connections.some(c =>
            c.toId === el.id && c.toPort === i && active.has(elemById.get(c.fromId))
          )
        );
        if (allInputsActive) {
          active.add(el);
          changed = true;
        }
      }
    }
    return active;
  }
}
