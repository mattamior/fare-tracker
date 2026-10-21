# Decisions — fare-tracker

Updated: 2026-10-21

- **2026-10-12** — Price trend is a full-width row under primary fare info, not a table column.
- **2026-10-12** — Card layout only at ≤760px; wide viewports stay tabular.
- **2026-10-12** — Booking CTAs primary; edit/delete secondary (overflow on mobile).
- **2026-10-12** — Icon system: Uber Base Web public icons (MIT) with retained notices.
- **2026-10-12** — Agnir Core/profile `1.0` / `repository-filesystem/1.0` from iorLab/agnir `v1.0.2` (`b5626394ec40a5cb7a28c01892acde07cc0adc8e`).
- **2026-10-20** — 自动扫票数据源改为 Google Flights + 本机 headless Chrome：fetch/curl 对 Google Flights 只得到空壳，Skyscanner/Kayak/Kiwi 返回 captcha 或纯 JS 页面，均不可用。脚本只录单程直飞、必须附来源 URL；渲染失败或解析为空按“无新票”处理，不写数据。
- **2026-10-21** — 同航线同出发日出现更低价：新价作为新记录写入，旧记录保留，并用 `superseded_by` / `superseded_at` 标记为「已取代」（页面徽标 + 划线价）。不删除历史记录。
