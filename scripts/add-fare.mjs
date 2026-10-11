#!/usr/bin/env node
/**
 * 追加一条机票记录到 data/fares.json
 *
 * 用法示例：
 *   node scripts/add-fare.mjs --origin CAN,SZX --country 泰国 --city 曼谷 --airport BKK \
 *     --trip 往返 --depart 2026-11-06 --return 2026-11-09 --airline 狮航 \
 *     --stops 直飞 --price 468 --notes "周末短假" 
 *
 * 也可传入 JSON：
 *   node scripts/add-fare.mjs --json '{"origin":["CAN"],"destination_country":"越南","price_cny":580}'
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FARES_PATH = path.join(ROOT, "data", "fares.json");
const SETTINGS_PATH = path.join(ROOT, "data", "settings.json");

function usage(code = 0) {
  const text = `用法:
  node scripts/add-fare.mjs [选项]
  node scripts/add-fare.mjs --json '{...}'

选项:
  --origin      CAN,SZX 或 CAN（必填）
  --country     目的地国家（必填）
  --city        城市
  --airport     机场代码
  --trip        单程|往返（默认往返）
  --depart      出发日期 YYYY-MM-DD
  --return      返程日期
  --airline     航司
  --stops       直飞 / 经停说明
  --price       价格 CNY（必填）
  --notes       备注
  --found-at    ISO 时间（默认现在 +08:00）
  --deal        true|false|auto（默认 auto，按门槛判断）
  --json        直接传一条 JSON 对象
`;
  console.log(text);
  process.exit(code);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") usage(0);
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val == null || val.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = val;
      i++;
    }
  }
  return out;
}

function nowShanghaiIso() {
  // format as +08:00
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const sh = new Date(utc + 8 * 3600000);
  const p = (n) => String(n).padStart(2, "0");
  return `${sh.getFullYear()}-${p(sh.getMonth() + 1)}-${p(sh.getDate())}T${p(sh.getHours())}:${p(sh.getMinutes())}:${p(sh.getSeconds())}+08:00`;
}

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function dealBar(settings, country) {
  const bars = settings.deal_bars || {};
  if (bars[country] != null) return Number(bars[country]);
  const key = Object.keys(bars).find((k) => country && (country.includes(k) || k.includes(country)));
  return key != null ? Number(bars[key]) : null;
}

function normalizeOrigin(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  return String(v || "")
    .split(/[,/|+\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function buildFare(args, settings, id) {
  let raw = {};
  if (args.json) {
    raw = typeof args.json === "string" ? JSON.parse(args.json) : args.json;
  }

  const origin = normalizeOrigin(raw.origin ?? args.origin);
  const destination_country = String(raw.destination_country ?? args.country ?? "").trim();
  const price_cny = Number(raw.price_cny ?? args.price);

  if (!origin.length) {
    console.error("缺少 --origin");
    usage(1);
  }
  if (!destination_country) {
    console.error("缺少 --country");
    usage(1);
  }
  if (Number.isNaN(price_cny)) {
    console.error("缺少或无效 --price");
    usage(1);
  }

  let deal_bar_override = null;
  const dealArg = raw.deal_bar_override ?? args.deal ?? "auto";
  if (dealArg === true || dealArg === "true") deal_bar_override = true;
  else if (dealArg === false || dealArg === "false") deal_bar_override = false;

  const bar = dealBar(settings, destination_country);
  let meets_deal_bar;
  if (deal_bar_override === true) meets_deal_bar = true;
  else if (deal_bar_override === false) meets_deal_bar = false;
  else meets_deal_bar = bar != null ? price_cny <= bar : false;

  return {
    id,
    origin,
    destination_country,
    destination_city: String(raw.destination_city ?? args.city ?? "").trim(),
    destination_airport: String(raw.destination_airport ?? args.airport ?? "")
      .trim()
      .toUpperCase(),
    trip_type: (raw.trip_type ?? args.trip ?? "往返") === "单程" ? "单程" : "往返",
    depart_date: raw.depart_date ?? args.depart ?? "",
    return_date: raw.return_date ?? args.return ?? "",
    airline: String(raw.airline ?? args.airline ?? "").trim(),
    stops: String(raw.stops ?? args.stops ?? "直飞").trim(),
    price_cny,
    notes: String(raw.notes ?? args.notes ?? "").trim(),
    found_at: raw.found_at ?? args["found-at"] ?? nowShanghaiIso(),
    meets_deal_bar,
    deal_bar_override,
    is_example: false,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.json && !args.origin && !args.country && !args.price) usage(0);

  const settings = loadJson(SETTINGS_PATH, {
    deal_bars: { 泰国: 500, 马来西亚: 400, 印尼: 1000, 越南: 600 },
  });
  const data = loadJson(FARES_PATH, { version: 1, next_id: 1, fares: [] });
  if (!Array.isArray(data.fares)) data.fares = [];
  const id = Number(data.next_id) || (Math.max(0, ...data.fares.map((f) => f.id || 0)) + 1);

  const fare = buildFare(args, settings, id);
  data.fares.push(fare);
  data.next_id = id + 1;
  data.updated_at = nowShanghaiIso();
  data.version = data.version || 1;

  fs.mkdirSync(path.dirname(FARES_PATH), { recursive: true });
  fs.writeFileSync(FARES_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ok: true, path: FARES_PATH, fare }, null, 2));
}

main();
