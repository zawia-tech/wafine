# Git flow

```
main      ●───────────────●────────────●──  releases and hotfixes only, tagged vX.Y.Z
           \             / \          /
release/x.y.z            ●──●        /      stabilise a version, PR into main
           \            /           /
develop   ──●──●──●──●──●──●──●──●─●──────  integration branch, always deployable to staging
             \    /  \   /
feature/*, fix/*, support/*                 branch off develop, PR back into develop
hotfix/*                                    branches off main, PR into main, then back-merge into develop
```

| Branch | Branches off | Merges into | Use |
|---|---|---|---|
| `main` | | | What is released. Protected: no direct commits or pushes. |
| `develop` | `main` | `main` through `release/*` | Integration. Protected like `main`. |
| `feature/<slug>` | `develop` | `develop` | New behaviour. |
| `fix/<slug>` | `develop` | `develop` | Bug fix that can wait for the next release. |
| `support/<slug>` | `develop` | `develop` | Docs, tooling, CI, dependencies, refactors. |
| `release/<x.y.z>` | `develop` | `main`, then back into `develop` | Version bump, changelog, last fixes. Tag `vX.Y.Z` on `main` after the merge. |
| `hotfix/<slug>` | `main` | `main`, then back into `develop` | Urgent fix to what is live. |

Branch names are lowercase letters, digits, dots and dashes. Agent and personal branches (`claude/`, `mo/`, `routine/`, `fm/`) are still accepted by the hooks, but target `develop` like any other work branch.

## Daily use

```bash
make hooks                              # once per clone: enables .githooks
scripts/flow start feature media-links  # creates feature/media-links from origin/develop
# ... commit as 'type(scope): summary' ...
git push -u origin feature/media-links  # then open a PR into develop (draft first)
scripts/flow status                     # branch, expected PR base, hooks state
```

Release: `scripts/flow start release 0.2.0`, bump `CHANGELOG.md`, open a PR into `main`, merge with a merge commit, tag `v0.2.0` on `main`, then open a PR from `main` back into `develop`. Hotfix: the same with `scripts/flow start hotfix <slug>`.

Merge strategy: squash for `feature/`, `fix/`, `support/` into `develop`; merge commit for `release/` and `hotfix/` into `main` and for the back-merge, so `main` stays an ancestor of `develop`.

## Hooks (`.githooks/`, enabled by `make hooks`)

| Hook | Rule | Bypass (maintainers, one-off) |
|---|---|---|
| `pre-commit` | No commits on `main` or `develop`. | `ALLOW_PROTECTED_COMMIT=1` |
| `commit-msg` | Subject is `type(scope)?: summary`, type in `feat fix docs chore refactor test ci build perf style revert scripts release`, under 100 characters. Merge, revert, fixup and squash subjects pass. | edit the message |
| `pre-push` | No pushes to `main` or `develop`. A new branch must be `feature/ fix/ support/ release/ hotfix/` + slug, or an agent prefix. | `ALLOW_PROTECTED_PUSH=1`, `ALLOW_ANY_BRANCH=1` |

Hooks only protect a clone that enabled them. The real gate is the GitHub branch protection below.

## Branch protection (GitHub settings, owner)

For `main` and `develop`: require a pull request, one approval, the required checks (`lint`, `bff`, `web`, `build`, `stack`), linear history for `develop`, no force push, no deletion. Default branch: `develop` (so new PRs target it). CI runs on every pull request and on pushes to `main` and `develop`.
