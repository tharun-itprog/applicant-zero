import type { JobPosting } from "./adapters/types.js";
import type { Preferences } from "./config.js";

/**
 * Cheap deterministic filter that runs before any LLM sees a posting.
 * A posting passes when its title matches at least one include term,
 * matches no exclude term, and its location isn't explicitly excluded.
 * Empty include lists mean "match everything".
 */
export function prefilter(job: JobPosting, prefs: Preferences): boolean {
  const title = job.title.toLowerCase();
  const location = job.location.toLowerCase();

  const { include: tInc, exclude: tExc } = prefs.titles;
  if (tInc.length && !tInc.some((t) => title.includes(t.toLowerCase()))) return false;
  if (tExc.some((t) => title.includes(t.toLowerCase()))) return false;

  const { include: lInc, exclude: lExc } = prefs.locations;
  if (lInc.length && location && !lInc.some((l) => location.includes(l.toLowerCase()))) return false;
  if (lExc.some((l) => location && location.includes(l.toLowerCase()))) return false;

  return true;
}
