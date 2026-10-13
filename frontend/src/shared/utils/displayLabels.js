import {REVIEWED_ZONE_NAMES, conciseZoneName} from "./zoneDisplayNames.js";
import officialZones from "../../../../data/raw/nmc/official_zones.csv?raw";

// Source descriptions only; quoted commas/newlines remain part of their CSV field.
function csvRows(text) {
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {if (quoted && text[i + 1] === '"') {field += '"'; i++;} else quoted = !quoted;}
    else if (c === ',' && !quoted) {row.push(field); field = "";}
    else if (c === '\n' && !quoted) {row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = "";}
    else field += c;
  }
  if (field || row.length) {row.push(field.replace(/\r$/, "")); rows.push(row);}
  return rows;
}
const rows = csvRows(officialZones), header = rows.shift() || [];
const names = new Map(rows.map(row => [row[header.indexOf("zone_id")], row[header.indexOf("official_description")]]));
export function zoneDisplay(zone, fallback = "Zone name not recorded") {
  const zone_id = typeof zone === "string" ? zone : zone?.zone_id || zone?.requested_zone_id;
  const official_description = names.get(zone_id) || (typeof zone === "object" && (zone?.official_description || zone?.zone_description)) || "";
  const display_name = REVIEWED_ZONE_NAMES[zone_id] || conciseZoneName(official_description, names.has(zone_id) ? {} : zone || {}) || fallback;
  return {display_name, official_description, zone_id};
}
export function zoneName(zone, fallback) {return zoneDisplay(zone, fallback).display_name;}
export function zoneDescription(zone, fallback = "Official description not recorded") {return zoneDisplay(zone).official_description || fallback;}
export function readableLabel(value, fallback = "Not recorded") {
  if (value == null || String(value).trim() === "") return fallback;
  return String(value).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
