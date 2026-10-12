# Current State — fare-tracker

Updated: 2026-10-12 (Asia/Shanghai)

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
