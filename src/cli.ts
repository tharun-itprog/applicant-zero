import { openDb, recentMatches } from "./db/index.js";
import { poll } from "./watcher/poll.js";

const [command, ...args] = process.argv.slice(2);

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
        console.log(`${r.first_seen_at.slice(0, 16)}  ${r.company.padEnd(14)} ${r.title}`);
        console.log(`${" ".repeat(18)}${r.location || "-"} · ${r.url}`);
      }
      break;
    }
    default:
      console.log("applicant-zero — usage:");
      console.log("  tsx src/cli.ts watch [--loop <minutes>]   poll all boards once (or continuously)");
      console.log("  tsx src/cli.ts review                     list recent matched jobs");
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
