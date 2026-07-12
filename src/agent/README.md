# Agent layer (Phase 2)

The agentic half of the pipeline, built on the [pi](https://pi.dev) SDK
running headless (no TUI). The deterministic watcher (`src/watcher`) finds new
postings; this layer applies judgment to them.

## Design: two stages, one tool each

Each prefiltered posting gets up to two fresh in-memory pi sessions
([runner.ts](runner.ts)). Built-in coding tools are disabled
(`noTools: "builtin"`); each stage registers exactly one custom "submit" tool
([tools.ts](tools.ts)) and must call it to deliver structured output — the
tool's closure captures the payload for the orchestrator
([evaluate.ts](evaluate.ts)).

| Stage | Tool the agent must call | Purpose |
| --- | --- | --- |
| 1. Score | `submit_match_score` | 0–100 fit vs `profile/base_resume.md`, with reasoning, strengths, gaps. Below `agent.threshold` → stop; stage 2 never runs. |
| 2. Tailor | `submit_application_package` | Tailored resume + drafted answers. Never invents facts not in the base resume. |

Output: a `packages/<date>-<company>-<role>/` folder with `job.md`,
`match.md`, `resume.md`, and `answers.md` — ready for human review and manual
submission.

Run it manually on a stored job: `npm run evaluate -- --latest` (needs
`ANTHROPIC_API_KEY` in `.env`; model override via `AZERO_MODEL`, agent
kill-switch via `AZERO_AGENT=off`).

## Deliberate non-goals

No auto-submission. The agent prepares; the human applies. This keeps the
system inside ATS terms of service and keeps a person accountable for every
application sent.
