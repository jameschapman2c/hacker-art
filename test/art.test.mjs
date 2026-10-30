import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  asciiGraph,
  cellDate,
  contributionWindow,
  dayNoise,
  epochSeconds,
  loadConfig,
  placeArt,
  planArt,
  renderText,
  todayIn,
} from '../lib/art.mjs';
import { graphPng, sheetPng } from '../lib/png.mjs';

const config = (overrides = {}) => loadConfig({ ...JSON.parse(readFileSync(new URL('../art.config.json', import.meta.url))), ...overrides });
// Only the text, as the generator drew it before icons and background.
const textOnly = (overrides = {}) => config({ icon: { enabled: false }, background: { density: 0 }, ...overrides });

// The art on main before the generator, decoded from its commits (weeks from Sunday 2025-06-01).
const ORIGINAL_ART = [
  '#...#..###...####.#...#.#####.####',
  '#...#.#...#.#.....#..#..#.....#...#',
  '#...#.#...#.#.....#.#...#.....#...#',
  '#####.#####.#.....##....####..####',
  '#...#.#...#.#.....#.#...#.....#.#',
  '#...#.#...#.#.....#..#..#.....#..#',
  '#...#.#...#..####.#...#.#####.#...#',
];

test('window matches GitHub: 53 Sunday-first weeks ending today', () => {
  // GitHub's calendar for jameschapman2c on 2026-10-22 starts on Sunday 2025-10-19.
  assert.deepEqual(contributionWindow('2026-10-22'), { start: '2025-10-19', end: '2026-10-22', columns: 53, fullColumns: 52 });
  // On a Saturday the last week is complete.
  assert.deepEqual(contributionWindow('2026-10-24'), { start: '2025-10-19', end: '2026-10-24', columns: 53, fullColumns: 53 });
  // On a Sunday the window moves on a week and the last column holds one day.
  assert.deepEqual(contributionWindow('2026-10-25'), { start: '2025-10-26', end: '2026-10-25', columns: 53, fullColumns: 52 });
  // Across a leap day.
  assert.deepEqual(contributionWindow('2028-03-01'), { start: '2027-02-28', end: '2028-03-01', columns: 53, fullColumns: 52 });
  assert.equal(cellDate(contributionWindow('2026-10-22'), 52, 4), '2026-10-22');
});

test('today and timestamps use the fixed config timezone', () => {
  const now = new Date('2026-10-23T03:00:00Z');
  assert.equal(todayIn('+0000', now), '2026-10-23');
  assert.equal(todayIn('-0600', now), '2026-10-22');
  assert.equal(todayIn('+0530', new Date('2026-10-22T18:30:00Z')), '2026-10-23');
  assert.equal(epochSeconds('2026-10-22', '12:00:00', '+0000'), Date.UTC(2026, 9, 22, 12) / 1000);
  assert.equal(epochSeconds('2026-10-22', '12:00:00', '-0600'), Date.UTC(2026, 9, 22, 18) / 1000);
});

test('the default font reproduces the original HACKER art', () => {
  const { rows, width } = renderText(config());
  assert.equal(width, 35);
  assert.deepEqual(
    rows.map((row) => row.map((level) => (level ? '#' : '.')).join('').replace(/\.+$/, '')),
    ORIGINAL_ART,
  );
});

test('text rendering: lowercase, spacing, custom glyphs and levels', () => {
  const hi = renderText(config({ text: 'hi', letterSpacing: 2 }));
  assert.equal(hi.width, 12);
  assert.deepEqual(hi.rows[3], [4, 4, 4, 4, 4, 0, 0, 0, 0, 4, 0, 0]);
  const custom = renderText(config({ text: 'x', glyphs: { x: ['1', '2', '3', '4', '#', '.', '#'] }, textLevel: 2 }));
  assert.deepEqual(custom.rows.map((row) => row[0]), [1, 2, 3, 4, 2, 0, 2]);
  assert.throws(() => renderText(config({ text: 'H~' })), /No glyph for "~"/);
});

test('placement aligns inside the fully visible columns and margins', () => {
  const window = contributionWindow('2026-10-22'); // 52 full columns, margin.left 5: columns 5 to 51
  assert.equal(placeArt(35, window, config()), 5, 'five weeks of padding on the left, one monthly refresh');
  assert.equal(placeArt(35, window, config({ align: 'right' })), 17);
  assert.equal(placeArt(35, window, config({ align: 'center' })), 11);
  assert.equal(placeArt(35, window, config({ align: 'center', offset: -6 })), 5);
  assert.equal(placeArt(35, window, config({ align: 'right', margin: { right: 3 } })), 14);
  assert.throws(() => placeArt(35, window, config({ align: 'center', offset: -7 })), /outside columns 5 to 51/);
  assert.throws(() => placeArt(48, window, config()), /48 columns wide but only 47 fit/);
});

test('plan puts every pixel on a visible day in the window, never after today', () => {
  for (const today of ['2026-10-22', '2026-10-24', '2026-10-25', '2027-01-01', '2027-03-15']) {
    for (const align of ['left', 'center', 'right']) {
      const text = planArt(textOnly({ align }), today);
      assert.equal(text.days.length, 98);
      assert.equal(text.total, 980);
      const plan = planArt(config(), today);
      for (const day of plan.days) {
        assert.ok(day.date >= plan.window.start && day.date <= today, `${day.date} outside window for ${today}`);
        assert.equal(day.commits, config().levels[day.level]);
      }
      assert.ok(plan.baseDate < plan.window.start);
    }
  }
});

test('the text is the original art shifted into the current window', () => {
  const plan = planArt(textOnly(), '2026-10-22');
  assert.equal(plan.firstColumn, 5);
  assert.equal(plan.days[0].date, '2025-11-23');
  const lines = asciiGraph(plan).split('\n').map((line) => line.slice(4 + 5, 4 + 5 + 35).replaceAll('4', '#').replace(/\.+$/, ''));
  assert.deepEqual(lines, ORIGINAL_ART);
  // Five weeks later, before the next monthly refresh, the same commits sit at the left edge.
  assert.equal(contributionWindow('2026-11-26').start, '2025-11-23');
});

test("the icon is today's month, centered in the free columns right of the text", () => {
  const october = planArt(config(), '2026-10-22');
  assert.deepEqual({ month: october.icon.month, column: october.icon.column, width: october.icon.width }, { month: 10, column: 43, width: 7 });
  assert.equal(planArt(config(), '2026-11-05').icon.month, 11);
  assert.equal(planArt(config(), '2026-10-22', { month: 3 }).icon.width, 9);
  const icons = october.days.filter((day) => day.kind === 'icon');
  assert.ok(icons.every((day) => day.date >= cellDate(october.window, 43, 0) && day.date <= cellDate(october.window, 49, 6)));
  assert.equal(icons.length, config().icons[10].join('').replaceAll('.', '').length);
  assert.equal(planArt(config({ icon: { enabled: false } }), '2026-10-22').icon, null);
  assert.equal(planArt(config({ icons: {} }), '2026-10-22').icon, null);
  assert.equal(planArt(config({ icon: { align: 'right' } }), '2026-10-22').icon.column, 45);
  assert.equal(planArt(config({ icon: { gap: 5 } }), '2026-10-22').icon.column, 45);
  assert.throws(() => planArt(config({ icon: { gap: 6 } }), '2026-10-22'), /Icon for month 10 is 7 columns wide but only 6 fit/);
  for (let month = 1; month <= 12; month += 1) {
    for (const today of ['2026-10-22', '2026-10-25']) assert.ok(planArt(config(), today, { month }).icon, `month ${month} fits`);
  }
});

test('background: sparse lightest shade, fixed per calendar day, clear of the art', () => {
  const plan = planArt(config(), '2026-10-22');
  const background = plan.days.filter((day) => day.kind === 'background');
  const open = 371 - plan.days.filter((day) => day.kind !== 'background').length;
  assert.ok(background.length > open * 0.1 && background.length < open * 0.3, `${background.length} of ${open}`);
  assert.ok(background.every((day) => day.level === 1 && day.commits === 1));
  const columns = background.map((day) => Math.floor((Date.parse(day.date) - Date.parse(plan.window.start)) / 86_400_000 / 7));
  assert.ok(columns.every((column) => column < 42 || column > 50), 'icon columns and one each side stay clear');
  // A refresh keeps the same background days wherever the art does not cover them.
  const later = planArt(config(), '2026-11-05');
  const laterKinds = new Map(later.days.map((day) => [day.date, day.kind]));
  for (const day of background) {
    if (day.date >= later.window.start && !['text', 'icon'].includes(laterKinds.get(day.date))) {
      const column = Math.floor((Date.parse(day.date) - Date.parse(later.window.start)) / 86_400_000 / 7);
      if (column < 42 || column > 50) assert.equal(laterKinds.get(day.date), 'background', day.date);
    }
  }
  assert.equal(dayNoise('hacker-art', '2026-01-01'), dayNoise('hacker-art', '2026-01-01'));
  assert.notEqual(dayNoise('hacker-art', '2026-01-01'), dayNoise('other', '2026-01-01'));
  assert.equal(planArt(config({ background: { density: 0 } }), '2026-10-22').days.filter((day) => day.kind === 'background').length, 0);
});

test('planning is deterministic', () => {
  assert.deepEqual(planArt(config(), '2026-10-22'), planArt(config(), '2026-10-22'));
  assert.deepEqual(planArt(textOnly({ text: 'Hello 2C!' }), '2026-10-22'), planArt(textOnly({ text: 'Hello 2C!' }), '2026-10-22'));
});

test('config validation', () => {
  assert.throws(() => config({ text: '' }), /text must be/);
  assert.throws(() => config({ align: 'middle' }), /align must be/);
  assert.throws(() => config({ levels: { 4: 0 } }), /levels.4/);
  assert.throws(() => config({ timezone: 'MST' }), /Invalid timezone/);
  assert.throws(() => config({ time: '25:00:00' }), /time must be/);
  assert.throws(() => config({ author: { email: 'nobody' } }), /author needs/);
  assert.throws(() => config({ glyphs: { x: ['#'] } }), /needs 7 rows/);
  assert.throws(() => config({ font: 'comic' }), /unknown font/);
  assert.throws(() => config({ icons: { 13: ['#', '#', '#', '#', '#', '#', '#'] } }), /months 1 to 12/);
  assert.throws(() => config({ icons: { 1: ['#'] } }), /needs 7 rows/);
  assert.throws(() => config({ icon: { level: 5 } }), /icon.level/);
  assert.throws(() => config({ background: { density: 2 } }), /density/);
  assert.throws(() => config({ background: { clear: { sky: 1 } } }), /background.clear/);
});

test('preview sheets stack labeled panels', () => {
  const plan = planArt(config(), '2026-10-22');
  const png = sheetPng([{ label: 'Published', plan }, { label: 'Later', plan, view: '2026-11-05' }], { cell: 2, gap: 1, pad: 1 });
  assert.equal(png.readUInt32BE(20), 1 + 2 * (7 * 3 + 10 + 20 + 1));
});

test('preview PNG is a valid image of the 53 by 7 grid', () => {
  const png = graphPng(planArt(config(), '2026-10-22'), { cell: 2, gap: 1, pad: 1 });
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.deepEqual([width, height], [2 + 53 * 3 - 1, 2 + 7 * 3 - 1]);
  const idatLength = png.readUInt32BE(33);
  assert.equal(png.toString('ascii', 37, 41), 'IDAT');
  assert.equal(inflateSync(png.subarray(41, 41 + idatLength)).length, (width * 3 + 1) * height);
});
