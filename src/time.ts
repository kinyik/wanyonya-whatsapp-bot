import { bot } from "./content";

/** 吉隆坡时间 = UTC+8，没有夏令时，所以直接加 8 小时 */
const KL_OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const pad = (n: number) => String(n).padStart(2, "0");

/** 返回一个「UTC 字段 = 吉隆坡当地时间」的 Date，只用来读年月日时 */
const kl = (now: Date) => new Date(now.getTime() + KL_OFFSET_MS);

export function ymd(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 吉隆坡今天 + n 天，格式 YYYY-MM-DD */
export function klDatePlus(now: Date, days: number) {
  const d = kl(now);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

/** 2026-11-24 → 11月24日（星期二） */
export function formatDateZh(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日（星期${WEEKDAYS[day]}）`;
}

export function isOpen(now: Date) {
  const d = kl(now);
  const h = d.getUTCHours();
  return bot.openDays.includes(d.getUTCDay()) && h >= bot.openHour && h < bot.closeHour;
}

/** 下一次开门的说法，例如「今天 10:00」「明天 10:00」「11月25日（星期三）10:00」 */
export function nextOpenText(now: Date) {
  const d = kl(now);
  for (let add = 0; add < 8; add++) {
    const day = new Date(d);
    day.setUTCDate(d.getUTCDate() + add);
    if (!bot.openDays.includes(day.getUTCDay())) continue;
    if (add === 0 && d.getUTCHours() >= bot.openHour) continue; // 今天已经开过了
    const label = add === 0 ? "今天" : add === 1 ? "明天" : formatDateZh(ymd(day));
    return `${label} ${pad(bot.openHour)}:00`;
  }
  return "营业时间";
}

/** 订单编号，例如 WN-261118-7K3Q，和网站同一个格式 */
export function makeOrderId(now: Date) {
  const d = kl(now);
  const date = `${String(d.getUTCFullYear()).slice(2)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉容易看错的 0 O 1 I
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => chars[b % chars.length]).join("");
  return `WN-${date}-${rand}`;
}
