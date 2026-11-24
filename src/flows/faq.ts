import { faqItems, fill, t } from "../content";
import type { Reply } from "../types";

export function faqList(): Reply[] {
  return [
    {
      type: "list",
      text: t("faqBody"),
      button: t("faqButton"),
      sections: [{ title: t("faqSection"), rows: faqItems.slice(0, 10).map((f) => ({ id: `faq:${f.id}`, title: f.q })) }],
    },
  ];
}

export function faqAnswer(id: string): Reply[] | null {
  const item = faqItems.find((f) => f.id === id);
  if (!item) return null;
  return [
    {
      type: "buttons",
      text: `${item.q}\n${fill(item.a)}`,
      buttons: [
        { id: "menu:faq", title: t("menu.faq") },
        { id: "menu:order", title: t("btnOrder") },
        { id: "open:menu", title: t("btnMenu") },
      ],
    },
  ];
}
