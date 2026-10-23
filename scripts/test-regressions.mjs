#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
assert(existsSync(chrome), `Chrome not found: ${chrome}; set CHROME_BIN to a Chromium executable`);

const fare = (overrides = {}) => ({
  origin: "CAN",
  destination_country: "泰国",
  destination_city: "曼谷",
  destination_airport: "BKK",
  trip_type: "单程",
  depart_date: "2026-12-01",
  return_date: "",
  airline: "测试航空",
  stops: "直飞",
  price_cny: 420,
  notes: "",
  found_at: "2026-10-20T10:00:00+08:00",
  is_example: false,
  ...overrides,
});

const historyFixture = [
  fare({ id: 1 }),
  fare({ id: 2 }), // exact duplicate observation; dedupe before counting
  fare({ id: 3, depart_date: "2026-12-08", price_cny: 450, found_at: "2026-10-21T10:00:00+08:00" }),
  fare({ id: 4, is_example: true, price_cny: 100, depart_date: "2026-12-15", found_at: "2026-10-21T11:00:00+08:00" }),
  fare({ id: 5, trip_type: "往返", return_date: "2026-12-05", price_cny: 300 }),
  fare({ id: 6, price_cny: null, depart_date: "2026-12-02" }),
  fare({ id: 7, price_cny: 0, depart_date: "2026-12-03" }),
  fare({ id: 8, price_cny: -10, depart_date: "2026-12-04" }),
  fare({ id: 9, origin: "", depart_date: "2026-12-05" }),
  fare({ id: 10, destination_airport: "", destination_city: "曼谷", depart_date: "2026-12-06" }),
  fare({ id: 11, trip_type: "未知", depart_date: "2026-12-07" }),
  fare({ id: 12, depart_date: "2026-99-99" }),
  fare({ id: 13, trip_type: "往返", return_date: "2026-99-99", depart_date: "2026-12-09" }),
  fare({ id: 14, destination_country: "马来西亚", destination_city: "吉隆坡", destination_airport: "KUL", depart_date: "2026-12-16", price_cny: 350, found_at: "" }),
  fare({ id: 15, destination_country: "马来西亚", destination_city: "吉隆坡", destination_airport: "KUL", depart_date: "2026-12-16", price_cny: 350, found_at: "" }),
  fare({ id: 16, destination_country: "马来西亚", destination_city: "槟城", destination_airport: "PEN", depart_date: "2026-12-17", price_cny: 350, found_at: "2026-10-20T10:00:00+08:00" }),
  fare({ id: 17, destination_country: "马来西亚", destination_city: "槟城", destination_airport: "PEN", depart_date: "2026-12-17", price_cny: 350, found_at: "2026-10-20T02:00:00Z" }),
  fare({ id: 18, destination_country: "马来西亚", destination_city: "亚庇", destination_airport: "BKI", depart_date: "2026-12-18", price_cny: 350, found_at: "not-a-time" }),
  fare({ id: 19, destination_country: "马来西亚", destination_city: "亚庇", destination_airport: "BKI", depart_date: "2026-12-18", price_cny: 350, found_at: "invalid time" }),
];

const modalLocal = [
  fare({ id: 31, price_cny: 450, depart_date: "2026-12-10" }),
  fare({ id: 32, destination_country: "越南", destination_city: "胡志明", destination_airport: "SGN", price_cny: 700, depart_date: "2026-12-11" }),
  fare({ id: 33, is_example: true, price_cny: 300, depart_date: "2026-12-12", found_at: "2026-10-21T11:00:00+08:00" }),
];

const undoLocal = [
  fare({ id: 101, price_cny: 440, depart_date: "2026-12-20", airline: "本地 A" }),
  fare({ id: 102, price_cny: 470, depart_date: "2026-12-21", airline: "本地 B" }),
];

const retryLocal = [fare({ id: 201, price_cny: 460, depart_date: "2026-12-20", airline: "本地记录" })];
const retryFixture = [
  fare({ id: 301, price_cny: 430, depart_date: "2026-12-22", found_at: "2026-10-22T09:00:00+08:00" }),
  fare({ id: 302, destination_country: "越南", destination_city: "胡志明", destination_airport: "SGN", price_cny: 550, depart_date: "2026-12-23" }),
];
const layoutStressFares = [
  fare({
    id: 401,
    destination_country: "马来西亚",
    destination_city: "槟城港口区国际枢纽超长测试城市名称",
    destination_airport: "PEN",
    trip_type: "往返",
    depart_date: "2026-12-04",
    return_date: "2026-12-12",
    airline: "AnExtremelyLongAirlineNameForResponsiveLayoutTesting",
    stops: "经停两站（长文案测试）",
    notes: "仅用于窄屏排版压力测试，不含查票链接。",
  }),
  fare({
    id: 402,
    destination_country: "越南",
    destination_city: "胡志明市",
    destination_airport: "SGN",
    depart_date: "2026-12-08",
    price_cny: null,
    airline: "测试航空",
    notes: "仅用于缺价状态和无查票链接测试。",
  }),
  fare({
    id: 403,
    destination_country: "泰国",
    destination_city: "清迈",
    destination_airport: "CNX",
    depart_date: "2026-12-10",
    is_example: true,
    superseded_by: 401,
    notes: "用于示例与已取代徽标并存的压力测试。",
  }),
];

const scenarios = new Map([
  ["history", { fares: historyFixture, local: [], deal: "all" }],
  ["country-scroll", { fares: JSON.parse(readFileSync(join(root, "data/fares.json"), "utf8")).fares, local: [], deal: "all" }],
  ["layout-stress", { fares: layoutStressFares, local: [], deal: "all", showExamples: true }],
  ["modal", { fares: [], local: modalLocal, deal: "deal" }],
  ["undo", { fares: [], local: undoLocal, deal: "all" }],
  ["reset-undo", { fares: [], local: undoLocal, deal: "all" }],
  ["retry", { fares: retryFixture, local: retryLocal, deal: "all" }],
  ["visual", { fares: JSON.parse(readFileSync(join(root, "data/fares.json"), "utf8")).fares, local: [], deal: "deal" }],
  ["visual-modal", { fares: JSON.parse(readFileSync(join(root, "data/fares.json"), "utf8")).fares, local: [], deal: "deal" }],
]);
const retryRequests = new Map();

const bootScript = (name, scenario) => `
  window.__TEST_CASE = ${JSON.stringify(name)};
  window.__TEST_FIXTURE = ${JSON.stringify(scenario.fares)};
  const localFares = ${JSON.stringify(scenario.local)};
  if (localFares.length) localStorage.setItem("fare-tracker:local-fares", JSON.stringify({ next_id: 1000, fares: localFares }));
  localStorage.setItem("fare-tracker:ui", JSON.stringify({ uxVersion: 2, deal: ${JSON.stringify(scenario.deal)}, sort: { key: "price_cny", dir: "asc" }, showExamples: ${JSON.stringify(Boolean(scenario.showExamples))} }));
  const nativeFetch = window.fetch.bind(window);
  let fareRequests = 0;
  window.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (!url.pathname.endsWith("/data/fares.json")) return nativeFetch(input, init);
    fareRequests += 1;
    window.__fareRequestCount = fareRequests;
    if (window.__TEST_CASE === "retry" && fareRequests === 1) {
      return Promise.resolve(new Response("temporary failure", { status: 503 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ fares: window.__TEST_FIXTURE }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
  };
  const nativeMatchMedia = window.matchMedia.bind(window);
  let testWidth = window.innerWidth;
  const widthListeners = new Set();
  window.matchMedia = (query) => {
    if (query !== "(max-width: 760px)") return nativeMatchMedia(query);
    return {
      media: query,
      get matches() { return testWidth <= 760; },
      addEventListener(type, listener) { if (type === "change") widthListeners.add(listener); },
      removeEventListener(type, listener) { if (type === "change") widthListeners.delete(listener); }
    };
  };
  window.__setTestWidth = (width) => {
    const wasMobile = testWidth <= 760;
    testWidth = width;
    const isMobile = testWidth <= 760;
    if (wasMobile !== isMobile) for (const listener of widthListeners) listener({ matches: isMobile });
  };
`;

const probe = `
(async () => {
  const waitFor = async (fn, timeout = 3000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (fn()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("timed out waiting for UI state");
  };
  const click = (selector) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error("missing element: " + selector);
    el.click();
    return el;
  };
  const card = (id) => document.querySelector('#fare-cards .fare-card[data-id="' + id + '"]');
  const finish = (result) => {
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(result))));
    const pre = document.createElement("pre");
    pre.id = "test-result";
    pre.textContent = encoded;
    document.body.append(pre);
  };
  try {
    await waitFor(() => document.querySelector("#fare-cards") && !document.querySelector("#fare-cards .skeleton-card"));
    const result = {};
    if (window.__TEST_CASE === "history") {
      click('#filter-deal [data-deal="all"]');
      const cards = [...document.querySelectorAll("#fare-cards .fare-card")];
      result.duplicateVisible = cards.filter((el) => ["1", "2"].includes(el.dataset.id)).length;
      result.missingTimestampDuplicateVisible = cards.filter((el) => ["14", "15"].includes(el.dataset.id)).length;
      result.missingTimestampDuplicateTagged = Boolean(card(14)?.querySelector(".badge-best") || card(15)?.querySelector(".badge-best"));
      result.equivalentTimeDuplicateVisible = cards.filter((el) => ["16", "17"].includes(el.dataset.id)).length;
      result.equivalentTimeDuplicateTagged = Boolean(card(16)?.querySelector(".badge-best") || card(17)?.querySelector(".badge-best"));
      result.invalidTimestampDuplicateVisible = cards.filter((el) => ["18", "19"].includes(el.dataset.id)).length;
      result.invalidTimestampDuplicateTagged = Boolean(card(18)?.querySelector(".badge-best") || card(19)?.querySelector(".badge-best"));
      const winner = card(1) || card(2);
      winner.querySelector('[data-act="toggle"]').click();
      result.validComparison = winner.querySelector(".hist-hint")?.textContent || "";
      result.fullDate = winner.querySelector(".fare-meta-full")?.textContent || "";
      result.historyLabel = winner.querySelector(".fare-trend-label")?.textContent || "";
      result.roundTripTagged = Boolean(card(5)?.querySelector(".badge-best"));
      result.invalidPriceText = card(6)?.querySelector(".fare-price")?.textContent || "missing";
      result.invalidPriceBadge = Boolean(card(6)?.querySelector(".badge-best"));
      result.invalidFieldTagged = [9, 10, 11, 12, 13].some((id) => Boolean(card(id)?.querySelector(".badge-best")));
      click("#filters-more summary");
      await waitFor(() => document.querySelector("#filters-dialog").open);
      const examples = document.getElementById("filter-examples");
      examples.checked = true;
      examples.dispatchEvent(new Event("change", { bubbles: true }));
      click("#btn-apply-more");
      await waitFor(() => Boolean(card(4)));
      result.exampleBadges = [...card(4).querySelectorAll(".badge")].map((el) => el.textContent.trim());
    } else if (window.__TEST_CASE === "undo") {
      const first = card(101);
      first.querySelector('[data-act="toggle"]').click();
      first.querySelector('[data-act="del"]').click();
      result.undoVisibleAfterDelete = !document.getElementById("undo-toast").hidden;
      const second = card(102);
      second.querySelector('[data-act="toggle"]').click();
      second.querySelector('[data-act="edit"]').click();
      await waitFor(() => document.getElementById("modal").classList.contains("open"));
      const form = document.getElementById("fare-form");
      form.elements.price_cny.value = "480";
      form.requestSubmit();
      await waitFor(() => !document.getElementById("modal").classList.contains("open"));
      result.undoStillVisibleAfterEdit = !document.getElementById("undo-toast").hidden;
      document.querySelector("#undo-toast .toast-action").click();
      await waitFor(() => Boolean(card(101)));
      result.restoredA = Boolean(card(101));
      result.editedBPrice = card(102)?.querySelector(".fare-price")?.textContent || "missing";
      const stored = JSON.parse(localStorage.getItem("fare-tracker:local-fares"));
      result.persistedBPrice = stored.fares.find((item) => item.id === 102)?.price_cny;
    } else if (window.__TEST_CASE === "reset-undo") {
      const first = card(101);
      first.querySelector('[data-act="toggle"]').click();
      first.querySelector('[data-act="del"]').click();
      result.undoVisibleBeforeReset = !document.getElementById("undo-toast").hidden;
      window.confirm = () => true;
      click("#top-more summary");
      click("#btn-settings");
      await waitFor(() => document.getElementById("settings-modal").classList.contains("open"));
      click("#btn-reset-local");
      result.undoClearedByReset = document.getElementById("undo-toast").hidden && !document.querySelector("#undo-toast .toast-action");
      result.localStorageCleared = localStorage.getItem("fare-tracker:local-fares") === null;
    } else if (window.__TEST_CASE === "modal") {
      const more = document.getElementById("filters-more");
      const summary = more.querySelector("summary");
      const dialog = document.getElementById("filters-dialog");
      summary.click();
      await waitFor(() => dialog.open);
      result.nativeModal = dialog.matches(":modal");
      result.openFocusInDialog = dialog.contains(document.activeElement);
      document.getElementById("btn-theme").focus();
      result.backgroundInert = !dialog.contains(document.getElementById("btn-theme")) && dialog.contains(document.activeElement);
      result.panelInDialog = document.getElementById("filters-more-panel").parentElement === dialog;
      window.__setTestWidth(900);
      await new Promise((resolve) => setTimeout(resolve, 40));
      result.desktopPlacement = !dialog.open && document.getElementById("filters-more-panel").parentElement === more;
      result.desktopRetainsOpenState = more.open;
      result.desktopUnlocksScroll = !document.body.classList.contains("filters-modal-open");
      window.__setTestWidth(390);
      await waitFor(() => dialog.open);
      result.mobileReopensModal = dialog.matches(":modal") && document.getElementById("filters-more-panel").parentElement === dialog;
      window.__setTestWidth(900);
      window.__setTestWidth(390);
      await new Promise((resolve) => setTimeout(resolve, 40));
      result.rapidResizeRetainsModal = dialog.open && more.open && document.body.classList.contains("filters-modal-open");
      result.rapidResizePanelInDialog = document.getElementById("filters-more-panel").parentElement === dialog;
      let cancelEvent = null;
      dialog.addEventListener("cancel", (event) => { cancelEvent = event; }, { once: true });
      result.nativeCancelRequest = typeof dialog.requestClose === "function";
      if (result.nativeCancelRequest) dialog.requestClose();
      else dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
      await waitFor(() => !dialog.open && !more.open);
      result.cancelHandled = Boolean(cancelEvent?.defaultPrevented);
      result.cancelRestoresFocus = document.activeElement === summary;
      result.cancelUnlocksScroll = !document.body.classList.contains("filters-modal-open");

      // Unchecking only-normal after it was applied must mean all, not deals-only.
      summary.click(); await waitFor(() => dialog.open);
      const normal = document.getElementById("filter-normal");
      normal.checked = true; normal.dispatchEvent(new Event("change", { bubbles: true }));
      click("#btn-apply-more");
      await waitFor(() => !dialog.open);
      summary.click(); await waitFor(() => dialog.open);
      normal.checked = false; normal.dispatchEvent(new Event("change", { bubbles: true }));
      click("#btn-apply-more");
      await waitFor(() => !dialog.open);
      result.uncheckingNormalMeansAll = document.querySelector('#filter-deal [data-deal="all"]').getAttribute("aria-pressed") === "true";
      result.normalClearedCount = document.querySelectorAll("#fare-cards .fare-card").length;

      // Clear all means country and deal restrictions are removed; examples preference is retained.
      const thailand = document.querySelector('#filter-country [data-country="泰国"]');
      if (thailand) thailand.click();
      summary.click(); await waitFor(() => dialog.open);
      click("#btn-close-more");
      await waitFor(() => !dialog.open);
      const clearAll = document.querySelector('#active-filters [data-act="clear-all-filters"]');
       result.clearAllInActiveFilters = Boolean(clearAll);
       result.clearAllTouchHeight = Math.round(clearAll.getBoundingClientRect().height);
       clearAll.click();
       await waitFor(() => document.querySelector('#filter-country [data-country=""]').getAttribute("aria-pressed") === "true");
       result.clearAllClearsCountry = document.querySelector('#filter-country [data-country=""]').getAttribute("aria-pressed") === "true";
      result.clearAllMeansDealAll = document.querySelector('#filter-deal [data-deal="all"]').getAttribute("aria-pressed") === "true";
       result.clearAllRestoresFocus = document.activeElement === document.querySelector('#filter-deal [data-deal="all"]');

      summary.click(); await waitFor(() => dialog.open);
      const examples = document.getElementById("filter-examples");
      examples.checked = true; examples.dispatchEvent(new Event("change", { bubbles: true }));
      click("#btn-apply-more"); await waitFor(() => !dialog.open);
      const thailandForPanel = document.querySelector('#filter-country [data-country="泰国"]');
      if (thailandForPanel) thailandForPanel.click();
      summary.click(); await waitFor(() => dialog.open);
      document.getElementById("filter-max-price").value = "400";
      document.getElementById("filter-max-price").dispatchEvent(new Event("input", { bubbles: true }));
      click("#btn-clear-more");
      result.clearPanelPreservesExamples = document.getElementById("filter-examples").checked;
      click("#btn-apply-more"); await waitFor(() => !dialog.open);
      result.clearPanelLeavesExamplesVisible = Boolean(card(33));
      result.clearPanelRetainsCountry = document.querySelector('#filter-country [data-country="泰国"]').getAttribute("aria-pressed") === "true";
      result.clearPanelClearsMaxPrice = document.getElementById("filter-max-price").value === "";
    } else if (window.__TEST_CASE === "retry") {
      await waitFor(() => !document.getElementById("load-notice").hidden);
      click('#filter-country [data-country="泰国"]');
      result.beforeRetryHasLocal = document.querySelectorAll("#fare-cards .fare-card").length === 1;
      click('#load-notice [data-act="retry"]');
      await waitFor(() => document.getElementById("load-notice").hidden && Boolean(card(301)));
      const after = [...document.querySelectorAll("#fare-cards .fare-card")];
      result.retryNoticeCleared = document.getElementById("load-notice").hidden;
      result.countryFilterPreserved = after.length > 0 && after.every((el) => el.querySelector(".fare-route-sub").textContent.includes("泰国"));
      result.loadedRemoteFare = Boolean(card(301));
      result.requestCount = window.__fareRequestCount;
    } else if (window.__TEST_CASE === "country-scroll") {
      const box = document.getElementById("filter-country");
      const buttons = [...box.querySelectorAll("button[data-country]")];
      result.rowOverflows = box.scrollWidth > box.clientWidth + 1;
      result.keyboardStops = buttons.every((button) => button.tabIndex === 0);
      result.minimumTouchHeight = Math.min(...buttons.map((button) => Math.round(button.getBoundingClientRect().height)));
      result.scrollCueShown = box.classList.contains("has-overflow") && !box.classList.contains("at-end");
      const last = buttons.at(-1);
      last.focus({ preventScroll: true });
      last.click();
      await waitFor(() => {
        const selected = box.querySelector('button[aria-pressed="true"]');
        if (!selected) return false;
        const row = box.getBoundingClientRect();
        const chip = selected.getBoundingClientRect();
        return chip.left >= row.left && chip.right <= row.right && box.classList.contains("at-end");
      });
      const selected = box.querySelector('button[aria-pressed="true"]');
      const row = box.getBoundingClientRect();
      const chip = selected.getBoundingClientRect();
      result.selectedChipVisible = chip.left >= row.left && chip.right <= row.right;
      result.scrollCueHiddenAtEnd = box.classList.contains("at-end");
    } else if (window.__TEST_CASE === "layout-stress") {
      const cards = [...document.querySelectorAll("#fare-cards .fare-card")];
      result.documentWidth = document.documentElement.scrollWidth;
      result.cardWidthsFit = cards.every((item) => item.scrollWidth <= item.clientWidth + 1);
      result.longRouteFits = card(401).querySelector(".fare-route-title").scrollWidth <= card(401).querySelector(".fare-route-title").clientWidth + 1;
      result.longAirlineFits = card(401).querySelector(".fare-airline").scrollWidth <= card(401).querySelector(".fare-airline").clientWidth + 1;
      result.roundTripDateVisible = card(401).querySelector(".fare-date").textContent.includes("→");
      result.noLinkUsesStatus = Boolean(card(401).querySelector(".fare-cta-none")) && !card(401).querySelector("a.fare-cta");
      result.pendingPriceVisible = card(402).querySelector(".fare-price").textContent === "价格待确认";
      result.multipleBadgesVisible = card(403).querySelectorAll(".badge").length >= 2;
      result.actionMinHeight = Math.min(...cards.map((item) => item.querySelector(".fare-cta-col").getBoundingClientRect().height));
    } else if (window.__TEST_CASE === "visual" || window.__TEST_CASE === "visual-modal") {
      result.viewportWidth = window.innerWidth;
      result.documentWidth = document.documentElement.scrollWidth;
      result.appWidth = document.querySelector(".app").scrollWidth;
      const firstCard = document.querySelector("#fare-cards .fare-card");
      result.firstCardTop = Math.round(firstCard.getBoundingClientRect().top + window.scrollY);
      result.firstCardHeight = Math.round(firstCard.getBoundingClientRect().height);
      result.headerActionMinHeight = Math.min(...["#btn-add-inline", "#btn-reset-filters"].map((selector) =>
        document.querySelector(selector).getBoundingClientRect().height
      ));
      const countryRow = document.getElementById("filter-country");
      result.countryRowScrollWidth = countryRow.scrollWidth;
      result.countryRowClientWidth = countryRow.clientWidth;
      if (window.__TEST_CASE === "visual-modal") {
        click("#filters-more summary");
        await waitFor(() => document.getElementById("filters-dialog").open);
        result.modalOpen = document.getElementById("filters-dialog").matches(":modal");
      }
    }
    finish(result);
  } catch (error) {
    finish({ error: String(error && error.stack || error) });
  }
})();
`;

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === "/" || url.pathname === "/__viewport") {
    const name = url.searchParams.get("case") || "history";
    const scenario = scenarios.get(name);
    if (!scenario) {
      response.writeHead(400).end("Unknown test case");
      return;
    }
    response.setHeader("Set-Cookie", `fare-test=${name}; Path=/; SameSite=Lax`);
    const theme = url.searchParams.get("theme");
    if (url.pathname === "/__viewport") {
      const width = Math.max(320, Math.min(1440, Number(url.searchParams.get("width")) || 390));
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}iframe{display:block;border:0;width:${width}px;height:844px}#test-result{display:none}</style><iframe id="app" src="/?case=${encodeURIComponent(name)}&theme=${encodeURIComponent(theme || "dark")}"></iframe><pre id="test-result"></pre><script>(async()=>{const f=document.getElementById('app');for(let i=0;i<500;i++){try{const p=f.contentDocument.getElementById('test-result');if(p){document.getElementById('test-result').textContent=p.textContent;return}}catch{}await new Promise(r=>setTimeout(r,20))}})()</script>`);
      return;
    }
    const themePrelude = theme === "light" || theme === "dark"
      ? `<script>localStorage.setItem("fare-tracker:theme", ${JSON.stringify(theme)});</script>`
      : "";
    const pageSource = themePrelude ? indexHtml.replace("<head>", `<head>${themePrelude}`) : indexHtml;
    const boot = `<script>${bootScript(name, scenario)}</script>`;
    const testScript = `<script>${probe}</script>`;
    const html = pageSource.replace('<script src="./assets/app.js"></script>', `${boot}<script src="./assets/app.js"></script>${testScript}`);
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  if (url.pathname === "/data/fares.json") {
    const name = (request.headers.cookie || "").match(/(?:^|;\\s*)fare-test=([^;]+)/)?.[1] || "history";
    const scenario = scenarios.get(name) || scenarios.get("history");
    if (name === "retry") {
      const n = (retryRequests.get(name) || 0) + 1;
      retryRequests.set(name, n);
      if (n === 1) {
        response.writeHead(503).end("temporary outage");
        return;
      }
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ fares: scenario.fares }));
    return;
  }
  const relativePath = decodeURIComponent(url.pathname.slice(1));
  const target = resolve(root, relativePath);
  const rel = relative(root, target);
  if (rel.startsWith(`..${sep}`) || rel === ".." || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  const type = target.endsWith(".css") ? "text/css" : target.endsWith(".js") ? "text/javascript" : target.endsWith(".json") ? "application/json" : target.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
  response.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
  response.end(readFileSync(target));
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

async function runBrowser(url, windowWidth = 500, windowHeight = 950) {
  const profileDir = mkdtempSync(join(tmpdir(), "fare-tracker-test-"));
  assert(profileDir.startsWith(join(tmpdir(), "fare-tracker-test-")), "unexpected Chrome profile path");
  const absolute = resolve(profileDir);
  assert(absolute.startsWith(resolve(tmpdir()) + sep) && absolute.includes("fare-tracker-test-"), "refusing to use unexpected Chrome profile path");
  const args = [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    `--user-data-dir=${profileDir}`, `--window-size=${windowWidth},${windowHeight}`, "--virtual-time-budget=4500", "--dump-dom", url,
  ];
  try {
    const result = await new Promise((resolveResult, reject) => {
      const child = spawn(chrome, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => child.kill("SIGKILL"), 30000);
      child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("close", (code) => {
        clearTimeout(timeout);
        resolveResult({ code, stdout, stderr });
      });
    });
    assert.equal(result.code, 0, `Chrome failed: ${result.stderr}`);
    const encoded = result.stdout.match(/<pre id="test-result">([A-Za-z0-9+/=]*)<\/pre>/)?.[1];
    assert(encoded, `Browser probe did not finish. Output tail:\\n${result.stdout.slice(-2500)}\\n${result.stderr.slice(-1000)}`);
    const report = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    assert(!report.error, report.error);
    return report;
  } finally {
    rmSync(absolute, { recursive: true, force: true });
  }
}

async function captureScreenshot(url, windowWidth, windowHeight, outputPath) {
  const profileDir = mkdtempSync(join(tmpdir(), "fare-tracker-shot-test-"));
  const absolute = resolve(profileDir);
  assert(absolute.startsWith(resolve(tmpdir()) + sep) && absolute.includes("fare-tracker-shot-test-"), "refusing to use unexpected screenshot profile path");
  try {
    const result = await new Promise((resolveResult, reject) => {
      const child = spawn(chrome, [
        "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
        `--user-data-dir=${profileDir}`, `--window-size=${windowWidth},${windowHeight}`,
        "--virtual-time-budget=3000", `--screenshot=${outputPath}`, url,
      ], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      const timeout = setTimeout(() => child.kill("SIGKILL"), 30000);
      child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("close", (code) => { clearTimeout(timeout); resolveResult({ code, stderr }); });
    });
    assert.equal(result.code, 0, `Screenshot failed: ${result.stderr}`);
    assert(existsSync(outputPath), `Screenshot was not created: ${outputPath}`);
  } finally {
    rmSync(absolute, { recursive: true, force: true });
  }
}

try {
  const history = await runBrowser(`${baseUrl}/?case=history`);
  assert.equal(history.duplicateVisible, 1, "exact duplicate must be counted/rendered once");
  assert.equal(history.missingTimestampDuplicateVisible, 1, "missing timestamps must not be synthesized per normalization");
  assert.equal(history.missingTimestampDuplicateTagged, false, "one deduped record is not two history observations");
  assert.equal(history.equivalentTimeDuplicateVisible, 1, "equivalent timestamps with different offsets must dedupe");
  assert.equal(history.equivalentTimeDuplicateTagged, false);
  assert.equal(history.invalidTimestampDuplicateVisible, 1, "invalid timestamps must not mint separate identities");
  assert.equal(history.invalidTimestampDuplicateTagged, false);
  assert.match(history.validComparison, /2 条有效观测/, "only two valid observations should qualify");
  assert.match(history.fullDate, /2026年12月1日/, "detail must show the full year");
  assert.equal(history.historyLabel, "历史比较", "a minimum is not a price trend");
  assert.equal(history.roundTripTagged, false, "one round-trip observation must not receive a lowest label");
  assert.equal(history.invalidPriceText, "价格待确认", "invalid price must not render as zero");
  assert.equal(history.invalidPriceBadge, false);
  assert.equal(history.invalidFieldTagged, false, "missing/invalid route fields must not enter history comparisons");
  assert.deepEqual(history.exampleBadges, ["示例"], "examples must not receive a historical-low badge");
  console.log("PASS history validity, dedupe, examples, trip type, full-date copy");

  const undo = await runBrowser(`${baseUrl}/?case=undo`);
  assert.equal(undo.undoVisibleAfterDelete, true);
  assert.equal(undo.undoStillVisibleAfterEdit, true, "editing must not replace the pending delete undo");
  assert.equal(undo.restoredA, true);
  assert.equal(undo.editedBPrice, "¥480", "undo must not roll back another record's edit");
  assert.equal(undo.persistedBPrice, 480);
  console.log("PASS delete A → edit B → undo A without reverting B");

  const resetUndo = await runBrowser(`${baseUrl}/?case=reset-undo`);
  assert.equal(resetUndo.undoVisibleBeforeReset, true);
  assert.equal(resetUndo.undoClearedByReset, true, "clear-local must invalidate the pending undo action");
  assert.equal(resetUndo.localStorageCleared, true);
  console.log("PASS clearing local data invalidates pending delete undo");

  const modal = await runBrowser(`${baseUrl}/__viewport?case=modal&width=390`);
  for (const key of ["nativeModal", "backgroundInert", "openFocusInDialog", "panelInDialog", "desktopPlacement", "desktopRetainsOpenState", "desktopUnlocksScroll", "mobileReopensModal", "rapidResizeRetainsModal", "rapidResizePanelInDialog", "nativeCancelRequest", "cancelHandled", "cancelRestoresFocus", "cancelUnlocksScroll", "uncheckingNormalMeansAll", "clearAllInActiveFilters", "clearAllClearsCountry", "clearAllMeansDealAll", "clearAllRestoresFocus", "clearPanelPreservesExamples", "clearPanelLeavesExamplesVisible", "clearPanelRetainsCountry", "clearPanelClearsMaxPrice"]) {
    assert.equal(modal[key], true, `modal behavior failed: ${key}`);
  }
  assert.equal(modal.normalClearedCount, 2, "clearing only-normal should restore all non-example fares");
  assert(modal.clearAllTouchHeight >= 44, "active-filter clear action should be at least 44px high");
  console.log("PASS native modal, focus, background inertness, breakpoint moves, clear scopes");

  const countryScroll = await runBrowser(`${baseUrl}/__viewport?case=country-scroll&width=390`);
  assert.equal(countryScroll.rowOverflows, true, "country chips should use a single horizontal row at phone width");
  assert.equal(countryScroll.keyboardStops, true, "each country chip remains in the Tab order");
  assert.equal(countryScroll.scrollCueShown, true, "a right-edge cue should reveal horizontal overflow");
  assert.equal(countryScroll.selectedChipVisible, true, "selected country chip should be scrolled into view");
  assert.equal(countryScroll.scrollCueHiddenAtEnd, true, "the right-edge cue should hide at the end");
  assert(countryScroll.minimumTouchHeight >= 44, "country chip targets must remain at least 44px high");
  console.log("PASS horizontally scrollable country filters, keyboard access, and touch size");

  const layoutStress = await runBrowser(`${baseUrl}/__viewport?case=layout-stress&width=390`);
  assert.equal(layoutStress.documentWidth, 390, "stress content must not create horizontal page overflow");
  assert.equal(layoutStress.cardWidthsFit, true);
  assert.equal(layoutStress.longRouteFits, true);
  assert.equal(layoutStress.longAirlineFits, true);
  assert.equal(layoutStress.roundTripDateVisible, true);
  assert.equal(layoutStress.noLinkUsesStatus, true);
  assert.equal(layoutStress.pendingPriceVisible, true);
  assert.equal(layoutStress.multipleBadgesVisible, true);
  assert(layoutStress.actionMinHeight >= 44, "card action targets must remain at least 44px high");
  console.log("PASS long text, round trip, no-link, pending price, and stacked badges at 390px");

  const retry = await runBrowser(`${baseUrl}/?case=retry`);
  assert.equal(retry.beforeRetryHasLocal, true, "local records remain visible during remote failure");
  assert.equal(retry.retryNoticeCleared, true);
  assert.equal(retry.countryFilterPreserved, true, "retry must retain the selected country filter");
  assert.equal(retry.loadedRemoteFare, true);
  assert.equal(retry.requestCount, 2);
  console.log("PASS local data on remote failure and retry success preserves filters");

  const viewportChecks = [
    await runBrowser(`${baseUrl}/__viewport?case=visual&width=390&theme=dark`),
    await runBrowser(`${baseUrl}/?case=visual&theme=light`, 768, 1024),
    await runBrowser(`${baseUrl}/?case=visual&theme=dark`, 1440, 900),
  ];
  assert.deepEqual(viewportChecks.map((viewport) => viewport.viewportWidth), [390, 768, 1440]);
  for (const viewport of viewportChecks) {
    assert(viewport.documentWidth <= viewport.viewportWidth, `horizontal page overflow at ${viewport.viewportWidth}px: ${viewport.documentWidth}px`);
    assert(viewport.appWidth <= viewport.viewportWidth, `app overflow at ${viewport.viewportWidth}px: ${viewport.appWidth}px`);
  }
  assert(viewportChecks[0].firstCardTop <= 385, `first fare starts too low at ${viewportChecks[0].firstCardTop}px`);
  assert(viewportChecks[0].firstCardHeight >= 205 && viewportChecks[0].firstCardHeight <= 225, `mobile fare card outside 205–225px target: ${viewportChecks[0].firstCardHeight}px`);
  assert(viewportChecks[0].headerActionMinHeight >= 44, "mobile list-header controls should be at least 44px high");
  console.log(`PASS no overflow at 390/768/1440; mobile first card top=${viewportChecks[0].firstCardTop}px, height=${viewportChecks[0].firstCardHeight}px`);

  if (process.argv.includes("--screenshots")) {
    const outputDir = mkdtempSync(join(tmpdir(), "fare-tracker-visual-"));
    const shots = [
      { name: "390-dark", url: `${baseUrl}/__viewport?case=visual&width=390&theme=dark`, windowWidth: 500, windowHeight: 900 },
      { name: "390-light", url: `${baseUrl}/__viewport?case=visual&width=390&theme=light`, windowWidth: 500, windowHeight: 900 },
      { name: "390-filter-modal-dark", url: `${baseUrl}/__viewport?case=visual-modal&width=390&theme=dark`, windowWidth: 500, windowHeight: 900 },
      { name: "768-dark", url: `${baseUrl}/?case=visual&theme=dark`, windowWidth: 768, windowHeight: 1024 },
      { name: "768-light", url: `${baseUrl}/?case=visual&theme=light`, windowWidth: 768, windowHeight: 1024 },
      { name: "1440-dark", url: `${baseUrl}/?case=visual&theme=dark`, windowWidth: 1440, windowHeight: 900 },
      { name: "1440-light", url: `${baseUrl}/?case=visual&theme=light`, windowWidth: 1440, windowHeight: 900 },
    ];
    for (const shot of shots) {
      await captureScreenshot(shot.url, shot.windowWidth, shot.windowHeight, join(outputDir, `${shot.name}.png`));
    }
    console.log(`PASS six viewport/theme screenshots plus mobile filter modal: ${outputDir}`);
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
