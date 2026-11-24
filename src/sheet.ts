import type { Order, SheetClient } from "./types";

/**
 * 订单 POST 到云惹坊网站同一个 Google Apps Script，格式 { secret, order } 和网站一样，
 * 所以 Apps Script 不用改。失败会再试，最多 3 次。
 */
export class AppsScriptSheet implements SheetClient {
  constructor(
    private url?: string,
    private secret?: string,
    private wait = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async saveOrder(order: Order) {
    if (!this.url || !this.secret) return { ok: false, error: "还没设定 ORDER_SHEET_URL / ORDER_SHEET_SECRET" };
    let error = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await this.wait(attempt * 1000);
      try {
        const res = await fetch(this.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret: this.secret, order }),
          redirect: "follow",
        });
        const text = await res.text();
        let result: { ok: boolean; error?: string };
        try {
          result = JSON.parse(text);
        } catch {
          result = { ok: false, error: `Google 回了网页而不是 JSON（HTTP ${res.status}），检查网址和部署权限` };
        }
        if (result.ok) return { ok: true };
        error = result.error ?? `HTTP ${res.status}`;
        if (error === "unauthorized") break; // 暗号错了，重试也没用
      } catch (err) {
        error = String(err);
      }
    }
    return { ok: false, error };
  }
}
