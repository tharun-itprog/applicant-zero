import { writeFileSync } from "node:fs";
import { stringify } from "yaml";
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type Database from "better-sqlite3";
import { loadCompanies, loadPreferences, type Preferences } from "../config.js";
import { runStage } from "../agent/runner.js";
import { searchJobs } from "../db/index.js";

export function formatJobLine(r: { title: string; company: string; location: string; posted_at: string | null; url: string; match_score?: number | null }): string {
  const posted = r.posted_at ? ` · posted ${r.posted_at.slice(0, 10)}` : "";
  const score = r.match_score != null ? ` · 🤖 ${r.match_score}/100` : "";
  return `• ${r.title} @ ${r.company}${score}\n  ${r.location || "-"}${posted}\n  ${r.url}`;
}

/**
 * Free-text chat handler: a sandboxed agent with exactly two capabilities —
 * update the user's saved filters, and search the already-stored postings.
 * It cannot fetch the web, run commands, or submit anything.
 */
export async function handleChatMessage(db: Database.Database, text: string): Promise<string> {
  const current = loadPreferences();
  const companies = loadCompanies();
  let updated: Preferences | undefined;

  const preferencesTool = defineTool({
    name: "update_preferences",
    label: "Update preferences",
    description:
      "Apply the user's requested changes to their saved job-search filters. Omit any field the user did not ask to change.",
    parameters: Type.Object({
      titlesInclude: Type.Optional(Type.Array(Type.String(), { description: "Full replacement list of title keywords to match" })),
      titlesExclude: Type.Optional(Type.Array(Type.String(), { description: "Full replacement list of title keywords to reject" })),
      locationsInclude: Type.Optional(Type.Array(Type.String(), { description: "Full replacement list of location keywords to match" })),
      locationsExclude: Type.Optional(Type.Array(Type.String(), { description: "Full replacement list of location keywords to reject" })),
      threshold: Type.Optional(Type.Number({ description: "Agent match-score threshold 0-100" })),
      summary: Type.String({ description: "One short sentence telling the user what changed" }),
    }),
    execute: async (_id, p) => {
      updated = {
        titles: {
          include: p.titlesInclude ?? current.titles.include,
          exclude: p.titlesExclude ?? current.titles.exclude,
        },
        locations: {
          include: p.locationsInclude ?? current.locations.include,
          exclude: p.locationsExclude ?? current.locations.exclude,
        },
        agent: { threshold: p.threshold ?? current.agent.threshold },
      };
      return { content: [{ type: "text" as const, text: p.summary }], details: {} };
    },
  });

  const searchTool = defineTool({
    name: "search_jobs",
    label: "Search stored jobs",
    description:
      "Search the local database of currently-open postings from the watched companies. Terms are ANDed case-insensitive substrings over title+location+company — prefer few, broad terms ('engineer', not 'software engineer').",
    parameters: Type.Object({
      terms: Type.Array(Type.String(), { description: "1-3 broad keywords, e.g. ['analyst','remote']" }),
      postedWithinDays: Type.Optional(Type.Number({ description: "Only jobs posted in the last N days" })),
    }),
    execute: async (_id, p) => {
      const rows = searchJobs(db, { terms: p.terms, postedWithinDays: p.postedWithinDays, limit: 8 });
      const text = rows.length
        ? rows.map(formatJobLine).join("\n")
        : "No stored postings match those terms.";
      return { content: [{ type: "text" as const, text }], details: {} };
    },
  });

  const reply = await runStage(
    `You are the chat brain of applicant-zero, a Telegram job-search bot. Your reply goes straight to the user's phone: plain text, short, include job URLs when listing jobs. No markdown headers.

You have two tools:
- search_jobs: query the LOCAL database of open postings. It only contains jobs from the watched companies (currently: ${companies.map((c) => c.name).join(", ")}). You cannot search the wider web.
- update_preferences: change the user's saved alert filters (matching is case-insensitive substring on job titles and locations).

Current saved filters:
${stringify(current)}

User message: "${text}"

If they're asking to FIND jobs, use search_jobs and present the results (mention they can /evaluate <title fragment> to get a tailored resume). If they're asking to CHANGE what they get alerted about, use update_preferences. Do both if the message implies both. If neither applies, answer briefly.`,
    [preferencesTool, searchTool],
  );

  if (updated) {
    writeFileSync(
      "profile/preferences.yaml",
      `# Managed by the applicant-zero Telegram bot. Edit by hand or by messaging the bot.\n${stringify(updated)}`,
    );
  }
  return reply || "Done.";
}
