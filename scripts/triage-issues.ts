#!/usr/bin/env bun
/**
 * Issue hygiene triage: labels, milestones, and stale-issue handling for the WAFINE repos.
 *
 * Dry-run by default: prints the exact plan and never mutates GitHub state.
 * Writes only when --apply is passed. Closing stale issues additionally requires --close-stale,
 * and is always skipped for issues labeled status:launch-blocking.
 *
 *   bun scripts/triage-issues.ts --repo OWNER/NAME [--repo ...]           # dry run
 *   bun scripts/triage-issues.ts --repo OWNER/NAME --apply                 # create labels/milestones, apply
 *   bun scripts/triage-issues.ts --repo OWNER/NAME --stale-days 180        # override threshold
 *   bun scripts/triage-issues.ts --repo OWNER/NAME --apply --close-stale   # also close stale
 *   bun scripts/triage-issues.ts --repo OWNER/NAME --report-dir DIR        # write the report file
 */
import {
  HYGIENE_MARKER,
  type Issue,
  type RuleFile,
  daysIdle,
  ghApi,
  ghGet,
  ghRun,
  issueKeywords,
  loadRules,
  milestoneToken,
  wfId,
} from "./triage-lib";

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
const closeStale = argv.includes("--close-stale");
const staleDays = Number(opt("--stale-days")) || null;
const reportDir = opt("--report-dir");

if (repos.length === 0) {
  console.error(
    "usage: triage-issues.ts --repo OWNER/NAME [--repo ...] [--apply] [--close-stale] [--stale-days N] [--ensure-milestones] [--report-dir DIR]",
  );
  process.exit(2);
}

const rules: RuleFile = loadRules(new URL(".", import.meta.url).pathname);
const now = new Date();
const dry = !apply;
const plan: string[] = [];
const summary: Array<{ repo: string; open: number; labeled: number; p0: number; stale: number }> = [];

// ---------- write helpers (all guarded by dry) ----------

async function createLabel(repo: string, name: string): Promise<void> {
  const meta = rules.labels[name];
  if (!meta) {
    plan.push(`${repo} label ${name}: no metadata in issue-rules.json — create it manually`);
    return;
  }
  if (dry) {
    plan.push(`${repo} would create label ${name}`);
    return;
  }
  await ghApi(
    ["repos/" + repo + "/labels", "-f", `name=${name}`, "-f", `color=${meta.color}`, "-f", `description=${meta.description}`],
    false,
    "POST",
  );
  plan.push(`${repo} created label ${name}`);
}

const milestoneCache = new Map<string, Array<{ number: number; title: string }>>();

async function createMilestone(repo: string, token: string): Promise<number | null> {
  let existing = milestoneCache.get(repo);
  if (!existing) {
    existing = await ghGet<Array<{ number: number; title: string }>>("repos/" + repo + "/milestones?state=all&per_page=100", true);
    milestoneCache.set(repo, existing);
  }
  const found = existing.find((m) => m.title === token);
  if (found) return found.number;
  const def = rules.milestones.find((m) => m.title === token);
  if (!def) {
    plan.push(`${repo} milestone ${token}: no definition in issue-rules.json — skipping`);
    return null;
  }
  if (dry) {
    plan.push(`${repo} would create milestone ${token} (due ${def.due})`);
    return null;
  }
  const created = JSON.parse(
    await ghApi(["repos/" + repo + "/milestones", "-f", `title=${token}`, "-f", `due_on=${def.due}T23:59:59Z`], false, "POST"),
  ) as { number: number };
  existing.push({ number: created.number, title: token });
  plan.push(`${repo} created milestone ${token} (due ${def.due})`);
  return created.number;
}

async function addLabel(repo: string, issue: Issue, label: string): Promise<void> {
  plan.push(`${repo}#${issue.number} ${dry ? "would label" : "labeled"} ${label}`);
  if (dry) return;
  await ghApi(["repos/" + repo + "/issues/" + issue.number + "/labels", "-f", `labels[]=${label}`], false, "POST");
}

async function setMilestone(repo: string, issue: Issue, token: string, milestoneNumber: number): Promise<void> {
  plan.push(`${repo}#${issue.number} ${dry ? "milestone ->" : "milestone set to"} ${token}`);
  if (dry) return;
  await ghApi(["repos/" + repo + "/issues/" + issue.number, "-F", `milestone=${milestoneNumber}`], false, "PATCH");
}

async function staleComment(repo: string, issue: Issue, idle: number, threshold: number, close: boolean): Promise<void> {
  const action = close
    ? `Closing as stale (no activity for ${idle} days; threshold: ${threshold}). Reopen if it is still needed.`
    : `This issue has had no activity for ${idle} days (hygiene threshold: ${threshold}).\nIf it is still relevant, post a short status and it is back in the queue; if not, close it with an explanation.`;
  const body = `${HYGIENE_MARKER}\n${action}`;
  if (dry) {
    plan.push(`${repo}#${issue.number} stale (${idle}d) — would comment${close ? " and close (not planned)" : ""}`);
    return;
  }
  await ghRun(["issue", "comment", String(issue.number), "-R", repo, "--body", body]);
  plan.push(`${repo}#${issue.number} stale (${idle}d) — hygiene comment posted`);
  if (close) {
    await ghRun(["issue", "close", String(issue.number), "-R", repo, "--reason", "not planned"]);
    plan.push(`${repo}#${issue.number} closed as stale`);
  }
}

// ---------- per-repo pass ----------

for (const repo of repos) {
  const threshold = staleDays ?? rules.stale_days.default;
  const issues = (await ghGet<Issue[]>("repos/" + repo + "/issues?state=open&per_page=100&sort=updated&direction=asc", true)).filter(
    (i) => !i.pull_request,
  );

  // Ensure the two status labels exist before any apply run touches them.
  const existingLabels = await ghGet<Array<{ name: string }>>("repos/" + repo + "/labels?per_page=100", true);
  const have = new Set(existingLabels.map((l) => l.name));
  for (const name of ["status:needs-triage", "status:launch-blocking"]) {
    if (!have.has(name)) await createLabel(repo, name);
  }

  for (const issue of issues) {
    const existing = new Set(issue.labels.map((l) => l.name));
    const wid = wfId(issue);
    const mapped = wid ? rules.wf_map[wid] : undefined;
    const isTracker = milestoneToken(issue) !== null && /^(M\d+)\s/.test(issue.title);
    const derived = mapped ? [mapped.area, mapped.priority, mapped.type] : issueKeywords(issue, rules);

    // 1. Labels: never remove, only add what the rules compute and the issue lacks.
    //    Recomputed every run so a previously crashed apply self-heals.
    if (mapped) {
      for (const l of derived) if (!existing.has(l)) await addLabel(repo, issue, l);
    } else if (isTracker) {
      // Milestone tracker issues (M0…M12 epics) stay lean: just type:task.
      const task = derived.find((l) => l.startsWith("type:")) ?? "type:task";
      if (!existing.has(task)) await addLabel(repo, issue, task);
    } else if (derived.some((l) => l.startsWith("area:"))) {
      for (const l of derived) if (!existing.has(l)) await addLabel(repo, issue, l);
      // Brief: every open issue needs a priority label too; without one, leave it
      // for the owner by adding status:needs-triage.
      if (!derived.some((l) => /^P\d$/.test(l)) && !existing.has("status:needs-triage")) {
        await addLabel(repo, issue, "status:needs-triage");
      }
    } else {
      await addLabel(repo, issue, "status:needs-triage");
    }

    // 2. Launch-blocking: open P0 work items.
    if (mapped?.priority === "P0" && !existing.has("status:launch-blocking")) {
      await addLabel(repo, issue, "status:launch-blocking");
    }

    // 3. Milestones: token from the body ("Milestone: M0") or the M-tracker title.
    //    Apply mode creates the milestone object if missing, then attaches the issue.
    const token = milestoneToken(issue);
    if (token && issue.milestone?.title !== token) {
      const number = await createMilestone(repo, token);
      if (number === null && dry) {
        plan.push(`${repo}#${issue.number} milestone -> ${token}`);
      } else if (number !== null) {
        await setMilestone(repo, issue, token, number);
      }
    }
  }

  // 4. Stale: comment (and optionally close) once past the repo's threshold.
  let stale = 0;
  for (const issue of issues) {
    const idle = daysIdle(issue.updated_at, now);
    if (idle < threshold) continue;
    stale += 1;
    if (issue.labels.some((l) => l.name === "status:launch-blocking")) {
      plan.push(`${repo}#${issue.number} idle ${idle}d — launch-blocking, never auto-closed`);
      continue;
    }
    await staleComment(repo, issue, idle, threshold, closeStale && apply);
  }

  summary.push({
    repo,
    open: issues.length,
    labeled: issues.filter((i) => i.labels.some((l) => l.name.startsWith("area:"))).length,
    p0: issues.filter((i) => i.labels.some((l) => l.name === "status:launch-blocking")).length,
    stale,
  });
}

// ---------- report ----------

if (summary.length > 0) {
  const stamp = now.toISOString().slice(0, 10);
  const md = [
    `# Issue hygiene report — ${stamp}`,
    "",
    `mode: ${dry ? "dry-run (no state changed)" : "APPLY"}${closeStale ? " + close-stale" : ""}`,
    "",
    "| repo | open | already area-labeled | open P0 | idle ≥ threshold |",
    "|---|---|---|---|---|",
    ...summary.map((s) => `| \`${s.repo}\` | ${s.open} | ${s.labeled} | ${s.p0} | ${s.stale} |`),
    "",
    "## Actions",
    "",
    ...(plan.length > 0 ? plan.map((p) => `- ${p}`) : ["_nothing to do — tracker is clean_"]),
    "",
  ].join("\n");
  if (reportDir) {
    const path = `${reportDir}/${stamp}-issue-hygiene${dry ? "-dry" : ""}.md`;
    await Bun.write(path, md);
    console.error(`report written: ${path}`);
  } else {
    process.stdout.write(md);
  }
}
