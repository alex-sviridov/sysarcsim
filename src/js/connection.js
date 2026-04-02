import { bezierPoint } from './bezier.js';
import { inputKeys, outputKeys } from './config.js';

let _connCounter = 0;

export class ConnectionManager {
  constructor(game) {
    this.game = game;
    this.connections  = [];   // { id, fromId, fromPort, toId, toPort }
    this.selectedConn = null;
  }

  reset() {
    this.connections  = [];
    this.selectedConn = null;
  }

  _elem(id) {
    return this.game.elemMap.get(id);
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
    this.game.checkWin();
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

    const fromType = outputKeys(fromElem.def)[fromPort];
    const toType   = inputKeys(toElem.def)[toPort];

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
    this.game.checkWin();
  }

  computeActivePct(elements) {
    const elemById = this.game.elemMap;

    // --- Step 1: Topological sort (Kahn's algorithm) ---
    // in-degree = number of distinct upstream element IDs connected to this element
    const inDegree = new Map();
    const downstream = new Map(); // elemId → Set of downstream elemIds
    for (const el of elements) {
      inDegree.set(el.id, new Set());
      downstream.set(el.id, new Set());
    }
    for (const c of this.connections) {
      const fromEl = elemById.get(c.fromId);
      const toEl   = elemById.get(c.toId);
      if (!fromEl || !toEl) continue;
      inDegree.get(c.toId).add(c.fromId);
      downstream.get(c.fromId).add(c.toId);
    }

    const queue  = [];
    const sorted = [];
    for (const el of elements) {
      if (inDegree.get(el.id).size === 0) queue.push(el);
    }
    while (queue.length) {
      const el = queue.shift();
      sorted.push(el);
      for (const toId of downstream.get(el.id)) {
        const deg = inDegree.get(toId);
        deg.delete(el.id);
        if (deg.size === 0) queue.push(elemById.get(toId));
      }
    }

    // --- Step 2: Forward pass ---
    const activePct = new Map(); // GameElement → 0–100
    const flow      = new Map(); // `${elemId}:${portIdx}` → current output flow
    const received  = new Map(); // `${elemId}:${portIdx}` → received at input

    // Index connections by source port for O(1) lookup during distribution
    const connsByPort = new Map(); // `${fromId}:${fromPort}` → Connection[]
    for (const c of this.connections) {
      const key = `${c.fromId}:${c.fromPort}`;
      if (!connsByPort.has(key)) connsByPort.set(key, []);
      connsByPort.get(key).push(c);
    }

    for (const el of sorted) {
      const inK = inputKeys(el.def);

      if (inK.length === 0) {
        // Producer: always 100%
        activePct.set(el, 100);
      } else {
        // Compute activePct from already-populated received values
        let minPct = 100;
        for (let i = 0; i < inK.length; i++) {
          const spec = el.def.inputs[inK[i]];
          const recv = received.get(`${el.id}:${i}`) ?? 0;
          const pct  = spec.demand > 0 ? Math.min(100, recv / spec.demand * 100) : 100;
          if (pct < minPct) minPct = pct;
        }
        activePct.set(el, minPct);
      }

      // Distribute output capacity to downstream consumers (connection creation order)
      const outK = outputKeys(el.def);
      const pct  = activePct.get(el);
      for (let j = 0; j < outK.length; j++) {
        const spec       = el.def.outputs[outK[j]];
        let pool         = spec.supply * pct / 100;
        let totalAllocated = 0;

        for (const c of connsByPort.get(`${el.id}:${j}`) ?? []) {
          const toEl = elemById.get(c.toId);
          if (!toEl) continue;
          const toSpec = toEl.def.inputs[inputKeys(toEl.def)[c.toPort]];
          const give   = Math.min(pool, toSpec ? toSpec.demand : 0);
          received.set(`${c.toId}:${c.toPort}`, (received.get(`${c.toId}:${c.toPort}`) ?? 0) + give);
          pool          -= give;
          totalAllocated += give;
        }

        flow.set(`${el.id}:${j}`, totalAllocated);
      }
    }

    return { activePct, flow, received };
  }
}
