NASHIK FREE ZONE MAPPING – CODEX HANDOFF
========================================
Data prepared from user-uploaded Google My Maps CSV and numbered 146-zone checklist.

COUNTS
- 146 numbered FREE recommendation candidates.
- 144 raw My Maps pins, representing 143 distinct numbers.
- Pin #106 occurs twice with DIFFERENT coordinates. Both are excluded, not arbitrarily selected.
- Pins #1, #3 and #85 were not provided.
- Therefore 142 unambiguous manually placed points; four unresolved zones: 1, 3, 85, 106.
- ALL 308 official zone records remain untouched, including these four FREE zones.

NEW MAPPING FILES (01_new_manual_mapping)
- manual_mymaps_pins_CLEAN_142.csv: original Google My Maps format with conflicting #106 excluded.
- manual_free_zone_points_by_zone_id_142.csv: join by pin NUMBER to official ZONE ID, preferred implementation input.
- manual_free_zone_points_by_zone_id_142.geojson: Point feature collection (EPSG:4326) for map display.
- all_146_free_zones_mapping_status.csv: complete status, including missing/ambiguous pins.
- duplicate_pin_106_REVIEW.csv: both #106 candidate coordinates preserved for manual selection.

EXISTING REFERENCE FILES (02_existing_reference_datasets)
Many exist in older project repo (see below); copied here for a consistent handoff.
Contains historical vendor names/phone/address records. Restrict access; do not publish personal information.

IMPLEMENTATION SAFETY
1. Prefer user-placed positions for MAP DISPLAY. Their geographic precision is user-provided, NOT independently verified or official surveyed vending boundaries.
2. Preserve official zone_id/division/capacity/status, ALL 308 records, pilot slot layouts, and current approved allocations.
3. Do NOT overwrite analytical geometry or existing MCDA/K-Means features with these points. Audit and recompute location-sensitive GIS features separately.
4. Missing/ambiguous manual points do NOT automatically make zones legally ineligible. Apply established eligibility/capacity rules.
5. WKT and GeoJSON are longitude, latitude; CSV named columns are latitude, longitude.
6. Historical vendor associations are NOT live occupancy or confirmed allocations. Keep phone/residential fields private.
7. Do not assume this older attached project archive has teammates' most recent changes; inspect CURRENT Codex repo before writing code.

OLDER PROJECT ZIP CONTENTS CHECKED:
PRESENT: official_zones.csv (data/raw/nmc/), candidate_zone_snapshot.csv (data/processed/),
 zone_features.gpkg (data/processed/), official_zones_geometries.geojson (data/raw/nmc/),
 zone_vendor_evidence.csv (data/raw/nmc/).
NOT FOUND UNDER THOSE NAMES IN ZIP: vendors.csv, location_zone_crosswalk.csv,
 zone_map_display_coordinates_v3_CANDIDATES.csv, nashik_146_free_zones_numbered_mapping.csv,
 latest user My Maps manual CSV.

COPY TARGET
Put 01_new_manual_mapping files somewhere under project/data/processed/ as new named files.
Do not overwrite current input files until the audit has identified actual paths and consumers.
