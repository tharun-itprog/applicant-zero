import { type ATSAdapter, type JobPosting, fetchJson, jobId } from "./types.js";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  categories?: { location?: string; allLocations?: string[] };
  descriptionPlain?: string;
}

export const lever: ATSAdapter = {
  ats: "lever",
  async fetchJobs(companySlug: string): Promise<JobPosting[]> {
    const data = (await fetchJson(
      `https://api.lever.co/v0/postings/${companySlug}?mode=json`,
    )) as LeverPosting[];
    return data.map((j) => ({
      id: jobId("lever", companySlug, j.id),
      ats: "lever",
      company: companySlug,
      externalId: j.id,
      title: j.text,
      location: j.categories?.allLocations?.join("; ") ?? j.categories?.location ?? "",
      url: j.hostedUrl,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
      content: j.descriptionPlain,
    }));
  },
};
