import { t } from "./content";
import { faqAnswer, faqList } from "./flows/faq";
import { forwardToOwner, startHandoff } from "./flows/handoff";
import { cartAction, chooseItem, chooseKind, handleStep, prompt, startOrder, type Ctx } from "./flows/order";
import { deliveryInfo, productsInfo, setsInfo } from "./flows/products";
import { mainMenu, welcome } from "./flows/welcome";
import { waTag } from "./notify";
import type { Deps, Incoming, Reply, Session } from "./types";

/** 打这些字，在任何一步都回到主菜单 */
const MENU_WORDS = /^(菜单|主菜单|menu|0|hi|hello|hai|你好|您好|哈啰|嗨)[!！.。]?$/i;

/**
 * 处理客人的一条讯息，返回要发出去的回复。
 * 对话进度只在真的变了时才写进 KV（免费版每天只能写 1,000 次）。
 */
export async function handleMessage(msg: Incoming, deps: Deps): Promise<Reply[]> {
  const typed = msg.kind === "text" ? (msg.text ?? "").trim() : "";

  // 转真人期间：机器人不回，讯息转给店主；客人打「菜单」可以叫回机器人
  if (await deps.store.isHandoff(msg.from)) {
    if (!MENU_WORDS.test(typed)) {
      await forwardToOwner(msg, (text) => deps.notify.send(text));
      return [];
    }
    await deps.store.clearHandoff(msg.from);
  }

  const stored = await deps.store.getSession(msg.from);
  let savedJson = stored ? JSON.stringify(stored) : null;
  const s: Session = stored ? structuredClone(stored) : { step: "menu", cart: [] };
  const ctx: Ctx = {
    s,
    msg,
    deps,
    save: async () => {
      const json = JSON.stringify(s);
      if (json === savedJson) return;
      await deps.store.putSession(msg.from, s);
      savedJson = json;
    },
  };

  const replies = await route(ctx, !stored, typed);
  await ctx.save();
  return replies;
}

async function route(ctx: Ctx, isNew: boolean, typed: string): Promise<Reply[]> {
  const { s, msg, deps } = ctx;

  // 第一次来（或 24 小时没来）：欢迎 + 菜单。按旧按钮的照常处理
  if (isNew && msg.kind !== "choice") return welcome(msg.name, deps.now);

  if (MENU_WORDS.test(typed) || msg.choiceId === "open:menu") {
    s.step = "menu";
    return [mainMenu()];
  }

  if (msg.kind === "image") {
    if (s.lastOrderId) {
      if (!deps.notify.enabled) return [{ type: "text", text: t("screenshotThanksDirect") }];
      await deps.notify.send(`📷 客人传了图片（可能是付款截图）\n订单 ${s.lastOrderId} · +${msg.from}\n${waTag(msg.from)}`);
      return [{ type: "text", text: t("screenshotThanks") }];
    }
    return [{ type: "text", text: t("onlyText") }, ...prompt(ctx)];
  }
  if (msg.kind === "other") return [{ type: "text", text: t("onlyText") }, ...prompt(ctx)];

  if (msg.kind === "choice") {
    const [prefix, value = ""] = (msg.choiceId ?? "").split(/:(.*)/s);
    switch (prefix) {
      case "menu":
        if (value === "order") return startOrder(s);
        if (value === "human") return startHandoff(ctx);
        s.step = "menu";
        if (value === "products") return productsInfo();
        if (value === "sets") return setsInfo();
        if (value === "delivery") return deliveryInfo();
        if (value === "faq") return faqList();
        return [mainMenu()];
      case "faq":
        s.step = "menu";
        return faqAnswer(value) ?? faqList();
      case "kind":
        return chooseKind(s, value);
      case "item":
        return chooseItem(s, value) ?? [{ type: "text", text: t("notUnderstood") }, ...prompt(ctx)];
      case "cart":
        return cartAction(ctx, value);
    }
    return handleStep(ctx);
  }

  // 打字
  if (s.step === "menu") return [mainMenu(t("notUnderstood"))];
  return handleStep(ctx);
}
