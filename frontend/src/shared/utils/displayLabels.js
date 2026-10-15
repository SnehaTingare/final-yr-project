import {REVIEWED_ZONE_NAMES, conciseZoneName} from "./zoneDisplayNames.js";
import catalog from "../../../../data/catalog.json";
// Exact public allowlist: never glob raw vendor records or archive contents.
const publicSources = import.meta.glob([
  "../../../../data/raw/nmc/official_zones.csv",
  "../../../../data/gis/display/zone_map_display_coordinates.csv",
  "../../../../data/gis/manual/manual_free_zone_points_by_zone_id_142.csv",
  "../../../../data/gis/manual/all_146_free_zones_mapping_status.csv",
  "../../../../data/gis/illustrative/nmc_six_divisions_ILLUSTRATIVE.geojson",
], {query: "?raw", import: "default", eager: true});
function datasetText(name) {
  const text = publicSources["../../../../" + catalog.datasets[name]];
  if (text == null) throw new Error(`Required public dataset unavailable: ${name}`);
  return text;
}
const officialZones = datasetText("official_zones");
export const illustrativeDivisions = JSON.parse(datasetText("illustrative_divisions"));

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
const locationCsv = datasetText("display_candidates");
const locationRows = csvRows(locationCsv.replace(/^\uFEFF/, ""));
const locationHeader = (locationRows.shift() || []).map(value => value.trim());
const displayLocations = new Map(locationRows.map(row => {
  const record = Object.fromEntries(locationHeader.map((key, index) => [key, row[index] || ""]));
  return [record.zone_id?.trim(), record];
}));
function recordIndex(text) {
  const parsed = csvRows((text || "").replace(/^\uFEFF/, "")), columns = parsed.shift() || [];
  return new Map(parsed.map(row => {const record = Object.fromEntries(columns.map((key, i) => [key, row[i] || ""])); return [record.zone_id, record];}));
}
const manualPoints = recordIndex(datasetText("manual_points"));
const manualStatuses = recordIndex(datasetText("manual_status"));
function locationPair(lat, lng) {
  if (!String(lat ?? "").trim() || !String(lng ?? "").trim()) return null;
  const latitude = Number(lat), longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [longitude, latitude] : null;
}
export function zoneMapLocation(zone) {
  const id = typeof zone === "string" ? zone : zone?.zone_id;
  const resolved = typeof zone === "object" ? zone?.resolved_location : null;
  if (resolved) {
    const source = resolved.location_source;
    const kind = source === "PILOT_SAVED_PROVISIONAL" ? "pilot" : source === "MANUAL_PROVISIONAL" ? "manual" : "approximate";
    const label = !resolved.coordinates ? "Location not verified" : kind === "pilot" ? "Saved provisional pilot area" : kind === "manual" ? "Manually mapped reference - not independently verified" : "Unverified analytical fallback - not a confirmed vending site";
    return {coordinates: resolved.coordinates, kind, label, record: {...displayLocations.get(id), confidence: source, location_note: label}};
  }
  if (catalog.datasets.mcda_configuration && ["NN_F_013", "PAN_F_019", "SAT_F_014", "NR_F_003"].includes(id)) {
    return {coordinates:null, kind:"pilot", label:"Saved pilot reference requires current layout data", record:displayLocations.get(id)};
  }
  const previous = displayLocations.get(id), manual = manualPoints.get(id), status = manualStatuses.get(id);
  const accepted = manual && manual.coordinate_status === "USER_PINNED_UNVERIFIED" && status?.manual_coordinate_status === "USER_PINNED_UNVERIFIED" && manual.pin_number === status.pin_number;
  const record = accepted ? {...previous, display_latitude: manual.latitude, display_longitude: manual.longitude,
    display_status: manual.coordinate_status, position_class: "MANUAL_ZONE_REFERENCE", confidence: manual.coordinate_status,
    map_visibility: "SHOW_CANDIDATE", source_label: manual.coordinate_source, location_note: manual.notes}
    : status ? {...previous, display_latitude: "", display_longitude: "", map_visibility: "HIDE", display_status: status.manual_coordinate_status, location_note: status.review_note} : previous;
  const coordinates = record && record.map_visibility !== "HIDE" ? locationPair(record.display_latitude, record.display_longitude) : null;
  const kind = accepted ? "manual" : record?.position_class === "PROVISIONAL_PILOT_FOOTPRINT" ? "pilot" : record?.position_class === "LANDMARK_REFERENCE" ? "landmark" : "approximate";
  const label = !coordinates ? "Location not verified" : kind === "manual" ? "Manually mapped reference - not independently verified" : kind === "pilot" ? "Provisional pilot location" : kind === "landmark" ? "Landmark candidate - site unverified" : "Approximate analytical reference - not a vending site";
  return {record, coordinates, kind, label};
}
export function zoneDisplayGeometry(zones, references = false) {
  return {type: "FeatureCollection", features: zones.flatMap(zone => {
    const location = zoneMapLocation(zone);
    const coordinates = references ? locationPair(location.record?.reference_latitude, location.record?.reference_longitude) : location.coordinates;
    return coordinates ? [{type: "Feature", properties: {zone_id: zone.zone_id}, geometry: {type: "Point", coordinates}}] : [];
  })};
}
