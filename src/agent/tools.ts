import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Structured-output-via-tools pattern: each agent stage gets exactly one
 * "submit" tool and must call it to deliver its result. The closure captures
 * the payload so the orchestrator can read it after the run. The agent has no
 * other tools registered — it cannot read files, run commands, or submit
 * anything to the outside world.
 */

export interface MatchScore {
  score: number;
  reasoning: string;
  strengths: string[];
  gaps: string[];
}

export function createScoreTool() {
  let captured: MatchScore | undefined;
  const tool = defineTool({
    name: "submit_match_score",
    label: "Submit match score",
    description:
      "Submit your final fit assessment for this job posting. Call this exactly once with your conclusion.",
    parameters: Type.Object({
      score: Type.Number({
        description:
          "Fit score 0-100. 90+: near-perfect match. 70-89: strong, worth applying. 50-69: partial. <50: poor fit.",
      }),
      reasoning: Type.String({ description: "2-4 sentences justifying the score" }),
      strengths: Type.Array(Type.String(), {
        description: "Candidate qualifications that match this role's requirements",
      }),
      gaps: Type.Array(Type.String(), {
        description: "Role requirements the candidate does not clearly meet",
      }),
    }),
    execute: async (_toolCallId, params) => {
      captured = params;
      return { content: [{ type: "text" as const, text: "Score recorded." }], details: {} };
    },
  });
  return { tool, result: () => captured };
}

export interface ApplicationPackage {
  resumeMarkdown: string;
  answersMarkdown: string;
}

export function createPackageTool() {
  let captured: ApplicationPackage | undefined;
  const tool = defineTool({
    name: "submit_application_package",
    label: "Submit application package",
    description:
      "Submit the tailored resume and drafted application answers for human review. Call this exactly once when both are complete.",
    parameters: Type.Object({
      resumeMarkdown: Type.String({
        description:
          "The complete tailored resume in Markdown. Reorder and reword to emphasize fit; NEVER invent experience, employers, dates, or skills not present in the base resume.",
      }),
      answersMarkdown: Type.String({
        description:
          "Markdown document drafting answers to likely application questions (e.g. 'Why this company?', relevant experience summary), written in the candidate's voice from the base resume only.",
      }),
    }),
    execute: async (_toolCallId, params) => {
      captured = params;
      return { content: [{ type: "text" as const, text: "Package recorded." }], details: {} };
    },
  });
  return { tool, result: () => captured };
}
