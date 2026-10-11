(() => {
  "use strict";

  const STORAGE_KEY = "fare-tracker:local-fares";
  const SETTINGS_KEY = "fare-tracker:settings";
  const HIDDEN_FILE_KEY = "fare-tracker:hidden-file-ids";
  const UI_KEY = "fare-tracker:ui";

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
      deal: "all",
      q: "",
      maxPrice: "",
      showExamples: false,
    },
    sort: { key: "found_at", dir: "desc" },
    editingId: null,
    editingSource: null,
    prefsCollapsed: false,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
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

  function computeMeetsDeal(fare) {
    if (fare.deal_bar_override === true) return true;
    if (fare.deal_bar_override === false) return false;
    const bar = dealBarFor(fare.destination_country);
    if (bar == null || fare.price_cny == null || Number.isNaN(Number(fare.price_cny))) return false;
    return Number(fare.price_cny) <= bar;
  }

  function routeKey(fare) {
    const airport = (fare.destination_airport || "").toUpperCase();
    const city = fare.destination_city || "";
    return `${fare.destination_country}|${airport || city}|${fare.trip_type || ""}`;
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
      trip_type: raw.trip_type === "单程" ? "单程" : "往返",
      depart_date: raw.depart_date || "",
      return_date: raw.return_date || "",
      airline: String(raw.airline || "").trim(),
      stops: String(raw.stops ?? "").trim(),
      price_cny: Number(raw.price_cny),
      notes: String(raw.notes || ""),
      found_at: raw.found_at || new Date().toISOString(),
      deal_bar_override:
        raw.deal_bar_override === true || raw.deal_bar_override === false
          ? raw.deal_bar_override
          : null,
      is_example: Boolean(raw.is_example),
      source,
    };
    if (Number.isNaN(fare.price_cny)) fare.price_cny = 0;
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

  /** Build historical min maps from ALL non-example fares (for fair comparison). */
  function buildHistoryMaps() {
    const pool = allFares().filter((f) => !f.is_example);
    const byRoute = new Map();
    const byCountry = new Map();
    for (const f of pool) {
      const rk = routeKey(f);
      const ck = countryKey(f);
      const p = Number(f.price_cny);
      if (!byRoute.has(rk) || p < byRoute.get(rk).price) byRoute.set(rk, { price: p, fare: f });
      if (!byCountry.has(ck) || p < byCountry.get(ck).price) byCountry.set(ck, { price: p, fare: f });
    }
    return { byRoute, byCountry };
  }

  function compareInfo(fare, hist) {
    const bar = dealBarFor(fare.destination_country);
    const price = Number(fare.price_cny);
    const vsBar =
      bar == null
        ? null
        : {
            bar,
            diff: bar - price,
            under: price <= bar,
            pct: bar > 0 ? Math.min(100, Math.round((price / bar) * 100)) : 0,
          };
    const routeMin = hist.byRoute.get(routeKey(fare));
    const countryMin = hist.byCountry.get(countryKey(fare));
    const isRouteBest = routeMin && routeMin.price === price && routeMin.fare.id === fare.id && routeMin.fare.source === fare.source;
    const isCountryBest = countryMin && countryMin.price === price && countryMin.fare.id === fare.id && countryMin.fare.source === fare.source;
    // Also treat as best if same price (tied)
    const isRouteBestLoose = routeMin && price <= routeMin.price;
    const isCountryBestLoose = countryMin && price <= countryMin.price;
    return {
      vsBar,
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
        showExamples: state.filter.showExamples,
        prefsCollapsed: state.prefsCollapsed,
        sort: state.sort,
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
        if (typeof ui.prefsCollapsed === "boolean") state.prefsCollapsed = ui.prefsCollapsed;
        if (ui.sort?.key) state.sort = ui.sort;
      }
    } catch (_) {}
  }

  async function loadFileData() {
    try {
      const [faresRes, settingsRes] = await Promise.all([
        fetch("./data/fares.json", { cache: "no-store" }),
        fetch("./data/settings.json", { cache: "no-store" }),
      ]);
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
      toast("未能读取 data/fares.json，请用本地服务打开");
    }
  }

  function filteredSorted() {
    let list = allFares();
    const { country, origin, deal, q, maxPrice, showExamples } = state.filter;
    if (!showExamples) list = list.filter((f) => !f.is_example);
    if (country) list = list.filter((f) => f.destination_country === country);
    if (origin) list = list.filter((f) => normalizeOrigin(f.origin).includes(origin));
    if (deal === "deal") list = list.filter((f) => f.meets_deal_bar);
    if (deal === "normal") list = list.filter((f) => !f.meets_deal_bar);
    if (maxPrice !== "" && maxPrice != null && !Number.isNaN(Number(maxPrice))) {
      list = list.filter((f) => Number(f.price_cny) <= Number(maxPrice));
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
    list.sort((a, b) => {
      let av = a[key];
      let bv = b[key];
      if (key === "price_cny") {
        return ((Number(av) || 0) - (Number(bv) || 0)) * mul;
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
    const real = all.filter((f) => !f.is_example);
    const deals = real.filter((f) => f.meets_deal_bar).length;
    const min = list.length ? Math.min(...list.map((f) => f.price_cny)) : null;
    $("#stat-real").textContent = String(real.length);
    $("#stat-deals").textContent = String(deals);
    $("#stat-min").textContent = min == null ? "—" : `¥${min}`;
    $("#stat-filtered").textContent = String(list.length);
  }

  function renderCountryFilter() {
    const pool = allFares().filter((f) => state.filter.showExamples || !f.is_example);
    const countries = [...new Set(pool.map((f) => f.destination_country).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "zh")
    );
    const sel = $("#filter-country");
    const cur = state.filter.country;
    sel.innerHTML =
      `<option value="">全部国家</option>` +
      countries.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("");
    sel.value = cur;
  }

  function syncFilterControls() {
    $("#filter-country").value = state.filter.country;
    $("#filter-origin").value = state.filter.origin;
    $("#filter-deal").value = state.filter.deal;
    $("#filter-q").value = state.filter.q;
    $("#filter-max-price").value = state.filter.maxPrice;
    $("#filter-examples").checked = state.filter.showExamples;
    const sortVal = `${state.sort.key}:${state.sort.dir}`;
    const sortSel = $("#filter-sort");
    if ([...sortSel.options].some((o) => o.value === sortVal)) sortSel.value = sortVal;
    else sortSel.value = "found_at:desc";

    $$("th[data-sort]").forEach((th) => {
      const active = th.dataset.sort === state.sort.key;
      th.classList.toggle("active-sort", active);
      const s = th.querySelector(".sort");
      if (s) s.textContent = active ? (state.sort.dir === "asc" ? "↑" : "↓") : "";
    });

    const pills = [];
    if (state.filter.country) pills.push(`国家：${state.filter.country}`);
    if (state.filter.origin) pills.push(`出发：${state.filter.origin}`);
    if (state.filter.deal === "deal") pills.push("只看好价");
    if (state.filter.deal === "normal") pills.push("只看普通");
    if (state.filter.maxPrice !== "") pills.push(`≤ ¥${state.filter.maxPrice}`);
    if (state.filter.q) pills.push(`搜索：${state.filter.q}`);
    if (state.filter.showExamples) pills.push("含示例");
    const box = $("#active-filters");
    if (pills.length) {
      box.hidden = false;
      box.innerHTML = pills.map((p) => `<span class="filter-pill">${escapeHtml(p)}</span>`).join("");
    } else {
      box.hidden = true;
      box.innerHTML = "";
    }
  }

  function priceCompareHtml(fare, cmp) {
    const parts = [];
    if (cmp.vsBar) {
      const { bar, diff, under, pct } = cmp.vsBar;
      const cls = under ? "under" : "over";
      const label = under
        ? `<span class="save">低于门槛 ¥${Math.abs(diff)}</span>`
        : `<span class="over">超门槛 ¥${Math.abs(diff)}</span>`;
      parts.push(`<div class="price-meta">门槛 ¥${bar} · ${label}</div>`);
      parts.push(
        `<div class="price-bar ${cls}" title="相对门槛 ${pct}%"><i style="width:${Math.min(100, pct)}%"></i></div>`
      );
    }
    const histBits = [];
    if (cmp.routeMin != null) {
      if (cmp.isRouteBest) histBits.push(`<span class="best">同航线历史最低</span>`);
      else histBits.push(`同航线最低 ¥${cmp.routeMin}`);
    }
    if (cmp.countryMin != null && !(cmp.isRouteBest && cmp.routeMin === cmp.countryMin)) {
      if (cmp.isCountryBest) histBits.push(`<span class="best">同国家历史最低</span>`);
      else histBits.push(`同国家最低 ¥${cmp.countryMin}`);
    }
    if (histBits.length) {
      parts.push(`<div class="hist-hint ${cmp.isRouteBest || cmp.isCountryBest ? "best" : ""}">${histBits.join(" · ")}</div>`);
    }
    return parts.join("");
  }

  function badgesHtml(fare, cmp) {
    const badges = [];
    if (fare.meets_deal_bar) badges.push(`<span class="badge badge-deal">好价</span>`);
    else badges.push(`<span class="badge badge-normal">普通</span>`);
    if (cmp.isRouteBest || cmp.isCountryBest) badges.push(`<span class="badge badge-best">历史低</span>`);
    if (fare.is_example) badges.push(`<span class="badge badge-example">示例</span>`);
    if (fare.source === "local") badges.push(`<span class="badge badge-local">本地</span>`);
    return badges.join("");
  }

  function renderTable() {
    const list = filteredSorted();
    const hist = buildHistoryMaps();
    renderStats(list);
    renderCountryFilter();
    syncFilterControls();

    const tbody = $("#fare-tbody");
    const cards = $("#fare-cards");

    if (!list.length) {
      const hasAny = allFares().length > 0;
      const emptyMsg = hasAny
        ? `<div class="empty"><strong>没有符合筛选的记录</strong>试试清空筛选，或打开「显示示例」。</div>`
        : `<div class="empty"><strong>暂无真实票价记录</strong>行程管家写入 data/fares.json 并推送后刷新即可；也可点「＋ 新增」。</div>`;
      tbody.innerHTML = `<tr><td colspan="7">${emptyMsg}</td></tr>`;
      cards.innerHTML = emptyMsg;
      renderChart([]);
      renderCompare([]);
      return;
    }

    tbody.innerHTML = list
      .map((f) => {
        const cmp = compareInfo(f, hist);
        const dest = [f.destination_city, f.destination_airport].filter(Boolean).join(" · ");
        const dates =
          f.trip_type === "往返"
            ? `${formatDate(f.depart_date)} → ${formatDate(f.return_date)}`
            : formatDate(f.depart_date);
        const rowClass = [
          f.meets_deal_bar ? "deal-row" : "",
          f.is_example ? "example-row" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<tr class="${rowClass}" data-id="${f.id}" data-source="${f.source}">
          <td>
            <div class="route-main">${escapeHtml(originLabel(f.origin))} → ${escapeHtml(f.destination_country)}</div>
            <div class="route-sub">${escapeHtml(dest || "—")} · ${escapeHtml(f.trip_type)}</div>
            <div class="badge-row">${badgesHtml(f, cmp)}</div>
          </td>
          <td>${escapeHtml(dates)}</td>
          <td>${escapeHtml(f.airline || "—")}<div class="muted">${escapeHtml(f.stops || "—")}</div></td>
          <td class="price-cell">
            <div class="price ${f.meets_deal_bar ? "deal" : ""}">¥${Number(f.price_cny).toLocaleString("zh-CN")}</div>
            ${priceCompareHtml(f, cmp)}
          </td>
          <td class="muted">${escapeHtml(formatFoundAt(f.found_at))}</td>
          <td class="muted"><div class="notes-clamp" title="${escapeAttr(f.notes || "")}">${escapeHtml(f.notes || "—")}</div></td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm" data-act="edit">编辑</button>
              <button class="btn btn-sm btn-danger" data-act="del">删除</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    cards.innerHTML = list
      .map((f) => {
        const cmp = compareInfo(f, hist);
        const dest = [f.destination_city, f.destination_airport].filter(Boolean).join(" · ");
        const dates =
          f.trip_type === "往返"
            ? `${formatDate(f.depart_date)} → ${formatDate(f.return_date)}`
            : formatDate(f.depart_date);
        let compareBits = "";
        if (cmp.vsBar) {
          const { bar, diff, under } = cmp.vsBar;
          compareBits += under
            ? `门槛 ¥${bar} · <span class="save">省 ¥${Math.abs(diff)}</span>`
            : `门槛 ¥${bar} · <span class="over">超 ¥${Math.abs(diff)}</span>`;
        }
        if (cmp.routeMin != null) {
          compareBits += (compareBits ? "<br>" : "") +
            (cmp.isRouteBest ? "同航线历史最低" : `同航线最低 ¥${cmp.routeMin}`);
        }
        return `<article class="fare-card ${f.meets_deal_bar ? "deal" : ""} ${f.is_example ? "example" : ""}" data-id="${f.id}" data-source="${f.source}">
          <div class="fare-card-top">
            <div>
              <div class="fare-card-route">${escapeHtml(originLabel(f.origin))} → ${escapeHtml(f.destination_country)}</div>
              <div class="badge-row" style="margin-top:6px">${badgesHtml(f, cmp)}</div>
            </div>
            <div class="fare-card-price ${f.meets_deal_bar ? "deal" : ""}">¥${Number(f.price_cny).toLocaleString("zh-CN")}</div>
          </div>
          <div class="fare-card-meta">
            <div>${escapeHtml(dest || "—")} · ${escapeHtml(f.trip_type)} · ${escapeHtml(dates)}</div>
            <div>${escapeHtml(f.airline || "—")} · ${escapeHtml(f.stops || "—")}</div>
            <div>发现 ${escapeHtml(formatFoundAt(f.found_at))}</div>
            ${f.notes ? `<div class="notes-clamp" style="max-width:100%">${escapeHtml(f.notes)}</div>` : ""}
          </div>
          ${compareBits ? `<div class="fare-card-compare">${compareBits}</div>` : ""}
          <div class="fare-card-actions">
            <button class="btn btn-sm" data-act="edit">编辑</button>
            <button class="btn btn-sm btn-danger" data-act="del">删除</button>
          </div>
        </article>`;
      })
      .join("");

    renderChart(list);
    renderCompare(list.filter((f) => !f.is_example));
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
    const pool = list.length ? list : allFares().filter((f) => !f.is_example);
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

  function renderChart(list) {
    const svg = $("#chart-svg");
    const legend = $("#chart-legend");
    if (!list.length) {
      svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="#94a3b8" font-size="14">暂无数据可绘制趋势</text>`;
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
        return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#e2e8f0"/><text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="11">${val}</text>`;
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
        return `<text x="${xScale(t)}" y="${H - 10}" text-anchor="middle" fill="#94a3b8" font-size="11">${label}</text>`;
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
    $$(".origin-tags input", form).forEach((inp) => {
      inp.checked = fare ? normalizeOrigin(fare.origin).includes(inp.value) : false;
    });
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
    const origin = $$(".origin-tags input:checked", form).map((i) => i.value);
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
      state.localFares = state.localFares.filter((f) => f.id !== id);
    } else {
      state.hiddenFileIds.add(id);
      toast("已从视图隐藏该文件记录（data/fares.json 需 CLI/手动改）");
    }
    saveLocal();
    renderTable();
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
      if (confirm("确定删除这条记录？")) deleteFare(id, source);
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

  function resetFilters() {
    state.filter.country = "";
    state.filter.origin = "";
    state.filter.deal = "all";
    state.filter.q = "";
    state.filter.maxPrice = "";
    // keep showExamples as user preference
    renderTable();
    toast("已清空筛选");
  }

  function bind() {
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
      if (!fare.price_cny && fare.price_cny !== 0) {
        toast("请填写价格");
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

    $("#fare-tbody").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (btn) handleFareAction(btn);
    });
    $("#fare-cards").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (btn) handleFareAction(btn);
    });

    $("#filter-country").addEventListener("change", (e) => {
      state.filter.country = e.target.value;
      renderTable();
    });
    $("#filter-origin").addEventListener("change", (e) => {
      state.filter.origin = e.target.value;
      renderTable();
    });
    $("#filter-deal").addEventListener("change", (e) => {
      state.filter.deal = e.target.value;
      renderTable();
    });
    $("#filter-sort").addEventListener("change", (e) => applySortValue(e.target.value));
    $("#filter-max-price").addEventListener("input", (e) => {
      state.filter.maxPrice = e.target.value;
      renderTable();
    });
    $("#filter-q").addEventListener("input", (e) => {
      state.filter.q = e.target.value.trim();
      renderTable();
    });
    $("#filter-examples").addEventListener("change", (e) => {
      state.filter.showExamples = e.target.checked;
      saveLocal();
      renderTable();
    });
    $("#btn-reset-filters").addEventListener("click", resetFilters);

    $$("th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (state.sort.key === key) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
        else {
          state.sort.key = key;
          state.sort.dir = key === "found_at" ? "desc" : "asc";
        }
        saveLocal();
        renderTable();
      });
    });

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
    loadLocal();
    await loadFileData();
    bind();
    renderPrefs();
    renderTable();
  }

  init();
})();
