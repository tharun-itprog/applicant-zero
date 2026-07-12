import type Database from "better-sqlite3";
import { getAdapter } from "../adapters/index.js";
import type { JobPosting } from "../adapters/types.js";
import { loadCompanies, loadPreferences } from "../config.js";
import { markClosed, recordRun, setNotified, setPrefilterResult, upsertJobs } from "../db/index.js";
import { notifyNewJob } from "../notify/telegram.js";
import { prefilter } from "../prefilter.js";

export interface PollResult {
  companies: number;
  jobsSeen: number;
  newJobs: number;
  matches: JobPosting[];
  errors: string[];
}

/**
 * One full poll cycle: fetch every company's board, diff against the DB,
 * prefilter the new postings, notify on matches. A failing company never
 * aborts the cycle — its error is recorded and the rest proceed.
 *
 * First run seeds the DB silently (everything is "new" on run one; alerting
 * on hundreds of pre-existing jobs would be noise).
 */
export async function poll(db: Database.Database): Promise<PollResult> {
  const startedAt = new Date().toISOString();
  const companies = loadCompanies();
  const prefs = loadPreferences();
  const isFirstRun = (db.prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n === 0;

  const result: PollResult = { companies: companies.length, jobsSeen: 0, newJobs: 0, matches: [], errors: [] };

  const fetches = companies.map(async (c) => {
    const postings = await getAdapter(c.ats).fetchJobs(c.slug);
    return { company: c, postings };
  });

  for (const [i, settled] of (await Promise.allSettled(fetches)).entries()) {
    const company = companies[i]!;
    if (settled.status === "rejected") {
      const message = `${company.name}: ${settled.reason}`;
      console.error(`[poll] ${message}`);
      result.errors.push(message);
      continue;
    }
    const { postings } = settled.value;
    result.jobsSeen += postings.length;

    const fresh = upsertJobs(db, postings);
    markClosed(db, company.ats, company.slug, postings.map((p) => p.id));
    result.newJobs += fresh.length;

    if (isFirstRun) continue;

    for (const job of fresh) {
      const pass = prefilter(job, prefs);
      setPrefilterResult(db, job.id, pass);
      if (!pass) continue;
      result.matches.push(job);
      try {
        await notifyNewJob(job);
        setNotified(db, job.id);
      } catch (err) {
        result.errors.push(`notify ${job.id}: ${err}`);
      }
    }
  }

  recordRun(db, { startedAt, ...result });
  if (isFirstRun) {
    console.log(`[poll] first run: seeded ${result.newJobs} existing jobs without notifying`);
  }
  return result;
}
