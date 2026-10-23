# Working on this repo

Team:
- **Youssef**: account owner (OCI, Supabase, Tailscale, Cloudflare, billing) and makes the decisions.
- **moughamir** (`@moughamir`): collaborator, tests and continues the work.
- **Claude**: Claude Code on Youssef's Mac: builds, deploys and watches the repo.

## Communication = GitHub issues and pull requests
| You want to… | Do this |
|---|---|
| Report something broken | New issue → **Incident / bug** (redact logs) |
| Ask a question or need a decision | New issue → **Question / decision** |
| Propose or take on work | New issue → **Task / handoff**, then a PR |
| Change code, docs or IaC | `scripts/flow start feature\|fix\|support <slug>` → PR into `develop` → Youssef merges. Releases go `develop` → `release/x.y.z` → `main`. See `docs/git-flow.md` |

Labels:
- types: `task`, `bug`, `question`;
- `needs-decision`: waits on Youssef;
- `blocked`, `launch`;
- owners: `owner:mo`, `owner:youssef`, `owner:claude`.

## The Claude observer
Claude polls this repo about every 20 minutes while Youssef's Claude desktop app is open (script: `scripts/gh-observer`). For every new issue, PR or comment it:
- **answers or triages** in a comment signed "🤖 Claude observer". It adds labels and points to the relevant doc, script or open task.
- **reviews PRs with comments only.** It **never merges, never deploys, and never touches cloud accounts** on its own.
- **notifies Youssef** when something needs a decision (`needs-decision`), access, or a secret.

To get its attention fast, open the issue with a clear title; a mention isn't needed. If it's urgent and blocking, add the `blocked` label.

## Rules
- Run `make hooks` once per clone: no direct commits or pushes on `main`/`develop`, conventional commit subjects, flow branch names.
- **Never paste or commit secrets** in issues, PRs or files. That covers `.env`, `*.tfvars`, API or auth keys, tokens, passwords, QR codes and WhatsApp session data.
  - Secrets live in `stack/.env` on the VM only, and in `terraform/*/terraform.tfvars` on the operator's machine (git-ignored).
- **Don't edit `OpenWA/`**. It's the upstream submodule pinned to `v0.24.0`. Configure it through `stack/`.
- Run IaC through `scripts/tf <oci|cloudflare> …`, never bare `tofu`: the wrapper keeps `.terraform/` out of the repo tree, where macOS Finder `Icon` files break provider checksums.
- WhatsApp: test with a **dedicated** number only, never a personal or main business line. Keep send pacing on.
- If `git fetch` fails with `bad object refs/Icon?`, run `scripts/git-deicon` (a macOS Finder artifact).

## Access you'll get (moughamir)
| System | Scope | How |
|---|---|---|
| GitHub | write on this repo | invite from the repo owner |
| Tailscale (project tailnet) | member: reach `wafine-vm`, SSH as `ubuntu` (check mode) | email invite |
| Supabase org `ai4x-openwa` | Developer on project `openwa-ma` | email invite |
| OCI tenancy | user in group `wa-operators`: read everything and manage instances, **only in compartment `wa-infra`** | activation email from Oracle |

Start with `README.md` → `docs/00-setup.md` → `docs/02-architecture.md`.
