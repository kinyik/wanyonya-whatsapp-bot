import { expect } from "vitest";
import { handleMessage } from "../src/router";
import type { Deps, Incoming, Order, Reply, Session, Store } from "../src/types";
import { LIMITS } from "../src/whatsapp";

/** 假的 KV：记在内存里，并数写了几次 */
export class MemoryStore implements Store {
  sessions = new Map<string, Session>();
  handoff = new Set<string>();
  pending: Order[] = [];
  writes = 0;
  async getSession(wa: string) {
    const s = this.sessions.get(wa);
    return s ? structuredClone(s) : null;
  }
  async putSession(wa: string, s: Session) {
    this.writes++;
    this.sessions.set(wa, structuredClone(s));
  }
  async isHandoff(wa: string) {
    return this.handoff.has(wa);
  }
  async setHandoff(wa: string) {
    this.writes++;
    this.handoff.add(wa);
  }
  async clearHandoff(wa: string) {
    this.handoff.delete(wa);
  }
  async savePendingOrder(o: Order) {
    this.pending.push(o);
  }
}

/** 2026-11-24 星期二 中午 12:00（吉隆坡） */
export const TUESDAY_NOON = new Date("2026-11-24T04:00:00Z");

/** 模拟一位客人和机器人对话 */
export function makeChat(opts: { now?: Date; sheetOk?: boolean; qr?: string; telegram?: boolean } = {}) {
  const store = new MemoryStore();
  const orders: Order[] = [];
  const notes: string[] = [];
  const deps: Deps = {
    store,
    now: opts.now ?? TUESDAY_NOON,
    paymentQrUrl: opts.qr,
    sheet: {
      saveOrder: async (o) => {
        orders.push(o);
        return opts.sheetOk === false ? { ok: false, error: "测试：Sheet 连不上" } : { ok: true };
      },
    },
    notify: {
      enabled: opts.telegram !== false,
      send: async (text) => {
        notes.push(text);
        return true;
      },
    },
  };
  let n = 0;
  const from = "60123456789";
  const send = async (m: Omit<Incoming, "id" | "from">) => {
    const replies = await handleMessage({ id: `wamid.${++n}`, from, name: "陈小姐", ...m }, deps);
    replies.forEach(checkLimits);
    return replies;
  };
  return {
    store,
    orders,
    notes,
    deps,
    from,
    say: (text: string) => send({ kind: "text", text }),
    tap: (choiceId: string) => send({ kind: "choice", choiceId }),
    image: () => send({ kind: "image" }),
    session: () => store.sessions.get(from),
  };
}

/** 每条回复都要在 WhatsApp 的长度上限内（不靠截短），不然客人看到的字会被切掉 */
export function checkLimits(r: Reply) {
  const len = (s: string) => [...s].length;
  if (r.type === "buttons") {
    expect(r.buttons.length).toBeLessThanOrEqual(LIMITS.maxButtons);
    for (const b of r.buttons) expect(len(b.title), b.title).toBeLessThanOrEqual(LIMITS.buttonTitle);
    expect(len(r.text)).toBeLessThanOrEqual(LIMITS.body);
  }
  if (r.type === "list") {
    expect(len(r.button)).toBeLessThanOrEqual(LIMITS.listButton);
    expect(len(r.text)).toBeLessThanOrEqual(LIMITS.body);
    const rows = r.sections.flatMap((s) => s.rows);
    expect(rows.length).toBeLessThanOrEqual(LIMITS.maxRows);
    for (const s of r.sections) expect(len(s.title), s.title).toBeLessThanOrEqual(LIMITS.sectionTitle);
    for (const row of rows) {
      expect(len(row.title), row.title).toBeLessThanOrEqual(LIMITS.rowTitle);
      if (row.description) expect(len(row.description), row.description).toBeLessThanOrEqual(LIMITS.rowDesc);
    }
  }
}

/** 所有回复的文字合在一起，方便用 toContain 检查 */
export const allText = (replies: Reply[]) =>
  replies.map((r) => ("text" in r ? r.text : r.type === "image" ? (r.caption ?? "") : "")).join("\n");

/** 回复里所有按钮/列表的 id */
export const choiceIds = (replies: Reply[]) =>
  replies.flatMap((r) =>
    r.type === "buttons" ? r.buttons.map((b) => b.id) : r.type === "list" ? r.sections.flatMap((s) => s.rows.map((x) => x.id)) : [],
  );
