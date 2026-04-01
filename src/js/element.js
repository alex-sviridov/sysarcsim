import { ELEM_W, HEADER_H, ROW_H, PORT_R, PORT_HIT, PORT_COLOR } from './config.js';

let _elemCounter = 0;

export class GameElement {
  constructor(type, x, y, def) {
    this.id   = `elem_${_elemCounter++}`;
    this.type = type;
    this.def  = def;
    this.x    = x;
    this.y    = y;
    const rows = Math.max(def.inputs.length, def.outputs.length, 1);
    this.w = ELEM_W;
    this.h = HEADER_H + rows * ROW_H;

    if (def.icon) {
      this._iconImg = new Image();
      this._iconImg.src = 'data:image/svg+xml,' + encodeURIComponent(def.icon.replace(/currentColor/g, '#ffffff'));
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
    for (let i = 0; i < this.def.inputs.length; i++) {
      const p = this.inputPos(i);
      if (Math.hypot(px - p.x, py - p.y) < PORT_HIT) return i;
    }
    return -1;
  }

  hitOutputPort(px, py) {
    for (let i = 0; i < this.def.outputs.length; i++) {
      const p = this.outputPos(i);
      if (Math.hypot(px - p.x, py - p.y) < PORT_HIT) return i;
    }
    return -1;
  }

  draw(ctx, connectedInputs, isActive) {
    const { x, y, w, h, def } = this;

    ctx.save();
    if (!isActive) ctx.globalAlpha = 0.38;

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
    const iconImg  = this._iconImg;
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

    // Input ports (left side)
    for (let i = 0; i < def.inputs.length; i++) {
      const p         = this.inputPos(i);
      const type      = def.inputs[i];
      const col       = PORT_COLOR[type] || '#888';
      const connected = connectedInputs.has(i);

      ctx.fillStyle = '#8b949e';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(type, x + PORT_R + 6, p.y);

      ctx.beginPath();
      ctx.arc(p.x, p.y, PORT_R, 0, Math.PI * 2);
      ctx.fillStyle = connected ? col : '#21262d';
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Output ports (right side)
    for (let i = 0; i < def.outputs.length; i++) {
      const p    = this.outputPos(i);
      const type = def.outputs[i];
      const col  = PORT_COLOR[type] || '#888';

      ctx.fillStyle = '#8b949e';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(type, x + w - PORT_R - 6, p.y);

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
