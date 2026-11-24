import { t } from "../content";
import { isOpen, nextOpenText } from "../time";
import type { Reply } from "../types";

/** 主菜单：一个列表，6 个选项 */
export function mainMenu(text = t("menuBody")): Reply {
  const row = (id: string, key: "products" | "sets" | "order" | "delivery" | "faq" | "human") => ({
    id: `menu:${id}`,
    title: t(`menu.${key}`),
    description: t(`menu.${key}.desc`),
  });
  return {
    type: "list",
    text,
    button: t("menuButton"),
    sections: [
      {
        title: t("menuSection"),
        rows: [
          row("products", "products"),
          row("sets", "sets"),
          row("order", "order"),
          row("delivery", "delivery"),
          row("faq", "faq"),
          row("human", "human"),
        ],
      },
    ],
  };
}

/** 营业时间外加的一句；营业时间内返回空 */
export function offHoursNote(now: Date): Reply[] {
  return isOpen(now) ? [] : [{ type: "text", text: t("offHours", { nextOpen: nextOpenText(now) }) }];
}

/** 新客人（或 24 小时没来的客人）第一句话 */
export function welcome(name: string | undefined, now: Date): Reply[] {
  return [
    { type: "text", text: t("welcome", { name: name ? ` ${name}` : "" }) },
    ...offHoursNote(now),
    mainMenu(),
  ];
}
