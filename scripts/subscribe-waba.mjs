// 一次做完三件事：
// 1. 检查 token 能不能用
// 2. 让 WhatsApp 业务账户（WABA）把客人讯息推送给这个 App 的 webhook
// 3. 把这个 token 存进 Cloudflare（WHATSAPP_TOKEN），机器人回复时用
// 用法：node scripts/subscribe-waba.mjs   （会问你 token；不会写进任何文件）
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

const WABA_ID = process.env.WABA_ID || "1453746662932491"; // Meta 页面上的「消息账户编号」
const PHONE_ID = process.env.PHONE_ID || "1522229024298474";
const VERSION = process.env.GRAPH_API_VERSION || "v25.0";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const raw = await rl.question("在 Meta「生成口令」旁边按复制，然后在这里按右键贴上，按 Enter：\n");
rl.close();
// 去掉空白和看不见的字符
const token = raw.replace(/[\s﻿​]/g, "");
if (!token.startsWith("EAA")) {
  console.log("\n⚠️ 贴进来的不是 token（要 EAA 开头）。如果看到的是一排 *****，那是被遮住的，请按 Meta 页面上的复制按钮再贴。");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${token}` };
const g = async (path, method = "GET") => (await fetch(`https://graph.facebook.com/${VERSION}/${path}`, { method, headers: auth })).json();

console.log("\n1) 检查 token……");
const phone = await g(`${PHONE_ID}?fields=display_phone_number,verified_name`);
if (phone.error) {
  console.log("   ❌ token 不能用：", phone.error.message, "\n   回 Meta 页面重新按「生成口令」，再跑一次这个脚本。");
  process.exit(1);
}
console.log("   ✅ 能用，号码", phone.display_phone_number);

console.log("2) 订阅 WhatsApp 账户到 App……");
const sub = await g(`${WABA_ID}/subscribed_apps`, "POST");
console.log(sub.success ? "   ✅ 订阅好了" : `   ❌ ${JSON.stringify(sub)}`);

console.log("3) 存进 Cloudflare……");
const put = spawnSync("npx.cmd", ["wrangler", "secret", "put", "WHATSAPP_TOKEN"], { input: token, encoding: "utf8", shell: true });
console.log(/Success/.test(put.stdout + put.stderr) ? "   ✅ 存好了" : `   ❌ ${(put.stdout + put.stderr).slice(-300)}`);

console.log("\n全部做完后，用手机传「hi」给测试号码。");
