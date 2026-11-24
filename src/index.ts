import { t } from "./content";
import { mainMenu } from "./flows/welcome";
import { findWaTag, TelegramNotifier } from "./notify";
import { handleMessage } from "./router";
import { AppsScriptSheet } from "./sheet";
import { KvStore } from "./state";
import { safeEqual, verifySignature } from "./verify";
import { parseWebhook, WhatsAppClient } from "./whatsapp";

export interface Env {
  STATE: KVNamespace;
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  META_APP_SECRET: string;
  WEBHOOK_VERIFY_TOKEN: string;
  GRAPH_API_VERSION?: string;
  PAYMENT_QR_URL?: string;
  ORDER_SHEET_URL?: string;
  ORDER_SHEET_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

/** 同一个 Worker 实例里记住最近处理过的讯息 id，挡掉 Meta 的重复推送 */
const seen = new Set<string>();
function firstTime(id: string) {
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 500) seen.delete(seen.values().next().value!);
  return true;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Meta 设定 webhook 时的验证
    if (request.method === "GET" && url.pathname === "/webhook") {
      const ok =
        url.searchParams.get("hub.mode") === "subscribe" &&
        !!env.WEBHOOK_VERIFY_TOKEN &&
        safeEqual(url.searchParams.get("hub.verify_token") ?? "", env.WEBHOOK_VERIFY_TOKEN);
      return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("forbidden", { status: 403 });
    }

    // 2. 客人传来的讯息
    if (request.method === "POST" && url.pathname === "/webhook") {
      const raw = await request.text();
      if (!(await verifySignature(raw, request.headers.get("x-hub-signature-256"), env.META_APP_SECRET))) {
        return new Response("bad signature", { status: 401 });
      }
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return new Response("bad json", { status: 400 });
      }
      // 先回 200 给 Meta（不然它会一直重送），回复在背景发
      ctx.waitUntil(processWhatsApp(body, env));
      return new Response("ok");
    }

    // 3. 店主在 Telegram 回复客人
    if (request.method === "POST" && url.pathname === "/telegram") {
      const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
      if (!env.TELEGRAM_WEBHOOK_SECRET || !safeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET)) {
        return new Response("forbidden", { status: 403 });
      }
      const update = await request.json().catch(() => null);
      ctx.waitUntil(processTelegram(update, env));
      return new Response("ok");
    }

    if (url.pathname === "/") return new Response("wanyonya-whatsapp-bot ok");
    return new Response("not found", { status: 404 });
  },
};

/** 去掉 secret 前后的空白和看不见的 BOM（Windows PowerShell 贴进去时常会多一个） */
const clean = (s: string | undefined) => (s ?? "").replace(/^[\s﻿]+|[\s﻿]+$/g, "");

function services(env: Env) {
  return {
    wa: new WhatsAppClient(clean(env.WHATSAPP_TOKEN), clean(env.WHATSAPP_PHONE_NUMBER_ID), env.GRAPH_API_VERSION || "v23.0"),
    store: new KvStore(env.STATE),
    sheet: new AppsScriptSheet(env.ORDER_SHEET_URL, env.ORDER_SHEET_SECRET),
    notify: new TelegramNotifier(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID),
  };
}

/** Meta 回报「发不出去」时，把原因记进日志（不记讯息内容） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logFailedStatuses(body: any) {
  for (const entry of body?.entry ?? [])
    for (const change of entry?.changes ?? [])
      for (const s of change?.value?.statuses ?? []) {
        if (s?.status === "failed") console.error("WhatsApp 发送失败", JSON.stringify(s.errors ?? s));
        else console.log("WhatsApp 状态", s?.status);
      }
}

async function processWhatsApp(body: unknown, env: Env) {
  logFailedStatuses(body);
  const { wa, store, sheet, notify } = services(env);
  for (const msg of parseWebhook(body)) {
    if (!firstTime(msg.id)) continue;
    try {
      await wa.markRead(msg.id);
      const replies = await handleMessage(msg, {
        store,
        sheet,
        notify,
        now: new Date(),
        paymentQrUrl: env.PAYMENT_QR_URL || undefined,
      });
      await wa.send(msg.from, replies);
    } catch (err) {
      // 不把客人讯息内容写进日志，只记错误
      console.error("处理讯息失败", msg.id, String(err));
    }
  }
}

/**
 * 店主在 Telegram「回复」机器人转来的讯息 → 发给那位客人。
 * 回复 /bot → 结束转真人，机器人接手。
 * 只接受 TELEGRAM_CHAT_ID 这个聊天的讯息，别人加了你的 Telegram 机器人也没用。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processTelegram(update: any, env: Env) {
  const m = update?.message;
  if (!m || String(m.chat?.id) !== String(env.TELEGRAM_CHAT_ID)) return;
  const { wa, store, notify } = services(env);
  const to = findWaTag(m.reply_to_message?.text);
  const text = String(m.text ?? "").trim();
  if (!to) {
    await notify.send("要回客人的话，请对机器人转来的那条讯息按「回复」再打字。");
    return;
  }
  if (!text) return;
  try {
    if (text === "/bot") {
      await store.clearHandoff(to);
      await wa.send(to, [{ type: "text", text: t("handoffEnded") }, mainMenu()]);
      await notify.send(`✅ 机器人已接手 +${to}`);
    } else {
      await wa.send(to, [{ type: "text", text }]);
    }
  } catch (err) {
    await notify.send(`⚠️ 发不出去给 +${to}：${String(err).slice(0, 200)}\n（客人最后一条讯息超过 24 小时的话，WhatsApp 不允许自由回复）`);
  }
}
