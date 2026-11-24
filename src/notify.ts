import type { Notifier } from "./types";

/** 用 Telegram 机器人通知店主（免费）。没设定 token 就安静跳过。 */
export class TelegramNotifier implements Notifier {
  constructor(
    private token?: string,
    private chatId?: string,
  ) {}

  get enabled() {
    return !!this.token && !!this.chatId;
  }

  async send(text: string) {
    if (!this.token || !this.chatId) return false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: this.chatId, text: text.slice(0, 4000) }),
        });
        if (res.ok) return true;
      } catch {
        // 再试一次
      }
    }
    return false;
  }
}

/** Telegram 讯息里的客人标记；店主「回复」这条讯息时，用它找回客人号码 */
export const waTag = (wa: string) => `#wa${wa}`;
export const findWaTag = (text?: string) => text?.match(/#wa(\d{6,15})/)?.[1];
