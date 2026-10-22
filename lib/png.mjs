// Minimal PNG writer and GitHub-style pictures of planned graphs.
import { crc32, deflateSync } from 'node:zlib';
import { ROWS, cellDate, contributionWindow, renderText } from './art.mjs';

const WHITE = [255, 255, 255];
const LABEL = [87, 96, 106];
const LEVELS = [
  [235, 237, 240],
  [155, 233, 168],
  [64, 196, 99],
  [48, 161, 78],
  [33, 110, 57],
];

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

// rgb: Buffer of width * height * 3 bytes.
export function encodePng(width, height, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

class Canvas {
  constructor(width, height) {
    Object.assign(this, { width, height, rgb: Buffer.alloc(width * height * 3) });
    this.rect(0, 0, width, height, WHITE);
  }

  rect(x0, y0, w, h, color) {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) this.rgb.set(color, (y * this.width + x) * 3);
    }
  }

  png() {
    return encodePng(this.width, this.height, this.rgb);
  }
}

// One panel: the graph GitHub shows on `view` (default the plan's day) for the plan's commits,
// with an optional label above it.
export function sheetPng(panels, { cell = 12, gap = 3, pad = 16 } = {}) {
  const pitch = cell + gap;
  const scale = 3;
  const labelHeight = ROWS * scale + 10;
  const graphHeight = ROWS * pitch - gap;
  const panelHeight = (label) => (label ? labelHeight : 0) + graphHeight + pad;
  const width = pad * 2 + 53 * pitch - gap;
  const canvas = new Canvas(width, pad + panels.reduce((sum, panel) => sum + panelHeight(panel.label), 0));
  let top = pad;
  for (const { plan, view = plan.today, label } of panels) {
    if (label) {
      const { rows } = renderText({ font: '5x7', text: label, letterSpacing: 1, glyphs: {}, textLevel: 4 });
      rows.forEach((line, r) => line.forEach((on, c) => on && canvas.rect(pad + c * scale, top + r * scale, scale, scale, LABEL)));
      top += labelHeight;
    }
    const levels = new Map(plan.days.map((day) => [day.date, day.level]));
    const window = contributionWindow(view);
    for (let c = 0; c < window.columns; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        const date = cellDate(window, c, r);
        if (date <= view) canvas.rect(pad + c * pitch, top + r * pitch, cell, cell, LEVELS[levels.get(date) ?? 0]);
      }
    }
    top += graphHeight + pad;
  }
  return canvas.png();
}

export function graphPng(plan, options = {}) {
  return sheetPng([{ plan }], { cell: 20, gap: 5, pad: 20, ...options });
}
