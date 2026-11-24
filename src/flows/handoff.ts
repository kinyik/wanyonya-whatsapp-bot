import { bot, t } from "../content";
import { waTag } from "../notify";
import type { Incoming, Reply } from "../types";
import type { Ctx } from "./order";
import { offHoursNote } from "./welcome";

const who = (msg: Incoming) => `${msg.name ? `${msg.name} ` : ""}+${msg.from}`;

/**
 * 客人选「找真人」：
 * - 有 Telegram：机器人对这位客人暂停 12 小时，讯息转给店主
 * - 没有 Telegram：不暂停（不然客人讯息没人看），直接给店主的 WhatsApp 号码
 */
export async function startHandoff(ctx: Ctx): Promise<Reply[]> {
  const { s, msg, deps } = ctx;
  s.step = "menu";
  if (!deps.notify.enabled) return [{ type: "text", text: t("handoffDirect") }];
  await deps.store.setHandoff(msg.from, bot.handoffHours);
  await deps.notify.send(
    [
      `🙋 客人要找真人：${who(msg)}`,
      `机器人对这位客人暂停 ${bot.handoffHours} 小时，客人之后的讯息会转到这里。`,
      "在 Telegram「回复」这条讯息就能回客人；回复 /bot 让机器人接手。",
      waTag(msg.from),
    ].join("\n"),
  );
  return [{ type: "text", text: t("handoffStarted") }, ...offHoursNote(deps.now)];
}

/** 转真人期间，客人的讯息原封不动转给店主，机器人不回 */
export async function forwardToOwner(msg: Incoming, send: (text: string) => Promise<boolean>) {
  const body =
    msg.kind === "text"
      ? msg.text
      : msg.kind === "choice"
        ? `[按了：${msg.choiceTitle ?? msg.choiceId}]`
        : msg.kind === "image"
          ? "[图片，请在 Meta 后台或改用手机查看]"
          : `[${msg.mediaType}]`;
  await send(`💬 ${who(msg)}：${body}\n${waTag(msg.from)}`);
}
