# Hacker Art

Local app managed by [core](https://github.com/jameschapman2c/core). Use the `core-sdlc` skill for
every change. This file lists the project's specifics and any deliberate overrides.

Draws art on the `jameschapman2c` GitHub contributions graph with backdated commits.

## Project contract

| | |
|---|---|
| Group | local |
| Repository | `jameschapman2c/hacker-art` (default branch `main`, public) |
| Setup | `npm ci` (no dependencies; requires `shellcheck` from Homebrew) |
| Develop | Edit in a branch; nothing runs as a service |
| Preview | none (no UI) |
| Check (local CI gate) | `npm run check` (`bin/check`: shellcheck on `bin/*`, then `node --test`), run through `~/.core/bin/local-ci` |
| Supervisor service | none. A project without a service, so threads can be queued here. |
| Deploy | none |
| Health | none |

## Overrides

- **Art refreshes replace `main`'s history** (Nico, 2026-10-22). `main` holds only generated art
  commits, so when publishing a refresh the art script may replace `main`'s history with a
  force-push. This applies to `main` in this repo only, never to any other branch or repo. The
  regenerated history must keep `main`'s current tracked files, and the push uses
  `--force-with-lease` against the `origin/main` it was built from, so merged work is never lost.
  Everything else, including code changes, follows `core-sdlc`.

## Project notes

- `main`'s history is generated art, not a record of changes. Until the first refresh it is an
  `init` commit, 392 empty `gitfiti` commits (June 2025 to January 2026) authored
  `jamesbot2c <jamesbot@twoscomplement.io>`, and the core PRs. That email is not on the
  `jameschapman2c` account, so those commits never showed on its graph.
- `bin/art` generates the art from `art.config.json` (usage in `README.md`): a root commit with
  `origin/main`'s files dated the day before the graph starts, then empty backdated commits
  authored by the config's `author`, which must be an email GitHub attributes to
  `jameschapman2c` (`james@twoscomplement.io`). Same config, files and `--today` give the same
  hashes. `bin/art publish --yes` is the only way to rewrite `main` (see Overrides); never rewrite
  it by hand, and show Nico `bin/art preview` before publishing a new text.
- A Supervisor command schedule, **Hacker art refresh**, runs `bin/art publish --yes` every 14 days
  at 03:30 Denver time, so the text keeps its 2 weeks of left padding. A branch made before a
  refresh no longer shares history with `main`: start a fresh branch from `origin/main` and
  cherry-pick its commits.
- GitHub counts only the newest 1000 commits of a push toward contributions (measured on
  2026-10-22: a 1,310-commit push lost its oldest 310). `publish` therefore pushes in steps of at
  most 500 new commits; never push art history in one larger push.
- Squash-merged PRs land on `main` as commits by the same account and add contributions on their
  real dates, so `bin/art verify` reports those days until the next refresh.
- `gitfiti` and `README.md` started as empty files from the `init` commit.
