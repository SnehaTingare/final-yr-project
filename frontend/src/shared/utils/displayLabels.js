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
const rows = csvRows(officialZones.replace(/^\uFEFF/, "")), header = rows.shift() || [];
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

// Division membership comes from the official registry, never display geometry.
const zoneDivisions = new Map(rows.map(row => [row[header.indexOf("zone_id")], row[header.indexOf("division")]]));
export function officialZoneDivision(zone) {
  const id = String(typeof zone === "string" ? zone : zone?.zone_id || "").trim();
  const value = zoneDivisions.get(id) || (typeof zone === "object" ? zone?.division : "") || "";
  return String(value).trim().replace(/\s+/g, " ");
}

// Display-only locations never participate in recommendation or allocation rules.
const locationSources = import.meta.glob("../../../../data/processed/zone_map_display_coordinates*.csv", {query: "?raw", import: "default", eager: true});
const locationCsv = locationSources["../../../../data/processed/zone_map_display_coordinates.csv"] || locationSources["../../../../data/processed/zone_map_display_coordinates_v3_CANDIDATES.csv"] || "";
const locationRows = csvRows(locationCsv.replace(/^\uFEFF/, ""));
const locationHeader = (locationRows.shift() || []).map(value => value.trim());
const displayLocations = new Map(locationRows.map(row => {
  const record = Object.fromEntries(locationHeader.map((key, index) => [key, row[index] || ""]));
  return [record.zone_id?.trim(), record];
}));
function locationPair(lat, lng) {
  if (!String(lat ?? "").trim() || !String(lng ?? "").trim()) return null;
  const latitude = Number(lat), longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [longitude, latitude] : null;
}
export function zoneMapLocation(zone) {
  const record = displayLocations.get(typeof zone === "string" ? zone : zone?.zone_id);
  const coordinates = record && record.map_visibility !== "HIDE" ? locationPair(record.display_latitude, record.display_longitude) : null;
  const kind = record?.position_class === "PROVISIONAL_PILOT_FOOTPRINT" ? "pilot" : record?.position_class === "LANDMARK_REFERENCE" ? "landmark" : "approximate";
  const label = !coordinates ? "Location not verified" : kind === "pilot" ? "Provisional pilot location" : kind === "landmark" ? "Landmark candidate - site unverified" : "Approximate analytical reference - not a vending site";
  return {record, coordinates, kind, label};
}
export function zoneDisplayGeometry(zones, references = false) {
  return {type: "FeatureCollection", features: zones.flatMap(zone => {
    const location = zoneMapLocation(zone);
    const coordinates = references ? locationPair(location.record?.reference_latitude, location.record?.reference_longitude) : location.coordinates;
    return coordinates ? [{type: "Feature", properties: {zone_id: zone.zone_id}, geometry: {type: "Point", coordinates}}] : [];
  })};
}
