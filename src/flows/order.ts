import { catalog, deposit, itemsLines, itemsOf, itemsSummary, money, orderTotal, toCents, unitWord } from "../catalog";
import { bot, settings, t } from "../content";
import { waTag } from "../notify";
import { formatDateZh, klDatePlus, makeOrderId } from "../time";
import type { Deps, Incoming, Order, Reply, Session } from "../types";
import { mainMenu } from "./welcome";

/** 一次处理需要的东西；save() 让下单时先把进度写进 KV，再去存 Sheet，防止重复下单 */
export type Ctx = { s: Session; msg: Incoming; deps: Deps; save: () => Promise<void> };

const text = (s: string): Reply => ({ type: "text", text: s });

// ───────── 每一步要发给客人的东西 ─────────

function pickKind(): Reply {
  return {
    type: "buttons",
    text: t("pickKind"),
    buttons: [
      { id: "kind:product", title: t("kindProduct") },
      { id: "kind:set", title: t("kindSet") },
    ],
  };
}

function itemList(kind: "product" | "set"): Reply {
  return {
    type: "list",
    text: t("pickItem"),
    button: t("pickItemButton"),
    sections: [
      {
        title: kind === "set" ? t("kindSet") : t("kindProduct"),
        rows: itemsOf(kind).map((i) => ({ id: `item:${i.id}`, title: i.name, description: `RM${money(i.price)} · ${i.detail}` })),
      },
    ],
  };
}

function qtyList(id: string): Reply {
  const unit = unitWord(id);
  return {
    type: "list",
    text: t("pickQty", { item: catalog[id].name, unitWord: unit }),
    button: t("pickQtyButton"),
    sections: [
      {
        title: catalog[id].name,
        rows: Array.from({ length: 10 }, (_, i) => ({ id: `qty:${i + 1}`, title: t("qtyRow", { n: i + 1, unitWord: unit }) })),
      },
    ],
  };
}

function cartView(s: Session): Reply[] {
  if (!s.cart.length) {
    s.step = "pick_kind";
    return [text(t("cartEmpty")), pickKind()];
  }
  return [
    {
      type: "buttons",
      text: [t("cartTitle"), itemsLines(s.cart), t("cartTotal", { total: money(orderTotal(s.cart)) })].join("\n"),
      buttons: [
        { id: "cart:add", title: t("btnAddMore") },
        { id: "cart:checkout", title: t("btnCheckout") },
        { id: "cart:clear", title: t("btnClear") },
      ],
    },
  ];
}

/** 有套餐/礼盒就要提前 leadDaysSet 天，否则 leadDaysSingle 天（和网站一样） */
function leadDays(s: Session) {
  return s.cart.some((l) => catalog[l.id]?.kind === "set") ? settings.leadDaysSet : settings.leadDaysSingle;
}

function dateOptions(s: Session, now: Date) {
  const lead = leadDays(s);
  return Array.from({ length: bot.dateOptions }, (_, i) => klDatePlus(now, lead + i));
}

function dateList(s: Session, now: Date): Reply {
  s.dateOptions = dateOptions(s, now);
  return {
    type: "list",
    text: t("pickDate", { earliest: formatDateZh(s.dateOptions[0]) }),
    button: t("pickDateButton"),
    sections: [{ title: t("pickDateButton"), rows: s.dateOptions.map((d) => ({ id: `date:${d}`, title: formatDateZh(d) })) }],
  };
}

function methodButtons(): Reply {
  return {
    type: "buttons",
    text: t("pickMethod"),
    buttons: [
      { id: "method:pickup", title: t("btnPickup") },
      { id: "method:delivery", title: t("btnDelivery") },
    ],
  };
}

function noteButtons(): Reply {
  return { type: "buttons", text: t("askNote"), buttons: [{ id: "note:none", title: t("btnNoNote") }] };
}

function summary(s: Session, from: string): Reply {
  const delivery = s.method === "delivery";
  return {
    type: "buttons",
    text:
      t("summary", {
        items: itemsLines(s.cart),
        total: money(orderTotal(s.cart)),
        name: s.name ?? "",
        phone: `+${from}`,
        method: delivery ? t("btnDelivery") : t("btnPickup"),
        address: delivery ? `\n地址：${s.address}` : "",
        date: s.date ? formatDateZh(s.date) : "",
        note: s.note ? `\n备注：${s.note}` : "",
      }) + (delivery ? t("summaryDeliveryFee") : ""),
    buttons: [
      { id: "confirm:yes", title: t("btnConfirm") },
      { id: "confirm:redo", title: t("btnRedo") },
      { id: "confirm:cancel", title: t("btnCancel") },
    ],
  };
}

/** 客人答错或按了旧按钮时，重发这一步 */
export function prompt(ctx: Ctx): Reply[] {
  const { s, msg, deps } = ctx;
  switch (s.step) {
    case "pick_kind":
      return [pickKind()];
    case "pick_item":
      return [itemList(s.kind ?? "product")];
    case "pick_qty":
      return s.pending && catalog[s.pending] ? [qtyList(s.pending)] : [pickKind()];
    case "cart":
      return cartView(s);
    case "pick_date":
      return [dateList(s, deps.now)];
    case "pick_method":
      return [methodButtons()];
    case "ask_address":
      return [text(t("askAddress"))];
    case "ask_name":
      return [text(t("askName"))];
    case "ask_note":
      return [noteButtons()];
    case "confirm":
      return [summary(s, msg.from)];
    default:
      return [mainMenu()];
  }
}

// ───────── 客人的动作 ─────────

export function startOrder(s: Session): Reply[] {
  if (s.cart.length) {
    s.step = "cart";
    return cartView(s);
  }
  s.step = "pick_kind";
  return [pickKind()];
}

export function chooseKind(s: Session, kind: string): Reply[] {
  s.kind = kind === "set" ? "set" : "product";
  s.step = "pick_item";
  return [itemList(s.kind)];
}

export function chooseItem(s: Session, id: string): Reply[] | null {
  if (!catalog[id]) return null;
  s.pending = id;
  s.step = "pick_qty";
  return [qtyList(id)];
}

function addToCart(s: Session, qty: number): Reply[] {
  const id = s.pending!;
  const line = s.cart.find((l) => l.id === id);
  if (line) line.qty = Math.min(99, line.qty + qty);
  else s.cart.push({ id, qty });
  s.pending = undefined;
  s.step = "cart";
  return cartView(s);
}

function resetCheckout(s: Session) {
  delete s.date;
  delete s.dateOptions;
  delete s.method;
  delete s.address;
  delete s.name;
  delete s.note;
}

export function cartAction(ctx: Ctx, action: string): Reply[] {
  const { s, deps } = ctx;
  if (action === "add") {
    s.step = "pick_kind";
    return [pickKind()];
  }
  if (action === "clear") {
    s.cart = [];
    resetCheckout(s);
    s.step = "pick_kind";
    return [pickKind()];
  }
  // checkout
  if (!s.cart.length) return startOrder(s);
  const total = orderTotal(s.cart);
  if (toCents(total) < toCents(settings.minOrder)) {
    s.step = "cart";
    return [
      {
        type: "buttons",
        text: t("belowMin", { total: money(total) }),
        buttons: [
          { id: "cart:add", title: t("btnAddMore") },
          { id: "cart:clear", title: t("btnClear") },
        ],
      },
    ];
  }
  s.step = "pick_date";
  return [dateList(s, deps.now)];
}

/** 每一步收到客人的回答 */
export async function handleStep(ctx: Ctx): Promise<Reply[]> {
  const { s, msg } = ctx;
  const [prefix, value = ""] = (msg.choiceId ?? "").split(/:(.*)/s);
  const typed = msg.kind === "text" ? (msg.text ?? "").trim() : "";

  switch (s.step) {
    case "pick_qty": {
      if (prefix === "qty" || /^\d{1,2}$/.test(typed)) {
        const n = Number(prefix === "qty" ? value : typed);
        if (Number.isInteger(n) && n >= 1 && n <= 99 && s.pending && catalog[s.pending]) return addToCart(s, n);
        return [text(t("badQty")), ...prompt(ctx)];
      }
      if (typed) return [text(t("badQty")), ...prompt(ctx)];
      break;
    }
    case "pick_date":
      if (prefix === "date" && s.dateOptions?.includes(value)) {
        s.date = value;
        delete s.dateOptions;
        s.step = "pick_method";
        return [methodButtons()];
      }
      break;
    case "pick_method":
      if (prefix === "method") {
        s.method = value === "delivery" ? "delivery" : "pickup";
        if (s.method === "delivery") {
          s.step = "ask_address";
          return [text(t("askAddress"))];
        }
        delete s.address;
        s.step = "ask_name";
        return [text(t("askName"))];
      }
      break;
    case "ask_address":
      if (typed) {
        if (typed.length < 5 || typed.length > 300) return [text(t("badAddress"))];
        s.address = typed;
        s.step = "ask_name";
        return [text(t("askName"))];
      }
      break;
    case "ask_name":
      if (typed) {
        if (typed.length > 60) return [text(t("badName"))];
        s.name = typed;
        s.step = "ask_note";
        return [noteButtons()];
      }
      break;
    case "ask_note":
      if (prefix === "note" || typed) {
        if (typed.length > 500) return [text(t("badNote"))];
        s.note = prefix === "note" ? "" : typed;
        s.step = "confirm";
        return [summary(s, msg.from)];
      }
      break;
    case "confirm":
      if (prefix === "confirm") {
        if (value === "yes") return placeOrder(ctx);
        if (value === "redo") {
          resetCheckout(s);
          s.step = "cart";
          return cartView(s);
        }
        s.cart = [];
        resetCheckout(s);
        s.step = "menu";
        return [text(t("cancelled")), mainMenu()];
      }
      break;
  }
  return [text(t("notUnderstood")), ...prompt(ctx)];
}

// ───────── 下单 ─────────

async function placeOrder(ctx: Ctx): Promise<Reply[]> {
  const { s, msg, deps } = ctx;
  const total = orderTotal(s.cart);
  const order: Order = {
    orderId: makeOrderId(deps.now),
    name: s.name ?? "",
    phone: `+${msg.from}`,
    method: s.method ?? "pickup",
    address: s.method === "delivery" ? (s.address ?? "") : "",
    date: s.date ?? "",
    items: itemsSummary(s.cart),
    total,
    note: ["[WhatsApp 机器人]", s.note].filter(Boolean).join(" "),
  };
  const lines = itemsLines(s.cart);

  // 先清掉购物篮并写进 KV：就算 Meta 重复推送「确认」，也不会下第二张单
  s.cart = [];
  resetCheckout(s);
  s.step = "menu";
  s.lastOrderId = order.orderId;
  await ctx.save();

  const saved = await deps.sheet.saveOrder(order);
  if (!saved.ok) await deps.store.savePendingOrder(order);

  await deps.notify.send(
    [
      `🧾 新订单 ${order.orderId}（WhatsApp）`,
      lines,
      `合计 RM${money(total)}，订金 RM${money(deposit(total))}`,
      `姓名：${order.name}`,
      `电话：${order.phone}`,
      `方式：${order.method === "delivery" ? `送货 · ${order.address}` : "自取"}`,
      `日期：${formatDateZh(order.date)}`,
      ...(order.note ? [`备注：${order.note}`] : []),
      saved.ok ? "Sheet：✅ 已记录" : `Sheet：⚠️ 没存进去（${saved.error}），订单暂存在 KV pending-order:${order.orderId}`,
      waTag(msg.from),
    ].join("\n"),
  );

  const replies: Reply[] = [
    text(t("orderPlaced", { orderId: order.orderId, total: money(total), deposit: money(deposit(total)) })),
  ];
  if (deps.paymentQrUrl) replies.push({ type: "image", link: deps.paymentQrUrl, caption: t("paymentQrCaption", { orderId: order.orderId }) });
  return replies;
}
