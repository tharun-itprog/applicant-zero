import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { JobPosting } from "../adapters/types.js";
import { evaluateJob } from "../agent/evaluate.js";
import { exportDocx } from "../agent/export.js";
import { agentEnabled } from "../agent/runner.js";
import {
  getKv,
  listApplications,
  markApplied,
  recentMatches,
  setKv,
  type JobRow,
} from "../db/index.js";
import { poll } from "../watcher/poll.js";
import type { TelegramApi, TgMessage } from "./api.js";
import { createTelegramApi } from "./api.js";
import { handlePreferenceMessage } from "./intent.js";

const HELP = `applicant-zero bot 🤖

Send me things:
• a .md or .txt file — becomes your base resume
• plain English — updates your search filters ("data analyst roles in the US, remote only")

Commands:
/scan — poll all boards now, score & tailor new matches
/review — recent matched jobs
/evaluate [title fragment] — run the agent on a job (latest match if omitted)
/status — application pipeline
/applied <n> — mark item n from /status as applied
/help — this message`;

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

async function runEvaluate(api: TelegramApi, db: Database.Database, chatId: number, query?: string): Promise<void> {
  if (!agentEnabled()) {
    await api.sendMessage(chatId, "Agent is disabled — set ANTHROPIC_API_KEY in .env first.");
    return;
  }
  let row: JobRow | undefined;
  if (query) {
    row = db
      .prepare("SELECT * FROM jobs WHERE closed_at IS NULL AND title LIKE ? ORDER BY first_seen_at DESC LIMIT 1")
      .get(`%${query}%`) as JobRow | undefined;
  } else {
    row = db
      .prepare("SELECT * FROM jobs WHERE prefilter_pass = 1 AND closed_at IS NULL ORDER BY first_seen_at DESC LIMIT 1")
      .get() as JobRow | undefined;
  }
  if (!row) {
    await api.sendMessage(chatId, `No job found${query ? ` matching "${query}"` : ""}. Try /review.`);
    return;
  }
  await api.sendMessage(chatId, `Evaluating: ${row.title} @ ${row.company} …`);
  const ev = await evaluateJob(db, rowToPosting(row));
  const head = `🤖 ${ev.score.score}/100 — ${ev.score.reasoning}`;
  if (!ev.packageDir) {
    await api.sendMessage(chatId, `${head}\n\nBelow threshold — no package prepared.`);
    return;
  }
  await api.sendMessage(chatId, `${head}\n\nGaps to be ready for: ${ev.score.gaps.join("; ") || "none"}\nApply: ${row.url}`);
  await api.sendDocument(chatId, join(ev.packageDir, "resume.md"), `Tailored resume — ${row.title} @ ${row.company}`);
  const docx = exportDocx(ev.packageDir);
  if (docx) await api.sendDocument(chatId, docx, "Same resume as .docx");
  await api.sendDocument(chatId, join(ev.packageDir, "answers.md"), "Drafted application answers");
}

/** Handle one incoming message. Exported for testing with a fake api. */
export async function handleMessage(api: TelegramApi, db: Database.Database, msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;

  // Resume upload
  if (msg.document) {
    const name = msg.document.file_name ?? "";
    if (!/\.(md|markdown|txt)$/i.test(name)) {
      await api.sendMessage(chatId, "Please send the resume as .md or .txt for now — PDF/DOCX import is on the roadmap.");
      return;
    }
    if ((msg.document.file_size ?? 0) > 1_000_000) {
      await api.sendMessage(chatId, "That file is too large to be a resume (limit 1 MB).");
      return;
    }
    const content = await api.downloadFile(msg.document.file_id);
    if (existsSync("profile/base_resume.md")) {
      copyFileSync("profile/base_resume.md", "profile/base_resume.backup.md");
    }
    writeFileSync("profile/base_resume.md", content);
    await api.sendMessage(
      chatId,
      `✅ Base resume updated from ${name} (${content.length} chars). All future tailoring uses this version. Previous one saved as base_resume.backup.md.`,
    );
    return;
  }

  const text = (msg.text ?? "").trim();
  if (!text) return;

  const [cmd, ...rest] = text.split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "/start":
    case "/help":
      await api.sendMessage(chatId, HELP);
      return;

    case "/scan": {
      await api.sendMessage(chatId, "Scanning all boards…");
      const r = await poll(db);
      await api.sendMessage(
        chatId,
        `Done: ${r.companies} companies · ${r.jobsSeen} open jobs · ${r.newJobs} new · ${r.matches.length} matched` +
          (r.errors.length ? `\n⚠️ ${r.errors.length} errors (see bot logs)` : ""),
      );
      return;
    }

    case "/review": {
      const rows = recentMatches(db, 10);
      if (!rows.length) {
        await api.sendMessage(chatId, "No matches yet — try /scan, or loosen filters by messaging me what you want.");
        return;
      }
      await api.sendMessage(
        chatId,
        rows
          .map((r) => {
            const score = r.match_score != null ? ` · 🤖 ${r.match_score}/100` : "";
            return `• ${r.title} @ ${r.company}${score}\n  ${r.location || "-"}\n  ${r.url}`;
          })
          .join("\n"),
      );
      return;
    }

    case "/evaluate":
      await runEvaluate(api, db, chatId, arg || undefined);
      return;

    case "/status": {
      const apps = listApplications(db);
      if (!apps.length) {
        await api.sendMessage(chatId, "No application packages yet — /evaluate a job first.");
        return;
      }
      await api.sendMessage(
        chatId,
        apps
          .map((a, i) => `${i + 1}. [${a.status}] ${a.title} @ ${a.company}${a.applied_at ? ` (applied ${a.applied_at.slice(0, 10)})` : ""}`)
          .join("\n") + "\n\nMark one applied with /applied <n>",
      );
      return;
    }

    case "/applied": {
      const n = Number(arg);
      const apps = listApplications(db);
      const app = apps[n - 1];
      if (!app) {
        await api.sendMessage(chatId, `Give me a number from /status (1-${apps.length || 0}).`);
        return;
      }
      markApplied(db, app.job_id);
      await api.sendMessage(chatId, `🎉 Marked applied: ${app.title} @ ${app.company}. Good luck!`);
      return;
    }

    default:
      if (cmd?.startsWith("/")) {
        await api.sendMessage(chatId, `Unknown command ${cmd}. ${"\n\n"}${HELP}`);
        return;
      }
      // Plain English → preference agent
      if (!agentEnabled()) {
        await api.sendMessage(
          chatId,
          "I can update filters from plain English once ANTHROPIC_API_KEY is set in .env. Until then, edit profile/preferences.yaml by hand.",
        );
        return;
      }
      await api.sendMessage(chatId, await handlePreferenceMessage(text));
  }
}

/** Long-polling loop. Only the owner's chat (TELEGRAM_CHAT_ID) is served. */
export async function runBot(db: Database.Database): Promise<never> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !ownerChatId) {
    throw new Error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env to run the bot.");
  }
  const api = createTelegramApi(token);
  let offset = Number(getKv(db, "tg_offset") ?? 0);
  console.log("[bot] listening (long polling)…  Ctrl-C to stop");

  while (true) {
    try {
      const updates = await api.getUpdates(offset, 50);
      for (const u of updates) {
        offset = u.update_id + 1;
        setKv(db, "tg_offset", String(offset));
        const msg = u.message;
        if (!msg) continue;
        if (String(msg.chat.id) !== ownerChatId) {
          console.warn(`[bot] ignoring message from unauthorized chat ${msg.chat.id}`);
          continue;
        }
        try {
          await handleMessage(api, db, msg);
        } catch (err) {
          console.error("[bot] handler error:", err);
          await api.sendMessage(msg.chat.id, `Something went wrong: ${err}`).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[bot] poll error (retrying in 5s):", err);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}
