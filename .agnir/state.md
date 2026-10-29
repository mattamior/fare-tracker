# Current State — fare-tracker

Updated: 2026-10-23 (Asia/Shanghai)

## Project
Static Pearl River Delta / Hong Kong → SEA fare watchboard. Live: https://mattamior.github.io/fare-tracker/ · data in `data/fares.json` (+ localStorage edits).

## Current UX / quality state
- Deal-first default filter; price ascending; comparison summary below the list.
- Desktop (≥761px) keeps wide fare rows; ≤760px uses mobile cards. At 390×844, the first fare begins at y=381px and the sample first card is 211px tall. Mobile cards place lookup and details side-by-side with 44px targets; edit/delete remain in the detail disclosure.
- Mobile country chips stay in one horizontally scrollable row with a right-edge fade, selected/focused chip visibility, preserved Tab order, and 44px targets.
- Mobile extra filters use a native modal dialog with a visible title and close action; the clear-draft/apply footer stays available while scrolling. Background isolation, native focus containment, Escape/cancel, focus restoration, scroll lock, and relocation across the 760px breakpoint remain covered.
- Filter edits remain drafts until applied; closing discards them. 「清除条件」 clears extra-filter draft fields while preserving examples. 「清空全部筛选」 is shown in the active-filter area only when applicable; it clears country and returns deal to all while preserving example visibility and sort.
- Delete undo is a separate 5-second action bar, independent from normal toasts; only the latest delete is undoable, restores are guarded against duplicates, and confirmed local-data reset cancels a pending undo.
- Historical-low comparisons use deduped, non-example fares with positive finite prices, valid ISO dates, explicit trip type, and valid three-letter origin/destination airport codes; round trips also require a valid return date. The badge/detail comparison requires at least two valid observations.
- Details show full-year travel dates and call minima 「历史比较」, not a price trend. One-way rows can still expand **推荐返程** (~+4 / +7 / +10 days) from matching round-trips / notes.
- Node/Chrome regression harness: `node scripts/test-regressions.mjs`; optional `--screenshots` covers 390 / 768 / 1440 in both themes plus mobile filter modal. Current suite passes, asserts no horizontal overflow at 390×844, 768×1024, 1440×900, mobile first-card y≤385px and 205–225px card height, plus long-text / missing-link / missing-price cases; fixtures do not write real fare data. Physical Safari / VoiceOver and Android Chrome verification remains outstanding.
- Icons from Uber Base / Base Web (MIT) sprite under `assets/`.

## Existing features
- Notes links remain available as fare lookup/book buttons.
- Dedupe retains distinct price snapshots by canonical observation time (`found_at` normalized to epoch across timezone offsets); missing/invalid times do not create unique observation identities.

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
- 2026-10-22 10:00 整点扫票（10:18 执行）：SZX-KUL 11-05 ¥675、CAN-BKK 11-12 ¥592、HKG-CGK 11-19 ¥1792，新增 3 条（id 107–109）；三条日期原无记录，均附 Google Flights 来源。数据 103 条。
- 2026-10-22 11:00 整点扫票：CAN-BKK 11-05 ¥992、HKG-CGK 11-12 ¥2174、CAN-SGN 11-19 ¥569，新增 3 条（id 110–112）；三条日期原无记录，均附 Google Flights 来源，无旧价需取代。数据 106 条。
- 2026-10-22 12:00 整点扫票：HKG-CGK 11-05 ¥2073、CAN-SGN 11-12 ¥569，新增 2 条（id 113–114）；SZX-DPS 11-19 无直飞，跳过。两个新增日期原无记录，无旧价需取代。数据 108 条。
- 2026-10-22 13:00 整点扫票：CAN-SGN 11-05 ¥667、HKG-KUL 11-19 ¥912，新增 2 条（id 115–116）；SZX-DPS 11-12 无直飞，跳过。两个新增日期原无记录，无旧价需取代。数据 110 条。
- 2026-10-22 14:00 整点扫票：HKG-KUL 11-12 ¥984、CAN-CGK 11-19 ¥1287，新增 2 条（id 117–118）；SZX-DPS 11-05 无直飞，跳过。两个新增日期原无记录，无旧价需取代。数据 112 条。
- 2026-10-22 15:00 整点扫票：HKG-KUL 11-05 ¥912、CAN-CGK 11-12 ¥1287、SZX-BKK 11-19 ¥1079，新增 3 条（id 119–121）；三条日期原无记录，无旧价需取代。数据 115 条。
- 2026-10-22 16:00 整点扫票：CAN-CGK 11-05 ¥1517、SZX-BKK 11-12 ¥1259、HKG-BKK 11-19 ¥666，新增 3 条（id 122–124）；三条日期原无记录，无旧价需取代。数据 118 条。
- 2026-10-22 17:00 整点扫票：SZX-BKK 11-05 ¥1259、HKG-BKK 11-12 ¥614，新增 2 条（id 125–126）；ZUH-KUL 11-19 无直飞，跳过。两个新增日期原无记录，无旧价需取代。数据 120 条。
- 2026-10-22 17:10 自动扫票策略扩展：新建 `scripts/record-scan-fare.mjs`，当同一单程航线/日期的最新实扫票价上涨或下跌时新增时间戳快照，并标记先前活动记录；价格相同不写，空扫描不判失效。页面 dedupeKey 加 `found_at` 以保留价格回到历史数值时的独立观测；README、decisions.md 与定时任务同步。
- 2026-10-23 移动 UX 密度优化：国家芯片单行横滑；更多筛选加入标题/顶部关闭与底部固定清除/应用；全量清空迁至已选条件区；查票/详情并排。真实票价数据未修改。
- 2026-10-29 10:00 整点扫票：HKG-CGK 11-26 ¥1789（较最近观测 ¥1790 降价），新增快照 id 305，id 288 标记为被取代；SZX-KUL 11-12 ¥898、CAN-BKK 11-19 ¥592 同价跳过。数据 299 条。
- 2026-10-29 11:00 整点扫票：HKG-CGK 11-19 ¥1789（较最近观测 ¥1790 降价），新增快照 id 306，id 289 标记为被取代；CAN-BKK 11-12 ¥592、CAN-SGN 11-26 ¥569 同价跳过。数据 300 条。
- 2026-10-30 00:00 整点扫票：HKG-CGK 11-27 ¥1789，新增首条观测 id 309；SZX-KUL 11-13 ¥1078、CAN-BKK 11-20 ¥692 同价跳过。数据 303 条。
- 2026-10-30 01:00 整点扫票：HKG-CGK 11-20 ¥2069（较最近观测 ¥2074 降价），新增快照 id 310，id 128 标记为被取代；CAN-SGN 11-27 ¥569 新增首条观测 id 311；CAN-BKK 11-13 ¥692 同价跳过。数据 305 条。
- 2026-10-30 02:00 整点扫票：HKG-CGK 11-13 ¥2068（较最近观测 ¥1801 上涨），新增快照 id 312，id 148 标记为被取代；CAN-SGN 11-20 ¥667 同价跳过；SZX-DPS 11-27 无直飞，跳过。数据 306 条。
- 2026-10-30 03:00 整点扫票：HKG-KUL 11-27 ¥910 新增首条观测 id 313；CAN-SGN 11-13 ¥569 同价跳过；SZX-DPS 11-20 无直飞，跳过。数据 307 条。
- 2026-10-30 04:00 整点扫票：HKG-KUL 11-20 ¥910（较最近观测 ¥912 降价），新增快照 id 314，id 150 标记为被取代；CAN-CGK 11-27 ¥780 新增首条观测 id 315；SZX-DPS 11-13 无直飞，跳过。数据 309 条。
- 2026-10-30 05:00 整点扫票：HKG-KUL 11-13 ¥982（较最近观测 ¥1057 降价），新增快照 id 316，id 134 标记为被取代；CAN-CGK 11-20 ¥780（较最近观测 ¥760 上涨），新增快照 id 317，id 135 标记为被取代；SZX-BKK 11-27 ¥1079 新增首条观测 id 318。数据 312 条。
- 2026-10-30 06:00 整点扫票：CAN-CGK 11-13 ¥780（较最近观测 ¥760 上涨），新增快照 id 319，id 137 标记为被取代；HKG-BKK 11-27 ¥630 新增首条观测 id 320；SZX-BKK 11-20 ¥1079 同价跳过。数据 314 条。
- 2026-10-30 07:00 整点扫票：SZX-BKK 11-13 ¥1259（较最近观测 ¥1079 上涨），新增快照 id 321，id 140 标记为被取代；HKG-DMK 11-20 ¥820 新增首条观测 id 322；ZUH-KUL 11-27 无直飞，跳过。数据 316 条。
