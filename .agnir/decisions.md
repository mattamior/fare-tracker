# Decisions — fare-tracker

Updated: 2026-10-23

- **2026-10-12** — Price trend is a full-width row under primary fare info, not a table column. **Superseded 2026-10-22:** detail minima are labeled 「历史比较」 unless a real time series is computed.
- **2026-10-12** — Card layout only at ≤760px; wide viewports stay tabular. **Superseded 2026-10-22:** wide viewports use wide fare rows; mobile stacks the same row structure.
- **2026-10-12** — Booking CTAs primary; edit/delete secondary (overflow on mobile). **Superseded 2026-10-22:** fare lookup CTA is outlined; edit/delete live in the detail disclosure.
- **2026-10-12** — Icon system: Uber Base Web public icons (MIT) with retained notices.
- **2026-10-12** — Agnir Core/profile `1.0` / `repository-filesystem/1.0` from iorLab/agnir `v1.0.2` (`b5626394ec40a5cb7a28c01892acde07cc0adc8e`).
- **2026-10-20** — 自动扫票数据源改为 Google Flights + 本机 headless Chrome：fetch/curl 对 Google Flights 只得到空壳，Skyscanner/Kayak/Kiwi 返回 captcha 或纯 JS 页面，均不可用。脚本只录单程直飞、必须附来源 URL；渲染失败或解析为空按“无新票”处理，不写数据。
- **2026-10-21** — 同航线同出发日出现更低价：新价作为新记录写入，旧记录保留，并用 `superseded_by` / `superseded_at` 标记为「已取代」（页面徽标 + 划线价）。不删除历史记录。
- **2026-10-22** — 自动扫票记录任一方向的价格变化：新价作为带观测时间的新记录写入，旧活动记录保留并标记为取代。未变化不新增；空扫描/失败不推断票已失效。回到历史金额时仍保留独立观测，页面去重键包含 `found_at`。
- **2026-10-21** — 过期机票单独放「历史机票」视图（`#history`），不与有效票混放。过期 = 最后出行日（单程出发日 / 往返返程日）早于 Asia/Shanghai 当天；过期判断只在页面端进行，数据文件不改动。
- **2026-10-21** — 图标颜色统一用 `currentColor`，不写死颜色；唯一例外是亮色主题下的历史按钮图标固定黑色。页面以 `index.html` 内联 sprite 为准，`assets/uber-icons.svg` 是源副本，改图标时两处必须同步。
- **2026-10-22** — Mobile extra filters are a native modal dialog, not a hand-built backdrop/focus trap: rely on `showModal()` for background inertness and focus containment; preserve draft and the open state when the 760px breakpoint changes, with focus returned to the trigger on close.
- **2026-10-22** — Filter clearing is explicit in scope: 「清空本面板」 clears only extra-filter draft fields; 「清空全部筛选」 also clears country and sets deal to all. Example visibility and sort are separate preferences and remain unchanged.
- **2026-10-22** — A delete undo affordance has its own state and 5-second action bar so ordinary status messages cannot erase it. Keep only the most recent delete undoable; verify identity before restoring to avoid duplicate records or reverting unrelated edits, and cancel the pending action when confirmed local-data reset invalidates it.
- **2026-10-22** — A route/date observation participates in historical minima only with a finite positive price, valid departure and origin/destination IATA fields, explicit one-way/round-trip type, and valid departure date (plus return date for round trips). Dedupe before count, exclude examples, and show a lowest-history claim only with at least two eligible observations; do not label a minimum-only summary as a trend.
- **2026-10-22** — Details show full-year travel dates; invalid prices stay visibly pending and never count as deals or minimum-price observations. Valid `found_at` values normalize to epoch for dedupe across timezone offsets; missing/invalid times share an unknown-time key rather than becoming unique observations. Browser regressions use synthetic fixtures and must not write `data/fares.json`.
- **2026-10-23** — Mobile country filters stay in a single horizontal row, with a subtle right-edge fade only while more chips are available; keep native Tab order and scroll the selected/focused chip into view. All chip targets remain at least 44px.
- **2026-10-23** — The extra-filter drawer has a visible title/top close and a persistent bottom clear/apply pair. Drafts are discarded on close; clearing draft conditions preserves example visibility. Full clear belongs with active-filter chips, appears only when a clearable condition is active, and preserves example visibility/sort.
- **2026-10-23** — Mobile fare cards keep route and price prominent; lookup CTA and details share one action row. Target roughly 210–225px for the regular card at 390px while preserving 44px controls; desktop wide-row structure remains unchanged.
- **2026-10-23** — Regression-run preference: do not repeatedly launch/close headless browsers. During iteration prefer static or targeted checks; run one full browser suite after changes stabilize, and generate one screenshot matrix only when visual review is needed. Rerun browser scenarios only after a relevant change or failure, not to reconfirm unchanged code.
