import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import { nextOpenText } from "../src/time";
import { hmacHex, verifySignature } from "../src/verify";
import { parseWebhook } from "../src/whatsapp";

/** 假的 KV namespace，够 KvStore 用 */
function fakeKv() {
  const data = new Map<string, string>();
  return {
    data,
    async get(key: string, type?: string) {
      const v = data.get(key) ?? null;
      return v !== null && type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  } as unknown as KVNamespace & { data: Map<string, string> };
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    STATE: fakeKv(),
    WHATSAPP_TOKEN: "test-token",
    WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    META_APP_SECRET: "app-secret",
    WEBHOOK_VERIFY_TOKEN: "verify-me",
    TELEGRAM_BOT_TOKEN: "tg-token",
    TELEGRAM_CHAT_ID: "999",
    TELEGRAM_WEBHOOK_SECRET: "tg-secret",
    ...overrides,
  };
}

function execCtx() {
  const waits: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext,
    done: () => Promise.all(waits),
  };
}

const textWebhook = (id: string, text: string) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            contacts: [{ wa_id: "60123456789", profile: { name: "陈小姐" } }],
            messages: [{ id, from: "60123456789", type: "text", text: { body: text } }],
          },
        },
      ],
    },
  ],
});

afterEach(() => vi.unstubAllGlobals());

describe("webhook 验证", () => {
  it("Meta 设定 webhook：verify token 对就回 challenge，不对就 403", async () => {
    const ok = await worker.fetch(
      new Request("https://bot.test/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"),
      env(),
      execCtx().ctx,
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");

    const bad = await worker.fetch(
      new Request("https://bot.test/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42"),
      env(),
      execCtx().ctx,
    );
    expect(bad.status).toBe(403);
  });

  it("签名检查：对的过、改过内容的不过", async () => {
    const body = '{"a":1}';
    const sig = `sha256=${await hmacHex(body, "app-secret")}`;
    expect(await verifySignature(body, sig, "app-secret")).toBe(true);
    expect(await verifySignature('{"a":2}', sig, "app-secret")).toBe(false);
    expect(await verifySignature(body, null, "app-secret")).toBe(false);
  });

  it("没有正确签名的 POST 一律 401，不处理", async () => {
    const res = await worker.fetch(
      new Request("https://bot.test/webhook", { method: "POST", body: JSON.stringify(textWebhook("w1", "你好")), headers: { "x-hub-signature-256": "sha256=00" } }),
      env(),
      execCtx().ctx,
    );
    expect(res.status).toBe(401);
  });
});

describe("完整的一次讯息", () => {
  it("收到「你好」→ 已读 → 回欢迎语和菜单；同一条讯息重送不会回两次", async () => {
    const calls: { url: string; body: any }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response('{"messages":[{"id":"x"}]}');
      }),
    );
    const e = env();
    const raw = JSON.stringify(textWebhook("wamid.unique-1", "你好"));
    const sig = `sha256=${await hmacHex(raw, "app-secret")}`;
    for (let i = 0; i < 2; i++) {
      const { ctx, done } = execCtx();
      const res = await worker.fetch(
        new Request("https://bot.test/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": sig } }),
        e,
        ctx,
      );
      expect(res.status).toBe(200);
      await done();
    }
    const graph = calls.filter((c) => c.url.startsWith("https://graph.facebook.com/v23.0/1234567890/messages"));
    // 营业时间外会多一条「休息时间」文字，所以中间是 1 或 2 条 text
    const types = graph.map((c) => c.body.type ?? c.body.status);
    expect(types[0]).toBe("read");
    expect(types.slice(1, -1).every((x) => x === "text")).toBe(true);
    expect(types.length === 3 || types.length === 4).toBe(true);
    expect(graph[1].body).toMatchObject({ to: "60123456789", text: { body: expect.stringContaining("欢迎来到云惹坊") } });
    expect(graph.at(-1)!.body.interactive.type).toBe("list");
  });
});

describe("店主在 Telegram 回客人", () => {
  it("回复转来的讯息 → 发给那位客人；不是你的聊天就不理", async () => {
    const calls: { url: string; body: any }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response("{}");
      }),
    );
    const update = (chatId: number) => ({
      message: { chat: { id: chatId }, text: "可以的，50 盒没问题", reply_to_message: { text: "💬 陈小姐 +60123456789：请问可以订 50 盒吗？\n#wa60123456789" } },
    });
    const send = async (chatId: number, secret = "tg-secret") => {
      const { ctx, done } = execCtx();
      const res = await worker.fetch(
        new Request("https://bot.test/telegram", {
          method: "POST",
          body: JSON.stringify(update(chatId)),
          headers: { "x-telegram-bot-api-secret-token": secret },
        }),
        env(),
        ctx,
      );
      await done();
      return res.status;
    };

    expect(await send(999, "wrong")).toBe(403);
    expect(await send(123)).toBe(200);
    expect(calls).toHaveLength(0);

    expect(await send(999)).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ to: "60123456789", text: { body: "可以的，50 盒没问题" } });
  });
});

describe("小工具", () => {
  it("parseWebhook：文字、按钮、列表、图片都认得；状态通知不理", () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "1", from: "60", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "cart:add", title: "再加产品" } } },
                  { id: "2", from: "60", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "qty:2", title: "2 盒" } } },
                  { id: "3", from: "60", type: "image", image: { id: "m" } },
                  { id: "4", from: "60", type: "sticker", sticker: {} },
                ],
              },
            },
            { value: { statuses: [{ id: "x", status: "delivered" }] } },
          ],
        },
      ],
    };
    expect(parseWebhook(body).map((m) => [m.kind, m.choiceId ?? m.mediaType])).toEqual([
      ["choice", "cart:add"],
      ["choice", "qty:2"],
      ["image", undefined],
      ["other", "sticker"],
    ]);
  });

  it("下次营业时间：星期一 → 明天 10:00；星期二早上 8 点 → 今天 10:00；星期六晚上 → 明天 10:00", () => {
    expect(nextOpenText(new Date("2026-11-23T04:00:00Z"))).toBe("明天 10:00");
    expect(nextOpenText(new Date("2026-11-24T00:00:00Z"))).toBe("今天 10:00");
    expect(nextOpenText(new Date("2026-11-28T13:00:00Z"))).toBe("明天 10:00");
  });
});
