import Database from "better-sqlite3";
import type { JobPosting } from "../adapters/types.js";

export interface JobRow {
  id: string;
  ats: string;
  company: string;
  external_id: string;
  title: string;
  location: string;
  url: string;
  posted_at: string | null;
  content: string | null;
  first_seen_at: string;
  last_seen_at: string;
  closed_at: string | null;
  prefilter_pass: number | null;
  notified_at: string | null;
  match_score: number | null;
  match_reasoning: string | null;
}

export function openDb(path = process.env.AZERO_DB ?? "azero.db"): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      ats TEXT NOT NULL,
      company TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      posted_at TEXT,
      content TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      closed_at TEXT,
      prefilter_pass INTEGER,
      notified_at TEXT
    );
    CREATE TABLE IF NOT EXISTS applications (
      job_id TEXT PRIMARY KEY REFERENCES jobs(id),
      status TEXT NOT NULL DEFAULT 'pending',
      package_dir TEXT,
      applied_at TEXT,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      companies INTEGER,
      jobs_seen INTEGER,
      new_jobs INTEGER,
      errors TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_first_seen ON jobs(first_seen_at);
  `);
  const jobCols = (db.prepare("PRAGMA table_info(jobs)").all() as { name: string }[]).map((c) => c.name);
  if (!jobCols.includes("match_score")) {
    db.exec("ALTER TABLE jobs ADD COLUMN match_score REAL; ALTER TABLE jobs ADD COLUMN match_reasoning TEXT;");
  }
  db.exec("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  return db;
}

export function getKv(db: Database.Database, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setKv(db: Database.Database, key: string, value: string): void {
  db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export interface ApplicationRow {
  job_id: string;
  status: string;
  package_dir: string | null;
  applied_at: string | null;
  title: string;
  company: string;
  url: string;
}

export function listApplications(db: Database.Database, limit = 15): ApplicationRow[] {
  return db
    .prepare(
      `SELECT a.job_id, a.status, a.package_dir, a.applied_at, j.title, j.company, j.url
       FROM applications a JOIN jobs j ON j.id = a.job_id
       ORDER BY a.rowid DESC LIMIT ?`,
    )
    .all(limit) as ApplicationRow[];
}

export function markApplied(db: Database.Database, jobId: string): void {
  db.prepare("UPDATE applications SET status = 'applied', applied_at = ? WHERE job_id = ?").run(
    new Date().toISOString(),
    jobId,
  );
}

/** Upsert a batch of postings. Returns the postings not previously in the DB. */
export function upsertJobs(db: Database.Database, postings: JobPosting[]): JobPosting[] {
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO jobs (id, ats, company, external_id, title, location, url, posted_at, content, first_seen_at, last_seen_at)
    VALUES (@id, @ats, @company, @externalId, @title, @location, @url, @postedAt, @content, @firstSeenAt, @lastSeenAt)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      location = excluded.location,
      last_seen_at = excluded.last_seen_at,
      closed_at = NULL
  `);
  const exists = db.prepare("SELECT 1 FROM jobs WHERE id = ?");

  const fresh: JobPosting[] = [];
  const tx = db.transaction((batch: JobPosting[]) => {
    for (const p of batch) {
      if (!exists.get(p.id)) fresh.push(p);
      insert.run({
        ...p,
        postedAt: p.postedAt ?? null,
        content: p.content ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }
  });
  tx(postings);
  return fresh;
}

/** Mark jobs for a company that disappeared from its board as closed. */
export function markClosed(db: Database.Database, ats: string, company: string, liveIds: string[]): number {
  const now = new Date().toISOString();
  const open = db
    .prepare("SELECT id FROM jobs WHERE ats = ? AND company = ? AND closed_at IS NULL")
    .all(ats, company) as { id: string }[];
  const live = new Set(liveIds);
  const close = db.prepare("UPDATE jobs SET closed_at = ? WHERE id = ?");
  let closed = 0;
  for (const row of open) {
    if (!live.has(row.id)) {
      close.run(now, row.id);
      closed++;
    }
  }
  return closed;
}

export function setPrefilterResult(db: Database.Database, id: string, pass: boolean): void {
  db.prepare("UPDATE jobs SET prefilter_pass = ? WHERE id = ?").run(pass ? 1 : 0, id);
}

export function setNotified(db: Database.Database, id: string): void {
  db.prepare("UPDATE jobs SET notified_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

export function recordRun(
  db: Database.Database,
  stats: { startedAt: string; companies: number; jobsSeen: number; newJobs: number; errors: string[] },
): void {
  db.prepare(
    "INSERT INTO runs (started_at, finished_at, companies, jobs_seen, new_jobs, errors) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    stats.startedAt,
    new Date().toISOString(),
    stats.companies,
    stats.jobsSeen,
    stats.newJobs,
    stats.errors.length ? JSON.stringify(stats.errors) : null,
  );
}

export interface SearchOptions {
  /** Keywords ANDed as case-insensitive substrings of title+location+company. */
  terms: string[];
  postedWithinDays?: number;
  limit?: number;
}

export function searchJobs(db: Database.Database, opts: SearchOptions): JobRow[] {
  const clauses = ["closed_at IS NULL"];
  const params: unknown[] = [];
  for (const t of opts.terms) {
    clauses.push("(title || ' ' || location || ' ' || company) LIKE ?");
    params.push(`%${t}%`);
  }
  if (opts.postedWithinDays) {
    clauses.push("posted_at >= ?");
    params.push(new Date(Date.now() - opts.postedWithinDays * 86_400_000).toISOString());
  }
  params.push(opts.limit ?? 10);
  return db
    .prepare(
      `SELECT * FROM jobs WHERE ${clauses.join(" AND ")}
       ORDER BY COALESCE(posted_at, first_seen_at) DESC LIMIT ?`,
    )
    .all(...params) as JobRow[];
}

export function recentMatches(db: Database.Database, limit = 25): JobRow[] {
  return db
    .prepare(
      "SELECT * FROM jobs WHERE prefilter_pass = 1 AND closed_at IS NULL ORDER BY first_seen_at DESC LIMIT ?",
    )
    .all(limit) as JobRow[];
}
