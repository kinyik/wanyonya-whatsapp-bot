import { itemsOf, money } from "../catalog";
import { t } from "../content";
import type { Reply } from "../types";

const browseButtons = (text: string): Reply => ({
  type: "buttons",
  text,
  buttons: [
    { id: "menu:order", title: t("btnOrder") },
    { id: "open:menu", title: t("btnMenu") },
  ],
});

/** 单盒产品价钱表 */
export function productsInfo(): Reply[] {
  const products = itemsOf("product");
  const lines = products.map((p) => `• ${p.name}（${p.malay}）RM${money(p.price)}`);
  const unit = products[0]?.detail ?? "";
  return [browseButtons([t("productsTitle", { unit }), ...lines, "", t("browseFooter")].join("\n"))];
}

/** 套餐和礼盒 */
export function setsInfo(): Reply[] {
  const lines = itemsOf("set").map((s) => `• ${s.name} RM${money(s.price)}\n  ${s.detail}（${s.serves}）`);
  return [browseButtons([t("setsTitle"), ...lines, "", t("browseFooter")].join("\n"))];
}

export function deliveryInfo(): Reply[] {
  return [browseButtons(t("deliveryInfo"))];
}
