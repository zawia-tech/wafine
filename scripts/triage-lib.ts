#!/usr/bin/env bun
/**
 * Shared helpers for the issue/PR hygiene triage scripts.
 * Rules live in scripts/issue-rules.json (repo-agnostic; repo slugs are CLI args).
 */

import { readFileSync } from "node:fs";

export interface RuleFile {
  version: number;
  stale_days: { default: number; overrides: Array<{ repos: string[]; days: number }> };
  pr_stale_days: number;
  labels: Record<string, { color: string; description: string }>;
  wf_map: Record<string, { milestone: string; area: string; priority: string; type: string }>;
  milestones: Array<{ title: string; due: string }>;
  issue_rules: Array<{ match: string; labels: string[] }>;
  pr_path_rules: Array<{ path: string; label: string }>;
}

export interface Issue {
  number: number;
  title: string;
  state: string;
  body: string | null;
  labels: Array<{ name: string }>;
  milestone: { number: number; title: string } | null;
  pull_request?: unknown;
  updated_at: string;
  created_at: string;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  headRefOid: string;
  author: { login: string };
  isDraft: boolean;
  createdAt: string;
}

/** Normalize a REST /pulls object (head:{ref,sha}, draft, html_url) into the shape we use. */
export function toPr(raw: Record<string, unknown>): PullRequest {
  const head = (raw.head ?? {}) as { ref?: string; sha?: string };
  const user = (raw.user ?? {}) as { login?: string };
  return {
    number: raw.number as number,
    title: String(raw.title ?? ""),
    url: String(raw.html_url ?? ""),
    headRefName: String(head.ref ?? ""),
    headRefOid: String(head.sha ?? ""),
    author: { login: String(user.login ?? "unknown") },
    isDraft: Boolean(raw.draft),
    createdAt: String(raw.created_at ?? raw.updated_at ?? raw.created_at),
  };
}

const TRANSIENT = /TLS handshake timeout|net\/http.*timeout|HTTP 5\d\d|connection refused|unexpected EOF/i;

/** Run `gh api` and return raw stdout. Retries transient network errors; throws otherwise. */
export async function ghApi(args: string[], paginate = false, method?: string): Promise<string> {
  const full = ["gh", "api", ...(method ? ["-X", method] : []), ...(paginate ? ["--paginate"] : []), ...args];
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const proc = Bun.spawn(full, { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (code === 0) return out;
    lastErr = err;
    if (attempt === 3 || !TRANSIENT.test(err)) {
      throw new Error(`gh api ${args.join(" ")} failed (exit ${code}): ${err}`);
    }
    await Bun.sleep(1500 * attempt);
  }
  throw new Error(`gh api ${args.join(" ")} failed: ${lastErr}`);
}

/** Run `gh api [path]` and parse the JSON response. */
export async function ghGet<T>(path: string, paginate = false): Promise<T> {
  return JSON.parse(await ghApi([path], paginate)) as T;
}

/**
 * Run a `gh` subcommand with an argument array (no shell quoting worries).
 * Return raw stdout; throws with the captured stderr on failure.
 */
export async function ghRun(args: string[]): Promise<string> {
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (code === 0) return out;
    lastErr = err;
    if (attempt === 3 || !TRANSIENT.test(err)) {
      throw new Error(`gh ${args.slice(0, 4).join(" ")}… failed (exit ${code}): ${err}`);
    }
    await Bun.sleep(1500 * attempt);
  }
  throw new Error(`gh ${args.slice(0, 4).join(" ")}… failed: ${lastErr}`);
}

/** Load and validate scripts/issue-rules.json from the scripts directory. */
export function loadRules(scriptsDir: string): RuleFile {
  const path = `${scriptsDir}/issue-rules.json`;
  const rules = JSON.parse(readFileSync(path, "utf8")) as RuleFile;
  if (!rules.issue_rules || !rules.pr_path_rules || !rules.wf_map) {
    throw new Error(`rules file ${path} is missing required sections`);
  }
  return rules;
}

/** Days since the last issue activity (updated_at), integer, rounded down. */
export function daysIdle(updatedAt: string, now = new Date()): number {
  return Math.floor((now.getTime() - new Date(updatedAt).getTime()) / 86_400_000);
}

export function wfId(issue: { title: string; body: string | null }): string | null {
  return (
    issue.body?.match(/\bID:\s*(WF-\d{3})\b/)?.[1] ?? issue.title.match(/\b(WF-\d{3})\b/)?.[1] ?? null
  );
}

/** The issue's milestone token: `Milestone: Mx` in the body or `Mx ` at the start of the title. */
export function milestoneToken(issue: { body: string | null; title: string }): string | null {
  const m = issue.body?.match(/\bMilestone:\s*(M\d+)\b/)?.[1];
  if (m) return m;
  return issue.title.match(/^(M\d+)\s/)?.[1] ?? null;
}

/** Keyword-derived labels for an issue, in rules-file order, deduplicated. */
export function issueKeywords(issue: { title: string; body: string | null }, rules: RuleFile): string[] {
  const hay = `${issue.title} ${issue.body ?? ""}`.slice(0, 4000);
  const found = new Set<string>();
  for (const rule of rules.issue_rules) {
    if (new RegExp(rule.match, "i").test(hay)) {
      for (const l of rule.labels) found.add(l);
    }
  }
  return [...found];
}

/** Path-derived labels for a PR's changed files, in rules-file order, deduplicated. */
export function pathLabels(paths: string[], rules: RuleFile): string[] {
  const found = new Set<string>();
  for (const p of paths) {
    for (const rule of rules.pr_path_rules) {
      if (p.startsWith(rule.path) || p === rule.path) found.add(rule.label);
    }
  }
  return [...found];
}

/** Marker comment put on every comment this tool writes, so the next run can skip them. */
export const HYGIENE_MARKER = "<!-- issue-hygiene -->";
