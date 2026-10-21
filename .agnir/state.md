# Current State — fare-tracker

Updated: 2026-10-21 (Asia/Shanghai)

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
- 2026-10-20 17:00 整点扫票：SZX-BKK 11-03 ¥1259、HKG-BKK 11-10 ¥615，新增 2 条（id 66–67）；ZUH-KUL 11-17 无直飞可核实数据，跳过。数据 61 条。
- 2026-10-20 18:00 整点扫票：HKG-BKK 11-03 ¥615、SZX-KUL 11-17 ¥1078，新增 2 条（id 68–69）；ZUH-KUL 11-10 仍无直飞可核实数据，跳过。数据 63 条。
- 2026-10-20 19:00 整点扫票：SZX-KUL 11-10 ¥718、CAN-BKK 11-17 ¥592，新增 2 条（id 70–71）；ZUH-KUL 11-03 仍无直飞，跳过。数据 65 条。
- 2026-10-20 20:00 整点扫票：SZX-KUL 11-03 ¥675、CAN-BKK 11-10 ¥592、HKG-CGK 11-17 ¥1800，新增 3 条（id 72–74）。数据 68 条。
- 2026-10-20 21:00 整点扫票：CAN-BKK 11-03 ¥592、HKG-CGK 11-10 ¥2073、CAN-SGN 11-17 ¥569，新增 3 条（id 75–77）。数据 71 条。
- 2026-10-20 22:00 整点扫票：HKG-CGK 11-03 ¥2073、CAN-SGN 11-10 ¥569，新增 2 条（id 78–79）；SZX-DPS 11-17 无直飞，跳过。数据 73 条。
- 2026-10-20 23:00 整点扫票：HKG-KUL 11-17 ¥984，新增 1 条（id 80）；CAN-SGN 11-03 现价 ¥569 高于已记录最低 ¥540，跳过；SZX-DPS 11-10 无直飞，跳过。数据 74 条。
- 2026-10-21 00:00 整点扫票：SZX-KUL 11-04 ¥675、CAN-BKK 11-11 ¥592、HKG-CGK 11-18 ¥1792，新增 3 条（id 81–83）。数据 77 条。
- 2026-10-21 01:00 整点扫票：CAN-BKK 11-04 ¥792、HKG-CGK 11-11 ¥1792、CAN-SGN 11-18 ¥569，新增 3 条（id 84–86）。数据 80 条。
- 2026-10-21 02:00 整点扫票：HKG-CGK 11-04 ¥1800、CAN-SGN 11-11 ¥569，新增 2 条（id 87–88）；SZX-DPS 11-18 无直飞，跳过。数据 82 条。
- 2026-10-21 03:00 整点扫票：CAN-SGN 11-04 ¥569、HKG-KUL 11-18 ¥912，新增 2 条（id 89–90）；SZX-DPS 11-11 无直飞，跳过。数据 84 条。
- 2026-10-21 04:00 整点扫票：HKG-KUL 11-11 ¥984、CAN-CGK 11-18 ¥740，新增 2 条（id 91–92）；SZX-DPS 11-04 无直飞，跳过。数据 86 条。
- 2026-10-21 05:00 整点扫票：HKG-KUL 11-04 ¥912、CAN-CGK 11-11 ¥740、SZX-BKK 11-18 ¥1079，新增 3 条（id 93–95）。数据 89 条。
- 2026-10-21 06:00 整点扫票：CAN-CGK 11-04 ¥740、SZX-BKK 11-11 ¥1079、HKG-BKK 11-18 ¥614，新增 3 条（id 96–98）。数据 92 条。
- 2026-10-21 07:00 整点扫票：SZX-BKK 11-04 ¥1259、HKG-BKK 11-11 ¥614，新增 2 条（id 99–100）；ZUH-KUL 11-18 无直飞，跳过。数据 94 条。
- 2026-10-21 08:00 整点扫票：HKG-BKK 11-04 ¥614、SZX-KUL 11-18 ¥675，新增 2 条（id 101–102）；ZUH-KUL 11-11 无直飞，跳过。数据 96 条。
- 2026-10-21 09:00 整点扫票：SZX-KUL 11-11 ¥718、CAN-BKK 11-18 ¥592，新增 2 条（id 103–104）；ZUH-KUL 11-04 无直飞，跳过。数据 98 条。
- 2026-10-21 14:00 整点扫票：HKG-KUL 11-11 ¥912（较 04:00 的 ¥984 降价），新增 1 条（id 105）；CAN-CGK 11-18 持平跳过；SZX-DPS 11-04 无直飞。数据 99 条。
- 2026-10-21 14:31 降价取代标记：旧记录保留，新增可选字段 `superseded_by` / `superseded_at`；id 91 标记为被 id 105 取代。页面新增「已取代」徽标与划线价（assets/app.js、app.css），README 与 decisions.md 同步。
- 2026-10-21 15:20 历史机票页：出行日已过的记录移入「历史机票」视图（顶栏按钮，`#history`），有效列表不再包含过期票；统计卡片随视图切换。index.html / app.js / app.css 改动，README 与 decisions.md 同步。
- 2026-10-21 16:55 图标颜色修复：日历图标的 `fill="black"` 改为 `currentColor`，修复暗色主题下图标黑色不可见（提交 a7b9be2、3c01d11）；历史按钮图标亮色固定黑、暗色跟随文字色（提交 1bb62be、5175572）。页面实际使用 `index.html` 内联 sprite，`assets/uber-icons.svg` 为源副本，二者需同步。
- 2026-10-21 17:00 整点扫票（补跑，规则已改为仅关注数据）：SZX-BKK 11-04 ¥1079 深圳航空（较 07:00 的 ¥1259 降价），新增 1 条（id 106），id 99 标记为被 106 取代；HKG-BKK 11-11、ZUH-KUL 11-18 无直飞，跳过。数据 100 条。
