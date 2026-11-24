/** 客人传来的一条讯息（已经从 Meta 的格式整理过） */
export type Incoming = {
  id: string; // WhatsApp 讯息 id
  from: string; // 客人号码，例如 60123456789
  name?: string; // 客人的 WhatsApp 名字
  kind: "text" | "choice" | "image" | "other";
  text?: string; // kind = text
  choiceId?: string; // kind = choice：按钮或列表的 id
  choiceTitle?: string;
  mediaType?: string; // kind = other：audio、sticker 等
};

/** 机器人要发出去的一条讯息 */
export type Reply =
  | { type: "text"; text: string }
  | { type: "buttons"; text: string; buttons: { id: string; title: string }[] }
  | {
      type: "list";
      text: string;
      button: string;
      sections: { title: string; rows: { id: string; title: string; description?: string }[] }[];
    }
  | { type: "image"; link: string; caption?: string };

export type CartLine = { id: string; qty: number };

export type Step =
  | "menu"
  | "pick_kind"
  | "pick_item"
  | "pick_qty"
  | "cart"
  | "pick_date"
  | "pick_method"
  | "ask_address"
  | "ask_name"
  | "ask_note"
  | "confirm";

/** 每位客人的对话进度，存在 KV，24 小时没动就自动清掉 */
export type Session = {
  step: Step;
  cart: CartLine[];
  kind?: "product" | "set"; // 正在看哪一类
  pending?: string; // 选了产品、还没选数量
  dateOptions?: string[]; // 发给客人的可选日期
  date?: string;
  method?: "pickup" | "delivery";
  address?: string;
  name?: string;
  note?: string;
  lastOrderId?: string; // 最近一张单，客人传付款截图时用
};

/** 写进 Google Sheet 的订单，格式和云惹坊网站一样 */
export type Order = {
  orderId: string;
  name: string;
  phone: string;
  method: "pickup" | "delivery";
  address: string;
  date: string;
  items: string;
  total: number;
  note: string;
};

export interface Store {
  getSession(wa: string): Promise<Session | null>;
  putSession(wa: string, s: Session): Promise<void>;
  isHandoff(wa: string): Promise<boolean>;
  setHandoff(wa: string, hours: number): Promise<void>;
  clearHandoff(wa: string): Promise<void>;
  savePendingOrder(order: Order): Promise<void>;
}

export interface SheetClient {
  saveOrder(order: Order): Promise<{ ok: boolean; error?: string }>;
}

export interface Notifier {
  /** 有没有设定 Telegram；没有的话「找真人」改成直接给店主号码 */
  readonly enabled: boolean;
  /** 发 Telegram 给店主；没设定就什么都不做，回传 false */
  send(text: string): Promise<boolean>;
}

/** 处理一条讯息需要用到的东西；测试时换成假的 */
export type Deps = {
  store: Store;
  sheet: SheetClient;
  notify: Notifier;
  now: Date;
  paymentQrUrl?: string;
};
