---
name: agentic-herdr-orchestration
description: Drive herdr from an agent - list/get/read/prompt/send-keys/start/wait agents, split/move/layout/read/send-text panes, list/create/focus/close tabs - and follow the captain/worker pattern used in this repo with its A2A-style one-line report. Use when launching or steering a worker pane, reading another agent's output, waiting for a worker, creating a tab for a worker, or reporting status to the captain.
---

# herdr orchestration

herdr (v0.9.3) is a terminal workspace manager for AI coding agents: sessions,
workspaces, tabs, panes, and a socket API. Agents drive each other through the
`herdr` CLI. Every command and flag below was checked against `herdr <cmd> --help`
and `herdr --skill` on this machine; run `herdr --skill` once per session for the
built-in control guide.

## Agents
```bash
herdr agent list                       # list agents (name + pane)
herdr agent get <target>               # show one agent
herdr agent read <target> [--lines N] [--source visible|recent|recent-unwrapped|detection]
herdr agent prompt <target> <text> [--wait] [--until idle|working|blocked|done|unknown] [--timeout MS]
herdr agent send-keys <target> <KEY>...   # logical keys, e.g. esc, ctrl+c
herdr agent start <name> --kind <KIND> --pane <ID>   # launch an interactive agent
herdr agent wait <target> [--until <state>] [--timeout MS]
```
`--kind` accepts `pi, claude, codex, gemini, cursor, devin, agy, cline, omp,
mastracode, opencode, copilot, kimi, kiro, droid, amp, grok, hermes, kilo, qodercli,
qwen, letta, maki, muse`. `agent wait` with no `--until` matches `idle`, `done` or
`blocked`.

## Panes
```bash
herdr pane list
herdr pane split [<PANE_ID>] --direction right|down [--cwd PATH] [--focus|--no-focus]
herdr pane move <PANE_ID> --new-tab [--label TEXT]   # or --tab <ID> / --split right|down
herdr pane layout [--pane <ID>|--current]
herdr pane read <PANE_ID> [--source recent] [--lines N] [--raw]
herdr pane send-text <PANE_ID> <TEXT>          # literal text, no Enter
herdr pane run <PANE_ID> <COMMAND>...          # text + Enter in one call
herdr pane send-keys <PANE_ID> <KEY>...
```
Prefer `herdr pane run` over `send-text` when you want the command executed; `run`
appends Enter for you.

## Tabs
```bash
herdr tab list                                   # list tabs
herdr tab create [--cwd PATH] [--label TEXT]
herdr tab get <tab_id>
herdr tab focus <tab_id> | herdr tab close <tab_id>
herdr tab rename <tab_id> <label>
```
`herdr pane move <PANE_ID> --new-tab` is how you put an existing pane into a fresh tab.

## Captain/worker pattern (this repo)
One **captain** agent (the Claude pane that owns the fleet) hands a brief to one
**worker** per task; each worker runs in its own git worktree so work never collides
(dev worktrees via `scripts/dev-env`). The captain does not implement; it
dispatches, watches, and reviews. A worker:
1. reads its brief (e.g. `~/wafine/briefs/<name>.md`), works only inside its worktree;
2. keeps its branch current, opens ONE draft PR, keeps CI green;
3. reports once to the captain, then stops.

Use this shape when you are the captain: `herdr pane split` a pane per worker,
`herdr agent start` the worker, `herdr agent prompt` the brief, `herdr agent wait`
for a state, `herdr pane read` to inspect.

## The report to the captain
The captain pane may have no registered agent name - find the target with
`herdr agent list` (the `claude` agent that owns the fleet) and use its name or pane
id. Send the machine-readable line exactly once, then stop:
```bash
herdr agent prompt <captain-target> 'A2A {"from":"<worker>","task":"<task-id>","state":"completed|blocked|failed","artifact":"<PR-URL>","message":"<= 200 chars>"}'
```
The human-readable equivalent lives in `~/wafine/REPORTING.md` as a small block:
`from:`, `task:`, `status:`, `artifact:`, `notes:`. Both say the same thing. Use
`state:"blocked"` with a `message` explaining the blocker rather than going silent.

## Gotchas (verified against `herdr --skill` and `--help`)
- **Text that lands unsent: submit it.** `pane send-text` writes literal text but no
  newline, so it sits in the prompt. Use `herdr pane run` (text + Enter in one call),
  or follow with `herdr agent send-keys <target> <KEY>`; `agent prompt` sends text
  followed by Enter as one ordered submission.
- **Same-tab `pane move` is a no-op.** Moving a pane within its current tab does
  nothing useful; go through a destination first - `herdr pane move <PANE_ID> --new-tab`
  (or `--tab <ID>` / `--workspace <ID>`).
- **`blocked` means an approval/question UI.** `herdr --skill` defines it as "Herdr
  recognized an approval or question UI"; it can also be a hand-off to you. `herdr
  agent read` before you act, and inspect the UI before answering it.
- **`agent prompt` rejects a blocked agent** with `agent_blocked` before sending any
  input. Inspect the blocked UI and ask the user before answering it; or wait, then
  prompt.
- **`--wait` semantics**: from a non-working state, `--wait` needs to observe a
  `working` or `blocked` state within 5000 ms or it returns `agent_prompt_stalled`
  (`timeout` if the caller timeout expires first). It does not track turns - if the
  agent was already working, that turn's end may match.
- **`agent start` readiness**: returns `agent_not_ready` if the agent blocks during
  startup; the name stays usable for `agent read` / `agent send-keys`. Wait for
  `idle` before prompting. Startup timeout defaults to 30000 ms.
- **Targets**: agent commands take a name, pane commands a pane id, tab commands a tab
  id. Get ids from `herdr agent list` / `herdr pane list` / `herdr tab list`.

## References
- `herdr --skill` (control guide), `herdr agent --help`, `herdr pane --help`,
  `herdr tab --help`
- https://herdr.dev/agent-guide.md, https://herdr.dev/llms.txt
- `~/wafine/REPORTING.md`, this repo's `scripts/dev-env` (worktree workflow)
