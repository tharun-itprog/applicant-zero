import { type ATSAdapter, type JobPosting, fetchJson, jobId } from "./types.js";

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  isListed?: boolean;
}

export const ashby: ATSAdapter = {
  ats: "ashby",
  async fetchJobs(companySlug: string): Promise<JobPosting[]> {
    const data = (await fetchJson(
      `https://api.ashbyhq.com/posting-api/job-board/${companySlug}`,
    )) as { jobs?: AshbyJob[] };
    return (data.jobs ?? [])
      .filter((j) => j.isListed !== false)
      .map((j) => {
        const locations = [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)]
          .filter(Boolean)
          .join("; ");
        return {
          id: jobId("ashby", companySlug, j.id),
          ats: "ashby",
          company: companySlug,
          externalId: j.id,
          title: j.title,
          location: locations,
          url: j.jobUrl ?? j.applyUrl ?? "",
          postedAt: j.publishedAt,
          content: j.descriptionPlain ?? j.descriptionHtml,
        };
      });
  },
};
