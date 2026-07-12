export interface JobPosting {
  /** Globally unique: `${ats}:${companySlug}:${externalId}` */
  id: string;
  ats: string;
  company: string;
  externalId: string;
  title: string;
  location: string;
  url: string;
  /** ISO 8601 if the ATS exposes it */
  postedAt?: string;
  /** Plain-text or HTML description if the ATS exposes it */
  content?: string;
}

export interface ATSAdapter {
  ats: string;
  /** Fetch all currently open postings for a company's public job board. */
  fetchJobs(companySlug: string): Promise<JobPosting[]>;
}

export function jobId(ats: string, company: string, externalId: string | number): string {
  return `${ats}:${company}:${externalId}`;
}

export async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "applicant-zero/0.1 (job seeker tool)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}
