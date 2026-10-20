# Current State — fare-tracker

Updated: 2026-10-20 (Asia/Shanghai)

## Project
Static Pearl River Delta / Hong Kong → SEA fare watchboard. Live: https://mattamior.github.io/fare-tracker/ · data in `data/fares.json` (+ localStorage edits).

## Shipped recently
- Deal-first default filter; sort price ascending; deal compare block above the list.
- Notes links rendered as prominent **查票 / 下单** buttons.
- Deduped duplicate fares; 「历史低」 only on real deals.
- **价格趋势** on its own row (not a wasted column).
- One-way rows can expand **推荐返程** (~+4 / +7 / +10 days) from same-route round-trips / notes; empty → 「暂无推荐返程」.
- Icons from Uber Base / Base Web (MIT) sprite under `assets/`.
- Desktop (≥761px) forced table rows; ≤760px card layout.
- Mobile cards prioritize booking; edit/delete tucked into overflow / more menu. Desktop table also shows clear book CTAs.

## Maintenance
- 2026-10-19: `data/fares.json` 去重，删除 6 条完全重复记录（47 真实 + 3 示例）；页面展示不变。
- 2026-10-20: 新增 `scripts/scan-google-flights.mjs`（headless Chrome 渲染 Google Flights，抓单程直飞票价）；写入 3 条扫票价（SZX-KUL ¥718、CAN-BKK ¥1192、HKG-CGK ¥1795），数据 53 条。每小时定时任务改用该脚本。
- 2026-10-20 15:00 整点扫票：HKG-KUL 11-03 ¥986、CAN-CGK 11-10 ¥740、SZX-BKK 11-17 ¥1259，新增 3 条（id 60–62）。同时修正脚本：只取 Departure 前的价格，跳过 Price unavailable 卡片。
- 2026-10-20 16:00 整点扫票：CAN-CGK 11-03 ¥840、SZX-BKK 11-10 ¥1259、HKG-BKK 11-17 ¥615，新增 3 条（id 63–65），数据 59 条。
