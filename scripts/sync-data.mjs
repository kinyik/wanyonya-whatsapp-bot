// 从云惹坊网站项目复制最新的 products.json 和 settings.json，保证两边价钱一致。
// 用法：npm run sync-data            （默认网站在 ../wan-nyonya-recipe）
//       WEBSITE_DIR=路径 npm run sync-data
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const site = process.env.WEBSITE_DIR || "../wan-nyonya-recipe";
for (const f of ["products.json", "settings.json"]) {
  const from = join(site, "data", f);
  if (!existsSync(from)) {
    console.error(`找不到 ${from}，请用 WEBSITE_DIR 指定网站项目的位置`);
    process.exit(1);
  }
  copyFileSync(from, join("data", f));
  console.log(`已更新 data/${f}`);
}
