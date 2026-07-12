# applicant-zero

**Be the first applicant.** Watches company career pages across Greenhouse, Lever, and Ashby via their public APIs, detects new postings within minutes, filters them against your preferences, and (Phase 2) uses an LLM agent to tailor your resume and prepare a ready-to-submit application package.

Human-in-the-loop by design: it prepares, **you** apply.

```
┌─────────────┐   ┌──────────────┐   ┌───────────┐   ┌──────────────┐   ┌──────────┐
│ ATS adapters │ → │ SQLite diff  │ → │ prefilter │ → │ agent (pi)   │ → │ Telegram │
│ GH/Lever/Ashby│  │ new postings │   │ cheap, no │   │ score+tailor │   │ + package│
└─────────────┘   └──────────────┘   │ LLM       │   │ (Phase 2)    │   └──────────┘
                                     └───────────┘   └──────────────┘
```

## Why this design

- **Deterministic where possible, agentic where necessary.** Polling, diffing, and keyword filtering are plain TypeScript — cheap, fast, reliable. The LLM is reserved for judgment calls: "is this role really a fit?" and "how should the resume emphasize it?"
- **Public APIs, not scraping.** Greenhouse, Lever, and Ashby all expose unauthenticated JSON job boards. No headless browsers, no bot-detection arms race.
- **No auto-submission.** Mass auto-apply violates ATS terms and produces spam recruiters filter out. The agent's output is a reviewed-by-you package with a deep link.

## Quick start

```bash
npm install
cp profile/preferences.example.yaml profile/preferences.yaml   # edit for yourself
# edit companies.yaml with the companies you care about
npm run watch          # first run seeds the DB silently
npm run watch          # subsequent runs alert on anything new
npm run review         # list matched postings
```

Continuous local mode: `npx tsx src/cli.ts watch --loop 15`.

### Telegram alerts

Create a bot with [@BotFather](https://t.me/botfather), get your chat id from [@userinfobot](https://t.me/userinfobot), then set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (see `.env.example`). Without them, alerts print to stdout.

### Always-on via GitHub Actions

`.github/workflows/watch.yml` polls every 30 minutes. Add the two Telegram values as repo secrets. The SQLite database persists between runs through the Actions cache.

## The Telegram bot (interactive mode)

`npm run bot` turns the alert channel into the interface (long polling — no
webhook or server needed; only your own `TELEGRAM_CHAT_ID` is served):

- **Send a `.md`/`.txt` file** → it becomes your base resume for all future tailoring
- **Send plain English** — *"data analyst roles in the US, remote only, threshold 75"* → a sandboxed agent rewrites `profile/preferences.yaml` (its only tool is `update_preferences`)
- `/scan` — poll every board now, score and tailor new matches
- `/evaluate [title]` — run the agent on a job; the tailored resume comes **back to you as a file** (plus `.docx` if pandoc is installed), with drafted answers and the apply link
- `/review`, `/status`, `/applied <n>` — pipeline tracking

The flow: alert arrives → `/evaluate` → review the resume it sends back → tap the apply link → `/applied`. The human stays in the loop; the bot does everything else.

## Adding an ATS

Implement the `ATSAdapter` interface in one file under [src/adapters/](src/adapters/) — fetch the board's public JSON and normalize it to `JobPosting` — then register it in [src/adapters/index.ts](src/adapters/index.ts). The Greenhouse adapter is ~40 lines.

## The agent layer

With `ANTHROPIC_API_KEY` set (see `.env.example`), every prefiltered match is
evaluated by a headless [pi](https://pi.dev) agent in two stages: a scoring
pass (0–100 fit against your resume, with reasoning), and — above the
`agent.threshold` from your preferences — a tailoring pass that writes a
ready-to-review application package to `packages/`. Each stage is a sandboxed
pi session whose *only* registered tool is the one that submits its result:
the agent physically cannot touch files, run commands, or apply anywhere.
Details in [src/agent/README.md](src/agent/README.md).

```bash
npm run evaluate -- --latest        # run the agent on the newest matched job
npm run evaluate -- "Backend"       # ...or the newest job whose title matches
```

## Roadmap

- [x] Phase 1 — watchers, diffing, prefilter, Telegram alerts, scheduled runs
- [x] Phase 2 — pi-based agent: match scoring + resume tailoring ([design](src/agent/README.md))
- [x] Phase 3 — interactive Telegram bot: resume upload, natural-language filters, on-demand scan/evaluate, tracker, DOCX export
- [ ] Phase 4 — Workday adapter, company-slug discovery crawler, PDF resume import

## Privacy

Your resume and preferences live in `profile/` and are gitignored; only the `example.*` files are committed.
