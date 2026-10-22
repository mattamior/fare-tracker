#!/usr/bin/env node
/**
 * Record a Google Flights scan for one route/date.
 * Same latest price is a no-op; a changed price in either direction creates a
 * new observation and marks active prior observations as superseded. Empty
 * scanner output is inconclusive and never changes existing fare status.
 *
 * Usage: node scripts/record-scan-fare.mjs --scan /tmp/scan.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFare } from "./add-fare.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_FARES = path.join(ROOT, "data", "fares.json");
const SETTINGS_PATH = path.join(ROOT, "data", "settings.json");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value == null || value.startsWith("--")) args[key] = true;
    else {
      args[key] = value;
      i++;
    }
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function nextShanghaiIso(previousRecords) {
  let milliseconds = Date.now();
  for (const fare of previousRecords) {
    const previous = Date.parse(fare.found_at || "");
    if (Number.isFinite(previous) && previous >= milliseconds) milliseconds = previous + 1;
  }
  return new Date(milliseconds + 8 * 3600000).toISOString().replace("Z", "+08:00");
}

function normalizeOrigin(value) {
  return (Array.isArray(value) ? value : String(value || "").split(/[,/|+\\s]+/))
    .map((item) => String(item).trim().toUpperCase())
    .filter(Boolean)
    .sort();
}

function routeDateMatches(fare, candidate) {
  return normalizeOrigin(fare.origin).join(",") === normalizeOrigin(candidate.origin).join(",") &&
    String(fare.destination_airport || "").toUpperCase() === String(candidate.destination_airport || "").toUpperCase() &&
    fare.depart_date === candidate.depart_date &&
    fare.trip_type === "单程" &&
    !fare.is_example;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.scan) throw new Error("Missing required --scan <json-file>");
  const scanPath = path.resolve(String(args.scan));
  const faresPath = path.resolve(String(args.fares || DEFAULT_FARES));
  const scans = readJson(scanPath);
  if (!Array.isArray(scans)) throw new Error("Scanner output must be a JSON array");
  if (!scans.length) {
    console.log(JSON.stringify({ action: "no_result", message: "Empty scan; no fare status changed." }));
    return;
  }

  const valid = scans.filter((item) => Number.isFinite(Number(item.price_cny)) &&
    item.depart_date && item.origin && item.destination_airport &&
    typeof item.source_url === "string" && item.source_url.startsWith("https://") && item.depart_time);
  if (!valid.length) throw new Error("No scanner rows contain a verifiable price, date, departure time, and HTTPS source URL");
  const cheapest = [...valid].sort((a, b) => Number(a.price_cny) - Number(b.price_cny))[0];
  const data = readJson(faresPath);
  if (!Array.isArray(data.fares)) throw new Error("Invalid fares.json: fares must be an array");
  const settings = readJson(SETTINGS_PATH);
  const matching = data.fares.filter((fare) => routeDateMatches(fare, cheapest));
  const active = matching.filter((fare) => !fare.superseded_by);
  const latest = [...(active.length ? active : matching)].sort((a, b) => String(b.found_at || "").localeCompare(String(a.found_at || "")))[0];
  const latestPrice = latest ? Number(latest.price_cny) : null;
  if (latest && latestPrice === Number(cheapest.price_cny)) {
    console.log(JSON.stringify({ action: "unchanged", fare_id: latest.id, price_cny: latestPrice, message: "Latest observed price unchanged; no write." }));
    return;
  }

  const foundAt = nextShanghaiIso(matching);
  const queryTime = foundAt.slice(0, 16).replace("T", " ");
  const rawFare = {
    origin: cheapest.origin,
    destination_country: cheapest.destination_country,
    destination_city: cheapest.destination_city,
    destination_airport: cheapest.destination_airport,
    trip_type: cheapest.trip_type || "单程",
    depart_date: cheapest.depart_date,
    return_date: "",
    airline: cheapest.airline,
    stops: cheapest.stops || "直飞",
    price_cny: Number(cheapest.price_cny),
    found_at: foundAt,
    notes: `Google Flights 扫票 ${queryTime} ${cheapest.depart_time} 起飞 ${cheapest.duration || "时长未显示"}；价格含税，库存可能变动；来源 ${cheapest.source_url}`,
  };
  const id = Math.max(Number(data.next_id) || 1, ...data.fares.map((fare) => Number(fare.id || 0) + 1));
  const fare = buildFare({ json: rawFare }, settings, id);
  const supersededIds = [];
  for (const prior of active) {
    prior.superseded_by = id;
    prior.superseded_at = foundAt;
    supersededIds.push(prior.id);
  }
  data.fares.push(fare);
  data.next_id = id + 1;
  data.updated_at = foundAt;
  data.version = data.version || 1;

  const tempPath = `${faresPath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tempPath, faresPath);
  console.log(JSON.stringify({
    action: "added",
    fare_id: id,
    origin: fare.origin,
    destination_airport: fare.destination_airport,
    depart_date: fare.depart_date,
    previous_price_cny: latestPrice,
    price_cny: fare.price_cny,
    superseded_ids: supersededIds,
    found_at: fare.found_at,
    source_url: cheapest.source_url,
  }));
}

main();
