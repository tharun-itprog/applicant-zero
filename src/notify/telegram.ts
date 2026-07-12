import type { JobPosting } from "../adapters/types.js";

/**
 * Sends a Telegram message when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are
 * set; otherwise logs to stdout so the pipeline works with zero setup.
 */
export async function notifyNewJob(job: JobPosting, extra?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const posted = job.postedAt ? ` (posted ${job.postedAt.slice(0, 10)})` : "";
  const text = [
    `🎯 New match: ${job.title}`,
    `🏢 ${job.company} · ${job.location || "location n/a"}${posted}`,
    ...(extra ? [extra] : []),
    job.url,
  ].join("\n");

  if (!token || !chatId) {
    console.log(`[notify] ${text.replaceAll("\n", " | ")}`);
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${await res.text()}`);
}
