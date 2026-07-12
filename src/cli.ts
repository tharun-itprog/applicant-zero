import { existsSync } from "node:fs";
import type { JobPosting } from "./adapters/types.js";
import { evaluateJob } from "./agent/evaluate.js";
import { agentEnabled } from "./agent/runner.js";
import { openDb, recentMatches, type JobRow } from "./db/index.js";
import { poll } from "./watcher/poll.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const [command, ...args] = process.argv.slice(2);

function rowToPosting(r: JobRow): JobPosting {
  return {
    id: r.id,
    ats: r.ats,
    company: r.company,
    externalId: r.external_id,
    title: r.title,
    location: r.location,
    url: r.url,
    postedAt: r.posted_at ?? undefined,
    content: r.content ?? undefined,
  };
}

async function main(): Promise<void> {
  switch (command) {
    case "watch": {
      const db = openDb();
      const loopIdx = args.indexOf("--loop");
      const intervalMin = loopIdx >= 0 ? Number(args[loopIdx + 1] ?? 15) : null;
      do {
        const r = await poll(db);
        console.log(
          `[poll] ${r.companies} companies · ${r.jobsSeen} open jobs · ${r.newJobs} new · ${r.matches.length} matched` +
            (r.errors.length ? ` · ${r.errors.length} errors` : ""),
        );
        if (intervalMin) await new Promise((res) => setTimeout(res, intervalMin * 60_000));
      } while (intervalMin);
      break;
    }
    case "review": {
      const db = openDb();
      const rows = recentMatches(db);
      if (!rows.length) {
        console.log("No matches yet. Run `npm run watch` a few times after new jobs appear.");
        break;
      }
      for (const r of rows) {
        const score = r.match_score != null ? ` · 🤖 ${r.match_score}/100` : "";
        console.log(`${r.first_seen_at.slice(0, 16)}  ${r.company.padEnd(14)} ${r.title}${score}`);
        console.log(`${" ".repeat(18)}${r.location || "-"} · ${r.url}`);
      }
      break;
    }
    case "bot": {
      const { runBot } = await import("./bot/index.js");
      await runBot(openDb());
      break;
    }
    case "evaluate": {
      if (!agentEnabled()) {
        console.error("Agent disabled: set ANTHROPIC_API_KEY in .env (and don't set AZERO_AGENT=off).");
        process.exit(1);
      }
      const db = openDb();
      const target = args[0];
      let row: JobRow | undefined;
      if (!target || target === "--latest") {
        row = db
          .prepare("SELECT * FROM jobs WHERE prefilter_pass = 1 AND closed_at IS NULL ORDER BY first_seen_at DESC LIMIT 1")
          .get() as JobRow | undefined;
      } else {
        row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(target) as JobRow | undefined;
        row ??= db
          .prepare("SELECT * FROM jobs WHERE closed_at IS NULL AND title LIKE ? ORDER BY first_seen_at DESC LIMIT 1")
          .get(`%${target}%`) as JobRow | undefined;
      }
      if (!row) {
        console.error(`No job found for "${target ?? "--latest"}". Try \`npm run review\` for candidates.`);
        process.exit(1);
      }
      console.log(`Evaluating: ${row.title} @ ${row.company}\n`);
      const ev = await evaluateJob(db, rowToPosting(row));
      console.log(`Score: ${ev.score.score}/100`);
      console.log(`Reasoning: ${ev.score.reasoning}`);
      if (ev.score.strengths.length) console.log(`Strengths: ${ev.score.strengths.join("; ")}`);
      if (ev.score.gaps.length) console.log(`Gaps: ${ev.score.gaps.join("; ")}`);
      console.log(ev.packageDir ? `\n📦 Package ready for review: ${ev.packageDir}` : "\nBelow threshold — no package prepared.");
      break;
    }
    default:
      console.log("applicant-zero — usage:");
      console.log("  tsx src/cli.ts watch [--loop <minutes>]   poll all boards once (or continuously)");
      console.log("  tsx src/cli.ts review                     list recent matched jobs");
      console.log("  tsx src/cli.ts evaluate [<job_id>|<title fragment>|--latest]");
      console.log("                                            run the agent on a stored job");
      console.log("  tsx src/cli.ts bot                        interactive Telegram bot (long polling)");
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
