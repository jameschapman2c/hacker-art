// Pure planning: config, contribution window, text rendering and placement. No I/O, no clock.
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
  if (!['1', '2', '3', '4'].includes(String(config.textLevel))) fail('textLevel must be 1 to 4');
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
    glyph.forEach((line, r) => {
      for (const cell of line) rows[r].push(cell === '.' ? 0 : cell === '#' ? lit : Number(cell));
    });
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

// The whole plan for a config and a date: which days get how many commits.
export function planArt(config, today) {
  const window = contributionWindow(today);
  const art = renderText(config);
  const firstColumn = placeArt(art.width, window, config);
  const days = [];
  for (let c = 0; c < art.width; c += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const level = art.rows[r][c];
      if (level) days.push({ date: cellDate(window, firstColumn + c, r), level, commits: config.levels[level] });
    }
  }
  const total = days.reduce((sum, day) => sum + day.commits, 0);
  return { today, window, art, firstColumn, days, total, baseDate: addDays(window.start, -1) };
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
