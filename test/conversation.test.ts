import { describe, expect, it } from "vitest";
import { allText, choiceIds, makeChat } from "./helpers";

describe("欢迎和菜单", () => {
  it("新客人第一句话：欢迎语 + 主菜单", async () => {
    const chat = makeChat();
    const r = await chat.say("你好");
    expect(allText(r)).toContain("欢迎来到云惹坊");
    expect(allText(r)).toContain("陈小姐");
    expect(choiceIds(r)).toEqual(["menu:products", "menu:sets", "menu:order", "menu:delivery", "menu:faq", "menu:human"]);
    expect(allText(r)).not.toContain("休息时间"); // 星期二中午有营业
  });

  it("营业时间外：告诉客人什么时候有人回，但菜单照常", async () => {
    const monday = new Date("2026-11-23T04:00:00Z"); // 星期一休息
    const chat = makeChat({ now: monday });
    const r = await chat.say("hi");
    expect(allText(r)).toContain("休息时间");
    expect(allText(r)).toContain("明天 10:00");
    expect(choiceIds(r)).toContain("menu:order");
  });

  it("看产品价钱：列出产品和价钱，有下单按钮", async () => {
    const chat = makeChat();
    await chat.say("你好");
    const r = await chat.tap("menu:products");
    expect(allText(r)).toContain("传统九层糕（Kuih Lapis）RM9.90");
    expect(choiceIds(r)).toContain("menu:order");
  });

  it("套餐、取货送货、常见问题都有内容", async () => {
    const chat = makeChat();
    await chat.say("你好");
    expect(allText(await chat.tap("menu:sets"))).toContain("宴会大盘 RM168");
    expect(allText(await chat.tap("menu:delivery"))).toContain("Petaling Jaya");
    const faq = await chat.tap("menu:faq");
    expect(choiceIds(faq)).toContain("faq:lead");
    expect(choiceIds(faq)).not.toContain("faq:halal"); // 还没填答案的不出现
    expect(allText(await chat.tap("faq:min"))).toContain("RM19.80");
  });

  it("在主菜单乱打字：说看不懂，再发一次菜单", async () => {
    const chat = makeChat();
    await chat.say("你好");
    const r = await chat.say("asdfgh");
    expect(allText(r)).toContain("看不懂");
    expect(choiceIds(r)).toContain("menu:order");
  });

  it("只看文字：传贴图会提示，并重发当前这一步", async () => {
    const chat = makeChat();
    await chat.say("你好");
    await chat.tap("menu:order");
    const r = await chat.image();
    expect(allText(r)).toContain("只看得懂文字");
    expect(choiceIds(r)).toEqual(["kind:product", "kind:set"]);
  });
});

/** 走到「确认订单」这一步 */
async function reachConfirm(chat: ReturnType<typeof makeChat>, opts: { delivery?: boolean } = {}) {
  await chat.say("你好");
  await chat.tap("menu:order");
  await chat.tap("kind:product");
  await chat.tap("item:kuih-lapis");
  await chat.tap("qty:2");
  const dates = await chat.tap("cart:checkout");
  await chat.tap(choiceIds(dates)[0]);
  if (opts.delivery) {
    await chat.tap("method:delivery");
    await chat.say("12, Jalan SS2/24, Petaling Jaya");
  } else {
    await chat.tap("method:pickup");
  }
  await chat.say("陈小姐");
  return chat.tap("note:none");
}

describe("一步步下单", () => {
  it("从你好到下单完成：Sheet 有记录、店主收到通知、客人拿到订单编号", async () => {
    const chat = makeChat({ qr: "https://example.com/duitnow.png" });
    await chat.say("你好");
    expect(choiceIds(await chat.tap("menu:order"))).toEqual(["kind:product", "kind:set"]);
    expect(choiceIds(await chat.tap("kind:product"))).toContain("item:kuih-lapis");
    expect(choiceIds(await chat.tap("item:kuih-lapis"))).toContain("qty:2");

    const cart = await chat.tap("qty:2");
    expect(allText(cart)).toContain("传统九层糕 × 2 = RM19.80");
    expect(choiceIds(cart)).toEqual(["cart:add", "cart:checkout", "cart:clear"]);

    const dates = await chat.tap("cart:checkout");
    expect(choiceIds(dates)[0]).toBe("date:2026-11-25"); // 单盒提前 1 天
    expect(choiceIds(dates)).toHaveLength(10);

    expect(choiceIds(await chat.tap("date:2026-11-25"))).toEqual(["method:pickup", "method:delivery"]);
    expect(allText(await chat.tap("method:pickup"))).toContain("怎么称呼");
    expect(choiceIds(await chat.say("陈小姐"))).toEqual(["note:none"]);

    const summary = await chat.say("要一盒切好");
    expect(allText(summary)).toContain("合计：RM19.80");
    expect(allText(summary)).toContain("电话：+60123456789");
    expect(allText(summary)).toContain("11月25日（星期三）");
    expect(allText(summary)).toContain("备注：要一盒切好");

    const done = await chat.tap("confirm:yes");
    expect(allText(done)).toMatch(/订单编号：WN-261124-[A-Z0-9]{4}/);
    expect(allText(done)).toContain("订金 RM9.90");
    expect(done.at(-1)).toMatchObject({ type: "image", link: "https://example.com/duitnow.png" });

    expect(chat.orders).toHaveLength(1);
    expect(chat.orders[0]).toMatchObject({
      name: "陈小姐",
      phone: "+60123456789",
      method: "pickup",
      address: "",
      date: "2026-11-25",
      items: "传统九层糕 ×2",
      total: 19.8,
      note: "[WhatsApp 机器人] 要一盒切好",
    });
    expect(chat.notes.at(-1)).toContain("新订单");
    expect(chat.notes.at(-1)).toContain("Sheet：✅");
    expect(chat.session()).toMatchObject({ step: "menu", cart: [], lastOrderId: chat.orders[0].orderId });
  });

  it("可以直接打数字选数量，同一款加两次会合并", async () => {
    const chat = makeChat();
    await chat.say("你好");
    await chat.tap("menu:order");
    await chat.tap("kind:product");
    await chat.tap("item:kuih-talam");
    await chat.say("3");
    await chat.tap("cart:add");
    await chat.tap("kind:product");
    await chat.tap("item:kuih-talam");
    const r = await chat.say("12");
    expect(allText(r)).toContain("香兰达兰糕 × 15 = RM148.50");
  });

  it("数量打错：提示 1–99，再问一次", async () => {
    const chat = makeChat();
    await chat.say("你好");
    await chat.tap("menu:order");
    await chat.tap("kind:product");
    await chat.tap("item:kuih-lapis");
    const r = await chat.say("很多");
    expect(allText(r)).toContain("1 到 99");
    expect(choiceIds(r)).toContain("qty:1");
    expect(chat.session()?.step).toBe("pick_qty");
  });

  it("未达最低消费 RM19.80 不能结账", async () => {
    const chat = makeChat();
    await chat.say("你好");
    await chat.tap("menu:order");
    await chat.tap("kind:product");
    await chat.tap("item:kuih-lapis");
    await chat.tap("qty:1");
    const r = await chat.tap("cart:checkout");
    expect(allText(r)).toContain("最低消费是 RM19.80，现在是 RM9.90");
    expect(choiceIds(r)).toEqual(["cart:add", "cart:clear"]);
  });

  it("有套餐要提前 2 天订", async () => {
    const chat = makeChat();
    await chat.say("你好");
    await chat.tap("menu:order");
    await chat.tap("kind:set");
    await chat.tap("item:gift-box");
    await chat.tap("qty:1");
    const r = await chat.tap("cart:checkout");
    expect(choiceIds(r)[0]).toBe("date:2026-11-26");
  });

  it("不能选列表以外的日期（例如按了很旧的日期按钮）", async () => {
    const chat = makeChat();
    await chat.say("你好");
    await chat.tap("menu:order");
    await chat.tap("kind:product");
    await chat.tap("item:kuih-lapis");
    await chat.tap("qty:2");
    await chat.tap("cart:checkout");
    const r = await chat.tap("date:2026-11-24");
    expect(allText(r)).toContain("看不懂");
    expect(chat.session()?.step).toBe("pick_date");
  });

  it("送货要填地址，摘要提醒运费另付", async () => {
    const chat = makeChat();
    const summary = await reachConfirm(chat, { delivery: true });
    expect(allText(summary)).toContain("地址：12, Jalan SS2/24, Petaling Jaya");
    expect(allText(summary)).toContain("Lalamove");
    await chat.tap("confirm:yes");
    expect(chat.orders[0]).toMatchObject({ method: "delivery", address: "12, Jalan SS2/24, Petaling Jaya", note: "[WhatsApp 机器人]" });
  });

  it("中途打「菜单」回主菜单，购物篮还在；再按下单直接看到购物篮", async () => {
    const chat = makeChat();
    await chat.say("你好");
    await chat.tap("menu:order");
    await chat.tap("kind:product");
    await chat.tap("item:kuih-lapis");
    await chat.tap("qty:2");
    await chat.tap("cart:checkout");
    const menu = await chat.say("菜单");
    expect(choiceIds(menu)).toContain("menu:order");
    expect(chat.session()?.step).toBe("menu");
    const back = await chat.tap("menu:order");
    expect(allText(back)).toContain("传统九层糕 × 2");
  });

  it("确认时按「修改」回到购物篮，按「取消」清空", async () => {
    const chat = makeChat();
    await reachConfirm(chat);
    const redo = await chat.tap("confirm:redo");
    expect(choiceIds(redo)).toEqual(["cart:add", "cart:checkout", "cart:clear"]);
    expect(chat.session()?.name).toBeUndefined();

    const chat2 = makeChat();
    await reachConfirm(chat2);
    const cancel = await chat2.tap("confirm:cancel");
    expect(allText(cancel)).toContain("已取消");
    expect(chat2.session()).toMatchObject({ step: "menu", cart: [] });
    expect(chat2.orders).toHaveLength(0);
  });

  it("Meta 重复推送「确认」：不会下第二张单", async () => {
    const chat = makeChat();
    await reachConfirm(chat);
    await chat.tap("confirm:yes");
    await chat.tap("confirm:yes");
    expect(chat.orders).toHaveLength(1);
  });

  it("Google Sheet 存不进去：订单暂存起来，店主通知有警告，客人照样拿到编号", async () => {
    const chat = makeChat({ sheetOk: false });
    await reachConfirm(chat);
    const done = await chat.tap("confirm:yes");
    expect(allText(done)).toContain("订单编号");
    expect(chat.store.pending).toHaveLength(1);
    expect(chat.notes.at(-1)).toContain("⚠️ 没存进去");
  });

  it("下单后传图片（付款截图）：谢谢客人，并通知店主是哪张单", async () => {
    const chat = makeChat();
    await reachConfirm(chat);
    await chat.tap("confirm:yes");
    const r = await chat.image();
    expect(allText(r)).toContain("收到图片");
    expect(chat.notes.at(-1)).toContain(chat.orders[0].orderId);
  });
});

describe("找真人", () => {
  it("选找真人：通知店主；之后客人讯息转给店主，机器人不回；打「菜单」叫回机器人", async () => {
    const chat = makeChat();
    await chat.say("你好");
    const r = await chat.tap("menu:human");
    expect(allText(r)).toContain("已经通知店主");
    expect(chat.store.handoff.has(chat.from)).toBe(true);
    expect(chat.notes.at(-1)).toContain("#wa60123456789");

    expect(await chat.say("请问可以订 50 盒吗？")).toEqual([]);
    expect(chat.notes.at(-1)).toContain("请问可以订 50 盒吗？");

    const back = await chat.say("菜单");
    expect(choiceIds(back)).toContain("menu:order");
    expect(chat.store.handoff.has(chat.from)).toBe(false);
  });
});

describe("没有接 Telegram", () => {
  it("找真人：不暂停机器人，直接给店主的 WhatsApp 号码", async () => {
    const chat = makeChat({ telegram: false });
    await chat.say("你好");
    const r = await chat.tap("menu:human");
    expect(allText(r)).toContain("+60128609968");
    expect(allText(r)).toContain("https://wa.me/60128609968");
    expect(chat.store.handoff.has(chat.from)).toBe(false);
    expect(chat.notes).toHaveLength(0);
    // 机器人照常回应
    expect(choiceIds(await chat.say("菜单"))).toContain("menu:order");
  });

  it("下单后传付款截图：请客人也传给店主", async () => {
    const chat = makeChat({ telegram: false });
    chat.store.sessions.set(chat.from, { step: "menu", cart: [], lastOrderId: "WN-261124-ABCD" } as never);
    const r = await chat.image();
    expect(allText(r)).toContain("+60128609968");
  });
});

describe("KV 写入次数（免费版每天 1,000 次）", () => {
  it("只看资料、问问题不写 KV；只有进度变了才写", async () => {
    const chat = makeChat();
    await chat.say("你好"); // 新客人：写 1 次
    expect(chat.store.writes).toBe(1);
    await chat.tap("menu:products");
    await chat.tap("menu:faq");
    await chat.tap("faq:pay");
    await chat.say("菜单");
    expect(chat.store.writes).toBe(1);
  });

  it("一整张单大约 10 次写入", async () => {
    const chat = makeChat();
    await reachConfirm(chat);
    await chat.tap("confirm:yes");
    expect(chat.store.writes).toBeLessThanOrEqual(11);
  });
});
