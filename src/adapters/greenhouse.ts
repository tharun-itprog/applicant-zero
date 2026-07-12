import { type ATSAdapter, type JobPosting, fetchJson, jobId } from "./types.js";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  updated_at?: string;
  first_published?: string;
  content?: string;
}

export const greenhouse: ATSAdapter = {
  ats: "greenhouse",
  async fetchJobs(companySlug: string): Promise<JobPosting[]> {
    const data = (await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs?content=true`,
    )) as { jobs?: GreenhouseJob[] };
    return (data.jobs ?? []).map((j) => ({
      id: jobId("greenhouse", companySlug, j.id),
      ats: "greenhouse",
      company: companySlug,
      externalId: String(j.id),
      title: j.title,
      location: j.location?.name ?? "",
      url: j.absolute_url,
      postedAt: j.first_published ?? j.updated_at,
      content: j.content,
    }));
  },
};
