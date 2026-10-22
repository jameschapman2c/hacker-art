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

- `main`'s history is generated art, not a record of changes: an `init` commit followed by 392
  empty `gitfiti` commits backdated from June 2025 to January 2026, all authored
  `jamesbot2c <jamesbot@twoscomplement.io>`. Their author dates place the pixels on the graph.
  Only the art script's refresh rewrites it (see Overrides); never rewrite it by hand.
- `gitfiti` and `README.md` are empty files from the `init` commit.
