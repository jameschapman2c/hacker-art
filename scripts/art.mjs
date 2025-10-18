// CLI for the contribution graph art. See README.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  verify [ref]     count commits per day on ref (default origin/main) against the plan
  publish          build from origin/main and force-push it to main; a dry run unless --yes

options:
  --config <file>  config file (default art.config.json)
  --today <date>   last day of the graph, YYYY-MM-DD (default today in the config timezone)
  --out <file>     preview PNG (default tmp/art-preview.png)
  --month <1-12>   preview with this month's icon
  --source <ref>   project files for build (default origin/main)
  --branch <name>  branch for build (default art/preview)
  --repo <dir>     repository (default this checkout)
  --yes            publish for real`;

const REMOTE = 'origin';
let repo = resolve(dirname(new URL(import.meta.url).pathname), '..');

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string', default: 'art.config.json' },
      today: { type: 'string' },
      out: { type: 'string', default: 'tmp/art-preview.png' },
      month: { type: 'string' },
      months: { type: 'boolean', default: false },
      refresh: { type: 'string' },
      source: { type: 'string', default: `${REMOTE}/main` },
      branch: { type: 'string', default: 'art/preview' },
      repo: { type: 'string' },
      yes: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ref] = positionals;
  if (values.help || !command) return console.log(USAGE);
  if (values.repo) repo = resolve(values.repo);
  const config = loadConfig(JSON.parse(readFileSync(resolve(repo, values.config), 'utf8')));
  const today = values.today ?? todayIn(config.timezone);
  const commands = { preview, build, verify, publish };
  if (!commands[command]) throw new Error(`Unknown command "${command}"\n\n${USAGE}`);
  if (values.month && command !== 'preview') throw new Error('--month is only for preview');
  if (values.month && !/^([1-9]|1[0-2])$/.test(values.month)) throw new Error('--month must be 1 to 12');
  if (values.refresh && !/^[1-9]\d*$/.test(values.refresh)) throw new Error('--refresh must be a number of days');
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
  const out = resolve(repo, values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`preview   ${out}`);
}

function check(config, plan, ref, tree) {
  const mismatches = compareWithPlan(plan, commitsPerDay(repo, ref, config.author.email));
  for (const day of mismatches) console.log(`mismatch  ${day.date}: expected ${day.expected}, found ${day.actual}`);
  if (tree && git(repo, ['rev-parse', `${ref}^{tree}`]) !== tree) throw new Error(`${ref} does not hold the project files`);
  if (mismatches.length) throw new Error(`${mismatches.length} days on ${ref} differ from the plan`);
  console.log(`check     ${ref}: every day in the graph matches the plan`);
}

function build({ config, plan, values }) {
  summary(config, plan);
  const tree = git(repo, ['rev-parse', `${values.source}^{tree}`]);
  const tip = buildHistory(repo, config, plan, tree);
  git(repo, ['update-ref', `refs/heads/${values.branch}`, tip]);
  console.log(`built     ${values.branch} at ${tip} (files from ${values.source})`);
  check(config, plan, values.branch, tree);
}

function verify({ config, plan, ref = `${REMOTE}/main` }) {
  summary(config, plan);
  check(config, plan, ref);
}

function publish({ config, plan, values }) {
  summary(config, plan);
  git(repo, ['fetch', REMOTE, 'main']);
  const old = git(repo, ['rev-parse', `refs/remotes/${REMOTE}/main`]);
  const tree = git(repo, ['rev-parse', `${old}^{tree}`]);
  const tip = buildHistory(repo, config, plan, tree);
  check(config, plan, tip, tree);
  if (tip === old) return console.log(`publish   ${REMOTE}/main is already ${tip}; nothing to do`);
  if (!values.yes) {
    return console.log(`dry run   would force-push ${tip} over ${REMOTE}/main ${old}; rerun with --yes to publish`);
  }
  git(repo, ['push', `--force-with-lease=refs/heads/main:${old}`, REMOTE, `${tip}:refs/heads/main`]);
  console.log(`published ${REMOTE}/main ${old} -> ${tip}`);
  updateLocalMain(old, tip);
}

// Moves local main to the new tip when it had nothing the old remote main lacked, so later fast-forwards
// keep working. When it matched the old remote main the trees are equal and no files change.
function updateLocalMain(old, tip) {
  const local = git(repo, ['rev-parse', '--verify', '-q', 'refs/heads/main']);
  if (local !== old && !isAncestor(local, old)) return console.log(`local     main has commits not on ${REMOTE}/main; left as is`);
  const head = currentBranch();
  if (head === 'main') {
    git(repo, ['reset', '--keep', tip]);
  } else if (git(repo, ['worktree', 'list', '--porcelain']).split('\n').includes('branch refs/heads/main')) {
    return console.log('local     main is checked out in another worktree; run `git reset --keep origin/main` there');
  } else {
    git(repo, ['update-ref', 'refs/heads/main', tip, local]);
  }
  console.log(`local     main -> ${tip}`);
}

function isAncestor(commit, of) {
  try {
    git(repo, ['merge-base', '--is-ancestor', commit, of]);
    return true;
  } catch {
    return false;
  }
}

function currentBranch() {
  try {
    return git(repo, ['symbolic-ref', '-q', '--short', 'HEAD']);
  } catch {
    return null;
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`art: ${error.message}`);
  process.exit(1);
}
