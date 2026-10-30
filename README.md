# Hacker Art

Draws text on the `jameschapman2c` GitHub contributions graph with backdated empty commits.

GitHub's graph shows the last 53 weeks, so art drawn once scrolls off the left edge. Every month
`bin/art` draws it again for the current window, as the whole history of a separate art repository
(`jameschapman2c/hacker-art-graph`). The output is deterministic: the same config and day give the
same commit hashes.

GitHub keeps counting commits that a force-push removes, so a refresh cannot rewrite the art
repository. The old one is deleted by hand (Nico, signed in as James) and `bin/art publish`
creates it again. See [docs/monthly-refresh.md](docs/monthly-refresh.md).

## Config

`art.config.json`:

| Key | Meaning |
|---|---|
| `text` | What to draw. Letters, digits, space and `! . , : ' - ? ♥`; lowercase is drawn as uppercase. |
| `font`, `glyphs` | Built-in font (`5x7`) and extra or replacement glyphs: 7 equal-width rows of `.` (off), `#` (`textLevel`) or `1` to `4`. |
| `letterSpacing` | Empty columns between glyphs. |
| `align`, `offset` | `left`, `center` or `right` within the usable columns, then shifted by `offset` columns. |
| `margin` | Columns to keep empty at the `left` and `right` of the fully visible weeks. |
| `icon`, `icons` | A seasonal icon for the month of the publish day, placed in the free columns right of the text (`align`, at least `gap` columns after it, then `offset`). `icons` maps months `1` to `12` to glyphs like `glyphs`; `#` is `icon.level`. |
| `background` | Days left empty get the `level` shade with probability `density`, decided per calendar day from `seed`, so the pattern stays put between refreshes. `clear` keeps that many columns either side of the `text` or `icon` free of it. |
| `textLevel`, `levels` | Level for `#`, and commits per day for levels 1 to 4. GitHub shades days relative to the account's busiest days, so keep level 4 well above normal activity. |
| `repo` | The art repository, `owner/name`. Its owner's graph shows the art. |
| `author` | Name and email of the commits. The email must belong to the GitHub account. |
| `time`, `timezone` | Time of day and fixed UTC offset for every commit, and the zone that decides "today". |
| `message`, `baseMessage` | Messages of the art commits and of the root commit that holds the art repository's README. |

## Commands

```bash
bin/art preview [--today YYYY-MM-DD] [--out tmp/art-preview.png]  # text grid and PNG of the planned graph
bin/art preview --months                                           # one panel per month's icon
bin/art preview --refresh 35                                       # as published, 35 days later, and after a refresh
bin/art build [--today ...] [--branch art/preview]                 # build the history locally and check it
bin/art verify [ref]                                               # commits per day on ref (default the art repository) vs the plan
bin/art publish [--today ...]                                      # dry run: what publishing would do
bin/art publish --yes                                              # create the art repository and push the art
bin/art calendar [--out live.png]                                  # the live GitHub calendar against the plan
```

`publish` builds the history, checks every day of the graph against the plan, and creates the art
repository if it is missing. GitHub counts only the newest 1000 commits of a push toward
contributions, so it pushes in steps of at most 500 new commits (`--push-limit`), and an
interrupted publish continues where it stopped. When the repository already holds other art it
exits 3 with the repository's settings link, and pushes nothing.

The art moves left one column a week. The left margin of 5 columns matches a monthly refresh: by
the next one the text has reached the left edge, and the refresh moves it back.
