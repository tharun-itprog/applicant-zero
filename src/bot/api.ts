/** Thin Telegram Bot API client — long polling, no webhook needed. */

export interface TgDocument {
  file_id: string;
  file_name?: string;
  file_size?: number;
}

export interface TgMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
  document?: TgDocument;
  caption?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

export interface TelegramApi {
  getUpdates(offset: number, timeoutSec: number): Promise<TgUpdate[]>;
  sendMessage(chatId: number | string, text: string): Promise<void>;
  sendDocument(chatId: number | string, filePath: string, caption?: string): Promise<void>;
  downloadFile(fileId: string): Promise<string>;
}

export function createTelegramApi(token: string): TelegramApi {
  const base = `https://api.telegram.org/bot${token}`;

  async function call(method: string, body: unknown, timeoutMs = 30_000): Promise<unknown> {
    const res = await fetch(`${base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
    if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
    return data.result;
  }

  return {
    async getUpdates(offset, timeoutSec) {
      return (await call(
        "getUpdates",
        { offset, timeout: timeoutSec, allowed_updates: ["message"] },
        (timeoutSec + 10) * 1000,
      )) as TgUpdate[];
    },

    async sendMessage(chatId, text) {
      // Telegram caps messages at 4096 chars
      for (let i = 0; i < text.length; i += 4000) {
        await call("sendMessage", { chat_id: chatId, text: text.slice(i, i + 4000), disable_web_page_preview: true });
      }
    },

    async sendDocument(chatId, filePath, caption) {
      const { readFile } = await import("node:fs/promises");
      const { basename } = await import("node:path");
      const form = new FormData();
      form.append("chat_id", String(chatId));
      if (caption) form.append("caption", caption.slice(0, 1024));
      form.append("document", new Blob([await readFile(filePath)]), basename(filePath));
      const res = await fetch(`${base}/sendDocument`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
      const data = (await res.json()) as { ok: boolean; description?: string };
      if (!data.ok) throw new Error(`Telegram sendDocument: ${data.description}`);
    },

    async downloadFile(fileId) {
      const file = (await call("getFile", { file_id: fileId })) as { file_path?: string };
      if (!file.file_path) throw new Error("Telegram getFile returned no file_path");
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
      return res.text();
    },
  };
}
