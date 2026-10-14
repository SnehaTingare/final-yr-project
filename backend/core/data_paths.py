"""Canonical repository-relative dataset paths and legacy-path resolution."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = ROOT / "data"
CATALOG = json.loads((DATA_ROOT / "catalog.json").read_text(encoding="utf-8"))
RAW_NMC_DIR = DATA_ROOT / "raw/nmc"
RAW_OSM_DIR = DATA_ROOT / "raw/osm"
PROCESSED_DIR = DATA_ROOT / "processed"


def dataset_path(name):
    return ROOT / CATALOG["datasets"][name]


def resolve_dataset_path(path):
    """Resolve documented legacy paths; never duplicate or mutate a dataset."""
    target = Path(path)
    if target.is_absolute():
        try:
            relative = target.relative_to(ROOT).as_posix()
        except ValueError:
            return target
    else:
        relative = target.as_posix()
    if relative in CATALOG["legacy_paths"]:
        return ROOT / CATALOG["legacy_paths"][relative]
    for old, new in (("data/model_outputs/", "data/model/"),):
        if relative.startswith(old):
            return ROOT / (new + relative[len(old):])
    return ROOT / relative


def model_version_path(version):
    """Validate one version component; outputs never overwrite the baseline."""
    import re
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", version):
        raise ValueError("Invalid model version")
    return DATA_ROOT / "model/versions" / version
