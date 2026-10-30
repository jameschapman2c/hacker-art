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

- The art lives in a separate public repository, `jameschapman2c/hacker-art-graph` (`repo` in
  `art.config.json`), holding a README and the generated commits. This repository holds the code
  and has a normal history. GitHub keeps counting commits that a force-push removes (measured
  2026-10-22 to 2026-10-30), so nothing here force-pushes: each refresh needs the art repository
  deleted and created again.
- Only Nico deletes repositories, signed in as `jameschapman2c` (Nico, 2026-10-30). Agents never
  get a token that can delete repositories. `bin/art publish --yes` only creates the art
  repository and pushes to it, and exits 3 with the settings link when it holds other art.
- A Supervisor command schedule, **Hacker art refresh**, queues a thread on the 1st of each month
  at 09:00 Denver with [docs/monthly-refresh.md](docs/monthly-refresh.md): a small PR whose
  Before you approve step asks Nico (through Yui) to delete the art repository, then the publish.
  The text's 5 columns of left padding last one month.
- `bin/art` commits are authored by the config's `author`, an email GitHub attributes to
  `jameschapman2c` (`james@twoscomplement.io`). Same config and `--today` give the same hashes.
  Show Nico `bin/art preview` before publishing a new design.
- GitHub counts only the newest 1000 commits of a push toward contributions (measured on
  2026-10-22: a 1,310-commit push lost its oldest 310). `publish` pushes in steps of at most 500
  new commits; never push art history in one larger push.
- `gitfiti` and `README.md` started as empty files from the original art's `init` commit.
