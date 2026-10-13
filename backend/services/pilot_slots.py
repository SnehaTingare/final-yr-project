"""Isolated research schematic; coordinates are local metres, never WGS84 slots."""
from __future__ import annotations

import csv
import json
import math
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pyproj import Geod
from shapely.geometry import Point, box, mapping, shape

import backend.geo.pilot_geometry as gis

from backend.repositories.database import ROOT, DATABASE_PATH, OFFICIAL_ZONES_PATH, connect, transaction, utc_now, OperationalConflictError, OperationalNotFoundError, OperationalValidationError

PILOT_ZONE_ID = "NN_F_013"
PILOT_ZONES = {PILOT_ZONE_ID: 10, **gis.IMPORTED_ZONE_CAPACITIES}
STATUSES = ("AVAILABLE", "RESERVED", "OCCUPIED", "BLOCKED")
SURVEY_POINTS = [
    {"id": "A", "latitude": 19.975052, "longitude": 73.771769},
    {"id": "B", "latitude": 19.973551, "longitude": 73.772989},
    {"id": "C", "latitude": 19.973372, "longitude": 73.773213},
]


def pilot_evidence(zone_id=PILOT_ZONE_ID):
    with OFFICIAL_ZONES_PATH.open(encoding="utf-8-sig", newline="") as source:
        records = [row for row in csv.DictReader(source)
                   if row["zone_id"] in ((zone_id, "NV_064", "NV_069") if zone_id == PILOT_ZONE_ID else (zone_id,))]
    path = ROOT / "data/raw/nmc/official_zones_geometries.geojson"
    features = []
    if path.exists():
        features = [f for f in json.loads(path.read_text(encoding="utf-8"))["features"]
                    if f["properties"].get("zone_id") in ((zone_id, "NV_064", "NV_069") if zone_id == PILOT_ZONE_ID else (zone_id,))]
    reference = next((f for f in features if f["properties"]["zone_id"] == zone_id), None)
    points = [dict(point) for point in SURVEY_POINTS] if zone_id == PILOT_ZONE_ID else []
    if reference and reference.get("geometry"):
        geometry = shape(reference["geometry"])
        center = geometry.centroid
        for point in points:
            point["inside_analytical_reference"] = geometry.covers(Point(point["longitude"], point["latitude"]))
            point["distance_to_reference_m"] = round(Geod(ellps="WGS84").inv(
                point["longitude"], point["latitude"], center.x, center.y)[2], 1)
    return {"official_records": records, "analytical_references": features,
            "survey_points": points, "spatial_match": "UNVERIFIED",
            "verified_boundary": None, "measured_usable_width": None,
            "warning": "Shared analytical references are not official boundaries. Survey point zone membership is unverified. The connecting line is survey context, not a measured vending strip."}


def generate_layout(*, width=2.0, depth=2.0, spacing=0.5, clearance=1.2, count=10, capacity=10):
    """Generate a single row of rectangles and a corridor in a local metric plane."""
    values = (width, depth, spacing, clearance)
    if any(not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v) for v in values):
        raise OperationalValidationError("Dimensions must be finite numbers")
    if width <= 0 or depth <= 0 or spacing < 0 or clearance <= 0:
        raise OperationalValidationError("Dimensions and clearance must be positive; spacing cannot be negative")
    if any(isinstance(v, bool) or not isinstance(v, int) for v in (count, capacity)) or not 1 <= count <= min(capacity, 10):
        raise OperationalValidationError("Slot count must be between 1 and the listed capacity, with a pilot maximum of 10")
    slots = []
    for index in range(count):
        x = index * (width + spacing)
        slots.append({"slot_id": f"S{index + 1:03d}", "zone_id": PILOT_ZONE_ID,
                      "width_m": width, "depth_m": depth, "x_m": x, "y_m": clearance,
                      "schematic_geometry": mapping(box(x, clearance, x + width, clearance + depth)),
                      "status": "AVAILABLE", "assigned_vendor_id": None,
                      "validation_state": "ILLUSTRATIVE_UNVERIFIED"})
    return {"zone_id": PILOT_ZONE_ID, "coordinate_system": "LOCAL_SCHEMATIC_METRES",
            "georeferenced": False, "validation_state": "ILLUSTRATIVE_UNVERIFIED",
            "width_m": width, "depth_m": depth, "spacing_m": spacing,
            "clearance_m": clearance, "length_m": count * width + (count - 1) * spacing,
            "orientation": "CONCEPTUAL", "slots": slots}


def initialize_demo(database_path=DATABASE_PATH, zone_id=PILOT_ZONE_ID):
    validate_zone(zone_id)
    if zone_id != PILOT_ZONE_ID:
        return initialize_imported(database_path, zone_id)
    evidence = pilot_evidence()
    official = next(r for r in evidence["official_records"] if r["zone_id"] == zone_id)
    layout = generate_layout(capacity=int(official["capacity"]), count=min(10, int(official["capacity"])))
    metadata = {k: v for k, v in layout.items() if k != "slots"}
    with transaction(database_path, immediate=True) as db:
        current = db.execute("SELECT metadata_json FROM pilot_slot_layouts WHERE zone_id = ?", (zone_id,)).fetchone()
        if current and json.loads(current[0]).get("georeferenced"):
            return get_layout(database_path, zone_id)
        db.execute("INSERT OR IGNORE INTO pilot_slot_layouts(zone_id, metadata_json, created_at) VALUES (?, ?, ?)",
                   (zone_id, json.dumps(metadata), utc_now()))
        for slot in layout["slots"]:
            db.execute("""INSERT OR IGNORE INTO pilot_slots
                (zone_id, slot_id, width_m, depth_m, x_m, y_m, geometry_json, status, validation_state, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', 'ILLUSTRATIVE_UNVERIFIED', ?)""",
                (zone_id, slot["slot_id"], slot["width_m"], slot["depth_m"], slot["x_m"],
                 slot["y_m"], json.dumps(slot["schematic_geometry"]), utc_now()))
    return get_layout(database_path, zone_id)


def _slot(row):
    result = dict(row)
    geometry = json.loads(result.pop("geometry_json"))
    if result.get("geometry_crs") == "EPSG:4326":
        result["geometry"] = geometry
        result["pose"] = gis.slot_pose(geometry)
        result["geometry_verification_status"] = "PROVISIONAL_NOT_SURVEYED"
        result["validation_state"] = "PROVISIONAL_NOT_SURVEYED"
    else:
        result["schematic_geometry"] = geometry
    return result


def get_layout(database_path=DATABASE_PATH, zone_id=PILOT_ZONE_ID):
    validate_zone(zone_id)
    db = connect(database_path)
    try:
        row = db.execute("SELECT * FROM pilot_slot_layouts WHERE zone_id = ?", (zone_id,)).fetchone()
        if not row:
            raise OperationalNotFoundError("Pilot has not been initialized by an administrator")
        layout = json.loads(row["metadata_json"])
        layout["slots"] = [_slot(r) for r in db.execute(
            "SELECT * FROM pilot_slots WHERE zone_id = ? AND is_deleted = 0 ORDER BY slot_id", (zone_id,))]
        layout["evidence"] = pilot_evidence(zone_id)
        if not layout.get("georeferenced"):
            layout["boundaries"] = gis.load_boundaries()
        layout.setdefault("revision", "LEGACY")
        layout.setdefault("operational_enabled", zone_id == PILOT_ZONE_ID)
        categories = {r["vendor_id"]: r["business_category"] for r in db.execute(
            "SELECT a.vendor_id,r.business_category FROM allocations a JOIN allocation_requests r ON r.request_id=a.request_id WHERE a.zone_id=? AND a.status='ACTIVE' AND r.status='APPROVED' AND r.vendor_id=a.vendor_id AND r.zone_id=a.zone_id", (zone_id,))}
        for slot in layout["slots"]:
            slot["public_business_category"] = categories.get(slot["assigned_vendor_id"])
        official = next((r for r in layout["evidence"]["official_records"] if r["zone_id"] == zone_id), {})
        layout["summary"] = {"listed_capacity": int(float(official["capacity"])) if official.get("capacity") else None,
            "mapped_slots": len(layout["slots"]), "occupied_slots": sum(s["status"] == "OCCUPIED" for s in layout["slots"]),
            "reserved_slots": sum(s["status"] == "RESERVED" for s in layout["slots"]),
            "available_slots": sum(s["status"] == "AVAILABLE" for s in layout["slots"])}
        layout["pilot_zones"] = [{"zone_id": z, "mapped_capacity": capacity} for z,capacity in PILOT_ZONES.items()]
        return layout
    finally:
        db.close()


def update_slot(slot_id, status, vendor_id, *, actor, expected_updated_at, database_path=DATABASE_PATH, zone_id=PILOT_ZONE_ID):
    validate_zone(zone_id)
    if zone_id != PILOT_ZONE_ID and (vendor_id or status in ("RESERVED", "OCCUPIED")) and not get_layout(database_path, zone_id).get("operational_enabled"):
        raise OperationalValidationError("Administrator review and activation are required before assignment or occupancy")
    if status not in STATUSES:
        raise OperationalValidationError("Unknown slot status")
    if vendor_id is not None and (not vendor_id.strip() or status not in ("RESERVED", "OCCUPIED")):
        raise OperationalValidationError("Vendor assignment requires RESERVED or OCCUPIED status")
    try:
        with transaction(database_path, immediate=True) as db:
            current = db.execute("SELECT * FROM pilot_slots WHERE zone_id = ? AND slot_id = ?",
                                 (zone_id, slot_id)).fetchone()
            if not current or current["is_deleted"]:
                raise OperationalNotFoundError("Unknown pilot slot")
            if current["updated_at"] != expected_updated_at:
                raise OperationalConflictError("Slot changed since it was loaded. Refresh before saving.")
            if current["assigned_vendor_id"] and vendor_id and current["assigned_vendor_id"] != vendor_id:
                raise OperationalConflictError("Release the current demo assignment before assigning another vendor")
            if vendor_id:
                if not current["assigned_vendor_id"] and current["status"] != "AVAILABLE":
                    raise OperationalConflictError("A new vendor assignment requires an AVAILABLE slot")
                approved = db.execute("""SELECT a.allocation_id FROM allocations a
                    JOIN allocation_requests r ON r.request_id = a.request_id
                    WHERE a.vendor_id = ? AND a.zone_id = ? AND a.status = 'ACTIVE'
                    AND r.status = 'APPROVED' AND r.vendor_id = a.vendor_id AND r.zone_id = a.zone_id""",
                    (vendor_id, zone_id)).fetchone()
                if not approved:
                    raise OperationalValidationError("Vendor needs a current approved allocation for the pilot zone")
            timestamp = datetime.now(timezone.utc).isoformat(timespec="microseconds")
            db.execute("""UPDATE pilot_slots SET status = ?, assigned_vendor_id = ?, updated_at = ?
                WHERE zone_id = ? AND slot_id = ?""", (status, vendor_id, timestamp, zone_id, slot_id))
            db.execute("""INSERT INTO pilot_slot_events(zone_id, slot_id, actor, before_json, after_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)""", (zone_id, slot_id, actor, json.dumps(dict(current)),
                json.dumps({"status": status, "assigned_vendor_id": vendor_id}), timestamp))
    except sqlite3.IntegrityError as exc:
        raise OperationalConflictError("Vendor already has an active demonstration slot") from exc
    return next(s for s in get_layout(database_path, zone_id)["slots"] if s["slot_id"] == slot_id)


def preview_geographic(config=None, database_path=DATABASE_PATH, obstructions=None, zone_id=PILOT_ZONE_ID):
    current = get_layout(database_path, zone_id)
    if zone_id != PILOT_ZONE_ID:
        preview = json.loads(json.dumps(current))
        preview["expected_revision"] = current["revision"]
        preview["expected_versions"] = {s["slot_id"]: s["updated_at"] for s in current["slots"]}
        return preview
    preview = gis.generate_geographic(config, obstructions=current.get("obstructions", []) if obstructions is None else obstructions)
    preview["expected_revision"] = current["revision"]
    preview["expected_versions"] = {s["slot_id"]: s["updated_at"] for s in current["slots"]}
    preview["access_points"] = current.get("access_points", {})
    preview["protected_slot_ids"] = [s["slot_id"] for s in current["slots"]
                                      if s["assigned_vendor_id"] or s["status"] == "OCCUPIED"]
    return preview


def save_geographic(proposal, *, actor, review_confirmed, database_path=DATABASE_PATH, zone_id=PILOT_ZONE_ID):
    validate_zone(zone_id)
    if proposal.get("zone_id", PILOT_ZONE_ID) != zone_id:
        raise OperationalValidationError("Layout belongs to a different pilot zone")
    if not review_confirmed:
        raise OperationalValidationError("Review the provisional preview and explicitly confirm before saving")
    boundaries = gis.boundaries_for_zone(zone_id)
    if proposal.get("source_sha256") != boundaries["source_sha256"]:
        raise OperationalConflictError("Boundary source changed. Generate a fresh preview")
    validation = gis.validate_layout(proposal, boundaries)
    if not validation["valid"]:
        raise OperationalValidationError(validation.get("reason", "Geometry review failed"))
    access_points = proposal.get("access_points", {})
    for identifier, access in access_points.items():
        if identifier not in {f["properties"]["boundary_id"] for f in boundaries["features"]}:
            raise OperationalValidationError("Unknown access-point boundary")
        gis.pose_geometry(access["longitude"], access["latitude"], 0)
        parent = next(f for f in boundaries["features"] if f["properties"]["boundary_id"] == identifier)
        if gis.metric(parent["geometry"]).distance(gis.metric(mapping(Point(access["longitude"], access["latitude"])))) > 30:
            raise OperationalValidationError("Access point must be within 30 m of its boundary")
        if not isinstance(access.get("observed"), bool) or not isinstance(access.get("note", ""), str) or len(access.get("note", "")) > 300:
            raise OperationalValidationError("Access point requires an observation flag and a short approach note")
    with transaction(database_path, immediate=True) as db:
        row = db.execute("SELECT metadata_json FROM pilot_slot_layouts WHERE zone_id = ?", (zone_id,)).fetchone()
        if not row:
            raise OperationalNotFoundError("Initialize the pilot first")
        current_metadata = json.loads(row[0])
        if proposal.get("expected_revision") != current_metadata.get("revision", "LEGACY"):
            raise OperationalConflictError("Layout changed. Reload before saving")
        current = {s["slot_id"]: s for s in db.execute(
            "SELECT * FROM pilot_slots WHERE zone_id = ? AND is_deleted = 0", (zone_id,))}
        versions = proposal.get("expected_versions", {})
        if set(versions) != set(current) or any(versions[k] != s["updated_at"] for k, s in current.items()):
            raise OperationalConflictError("Slot status or geometry changed. Reload before saving")
        proposals = {s["slot_id"]: s for s in proposal["slots"]}
        for sid, old in current.items():
            new = proposals.get(sid)
            unchanged = new and old["geometry_crs"] == "EPSG:4326" and old["parent_boundary_id"] == new["parent_boundary_id"] and gis.metric(
                json.loads(old["geometry_json"])).hausdorff_distance(gis.metric(new["geometry"])) < .00001
            if (old["assigned_vendor_id"] or old["status"] == "OCCUPIED") and not unchanged:
                raise OperationalConflictError(f"{sid} is assigned or occupied. Explicitly release its demo assignment/status before moving, deleting or regenerating it")
        timestamp = datetime.now(timezone.utc).isoformat(timespec="microseconds")
        for sid, old in current.items():
            if sid not in proposals:
                db.execute("UPDATE pilot_slots SET is_deleted = 1, updated_at = ? WHERE zone_id = ? AND slot_id = ?",
                           (timestamp, zone_id, sid))
                db.execute("INSERT INTO pilot_slot_events(zone_id,slot_id,actor,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)",
                           (zone_id, sid, actor, json.dumps(dict(old)), json.dumps({"is_deleted": True}), timestamp))
        for sid, slot in proposals.items():
            pose = gis.slot_pose(slot["geometry"])
            old = current.get(sid)
            db.execute("""INSERT INTO pilot_slots(zone_id,slot_id,width_m,depth_m,x_m,y_m,geometry_json,status,
                assigned_vendor_id,validation_state,updated_at,parent_boundary_id,geometry_crs,is_deleted)
                VALUES(?,?,?,?,?,?,?, ?,?, 'ILLUSTRATIVE_UNVERIFIED',?,?,'EPSG:4326',0)
                ON CONFLICT(zone_id,slot_id) DO UPDATE SET geometry_json=excluded.geometry_json,
                x_m=excluded.x_m,y_m=excluded.y_m,width_m=excluded.width_m,depth_m=excluded.depth_m,parent_boundary_id=excluded.parent_boundary_id,
                geometry_crs='EPSG:4326',is_deleted=0,updated_at=excluded.updated_at""",
                (zone_id, sid, slot.get("width_m", 2), slot.get("depth_m", 2), *gis.TO_METRIC.transform(pose["longitude"], pose["latitude"]),
                 json.dumps(slot["geometry"]), old["status"] if old else "AVAILABLE",
                 old["assigned_vendor_id"] if old else None, timestamp, slot["parent_boundary_id"]))
            db.execute("INSERT INTO pilot_slot_events(zone_id,slot_id,actor,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)",
                (zone_id, sid, actor, json.dumps(dict(old)) if old else "{}",
                 json.dumps({"geometry": slot["geometry"], "parent_boundary_id": slot["parent_boundary_id"]}), timestamp))
        metadata = {key: proposal.get(key) for key in ("config", "corridors", "obstructions", "rejections")}
        metadata.update({"zone_id": zone_id, "georeferenced": True, "coordinate_system": "EPSG:4326",
            "metric_crs": "EPSG:32643", "geometry_verification_status": "PROVISIONAL_NOT_SURVEYED",
            "source_sha256": boundaries["source_sha256"], "boundaries": boundaries, "access_points": access_points,
            "validation": validation, "revision": uuid.uuid4().hex,
            "width_m": proposal.get("width_m", 2), "depth_m": proposal.get("depth_m", 2), "spacing_m": proposal["config"]["spacing_m"],
            "clearance_m": proposal["config"]["clearance_m"]})
        if zone_id != PILOT_ZONE_ID:
            metadata.update({key: current_metadata.get(key) for key in ("source_provenance", "source_slot_properties", "pedestrian_clearance_assumptions", "zone_display_name", "dimension_spacing_by_boundary")})
            metadata["operational_enabled"] = True
            metadata["reviewed_by"] = actor
            metadata["reviewed_at"] = timestamp
        db.execute("UPDATE pilot_slot_layouts SET metadata_json = ? WHERE zone_id = ?", (json.dumps(metadata), zone_id))
    return get_layout(database_path, zone_id)


def preview_edit(proposal, poses=None, database_path=DATABASE_PATH, zone_id=PILOT_ZONE_ID):
    if proposal.get("zone_id", PILOT_ZONE_ID) != zone_id:
        raise OperationalValidationError("Layout belongs to a different pilot zone")
    obstruction = proposal.pop("obstruction_request", None)
    if obstruction:
        note = obstruction.get("note", "")
        if not isinstance(note, str) or len(note) > 300:
            raise OperationalValidationError("Obstruction note must be at most 300 characters")
        proposal.setdefault("obstructions", []).append({"geometry": gis.obstruction_geometry(
            obstruction["longitude"], obstruction["latitude"], obstruction.get("radius_m", .5)),
            "note": note, "provenance": "ADMIN_RECORDED_OBSERVATION"})
    for slot in proposal["slots"]:
        if slot["slot_id"] in (poses or {}):
            slot["geometry"] = gis.pose_geometry(**poses[slot["slot_id"]], width_m=slot.get("width_m", 2), depth_m=slot.get("depth_m", 2))
            slot["pose"] = gis.slot_pose(slot["geometry"])
    try:
        proposal["validation"] = gis.validate_layout(proposal)
    except OperationalValidationError as exc:
        if not obstruction:
            raise
        # An observation can invalidate the existing draft. Keep the observation
        # for explicit regeneration, but saving remains strictly prohibited.
        proposal["validation"] = {"valid": False, "reason": str(exc)}
    return proposal


def validate_zone(zone_id):
    if zone_id not in PILOT_ZONES:
        raise OperationalValidationError("Unknown pilot zone")


def initialize_imported(database_path, zone_id):
    layout = gis.imported_layout(zone_id)
    layout["validation"] = gis.validate_layout(layout)
    metadata = {k:v for k,v in layout.items() if k != "slots"}
    metadata["source_slot_properties"] = {s["slot_id"]: s["source_properties"] for s in layout["slots"]}
    metadata["revision"] = uuid.uuid4().hex
    with transaction(database_path, immediate=True) as db:
        exists = db.execute("SELECT 1 FROM pilot_slot_layouts WHERE zone_id=?", (zone_id,)).fetchone()
        if not exists:
            timestamp = utc_now()
            db.execute("INSERT INTO pilot_slot_layouts(zone_id,metadata_json,created_at) VALUES(?,?,?)", (zone_id,json.dumps(metadata),timestamp))
            for slot in layout["slots"]:
                pose = gis.slot_pose(slot["geometry"])
                x,y = gis.TO_METRIC.transform(pose["longitude"],pose["latitude"])
                db.execute("""INSERT INTO pilot_slots(zone_id,slot_id,width_m,depth_m,x_m,y_m,geometry_json,status,
                    assigned_vendor_id,validation_state,updated_at,parent_boundary_id,geometry_crs,is_deleted)
                    VALUES(?,?,?,?,?,?,?,'AVAILABLE',NULL,'ILLUSTRATIVE_UNVERIFIED',?,?,'EPSG:4326',0)""",
                    (zone_id,slot["slot_id"],slot["width_m"],slot["depth_m"],x,y,json.dumps(slot["geometry"]),timestamp,slot["parent_boundary_id"]))
    return get_layout(database_path,zone_id)
