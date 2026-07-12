# Agent layer (Phase 2)

This directory will hold the agentic half of the pipeline, built on the
[pi](https://pi.dev) SDK running headless (no TUI). The deterministic watcher
(`src/watcher`) finds new postings; this layer applies judgment to them.

## Design

One headless agent run per prefiltered posting, with three registered tools:

| Tool | Purpose |
| --- | --- |
| `score_match` | Score the posting 0–100 against `profile/base_resume.md` + preferences, with reasoning. Below threshold → stop. |
| `tailor_resume` | Rewrite the base resume for this JD — reorder bullets, mirror keywords, never invent facts. Emits Markdown → PDF/DOCX. |
| `draft_answers` | Draft answers to common application questions ("why us?", visa status, etc.) from profile context. |

Output: a `packages/<company>-<role>-<date>/` folder containing the tailored
resume, drafted answers, match reasoning, and the direct apply link — ready
for human review and one-click submission.

## Deliberate non-goals

No auto-submission. The agent prepares; the human applies. This keeps the
system inside ATS terms of service and keeps a person accountable for every
application sent.
