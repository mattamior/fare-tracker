# Next Actions — fare-tracker

Updated: 2026-10-23 (Asia/Shanghai)

1. Run `node scripts/test-regressions.mjs` after future behavior changes; use `--screenshots` for the 390 / 768 / 1440 light/dark matrix.
2. Still verify native dialog, trusted Escape-key input, and screen-reader behavior on actual iOS Safari / VoiceOver and Android Chrome; headless Chrome currently covers native `requestClose()`/cancel handling, focus containment/restoration, and responsive relocation.
3. Preserve the desktop wide rows, horizontal mobile country row, drawer draft/cancel semantics, 44px actions, and outlined lookup CTA unless a new UX decision supersedes them; keep the 390px first-card and 205–225px card-density assertions green.
4. Do not modify real fares without authoritative data. No commit or push was requested for the current work; if later authorized, run the Agnir checkpoint evaluation before committing and verify Pages after deployment.
5. If Base Icons changes upstream, refresh the sprite and preserve MIT notices under `assets/`.
