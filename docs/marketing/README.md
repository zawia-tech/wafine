# WaFine marketing

Public copy, social and email for WaFine. Nothing here is approved copy until the owner says so.

| Path | What |
|---|---|
| `../../.claude/skills/wafine-marketing/` | The skill (source of truth): voice, verified facts, formats, campaigns, brand identity copy, copy linter, card renderer. |
| `packages/wafine-marketing.skill` | Downloadable package of that skill. A build artifact: rebuild it after any change to the skill with `python3 .claude/skills/wafine-marketing/scripts/package.py docs/marketing/packages`. The script refuses to package when the bundled design-system copy has drifted from `docs/design-system/`. |
| `launch-post/` | LinkedIn launch post drafts in French, English and Arabic, not published. Its `README.md` lists what blocks publishing (waitlist link, auto-replies live, author) and the owner decisions that came out of the claims check. |

## Install the package

- In Claude: open `wafine-marketing.skill` and press **Save skill** (shown when your organization allows skill creation).
- In a repo: unzip it into `.claude/skills/` (it is already there in this repo).

## Keep it true

Before publishing anything from this folder, re-check each claim against the source it cites in `.claude/skills/wafine-marketing/references/facts.md`, and check the link with `curl -sI`. Run `python3 .claude/skills/wafine-marketing/scripts/lint_copy.py <file> --channel linkedin` on every piece of copy.
