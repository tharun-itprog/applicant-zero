import { writeFileSync } from "node:fs";
import { stringify } from "yaml";
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { loadPreferences, type Preferences } from "../config.js";
import { runStage } from "../agent/runner.js";

/**
 * Natural-language preference updates: "I want data analyst roles, remote or
 * NYC, drop the intern stuff" → structured edit of profile/preferences.yaml.
 * The agent's only tool is update_preferences; it cannot do anything else.
 */
export async function handlePreferenceMessage(text: string): Promise<string> {
  const current = loadPreferences();
  let updated: Preferences | undefined;

  const tool = defineTool({
    name: "update_preferences",
    label: "Update preferences",
    description:
      "Apply the user's requested changes to their job-search preferences. Omit any field the user did not ask to change.",
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

  const reply = await runStage(
    `You manage job-search preferences for a Telegram bot user. Matching is case-insensitive substring against job titles and locations.

Current preferences:
${stringify(current)}

User message: "${text}"

If the user is asking to change what jobs they're looking for (roles, locations, seniority, threshold), call update_preferences once with the changed fields, then confirm briefly. If the message is a question or unrelated, just answer in one or two short sentences without calling the tool.`,
    [tool],
  );

  if (updated) {
    writeFileSync(
      "profile/preferences.yaml",
      `# Managed by the applicant-zero Telegram bot. Edit by hand or by messaging the bot.\n${stringify(updated)}`,
    );
  }
  return reply || "Done.";
}
