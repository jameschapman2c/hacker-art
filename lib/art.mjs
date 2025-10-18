// Pure planning: config, contribution window, text rendering and placement. No I/O, no clock.
import { createHash } from 'node:crypto';
import { FONTS } from './font.mjs';

export const ROWS = 7;
const DAY_MS = 86_400_000;

export const DEFAULTS = {
  text: 'HACKER',
  font: '5x7',
  glyphs: {},
  letterSpacing: 1,
  align: 'center',
  offset: 0,
  margin: { left: 1, right: 0 },
  textLevel: 4,
  levels: { 1: 1, 2: 3, 3: 6, 4: 10 },
  icon: { enabled: true, align: 'center', gap: 2, offset: 0, level: 4 },
  icons: {},
  background: { density: 0, level: 1, seed: 'hacker-art', clear: {} },
  author: { name: 'jameschapman2c', email: 'james@twoscomplement.io' },
  time: '12:00:00',
  timezone: '+0000',
  message: 'gitfiti',
  baseMessage: 'Add project files',
};

export function parseDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || formatDate(date) !== value) {
    throw new Error(`Invalid date "${value}", expected YYYY-MM-DD`);
  }
  return date;
}

export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(value, days) {
  return formatDate(new Date(parseDate(value).getTime() + days * DAY_MS));
}

function daysBetween(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / DAY_MS);
}

function offsetMinutes(timezone) {
  const match = /^([+-])(\d{2})(\d{2})$/.exec(timezone);
  if (!match) throw new Error(`Invalid timezone "${timezone}", expected +HHMM or -HHMM`);
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

// The calendar date at instant `now` in a fixed UTC offset.
export function todayIn(timezone, now = new Date()) {
  return formatDate(new Date(now.getTime() + offsetMinutes(timezone) * 60_000));
}

// Unix seconds for `date` at `time` in a fixed UTC offset.
export function epochSeconds(date, time, timezone) {
  const [h, m, s] = time.split(':').map(Number);
  const utc = parseDate(date).getTime() + ((h * 60 + m) * 60 + s) * 1000;
  return Math.round(utc / 1000) - offsetMinutes(timezone) * 60;
}

export function loadConfig(raw = {}) {
  const config = {
    ...DEFAULTS,
    ...raw,
    margin: { ...DEFAULTS.margin, ...raw.margin },
    levels: { ...DEFAULTS.levels, ...raw.levels },
    icon: { ...DEFAULTS.icon, ...raw.icon },
    icons: { ...raw.icons },
    background: { ...DEFAULTS.background, ...raw.background, clear: { ...raw.background?.clear } },
    author: { ...DEFAULTS.author, ...raw.author },
    glyphs: { ...raw.glyphs },
  };
  const fail = (message) => {
    throw new Error(`Config: ${message}`);
  };
  if (typeof config.text !== 'string' || !config.text.length) fail('text must be a non-empty string');
  if (!FONTS[config.font]) fail(`unknown font "${config.font}" (have ${Object.keys(FONTS).join(', ')})`);
  if (!['left', 'center', 'right'].includes(config.align)) fail('align must be left, center or right');
  for (const key of ['letterSpacing', 'offset']) {
    if (!Number.isInteger(config[key])) fail(`${key} must be an integer`);
  }
  if (config.letterSpacing < 0) fail('letterSpacing must not be negative');
  for (const side of ['left', 'right']) {
    if (!Number.isInteger(config.margin[side]) || config.margin[side] < 0) fail(`margin.${side} must be a non-negative integer`);
  }
  for (const level of ['1', '2', '3', '4']) {
    const commits = config.levels[level];
    if (!Number.isInteger(commits) || commits < 1) fail(`levels.${level} must be a positive integer`);
  }
  const isLevel = (level) => ['1', '2', '3', '4'].includes(String(level));
  if (!isLevel(config.textLevel)) fail('textLevel must be 1 to 4');
  const { icon, background } = config;
  if (typeof icon.enabled !== 'boolean') fail('icon.enabled must be true or false');
  if (!['left', 'center', 'right'].includes(icon.align)) fail('icon.align must be left, center or right');
  if (!Number.isInteger(icon.gap) || icon.gap < 0 || !Number.isInteger(icon.offset)) fail('icon.gap and icon.offset must be integers, gap not negative');
  if (!isLevel(icon.level)) fail('icon.level must be 1 to 4');
  for (const [month, rows] of Object.entries(config.icons)) {
    if (!/^([1-9]|1[0-2])$/.test(month)) fail(`icons keys are months 1 to 12, not "${month}"`);
    checkGlyph(`icons.${month}`, rows, fail);
  }
  if (typeof background.density !== 'number' || background.density < 0 || background.density > 1) fail('background.density must be 0 to 1');
  if (!isLevel(background.level)) fail('background.level must be 1 to 4');
  if (typeof background.seed !== 'string') fail('background.seed must be a string');
  for (const [kind, columns] of Object.entries(background.clear)) {
    if (!['text', 'icon'].includes(kind) || !Number.isInteger(columns) || columns < 0) {
      fail('background.clear maps text or icon to the columns kept clear on each side');
    }
  }
  if (!config.author.name || !/^[^\s<>@]+@[^\s<>@]+$/.test(config.author.email)) fail('author needs a name and an email');
  if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(config.time)) fail('time must be HH:MM:SS');
  offsetMinutes(config.timezone);
  for (const key of ['message', 'baseMessage']) {
    if (typeof config[key] !== 'string' || !config[key].trim()) fail(`${key} must be a non-empty string`);
  }
  for (const [char, rows] of Object.entries(config.glyphs)) checkGlyph(char, rows, fail);
  return config;
}

function checkGlyph(char, rows, fail) {
  if (!Array.isArray(rows) || rows.length !== ROWS) fail(`glyph "${char}" needs ${ROWS} rows`);
  if (rows.some((row) => typeof row !== 'string' || row.length !== rows[0].length || !/^[.#1-4]*$/.test(row))) {
    fail(`glyph "${char}" rows must be equal-width strings of . # 1 2 3 4`);
  }
}

function glyphLevels(rows, lit) {
  return rows.map((line) => [...line].map((cell) => (cell === '.' ? 0 : cell === '#' ? lit : Number(cell))));
}

// Renders text to a ROWS x width grid of levels 0 to 4.
export function renderText(config) {
  const font = { ...FONTS[config.font], ...config.glyphs };
  const lit = Number(config.textLevel);
  const rows = Array.from({ length: ROWS }, () => []);
  [...config.text].forEach((raw, index) => {
    const char = font[raw] ? raw : raw.toUpperCase();
    const glyph = font[char];
    if (!glyph) throw new Error(`No glyph for "${raw}" in font ${config.font}; add it under "glyphs"`);
    if (index > 0) rows.forEach((row) => row.push(...Array(config.letterSpacing).fill(0)));
    glyphLevels(glyph, lit).forEach((line, r) => rows[r].push(...line));
  });
  return { width: rows[0].length, rows };
}

// GitHub's profile graph: 53 week columns (Sunday to Saturday), the last one ending today.
export function contributionWindow(today) {
  parseDate(today);
  const yearAgo = addDays(today, -52 * 7);
  const start = addDays(yearAgo, -parseDate(yearAgo).getUTCDay());
  const days = daysBetween(start, today) + 1;
  return { start, end: today, columns: Math.ceil(days / 7), fullColumns: Math.floor(days / 7) };
}

export function cellDate(window, column, row) {
  return addDays(window.start, column * 7 + row);
}

// Chooses the first column for the art among the fully visible columns inside the margins.
export function placeArt(width, window, config) {
  const first = config.margin.left;
  const last = window.fullColumns - 1 - config.margin.right;
  const available = last - first + 1;
  if (width > available) {
    throw new Error(`Art is ${width} columns wide but only ${Math.max(available, 0)} fit (columns ${first} to ${last})`);
  }
  const aligned = { left: first, center: first + Math.floor((available - width) / 2), right: last - width + 1 }[config.align];
  const column = aligned + config.offset;
  if (column < first || column + width - 1 > last) {
    throw new Error(`offset ${config.offset} moves the art outside columns ${first} to ${last}`);
  }
  return column;
}

export function monthOf(date) {
  return parseDate(date).getUTCMonth() + 1;
}

// The month's icon, placed in the free columns right of the text. Null when there is none.
export function placeIcon(config, window, textEnd, month) {
  const rows = config.icons[month];
  if (!config.icon.enabled || !rows) return null;
  const width = rows[0].length;
  const first = textEnd + 1 + config.icon.gap;
  const last = window.fullColumns - 1 - config.margin.right;
  const available = last - first + 1;
  if (width > available) throw new Error(`Icon for month ${month} is ${width} columns wide but only ${Math.max(available, 0)} fit right of the text`);
  const aligned = { left: first, center: first + Math.floor((available - width) / 2), right: last - width + 1 }[config.icon.align];
  const column = aligned + config.icon.offset;
  if (column < first || column + width - 1 > last) throw new Error(`icon.offset ${config.icon.offset} moves the icon outside columns ${first} to ${last}`);
  return { month, column, width, rows: glyphLevels(rows, Number(config.icon.level)) };
}

// A fixed pseudo-random number in [0, 1) for a calendar day, so the background stays put between refreshes.
export function dayNoise(seed, date) {
  return createHash('sha256').update(`${seed}:${date}`).digest().readUInt32BE(0) / 2 ** 32;
}

// The whole plan for a config and a date: which days get how many commits.
// `month` swaps the icon for previews; publishing always uses today's month.
export function planArt(config, today, { month = monthOf(today) } = {}) {
  const window = contributionWindow(today);
  const art = renderText(config);
  const firstColumn = placeArt(art.width, window, config);
  const icon = placeIcon(config, window, firstColumn + art.width - 1, month);
  const cells = new Map();
  const paint = (column, rows, kind) => {
    rows.forEach((line, r) =>
      line.forEach((level, c) => {
        if (level) cells.set(cellDate(window, column + c, r), { level, kind });
      }),
    );
  };
  paint(firstColumn, art.rows, 'text');
  if (icon) paint(icon.column, icon.rows, 'icon');
  const { density, level, seed, clear } = config.background;
  const bands = [
    ['text', firstColumn, art.width],
    ['icon', icon?.column, icon?.width],
  ].filter(([kind, column]) => clear[kind] !== undefined && column !== undefined);
  const cleared = (column) => bands.some(([kind, start, width]) => column >= start - clear[kind] && column < start + width + clear[kind]);
  for (let date = window.start; date <= today; date = addDays(date, 1)) {
    const column = Math.floor(daysBetween(window.start, date) / 7);
    if (!cells.has(date) && !cleared(column) && dayNoise(seed, date) < density) {
      cells.set(date, { level: Number(level), kind: 'background' });
    }
  }
  const days = [...cells]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, cell]) => ({ date, ...cell, commits: config.levels[cell.level] }));
  const total = days.reduce((sum, day) => sum + day.commits, 0);
  return { today, window, art, firstColumn, icon, days, total, baseDate: addDays(window.start, -1) };
}

// Text picture of the planned graph: rows are weekdays, '.' empty, 1 to 4 a level, blank after today.
export function asciiGraph(plan) {
  const levels = new Map(plan.days.map((day) => [day.date, day.level]));
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return names
    .map((name, r) => {
      let line = `${name} `;
      for (let c = 0; c < plan.window.columns; c += 1) {
        const date = cellDate(plan.window, c, r);
        line += date > plan.today ? ' ' : String(levels.get(date) ?? '.');
      }
      return line.trimEnd();
    })
    .join('\n');
}
