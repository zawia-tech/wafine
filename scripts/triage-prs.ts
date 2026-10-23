#!/usr/bin/env bun
/**
 * PR hygiene: labels by changed path, CI status flags, stale-PR flags for the WAFINE repos.
 *
 * Dry-run by default: prints findings and never mutates GitHub state.
 * With --apply: adds path-derived labels and comments a hygiene status block on
 * human-authored PRs only (dependabot[bot] and other bot accounts are never commented).
 * Never merges anything.
 *
 *   bun scripts/triage-prs.ts --repo OWNER/NAME [--repo ...]           # dry run
 *   bun scripts/triage-prs.ts --repo OWNER/NAME --apply                # label + comment
 *   bun scripts/triage-prs.ts --repo OWNER/NAME --stale-days 14        # override open-for threshold
 *   bun scripts/triage-prs.ts --repo OWNER/NAME --report-dir DIR       # write the report file
 */
import {
  HYGIENE_MARKER,
  type RuleFile,
  daysIdle,
  ghApi,
  ghGet,
  ghRun,
  loadRules,
  pathLabels,
  toPr,
} from "./triage-lib";

interface FileDiff {
  filename: string;
}
interface CheckRun {
  name: string | null;
  status: string;
  conclusion: string | null;
}

// ---------- CLI ----------

const argv = Bun.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  const next = i >= 0 ? argv[i + 1] : undefined;
  return next && !next.startsWith("--") ? next : undefined;
};
const repos: string[] = [];
{
  let i = 0;
  while (i < argv.length) {
    if (argv[i] === "--repo") {
      const v = argv[++i];
      if (v && v.includes("/")) repos.push(v);
    }
    i += 1;
  }
}
const apply = argv.includes("--apply");
const staleDays = Number(opt("--stale-days"));
const reportDir = opt("--report-dir");

if (repos.length === 0) {
  console.error("usage: triage-prs.ts --repo OWNER/NAME [--repo ...] [--apply] [--stale-days N] [--report-dir DIR]");
  process.exit(2);
}

const rules: RuleFile = loadRules(new URL(".", import.meta.url).pathname);
const now = new Date();
const dry = !apply;
const openForDays = staleDays || rules.pr_stale_days;
const plan: string[] = [];
const summary: Array<{ repo: string; open: number; noCi: number; failedCi: number; stale: number }> = [];

for (const repo of repos) {
  const prs = (await ghGet<Record<string, unknown>[]>("repos/" + repo + "/pulls?state=open&per_page=100&sort=updated&direction=asc", true)).map(toPr);
  let noCi = 0;
  let failedCi = 0;
  let staleCount = 0;

  for (const pr of prs) {
    const files = await ghGet<FileDiff[]>("repos/" + repo + `/pulls/${pr.number}/files?per_page=100`);
    // Guard: draft PRs may lack a base commit SHA
    const checks = pr.headRefOid
      ? await ghGet<{ check_runs?: CheckRun[] } | CheckRun[]>(
          "repos/" + repo + `/commits/${pr.headRefOid}/check-runs?per_page=100`,
        ).then((r) => (Array.isArray(r) ? r : r.check_runs ?? []))
      : [];
    const issueView = await ghGet<{ labels: Array<{ name: string }> }>(
      "repos/" + repo + `/issues/${pr.number}`,
    );
    const existing = new Set(issueView.labels.map((l) => l.name));
    const derived = pathLabels(files.map((f) => f.filename), rules);
    const stuck = checks.filter((c) => c.status !== "completed");
    const failed = checks.filter((c) => c.status === "completed" && c.conclusion === "failure");
    const hasAny = checks.length > 0;
    const age = daysIdle(pr.createdAt, now);

    if (!hasAny) noCi += 1;
    if (failed.length > 0) failedCi += 1;
    if (age >= openForDays) staleCount += 1;

    // 1. Path labels (skip ones already present — never remove labels).
    for (const label of derived) {
      if (existing.has(label)) continue;
      plan.push(`${repo}#${pr.number} ${dry ? "would label" : "labels"} ${label} (paths)`);
      if (apply) {
        await ghApi(["repos/" + repo + "/pulls/" + pr.number + "/labels", "-f", `labels[]=${label}`], false, "POST");
      }
    }

    // 2. Status block on the PR (human PRs only; bots get flagged in the report instead).
    const isBot = pr.author.login === "dependabot[bot]" || pr.author.login.endsWith("[bot]");
    const notes: string[] = [];
    if (!hasAny) notes.push(`no CI runs detected on ${pr.headRefOid.slice(0, 8)}`);
    else if (failed.length > 0) notes.push(`failing checks: ${failed.map((f) => f.name ?? "?").join(", ")}`);
    if (stuck.length > 0) notes.push(`${stuck.length} check(s) still running`);
    if (age >= openForDays) notes.push(`open for ${age} days (threshold ${openForDays})`);
    if (notes.length === 0) continue;
    if (isBot) {
      plan.push(`${repo}#${pr.number} (bot PR) ${notes.join("; ")}`);
      continue;
    }
    plan.push(`${repo}#${pr.number} ${dry ? "would comment" : "comments"}: ${notes.join("; ")}`);
    if (apply) {
      const body = `${HYGIENE_MARKER}\nPR hygiene check: ${notes.join("; ")}.\nPlease update or merge — no action needed if this is intentional.`;
      await ghRun(["pr", "comment", String(pr.number), "-R", repo, "--body", body]);
    }
  }

  summary.push({ repo, open: prs.length, noCi, failedCi, stale: staleCount });
}

// ---------- report ----------

if (summary.length > 0) {
  const stamp = now.toISOString().slice(0, 10);
  const md = [
    `# PR hygiene report — ${stamp}`,
    "",
    `mode: ${dry ? "dry-run (no state changed)" : "APPLY"}`,
    "",
    "| repo | open PRs | no CI | failed CI | open ≥ N d |",
    "|---|---|---|---|---|",
    ...summary.map((s) => `| \`${s.repo}\` | ${s.open} | ${s.noCi} | ${s.failedCi} | ${s.stale} |`),
    "",
    "## Actions",
    "",
    ...(plan.length > 0 ? plan.map((p) => `- ${p}`) : ["_nothing to flag — PR queue is clean_"]),
    "",
  ].join("\n");
  if (reportDir) {
    const path = `${reportDir}/${stamp}-pr-hygiene${dry ? "-dry" : ""}.md`;
    await Bun.write(path, md);
    console.error(`report written: ${path}`);
  } else {
    process.stdout.write(md);
  }
}
