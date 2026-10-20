#!/usr/bin/env node
/**
 * 用本机 Chrome headless 渲染 Google Flights，抓取单程直飞票价（CNY）。
 *
 * 为什么不直接 fetch：Google Flights 对无 JS 的请求返回 unsupported 空壳；
 * Skyscanner/Kayak 等则返回 captcha / JS 外壳。headless Chrome 能正常渲染。
 *
 * 用法：
 *   node scripts/scan-google-flights.mjs --from SZX --to KUL --date 2026-11-06
 *   node scripts/scan-google-flights.mjs --from CAN --to BKK --date 2026-11-06 --json
 *
 * 输出：JSON 数组，每条为一条可核实的单程直飞票价（含 Google Flights 搜索 URL）。
 * 解析失败或页面没有结果时输出 []，退出码 0，方便定时任务判断“本轮无新票”。
 */

import { spawn } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

const CITY = {
  CAN: "Guangzhou",
  SZX: "Shenzhen",
  ZUH: "Zhuhai",
  HKG: "Hong Kong",
  BKK: "Bangkok",
  DMK: "Bangkok",
  KUL: "Kuala Lumpur",
  CGK: "Jakarta",
  DPS: "Bali",
  SGN: "Ho Chi Minh City",
  HAN: "Hanoi",
};

// 目的地机场 → 站点数据字段（中文国家/城市，与 data/settings.json 门槛键一致）
const DEST_INFO = {
  BKK: { country: "泰国", city: "曼谷" },
  DMK: { country: "泰国", city: "曼谷" },
  KUL: { country: "马来西亚", city: "吉隆坡" },
  CGK: { country: "印尼", city: "雅加达" },
  DPS: { country: "印尼", city: "登巴萨" },
  SGN: { country: "越南", city: "胡志明市" },
  HAN: { country: "越南", city: "河内" },
};

const AIRLINE = {
  AirAsia: "亚航",
  "China Southern": "南航",
  Shenzhen: "深圳航空",
  Spring: "春秋航空",
  "Spring Airlines": "春秋航空",
  "Thai Lion Air": "泰狮航",
  "Thai Lion": "泰狮航",
  "9 Air": "九元航空",
  Scoot: "酷航",
  VietJet: "越捷",
  "VietJet Air": "越捷",
  Vietjet: "越捷",
  "Vietjet Air": "越捷",
  "Malaysia Airlines": "马航",
  "Cathay Pacific": "国泰",
  "Garuda Indonesia": "印尼鹰航",
  "Thai Airways": "泰航",
  "Hong Kong Airlines": "香港航空",
  "Hong Kong Express": "香港快运",
  "HK Express": "香港快运",
  "Greater Bay Airlines": "大湾区航空",
  "Thai VietJet": "泰越捷",
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val == null || val.startsWith("--")) out[key] = true;
    else {
      out[key] = val;
      i++;
    }
  }
  return out;
}

function chromeBinary(explicit) {
  if (explicit) return explicit;
  const found = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error("未找到 Chrome/Chromium/Edge，可用 --chrome 指定路径");
  return found;
}

function buildUrl(from, to, date) {
  const fromName = CITY[from] || from;
  const toName = CITY[to] || to;
  const q = `Flights one way from ${fromName} to ${toName} on ${date}`;
  return `https://www.google.com/travel/flights?hl=en&curr=CNY&q=${encodeURIComponent(q)}`;
}

/** 运行 headless Chrome 抓 DOM；超时或 Chrome 异常退出时返回 null。 */
function render(url, chrome, { timeoutMs = 90000, budgetMs = 25000 } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gf-profile-"));
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    `--virtual-time-budget=${budgetMs}`,
    "--dump-dom",
    url,
  ];
  return new Promise((resolve) => {
    const child = spawn(chrome, args, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill("SIGKILL");
      } catch {}
      fs.rmSync(profile, { recursive: true, force: true });
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      if (out.length > 30_000_000) finish(null);
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code === 0 && out.length > 1000 ? out : null));
  });
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function isoDate(monthDay, year) {
  const m = /^(?:[A-Z][a-z]{2}, )?([A-Z][a-z]{2}) (\d{1,2})$/.exec(monthDay);
  if (!m || !(m[1] in MONTHS)) return null;
  const mm = String(MONTHS[m[1]] + 1).padStart(2, "0");
  const dd = String(Number(m[2])).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * 从可见文本里抽取直飞单程卡片。Google Flights 的 class 名会变，
 * 这里依赖稳定的可读字段顺序：时间、航司、时长、机场、Nonstop、价格。
 */
function parseCards(lines, requested) {
  const text = lines.join(" | ");
  const cards = new Map();
  const re =
    /(\d{1,2}:\d{2} [AP]M) \| \1 on ([A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}) \| – \| (\d{1,2}:\d{2} [AP]M) \| \3 on [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} \| ([^|]+?) \| (\d+) hr (\d+) min \| ([A-Z]{3}) \| [^|]* \| – \| ([A-Z]{3}) \| [^|]* \| Nonstop \|/g;
  let m;
  while ((m = re.exec(text))) {
    const departTime = m[1];
    const dateStr = isoDate(m[2], requested.year);
    if (!dateStr || dateStr !== requested.date) continue;
    const airlineRaw = m[4].trim();
    if (!airlineRaw || airlineRaw === "Multiple airlines") continue;
    const airline = AIRLINE[airlineRaw] || airlineRaw;
    // 价格必须出现在本卡片的 "Departure" 之前；"Price unavailable" 的卡片直接跳过，
    // 避免把相邻卡片或页脚的价格误记到这条航班上。
    const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 400);
    const departIdx = tail.indexOf("Departure");
    const priceScope = departIdx >= 0 ? tail.slice(0, departIdx) : tail;
    if (priceScope.includes("Price unavailable")) continue;
    const priceMatch = /CN¥([\d,]+)/.exec(priceScope);
    if (!priceMatch) continue;
    const price = Number(priceMatch[1].replace(/,/g, ""));
    if (!Number.isFinite(price) || price <= 0) continue;
    const fromCode = m[7];
    const toCode = m[8];
    if (requested.from !== fromCode) continue;
    // 曼谷两场（BKK/DMK）按城市请求时都接受，记录使用实际到达机场
    const bangkokPair =
      (requested.to === "BKK" && toCode === "DMK") || (requested.to === "DMK" && toCode === "BKK");
    if (requested.to !== toCode && !bangkokPair) continue;
    const dest = DEST_INFO[toCode] || {};
    const key = `${airline}|${departTime}|${price}`;
    if (!cards.has(key)) {
      cards.set(key, {
        origin: fromCode,
        destination_country: dest.country || "",
        destination_city: dest.city || "",
        destination_airport: toCode,
        airline,
        depart_time: departTime,
        depart_date: dateStr,
        trip_type: "单程",
        stops: "直飞",
        duration: `${m[5]} hr ${m[6]} min`,
        price_cny: price,
      });
    }
  }
  return [...cards.values()];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const from = String(args.from || "").toUpperCase();
  const to = String(args.to || "").toUpperCase();
  const date = String(args.date || "");
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("用法: node scripts/scan-google-flights.mjs --from SZX --to KUL --date 2026-11-06 [--json]");
    process.exit(2);
  }
  const year = Number(date.slice(0, 4));
  const chrome = chromeBinary(args.chrome);
  const url = buildUrl(from, to, date);

  return render(url, chrome).then((html) => {
    if (!html) {
      console.error("Chrome 渲染失败（超时或非 0 退出）");
      console.log(JSON.stringify([]));
      return;
    }
    const cards = parseCards(stripHtml(html), { from, to, date, year });
    const result = cards.map((c) => ({ ...c, source_url: url }));
    console.log(JSON.stringify(result, null, 2));
    console.error(`parsed ${result.length} direct one-way fares ${from}->${to} ${date}`);
  });
}

main();
