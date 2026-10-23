(() => {
  "use strict";

  const STORAGE_KEY = "fare-tracker:local-fares";
  const SETTINGS_KEY = "fare-tracker:settings";
  const HIDDEN_FILE_KEY = "fare-tracker:hidden-file-ids";
  const UI_KEY = "fare-tracker:ui";
  const THEME_KEY = "fare-tracker:theme";

  const DEFAULT_SETTINGS = {
    version: 1,
    deal_bars: { 泰国: 500, 马来西亚: 400, 印尼: 1000, 越南: 600 },
    deal_bars_note: { 越南: "默认 600，可在设置里改" },
    preferences: {
      origins: ["CAN", "SZX", "ZUH", "HKG"],
      origin_label: "珠三角+香港（广州/深圳/珠海/香港）",
      priority_countries: ["印尼", "马来西亚", "泰国", "越南"],
      schedule_note: "优先能拼「周末+请一两天假」的短假窗口",
      spring_festival_note: "春节前再专门安排/扫一轮更好",
      trip_types: ["单程", "往返"],
      watch_window: "半年内，越便宜越好",
    },
    origins_map: { CAN: "广州", SZX: "深圳", ZUH: "珠海", HKG: "香港" },
  };

  const CHART_COLORS = ["#0ea5e9", "#059669", "#d97706", "#8b5cf6", "#ef4444", "#14b8a6"];

  const state = {
    fileFares: [],
    fileNextId: 1,
    localFares: [],
    localNextId: 1,
    hiddenFileIds: new Set(),
    settings: structuredClone(DEFAULT_SETTINGS),
    filter: {
      country: "",
      origin: "",
      deal: "deal",
      q: "",
      maxPrice: "",
      showExamples: false,
    },
    sort: { key: "price_cny", dir: "asc" },
    view: "active",
    editingId: null,
    editingSource: null,
    prefsCollapsed: true,
    fileLoadError: false,
  };

  let pendingDeleteUndo = null;
  let deleteUndoTimer = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function clearDeleteUndo() {
    clearTimeout(deleteUndoTimer);
    deleteUndoTimer = null;
    pendingDeleteUndo = null;
    const bar = $("#undo-toast");
    if (bar) {
      bar.hidden = true;
      bar.replaceChildren();
      document.body.classList.remove("has-undo-toast");
    }
  }

  function showDeleteUndo() {
    const bar = $("#undo-toast");
    if (!bar || !pendingDeleteUndo) return;
    bar.replaceChildren(document.createTextNode("已删除 · 5 秒内可撤销最近一条 "));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-action";
    button.textContent = "撤销";
    button.addEventListener("click", undoDelete);
    bar.append(button);
    bar.hidden = false;
    document.body.classList.add("has-undo-toast");
    clearTimeout(deleteUndoTimer);
    deleteUndoTimer = setTimeout(clearDeleteUndo, 5000);
  }

  function undoDelete() {
    const pending = pendingDeleteUndo;
    if (!pending) return;
    clearDeleteUndo();
    if (pending.source === "local") {
      if (state.localFares.some((fare) => fare.id === pending.fare.id)) {
        toast("该记录已存在，未重复恢复");
        return;
      }
      state.localFares.splice(Math.min(pending.index, state.localFares.length), 0, pending.fare);
    } else {
      if (!state.fileFares.some((fare) => fare.id === pending.id)) {
        toast("原记录已不可用，无法撤销");
        return;
      }
      state.hiddenFileIds.delete(pending.id);
    }
    saveLocal();
    renderTable();
    toast("已恢复删除的记录");
  }

  function normalizeOrigin(origin) {
    if (Array.isArray(origin)) return origin.filter(Boolean).map((s) => String(s).toUpperCase());
    if (typeof origin === "string" && origin.trim()) {
      return origin.split(/[,/|+\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    }
    return [];
  }

  function originLabel(origin) {
    return normalizeOrigin(origin).join("/");
  }

  function dealBarFor(country) {
    const bars = state.settings.deal_bars || {};
    if (bars[country] != null) return Number(bars[country]);
    const key = Object.keys(bars).find((k) => country && (country.includes(k) || k.includes(country)));
    return key != null ? Number(bars[key]) : null;
  }

  function hasValidPrice(fare) {
    const price = Number(fare.price_cny);
    return fare.price_cny !== null && fare.price_cny !== "" && Number.isFinite(price) && price > 0;
  }

  function computeMeetsDeal(fare) {
    if (!hasValidPrice(fare)) return false;
    if (fare.deal_bar_override === true) return true;
    if (fare.deal_bar_override === false) return false;
    const bar = dealBarFor(fare.destination_country);
    if (bar == null || !Number.isFinite(bar)) return false;
    return Number(fare.price_cny) <= bar;
  }

  // 可比范围：同出发地组合、同目的地、同行程类型（单程 / 往返分开）
  function routeKey(fare) {
    const airport = (fare.destination_airport || "").toUpperCase();
    const city = fare.destination_city || "";
    const origins = normalizeOrigin(fare.origin).slice().sort().join("/");
    return `${origins}|${fare.destination_country}|${airport || city}|${fare.trip_type || ""}`;
  }

  function countryKey(fare) {
    return fare.destination_country || "未知";
  }

  function normalizeFare(raw, source) {
    const origin = normalizeOrigin(raw.origin);
    const fare = {
      id: Number(raw.id) || 0,
      origin,
      destination_country: String(raw.destination_country || "").trim(),
      destination_city: String(raw.destination_city || "").trim(),
      destination_airport: String(raw.destination_airport || "").trim().toUpperCase(),
      trip_type: raw.trip_type === "单程" || raw.trip_type === "往返" ? raw.trip_type : "",
      depart_date: raw.depart_date || "",
      return_date: raw.return_date || "",
      airline: String(raw.airline || "").trim(),
      stops: String(raw.stops ?? "").trim(),
      price_cny:
        raw.price_cny == null || raw.price_cny === "" || !Number.isFinite(Number(raw.price_cny))
          ? null
          : Number(raw.price_cny),
      notes: String(raw.notes || ""),
      found_at: raw.found_at || "",
      deal_bar_override:
        raw.deal_bar_override === true || raw.deal_bar_override === false
          ? raw.deal_bar_override
          : null,
      is_example: Boolean(raw.is_example),
      superseded_by: Number(raw.superseded_by) > 0 ? Number(raw.superseded_by) : null,
      superseded_at: raw.superseded_at || null,
      source,
    };
    fare.meets_deal_bar = computeMeetsDeal(fare);
    return fare;
  }

  function allFares() {
    const file = state.fileFares
      .filter((f) => !state.hiddenFileIds.has(f.id))
      .map((f) => normalizeFare(f, "file"));
    const local = state.localFares.map((f) => normalizeFare(f, "local"));
    return [...file, ...local];
  }

  function isValidDate(value) {
    if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function isComparableFare(fare) {
    if (!hasValidPrice(fare) || !fare.destination_country.trim()) return false;
    if (!fare.origin.length || !fare.origin.every((code) => /^[A-Z]{3}$/.test(code))) return false;
    if (!/^[A-Z]{3}$/.test(fare.destination_airport)) return false;
    if (fare.trip_type !== "单程" && fare.trip_type !== "往返") return false;
    if (!isValidDate(fare.depart_date)) return false;
    if (fare.trip_type === "往返") {
      if (!isValidDate(fare.return_date) || fare.return_date < fare.depart_date) return false;
    }
    return true;
  }

  /** Build historical min maps from valid, deduped, non-example observations only. */
  function buildHistoryMaps() {
    const pool = dedupeFares(allFares().filter((fare) => !fare.is_example && isComparableFare(fare)));
    const byRoute = new Map();
    const byCountry = new Map();
    const routeCount = new Map();
    for (const f of pool) {
      const rk = routeKey(f);
      const ck = countryKey(f);
      const p = Number(f.price_cny);
      routeCount.set(rk, (routeCount.get(rk) || 0) + 1);
      if (!byRoute.has(rk) || p < byRoute.get(rk).price) byRoute.set(rk, { price: p, fare: f });
      if (!byCountry.has(ck) || p < byCountry.get(ck).price) byCountry.set(ck, { price: p, fare: f });
    }
    return { byRoute, byCountry, routeCount };
  }

  function compareInfo(fare, hist) {
    const bar = dealBarFor(fare.destination_country);
    const price = Number(fare.price_cny);
    const validPrice = hasValidPrice(fare);
    const comparable = isComparableFare(fare);
    const vsBar =
      bar == null || !Number.isFinite(bar) || !validPrice
        ? null
        : {
            bar,
            diff: bar - price,
            under: price <= bar,
            pct: bar > 0 ? Math.min(100, Math.round((price / bar) * 100)) : 0,
          };
    const routeMin = comparable ? hist.byRoute.get(routeKey(fare)) : null;
    const countryMin = comparable ? hist.byCountry.get(countryKey(fare)) : null;
    const isRouteBest = routeMin && routeMin.price === price && routeMin.fare.id === fare.id && routeMin.fare.source === fare.source;
    const isCountryBest = countryMin && countryMin.price === price && countryMin.fare.id === fare.id && countryMin.fare.source === fare.source;
    // Also treat as best if same price (tied)
    const isRouteBestLoose = routeMin && price <= routeMin.price;
    const isCountryBestLoose = countryMin && price <= countryMin.price;
    // 历史低：可比记录至少 2 条，且本条为可比范围内最低价，并达到好价线
    const routeCount = hist.routeCount.get(routeKey(fare)) || 0;
    return {
      vsBar,
      routeCount,
      histLow: Boolean(!fare.is_example && vsBar?.under && routeCount >= 2 && (isRouteBest || isRouteBestLoose)),
      routeMin: routeMin ? routeMin.price : null,
      countryMin: countryMin ? countryMin.price : null,
      isRouteBest: isRouteBest || isRouteBestLoose,
      isCountryBest: isCountryBest || isCountryBestLoose,
    };
  }

  function saveLocal() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ next_id: state.localNextId, fares: state.localFares })
    );
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    localStorage.setItem(HIDDEN_FILE_KEY, JSON.stringify([...state.hiddenFileIds]));
    localStorage.setItem(
      UI_KEY,
      JSON.stringify({
        uxVersion: 2,
        showExamples: state.filter.showExamples,
        prefsCollapsed: state.prefsCollapsed,
        sort: state.sort,
        deal: state.filter.deal,
      })
    );
  }

  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (raw && Array.isArray(raw.fares)) {
        state.localFares = raw.fares;
        state.localNextId = Number(raw.next_id) || Math.max(0, ...raw.fares.map((f) => f.id)) + 1;
      }
    } catch (_) {}
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (s && s.deal_bars) {
        state.settings = {
          ...structuredClone(DEFAULT_SETTINGS),
          ...s,
          deal_bars: { ...DEFAULT_SETTINGS.deal_bars, ...s.deal_bars },
        };
      }
    } catch (_) {}
    try {
      const h = JSON.parse(localStorage.getItem(HIDDEN_FILE_KEY) || "[]");
      if (Array.isArray(h)) state.hiddenFileIds = new Set(h.map(Number));
    } catch (_) {}
    try {
      const ui = JSON.parse(localStorage.getItem(UI_KEY) || "null");
      if (ui) {
        if (typeof ui.showExamples === "boolean") state.filter.showExamples = ui.showExamples;
        // uxVersion < 2: force recommended defaults (deal + price asc + prefs collapsed)
        if (Number(ui.uxVersion || 0) >= 2) {
          if (typeof ui.prefsCollapsed === "boolean") state.prefsCollapsed = ui.prefsCollapsed;
          if (ui.sort?.key) state.sort = ui.sort;
          if (ui.deal === "all" || ui.deal === "deal" || ui.deal === "normal") {
            state.filter.deal = ui.deal;
          }
        } else {
          state.prefsCollapsed = true;
          state.sort = { key: "price_cny", dir: "asc" };
          state.filter.deal = "deal";
        }
      }
    } catch (_) {}
  }

  // 只重新请求数据，保留筛选、视图与本地编辑
  async function retryLoad(btn) {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "加载中…";
    }
    try {
      await loadFileData();
      renderTable();
      toast(state.fileLoadError ? "仍无法读取远端数据" : "已重新读取数据");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "重新加载";
      }
    }
  }

  async function loadFileData() {
    state.fileLoadError = false;
    try {
      const [faresRes, settingsRes] = await Promise.all([
        fetch("./data/fares.json", { cache: "no-store" }),
        fetch("./data/settings.json", { cache: "no-store" }),
      ]);
      if (!faresRes.ok) throw new Error(`fares.json HTTP ${faresRes.status}`);
      if (faresRes.ok) {
        const data = await faresRes.json();
        state.fileFares = Array.isArray(data.fares) ? data.fares : [];
        state.fileNextId =
          Number(data.next_id) || Math.max(0, ...state.fileFares.map((f) => f.id || 0)) + 1;
      }
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        const localSaved = localStorage.getItem(SETTINGS_KEY);
        if (!localSaved) {
          state.settings = {
            ...structuredClone(DEFAULT_SETTINGS),
            ...s,
            deal_bars: { ...DEFAULT_SETTINGS.deal_bars, ...(s.deal_bars || {}) },
            preferences: { ...DEFAULT_SETTINGS.preferences, ...(s.preferences || {}) },
            origins_map: { ...DEFAULT_SETTINGS.origins_map, ...(s.origins_map || {}) },
          };
        } else {
          state.settings.preferences = {
            ...state.settings.preferences,
            ...(s.preferences || {}),
          };
          state.settings.origins_map = {
            ...state.settings.origins_map,
            ...(s.origins_map || {}),
          };
          state.settings.deal_bars_note = s.deal_bars_note || state.settings.deal_bars_note;
        }
      }
    } catch (err) {
      console.warn("加载 data/*.json 失败", err);
      state.fileLoadError = true;
      toast("未能读取 data/fares.json，请用本地服务打开");
    }
  }

  /** 今天的 Asia/Shanghai 日期（YYYY-MM-DD），与数据里的日期口径一致。 */
  function todayYmd() {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
  }

  /** 最后一次出行日：往返看返程日，单程看出发日。 */
  function lastTravelDate(fare) {
    return fare.trip_type === "往返" && fare.return_date ? fare.return_date : fare.depart_date || "";
  }

  /** 最后出行日早于今天即已过期（进入历史页）。无日期的记录不判为过期。 */
  function isExpired(fare) {
    const d = lastTravelDate(fare);
    return Boolean(d) && d < todayYmd();
  }

  function filteredSorted(opts = {}) {
    let list = allFares();
    const { country, origin, deal, q, maxPrice, showExamples } = state.filter;
    if (!showExamples) list = list.filter((f) => !f.is_example);
    list = list.filter((f) => (state.view === "history" ? isExpired(f) : !isExpired(f)));
    if (country && !opts.skipCountry) list = list.filter((f) => f.destination_country === country);
    if (origin) list = list.filter((f) => normalizeOrigin(f.origin).includes(origin));
    if (deal === "deal") list = list.filter((f) => hasValidPrice(f) && f.meets_deal_bar);
    if (deal === "normal") list = list.filter((f) => hasValidPrice(f) && !f.meets_deal_bar);
    if (maxPrice !== "" && maxPrice != null && !Number.isNaN(Number(maxPrice))) {
      list = list.filter((f) => hasValidPrice(f) && Number(f.price_cny) <= Number(maxPrice));
    }
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((f) => {
        const hay = [
          originLabel(f.origin),
          f.destination_country,
          f.destination_city,
          f.destination_airport,
          f.airline,
          f.stops,
          f.notes,
          f.trip_type,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
    }
    const { key, dir } = state.sort;
    const mul = dir === "asc" ? 1 : -1;
    list = dedupeFares(list);
    list.sort((a, b) => {
      let av = a[key];
      let bv = b[key];
      if (key === "price_cny") {
        const aValid = hasValidPrice(a);
        const bValid = hasValidPrice(b);
        if (aValid !== bValid) return aValid ? -1 : 1;
        if (!aValid) return 0;
        return (Number(av) - Number(bv)) * mul;
      }
      if (key === "found_at" || key === "depart_date" || key === "return_date") {
        av = av || "";
        bv = bv || "";
        return av < bv ? -1 * mul : av > bv ? 1 * mul : 0;
      }
      av = (av ?? "").toString();
      bv = (bv ?? "").toString();
      return av.localeCompare(bv, "zh") * mul;
    });
    return list;
  }

  function weekdayCn(ymd) {
    const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    return ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  }

  function fullDate(ymd) {
    if (!isValidDate(String(ymd || "").slice(0, 10))) return "日期待确认";
    const [year, month, day] = String(ymd).slice(0, 10).split("-").map(Number);
    return `${year}年${month}月${day}日（周${weekdayCn(ymd)}）`;
  }

  // 短日期：10月22日；跨年才显示年份
  function shortDate(ymd) {
    const m = String(ymd || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "—";
    const year = Number(m[1]);
    const base = `${Number(m[2])}月${Number(m[3])}日`;
    return year === new Date().getFullYear() ? base : `${year}年${base}`;
  }

  // 采集时间：今天 / N 天前
  function collectedAgo(iso) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    const days = Math.floor((Date.now() - t) / 86400000);
    if (days <= 0) return "今天采集";
    return `采集于 ${days} 天前`;
  }

  function cityRouteHtml(f) {
    const map = state.settings.origins_map || DEFAULT_SETTINGS.origins_map;
    const from = normalizeOrigin(f.origin).map((c) => map[c] || c).join("/") || "—";
    const to = f.destination_city || f.destination_country || "—";
    return { from, to };
  }

  // 票价行：航线 / 行程 / 价格 / 操作；详情在行下方原位展开
  function fareRowHtml(f, cmp) {
    const { from, to } = cityRouteHtml(f);
    const sub = [f.destination_country, f.destination_airport].filter(Boolean).join(" · ");
    const week = weekdayCn(f.depart_date);
    const dateText =
      f.trip_type === "往返"
        ? `${shortDate(f.depart_date)}（周${week}）→ ${shortDate(f.return_date)}`
        : f.trip_type === "单程"
          ? `${shortDate(f.depart_date)}（周${week}）`
          : shortDate(f.depart_date);
    const fullDateText =
      f.trip_type === "往返"
        ? `${fullDate(f.depart_date)} → ${fullDate(f.return_date)}`
        : fullDate(f.depart_date);
    const priceDisplay = hasValidPrice(f)
      ? `¥${Number(f.price_cny).toLocaleString("zh-CN")}`
      : "价格待确认";
    const { urls, text } = extractNoteLinks(f.notes);
    const cta = urls.length
      ? `<a class="btn fare-cta" href="${escapeAttr(urls[0])}" target="_blank" rel="noopener noreferrer">${iconSvg("arrow-right")}<span>查看票价</span></a>`
      : `<span class="muted fare-cta-none">暂无查票链接</span>`;
    let dealNote = "";
    if (cmp.vsBar) {
      const { diff, under } = cmp.vsBar;
      dealNote = under
        ? `<span class="deal-note under">低于好价线 ¥${Math.abs(diff)}</span>`
        : `<span class="deal-note">高于好价线 ¥${Math.abs(diff)}</span>`;
    }
    const collected = collectedAgo(f.found_at) || `采集于 ${formatFoundAt(f.found_at)}`;
    const rowClass = [f.is_example ? "example" : "", f.superseded_by ? "superseded" : ""].filter(Boolean).join(" ");
    const priceLabel = !hasValidPrice(f)
      ? "请核实金额"
      : f.trip_type === "往返"
        ? "往返价格 · CNY"
        : f.trip_type === "单程"
          ? "单程价格 · CNY"
          : "票价 · CNY";
    const detailId = `detail-${f.source}-${f.id}`;
    return `<article class="fare-card ${rowClass}" data-id="${f.id}" data-source="${f.source}">
      <div class="fare-row">
        <div class="fare-route">
          <div class="fare-route-title">${escapeHtml(from)} → ${escapeHtml(to)}</div>
          <div class="fare-route-sub">${escapeHtml(sub || "—")} · ${escapeHtml(f.trip_type)}</div>
          <div class="badge-row">${badgesHtml(f, cmp)}</div>
        </div>
        <div class="fare-when">
          <div class="fare-date">${escapeHtml(dateText)}</div>
          <div class="fare-airline">${escapeHtml(f.airline || "—")} · ${escapeHtml(f.stops || "—")}</div>
          <div class="fare-seen">${escapeHtml(collected)}</div>
        </div>
        <div class="fare-price-col">
          <div class="fare-price ${hasValidPrice(f) ? "" : "price-pending"}">${priceDisplay}</div>
          <div class="fare-price-note">${priceLabel}</div>
          ${dealNote}
        </div>
        <div class="fare-cta-col">
          ${cta}
          <button type="button" class="fare-toggle" data-act="toggle" aria-expanded="false" aria-controls="${detailId}">详情</button>
        </div>
      </div>
      <div class="fare-detail" id="${detailId}" hidden>
        <p class="fare-meta-full">出行 ${escapeHtml(fullDateText)} · 采集于 ${escapeHtml(formatFoundAt(f.found_at))}</p>
        ${text ? `<p class="fare-notes">${escapeHtml(text)}</p>` : ""}
        ${urls.length > 1 ? `<div class="book-links">${urls.slice(1).map((u, i) => `<a class="btn btn-sm" href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer">其他来源 ${i + 1}</a>`).join("")}</div>` : ""}
        ${trendRowHtml(f, cmp)}
        ${returnRecHtml(f)}
        <div class="fare-admin">
          <button type="button" class="btn btn-sm" data-act="edit">${iconSvg("overflow")}<span>编辑</span></button>
          <button type="button" class="btn btn-sm btn-danger" data-act="del">${iconSvg("delete")}<span>删除</span></button>
        </div>
      </div>
    </article>`;
  }

  function formatDate(d) {
    if (!d) return "—";
    return String(d).slice(0, 10);
  }

  function formatFoundAt(iso) {
    if (!iso) return "—";
    try {
      const dt = new Date(iso);
      if (Number.isNaN(dt.getTime())) return String(iso).slice(0, 16);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const day = String(dt.getDate()).padStart(2, "0");
      const hh = String(dt.getHours()).padStart(2, "0");
      const mm = String(dt.getMinutes()).padStart(2, "0");
      return `${y}-${m}-${day} ${hh}:${mm}`;
    } catch {
      return String(iso).slice(0, 16);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }


  function observationTimeKey(value) {
    if (
      typeof value !== "string" ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$/i.test(value) ||
      !isValidDate(value.slice(0, 10))
    ) return "";
    const epoch = Date.parse(value);
    return Number.isFinite(epoch) ? String(epoch) : "";
  }

  function dedupeKey(fare) {
    const origin = normalizeOrigin(fare.origin).slice().sort().join(",");
    return [
      origin,
      fare.destination_country || "",
      (fare.destination_airport || "").toUpperCase(),
      fare.trip_type || "",
      fare.depart_date || "",
      fare.return_date || "",
      Number(fare.price_cny),
      observationTimeKey(fare.found_at),
    ].join("|");
  }

  /** Same route + date + price + observation time → keep one across file/local sources. */
  function dedupeFares(list) {
    const rank = (f) => {
      const t = new Date(f.found_at || 0).getTime() || 0;
      const examplePenalty = f.is_example ? 0 : 1e15;
      const sourceBonus = f.source === "file" ? 1e12 : 0;
      return examplePenalty + sourceBonus + t;
    };
    const best = new Map();
    for (const f of list) {
      const k = dedupeKey(f);
      const prev = best.get(k);
      if (!prev || rank(f) >= rank(prev)) best.set(k, f);
    }
    // preserve input order among winners
    const winners = new Set(best.values());
    return list.filter((f) => winners.has(f));
  }

  function extractNoteLinks(notes) {
    const text = String(notes || "");
    const re = /https?:\/\/[^\s<>"'\]]+/gi;
    const urls = [];
    const seen = new Set();
    let m;
    while ((m = re.exec(text))) {
      let url = m[0].replace(/[),.;!?]+$/g, "");
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
    const cleaned = text
      .replace(re, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s*[·|｜]\s*$/g, "")
      .trim();
    return { urls, text: cleaned };
  }

  function noteLinksHtml(notes, { compact = false } = {}) {
    const { urls } = extractNoteLinks(notes);
    if (!urls.length) return "";
    return `<div class="book-links">${urls
      .map((u, i) => {
        const label =
          urls.length === 1
            ? "查票 / 下单"
            : compact
              ? `链接 ${i + 1}`
              : `查票链接 ${i + 1}`;
        return `<a class="btn btn-sm btn-book" href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer">${iconSvg("arrow-right")}<span>${label}</span></a>`;
      })
      .join("")}</div>`;
  }


  function renderPrefs() {
    const p = state.settings.preferences;
    const bars = state.settings.deal_bars;
    const notes = state.settings.deal_bars_note || {};
    $("#prefs-list").innerHTML = `
      <li>出发：${escapeHtml(p.origin_label || "珠三角+香港")}</li>
      <li>重点国家：${escapeHtml((p.priority_countries || []).join(" / "))}</li>
      <li>${escapeHtml(p.schedule_note || "")}</li>
      <li>${escapeHtml(p.spring_festival_note || "")}</li>
      <li>观察窗口：${escapeHtml(p.watch_window || "")}</li>
    `;
    $("#bars").innerHTML = Object.entries(bars)
      .map(([k, v]) => {
        const note = notes[k] ? ` · ${notes[k]}` : "";
        return `<span class="chip">${escapeHtml(k)} ≤ <strong>¥${v}</strong>${escapeHtml(note)}</span>`;
      })
      .join("");
    const prefs = $(".prefs");
    prefs.classList.toggle("collapsed", state.prefsCollapsed);
    $("#prefs-toggle").setAttribute("aria-expanded", String(!state.prefsCollapsed));
  }

  function renderStats(list) {
    const all = allFares();
    const real = all.filter((f) => !f.is_example && (state.view === "history" ? isExpired(f) : !isExpired(f)));
    const deals = real.filter((f) => f.meets_deal_bar).length;
    $("#stat-real").textContent = String(real.length);
    $("#stat-deals").textContent = String(deals);
    $("#stat-filtered").textContent = String(list.length);
  }

  function syncCountryScrollCue(box) {
    const overflowing = box.scrollWidth > box.clientWidth + 1;
    box.classList.toggle("has-overflow", overflowing);
    box.classList.toggle("at-end", !overflowing || box.scrollLeft + box.clientWidth >= box.scrollWidth - 3);
    return overflowing;
  }

  // 国家芯片：每个国家带当前视图（有效 / 历史）下的记录数，点击切换筛选
  function renderCountryFilter() {
    const pool = filteredSorted({ skipCountry: true });
    const counts = new Map();
    pool.forEach((f) => {
      const c = f.destination_country;
      if (c) counts.set(c, (counts.get(c) || 0) + 1);
    });
    // 国家列表取自当前视图的全部记录，零结果国家显示 0，避免切换条件时突然消失
    const base = allFares().filter(
      (f) => (state.filter.showExamples || !f.is_example) && (state.view === "history" ? isExpired(f) : !isExpired(f))
    );
    const countries = [...new Set(base.map((f) => f.destination_country).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "zh")
    );
    const cur = state.filter.country;
    const chip = (value, label, count) =>
      `<button type="button" class="fchip" data-country="${escapeAttr(value)}" aria-pressed="${
        cur === value ? "true" : "false"
      }"><span>${escapeHtml(label)}</span><span class="fchip-count">${count || 0}</span></button>`;
    const box = $("#filter-country");
    // 重绘前记住焦点所在的国家，重绘后还原，避免键盘焦点丢失
    const focused =
      document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.country : null;
    box.innerHTML = chip("", "全部", pool.length) + countries.map((c) => chip(c, c, counts.get(c))).join("");
    if (focused != null) {
      const el = [...box.querySelectorAll("button[data-country]")].find((b) => b.dataset.country === focused);
      if (el) el.focus({ preventScroll: true });
    }
    const scrollTarget = [...box.querySelectorAll("button[data-country]")].find((b) =>
      b.dataset.country === (focused != null ? focused : cur)
    );
    if (scrollTarget) {
      requestAnimationFrame(() => {
        if (!box.isConnected) return;
        const overflowing = syncCountryScrollCue(box);
        if (!scrollTarget.isConnected || !overflowing) return;
        const boxRect = box.getBoundingClientRect();
        const chipRect = scrollTarget.getBoundingClientRect();
        if (chipRect.left < boxRect.left) box.scrollLeft -= boxRect.left - chipRect.left;
        else if (chipRect.right > boxRect.right) box.scrollLeft += chipRect.right - boxRect.right;
      });
    }
  }

  // 更多筛选：先在草稿中编辑，点「应用」才生效；关闭未应用则回退到当前条件
  function draftFilterFromInputs() {
    const normal = $("#filter-normal").checked;
    return {
      origin: $("#filter-origin").value,
      maxPrice: $("#filter-max-price").value,
      q: $("#filter-q").value.trim(),
      showExamples: $("#filter-examples").checked,
      deal: normal ? "normal" : state.filter.deal === "normal" ? "all" : state.filter.deal,
    };
  }

  function previewMoreCount() {
    const saved = { ...state.filter };
    Object.assign(state.filter, draftFilterFromInputs());
    const n = filteredSorted().length;
    Object.assign(state.filter, saved);
    $("#btn-apply-more").textContent = `应用筛选（${n} 条）`;
  }

  const isSheetViewport = () => window.matchMedia("(max-width: 760px)").matches;
  let suppressFilterDialogClose = 0;

  function placeFilterPanel() {
    const panel = $("#filters-more-panel");
    const parent = isSheetViewport() ? $("#filters-dialog") : $("#filters-more");
    if (panel.parentElement !== parent) parent.append(panel);
  }

  function closeFilterDialogProgrammatically(dialog) {
    if (!dialog.open) return;
    suppressFilterDialogClose += 1;
    dialog.close();
    document.body.classList.remove("filters-modal-open");
  }

  function closeMore(restoreFocus) {
    const more = $("#filters-more");
    const dialog = $("#filters-dialog");
    more.open = false;
    closeFilterDialogProgrammatically(dialog);
    syncFilterControls();
    if (restoreFocus) more.querySelector("summary").focus({ preventScroll: true });
  }

  function applyMoreFilters() {
    Object.assign(state.filter, draftFilterFromInputs());
    saveLocal();
    closeMore(true);
    renderTable();
    toast(`已应用 · ${filteredSorted().length} 条`);
  }

  function clearAllFilters() {
    state.filter.country = "";
    state.filter.origin = "";
    state.filter.deal = "all";
    state.filter.q = "";
    state.filter.maxPrice = "";
    saveLocal();
    closeMore(false);
    renderTable();
    $("#filter-deal [data-deal='all']").focus({ preventScroll: true });
    toast("已清空全部筛选 · 示例显示与排序保持不变");
  }

  function bindMoreFilters() {
    const more = $("#filters-more");
    const dialog = $("#filters-dialog");
    const summary = more.querySelector("summary");
    const media = window.matchMedia("(max-width: 760px)");
    placeFilterPanel();
    ["#filter-origin", "#filter-max-price", "#filter-q", "#filter-examples", "#filter-normal"].forEach((sel) => {
      $(sel).addEventListener("input", previewMoreCount);
      $(sel).addEventListener("change", previewMoreCount);
    });
    more.addEventListener("toggle", () => {
      if (more.open) {
        placeFilterPanel();
        previewMoreCount();
        if (isSheetViewport()) {
          if (!dialog.open) dialog.showModal();
          document.body.classList.add("filters-modal-open");
        }
        requestAnimationFrame(() => $("#filter-origin").focus({ preventScroll: true }));
      } else {
        closeFilterDialogProgrammatically(dialog);
        syncFilterControls();
      }
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeMore(true);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeMore(true);
    });
    dialog.addEventListener("close", () => {
      const programmaticClose = suppressFilterDialogClose > 0;
      if (programmaticClose) suppressFilterDialogClose -= 1;
      // A queued close event from an earlier modal cycle must not unlock a newly reopened dialog.
      if (dialog.open) return;
      document.body.classList.remove("filters-modal-open");
      if (programmaticClose) return;
      if (more.open) more.open = false;
      syncFilterControls();
      summary.focus({ preventScroll: true });
    });
    media.addEventListener("change", () => {
      const wasOpen = more.open;
      closeFilterDialogProgrammatically(dialog);
      placeFilterPanel();
      if (wasOpen && isSheetViewport()) {
        dialog.showModal();
        document.body.classList.add("filters-modal-open");
      }
    });
    $("#btn-apply-more").addEventListener("click", applyMoreFilters);
    $("#btn-close-more").addEventListener("click", () => closeMore(true));
    $("#btn-clear-more").addEventListener("click", () => {
      $("#filter-origin").value = "";
      $("#filter-max-price").value = "";
      $("#filter-q").value = "";
      $("#filter-normal").checked = false;
      previewMoreCount();
    });
    $("#active-filters").addEventListener("click", (event) => {
      if (event.target.closest('[data-act="clear-all-filters"]')) clearAllFilters();
    });
    $("#btn-add-inline").addEventListener("click", () => $("#btn-add").click());
  }

  function syncFilterControls() {
    $("#filter-origin").value = state.filter.origin;
    $$("#filter-deal button[data-deal]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.deal === state.filter.deal))
    );
    $("#filter-normal").checked = state.filter.deal === "normal";
    const extra = [
      state.filter.origin,
      state.filter.maxPrice,
      state.filter.q,
      state.filter.showExamples ? "1" : "",
      state.filter.deal === "normal" ? "1" : "",
    ]
      .filter(Boolean).length;
    $("#filters-more-count").textContent = extra ? `· ${extra}` : "";
    $("#filter-q").value = state.filter.q;
    $("#filter-max-price").value = state.filter.maxPrice;
    $("#filter-examples").checked = state.filter.showExamples;
    const sortVal = `${state.sort.key}:${state.sort.dir}`;
    const sortSel = $("#filter-sort");
    if ([...sortSel.options].some((o) => o.value === sortVal)) sortSel.value = sortVal;
    else sortSel.value = "price_cny:asc";

    const pills = [];
    if (state.filter.country) pills.push(`国家：${state.filter.country}`);
    if (state.filter.origin) pills.push(`出发：${state.filter.origin}`);
    if (state.filter.deal === "normal") pills.push("只看普通");
    if (state.filter.maxPrice !== "") pills.push(`≤ ¥${state.filter.maxPrice}`);
    if (state.filter.q) pills.push(`搜索：${state.filter.q}`);
    if (state.filter.showExamples) pills.push("含示例");
    const box = $("#active-filters");
    const hasClearableFilter = Boolean(
      state.filter.country ||
      state.filter.origin ||
      state.filter.deal === "normal" ||
      state.filter.maxPrice !== "" ||
      state.filter.q
    );
    if (pills.length) {
      const clearAll = hasClearableFilter
        ? `<button type="button" class="filter-clear-all" data-act="clear-all-filters">清空全部筛选</button>`
        : "";
      box.hidden = false;
      box.innerHTML = pills.map((p) => `<span class="filter-pill">${escapeHtml(p)}</span>`).join("") + clearAll;
    } else {
      box.hidden = true;
      box.innerHTML = "";
    }
  }


  function iconSvg(name, cls) {
    const c = cls ? ` ${cls}` : "";
    return `<svg class="icon${c}" aria-hidden="true" focusable="false"><use href="#uber-${name}"></use></svg>`;
  }

  function originsOverlap(a, b) {
    const A = new Set(normalizeOrigin(a));
    const B = normalizeOrigin(b);
    return B.some((x) => A.has(x));
  }

  function addDaysYmd(ymd, days) {
    if (!ymd) return "";
    const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function airportCompatible(a, b) {
    const aa = (a || "").toUpperCase();
    const bb = (b || "").toUpperCase();
    if (!aa || !bb) return true;
    return aa === bb;
  }

  /** 单程：推荐约 +4/+7/+10 天返程（同航线往返记录、notes 解析） */
  function findReturnRecs(fare) {
    if (!fare || fare.trip_type !== "单程") return [];
    const dep = String(fare.depart_date || "").slice(0, 10);
    if (!dep) return [];
    const offsets = [4, 7, 10];
    const targets = offsets.map((days) => ({ days, date: addDaysYmd(dep, days) }));
    const pool = allFares().filter((f) => !f.is_example);
    const out = [];
    const seen = new Set();

    function pushItem(item) {
      const key = `${item.days}|${item.date}|${item.price ?? ""}|${item.airline || ""}|${(item.urls || [])[0] || ""}|${item.sourceId || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    }

    for (const { days, date } of targets) {
      if (!date) continue;
      for (const f of pool) {
        if (f.trip_type !== "往返") continue;
        if (f.destination_country !== fare.destination_country) continue;
        if (!originsOverlap(f.origin, fare.origin)) continue;
        if (!airportCompatible(f.destination_airport, fare.destination_airport)) continue;
        const fDep = String(f.depart_date || "").slice(0, 10);
        const fRet = String(f.return_date || "").slice(0, 10);
        if (fDep === dep && fRet === date) {
          const links = extractNoteLinks(f.notes);
          pushItem({
            days,
            date,
            price: f.price_cny,
            airline: f.airline,
            stops: f.stops,
            urls: links.urls,
            note: links.text,
            kind: "往返记录",
            sourceId: `${f.source}-${f.id}`,
          });
        }
      }
    }

    // notes on the one-way itself: e.g. 往返12/4-12/11约970
    const note = fare.notes || "";
    const noteMatch = note.match(/往返\s*(\d{1,2})\/(\d{1,2})\s*[-~～到至]+\s*(\d{1,2})\/(\d{1,2})[^0-9]{0,6}约?\s*(\d{3,5})?/);
    if (noteMatch) {
      const y = Number(dep.slice(0, 4));
      const ret = `${y}-${String(noteMatch[3]).padStart(2, "0")}-${String(noteMatch[4]).padStart(2, "0")}`;
      for (const { days, date } of targets) {
        if (date === ret) {
          const links = extractNoteLinks(note);
          pushItem({
            days,
            date,
            price: noteMatch[5] ? Number(noteMatch[5]) : null,
            airline: "",
            stops: "",
            urls: links.urls,
            note: "来自本条备注",
            kind: "备注",
            sourceId: `note-${fare.source}-${fare.id}-${days}`,
          });
        }
      }
    }

    // RT notes mentioning +N days paired with this depart
    for (const { days, date } of targets) {
      for (const f of pool) {
        if (f.trip_type !== "往返") continue;
        if (f.destination_country !== fare.destination_country) continue;
        if (!originsOverlap(f.origin, fare.origin)) continue;
        const fDep = String(f.depart_date || "").slice(0, 10);
        const fRet = String(f.return_date || "").slice(0, 10);
        if (fDep !== dep) continue;
        if (fRet !== date) continue;
        // already added above
      }
    }

    out.sort((a, b) => a.days - b.days || (a.price || 0) - (b.price || 0));
    return out;
  }

  function returnRecHtml(fare) {
    if (fare.trip_type !== "单程") return "";
    const recs = findReturnRecs(fare);
    const countLabel = recs.length ? `${recs.length} 条` : "暂无";
    let body;
    if (!recs.length) {
      body = `<div class="return-rec-empty">暂无推荐返程</div>`;
    } else {
      body = recs
        .map((r) => {
          const price =
            r.price != null && !Number.isNaN(Number(r.price))
              ? `¥${Number(r.price).toLocaleString("zh-CN")}`
              : "价格待查";
          const meta = [r.kind, r.airline, r.stops, r.note].filter(Boolean).join(" · ");
          const links = (r.urls || []).length
            ? `<div class="book-links">${r.urls
                .slice(0, 2)
                .map((u, i) => {
                  const label = i === 0 ? "查票 / 下单" : "链接";
                  return `<a class="btn btn-sm btn-book" href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer">${iconSvg("arrow-right")}${label}</a>`;
                })
                .join("")}</div>`
            : "";
          return `<div class="return-rec-item">
            <span class="rr-days">+${r.days}天</span>
            <span class="rr-date">${escapeHtml(r.date)}</span>
            <span class="rr-price">${price}</span>
            ${meta ? `<span class="rr-meta">${escapeHtml(meta)}</span>` : ""}
            ${links}
          </div>`;
        })
        .join("");
    }
    return `<details class="return-rec">
      <summary>${iconSvg("chevron-right", "icon-chevron")}<span>推荐返程</span><span class="return-rec-count">${countLabel} · +4 / +7 / +10</span></summary>
      <div class="return-rec-body">${body}</div>
    </details>`;
  }

  function trendRowHtml(fare, cmp) {
    const inner = priceCompareHtml(fare, cmp);
    if (!inner) {
      return `<div class="fare-trend"><span class="fare-trend-label">历史比较</span><span class="muted">暂无足够可比记录</span></div>`;
    }
    return `<div class="fare-trend"><span class="fare-trend-label">历史比较</span>${inner}</div>`;
  }

  function priceCompareHtml(fare, cmp) {
    const parts = [];
    if (cmp.routeMin != null && cmp.routeCount >= 2) {
      parts.push(
        `<div class="hist-hint">本站同类记录最低 ¥${cmp.routeMin} · ${cmp.routeCount} 条有效观测</div>`
      );
      parts.push(
        `<p class="hist-scope">范围：相同出发机场组合、目的机场和行程类型；包含不同出行日期，价格可能不同。示例及信息不完整的记录不参与。</p>`
      );
    } else {
      parts.push(`<div class="hist-hint">暂无足够历史记录可比（至少需要 2 条有效观测）</div>`);
    }
    return parts.join("");
  }

  function badgesHtml(fare, cmp) {
    const badges = [];
    if (cmp.histLow) {
      badges.push(`<span class="badge badge-best" title="同出发地、同目的地、同行程类型，本站 ${cmp.routeCount} 条可比记录中最低">本站同类最低</span>`);
    }
    if (fare.superseded_by) {
      badges.push(
        `<span class="badge badge-superseded" title="${escapeAttr(`同航线同日期已有更低价 id ${fare.superseded_by} 取代此价`)}">已取代</span>`
      );
    }
    if (fare.is_example) badges.push(`<span class="badge badge-example">示例</span>`);
    if (fare.source === "local") badges.push(`<span class="badge badge-local">本地</span>`);
    return badges.join("");
  }

  /** 同步「历史机票」按钮与列表标题（有效 / 历史两个视图）。 */
  function renderViewToggle() {
    const isHist = state.view === "history";
    const expiredCount = allFares().filter((f) => !f.is_example && isExpired(f)).length;
    $("#btn-view-label").textContent = isHist ? "返回有效" : `历史机票（${expiredCount}）`;
    $("#btn-view").setAttribute("aria-pressed", String(isHist));
    $("#list-title").textContent = isHist ? "历史机票（出行日已过）" : "机票列表";
  }

  function setView(view) {
    state.view = view === "history" ? "history" : "active";
    history.replaceState(null, "", location.pathname + location.search + (state.view === "history" ? "#history" : ""));
    renderTable();
  }

  function renderTable() {
    const list = filteredSorted();
    const hist = buildHistoryMaps();
    renderViewToggle();
    renderStats(list);
    renderCountryFilter();
    syncFilterControls();

    const cards = $("#fare-cards");
    const notice = $("#load-notice");
    if (notice) notice.hidden = !state.fileLoadError;

    if (!list.length) {
      const hasAny = allFares().length > 0;
      const emptyMsg = state.fileLoadError && !hasAny
        ? `<div class="empty"><strong>数据加载失败</strong>无法读取 data/fares.json，请确认通过本地或线上站点打开。<div class="empty-actions"><button type="button" class="btn btn-sm" data-act="retry">重新加载</button></div></div>`
        : state.view === "history"
        ? `<div class="empty"><strong>暂无历史机票</strong>出行日已过的记录会自动归入这里。</div>`
        : hasAny
        ? `<div class="empty"><strong>没有符合筛选的记录</strong>可以清空全部筛选，或切换「全部」看看。<div class="empty-actions"><button type="button" class="btn btn-sm" data-act="reset-filters">清空全部筛选</button></div></div>`
        : `<div class="empty"><strong>暂无真实票价记录</strong>行程管家写入 data/fares.json 并推送后刷新即可；也可点「＋ 新增」。</div>`;
      cards.innerHTML = emptyMsg;
      renderChart([]);
      renderCompare([]);
      return;
    }

    cards.innerHTML = list.map((f) => fareRowHtml(f, compareInfo(f, hist))).join("");

    const pricedList = list.filter(hasValidPrice);
    renderChart(pricedList);
    renderCompare(pricedList.filter((f) => !f.is_example));
    try {
      if (/(?:^|[?&])expandReturn=1(?:&|$)/.test(location.search)) {
        document.querySelectorAll("details.return-rec").forEach((d) => {
          try {
            if (d.getClientRects().length) d.open = true;
          } catch (_) {
            d.open = true;
          }
        });
      }
    } catch (_) {}
  }

  function renderCompare(list) {
    const box = $("#compare-body");
    const bars = state.settings.deal_bars || {};
    const countries = Object.keys(bars);
    if (!countries.length) {
      box.innerHTML = `<p class="muted">暂无门槛配置</p>`;
      return;
    }
    // For each country: show lowest real fare in current filtered list (or all real if filter empty of that country)
    const pool = list.length ? list : allFares().filter((f) => !f.is_example && hasValidPrice(f));
    const rows = countries.map((c) => {
      const bar = Number(bars[c]);
      const fares = pool.filter((f) => f.destination_country === c);
      if (!fares.length) {
        return { c, bar, min: null, count: 0, dealCount: 0 };
      }
      const min = Math.min(...fares.map((f) => f.price_cny));
      const dealCount = fares.filter((f) => f.meets_deal_bar).length;
      return { c, bar, min, count: fares.length, dealCount };
    });

    box.innerHTML = rows
      .map((r) => {
        if (r.min == null) {
          return `<div class="compare-row">
            <div><div class="name">${escapeHtml(r.c)}</div><div class="sub">当前筛选无记录</div></div>
            <div class="right"><div class="bar-label">门槛 ¥${r.bar}</div></div>
          </div>`;
        }
        const under = r.min <= r.bar;
        const diff = Math.abs(r.bar - r.min);
        return `<div class="compare-row ${under ? "hot" : ""}">
          <div>
            <div class="name">${escapeHtml(r.c)}</div>
            <div class="sub">${r.count} 条 · 好价 ${r.dealCount} · ${under ? `低于门槛 ¥${diff}` : `超门槛 ¥${diff}`}</div>
          </div>
          <div class="right">
            <div class="num">¥${r.min}</div>
            <div class="bar-label">门槛 ¥${r.bar}</div>
          </div>
        </div>`;
      })
      .join("");
  }


  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function chartInk() {
    return getComputedStyle(document.documentElement).getPropertyValue("--chart-label").trim() || "#94a3b8";
  }

  function chartGrid() {
    return getComputedStyle(document.documentElement).getPropertyValue("--chart-grid").trim() || "#e2e8f0";
  }

  function applyTheme(theme, { persist = true } = {}) {
    const t = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.style.colorScheme = t;
    const meta = document.getElementById("meta-theme-color");
    if (meta) meta.setAttribute("content", t === "dark" ? "#0b1220" : "#0ea5e9");
    const btn = document.getElementById("btn-theme");
    if (btn) {
      btn.setAttribute("aria-label", t === "dark" ? "切换到亮色模式" : "切换到暗色模式");
      btn.setAttribute("title", t === "dark" ? "切换到亮色模式" : "切换到暗色模式");
    }
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, t);
      } catch (_) {}
    }
  }

  function resolveInitialTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (_) {}
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (_) {
      return "light";
    }
  }

  function toggleTheme() {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
    // re-render chart so SVG strokes pick up new ink/grid colors
    try {
      renderTable();
    } catch (_) {}
  }

  function renderChart(list) {
    const svg = $("#chart-svg");
    const legend = $("#chart-legend");
    if (!list.length) {
      const label = chartInk();
      svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="${label}" font-size="14">暂无数据可绘制趋势</text>`;
      legend.innerHTML = "";
      return;
    }
    const byCountry = new Map();
    for (const f of list) {
      const c = f.destination_country || "未知";
      if (!byCountry.has(c)) byCountry.set(c, []);
      byCountry.get(c).push(f);
    }
    const countries = [...byCountry.keys()].slice(0, 6);
    const W = 600;
    const H = 220;
    const pad = { l: 44, r: 16, t: 16, b: 36 };
    const allPrices = list.map((f) => f.price_cny);
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const yMin = Math.max(0, Math.floor(minP * 0.85));
    const yMax = Math.ceil(maxP * 1.1) || 100;
    const times = list
      .map((f) => new Date(f.found_at || f.depart_date || Date.now()).getTime())
      .filter((t) => !Number.isNaN(t));
    let tMin = Math.min(...times);
    let tMax = Math.max(...times);
    if (tMin === tMax) {
      tMin -= 86400000;
      tMax += 86400000;
    }
    const xScale = (t) => pad.l + ((t - tMin) / (tMax - tMin)) * (W - pad.l - pad.r);
    const yScale = (p) => pad.t + (1 - (p - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

    const grid = [0, 0.25, 0.5, 0.75, 1]
      .map((r) => {
        const y = pad.t + r * (H - pad.t - pad.b);
        const val = Math.round(yMax - r * (yMax - yMin));
        return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="${chartGrid()}"/><text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" fill="${chartInk()}" font-size="11">${val}</text>`;
      })
      .join("");

    const paths = countries
      .map((c, i) => {
        const pts = byCountry
          .get(c)
          .slice()
          .sort(
            (a, b) =>
              new Date(a.found_at || a.depart_date).getTime() -
              new Date(b.found_at || b.depart_date).getTime()
          );
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const d = pts
          .map((f, idx) => {
            const t = new Date(f.found_at || f.depart_date || Date.now()).getTime();
            const x = xScale(t);
            const y = yScale(f.price_cny);
            return `${idx === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");
        const circles = pts
          .map((f) => {
            const t = new Date(f.found_at || f.depart_date || Date.now()).getTime();
            return `<circle cx="${xScale(t).toFixed(1)}" cy="${yScale(f.price_cny).toFixed(1)}" r="4" fill="${color}"><title>${escapeHtml(c)} ¥${f.price_cny}</title></circle>`;
          })
          .join("");
        return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${circles}`;
      })
      .join("");

    const xLabels = [tMin, tMin + (tMax - tMin) / 2, tMax]
      .map((t) => {
        const d = new Date(t);
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        return `<text x="${xScale(t)}" y="${H - 10}" text-anchor="middle" fill="${chartInk()}" font-size="11">${label}</text>`;
      })
      .join("");

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `${grid}${paths}${xLabels}`;
    legend.innerHTML = countries
      .map((c, i) => `<span style="--c:${CHART_COLORS[i % CHART_COLORS.length]}">${escapeHtml(c)}</span>`)
      .join("");
  }

  function openModal(title) {
    $("#modal-title").textContent = title;
    $("#modal").classList.add("open");
  }
  function closeModal() {
    $("#modal").classList.remove("open");
    state.editingId = null;
    state.editingSource = null;
  }

  function fillForm(fare) {
    const form = $("#fare-form");
    const origins = fare ? normalizeOrigin(fare.origin) : [];
    form.origin.value = origins[0] || "CAN";
    form.destination_country.value = fare?.destination_country || "";
    form.destination_city.value = fare?.destination_city || "";
    form.destination_airport.value = fare?.destination_airport || "";
    form.trip_type.value = fare?.trip_type || "往返";
    form.depart_date.value = fare?.depart_date || "";
    form.return_date.value = fare?.return_date || "";
    form.airline.value = fare?.airline || "";
    form.stops.value = fare?.stops || "直飞";
    form.price_cny.value = fare?.price_cny ?? "";
    form.notes.value = fare?.notes || "";
    form.found_at.value = fare?.found_at ? toLocalInput(fare.found_at) : toLocalInput(new Date().toISOString());
    const override = fare?.deal_bar_override;
    form.deal_override.value =
      override === true ? "true" : override === false ? "false" : "auto";
  }

  function toLocalInput(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fromLocalInput(v) {
    if (!v) return new Date().toISOString();
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return new Date().toISOString();
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const oh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
    const om = String(Math.abs(offset) % 60).padStart(2, "0");
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${oh}:${om}`;
  }

  function readForm() {
    const form = $("#fare-form");
    const origin = form.origin.value ? [form.origin.value] : [];
    const overrideVal = form.deal_override.value;
    const deal_bar_override =
      overrideVal === "true" ? true : overrideVal === "false" ? false : null;
    const fare = {
      origin,
      destination_country: form.destination_country.value.trim(),
      destination_city: form.destination_city.value.trim(),
      destination_airport: form.destination_airport.value.trim().toUpperCase(),
      trip_type: form.trip_type.value,
      depart_date: form.depart_date.value,
      return_date: form.return_date.value,
      airline: form.airline.value.trim(),
      stops: form.stops.value.trim(),
      price_cny: Number(form.price_cny.value),
      notes: form.notes.value.trim(),
      found_at: fromLocalInput(form.found_at.value),
      deal_bar_override,
      is_example: false,
    };
    fare.meets_deal_bar = computeMeetsDeal(fare);
    return fare;
  }

  function upsertLocal(fare, id) {
    if (id != null) {
      const idx = state.localFares.findIndex((f) => f.id === id);
      if (idx >= 0) {
        state.localFares[idx] = { ...fare, id };
        return;
      }
    }
    const newId = state.localNextId++;
    state.localFares.push({ ...fare, id: newId });
  }

  function deleteFare(id, source) {
    if (source === "local") {
      const index = state.localFares.findIndex((fare) => fare.id === id);
      if (index < 0) return;
      const [fare] = state.localFares.splice(index, 1);
      pendingDeleteUndo = { source, id, fare, index };
    } else {
      const fare = state.fileFares.find((item) => item.id === id);
      if (!fare || state.hiddenFileIds.has(id)) return;
      state.hiddenFileIds.add(id);
      pendingDeleteUndo = { source, id };
    }
    saveLocal();
    renderTable();
    toast("已删除");
    showDeleteUndo();
  }

  function exportJson() {
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      settings: state.settings,
      file_fares_visible: state.fileFares.filter((f) => !state.hiddenFileIds.has(f.id)),
      local_fares: state.localFares,
      hidden_file_ids: [...state.hiddenFileIds],
      merged: allFares().map(({ source, ...rest }) => ({ ...rest, _source: source })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fare-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("已导出 JSON");
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.settings?.deal_bars) {
          state.settings = {
            ...state.settings,
            ...data.settings,
            deal_bars: { ...state.settings.deal_bars, ...data.settings.deal_bars },
          };
        }
        if (Array.isArray(data.local_fares)) {
          state.localFares = data.local_fares;
          state.localNextId = Math.max(1, ...state.localFares.map((f) => f.id || 0)) + 1;
        } else if (Array.isArray(data.fares)) {
          const base = state.localNextId;
          data.fares.forEach((f, i) => {
            state.localFares.push({ ...f, id: base + i, is_example: false });
          });
          state.localNextId = base + data.fares.length;
        } else if (Array.isArray(data.merged)) {
          const base = state.localNextId;
          data.merged.forEach((f, i) => {
            const { _source, source, ...rest } = f;
            state.localFares.push({ ...rest, id: base + i, is_example: false });
          });
          state.localNextId = base + data.merged.length;
        }
        if (Array.isArray(data.hidden_file_ids)) {
          state.hiddenFileIds = new Set(data.hidden_file_ids.map(Number));
        }
        saveLocal();
        renderPrefs();
        renderTable();
        toast("导入成功（写入浏览器本地）");
      } catch (e) {
        console.error(e);
        toast("导入失败：JSON 格式不对");
      }
    };
    reader.readAsText(file);
  }

  function openSettings() {
    const box = $("#settings-bars");
    const bars = state.settings.deal_bars;
    box.innerHTML = Object.entries(bars)
      .map(
        ([k, v]) => `<label class="field">${escapeHtml(k)}（CNY）
          <input type="number" min="0" step="10" data-country="${escapeAttr(k)}" value="${v}"></label>`
      )
      .join("");
    box.insertAdjacentHTML(
      "beforeend",
      `<label class="field full">新增国家门槛
        <input type="text" id="new-bar-country" placeholder="国家名，如 菲律宾"></label>
       <label class="field">门槛 CNY
        <input type="number" id="new-bar-value" min="0" step="10" placeholder="600"></label>`
    );
    $("#settings-modal").classList.add("open");
  }

  function saveSettings() {
    $$("#settings-bars input[data-country]").forEach((inp) => {
      const c = inp.dataset.country;
      const v = Number(inp.value);
      if (c && !Number.isNaN(v)) state.settings.deal_bars[c] = v;
    });
    const nc = $("#new-bar-country")?.value.trim();
    const nv = Number($("#new-bar-value")?.value);
    if (nc && !Number.isNaN(nv)) state.settings.deal_bars[nc] = nv;
    saveLocal();
    $("#settings-modal").classList.remove("open");
    renderPrefs();
    renderTable();
    toast("门槛已保存到本地");
  }

  function handleFareAction(btn) {
    const host = btn.closest("[data-id]");
    if (!host) return;
    const id = Number(host.dataset.id);
    const source = host.dataset.source;
    const fare = allFares().find((f) => f.id === id && f.source === source);
    if (!fare) return;
    if (btn.dataset.act === "edit") {
      state.editingId = id;
      state.editingSource = source;
      fillForm(fare);
      openModal(source === "file" ? "编辑（将保存为本地覆盖）" : "编辑机票记录");
    } else if (btn.dataset.act === "del") {
      deleteFare(id, source);
    }
  }

  function applySortValue(val) {
    const [key, dir] = String(val).split(":");
    if (key) {
      state.sort.key = key;
      state.sort.dir = dir === "asc" ? "asc" : "desc";
      saveLocal();
      renderTable();
    }
  }

  // 清空全部筛选：清国家、机场、关键词、最高价并将好价改为「全部」；示例偏好与排序不变
  function clearFilters() {
    state.filter.country = "";
    state.filter.origin = "";
    state.filter.deal = "all";
    state.filter.q = "";
    state.filter.maxPrice = "";
    saveLocal();
    renderTable();
    toast("已清空全部筛选，显示全部");
  }

  function resetFilters() {
    state.filter.country = "";
    state.filter.origin = "";
    state.filter.deal = "deal";
    state.filter.q = "";
    state.filter.maxPrice = "";
    state.sort = { key: "price_cny", dir: "asc" };
    // keep showExamples as user preference
    saveLocal();
    renderTable();
    toast("已重置为只看好价 · 价格从低到高");
  }

  function bind() {
    // Trust early head script; only sync meta/aria (avoid flash overwrite)
    applyTheme(
      document.documentElement.getAttribute("data-theme") || resolveInitialTheme(),
      { persist: false }
    );

    $("#btn-theme").addEventListener("click", toggleTheme);
    $("#btn-view").addEventListener("click", () => setView(state.view === "history" ? "active" : "history"));
    window.addEventListener("hashchange", () => setView(location.hash === "#history" ? "history" : "active"));
    try {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        let saved = null;
        try { saved = localStorage.getItem(THEME_KEY); } catch (_) {}
        if (saved === "light" || saved === "dark") return;
        applyTheme(e.matches ? "dark" : "light", { persist: false });
        try { renderTable(); } catch (_) {}
      });
    } catch (_) {}

    $("#btn-add").addEventListener("click", () => {
      state.editingId = null;
      state.editingSource = "local";
      fillForm(null);
      openModal("新增机票记录");
    });
    $("#btn-close-modal").addEventListener("click", closeModal);
    $("#btn-close-modal-2").addEventListener("click", closeModal);
    $("#modal").addEventListener("click", (e) => {
      if (e.target.id === "modal") closeModal();
    });
    $("#fare-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fare = readForm();
      if (!fare.origin.length) {
        toast("请至少选一个出发机场");
        return;
      }
      if (!fare.destination_country) {
        toast("请填写目的地国家");
        return;
      }
      if (!hasValidPrice(fare)) {
        toast("价格须大于 0");
        return;
      }
      if (state.editingSource === "file" && state.editingId != null) {
        state.hiddenFileIds.add(state.editingId);
        upsertLocal({ ...fare }, null);
        toast("已保存为本地修改（原文件记录已隐藏）");
      } else if (state.editingId != null && state.editingSource === "local") {
        upsertLocal(fare, state.editingId);
        toast("已更新");
      } else {
        upsertLocal(fare, null);
        toast("已新增");
      }
      saveLocal();
      closeModal();
      renderTable();
    });

    $("#fare-cards").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (btn && btn.dataset.act === "retry") {
        retryLoad(btn);
        return;
      }
      if (btn && btn.dataset.act === "reset-filters") {
        clearFilters();
        return;
      }
      if (btn && btn.dataset.act === "toggle") {
        const panel = document.getElementById(btn.getAttribute("aria-controls"));
        if (panel) {
          const open = panel.hasAttribute("hidden");
          if (open) panel.removeAttribute("hidden");
          else panel.setAttribute("hidden", "");
          btn.setAttribute("aria-expanded", String(open));
        }
        return;
      }
      if (btn) {
        const menu = btn.closest("details.more-menu");
        if (menu) menu.open = false;
        handleFareAction(btn);
      }
    });

    const countryRow = $("#filter-country");
    countryRow.addEventListener("scroll", () => syncCountryScrollCue(countryRow), { passive: true });
    window.addEventListener("resize", () => requestAnimationFrame(() => syncCountryScrollCue(countryRow)), { passive: true });
    countryRow.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-country]");
      if (!btn) return;
      const value = btn.dataset.country;
      // 再次点击已选国家即取消，回到「全部」
      state.filter.country = value && state.filter.country === value ? "" : value;
      renderTable();
    });
    $("#filter-deal").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-deal]");
      if (!b) return;
      state.filter.deal = b.dataset.deal;
      saveLocal();
      renderTable();
    });
    $("#filter-sort").addEventListener("change", (e) => applySortValue(e.target.value));
    bindMoreFilters();
    $("#btn-reset-filters").addEventListener("click", resetFilters);
    $("#load-notice").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act=retry]");
      if (btn) retryLoad(btn);
    });

    // 顶栏「更多」菜单：点选其中任一项后自动收起
    const topMore = $("#top-more");
    if (topMore) {
      topMore.addEventListener("click", (e) => {
        if (e.target.closest(".top-more-panel .btn")) topMore.removeAttribute("open");
      });
      document.addEventListener("click", (e) => {
        if (topMore.hasAttribute("open") && !topMore.contains(e.target)) topMore.removeAttribute("open");
      });
    }

    $("#prefs-toggle").addEventListener("click", () => {
      state.prefsCollapsed = !state.prefsCollapsed;
      saveLocal();
      renderPrefs();
    });

    $("#btn-export").addEventListener("click", exportJson);
    $("#btn-import").addEventListener("click", () => $("#import-file").click());
    $("#import-file").addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) importJson(file);
      e.target.value = "";
    });
    $("#btn-settings").addEventListener("click", openSettings);
    $("#btn-close-settings").addEventListener("click", () => $("#settings-modal").classList.remove("open"));
    $("#settings-modal").addEventListener("click", (e) => {
      if (e.target.id === "settings-modal") $("#settings-modal").classList.remove("open");
    });
    $("#btn-save-settings").addEventListener("click", saveSettings);
    $("#btn-reset-local").addEventListener("click", () => {
      if (!confirm("清空浏览器本地记录与隐藏项？（不会删除 data/fares.json）")) return;
      clearDeleteUndo();
      state.localFares = [];
      state.localNextId = 1;
      state.hiddenFileIds = new Set();
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(HIDDEN_FILE_KEY);
      renderTable();
      toast("本地数据已清空");
    });
  }

  async function init() {
    state.view = location.hash === "#history" ? "history" : "active";
    loadLocal();
    await loadFileData();
    bind();
    renderPrefs();
    renderTable();
  }

  init();
})();
