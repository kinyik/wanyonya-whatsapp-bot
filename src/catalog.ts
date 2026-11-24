import data from "../data/products.json";
import type { CartLine } from "./types";

export type CatalogItem = {
  id: string;
  kind: "product" | "set";
  name: string;
  malay?: string;
  price: number;
  detail: string; // 单盒：「一盒 5 片」；套餐：「6 款口味各 6 片，共 36 片」
  serves?: string;
};

/** 产品 + 套餐合成一张表（和网站 lib/catalog.ts 同样的做法） */
export const catalog: Record<string, CatalogItem> = Object.fromEntries([
  ...data.products.map((p) => [p.id, { id: p.id, kind: "product", name: p.name.zh, malay: p.malay, price: p.price, detail: p.unit.zh }]),
  ...data.sets.map((s) => [s.id, { id: s.id, kind: "set", name: s.name.zh, price: s.price, detail: s.desc.zh, serves: s.serves.zh }]),
]);

export const itemsOf = (kind: "product" | "set") => Object.values(catalog).filter((i) => i.kind === kind);

/** 钱先换成「仙」（整数）再算，避免小数误差 */
export const toCents = (rm: number) => Math.round(rm * 100);

/** 整数显示 58，有小数显示 9.90 */
export function money(rm: number) {
  const cents = toCents(rm);
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export const unitWord = (id: string) => (catalog[id]?.kind === "set" ? "份" : "盒");

export function orderTotal(lines: CartLine[]) {
  return lines.reduce((n, l) => n + l.qty * toCents(catalog[l.id].price), 0) / 100;
}

/** 50% 订金，有零头就进一仙 */
export const deposit = (total: number) => Math.ceil(toCents(total) / 2) / 100;

/** 一行文字，写进 Sheet 的「订单内容」栏（和网站一样） */
export function itemsSummary(lines: CartLine[]) {
  return lines.map((l) => `${catalog[l.id].name} ×${l.qty}`).join("；");
}

/** 多行文字，给客人看 */
export function itemsLines(lines: CartLine[]) {
  return lines
    .map((l) => `• ${catalog[l.id].name} × ${l.qty} = RM${money(orderTotal([l]))}`)
    .join("\n");
}
