# Monthly art refresh

The **Hacker art refresh** schedule queues this as a new thread in `hacker-art` on the 1st of each
month. Follow `core-sdlc` and `AGENTS.md`. The design is already approved; this refreshes it for
the current month.

1. On an up-to-date `main`, run `bin/art publish` (a dry run for today).
   - "already holds this art": the art is current. Report that and stop.
   - "would create it", or "would push" without creating: the art repository is missing, empty,
     or partly published, so no one needs to delete anything.
   - Exit 3, "holds other art": Nico must delete it first.
2. Start a branch `refresh-<YYYY-MM>` and add a row for today to `docs/refreshes.md`: the date, the
   month's icon, and the days and commits from the dry run's summary. Open a pull request titled
   "Refresh contribution art for <Month YYYY>".
   - When Nico must delete the repository, its description gets this section, exactly:

     ```markdown
     ## Before you approve

     - [ ] Delete `jameschapman2c/hacker-art-graph` while signed in as James.
       - Check: `gh api repos/jameschapman2c/hacker-art-graph` returns 404.
     ```

     Run local CI and publish it, return to `main`, write `bin/art preview --out` into
     `SUPERVISOR_MEDIA_DIR`, then ask, and end the turn:

     ```bash
     ~/.core/bin/ask-nico <pr-url> --steps before:1 \
       --details "Sign in to GitHub as jameschapman2c, open https://github.com/jameschapman2c/hacker-art-graph/settings and use Delete this repository in the Danger Zone at the bottom. About a minute. Then I recreate it with this month's art." \
       "Did you delete the hacker-art-graph repository?"
     ```

     After his Yes, run the check, tick the step, and continue. After a No, snooze it as
     `core-sdlc` says.
3. Merge the pull request once local CI passes, return to `main`, and run `bin/art publish --yes`.
   If it is interrupted, run it again: it continues where it stopped.
4. Run `bin/art verify`, then wait about 10 minutes with `wake-thread` and run
   `bin/art calendar --out "$SUPERVISOR_MEDIA_DIR/hacker-art-live.png"`. Every planned day should
   show at least its planned commits ("missing 0"). Report with the live picture.
