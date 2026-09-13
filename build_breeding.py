#!/usr/bin/env python3
"""
Build the breeding-atlas data for the website.

The source files hold one point per occupied 10 x 10 km cell, with the cell
centroid in ETRS89 / LAEA Europe (EPSG:3035). Every species file re-encodes the
same grid, so storing polygons per species would duplicate the geometry hundreds
of times. Instead this script writes:

    breeding/grid.geojson             every distinct cell once, keyed by ETRS code
    breeding/sp/<Genus_species>.json  {ETRS code: breeding code} for one species
    breeding/index.json               manifest the website reads

The site fetches the grid once, then a few kilobytes per species.

Usage:
    pip install pyproj
    python3 build_breeding.py raw_breeding/*.geojson
"""

import json
import os
import sys

from pyproj import Transformer

CELL = 10000            # grid size in metres
SOURCE_CRS = "EPSG:3035"
OUT_DIR = "breeding"
SP_DIR = os.path.join(OUT_DIR, "sp")

to_wgs84 = Transformer.from_crs(SOURCE_CRS, "EPSG:4326", always_xy=True)


def square(x, y):
    """Closed WGS84 ring for the cell centred on (x, y)."""
    h = CELL / 2
    corners = [(x - h, y - h), (x + h, y - h), (x + h, y + h),
               (x - h, y + h), (x - h, y - h)]
    return [[round(lon, 5), round(lat, 5)]
            for lon, lat in (to_wgs84.transform(cx, cy) for cx, cy in corners)]


def read_species(path):
    """Return (species_name, {etrs: nid}, {etrs: (x, y)}) for one source file."""
    with open(path, encoding="utf-8") as fh:
        src = json.load(fh)

    names, codes, cells = set(), {}, {}

    for feat in src["features"]:
        p = feat["properties"]

        name = p.get("Sp_02") or p.get("species")
        if not name:
            raise SystemExit(f"{path}: no species name (expected 'Sp_02')")
        names.add(str(name).strip())

        etrs = p.get("ETRS")
        if etrs is None:
            raise SystemExit(f"{path}: a feature has no ETRS code")
        if "X" not in p or "Y" not in p:
            raise SystemExit(f"{path}: a feature has no X/Y centroid")

        codes[etrs] = p.get("Nid")
        cells[etrs] = (p["X"], p["Y"])

    if len(names) != 1:
        raise SystemExit(f"{path}: expected one species, found {sorted(names)}")

    return names.pop(), codes, cells


def main(paths):
    if not paths:
        raise SystemExit(__doc__)

    os.makedirs(SP_DIR, exist_ok=True)

    grid = {}        # etrs -> (x, y), accumulated across every species
    manifest = []
    conflicts = []

    for path in sorted(paths):
        name, codes, cells = read_species(path)

        for etrs, xy in cells.items():
            if etrs in grid and grid[etrs] != xy:
                conflicts.append((etrs, grid[etrs], xy))
            grid[etrs] = xy

        slug = name.replace(" ", "_")
        with open(os.path.join(SP_DIR, slug + ".json"), "w", encoding="utf-8") as fh:
            json.dump(codes, fh, ensure_ascii=False, separators=(",", ":"))

        tally = {}
        for nid in codes.values():
            tally[str(nid)] = tally.get(str(nid), 0) + 1

        manifest.append({
            "species": name,
            "file": slug + ".json",
            "squares": len(codes),
            "counts": tally,
        })

    if conflicts:
        raise SystemExit(
            f"{len(conflicts)} ETRS codes map to different coordinates in "
            f"different files, e.g. {conflicts[0]}. Fix the source data first."
        )

    features = [{
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [square(x, y)]},
        "properties": {"etrs": etrs},
    } for etrs, (x, y) in sorted(grid.items())]

    with open(os.path.join(OUT_DIR, "grid.geojson"), "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection", "features": features}, fh,
                  ensure_ascii=False, separators=(",", ":"))

    manifest.sort(key=lambda e: e["species"])
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, separators=(",", ":"))

    grid_kb = os.path.getsize(os.path.join(OUT_DIR, "grid.geojson")) / 1024
    sp_kb = sum(os.path.getsize(os.path.join(SP_DIR, e["file"]))
                for e in manifest) / 1024

    print(f"{len(manifest)} species, {len(grid)} distinct grid cells")
    print(f"  grid.geojson   {grid_kb:8.0f} KB  (fetched once)")
    print(f"  sp/*.json      {sp_kb:8.0f} KB total, "
          f"{sp_kb / len(manifest):.1f} KB average per species")


if __name__ == "__main__":
    main(sys.argv[1:])
