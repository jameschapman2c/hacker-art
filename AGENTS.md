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

None.

## Project notes

- `main`'s history is generated art, not a record of changes: an `init` commit followed by 392
  empty `gitfiti` commits backdated from June 2025 to January 2026, all authored
  `jamesbot2c <jamesbot@twoscomplement.io>`. Their author dates place the pixels on the graph.
  Keep that history as it is. How rewritten art history is published is Nico's decision and is
  not yet an Override, so never force-push or rewrite `main`.
- `gitfiti` and `README.md` are empty files from the `init` commit.
