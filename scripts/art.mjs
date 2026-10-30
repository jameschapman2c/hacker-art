// CLI for the contribution graph art. See README.md.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { addDays, asciiGraph, loadConfig, planArt, todayIn } from '../lib/art.mjs';
import { buildHistory, commitsPerDay, compareWithPlan, git } from '../lib/git.mjs';
import { graphPng, sheetPng } from '../lib/png.mjs';

const USAGE = `usage: bin/art <command> [options]

commands:
  preview          print the planned graph and write a PNG of it
                   --months: one panel per month icon; --refresh <days>: as published, as seen
                   <days> later, and after a refresh then
  build            build the history on a local branch and check it (no push)
  verify [ref]     count commits per day on ref (default the art repository's main) against the plan
  calendar         compare the account's live GitHub calendar with the plan; --out draws it
  publish          create the art repository (config "repo") and push the history to it; a dry
                   run unless --yes. Exits 3 when the repository holds other art: delete it first

options:
  --config <file>  config file (default art.config.json)
  --today <date>   last day of the graph, YYYY-MM-DD (default today in the config timezone)
  --out <file>     preview PNG (default tmp/art-preview.png)
  --month <1-12>   preview with this month's icon
  --branch <name>  branch for build (default art/preview)
  --repo <dir>     checkout to work in (default this one)
  --remote <path>  publish to a local bare repository instead of GitHub (tests)
  --yes            publish for real
  --push-limit <n> most new commits per push (default 500; GitHub counts only the newest 1000 of a push)`;

let repo = resolve(dirname(new URL(import.meta.url).pathname), '..');

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string', default: 'art.config.json' },
      today: { type: 'string' },
      out: { type: 'string' },
      month: { type: 'string' },
      months: { type: 'boolean', default: false },
      refresh: { type: 'string' },
      branch: { type: 'string', default: 'art/preview' },
      repo: { type: 'string' },
      remote: { type: 'string' },
      yes: { type: 'boolean', default: false },
      'push-limit': { type: 'string', default: '500' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ref] = positionals;
  if (values.help || !command) return console.log(USAGE);
  if (values.repo) repo = resolve(values.repo);
  const config = loadConfig(JSON.parse(readFileSync(resolve(repo, values.config), 'utf8')));
  const today = values.today ?? todayIn(config.timezone);
  const commands = { preview, build, verify, publish, calendar };
  if (!commands[command]) throw new Error(`Unknown command "${command}"\n\n${USAGE}`);
  if (values.month && command !== 'preview') throw new Error('--month is only for preview');
  if (values.month && !/^([1-9]|1[0-2])$/.test(values.month)) throw new Error('--month must be 1 to 12');
  if (values.refresh && !/^[1-9]\d*$/.test(values.refresh)) throw new Error('--refresh must be a number of days');
  if (!/^[1-9]\d*$/.test(values['push-limit'])) throw new Error('--push-limit must be a positive integer');
  const plan = planArt(config, today, values.month ? { month: Number(values.month) } : {});
  return commands[command]({ config, plan, values, ref });
}

function summary(config, plan) {
  const { window, art, firstColumn, days } = plan;
  console.log(`text      ${JSON.stringify(config.text)} (${art.width} columns, ${config.align}, offset ${config.offset})`);
  console.log(`graph     ${window.start} to ${window.end}, ${window.columns} weeks; art in columns ${firstColumn} to ${firstColumn + art.width - 1}`);
  const icon = plan.icon ? `${MONTHS[plan.icon.month - 1]} icon in columns ${plan.icon.column} to ${plan.icon.column + plan.icon.width - 1}` : 'no icon';
  console.log(`extras    ${icon}, ${days.filter((day) => day.kind === 'background').length} background days`);
  console.log(`art days  ${days[0]?.date} to ${days.at(-1)?.date}, ${days.length} days, ${plan.total} commits`);
  console.log(`author    ${config.author.name} <${config.author.email}>, ${config.time} ${config.timezone}`);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function preview({ config, plan, values }) {
  summary(config, plan);
  console.log(`\n${asciiGraph(plan)}\n`);
  let png;
  if (values.months) {
    png = sheetPng(MONTHS.map((name, i) => ({ label: name, plan: planArt(config, plan.today, { month: i + 1 }) })));
  } else if (values.refresh) {
    const later = addDays(plan.today, Number(values.refresh));
    png = sheetPng([
      { label: `${plan.today}: published`, plan },
      { label: `${later}: before the refresh`, plan, view: later },
      { label: `${later}: after the refresh`, plan: planArt(config, later) },
    ]);
  } else {
    png = graphPng(plan);
  }
  const out = resolve(repo, values.out ?? 'tmp/art-preview.png');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`preview   ${out}`);
}

function check(config, plan, ref) {
  const mismatches = compareWithPlan(plan, commitsPerDay(repo, ref, config.author.email));
  for (const day of mismatches) console.log(`mismatch  ${day.date}: expected ${day.expected}, found ${day.actual}`);
  if (mismatches.length) throw new Error(`${mismatches.length} days on ${ref} differ from the plan`);
  console.log(`check     ${ref}: every day in the graph matches the plan`);
}

function build({ config, plan, values }) {
  summary(config, plan);
  const tip = buildHistory(repo, config, plan);
  git(repo, ['update-ref', `refs/heads/${values.branch}`, tip]);
  console.log(`built     ${values.branch} at ${tip}`);
  check(config, plan, values.branch);
}

// Where the art goes: the config's GitHub repository, or a local bare repository (--remote <path>).
function target(config, values) {
  const remote = values.remote ? resolve(values.remote) : null;
  return {
    url: remote ?? `https://github.com/${config.repo}.git`,
    name: remote ?? config.repo,
    settings: `https://github.com/${config.repo}/settings`,
    exists: () => (remote ? existsSync(remote) : gh(['api', `repos/${config.repo}`, '--silent'], { allowNotFound: true })),
    create: () => (remote ? git(repo, ['init', '-q', '--bare', '-b', 'main', remote]) : gh(['repo', 'create', config.repo, '--public', '--description', DESCRIPTION])),
  };
}

const DESCRIPTION = 'Contribution graph art from jameschapman2c/hacker-art, recreated every month';

function gh(args, { allowNotFound = false } = {}) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (allowNotFound && /HTTP 404|Not Found/.test(result.stderr)) return false;
  throw new Error(`gh ${args.join(' ')} failed: ${result.stderr.trim()}`);
}

function remoteMain(url) {
  const line = git(repo, ['ls-remote', url, 'refs/heads/main']);
  return line ? line.split('\t')[0] : null;
}

function verify({ config, plan, values, ref }) {
  summary(config, plan);
  if (!ref) {
    const art = target(config, values);
    git(repo, ['fetch', '-q', art.url, '+refs/heads/main:refs/art/main']);
    ref = 'refs/art/main';
  }
  check(config, plan, ref);
}

const QUERY = `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar {
  totalContributions weeks { contributionDays { date contributionCount contributionLevel } } } } } }`;
const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

// What GitHub shows today for the art repository's owner, day by day, against the plan. Days with
// more than planned are usually real activity; fewer means GitHub has not counted the art.
function calendar({ config, plan, values }) {
  summary(config, plan);
  const login = config.repo.split('/')[0];
  const result = spawnSync('gh', ['api', 'graphql', '-f', `query=${QUERY}`, '-f', `login=${login}`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`GitHub calendar query failed: ${result.stderr.trim()}`);
  const { totalContributions, weeks } = JSON.parse(result.stdout).data.user.contributionsCollection.contributionCalendar;
  const days = weeks.flatMap((week) => week.contributionDays);
  const planned = new Map(plan.days.map((day) => [day.date, day]));
  const buckets = new Map();
  for (const { date, contributionCount } of days) {
    const day = planned.get(date);
    const key = `${day ? `${day.kind} ${day.commits}` : 'empty 0'} -> ${contributionCount}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  console.log(`github    ${login}: ${totalContributions} contributions; planned commits -> GitHub count: days`);
  for (const [key, count] of [...buckets].sort()) console.log(`          ${key}: ${count}`);
  const missing = plan.days.filter((day) => (days.find((d) => d.date === day.date)?.contributionCount ?? 0) < day.commits);
  console.log(`missing   ${missing.length} planned days show fewer commits than planned`);
  if (values.out) {
    const out = resolve(repo, values.out);
    mkdirSync(dirname(out), { recursive: true });
    const live = { today: days.at(-1).date, days: days.map((d) => ({ date: d.date, level: LEVELS[d.contributionLevel] })) };
    writeFileSync(out, graphPng(live));
    console.log(`live      ${out}`);
  }
}

// Creates the art repository when it is missing and pushes the plan's history to it. An existing
// repository holding other art must be deleted by hand first (exit 3): GitHub keeps counting commits
// that a force-push removes, so a refresh never rewrites the repository.
function publish({ config, plan, values }) {
  summary(config, plan);
  const art = target(config, values);
  const tip = buildHistory(repo, config, plan);
  check(config, plan, tip);
  const exists = art.exists();
  const current = exists ? remoteMain(art.url) : null;
  if (current === tip) return console.log(`publish   ${art.name} already holds this art (${tip}); nothing to do`);
  const chain = git(repo, ['rev-list', '--reverse', tip]).split('\n');
  if (current && !chain.includes(current)) {
    throw Object.assign(new Error(`${art.name} holds other art (${current}). Delete the repository first: ${art.settings}`), { exitCode: 3 });
  }
  const stops = pushStops(chain, current, Number(values['push-limit']));
  const action = `${exists ? '' : 'create it, then '}push ${tip} in ${stops.length} pushes`;
  if (!values.yes) return console.log(`dry run   ${art.name}: would ${action}; rerun with --yes to publish`);
  if (!exists) {
    art.create();
    console.log(`created   ${art.name}`);
  }
  // GitHub counts only the newest 1000 commits of a push toward contributions, so the history goes
  // up in steps.
  stops.forEach((stop, i) => {
    git(repo, ['push', '-q', art.url, `${stop}:refs/heads/main`]);
    console.log(`pushed    ${i + 1}/${stops.length} ${stop}`);
  });
  console.log(`published ${art.name} at ${tip}`);
}

// Commits to push in order so that no push adds more than `limit` commits. When the art repository
// already holds part of the history (an interrupted publish), it continues from there.
function pushStops(chain, current, limit) {
  const stops = [];
  for (let i = chain.indexOf(current) + limit; i < chain.length - 1; i += limit) stops.push(chain[i]);
  return [...stops, chain.at(-1)];
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`art: ${error.message}`);
  process.exit(error.exitCode ?? 1);
}
