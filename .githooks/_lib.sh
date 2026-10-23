#!/usr/bin/env bash
# shellcheck disable=SC2034 # the patterns are used by the hooks that source this file
# Shared helpers for the git-flow hooks. Sourced by the other hooks, never run directly.
# Flow: main <- release/* <- develop <- feature/* | fix/* | support/*, and hotfix/* off main.
# Contributor and agent branches (claude/, mo/, routine/, fm/) are allowed for work branches.

PROTECTED_RE='^(main|develop)$'
WORK_RE='^(feature|fix|support|release|hotfix)/[a-z0-9][a-z0-9._-]*$'
LEGACY_RE='^(claude|mo|routine|fm|dependabot)/.+$'

hook_fail() { printf 'git-flow: %s\n' "$*" >&2; exit 1; }
