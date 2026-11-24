# 云惹坊 WhatsApp 自动回复机器人

娘惹糕品牌「云惹坊」的 WhatsApp 自动接单系统：自动回复菜单和价钱、引导客人一步步下单、订单自动进 Google Sheet，答不了的问题转给真人。
使用官方 WhatsApp Cloud API，运行成本 RM0。

> 现在用的是 Meta 的**测试号码**（免费，只能和最多 5 个登记过的号码对话），适合开发和作品集 demo。

🎬 Demo 影片：（录好后放链接）

## 解决什么问题

以前每个客人都要手动回价钱、手动抄订单。
现在客人传讯息马上收到菜单，点按钮就能自助下单，订单自动整理进和官网同一张 Google Sheet。

## 功能

- **主菜单**：看产品价钱、套餐礼盒、我要下单、取货送货、常见问题、找真人
- **一步步下单**：选类别 → 产品 → 数量（可直接打数字）→ 再加或结账 → 日期 → 自取/送货（送货填地址）→ 名字 → 备注 → 确认
- **接单规则和官网一样**：最低消费 RM19.80；单盒提前 1 天、有套餐提前 2 天订（都从 `data/settings.json` 读）
- **订单进 Google Sheet**：用官网同一个 Apps Script，格式一样，Sheet 不用改；备注栏标「[WhatsApp 机器人]」分辨来源
- **付款资料**：确认后发订单编号、50% 订金金额、DuitNow QR 图片
- **找真人**：直接给客人店主的 WhatsApp 链接；（可选）接上 Telegram 的话，改成机器人暂停 12 小时、客人讯息转到店主 Telegram，店主「回复」就能回客人，回复 `/bot` 让机器人接手
- **营业时间外**：告诉客人什么时候有人回，自助下单照常
- **不会卡住**：任何一步打「菜单」回主菜单（购物篮保留）；打错字会重问这一步；24 小时没动自动清掉进度
- **不会丢单、不会重复下单**：Sheet 存不进去会重试 3 次，再不行先存进 KV（接了 Telegram 会同时警告店主）；Meta 重复推送同一条讯息不会下两张单

## 技术

WhatsApp Cloud API · Cloudflare Workers + KV · TypeScript · Google Apps Script · Vitest（可选 Telegram Bot）

- **签名验证**：每个请求都用 App Secret 检查 `X-Hub-Signature-256`，假冒 Meta 的请求一律拒绝
- **先回 200 再处理**：收到讯息马上回 Meta，回复在背景发，避免 Meta 以为失败而重送
- **省 KV 写入**：免费版每天只能写 1,000 次，所以只在对话进度真的变了才写（看资料、问问题不写）
- **金额用「仙」计算**：和官网同一套做法，没有小数误差
- **所有文字在 JSON**：`content/messages.zh.json`、`content/faq.json` 不懂代码也能改
- **30 个模拟对话测试**：不用真的发 WhatsApp，就能测完整下单、转真人、重复推送、Sheet 失败等情况；也检查每个按钮、列表的字数都在 WhatsApp 上限内

## 文件结构

```
src/
├── index.ts          # 入口：Meta webhook 验证、接收讯息、Telegram 回复
├── router.ts         # 客人说了什么 → 走哪个流程；只在进度变了才写 KV
├── flows/
│   ├── welcome.ts    # 欢迎语、主菜单、营业时间提示
│   ├── products.ts   # 产品价钱、套餐、取货送货
│   ├── order.ts      # 一步步下单、确认、写 Sheet、通知
│   ├── faq.ts        # 常见问题
│   └── handoff.ts    # 转真人
├── whatsapp.ts       # 发文字、按钮、列表、图片；解析 webhook
├── verify.ts         # 签名验证
├── state.ts          # KV 读写
├── sheet.ts          # 订单发到 Apps Script（会重试）
├── notify.ts         # Telegram 通知
├── catalog.ts        # 产品表、金额计算
└── time.ts           # 吉隆坡时间、营业时间、订单编号
content/              # 回复文字、FAQ、营业时间（可以直接改）
data/                 # 从官网复制的 products.json、settings.json（npm run sync-data 更新）
test/                 # 模拟对话测试
```

## 设定步骤（测试号码）

需要：Node.js、一个 Facebook 账号、Cloudflare 账号（免费）、Telegram。

### 1. 本地跑测试

```
npm install
npm test
```

### 2. Meta 后台拿测试号码

1. 到 [Meta for Developers](https://developers.facebook.com/apps) → Create App → 选 Business 类型 → 加入 **WhatsApp** 产品
2. WhatsApp → **API Setup**：把你的手机号码加到「To」收件人（会收到验证码），按发送 `hello_world` 模板，手机收到就算通了
3. 记下 **Phone Number ID** 和 **Temporary access token**（24 小时过期，过期再来这里拿新的）
4. App settings → Basic → 记下 **App secret**

### 3. Cloudflare：建 KV、放 token、上线

```
npx wrangler login
npx wrangler kv namespace create STATE
```

把它给的 `id` 填进 `wrangler.toml` 的 `REPLACE_WITH_KV_ID`，然后逐个放 token（每个都会问你值）：

```
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
npx wrangler secret put META_APP_SECRET
npx wrangler secret put WEBHOOK_VERIFY_TOKEN
npx wrangler deploy
```

`WEBHOOK_VERIFY_TOKEN` 自己随便定一串字。`deploy` 完会给你一个网址，例如 `https://wanyonya-whatsapp-bot.<你的名字>.workers.dev`。

### 4. Meta 后台设 webhook

WhatsApp → **Configuration** → Webhook：

- Callback URL：`https://wanyonya-whatsapp-bot.<你的名字>.workers.dev/webhook`
- Verify token：和上面 `WEBHOOK_VERIFY_TOKEN` 一样
- 按 Verify and save，然后在 Webhook fields 订阅 **messages**

用手机传「你好」给测试号码，应该马上收到欢迎语和菜单。

### 5. 接上订单表（官网同一张）

```
npx wrangler secret put ORDER_SHEET_URL
npx wrangler secret put ORDER_SHEET_SECRET
```

值和官网 `.env.local` 里的 `ORDER_SHEET_URL`、`ORDER_SHEET_SECRET` 一样。

### 6.（可选）Telegram 通知和回复客人

不接也可以：「找真人」会直接给客人店主的 WhatsApp 号码。

1. Telegram 找 @BotFather → `/newbot` → 拿 token
2. 传一句话给你的新机器人，然后浏览器打开 `https://api.telegram.org/bot<token>/getUpdates`，找到 `"chat":{"id":…}` 那个数字
3. 放进 Cloudflare：

```
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

4. 让 Telegram 把你的回复转给机器人（`TELEGRAM_WEBHOOK_SECRET` 填上面定的那串字），浏览器打开：

```
https://api.telegram.org/bot<token>/setWebhook?url=https://wanyonya-whatsapp-bot.<你的名字>.workers.dev/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

### 7. token 过期了 / 讯息没反应

测试用的 token 24 小时过期。到 Meta「第 1 步：试用」按「生成口令」，复制，然后：

```
node scripts/subscribe-waba.mjs
```

它会检查 token、把 WhatsApp 账户订阅到 App（没订阅的话 Meta 不会把讯息推过来）、再存进 Cloudflare。

看日志：`npx wrangler tail --format pretty`。Meta 回报发送失败时会记下错误码，例如 `131031 Business Account locked` 表示 Meta 账户被锁，要在 Business Support Home 处理（开双重验证、商家验证）。

### 8.（可选）DuitNow QR

把 QR 图片放到官网 `public/` 里，再把公开网址填进 `wrangler.toml` 的 `PAYMENT_QR_URL`，重新 `npx wrangler deploy`。

## 改内容

- 改回复文字：`content/messages.zh.json`
- 改常见问题：`content/faq.json`（`enabled: false` 的不会出现，待填的答案先保持 false）
- 改营业时间：`content/bot.json`
- 官网改了价钱：`npm run sync-data`（默认官网在 `../wan-nyonya-recipe`，不是的话 `WEBSITE_DIR=路径 npm run sync-data`）

改完跑 `npm test`，再 `npx wrangler deploy`。

## 我的角色

我负责对话流程、回复文案和测试；代码用 Claude Code 开发。

## 结果

（上线后填真实数字：自动完成的订单数、省下的回复时间）
