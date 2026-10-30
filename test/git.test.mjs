import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { loadConfig, planArt } from '../lib/art.mjs';
import { artReadme, buildHistory, commitsPerDay, compareWithPlan, git } from '../lib/git.mjs';

const root = mkdtempSync(join(tmpdir(), 'hacker-art-test-'));
after(() => rmSync(root, { recursive: true, force: true }));

const TODAY = '2026-10-22';
const raw = { text: 'I', levels: { 1: 1, 2: 1, 3: 1, 4: 2 }, author: { name: 'Art Bot', email: 'art@example.com' }, repo: 'someone/art' };
const config = loadConfig(raw);
const plan = planArt(config, TODAY);
Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'Dev',
  GIT_AUTHOR_EMAIL: 'dev@example.com',
  GIT_COMMITTER_NAME: 'Dev',
  GIT_COMMITTER_EMAIL: 'dev@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  // Never reach GitHub from a test: gh fails to authenticate and git cannot prompt.
  GH_TOKEN: 'hacker-art-tests-are-offline',
  GIT_TERMINAL_PROMPT: '0',
});

function project(name, files = {}) {
  const repo = join(root, name);
  spawnSync('git', ['init', '-q', '-b', 'main', repo]);
  writeFileSync(join(repo, 'art.config.json'), JSON.stringify(raw));
  for (const [file, text] of Object.entries(files)) writeFileSync(join(repo, file), text);
  git(repo, ['add', '.']);
  git(repo, ['commit', '-q', '-m', 'Project']);
  return repo;
}

function art(repo, args, today = TODAY) {
  const script = new URL('../scripts/art.mjs', import.meta.url).pathname;
  const result = spawnSync('node', [script, ...args, '--repo', repo, '--today', today], { encoding: 'utf8' });
  return { status: result.status, output: result.stdout + result.stderr };
}

test('same config and date give identical commits, whatever the project files', () => {
  const a = project('a', { 'AGENTS.md': 'one\n' });
  const b = project('b', { 'AGENTS.md': 'two\n', 'other.txt': 'x\n' });
  const tip = buildHistory(a, config, plan);
  assert.equal(buildHistory(b, config, plan), tip);
  assert.equal(buildHistory(a, config, plan), tip);
  const other = loadConfig({ ...raw, text: 'L' });
  assert.notEqual(buildHistory(a, other, planArt(other, TODAY)), tip);
  assert.notEqual(buildHistory(a, config, planArt(config, '2026-10-29')), tip);
});

test('built history holds only the README, and counts per day match the plan', () => {
  const repo = project('c');
  const tip = buildHistory(repo, config, plan);
  assert.equal(git(repo, ['ls-tree', '--name-only', tip]), 'README.md');
  assert.equal(git(repo, ['show', `${tip}:README.md`]) + '\n', artReadme(config));
  const counts = commitsPerDay(repo, tip, config.author.email);
  assert.deepEqual(compareWithPlan(plan, counts), []);
  assert.equal(counts.get(plan.baseDate), 1, 'root commit sits the day before the graph');
  assert.equal(Number(git(repo, ['rev-list', '--count', tip])), plan.total + 1);
  const people = new Set(git(repo, ['log', tip, '--format=%an <%ae> %cn <%ce>']).split('\n'));
  assert.deepEqual([...people], ['Art Bot <art@example.com> Art Bot <art@example.com>']);
  assert.equal(git(repo, ['log', '-1', '--format=%ad', '--date=iso', tip]), `${plan.days.at(-1).date} 12:00:01 +0000`);
  counts.set(plan.days[0].date, 0);
  assert.deepEqual(compareWithPlan(plan, counts), [{ date: plan.days[0].date, expected: plan.days[0].commits, actual: 0 }]);
});

test('publish creates the art repository and pushes in steps of at most --push-limit commits', () => {
  const repo = project('d');
  const remote = join(root, 'd-art.git');

  const dry = art(repo, ['publish', '--remote', remote, '--push-limit', '3']);
  assert.equal(dry.status, 0, dry.output);
  assert.match(dry.output, /would create it, then push \w+ in \d+ pushes/);
  assert.equal(existsSync(remote), false);

  const real = art(repo, ['publish', '--yes', '--remote', remote, '--push-limit', '3']);
  assert.equal(real.status, 0, real.output);
  const tip = git(remote, ['rev-parse', 'main']);
  assert.equal(Number(git(remote, ['rev-list', '--count', tip])), plan.total + 1);
  const pushes = (real.output.match(/^pushed/gm) ?? []).length;
  assert.equal(pushes, Math.ceil((plan.total + 1) / 3));
  assert.equal(git(repo, ['status', '--porcelain']), '', 'the project checkout is untouched');
  assert.match(art(repo, ['verify', '--remote', remote]).output, /every day in the graph matches/);
  assert.match(art(repo, ['publish', '--yes', '--remote', remote]).output, /already holds this art \(\w+\); nothing to do/);
});

test('an interrupted publish continues where the art repository stopped', () => {
  const repo = project('e');
  const remote = join(root, 'e-art.git');
  const tip = buildHistory(repo, config, plan);
  const chain = git(repo, ['rev-list', '--reverse', tip]).split('\n');
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  git(repo, ['push', '-q', remote, `${chain[4]}:refs/heads/main`]);

  const result = art(repo, ['publish', '--yes', '--remote', remote, '--push-limit', '3']);
  assert.equal(result.status, 0, result.output);
  assert.doesNotMatch(result.output, /created/);
  assert.equal(git(remote, ['rev-parse', 'main']), tip);
  assert.equal((result.output.match(/^pushed/gm) ?? []).length, Math.ceil((chain.length - 5) / 3));
});

test('publish refuses, with exit 3 and the settings link, when the repository holds other art', () => {
  const repo = project('f');
  const remote = join(root, 'f-art.git');
  assert.equal(art(repo, ['publish', '--yes', '--remote', remote]).status, 0);
  const before = git(remote, ['rev-parse', 'main']);
  const later = art(repo, ['publish', '--yes', '--remote', remote], '2026-11-05');
  assert.equal(later.status, 3, later.output);
  assert.match(later.output, /holds other art .* Delete the repository first: https:\/\/github.com\/someone\/art\/settings/);
  assert.equal(git(remote, ['rev-parse', 'main']), before, 'nothing pushed');
});

test('without --remote, publish talks to GitHub as the config says, and a test cannot', () => {
  const repo = project('h');
  const result = art(repo, ['publish', '--yes']);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /gh api repos\/someone\/art --silent failed/);
});

test('config needs the art repository', () => {
  assert.throws(() => loadConfig({ ...raw, repo: undefined }), /repo must be owner\/name/);
});

test('verify fails when a ref does not match the plan', () => {
  const repo = project('g');
  const result = art(repo, ['verify', 'main']);
  assert.equal(result.status, 1);
  assert.match(result.output, /days on main differ from the plan/);
});
