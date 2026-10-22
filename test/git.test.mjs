import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { loadConfig, planArt } from '../lib/art.mjs';
import { buildHistory, commitsPerDay, compareWithPlan, git } from '../lib/git.mjs';

const root = mkdtempSync(join(tmpdir(), 'hacker-art-test-'));
after(() => rmSync(root, { recursive: true, force: true }));

const TODAY = '2026-10-22';
const raw = { text: 'I', levels: { 1: 1, 2: 1, 3: 1, 4: 2 }, author: { name: 'Art Bot', email: 'art@example.com' } };
const config = loadConfig(raw);
const plan = planArt(config, TODAY);
const ENV = {
  GIT_AUTHOR_NAME: 'Dev',
  GIT_AUTHOR_EMAIL: 'dev@example.com',
  GIT_COMMITTER_NAME: 'Dev',
  GIT_COMMITTER_EMAIL: 'dev@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};
Object.assign(process.env, ENV);

function project(name) {
  const repo = join(root, name);
  spawnSync('git', ['init', '-q', '-b', 'main', repo]);
  writeFileSync(join(repo, 'AGENTS.md'), '# Project\n');
  writeFileSync(join(repo, 'art.config.json'), JSON.stringify(raw));
  git(repo, ['add', '.']);
  git(repo, ['commit', '-q', '-m', 'Old history']);
  return repo;
}

function art(repo, ...args) {
  const result = spawnSync('node', [new URL('../scripts/art.mjs', import.meta.url).pathname, ...args, '--repo', repo, '--today', TODAY], {
    encoding: 'utf8',
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

test('same config, date and files give identical commits in different repositories', () => {
  const a = project('a');
  const b = project('b');
  const treeA = git(a, ['rev-parse', 'HEAD^{tree}']);
  assert.equal(treeA, git(b, ['rev-parse', 'HEAD^{tree}']));
  const tip = buildHistory(a, config, plan, treeA);
  assert.equal(buildHistory(b, config, plan, treeA), tip);
  assert.equal(buildHistory(a, config, plan, treeA), tip);
  assert.notEqual(buildHistory(a, loadConfig({ ...raw, text: 'L' }), planArt(loadConfig({ ...raw, text: 'L' }), TODAY), treeA), tip);
  assert.notEqual(buildHistory(a, config, planArt(config, '2026-10-29'), treeA), tip);
});

test('built history keeps the project files and counts per day match the plan', () => {
  const repo = project('c');
  const tree = git(repo, ['rev-parse', 'HEAD^{tree}']);
  const tip = buildHistory(repo, config, plan, tree);
  assert.equal(git(repo, ['rev-parse', `${tip}^{tree}`]), tree);
  const counts = commitsPerDay(repo, tip, config.author.email);
  assert.deepEqual(compareWithPlan(plan, counts), []);
  assert.equal(counts.get(plan.baseDate), 1, 'root commit sits the day before the graph');
  assert.equal(Number(git(repo, ['rev-list', '--count', tip])), plan.total + 1);
  const authors = new Set(git(repo, ['log', tip, '--format=%an <%ae> %cn <%ce> %ad']).split('\n').map((line) => line.split(' ').slice(0, 6).join(' ')));
  assert.deepEqual([...authors], ['Art Bot <art@example.com> Art Bot <art@example.com>']);
  assert.equal(git(repo, ['log', '-1', '--format=%ad', '--date=iso', tip]), `${plan.days.at(-1).date} 12:00:01 +0000`);
  // A missing day is reported.
  counts.set(plan.days[0].date, 0);
  assert.deepEqual(compareWithPlan(plan, counts), [{ date: plan.days[0].date, expected: plan.days[0].commits, actual: 0 }]);
});

test('publish is a dry run without --yes, then force-pushes main and moves local main', () => {
  const remote = join(root, 'remote.git');
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  const repo = project('d');
  git(repo, ['remote', 'add', 'origin', remote]);
  git(repo, ['push', '-q', 'origin', 'main']);
  const old = git(repo, ['rev-parse', 'main']);

  const dry = art(repo, 'publish');
  assert.equal(dry.status, 0, dry.output);
  assert.match(dry.output, /dry run/);
  assert.equal(git(remote, ['rev-parse', 'main']), old);

  const real = art(repo, 'publish', '--yes');
  assert.equal(real.status, 0, real.output);
  const tip = git(remote, ['rev-parse', 'main']);
  assert.notEqual(tip, old);
  assert.equal(git(repo, ['rev-parse', 'main']), tip, 'local main follows');
  assert.equal(git(repo, ['status', '--porcelain']), '');
  assert.match(art(repo, 'verify').output, /every day in the graph matches/);
  assert.match(art(repo, 'publish', '--yes').output, /nothing to do/);
});

test('publish moves a local main that is behind origin/main, and leaves one with its own commits', () => {
  const remote = join(root, 'remote-behind.git');
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  const repo = project('f');
  git(repo, ['remote', 'add', 'origin', remote]);
  git(repo, ['push', '-q', 'origin', 'main']);
  const behind = git(repo, ['rev-parse', 'main']);
  git(repo, ['commit', '-q', '--allow-empty', '-m', 'Merged elsewhere']);
  git(repo, ['push', '-q', 'origin', 'main']);
  git(repo, ['reset', '-q', '--keep', behind]);

  const result = art(repo, 'publish', '--yes');
  assert.equal(result.status, 0, result.output);
  assert.equal(git(repo, ['rev-parse', 'main']), git(remote, ['rev-parse', 'main']));
  assert.equal(git(repo, ['status', '--porcelain']), '');

  git(repo, ['commit', '-q', '--allow-empty', '-m', 'Local only']);
  const local = git(repo, ['rev-parse', 'main']);
  git(repo, ['push', '-q', 'origin', 'main']);
  git(repo, ['reset', '-q', '--keep', 'HEAD~1']);
  git(repo, ['commit', '-q', '--allow-empty', '-m', 'Diverged']);
  const diverged = git(repo, ['rev-parse', 'main']);
  assert.notEqual(diverged, local);
  const again = art(repo, 'publish', '--yes');
  assert.equal(again.status, 0, again.output);
  assert.match(again.output, /has commits not on origin\/main; left as is/);
  assert.equal(git(repo, ['rev-parse', 'main']), diverged);
});

test('verify fails when a ref does not match the plan', () => {
  const repo = project('e');
  const result = art(repo, 'verify', 'main');
  assert.equal(result.status, 1);
  assert.match(result.output, /days on main differ from the plan/);
});
