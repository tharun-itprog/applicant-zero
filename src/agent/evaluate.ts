import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { JobPosting } from "../adapters/types.js";
import { loadPreferences } from "../config.js";
import { runStage } from "./runner.js";
import { createPackageTool, createScoreTool, type MatchScore } from "./tools.js";

export interface EvaluationResult {
  score: MatchScore;
  /** Set only when the score cleared the threshold and a package was written. */
  packageDir?: string;
}

function loadProfileResume(): string {
  const path = existsSync("profile/base_resume.md")
    ? "profile/base_resume.md"
    : "profile/example.resume.md";
  return readFileSync(path, "utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

/**
 * Two-stage agentic evaluation of a prefiltered posting.
 *
 * Stage 1 (score): the agent sees the job description and the candidate's
 * base resume, and must call submit_match_score. Below threshold → stop; the
 * tailoring stage never runs and never spends tokens.
 *
 * Stage 2 (tailor): a fresh session — with the stage-1 assessment as context —
 * must call submit_application_package. The output lands in packages/ for
 * human review; nothing is ever submitted anywhere automatically.
 */
export async function evaluateJob(db: Database.Database, job: JobPosting): Promise<EvaluationResult> {
  const resume = loadProfileResume();
  const threshold = loadPreferences().agent.threshold;
  const jd = stripHtml(job.content ?? "").slice(0, 14_000) || "(no description available)";

  const jobHeader = `Company: ${job.company}\nRole: ${job.title}\nLocation: ${job.location || "n/a"}`;

  const scorer = createScoreTool();
  await runStage(
    `You are screening a job posting for a specific candidate.

# Job posting
${jobHeader}

${jd}

# Candidate's resume
${resume}

Assess how well this candidate fits this specific role. Be honest — an inflated score wastes the candidate's time. Then call submit_match_score exactly once.`,
    [scorer.tool],
  );
  const score = scorer.result();
  if (!score) throw new Error(`agent ended without calling submit_match_score for ${job.id}`);

  db.prepare("UPDATE jobs SET match_score = ?, match_reasoning = ? WHERE id = ?").run(
    score.score,
    score.reasoning,
    job.id,
  );

  if (score.score < threshold) return { score };

  const packager = createPackageTool();
  await runStage(
    `You are preparing an application package for a candidate. A screening pass scored this role ${score.score}/100.
Strengths to emphasize: ${score.strengths.join("; ") || "n/a"}
Gaps to de-emphasize (never lie about them): ${score.gaps.join("; ") || "n/a"}

# Job posting
${jobHeader}

${jd}

# Candidate's base resume (the only source of truth about the candidate)
${resume}

Tailor the resume for this role: reorder sections and bullets, mirror the posting's terminology where the experience genuinely matches, keep it one page. NEVER invent employers, titles, dates, skills, or accomplishments that are not in the base resume. Also draft answers to likely application questions. Then call submit_application_package exactly once.`,
    [packager.tool],
  );
  const pkg = packager.result();
  if (!pkg) throw new Error(`agent ended without calling submit_application_package for ${job.id}`);

  const dir = join("packages", `${new Date().toISOString().slice(0, 10)}-${job.company}-${slugify(job.title)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "job.md"), `# ${job.title}\n\n${jobHeader}\nApply: ${job.url}\n\n---\n\n${jd}\n`);
  writeFileSync(
    join(dir, "match.md"),
    `# Match: ${score.score}/100\n\n${score.reasoning}\n\n## Strengths\n${score.strengths.map((s) => `- ${s}`).join("\n")}\n\n## Gaps\n${score.gaps.map((g) => `- ${g}`).join("\n")}\n`,
  );
  writeFileSync(join(dir, "resume.md"), pkg.resumeMarkdown);
  writeFileSync(join(dir, "answers.md"), pkg.answersMarkdown);

  db.prepare(
    `INSERT INTO applications (job_id, status, package_dir) VALUES (?, 'prepared', ?)
     ON CONFLICT(job_id) DO UPDATE SET status = 'prepared', package_dir = excluded.package_dir`,
  ).run(job.id, dir);

  return { score, packageDir: dir };
}
