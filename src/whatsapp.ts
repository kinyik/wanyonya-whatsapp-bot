import type { Incoming, Reply } from "./types";

/** WhatsApp 的长度上限，超过 Meta 会整条拒收，所以发之前先截短 */
export const LIMITS = {
  body: 1024,
  buttonTitle: 20,
  listButton: 20,
  sectionTitle: 24,
  rowTitle: 24,
  rowDesc: 72,
  maxButtons: 3,
  maxRows: 10,
};
const cut = (s: string, n: number) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join("") + "…");

/** 把 Reply 变成 Cloud API 要的格式 */
export function toApiPayload(to: string, r: Reply): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  switch (r.type) {
    case "text":
      return { ...base, type: "text", text: { body: cut(r.text, 4096), preview_url: false } };
    case "image":
      return { ...base, type: "image", image: { link: r.link, ...(r.caption ? { caption: cut(r.caption, 1024) } : {}) } };
    case "buttons":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: cut(r.text, LIMITS.body) },
          action: {
            buttons: r.buttons
              .slice(0, LIMITS.maxButtons)
              .map((b) => ({ type: "reply", reply: { id: b.id, title: cut(b.title, LIMITS.buttonTitle) } })),
          },
        },
      };
    case "list":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: cut(r.text, LIMITS.body) },
          action: {
            button: cut(r.button, LIMITS.listButton),
            sections: r.sections.map((s) => ({
              title: cut(s.title, LIMITS.sectionTitle),
              rows: s.rows.map((row) => ({
                id: row.id,
                title: cut(row.title, LIMITS.rowTitle),
                ...(row.description ? { description: cut(row.description, LIMITS.rowDesc) } : {}),
              })),
            })),
          },
        },
      };
  }
}

export class WhatsAppClient {
  constructor(
    private token: string,
    private phoneNumberId: string,
    private version = "v23.0",
  ) {}

  private async post(body: unknown) {
    const res = await fetch(`https://graph.facebook.com/${this.version}/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  /** 按顺序一条一条发，保证客人看到的顺序正确 */
  async send(to: string, replies: Reply[]) {
    for (const r of replies) await this.post(toApiPayload(to, r));
  }

  /** 让客人看到蓝色已读勾；失败也没关系 */
  markRead(messageId: string) {
    return this.post({ messaging_product: "whatsapp", status: "read", message_id: messageId }).catch(() => {});
  }
}

/** 从 Meta 推来的 webhook 里取出客人讯息；送达、已读这些状态通知不理 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseWebhook(body: any): Incoming[] {
  const out: Incoming[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const names = new Map<string, string>((value?.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]));
      for (const m of value?.messages ?? []) {
        const base = { id: String(m.id), from: String(m.from), name: names.get(m.from) };
        if (m.type === "text") out.push({ ...base, kind: "text", text: String(m.text?.body ?? "") });
        else if (m.type === "interactive") {
          const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
          if (r) out.push({ ...base, kind: "choice", choiceId: String(r.id), choiceTitle: r.title });
        } else if (m.type === "button") out.push({ ...base, kind: "text", text: String(m.button?.text ?? "") });
        else if (m.type === "image") out.push({ ...base, kind: "image" });
        else out.push({ ...base, kind: "other", mediaType: String(m.type) });
      }
    }
  }
  return out;
}
