"""Read-only pilot/manual/analytical reference resolution in one metric CRS."""
from __future__ import annotations

import csv
import hashlib
import json
import math
import sqlite3
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform, unary_union

from backend.core.data_paths import CATALOG, ROOT, dataset_path

METRIC_CRS = "EPSG:32643"
PILOT_COUNTS = {"NN_F_013": 10, "PAN_F_019": 10, "SAT_F_014": 35, "NR_F_003": 30}
TO_METRIC = Transformer.from_crs("EPSG:4326", METRIC_CRS, always_xy=True)
TO_WGS84 = Transformer.from_crs(METRIC_CRS, "EPSG:4326", always_xy=True)


def _records(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    result = {row["zone_id"]: row for row in rows}
    if len(result) != len(rows) or "" in result:
        raise ValueError(f"Invalid zone IDs in {Path(path).name}")
    return result


def saved_pilot_areas(database_path=None):
    """Require existing saved WGS84 layouts; never initialize operational data."""
    path = Path(database_path or dataset_path("database")).resolve()
    try:
        db = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
        areas = {}
        for zone_id, count in PILOT_COUNTS.items():
            row = db.execute("SELECT metadata_json FROM pilot_slot_layouts WHERE zone_id=?", (zone_id,)).fetchone()
            if row is None:
                raise ValueError(f"{zone_id}: saved pilot layout is missing")
            metadata = json.loads(row[0])
            if not metadata.get("georeferenced") or metadata.get("coordinate_system") != "EPSG:4326":
                raise ValueError(f"{zone_id}: saved pilot layout is not WGS84 geographic geometry")
            boundaries = metadata.get("boundaries", {}).get("features", [])
            polygons = [shape(feature["geometry"]) for feature in boundaries]
            if not polygons or any(g.is_empty or not g.is_valid or g.geom_type not in ("Polygon", "MultiPolygon") for g in polygons):
                raise ValueError(f"{zone_id}: saved vending boundary is missing or invalid")
            slots = db.execute("SELECT geometry_crs FROM pilot_slots WHERE zone_id=? AND is_deleted=0", (zone_id,)).fetchall()
            if len(slots) != count or any(s[0] != "EPSG:4326" for s in slots):
                raise ValueError(f"{zone_id}: expected {count} saved geographic slots, found {len(slots)}")
            area = unary_union([transform(TO_METRIC.transform, g) for g in polygons])
            if area.is_empty or not area.is_valid:
                raise ValueError(f"{zone_id}: saved boundary union is invalid")
            areas[zone_id] = (area, hashlib.sha256(json.dumps(metadata["boundaries"], sort_keys=True).encode()).hexdigest())
        return areas
    except sqlite3.Error as exc:
        raise ValueError(f"Saved pilot layout database unavailable: {exc}") from exc
    finally:
        if "db" in locals():
            db.close()


def resolve_zone_locations(database_path=None):
    """Return all official IDs with pilot > manual > original > missing priority."""
    official = _records(dataset_path("official_zones"))
    manual = _records(dataset_path("manual_points"))
    statuses = _records(dataset_path("manual_status"))
    baseline = _records(ROOT / CATALOG["baseline_datasets"]["zone_features"])
    if len(manual) != 142 or len(statuses) != 146 or not (manual.keys() | statuses.keys()) <= official.keys():
        raise ValueError("Manual mapping ID coverage is invalid")
    accepted = {z for z, row in statuses.items() if row["manual_coordinate_status"] == "USER_PINNED_UNVERIFIED"}
    if accepted != manual.keys():
        raise ValueError("Manual mapping status differs from supplied points")
    pilots = saved_pilot_areas(database_path)
    results = {}
    for zone_id, zone in official.items():
        status = statuses.get(zone_id, {})
        manual_status = status.get("manual_coordinate_status", "NOT_IN_MANUAL_CHECKLIST")
        point, provenance = None, ""
        source = "MISSING"
        if zone_id in pilots:
            area, provenance = pilots[zone_id]
            point = area.representative_point()
            if not area.covers(point):
                raise ValueError(f"{zone_id}: interior point is outside saved area")
            source = "PILOT_SAVED_PROVISIONAL"
        elif zone_id in manual:
            pin = manual[zone_id]
            lat, lon = float(pin["latitude"]), float(pin["longitude"])
            if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
                raise ValueError(f"{zone_id}: invalid manual coordinate")
            if zone["zone_type"] != "FREE" or pin.get("coordinate_status") != "USER_PINNED_UNVERIFIED" or pin["pin_number"] != status.get("pin_number"):
                raise ValueError(f"{zone_id}: manual mapping status/type mismatch")
            if (lat, lon) != (float(status["manual_latitude"]), float(status["manual_longitude"])):
                raise ValueError(f"{zone_id}: manual coordinates differ from status file")
            point = Point(*TO_METRIC.transform(lon, lat))
            source, provenance = "MANUAL_PROVISIONAL", pin.get("coordinate_source", "")
        else:
            original = baseline.get(zone_id, {})
            if original.get("geometry_usable_for_reference_model", "").lower() in ("true", "1", "yes"):
                try:
                    x, y = float(original["reference_point_easting"]), float(original["reference_point_northing"])
                    if math.isfinite(x) and math.isfinite(y):
                        point = Point(x, y)
                        source = "ORIGINAL_ANALYTICAL_FALLBACK_UNRESOLVED" if status else "ORIGINAL_ANALYTICAL"
                        provenance = "Preserved original analytical reference"
                except (KeyError, ValueError):
                    pass
        coordinates = list(TO_WGS84.transform(point.x, point.y)) if point is not None else None
        results[zone_id] = {"zone_id": zone_id, "division": zone["division"], "zone_type": zone["zone_type"],
            "coordinates": coordinates, "easting": point.x if point is not None else None,
            "northing": point.y if point is not None else None, "location_source": source,
            "manual_reference_status": manual_status, "source_provenance": provenance,
            "location_verified": False}
    return results
