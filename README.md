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

## Adding an ATS

Implement the `ATSAdapter` interface in one file under [src/adapters/](src/adapters/) — fetch the board's public JSON and normalize it to `JobPosting` — then register it in [src/adapters/index.ts](src/adapters/index.ts). The Greenhouse adapter is ~40 lines.

## Roadmap

- [x] Phase 1 — watchers, diffing, prefilter, Telegram alerts, scheduled runs
- [ ] Phase 2 — pi-based agent: match scoring + resume tailoring ([design](src/agent/README.md))
- [ ] Phase 3 — application packages, tracker, dashboard
- [ ] Phase 4 — Workday adapter, company-slug discovery crawler

## Privacy

Your resume and preferences live in `profile/` and are gitignored; only the `example.*` files are committed.
