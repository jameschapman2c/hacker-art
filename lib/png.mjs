// Minimal PNG writer and a GitHub-style picture of the planned graph.
import { crc32, deflateSync } from 'node:zlib';
import { ROWS, cellDate } from './art.mjs';

const COLORS = {
  background: [255, 255, 255],
  future: [255, 255, 255],
  levels: [
    [235, 237, 240],
    [155, 233, 168],
    [64, 196, 99],
    [48, 161, 78],
    [33, 110, 57],
  ],
};

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

export function graphPng(plan, { cell = 20, gap = 5, pad = 20 } = {}) {
  const levels = new Map(plan.days.map((day) => [day.date, day.level]));
  const width = pad * 2 + plan.window.columns * (cell + gap) - gap;
  const height = pad * 2 + ROWS * (cell + gap) - gap;
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) rgb.set(COLORS.background, i * 3);
  for (let c = 0; c < plan.window.columns; c += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const date = cellDate(plan.window, c, r);
      const color = date > plan.today ? COLORS.future : COLORS.levels[levels.get(date) ?? 0];
      const x0 = pad + c * (cell + gap);
      const y0 = pad + r * (cell + gap);
      for (let y = y0; y < y0 + cell; y += 1) {
        for (let x = x0; x < x0 + cell; x += 1) rgb.set(color, (y * width + x) * 3);
      }
    }
  }
  return encodePng(width, height, rgb);
}
