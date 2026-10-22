import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  asciiGraph,
  cellDate,
  contributionWindow,
  epochSeconds,
  loadConfig,
  placeArt,
  planArt,
  renderText,
  todayIn,
} from '../lib/art.mjs';
import { graphPng } from '../lib/png.mjs';

const config = (overrides = {}) => loadConfig({ ...JSON.parse(readFileSync(new URL('../art.config.json', import.meta.url))), ...overrides });

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
  const window = contributionWindow('2026-10-22'); // 52 full columns, margin.left 1: columns 1 to 51
  assert.equal(placeArt(35, window, config({ align: 'left' })), 1);
  assert.equal(placeArt(35, window, config({ align: 'right' })), 17);
  assert.equal(placeArt(35, window, config({ align: 'center' })), 9);
  assert.equal(placeArt(35, window, config({ align: 'center', offset: -8 })), 1);
  assert.equal(placeArt(35, window, config({ align: 'right', margin: { right: 3 } })), 14);
  assert.throws(() => placeArt(35, window, config({ align: 'center', offset: 9 })), /outside columns 1 to 51/);
  assert.throws(() => placeArt(52, window, config()), /52 columns wide but only 51 fit/);
});

test('plan puts every pixel on a visible day in the window, never after today', () => {
  for (const today of ['2026-10-22', '2026-10-24', '2026-10-25', '2027-01-01']) {
    for (const align of ['left', 'center', 'right']) {
      const plan = planArt(config({ align }), today);
      assert.equal(plan.days.length, 98);
      assert.equal(plan.total, 980);
      for (const day of plan.days) {
        assert.ok(day.date >= plan.window.start && day.date <= today, `${day.date} outside window for ${today}`);
        assert.equal(day.commits, 10);
      }
      assert.ok(plan.baseDate < plan.window.start);
    }
  }
});

test('the plan for 2026-10-22 is the original art shifted into the current window', () => {
  const plan = planArt(config(), '2026-10-22');
  assert.equal(plan.firstColumn, 9);
  assert.equal(plan.days[0].date, '2025-12-21');
  assert.equal(plan.days.at(-1).date, '2026-08-22');
  const lines = asciiGraph(plan).split('\n').map((line) => line.slice(4 + 9, 4 + 9 + 35).replaceAll('4', '#').replace(/\.+$/, ''));
  assert.deepEqual(lines, ORIGINAL_ART);
});

test('planning is deterministic', () => {
  assert.deepEqual(planArt(config({ text: 'Hello 2C!' }), '2026-10-22'), planArt(config({ text: 'Hello 2C!' }), '2026-10-22'));
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
