# Historical Atlas of Bird Specimens in Portuguese Museum Collections

A three-tab site presenting 3,457 georeferenced bird specimen records from
MCUC, MHNCUP and MUHNAC, collected between 1840 and 1980, built with [Leaflet](https://leafletjs.com/).
Static HTML/CSS/JS with no build step — it runs as-is on GitHub Pages.

## Tabs

**Map** — every record drawn individually (no clustering), coloured by museum.
Filter by museum, order, family, genus and species; the taxonomic dropdowns
cascade, so choosing an order narrows the families below it and so on. A year
slider covers 1840–1980. The extent button in the top-left corner fits the view
to whatever records currently pass the filters.

The map opens on mainland Portugal. Records from Madeira, the Azores and the
Selvagens lie far to the west, so fitting everything on load would squeeze the
mainland into a corner; the extent button brings them in on demand.

**Records** — the same data as a sortable table. Click any column header to
sort, search across species, locality, county and museum, page through results,
and download the current selection as CSV (including coordinates).

**Breeding atlas** — a per-species comparison between the recent breeding atlas
and the historical collections. Pick a species and the map draws its 10 × 10 km
breeding grid squares, shaded by breeding evidence, with the historical museum
specimens for the same species on top. Either layer can be switched off.

The grid squares sit in their own Leaflet pane below the point layer, so the
specimens are never hidden behind a filled square.

**Team & acknowledgements** — project description, participating collections,
team, acknowledgements and citation. The placeholder blocks are marked in the
HTML with `class="placeholder-note"` and `class="fill-in"`; replace those and
delete the notes.

## How the breeding atlas data is organised

The source files hold one point per occupied 10 x 10 km cell, with the centroid
in ETRS89 / LAEA Europe (EPSG:3035). Every species file re-encodes the same
grid, so storing polygons per species would duplicate the geometry 243 times.
Measured on the real data, geometry costs about 217 bytes per square while the
species-specific part costs 13 — roughly 94% of a naive per-species file is
redundant.

So the build splits the two apart:

| Output | Size | Fetched |
| --- | --- | --- |
| `breeding/grid.geojson` | 213 KB | once, then reused for every species |
| `breeding/sp/<Genus_species>.json` | 3.7 KB average | one per species viewed |
| `breeding/index.json` | 20 KB | once |

That is about 1.1 MB in the repository. Writing polygons per species would have
been 15.5 MB, and a single combined GeoJSON would have forced every visitor to
download all 15.5 MB to look at one species.

Each species file is simply `{"ETRS code": breeding code}`. The site fetches the
grid once, then builds the squares for the selected species from it in the
browser.

## Rebuilding the breeding atlas

Put the per-species source files in `raw_breeding/` and run:

```bash
pip install pyproj
python3 build_breeding.py raw_breeding/*.geojson
```

The script reads the species name from `Sp_02`, expands each centroid into its
10 km square (5 km either side), reprojects the corners to WGS84, and writes
everything listed above. Because LAEA and WGS84 differ, the squares come out
very slightly rotated — that is correct, not a rendering fault. It refuses to
continue if the same ETRS code maps to different coordinates in different files.

Adding or removing species needs no code changes; the dropdown is built from
`breeding/index.json`.

Breeding-evidence codes are mapped in `app.js` as `NID_LABELS`: 4 confirmed,
3 probable, 2 possible. The source data uses only those three values.

### Species names that differ between the atlas and the collections

The breeding tab pairs a species with its specimens by exact name match. Of the
243 atlas species, 198 have specimen records and 45 do not. Most of those 45 are
genuinely absent from the collections — largely introduced or recently colonising
species — but two are the same bird under a different name:

| Atlas name | Name in the specimen data |
| --- | --- |
| `Apus melba` | `Tachymarptis melba` |
| `Chroicocephalus ridibundus` | `Larus ridibundus` |

These are handled by the `SPECIES_SYNONYMS` map at the top of the breeding
section in `app.js`, and the tally notes when a synonym was used. Add further
pairs there if you find them.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and all written content |
| `style.css` | Styling |
| `app.js` | Tabs, maps, filters, table |
| `points.geojson` | The 3,457 specimen records |
| `breeding/grid.geojson` | Every distinct 10 km cell, once |
| `breeding/sp/*.json` | Occupied cells and evidence codes, per species |
| `breeding/index.json` | Manifest of the 243 atlas species |
| `build_breeding.py` | Rebuilds the three above from centroid files |

## Running locally

The page loads `points.geojson` with `fetch()`, which browsers block for
`file://` URLs. Opening `index.html` by double-clicking it will show an error
banner. Serve it over HTTP instead:

```bash
cd path/to/this/folder
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Make sure you run the command from the folder
that contains `index.html`, not from its parent.

## Publishing on GitHub Pages

1. Create a repository and push these files to its root, keeping the `breeding/` folder intact.
2. Go to **Settings → Pages**. Keep the `breeding/` folder alongside the other files.
3. Under "Build and deployment", set **Source** to "Deploy from a branch", then
   choose your branch (usually `main`) and the `/root` folder.
4. Save. The site appears at `https://<username>.github.io/<repo>/` after a
   minute or two.

## Notes on the data

`genus` is derived from the first word of `scientificName`. The regeneration
script below also regularises binomial capitalisation (capitalised genus,
lowercase epithet) as a safety net; on the current source file nothing needs
changing, but if a nonstandard name reappears it will be corrected and the
original kept as `scientificNameVerbatim`.

The atlas covers 1840–1980. Specimens collected after 1980 are excluded from
the source data, so the maps show the historical distribution of the
collections rather than present-day occurrence.

One hundred records have no collection year. They are stored with
`"year": null`, shown as "unknown", and deliberately excluded from year
filtering — they stay visible whatever the slider is set to, so they don't
silently disappear. Because their dates are unknown, some may fall outside the
1840–1980 window; if you would rather they were hidden, that is a one-line
change in `app.js`.

## Regenerating the data

If the source spreadsheet changes, rebuild `points.geojson` with
[openpyxl](https://openpyxl.readthedocs.io/):

```python
import json, openpyxl

wb = openpyxl.load_workbook("data_museums.xlsx", data_only=True)
ws = wb["Sheet1"]

features = []
for row in ws.iter_rows(min_row=2, values_only=True):
    (museum, occ_id, n, sciname, order, family,
     locality, lat, lon, unc, county, year) = row

    props = {
        "museum": museum, "occurrenceID": occ_id, "family": family,
        "order": order, "locality": locality, "county": county,
        "coordUncertaintyM": unc,
    }

    # regularise the binomial: Genus capitalised, epithet lowercase
    parts = sciname.split()
    if len(parts) == 2:
        normalised = parts[0].capitalize() + " " + parts[1].lower()
        if normalised != sciname:
            props["scientificNameVerbatim"] = sciname
        sciname = normalised
    props["scientificName"] = sciname
    props["genus"] = sciname.split()[0]

    try:
        props["year"] = int(year)
    except (TypeError, ValueError):
        props["year"] = None

    features.append({
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
        "properties": props,
    })

with open("points.geojson", "w", encoding="utf-8") as fh:
    json.dump({"type": "FeatureCollection", "features": features}, fh,
              ensure_ascii=False, separators=(",", ":"))
```

Update the four figures in the header of `index.html` if the totals change.

## Dependencies

Loaded from CDN at runtime, so nothing to install: Leaflet 1.9.4,
noUiSlider 15.7.1, and Spectral + IBM Plex Sans from Google Fonts. Base map
tiles come from OpenStreetMap — keep the attribution in place.
