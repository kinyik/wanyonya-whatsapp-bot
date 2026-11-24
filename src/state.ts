import type { Order, Session, Store } from "./types";

const DAY = 24 * 60 * 60;

/**
 * 用 Cloudflare Workers KV 存对话进度。
 * KV 免费版每天只能写 1,000 次，所以路由那边只有进度真的变了才调用 putSession。
 */
export class KvStore implements Store {
  constructor(private kv: KVNamespace) {}

  async getSession(wa: string) {
    return this.kv.get<Session>(`s:${wa}`, "json");
  }
  async putSession(wa: string, s: Session) {
    await this.kv.put(`s:${wa}`, JSON.stringify(s), { expirationTtl: DAY }); // 24 小时没动就清掉
  }
  async isHandoff(wa: string) {
    return (await this.kv.get(`h:${wa}`)) !== null;
  }
  async setHandoff(wa: string, hours: number) {
    await this.kv.put(`h:${wa}`, "1", { expirationTtl: Math.max(60, hours * 60 * 60) });
  }
  async clearHandoff(wa: string) {
    await this.kv.delete(`h:${wa}`);
  }
  /** Google Sheet 存不进去时先放这里 30 天，不会丢单 */
  async savePendingOrder(order: Order) {
    await this.kv.put(`pending-order:${order.orderId}`, JSON.stringify(order), { expirationTtl: 30 * DAY });
  }
}
