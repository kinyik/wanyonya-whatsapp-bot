import messages from "../content/messages.zh.json";
import faq from "../content/faq.json";
import bot from "../content/bot.json";
import settings from "../data/settings.json";
import { catalog, money } from "./catalog";

export { bot, settings };

export type MessageKey = Exclude<keyof typeof messages, "_说明">;
type Vars = Record<string, string | number>;

/** 店铺资料：所有回复文字都能用 {hours} {minOrder} 这些 */
function shopVars(): Vars {
  const items = Object.values(catalog);
  const min = (kind: "product" | "set") => Math.min(...items.filter((i) => i.kind === kind).map((i) => i.price));
  return {
    hours: settings.hours.zh,
    pickup: settings.pickup.zh,
    delivery: settings.delivery.zh,
    payment: settings.payment.zh,
    minOrder: money(settings.minOrder),
    leadSingle: settings.leadDaysSingle,
    leadSet: settings.leadDaysSet,
    minBoxPrice: money(min("product")),
    minSetPrice: money(min("set")),
    shopPhone: `+${settings.whatsappNumber}`,
    shopLink: `https://wa.me/${settings.whatsappNumber}`,
  };
}

/** 把 {名字} 换成内容；找不到的保持原样，方便发现漏填 */
export function fill(template: string, vars: Vars = {}) {
  const all = { ...shopVars(), ...vars };
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in all ? String(all[k]) : m));
}

export function t(key: MessageKey, vars?: Vars) {
  return fill(messages[key], vars);
}

export const faqItems = faq.items.filter((f) => f.enabled);
