import { ELEM_W, HEADER_H, ROW_H, PORT_R, PORT_HIT, PORT_COLOR, PORT_UNIT, inputKeys, outputKeys } from './config.js';

const LATENCY_ROW_H = 22; // extra height reserved for the latency label on demand elements

export class GameElement {
  static #counter = 0;
  static resetCounter() { GameElement.#counter = 0; }

  #iconImg = null;

  constructor(type, x, y, def) {
    this.id   = `elem_${GameElement.#counter++}`;
    this.type = type;
    this.def  = def;
    this.x    = x;
    this.y    = y;
    const rows = Math.max(inputKeys(def).length, outputKeys(def).length, 1);
    const isDemand = def.preset && outputKeys(def).length === 0;
    this.w = ELEM_W;
    this.h = HEADER_H + rows * ROW_H + (isDemand ? LATENCY_ROW_H : 0);

    if (def.icon) {
      this.#iconImg = new Image();
      this.#iconImg.src = 'data:image/svg+xml,' + encodeURIComponent(def.icon.replace(/currentColor/g, '#ffffff'));
    }
  }

  inputPos(i) {
    return { x: this.x, y: this.y + HEADER_H + (i + 0.5) * ROW_H };
  }

  outputPos(i) {
    return { x: this.x + this.w, y: this.y + HEADER_H + (i + 0.5) * ROW_H };
  }

  hitBody(px, py) {
    return px >= this.x && px <= this.x + this.w &&
           py >= this.y && py <= this.y + this.h;
  }

  hitInputPort(px, py) {
    const keys = inputKeys(this.def);
    for (let i = 0; i < keys.length; i++) {
      const p = this.inputPos(i);
      if (Math.hypot(px - p.x, py - p.y) < PORT_HIT) return i;
    }
    return -1;
  }

  hitLatencyLabel(px, py) {
    if (!this.def.preset || outputKeys(this.def).length !== 0) return false;
    const labelY = this.y + this.h - LATENCY_ROW_H / 2;
    return px >= this.x && px <= this.x + this.w &&
           Math.abs(py - labelY) < LATENCY_ROW_H / 2;
  }

  hitOutputPort(px, py) {
    const keys = outputKeys(this.def);
    for (let i = 0; i < keys.length; i++) {
      const p = this.outputPos(i);
      if (Math.hypot(px - p.x, py - p.y) < PORT_HIT) return i;
    }
    return -1;
  }

  draw(ctx, connectedInputs, activePct, computeResult, latencyHovered = false, now = 0) {
    const { x, y, w, h, def } = this;
    const alpha = 0.38 + (activePct / 100) * 0.62;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Drop shadow
    ctx.save();
    ctx.shadowColor   = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur    = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#1c2128';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.restore();

    // Body
    ctx.fillStyle = '#1c2128';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();

    // Header accent
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, HEADER_H, [8, 8, 0, 0]);
    ctx.fill();

    // Semi-active amber overlay on header
    if (activePct > 0 && activePct < 100) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.4;
      ctx.fillStyle = '#e3b341';
      ctx.beginPath();
      ctx.roundRect(x, y, w, HEADER_H, [8, 8, 0, 0]);
      ctx.fill();
      ctx.restore();
    }

    // Preset highlight border
    if (def.preset) {
      ctx.strokeStyle = def.color + 'aa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.stroke();
    }

    // Label (with optional icon)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textBaseline = 'middle';
    const iconSize = 14;
    const iconImg  = this.#iconImg;
    if (iconImg?.complete && iconImg.naturalWidth > 0) {
      const textW  = ctx.measureText(def.label).width;
      const totalW = iconSize + 4 + textW;
      const startX = x + (w - totalW) / 2;
      ctx.drawImage(iconImg, startX, y + (HEADER_H - iconSize) / 2, iconSize, iconSize);
      ctx.textAlign = 'left';
      ctx.fillText(def.label, startX + iconSize + 4, y + HEADER_H / 2);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(def.label, x + w / 2, y + HEADER_H / 2);
    }

    // Price tag (top-right of header, only for non-preset elements with a price)
    if (!def.preset && def.price != null) {
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(`$${def.price}`, x + w - 5, y + HEADER_H / 2);
    }

    // Input ports (left side)
    const inKeys = inputKeys(def);
    for (let i = 0; i < inKeys.length; i++) {
      const p         = this.inputPos(i);
      const portKey   = inKeys[i];
      const spec      = def.inputs[portKey];
      const col       = PORT_COLOR[portKey] || '#888';
      const connected = connectedInputs.has(i);
      const recv      = computeResult?.received.get(`${this.id}:${i}`) ?? 0;
      const met       = recv >= spec.demand;
      const unit      = PORT_UNIT[portKey] ? ` ${PORT_UNIT[portKey]}` : '';
      const line2     = `${Math.round(recv)}/${spec.demand}${unit}`;

      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = met ? '#56d364' : '#f85149';
      ctx.fillText(portKey, x + PORT_R + 6, p.y - 6);
      ctx.fillText(line2,   x + PORT_R + 6, p.y + 6);

      ctx.beginPath();
      ctx.arc(p.x, p.y, PORT_R, 0, Math.PI * 2);
      ctx.fillStyle = connected ? col : '#21262d';
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Latency display on demand (preset, output-less) elements
    if (def.preset && outputKeys(def).length === 0 && computeResult) {
      const lat      = computeResult.latency?.get(this) ?? 0;
      const labelY   = y + h - LATENCY_ROW_H / 2;
      const required = def.requiredLatency;
      const unmet    = required != null && lat > required;

      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (unmet) {
        // Heartbeat: pulse brightness between dim red and bright red
        const PULSE   = 800; // ms per cycle
        const beat    = (now % PULSE) / PULSE;           // 0→1
        const bright  = Math.sin(beat * Math.PI * 2) * 0.5 + 0.5; // 0→1 sinusoidal
        const r       = Math.round(248);
        const g       = Math.round(81  * (1 - bright * 0.4));
        const b       = Math.round(73  * (1 - bright * 0.4));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.shadowColor = '#f85149';
        ctx.shadowBlur  = 4 + bright * 6;
      } else {
        ctx.fillStyle   = latencyHovered ? '#c9d1d9' : '#8b949e';
        ctx.shadowBlur  = 0;
      }

      const label = required != null ? `latency: ${lat}/${required}` : `latency: ${lat}`;
      ctx.fillText(label, x + w / 2, labelY);
      ctx.shadowBlur = 0;
    }

    // Output ports (right side)
    const outKeys = outputKeys(def);
    for (let i = 0; i < outKeys.length; i++) {
      const p       = this.outputPos(i);
      const portKey = outKeys[i];
      const spec    = def.outputs[portKey];
      const col     = PORT_COLOR[portKey] || '#888';
      const flowVal = computeResult?.flow.get(`${this.id}:${i}`) ?? 0;
      const unit    = PORT_UNIT[portKey] ? ` ${PORT_UNIT[portKey]}` : '';
      const line2   = `${Math.round(flowVal)}/${spec.supply}${unit}`;

      ctx.fillStyle = '#8b949e';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(portKey, x + w - PORT_R - 6, p.y - 6);
      ctx.fillText(line2,   x + w - PORT_R - 6, p.y + 6);

      ctx.beginPath();
      ctx.arc(p.x, p.y, PORT_R, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = '#ffffff66';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }
}
