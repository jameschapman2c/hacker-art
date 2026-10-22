# Hacker Art

Draws text on the `jameschapman2c` GitHub contributions graph with backdated empty commits.

GitHub's graph shows the last 53 weeks, so art drawn once scrolls off the left edge. `bin/art`
regenerates the whole history of `main` for a chosen day, placing the text back in the visible
window. The output is deterministic: the same config, project files and day give the same commit
hashes.

## Config

`art.config.json`:

| Key | Meaning |
|---|---|
| `text` | What to draw. Letters, digits, space and `! . , : ' - ? ♥`; lowercase is drawn as uppercase. |
| `font`, `glyphs` | Built-in font (`5x7`) and extra or replacement glyphs: 7 equal-width rows of `.` (off), `#` (`textLevel`) or `1` to `4`. |
| `letterSpacing` | Empty columns between glyphs. |
| `align`, `offset` | `left`, `center` or `right` within the usable columns, then shifted by `offset` columns. |
| `margin` | Columns to keep empty at the `left` and `right` of the fully visible weeks. |
| `textLevel`, `levels` | Level for `#`, and commits per day for levels 1 to 4. GitHub shades days relative to the account's busiest days, so keep level 4 well above normal activity. |
| `author` | Name and email of the commits. The email must belong to the GitHub account. |
| `time`, `timezone` | Time of day and fixed UTC offset for every commit, and the zone that decides "today". |
| `message`, `baseMessage` | Messages of the art commits and of the root commit that holds the project files. |

## Commands

```bash
bin/art preview [--today YYYY-MM-DD] [--out tmp/art-preview.png]  # text grid and PNG of the planned graph
bin/art build [--today ...] [--branch art/preview]                 # build the history locally and check it
bin/art verify [ref]                                               # commits per day on ref (default origin/main) vs the plan
bin/art publish [--today ...]                                      # dry run: build from origin/main and check it
bin/art publish --yes                                              # force-push it to main
```

`publish` fetches `origin/main`, keeps its files in the new root commit, checks every day of the
graph against the plan, and pushes with `--force-with-lease` against the `origin/main` it built
from. Local `main` moves to the new history when it matched `origin/main`; the files do not
change. Other clones need `git fetch` and `git reset --keep origin/main`, and open branches must
be rebased onto the new `main`.

The art moves left one column a week, so refresh it every few weeks to keep it in place.
