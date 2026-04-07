import { bezierPoint } from './bezier.js';
import { inputKeys, outputKeys, BEZIER_SAMPLES } from './config.js';
import { Events } from './event-bus.js';

export class ConnectionManager {
  static #counter = 0;
  static resetCounter() { ConnectionManager.#counter = 0; }

  #elemMap;
  #bus;

  connections  = [];
  selectedConn = null;

  constructor(elemMap, bus) {
    this.#elemMap = elemMap;
    this.#bus     = bus;
  }

  reset() {
    this.connections  = [];
    this.selectedConn = null;
  }

  #elem(id) {
    return this.#elemMap.get(id);
  }

  mid(c) {
    const from = this.#elem(c.fromId).outputPos(c.fromPort);
    const to   = this.#elem(c.toId).inputPos(c.toPort);
    return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  }

  hit(px, py, c) {
    const from = this.#elem(c.fromId).outputPos(c.fromPort);
    const to   = this.#elem(c.toId).inputPos(c.toPort);
    for (let i = 0; i <= BEZIER_SAMPLES; i++) {
      const p = bezierPoint(from.x, from.y, to.x, to.y, i / BEZIER_SAMPLES);
      if (Math.hypot(px - p.x, py - p.y) < 8) return true;
    }
    return false;
  }

  delete(c) {
    this.connections = this.connections.filter(x => x !== c);
    if (this.selectedConn === c) this.selectedConn = null;
    this.#bus.emit(Events.CHECK_WIN, {});
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
      this.#bus.emit(Events.SET_STATUS, { msg: `Type mismatch: ${fromType} ≠ ${toType}`, type: 'warn', duration: 2500 });
      return;
    }

    const outSpec = fromElem.def.outputs[fromType];
    const inSpec  = toElem.def.inputs[toType];

    // Output multipath:false → displace existing outgoing connection from this port
    if (outSpec.multipath === false) {
      const out = this.connections.find(c => c.fromId === fromElem.id && c.fromPort === fromPort);
      if (out && this.selectedConn === out) this.selectedConn = null;
      this.connections = this.connections.filter(
        c => !(c.fromId === fromElem.id && c.fromPort === fromPort)
      );
    }

    // Input without multipath:true → displace existing incoming connection to this port
    if (inSpec.multipath !== true) {
      const inp = this.connections.find(c => c.toId === toElem.id && c.toPort === toPort);
      if (inp && this.selectedConn === inp) this.selectedConn = null;
      this.connections = this.connections.filter(
        c => !(c.toId === toElem.id && c.toPort === toPort)
      );
    }

    // Guard against exact duplicate
    if (this.connections.some(
      c => c.fromId === fromElem.id && c.fromPort === fromPort &&
           c.toId === toElem.id   && c.toPort === toPort
    )) return;

    this.connections.push({
      id:       `conn_${ConnectionManager.#counter++}`,
      fromId:   fromElem.id,
      fromPort,
      toId:     toElem.id,
      toPort,
    });
    this.#bus.emit(Events.CHECK_WIN, {});
  }

  computeActivePct(elements) {
    const elemById = this.#elemMap;

    // --- Step 1: Topological sort (Kahn's algorithm) ---
    const inDegree   = new Map();
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
    const flow      = new Map(); // `${elemId}:${portIdx}` → total output flow (for display)
    const connRatio = new Map(); // connId → 0..1 share of source port capacity
    const received  = new Map(); // `${elemId}:${portIdx}` → received at input
    const latency   = new Map(); // GameElement → cumulative max-path latency

    const connsByPort  = new Map(); // `${fromId}:${fromPort}` → Connection[]
    const connsByToId  = new Map(); // toId → Connection[]
    for (const c of this.connections) {
      const outKey = `${c.fromId}:${c.fromPort}`;
      if (!connsByPort.has(outKey)) connsByPort.set(outKey, []);
      connsByPort.get(outKey).push(c);

      if (!connsByToId.has(c.toId)) connsByToId.set(c.toId, []);
      connsByToId.get(c.toId).push(c);
    }

    for (const el of sorted) {
      const inK = inputKeys(el.def);
      // Latency: max upstream latency (critical path) + own latency.
      // Consumers (preset, no outputs) are not counted — they show the upstream total.
      const isConsumer = el.def.preset && outputKeys(el.def).length === 0;
      const ownLatency = isConsumer ? 0 : (el.def.latency ?? 1);

      let maxUpstream = 0;
      for (const c of connsByToId.get(el.id) ?? []) {
        const upLat = latency.get(elemById.get(c.fromId)) ?? 0;
        if (upLat > maxUpstream) maxUpstream = upLat;
      }
      latency.set(el, maxUpstream + ownLatency);

      if (inK.length === 0) {
        activePct.set(el, 100);
      } else {
        let minPct = 100;
        for (let i = 0; i < inK.length; i++) {
          const spec = el.def.inputs[inK[i]];
          const recv = received.get(`${el.id}:${i}`) ?? 0;
          const pct  = spec.demand > 0 ? Math.min(100, recv / spec.demand * 100) : 100;
          if (pct < minPct) minPct = pct;
        }
        activePct.set(el, minPct);
      }

      const outK = outputKeys(el.def);
      const pct  = activePct.get(el);
      for (let j = 0; j < outK.length; j++) {
        const spec     = el.def.outputs[outK[j]];
        const capacity     = spec.supply * pct / 100;
        let pool           = capacity;
        let totalAllocated = 0;

        for (const c of connsByPort.get(`${el.id}:${j}`) ?? []) {
          const toEl = elemById.get(c.toId);
          if (!toEl) continue;
          const toSpec     = toEl.def.inputs[inputKeys(toEl.def)[c.toPort]];
          const recvKey    = `${c.toId}:${c.toPort}`;
          const alreadyGot = received.get(recvKey) ?? 0;
          const stillNeeds = toSpec ? Math.max(0, toSpec.demand - alreadyGot) : 0;
          const give       = Math.min(pool, stillNeeds);
          received.set(recvKey, alreadyGot + give);
          connRatio.set(c.id, capacity > 0 ? give / capacity : 0);
          pool           -= give;
          totalAllocated += give;
        }

        flow.set(`${el.id}:${j}`, totalAllocated);
      }
    }

    return { activePct, flow, connRatio, received, latency };
  }

  // Returns the set of element IDs and connection IDs on the critical (max-latency) path
  // ending at demandEl. Uses the latency map from computeActivePct.
  criticalPath(latencyMap, demandEl) {
    const elemIds = new Set();
    const connIds = new Set();

    // Index incoming connections by destination for O(1) lookup per walk step
    const connsByToId = new Map();
    for (const c of this.connections) {
      if (!connsByToId.has(c.toId)) connsByToId.set(c.toId, []);
      connsByToId.get(c.toId).push(c);
    }

    const walk = (el) => {
      elemIds.add(el.id);
      let bestConn     = null;
      let bestUpstream = null;
      let bestLatency  = -1;
      for (const c of connsByToId.get(el.id) ?? []) {
        const fromEl = this.#elemMap.get(c.fromId);
        if (!fromEl) continue;
        const upLat = latencyMap.get(fromEl) ?? 0;
        if (upLat > bestLatency) {
          bestLatency  = upLat;
          bestConn     = c;
          bestUpstream = fromEl;
        }
      }
      if (bestConn) {
        connIds.add(bestConn.id);
        walk(bestUpstream);
      }
    };

    walk(demandEl);
    return { elemIds, connIds };
  }
}
